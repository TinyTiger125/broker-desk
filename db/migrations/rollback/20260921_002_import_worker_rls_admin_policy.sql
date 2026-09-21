BEGIN;

DROP POLICY IF EXISTS brokerdesk_import_worker_claim_select ON public.import_jobs;
DROP POLICY IF EXISTS brokerdesk_import_worker_claim_update ON public.import_jobs;

COMMIT;
