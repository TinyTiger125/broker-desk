-- TASK-043: company subscription ledger and Asia/Tokyo service-period dates.
-- Existing commercial dates remain NULL; no historical terms are invented.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS service_start_at DATE,
  ADD COLUMN IF NOT EXISTS service_end_at DATE;

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_service_period_order;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_service_period_order
  CHECK (service_start_at IS NULL OR service_end_at IS NULL OR service_start_at <= service_end_at);

COMMENT ON COLUMN public.tenants.service_start_at IS
  'Commercial start date interpreted as an Asia/Tokyo calendar date.';
COMMENT ON COLUMN public.tenants.service_end_at IS
  'Commercial end date inclusive through that Asia/Tokyo calendar date.';

-- audit_logs is FORCE ROW LEVEL SECURITY. Keep ordinary tenant audit writes on
-- their existing policy and add only the two platform-account INSERT shapes
-- required below. This policy deliberately does not grant table privileges.
DROP POLICY IF EXISTS brokerdesk_platform_account_audit_insert ON public.audit_logs;
CREATE POLICY brokerdesk_platform_account_audit_insert
ON public.audit_logs
FOR INSERT
WITH CHECK (
  brokerdesk_private.current_user_id() IS NOT NULL
  AND audit_logs.user_id = brokerdesk_private.current_user_id()
  AND audit_logs.actor_id = brokerdesk_private.current_user_id()
  AND audit_logs.action IN ('tenant_account_created', 'tenant_subscription_updated')
  AND audit_logs.target_type = 'tenant'
  AND audit_logs.target_id = audit_logs.tenant_id
  AND EXISTS (
    SELECT 1
    FROM public.tenants AS platform_audit_tenant
    WHERE platform_audit_tenant.id = audit_logs.tenant_id
      AND platform_audit_tenant.id = audit_logs.target_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.users AS platform_owner_users
    INNER JOIN public.tenant_memberships AS platform_owner_memberships
      ON platform_owner_memberships.user_id = platform_owner_users.id
    WHERE platform_owner_users.id = brokerdesk_private.current_user_id()
      AND platform_owner_users.external_auth_subject = brokerdesk_private.current_external_auth_subject()
      AND platform_owner_memberships.status = 'active'
      AND platform_owner_memberships.role = 'platform_owner'
  )
);

DROP POLICY IF EXISTS brokerdesk_tenant_invitation_acceptance_audit_insert ON public.audit_logs;
CREATE POLICY brokerdesk_tenant_invitation_acceptance_audit_insert
ON public.audit_logs
FOR INSERT
WITH CHECK (
  brokerdesk_private.current_user_id() IS NOT NULL
  AND audit_logs.user_id = brokerdesk_private.current_user_id()
  AND audit_logs.actor_id = brokerdesk_private.current_user_id()
  AND audit_logs.action = 'tenant_invitation_accepted'
  AND audit_logs.target_type = 'member'
  AND EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS accepted_membership
    INNER JOIN public.users AS accepted_user ON accepted_user.id = accepted_membership.user_id
    WHERE accepted_membership.id = audit_logs.target_id
      AND accepted_membership.tenant_id = audit_logs.tenant_id
      AND accepted_membership.user_id = brokerdesk_private.current_user_id()
      AND accepted_membership.status = 'active'
      AND accepted_membership.invitation_status = 'accepted'
      AND accepted_user.external_auth_subject = brokerdesk_private.current_external_auth_subject()
  )
);

DROP POLICY IF EXISTS brokerdesk_tenant_invitation_delivery_audit_insert ON public.audit_logs;
CREATE POLICY brokerdesk_tenant_invitation_delivery_audit_insert
ON public.audit_logs
FOR INSERT
WITH CHECK (
  brokerdesk_private.current_user_id() IS NOT NULL
  AND audit_logs.user_id = brokerdesk_private.current_user_id()
  AND audit_logs.actor_id = brokerdesk_private.current_user_id()
  AND audit_logs.action IN ('member_invitation_sent', 'member_invitation_failed')
  AND audit_logs.target_type = 'member'
  AND EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS delivery_target
    WHERE delivery_target.id = audit_logs.target_id
      AND delivery_target.tenant_id = audit_logs.tenant_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS delivery_actor_memberships
    INNER JOIN public.users AS delivery_actor_users
      ON delivery_actor_users.id = delivery_actor_memberships.user_id
    WHERE delivery_actor_users.id = brokerdesk_private.current_user_id()
      AND delivery_actor_users.external_auth_subject = brokerdesk_private.current_external_auth_subject()
      AND delivery_actor_memberships.status = 'active'
      AND (
        (delivery_actor_memberships.tenant_id = audit_logs.tenant_id
         AND delivery_actor_memberships.capability = 'company_owner')
        OR delivery_actor_memberships.role = 'platform_owner'
      )
  )
);

