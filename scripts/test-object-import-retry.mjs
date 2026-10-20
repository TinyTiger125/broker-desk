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
const resolveCandidate = (value) => [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
Module._resolveFilename = function(request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
require.extensions[".ts"] = (mod, filename) => mod._compile(typescript.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, jsx: typescript.JsxEmit.ReactJSX, esModuleInterop: true },
  fileName: filename,
}).outputText, filename);
require.extensions[".tsx"] = require.extensions[".ts"];

const originalLoad = Module._load;
let readerMode = "success";
let readerCallCount = 0;
Module._load = function(request, parent, ...rest) {
  if (request === "server-only") return {};
  if (parent?.filename === resolve(root, "src/lib/data.ts")) {
    if (request === "@/lib/data.postgres") return {};
    if (request === "react") return { cache: (fn) => fn };
    if (["next/headers", "@/lib/actor", "@/lib/auth-mode", "@/lib/clerk-auth", "@/lib/staging-access-policy"].includes(request)) return {};
    if (request === "@/lib/production-readiness") return { isPostgresDataStoreConfigured: () => false, assertProductionDataStoreReady: () => {}, isProductionRuntime: () => false };
  }
  if (request === "next/navigation") return { redirect: (url) => { lastRedirect = String(url); throw new Error(`REDIRECT:${url}`); } };
  if (request === "next/cache") return { revalidatePath: () => {} };
  if (request === "@/lib/tenant-session" && parent?.filename.endsWith("/src/app/object-import-actions.ts")) {
    return { requireTenantSession: async ({ permission }) => { assert(["source.upload", "extract.run"].includes(permission)); return session; } };
  }
  if (request === "@/lib/openai-object-reader" && parent?.filename.endsWith("/src/lib/identity-import-processor.ts")) {
    return { readObjectDocumentWithOpenAi: async () => {
      readerCallCount += 1;
      if (readerMode === "fail") throw new Error("synthetic_provider_timeout");
      return ({
      documentType: "registry",
      pages: [{ pageNumber: 1, lines: ["新しい物件名"] }],
      candidates: [{ fieldKey: "property.name", value: "新しい物件名", pageNumber: 1, sourceText: "新しい物件名", uncertainty: "clear", subjectKey: "object_1", subjectLabel: "物件" }],
      processingMetadata: { provider: "test-only-retry-provider", model: "test-model", usage: { input_tokens: 7, output_tokens: 3 } },
      });
    } };
  }
  return originalLoad.call(this, request, parent, ...rest);
};

const data = require(resolve(root, "src/lib/data.ts"));
data.resetBusinessDataForQa();
const tenant = await data.getTenantById("tenant_cherry");
const user = await data.getUserById("user_demo");
const membership = (await data.listTenantMemberships(user.id)).find((item) => item.tenantId === tenant.id);
const session = { tenant, user, membership, externalAuthSubject: user.externalAuthSubject };
const { registerTenantSessionProvenance } = require(resolve(root, "src/lib/tenant-session-provenance.ts"));
registerTenantSessionProvenance(session);
const { buildObjectVersionFingerprint, serializeObjectImportNotes } = require(resolve(root, "src/lib/object-import-contract.ts"));
const { retryObjectImportAction } = require(resolve(root, "src/app/object-import-actions.ts"));
const { processIdentityImportJob } = require(resolve(root, "src/lib/identity-import-processor.ts"));

