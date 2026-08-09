-- Privileged identity lifecycle functions.
--
-- Clerk webhooks have no end-user session and therefore must not use the
-- tenant-scoped application role. These functions provide the smallest
-- possible administrative surface: bind an immutable external subject to a
-- local user, activate existing invitations, and suspend memberships after a
-- provider-side deletion. The web process receives EXECUTE only.

CREATE OR REPLACE FUNCTION brokerdesk_private.sync_external_auth_user(
  p_subject TEXT,
  p_email TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_subject TEXT := NULLIF(trim(p_subject), '');
  normalized_email TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  normalized_name TEXT := NULLIF(trim(COALESCE(p_name, '')), '');
  local_user_id TEXT;
  fallback_email TEXT;
BEGIN
  IF normalized_subject IS NULL THEN
    RAISE EXCEPTION 'external auth subject is required' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO local_user_id
  FROM public.users
  WHERE external_auth_subject = normalized_subject
  LIMIT 1;

  IF local_user_id IS NULL AND normalized_email IS NOT NULL THEN
    SELECT id INTO local_user_id
    FROM public.users
    WHERE lower(email) = normalized_email
      AND (external_auth_subject IS NULL OR external_auth_subject = normalized_subject)
    LIMIT 1;

    IF local_user_id IS NOT NULL THEN
      UPDATE public.users
      SET external_auth_subject = normalized_subject,
          name = CASE WHEN trim(name) = '' THEN COALESCE(normalized_name, normalized_email) ELSE name END
      WHERE id = local_user_id;
    ELSIF EXISTS (
      SELECT 1 FROM public.users
      WHERE lower(email) = normalized_email
        AND external_auth_subject IS NOT NULL
        AND external_auth_subject <> normalized_subject
    ) THEN
      RAISE EXCEPTION 'email is already linked to another external identity' USING ERRCODE = '23505';
    END IF;
  END IF;

  IF local_user_id IS NULL THEN
    fallback_email := 'external-' || COALESCE(NULLIF(regexp_replace(lower(normalized_subject), '[^a-z0-9]+', '-', 'g'), ''), 'user') || '@brokerdesk.local';
    INSERT INTO public.users (id, name, email, password_hash, external_auth_subject)
    VALUES (
      'user_' || substr(md5(clock_timestamp()::TEXT || random()::TEXT), 1, 12),
      COALESCE(normalized_name, normalized_email, normalized_subject),
      COALESCE(normalized_email, fallback_email),
      'external_auth_user',
      normalized_subject
    )
    RETURNING id INTO local_user_id;
  END IF;

  UPDATE public.tenant_memberships
  SET status = 'active',
      invitation_status = 'accepted',
      invitation_accepted_at = NOW(),
      invitation_error = NULL,
      updated_at = NOW()
  WHERE user_id = local_user_id
    AND status = 'invited';

  RETURN local_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION brokerdesk_private.suspend_external_auth_user(p_subject TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_subject TEXT := NULLIF(trim(p_subject), '');
  local_user_id TEXT;
  suspended_count INTEGER := 0;
BEGIN
  IF normalized_subject IS NULL THEN
    RETURN jsonb_build_object('suspendedMembershipCount', 0);
  END IF;

  SELECT id INTO local_user_id
  FROM public.users
  WHERE external_auth_subject = normalized_subject
  LIMIT 1;

  IF local_user_id IS NULL THEN
    RETURN jsonb_build_object('suspendedMembershipCount', 0);
  END IF;

  UPDATE public.users
  SET external_auth_subject = NULL
  WHERE id = local_user_id;

  UPDATE public.tenant_memberships
  SET status = 'suspended',
      invitation_status = 'revoked',
      updated_at = NOW()
  WHERE user_id = local_user_id
    AND status <> 'suspended';

  GET DIAGNOSTICS suspended_count = ROW_COUNT;
  RETURN jsonb_build_object('userId', local_user_id, 'suspendedMembershipCount', suspended_count);
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.sync_external_auth_user(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION brokerdesk_private.suspend_external_auth_user(TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_admin') THEN
    GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_admin;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.sync_external_auth_user(TEXT, TEXT, TEXT) TO brokerdesk_admin;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.suspend_external_auth_user(TEXT) TO brokerdesk_admin;
  END IF;
END $$;
