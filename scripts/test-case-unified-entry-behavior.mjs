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

const originalLoad = Module._load;
let data;
let queueShouldFail = false;
let queueCallCount = 0;
const persistQueueSource = async ({ tenantId, userId, file }) => {
  if (queueShouldFail) return { ok: false, error: "source_persistence_failed" };
  const job = await data.addImportJob({
    tenantId,
    userId,
    sourceType: "scan",
    targetEntity: "properties",
    title: file.name,
    status: "queued",
    idempotencyKey: `case-entry-queue-${++queueCallCount}`,
  });
  await data.addPrivateAttachment({
    tenantId,
    userId,
    targetType: "import_job",
    targetId: job.id,
    fileName: file.name,
    fileType: file.type || "application/pdf",
    content: Buffer.from(await file.arrayBuffer()),
  });
  return job;
};
const queueStub = {
  queueIdentityImportSources: async ({ tenantId, userId, files }) => {
    if (queueShouldFail) return { ok: false, error: "source_persistence_failed" };
    const job = await persistQueueSource({ tenantId, userId, file: files[0] });
    return { ok: true, jobIds: [job.id], deduplicated: false };
  },
  getIdentityDocumentUploadLimitBytes: () => 10 * 1024 * 1024,
};
const excelStub = {
  queueExcelImportSource: async ({ tenantId, userId, file }) => {
    if (queueShouldFail) return { ok: false, error: "source_persistence_failed" };
    const job = await persistQueueSource({ tenantId, userId, file });
    return { ok: true, jobId: job.id, status: "queued", deduplicated: false };
  },
  getExcelUploadLimitBytes: () => 10 * 1024 * 1024,
};
let session;
Module._load = function(request, parent, ...rest) {
  if (request === "server-only") return {};
  if (request === "next/navigation") return { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } };
  if (request === "next/cache") return { revalidatePath: () => {} };
  if (request === "next/dist/client/components/redirect-error") return { isRedirectError: (error) => error instanceof Error && error.message.startsWith("REDIRECT:") };
  if (request === "@/lib/tenant-session" && parent?.filename.endsWith("/src/app/case-entry-actions.ts")) {
    return { requireTenantSession: async () => session, assertTenantPermission: () => {} };
  }
  if (request === "@/lib/identity-import-queue" && parent?.filename.endsWith("/src/app/case-entry-actions.ts")) return queueStub;
  if (request === "@/lib/excel-import-queue" && parent?.filename.endsWith("/src/app/case-entry-actions.ts")) return excelStub;
  if (request === "@/lib/production-readiness" && parent?.filename.endsWith("/src/app/case-entry-actions.ts")) return { assertProductionAttachmentStorageReady: () => {} };
  if (parent?.filename === resolve(root, "src/lib/data.ts")) {
    if (request === "@/lib/data.postgres") return {};
    if (request === "react") return { cache: (fn) => fn };
    if (["next/headers", "@/lib/actor", "@/lib/auth-mode", "@/lib/clerk-auth", "@/lib/staging-access-policy"].includes(request)) return {};
    if (request === "@/lib/production-readiness") return { isPostgresDataStoreConfigured: () => false, assertProductionDataStoreReady: () => {}, isProductionRuntime: () => false };
  }
  return originalLoad.call(this, request, parent, ...rest);
};

