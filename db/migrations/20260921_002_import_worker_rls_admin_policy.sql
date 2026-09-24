-- Allow the server-only import worker to claim jobs across tenant sessions.
-- The worker remains a constrained NOSUPERUSER/NOBYPASSRLS role; this is an
-- explicit role-scoped RLS policy on import_jobs, not a table-owner bypass.
BEGIN;

DROP POLICY IF EXISTS brokerdesk_import_worker_claim_select ON public.import_jobs;
CREATE POLICY brokerdesk_import_worker_claim_select
ON public.import_jobs
FOR SELECT
TO brokerdesk_admin
USING (current_user = 'brokerdesk_admin');

DROP POLICY IF EXISTS brokerdesk_import_worker_claim_update ON public.import_jobs;
CREATE POLICY brokerdesk_import_worker_claim_update
ON public.import_jobs
FOR UPDATE
TO brokerdesk_admin
USING (current_user = 'brokerdesk_admin')
WITH CHECK (current_user = 'brokerdesk_admin');

COMMIT;
