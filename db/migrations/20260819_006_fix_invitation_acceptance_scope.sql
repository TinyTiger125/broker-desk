-- TASK-039 Slice 1: replace the invitation acceptance function with a
-- qualification-safe implementation. Migration 004 remains immutable.

CREATE OR REPLACE FUNCTION brokerdesk_private.accept_tenant_invitation(
  p_tenant_id TEXT,
  p_membership_id TEXT,
  p_target_user_id TEXT,
  p_invitation_token TEXT
)
RETURNS SETOF public.tenant_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id TEXT := brokerdesk_private.current_user_id();
  invited_email_value TEXT;
  actual_email_value TEXT;
  expires_at_value TIMESTAMPTZ;
BEGIN
  IF current_user_id IS NULL OR current_user_id <> NULLIF(trim(COALESCE(p_target_user_id, '')), '') THEN
    RAISE EXCEPTION 'invitation target does not match authenticated user' USING ERRCODE = '42501';
  END IF;

  SELECT memberships.invited_email, invited_user.email, memberships.invitation_expires_at
  INTO invited_email_value, actual_email_value, expires_at_value
  FROM public.tenant_memberships AS memberships
  JOIN public.users AS invited_user ON invited_user.id = memberships.user_id
  WHERE memberships.id = p_membership_id
    AND memberships.tenant_id = p_tenant_id
    AND memberships.user_id = current_user_id
    AND memberships.status = 'invited'
    AND memberships.invitation_status = 'pending'
  LIMIT 1
  FOR UPDATE;

  IF invited_email_value IS NULL OR actual_email_value IS NULL THEN
    RETURN;
  END IF;
  IF lower(trim(invited_email_value)) <> lower(trim(actual_email_value)) THEN
    RETURN;
  END IF;
  IF p_invitation_token IS NULL OR trim(p_invitation_token) = '' THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS token_membership
    WHERE token_membership.id = p_membership_id
      AND token_membership.tenant_id = p_tenant_id
      AND token_membership.user_id = current_user_id
      AND token_membership.invitation_token = trim(p_invitation_token)
      AND token_membership.status = 'invited'
      AND token_membership.invitation_status = 'pending'
  ) THEN
    RETURN;
  END IF;

  IF expires_at_value IS NOT NULL AND expires_at_value <= NOW() THEN
    UPDATE public.tenant_memberships AS memberships
    SET invitation_status = 'expired', updated_at = NOW()
    WHERE memberships.id = p_membership_id
      AND memberships.tenant_id = p_tenant_id
      AND memberships.user_id = current_user_id
      AND memberships.status = 'invited';
    RETURN;
  END IF;

  UPDATE public.tenant_memberships AS memberships
  SET status = 'active',
      invitation_status = 'accepted',
      invitation_accepted_at = NOW(),
      invitation_error = NULL,
      updated_at = NOW()
  WHERE memberships.id = p_membership_id
    AND memberships.tenant_id = p_tenant_id
    AND memberships.user_id = current_user_id
    AND memberships.status = 'invited'
    AND memberships.invitation_status = 'pending'
    AND memberships.invitation_token = trim(p_invitation_token)
    AND (memberships.invitation_expires_at IS NULL OR memberships.invitation_expires_at > NOW());

  RETURN QUERY
  SELECT memberships.*
  FROM public.tenant_memberships AS memberships
  WHERE memberships.id = p_membership_id
    AND memberships.tenant_id = p_tenant_id
    AND memberships.user_id = current_user_id;
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.accept_tenant_invitation(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.accept_tenant_invitation(TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime;
  END IF;
END $$;
