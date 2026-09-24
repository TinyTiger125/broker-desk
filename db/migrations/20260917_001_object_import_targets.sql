BEGIN;

CREATE TABLE IF NOT EXISTS object_import_targets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  case_id TEXT NOT NULL REFERENCES brokerage_cases(id) ON DELETE CASCADE,
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('party', 'property')),
  target_id TEXT NOT NULL,
  target_version TEXT NOT NULL,
  source_attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'needs_review', 'completed', 'failed', 'conflict')),
  idempotency_key TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  error_code TEXT,
  error_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_object_import_targets_case
  ON object_import_targets (tenant_id, user_id, case_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_object_import_targets_job
  ON object_import_targets (tenant_id, user_id, import_job_id);

CREATE TABLE IF NOT EXISTS object_import_fields (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  object_import_target_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  model_value TEXT,
  model_confidence NUMERIC,
  model_source JSONB NOT NULL DEFAULT '{}'::JSONB,
  final_value TEXT,
  final_source TEXT CHECK (final_source IN ('model_draft', 'human')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'confirmed', 'rejected', 'low_confidence', 'conflict', 'failed')),
  confirmed_by_user_id TEXT REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  FOREIGN KEY (tenant_id, object_import_target_id) REFERENCES object_import_targets(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (object_import_target_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_object_import_fields_target
  ON object_import_fields (tenant_id, object_import_target_id, field_key);

CREATE FUNCTION brokerdesk_private.guard_object_import_target()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  target_tenant TEXT;
  attachment_job TEXT;
BEGIN
  SELECT tenant_id INTO target_tenant FROM brokerage_cases
    WHERE id = NEW.case_id;
  IF target_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Object import case tenant mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.target_type = 'party' THEN
    SELECT tenant_id INTO target_tenant FROM clients WHERE id = NEW.target_id;
  ELSE
    SELECT tenant_id INTO target_tenant FROM properties WHERE id = NEW.target_id;
  END IF;
  IF target_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Object import target tenant mismatch' USING ERRCODE = '23514';
  END IF;
  SELECT target_id INTO attachment_job FROM attachments
    WHERE id = NEW.source_attachment_id AND tenant_id = NEW.tenant_id
      AND target_type = 'import_job';
  IF attachment_job IS DISTINCT FROM NEW.import_job_id THEN
    RAISE EXCEPTION 'Object import attachment must belong to import job' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS object_import_target_guard ON object_import_targets;
CREATE TRIGGER object_import_target_guard
  BEFORE INSERT OR UPDATE ON object_import_targets
  FOR EACH ROW EXECUTE FUNCTION brokerdesk_private.guard_object_import_target();

ALTER TABLE object_import_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_import_targets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brokerdesk_tenant_isolation ON object_import_targets;
DROP POLICY IF EXISTS brokerdesk_object_import_target_select ON object_import_targets;
DROP POLICY IF EXISTS brokerdesk_object_import_target_write ON object_import_targets;
CREATE POLICY brokerdesk_object_import_target_select ON object_import_targets
  FOR SELECT USING (
    brokerdesk_private.can_access_tenant(object_import_targets.tenant_id)
    AND EXISTS (SELECT 1 FROM brokerage_cases c WHERE c.id = object_import_targets.case_id AND c.tenant_id = object_import_targets.tenant_id
      AND c.owner_resolution_status = 'resolved' AND c.current_owner_user_id IS NOT NULL
      AND (c.visibility_scope = 'company_read' OR c.current_owner_user_id = brokerdesk_private.current_user_id()))
    AND ((object_import_targets.target_type = 'party' AND EXISTS (SELECT 1 FROM clients p WHERE p.id = object_import_targets.target_id AND p.tenant_id = object_import_targets.tenant_id
      AND p.owner_resolution_status = 'resolved' AND p.current_owner_user_id IS NOT NULL
      AND (p.visibility_scope = 'company_read' OR p.current_owner_user_id = brokerdesk_private.current_user_id())))
      OR (object_import_targets.target_type = 'property' AND EXISTS (SELECT 1 FROM properties p WHERE p.id = object_import_targets.target_id AND p.tenant_id = object_import_targets.tenant_id
      AND p.owner_resolution_status = 'resolved' AND p.current_owner_user_id IS NOT NULL
      AND (p.visibility_scope = 'company_read' OR p.current_owner_user_id = brokerdesk_private.current_user_id()))))
  );
CREATE POLICY brokerdesk_object_import_target_write ON object_import_targets
  FOR ALL USING (
    brokerdesk_private.can_access_tenant(object_import_targets.tenant_id) AND object_import_targets.user_id = brokerdesk_private.current_user_id()
  ) WITH CHECK (
    brokerdesk_private.can_access_tenant(object_import_targets.tenant_id) AND object_import_targets.user_id = brokerdesk_private.current_user_id()
    AND EXISTS (SELECT 1 FROM brokerage_cases c WHERE c.id = object_import_targets.case_id AND c.tenant_id = object_import_targets.tenant_id
      AND c.owner_resolution_status = 'resolved' AND c.current_owner_user_id = brokerdesk_private.current_user_id())
    AND ((object_import_targets.target_type = 'party' AND EXISTS (SELECT 1 FROM clients p WHERE p.id = object_import_targets.target_id AND p.tenant_id = object_import_targets.tenant_id
      AND p.owner_resolution_status = 'resolved' AND p.current_owner_user_id = brokerdesk_private.current_user_id()))
      OR (object_import_targets.target_type = 'property' AND EXISTS (SELECT 1 FROM properties p WHERE p.id = object_import_targets.target_id AND p.tenant_id = object_import_targets.tenant_id
      AND p.owner_resolution_status = 'resolved' AND p.current_owner_user_id = brokerdesk_private.current_user_id())))
  );

ALTER TABLE object_import_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_import_fields FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brokerdesk_tenant_isolation ON object_import_fields;
DROP POLICY IF EXISTS brokerdesk_object_import_field_select ON object_import_fields;
DROP POLICY IF EXISTS brokerdesk_object_import_field_write ON object_import_fields;
CREATE POLICY brokerdesk_object_import_field_select ON object_import_fields
  FOR SELECT USING (
    brokerdesk_private.can_access_tenant(object_import_fields.tenant_id)
    AND EXISTS (
      SELECT 1 FROM object_import_targets t
      JOIN brokerage_cases c ON c.id = t.case_id AND c.tenant_id = t.tenant_id
      WHERE t.id = object_import_fields.object_import_target_id AND t.tenant_id = object_import_fields.tenant_id
        AND c.owner_resolution_status = 'resolved' AND c.current_owner_user_id IS NOT NULL
        AND (c.visibility_scope = 'company_read' OR c.current_owner_user_id = brokerdesk_private.current_user_id())
        AND ((t.target_type = 'party' AND EXISTS (SELECT 1 FROM clients p WHERE p.id = t.target_id AND p.tenant_id = t.tenant_id
          AND p.owner_resolution_status = 'resolved' AND p.current_owner_user_id IS NOT NULL
          AND (p.visibility_scope = 'company_read' OR p.current_owner_user_id = brokerdesk_private.current_user_id())))
          OR (t.target_type = 'property' AND EXISTS (SELECT 1 FROM properties p WHERE p.id = t.target_id AND p.tenant_id = t.tenant_id
          AND p.owner_resolution_status = 'resolved' AND p.current_owner_user_id IS NOT NULL
          AND (p.visibility_scope = 'company_read' OR p.current_owner_user_id = brokerdesk_private.current_user_id()))))
    )
  );
CREATE POLICY brokerdesk_object_import_field_write ON object_import_fields
  FOR ALL USING (
    brokerdesk_private.can_access_tenant(object_import_fields.tenant_id)
    AND EXISTS (
      SELECT 1 FROM object_import_targets t
      JOIN brokerage_cases c ON c.id = t.case_id AND c.tenant_id = t.tenant_id
      WHERE t.id = object_import_fields.object_import_target_id AND t.tenant_id = object_import_fields.tenant_id
        AND t.user_id = brokerdesk_private.current_user_id()
        AND c.owner_resolution_status = 'resolved' AND c.current_owner_user_id = brokerdesk_private.current_user_id()
        AND ((t.target_type = 'party' AND EXISTS (SELECT 1 FROM clients p WHERE p.id = t.target_id AND p.tenant_id = t.tenant_id
          AND p.owner_resolution_status = 'resolved' AND p.current_owner_user_id = brokerdesk_private.current_user_id()))
          OR (t.target_type = 'property' AND EXISTS (SELECT 1 FROM properties p WHERE p.id = t.target_id AND p.tenant_id = t.tenant_id
          AND p.owner_resolution_status = 'resolved' AND p.current_owner_user_id = brokerdesk_private.current_user_id())))
    )
  ) WITH CHECK (
    brokerdesk_private.can_access_tenant(object_import_fields.tenant_id)
    AND EXISTS (
      SELECT 1 FROM object_import_targets t
      JOIN brokerage_cases c ON c.id = t.case_id AND c.tenant_id = t.tenant_id
      WHERE t.id = object_import_fields.object_import_target_id AND t.tenant_id = object_import_fields.tenant_id
        AND t.user_id = brokerdesk_private.current_user_id()
        AND c.owner_resolution_status = 'resolved' AND c.current_owner_user_id = brokerdesk_private.current_user_id()
        AND ((t.target_type = 'party' AND EXISTS (SELECT 1 FROM clients p WHERE p.id = t.target_id AND p.tenant_id = t.tenant_id
          AND p.owner_resolution_status = 'resolved' AND p.current_owner_user_id = brokerdesk_private.current_user_id()))
          OR (t.target_type = 'property' AND EXISTS (SELECT 1 FROM properties p WHERE p.id = t.target_id AND p.tenant_id = t.tenant_id
          AND p.owner_resolution_status = 'resolved' AND p.current_owner_user_id = brokerdesk_private.current_user_id())))
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON object_import_targets, object_import_fields TO authenticated;
  END IF;
END $$;

COMMIT;
