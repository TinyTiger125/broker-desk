BEGIN;

CREATE TABLE IF NOT EXISTS attachment_links (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('case', 'party', 'property')),
  target_id TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN (
    'identity', 'address', 'income_employment', 'property_registry', 'floor_plan',
    'photo', 'contract', 'application', 'correspondence', 'output', 'other'
  )),
  source_import_job_id TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, attachment_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_attachment_links_target
  ON attachment_links (tenant_id, target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attachment_links_attachment
  ON attachment_links (tenant_id, attachment_id);

ALTER TABLE attachment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachment_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brokerdesk_tenant_isolation ON attachment_links;
CREATE POLICY brokerdesk_tenant_isolation ON attachment_links
  FOR ALL
  USING (brokerdesk_private.can_access_tenant(tenant_id))
  WITH CHECK (brokerdesk_private.can_access_tenant(tenant_id));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON attachment_links TO authenticated;
  END IF;
END $$;

COMMIT;
