-- Import jobs are claimed by a dedicated worker, never by a browser request.
CREATE OR REPLACE FUNCTION brokerdesk_private.claim_next_import_jobs(p_limit integer DEFAULT 3)
RETURNS TABLE (job_id text, tenant_id text, user_id text, external_auth_subject text, source_type text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_limit integer := LEAST(GREATEST(COALESCE(p_limit, 3), 1), 5);
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT jobs.id
    FROM public.import_jobs AS jobs
    INNER JOIN public.users AS users ON users.id = jobs.user_id
    WHERE jobs.status = 'queued'
      AND jobs.source_type IN ('excel', 'scan')
      AND users.external_auth_subject IS NOT NULL
    ORDER BY jobs.created_at ASC, jobs.id ASC
    FOR UPDATE OF jobs SKIP LOCKED
    LIMIT normalized_limit
  ), claimed AS (
    UPDATE public.import_jobs AS jobs
    SET status = 'processing', processing_started_at = NOW(),
        attempt_count = jobs.attempt_count + 1, error_code = NULL,
        error_summary = NULL, updated_at = NOW()
    FROM candidates
    WHERE jobs.id = candidates.id
    RETURNING jobs.id, jobs.tenant_id, jobs.user_id, jobs.source_type
  )
  SELECT claimed.id, claimed.tenant_id, claimed.user_id, users.external_auth_subject, claimed.source_type
  FROM claimed INNER JOIN public.users AS users ON users.id = claimed.user_id;
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.claim_next_import_jobs(integer) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_admin') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.claim_next_import_jobs(integer) TO brokerdesk_admin;
  END IF;
END $$;
COMMENT ON FUNCTION brokerdesk_private.claim_next_import_jobs(integer) IS
  'Claims a bounded batch of queued import jobs for the authenticated Broker Desk worker.';
