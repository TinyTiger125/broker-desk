-- Runtime ACL baseline for ordinary authenticated tenant requests.
--
-- This migration is intentionally explicit.  The runtime role is not a table
-- owner, does not bypass RLS, and receives no blanket or future-table grant.
-- The table list is derived from direct SQL in src/lib/data.postgres.ts after
-- its legacy/demo initializer boundary.  Identity, invitation, tenant
-- creation, member lifecycle, platform account, and worker operations remain
-- behind their existing SECURITY DEFINER or administrative functions.

REVOKE ALL PRIVILEGES ON TABLE
  public.users,
  public.tenants,
  public.tenant_memberships,
  public.tenant_member_visibility_defaults,
  public.case_workbench_field_rules,
  public.clients,
  public.properties,
  public.brokerage_cases,
  public.tasks,
  public.follow_ups,
  public.quotations,
  public.audit_logs,
  public.output_template_settings,
  public.output_template_versions,
  public.import_jobs,
  public.ai_experience_drafts,
  public.correction_events,
  public.extraction_review_items,
  public.guarantee_application_drafts,
  public.guarantee_blank_forms,
  public.guarantee_blank_form_versions,
  public.guarantee_company_masks,
  public.guarantee_company_mask_versions,
  public.guarantee_mask_matches,
  public.guarantee_preview_confirmations,
  public.tenant_guarantee_template_installs,
  public.generated_outputs,
  public.attachments,
  public.private_attachment_blobs,
  public.attachment_links,
  public.guarantee_template_layout_versions,
  public.broker_desk_schema_migrations
FROM brokerdesk_runtime;

GRANT SELECT ON TABLE
  public.users,
  public.tenants,
  public.tenant_memberships
TO brokerdesk_runtime;

GRANT SELECT, INSERT, UPDATE ON TABLE public.tenant_member_visibility_defaults TO brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.case_workbench_field_rules TO brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.clients TO brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.properties TO brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.brokerage_cases TO brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tasks TO brokerdesk_runtime;
GRANT SELECT, INSERT ON TABLE public.follow_ups TO brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.quotations TO brokerdesk_runtime;
GRANT SELECT, INSERT ON TABLE public.audit_logs TO brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.output_template_settings TO brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.output_template_versions TO brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.import_jobs TO brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_experience_drafts TO brokerdesk_runtime;
GRANT SELECT, INSERT ON TABLE public.correction_events TO brokerdesk_runtime;
GRANT SELECT, INSERT, DELETE ON TABLE public.extraction_review_items TO brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.guarantee_application_drafts TO brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.guarantee_blank_forms TO brokerdesk_runtime;
GRANT SELECT, INSERT, DELETE ON TABLE public.guarantee_blank_form_versions TO brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.guarantee_company_masks TO brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.guarantee_company_mask_versions TO brokerdesk_runtime;
GRANT SELECT, INSERT ON TABLE public.guarantee_mask_matches TO brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.guarantee_preview_confirmations TO brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tenant_guarantee_template_installs TO brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.generated_outputs TO brokerdesk_runtime;
GRANT SELECT, INSERT, DELETE ON TABLE public.attachments TO brokerdesk_runtime;
GRANT SELECT, INSERT, DELETE ON TABLE public.private_attachment_blobs TO brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.attachment_links TO brokerdesk_runtime;

-- Platform-owned layouts are readable by the runtime renderer but never
-- writable by it.  Publication remains an administrative operation.
GRANT SELECT ON TABLE public.guarantee_template_layout_versions TO brokerdesk_runtime;
GRANT SELECT ON TABLE public.broker_desk_schema_migrations TO brokerdesk_runtime;

-- databaseActorMatches and the invitation facade use this existing narrow
-- SECURITY DEFINER identity facade.  The raw external-subject helper and
-- administrative synchronizers remain closed to the runtime role.
GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_runtime;
REVOKE ALL PRIVILEGES ON FUNCTION brokerdesk_private.current_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION brokerdesk_private.current_user_id() TO brokerdesk_runtime;
