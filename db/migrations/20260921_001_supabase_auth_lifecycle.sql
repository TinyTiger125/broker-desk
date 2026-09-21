-- Supabase invitation delivery and lifecycle support. UNEXECUTED.
-- Apply only after product approval in the non-Production database.
-- Rollback: restore the prior function body from 20260828_001_tenant_service_period.sql
-- (providers none/manual/clerk only), then remove this migration from the ledger.

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
         target_membership.invitation_provider, target_membership.provider_invitation_id, target_membership.invitation_error
  INTO target_status, target_invitation_status, target_invitation_expires_at,
       target_invitation_provider, target_provider_invitation_id, target_invitation_error
  FROM public.tenant_memberships AS target_membership
  WHERE target_membership.id = p_membership_id
    AND target_membership.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR target_status <> 'invited' OR ((p_provider = 'clerk' OR p_provider = 'supabase') AND target_invitation_status IN ('revoked', 'expired')) THEN
    RETURN;
  END IF;

  duplicate_delivery_finalization := (p_provider = 'clerk' OR p_provider = 'supabase') AND (
    (p_invitation_status = 'pending'
     AND p_provider_invitation_id IS NOT NULL
     AND target_invitation_provider = p_provider
     AND target_invitation_status = 'pending'
     AND target_provider_invitation_id = p_provider_invitation_id)
    OR
    (p_invitation_status = 'failed'
     AND target_invitation_provider = p_provider
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
    WHEN (p_provider = 'clerk' OR p_provider = 'supabase') AND p_invitation_status = 'pending' THEN 'member_invitation_sent'
    WHEN (p_provider = 'clerk' OR p_provider = 'supabase') AND p_invitation_status = 'failed' THEN 'member_invitation_failed'
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


REVOKE ALL ON FUNCTION brokerdesk_private.record_tenant_invitation_delivery(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.record_tenant_invitation_delivery(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO brokerdesk_runtime;
  END IF;
END $$;
