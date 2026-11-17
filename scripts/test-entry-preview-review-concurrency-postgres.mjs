#!/usr/bin/env node
/*
 * Local-only PostgreSQL 17 regression for direct-entry review graph ownership.
 * This test uses only synthetic rows in the explicitly supplied development
 * database. It does not read source files, model output, or production data.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ownerUrl = process.env.DATABASE_DEVELOPMENT_URL?.trim();
const secret = process.env.BROKER_DESK_AUTH_TRUSTED_HEADER_SECRET?.trim();
if (!ownerUrl || !secret) throw new Error("DATABASE_DEVELOPMENT_URL and BROKER_DESK_AUTH_TRUSTED_HEADER_SECRET are required");
const ownerUrlParsed = new URL(ownerUrl);
if (!(ownerUrlParsed.hostname === "127.0.0.1" || ownerUrlParsed.hostname === "localhost") || ownerUrlParsed.port !== "55473" || !ownerUrlParsed.pathname.endsWith("/broker_desk_local_intake")) {
  throw new Error("This regression is restricted to the isolated broker_desk_local_intake PostgreSQL port 55473");
}

process.env.DATA_DRIVER = "postgres";
process.env.BROKER_DESK_AUTH_MODE = "trusted_header";
process.env.BROKER_DESK_AUTH_TRUSTED_HEADER_SECRET = secret;
process.env.BROKER_DESK_TEST_REQUEST_SCOPE = "1";
process.env.NODE_ENV = "development";
process.env.DATABASE_DEVELOPMENT_URL = `${ownerUrl}${ownerUrl.includes("?") ? "&" : "?"}options=-c%20role%3Dbrokerdesk_runtime`;
process.env.DATABASE_URL = process.env.DATABASE_DEVELOPMENT_URL;

const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;
const resolveCandidate = (value) => [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`]
  .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
Module._resolveFilename = function(request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
require.extensions[".ts"] = (mod, filename) => mod._compile(typescript.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: filename,
}).outputText, filename);
const originalLoad = Module._load;
Module._load = function(request, parent, ...rest) {
  if (request === "server-only") return {};
  if (request === "next/headers") return { headers: async () => new Headers({
    "x-brokerdesk-auth-secret": secret,
    "x-brokerdesk-auth-subject": "demo:user_demo",
    "x-brokerdesk-auth-email": "demo@brokerdesk.local",
    "x-brokerdesk-auth-name": "Local Intake Owner",
  }) };
  return originalLoad.call(this, request, parent, ...rest);
};

const data = require(resolve(root, "src/lib/data.ts"));
const { registerTenantSessionProvenance } = require(resolve(root, "src/lib/tenant-session-provenance.ts"));
const { persistEntryPreviewReviewTarget } = require(resolve(root, "src/lib/entry-preview-proof.ts"));
const owner = new pg.Client({ connectionString: ownerUrl });
const prefix = `pg-entry-graph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = "tenant_cherry";
const userId = "user_demo";
let clientId = "";
let attachmentId = "";

async function countSynthetic() {
  const { rows } = await owner.query(`
    SELECT
      (SELECT count(*)::int FROM import_jobs WHERE tenant_id=$1 AND (idempotency_key LIKE $2 OR (pg_input_is_valid(notes, 'jsonb') AND notes::jsonb->>'targetId'=$4))) AS jobs,
      (SELECT count(*)::int FROM object_import_targets WHERE tenant_id=$1 AND (idempotency_key LIKE $2 OR source_attachment_id=$3)) AS targets,
      (SELECT count(*)::int FROM object_import_fields WHERE tenant_id=$1 AND object_import_target_id IN (SELECT id FROM object_import_targets WHERE tenant_id=$1 AND (idempotency_key LIKE $2 OR source_attachment_id=$3))) AS fields
  `, [tenantId, `${prefix}%`, attachmentId, clientId]);
  return rows[0];
}

async function cleanup() {
  await owner.query("BEGIN");
  try {
    await owner.query("DELETE FROM object_import_fields WHERE tenant_id=$1 AND object_import_target_id IN (SELECT id FROM object_import_targets WHERE tenant_id=$1 AND (idempotency_key LIKE $2 OR source_attachment_id=$3))", [tenantId, `${prefix}%`, attachmentId]);
    await owner.query("DELETE FROM object_import_targets WHERE tenant_id=$1 AND (idempotency_key LIKE $2 OR source_attachment_id=$3)", [tenantId, `${prefix}%`, attachmentId]);
    await owner.query("DELETE FROM import_jobs WHERE tenant_id=$1 AND (idempotency_key LIKE $2 OR (pg_input_is_valid(notes, 'jsonb') AND notes::jsonb->>'targetId'=$3))", [tenantId, `${prefix}%`, clientId]);
    if (attachmentId) {
      await owner.query("DELETE FROM private_attachment_blobs WHERE tenant_id=$1 AND attachment_id=$2", [tenantId, attachmentId]);
      await owner.query("DELETE FROM attachments WHERE tenant_id=$1 AND id=$2", [tenantId, attachmentId]);
    }
    if (clientId) await owner.query("DELETE FROM clients WHERE tenant_id=$1 AND id=$2", [tenantId, clientId]);
    await owner.query("COMMIT");
  } catch (error) {
    await owner.query("ROLLBACK");
    throw error;
  }
}

try {
  await owner.connect();
  const version = (await owner.query("SHOW server_version_num")).rows[0].server_version_num;
  assert.equal(String(version).slice(0, 2), "17", "the concurrency evidence must run on PostgreSQL 17");
  const before = await countSynthetic();
  assert.deepEqual(before, { jobs: 0, targets: 0, fields: 0 });

  const client = await data.addClient({
    tenantId, ownerUserId: userId, name: `${prefix} holder`, phone: "000-0000-0000", budgetType: "total_price", purpose: "buy",
    loanPreApprovalStatus: "not_applied", stage: "lead", temperature: "cold", brokerageContractType: "none", amlCheckStatus: "not_required",
  });
  clientId = client.id;
  const attachment = await data.addPrivateAttachment({
    tenantId, userId, targetType: "party", targetId: clientId,
    fileName: `${prefix}.pdf`, fileType: "application/pdf", content: Buffer.from(`${prefix}-opaque`),
  });
  attachmentId = attachment.id;
  const marker = JSON.stringify({ kind: "entry_preview_review", marker: "brokerdesk:entry-preview-review", targetId: clientId, attachmentId });
  const input = {
    tenantId, userId, targetId: clientId, targetVersion: "synthetic-version-1", attachmentId, marker,
    idempotencyKey: `${prefix}:same-key`, title: "synthetic direct review",
  };

  // The unique constraints are the interleaving fence: one caller inserts the
  // graph and the other waits, then replays it with explicit false ownership.
  const [first, second] = await Promise.all([
    data.createEntryPreviewReviewGraph(input),
    data.createEntryPreviewReviewGraph(input),
  ]);
  assert.equal([first, second].filter((result) => result.createdJob && result.createdTarget).length, 1);
  assert.equal([first, second].filter((result) => !result.createdJob && !result.createdTarget).length, 1);
  assert.equal((await countSynthetic()).jobs, 1);
  assert.equal((await countSynthetic()).targets, 1);

  // Full persistence interleave: A owns and creates the graph; B starts only
  // after that commit, replays the same key, then fails during candidate
  // persistence. A is released afterwards and must retain its job, target,
  // and fields; B must not clean A's graph.
  const tenant = await data.getTenantById(tenantId);
  const user = await data.getUserById(userId);
  const membership = (await data.listTenantMemberships(userId)).find((item) => item.tenantId === tenantId && item.status === "active");
  assert(tenant && user && membership);
  const session = { tenant, user, membership, externalAuthSubject: user.externalAuthSubject };
  registerTenantSessionProvenance(session);
  const replayContent = Buffer.from(`${prefix}-replay-proof`);
  const replayDigest = (await import("node:crypto")).createHash("sha256").update(replayContent).digest("hex");
  const replayProof = {
    tenantId, userId, fileKey: `${prefix}.pdf:1`, digest: replayDigest, kind: "customer", context: "entry",
    expiresAt: Date.now() + 60_000,
    candidates: [
      { id: `${prefix}-address`, key: "currentAddress", sourceKey: "applicant.currentAddress", label: "address", value: "Synthetic Tokyo 1-2-3", fileName: `${prefix}.pdf`, fileKey: `${prefix}.pdf:1`, pageNumber: 1, sourceText: "Address: Synthetic Tokyo 1-2-3", pageEvidenceVerified: true, uncertainty: "clear", confidence: 0.99 },
      { id: `${prefix}-latin`, key: "nameLatin", sourceKey: "applicant.nameLatin", label: "name", value: "SYNTHETIC HOLDER", fileName: `${prefix}.pdf`, fileKey: `${prefix}.pdf:1`, pageNumber: 1, sourceText: "Name: SYNTHETIC HOLDER", pageEvidenceVerified: true, uncertainty: "unclear", confidence: 0.6 },
    ],
  };
  const originalGraph = data.createEntryPreviewReviewGraph;
  const originalUpsert = data.upsertObjectImportCandidate;
  let graphCreatedResolve;
  let graphCreated = new Promise((resolve) => { graphCreatedResolve = resolve; });
  let firstCandidateResolve;
  let firstCandidate = new Promise((resolve) => { firstCandidateResolve = resolve; });
  let releaseA;
  const releaseAWait = new Promise((resolve) => { releaseA = resolve; });
  let firstUpsert = true;
  let aReleased = false;
  let bStarted = false;
  data.createEntryPreviewReviewGraph = async (...args) => {
    const result = await originalGraph(...args);
    if (result.createdJob) graphCreatedResolve(result);
    return result;
  };
  data.upsertObjectImportCandidate = async (...args) => {
    if (firstUpsert) {
      firstUpsert = false;
      firstCandidateResolve();
      await releaseAWait;
      aReleased = true;
      return originalUpsert(...args);
    }
    if (!aReleased && bStarted) throw new Error("synthetic_b_candidate_write_failure");
    return originalUpsert(...args);
  };
  const persistInput = { session, targetId: clientId, attachmentId, proof: replayProof, entryRequestKey: `${prefix}:persist-intent` };
  const ownerPersist = persistEntryPreviewReviewTarget(persistInput);
  await graphCreated;
  await firstCandidate;
  bStarted = true;
  const replayPersist = persistEntryPreviewReviewTarget(persistInput);
  await assert.rejects(replayPersist, /synthetic_b_candidate_write_failure/);
  releaseA();
  await ownerPersist;
  data.createEntryPreviewReviewGraph = originalGraph;
  data.upsertObjectImportCandidate = originalUpsert;
  const retained = await countSynthetic();
  assert.equal(retained.jobs, 2, "the A graph and the helper-only graph must remain distinct");
  assert.equal(retained.targets, 2, "the B replay failure must not delete A's graph");
  assert.equal(retained.fields, 2, "A's candidate fields must remain after B failure");

  // A target-create fault must roll back the completed job inserted by this
  // call. The attachment id is deliberately absent; no source row is read.
  const faultKey = `${prefix}:target-fault`;
  await assert.rejects(
    data.createEntryPreviewReviewGraph({ ...input, attachmentId: "att_missing_synthetic", marker: JSON.stringify({ kind: "entry_preview_review", marker: "brokerdesk:entry-preview-review", targetId: clientId, attachmentId: "att_missing_synthetic" }), idempotencyKey: faultKey }),
    /Object import attachment must belong to import job|entry_preview_review_target_scope_mismatch/,
  );
  const faultRows = await owner.query("SELECT count(*)::int AS jobs FROM import_jobs WHERE tenant_id=$1 AND idempotency_key=$2", [tenantId, faultKey]);
  assert.equal(faultRows.rows[0].jobs, 0, "target failure must not leave a completed orphan job");

  // A confirmed candidate blocks cleanup even when a creator reports a later
  // candidate-write failure. This is the destructive-action stop condition.
  const graph = first.createdJob ? first : second;
  const field = await data.upsertObjectImportCandidate({
    id: `${graph.target.id}:nameLatin`, tenantId, targetId: graph.target.id, fieldKey: "nameLatin",
    candidateValue: "SYNTHETIC HOLDER", provenance: { source: "local-regression", pageEvidenceVerified: true },
    finalValue: "SYNTHETIC HOLDER", finalSource: "human", status: "confirmed",
  });
  assert(field);
  const cleaned = await data.cleanupEntryPreviewReviewArtifacts({
    tenantId, userId, importJobId: graph.job.id, targetId: graph.target.id,
    partyId: clientId, attachmentId,
  });
  assert.equal(cleaned, false, "human confirmation must prevent graph cleanup");
  assert.equal((await countSynthetic()).targets, 2);
  console.log(JSON.stringify({ postgresMajor: 17, concurrent: "one creator + one replay", replayCandidateFailureRetained: true, targetFaultRollback: true, humanCleanupGuard: true, syntheticOnly: true }));
} finally {
  try { await cleanup(); } finally { await owner.end(); }
}
