-- The object-document intake path runs through the restricted application role.
-- Keep FORCE RLS as the authorization boundary while granting the DML that the
-- queue, worker and review actions actually require.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON public.object_import_targets, public.object_import_fields TO brokerdesk_runtime;
  END IF;
END $$;
COMMIT;
