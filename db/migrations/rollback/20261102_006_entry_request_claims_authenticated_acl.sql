-- Rollback for 20261102_006_entry_request_claims_authenticated_acl.sql. UNEXECUTED.
-- Apply only after explicit approval and a migration-ledger review. This
-- restores the exact historical 001 grant; the forward migration deliberately
-- keeps that broad role closed.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.entry_request_claims TO authenticated;
  END IF;
END $$;

COMMIT;
