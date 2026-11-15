import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../db/migrations/20261116_001_entry_upload_staging.sql", import.meta.url), "utf8");
const aclFixMigration = await readFile(new URL("../db/migrations/20261116_002_entry_upload_staging_acl_fix.sql", import.meta.url), "utf8");
const stagingMigrations = `${migration}\n${aclFixMigration}`;
const route = await readFile(new URL("../src/app/api/entry-staging/route.ts", import.meta.url), "utf8");
const cron = await readFile(new URL("../src/app/api/internal/import-jobs/cron/route.ts", import.meta.url), "utf8");
const client = await readFile(new URL("../src/lib/entry-upload-staging-client.ts", import.meta.url), "utf8");
const contract = await readFile(new URL("../src/lib/entry-upload-staging-contract.ts", import.meta.url), "utf8");
const postgres = await readFile(new URL("../src/lib/data.postgres.ts", import.meta.url), "utf8");
const entryPreview = await readFile(new URL("../src/components/entry-preview.tsx", import.meta.url), "utf8");
const clientForm = await readFile(new URL("../src/components/client-form.tsx", import.meta.url), "utf8");
const localRuntime = await readFile(new URL("../scripts/start-local-intake-runtime.mjs", import.meta.url), "utf8");
const roleProvisioner = await readFile(new URL("../scripts/provision-postgres-runtime-roles.mjs", import.meta.url), "utf8");
const rlsReadiness = await readFile(new URL("../scripts/check-postgres-rls-readiness.mjs", import.meta.url), "utf8");

for (const table of ["entry_upload_staging", "entry_upload_staging_chunks"]) {
  assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
  assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY`));
}
assert.match(stagingMigrations, /parent\.tenant_id = public\.entry_upload_staging_chunks\.tenant_id/);
assert.match(stagingMigrations, /entry_upload_staging_chunks_worker_delete[\s\S]*FOR DELETE TO brokerdesk_admin/);
assert.match(stagingMigrations, /entry_upload_staging_worker_update[\s\S]*FOR UPDATE TO brokerdesk_admin/);
assert.match(stagingMigrations, /GRANT SELECT, UPDATE, DELETE ON TABLE public\.entry_upload_staging TO brokerdesk_admin/);
assert.match(stagingMigrations, /GRANT SELECT, DELETE ON TABLE public\.entry_upload_staging_chunks TO brokerdesk_admin/);
assert.match(migration, /tenant_id TEXT NOT NULL REFERENCES public\.tenants\(id\) ON DELETE CASCADE/);
assert.match(migration, /user_id TEXT NOT NULL REFERENCES public\.users\(id\) ON DELETE CASCADE/);
assert.match(migration, /chunk_size_bytes INTEGER NOT NULL CHECK \(chunk_size_bytes = 1048576\)/);
assert.match(migration, /CREATE OR REPLACE FUNCTION brokerdesk_private\.cleanup_expired_entry_upload_staging_system/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION brokerdesk_private\.cleanup_expired_entry_upload_staging_system\(INTEGER\) TO brokerdesk_admin/);
assert.match(cron, /cleanupExpiredEntryUploadStaging\(500\)/);
assert.match(route, /request\.arrayBuffer\(\)/);
assert.match(route, /ENTRY_UPLOAD_CHUNK_SIZE_BYTES/);
assert.match(route, /getIdentityDocumentUploadLimitBytes/);
assert.match(route, /entry_upload_staging_file_too_large/);
assert.match(client, /ENTRY_UPLOAD_CHUNK_SIZE_BYTES/);
assert.match(contract, /ENTRY_UPLOAD_STAGING_MAX_ACTIVE_FILES = 6/);
assert.match(contract, /ENTRY_UPLOAD_STAGING_MAX_ACTIVE_BYTES = 60 \* 1024 \* 1024/);
assert.match(postgres, /pg_advisory_xact_lock/);
assert.match(postgres, /ENTRY_UPLOAD_STAGING_MAX_ACTIVE_FILES/);
assert.match(postgres, /20261116_002_entry_upload_staging_acl_fix\.sql/);
assert.match(entryPreview, /onStagingPending/);
assert.match(clientForm, /entryStagingPending/);
assert.match(clientForm, /entryFiles\.length > 0/);
for (const script of [localRuntime, roleProvisioner]) {
  assert.match(script, /entry_upload_staging_chunks/);
  assert.match(script, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.entry_upload_staging/);
  assert.match(script, /GRANT SELECT, UPDATE, DELETE ON TABLE public\.entry_upload_staging TO brokerdesk_admin/);
  assert.match(script, /GRANT SELECT, DELETE ON TABLE public\.entry_upload_staging_chunks TO brokerdesk_admin/);
  assert.match(script, /cleanup_expired_entry_upload_staging_system\(INTEGER\).*brokerdesk_admin|cleanup_expired_entry_upload_staging_system\(INTEGER\) TO brokerdesk_admin/);
}
assert.match(rlsReadiness, /runtime role lacks/);
assert.match(rlsReadiness, /entry_upload_staging_chunks/);
assert.match(client, /method: "PUT"/);
assert.match(client, /ENTRY_UPLOAD_CHUNK_SIZE_BYTES/);
assert.doesNotMatch(client, /method: "POST"[\s\S]{0,500}uploadFile/);
console.log("Entry-upload staging contract: PASS");