process.env.ATTACHMENT_STORAGE_MODE = "postgres_private";
data = require(resolve(root, "src/lib/data.ts"));
data.resetBusinessDataForQa();
const tenant = await data.getTenantById("tenant_cherry");
const user = await data.getUserById("user_demo");
const membership = (await data.listTenantMemberships(user.id)).find((item) => item.tenantId === tenant.id);
session = { tenant, user, membership, externalAuthSubject: user.externalAuthSubject };
const { registerTenantSessionProvenance } = require(resolve(root, "src/lib/tenant-session-provenance.ts"));
registerTenantSessionProvenance(session);
const person = await data.addClient({ tenantId: tenant.id, ownerUserId: user.id, name: "Entry person", phone: "000-0000-0001", budgetType: "total_price", purpose: "buy", loanPreApprovalStatus: "not_applied", stage: "lead", temperature: "cold", brokerageContractType: "none", amlCheckStatus: "not_required" });
const property = await data.addProperty({ tenantId: tenant.id, createdByUserId: user.id, currentOwnerUserId: user.id, name: "Entry property", address: "福岡市", listingPrice: 0 });
const { createCaseWithUploadAction } = require(resolve(root, "src/app/case-entry-actions.ts"));
const { signEntryPreviewProof } = require(resolve(root, "src/lib/entry-preview-proof.ts"));
const associationJson = JSON.stringify({ parties: [{ partyId: person.id, roles: ["主要申请人"] }], primaryPropertyId: property.id });
const invalidForm = new FormData();
invalidForm.set("workflowType", "rental_application");
invalidForm.set("caseTitle", "Invalid content must not create");
invalidForm.set("associationDraftJson", associationJson);
invalidForm.set("caseUploadTarget", "property");
invalidForm.set("caseUploadTargetId", property.id);
invalidForm.set("caseUploadFile", new File(["not a pdf"], "invalid.pdf", { type: "application/pdf" }));
const beforeInvalidCases = (await data.listBrokerageCases(user.id, 200, tenant.id, "all")).length;
const invalidResult = await createCaseWithUploadAction({ status: "idle" }, invalidForm);
assert.equal(invalidResult.status, "error");
assert.match(invalidResult.message ?? "", /有效的 PDF/);
assert.equal((await data.listBrokerageCases(user.id, 200, tenant.id, "all")).length, beforeInvalidCases, "invalid file content must be rejected before case creation");
for (const [fileName, fileType, expectedMessage] of [
  ["invalid.png", "image/png", /有效的 PDF/],
  ["invalid.jpg", "image/jpeg", /有效的 PDF/],
  ["invalid.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", /Excel 文件内容无效/],
]) {
  const sniffForm = new FormData();
  sniffForm.set("workflowType", "rental_application");
  sniffForm.set("caseTitle", `Invalid ${fileName} must not create`);
  sniffForm.set("associationDraftJson", associationJson);
  sniffForm.set("caseUploadFile", new File(["not a valid document"], fileName, { type: fileType }));
  const beforeSniffCases = (await data.listBrokerageCases(user.id, 200, tenant.id, "all")).length;
  const sniffResult = await createCaseWithUploadAction({ status: "idle" }, sniffForm);
  assert.equal(sniffResult.status, "error");
  assert.match(sniffResult.message ?? "", expectedMessage);
  assert.equal((await data.listBrokerageCases(user.id, 200, tenant.id, "all")).length, beforeSniffCases, `${fileName} content sniff must reject before case creation`);
}
const form = new FormData();
form.set("workflowType", "rental_application");
form.set("caseTitle", "Explicit target entry");
form.set("associationDraftJson", associationJson);
form.set("caseUploadTarget", "property");
form.set("caseUploadTargetId", property.id);
form.set("caseUploadFile", new File(["%PDF-synthetic"], "entry.pdf", { type: "application/pdf" }));
let redirectUrl = "";
let actionResult;
try {
  actionResult = await createCaseWithUploadAction({ status: "idle" }, form);
} catch (error) {
  assert.match(String(error?.message), /^REDIRECT:/);
  redirectUrl = String(error.message).slice("REDIRECT:".length);
}
if (!redirectUrl) console.error(actionResult);
const caseId = new URL(redirectUrl, "http://broker-desk.local").pathname.split("/").at(-1);
assert(caseId, "create+upload must return to the created case");
const createdCase = await data.getBrokerageCaseById({ tenantId: tenant.id, userId: user.id, caseId });
assert.equal(createdCase?.caseTitle, "Explicit target entry");
const attachments = await data.listAttachmentLinks({ tenantId: tenant.id, targetType: "case", targetId: caseId, limit: 20 });
assert.equal(attachments.length, 1, "the queued original must be linked once into the case archive");
const queuedAttachment = await data.getAttachmentByIdForTenant({ tenantId: tenant.id, id: attachments[0].attachmentId });
assert.equal(queuedAttachment?.targetType, "import_job", "queue success must reuse the import-job blob");
const queuedSourceAttachments = await data.listAttachments({ tenantId: tenant.id, userId: user.id, targetType: "import_job", targetId: attachments[0].sourceImportJobId, limit: 20 });
assert.equal(queuedSourceAttachments.length, 1, "queue success must persist one source blob");
assert.match(redirectUrl, /objectImportJob=import_/);
assert.equal((await data.listObjectImportTargets({ tenantId: tenant.id, userId: user.id, caseId })).length, 0, "stubbed queue must not invent unrelated target records");

