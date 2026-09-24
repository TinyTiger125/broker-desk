-- The admin-owned exact-job worker joins postgres-owned identity tables.
-- Keep row visibility limited to the server-only role and columns to the claim contract.
BEGIN;
GRANT SELECT (id, external_auth_subject) ON public.users TO brokerdesk_admin;
GRANT SELECT (id, status, service_start_at, service_end_at) ON public.tenants TO brokerdesk_admin;
-- Existing users SELECT policy is still initialized alongside the admin policy.
GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_user(TEXT) TO brokerdesk_admin;
CREATE POLICY brokerdesk_admin_worker_users_read ON public.users
  FOR SELECT TO brokerdesk_admin USING (current_user = 'brokerdesk_admin');
CREATE POLICY brokerdesk_admin_worker_tenants_read ON public.tenants
  FOR SELECT TO brokerdesk_admin USING (current_user = 'brokerdesk_admin');
COMMIT;
