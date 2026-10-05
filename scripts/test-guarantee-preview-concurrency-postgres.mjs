import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { Client } from "pg";
import ts from "typescript";
import { runPostgresMigrations } from "./run-postgres-migrations.mjs";

const postgresBin = "/opt/homebrew/opt/postgresql@16/bin";
assert.ok(existsSync(join(postgresBin, "initdb")), "local PostgreSQL 16 is required");
const root = mkdtempSync(join(tmpdir(), "brokerdesk-guarantee-concurrency-pg-"));
const dataDir = join(root, "data");
const logPath = join(root, "postgres.log");
const port = 55449;
const run = (name, args) => execFileSync(join(postgresBin, name), args, { encoding: "utf8", env: { PATH: `${postgresBin}:/usr/bin:/bin`, LANG: "C", HOME: process.env.HOME } });
const connect = async (database) => {
  const client = new Client({ connectionString: `postgresql://qa_initializer@127.0.0.1:${port}/${database}`, connectionTimeoutMillis: 5000 });
  await client.connect();
  return client;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadTypeScriptModule(filename, cache = new Map()) {
  const absolute = resolve(filename);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const module = { exports: {} };
  cache.set(absolute, module);
  const output = ts.transpileModule(readFileSync(absolute, "utf8"), {
    fileName: absolute,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = createRequire(absolute);
  const resolveAlias = (request) => {
    const target = resolve(process.cwd(), "src", request.slice(2));
    return [target, `${target}.ts`, `${target}.tsx`, `${target}.mjs`, `${target}.js`].find((candidate) => existsSync(candidate));
  };
  const requireFromModule = (request) => {
    if (request.startsWith("@/")) return loadTypeScriptModule(resolveAlias(request), cache);
    if (request.startsWith(".")) {
      const target = resolve(dirname(absolute), request);
      const candidate = [target, `${target}.ts`, `${target}.tsx`, `${target}.mjs`, `${target}.js`].find((value) => existsSync(value));
      if (candidate?.endsWith(".ts") || candidate?.endsWith(".tsx")) return loadTypeScriptModule(candidate, cache);
      if (candidate) return localRequire(candidate);
    }
    return localRequire(request);
  };
  const wrapped = new Function("require", "module", "exports", "__filename", "__dirname", output);
  wrapped(requireFromModule, module, module.exports, absolute, dirname(absolute));
  return module.exports;
}

let running = false;
try {
  run("initdb", ["-D", dataDir, "-U", "qa_initializer", "--no-locale", "--encoding=UTF8", "--auth-local=trust", "--auth-host=trust"]);
  run("pg_ctl", ["-D", dataDir, "-o", `-F -p ${port} -h 127.0.0.1`, "-l", logPath, "-w", "start"]);
  running = true;
  const setup = await connect("postgres");
  await setup.query("CREATE ROLE postgres NOLOGIN SUPERUSER CREATEDB CREATEROLE BYPASSRLS");
  await setup.query("CREATE DATABASE broker_desk_guarantee_concurrency OWNER qa_initializer");
  await setup.end();
  const databaseUrl = `postgresql://qa_initializer@127.0.0.1:${port}/broker_desk_guarantee_concurrency`;
  const migrationResult = await runPostgresMigrations({ databaseUrl, prepareEmptyDatabase: true, log: () => {} });
  assert.ok(migrationResult.appliedCount > 0, "isolated PostgreSQL fixture must apply the current migrations");

  process.env.NODE_ENV = "development";
  process.env.BROKER_DESK_DEPLOYMENT_ENV = "staging";
  process.env.DATABASE_DEVELOPMENT_URL = databaseUrl;
  delete process.env.DATABASE_URL;
  const repository = loadTypeScriptModule("src/lib/data.postgres.ts");
  const tenantId = "tenant_cherry";
  const actorUserId = "pg_guarantee_actor";
  await repository.getGuaranteePreviewConfirmation({ tenantId, id: "pg_schema_probe", actorUserId });
  const verify = await connect("broker_desk_guarantee_concurrency");
  await verify.query("INSERT INTO tenants (id, name, slug, account_type, status, purchased_seat_count) VALUES ('tenant_cherry', 'PG Guarantee Tenant', 'pg-guarantee-tenant', 'company', 'active', 10)");
  await verify.query("INSERT INTO users (id, name, email, password_hash) VALUES ('pg_guarantee_actor', 'PG Guarantee Actor', 'pg-guarantee@example.invalid', 'fixture')");
  await verify.query("INSERT INTO guarantee_blank_forms (id, tenant_id, name, created_by_user_id) VALUES ('pg-blank-form', 'tenant_cherry', 'PG blank form', 'pg_guarantee_actor')");
  await verify.query("INSERT INTO attachments (id, tenant_id, user_id, target_type, target_id, file_name, file_type, file_size_bytes) VALUES ('pg-blank-attachment', 'tenant_cherry', 'pg_guarantee_actor', 'guarantee_blank_form', 'pg-blank-form', 'blank.pdf', 'application/pdf', 12)");
  await verify.query("INSERT INTO guarantee_blank_form_versions (id, blank_form_id, tenant_id, attachment_id, uploaded_by_user_id, version_number, sha256, file_size_bytes, page_count, page_width, page_height, status) VALUES ('pg-blank-v1', 'pg-blank-form', 'tenant_cherry', 'pg-blank-attachment', 'pg_guarantee_actor', 1, 'pg-blank-sha', 12, 1, 300, 200, 'ready')");
  await verify.query("UPDATE guarantee_blank_forms SET active_version_id = 'pg-blank-v1' WHERE id = 'pg-blank-form'");
  await verify.query("INSERT INTO guarantee_company_masks (id, tenant_id, blank_form_id, created_by_user_id) VALUES ('pg-mask', 'tenant_cherry', 'pg-blank-form', 'pg_guarantee_actor')");
  await verify.query("INSERT INTO guarantee_company_mask_versions (id, mask_id, tenant_id, blank_form_id, blank_form_version_id, version_number, status, field_catalog_version, layout_snapshot, created_by_user_id) VALUES ('pg-mask-v1', 'pg-mask', 'tenant_cherry', 'pg-blank-form', 'pg-blank-v1', 1, 'published', 'pg-fields-v1', '{\"fields\":[]}', 'pg_guarantee_actor')");
  await verify.query("UPDATE guarantee_company_masks SET active_version_id = 'pg-mask-v1' WHERE id = 'pg-mask'");
  await verify.end();
  const baseConfirmation = {
    tenantId,
    actorUserId,
    caseId: "pg_guarantee_case",
    caseInputSnapshotHash: "pg-case-hash",
    blankFormVersionId: "pg-blank-v1",
    blankFormSha256: "pg-blank-sha",
    companyMaskVersionId: "pg-mask-v1",
    fieldCatalogVersion: "pg-fields-v1",
    supplementSnapshot: { consent: true },
    supplementHash: "pg-supplement-hash",
  };
  const outputInput = (confirmationId, fileAttachmentId) => ({
    tenantId,
    userId: actorUserId,
    actorId: actorUserId,
    outputType: "guarantee_application",
    outputFormat: "pdf",
    language: "ja",
    title: "PG guarantee concurrency",
    documentNumber: `PG-GUARANTEE-${confirmationId}`,
    caseId: "pg_guarantee_case",
    draftValueSnapshot: { consent: true },
    layoutSnapshot: { fields: [] },
    fileAttachmentId,
    fileSha256: "provider-sha",
    fileSizeBytes: 12,
    fileMimeType: "application/pdf",
    blankFormVersionId: "pg-blank-v1",
    blankFormSha256: "pg-blank-sha",
    companyMaskVersionId: "pg-mask-v1",
    fieldCatalogVersion: "pg-fields-v1",
    caseInputSnapshotHash: "pg-case-hash",
  });
  async function runGenerationAttempt(confirmationId, provider, fail = false) {
    const claimResult = await repository.claimGuaranteePreviewConfirmation({ tenantId, id: confirmationId, actorUserId, leaseMs: 5_000 });
    if (claimResult.kind !== "claimed") return { kind: claimResult.kind };
    try {
      const bytes = await provider();
      if (fail) throw new Error("synthetic_provider_failure");
      const finalized = await repository.finalizeGuaranteePreviewOutput({
        confirmationId,
        processingToken: claimResult.confirmation.processingToken,
        output: outputInput(confirmationId, undefined),
      });
      return { kind: "completed", output: finalized.output };
    } catch (error) {
      await repository.releaseGuaranteePreviewConfirmation({ tenantId, id: confirmationId, actorUserId, processingToken: claimResult.confirmation.processingToken });
      return { kind: "failed", error };
    }
  }

  assert.equal((await repository.claimGuaranteePreviewConfirmation({ tenantId, id: "missing-guarantee-confirmation", actorUserId })).kind, "not_found", "PostgreSQL missing confirmation must remain distinguishable from active processing");
  const expiredConfirmation = await repository.createGuaranteePreviewConfirmation({ ...baseConfirmation, expiresAt: new Date(Date.now() - 1_000) });
  assert.equal((await repository.claimGuaranteePreviewConfirmation({ tenantId, id: expiredConfirmation.id, actorUserId })).kind, "expired", "PostgreSQL expired confirmation must require a new preview");

  const delayed = await repository.createGuaranteePreviewConfirmation({ ...baseConfirmation, expiresAt: new Date(Date.now() + 60_000) });
  let delayedProviderCalls = 0;
  const delayedProvider = async () => { delayedProviderCalls += 1; await wait(40); return Buffer.from("delayed-provider"); };
  const delayedResults = await Promise.all([
    runGenerationAttempt(delayed.id, delayedProvider),
    runGenerationAttempt(delayed.id, delayedProvider),
  ]);
  assert.equal(delayedProviderCalls, 1, "PostgreSQL two concurrent requests must invoke the provider exactly once");
  assert.equal(delayedResults.filter((result) => result.kind === "completed").length, 1, "PostgreSQL delayed request must have one winner");
  assert.equal(delayedResults.filter((result) => result.kind === "processing").length, 1, "PostgreSQL overlap must remain processing");

  const delayedOutputs = await repository.listGeneratedOutputsForTenant({ tenantId });
  assert.equal(delayedOutputs.filter((output) => output.previewConfirmationId === delayed.id).length, 1, "PostgreSQL delayed request must persist one output record");
  const delayedStatus = await repository.getGuaranteePreviewConfirmation({ tenantId, id: delayed.id, actorUserId });
  assert.equal(delayedStatus?.status, "consumed", "PostgreSQL delayed request must retain completed confirmation state");

  const failure = await repository.createGuaranteePreviewConfirmation({ ...baseConfirmation, expiresAt: new Date(Date.now() + 60_000) });
  let failureProviderCalls = 0;
  const failingProvider = async () => { failureProviderCalls += 1; await wait(10); return Buffer.from("failing-provider"); };
  assert.equal((await runGenerationAttempt(failure.id, failingProvider, true)).kind, "failed", "PostgreSQL provider failure must release the lease");
  assert.equal((await repository.getGuaranteePreviewConfirmation({ tenantId, id: failure.id, actorUserId }))?.status, "issued", "PostgreSQL failed attempt must be retryable");
  assert.equal((await runGenerationAttempt(failure.id, failingProvider)).kind, "completed", "PostgreSQL failed attempt must recover on retry");
  assert.equal(failureProviderCalls, 2, "PostgreSQL failure plus retry must call provider once per attempt");
  const failureOutputs = await repository.listGeneratedOutputsForTenant({ tenantId });
  assert.equal(failureOutputs.filter((output) => output.previewConfirmationId === failure.id).length, 1, "PostgreSQL failure recovery must persist one output record");

  console.log("[PASS] isolated PostgreSQL guarantee generation: delayed concurrent requests, processing status, failure release/retry, provider call counts, and exactly-one output records");
} finally {
  const pool = globalThis.__brokerDeskPostgresPool;
  if (pool) await pool.end().catch(() => undefined);
  if (running) run("pg_ctl", ["-D", dataDir, "-m", "immediate", "-w", "stop"]);
  rmSync(root, { recursive: true, force: true });
}
