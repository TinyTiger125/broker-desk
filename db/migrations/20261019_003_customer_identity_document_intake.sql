BEGIN;

-- Customer identity intake is a standalone party-profile workflow. Keep the
-- earlier property-only migration immutable and widen only its local target
-- guard/policies so a target can be case-less when it points at an owned
-- individual client. No business columns are added by this migration.
CREATE OR REPLACE FUNCTION brokerdesk_private.guard_object_import_target()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  target_tenant TEXT;
  attachment_job TEXT;
BEGIN
  IF NEW.case_id IS NULL THEN
    IF NEW.target_type NOT IN ('property', 'party') THEN
      RAISE EXCEPTION 'Standalone object import target type is unsupported' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT tenant_id INTO target_tenant FROM brokerage_cases WHERE id = NEW.case_id;
    IF target_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'Object import case tenant mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.target_type = 'party' THEN
    SELECT tenant_id INTO target_tenant FROM clients WHERE id = NEW.target_id;
  ELSIF NEW.target_type = 'property' THEN
    SELECT tenant_id INTO target_tenant FROM properties WHERE id = NEW.target_id;
  ELSE
    target_tenant := NULL;
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

DROP POLICY IF EXISTS brokerdesk_object_import_target_select ON object_import_targets;
CREATE POLICY brokerdesk_object_import_target_select ON object_import_targets
  FOR SELECT USING (
    brokerdesk_private.can_access_tenant(object_import_targets.tenant_id)
    AND (
      (
        object_import_targets.case_id IS NULL
        AND (
          (object_import_targets.target_type = 'property' AND EXISTS (
            SELECT 1 FROM properties p WHERE p.id = object_import_targets.target_id AND p.tenant_id = object_import_targets.tenant_id
              AND p.owner_resolution_status = 'resolved' AND p.current_owner_user_id IS NOT NULL
              AND (p.visibility_scope = 'company_read' OR p.current_owner_user_id = brokerdesk_private.current_user_id())
          ))
          OR (object_import_targets.target_type = 'party' AND EXISTS (
            SELECT 1 FROM clients c WHERE c.id = object_import_targets.target_id AND c.tenant_id = object_import_targets.tenant_id
              AND c.owner_resolution_status = 'resolved' AND c.current_owner_user_id IS NOT NULL
              AND (c.visibility_scope = 'company_read' OR c.current_owner_user_id = brokerdesk_private.current_user_id())
          ))
        )
      )
      OR EXISTS (
        SELECT 1 FROM brokerage_cases c WHERE c.id = object_import_targets.case_id AND c.tenant_id = object_import_targets.tenant_id
          AND c.owner_resolution_status = 'resolved' AND c.current_owner_user_id IS NOT NULL
          AND (c.visibility_scope = 'company_read' OR c.current_owner_user_id = brokerdesk_private.current_user_id())
      )
    )
    AND (
      (object_import_targets.target_type = 'party' AND EXISTS (
        SELECT 1 FROM clients c WHERE c.id = object_import_targets.target_id AND c.tenant_id = object_import_targets.tenant_id
          AND c.owner_resolution_status = 'resolved' AND c.current_owner_user_id IS NOT NULL
          AND (c.visibility_scope = 'company_read' OR c.current_owner_user_id = brokerdesk_private.current_user_id())
      ))
      OR (object_import_targets.target_type = 'property' AND EXISTS (
        SELECT 1 FROM properties p WHERE p.id = object_import_targets.target_id AND p.tenant_id = object_import_targets.tenant_id
          AND p.owner_resolution_status = 'resolved' AND p.current_owner_user_id IS NOT NULL
          AND (p.visibility_scope = 'company_read' OR p.current_owner_user_id = brokerdesk_private.current_user_id())
      ))
    )
  );

DROP POLICY IF EXISTS brokerdesk_object_import_target_write ON object_import_targets;
CREATE POLICY brokerdesk_object_import_target_write ON object_import_targets
  FOR ALL USING (
    brokerdesk_private.can_access_tenant(object_import_targets.tenant_id)
    AND object_import_targets.user_id = brokerdesk_private.current_user_id()
  ) WITH CHECK (
    brokerdesk_private.can_access_tenant(object_import_targets.tenant_id)
    AND object_import_targets.user_id = brokerdesk_private.current_user_id()
    AND (
      (
        object_import_targets.case_id IS NULL
        AND (
          (object_import_targets.target_type = 'property' AND EXISTS (
            SELECT 1 FROM properties p WHERE p.id = object_import_targets.target_id AND p.tenant_id = object_import_targets.tenant_id
              AND p.owner_resolution_status = 'resolved' AND p.current_owner_user_id = brokerdesk_private.current_user_id()
          ))
          OR (object_import_targets.target_type = 'party' AND EXISTS (
            SELECT 1 FROM clients c WHERE c.id = object_import_targets.target_id AND c.tenant_id = object_import_targets.tenant_id
              AND c.owner_resolution_status = 'resolved' AND c.current_owner_user_id = brokerdesk_private.current_user_id()
          ))
        )
      )
      OR EXISTS (
        SELECT 1 FROM brokerage_cases c WHERE c.id = object_import_targets.case_id AND c.tenant_id = object_import_targets.tenant_id
          AND c.owner_resolution_status = 'resolved' AND c.current_owner_user_id = brokerdesk_private.current_user_id()
      )
    )
    AND (
      (object_import_targets.target_type = 'party' AND EXISTS (
        SELECT 1 FROM clients c WHERE c.id = object_import_targets.target_id AND c.tenant_id = object_import_targets.tenant_id
          AND c.owner_resolution_status = 'resolved' AND c.current_owner_user_id = brokerdesk_private.current_user_id()
      ))
      OR (object_import_targets.target_type = 'property' AND EXISTS (
        SELECT 1 FROM properties p WHERE p.id = object_import_targets.target_id AND p.tenant_id = object_import_targets.tenant_id
          AND p.owner_resolution_status = 'resolved' AND p.current_owner_user_id = brokerdesk_private.current_user_id()
      ))
    )
  );

