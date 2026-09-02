-- TASK-047: restricted first-user bootstrap for Clerk-authenticated
-- development, preview, and staging requests.
--
-- The subject is always derived from the request-scoped identity. This
-- function is intentionally separate from the webhook/admin synchronizer:
-- it only creates or returns a local users row and never binds invitations or
-- creates tenant memberships.

CREATE OR REPLACE FUNCTION brokerdesk_private.ensure_current_external_auth_user(
  p_email TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL
)
RETURNS SETOF public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_subject TEXT := NULLIF(trim(brokerdesk_private.current_external_auth_subject()), '');
  deployment_environment TEXT := lower(NULLIF(trim(current_setting('app.broker_desk_deployment_env', true)), ''));
  normalized_email TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  normalized_name TEXT := NULLIF(trim(COALESCE(p_name, '')), '');
  effective_email TEXT;
  existing_user public.users%ROWTYPE;
  inserted_user public.users%ROWTYPE;
BEGIN
  IF current_subject IS NULL THEN
    RAISE EXCEPTION 'external auth subject is required' USING ERRCODE = '42501';
  END IF;

  IF deployment_environment IS NULL
     OR NOT (deployment_environment IN ('development', 'preview', 'staging')) THEN
    RAISE EXCEPTION 'external auth bootstrap is unavailable in this deployment' USING ERRCODE = '42501';
  END IF;

  -- Serialize retries for one external identity before checking either
  -- unique key. A different subject remains protected by the database keys.
  PERFORM pg_advisory_xact_lock(hashtextextended(current_subject, 0));

  SELECT users.*
    INTO existing_user
    FROM public.users
   WHERE users.external_auth_subject = current_subject
   FOR UPDATE;

  IF FOUND THEN
    RETURN NEXT existing_user;
    RETURN;
  END IF;

  effective_email := COALESCE(
    normalized_email,
    'external-' || COALESCE(NULLIF(regexp_replace(lower(current_subject), '[^a-z0-9]+', '-', 'g'), ''), 'user') || '@brokerdesk.local'
  );

  SELECT users.*
    INTO existing_user
    FROM public.users
   WHERE lower(users.email) = effective_email
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    IF existing_user.external_auth_subject = current_subject THEN
      RETURN NEXT existing_user;
      RETURN;
    END IF;
    IF existing_user.external_auth_subject IS NOT NULL THEN
      RAISE EXCEPTION 'email is already linked to another external identity' USING ERRCODE = '23505';
    END IF;
    RAISE EXCEPTION 'email is already reserved by an existing local user' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.users (id, name, email, password_hash, external_auth_subject)
  VALUES (
    'user_' || substr(md5(clock_timestamp()::TEXT || random()::TEXT), 1, 12),
    COALESCE(normalized_name, effective_email, current_subject),
    effective_email,
    'external_auth_user',
    current_subject
  )
  RETURNING * INTO inserted_user;

  RETURN NEXT inserted_user;
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.ensure_current_external_auth_user(TEXT, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.ensure_current_external_auth_user(TEXT, TEXT) TO brokerdesk_runtime;
  END IF;
END $$;
