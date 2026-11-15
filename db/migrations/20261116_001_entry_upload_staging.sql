-- Ephemeral tenant-scoped staging for large normal-entry uploads.
-- The browser sends 1 MiB binary requests; final save still archives through
-- the existing postgres-private attachment path. Tenant deletion cascades.
BEGIN;

CREATE TABLE IF NOT EXISTS public.entry_upload_staging (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 26214400),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  chunk_size_bytes INTEGER NOT NULL CHECK (chunk_size_bytes = 1048576),
  chunk_count INTEGER NOT NULL CHECK (chunk_count > 0),
  status TEXT NOT NULL CHECK (status IN ('open', 'ready', 'consumed')),
  consumed_request_key TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.entry_upload_staging_chunks (
  staging_id TEXT NOT NULL REFERENCES public.entry_upload_staging(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  content BYTEA NOT NULL CHECK (octet_length(content) > 0 AND octet_length(content) <= 1048576),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 1048576),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (staging_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_entry_upload_staging_expiry
  ON public.entry_upload_staging (tenant_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_entry_upload_staging_chunks_tenant
  ON public.entry_upload_staging_chunks (tenant_id, staging_id, chunk_index);

ALTER TABLE public.entry_upload_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_upload_staging FORCE ROW LEVEL SECURITY;
ALTER TABLE public.entry_upload_staging_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_upload_staging_chunks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entry_upload_staging_tenant_access ON public.entry_upload_staging;
CREATE POLICY entry_upload_staging_tenant_access ON public.entry_upload_staging
  USING (brokerdesk_private.can_access_tenant(tenant_id) AND user_id = brokerdesk_private.current_user_id())
  WITH CHECK (brokerdesk_private.can_access_tenant(tenant_id) AND user_id = brokerdesk_private.current_user_id());

CREATE POLICY entry_upload_staging_worker_read ON public.entry_upload_staging
  FOR SELECT TO brokerdesk_admin USING (current_user = 'brokerdesk_admin');
CREATE POLICY entry_upload_staging_worker_delete ON public.entry_upload_staging
  FOR DELETE TO brokerdesk_admin USING (current_user = 'brokerdesk_admin');

DROP POLICY IF EXISTS entry_upload_staging_chunks_tenant_access ON public.entry_upload_staging_chunks;
CREATE POLICY entry_upload_staging_chunks_tenant_access ON public.entry_upload_staging_chunks
  USING (
    brokerdesk_private.can_access_tenant(tenant_id)
    AND EXISTS (SELECT 1 FROM public.entry_upload_staging parent
                 WHERE parent.id = staging_id AND parent.tenant_id = tenant_id
                   AND parent.user_id = brokerdesk_private.current_user_id())
  )
  WITH CHECK (
    brokerdesk_private.can_access_tenant(tenant_id)
    AND EXISTS (SELECT 1 FROM public.entry_upload_staging parent
                 WHERE parent.id = staging_id AND parent.tenant_id = tenant_id
                   AND parent.user_id = brokerdesk_private.current_user_id())
  );

CREATE POLICY entry_upload_staging_chunks_worker_read ON public.entry_upload_staging_chunks
  FOR SELECT TO brokerdesk_admin USING (current_user = 'brokerdesk_admin');

-- Executable, bounded TTL cleanup. Authenticated callers can only clean their
-- own rows in the selected tenant; tenant deletion also cascades all rows.
CREATE OR REPLACE FUNCTION brokerdesk_private.cleanup_expired_entry_upload_staging(
  p_tenant_id TEXT, p_user_id TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 100
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
SET row_security = on
AS $$
DECLARE
  actor_id TEXT := brokerdesk_private.current_user_id();
  deleted_count INTEGER := 0;
BEGIN
  IF actor_id IS NULL
     OR brokerdesk_private.can_access_tenant(p_tenant_id) IS DISTINCT FROM TRUE
     OR (p_user_id IS NOT NULL AND p_user_id <> actor_id) THEN RETURN 0; END IF;
  WITH doomed AS (
    SELECT id FROM public.entry_upload_staging
     WHERE tenant_id = p_tenant_id AND user_id = actor_id AND expires_at <= NOW()
     ORDER BY expires_at LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
     FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.entry_upload_staging staging USING doomed
   WHERE staging.id = doomed.id AND staging.tenant_id = p_tenant_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

ALTER FUNCTION brokerdesk_private.cleanup_expired_entry_upload_staging(TEXT, TEXT, INTEGER) OWNER TO brokerdesk_admin;
REVOKE ALL ON FUNCTION brokerdesk_private.cleanup_expired_entry_upload_staging(TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON TABLE public.entry_upload_staging, public.entry_upload_staging_chunks FROM brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.entry_upload_staging, public.entry_upload_staging_chunks TO brokerdesk_runtime;
GRANT EXECUTE ON FUNCTION brokerdesk_private.cleanup_expired_entry_upload_staging(TEXT, TEXT, INTEGER) TO brokerdesk_runtime;

-- The existing CRON_SECRET/BROKER_DESK_IMPORT_WORKER_TOKEN path calls this
-- bounded system hook on every worker tick. The admin role is NOSUPERUSER and
-- NOBYPASSRLS; its explicit RLS policy is the only cross-tenant visibility.
CREATE OR REPLACE FUNCTION brokerdesk_private.cleanup_expired_entry_upload_staging_system(p_limit INTEGER DEFAULT 500)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
SET row_security = on
AS $$
DECLARE deleted_count INTEGER := 0;
BEGIN
  WITH doomed AS (
    SELECT id FROM public.entry_upload_staging
     WHERE expires_at <= NOW()
     ORDER BY expires_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 5000))
     FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.entry_upload_staging staging USING doomed
   WHERE staging.id = doomed.id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
ALTER FUNCTION brokerdesk_private.cleanup_expired_entry_upload_staging_system(INTEGER) OWNER TO brokerdesk_admin;
REVOKE ALL ON FUNCTION brokerdesk_private.cleanup_expired_entry_upload_staging_system(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION brokerdesk_private.cleanup_expired_entry_upload_staging_system(INTEGER) TO brokerdesk_admin;

COMMIT;
