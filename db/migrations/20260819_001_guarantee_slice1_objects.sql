-- TASK-038 / G1-SLICE-1 additive objects. Apply only with explicit migration authorization.
-- Existing tables and rows are not rewritten; all new references are nullable or new rows.
CREATE TABLE IF NOT EXISTS public.guarantee_blank_forms (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  recipient_or_purpose TEXT,
  active_version_id TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.guarantee_blank_form_versions (
  id TEXT PRIMARY KEY,
  blank_form_id TEXT NOT NULL REFERENCES public.guarantee_blank_forms(id),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id),
  attachment_id TEXT NOT NULL REFERENCES public.attachments(id),
  uploaded_by_user_id TEXT NOT NULL REFERENCES public.users(id),
  version_number INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  page_count INTEGER NOT NULL,
  page_width DOUBLE PRECISION NOT NULL,
  page_height DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_changed_by_user_id TEXT REFERENCES public.users(id),
  UNIQUE (blank_form_id, version_number)
);
ALTER TABLE public.guarantee_blank_forms
  ADD CONSTRAINT guarantee_blank_forms_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES public.guarantee_blank_form_versions(id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE IF NOT EXISTS public.guarantee_company_masks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id),
  blank_form_id TEXT NOT NULL REFERENCES public.guarantee_blank_forms(id),
  active_version_id TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, blank_form_id)
);
CREATE TABLE IF NOT EXISTS public.guarantee_company_mask_versions (
  id TEXT PRIMARY KEY,
  mask_id TEXT NOT NULL REFERENCES public.guarantee_company_masks(id),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id),
  blank_form_id TEXT NOT NULL REFERENCES public.guarantee_blank_forms(id),
  blank_form_version_id TEXT NOT NULL REFERENCES public.guarantee_blank_form_versions(id),
  source_platform_mask_id TEXT,
  version_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  field_catalog_version TEXT NOT NULL,
  layout_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id TEXT NOT NULL REFERENCES public.users(id),
  tested_by_user_id TEXT REFERENCES public.users(id),
  tested_at TIMESTAMPTZ,
  tested_pdf_sha256 TEXT,
  tested_layout_digest TEXT,
  test_confirmed_by_user_id TEXT REFERENCES public.users(id),
  test_confirmed_at TIMESTAMPTZ,
  published_by_user_id TEXT REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  UNIQUE (mask_id, version_number)
);
ALTER TABLE public.guarantee_company_masks
  ADD CONSTRAINT guarantee_company_masks_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES public.guarantee_company_mask_versions(id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX IF NOT EXISTS guarantee_company_masks_one_draft
  ON public.guarantee_company_mask_versions(mask_id) WHERE status = 'draft';
CREATE TABLE IF NOT EXISTS public.guarantee_mask_matches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id),
  blank_form_version_id TEXT NOT NULL REFERENCES public.guarantee_blank_form_versions(id),
  mask_version_id TEXT NOT NULL REFERENCES public.guarantee_company_mask_versions(id),
  status TEXT NOT NULL,
  evaluated_at TIMESTAMPTZ,
  evaluated_by_user_id TEXT REFERENCES public.users(id),
  reason TEXT,
  blank_form_sha256 TEXT,
  page_width DOUBLE PRECISION,
  page_height DOUBLE PRECISION,
  UNIQUE (tenant_id, blank_form_version_id, mask_version_id)
);
CREATE TABLE IF NOT EXISTS public.guarantee_preview_confirmations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id),
  actor_user_id TEXT NOT NULL REFERENCES public.users(id),
  case_id TEXT NOT NULL,
  case_input_snapshot_hash TEXT NOT NULL,
  blank_form_version_id TEXT NOT NULL REFERENCES public.guarantee_blank_form_versions(id),
  blank_form_sha256 TEXT NOT NULL,
  company_mask_version_id TEXT NOT NULL REFERENCES public.guarantee_company_mask_versions(id),
  field_catalog_version TEXT NOT NULL,
  supplement_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  supplement_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued',
  processing_expires_at TIMESTAMPTZ,
  processing_token TEXT,
  generated_output_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ
);
ALTER TABLE public.generated_outputs ADD COLUMN IF NOT EXISTS file_attachment_id TEXT;
ALTER TABLE public.generated_outputs ADD COLUMN IF NOT EXISTS file_sha256 TEXT;
ALTER TABLE public.generated_outputs ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER;
ALTER TABLE public.generated_outputs ADD COLUMN IF NOT EXISTS file_mime_type TEXT;
ALTER TABLE public.generated_outputs ADD COLUMN IF NOT EXISTS file_status TEXT;
ALTER TABLE public.generated_outputs ADD COLUMN IF NOT EXISTS blank_form_version_id TEXT;
ALTER TABLE public.generated_outputs ADD COLUMN IF NOT EXISTS blank_form_sha256 TEXT;
ALTER TABLE public.generated_outputs ADD COLUMN IF NOT EXISTS company_mask_version_id TEXT;
ALTER TABLE public.generated_outputs ADD COLUMN IF NOT EXISTS field_catalog_version TEXT;
ALTER TABLE public.generated_outputs ADD COLUMN IF NOT EXISTS preview_confirmation_id TEXT;
ALTER TABLE public.generated_outputs ADD COLUMN IF NOT EXISTS case_input_snapshot_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS guarantee_outputs_confirmation_unique ON public.generated_outputs(preview_confirmation_id) WHERE preview_confirmation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS guarantee_outputs_file_unique ON public.generated_outputs(file_attachment_id) WHERE file_attachment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS guarantee_blank_form_versions_tenant_idx ON public.guarantee_blank_form_versions(tenant_id, blank_form_id, version_number DESC);
CREATE INDEX IF NOT EXISTS guarantee_preview_confirmations_scope_idx ON public.guarantee_preview_confirmations(tenant_id, actor_user_id, status);

-- New objects are tenant records too. Keep the same membership-based RLS
-- contract as the existing attachments, cases, and generated outputs. This
-- block is applied only with this additive migration; it is never executed by
-- the limited local slice.
DO $$
DECLARE
  tenant_table TEXT;
  tenant_tables TEXT[] := ARRAY[
    'guarantee_blank_forms',
    'guarantee_blank_form_versions',
    'guarantee_company_masks',
    'guarantee_company_mask_versions',
    'guarantee_mask_matches',
    'guarantee_preview_confirmations'
  ];
BEGIN
  FOREACH tenant_table IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('DROP POLICY IF EXISTS brokerdesk_tenant_isolation ON public.%I', tenant_table);
    EXECUTE format(
      'CREATE POLICY brokerdesk_tenant_isolation ON public.%I
       FOR ALL
       USING (brokerdesk_private.can_access_tenant(tenant_id))
       WITH CHECK (brokerdesk_private.can_access_tenant(tenant_id))',
      tenant_table
    );
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', tenant_table);
    END IF;
  END LOOP;
END $$;
