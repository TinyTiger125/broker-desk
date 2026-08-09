-- Low-volume public-beta attachment storage.
-- This is intentionally capped at 10 MB per object. It keeps small private
-- attachments tenant-scoped until a dedicated private object-storage adapter
-- is configured for the production scale phase.

CREATE TABLE IF NOT EXISTS private_attachment_blobs (
  attachment_id TEXT PRIMARY KEY REFERENCES attachments(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  content BYTEA NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (octet_length(content) <= 10485760)
);

CREATE INDEX IF NOT EXISTS idx_private_attachment_blobs_tenant
  ON private_attachment_blobs (tenant_id, created_at DESC);

ALTER TABLE private_attachment_blobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_attachment_blobs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS private_attachment_blobs_tenant_access ON private_attachment_blobs;
CREATE POLICY private_attachment_blobs_tenant_access ON private_attachment_blobs
  USING (brokerdesk_private.can_access_tenant(tenant_id))
  WITH CHECK (brokerdesk_private.can_access_tenant(tenant_id));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT SELECT, INSERT, DELETE ON private_attachment_blobs TO brokerdesk_runtime;
  END IF;
END
$$;
