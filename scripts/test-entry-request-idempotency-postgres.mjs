#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import ts from "typescript";

const adminUrl = process.env.BROKER_DESK_FIXTURE_ADMIN_URL?.trim();
const runtimeUrl = process.env.BROKER_DESK_RUNTIME_URL?.trim();
if (!adminUrl || !runtimeUrl) throw new Error("BROKER_DESK_FIXTURE_ADMIN_URL and BROKER_DESK_RUNTIME_URL are required");
if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") throw new Error("local-only regression");

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
const compile = (mod, filename) => mod._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  fileName: filename,
}).outputText, filename);
require.extensions[".ts"] = compile;
require.extensions[".tsx"] = compile;
const originalLoad = Module._load;
Module._load = function(request, parent, ...rest) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, ...rest);
};

process.env.DATA_DRIVER = "postgres";
process.env.BROKER_DESK_AUTH_MODE = "trusted_header";
process.env.BROKER_DESK_TEST_REQUEST_SCOPE = "1";
process.env.NODE_ENV = "development";
process.env.BROKER_DESK_DEPLOYMENT_ENV = "staging";
process.env.DATABASE_DEVELOPMENT_URL = runtimeUrl;
delete process.env.DATABASE_URL;

const repository = require(resolve(root, "src/lib/data.postgres.ts"));
const { Client } = pg;
const admin = new Client(adminUrl);
await admin.connect();
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const keys = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const payloads = ["same-content", "same-content", "different-content", "property-content"].map((value) => createHash("sha256").update(value).digest("hex"));
const staleKey = randomUUID();
const stalePayload = createHash("sha256").update("stale-content").digest("hex");
const failedKey = randomUUID();
const formalFenceKeys = [randomUUID(), randomUUID(), randomUUID()];
const evidencePath = process.env.BROKER_DESK_ENTRY_CLAIM_EVIDENCE_PATH?.trim() || "/private/tmp/brokerdesk-entry-claim-pg-evidence.json";
const evidence = { localOnly: true, pass: false, checks: [], runtimeRole: null, claimRows: 0 };
let runtimeProbe;
const attachmentIds = [];

async function scoped(operation) {
  return repository.withPostgresAuthContext("demo:user_demo", operation);
}

