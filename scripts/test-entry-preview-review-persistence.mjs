import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;
const resolveCandidate = (value) => {
  if (!value || (!value.startsWith("/") && !value.startsWith("."))) return undefined;
  return [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
};
Module._resolveFilename = function(request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
require.extensions[".ts"] = (module, filename) => {
  const result = typescript.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};

const data = require(resolve(root, "src/lib/data.ts"));
const { registerTenantSessionProvenance } = require(resolve(root, "src/lib/tenant-session-provenance.ts"));
const { persistEntryPreviewReviewTarget } = require(resolve(root, "src/lib/entry-preview-proof.ts"));
const entryPreviewProofSource = readFileSync(resolve(root, "src/lib/entry-preview-proof.ts"), "utf8");
const cleanupMigrationSource = readFileSync(resolve(root, "db/migrations/20261117_001_entry_preview_review_cleanup_guards.sql"), "utf8");
assert.match(entryPreviewProofSource, /let createdJob = false;/, "review persistence must track graph ownership for cleanup");
assert.match(entryPreviewProofSource, /let createdTarget = false;/, "review persistence must track target ownership for cleanup");
assert.match(entryPreviewProofSource, /createEntryPreviewReviewGraph\(/, "review persistence must create the job/target graph atomically");
assert.doesNotMatch(entryPreviewProofSource, /await addImportJob\(/, "review persistence must not create a completed job outside the atomic graph helper");
assert.doesNotMatch(entryPreviewProofSource, /await createObjectImportTarget\(/, "review persistence must not create a target outside the atomic graph helper");
assert.match(entryPreviewProofSource, /if \(createdJob && createdTarget && jobId && targetId\)/, "cleanup must require ownership of both graph rows");
assert.match(cleanupMigrationSource, /SELECT t\.id INTO locked_target_id[\s\S]*?FOR UPDATE;/, "cleanup must lock the target before checking human decisions");
assert.match(cleanupMigrationSource, /a\.user_id = NEW\.user_id/, "target guard must bind source attachment to the target user");

data.resetBusinessDataForQa();
const tenant = await data.getTenantById("tenant_cherry");
const user = await data.getUserById("user_demo");
const membership = (await data.listTenantMemberships(user.id)).find((item) => item.tenantId === tenant.id);
assert(tenant && user && membership);
const session = { tenant, user, membership, externalAuthSubject: user.externalAuthSubject };
registerTenantSessionProvenance(session);
const client = await data.addClient({
  tenantId: tenant.id,
  ownerUserId: user.id,
  name: "Synthetic review holder",
  budgetType: "total_price",
  purpose: "buy",
  loanPreApprovalStatus: "not_applied",
  stage: "lead",
  temperature: "cold",
  brokerageContractType: "none",
  amlCheckStatus: "not_required",
});
const attachment = await data.addPrivateAttachment({
  tenantId: tenant.id,
  userId: user.id,
  targetType: "party",
  targetId: client.id,
  fileName: "synthetic-identity.pdf",
  fileType: "application/pdf",
  content: Buffer.from("%PDF-synthetic-identity-review%"),
});
const sourceHash = createHash("sha256").update(Buffer.from("%PDF-synthetic-identity-review%")).digest("hex");
const proof = {
  tenantId: tenant.id,
  userId: user.id,
  fileKey: "synthetic-identity.pdf:31",
  digest: sourceHash,
  kind: "customer",
  context: "entry",
  expiresAt: Date.now() + 60_000,
  candidates: [
    {
      id: "synthetic-address",
      key: "currentAddress",
      sourceKey: "applicant.currentAddress",
      label: "现住所",
      value: "東京都テスト区1-2-3",
      fileName: "synthetic-identity.pdf",
      fileKey: "synthetic-identity.pdf:31",
      pageNumber: 1,
      sourceText: "住所: 東京都テスト区1-2-3",
      pageEvidenceVerified: true,
      uncertainty: "clear",
      confidence: 0.98,
    },
    {
      id: "synthetic-latin",
      key: "nameLatin",
      sourceKey: "applicant.nameLatin",
      label: "拉丁姓名",
      value: "YAMADA SHIKEN",
      fileName: "synthetic-identity.pdf",
      fileKey: "synthetic-identity.pdf:31",
      pageNumber: 1,
      sourceText: "Name: YAMADA SHIKEN",
      pageEvidenceVerified: true,
      uncertainty: "unclear",
      confidence: 0.61,
    },
  ],
};

const first = await persistEntryPreviewReviewTarget({ session, targetId: client.id, attachmentId: attachment.id, proof, entryRequestKey: "synthetic-entry-intent" });
assert.equal(first.persisted, true);
const scope = { tenantId: tenant.id, userId: user.id };
const targets = await data.listObjectImportTargets({ ...scope, targetType: "party", targetId: client.id });
assert.equal(targets.length, 1, "direct review must create one durable target");
assert.equal(targets[0].status, "needs_review");
assert.equal(targets[0].sourceAttachmentId, attachment.id, "review target must point at the archived original");
const fields = await data.listObjectImportCandidates({ ...scope, targetId: targets[0].id });
assert.deepEqual(fields.map((field) => field.fieldKey).sort(), ["currentAddress", "nameLatin"]);
assert.equal(fields.find((field) => field.fieldKey === "currentAddress")?.status, "draft");
assert.equal(fields.find((field) => field.fieldKey === "nameLatin")?.status, "low_confidence");
assert.equal(fields.find((field) => field.fieldKey === "currentAddress")?.provenance.pageEvidenceVerified, true);

const replay = await persistEntryPreviewReviewTarget({ session, targetId: client.id, attachmentId: attachment.id, proof, entryRequestKey: "synthetic-entry-intent" });
assert.equal(replay.persisted, true, "replay must remain successful");
assert.equal((await data.listObjectImportTargets({ ...scope, targetType: "party", targetId: client.id })).length, 1, "replay must not create a duplicate target");
assert.equal((await data.listObjectImportCandidates({ ...scope, targetId: targets[0].id })).length, 2, "replay must upsert fields");

const { createRequestContext } = require(resolve(root, "src/lib/visibility-resolver.ts"));
const context = createRequestContext(session);
const addressField = fields.find((field) => field.fieldKey === "currentAddress");
const review = await data.reviewObjectImportCandidate({
  context,
  targetId: targets[0].id,
  fieldId: addressField.id,
  expectedVersion: targets[0].targetVersion,
  expectedCandidateValue: addressField.candidateValue,
  decision: "confirm",
  value: addressField.candidateValue,
});
assert.equal(review.ok, true, "human address confirmation should use the existing review path");
const reopened = await data.getClientById(client.id, tenant.id);
assert.equal(reopened.currentAddress, "東京都テスト区1-2-3", "confirmed address must persist after reopen");
assert.equal((await data.listObjectImportCandidates({ ...scope, targetId: targets[0].id })).find((field) => field.fieldKey === "currentAddress")?.finalSource, "human");

// A mid-write failure must not leave a visible synthetic job/target with only
// the first candidate. The archived source attachment remains intact so the
// user can retry the normal entry flow without losing the original.
const failureClient = await data.addClient({
  tenantId: tenant.id,
  ownerUserId: user.id,
  name: "Synthetic failure holder",
  budgetType: "total_price",
  purpose: "buy",
  loanPreApprovalStatus: "not_applied",
  stage: "lead",
  temperature: "cold",
  brokerageContractType: "none",
  amlCheckStatus: "not_required",
});
const failureAttachment = await data.addPrivateAttachment({
  tenantId: tenant.id,
  userId: user.id,
  targetType: "party",
  targetId: failureClient.id,
  fileName: "synthetic-failure.pdf",
  fileType: "application/pdf",
  content: Buffer.from("%PDF-synthetic-failure%"),
});
const failureDigest = createHash("sha256").update(Buffer.from("%PDF-synthetic-failure%")).digest("hex");
const failureProof = {
  ...proof,
  fileKey: "synthetic-failure.pdf:32",
  digest: failureDigest,
  candidates: [
    { ...proof.candidates[0], id: "failure-address", fileName: "synthetic-failure.pdf", fileKey: "synthetic-failure.pdf:32" },
    { ...proof.candidates[1], id: "failure-name", fileName: "synthetic-failure.pdf", fileKey: "synthetic-failure.pdf:32" },
  ],
};
const originalUpsert = data.upsertObjectImportCandidate;
let upsertAttempts = 0;
data.upsertObjectImportCandidate = async (candidate) => {
  upsertAttempts += 1;
  if (upsertAttempts === 2) throw new Error("synthetic_candidate_write_failure");
  return originalUpsert(candidate);
};
await assert.rejects(
  persistEntryPreviewReviewTarget({ session, targetId: failureClient.id, attachmentId: failureAttachment.id, proof: failureProof, entryRequestKey: "synthetic-failure-intent" }),
  /synthetic_candidate_write_failure/,
  "candidate failure must be reported after cleanup",
);
data.upsertObjectImportCandidate = originalUpsert;
assert.equal((await data.listObjectImportTargets({ ...scope, targetType: "party", targetId: failureClient.id })).length, 0, "failed review must not leave a partial target");
assert.equal((await data.listImportJobs(user.id, null, tenant.id)).filter((job) => job.notes?.includes(`\"targetId\":\"${failureClient.id}\"`)).length, 0, "failed review must not leave a synthetic job");
assert.equal((await data.listAttachments({ ...scope, targetType: "party", targetId: failureClient.id, limit: 10 })).some((item) => item.id === failureAttachment.id), true, "cleanup must preserve the archived source attachment");
console.log("entry preview review persistence: archived attachment binding, durable address/Latin review, replay idempotency, human confirmation/reopen: PASS");
