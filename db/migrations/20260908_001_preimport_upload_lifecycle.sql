-- Candidate only. No backfill: every existing upload remains legacy.
-- All functions retain tenant RLS. No table/policy/role grants are added.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_admin' AND NOT rolsuper AND NOT rolbypassrls)
     OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname IN ('import_jobs', 'attachments', 'private_attachment_blobs', 'attachment_links', 'audit_logs')
       AND (pg_get_userbyid(c.relowner) <> 'brokerdesk_admin' OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity)) THEN
    RAISE EXCEPTION 'Preimport lifecycle requires the existing constrained table owner and FORCE RLS' USING ERRCODE = '42501';
  END IF;
END;
$$;

ALTER TABLE public.import_jobs
  ADD COLUMN upload_lifecycle_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN final_import_started_at TIMESTAMPTZ,
  ADD COLUMN source_referenced_at TIMESTAMPTZ,
  ADD CONSTRAINT import_jobs_upload_lifecycle_version_check
    CHECK (upload_lifecycle_version IN (0, 1));

CREATE FUNCTION brokerdesk_private.guard_preimport_upload_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  old_notes JSONB;
  new_notes JSONB;
BEGIN
  -- Runtime cannot mint a start marker. The restricted claim definer executes
  -- this invoker trigger as brokerdesk_admin. This is not an admin-proof seal.
  IF TG_OP = 'INSERT' THEN
    IF NEW.final_import_started_at IS NOT NULL OR NEW.source_referenced_at IS NOT NULL THEN
      RAISE EXCEPTION 'New uploads cannot start final import on insert' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.upload_lifecycle_version IS DISTINCT FROM OLD.upload_lifecycle_version
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.source_type IS DISTINCT FROM OLD.source_type
       OR NEW.target_entity IS DISTINCT FROM OLD.target_entity THEN
      RAISE EXCEPTION 'Import upload identity and lifecycle version are immutable' USING ERRCODE = '42501';
    END IF;
    IF OLD.final_import_started_at IS NOT NULL
       AND NEW.final_import_started_at IS DISTINCT FROM OLD.final_import_started_at THEN
      RAISE EXCEPTION 'Final import start is immutable' USING ERRCODE = '42501';
    END IF;
    IF OLD.final_import_started_at IS NULL AND NEW.final_import_started_at IS NOT NULL
       AND (current_user <> 'brokerdesk_admin' OR OLD.status <> 'mapped'
            OR NEW.status <> 'processing') THEN
      RAISE EXCEPTION 'Final import must use the claim facade' USING ERRCODE = '42501';
    END IF;
    IF (OLD.source_referenced_at IS NOT NULL AND NEW.source_referenced_at IS DISTINCT FROM OLD.source_referenced_at)
       OR (OLD.source_referenced_at IS NULL AND NEW.source_referenced_at IS NOT NULL AND current_user <> 'brokerdesk_admin') THEN
      RAISE EXCEPTION 'Source reference evidence is immutable' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.final_import_started_at IS NOT NULL AND NEW.status IN ('queued', 'mapped') THEN
    RAISE EXCEPTION 'Started imports cannot return to parsing or mapping' USING ERRCODE = '42501';
  END IF;

  IF NEW.upload_lifecycle_version = 1 THEN
    -- New producers must store a JSON object, even while queued for parsing.
    -- Invalid JSON raises and rolls back; legacy free text is not converted.
    new_notes := COALESCE(NEW.notes::JSONB, '{}'::JSONB);
    IF jsonb_typeof(new_notes) IS DISTINCT FROM 'object'
       OR (new_notes ? 'kind' AND
           (jsonb_typeof(new_notes -> 'kind') IS DISTINCT FROM 'string'
            OR length(new_notes ->> 'kind') = 0)) THEN
      RAISE EXCEPTION 'New upload notes require an object and a nonempty string kind' USING ERRCODE = '22023';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      old_notes := COALESCE(OLD.notes::JSONB, '{}'::JSONB);
      -- Freeze every first parsed kind, including extraction and unknown kinds.
      -- Neither property->extraction->business-write nor extraction->property
      -- conversion can manufacture deletion eligibility.
      IF old_notes ? 'kind' AND
         new_notes -> 'kind' IS DISTINCT FROM old_notes -> 'kind' THEN
        RAISE EXCEPTION 'Parsed upload kind is immutable' USING ERRCODE = '42501';
      END IF;
      IF old_notes ? 'targetCaseId' AND
         new_notes -> 'targetCaseId' IS DISTINCT FROM old_notes -> 'targetCaseId' THEN
        RAISE EXCEPTION 'Upload case binding is immutable' USING ERRCODE = '42501';
      END IF;
      -- queued->processing is extraction, not final business import.
      -- mapped->processing requires a claim stamp. The generic worker must
      -- not treat a mapped job as a fresh extraction attempt.
      IF OLD.status = 'mapped' AND NEW.status = 'processing'
         AND NEW.final_import_started_at IS NULL THEN
        RAISE EXCEPTION 'Mapped imports require final claim' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF new_notes ->> 'kind' = 'property_row_import' AND NEW.status = 'completed' AND NEW.final_import_started_at IS NULL THEN
      RAISE EXCEPTION 'Completed imports require final start evidence' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION brokerdesk_private.guard_preimport_upload_lifecycle() OWNER TO brokerdesk_admin;
