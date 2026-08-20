-- TASK-039: atomic company invitation path.
-- The function owns the placeholder-user and invited-membership writes so the
-- web runtime does not need INSERT/UPDATE access to the RLS-protected tables.

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

  SELECT memberships.status INTO existing_status
  FROM public.tenant_memberships memberships
  WHERE memberships.tenant_id = normalized_tenant_id
    AND memberships.user_id = invited_user_id
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
    WHERE tenant_id = normalized_tenant_id AND user_id = invited_user_id;
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
    AND memberships.user_id = invited_user_id;
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

CREATE OR REPLACE FUNCTION brokerdesk_private.refresh_tenant_invitation(
  p_tenant_id TEXT,
  p_membership_id TEXT,
  p_actor_user_id TEXT,
  p_invited_by_user_id TEXT DEFAULT NULL
)
RETURNS SETOF public.tenant_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_actor_id TEXT := brokerdesk_private.current_user_id();
BEGIN
  IF current_actor_id IS NULL OR current_actor_id <> NULLIF(trim(COALESCE(p_actor_user_id, '')), '') THEN
    RAISE EXCEPTION 'invitation actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships memberships
    JOIN public.tenants tenants ON tenants.id = memberships.tenant_id
    WHERE memberships.tenant_id = p_tenant_id
      AND memberships.user_id = current_actor_id
      AND memberships.status = 'active'
      AND tenants.status IN ('trial', 'active')
      AND (memberships.capability = 'company_owner' OR (memberships.capability IS NULL AND memberships.role = 'tenant_owner'))
  ) THEN
    RAISE EXCEPTION 'member invite permission required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tenant_memberships
  SET invitation_status = 'pending',
      invitation_token = md5(clock_timestamp()::TEXT || random()::TEXT),
      invitation_expires_at = NOW() + INTERVAL '7 days',
      invited_by_user_id = COALESCE(NULLIF(trim(COALESCE(p_invited_by_user_id, '')), ''), current_actor_id),
      invitation_sent_at = NOW(),
      invitation_error = NULL,
      updated_at = NOW()
  WHERE id = p_membership_id
    AND tenant_id = p_tenant_id
    AND status = 'invited';

  RETURN QUERY SELECT memberships.*
  FROM public.tenant_memberships memberships
  WHERE memberships.id = p_membership_id AND memberships.tenant_id = p_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION brokerdesk_private.record_tenant_invitation_delivery(
  p_tenant_id TEXT,
  p_membership_id TEXT,
  p_actor_user_id TEXT,
  p_provider TEXT,
  p_invitation_status TEXT,
  p_provider_invitation_id TEXT DEFAULT NULL,
  p_invitation_url TEXT DEFAULT NULL,
  p_invitation_error TEXT DEFAULT NULL,
  p_sent_at TIMESTAMPTZ DEFAULT NULL,
  p_accepted_at TIMESTAMPTZ DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF public.tenant_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_actor_id TEXT := brokerdesk_private.current_user_id();
BEGIN
  IF current_actor_id IS NULL OR current_actor_id <> NULLIF(trim(COALESCE(p_actor_user_id, '')), '') THEN
    RAISE EXCEPTION 'invitation actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;
  IF p_provider NOT IN ('none', 'manual', 'clerk') OR p_invitation_status NOT IN ('pending', 'failed', 'revoked', 'expired') THEN
    RAISE EXCEPTION 'unsupported invitation delivery state' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships memberships
    JOIN public.tenants tenants ON tenants.id = memberships.tenant_id
    WHERE memberships.tenant_id = p_tenant_id
      AND memberships.user_id = current_actor_id
      AND memberships.status = 'active'
      AND tenants.status IN ('trial', 'active')
      AND (memberships.capability = 'company_owner' OR (memberships.capability IS NULL AND memberships.role = 'tenant_owner'))
  ) THEN
    RAISE EXCEPTION 'member invite permission required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tenant_memberships
  SET invitation_provider = p_provider,
      invitation_status = p_invitation_status,
      provider_invitation_id = p_provider_invitation_id,
      invitation_url = p_invitation_url,
      invitation_error = p_invitation_error,
      invitation_sent_at = COALESCE(p_sent_at, invitation_sent_at),
      invitation_accepted_at = COALESCE(p_accepted_at, invitation_accepted_at),
      invitation_expires_at = COALESCE(p_expires_at, invitation_expires_at),
      updated_at = NOW()
  WHERE id = p_membership_id
    AND tenant_id = p_tenant_id
    AND status = 'invited';

  RETURN QUERY SELECT memberships.*
  FROM public.tenant_memberships memberships
  WHERE memberships.id = p_membership_id AND memberships.tenant_id = p_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.refresh_tenant_invitation(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION brokerdesk_private.record_tenant_invitation_delivery(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.refresh_tenant_invitation(TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.record_tenant_invitation_delivery(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO brokerdesk_runtime;
  END IF;
END $$;

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
  invited_email TEXT;
  actual_email TEXT;
  invitation_expires_at TIMESTAMPTZ;
BEGIN
  IF current_user_id IS NULL OR current_user_id <> NULLIF(trim(COALESCE(p_target_user_id, '')), '') THEN
    RAISE EXCEPTION 'invitation target does not match authenticated user' USING ERRCODE = '42501';
  END IF;

  SELECT memberships.invited_email, users.email, memberships.invitation_expires_at
  INTO invited_email, actual_email, invitation_expires_at
  FROM public.tenant_memberships memberships
  JOIN public.users users ON users.id = memberships.user_id
  WHERE memberships.id = p_membership_id
    AND memberships.tenant_id = p_tenant_id
    AND memberships.user_id = current_user_id
    AND memberships.status = 'invited'
    AND memberships.invitation_status = 'pending'
  LIMIT 1
  FOR UPDATE;

  IF invited_email IS NULL OR actual_email IS NULL THEN
    RETURN;
  END IF;
  IF lower(trim(invited_email)) <> lower(trim(actual_email)) THEN
    RETURN;
  END IF;
  IF p_invitation_token IS NULL OR trim(p_invitation_token) = '' THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships memberships
    WHERE memberships.id = p_membership_id
      AND memberships.tenant_id = p_tenant_id
      AND memberships.invitation_token = trim(p_invitation_token)
  ) THEN
    RETURN;
  END IF;

  IF invitation_expires_at IS NOT NULL AND invitation_expires_at <= NOW() THEN
    UPDATE public.tenant_memberships
    SET invitation_status = 'expired', updated_at = NOW()
    WHERE id = p_membership_id AND tenant_id = p_tenant_id AND user_id = current_user_id AND status = 'invited';
    RETURN;
  END IF;

  UPDATE public.tenant_memberships
  SET status = 'active',
      invitation_status = 'accepted',
      invitation_accepted_at = NOW(),
      invitation_error = NULL,
      updated_at = NOW()
  WHERE id = p_membership_id
    AND tenant_id = p_tenant_id
    AND user_id = current_user_id
    AND status = 'invited'
    AND invitation_status = 'pending'
    AND invitation_token = trim(p_invitation_token)
    AND (invitation_expires_at IS NULL OR invitation_expires_at > NOW());

  RETURN QUERY SELECT memberships.*
  FROM public.tenant_memberships memberships
  WHERE memberships.id = p_membership_id AND memberships.tenant_id = p_tenant_id AND memberships.user_id = current_user_id;
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.accept_tenant_invitation(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.accept_tenant_invitation(TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime;
  END IF;
END $$;
