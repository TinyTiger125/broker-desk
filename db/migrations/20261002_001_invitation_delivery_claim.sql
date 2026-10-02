-- Invitation delivery claim and unknown-outcome recovery.
-- UNEXECUTED: apply only in an approved isolated non-Production database.
-- This migration does not call Clerk, send email, change RLS, or widen runtime ACLs.
-- provider_accepted means Clerk accepted the create request; it is not an inbox-delivery receipt.

ALTER TABLE public.tenant_memberships
  ADD COLUMN IF NOT EXISTS invitation_delivery_state TEXT;

UPDATE public.tenant_memberships
SET invitation_delivery_state = CASE
  WHEN status = 'invited'
       AND invitation_error LIKE 'invitation_delivery_outcome_unknown:%' THEN 'unknown'
  WHEN status = 'invited'
       AND invitation_provider IN ('clerk', 'supabase')
       AND provider_invitation_id IS NOT NULL THEN 'provider_accepted'
  ELSE 'ready'
END
WHERE invitation_delivery_state IS NULL;

ALTER TABLE public.tenant_memberships
  ALTER COLUMN invitation_delivery_state SET DEFAULT 'ready',
  ALTER COLUMN invitation_delivery_state SET NOT NULL;

ALTER TABLE public.tenant_memberships
  DROP CONSTRAINT IF EXISTS tenant_memberships_invitation_delivery_state_check;

ALTER TABLE public.tenant_memberships
  ADD CONSTRAINT tenant_memberships_invitation_delivery_state_check
  CHECK (invitation_delivery_state IN ('ready', 'sending', 'unknown', 'provider_accepted'));

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

  -- The row lock and this claim are the cross-request boundary. A second
  -- action sees sending/unknown and returns the current context without
  -- rotating the token or allowing another provider call.
  IF target_membership_row.invitation_delivery_state IN ('sending', 'unknown') THEN
    RETURN QUERY SELECT to_jsonb(tenant_row),
      jsonb_build_object('membership', to_jsonb(target_membership_row), 'user', to_jsonb(invited_user_row))
        || jsonb_build_object('delivery_blocked', target_membership_row.invitation_delivery_state);
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
      invitation_delivery_state = 'sending',
      invitation_token = md5(clock_timestamp()::TEXT || random()::TEXT),
      invitation_expires_at = NOW() + INTERVAL '7 days',
      invited_email = lower(trim(invited_user_row.email)),
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
    jsonb_build_object('membership', to_jsonb(updated_membership), 'user', to_jsonb(invited_user_row))
      || jsonb_build_object('delivery_blocked', NULL::TEXT);
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
  target_delivery_state TEXT;
  authorized_actor_membership_id TEXT;
  next_invitation_expires_at TIMESTAMPTZ;
  current_occupies_seat BOOLEAN;
  next_occupies_seat BOOLEAN;
  next_delivery_state TEXT;
  duplicate_delivery_finalization BOOLEAN := FALSE;
  delivery_update_row_count INTEGER;
  delivery_audit_action TEXT;
  delivery_audit_row_count INTEGER;
BEGIN
  IF current_actor_id IS NULL OR current_actor_id <> NULLIF(trim(COALESCE(p_actor_user_id, '')), '') THEN
    RAISE EXCEPTION 'invitation actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;
  IF p_provider NOT IN ('none', 'manual', 'clerk', 'supabase') OR p_invitation_status NOT IN ('pending', 'failed', 'not_sent', 'revoked', 'expired') THEN
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
         target_membership.invitation_provider, target_membership.provider_invitation_id,
         target_membership.invitation_error, target_membership.invitation_delivery_state
  INTO target_status, target_invitation_status, target_invitation_expires_at,
       target_invitation_provider, target_provider_invitation_id,
       target_invitation_error, target_delivery_state
  FROM public.tenant_memberships AS target_membership
  WHERE target_membership.id = p_membership_id
    AND target_membership.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR target_status <> 'invited' OR ((p_provider = 'clerk' OR p_provider = 'supabase') AND target_invitation_status IN ('revoked', 'expired')) THEN
    RETURN;
  END IF;

  next_delivery_state := CASE
    WHEN p_invitation_error LIKE 'invitation_delivery_outcome_unknown:%' THEN 'unknown'
    WHEN p_invitation_status = 'pending' AND p_provider_invitation_id IS NOT NULL THEN 'provider_accepted'
    ELSE 'ready'
  END;

  duplicate_delivery_finalization := (p_provider = 'clerk' OR p_provider = 'supabase') AND (
    (p_invitation_status = 'pending'
     AND p_provider_invitation_id IS NOT NULL
     AND target_invitation_provider = p_provider
     AND target_invitation_status = 'pending'
     AND target_provider_invitation_id = p_provider_invitation_id
     AND target_delivery_state = 'provider_accepted')
    OR
    (p_invitation_status = 'failed'
     AND target_invitation_provider = p_provider
     AND target_invitation_status = 'failed'
     AND target_invitation_error IS NOT DISTINCT FROM p_invitation_error
     AND target_delivery_state = 'ready')
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
      invitation_delivery_state = next_delivery_state,
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
    WHEN next_delivery_state = 'provider_accepted' AND (p_provider = 'clerk' OR p_provider = 'supabase') AND p_invitation_status = 'pending' THEN 'member_invitation_sent'
    WHEN next_delivery_state = 'ready' AND (p_provider = 'clerk' OR p_provider = 'supabase') AND p_invitation_status = 'failed' THEN 'member_invitation_failed'
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
        WHEN delivery_audit_action = 'member_invitation_sent' THEN 'Clerk 已受理邀请创建请求；收件箱到达未确认。'
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

REVOKE ALL ON FUNCTION brokerdesk_private.prepare_tenant_invitation_delivery(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION brokerdesk_private.record_tenant_invitation_delivery(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.prepare_tenant_invitation_delivery(TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.record_tenant_invitation_delivery(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO brokerdesk_runtime;
  END IF;
END $$;
