#!/usr/bin/env node
/*
 * Local-only PostgreSQL regression for the real object-import retry repository
 * function. The fixture is temporary and is removed before exit. No model
 * provider is called and no parent integration jobs are touched.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import ts from "typescript";

const ownerConnectionString = process.env.DATABASE_DEVELOPMENT_URL?.trim();
if (!ownerConnectionString) throw new Error("DATABASE_DEVELOPMENT_URL must explicitly name the isolated local PostgreSQL database.");
if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") throw new Error("retry regression is local-only");

const evidencePath = process.env.BROKER_DESK_RETRY_PG_EVIDENCE_PATH?.trim() || "/private/tmp/brokerdesk-object-retry-pg-evidence.json";
const source = readFileSync(new URL("../src/lib/data.postgres.ts", import.meta.url), "utf8");
assert.match(source, /FOR UPDATE OF t,j/, "retry must lock job and target together");
assert.match(source, /status IN \('failed','conflict'\)/, "retry must be limited to failed/conflict targets");
assert.match(source, /final_source IS DISTINCT FROM 'human'/, "retry must reset only model-owned candidates");
assert.match(source, /sourceAttachmentId',\$1::text/, "jsonb retry metadata parameter must have an explicit text type");
assert.match(source, /throw new ObjectImportRetryRaceError\(\)/, "a zero-row lifecycle update must roll back the transaction");

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const require = createRequire(import.meta.url);
const Module = require("module");
const originalResolve = Module._resolveFilename;
const resolveCandidate = (value) => [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`]
  .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
Module._resolveFilename = function(request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  fileName: filename,
}).outputText, filename);
require.extensions[".tsx"] = require.extensions[".ts"];
const originalLoad = Module._load;
Module._load = function(request, parent, ...rest) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, ...rest);
};

const runtimeConnectionString = `${ownerConnectionString}${ownerConnectionString.includes("?") ? "&" : "?"}options=-c%20role%3Dbrokerdesk_runtime`;
process.env.DATA_DRIVER = "postgres";
process.env.BROKER_DESK_AUTH_MODE = "trusted_header";
process.env.BROKER_DESK_TEST_REQUEST_SCOPE = "1";
process.env.NODE_ENV = "development";
process.env.BROKER_DESK_DEPLOYMENT_ENV = "staging";
process.env.DATABASE_DEVELOPMENT_URL = runtimeConnectionString;
delete process.env.DATABASE_URL;

const repository = require(resolve(root, "src/lib/data.postgres.ts"));
const { Client } = pg;
const admin = new Client(ownerConnectionString);
await admin.connect();
const evidence = { localOnly: true, repositoryFunction: "src/lib/data.postgres.ts#retryObjectImportTarget", role: null, checks: [] };
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const propertyRow = (await admin.query("SELECT id FROM properties WHERE tenant_id='tenant_cherry' AND current_owner_user_id='user_demo' ORDER BY id LIMIT 1")).rows[0];
if (!propertyRow?.id) throw new Error("isolated local fixture must contain an owned property");
const propertyId = propertyRow.id;
const clientRow = (await admin.query("SELECT id FROM clients WHERE tenant_id='tenant_cherry' AND current_owner_user_id='user_demo' ORDER BY id LIMIT 1")).rows[0];
if (!clientRow?.id) throw new Error("isolated local fixture must contain an owned client");
const clientId = clientRow.id;
const ids = {
  job: `retry_repo_job_${suffix}`,
  source: `retry_repo_source_${suffix}`,
  target: `retry_repo_target_${suffix}`,
  human: `retry_repo_human_${suffix}`,
  draft: `retry_repo_draft_${suffix}`,
  rollbackJob: `retry_repo_rollback_job_${suffix}`,
  rollbackSource: `retry_repo_rollback_source_${suffix}`,
  rollbackTarget: `retry_repo_rollback_target_${suffix}`,
  rollbackHuman: `retry_repo_rollback_human_${suffix}`,
  rollbackDraft: `retry_repo_rollback_draft_${suffix}`,
  customerJob: `retry_repo_customer_job_${suffix}`,
  customerSource: `retry_repo_customer_source_${suffix}`,
  customerTarget: `retry_repo_customer_target_${suffix}`,
  customerField: `retry_repo_customer_field_${suffix}`,
  customerHumanJob: `retry_repo_customer_human_job_${suffix}`,
  customerHumanSource: `retry_repo_customer_human_source_${suffix}`,
  customerHumanTarget: `retry_repo_customer_human_target_${suffix}`,
  customerHumanField: `retry_repo_customer_human_field_${suffix}`,
};
const triggerName = `retry_block_${suffix.replace(/[^a-z0-9_]/gi, "_")}`;
const functionName = `${triggerName}_fn`;

const makeNotes = (targetVersion) => JSON.stringify({
  objectImport: { targetObjectType: "property", targetObjectId: propertyId, targetVersion, documentType: "registry" },
  objectReader: { documentType: "registry", pages: [{ pageNumber: 1, lines: ["old source"] }], candidates: [], processingMetadata: { provider: "old-provider", model: "old-model", usage: { input_tokens: 7 } } },
});

async function insertFixture({ jobId, sourceId, targetId, humanId, draftId, targetVersion = "old-version" }) {
  await admin.query(
    `INSERT INTO import_jobs (id,tenant_id,user_id,source_type,title,target_entity,status,notes)
     VALUES ($1,'tenant_cherry','user_demo','scan','retry repository regression','parties','mapped',$2)`,
    [jobId, makeNotes(targetVersion)],
  );
  await admin.query(
    `INSERT INTO attachments (id,tenant_id,user_id,target_type,target_id,file_name,file_type,file_size_bytes,storage_path)
     VALUES ($1,'tenant_cherry','user_demo','import_job',$2,'retry.pdf','application/pdf',4,$3)`,
    [sourceId, jobId, `postgres-private://tenant_cherry/${sourceId}`],
  );
  await admin.query(
    `INSERT INTO private_attachment_blobs (attachment_id,tenant_id,content,sha256)
     VALUES ($1,'tenant_cherry',decode('25504446','hex'),'fixture')`, [sourceId],
  );
  await admin.query(
    `INSERT INTO object_import_targets (id,tenant_id,user_id,case_id,import_job_id,target_type,target_id,target_version,document_type,source_attachment_id,status,idempotency_key,attempt_count,error_code,error_summary)
     VALUES ($1,'tenant_cherry','user_demo',NULL,$2,'property',$3,$4,'registry',$5,'conflict',$1,1,'object_reader_ambiguous_subject','old subject conflict')`,
    [targetId, jobId, propertyId, targetVersion, sourceId],
  );
  await admin.query(
    `INSERT INTO object_import_fields (id,tenant_id,object_import_target_id,field_key,model_value,model_confidence,model_source,final_value,final_source,status)
     VALUES ($1,'tenant_cherry',$3,'name','old candidate',0.2,'{}'::jsonb,'human value','human','confirmed'),
            ($2,'tenant_cherry',$3,'address','old address',0.2,'{}'::jsonb,NULL,NULL,'conflict')`,
    [humanId, draftId, targetId],
  );
}

async function insertStandaloneCustomerFixture({ jobId, sourceId, targetId, fieldId, attemptCount = 1, human = false }) {
  const notes = JSON.stringify({ objectImport: { targetObjectType: "party", targetObjectId: clientId, targetVersion: "customer-old-version" } });
  await admin.query(
    `INSERT INTO import_jobs (id,tenant_id,user_id,source_type,title,target_entity,status,notes)
     VALUES ($1,'tenant_cherry','user_demo','scan','customer retry repository regression','parties','mapped',$2)`,
    [jobId, notes],
  );
  await admin.query(
    `INSERT INTO attachments (id,tenant_id,user_id,target_type,target_id,file_name,file_type,file_size_bytes,storage_path)
     VALUES ($1,'tenant_cherry','user_demo','import_job',$2,'customer-retry.pdf','application/pdf',4,$3)`,
    [sourceId, jobId, `postgres-private://tenant_cherry/${sourceId}`],
  );
  await admin.query(
    `INSERT INTO object_import_targets (id,tenant_id,user_id,case_id,import_job_id,target_type,target_id,target_version,document_type,source_attachment_id,status,idempotency_key,attempt_count,error_code,error_summary)
     VALUES ($1,'tenant_cherry','user_demo',NULL,$2,'party',$3,'customer-old-version',NULL,$4,'needs_review',$1,$5,'identity_no_applicant','no usable holder candidates')`,
    [targetId, jobId, clientId, sourceId, attemptCount],
  );
  await admin.query(
    `INSERT INTO object_import_fields (id,tenant_id,object_import_target_id,field_key,model_value,model_confidence,model_source,final_value,final_source,status)
     VALUES ($1,'tenant_cherry',$2,'birthDate',NULL,NULL,'{}'::jsonb,$3,$4,$5)`,
    [fieldId, targetId, human ? "1990-04-12" : null, human ? "human" : null, human ? "confirmed" : "not_found"],
  );
}

async function queryFixture(targetId, humanId, draftId) {
  return (await admin.query(
    `SELECT t.status,t.target_version,t.source_attachment_id,j.status AS job_status,j.notes,
            h.final_value AS human_value,h.final_source AS human_source,
            d.model_value AS draft_model_value,d.final_value AS draft_final_value,d.status AS draft_status
     FROM object_import_targets t
     JOIN import_jobs j ON j.id=t.import_job_id
     JOIN object_import_fields h ON h.object_import_target_id=t.id AND h.id=$2
     JOIN object_import_fields d ON d.object_import_target_id=t.id AND d.id=$3
     WHERE t.id=$1`,
    [targetId, humanId, draftId],
  )).rows[0];
}

async function runRetry(targetId, targetVersion) {
  return repository.withPostgresAuthContext("demo:user_demo", () => repository.retryObjectImportTarget({
    tenantId: "tenant_cherry", userId: "user_demo", targetId, targetVersion,
  }));
}

try {
  const role = (await admin.query("SELECT current_user, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname=current_user")).rows[0];
  evidence.role = role;
  assert.equal(role.rolsuper, true, "fixture connection is only the superuser seeder");
  const runtimeRole = (await admin.query("SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname='brokerdesk_runtime'")).rows[0];
  assert(runtimeRole && runtimeRole.rolsuper === false && runtimeRole.rolbypassrls === false, "runtime role must be constrained");
  evidence.runtimeRole = runtimeRole;

  await insertFixture({ jobId: ids.job, sourceId: ids.source, targetId: ids.target, humanId: ids.human, draftId: ids.draft });
  const [first, second] = await Promise.all([runRetry(ids.target, "new-version"), runRetry(ids.target, "new-version")]);
  const successes = [first, second].filter((result) => result.ok);
  const rejected = [first, second].filter((result) => !result.ok);
  assert.equal(successes.length, 1, "exactly one concurrent retry may enqueue");
  assert.deepEqual(rejected[0], { ok: false, reason: "already_queued" });
  const afterConcurrent = await queryFixture(ids.target, ids.human, ids.draft);
  assert.equal(afterConcurrent.status, "queued");
  assert.equal(afterConcurrent.target_version, "new-version");
  assert.equal(afterConcurrent.job_status, "queued");
  assert.equal(afterConcurrent.source_attachment_id, ids.source);
  assert.equal(afterConcurrent.human_value, "human value");
  assert.equal(afterConcurrent.human_source, "human");
  assert.equal(afterConcurrent.draft_status, "not_found");
  assert.equal(afterConcurrent.draft_model_value, null);
  const notes = JSON.parse(afterConcurrent.notes);
  assert.equal(notes.objectImport.targetVersion, "new-version");
  assert.equal(notes.objectReader.processingMetadata.provider, "old-provider");
  evidence.checks.push("real retryObjectImportTarget: two concurrent retries yield exactly one queued result and one already_queued result");
  evidence.checks.push("real repository retry preserves human candidate, source attachment, reader history, and rebased target version");

  await insertFixture({ ...ids, jobId: ids.rollbackJob, sourceId: ids.rollbackSource, targetId: ids.rollbackTarget, humanId: ids.rollbackHuman, draftId: ids.rollbackDraft });
  await admin.query(`CREATE OR REPLACE FUNCTION public.${functionName}() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN IF OLD.id = '${ids.rollbackJob}' AND NEW.status = 'queued' THEN RETURN NULL; END IF; RETURN NEW; END; $fn$`);
  await admin.query(`CREATE TRIGGER ${triggerName} BEFORE UPDATE ON import_jobs FOR EACH ROW EXECUTE FUNCTION public.${functionName}()`);
  const rolledBack = await runRetry(ids.rollbackTarget, "rollback-version");
  assert.deepEqual(rolledBack, { ok: false, reason: "already_queued" }, "zero-row job update must map to a retry race result");
  const afterRollback = await queryFixture(ids.rollbackTarget, ids.rollbackHuman, ids.rollbackDraft);
  assert.equal(afterRollback.status, "conflict");
  assert.equal(afterRollback.target_version, "old-version");
  assert.equal(afterRollback.job_status, "mapped");
  assert.equal(afterRollback.human_value, "human value");
  assert.equal(afterRollback.draft_status, "conflict");
  assert.equal(afterRollback.draft_model_value, "old address");
  evidence.checks.push("real repository transaction rolls back field reset and target update when the final job update affects zero rows");

  await insertStandaloneCustomerFixture({ jobId: ids.customerJob, sourceId: ids.customerSource, targetId: ids.customerTarget, fieldId: ids.customerField });
  const customerRetry = await runRetry(ids.customerTarget, "customer-new-version");
  assert.equal(customerRetry.ok, true, "empty standalone customer needs_review target may use its one bounded retry");
  const customerAfter = (await admin.query(
    "SELECT status,target_version FROM object_import_targets WHERE id=$1",
    [ids.customerTarget],
  )).rows[0];
  assert.equal(customerAfter.status, "queued");
  assert.equal(customerAfter.target_version, "customer-new-version");
  evidence.checks.push("real repository allows one empty standalone customer retry without a case");

  await insertStandaloneCustomerFixture({ jobId: ids.customerHumanJob, sourceId: ids.customerHumanSource, targetId: ids.customerHumanTarget, fieldId: ids.customerHumanField, human: true });
  const customerHumanRetry = await runRetry(ids.customerHumanTarget, "customer-human-version");
  assert.deepEqual(customerHumanRetry, { ok: false, reason: "not_retryable" }, "human customer decisions block empty-result recovery");
  evidence.checks.push("real repository preserves human customer decisions while rejecting empty-result recovery");
  evidence.pass = true;
} catch (error) {
  evidence.pass = false;
  evidence.failure = { message: error.message, code: error.code };
  process.exitCode = 1;
  try { await admin.query("ROLLBACK"); } catch {}
} finally {
  try { await admin.query(`DROP TRIGGER IF EXISTS ${triggerName} ON import_jobs`); } catch {}
  try { await admin.query(`DROP FUNCTION IF EXISTS public.${functionName}()`); } catch {}
  const allJobIds = [ids.job, ids.rollbackJob, ids.customerJob, ids.customerHumanJob];
  const allTargetIds = [ids.target, ids.rollbackTarget, ids.customerTarget, ids.customerHumanTarget];
  const allSourceIds = [ids.source, ids.rollbackSource, ids.customerSource, ids.customerHumanSource];
  const allFieldIds = [ids.human, ids.draft, ids.rollbackHuman, ids.rollbackDraft, ids.customerField, ids.customerHumanField];
  try { await admin.query("DELETE FROM object_import_fields WHERE id = ANY($1::text[])", [allFieldIds]); } catch {}
  try { await admin.query("DELETE FROM object_import_targets WHERE id = ANY($1::text[])", [allTargetIds]); } catch {}
  try { await admin.query("DELETE FROM private_attachment_blobs WHERE attachment_id = ANY($1::text[])", [allSourceIds]); } catch {}
  try { await admin.query("DELETE FROM attachments WHERE id = ANY($1::text[])", [allSourceIds]); } catch {}
  try { await admin.query("DELETE FROM import_jobs WHERE id = ANY($1::text[])", [allJobIds]); } catch {}
  await admin.end();
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ evidencePath, pass: evidence.pass, checks: evidence.checks, runtimeRole: evidence.runtimeRole }, null, 2));
}
