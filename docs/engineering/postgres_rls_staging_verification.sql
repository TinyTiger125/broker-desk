-- Broker Desk RLS staging verification (read-only)
--
-- Run this only against a dedicated Staging database after the application has
-- implemented request-scoped database binding. Connect as the web application's
-- runtime role, never as the migration role, table owner, superuser, or a role
-- with BYPASSRLS.
--
-- Usage:
-- psql "$STAGING_RUNTIME_DATABASE_URL" \
--   -v subject_a='user_xxx' \
--   -v tenant_a='tenant_xxx' \
--   -v tenant_b='tenant_yyy' \
--   -v case_a='case_xxx' \
--   -v case_b='case_yyy' \
--   -v attachment_b='attachment_yyy' \
--   -f docs/engineering/postgres_rls_staging_verification.sql
--
-- Test data requirement:
-- - subject_a is an active member of tenant_a and not a member of tenant_b.
-- - case_a belongs to tenant_a.
-- - case_b and attachment_b belong to tenant_b.
--
-- This script intentionally performs no writes. Pair it with the API-level
-- write/download tests required by the P0 production runbook.

\if :{?subject_a}
\else
  \echo 'Missing required psql variable: subject_a'
  \quit
\endif
\if :{?tenant_a}
\else
  \echo 'Missing required psql variable: tenant_a'
  \quit
\endif
\if :{?tenant_b}
\else
  \echo 'Missing required psql variable: tenant_b'
  \quit
\endif
\if :{?case_a}
\else
  \echo 'Missing required psql variable: case_a'
  \quit
\endif
\if :{?case_b}
\else
  \echo 'Missing required psql variable: case_b'
  \quit
\endif
\if :{?attachment_b}
\else
  \echo 'Missing required psql variable: attachment_b'
  \quit
\endif

\set ON_ERROR_STOP on

\echo '1. Runtime role must not bypass RLS or own tenant-scoped business tables.'
SELECT current_user AS runtime_role,
       r.rolbypassrls AS runtime_role_bypasses_rls,
       r.rolsuper AS runtime_role_is_superuser
FROM pg_roles r
WHERE r.rolname = current_user;

SELECT c.relname AS tenant_table,
       pg_get_userbyid(c.relowner) AS table_owner,
       (c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)) AS runtime_role_owns_table,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname IN ('brokerage_cases', 'attachments', 'clients', 'properties')
ORDER BY c.relname;

\echo '2. Subject A can see its own tenant and cannot discover tenant B.'
BEGIN;
SELECT set_config('app.external_auth_subject', :'subject_a', true) AS bound_subject;
SELECT current_setting('app.external_auth_subject', true) AS transaction_subject;

SELECT id, name
FROM tenants
WHERE id = :'tenant_a';

SELECT count(*) AS tenant_b_visible_to_subject_a_expected_zero
FROM tenants
WHERE id = :'tenant_b';

SELECT id, case_title, tenant_id
FROM brokerage_cases
WHERE id = :'case_a';

SELECT count(*) AS tenant_b_case_visible_to_subject_a_expected_zero
FROM brokerage_cases
WHERE id = :'case_b';

SELECT count(*) AS tenant_b_attachment_visible_to_subject_a_expected_zero
FROM attachments
WHERE id = :'attachment_b';
COMMIT;

\echo '3. The local identity setting must not leak after COMMIT.'
SELECT current_setting('app.external_auth_subject', true) AS subject_after_commit_expected_empty;

\echo 'Pass conditions:'
\echo '- runtime_role_bypasses_rls = f, runtime_role_is_superuser = f, and runtime_role_owns_table = f.'
\echo '- rls_enabled = t and rls_forced = t for tenant-scoped business tables.'
\echo '- Subject A can read tenant_a/case_a but each tenant B count is 0.'
\echo '- subject_after_commit is empty or NULL.'
