#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const migration = read("db/migrations/20260918_001_import_job_single_claim.sql");
const admin = read("src/lib/data.admin.postgres.ts");
const route = read("src/app/api/internal/import-jobs/drain/route.ts");
const runbook = read("docs/operations/IMPORT_WORKER_RUNBOOK.md");
const provision = read("scripts/provision-postgres-runtime-roles.mjs");
const roleSql = read("docs/engineering/postgres_runtime_roles.sql");

for (const marker of [
  "claim_import_job_by_id(p_job_id text)",
  "jobs.id = requested_job_id",
  "jobs.status = 'queued'",
  "jobs.source_type IN ('excel', 'scan')",
  "users.external_auth_subject IS NOT NULL",
  "FOR UPDATE OF jobs SKIP LOCKED",
  "SET status = 'processing'",
  "GRANT EXECUTE ON FUNCTION brokerdesk_private.claim_import_job_by_id(text) TO brokerdesk_admin",
]) assert(migration.includes(marker), `single-job migration missing ${marker}`);
assert(admin.includes("export async function claimQueuedImportJob"), "admin data layer must expose single-job claim");
assert(admin.includes("claim_import_job_by_id($1)"), "admin data layer must call the exact-id SQL function");
assert(admin.includes("process.env.DATABASE_ADMIN_URL"), "admin data layer must use the dedicated admin connection in production");
assert(provision.includes("GRANT EXECUTE ON FUNCTION brokerdesk_private.claim_import_job_by_id(TEXT) TO brokerdesk_admin"), "runtime role provisioning must retain the single-job worker grant after revoke-all");
// Model the explicit admin function ACL statements in their provisioning order.
// This source-only check must never execute the provisioner or read credentials.
const adminFunctionGrants = new Set();
let adminRevokeSeen = false;
for (const [, sql] of provision.matchAll(/await client\.query\("([^"\n]+)"\)/g)) {
  if (sql === "REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA brokerdesk_private FROM brokerdesk_admin") {
    adminFunctionGrants.clear();
    adminRevokeSeen = true;
  }
  const grant = sql.match(/^GRANT EXECUTE ON FUNCTION brokerdesk_private\.(.+) TO brokerdesk_admin$/);
  if (grant) {
    assert(adminRevokeSeen, "admin function grants must follow revoke-all");
    adminFunctionGrants.add(grant[1]);
  }
}
assert(adminRevokeSeen, "admin provisioning must retain its deny-by-default function reset");
assert.deepEqual([...adminFunctionGrants].sort(), [
  "can_access_tenant(TEXT)",
  "claim_import_job_by_id(TEXT)",
  "claim_next_import_jobs(INTEGER)",
  "current_user_id()",
  "suspend_external_auth_user(TEXT)",
  "sync_external_auth_user(TEXT, TEXT, TEXT)",
].sort(), "reprovisioning must restore exactly the existing four entrypoints and two preimport helpers, without raw-subject access");
assert(roleSql.includes("GRANT EXECUTE ON FUNCTION brokerdesk_private.claim_import_job_by_id(TEXT) TO brokerdesk_admin"), "role setup SQL must include the single-job worker grant");
assert(route.includes("claimQueuedImportJob"), "drain route must support the exact-id claim");
assert(route.includes("typeof body?.jobId === \"string\""), "drain route must validate the diagnostic job id type");
assert(route.includes("const hasRequestedJobId"), "an empty diagnostic job id must not fall back to a batch claim");
assert(route.includes("hasValidWorkerToken"), "single-job path must retain worker bearer authentication");
assert(runbook.includes('`{ "jobId": "..." }`'), "runbook must document the controlled single-job path");
console.log("PASS: single-job worker claim retains bearer auth, tenant-derived identity, atomic SKIP LOCKED state transition and no batch fallback");
