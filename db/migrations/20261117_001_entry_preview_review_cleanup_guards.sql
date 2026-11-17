BEGIN;

-- Keep the direct-entry exception bound to the same authenticated owner as
-- the import graph. This is a follow-up migration so the already-applied
-- 20261116_003 checksum remains immutable.
CREATE OR REPLACE FUNCTION brokerdesk_private.guard_object_import_target()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  target_tenant TEXT;
  attachment_target_type TEXT;
  attachment_target_id TEXT;
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

  SELECT target_type, target_id
    INTO attachment_target_type, attachment_target_id
    FROM attachments a
   WHERE a.id = NEW.source_attachment_id
     AND a.tenant_id = NEW.tenant_id
     AND a.user_id = NEW.user_id;

  IF attachment_target_type = 'import_job' AND attachment_target_id = NEW.import_job_id THEN
    RETURN NEW;
  END IF;

  IF NEW.case_id IS NULL
     AND NEW.target_type = 'party'
     AND attachment_target_type = 'party'
     AND attachment_target_id = NEW.target_id
     AND EXISTS (
       SELECT 1
         FROM import_jobs j
        WHERE j.id = NEW.import_job_id
          AND j.tenant_id = NEW.tenant_id
          AND j.user_id = NEW.user_id
          AND j.status = 'completed'
          AND j.upload_lifecycle_version = 1
          AND CASE WHEN pg_input_is_valid(j.notes, 'jsonb') THEN j.notes::jsonb ELSE NULL::jsonb END = jsonb_build_object(
           'kind', 'entry_preview_review',
           'marker', 'brokerdesk:entry-preview-review',
           'targetId', NEW.target_id,
           'attachmentId', NEW.source_attachment_id
         )
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Object import attachment must belong to import job' USING ERRCODE = '23514';
END;
$$;

-- Cleanup is only called for a graph created by the current persistence
-- attempt. Lock the target before checking human decisions so a concurrent
-- confirmation wins and failed writes cannot remove confirmed evidence.
CREATE OR REPLACE FUNCTION brokerdesk_private.cleanup_entry_preview_review_target(
  p_tenant_id TEXT,
  p_user_id TEXT,
  p_import_job_id TEXT,
  p_target_id TEXT,
  p_party_id TEXT,
  p_attachment_id TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  job_notes JSONB;
  locked_target_id TEXT;
  deleted_jobs INTEGER := 0;
BEGIN
  IF brokerdesk_private.current_user_id() IS DISTINCT FROM p_user_id
     OR p_user_id IS NULL
     OR NOT brokerdesk_private.can_access_tenant(p_tenant_id) THEN
    RETURN FALSE;
  END IF;

  SELECT CASE WHEN pg_input_is_valid(j.notes, 'jsonb') THEN j.notes::jsonb ELSE NULL::jsonb END INTO job_notes
    FROM public.import_jobs j
   WHERE j.id = p_import_job_id
     AND j.tenant_id = p_tenant_id
     AND j.user_id = p_user_id
     AND j.status = 'completed'
     AND j.upload_lifecycle_version = 1
   FOR UPDATE;
  IF job_notes IS NULL OR job_notes <> jsonb_build_object(
       'kind', 'entry_preview_review',
       'marker', 'brokerdesk:entry-preview-review',
       'targetId', p_party_id,
       'attachmentId', p_attachment_id
     ) THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.attachments a
     WHERE a.id = p_attachment_id
       AND a.tenant_id = p_tenant_id
       AND a.user_id = p_user_id
       AND a.target_type = 'party'
       AND a.target_id = p_party_id
  ) THEN
    RETURN FALSE;
  END IF;

  SELECT t.id INTO locked_target_id
    FROM public.object_import_targets t
   WHERE t.id = p_target_id
     AND t.tenant_id = p_tenant_id
     AND t.user_id = p_user_id
     AND t.import_job_id = p_import_job_id
     AND t.target_type = 'party'
     AND t.target_id = p_party_id
     AND t.case_id IS NULL
     AND t.source_attachment_id = p_attachment_id
   FOR UPDATE;
  IF locked_target_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.object_import_fields f
     WHERE f.tenant_id = p_tenant_id
       AND f.object_import_target_id = locked_target_id
       AND f.final_source = 'human'
  ) THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.object_import_fields
   WHERE tenant_id = p_tenant_id AND object_import_target_id = locked_target_id;
  DELETE FROM public.object_import_targets
   WHERE id = locked_target_id AND tenant_id = p_tenant_id AND user_id = p_user_id;
  DELETE FROM public.import_jobs
   WHERE id = p_import_job_id AND tenant_id = p_tenant_id AND user_id = p_user_id;
  GET DIAGNOSTICS deleted_jobs = ROW_COUNT;
  RETURN deleted_jobs = 1;
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.cleanup_entry_preview_review_target(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION brokerdesk_private.cleanup_entry_preview_review_target(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO brokerdesk_runtime;

COMMIT;