const archiveFailureForm = new FormData();
archiveFailureForm.set("workflowType", "rental_application");
archiveFailureForm.set("caseTitle", "Archive failure returns to case");
archiveFailureForm.set("associationDraftJson", associationJson);
archiveFailureForm.set("caseUploadTarget", "property");
archiveFailureForm.set("caseUploadTargetId", property.id);
archiveFailureForm.set("caseUploadFile", new File(["%PDF-synthetic"], "archive-failure.pdf", { type: "application/pdf" }));
queueShouldFail = true;
let archiveFailureRedirect = "";
try {
  await createCaseWithUploadAction({ status: "idle" }, archiveFailureForm);
} catch (error) {
  assert.match(String(error?.message), /^REDIRECT:/);
  archiveFailureRedirect = String(error.message).slice("REDIRECT:".length);
}
queueShouldFail = false;
assert.match(archiveFailureRedirect, /\/cases\/[^?]+\?flash=case_upload_archived_limited/);
const archiveFailureCaseId = new URL(archiveFailureRedirect, "http://broker-desk.local").pathname.split("/").at(-1);
assert(await data.getBrokerageCaseById({ tenantId: tenant.id, userId: user.id, caseId: archiveFailureCaseId }), "archive failure must preserve the created case");
const fallbackAttachments = await data.listAttachmentLinks({ tenantId: tenant.id, targetType: "case", targetId: archiveFailureCaseId, limit: 20 });
assert.equal(fallbackAttachments.length, 1, "queue failure must preserve one fallback original on the case");
const fallbackAttachment = await data.getAttachmentByIdForTenant({ tenantId: tenant.id, id: fallbackAttachments[0].attachmentId });
assert.equal(fallbackAttachment?.targetType, "case", "queue failure fallback must be a case archive");

const archiveStorageFailureForm = new FormData();
archiveStorageFailureForm.set("workflowType", "rental_application");
archiveStorageFailureForm.set("caseTitle", "Archive storage failure is explicit");
archiveStorageFailureForm.set("associationDraftJson", associationJson);
archiveStorageFailureForm.set("caseUploadTarget", "property");
archiveStorageFailureForm.set("caseUploadTargetId", property.id);
archiveStorageFailureForm.set("caseUploadFile", new File(["%PDF-synthetic"], "archive-storage-failure.pdf", { type: "application/pdf" }));
const originalAddPrivateAttachment = data.addPrivateAttachment;
queueShouldFail = true;
data.addPrivateAttachment = async () => { throw new Error("synthetic_archive_failure"); };
let archiveStorageFailureRedirect = "";
try {
  await createCaseWithUploadAction({ status: "idle" }, archiveStorageFailureForm);
} catch (error) {
  assert.match(String(error?.message), /^REDIRECT:/);
  archiveStorageFailureRedirect = String(error.message).slice("REDIRECT:".length);
} finally {
  data.addPrivateAttachment = originalAddPrivateAttachment;
  queueShouldFail = false;
}
assert.match(archiveStorageFailureRedirect, /\/cases\/[^?]+\?flash=case_upload_archive_failed/);
const archiveStorageFailureCaseId = new URL(archiveStorageFailureRedirect, "http://broker-desk.local").pathname.split("/").at(-1);
assert.equal((await data.listAttachmentLinks({ tenantId: tenant.id, targetType: "case", targetId: archiveStorageFailureCaseId, limit: 20 })).length, 0, "archive failure must not claim the original was saved");