REVOKE ALL ON FUNCTION brokerdesk_private.guard_preimport_upload_lifecycle() FROM PUBLIC;
CREATE TRIGGER import_jobs_preimport_upload_lifecycle_guard
  BEFORE INSERT OR UPDATE ON public.import_jobs
  FOR EACH ROW EXECUTE FUNCTION brokerdesk_private.guard_preimport_upload_lifecycle();

CREATE FUNCTION brokerdesk_private.claim_property_row_import(p_tenant_id TEXT, p_job_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
SET row_security = on
AS $$
DECLARE
  actor_id TEXT := brokerdesk_private.current_user_id();
  job public.import_jobs%ROWTYPE;
  payload JSONB;
BEGIN
  IF actor_id IS NULL OR brokerdesk_private.can_access_tenant(p_tenant_id) IS DISTINCT FROM TRUE THEN
    RETURN FALSE;
  END IF;
  SELECT * INTO job FROM public.import_jobs
    WHERE tenant_id = p_tenant_id AND id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  -- Historical row payloads may still import, but never become deletable.
  IF job.user_id IS DISTINCT FROM actor_id
     OR job.source_type <> 'excel' OR job.target_entity <> 'properties'
     OR job.status <> 'mapped' OR job.final_import_started_at IS NOT NULL THEN
    RETURN FALSE;
  END IF;
  BEGIN
    payload := job.notes::JSONB;
  EXCEPTION WHEN invalid_text_representation THEN RETURN FALSE;
  END;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object'
     OR (payload -> 'kind' = '"property_row_import"'::JSONB
       OR (job.upload_lifecycle_version = 0 AND NOT (payload ? 'kind') AND jsonb_typeof(payload -> 'rows') = 'array')) IS DISTINCT FROM TRUE THEN
    RETURN FALSE;
  END IF;
  UPDATE public.import_jobs
    SET final_import_started_at = NOW(), status = 'processing', updated_at = NOW()
    WHERE tenant_id = p_tenant_id AND id = p_job_id;
  RETURN TRUE;
END;
$$;

CREATE FUNCTION brokerdesk_private.delete_preimport_property_upload(p_tenant_id TEXT, p_job_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
SET row_security = on
AS $$
DECLARE
  actor_id TEXT := brokerdesk_private.current_user_id();
  job public.import_jobs%ROWTYPE;
  source public.attachments%ROWTYPE;
  target_tenant public.tenants%ROWTYPE;
  actor_membership public.tenant_memberships%ROWTYPE;
  payload JSONB;
  source_count BIGINT;
  affected BIGINT;
BEGIN
  -- Re-read links after acquiring the parent lock using a fresh snapshot.
  -- An older repeatable-read snapshot could hide a link committed while waiting.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Preimport deletion requires READ COMMITTED' USING ERRCODE = '25000';
  END IF;
  IF actor_id IS NULL OR brokerdesk_private.can_access_tenant(p_tenant_id) IS DISTINCT FROM TRUE THEN
    RETURN FALSE;
  END IF;
  -- Match membership lifecycle lock order. Authorization is decided only after
  -- conflict locks are held, and remains serialized until transaction commit.
  SELECT * INTO target_tenant FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR target_tenant.status IS DISTINCT FROM 'active' THEN RETURN FALSE; END IF;
  SELECT * INTO actor_membership FROM public.tenant_memberships
    WHERE tenant_id = p_tenant_id AND user_id = actor_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF actor_membership.status IS DISTINCT FROM 'active'
     OR ((actor_membership.capability = 'company_owner' AND actor_membership.role = 'tenant_owner')
       OR (actor_membership.capability = 'company_form_admin' AND actor_membership.role = 'manager')) IS DISTINCT FROM TRUE
     OR brokerdesk_private.can_access_tenant(p_tenant_id) IS DISTINCT FROM TRUE THEN
    RETURN FALSE;
  END IF;
  SELECT * INTO job FROM public.import_jobs
    WHERE tenant_id = p_tenant_id AND id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF job.upload_lifecycle_version <> 1 OR job.user_id IS DISTINCT FROM actor_id
     OR job.source_type <> 'excel' OR job.target_entity <> 'properties'
     OR job.status <> 'mapped' OR job.final_import_started_at IS NOT NULL OR job.source_referenced_at IS NOT NULL THEN
    RETURN FALSE;
  END IF;
  BEGIN
    payload := job.notes::JSONB;
  EXCEPTION WHEN invalid_text_representation THEN RETURN FALSE;
  END;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object'
     OR payload -> 'kind' IS DISTINCT FROM '"property_row_import"'::JSONB
     OR payload ? 'targetCaseId' THEN
    RETURN FALSE;
  END IF;

  -- New source/link writers take the same job lock through the lifecycle trigger.
  -- The permanent reference stamp rejects sharing even if a link later disappears.
  SELECT COUNT(*) INTO source_count FROM public.attachments
    WHERE tenant_id = p_tenant_id AND target_type = 'import_job' AND target_id = p_job_id;
  IF source_count <> 1 THEN RETURN FALSE; END IF;
  SELECT * INTO source FROM public.attachments
    WHERE tenant_id = p_tenant_id AND target_type = 'import_job' AND target_id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF source.tenant_id IS DISTINCT FROM p_tenant_id OR source.user_id IS DISTINCT FROM actor_id
     OR source.storage_path IS DISTINCT FROM 'postgres-private://' || p_tenant_id || '/' || source.id THEN
    RETURN FALSE;
  END IF;
  IF EXISTS (SELECT 1 FROM public.attachments
    WHERE tenant_id = p_tenant_id AND storage_path = source.storage_path AND id <> source.id) THEN
    RETURN FALSE;
  END IF;
  PERFORM 1 FROM public.private_attachment_blobs
    WHERE attachment_id = source.id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF EXISTS (SELECT 1 FROM public.attachment_links WHERE tenant_id = p_tenant_id AND attachment_id = source.id) THEN
    RETURN FALSE;
  END IF;
  -- No business-table reference queries are used as safety evidence.
  DELETE FROM public.attachments WHERE id = source.id AND tenant_id = p_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Source delete failed'; END IF;
  -- private_attachment_blobs is removed by the existing attachment FK cascade.
  DELETE FROM public.import_jobs WHERE id = p_job_id AND tenant_id = p_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Upload delete failed'; END IF;
  INSERT INTO public.audit_logs
    (id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json)
  VALUES
    (gen_random_uuid()::TEXT, p_tenant_id, actor_id, actor_id,
     'preimport_property_upload_deleted', 'import_job', p_job_id,
     'Deleted own unstarted property row upload and private source',
     jsonb_build_object('uploadLifecycleVersion', 1, 'attachmentId', source.id));
  RETURN TRUE;
END;
$$;

-- Minimal lifecycle proof, not a general provenance graph. No hidden business
-- table scans: any new link claims the source's job BEFORE it can be shared.
CREATE FUNCTION brokerdesk_private.guard_preimport_source_reference()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
SET row_security = on
AS $$
DECLARE
  parent public.import_jobs%ROWTYPE;
  source public.attachments%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'attachments' THEN
    IF TG_OP = 'UPDATE' AND OLD.target_type = 'import_job' THEN
      SELECT * INTO parent FROM public.import_jobs WHERE id = OLD.target_id AND tenant_id = OLD.tenant_id FOR UPDATE;
      IF parent.upload_lifecycle_version = 1 AND (NEW.target_type IS DISTINCT FROM OLD.target_type OR NEW.target_id IS DISTINCT FROM OLD.target_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN
        RAISE EXCEPTION 'New upload source binding is immutable' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF NEW.target_type <> 'import_job' THEN RETURN NEW; END IF;
    SELECT * INTO parent FROM public.import_jobs WHERE id = NEW.target_id AND tenant_id = NEW.tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Import source is unavailable' USING ERRCODE = '42501'; END IF;
    IF parent.upload_lifecycle_version = 1 AND TG_OP = 'INSERT' AND parent.status <> 'queued' THEN
      RAISE EXCEPTION 'New import source requires an unparsed upload' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO source FROM public.attachments WHERE id = NEW.attachment_id AND tenant_id = NEW.tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attachment is unavailable in this tenant' USING ERRCODE = '42501'; END IF;
  IF source.target_type = 'import_job' THEN
    SELECT * INTO parent FROM public.import_jobs WHERE id = source.target_id AND tenant_id = source.tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Import source is unavailable' USING ERRCODE = '42501'; END IF;
    IF parent.upload_lifecycle_version = 1 AND parent.source_referenced_at IS NULL THEN
      UPDATE public.import_jobs SET source_referenced_at = NOW() WHERE id = parent.id AND tenant_id = parent.tenant_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION brokerdesk_private.guard_preimport_source_reference() OWNER TO brokerdesk_admin;
REVOKE ALL ON FUNCTION brokerdesk_private.guard_preimport_source_reference() FROM PUBLIC;
CREATE TRIGGER attachments_preimport_source_reference_guard BEFORE INSERT OR UPDATE ON public.attachments
  FOR EACH ROW EXECUTE FUNCTION brokerdesk_private.guard_preimport_source_reference();
CREATE TRIGGER attachment_links_preimport_source_reference_guard BEFORE INSERT OR UPDATE ON public.attachment_links
  FOR EACH ROW EXECUTE FUNCTION brokerdesk_private.guard_preimport_source_reference();

ALTER FUNCTION brokerdesk_private.claim_property_row_import(TEXT, TEXT) OWNER TO brokerdesk_admin;
ALTER FUNCTION brokerdesk_private.delete_preimport_property_upload(TEXT, TEXT) OWNER TO brokerdesk_admin;
REVOKE ALL ON FUNCTION brokerdesk_private.claim_property_row_import(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION brokerdesk_private.delete_preimport_property_upload(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION brokerdesk_private.claim_property_row_import(TEXT, TEXT) TO brokerdesk_runtime;
GRANT EXECUTE ON FUNCTION brokerdesk_private.delete_preimport_property_upload(TEXT, TEXT) TO brokerdesk_runtime;
COMMIT;
