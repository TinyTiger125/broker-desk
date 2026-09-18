-- Diagnostic-only worker claim for one explicitly named job. The worker token
-- remains the route boundary; this function prevents a diagnostic run from
-- consuming unrelated queued jobs.
CREATE OR REPLACE FUNCTION brokerdesk_private.claim_import_job_by_id(p_job_id text)
RETURNS TABLE (job_id text, tenant_id text, user_id text, external_auth_subject text, source_type text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  requested_job_id text := NULLIF(trim(COALESCE(p_job_id, '')), '');
  tokyo_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
BEGIN
  IF requested_job_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT jobs.id
    FROM public.import_jobs AS jobs
    INNER JOIN public.users AS users ON users.id = jobs.user_id
    INNER JOIN public.tenants AS tenants ON tenants.id = jobs.tenant_id
    WHERE jobs.id = requested_job_id
      AND jobs.status = 'queued'
      AND jobs.source_type IN ('excel', 'scan')
      AND users.external_auth_subject IS NOT NULL
      AND tenants.status NOT IN ('suspended', 'cancelled')
      AND NOT (
        tenants.service_start_at IS NULL
        AND tenants.service_end_at IS NULL
        AND tenants.status = 'pending_activation'
      )
      AND (tenants.service_start_at IS NULL OR tenants.service_start_at <= tokyo_today)
      AND (tenants.service_end_at IS NULL OR tenants.service_end_at >= tokyo_today)
    FOR UPDATE OF jobs SKIP LOCKED
  ), claimed AS (
    UPDATE public.import_jobs AS jobs
    SET status = 'processing', processing_started_at = NOW(),
        attempt_count = jobs.attempt_count + 1, error_code = NULL,
        error_summary = NULL, updated_at = NOW()
    FROM candidate
    WHERE jobs.id = candidate.id
    RETURNING jobs.id, jobs.tenant_id, jobs.user_id, jobs.source_type
  )
  SELECT claimed.id, claimed.tenant_id, claimed.user_id, users.external_auth_subject, claimed.source_type
  FROM claimed
  INNER JOIN public.users AS users ON users.id = claimed.user_id;
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.claim_import_job_by_id(text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_admin') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.claim_import_job_by_id(text) TO brokerdesk_admin;
  END IF;
END $$;
COMMENT ON FUNCTION brokerdesk_private.claim_import_job_by_id(text) IS
  'Claims one explicitly named queued import job for an authenticated diagnostic worker.';
