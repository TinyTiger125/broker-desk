BEGIN;

-- The original helper belongs to brokerdesk_admin, which cannot lock rows in
-- postgres-owned tenant_memberships. Keep that table closed to the admin role.
-- This narrowly scoped replacement is created by postgres (the table owner)
-- and remains callable only from the private schema by brokerdesk_runtime.
CREATE FUNCTION brokerdesk_private.lock_case_review_membership_v2(
  p_membership_id TEXT, p_tenant_id TEXT, p_actor_user_id TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF brokerdesk_private.current_user_id() IS DISTINCT FROM p_actor_user_id
     OR p_actor_user_id IS NULL
     OR NOT brokerdesk_private.can_access_tenant(p_tenant_id) THEN
    RETURN FALSE;
  END IF;
  PERFORM 1 FROM public.tenant_memberships m
    WHERE m.id = p_membership_id AND m.tenant_id = p_tenant_id
      AND m.user_id = p_actor_user_id AND m.status = 'active'
    FOR SHARE OF m;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.lock_case_review_membership_v2(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION brokerdesk_private.lock_case_review_membership_v2(TEXT, TEXT, TEXT) TO brokerdesk_runtime;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'brokerdesk_private.lock_case_review_membership_v2(text,text,text)'::regprocedure
      AND p.prosecdef
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND has_function_privilege('brokerdesk_runtime', p.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      )
  ) THEN
    RAISE EXCEPTION 'case_review_membership_v2_acl_invalid';
  END IF;

  IF has_table_privilege('brokerdesk_admin', 'public.tenant_memberships', 'SELECT')
     OR has_table_privilege('brokerdesk_admin', 'public.tenant_memberships', 'UPDATE') THEN
    RAISE EXCEPTION 'admin_membership_table_privilege_widened';
  END IF;
END;
$$;

COMMIT;
