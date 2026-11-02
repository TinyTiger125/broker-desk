BEGIN;

-- entry_request_claims is created by the 20261102 claim migrations. Keep its
-- runtime ACL in a later migration so fresh installs and already-applied
-- 20260902 baseline ledgers share the same immutable checksum.
REVOKE ALL PRIVILEGES ON TABLE public.entry_request_claims FROM brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.entry_request_claims TO brokerdesk_runtime;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_admin') THEN
    GRANT SELECT, DELETE ON TABLE public.entry_request_claims TO brokerdesk_admin;
  END IF;
END $$;

COMMIT;