DROP POLICY IF EXISTS brokerdesk_object_import_field_select ON object_import_fields;
CREATE POLICY brokerdesk_object_import_field_select ON object_import_fields
  FOR SELECT USING (
    brokerdesk_private.can_access_tenant(object_import_fields.tenant_id)
    AND EXISTS (
      SELECT 1 FROM object_import_targets t
      WHERE t.id = object_import_fields.object_import_target_id AND t.tenant_id = object_import_fields.tenant_id
        AND (
          (t.case_id IS NULL AND (
            (t.target_type = 'property' AND EXISTS (
              SELECT 1 FROM properties p WHERE p.id = t.target_id AND p.tenant_id = t.tenant_id
                AND p.owner_resolution_status = 'resolved' AND p.current_owner_user_id IS NOT NULL
                AND (p.visibility_scope = 'company_read' OR p.current_owner_user_id = brokerdesk_private.current_user_id())
            ))
            OR (t.target_type = 'party' AND EXISTS (
              SELECT 1 FROM clients c WHERE c.id = t.target_id AND c.tenant_id = t.tenant_id
                AND c.owner_resolution_status = 'resolved' AND c.current_owner_user_id IS NOT NULL
                AND (c.visibility_scope = 'company_read' OR c.current_owner_user_id = brokerdesk_private.current_user_id())
            ))
          ))
          OR EXISTS (
            SELECT 1 FROM brokerage_cases c WHERE c.id = t.case_id AND c.tenant_id = t.tenant_id
              AND c.owner_resolution_status = 'resolved' AND c.current_owner_user_id IS NOT NULL
              AND (c.visibility_scope = 'company_read' OR c.current_owner_user_id = brokerdesk_private.current_user_id())
          )
        )
    )
  );

DROP POLICY IF EXISTS brokerdesk_object_import_field_write ON object_import_fields;
CREATE POLICY brokerdesk_object_import_field_write ON object_import_fields
  FOR ALL USING (
    brokerdesk_private.can_access_tenant(object_import_fields.tenant_id)
    AND EXISTS (
      SELECT 1 FROM object_import_targets t
      WHERE t.id = object_import_fields.object_import_target_id AND t.tenant_id = object_import_fields.tenant_id
        AND t.user_id = brokerdesk_private.current_user_id()
        AND (
          (t.case_id IS NULL AND (
            (t.target_type = 'property' AND EXISTS (
              SELECT 1 FROM properties p WHERE p.id = t.target_id AND p.tenant_id = t.tenant_id
                AND p.owner_resolution_status = 'resolved' AND p.current_owner_user_id = brokerdesk_private.current_user_id()
            ))
            OR (t.target_type = 'party' AND EXISTS (
              SELECT 1 FROM clients c WHERE c.id = t.target_id AND c.tenant_id = t.tenant_id
                AND c.owner_resolution_status = 'resolved' AND c.current_owner_user_id = brokerdesk_private.current_user_id()
            ))
          ))
          OR EXISTS (
            SELECT 1 FROM brokerage_cases c WHERE c.id = t.case_id AND c.tenant_id = t.tenant_id
              AND c.owner_resolution_status = 'resolved' AND c.current_owner_user_id = brokerdesk_private.current_user_id()
          )
        )
    )
  ) WITH CHECK (
    brokerdesk_private.can_access_tenant(object_import_fields.tenant_id)
    AND EXISTS (
      SELECT 1 FROM object_import_targets t
      WHERE t.id = object_import_fields.object_import_target_id AND t.tenant_id = object_import_fields.tenant_id
        AND t.user_id = brokerdesk_private.current_user_id()
        AND (
          (t.case_id IS NULL AND (
            (t.target_type = 'property' AND EXISTS (
              SELECT 1 FROM properties p WHERE p.id = t.target_id AND p.tenant_id = t.tenant_id
                AND p.owner_resolution_status = 'resolved' AND p.current_owner_user_id = brokerdesk_private.current_user_id()
            ))
            OR (t.target_type = 'party' AND EXISTS (
              SELECT 1 FROM clients c WHERE c.id = t.target_id AND c.tenant_id = t.tenant_id
                AND c.owner_resolution_status = 'resolved' AND c.current_owner_user_id = brokerdesk_private.current_user_id()
            ))
          ))
          OR EXISTS (
            SELECT 1 FROM brokerage_cases c WHERE c.id = t.case_id AND c.tenant_id = t.tenant_id
              AND c.owner_resolution_status = 'resolved' AND c.current_owner_user_id = brokerdesk_private.current_user_id()
          )
        )
    )
  );

COMMIT;
