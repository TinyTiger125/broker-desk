-- Force the RLS baseline without rewriting an already-audited migration.
--
-- This migration deliberately does not grant extra privileges or alter policy
-- logic. It only ensures table owners are also subject to the existing RLS
-- policies for tenant-scoped business data. Superusers and roles with
-- BYPASSRLS remain prohibited for the web application connection by the
-- production readiness runbook.

DO $$
DECLARE
  tenant_table TEXT;
  tenant_tables TEXT[] := ARRAY[
    'clients',
    'properties',
    'quotations',
    'follow_ups',
    'tasks',
    'audit_logs',
    'output_template_settings',
    'output_template_versions',
    'generated_outputs',
    'import_jobs',
    'attachments',
    'brokerage_cases',
    'extraction_review_items',
    'guarantee_application_drafts',
    'correction_events',
    'ai_experience_drafts',
    'case_workbench_field_rules'
  ];
BEGIN
  FOREACH tenant_table IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tenant_table);
  END LOOP;
END $$;

-- Do not force RLS on the shared authorization lookup tables. Existing RLS
-- policies resolve the current user's tenant membership through SECURITY
-- DEFINER helper functions. Forcing those lookup tables would make the helper
-- evaluate its own policy recursively. They remain RLS-protected for the
-- non-owner, non-BYPASSRLS application role required by the runbook.
