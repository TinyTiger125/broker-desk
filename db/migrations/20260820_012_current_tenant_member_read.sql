-- TASK-039 Slice 1: read the current company's member list through the
-- request-bound identity instead of relying on broad runtime table grants.
-- Append-only and review-only in this slice; do not apply automatically.

CREATE OR REPLACE FUNCTION brokerdesk_private.list_tenant_members_for_current_tenant(
  p_tenant_id TEXT
)
RETURNS TABLE (member_record JSONB)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    to_jsonb(memberships) || jsonb_build_object(
      'user_name', users.name,
      'user_email', users.email,
      'user_external_auth_subject', users.external_auth_subject,
      'user_created_at', users.created_at,
      'tenant_name', tenants.name
    )
  FROM public.tenant_memberships AS memberships
  JOIN public.users AS users ON users.id = memberships.user_id
  JOIN public.tenants AS tenants ON tenants.id = memberships.tenant_id
  WHERE memberships.tenant_id = NULLIF(trim(COALESCE(p_tenant_id, '')), '')
    AND tenants.status IN ('trial', 'active')
    AND EXISTS (
      SELECT 1
      FROM public.tenant_memberships AS actor_membership
      WHERE actor_membership.tenant_id = memberships.tenant_id
        AND actor_membership.user_id = brokerdesk_private.current_user_id()
        AND actor_membership.status = 'active'
        AND actor_membership.capability = 'company_owner'
    )
  ORDER BY
    CASE memberships.status WHEN 'active' THEN 0 WHEN 'invited' THEN 1 ELSE 2 END,
    memberships.created_at ASC;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.list_tenant_members_for_current_tenant(TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.list_tenant_members_for_current_tenant(TEXT) TO brokerdesk_runtime;
  END IF;
END $$;
