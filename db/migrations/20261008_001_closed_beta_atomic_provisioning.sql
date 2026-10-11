-- Closed-beta provisioning only. UNEXECUTED in this checkout.
--
-- The runtime role cannot perform a global users-table email lookup because
-- users RLS intentionally exposes only the current tenant. This SECURITY
-- DEFINER wrapper runs the duplicate check with the same protected owner as
-- the existing platform-account RPC, while preserving its actor guard and
-- tenant creation behavior.

CREATE OR REPLACE FUNCTION brokerdesk_private.create_closed_beta_tenant_account(
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
  normalized_owner_email TEXT := lower(trim(COALESCE(p_owner_email, '')));
  created_tenant_record JSONB;
  created_active_count INTEGER;
  created_invited_count INTEGER;
  created_suspended_count INTEGER;
  created_owner_members JSONB;
  created_tenant_id TEXT;
BEGIN
  -- The duplicate result must never be observable before the existing
  -- platform-owner authorization boundary has run. This function is exposed
  -- to the restricted runtime role only through this guard and the later
  -- create_platform_tenant_account guard.
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

  IF normalized_owner_email = '' THEN
    RAISE EXCEPTION 'tenant name and owner email are required' USING ERRCODE = '22023';
  END IF;

  -- The lock is transaction-scoped and keyed by the normalized email. Hash
  -- collisions only serialize unrelated emails; they cannot admit duplicates.
  PERFORM pg_advisory_xact_lock(hashtext(normalized_owner_email));

  IF EXISTS (
    SELECT 1
    FROM public.users AS existing_users
    WHERE lower(trim(existing_users.email)) = normalized_owner_email
  ) THEN
    RAISE EXCEPTION 'closed_beta_owner_email_in_use' USING ERRCODE = '23505';
  END IF;

  -- Keep the existing platform actor guard, tenant slug lock, owner creation,
  -- membership creation, and audit shape in one outer transaction. Capture the
  -- legacy return row so the trusted flow marker can be written to the same
  -- tenant_account_created audit row before the transaction commits.
  SELECT created.tenant_record, created.active_seat_count,
         created.invited_seat_count, created.suspended_seat_count,
         created.owner_members
  INTO created_tenant_record, created_active_count, created_invited_count,
       created_suspended_count, created_owner_members
  FROM brokerdesk_private.create_platform_tenant_account(
    p_actor_user_id,
    p_name,
    p_slug,
    p_account_type,
    p_status,
    p_purchased_seat_count,
    p_service_start_at,
    p_service_end_at,
    p_owner_name,
    normalized_owner_email
  ) AS created;

  IF created_tenant_record IS NULL THEN
    RETURN;
  END IF;
  created_tenant_id := created_tenant_record->>'id';

  UPDATE public.audit_logs
  SET context_json = COALESCE(context_json, '{}'::JSONB)
    || jsonb_build_object('flow', 'closed_beta')
  WHERE tenant_id = created_tenant_id
    AND target_id = created_tenant_id
    AND actor_id = current_actor_id
    AND action = 'tenant_account_created'
    AND target_type = 'tenant';

  RETURN QUERY SELECT created_tenant_record, created_active_count,
                      created_invited_count, created_suspended_count,
                      created_owner_members;
END;
$$;

-- Match the existing protected platform-account functions' approved definer
-- boundary explicitly. A real PG17 staging check must still verify that this
-- owner, the shared-auth-table RLS posture, and the runtime grant are present
-- after migration execution.
ALTER FUNCTION brokerdesk_private.create_closed_beta_tenant_account(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, DATE, DATE, TEXT, TEXT)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION brokerdesk_private.create_closed_beta_tenant_account(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, DATE, DATE, TEXT, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.create_closed_beta_tenant_account(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, DATE, DATE, TEXT, TEXT) TO brokerdesk_runtime;
  END IF;
END $$;