let lastRedirect = "";
const property = await data.addProperty({ tenantId: tenant.id, createdByUserId: user.id, currentOwnerUserId: user.id, name: "Retry property", listingPrice: 1 });
const content = Buffer.from("%PDF-retry-source");
const job = await data.addImportJob({
  tenantId: tenant.id, userId: user.id, sourceType: "scan", targetEntity: "parties", title: "retry-source.pdf", status: "mapped",
  notes: serializeObjectImportNotes({ targetObjectType: "property", targetObjectId: property.id, targetVersion: buildObjectVersionFingerprint(property), documentType: "registry" }),
});
const attachment = await data.addPrivateAttachment({ tenantId: tenant.id, userId: user.id, targetType: "import_job", targetId: job.id, fileName: "retry-source.pdf", fileType: "application/pdf", content });
const target = await data.createObjectImportTarget({
  id: `object_retry_${Date.now()}`, tenantId: tenant.id, userId: user.id, importJobId: job.id, targetType: "property", targetId: property.id,
  targetVersion: buildObjectVersionFingerprint(property), documentType: "registry", sourceAttachmentId: attachment.id, status: "conflict", idempotencyKey: `retry:${Date.now()}`,
  attemptCount: 1, createdAt: new Date(), updatedAt: new Date(), processingMetadata: { provider: "test-old-provider", model: "old-model", usage: { input_tokens: 11, output_tokens: 5 } },
});
const sourceFileHash = createHash("sha256").update(content).digest("hex");
const human = await data.upsertObjectImportCandidate({
  id: `candidate_${target.id}_name`, tenantId: tenant.id, targetId: target.id, fieldKey: "name", candidateValue: "旧候选", finalValue: "人工确认值", finalSource: "human", status: "confirmed",
  provenance: { sourceAttachmentId: attachment.id, sourceFileHash, sourceText: "人工确认值" },
});
const oldResponse = {
  documentType: "registry", pages: [{ pageNumber: 1, lines: ["旧物件名"] }],
  candidates: [{ fieldKey: "property.name", value: "旧物件名", pageNumber: 1, sourceText: "旧物件名", uncertainty: "clear", subjectKey: "object_1", subjectLabel: "物件" }],
  processingMetadata: { provider: "test-old-provider", model: "old-model", usage: { input_tokens: 11, output_tokens: 5 } },
};
await data.updateImportJobMapping({ tenantId: tenant.id, userId: user.id, jobId: job.id, mappingJson: {}, notes: JSON.stringify({ kind: "input_file_extraction", objectImport: JSON.parse(job.notes).objectImport, objectReader: oldResponse }), status: "mapped" });

const retryForm = new FormData();
retryForm.set("importTargetId", target.id);
await assert.rejects(retryObjectImportAction(retryForm), /REDIRECT:/);
assert.match(lastRedirect, /object_import_retry_queued/);
const requeuedTarget = await data.getObjectImportTarget({ tenantId: tenant.id, userId: user.id, id: target.id });
const requeuedJob = (await data.listImportJobs(user.id, 200, tenant.id)).find((item) => item.id === job.id);
assert.equal(requeuedTarget.status, "queued");
assert.equal(requeuedJob.status, "queued");
assert.equal(requeuedTarget.sourceAttachmentId, attachment.id);
assert.equal(JSON.parse(requeuedJob.notes).objectImport.targetVersion, requeuedTarget.targetVersion, "retry must rebase immutable job metadata to the current object version");
assert.equal((await data.listObjectImportCandidates({ tenantId: tenant.id, userId: user.id, targetId: target.id })).find((field) => field.id === human.id).finalValue, "人工确认值");

lastRedirect = "";
await assert.rejects(retryObjectImportAction(retryForm), /REDIRECT:/);
assert.match(lastRedirect, /object_import_retry_rejected/);
assert.equal((await data.getObjectImportTarget({ tenantId: tenant.id, userId: user.id, id: target.id })).status, "queued", "duplicate retry must not create a second queued attempt");

const processed = await processIdentityImportJob({ tenantId: tenant.id, userId: user.id, jobId: job.id });
assert.equal(processed.ok, true);
const processedJob = (await data.listImportJobs(user.id, 200, tenant.id)).find((item) => item.id === job.id);
const processedPayload = JSON.parse(processedJob.notes);
assert.equal(processedPayload.objectReaderHistory.length, 1, "retry must retain the prior reader response and usage history");
assert.equal(processedPayload.objectReaderHistory[0].response.processingMetadata.provider, "test-old-provider");
assert.equal((await data.listObjectImportCandidates({ tenantId: tenant.id, userId: user.id, targetId: target.id })).find((field) => field.id === human.id).finalValue, "人工确认值", "retry reader output must not overwrite human confirmation");
assert.equal((await data.getObjectImportTarget({ tenantId: tenant.id, userId: user.id, id: target.id })).attemptCount, 2, "successful initial run plus one retry must consume exactly two target attempts");

