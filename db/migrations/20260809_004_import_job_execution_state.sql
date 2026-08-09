-- Durable execution metadata for file imports. The application may still run
-- synchronous development extraction, but production can now distinguish a
-- queued, active, completed or failed job without treating a failed request as
-- a successful import.
ALTER TABLE import_jobs
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS error_summary TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE import_jobs
  DROP CONSTRAINT IF EXISTS import_jobs_status_check;

ALTER TABLE import_jobs
  ADD CONSTRAINT import_jobs_status_check
  CHECK (status IN ('queued', 'processing', 'mapped', 'completed', 'failed'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_import_jobs_tenant_idempotency_key
  ON import_jobs(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_import_jobs_tenant_execution_queue
  ON import_jobs(tenant_id, status, created_at ASC)
  WHERE status IN ('queued', 'processing', 'failed');
