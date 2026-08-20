-- TASK-039: the authenticated first-user company bootstrap path.
-- Review/apply only through the migration process. This is not a blanket
-- INSERT policy: the function derives the user from the request-scoped
-- external auth subject and creates exactly one owner membership atomically.
-- The trusted server transaction supplies the deployment environment; callers
-- cannot choose active versus pending_activation as a function argument.

DROP FUNCTION IF EXISTS brokerdesk_private.create_tenant_for_current_user(TEXT, TEXT, TEXT);

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
DECLARE
  current_user_id TEXT := brokerdesk_private.current_user_id();
  normalized_name TEXT := NULLIF(trim(COALESCE(p_name, '')), '');
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
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authenticated local user is required' USING ERRCODE = '42501';
  END IF;
  IF normalized_name IS NULL THEN
    RAISE EXCEPTION 'tenant name is required' USING ERRCODE = '22023';
  END IF;
  base_slug := NULLIF(regexp_replace(lower(normalized_name), '[^a-z0-9]+', '-', 'g'), '');
  base_slug := trim(BOTH '-' FROM COALESCE(base_slug, 'company'));
  next_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = next_slug) LOOP
    next_slug := base_slug || '-' || suffix;
    suffix := suffix + 1;
  END LOOP;

  new_tenant_id := 'tenant_' || substr(md5(clock_timestamp()::TEXT || random()::TEXT), 1, 12);
  new_membership_id := 'membership_' || substr(md5(clock_timestamp()::TEXT || random()::TEXT), 1, 12);

  INSERT INTO public.tenants (id, name, slug, account_type, status, purchased_seat_count)
  VALUES (new_tenant_id, normalized_name, next_slug, COALESCE(NULLIF(trim(p_account_type), ''), 'company'), normalized_status, 1);

  INSERT INTO public.tenant_memberships (
    id, tenant_id, user_id, role, capability, status,
    invitation_provider, invitation_status, invitation_accepted_at
  ) VALUES (
    new_membership_id, new_tenant_id, current_user_id, 'tenant_owner', 'company_owner', 'active',
    'manual', 'accepted', NOW()
  );

  RETURN QUERY SELECT new_tenant_id, new_membership_id, normalized_status, 'active', 'company_owner', 'tenant_owner';
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.create_tenant_for_current_user(TEXT, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.create_tenant_for_current_user(TEXT, TEXT) TO brokerdesk_runtime;
  END IF;
END $$;
