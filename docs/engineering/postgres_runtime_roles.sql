-- Broker Desk runtime database roles
--
-- Run this as the database owner or dedicated migration role after the schema
-- migrations. Do not put passwords in this file or commit a copy with values.
-- Example:
--   psql "$DATABASE_MIGRATION_URL" -v runtime_password='...' -v admin_password='...' \
--     -f docs/engineering/postgres_runtime_roles.sql

\if :{?runtime_password}
\else
\quit 1
\endif
\if :{?admin_password}
\else
\quit 1
\endif

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    CREATE ROLE brokerdesk_runtime NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_admin') THEN
    CREATE ROLE brokerdesk_admin NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE brokerdesk_runtime LOGIN PASSWORD :'runtime_password';
ALTER ROLE brokerdesk_admin LOGIN PASSWORD :'admin_password';

REVOKE ALL ON SCHEMA public FROM brokerdesk_runtime, brokerdesk_admin;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM brokerdesk_runtime, brokerdesk_admin;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM brokerdesk_runtime, brokerdesk_admin;

GRANT USAGE ON SCHEMA public TO brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.clients,
  public.properties,
  public.quotations,
  public.follow_ups,
  public.tasks,
  public.audit_logs,
  public.output_template_settings,
  public.output_template_versions,
  public.generated_outputs,
  public.import_jobs,
  public.attachments,
  public.private_attachment_blobs,
  public.brokerage_cases,
  public.extraction_review_items,
  public.guarantee_application_drafts,
  public.correction_events,
  public.ai_experience_drafts,
  public.case_workbench_field_rules,
  public.tenant_guarantee_template_installs
TO brokerdesk_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO brokerdesk_runtime;

-- The runtime must resolve its own active user and membership through the
-- security-definer helpers. It does not receive direct global table access.
GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_runtime;
GRANT EXECUTE ON FUNCTION brokerdesk_private.current_external_auth_subject() TO brokerdesk_runtime;
GRANT EXECUTE ON FUNCTION brokerdesk_private.current_user_id() TO brokerdesk_runtime;
GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_tenant(TEXT) TO brokerdesk_runtime;
GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_user(TEXT) TO brokerdesk_runtime;

-- The administrative worker owns no business-table permission. It can only
-- call audited lifecycle functions and atomically claim import work.
GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_admin;
GRANT EXECUTE ON FUNCTION brokerdesk_private.sync_external_auth_user(TEXT, TEXT, TEXT) TO brokerdesk_admin;
GRANT EXECUTE ON FUNCTION brokerdesk_private.suspend_external_auth_user(TEXT) TO brokerdesk_admin;
GRANT EXECUTE ON FUNCTION brokerdesk_private.claim_next_import_jobs(INTEGER) TO brokerdesk_admin;

-- New tables must be added explicitly in a migration with RLS and grants.
-- Do not add blanket ALTER DEFAULT PRIVILEGES grants here: safe failure is
-- preferable to accidentally exposing a future tenant table.
