-- W93 attachment authorization reads only a scoped import target's parent id.
-- Existing FORCE RLS and policies remain authoritative; no DML or admin ACL change.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime')
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('public.object_import_targets')
                    AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION 'runtime object import lookup requires existing role and FORCE RLS table';
  END IF;
END
$$;
GRANT SELECT (tenant_id, user_id, import_job_id, case_id)
  ON public.object_import_targets TO brokerdesk_runtime;
COMMIT;
