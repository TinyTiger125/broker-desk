BEGIN;

-- 20261102_001 predates the dedicated runtime/admin role matrix and granted
-- the broad Supabase-style authenticated role access to claims. Broker Desk
-- uses brokerdesk_runtime for application requests; authenticated has no
-- entry-claim lifecycle requirement and must not be able to mutate claims.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON TABLE public.entry_request_claims FROM authenticated;
  END IF;
END $$;

COMMIT;