// Provider failures consume the same bounded attempt budget even when no
// extraction persistence occurs. The second failure must make the explicit
// retry action reject instead of allowing an unbounded timeout loop.
const failingProperty = await data.addProperty({ tenantId: tenant.id, createdByUserId: user.id, currentOwnerUserId: user.id, name: "Failure budget property", listingPrice: 1 });
const failingJob = await data.addImportJob({
  tenantId: tenant.id, userId: user.id, sourceType: "scan", targetEntity: "parties", title: "failure-budget.pdf", status: "queued",
  notes: serializeObjectImportNotes({ targetObjectType: "property", targetObjectId: failingProperty.id, targetVersion: buildObjectVersionFingerprint(failingProperty), documentType: "registry" }),
});
const failingAttachment = await data.addPrivateAttachment({ tenantId: tenant.id, userId: user.id, targetType: "import_job", targetId: failingJob.id, fileName: "failure-budget.pdf", fileType: "application/pdf", content });
const failingTarget = await data.createObjectImportTarget({
  id: `object_retry_failure_${Date.now()}`, tenantId: tenant.id, userId: user.id, importJobId: failingJob.id, targetType: "property", targetId: failingProperty.id,
  targetVersion: buildObjectVersionFingerprint(failingProperty), documentType: "registry", sourceAttachmentId: failingAttachment.id, status: "queued", idempotencyKey: `retry-failure:${Date.now()}`,
  attemptCount: 0, createdAt: new Date(), updatedAt: new Date(),
});
readerMode = "fail";
const failureReaderCallsBefore = readerCallCount;
const firstFailure = await processIdentityImportJob({ tenantId: tenant.id, userId: user.id, jobId: failingJob.id });
assert.deepEqual(firstFailure, { ok: false, status: "failed", error: "identity_extraction_failed" });
assert.equal((await data.getObjectImportTarget({ tenantId: tenant.id, userId: user.id, id: failingTarget.id })).attemptCount, 1, "provider failure must consume the initial target attempt");
const failingRetryForm = new FormData();
failingRetryForm.set("importTargetId", failingTarget.id);
lastRedirect = "";
await assert.rejects(retryObjectImportAction(failingRetryForm), /REDIRECT:/);
assert.match(lastRedirect, /object_import_retry_queued/);
const secondFailure = await processIdentityImportJob({ tenantId: tenant.id, userId: user.id, jobId: failingJob.id });
assert.deepEqual(secondFailure, { ok: false, status: "failed", error: "identity_extraction_failed" });
assert.equal((await data.getObjectImportTarget({ tenantId: tenant.id, userId: user.id, id: failingTarget.id })).attemptCount, 2, "provider failure after explicit retry must consume the second target attempt");
const blockedDirectProcess = await processIdentityImportJob({ tenantId: tenant.id, userId: user.id, jobId: failingJob.id });
assert.deepEqual(blockedDirectProcess, { ok: false, status: "failed", error: "object_import_retry_exhausted" }, "direct worker retry must enforce the target budget before the provider");
assert.equal(readerCallCount, failureReaderCallsBefore + 2, "a third worker invocation must not call the provider");
lastRedirect = "";
await assert.rejects(retryObjectImportAction(failingRetryForm), /REDIRECT:/);
assert.match(lastRedirect, /object_import_retry_rejected/);
assert.equal((await data.getObjectImportTarget({ tenantId: tenant.id, userId: user.id, id: failingTarget.id })).attemptCount, 2, "retry exhaustion must not increment or requeue the target");

const interruptedProperty = await data.addProperty({ tenantId: tenant.id, createdByUserId: user.id, currentOwnerUserId: user.id, name: "Interrupted processing property", listingPrice: 1 });
const interruptedJob = await data.addImportJob({
  tenantId: tenant.id, userId: user.id, sourceType: "scan", targetEntity: "parties", title: "interrupted-processing.pdf", status: "processing",
  notes: serializeObjectImportNotes({ targetObjectType: "property", targetObjectId: interruptedProperty.id, targetVersion: buildObjectVersionFingerprint(interruptedProperty), documentType: "registry" }),
});
const interruptedAttachment = await data.addPrivateAttachment({ tenantId: tenant.id, userId: user.id, targetType: "import_job", targetId: interruptedJob.id, fileName: "interrupted-processing.pdf", fileType: "application/pdf", content });
const interruptedTarget = await data.createObjectImportTarget({
  id: `object_retry_interrupted_${Date.now()}`, tenantId: tenant.id, userId: user.id, importJobId: interruptedJob.id, targetType: "property", targetId: interruptedProperty.id,
  targetVersion: buildObjectVersionFingerprint(interruptedProperty), documentType: "registry", sourceAttachmentId: interruptedAttachment.id, status: "processing", idempotencyKey: `retry-interrupted:${Date.now()}`,
  attemptCount: 1, createdAt: new Date(), updatedAt: new Date(),
});
const interruptedReaderCallsBefore = readerCallCount;
const interruptedFailure = await processIdentityImportJob({ tenantId: tenant.id, userId: user.id, jobId: interruptedJob.id });
assert.deepEqual(interruptedFailure, { ok: false, status: "failed", error: "identity_extraction_failed" });
assert.equal(readerCallCount, interruptedReaderCallsBefore + 1, "a processing recovery call must be counted before invoking the provider");
assert.equal((await data.getObjectImportTarget({ tenantId: tenant.id, userId: user.id, id: interruptedTarget.id })).attemptCount, 2, "processing recovery must consume the second attempt");
readerMode = "success";

