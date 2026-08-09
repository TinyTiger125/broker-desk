#!/usr/bin/env node
import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(filePath) {
  assert(fs.existsSync(filePath), `missing required file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

const packageJson = JSON.parse(read("package.json"));
const scripts = packageJson.scripts ?? {};

for (const scriptName of [
  "build",
  "lint",
  "db:migrate",
  "db:provision-runtime-roles",
  "worker:import",
  "test:production-security",
  "test:postgres-rls",
  "test:upload-validation",
  "test:request-rate-limit",
  "test:ja-terms",
]) {
  assert(scripts[scriptName], `missing required package script: ${scriptName}`);
}

for (const migration of [
  "20260727_000_baseline_schema.sql",
  "20260727_001_tenant_rls.sql",
  "20260729_002_force_tenant_rls.sql",
  "20260809_001_external_auth_lifecycle_functions.sql",
  "20260809_002_force_tenant_template_installs_rls.sql",
  "20260809_003_private_attachment_blobs.sql",
  "20260809_004_import_job_execution_state.sql",
  "20260809_005_import_worker_claim.sql",
]) {
  assert(fs.existsSync(`db/migrations/${migration}`), `missing release migration: ${migration}`);
}

const envExample = read("env.example");
for (const key of [
  "DATA_DRIVER",
  "DATABASE_URL",
  "DATABASE_ADMIN_URL",
  "BROKER_DESK_AUTH_MODE",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "ATTACHMENT_STORAGE_MODE",
  "DOCUMENT_READING_ALLOWED_HOSTS",
  "BROKER_DESK_IMPORT_WORKER_TOKEN",
  "BROKER_DESK_EDGE_RATE_LIMIT_POLICY_ID",
]) {
  assert(envExample.includes(`${key}=`), `env.example must document ${key}`);
}

const readiness = read("src/lib/production-readiness.ts");
for (const guard of [
  "assertProductionAuthReady",
  "assertProductionDataStoreReady",
  "assertProductionAttachmentStorageReady",
  "assertProductionDocumentReaderReady",
  "assertProductionImportWorkerReady",
  "assertProductionRateLimitReady",
]) {
  assert(readiness.includes(guard), `missing production guard: ${guard}`);
}

const workerRoute = read("src/app/api/internal/import-jobs/drain/route.ts");
assert(workerRoute.includes("timingSafeEqual"), "import worker route must compare the token safely");
assert(workerRoute.includes("claimQueuedImportJobs"), "import worker route must claim jobs atomically");
assert(workerRoute.includes("withWorkerRepositoryIdentity"), "import worker must execute inside tenant scope");

for (const filePath of [
  "docs/operations/PUBLIC_BETA_RELEASE_GATE.md",
  "docs/operations/IMPORT_WORKER_RUNBOOK.md",
  "docs/operations/REMOTE_DOCUMENT_READER_CONTRACT.md",
  "docs/engineering/POSTGRES_SETUP.md",
]) {
  read(filePath);
}

console.log("[PASS] public-beta structural readiness: scripts, migrations, fail-closed guards and runbooks are present");
