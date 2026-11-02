-- Rollback for 20261102_005_entry_request_claims_runtime_acl.sql. UNEXECUTED.
-- Apply only after explicit approval and a migration-ledger review.  The
-- preceding 20261102_001 migration already established the same narrow ACL;
-- this rollback restores that canonical state rather than removing runtime
-- access required by the still-present entry_request_claims table.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    REVOKE ALL PRIVILEGES ON TABLE public.entry_request_claims FROM brokerdesk_runtime;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.entry_request_claims TO brokerdesk_runtime;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_admin') THEN
    REVOKE ALL PRIVILEGES ON TABLE public.entry_request_claims FROM brokerdesk_admin;
    GRANT SELECT, DELETE ON TABLE public.entry_request_claims TO brokerdesk_admin;
  END IF;
END $$;

COMMIT;
