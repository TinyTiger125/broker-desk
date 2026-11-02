import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
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

const originalLoad = Module._load;
let created = [];
let queueCalls = [];
let queueFailure = false;
let formInvalid = false;
let readiness = true;
const claims = new Map();
const archives = [];
const attachmentLinks = [];
const auditRows = [];
const session = { tenant: { id: "tenant_test" }, user: { id: "user_test" } };
const identity = {
  MAX_IDENTITY_DOCUMENT_FILES: 6,
  getIdentityDocumentUploadLimitBytes: () => 10 * 1024 * 1024,
  queueIdentityImportSources: async (input) => {
    queueCalls.push(input);
    if (queueFailure) return { ok: false, error: "source_persistence_failed" };
    return { ok: true, jobIds: input.files.map((_, i) => `job-${i}`) };
  },
};
Module._load = function(request, parent, ...rest) {
  if (request === "next/navigation") return { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } };
  if (request === "next/cache") return { revalidatePath: () => {} };
  if (request === "@/lib/tenant-session") return { requireTenantSession: async () => session };
  if (request === "@/lib/visibility-resolver") return { createRequestContext: (value) => value };
  if (request === "@/lib/locale") return { getLocale: async () => "zh" };
  if (request === "@/lib/data") return {
    getObjectImportFeatureReadiness: async () => ({ ready: readiness }),
    addPrivateAttachment: async (input) => { const row = { ...input, id: `attachment-${archives.length + 1}` }; archives.push(row); return row; },
    linkAttachmentToObject: async (input) => { attachmentLinks.push(input); return {}; },
    addAuditLog: async (input) => { auditRows.push(structuredClone(input)); return input; },
    listAuditLogs: async () => auditRows.map((row) => ({ ...row, context: row.context ?? {} })),
    claimEntryRequest: async ({ requestKey, targetType, payloadDigest, targetId }) => {
      const key = `${targetType}:${requestKey}`;
      const current = claims.get(key);
      if (!current) { const claimToken = randomUUID(); claims.set(key, { payloadDigest, claimToken, targetId, state: "claimed" }); return { state: "claimed", claimToken, targetId }; }
      if (current.payloadDigest !== payloadDigest) return { state: "payload_mismatch" };
      return current.state === "completed" ? { state: "existing", targetId: current.targetId } : { state: "in_progress" };
    },
    completeEntryRequest: async ({ requestKey, targetType, targetId, claimToken }) => { const current = claims.get(`${targetType}:${requestKey}`); if (!current || current.claimToken !== claimToken) return false; current.state = "completed"; current.targetId = targetId; return true; },
    releaseEntryRequest: async () => true,
    resolveClientVisibilityForContext: async () => ({ record: null, resolution: { canWrite: true } }),
    resolvePropertyVisibilityForContext: async () => ({ record: null, resolution: { canWrite: true } }),
  };
  if (request === "@/lib/attachment-storage") return { getAttachmentStorageMode: () => "postgres_private" };
  if (request === "@/lib/production-readiness") return { assertProductionAttachmentStorageReady: () => {} };
  if (request === "@/lib/object-import-target-service") return { resolveObjectImportTarget: async () => ({ ok: true, targetVersion: "v1" }) };
  if (request === "@/lib/identity-import-queue") return identity;
  if (request === "@/lib/excel-import-queue") return { getExcelUploadLimitBytes: () => 10 * 1024 * 1024, queueExcelImportSource: async () => ({ ok: true, jobId: "excel-job" }) };
  if (request === "@/app/actions") {
    const create = (type) => async (previous, formData) => {
      assert.equal(formData.get("caseDraftReturn"), "1");
      if (formInvalid) return { ...previous, status: "error", message: "existing required-field error" };
      const id = String(formData.get("entryTargetId") || `${type}-${created.length + 1}`);
      created.push({ type, id, name: formData.get("name") });
      return { ...previous, values: { name: String(formData.get("name")), phone: String(formData.get("phone")) }, createdRecord: { id, name: String(formData.get("name")) } };
    };
    return { createClientFormAction: create("client"), createPropertyQuickAction: create("property") };
  }
  return originalLoad.call(this, request, parent, ...rest);
};
const { createClientEntryAction, createPropertyEntryAction } = require(resolve(root, "src/app/entry-actions.ts"));
const { inferObjectAttachmentCategory } = require(resolve(root, "src/lib/object-attachments.ts"));
assert.equal(inferObjectAttachmentCategory({ fileName: "identity.jpg", documentType: "identity_document" }), "identity", "identity document type must override generic image classification");
assert.equal(inferObjectAttachmentCategory({ fileName: "property-photo.jpg", documentType: "unknown_property_document" }), "photo", "property image classification must remain photo");
const previous = { status: "idle", fieldErrors: {}, values: { name: "", phone: "" } };
function form(fileContent = "%PDF-synthetic") {
  const fd = new FormData();
  fd.set("name", "Synthetic entry");
  fd.set("phone", "000-0000-0000");
  fd.set("entryIntentId", randomUUID());
  if (fileContent !== null) fd.set("uploadFile", new File([fileContent], "test.pdf", { type: "application/pdf" }));
  return fd;
}
async function redirected(action, fd) {
  try { await action(previous, fd); assert.fail("expected redirect"); }
  catch (error) {
    assert.match(error.message, /^REDIRECT:/);
    return new URL(error.message.slice(9), "http://local.test");
  }
}
const invalid = await createClientEntryAction(previous, form("not pdf"));
assert.equal(invalid.status, "error");
assert.equal(invalid.values.name, "Synthetic entry");
assert.equal(created.length, 0, "invalid bytes must not create an object");
readiness = false;
assert.equal((await createPropertyEntryAction(previous, form())).status, "error");
assert.equal(created.length, 0, "unavailable reader must fail before creation");
readiness = true;
formInvalid = true;
assert.equal((await createClientEntryAction(previous, form())).status, "error");
assert.equal(queueCalls.length, 0, "existing form errors must not enqueue");
formInvalid = false;
const success = await redirected(createClientEntryAction, form());
assert.match(success.pathname, /^\/clients\/client_[0-9a-f]+\/edit$/);
assert.equal(success.searchParams.get("flash"), "input_extraction_queued");
assert.equal(queueCalls[0].targetObjectId, success.pathname.split("/")[2]);
assert.equal(queueCalls[0].targetObjectType, "party");
queueFailure = true;
const failedPropertyForm = form();
const failure = await redirected(createPropertyEntryAction, failedPropertyForm);
assert.match(failure.pathname, /^\/properties\/prop_[0-9a-f]+\/edit$/);
assert.equal(failure.searchParams.get("flash"), "entry_archive_saved_with_reading_failure");
assert.equal(created.length, 2, "a queue failure must keep exactly one already-created object");
assert.equal(created[1].name, "Synthetic entry");
assert.equal(archives.length, 1, "a queue failure must keep the unread original on the formal property");
assert.equal(attachmentLinks[0].category, "other", "a property fallback must retain filename-based classification");
assert.equal(auditRows.filter((row) => row.action === "entry_original_archived").length, 1);
const retryPropertyForm = form();
retryPropertyForm.set("entryIntentId", failedPropertyForm.get("entryIntentId"));
const retryFailure = await redirected(createPropertyEntryAction, retryPropertyForm);
assert.equal(retryFailure.pathname, failure.pathname, "same-intent retry must return to the same formal property");
assert.equal(retryFailure.searchParams.get("flash"), "entry_archive_saved_with_reading_failure");
assert.equal(queueCalls.length, 2, "same-intent fallback retry must not enqueue the model again");
assert.equal(archives.length, 1, "same-intent fallback retry must not duplicate the original attachment");
const manualForm = form(null);
const manual = await redirected(createClientEntryAction, manualForm);
assert.match(manual.pathname, /^\/clients\/client_[0-9a-f]+\/edit$/);
assert.equal(queueCalls.length, 2, "manual-only entry must not enqueue");
const manualRetryForm = form(null);
manualRetryForm.set("entryIntentId", manualForm.get("entryIntentId"));
const manualRetry = await redirected(createClientEntryAction, manualRetryForm);
assert.equal(manualRetry.pathname, manual.pathname, "same-intent manual retry must return to the same client");
assert.equal(created.length, 3, "same-intent manual retry must not create a second client");