-- Platform account administration crosses tenant RLS by design, but only
-- after the database proves that the request identity owns an active,
-- persisted platform_owner membership. The web runtime receives EXECUTE only;
-- it does not need a direct platform-wide tenants table path.
CREATE OR REPLACE FUNCTION brokerdesk_private.list_platform_tenant_accounts()
RETURNS TABLE (
  tenant_record JSONB,
  active_seat_count INTEGER,
  invited_seat_count INTEGER,
  suspended_seat_count INTEGER,
  owner_members JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_actor_id TEXT := brokerdesk_private.current_user_id();
BEGIN
  IF current_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS platform_owner_memberships
    INNER JOIN public.users AS platform_owner_users
      ON platform_owner_users.id = platform_owner_memberships.user_id
    WHERE platform_owner_users.id = current_actor_id
      AND platform_owner_memberships.status = 'active'
      AND platform_owner_memberships.role = 'platform_owner'
  ) THEN
    RAISE EXCEPTION 'active platform owner membership required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    to_jsonb(tenant_account),
    seat_counts.active_count,
    seat_counts.invited_count,
    seat_counts.suspended_count,
    owner_rows.members
  FROM public.tenants AS tenant_account
  CROSS JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE seats.status = 'active')::INTEGER AS active_count,
      COUNT(*) FILTER (
        WHERE seats.status = 'invited'
          AND seats.invitation_status NOT IN ('revoked', 'expired')
          AND (seats.invitation_expires_at IS NULL OR seats.invitation_expires_at > NOW())
      )::INTEGER AS invited_count,
      COUNT(*) FILTER (WHERE seats.status = 'suspended')::INTEGER AS suspended_count
    FROM public.tenant_memberships AS seats
    WHERE seats.tenant_id = tenant_account.id
  ) AS seat_counts
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('membership', to_jsonb(owner_memberships), 'user', to_jsonb(owner_users))
        ORDER BY owner_memberships.created_at ASC
      ) FILTER (WHERE owner_memberships.id IS NOT NULL),
      '[]'::JSONB
    ) AS members
    FROM public.tenant_memberships AS owner_memberships
    INNER JOIN public.users AS owner_users ON owner_users.id = owner_memberships.user_id
    WHERE owner_memberships.tenant_id = tenant_account.id
      AND owner_memberships.role = 'tenant_owner'
  ) AS owner_rows
  ORDER BY tenant_account.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION brokerdesk_private.create_platform_tenant_account(
  p_actor_user_id TEXT,
  p_name TEXT,
  p_slug TEXT,
  p_account_type TEXT,
  p_status TEXT,
  p_purchased_seat_count INTEGER,
  p_service_start_at DATE,
  p_service_end_at DATE,
  p_owner_name TEXT,
  p_owner_email TEXT
)
RETURNS TABLE (
  tenant_record JSONB,
  active_seat_count INTEGER,
  invited_seat_count INTEGER,
  suspended_seat_count INTEGER,
  owner_members JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_actor_id TEXT := brokerdesk_private.current_user_id();
  normalized_name TEXT := trim(COALESCE(p_name, ''));
  normalized_owner_email TEXT := lower(trim(COALESCE(p_owner_email, '')));
  base_slug TEXT := trim(COALESCE(p_slug, ''));
  candidate_slug TEXT;
  slug_suffix INTEGER := 2;
  created_tenant public.tenants%ROWTYPE;
  owner_user public.users%ROWTYPE;
  created_owner_membership public.tenant_memberships%ROWTYPE;
BEGIN
  IF current_actor_id IS NULL
     OR current_actor_id <> NULLIF(trim(COALESCE(p_actor_user_id, '')), '')
     OR NOT EXISTS (
       SELECT 1
       FROM public.tenant_memberships AS platform_owner_memberships
       INNER JOIN public.users AS platform_owner_users
         ON platform_owner_users.id = platform_owner_memberships.user_id
       WHERE platform_owner_users.id = current_actor_id
         AND platform_owner_memberships.status = 'active'
         AND platform_owner_memberships.role = 'platform_owner'
     ) THEN
    RAISE EXCEPTION 'active platform owner membership required' USING ERRCODE = '42501';
  END IF;
  IF normalized_name = '' OR normalized_owner_email = '' THEN
    RAISE EXCEPTION 'tenant name and owner email are required' USING ERRCODE = '22023';
  END IF;
  IF p_account_type NOT IN ('individual', 'company')
     OR p_status NOT IN ('trial', 'active', 'pending_activation', 'suspended', 'cancelled')
     OR p_purchased_seat_count IS NULL OR p_purchased_seat_count < 1 THEN
    RAISE EXCEPTION 'invalid platform tenant account fields' USING ERRCODE = '22023';
  END IF;
  IF p_service_start_at IS NOT NULL AND p_service_end_at IS NOT NULL
     AND p_service_start_at > p_service_end_at THEN
    RAISE EXCEPTION 'service start date must not be after end date' USING ERRCODE = '22023';
  END IF;

  base_slug := COALESCE(NULLIF(base_slug, ''), 'tenant-' || substr(md5(normalized_name), 1, 12));
  candidate_slug := base_slug;
  LOCK TABLE public.tenants IN SHARE ROW EXCLUSIVE MODE;
  WHILE EXISTS (SELECT 1 FROM public.tenants AS existing_tenant WHERE existing_tenant.slug = candidate_slug) LOOP
    candidate_slug := base_slug || '-' || slug_suffix::TEXT;
    slug_suffix := slug_suffix + 1;
  END LOOP;

  INSERT INTO public.tenants (
    id, name, slug, account_type, status, purchased_seat_count, service_start_at, service_end_at
  ) VALUES (
    'tenant_' || md5(clock_timestamp()::TEXT || random()::TEXT),
    normalized_name, candidate_slug, p_account_type, p_status,
    p_purchased_seat_count, p_service_start_at, p_service_end_at
  ) RETURNING * INTO created_tenant;

  SELECT users.*
  INTO owner_user
  FROM public.users AS users
  WHERE lower(users.email) = normalized_owner_email
  ORDER BY users.created_at ASC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.users (id, name, email, password_hash, external_auth_subject)
    VALUES (
      'user_' || md5(clock_timestamp()::TEXT || random()::TEXT),
      COALESCE(NULLIF(trim(COALESCE(p_owner_name, '')), ''), normalized_owner_email),
      normalized_owner_email, 'platform_invited_user', NULL
    ) RETURNING * INTO owner_user;
  END IF;

  INSERT INTO public.tenant_memberships (
    id, tenant_id, user_id, role, capability, status, invitation_provider, invitation_status
  ) VALUES (
    'membership_' || md5(clock_timestamp()::TEXT || random()::TEXT),
    created_tenant.id, owner_user.id, 'tenant_owner', 'company_owner', 'invited', 'none', 'not_sent'
  ) RETURNING * INTO created_owner_membership;

  INSERT INTO public.audit_logs (
    id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json, created_at
  ) VALUES (
    'audit_' || md5(clock_timestamp()::TEXT || random()::TEXT),
    created_tenant.id, current_actor_id, current_actor_id,
    'tenant_account_created', 'tenant', created_tenant.id,
    '客户账户与订阅台账已创建。',
    jsonb_build_object(
      'status', created_tenant.status,
      'purchasedSeatCount', created_tenant.purchased_seat_count,
      'serviceStartAt', created_tenant.service_start_at,
      'serviceEndAt', created_tenant.service_end_at
    ), NOW()
  );

  RETURN QUERY SELECT
    to_jsonb(created_tenant), 0, 1, 0,
    jsonb_build_array(jsonb_build_object(
      'membership', to_jsonb(created_owner_membership),
      'user', to_jsonb(owner_user)
    ));
END;
$$;

CREATE OR REPLACE FUNCTION brokerdesk_private.update_platform_tenant_account(
  p_actor_user_id TEXT,
  p_tenant_id TEXT,
  p_status TEXT,
  p_purchased_seat_count INTEGER,
  p_service_start_at DATE,
  p_service_end_at DATE
)
RETURNS TABLE (
  tenant_record JSONB,
  active_seat_count INTEGER,
  invited_seat_count INTEGER,
  suspended_seat_count INTEGER,
  owner_members JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_actor_id TEXT := brokerdesk_private.current_user_id();
  current_tenant public.tenants%ROWTYPE;
  updated_tenant public.tenants%ROWTYPE;
  next_seat_count INTEGER;
  active_count INTEGER;
  invited_count INTEGER;
  suspended_count INTEGER;
  owners JSONB;
BEGIN
  IF current_actor_id IS NULL
     OR current_actor_id <> NULLIF(trim(COALESCE(p_actor_user_id, '')), '')
     OR NOT EXISTS (
       SELECT 1
       FROM public.tenant_memberships AS platform_owner_memberships
       INNER JOIN public.users AS platform_owner_users
         ON platform_owner_users.id = platform_owner_memberships.user_id
       WHERE platform_owner_users.id = current_actor_id
         AND platform_owner_memberships.status = 'active'
         AND platform_owner_memberships.role = 'platform_owner'
     ) THEN
    RAISE EXCEPTION 'active platform owner membership required' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NOT NULL
     AND p_status NOT IN ('trial', 'active', 'pending_activation', 'suspended', 'cancelled') THEN
    RAISE EXCEPTION 'invalid tenant status' USING ERRCODE = '22023';
  END IF;
  IF p_service_start_at IS NOT NULL AND p_service_end_at IS NOT NULL
     AND p_service_start_at > p_service_end_at THEN
    RAISE EXCEPTION 'service start date must not be after end date' USING ERRCODE = '22023';
  END IF;

  SELECT tenant_account.*
  INTO current_tenant
  FROM public.tenants AS tenant_account
  WHERE tenant_account.id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE seats.status = 'active')::INTEGER,
    COUNT(*) FILTER (
      WHERE seats.status = 'invited'
        AND seats.invitation_status NOT IN ('revoked', 'expired')
        AND (seats.invitation_expires_at IS NULL OR seats.invitation_expires_at > NOW())
    )::INTEGER,
    COUNT(*) FILTER (WHERE seats.status = 'suspended')::INTEGER
  INTO active_count, invited_count, suspended_count
  FROM public.tenant_memberships AS seats
  WHERE seats.tenant_id = p_tenant_id;

  next_seat_count := COALESCE(p_purchased_seat_count, current_tenant.purchased_seat_count);
  IF next_seat_count < 1 OR next_seat_count < active_count + invited_count + suspended_count THEN
    RAISE EXCEPTION 'purchased seat count cannot be lower than used seats' USING ERRCODE = '23514';
  END IF;

  UPDATE public.tenants AS tenant_account
  SET status = COALESCE(p_status, tenant_account.status),
      purchased_seat_count = next_seat_count,
      service_start_at = p_service_start_at,
      service_end_at = p_service_end_at,
      updated_at = NOW()
  WHERE tenant_account.id = p_tenant_id
  RETURNING tenant_account.* INTO updated_tenant;

  INSERT INTO public.audit_logs (
    id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json, created_at
  ) VALUES (
    'audit_' || md5(clock_timestamp()::TEXT || random()::TEXT),
    updated_tenant.id, current_actor_id, current_actor_id,
    'tenant_subscription_updated', 'tenant', updated_tenant.id,
    '客户订阅台账已更新。',
    jsonb_build_object(
      'status', updated_tenant.status,
      'purchasedSeatCount', updated_tenant.purchased_seat_count,
      'serviceStartAt', updated_tenant.service_start_at,
      'serviceEndAt', updated_tenant.service_end_at
    ), NOW()
  );

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('membership', to_jsonb(owner_memberships), 'user', to_jsonb(owner_users))
      ORDER BY owner_memberships.created_at ASC
    ) FILTER (WHERE owner_memberships.id IS NOT NULL),
    '[]'::JSONB
  ) INTO owners
  FROM public.tenant_memberships AS owner_memberships
  INNER JOIN public.users AS owner_users ON owner_users.id = owner_memberships.user_id
  WHERE owner_memberships.tenant_id = p_tenant_id
    AND owner_memberships.role = 'tenant_owner';

  RETURN QUERY SELECT to_jsonb(updated_tenant), active_count, invited_count, suspended_count, owners;
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.list_platform_tenant_accounts() FROM PUBLIC;
REVOKE ALL ON FUNCTION brokerdesk_private.create_platform_tenant_account(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, DATE, DATE, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION brokerdesk_private.update_platform_tenant_account(TEXT, TEXT, TEXT, INTEGER, DATE, DATE) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.list_platform_tenant_accounts() TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.create_platform_tenant_account(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, DATE, DATE, TEXT, TEXT) TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.update_platform_tenant_account(TEXT, TEXT, TEXT, INTEGER, DATE, DATE) TO brokerdesk_runtime;
  END IF;
END $$;

-- Core tenant RLS derives service availability from the same Tokyo calendar
-- contract as application sessions and background invitation boundaries.
CREATE OR REPLACE FUNCTION brokerdesk_private.can_access_tenant(target_tenant_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH service_clock AS (
    SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE AS tokyo_today
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS memberships
    JOIN public.tenants AS tenants ON tenants.id = memberships.tenant_id
    CROSS JOIN service_clock
    WHERE memberships.user_id = brokerdesk_private.current_user_id()
      AND memberships.tenant_id = target_tenant_id
      AND memberships.status = 'active'
      AND tenants.status NOT IN ('suspended', 'cancelled')
      AND NOT (
        tenants.service_start_at IS NULL
        AND tenants.service_end_at IS NULL
        AND tenants.status = 'pending_activation'
      )
      AND (tenants.service_start_at IS NULL OR tenants.service_start_at <= tokyo_today)
      AND (tenants.service_end_at IS NULL OR tenants.service_end_at >= tokyo_today)
  );
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.can_access_tenant(TEXT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_tenant(TEXT) TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_tenant(TEXT) TO brokerdesk_runtime;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION brokerdesk_private.can_access_user(target_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT target_user_id = brokerdesk_private.current_user_id()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships AS own_membership
      JOIN public.tenant_memberships AS target_membership
        ON target_membership.tenant_id = own_membership.tenant_id
      WHERE own_membership.user_id = brokerdesk_private.current_user_id()
        AND own_membership.status = 'active'
        AND target_membership.user_id = target_user_id
        AND target_membership.status IN ('active', 'invited')
        AND brokerdesk_private.can_access_tenant(own_membership.tenant_id)
    );
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.can_access_user(TEXT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_user(TEXT) TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_user(TEXT) TO brokerdesk_runtime;
  END IF;
END $$;

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
    AND EXISTS (
      SELECT 1
      FROM public.tenant_memberships AS actor_membership
      WHERE actor_membership.tenant_id = NULLIF(trim(COALESCE(p_tenant_id, '')), '')
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
    GRANT EXECUTE ON FUNCTION brokerdesk_private.list_tenant_members_for_current_tenant(TEXT) TO brokerdesk_runtime;
  END IF;
END $$;

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
  WITH service_clock AS (
    SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE AS tokyo_today
  )
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
  CROSS JOIN service_clock
  WHERE memberships.user_id = brokerdesk_private.current_user_id()
    AND memberships.status = 'invited'
    AND memberships.invitation_status = 'pending'
    AND (memberships.invitation_expires_at IS NULL OR memberships.invitation_expires_at > NOW())
    AND tenants.status NOT IN ('suspended', 'cancelled')
    AND NOT (tenants.service_start_at IS NULL AND tenants.service_end_at IS NULL AND tenants.status = 'pending_activation')
    AND (tenants.service_start_at IS NULL OR tenants.service_start_at <= tokyo_today)
    AND (tenants.service_end_at IS NULL OR tenants.service_end_at >= tokyo_today)
  ORDER BY memberships.created_at ASC;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.list_pending_tenant_invitations_for_current_user() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.list_pending_tenant_invitations_for_current_user() TO brokerdesk_runtime;
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
  tenant_status TEXT;
  tenant_service_start_at DATE;
  tenant_service_end_at DATE;
  tokyo_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
  invited_email_value TEXT;
  actual_email_value TEXT;
  invitation_token_value TEXT;
  expires_at_value TIMESTAMPTZ;
  accepted_membership_role TEXT;
  acceptance_audit_row_count INTEGER;
BEGIN
  IF current_user_id IS NULL OR current_user_id <> NULLIF(trim(COALESCE(p_target_user_id, '')), '') THEN
    RAISE EXCEPTION 'invitation target does not match authenticated user' USING ERRCODE = '42501';
  END IF;

  -- Invitation acceptance participates in the same per-tenant lock order as
  -- capacity and member mutations: tenant first, target membership second.
  SELECT tenant_account.status, tenant_account.service_start_at, tenant_account.service_end_at
  INTO tenant_status, tenant_service_start_at, tenant_service_end_at
  FROM public.tenants AS tenant_account
  WHERE tenant_account.id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF tenant_status IN ('suspended', 'cancelled')
     OR (tenant_service_start_at IS NULL AND tenant_service_end_at IS NULL AND tenant_status = 'pending_activation')
     OR tenant_service_start_at > tokyo_today
     OR tenant_service_end_at < tokyo_today THEN
    RAISE EXCEPTION 'tenant service is unavailable for invitation acceptance' USING ERRCODE = '42501';
  END IF;

  SELECT memberships.invited_email, invited_user.email,
         memberships.invitation_token, memberships.invitation_expires_at
  INTO invited_email_value, actual_email_value,
       invitation_token_value, expires_at_value
  FROM public.tenant_memberships AS memberships
  INNER JOIN public.users AS invited_user ON invited_user.id = memberships.user_id
  WHERE memberships.id = p_membership_id
    AND memberships.tenant_id = p_tenant_id
    AND memberships.user_id = current_user_id
    AND memberships.status = 'invited'
    AND memberships.invitation_status = 'pending'
  LIMIT 1
  FOR UPDATE OF memberships;

  IF invited_email_value IS NULL OR actual_email_value IS NULL THEN
    RETURN;
  END IF;
  IF lower(trim(invited_email_value)) <> lower(trim(actual_email_value)) THEN
    RETURN;
  END IF;
  IF p_invitation_token IS NULL OR trim(p_invitation_token) = ''
     OR invitation_token_value IS NULL
     OR invitation_token_value <> trim(p_invitation_token) THEN
    RETURN;
  END IF;

  IF expires_at_value IS NOT NULL AND expires_at_value <= NOW() THEN
    UPDATE public.tenant_memberships AS memberships
    SET invitation_status = 'expired', updated_at = NOW()
    WHERE memberships.id = p_membership_id
      AND memberships.tenant_id = p_tenant_id
      AND memberships.user_id = current_user_id
      AND memberships.status = 'invited'
      AND memberships.invitation_status = 'pending';
    RETURN;
  END IF;

  -- pending invitation -> active is a seat-to-seat transition; the tenant lock
  -- keeps it serialized with capacity writers without acquiring another seat.
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
    AND (memberships.invitation_expires_at IS NULL OR memberships.invitation_expires_at > NOW())
  RETURNING memberships.role INTO accepted_membership_role;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.audit_logs (
    id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json, created_at
  ) VALUES (
    'audit_' || md5(clock_timestamp()::TEXT || random()::TEXT),
    p_tenant_id, current_user_id, current_user_id,
    'tenant_invitation_accepted', 'member', p_membership_id,
    '成员已接受经营主体邀请。',
    jsonb_build_object('membershipId', p_membership_id, 'role', accepted_membership_role),
    NOW()
  );
  GET DIAGNOSTICS acceptance_audit_row_count = ROW_COUNT;
  IF acceptance_audit_row_count <> 1 THEN
    RAISE EXCEPTION 'invitation acceptance audit was not persisted' USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  SELECT memberships.*
  FROM public.tenant_memberships AS memberships
  WHERE memberships.id = p_membership_id
    AND memberships.tenant_id = p_tenant_id
    AND memberships.user_id = current_user_id
    AND memberships.status = 'active'
    AND memberships.invitation_status = 'accepted';
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.accept_tenant_invitation(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.accept_tenant_invitation(TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION brokerdesk_private.bind_current_clerk_identity_to_pending_invitation(
  p_subject TEXT,
  p_email TEXT,
  p_name TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_subject TEXT := NULLIF(trim(COALESCE(p_subject, '')), '');
  normalized_email TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  normalized_name TEXT := NULLIF(trim(COALESCE(p_name, '')), '');
  configured_subject TEXT := brokerdesk_private.current_external_auth_subject();
  bound_user_id TEXT;
  candidate_count INTEGER;
  candidate_user_id TEXT;
  tokyo_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
BEGIN
  IF normalized_subject IS NULL OR normalized_email IS NULL THEN
    RETURN NULL;
  END IF;
  IF configured_subject IS NULL OR configured_subject <> normalized_subject THEN
    RAISE EXCEPTION 'external auth subject does not match request scope' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(normalized_email, 0));
  SELECT users.id
  INTO bound_user_id
  FROM public.users AS users
  WHERE users.external_auth_subject = normalized_subject
  LIMIT 1
  FOR UPDATE;
  IF bound_user_id IS NOT NULL THEN
    RETURN bound_user_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.users AS users
    WHERE lower(users.email) = normalized_email
      AND users.external_auth_subject IS NOT NULL
      AND users.external_auth_subject <> normalized_subject
  ) THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(DISTINCT users.id)::INTEGER
  INTO candidate_count
  FROM public.users AS users
  JOIN public.tenant_memberships AS memberships ON memberships.user_id = users.id
  JOIN public.tenants AS tenants ON tenants.id = memberships.tenant_id
  WHERE users.external_auth_subject IS NULL
    AND lower(users.email) = normalized_email
    AND lower(COALESCE(memberships.invited_email, '')) = normalized_email
    AND memberships.status = 'invited'
    AND memberships.invitation_status = 'pending'
    AND (memberships.invitation_expires_at IS NULL OR memberships.invitation_expires_at > NOW())
    AND tenants.status NOT IN ('suspended', 'cancelled')
    AND NOT (tenants.service_start_at IS NULL AND tenants.service_end_at IS NULL AND tenants.status = 'pending_activation')
    AND (tenants.service_start_at IS NULL OR tenants.service_start_at <= tokyo_today)
    AND (tenants.service_end_at IS NULL OR tenants.service_end_at >= tokyo_today);

  IF candidate_count <> 1 THEN
    RETURN NULL;
  END IF;

  SELECT users.id
  INTO candidate_user_id
  FROM public.users AS users
  JOIN public.tenant_memberships AS memberships ON memberships.user_id = users.id
  JOIN public.tenants AS tenants ON tenants.id = memberships.tenant_id
  WHERE users.external_auth_subject IS NULL
    AND lower(users.email) = normalized_email
    AND lower(COALESCE(memberships.invited_email, '')) = normalized_email
    AND memberships.status = 'invited'
    AND memberships.invitation_status = 'pending'
    AND (memberships.invitation_expires_at IS NULL OR memberships.invitation_expires_at > NOW())
    AND tenants.status NOT IN ('suspended', 'cancelled')
    AND NOT (tenants.service_start_at IS NULL AND tenants.service_end_at IS NULL AND tenants.status = 'pending_activation')
    AND (tenants.service_start_at IS NULL OR tenants.service_start_at <= tokyo_today)
    AND (tenants.service_end_at IS NULL OR tenants.service_end_at >= tokyo_today)
  ORDER BY users.created_at ASC
  LIMIT 1
  FOR UPDATE OF users;

  UPDATE public.users AS users
  SET external_auth_subject = normalized_subject,
      name = CASE WHEN trim(users.name) = '' THEN COALESCE(normalized_name, normalized_email) ELSE users.name END
  WHERE users.id = candidate_user_id
    AND users.external_auth_subject IS NULL
  RETURNING users.id INTO bound_user_id;

  RETURN bound_user_id;
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.bind_current_clerk_identity_to_pending_invitation(TEXT, TEXT, TEXT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.bind_current_clerk_identity_to_pending_invitation(TEXT, TEXT, TEXT) TO brokerdesk_runtime;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION brokerdesk_private.create_tenant_invitation(
  p_tenant_id TEXT,
  p_actor_user_id TEXT,
  p_email TEXT,
  p_name TEXT,
  p_role TEXT,
  p_capability TEXT
)
RETURNS TABLE (
  membership_id TEXT, tenant_id TEXT, user_id TEXT, role TEXT,
  capability TEXT, status TEXT, invitation_provider TEXT,
  invitation_status TEXT, invitation_accepted_at TIMESTAMPTZ,
  invited_email TEXT, invited_by_user_id TEXT,
  invitation_expires_at TIMESTAMPTZ, invitation_token TEXT,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  user_name TEXT, user_email TEXT, user_external_auth_subject TEXT,
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
  existing_membership_id TEXT;
  existing_status TEXT;
  existing_invitation_status TEXT;
  existing_invitation_expires_at TIMESTAMPTZ;
  authorized_actor_membership_id TEXT;
  purchased_seat_count INTEGER;
  tenant_status TEXT;
  tenant_service_start_at DATE;
  tenant_service_end_at DATE;
  tokyo_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
  used_seat_count INTEGER;
  current_occupies_seat BOOLEAN := FALSE;
  next_occupies_seat BOOLEAN := TRUE;
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
  IF NOT (
    (p_role = 'tenant_owner' AND p_capability = 'company_owner')
    OR (p_role = 'manager' AND p_capability = 'company_form_admin')
    OR (p_role = 'broker' AND p_capability = 'ordinary_member')
  ) THEN
    RAISE EXCEPTION 'company capability and legacy role do not match' USING ERRCODE = '22023';
  END IF;
  SELECT tenant_account.purchased_seat_count, tenant_account.status,
         tenant_account.service_start_at, tenant_account.service_end_at
  INTO purchased_seat_count, tenant_status,
       tenant_service_start_at, tenant_service_end_at
  FROM public.tenants AS tenant_account
  WHERE tenant_account.id = normalized_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF tenant_status IN ('suspended', 'cancelled')
     OR (tenant_service_start_at IS NULL AND tenant_service_end_at IS NULL AND tenant_status = 'pending_activation')
     OR (tenant_service_start_at IS NOT NULL AND tenant_service_start_at > tokyo_today)
     OR (tenant_service_end_at IS NOT NULL AND tenant_service_end_at < tokyo_today) THEN
    RAISE EXCEPTION 'tenant service is unavailable for invitations' USING ERRCODE = '42501';
  END IF;

  SELECT authorized_actor_memberships.id
  INTO authorized_actor_membership_id
  FROM public.tenant_memberships AS authorized_actor_memberships
  WHERE authorized_actor_memberships.tenant_id = normalized_tenant_id
    AND authorized_actor_memberships.user_id = current_actor_id
    AND authorized_actor_memberships.status = 'active'
    AND authorized_actor_memberships.capability = 'company_owner'
  ORDER BY authorized_actor_memberships.id
  LIMIT 1
  FOR UPDATE OF authorized_actor_memberships;
  IF authorized_actor_membership_id IS NULL THEN
    RAISE EXCEPTION 'member invite permission required' USING ERRCODE = '42501';
  END IF;

  normalized_name := COALESCE(normalized_name, normalized_email);
  SELECT users.id INTO invited_user_id
  FROM public.users AS users
  WHERE lower(users.email) = normalized_email
  LIMIT 1
  FOR UPDATE;

  SELECT memberships.id, memberships.status, memberships.invitation_status, memberships.invitation_expires_at
  INTO existing_membership_id, existing_status, existing_invitation_status, existing_invitation_expires_at
  FROM public.tenant_memberships memberships
  WHERE memberships.tenant_id = normalized_tenant_id
    AND memberships.user_id = invited_user_id
  ORDER BY CASE WHEN memberships.status = 'removed' THEN 1 ELSE 0 END ASC,
           memberships.updated_at DESC,
           memberships.created_at DESC
  LIMIT 1
  FOR UPDATE;

  current_occupies_seat :=
    existing_status IN ('active', 'suspended')
    OR (existing_status = 'invited' AND existing_invitation_status NOT IN ('revoked', 'expired')
        AND (existing_invitation_expires_at IS NULL OR existing_invitation_expires_at > NOW()));
  IF NOT current_occupies_seat AND next_occupies_seat THEN
    SELECT COUNT(*)::INTEGER
    INTO used_seat_count
    FROM public.tenant_memberships AS seats
    WHERE seats.tenant_id = normalized_tenant_id
      AND (
        seats.status IN ('active', 'suspended')
        OR (seats.status = 'invited' AND seats.invitation_status NOT IN ('revoked', 'expired')
            AND (seats.invitation_expires_at IS NULL OR seats.invitation_expires_at > NOW()))
      );
    IF used_seat_count >= purchased_seat_count THEN
      RAISE EXCEPTION 'purchased seat count exceeded' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF invited_user_id IS NULL THEN
    INSERT INTO public.users (id, name, email, password_hash, external_auth_subject)
    VALUES ('user_' || substr(md5(clock_timestamp()::TEXT || random()::TEXT), 1, 12), normalized_name, normalized_email, 'local_invited_user', NULL)
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

  IF existing_status = 'active' THEN
    RAISE EXCEPTION 'active member cannot be changed back to invited' USING ERRCODE = '22023';
  END IF;
  IF existing_status = 'suspended' THEN
    RAISE EXCEPTION 'suspended member must be explicitly reactivated, not re-invited' USING ERRCODE = '22023';
  END IF;

  IF existing_status = 'invited' THEN
    UPDATE public.tenant_memberships
    SET role = p_role, capability = p_capability, status = 'invited',
        invited_email = normalized_email, invited_by_user_id = normalized_actor_id,
        invitation_provider = 'none', invitation_status = 'pending',
        invitation_accepted_at = NULL, invitation_expires_at = invitation_expires_at_value,
        invitation_token = invitation_token_value, updated_at = NOW()
    WHERE tenant_memberships.tenant_id = normalized_tenant_id
      AND tenant_memberships.id = existing_membership_id
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
    GRANT EXECUTE ON FUNCTION brokerdesk_private.create_tenant_invitation(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION brokerdesk_private.enforce_tenant_service_for_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  tenant_row public.tenants%ROWTYPE;
  tokyo_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT (NEW.status = 'invited' AND NEW.invitation_status = 'pending') THEN
      RETURN NEW;
    END IF;
  ELSIF NOT (
    (NEW.status = 'active' AND OLD.status = 'invited')
    OR (NEW.status = 'invited' AND NEW.invitation_status = 'pending')
  ) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO tenant_row FROM public.tenants WHERE id = NEW.tenant_id;
  IF tenant_row.id IS NULL
     OR tenant_row.status IN ('suspended', 'cancelled')
     OR (
       tenant_row.service_start_at IS NULL
       AND tenant_row.service_end_at IS NULL
       AND tenant_row.status = 'pending_activation'
     )
     OR (tenant_row.service_start_at IS NOT NULL AND tenant_row.service_start_at > tokyo_today)
     OR (tenant_row.service_end_at IS NOT NULL AND tenant_row.service_end_at < tokyo_today) THEN
    RAISE EXCEPTION 'tenant service is unavailable for invitations' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_membership_service_invitation_guard ON public.tenant_memberships;
CREATE TRIGGER tenant_membership_service_invitation_guard
BEFORE INSERT OR UPDATE ON public.tenant_memberships
FOR EACH ROW EXECUTE FUNCTION brokerdesk_private.enforce_tenant_service_for_invitation();

-- The admin worker bypasses tenant sessions, so its claim boundary must apply
-- the same Tokyo service-period contract before locking or updating jobs.
CREATE OR REPLACE FUNCTION brokerdesk_private.claim_next_import_jobs(p_limit integer DEFAULT 3)
RETURNS TABLE (job_id text, tenant_id text, user_id text, external_auth_subject text, source_type text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_limit integer := LEAST(GREATEST(COALESCE(p_limit, 3), 1), 5);
  tokyo_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT jobs.id
    FROM public.import_jobs AS jobs
    INNER JOIN public.users AS users ON users.id = jobs.user_id
    INNER JOIN public.tenants AS tenants ON tenants.id = jobs.tenant_id
    WHERE jobs.status = 'queued'
      AND jobs.source_type IN ('excel', 'scan')
      AND users.external_auth_subject IS NOT NULL
      AND tenants.status NOT IN ('suspended', 'cancelled')
      AND NOT (
        tenants.service_start_at IS NULL
        AND tenants.service_end_at IS NULL
        AND tenants.status = 'pending_activation'
      )
      AND (tenants.service_start_at IS NULL OR tenants.service_start_at <= tokyo_today)
      AND (tenants.service_end_at IS NULL OR tenants.service_end_at >= tokyo_today)
    ORDER BY jobs.created_at ASC, jobs.id ASC
    FOR UPDATE OF jobs SKIP LOCKED
    LIMIT normalized_limit
  ), claimed AS (
    UPDATE public.import_jobs AS jobs
    SET status = 'processing', processing_started_at = NOW(),
        attempt_count = jobs.attempt_count + 1, error_code = NULL,
        error_summary = NULL, updated_at = NOW()
    FROM candidates
    WHERE jobs.id = candidates.id
    RETURNING jobs.id, jobs.tenant_id, jobs.user_id, jobs.source_type
  )
  SELECT claimed.id, claimed.tenant_id, claimed.user_id, users.external_auth_subject, claimed.source_type
  FROM claimed
  INNER JOIN public.users AS users ON users.id = claimed.user_id;
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.claim_next_import_jobs(integer) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_admin') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.claim_next_import_jobs(integer) TO brokerdesk_admin;
  END IF;
END $$;
COMMENT ON FUNCTION brokerdesk_private.claim_next_import_jobs(integer) IS
  'Claims a bounded batch of queued import jobs only for operational tenant service periods.';

-- Clerk profile synchronization binds or creates only the local user identity.
-- Membership acceptance remains exclusively behind explicit invitation tokens.
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
      SELECT 1
      FROM public.users
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

  RETURN local_user_id;
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.sync_external_auth_user(TEXT, TEXT, TEXT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_admin') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.sync_external_auth_user(TEXT, TEXT, TEXT) TO brokerdesk_admin;
  END IF;
END $$;

-- Clerk deletion must preserve already released membership states. Only rows
-- that already occupy a seat are converted to suspended, so this lifecycle
-- transition cannot acquire capacity in any tenant.
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
    AND (
      status = 'active'
      OR (status = 'invited' AND invitation_status NOT IN ('revoked', 'expired')
          AND (invitation_expires_at IS NULL OR invitation_expires_at > NOW()))
    );

  GET DIAGNOSTICS suspended_count = ROW_COUNT;
  RETURN jsonb_build_object('userId', local_user_id, 'suspendedMembershipCount', suspended_count);
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.suspend_external_auth_user(TEXT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_admin') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.suspend_external_auth_user(TEXT) TO brokerdesk_admin;
  END IF;
END $$;

-- Invitation delivery states pending/failed/not_sent occupy a purchased seat.
-- Re-acquiring one after revoked/expired must serialize on the tenant before
-- locking the membership and publishing the delivery-state update.
CREATE OR REPLACE FUNCTION brokerdesk_private.prepare_tenant_invitation_delivery(
  p_tenant_id TEXT,
  p_membership_id TEXT,
  p_actor_user_id TEXT,
  p_invited_by_user_id TEXT DEFAULT NULL
)
RETURNS TABLE (tenant_record JSONB, member_record JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_actor_id TEXT := brokerdesk_private.current_user_id();
  tenant_row public.tenants%ROWTYPE;
  tenant_status TEXT;
  tenant_service_start_at DATE;
  tenant_service_end_at DATE;
  tokyo_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
  purchased_seat_count INTEGER;
  used_seat_count INTEGER;
  authorized_actor_membership_id TEXT;
  target_membership_row public.tenant_memberships%ROWTYPE;
  invited_user_row public.users%ROWTYPE;
  updated_membership public.tenant_memberships%ROWTYPE;
  current_occupies_seat BOOLEAN;
  next_occupies_seat BOOLEAN := TRUE;
BEGIN
  IF current_actor_id IS NULL OR current_actor_id <> NULLIF(trim(COALESCE(p_actor_user_id, '')), '') THEN
    RAISE EXCEPTION 'invitation actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_account.*
  INTO tenant_row
  FROM public.tenants AS tenant_account
  WHERE tenant_account.id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  purchased_seat_count := tenant_row.purchased_seat_count;
  tenant_status := tenant_row.status;
  tenant_service_start_at := tenant_row.service_start_at;
  tenant_service_end_at := tenant_row.service_end_at;
  IF tenant_status IN ('suspended', 'cancelled')
     OR (tenant_service_start_at IS NULL AND tenant_service_end_at IS NULL AND tenant_status = 'pending_activation')
     OR (tenant_service_start_at IS NOT NULL AND tenant_service_start_at > tokyo_today)
     OR (tenant_service_end_at IS NOT NULL AND tenant_service_end_at < tokyo_today) THEN
    RAISE EXCEPTION 'tenant service is unavailable for invitations' USING ERRCODE = '42501';
  END IF;

  SELECT authorized_actor_memberships.id
  INTO authorized_actor_membership_id
  FROM public.tenant_memberships AS authorized_actor_memberships
  INNER JOIN public.users AS authorized_actor_users
    ON authorized_actor_users.id = authorized_actor_memberships.user_id
  WHERE authorized_actor_users.id = current_actor_id
    AND authorized_actor_memberships.status = 'active'
    AND (
      (authorized_actor_memberships.tenant_id = p_tenant_id
       AND authorized_actor_memberships.capability = 'company_owner')
      OR authorized_actor_memberships.role = 'platform_owner'
    )
  ORDER BY CASE
    WHEN authorized_actor_memberships.tenant_id = p_tenant_id
     AND authorized_actor_memberships.capability = 'company_owner' THEN 0
    ELSE 1
  END, authorized_actor_memberships.id
  LIMIT 1
  FOR UPDATE OF authorized_actor_memberships;
  IF authorized_actor_membership_id IS NULL THEN
    RAISE EXCEPTION 'member invite permission required' USING ERRCODE = '42501';
  END IF;

  SELECT target_membership.*
  INTO target_membership_row
  FROM public.tenant_memberships AS target_membership
  WHERE target_membership.id = p_membership_id
    AND target_membership.tenant_id = p_tenant_id
  FOR UPDATE OF target_membership;
  IF NOT FOUND OR target_membership_row.status <> 'invited' THEN
    RETURN;
  END IF;

  SELECT invited_user.*
  INTO invited_user_row
  FROM public.users AS invited_user
  WHERE invited_user.id = target_membership_row.user_id
  FOR UPDATE OF invited_user;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  current_occupies_seat :=
    target_membership_row.status IN ('active', 'suspended')
    OR (target_membership_row.status = 'invited'
        AND target_membership_row.invitation_status NOT IN ('revoked', 'expired')
        AND (target_membership_row.invitation_expires_at IS NULL OR target_membership_row.invitation_expires_at > NOW()));
  IF NOT current_occupies_seat AND next_occupies_seat THEN
    SELECT COUNT(*)::INTEGER
    INTO used_seat_count
    FROM public.tenant_memberships AS seats
    WHERE seats.tenant_id = p_tenant_id
      AND (
        seats.status IN ('active', 'suspended')
        OR (seats.status = 'invited' AND seats.invitation_status NOT IN ('revoked', 'expired')
            AND (seats.invitation_expires_at IS NULL OR seats.invitation_expires_at > NOW()))
      );
    IF used_seat_count >= purchased_seat_count THEN
      RAISE EXCEPTION 'purchased seat count exceeded' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.tenant_memberships AS memberships
  SET invitation_status = 'pending',
      invitation_token = md5(clock_timestamp()::TEXT || random()::TEXT),
      invitation_expires_at = NOW() + INTERVAL '7 days',
      invited_by_user_id = COALESCE(NULLIF(trim(COALESCE(p_invited_by_user_id, '')), ''), current_actor_id),
      invitation_sent_at = NOW(),
      invitation_error = NULL,
      updated_at = NOW()
  WHERE memberships.id = p_membership_id
    AND memberships.tenant_id = p_tenant_id
    AND memberships.status = 'invited'
  RETURNING memberships.* INTO updated_membership;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT to_jsonb(tenant_row),
    jsonb_build_object('membership', to_jsonb(updated_membership), 'user', to_jsonb(invited_user_row));
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.prepare_tenant_invitation_delivery(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.prepare_tenant_invitation_delivery(TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime;
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
  tenant_status TEXT;
  tenant_service_start_at DATE;
  tenant_service_end_at DATE;
  tokyo_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
  purchased_seat_count INTEGER;
  used_seat_count INTEGER;
  target_status TEXT;
  target_invitation_status TEXT;
  target_invitation_expires_at TIMESTAMPTZ;
  authorized_actor_membership_id TEXT;
  current_occupies_seat BOOLEAN;
  next_occupies_seat BOOLEAN := TRUE;
BEGIN
  IF current_actor_id IS NULL OR current_actor_id <> NULLIF(trim(COALESCE(p_actor_user_id, '')), '') THEN
    RAISE EXCEPTION 'invitation actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;
  SELECT tenant_account.purchased_seat_count, tenant_account.status,
         tenant_account.service_start_at, tenant_account.service_end_at
  INTO purchased_seat_count, tenant_status,
       tenant_service_start_at, tenant_service_end_at
  FROM public.tenants AS tenant_account
  WHERE tenant_account.id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF tenant_status IN ('suspended', 'cancelled')
     OR (tenant_service_start_at IS NULL AND tenant_service_end_at IS NULL AND tenant_status = 'pending_activation')
     OR (tenant_service_start_at IS NOT NULL AND tenant_service_start_at > tokyo_today)
     OR (tenant_service_end_at IS NOT NULL AND tenant_service_end_at < tokyo_today) THEN
    RAISE EXCEPTION 'tenant service is unavailable for invitations' USING ERRCODE = '42501';
  END IF;
  SELECT authorized_actor_memberships.id
  INTO authorized_actor_membership_id
  FROM public.tenant_memberships AS authorized_actor_memberships
  INNER JOIN public.users AS authorized_actor_users
    ON authorized_actor_users.id = authorized_actor_memberships.user_id
  WHERE authorized_actor_users.id = current_actor_id
    AND authorized_actor_memberships.status = 'active'
    AND (
      (authorized_actor_memberships.tenant_id = p_tenant_id
       AND authorized_actor_memberships.capability = 'company_owner')
      OR authorized_actor_memberships.role = 'platform_owner'
    )
  ORDER BY CASE
    WHEN authorized_actor_memberships.tenant_id = p_tenant_id
     AND authorized_actor_memberships.capability = 'company_owner' THEN 0
    ELSE 1
  END, authorized_actor_memberships.id
  LIMIT 1
  FOR UPDATE OF authorized_actor_memberships;
  IF authorized_actor_membership_id IS NULL THEN
    RAISE EXCEPTION 'member invite permission required' USING ERRCODE = '42501';
  END IF;

  SELECT target_membership.status, target_membership.invitation_status, target_membership.invitation_expires_at
  INTO target_status, target_invitation_status, target_invitation_expires_at
  FROM public.tenant_memberships AS target_membership
  WHERE target_membership.id = p_membership_id
    AND target_membership.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR target_status <> 'invited' THEN
    RETURN;
  END IF;

  current_occupies_seat :=
    target_status IN ('active', 'suspended')
    OR (target_status = 'invited' AND target_invitation_status NOT IN ('revoked', 'expired')
        AND (target_invitation_expires_at IS NULL OR target_invitation_expires_at > NOW()));
  IF NOT current_occupies_seat AND next_occupies_seat THEN
    SELECT COUNT(*)::INTEGER
    INTO used_seat_count
    FROM public.tenant_memberships AS seats
    WHERE seats.tenant_id = p_tenant_id
      AND (
        seats.status IN ('active', 'suspended')
        OR (seats.status = 'invited' AND seats.invitation_status NOT IN ('revoked', 'expired')
            AND (seats.invitation_expires_at IS NULL OR seats.invitation_expires_at > NOW()))
      );
    IF used_seat_count >= purchased_seat_count THEN
      RAISE EXCEPTION 'purchased seat count exceeded' USING ERRCODE = '23514';
    END IF;
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
  tenant_status TEXT;
  tenant_service_start_at DATE;
  tenant_service_end_at DATE;
  tokyo_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
  purchased_seat_count INTEGER;
  used_seat_count INTEGER;
  target_status TEXT;
  target_invitation_status TEXT;
  target_invitation_expires_at TIMESTAMPTZ;
  target_invitation_provider TEXT;
  target_provider_invitation_id TEXT;
  target_invitation_error TEXT;
  authorized_actor_membership_id TEXT;
  next_invitation_expires_at TIMESTAMPTZ;
  current_occupies_seat BOOLEAN;
  next_occupies_seat BOOLEAN;
  duplicate_delivery_finalization BOOLEAN := FALSE;
  delivery_update_row_count INTEGER;
  delivery_audit_action TEXT;
  delivery_audit_row_count INTEGER;
BEGIN
  IF current_actor_id IS NULL OR current_actor_id <> NULLIF(trim(COALESCE(p_actor_user_id, '')), '') THEN
    RAISE EXCEPTION 'invitation actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;
  IF p_provider NOT IN ('none', 'manual', 'clerk') OR p_invitation_status NOT IN ('pending', 'failed', 'not_sent', 'revoked', 'expired') THEN
    RAISE EXCEPTION 'unsupported invitation delivery state' USING ERRCODE = '22023';
  END IF;
  SELECT tenant_account.purchased_seat_count, tenant_account.status,
         tenant_account.service_start_at, tenant_account.service_end_at
  INTO purchased_seat_count, tenant_status,
       tenant_service_start_at, tenant_service_end_at
  FROM public.tenants AS tenant_account
  WHERE tenant_account.id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF tenant_status IN ('suspended', 'cancelled')
     OR (tenant_service_start_at IS NULL AND tenant_service_end_at IS NULL AND tenant_status = 'pending_activation')
     OR (tenant_service_start_at IS NOT NULL AND tenant_service_start_at > tokyo_today)
     OR (tenant_service_end_at IS NOT NULL AND tenant_service_end_at < tokyo_today) THEN
    RAISE EXCEPTION 'tenant service is unavailable for invitations' USING ERRCODE = '42501';
  END IF;
  SELECT authorized_actor_memberships.id
  INTO authorized_actor_membership_id
  FROM public.tenant_memberships AS authorized_actor_memberships
  INNER JOIN public.users AS authorized_actor_users
    ON authorized_actor_users.id = authorized_actor_memberships.user_id
  WHERE authorized_actor_users.id = current_actor_id
    AND authorized_actor_memberships.status = 'active'
    AND (
      (authorized_actor_memberships.tenant_id = p_tenant_id
       AND authorized_actor_memberships.capability = 'company_owner')
      OR authorized_actor_memberships.role = 'platform_owner'
    )
  ORDER BY CASE
    WHEN authorized_actor_memberships.tenant_id = p_tenant_id
     AND authorized_actor_memberships.capability = 'company_owner' THEN 0
    ELSE 1
  END, authorized_actor_memberships.id
  LIMIT 1
  FOR UPDATE OF authorized_actor_memberships;
  IF authorized_actor_membership_id IS NULL THEN
    RAISE EXCEPTION 'member invite permission required' USING ERRCODE = '42501';
  END IF;

  SELECT target_membership.status, target_membership.invitation_status, target_membership.invitation_expires_at,
         target_membership.invitation_provider, target_membership.provider_invitation_id, target_membership.invitation_error
  INTO target_status, target_invitation_status, target_invitation_expires_at,
       target_invitation_provider, target_provider_invitation_id, target_invitation_error
  FROM public.tenant_memberships AS target_membership
  WHERE target_membership.id = p_membership_id
    AND target_membership.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR target_status <> 'invited' OR (p_provider = 'clerk' AND target_invitation_status IN ('revoked', 'expired')) THEN
    RETURN;
  END IF;

  duplicate_delivery_finalization := p_provider = 'clerk' AND (
    (p_invitation_status = 'pending'
     AND p_provider_invitation_id IS NOT NULL
     AND target_invitation_provider = 'clerk'
     AND target_invitation_status = 'pending'
     AND target_provider_invitation_id = p_provider_invitation_id)
    OR
    (p_invitation_status = 'failed'
     AND target_invitation_provider = 'clerk'
     AND target_invitation_status = 'failed'
     AND target_invitation_error IS NOT DISTINCT FROM p_invitation_error)
  );
  IF duplicate_delivery_finalization THEN
    RETURN QUERY SELECT memberships.*
    FROM public.tenant_memberships AS memberships
    WHERE memberships.id = p_membership_id AND memberships.tenant_id = p_tenant_id;
    RETURN;
  END IF;

  current_occupies_seat :=
    target_status IN ('active', 'suspended')
    OR (target_status = 'invited' AND target_invitation_status NOT IN ('revoked', 'expired')
        AND (target_invitation_expires_at IS NULL OR target_invitation_expires_at > NOW()));
  next_invitation_expires_at := COALESCE(p_expires_at, target_invitation_expires_at);
  next_occupies_seat :=
    target_status IN ('active', 'suspended')
    OR (target_status = 'invited' AND p_invitation_status NOT IN ('revoked', 'expired')
        AND (next_invitation_expires_at IS NULL OR next_invitation_expires_at > NOW()));
  IF NOT current_occupies_seat AND next_occupies_seat THEN
    SELECT COUNT(*)::INTEGER
    INTO used_seat_count
    FROM public.tenant_memberships AS seats
    WHERE seats.tenant_id = p_tenant_id
      AND (
        seats.status IN ('active', 'suspended')
        OR (seats.status = 'invited' AND seats.invitation_status NOT IN ('revoked', 'expired')
            AND (seats.invitation_expires_at IS NULL OR seats.invitation_expires_at > NOW()))
      );
    IF used_seat_count >= purchased_seat_count THEN
      RAISE EXCEPTION 'purchased seat count exceeded' USING ERRCODE = '23514';
    END IF;
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
  GET DIAGNOSTICS delivery_update_row_count = ROW_COUNT;
  IF delivery_update_row_count <> 1 THEN
    RAISE EXCEPTION 'invitation delivery was not persisted' USING ERRCODE = '23514';
  END IF;

  delivery_audit_action := CASE
    WHEN p_provider = 'clerk' AND p_invitation_status = 'pending' THEN 'member_invitation_sent'
    WHEN p_provider = 'clerk' AND p_invitation_status = 'failed' THEN 'member_invitation_failed'
    ELSE NULL
  END;
  IF delivery_audit_action IN ('member_invitation_sent', 'member_invitation_failed') THEN
    INSERT INTO public.audit_logs (
      id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json, created_at
    ) VALUES (
      'audit_' || md5(clock_timestamp()::TEXT || random()::TEXT),
      p_tenant_id, current_actor_id, current_actor_id,
      delivery_audit_action, 'member', p_membership_id,
      CASE
        WHEN delivery_audit_action = 'member_invitation_sent' THEN '成员邀请已发送。'
        ELSE '成员邀请发送失败。'
      END,
      jsonb_build_object(
        'membershipId', p_membership_id,
        'provider', p_provider,
        'providerInvitationId', p_provider_invitation_id,
        'reason', p_invitation_error
      ),
      NOW()
    );
    GET DIAGNOSTICS delivery_audit_row_count = ROW_COUNT;
    IF delivery_audit_row_count <> 1 THEN
      RAISE EXCEPTION 'invitation delivery audit was not persisted' USING ERRCODE = '23514';
    END IF;
  END IF;

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

-- Member-management mutations share the same Tokyo operational boundary as
-- invitations. Lock the tenant before the target membership so service and
-- last-owner decisions are serialized for the entire mutation transaction.
CREATE OR REPLACE FUNCTION brokerdesk_private.update_tenant_member_capability(
  p_tenant_id TEXT,
  p_membership_id TEXT,
  p_actor_user_id TEXT,
  p_role TEXT,
  p_capability TEXT
)
RETURNS SETOF public.tenant_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id TEXT := brokerdesk_private.current_user_id();
  tenant_status TEXT;
  tenant_service_start_at DATE;
  tenant_service_end_at DATE;
  tokyo_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
  target_role TEXT;
  target_status TEXT;
  active_owner_count INTEGER;
BEGIN
  IF current_user_id IS NULL OR current_user_id <> NULLIF(trim(COALESCE(p_actor_user_id, '')), '') THEN
    RAISE EXCEPTION 'member capability actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;
  IF p_capability NOT IN ('company_owner', 'company_form_admin', 'ordinary_member') THEN
    RAISE EXCEPTION 'invalid company capability preset' USING ERRCODE = '22023';
  END IF;
  IF (p_capability = 'company_owner' AND p_role <> 'tenant_owner')
     OR (p_capability = 'company_form_admin' AND p_role <> 'manager')
     OR (p_capability = 'ordinary_member' AND p_role <> 'broker') THEN
    RAISE EXCEPTION 'company capability and legacy role do not match' USING ERRCODE = '22023';
  END IF;

  SELECT tenant_account.status, tenant_account.service_start_at, tenant_account.service_end_at
  INTO tenant_status, tenant_service_start_at, tenant_service_end_at
  FROM public.tenants AS tenant_account
  WHERE tenant_account.id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF tenant_status IN ('suspended', 'cancelled')
     OR (tenant_service_start_at IS NULL AND tenant_service_end_at IS NULL AND tenant_status = 'pending_activation')
     OR tenant_service_start_at > tokyo_today
     OR tenant_service_end_at < tokyo_today THEN
    RAISE EXCEPTION 'tenant service is unavailable for member management' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS actor_membership
    WHERE actor_membership.tenant_id = p_tenant_id
      AND actor_membership.user_id = current_user_id
      AND actor_membership.status = 'active'
      AND actor_membership.capability = 'company_owner'
  ) THEN
    RAISE EXCEPTION 'company owner capability required' USING ERRCODE = '42501';
  END IF;

  SELECT memberships.role, memberships.status
  INTO target_role, target_status
  FROM public.tenant_memberships AS memberships
  WHERE memberships.id = p_membership_id
    AND memberships.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO active_owner_count
  FROM public.tenant_memberships AS owners
  WHERE owners.tenant_id = p_tenant_id
    AND owners.status = 'active'
    AND owners.role = 'tenant_owner'
    AND owners.capability = 'company_owner';
  IF target_status = 'active'
     AND target_role = 'tenant_owner'
     AND active_owner_count <= 1
     AND (p_role <> 'tenant_owner' OR p_capability <> 'company_owner') THEN
    RAISE EXCEPTION 'last active company owner cannot be downgraded' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tenant_memberships AS memberships
  SET role = p_role,
      capability = p_capability,
      updated_at = NOW()
  WHERE memberships.id = p_membership_id
    AND memberships.tenant_id = p_tenant_id;

  RETURN QUERY
  SELECT memberships.*
  FROM public.tenant_memberships AS memberships
  WHERE memberships.id = p_membership_id
    AND memberships.tenant_id = p_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.update_tenant_member_capability(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.update_tenant_member_capability(TEXT, TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime;
  END IF;
END $$;

-- A released invitation or removed membership does not occupy a seat. Replace
-- the lifecycle function here so every released-to-seat transition is checked
-- while holding the tenant row lock in the same transaction as the update.
CREATE OR REPLACE FUNCTION brokerdesk_private.update_tenant_member_status(
  p_tenant_id TEXT,
  p_membership_id TEXT,
  p_actor_user_id TEXT,
  p_status TEXT
)
RETURNS SETOF public.tenant_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id TEXT := brokerdesk_private.current_user_id();
  tenant_status TEXT;
  tenant_service_start_at DATE;
  tenant_service_end_at DATE;
  tokyo_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
  target_role TEXT;
  target_status TEXT;
  target_invitation_status TEXT;
  target_invitation_expires_at TIMESTAMPTZ;
  purchased_seat_count INTEGER;
  used_seat_count INTEGER;
  active_owner_count INTEGER;
  current_occupies_seat BOOLEAN;
  next_occupies_seat BOOLEAN;
BEGIN
  IF current_user_id IS NULL OR current_user_id <> NULLIF(trim(COALESCE(p_actor_user_id, '')), '') THEN
    RAISE EXCEPTION 'member status actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('active', 'suspended', 'removed') THEN
    RAISE EXCEPTION 'invalid member status' USING ERRCODE = '22023';
  END IF;
  -- This row lock is shared with invitation capacity checks and serializes all
  -- capacity-changing writes for one tenant until this transaction commits.
  SELECT tenant_account.purchased_seat_count, tenant_account.status,
         tenant_account.service_start_at, tenant_account.service_end_at
  INTO purchased_seat_count, tenant_status,
       tenant_service_start_at, tenant_service_end_at
  FROM public.tenants AS tenant_account
  WHERE tenant_account.id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF tenant_status IN ('suspended', 'cancelled')
     OR (tenant_service_start_at IS NULL AND tenant_service_end_at IS NULL AND tenant_status = 'pending_activation')
     OR tenant_service_start_at > tokyo_today
     OR tenant_service_end_at < tokyo_today THEN
    RAISE EXCEPTION 'tenant service is unavailable for member management' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS actor_membership
    WHERE actor_membership.tenant_id = p_tenant_id
      AND actor_membership.user_id = current_user_id
      AND actor_membership.status = 'active'
      AND actor_membership.capability = 'company_owner'
  ) THEN
    RAISE EXCEPTION 'company owner capability required' USING ERRCODE = '42501';
  END IF;

  SELECT memberships.role, memberships.status, memberships.invitation_status, memberships.invitation_expires_at
  INTO target_role, target_status, target_invitation_status, target_invitation_expires_at
  FROM public.tenant_memberships AS memberships
  WHERE memberships.id = p_membership_id
    AND memberships.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF target_status = 'invited' AND p_status IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'invited membership requires explicit token acceptance' USING ERRCODE = '42501';
  END IF;
  IF target_status = 'removed' AND p_status IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'removed membership requires a new invitation' USING ERRCODE = '42501';
  END IF;
  IF ((target_status = 'active' AND p_status = 'suspended')
      OR (target_status = 'suspended' AND p_status = 'active'))
     AND target_invitation_status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'only accepted members can be suspended or reactivated' USING ERRCODE = '42501';
  END IF;

  current_occupies_seat :=
    target_status IN ('active', 'suspended')
    OR (target_status = 'invited' AND target_invitation_status NOT IN ('revoked', 'expired')
        AND (target_invitation_expires_at IS NULL OR target_invitation_expires_at > NOW()));
  next_occupies_seat := p_status IN ('active', 'suspended');
  IF NOT current_occupies_seat AND next_occupies_seat THEN
    SELECT COUNT(*)::INTEGER
    INTO used_seat_count
    FROM public.tenant_memberships AS seats
    WHERE seats.tenant_id = p_tenant_id
      AND (
        seats.status IN ('active', 'suspended')
        OR (seats.status = 'invited' AND seats.invitation_status NOT IN ('revoked', 'expired')
            AND (seats.invitation_expires_at IS NULL OR seats.invitation_expires_at > NOW()))
      );
    IF used_seat_count >= purchased_seat_count THEN
      RAISE EXCEPTION 'purchased seat count exceeded' USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO active_owner_count
  FROM public.tenant_memberships AS owners
  WHERE owners.tenant_id = p_tenant_id
    AND owners.status = 'active'
    AND owners.role = 'tenant_owner'
    AND owners.capability = 'company_owner';
  IF target_status = 'active'
     AND target_role = 'tenant_owner'
     AND active_owner_count <= 1
     AND p_status <> 'active' THEN
    RAISE EXCEPTION 'last active company owner cannot be suspended or removed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tenant_memberships AS memberships
  SET status = p_status,
      updated_at = NOW()
  WHERE memberships.id = p_membership_id
    AND memberships.tenant_id = p_tenant_id;

  RETURN QUERY
  SELECT memberships.*
  FROM public.tenant_memberships AS memberships
  WHERE memberships.id = p_membership_id
    AND memberships.tenant_id = p_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.update_tenant_member_status(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.update_tenant_member_status(TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime;
  END IF;
END $$;

-- The adapter records tenant_subscription_updated in the same transaction as
-- each platform-owner-authorized commercial update.
