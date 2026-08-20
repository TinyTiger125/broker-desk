-- TASK-039 runtime defect fix: persist first-user company creation idempotency.
-- Review/apply only through the migration process. This migration is append-only
-- and does not alter existing tenant or membership rows.

CREATE TABLE IF NOT EXISTS public.tenant_creation_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id),
  idempotency_key TEXT NOT NULL,
  request_name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id),
  membership_id TEXT NOT NULL REFERENCES public.tenant_memberships(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tenant_creation_requests_user_key_unique UNIQUE (user_id, idempotency_key),
  CONSTRAINT tenant_creation_requests_tenant_unique UNIQUE (tenant_id),
  CONSTRAINT tenant_creation_requests_membership_unique UNIQUE (membership_id)
);

ALTER TABLE public.tenant_creation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_creation_requests FROM PUBLIC;

DROP FUNCTION IF EXISTS brokerdesk_private.create_tenant_for_current_user(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION brokerdesk_private.create_tenant_for_current_user(
  p_name TEXT,
  p_account_type TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  tenant_id TEXT,
  membership_id TEXT,
  tenant_status TEXT,
  membership_status TEXT,
  capability TEXT,
  role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id_value TEXT := brokerdesk_private.current_user_id();
  normalized_name TEXT := NULLIF(trim(COALESCE(p_name, '')), '');
  normalized_key TEXT := NULLIF(trim(COALESCE(p_idempotency_key, '')), '');
  normalized_account_type TEXT := COALESCE(NULLIF(trim(p_account_type), ''), 'company');
  base_slug TEXT;
  next_slug TEXT;
  suffix INTEGER := 2;
  new_tenant_id TEXT;
  new_membership_id TEXT;
  deployment_environment TEXT := lower(NULLIF(trim(current_setting('app.broker_desk_deployment_env', true)), ''));
  normalized_status TEXT := CASE
    WHEN deployment_environment IN ('development', 'preview', 'staging') THEN 'active'
    ELSE 'pending_activation'
  END;
  existing_request RECORD;
BEGIN
  IF current_user_id_value IS NULL THEN
    RAISE EXCEPTION 'authenticated local user is required' USING ERRCODE = '42501';
  END IF;
  IF normalized_name IS NULL THEN
    RAISE EXCEPTION 'tenant name is required' USING ERRCODE = '22023';
  END IF;
  IF normalized_key IS NULL THEN
    RAISE EXCEPTION 'tenant idempotency key is required' USING ERRCODE = '22023';
  END IF;
  IF length(normalized_key) > 200 THEN
    RAISE EXCEPTION 'tenant idempotency key is too long' USING ERRCODE = '22023';
  END IF;

  -- Serialize only retries of the same user operation. A different key is
  -- intentionally allowed to create another company with the same name.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(current_user_id_value || ':' || normalized_key, 0)
  );

  SELECT request.*
    INTO existing_request
    FROM public.tenant_creation_requests AS request
   WHERE request.user_id = current_user_id_value
     AND request.idempotency_key = normalized_key
   FOR UPDATE;

  IF FOUND THEN
    IF existing_request.request_name <> normalized_name
       OR existing_request.account_type <> normalized_account_type THEN
      RAISE EXCEPTION 'tenant idempotency key was reused with different request data' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1
        FROM public.tenants AS tenant
       WHERE tenant.id = existing_request.tenant_id
    ) OR NOT EXISTS (
      SELECT 1
        FROM public.tenant_memberships AS membership
       WHERE membership.id = existing_request.membership_id
         AND membership.tenant_id = existing_request.tenant_id
         AND membership.user_id = current_user_id_value
         AND membership.role = 'tenant_owner'
         AND membership.capability = 'company_owner'
         AND membership.status = 'active'
    ) THEN
      RAISE EXCEPTION 'tenant creation record is incomplete' USING ERRCODE = 'XX002';
    END IF;

    RETURN QUERY
    SELECT tenant.id, membership.id, tenant.status, membership.status, membership.capability, membership.role
      FROM public.tenants AS tenant
      JOIN public.tenant_memberships AS membership
        ON membership.id = existing_request.membership_id
       AND membership.tenant_id = tenant.id
     WHERE tenant.id = existing_request.tenant_id;
    RETURN;
  END IF;

  base_slug := NULLIF(regexp_replace(lower(normalized_name), '[^a-z0-9]+', '-', 'g'), '');
  base_slug := trim(BOTH '-' FROM COALESCE(base_slug, 'company'));
  next_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM public.tenants AS tenant WHERE tenant.slug = next_slug) LOOP
    next_slug := base_slug || '-' || suffix;
    suffix := suffix + 1;
  END LOOP;

  new_tenant_id := 'tenant_' || substr(md5(clock_timestamp()::TEXT || random()::TEXT), 1, 12);
  new_membership_id := 'membership_' || substr(md5(clock_timestamp()::TEXT || random()::TEXT), 1, 12);

  INSERT INTO public.tenants (id, name, slug, account_type, status, purchased_seat_count)
  VALUES (new_tenant_id, normalized_name, next_slug, normalized_account_type, normalized_status, 1);

  INSERT INTO public.tenant_memberships (
    id, tenant_id, user_id, role, capability, status,
    invitation_provider, invitation_status, invitation_accepted_at
  ) VALUES (
    new_membership_id, new_tenant_id, current_user_id_value, 'tenant_owner', 'company_owner', 'active',
    'manual', 'accepted', NOW()
  );

  INSERT INTO public.tenant_creation_requests (
    id, user_id, idempotency_key, request_name, account_type, tenant_id, membership_id
  ) VALUES (
    'tenant_creation_' || substr(md5(clock_timestamp()::TEXT || random()::TEXT), 1, 12),
    current_user_id_value, normalized_key, normalized_name, normalized_account_type, new_tenant_id, new_membership_id
  );

  RETURN QUERY SELECT new_tenant_id, new_membership_id, normalized_status, 'active', 'company_owner', 'tenant_owner';
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.create_tenant_for_current_user(TEXT, TEXT, TEXT) FROM PUBLIC;

-- Compatibility boundary for older callers. New application code must use the
-- three-argument function. Each legacy call receives a fresh key so an old
-- caller cannot silently reuse a newer request's result.
CREATE OR REPLACE FUNCTION brokerdesk_private.create_tenant_for_current_user(
  p_name TEXT,
  p_account_type TEXT DEFAULT 'company'
)
RETURNS TABLE (
  tenant_id TEXT,
  membership_id TEXT,
  tenant_status TEXT,
  membership_status TEXT,
  capability TEXT,
  role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT *
    FROM brokerdesk_private.create_tenant_for_current_user(
      p_name,
      p_account_type,
      'legacy-' || md5(clock_timestamp()::TEXT || random()::TEXT)
    );
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.create_tenant_for_current_user(TEXT, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.create_tenant_for_current_user(TEXT, TEXT, TEXT) TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.create_tenant_for_current_user(TEXT, TEXT) TO brokerdesk_runtime;
  END IF;
END $$;