const { createHash } = require("node:crypto");
const { signEntryPreviewProof, verifyEntryPreviewProofs } = require(resolve(root, "src/lib/entry-preview-proof.ts"));
const previewFile = form().get("uploadFile");
const fileKey = `${previewFile.name}:${previewFile.size}`;
const proofData = {
  tenantId: session.tenant.id, userId: session.user.id, fileKey,
  digest: createHash("sha256").update(Buffer.from(await previewFile.arrayBuffer())).digest("hex"),
  kind: "customer", context: "entry", candidates: [
    { id: "a", key: "name", sourceKey: "applicant.name", label: "姓名", value: "Synthetic entry", fileName: previewFile.name, pageNumber: 1, sourceText: "Name: Synthetic entry" },
    { id: "b", key: "phone", sourceKey: "applicant.phone", label: "电话", value: "000", fileName: previewFile.name, pageNumber: 1, sourceText: "Phone: 000" },
    { id: "c", key: "email", sourceKey: "applicant.email", label: "邮箱", value: "test@example.invalid", fileName: previewFile.name, pageNumber: 1, sourceText: "Email: test@example.invalid" },
  ],
};
const proof = signEntryPreviewProof(proofData);
function withProof(token = proof, content) {
  const fd = content ? form(content) : form();
  fd.set("entryReadProofs", JSON.stringify({ [fileKey]: token }));
  fd.set("entryReadFileKeys", JSON.stringify([fileKey]));
  fd.set("entryPreviewDecisions", JSON.stringify({ a: "confirmed", b: "rejected" }));
  return fd;
}
const beforeInvalid = created.length;
for (const fd of [withProof(proof + "bad"), withProof(signEntryPreviewProof(proofData, Date.now() - 3 * 60 * 60 * 1000)), withProof(proof, "%PDF-Synthetic")]) {
  const result = await createClientEntryAction(previous, fd);
  assert.equal(result.status, "error");
  assert.match(result.message, /凭证/);
  assert.equal(created.length, beforeInvalid, "tampered, expired, or same-name same-size changed bytes must never create a record");
}
const foreign = withProof(signEntryPreviewProof({ ...proofData, tenantId: "other" }));
await assert.rejects(() => verifyEntryPreviewProofs({ formData: foreign, files: [foreign.get("uploadFile")], session, kind: "customer", context: "entry" }));
const bare = form(); bare.set("entryReadFileKeys", JSON.stringify([fileKey]));
assert.equal((await createClientEntryAction(previous, bare)).status, "error", "a bare filename claim must not skip reading");
const beforeQueue = queueCalls.length;
const finalPreview = await redirected(createClientEntryAction, withProof());
assert.match(finalPreview.pathname, /^\/clients\/client_[0-9a-f]+\/edit$/);
assert.equal(queueCalls.length, beforeQueue, "verified previews must not invoke the model queue twice");
assert.equal(archives.length, 2, "the fallback property original and preview client original must each be archived once");
assert.equal(attachmentLinks[1].category, "identity", "customer entry originals must be archived as identity evidence even when the file is a JPG");
const previewAudits = auditRows.filter((row) => row.action === "entry_preview_reviewed");
assert.equal(previewAudits.length, 1);
const reopenedAudit = structuredClone(previewAudits[0]);
assert.equal(reopenedAudit.context.attachmentId, archives[1].id);
assert.deepEqual(reopenedAudit.context.review.map((item) => item.decision), ["confirmed", "rejected", "undecided"]);
assert.equal(reopenedAudit.context.review[0].pageNumber, 1);
assert.equal(reopenedAudit.context.review[0].savedValue, "Synthetic entry");
assert.equal(reopenedAudit.tenantId, session.tenant.id);
console.log("unified entry actions: invalid content, form failure, queue failure, proof forgery/expiry/content binding, one archive, no second model call, and durable audit payload: PASS");