// Standalone customer identity recovery is available only for an empty
// needs_review result: it must not require a case and must never reopen a
// target that already contains a human decision or has exhausted its budget.
const identityClient = await data.addClient({ tenantId: tenant.id, ownerUserId: user.id, name: "Retry identity customer", phone: "090-0000-0099", budgetType: "total_price", purpose: "buy", loanPreApprovalStatus: "not_applied", stage: "lead", temperature: "cold", brokerageContractType: "none", amlCheckStatus: "not_required" });
const identityContent = Buffer.from("%PDF-identity-retry-source");
async function makeEmptyIdentityTarget(idSuffix, attemptCount, withHuman = false) {
  const identityJob = await data.addImportJob({
    tenantId: tenant.id, userId: user.id, sourceType: "scan", targetEntity: "parties", title: `identity-retry-${idSuffix}.pdf`, status: "mapped",
    notes: serializeObjectImportNotes({ targetObjectType: "party", targetObjectId: identityClient.id, targetVersion: buildObjectVersionFingerprint(identityClient) }),
  });
  const identityAttachment = await data.addPrivateAttachment({ tenantId: tenant.id, userId: user.id, targetType: "import_job", targetId: identityJob.id, fileName: `identity-retry-${idSuffix}.pdf`, fileType: "application/pdf", content: identityContent });
  const identityTarget = await data.createObjectImportTarget({
    id: `object_retry_identity_${idSuffix}_${Date.now()}`, tenantId: tenant.id, userId: user.id, importJobId: identityJob.id, targetType: "party", targetId: identityClient.id,
    targetVersion: buildObjectVersionFingerprint(identityClient), sourceAttachmentId: identityAttachment.id, status: "needs_review", idempotencyKey: `retry-identity:${idSuffix}:${Date.now()}`,
    attemptCount, createdAt: new Date(), updatedAt: new Date(),
  });
  await data.upsertObjectImportCandidate({
    id: `candidate_${identityTarget.id}_birthDate`, tenantId: tenant.id, targetId: identityTarget.id, fieldKey: "birthDate", status: "not_found",
    provenance: { sourceAttachmentId: identityAttachment.id },
    ...(withHuman ? { candidateValue: "1990-04-12", finalValue: "1990-04-12", finalSource: "human", status: "confirmed" } : {}),
  });
  return { identityJob, identityTarget };
}

const emptyIdentity = await makeEmptyIdentityTarget("empty", 1);
const emptyIdentityForm = new FormData();
emptyIdentityForm.set("importTargetId", emptyIdentity.identityTarget.id);
lastRedirect = "";
await assert.rejects(retryObjectImportAction(emptyIdentityForm), /REDIRECT:/);
assert.match(lastRedirect, /object_import_retry_queued/, "empty standalone customer needs_review may be retried once");
assert.equal((await data.getObjectImportTarget({ tenantId: tenant.id, userId: user.id, id: emptyIdentity.identityTarget.id })).status, "queued");
lastRedirect = "";
await assert.rejects(retryObjectImportAction(emptyIdentityForm), /REDIRECT:/);
assert.match(lastRedirect, /object_import_retry_rejected/, "duplicate customer retry is not a second queue");

const humanIdentity = await makeEmptyIdentityTarget("human", 1, true);
const humanIdentityForm = new FormData();
humanIdentityForm.set("importTargetId", humanIdentity.identityTarget.id);
lastRedirect = "";
await assert.rejects(retryObjectImportAction(humanIdentityForm), /REDIRECT:/);
assert.match(lastRedirect, /object_import_retry_rejected/, "human-confirmed standalone target cannot use empty-result recovery");
const exhaustedIdentity = await makeEmptyIdentityTarget("exhausted", 2);
const exhaustedIdentityForm = new FormData();
exhaustedIdentityForm.set("importTargetId", exhaustedIdentity.identityTarget.id);
lastRedirect = "";
await assert.rejects(retryObjectImportAction(exhaustedIdentityForm), /REDIRECT:/);
assert.match(lastRedirect, /object_import_retry_rejected/, "standalone customer retry remains bounded at two attempts");

console.log("PASS: bounded object retry preserves source/history, rejects duplicate queueing, and protects human confirmation");