const forgedPreviewFile = new File(["%PDF-synthetic"], "forged-preview.pdf", { type: "application/pdf" });
const forgedPreviewForm = new FormData();
forgedPreviewForm.set("workflowType", "rental_application");
forgedPreviewForm.set("caseTitle", "Forged preview must not create");
forgedPreviewForm.set("associationDraftJson", associationJson);
forgedPreviewForm.set("casePreviewValuesJson", JSON.stringify({ "applicant.name": "Unverified value" }));
forgedPreviewForm.set("entryReadFileKeys", JSON.stringify([`${forgedPreviewFile.name}:${forgedPreviewFile.size}`]));
forgedPreviewForm.set("caseUploadFile", forgedPreviewFile);
const beforeForgedPreviewCases = (await data.listBrokerageCases(user.id, 200, tenant.id, "all")).length;
const forgedPreviewResult = await createCaseWithUploadAction({ status: "idle" }, forgedPreviewForm);
assert.equal(forgedPreviewResult.status, "error", "unsigned preview claims must be rejected before case creation");
assert.equal((await data.listBrokerageCases(user.id, 200, tenant.id, "all")).length, beforeForgedPreviewCases, "unsigned preview claims must not create a case");

const conflictPreviewFile = new File(["%PDF-synthetic"], "conflict-preview.pdf", { type: "application/pdf" });
const conflictPreviewKey = `${conflictPreviewFile.name}:${conflictPreviewFile.size}`;
const conflictPreviewForm = new FormData();
conflictPreviewForm.set("workflowType", "rental_application");
conflictPreviewForm.set("caseTitle", "Conflicting preview must not create");
conflictPreviewForm.set("associationDraftJson", associationJson);
conflictPreviewForm.set("previewKind", "customer");
conflictPreviewForm.set("casePreviewValuesJson", JSON.stringify({ "applicant.name": "Candidate A" }));
conflictPreviewForm.set("entryReadFileKeys", JSON.stringify([conflictPreviewKey]));
const conflictDigest = createHash("sha256").update(Buffer.from(await conflictPreviewFile.arrayBuffer())).digest("hex");
const conflictProof = signEntryPreviewProof({
  tenantId: tenant.id,
  userId: user.id,
  fileKey: conflictPreviewKey,
  digest: conflictDigest,
  kind: "customer",
  context: "case",
  candidates: [
    { id: "conflict-a", key: "applicant.name", sourceKey: "applicant.name", label: "Applicant", value: "Candidate A", fileName: conflictPreviewFile.name },
    { id: "conflict-b", key: "applicant.name", sourceKey: "applicant.name", label: "Applicant", value: "Candidate B", fileName: conflictPreviewFile.name },
  ],
});
conflictPreviewForm.set("entryReadProofs", JSON.stringify({ [conflictPreviewKey]: conflictProof }));
conflictPreviewForm.set("entryPreviewDecisions", JSON.stringify({ "conflict-a": "confirmed", "conflict-b": "confirmed" }));
conflictPreviewForm.set("caseUploadFile", conflictPreviewFile);
const beforeConflictPreviewCases = (await data.listBrokerageCases(user.id, 200, tenant.id, "all")).length;
const conflictPreviewResult = await createCaseWithUploadAction({ status: "idle" }, conflictPreviewForm);
assert.equal(conflictPreviewResult.status, "error", "conflicting confirmed candidates must be rejected before case creation");
assert.match(conflictPreviewResult.message ?? "", /冲突/);
assert.equal((await data.listBrokerageCases(user.id, 200, tenant.id, "all")).length, beforeConflictPreviewCases, "conflicting preview candidates must not create a case");

