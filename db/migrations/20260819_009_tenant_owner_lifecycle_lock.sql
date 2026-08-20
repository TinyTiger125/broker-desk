-- TASK-039 Slice 1: serialize owner role/status changes per tenant.
-- Migration 007 remains immutable; this replacement closes the race where
-- two concurrent requests could both observe the same last owner.

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
  target_role TEXT;
  target_status TEXT;
  active_owner_count INTEGER;
BEGIN
  IF current_user_id IS NULL OR current_user_id <> NULLIF(trim(COALESCE(p_actor_user_id, '')), '') THEN
    RAISE EXCEPTION 'member capability actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(p_tenant_id, ''), 0));
  IF p_capability NOT IN ('company_owner', 'company_form_admin', 'ordinary_member') THEN
    RAISE EXCEPTION 'invalid company capability preset' USING ERRCODE = '22023';
  END IF;
  IF (p_capability = 'company_owner' AND p_role <> 'tenant_owner')
     OR (p_capability = 'company_form_admin' AND p_role <> 'manager')
     OR (p_capability = 'ordinary_member' AND p_role <> 'broker') THEN
    RAISE EXCEPTION 'company capability and legacy role do not match' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships AS actor_membership
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
  WHERE memberships.id = p_membership_id AND memberships.tenant_id = p_tenant_id
  FOR UPDATE;
  IF target_role IS NULL THEN RETURN; END IF;

  SELECT COUNT(*)::INTEGER INTO active_owner_count
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
  SET role = p_role, capability = p_capability, updated_at = NOW()
  WHERE memberships.id = p_membership_id AND memberships.tenant_id = p_tenant_id;

  RETURN QUERY SELECT memberships.*
  FROM public.tenant_memberships AS memberships
  WHERE memberships.id = p_membership_id AND memberships.tenant_id = p_tenant_id;
END;
$$;

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
  target_role TEXT;
  target_status TEXT;
  active_owner_count INTEGER;
BEGIN
  IF current_user_id IS NULL OR current_user_id <> NULLIF(trim(COALESCE(p_actor_user_id, '')), '') THEN
    RAISE EXCEPTION 'member status actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(p_tenant_id, ''), 0));
  IF p_status NOT IN ('active', 'suspended', 'removed') THEN
    RAISE EXCEPTION 'invalid member status' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships AS actor_membership
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
  WHERE memberships.id = p_membership_id AND memberships.tenant_id = p_tenant_id
  FOR UPDATE;
  IF target_role IS NULL THEN RETURN; END IF;
  IF target_status = 'invited' AND p_status = 'active' THEN
    RAISE EXCEPTION 'invited membership requires explicit token acceptance' USING ERRCODE = '42501';
  END IF;
  IF target_status = 'removed' AND p_status = 'active' THEN
    RAISE EXCEPTION 'removed membership requires a new invitation' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)::INTEGER INTO active_owner_count
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
  SET status = p_status, updated_at = NOW()
  WHERE memberships.id = p_membership_id AND memberships.tenant_id = p_tenant_id;

  RETURN QUERY SELECT memberships.*
  FROM public.tenant_memberships AS memberships
  WHERE memberships.id = p_membership_id AND memberships.tenant_id = p_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.update_tenant_member_capability(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION brokerdesk_private.update_tenant_member_status(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.update_tenant_member_capability(TEXT, TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.update_tenant_member_status(TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime;
  END IF;
END $$;
