-- Tenant-owned installations of published guarantee-application templates.
--
-- An installation stores a full snapshot, not a pointer that may be mutated by
-- a later platform release. This is the isolation boundary between official
-- template maintenance and customer-specific revisions.

CREATE TABLE IF NOT EXISTS public.tenant_guarantee_template_installs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id),
  template_id TEXT NOT NULL,
  source_layout_version_id TEXT NOT NULL REFERENCES public.guarantee_template_layout_versions(id),
  source_version_number INTEGER NOT NULL,
  source_asset_fingerprint TEXT NOT NULL,
  display_name TEXT NOT NULL,
  layout_snapshot JSONB NOT NULL,
  revision_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  installed_by_user_id TEXT REFERENCES public.users(id),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_guarantee_template_active
  ON public.tenant_guarantee_template_installs(tenant_id, template_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_tenant_guarantee_template_installs_tenant
  ON public.tenant_guarantee_template_installs(tenant_id, updated_at DESC);

ALTER TABLE public.tenant_guarantee_template_installs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_guarantee_template_installs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brokerdesk_tenant_isolation ON public.tenant_guarantee_template_installs;
CREATE POLICY brokerdesk_tenant_isolation
ON public.tenant_guarantee_template_installs
FOR ALL
USING (brokerdesk_private.can_access_tenant(tenant_id))
WITH CHECK (brokerdesk_private.can_access_tenant(tenant_id));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_guarantee_template_installs TO authenticated;
  END IF;
END $$;