const previewFile = new File(["%PDF-synthetic"], "preview-first.pdf", { type: "application/pdf" });
const previewForm = new FormData();
previewForm.set("workflowType", "rental_application");
previewForm.set("caseTitle", "Preview values are archived without requeue");
previewForm.set("associationDraftJson", associationJson);
previewForm.set("caseUploadTarget", "property");
previewForm.set("caseUploadTargetId", property.id);
previewForm.set("previewKind", "property");
previewForm.set("casePreviewValuesJson", JSON.stringify({ "applicant.name": "Preview applicant", "lease.rent": "80000", unknownField: "must drop" }));
const previewFileKey = `${previewFile.name}:${previewFile.size}`;
const previewDigest = createHash("sha256").update(Buffer.from(await previewFile.arrayBuffer())).digest("hex");
const previewProof = signEntryPreviewProof({
  tenantId: tenant.id,
  userId: user.id,
  fileKey: previewFileKey,
  digest: previewDigest,
  kind: "property",
  context: "case",
  candidates: [
    { id: "preview-applicant", key: "applicant.name", sourceKey: "applicant.name", label: "Applicant", value: "Preview applicant", fileName: previewFile.name },
    { id: "preview-rent", key: "lease.rent", sourceKey: "lease.rent", label: "Rent", value: "80000", fileName: previewFile.name },
  ],
});
previewForm.set("entryReadFileKeys", JSON.stringify([previewFileKey]));
previewForm.set("entryReadProofs", JSON.stringify({ [previewFileKey]: previewProof }));
previewForm.set("entryPreviewDecisions", JSON.stringify({ "preview-applicant": "confirmed", "preview-rent": "confirmed" }));
previewForm.set("caseUploadFile", previewFile);
const queueCallsBeforePreview = queueCallCount;
let previewRedirect = "";
try {
  await createCaseWithUploadAction({ status: "idle" }, previewForm);
} catch (error) {
  assert.match(String(error?.message), /^REDIRECT:/);
  previewRedirect = String(error.message).slice("REDIRECT:".length);
}
assert.match(previewRedirect, /flash=case_upload_archived_preview/);
assert.equal(queueCallCount, queueCallsBeforePreview, "a file already read in the case preview must not be queued again");
const previewCaseId = new URL(previewRedirect, "http://broker-desk.local").pathname.split("/").at(-1);
const previewCase = await data.getBrokerageCaseById({ tenantId: tenant.id, userId: user.id, caseId: previewCaseId });
assert.equal(previewCase?.confirmedDataJson?.["applicant.name"], "Preview applicant");
assert.equal(previewCase?.confirmedDataJson?.["lease.rent"], "80000");
assert.equal(previewCase?.confirmedDataJson?.unknownField, undefined);
const previewAttachments = await data.listAttachmentLinks({ tenantId: tenant.id, targetType: "case", targetId: previewCaseId, limit: 20 });
assert.equal(previewAttachments.length, 1, "preview-first upload must archive one original on the case");
const previewAttachment = await data.getAttachmentByIdForTenant({ tenantId: tenant.id, id: previewAttachments[0].attachmentId });
assert.equal(previewAttachment?.targetType, "case", "preview-first upload must not leave an import-job source");

const auditFailureForm = new FormData();
auditFailureForm.set("workflowType", "rental_application");
auditFailureForm.set("caseTitle", "Preview audit failure remains archived");
auditFailureForm.set("associationDraftJson", associationJson);
auditFailureForm.set("previewKind", "property");
auditFailureForm.set("casePreviewValuesJson", JSON.stringify({ "applicant.name": "Preview applicant", "lease.rent": "80000" }));
auditFailureForm.set("entryReadFileKeys", JSON.stringify([previewFileKey]));
auditFailureForm.set("entryReadProofs", JSON.stringify({ [previewFileKey]: previewProof }));
auditFailureForm.set("entryPreviewDecisions", JSON.stringify({ "preview-applicant": "confirmed", "preview-rent": "confirmed" }));
auditFailureForm.set("caseUploadFile", new File(["%PDF-synthetic"], previewFile.name, { type: "application/pdf" }));
const originalAddAuditLog = data.addAuditLog;
data.addAuditLog = async () => { throw new Error("synthetic_preview_audit_failure"); };
let auditFailureRedirect = "";
try {
  await createCaseWithUploadAction({ status: "idle" }, auditFailureForm);
} catch (error) {
  assert.match(String(error?.message), /^REDIRECT:/);
  auditFailureRedirect = String(error.message).slice("REDIRECT:".length);
} finally {
  data.addAuditLog = originalAddAuditLog;
}
assert.match(auditFailureRedirect, /flash=case_upload_preview_audit_failed/);
const auditFailureCaseId = new URL(auditFailureRedirect, "http://broker-desk.local").pathname.split("/").at(-1);
const auditFailureAttachments = await data.listAttachmentLinks({ tenantId: tenant.id, targetType: "case", targetId: auditFailureCaseId, limit: 20 });
assert.equal(auditFailureAttachments.length, 1, "audit failure must preserve the already archived original");
const auditFailureAttachment = await data.getAttachmentByIdForTenant({ tenantId: tenant.id, id: auditFailureAttachments[0].attachmentId });
assert.equal(auditFailureAttachment?.targetType, "case", "audit failure must not turn an archived original into a reupload failure");
console.log("case unified entry behavior: PASS");
