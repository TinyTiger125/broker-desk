-- Allow the trusted runtime to invoke the zero-argument identity helper used
-- by existing SECURITY DEFINER tenant/session functions.
-- The helper reads the transaction-local Clerk subject; it accepts no subject
-- argument and this migration does not grant any setting or write authority.

REVOKE ALL PRIVILEGES ON FUNCTION brokerdesk_private.current_external_auth_subject() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON FUNCTION brokerdesk_private.current_external_auth_subject() FROM authenticated;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION brokerdesk_private.current_external_auth_subject() TO brokerdesk_runtime;
