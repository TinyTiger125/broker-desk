-- TASK-039 Slice 1: expose the current user's membership states, including
-- suspended/removed memberships, without exposing any other tenant.

CREATE OR REPLACE FUNCTION brokerdesk_private.list_tenant_session_lookups_for_current_user()
RETURNS TABLE (
  user_record JSONB,
  membership_record JSONB,
  tenant_record JSONB
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT to_jsonb(users), to_jsonb(memberships), to_jsonb(tenants)
  FROM public.users AS users
  JOIN public.tenant_memberships AS memberships ON memberships.user_id = users.id
  JOIN public.tenants AS tenants ON tenants.id = memberships.tenant_id
  WHERE users.external_auth_subject = brokerdesk_private.current_external_auth_subject();
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.list_tenant_session_lookups_for_current_user() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.list_tenant_session_lookups_for_current_user() TO brokerdesk_runtime;
  END IF;
END $$;