try {
  const role = (await admin.query("SELECT current_user, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname=current_user")).rows[0];
  evidence.runtimeRole = (await admin.query("SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname='brokerdesk_runtime'")).rows[0];
  assert.equal(role.rolsuper, false, "fixture maintenance role must remain non-superuser");
  assert.equal(role.rolbypassrls, false, "fixture maintenance role must not bypass RLS");
  assert.equal(evidence.runtimeRole.rolsuper, false, "runtime must not be superuser");
  assert.equal(evidence.runtimeRole.rolbypassrls, false, "runtime must not bypass RLS");

  const concurrent = await Promise.all([
    scoped(() => repository.claimEntryRequest({ tenantId: "tenant_cherry", userId: "user_demo", targetType: "client", requestKey: keys[0], payloadDigest: payloads[0] })),
    scoped(() => repository.claimEntryRequest({ tenantId: "tenant_cherry", userId: "user_demo", targetType: "client", requestKey: keys[0], payloadDigest: payloads[0] })),
  ]);
  assert.equal(concurrent.filter((item) => item.state === "claimed").length, 1, "same client request has one database claim winner");
  assert.equal(concurrent.filter((item) => item.state === "in_progress").length, 1, "same client request has one visible in-progress loser");
  evidence.checks.push("two independent pooled transactions produce one claimed and one in_progress result for the same client key");

  const winner = concurrent.find((item) => item.state === "claimed");
  assert.ok(winner?.claimToken, "claim winner must receive a fencing token");
  assert.equal(await scoped(() => repository.completeEntryRequest({ tenantId: "tenant_cherry", userId: "user_demo", targetType: "client", requestKey: keys[0], claimToken: winner.claimToken, targetId: `client_claim_${suffix}` })), true);
  const replay = await scoped(() => repository.claimEntryRequest({ tenantId: "tenant_cherry", userId: "user_demo", targetType: "client", requestKey: keys[0], payloadDigest: payloads[0] }));
  assert.deepEqual(replay, { state: "existing", targetId: `client_claim_${suffix}` });
  evidence.checks.push("completed retry returns the original client target id instead of creating a second record");

  const mismatch = await scoped(() => repository.claimEntryRequest({ tenantId: "tenant_cherry", userId: "user_demo", targetType: "client", requestKey: keys[0], payloadDigest: payloads[2] }));
  assert.deepEqual(mismatch, { state: "payload_mismatch" }, "one intent cannot be reused with changed content");
  evidence.checks.push("same intent with changed file/form payload is rejected instead of being merged");

  const failedTargetId = `client_failed_${suffix}`;
  const failedClaim = await scoped(() => repository.claimEntryRequest({ tenantId: "tenant_cherry", userId: "user_demo", targetType: "client", requestKey: failedKey, payloadDigest: payloads[0], targetId: failedTargetId }));
  assert.equal(failedClaim.state, "claimed");
  assert.ok(failedClaim.claimToken);
  assert.equal(await scoped(() => repository.releaseEntryRequest({ tenantId: "tenant_cherry", userId: "user_demo", targetType: "client", requestKey: failedKey, claimToken: failedClaim.claimToken })), true);
  const correctedRetry = await scoped(() => repository.claimEntryRequest({ tenantId: "tenant_cherry", userId: "user_demo", targetType: "client", requestKey: failedKey, payloadDigest: payloads[2], targetId: `client_failed_retry_${suffix}` }));
  assert.equal(correctedRetry.state, "claimed", "a failed mounted form may retry after a corrected field changes its payload digest");
  assert.notEqual(correctedRetry.claimToken, failedClaim.claimToken, "failed retry rotates its fencing token");
  assert.equal(correctedRetry.targetId, failedTargetId, "failed retry keeps the first reserved target id for same-record recovery");
  assert.equal(await scoped(() => repository.completeEntryRequest({ tenantId: "tenant_cherry", userId: "user_demo", targetType: "client", requestKey: failedKey, claimToken: correctedRetry.claimToken, targetId: failedTargetId })), true);
  evidence.checks.push("a failed request can be retried from the same form after a corrected field changes the payload digest");

  const differentRequests = await Promise.all([
    scoped(() => repository.claimEntryRequest({ tenantId: "tenant_cherry", userId: "user_demo", targetType: "client", requestKey: keys[1], payloadDigest: payloads[1] })),
    scoped(() => repository.claimEntryRequest({ tenantId: "tenant_cherry", userId: "user_demo", targetType: "client", requestKey: keys[2], payloadDigest: payloads[1] })),
  ]);
  assert.equal(differentRequests.filter((item) => item.state === "claimed").length, 2, "different manual/file request keys do not merge");
  evidence.checks.push("different request ids with identical payload digests both claim independently, proving same-content new intent is not merged");

  const [propertyScope, caseScope] = await Promise.all([
    scoped(() => repository.claimEntryRequest({ tenantId: "tenant_cherry", userId: "user_demo", targetType: "property", requestKey: keys[3], payloadDigest: payloads[3] })),
    scoped(() => repository.claimEntryRequest({ tenantId: "tenant_cherry", userId: "user_demo", targetType: "case", requestKey: keys[3], payloadDigest: payloads[3] })),
  ]);
  assert.equal(propertyScope.state, "claimed");
  assert.equal(caseScope.state, "claimed");
  evidence.checks.push("same digest across client/property/case target types remains isolated by target_type");

  const archiveTargetId = `case_archive_${suffix}`;
  const archiveContent = Buffer.from(`archive-content-${suffix}`);
  const [archiveRetryA, archiveRetryB] = await Promise.all([
    scoped(() => repository.addPrivateAttachment({ tenantId: "tenant_cherry", userId: "user_demo", targetType: "case", targetId: archiveTargetId, fileName: "source.pdf", fileType: "application/pdf", content: archiveContent, dedupeKey: `${keys[0]}:0` })),
    scoped(() => repository.addPrivateAttachment({ tenantId: "tenant_cherry", userId: "user_demo", targetType: "case", targetId: archiveTargetId, fileName: "source.pdf", fileType: "application/pdf", content: archiveContent, dedupeKey: `${keys[0]}:0` })),
  ]);
  assert.equal(archiveRetryA.id, archiveRetryB.id, "same entry request/file slot must reuse one durable original blob");
  const activeReupload = await scoped(() => repository.addPrivateAttachment({ tenantId: "tenant_cherry", userId: "user_demo", targetType: "case", targetId: archiveTargetId, fileName: "source.pdf", fileType: "application/pdf", content: archiveContent, dedupeKey: `${keys[1]}:0` }));
  assert.notEqual(activeReupload.id, archiveRetryA.id, "a later user intent with identical bytes must remain a separately explainable upload");
  attachmentIds.push(archiveRetryA.id, activeReupload.id);
  evidence.checks.push("persistent private-blob dedupe is limited to the same entry request/file slot; a later same-content upload remains distinct");

  runtimeProbe = new Client(runtimeUrl);
  await runtimeProbe.connect();
  await runtimeProbe.query("BEGIN");
  await runtimeProbe.query("SELECT set_config('app.external_auth_subject', $1, true)", ["demo:user_demo"]);
  const visible = await runtimeProbe.query("SELECT tenant_id,user_id,target_type,state FROM entry_request_claims WHERE request_key = ANY($1::text[])", [keys]);
  const denied = await runtimeProbe.query("SELECT has_table_privilege(current_user, 'public.entry_request_claims', 'SELECT') AS can_read, has_table_privilege(current_user, 'public.entry_request_claims', 'INSERT') AS can_insert, has_table_privilege(current_user, 'public.entry_request_claims', 'UPDATE') AS can_update");
  await runtimeProbe.query("COMMIT");
  assert.equal(denied.rows[0].can_read, true);
  assert.equal(denied.rows[0].can_insert, true);
  assert.equal(denied.rows[0].can_update, true);
  assert.equal(visible.rows.length, 5, "runtime sees only its own tenant/user claims through FORCE RLS");
  evidence.claimRows = visible.rows.length;
  evidence.checks.push("brokerdesk_runtime is non-superuser/non-bypass and can read/write only its own scoped claim rows under RLS");
  await assert.rejects(
    () => scoped(() => repository.claimEntryRequest({ tenantId: "tenant_not_accessible", userId: "user_demo", targetType: "client", requestKey: randomUUID(), payloadDigest: payloads[0] })),
    /row-level security|permission denied/i,
    "runtime must not claim a row in another tenant",
  );
  evidence.checks.push("runtime claim into an inaccessible tenant is rejected by RLS");

  const staleClaim = await scoped(() => repository.claimEntryRequest({ tenantId: "tenant_cherry", userId: "user_demo", targetType: "client", requestKey: staleKey, payloadDigest: stalePayload }));
  assert.ok(staleClaim.claimToken);
  await runtimeProbe.query("BEGIN");
  await runtimeProbe.query("SELECT set_config('app.external_auth_subject', $1, true)", ["demo:user_demo"]);
  await runtimeProbe.query(
    "UPDATE entry_request_claims SET updated_at=NOW()-INTERVAL '11 minutes' WHERE tenant_id=$1 AND user_id=$2 AND request_key=$3 AND target_type='client'",
    ["tenant_cherry", "user_demo", staleKey],
  );
  await runtimeProbe.query("COMMIT");
  const reclaimed = await scoped(() => repository.claimEntryRequest({ tenantId: "tenant_cherry", userId: "user_demo", targetType: "client", requestKey: staleKey, payloadDigest: stalePayload, targetId: `client_stale_${suffix}` }));
  assert.equal(reclaimed.state, "claimed", "a stale claim must be recoverable");
  assert.ok(reclaimed.claimToken && reclaimed.claimToken !== staleClaim.claimToken, "stale recovery must rotate the fencing token");
  assert.equal(await scoped(() => repository.completeEntryRequest({ tenantId: "tenant_cherry", userId: "user_demo", targetType: "client", requestKey: staleKey, claimToken: staleClaim.claimToken, targetId: `stale_${suffix}` })), false, "an old process token cannot complete after stale recovery fencing");
  assert.equal(await scoped(() => repository.completeEntryRequest({ tenantId: "tenant_cherry", userId: "user_demo", targetType: "client", requestKey: staleKey, claimToken: reclaimed.claimToken, targetId: `client_stale_${suffix}` })), true, "the new fenced owner can complete the recovered claim");
  keys.push(failedKey, staleKey);
  evidence.checks.push("a stale claimed row is recoverable with a rotated fencing token; the old process cannot complete and the new owner can complete");

  const formalFenceTargets = [
    {
      targetType: "client",
      requestKey: formalFenceKeys[0],
      payloadDigest: createHash("sha256").update("formal-client").digest("hex"),
      targetId: `client_formal_fence_${suffix}`,
      write: (claimToken) => repository.addClient({
        tenantId: "tenant_cherry", ownerUserId: "user_demo", id: `client_formal_fence_${suffix}`,
        name: "Formal fence client", phone: "", budgetType: "total_price", purpose: "buy",
        loanPreApprovalStatus: "not_applied", stage: "lead", temperature: "cold",
        brokerageContractType: "none", amlCheckStatus: "not_required",
        entryRequest: { requestKey: formalFenceKeys[0], claimToken },
      }),
    },
    {
      targetType: "property",
      requestKey: formalFenceKeys[1],
      payloadDigest: createHash("sha256").update("formal-property").digest("hex"),
      targetId: `prop_formal_fence_${suffix}`,
      write: (claimToken) => repository.addProperty({
        tenantId: "tenant_cherry", createdByUserId: "user_demo", currentOwnerUserId: "user_demo", id: `prop_formal_fence_${suffix}`,
        name: "Formal fence property", listingPrice: 0,
        entryRequest: { requestKey: formalFenceKeys[1], claimToken },
      }),
    },
    {
      targetType: "case",
      requestKey: formalFenceKeys[2],
      payloadDigest: createHash("sha256").update("formal-case").digest("hex"),
      targetId: `case_formal_fence_${suffix}`,
      write: (claimToken) => repository.saveBrokerageCaseExtractionReview({
        tenantId: "tenant_cherry", userId: "user_demo", caseId: `case_formal_fence_${suffix}`,
        caseType: "rental_application", caseTitle: "Formal fence case", confirmedDataJson: {},
        sourceImportJobIds: [], reviewItems: [],
        entryRequest: { requestKey: formalFenceKeys[2], claimToken },
      }),
    },
  ];
  for (const target of formalFenceTargets) {
    const firstFormalClaim = await scoped(() => repository.claimEntryRequest({ tenantId: "tenant_cherry", userId: "user_demo", targetType: target.targetType, requestKey: target.requestKey, payloadDigest: target.payloadDigest, targetId: target.targetId }));
    assert.equal(firstFormalClaim.state, "claimed");
    await scoped(() => repository.releaseEntryRequest({ tenantId: "tenant_cherry", userId: "user_demo", targetType: target.targetType, requestKey: target.requestKey, claimToken: firstFormalClaim.claimToken }));
    const secondFormalClaim = await scoped(() => repository.claimEntryRequest({ tenantId: "tenant_cherry", userId: "user_demo", targetType: target.targetType, requestKey: target.requestKey, payloadDigest: target.payloadDigest, targetId: target.targetId }));
    assert.equal(secondFormalClaim.state, "claimed");
    assert.notEqual(secondFormalClaim.claimToken, firstFormalClaim.claimToken);
    await assert.rejects(() => scoped(() => target.write(firstFormalClaim.claimToken)), /entry_request_claim_fenced/);
  }
  keys.push(...formalFenceKeys);
  evidence.checks.push("a rotated stale token is rejected before the client/property/case formal write transaction; no stale worker can overwrite the record");
  evidence.pass = true;
} catch (error) {
  evidence.failure = { message: error.message, code: error.code };
  process.exitCode = 1;
} finally {
  try {
    // Runtime intentionally has no DELETE privilege on claims. Test cleanup
    // must use the separately checked non-superuser maintenance role rather
    // than weakening production runtime grants just for evidence collection.
    const cleanup = new Client(adminUrl);
    await cleanup.connect();
    await cleanup.query("BEGIN");
    await cleanup.query("SELECT set_config('app.external_auth_subject', $1, true)", ["demo:user_demo"]);
    const deleted = await cleanup.query(
      "DELETE FROM entry_request_claims WHERE tenant_id=$1 AND user_id=$2 AND request_key = ANY($3::text[])",
      ["tenant_cherry", "user_demo", keys],
    );
    evidence.cleanupDeletedRows = deleted.rowCount;
    const remaining = await cleanup.query(
      "SELECT COUNT(*)::int AS count FROM entry_request_claims WHERE tenant_id=$1 AND user_id=$2 AND request_key = ANY($3::text[])",
      ["tenant_cherry", "user_demo", keys],
    );
    evidence.claimRowsAfterCleanup = Number(remaining.rows[0]?.count ?? -1);
    assert.equal(evidence.claimRowsAfterCleanup, 0, "fixture cleanup must remove all claim rows created by this evidence run");
    if (attachmentIds.length) {
      await cleanup.query("DELETE FROM private_attachment_blobs WHERE tenant_id=$1 AND attachment_id = ANY($2::text[])", ["tenant_cherry", attachmentIds]);
      await cleanup.query("DELETE FROM attachments WHERE tenant_id=$1 AND id = ANY($2::text[])", ["tenant_cherry", attachmentIds]);
    }
    await cleanup.query("COMMIT");
    await cleanup.end();
    await runtimeProbe?.end().catch(() => undefined);
  } catch (error) {
    evidence.cleanupFailure = error.message;
    process.exitCode = 1;
  }
  await admin.end();
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ evidencePath, pass: evidence.pass, checks: evidence.checks, claimRows: evidence.claimRows }, null, 2));
  process.exit(evidence.pass && !evidence.cleanupFailure ? 0 : 1);
}
