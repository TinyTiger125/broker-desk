-- Remove an accidental PUBLIC EXECUTE grant from the cross-tenant staging
-- cleanup helper.  The helper is a SECURITY DEFINER function and must remain
-- callable only by the reviewed admin worker path.
BEGIN;

DO $$
DECLARE
  function_oid OID;
  actual_owner TEXT;
  security_definer BOOLEAN;
  function_config TEXT[];
BEGIN
  SELECT p.oid, pg_get_userbyid(p.proowner), p.prosecdef, COALESCE(p.proconfig, ARRAY[]::TEXT[])
    INTO function_oid, actual_owner, security_definer, function_config
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'brokerdesk_private.cleanup_expired_entry_upload_staging_system(integer)'::regprocedure;

  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'entry staging cleanup ACL repair requires the existing helper';
  END IF;
  IF actual_owner <> 'brokerdesk_admin' THEN
    RAISE EXCEPTION 'entry staging cleanup ACL repair requires brokerdesk_admin ownership (found %)', actual_owner
      USING ERRCODE = '42501';
  END IF;
  IF NOT security_definer OR NOT (function_config @> ARRAY[
    'search_path=pg_catalog, public, pg_temp',
    'row_security=on'
  ]::TEXT[]) THEN
    RAISE EXCEPTION 'entry staging cleanup ACL repair requires the reviewed SECURITY DEFINER configuration'
      USING ERRCODE = '42501';
  END IF;
END
$$;

REVOKE ALL PRIVILEGES
  ON FUNCTION brokerdesk_private.cleanup_expired_entry_upload_staging_system(INTEGER)
  FROM PUBLIC;
GRANT EXECUTE
  ON FUNCTION brokerdesk_private.cleanup_expired_entry_upload_staging_system(INTEGER)
  TO brokerdesk_admin;

DO $$
DECLARE
  function_oid OID;
BEGIN
  SELECT p.oid
    INTO function_oid
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'brokerdesk_private.cleanup_expired_entry_upload_staging_system(integer)'::regprocedure;

  IF EXISTS (
    SELECT 1
    FROM aclexplode((SELECT COALESCE(p.proacl, acldefault('f', p.proowner)) FROM pg_catalog.pg_proc AS p WHERE p.oid = function_oid)) AS acl
    WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
  )
  OR has_function_privilege('brokerdesk_runtime', function_oid, 'EXECUTE')
  OR has_function_privilege('authenticated', function_oid, 'EXECUTE')
  OR has_function_privilege('anon', function_oid, 'EXECUTE')
  OR NOT has_function_privilege('brokerdesk_admin', function_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'entry staging cleanup ACL repair did not leave an admin-only execution ACL'
      USING ERRCODE = '42501';
  END IF;
END
$$;

COMMIT;
