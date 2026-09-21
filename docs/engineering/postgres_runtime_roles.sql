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

-- 20260908 preimport lifecycle functions execute under brokerdesk_admin and
-- require that role to own these FORCE-RLS tables.  Ownership is an explicit
-- migration prerequisite; do not replace it with broad grants or BYPASSRLS.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('import_jobs', 'attachments', 'private_attachment_blobs', 'attachment_links', 'audit_logs')
      AND (pg_get_userbyid(c.relowner) <> 'brokerdesk_admin' OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION 'runtime role setup requires brokerdesk_admin ownership and FORCE RLS on preimport tables' USING ERRCODE = '42501';
  END IF;
END
$$;

ALTER ROLE brokerdesk_runtime LOGIN PASSWORD :'runtime_password';
ALTER ROLE brokerdesk_admin LOGIN PASSWORD :'admin_password';

REVOKE ALL ON SCHEMA public FROM brokerdesk_runtime, brokerdesk_admin;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM brokerdesk_runtime, brokerdesk_admin;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM brokerdesk_runtime, brokerdesk_admin;

GRANT USAGE ON SCHEMA public TO brokerdesk_runtime;
-- Keep this list aligned with 20260902_003_runtime_acl_baseline.sql. Identity
-- tables are readable for tenant/session resolution; writes remain behind
-- security-definer or owner actions.
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
GRANT SELECT ON TABLE public.guarantee_template_layout_versions TO brokerdesk_runtime;
GRANT SELECT ON TABLE public.broker_desk_schema_migrations TO brokerdesk_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO brokerdesk_runtime;

-- The runtime must resolve its own active user and membership through the
-- security-definer helpers. It does not receive direct global table access.
GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_runtime;
GRANT EXECUTE ON FUNCTION brokerdesk_private.current_external_auth_subject() TO brokerdesk_runtime;
GRANT EXECUTE ON FUNCTION brokerdesk_private.current_user_id() TO brokerdesk_runtime;
GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_tenant(TEXT) TO brokerdesk_runtime;
GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_user(TEXT) TO brokerdesk_runtime;

-- The administrative worker receives no explicit business-table grants. The
-- migration owner relationship required by 20260908 is checked above and is
-- limited to definer/trigger execution; runtime access remains RLS-scoped.
GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_admin;
GRANT EXECUTE ON FUNCTION brokerdesk_private.sync_external_auth_user(TEXT, TEXT, TEXT) TO brokerdesk_admin;
GRANT EXECUTE ON FUNCTION brokerdesk_private.suspend_external_auth_user(TEXT) TO brokerdesk_admin;
GRANT EXECUTE ON FUNCTION brokerdesk_private.claim_next_import_jobs(INTEGER) TO brokerdesk_admin;
GRANT EXECUTE ON FUNCTION brokerdesk_private.claim_import_job_by_id(TEXT) TO brokerdesk_admin;

-- New tables must be added explicitly in a migration with RLS and grants.
-- Do not add blanket ALTER DEFAULT PRIVILEGES grants here: safe failure is
-- preferable to accidentally exposing a future tenant table.
