-- TASK-039: return the newly invited membership after re-inviting a removed user.
--
-- Migration 004 correctly creates a new invited membership after a removed
-- membership, but its final query returns every membership for the user. The
-- adapter consumes the first row, so a historical removed row can be selected
-- instead of the newly created invitation. Keep the old migration immutable;
-- this replacement makes the selected row deterministic and fail-closed.

CREATE OR REPLACE FUNCTION brokerdesk_private.create_tenant_invitation(
  p_tenant_id TEXT,
  p_actor_user_id TEXT,
  p_email TEXT,
  p_name TEXT,
  p_role TEXT,
  p_capability TEXT
)
RETURNS TABLE (
  membership_id TEXT,
  tenant_id TEXT,
  user_id TEXT,
  role TEXT,
  capability TEXT,
  status TEXT,
  invitation_provider TEXT,
  invitation_status TEXT,
  invitation_accepted_at TIMESTAMPTZ,
  invited_email TEXT,
  invited_by_user_id TEXT,
  invitation_expires_at TIMESTAMPTZ,
  invitation_token TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  user_name TEXT,
  user_email TEXT,
  user_external_auth_subject TEXT,
  user_created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_actor_id TEXT := brokerdesk_private.current_user_id();
  normalized_tenant_id TEXT := NULLIF(trim(COALESCE(p_tenant_id, '')), '');
  normalized_actor_id TEXT := NULLIF(trim(COALESCE(p_actor_user_id, '')), '');
  normalized_email TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  normalized_name TEXT := NULLIF(trim(COALESCE(p_name, '')), '');
  invited_user_id TEXT;
  existing_status TEXT;
  invitation_token_value TEXT := md5(clock_timestamp()::TEXT || random()::TEXT);
  invitation_expires_at_value TIMESTAMPTZ := NOW() + INTERVAL '7 days';
BEGIN
  IF current_actor_id IS NULL OR normalized_actor_id IS NULL OR current_actor_id <> normalized_actor_id THEN
    RAISE EXCEPTION 'invitation actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;
  IF normalized_tenant_id IS NULL OR normalized_email IS NULL THEN
    RAISE EXCEPTION 'tenant and member email are required' USING ERRCODE = '22023';
  END IF;
  IF p_role NOT IN ('platform_owner', 'tenant_owner', 'tenant_admin', 'manager', 'broker', 'data_operator', 'reviewer', 'viewer') THEN
    RAISE EXCEPTION 'unsupported tenant role' USING ERRCODE = '22023';
  END IF;
  IF p_capability NOT IN ('company_owner', 'company_form_admin', 'ordinary_member') THEN
    RAISE EXCEPTION 'unsupported tenant capability' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships memberships
    JOIN public.tenants tenants ON tenants.id = memberships.tenant_id
    WHERE memberships.tenant_id = normalized_tenant_id
      AND memberships.user_id = current_actor_id
      AND memberships.status = 'active'
      AND tenants.status IN ('trial', 'active')
      AND (memberships.capability = 'company_owner' OR (memberships.capability IS NULL AND memberships.role = 'tenant_owner'))
  ) THEN
    RAISE EXCEPTION 'member invite permission required' USING ERRCODE = '42501';
  END IF;

  normalized_name := COALESCE(normalized_name, normalized_email);
  SELECT users.id INTO invited_user_id
  FROM public.users
  WHERE lower(users.email) = normalized_email
  LIMIT 1
  FOR UPDATE;

  IF invited_user_id IS NULL THEN
    INSERT INTO public.users (id, name, email, password_hash, external_auth_subject)
    VALUES (
      'user_' || substr(md5(clock_timestamp()::TEXT || random()::TEXT), 1, 12),
      normalized_name,
      normalized_email,
      'local_invited_user',
      NULL
    )
    ON CONFLICT (email) DO NOTHING
    RETURNING id INTO invited_user_id;
  END IF;

  IF invited_user_id IS NULL THEN
    SELECT users.id INTO invited_user_id
    FROM public.users
    WHERE lower(users.email) = normalized_email
    LIMIT 1
    FOR UPDATE;
  END IF;

  -- Prefer an existing usable membership over a historical removed row. This
  -- keeps the invitation idempotent even when old databases contain both.
  SELECT memberships.status INTO existing_status
  FROM public.tenant_memberships memberships
  WHERE memberships.tenant_id = normalized_tenant_id
    AND memberships.user_id = invited_user_id
  ORDER BY CASE memberships.status
    WHEN 'active' THEN 0
    WHEN 'suspended' THEN 1
    WHEN 'invited' THEN 2
    WHEN 'removed' THEN 3
    ELSE 4
  END, memberships.updated_at DESC, memberships.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF existing_status = 'active' THEN
    RAISE EXCEPTION 'active member cannot be changed back to invited' USING ERRCODE = '22023';
  END IF;
  IF existing_status = 'suspended' THEN
    RAISE EXCEPTION 'suspended member must be explicitly reactivated, not re-invited' USING ERRCODE = '22023';
  END IF;

  IF existing_status = 'invited' THEN
    UPDATE public.tenant_memberships
    SET role = p_role,
        capability = p_capability,
        status = 'invited',
        invited_email = normalized_email,
        invited_by_user_id = normalized_actor_id,
        invitation_provider = 'none',
        invitation_status = 'pending',
        invitation_accepted_at = NULL,
        invitation_expires_at = invitation_expires_at_value,
        invitation_token = invitation_token_value,
        updated_at = NOW()
    WHERE tenant_memberships.tenant_id = normalized_tenant_id
      AND tenant_memberships.user_id = invited_user_id
      AND tenant_memberships.status = 'invited';
  ELSE
    INSERT INTO public.tenant_memberships (
      id, tenant_id, user_id, role, capability, status,
      invitation_provider, invitation_status, invitation_accepted_at,
      invited_email, invited_by_user_id, invitation_expires_at, invitation_token
    ) VALUES (
      'membership_' || substr(md5(clock_timestamp()::TEXT || random()::TEXT), 1, 12),
      normalized_tenant_id, invited_user_id, p_role, p_capability, 'invited',
      'none', 'pending', NULL, normalized_email, normalized_actor_id,
      invitation_expires_at_value, invitation_token_value
    );
  END IF;

  RETURN QUERY
  SELECT memberships.id, memberships.tenant_id, memberships.user_id,
         memberships.role, memberships.capability, memberships.status,
         memberships.invitation_provider, memberships.invitation_status,
         memberships.invitation_accepted_at, memberships.invited_email,
         memberships.invited_by_user_id, memberships.invitation_expires_at,
         memberships.invitation_token, memberships.created_at,
         memberships.updated_at, users.name, users.email,
         users.external_auth_subject, users.created_at
  FROM public.tenant_memberships memberships
  JOIN public.users users ON users.id = memberships.user_id
  WHERE memberships.tenant_id = normalized_tenant_id
    AND memberships.user_id = invited_user_id
    AND memberships.status = 'invited'
  ORDER BY memberships.updated_at DESC, memberships.created_at DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.create_tenant_invitation(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.create_tenant_invitation(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime;
  END IF;
END $$;
