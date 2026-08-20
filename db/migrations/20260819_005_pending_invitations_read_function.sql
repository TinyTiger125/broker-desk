-- TASK-039 Slice 1: let an invited user read only their own pending invitations.
-- SECURITY DEFINER is required because tenant_memberships RLS intentionally
-- exposes only active tenant members. The function never accepts a caller
-- supplied user or tenant id; it binds to the current Clerk-backed user.

CREATE OR REPLACE FUNCTION brokerdesk_private.list_pending_tenant_invitations_for_current_user()
RETURNS TABLE (
  id TEXT,
  tenant_id TEXT,
  user_id TEXT,
  role TEXT,
  capability TEXT,
  status TEXT,
  invitation_provider TEXT,
  invitation_status TEXT,
  provider_invitation_id TEXT,
  invitation_url TEXT,
  invitation_sent_at TIMESTAMPTZ,
  invitation_accepted_at TIMESTAMPTZ,
  invitation_error TEXT,
  invited_email TEXT,
  invited_by_user_id TEXT,
  invitation_expires_at TIMESTAMPTZ,
  invitation_token TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  user_name TEXT,
  user_email TEXT,
  user_external_auth_subject TEXT,
  user_created_at TIMESTAMPTZ,
  tenant_name TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    memberships.id,
    memberships.tenant_id,
    memberships.user_id,
    memberships.role,
    memberships.capability,
    memberships.status,
    memberships.invitation_provider,
    memberships.invitation_status,
    memberships.provider_invitation_id,
    memberships.invitation_url,
    memberships.invitation_sent_at,
    memberships.invitation_accepted_at,
    memberships.invitation_error,
    memberships.invited_email,
    memberships.invited_by_user_id,
    memberships.invitation_expires_at,
    memberships.invitation_token,
    memberships.created_at,
    memberships.updated_at,
    users.name AS user_name,
    users.email AS user_email,
    users.external_auth_subject AS user_external_auth_subject,
    users.created_at AS user_created_at,
    tenants.name AS tenant_name
  FROM public.tenant_memberships AS memberships
  JOIN public.users AS users ON users.id = memberships.user_id
  JOIN public.tenants AS tenants ON tenants.id = memberships.tenant_id
  WHERE memberships.user_id = brokerdesk_private.current_user_id()
    AND memberships.status = 'invited'
    AND memberships.invitation_status = 'pending'
    AND (memberships.invitation_expires_at IS NULL OR memberships.invitation_expires_at > NOW())
    AND tenants.status IN ('trial', 'active')
  ORDER BY memberships.created_at ASC;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.list_pending_tenant_invitations_for_current_user() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.list_pending_tenant_invitations_for_current_user() TO brokerdesk_runtime;
  END IF;
END $$;
