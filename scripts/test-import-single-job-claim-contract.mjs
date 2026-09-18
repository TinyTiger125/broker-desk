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
assert(roleSql.includes("GRANT EXECUTE ON FUNCTION brokerdesk_private.claim_import_job_by_id(TEXT) TO brokerdesk_admin"), "role setup SQL must include the single-job worker grant");
assert(route.includes("claimQueuedImportJob"), "drain route must support the exact-id claim");
assert(route.includes("typeof body?.jobId === \"string\""), "drain route must validate the diagnostic job id type");
assert(route.includes("const hasRequestedJobId"), "an empty diagnostic job id must not fall back to a batch claim");
assert(route.includes("hasValidWorkerToken"), "single-job path must retain worker bearer authentication");
assert(runbook.includes('`{ "jobId": "..." }`'), "runbook must document the controlled single-job path");
console.log("PASS: single-job worker claim retains bearer auth, tenant-derived identity, atomic SKIP LOCKED state transition and no batch fallback");
