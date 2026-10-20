import assert from "node:assert/strict";
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

const originalLoad = Module._load;
let created = [];
let queueCalls = [];
let queueFailure = false;
let formInvalid = false;
let readiness = true;
const archives = [];
const auditRows = [];
const session = { tenant: { id: "tenant_test" }, user: { id: "user_test" } };
const identity = {
  MAX_IDENTITY_DOCUMENT_FILES: 6,
  getIdentityDocumentUploadLimitBytes: () => 10 * 1024 * 1024,
  queueIdentityImportSources: async (input) => {
    queueCalls.push(input);
    if (queueFailure) throw new Error("synthetic_storage_failure");
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
    linkAttachmentToObject: async () => ({}),
    addAuditLog: async (input) => { auditRows.push(structuredClone(input)); return input; },
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
      const id = `${type}-${created.length + 1}`;
      created.push({ type, id, name: formData.get("name") });
      return { ...previous, values: { name: String(formData.get("name")), phone: String(formData.get("phone")) }, createdRecord: { id, name: String(formData.get("name")) } };
    };
    return { createClientFormAction: create("client"), createPropertyQuickAction: create("property") };
  }
  return originalLoad.call(this, request, parent, ...rest);
};
const { createClientEntryAction, createPropertyEntryAction } = require(resolve(root, "src/app/entry-actions.ts"));
const previous = { status: "idle", fieldErrors: {}, values: { name: "", phone: "" } };
function form(fileContent = "%PDF-synthetic") {
  const fd = new FormData();
  fd.set("name", "Synthetic entry");
  fd.set("phone", "000-0000-0000");
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
assert.equal(success.pathname, "/clients/client-1/edit");
assert.equal(success.searchParams.get("flash"), "input_extraction_queued");
assert.equal(queueCalls[0].targetObjectId, "client-1");
assert.equal(queueCalls[0].targetObjectType, "party");
queueFailure = true;
const failure = await redirected(createPropertyEntryAction, form());
assert.equal(failure.pathname, "/properties/property-2/edit");
assert.equal(failure.searchParams.get("flash"), "object_import_upload_failed");
assert.equal(created.length, 2, "a queue failure must keep exactly one already-created object");
assert.equal(created[1].name, "Synthetic entry");
const manual = await redirected(createClientEntryAction, form(null));
assert.equal(manual.pathname, "/clients/client-3/edit");
assert.equal(queueCalls.length, 2, "manual-only entry must not enqueue");

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
assert.match(finalPreview.pathname, /\/clients\/client-4\/edit/);
assert.equal(queueCalls.length, beforeQueue, "verified previews must not invoke the model queue twice");
assert.equal(archives.length, 1, "the original must be archived once");
assert.equal(auditRows.length, 1);
const reopenedAudit = structuredClone(auditRows[0]);
assert.equal(reopenedAudit.context.attachmentId, archives[0].id);
assert.deepEqual(reopenedAudit.context.review.map((item) => item.decision), ["confirmed", "rejected", "undecided"]);
assert.equal(reopenedAudit.context.review[0].pageNumber, 1);
assert.equal(reopenedAudit.context.review[0].savedValue, "Synthetic entry");
assert.equal(reopenedAudit.tenantId, session.tenant.id);
console.log("unified entry actions: invalid content, form failure, queue failure, proof forgery/expiry/content binding, one archive, no second model call, and durable audit payload: PASS");
