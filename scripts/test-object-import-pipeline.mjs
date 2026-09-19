import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;
function resolveCandidate(value) {
  if (!value || (!value.startsWith("/") && !value.startsWith("."))) return undefined;
  return [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}
Module._resolveFilename = function (request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
const compileTypescript = function (module, filename) {
  const result = typescript.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, jsx: typescript.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};
require.extensions[".ts"] = compileTypescript;
require.extensions[".tsx"] = compileTypescript;


// Only framework/auth boundaries are stubbed; public data proxy and memory driver execute.
const originalLoad = Module._load;
Module._load = function(request, parent, ...rest) {
  if (parent?.filename === resolve(root, "src/lib/data.ts")) {
    if (request === "@/lib/data.postgres") return {};
    if (request === "react") return { cache: (fn) => fn };
    if (["next/headers", "@/lib/actor", "@/lib/auth-mode", "@/lib/clerk-auth", "@/lib/staging-access-policy"].includes(request)) return {};
    if (request === "@/lib/production-readiness") return {
      isPostgresDataStoreConfigured: () => false, assertProductionDataStoreReady: () => {}, isProductionRuntime: () => false,
    };
  }
  return originalLoad.call(this, request, parent, ...rest);
};

const data = require(resolve(root, "src/lib/data.ts"));
data.resetBusinessDataForQa();
const tenant = await data.getTenantById("tenant_cherry");
const user = await data.getUserById("user_demo");
const membership = (await data.listTenantMemberships(user.id)).find((item) => item.tenantId === tenant.id);
let session = { tenant, user, membership, externalAuthSubject: user.externalAuthSubject };
const { registerTenantSessionProvenance } = require(resolve(root, "src/lib/tenant-session-provenance.ts"));
registerTenantSessionProvenance(session);
const person = await data.addClient({ tenantId: tenant.id, ownerUserId: user.id, name: "Synthetic person", phone: "000-0000-0000", budgetType: "total_price", purpose: "buy", loanPreApprovalStatus: "not_applied", stage: "lead", temperature: "cold", brokerageContractType: "none", amlCheckStatus: "not_required" });
const { writeCaseAssociationData } = require(resolve(root, "src/lib/case-associations.ts"));
const brokerageCase = await data.saveBrokerageCaseExtractionReview({ tenantId: tenant.id, userId: user.id, caseType: "unit_sale", caseTitle: "Synthetic object import", confirmedDataJson: writeCaseAssociationData({}, { parties: [{ partyId: person.id, roles: ["主要申请人"] }] }, {}), sourceImportJobIds: [], reviewItems: [] });
const frameworkLoad = Module._load;
const field = (fieldKey, value, confidence = 0.95) => ({ fieldKey, value, normalizedValue: value, confidence, sourceSheet: "page 1", method: "ocr", sourceFileHash: "synthetic-hash", templateVersion: "test" });
let extractCalls = 0;
let extractionFields = [field("applicant.name", "Extracted name"), field("applicant.phone", "090-1234-5678", 0.6), field("guarantor.name", "Must not leak"), field("applicant.residenceCardNumber", "Must not persist")];
let lastRedirectUrl = "";
Module._load = function(request, parent, ...rest) {
  if (request === "@/lib/tenant-session" && parent?.filename.endsWith("/src/app/object-import-actions.ts")) return { requireTenantSession: async ({ permission }) => { assert(["source.upload", "extract.accept_result"].includes(permission)); return session; } };
  if (request === "next/navigation") return { redirect: (url) => { lastRedirectUrl = String(url); throw new Error(`REDIRECT:${url}`); } };
  if (request === "next/cache") return { revalidatePath: () => {} };
  if (request === "@/lib/identity-document-extractor") return { extractIdentityDocumentsFromFiles: async (sources) => { extractCalls++; assert.equal(sources.length, 1); return { schemaVersion: "v1", documentType: "identity_residence_card", documentTypeLabel: "Test", extractionStatus: "recognized", fields: extractionFields, fingerprintConfidence: 0.9 }; } };
  return frameworkLoad.call(this, request, parent, ...rest);
};
const { uploadObjectImportAction } = require(resolve(root, "src/app/object-import-actions.ts"));
const { processIdentityImportJob } = require(resolve(root, "src/lib/identity-import-processor.ts"));
const { processExcelImportJob } = require(resolve(root, "src/lib/excel-import-processor.ts"));
const { ensureObjectImportTask } = require(resolve(root, "src/lib/object-import-processor-adapter.ts"));
function form(targetId = person.id, content = "%PDF-synthetic", filename = "synthetic.pdf") { const f = new FormData(); f.set("caseId", brokerageCase.id); f.set("targetType", "party"); f.set("targetId", targetId); f.set("uploadFile", new File([content], filename, { type: "application/pdf" })); return f; }
await assert.rejects(uploadObjectImportAction(form("unassociated")), /not_associated/);
assert.equal((await data.listImportJobs(user.id, 500, tenant.id)).length, 0);
await assert.rejects(uploadObjectImportAction(form()), /REDIRECT:/);
const scope = { tenantId: tenant.id, userId: user.id };
const [target] = await data.listObjectImportTargets({ ...scope, caseId: brokerageCase.id });
assert(target && target.targetId === person.id && target.status === "queued");
assert.match(lastRedirectUrl, new RegExp(`objectImportJob=${target.importJobId}`), "object upload redirect must identify only the newly queued job");
assert.equal((await processIdentityImportJob({ ...scope, tenantId: "foreign", jobId: target.importJobId })).ok, false);
assert.equal(extractCalls, 0);
assert.equal((await processIdentityImportJob({ ...scope, jobId: target.importJobId })).ok, true);
const candidates = await data.listObjectImportCandidates({ ...scope, targetId: target.id });
assert.equal(candidates.length, 2);
const originalSource = await data.getAttachmentById({ ...scope, id: target.sourceAttachmentId });
assert(originalSource && originalSource.targetType === "import_job" && originalSource.targetId === target.importJobId);
const { createHash } = require("node:crypto");
for (const candidate of candidates) {
  assert.equal(candidate.provenance.sourceAttachmentId, target.sourceAttachmentId);
  assert.equal(candidate.provenance.sourceFileHash, createHash("sha256").update(Buffer.from("%PDF-synthetic")).digest("hex"));
}
assert.equal(candidates.find((item) => item.fieldKey === "name").candidateValue, "Extracted name");
assert.equal(candidates.find((item) => item.fieldKey === "phone").status, "low_confidence");
assert.equal((await data.getObjectImportTarget({ ...scope, id: target.id })).status, "needs_review");
assert.equal((await data.getClientById(person.id, tenant.id)).name, "Synthetic person");
assert.deepEqual(await data.listObjectImportCandidates({ ...scope, tenantId: "foreign", targetId: target.id }), []);
const jobs = await data.listImportJobs(user.id, 500, tenant.id);
assert.equal(JSON.parse(jobs[0].notes).objectImport.targetObjectId, person.id);
await assert.rejects(uploadObjectImportAction(form()), /REDIRECT:/);
assert.equal((await data.listObjectImportTargets({ ...scope, caseId: brokerageCase.id })).length, 1);
assert.equal((await processIdentityImportJob({ ...scope, jobId: target.importJobId })).ok, true);
assert.equal(extractCalls, 1);
// Same object/file/version in another case must create a separate task.
const secondCase = await data.saveBrokerageCaseExtractionReview({ ...scope, caseType: "unit_sale", caseTitle: "Synthetic second case", confirmedDataJson: writeCaseAssociationData({}, { parties: [{ partyId: person.id, roles: ["主要申请人"] }] }, {}), sourceImportJobIds: [], reviewItems: [] });
const secondCaseForm = form(); secondCaseForm.set("caseId", secondCase.id);
await assert.rejects(uploadObjectImportAction(secondCaseForm), /REDIRECT:/);
const [secondTarget] = await data.listObjectImportTargets({ ...scope, caseId: secondCase.id });
assert(secondTarget && secondTarget.id !== target.id && secondTarget.importJobId !== target.importJobId);
await assert.rejects(uploadObjectImportAction(secondCaseForm), /REDIRECT:/);
assert.equal((await data.listObjectImportTargets({ ...scope, caseId: secondCase.id })).length, 1);
const originalSession = session;
session = { ...session, tenant: { ...tenant, id: "foreign" }, membership: { ...membership, tenantId: "foreign" } };
registerTenantSessionProvenance(session);
await assert.rejects(uploadObjectImportAction(form()), /case_not_writable/);
session = originalSession;
const { reviewObjectImportAction } = require(resolve(root, "src/app/object-import-actions.ts"));
const { createRequestContext } = require(resolve(root, "src/lib/visibility-resolver.ts"));
const context = createRequestContext(session);
const nameField = candidates.find((item) => item.fieldKey === "name");
const phoneField = candidates.find((item) => item.fieldKey === "phone");
const reviewInput = { context, targetId: target.id, fieldId: nameField.id, expectedVersion: target.targetVersion, expectedCandidateValue: nameField.candidateValue, decision: "confirm", value: "Human confirmed" };
assert.deepEqual(await data.reviewObjectImportCandidate({ ...reviewInput, context: { ...context } }), { ok: false, reason: "not_writable" });
assert.deepEqual(await data.reviewObjectImportCandidate({ ...reviewInput, expectedCandidateValue: "stale draft" }), { ok: false, reason: "conflict" });
const personBeforeConflict = await data.getClientById(person.id, tenant.id);
const originalName = personBeforeConflict.name;
personBeforeConflict.name = "Externally changed";
assert.deepEqual(await data.reviewObjectImportCandidate(reviewInput), { ok: false, reason: "conflict" });
assert.equal(personBeforeConflict.name, "Externally changed");
personBeforeConflict.name = originalName;
await data.upsertObjectImportCandidate({ ...nameField, provenance: { ...nameField.provenance, sourceAttachmentId: "forged-source" } });
assert.deepEqual(await data.reviewObjectImportCandidate(reviewInput), { ok: false, reason: "not_writable" });
await data.upsertObjectImportCandidate(nameField);
const competing = await Promise.all([data.reviewObjectImportCandidate(reviewInput), data.reviewObjectImportCandidate(reviewInput)]);
assert.equal(competing.filter((item) => item.ok).length, 1);
assert.equal(competing.filter((item) => !item.ok && item.reason === "already_reviewed").length, 1);
assert.equal((await data.getClientById(person.id, tenant.id)).name, "Human confirmed");
assert.equal((await data.getClientById(person.id, tenant.id)).phone, "000-0000-0000");
const duplicateReviewForm = new FormData();
duplicateReviewForm.set("importTargetId", target.id); duplicateReviewForm.set("fieldId", nameField.id);
duplicateReviewForm.set("expectedVersion", target.targetVersion); duplicateReviewForm.set("expectedCandidateValue", nameField.candidateValue); duplicateReviewForm.set("decision", "confirm");
await assert.rejects(reviewObjectImportAction(duplicateReviewForm), /REDIRECT:/);
assert.match(lastRedirectUrl, /flash=object_import_review_already_reviewed/);
const rejectForm = new FormData();
rejectForm.set("importTargetId", target.id); rejectForm.set("fieldId", phoneField.id);
rejectForm.set("expectedVersion", target.targetVersion); rejectForm.set("expectedCandidateValue", phoneField.candidateValue); rejectForm.set("decision", "reject");
await assert.rejects(reviewObjectImportAction(rejectForm), /REDIRECT:/);
assert.match(lastRedirectUrl, new RegExp(`/cases/${brokerageCase.id}\\?`));
assert.match(lastRedirectUrl, /flash=object_import_review_conflict/);
assert.match(lastRedirectUrl, new RegExp(`objectImportJob=${target.importJobId}`));
const refreshed = await data.getObjectImportTarget({ ...scope, id: target.id });
rejectForm.set("expectedVersion", refreshed.targetVersion);
await assert.rejects(reviewObjectImportAction(rejectForm), /REDIRECT:/);
assert.equal((await data.getClientById(person.id, tenant.id)).phone, "000-0000-0000");
assert.equal((await data.getObjectImportTarget({ ...scope, id: target.id })).status, "completed");
assert.equal((await data.listObjectImportCandidates({ ...scope, targetId: target.id })).find((item) => item.id === phoneField.id).status, "rejected");
const completedTarget = await data.getObjectImportTarget({ ...scope, id: target.id });
const originalJobMetadata = JSON.parse(jobs[0].notes).objectImport;
assert.notEqual(completedTarget.targetVersion, originalJobMetadata.targetVersion, "human review must advance the object version while the job snapshot stays unchanged");
assert.deepEqual(await ensureObjectImportTask(jobs[0], scope), completedTarget, "a completed target may be re-entered with its upload-time version snapshot");
// A second upload for the same case/target must surface a zero-supported-field
// failure without replacing the already confirmed value or letting the older
// completed target hide the new failed target.
const beforeNoFields = await data.getClientById(person.id, tenant.id);
extractionFields = [];
await assert.rejects(uploadObjectImportAction(form(person.id, "%PDF-no-supported-fields", "empty.pdf")), /REDIRECT:/);
const noFieldsTarget = (await data.listObjectImportTargets({ ...scope, caseId: brokerageCase.id })).find((item) => item.id !== target.id);
assert(noFieldsTarget && noFieldsTarget.status === "queued");
const noFieldsResult = await processIdentityImportJob({ ...scope, jobId: noFieldsTarget.importJobId });
assert.deepEqual(noFieldsResult, { ok: false, status: "failed", error: "object_import_no_supported_fields" });
assert.equal((await data.getObjectImportTarget({ ...scope, id: noFieldsTarget.id })).status, "failed");
assert.equal((await data.getObjectImportTarget({ ...scope, id: target.id })).status, "completed");
assert.equal((await data.getClientById(person.id, tenant.id)).name, beforeNoFields.name, "zero-field failure must preserve the existing object value");
assert.equal((await data.listImportJobs(user.id, 500, tenant.id)).find((item) => item.id === noFieldsTarget.importJobId).status, "failed");
extractionFields = [field("applicant.name", "Extracted name"), field("applicant.phone", "090-1234-5678", 0.6), field("guarantor.name", "Must not leak"), field("applicant.residenceCardNumber", "Must not persist")];
for (const mutation of [
  { mutation: { caseId: "forged-case" }, error: /metadata_mutated/ },
  { mutation: { targetObjectType: "property" }, error: /metadata_mutated/ },
  { mutation: { targetObjectId: "forged-target" }, error: /metadata_mutated/ },
  { mutation: { sourceAttachmentId: "forged-source" }, error: /source_attachment_mismatch/ },
]) {
  const mutatedMetadata = { ...originalJobMetadata, ...mutation.mutation };
  const mutatedCompletedJob = { ...jobs[0], notes: JSON.stringify({ objectImport: mutatedMetadata }) };
  await assert.rejects(ensureObjectImportTask(mutatedCompletedJob, scope), mutation.error);
}
await data.upsertObjectImportCandidate({ ...phoneField, candidateValue: "new model suggestion", finalValue: "new model suggestion" });
assert.equal((await data.listObjectImportCandidates({ ...scope, targetId: target.id })).find((item) => item.id === phoneField.id).status, "rejected");
await assert.rejects(ensureObjectImportTask(jobs[0], { ...scope, tenantId: "foreign" }), /scope_mismatch/);
await data.updateImportJobMapping({
  tenantId: tenant.id,
  userId: user.id,
  jobId: target.importJobId,
  mappingJson: {},
  notes: JSON.stringify({ objectImport: { caseId: brokerageCase.id, targetObjectType: "party", targetObjectId: "forged-target", targetVersion: target.targetVersion } }),
  status: "mapped",
});
const mutatedJob = (await data.listImportJobs(user.id, 500, tenant.id)).find((item) => item.id === target.importJobId);
await assert.rejects(ensureObjectImportTask(mutatedJob, scope), /metadata_mutated/);
// Property review uses the same CAS operation, with a numeric listingPrice mapping.
const property = await data.addProperty({ tenantId: tenant.id, createdByUserId: user.id, currentOwnerUserId: user.id, name: "Original property", area: "Original area", address: "Original address", listingPrice: 1000 });
await data.updateBrokerageCaseConfirmedData({ ...scope, caseId: brokerageCase.id, confirmedDataJson: writeCaseAssociationData(brokerageCase.confirmedDataJson, { parties: [{ partyId: person.id, roles: ["主要申请人"] }], primaryPropertyId: property.id }, {}) });
const { buildObjectVersionFingerprint, buildObjectImportIdempotencyKey } = require(resolve(root, "src/lib/object-import-contract.ts"));
const { persistObjectImportJobExtraction } = require(resolve(root, "src/lib/object-import-processor-adapter.ts"));
const fixtureDirectory = resolve(root, "scripts/fixtures/object-import");
assert(existsSync(resolve(fixtureDirectory, "h034-invalid.xlsx")) && existsSync(resolve(fixtureDirectory, "h034-supported.xlsx")), "controlled H034 fixtures must remain in the repository");
const invalidH034Workbook = readFileSync(resolve(fixtureDirectory, "h034-invalid.xlsx"));
const supportedH034Workbook = readFileSync(resolve(fixtureDirectory, "h034-supported.xlsx"));
// A worker can re-enter after object review advanced the target version while
// the persisted job still carries its upload-time metadata snapshot.
const reentryPerson = await data.addClient({ ...scope, ownerUserId: user.id, name: "Reentry original", phone: "000-2222-3333", budgetType: "total_price", purpose: "buy", loanPreApprovalStatus: "not_applied", stage: "lead", temperature: "cold", brokerageContractType: "none", amlCheckStatus: "not_required" });
const reentryCase = await data.saveBrokerageCaseExtractionReview({ ...scope, caseType: "unit_sale", caseTitle: "Completed target re-entry", confirmedDataJson: writeCaseAssociationData({}, { parties: [{ partyId: reentryPerson.id, roles: ["主要申请人"] }] }, {}), sourceImportJobIds: [], reviewItems: [] });
const reentryVersion = buildObjectVersionFingerprint(reentryPerson);
const reentryContent = Buffer.from("%PDF-synthetic-reentry");
const reentryHash = createHash("sha256").update(reentryContent).digest("hex");
const reentryJob = await data.addImportJob({ ...scope, sourceType: "scan", targetEntity: "parties", title: "Reentry identity", status: "processing", idempotencyKey: buildObjectImportIdempotencyKey({ tenantId: tenant.id, target: { caseId: reentryCase.id, targetObjectType: "party", targetObjectId: reentryPerson.id, targetVersion: reentryVersion }, sourceHash: `same_person:${reentryHash}` }), notes: JSON.stringify({ objectImport: { caseId: reentryCase.id, targetObjectType: "party", targetObjectId: reentryPerson.id, targetVersion: reentryVersion } }) });
const reentrySource = await data.addPrivateAttachment({ ...scope, targetType: "import_job", targetId: reentryJob.id, fileName: "reentry.pdf", content: reentryContent });
await persistObjectImportJobExtraction({ ...scope, job: reentryJob, fields: [field("applicant.name", "Reentry candidate")] });
const reentryTarget = await data.getObjectImportTargetByJob({ ...scope, importJobId: reentryJob.id });
const reentryField = (await data.listObjectImportCandidates({ ...scope, targetId: reentryTarget.id }))[0];
assert.equal((await data.reviewObjectImportCandidate({ context, targetId: reentryTarget.id, fieldId: reentryField.id, expectedVersion: reentryTarget.targetVersion, expectedCandidateValue: reentryField.candidateValue, decision: "confirm", value: "Reentry candidate" })).ok, true);
const completedReentryTarget = await data.getObjectImportTarget({ ...scope, id: reentryTarget.id });
assert.equal(completedReentryTarget.status, "completed");
assert.notEqual(completedReentryTarget.targetVersion, reentryVersion);
const extractCallsBeforeCompletedReentry = extractCalls;
const completedReentry = await processIdentityImportJob({ ...scope, jobId: reentryJob.id });
assert.equal(completedReentry.ok, true, "a processing job with a completed object target must resume without throwing");
assert.equal(completedReentry.status, "mapped");
assert.equal(extractCalls, extractCallsBeforeCompletedReentry, "completed target re-entry must not run extraction again");
assert.equal((await data.getClientById(reentryPerson.id, tenant.id)).name, "Reentry candidate");
const reentryTargetAfter = await data.getObjectImportTarget({ ...scope, id: reentryTarget.id });
assert.equal(reentryTargetAfter.status, "completed");
assert.equal(reentryTargetAfter.sourceAttachmentId, reentrySource.id, "completed target re-entry must preserve its original source");
const reentryCandidateAfter = (await data.listObjectImportCandidates({ ...scope, targetId: reentryTarget.id }))[0];
assert.equal(reentryCandidateAfter.provenance.sourceAttachmentId, reentrySource.id);
assert.equal(reentryCandidateAfter.provenance.sourceFileHash, reentryHash);
const reentryAudits = await data.listAuditLogs(user.id, { tenantId: tenant.id });
assert.equal(reentryAudits.filter((item) => item.targetId === reentryPerson.id && item.action === "object_import_confirm").length, 1, "re-entry must not duplicate the human confirmation audit");
await data.updateClient(reentryPerson.id, { tenantId: tenant.id, name: "Reentry original", phone: "000-2222-3333", budgetType: "total_price", purpose: "buy", loanPreApprovalStatus: "not_applied", stage: "lead", temperature: "cold", brokerageContractType: "none", amlCheckStatus: "not_required" });
assert.equal(buildObjectVersionFingerprint(await data.getClientById(reentryPerson.id, tenant.id)), reentryVersion, "restoring the reviewed object must restore the upload-time version used by the idempotency key");
const jobsBeforeActionReentry = await data.listImportJobs(user.id, 500, tenant.id);
const sourcesBeforeActionReentry = await data.listAttachments({ ...scope, targetType: "import_job", targetId: reentryJob.id, limit: 10 });
const reentryForm = new FormData();
reentryForm.set("caseId", reentryCase.id); reentryForm.set("targetType", "party"); reentryForm.set("targetId", reentryPerson.id); reentryForm.set("uploadFile", new File([reentryContent], "reentry.pdf", { type: "application/pdf" }));
await assert.rejects(uploadObjectImportAction(reentryForm), /REDIRECT:/, "the protected upload action must deduplicate a completed target after object-version drift");
assert.equal((await data.listImportJobs(user.id, 500, tenant.id)).length, jobsBeforeActionReentry.length, "completed target re-entry must not create a second import job");
assert.equal((await data.listAttachments({ ...scope, targetType: "import_job", targetId: reentryJob.id, limit: 10 })).length, sourcesBeforeActionReentry.length, "completed target re-entry must not duplicate its source attachment");
assert.equal((await data.getObjectImportTarget({ ...scope, id: reentryTarget.id })).status, "completed");
assert.equal((await data.getClientById(reentryPerson.id, tenant.id)).name, "Reentry original", "dedupe must preserve the restored human value");
const propertyJob = await data.addImportJob({ ...scope, sourceType: "excel", targetEntity: "properties", title: "Synthetic property", status: "queued", idempotencyKey: "property-test", notes: JSON.stringify({ objectImport: { caseId: brokerageCase.id, targetObjectType: "property", targetObjectId: property.id, targetVersion: buildObjectVersionFingerprint(property) } }) });
const propertySource = await data.addPrivateAttachment({ ...scope, targetType: "import_job", targetId: propertyJob.id, fileName: "synthetic.xlsx", content: Buffer.from("synthetic workbook") });
await persistObjectImportJobExtraction({ ...scope, job: propertyJob, fields: [field("property_name", "New property"), field("property.area", "New area"), field("property.address", "New address"), field("property.listing_price", "2000")] });
const propertyTask = await data.getObjectImportTargetByJob({ ...scope, importJobId: propertyJob.id });
const propertyFields = await data.listObjectImportCandidates({ ...scope, targetId: propertyTask.id });
assert.equal(propertyFields.length, 4);
const propertyInput = (candidate, version) => ({ context, targetId: propertyTask.id, fieldId: candidate.id, expectedVersion: version, expectedCandidateValue: candidate.candidateValue, decision: "confirm" });
const priceField = propertyFields.find((item) => item.fieldKey === "listing_price");
for (const value of ["0", "-1", "2.5", "Infinity", "2147483648"]) assert.deepEqual(await data.reviewObjectImportCandidate({ ...propertyInput(priceField, propertyTask.targetVersion), value }), { ok: false, reason: "invalid_value" });
assert.deepEqual(await data.reviewObjectImportCandidate({ ...propertyInput(priceField, propertyTask.targetVersion), context: { ...context, tenantId: "foreign" } }), { ok: false, reason: "not_writable" });
const originalPropertyName = property.name;
property.name = "External edit";
assert.deepEqual(await data.reviewObjectImportCandidate(propertyInput(priceField, propertyTask.targetVersion)), { ok: false, reason: "conflict" });
property.name = originalPropertyName;
const detached = writeCaseAssociationData(brokerageCase.confirmedDataJson, { parties: [{ partyId: person.id, roles: ["主要申请人"] }] }, {});
await data.updateBrokerageCaseConfirmedData({ ...scope, caseId: brokerageCase.id, confirmedDataJson: detached });
assert.deepEqual(await data.reviewObjectImportCandidate(propertyInput(priceField, propertyTask.targetVersion)), { ok: false, reason: "not_writable" });
await data.updateBrokerageCaseConfirmedData({ ...scope, caseId: brokerageCase.id, confirmedDataJson: writeCaseAssociationData(detached, { parties: [{ partyId: person.id, roles: ["主要申请人"] }], primaryPropertyId: property.id }, {}) });
for (const candidate of propertyFields) {
  const current = await data.getObjectImportTarget({ ...scope, id: propertyTask.id });
  const reviewForm = new FormData();
  reviewForm.set("importTargetId", propertyTask.id); reviewForm.set("fieldId", candidate.id); reviewForm.set("expectedVersion", current.targetVersion); reviewForm.set("expectedCandidateValue", candidate.candidateValue);
  reviewForm.set("decision", candidate.fieldKey === "address" ? "reject" : "confirm");
  await assert.rejects(reviewObjectImportAction(reviewForm), /REDIRECT:/);
}
const propertyAfter = (await data.resolvePropertyVisibilityForContext({ context, propertyId: property.id })).record;
assert.equal(propertyAfter.name, "New property"); assert.equal(propertyAfter.area, "New area"); assert.equal(propertyAfter.address, "Original address"); assert.equal(propertyAfter.listingPrice, 2000);
assert.equal((await data.getObjectImportTarget({ ...scope, id: propertyTask.id })).status, "completed");
const audits = await data.listAuditLogs(user.id, { tenantId: tenant.id });
assert.equal(audits.filter((item) => item.targetType === "property" && item.targetId === property.id && item.action.startsWith("object_import_")).length, 4);
const propertyReentry = await processExcelImportJob({ ...scope, jobId: propertyJob.id });
assert.equal(propertyReentry.ok, true, "a queued Excel job with a completed object target must resume without throwing");
assert.equal(propertyReentry.status, "mapped");
assert.equal((await data.getObjectImportTarget({ ...scope, id: propertyTask.id })).status, "completed");
assert.equal((await data.resolvePropertyVisibilityForContext({ context, propertyId: property.id })).record.name, "New property", "Excel re-entry must preserve the human-confirmed property value");
const auditsAfterPropertyReentry = await data.listAuditLogs(user.id, { tenantId: tenant.id });
assert.equal(auditsAfterPropertyReentry.filter((item) => item.targetType === "property" && item.targetId === property.id && item.action.startsWith("object_import_")).length, 4, "Excel re-entry must not duplicate object review audits");
// Exercise the real Excel reader and extractor with the project H034 fixtures:
// the old CAS workbook has no supported template fields, while the supported
// local-condition workbook must produce a reviewable property-name candidate.
const invalidH034Property = await data.addProperty({ ...scope, name: "H034 invalid original", area: "80", address: "H034 invalid address", listingPrice: 3000, createdByUserId: user.id, currentOwnerUserId: user.id });
const invalidH034Before = await data.resolvePropertyVisibilityForContext({ context, propertyId: invalidH034Property.id });
const invalidH034Job = await data.addImportJob({ ...scope, sourceType: "excel", targetEntity: "properties", title: "H034 invalid CAS", status: "queued", idempotencyKey: "h034-invalid-real", notes: JSON.stringify({ objectImport: { caseId: brokerageCase.id, targetObjectType: "property", targetObjectId: invalidH034Property.id, targetVersion: buildObjectVersionFingerprint(invalidH034Property) } }) });
await data.addPrivateAttachment({ ...scope, targetType: "import_job", targetId: invalidH034Job.id, fileName: "h034-invalid.xlsx", content: invalidH034Workbook });
const invalidH034Result = await processExcelImportJob({ ...scope, jobId: invalidH034Job.id });
assert.deepEqual(invalidH034Result, { ok: false, status: "failed", error: "object_import_no_supported_fields" }, "the original H034 workbook must fail as an object import");
const invalidH034Target = await data.getObjectImportTargetByJob({ ...scope, importJobId: invalidH034Job.id });
assert(invalidH034Target && invalidH034Target.status === "failed");
assert.deepEqual(await data.listObjectImportCandidates({ ...scope, targetId: invalidH034Target.id }), [], "unsupported H034 workbook must not create candidates");
assert.deepEqual((await data.listImportJobs(user.id, 500, tenant.id)).find((item) => item.id === invalidH034Job.id).status, "failed");
assert.deepEqual(await data.resolvePropertyVisibilityForContext({ context, propertyId: invalidH034Property.id }), invalidH034Before, "unsupported H034 workbook must preserve the complete property visibility record");

const supportedH034Property = await data.addProperty({ ...scope, name: "H034 supported original", area: "81", address: "H034 supported address", listingPrice: 3100, createdByUserId: user.id, currentOwnerUserId: user.id });
const supportedH034Before = await data.resolvePropertyVisibilityForContext({ context, propertyId: supportedH034Property.id });
const supportedH034Job = await data.addImportJob({ ...scope, sourceType: "excel", targetEntity: "properties", title: "H034 supported format", status: "queued", idempotencyKey: "h034-supported-real", notes: JSON.stringify({ objectImport: { caseId: brokerageCase.id, targetObjectType: "property", targetObjectId: supportedH034Property.id, targetVersion: buildObjectVersionFingerprint(supportedH034Property) } }) });
await data.addPrivateAttachment({ ...scope, targetType: "import_job", targetId: supportedH034Job.id, fileName: "h034-supported.xlsx", content: supportedH034Workbook });
const supportedH034Result = await processExcelImportJob({ ...scope, jobId: supportedH034Job.id });
assert.equal(supportedH034Result.ok, true, "supported H034 workbook must complete extraction");
const supportedH034Target = await data.getObjectImportTargetByJob({ ...scope, importJobId: supportedH034Job.id });
assert(supportedH034Target && supportedH034Target.status === "needs_review");
const supportedH034Candidates = await data.listObjectImportCandidates({ ...scope, targetId: supportedH034Target.id });
assert.equal(supportedH034Candidates.find((item) => item.fieldKey === "name")?.candidateValue, "H034 Local CAS Candidate 20260919");
assert.deepEqual(await data.resolvePropertyVisibilityForContext({ context, propertyId: supportedH034Property.id }), supportedH034Before, "supported extraction must not write before review");
// Main-input save commits the object CAS and case field as one data-layer operation.
const atomicPerson = await data.addClient({ ...scope, ownerUserId: user.id, name: "Atomic original", phone: "000-1111-2222", budgetType: "total_price", purpose: "buy", loanPreApprovalStatus: "not_applied", stage: "lead", temperature: "cold", brokerageContractType: "none", amlCheckStatus: "not_required" });
const atomicCase = await data.saveBrokerageCaseExtractionReview({ ...scope, caseType: "unit_sale", caseTitle: "Atomic save", confirmedDataJson: writeCaseAssociationData({}, { parties: [{ partyId: atomicPerson.id, roles: ["主要申请人"] }] }, {}), sourceImportJobIds: [], reviewItems: [] });
const atomicJob = await data.addImportJob({ ...scope, sourceType: "identity", targetEntity: "clients", title: "Atomic identity", status: "queued", idempotencyKey: "atomic-test", notes: JSON.stringify({ objectImport: { caseId: atomicCase.id, targetObjectType: "party", targetObjectId: atomicPerson.id, targetVersion: buildObjectVersionFingerprint(atomicPerson) } }) });
const atomicSource = await data.addPrivateAttachment({ ...scope, targetType: "import_job", targetId: atomicJob.id, fileName: "atomic.pdf", content: Buffer.from("%PDF-synthetic-atomic") });
await persistObjectImportJobExtraction({ ...scope, job: atomicJob, fields: [field("applicant.name", "Atomic candidate"), field("applicant.phone", "090-9999-8888")] });
const atomicTarget = await data.getObjectImportTargetByJob({ ...scope, importJobId: atomicJob.id });
const atomicFields = await data.listObjectImportCandidates({ ...scope, targetId: atomicTarget.id });
const atomicName = atomicFields.find((item) => item.fieldKey === "name");
const atomicPhone = atomicFields.find((item) => item.fieldKey === "phone");
const atomicNextData = { ...atomicCase.confirmedDataJson, "applicant.name": "Atomic candidate" };
const atomicSave = await data.saveCaseWorkbenchWithObjectReview({
  context,
  caseId: atomicCase.id,
  confirmedDataJson: atomicNextData,
  objectReview: { context, targetId: atomicTarget.id, fieldId: atomicName.id, expectedVersion: atomicTarget.targetVersion, expectedCandidateValue: atomicName.candidateValue, decision: "confirm", value: "Atomic candidate", caseFieldValue: "Atomic candidate" },
});
assert.equal(atomicSave.ok, true);
assert.equal((await data.getClientById(atomicPerson.id, tenant.id)).name, "Atomic candidate");
assert.equal((await data.getBrokerageCaseById({ userId: user.id, tenantId: tenant.id, caseId: atomicCase.id })).confirmedDataJson["applicant.name"], "Atomic candidate");
const atomicCaseBeforeConflict = await data.getBrokerageCaseById({ userId: user.id, tenantId: tenant.id, caseId: atomicCase.id });
const atomicConflict = await data.saveCaseWorkbenchWithObjectReview({
  context,
  caseId: atomicCase.id,
  confirmedDataJson: { ...atomicCaseBeforeConflict.confirmedDataJson, "applicant.phone": "090-9999-8888" },
  objectReview: { context, targetId: atomicTarget.id, fieldId: atomicPhone.id, expectedVersion: atomicTarget.targetVersion, expectedCandidateValue: atomicPhone.candidateValue, decision: "confirm", value: "090-9999-8888", caseFieldValue: "090-9999-8888" },
});
assert.deepEqual(atomicConflict, { ok: false, reason: "conflict" });
assert.deepEqual(await data.getBrokerageCaseById({ userId: user.id, tenantId: tenant.id, caseId: atomicCase.id }), atomicCaseBeforeConflict);
assert.equal((await data.getClientById(atomicPerson.id, tenant.id)).phone, "000-1111-2222");
// The server action must turn a stale CAS result into a contextual case redirect;
// it must not swallow the conflict or retry with the old expected version.
const actionLoad = Module._load;
const actionRedirects = [];
Module._load = function(request, parent, ...rest) {
  if (request === "next/navigation") return { redirect: (url) => { actionRedirects.push(String(url)); throw new Error(`REDIRECT:${url}`); } };
  if (request === "next/cache") return { revalidatePath: () => {} };
  if (request === "next/headers") return { cookies: async () => ({ get: () => undefined }) };
  if (request === "next/dist/client/components/redirect-error") return { isRedirectError: () => false };
  if (request === "@/lib/tenant-session" && parent?.filename.endsWith("/src/app/actions.ts")) return { requireTenantSession: async () => session, assertTenantPermission: () => {} };
  if (request === "@/lib/locale" && parent?.filename.endsWith("/src/app/actions.ts")) return { getLocale: async () => "zh" };
  return actionLoad.call(this, request, parent, ...rest);
};
const { refreshObjectImportReviewAction, saveCaseWorkbenchAction, updatePropertyProfileAction } = require(resolve(root, "src/app/actions.ts"));
Module._load = actionLoad;
// A normal property edit changes the current record fingerprint but must not
// mutate the upload snapshot stored on the pending object-import target.
// This is the real stale-review sequence: old pending token -> ordinary UI
// update -> old review conflict -> page re-read -> old snapshot still rejects.
const rebaseProperty = await data.addProperty({ ...scope, name: "Rebase original", area: "rebase", address: "Rebase address", sizeSqm: 70, listingPrice: 2500, notes: "Original note", createdByUserId: user.id, currentOwnerUserId: user.id });
const rebaseCase = await data.saveBrokerageCaseExtractionReview({ ...scope, caseType: "unit_sale", caseTitle: "Protected re-read", confirmedDataJson: writeCaseAssociationData({}, { parties: [], primaryPropertyId: rebaseProperty.id }, {}), sourceImportJobIds: [], reviewItems: [] });
const rebaseJob = await data.addImportJob({ ...scope, sourceType: "excel", targetEntity: "properties", title: "Protected re-read", status: "queued", idempotencyKey: "protected-reread", notes: JSON.stringify({ objectImport: { caseId: rebaseCase.id, targetObjectType: "property", targetObjectId: rebaseProperty.id, targetVersion: buildObjectVersionFingerprint(rebaseProperty) } }) });
await data.addPrivateAttachment({ ...scope, targetType: "import_job", targetId: rebaseJob.id, fileName: "protected-reread.xlsx", content: Buffer.from("synthetic protected reread") });
await persistObjectImportJobExtraction({ ...scope, job: rebaseJob, fields: [field("property_name", "Rebase candidate")] });
const rebaseTarget = await data.getObjectImportTargetByJob({ ...scope, importJobId: rebaseJob.id });
const rebaseCandidate = (await data.listObjectImportCandidates({ ...scope, targetId: rebaseTarget.id }))[0];
assert(rebaseTarget && rebaseCandidate && rebaseTarget.status === "needs_review");
const rebaseOldVersion = rebaseTarget.targetVersion;
const rebaseOldCandidate = rebaseCandidate.candidateValue;
assert.deepEqual(await data.refreshObjectImportReview({ context, targetId: rebaseTarget.id, fieldId: atomicPhone.id, expectedVersion: rebaseOldVersion, observedVersion: rebaseOldVersion, expectedCandidateValue: atomicPhone.candidateValue }), { ok: false, reason: "not_writable" }, "a party candidate must not be reused for a property target");
const externalEditForm = new FormData();
externalEditForm.set("propertyId", rebaseProperty.id);
externalEditForm.set("name", rebaseProperty.name);
externalEditForm.set("area", rebaseProperty.area ?? "");
externalEditForm.set("address", rebaseProperty.address ?? "");
externalEditForm.set("sizeSqm", String(rebaseProperty.sizeSqm ?? ""));
externalEditForm.set("listingPrice", String(rebaseProperty.listingPrice ?? ""));
externalEditForm.set("managementFee", String(rebaseProperty.managementFee ?? ""));
externalEditForm.set("repairFee", String(rebaseProperty.repairFee ?? ""));
externalEditForm.set("notes", "External visible edit");
externalEditForm.set("returnTo", `/properties/${rebaseProperty.id}/edit`);
await assert.rejects(updatePropertyProfileAction({}, externalEditForm), /REDIRECT:/, "the normal property profile action must complete the external edit");
const externallyEditedProperty = (await data.resolvePropertyVisibilityForContext({ context, propertyId: rebaseProperty.id })).record;
assert(externallyEditedProperty);
assert.equal(externallyEditedProperty.notes, "External visible edit");
assert.notEqual(buildObjectVersionFingerprint(externallyEditedProperty), rebaseOldVersion, "the ordinary visible edit must change the current object fingerprint");
assert.equal((await data.getObjectImportTarget({ ...scope, id: rebaseTarget.id })).targetVersion, rebaseOldVersion, "ordinary property editing must not rewrite the pending upload snapshot");
const rebaseCaseBeforeConflict = await data.getBrokerageCaseById({ ...scope, caseId: rebaseCase.id });
function rebaseWorkbenchReviewForm(expectedVersion, expectedCandidateValue) {
  const form = new FormData();
  form.set("caseId", rebaseCase.id);
  form.set("presentFieldKeysJson", JSON.stringify(["property.name"]));
  form.set("field:property.name", expectedCandidateValue);
  form.set("fieldValueSnapshot", expectedCandidateValue);
  form.set("returnNode", "property");
  form.set("returnField", "property.name");
  form.set("returnView", "quick");
  form.set("returnAnchor", "case-main-editor");
  form.set("objectImportReviewJson", JSON.stringify({ targetId: rebaseTarget.id, fieldId: rebaseCandidate.id, importJobId: rebaseJob.id, expectedVersion, expectedCandidateValue, caseFieldKey: "property.name" }));
  return form;
}
await assert.rejects(saveCaseWorkbenchAction(rebaseWorkbenchReviewForm(rebaseOldVersion, rebaseOldCandidate)), /REDIRECT:/, "the retained old token must be rejected after a normal property edit");
assert.match(actionRedirects.at(-1), /flash=object_import_review_conflict/);
assert.match(actionRedirects.at(-1), new RegExp(`objectImportJob=${rebaseJob.id}`));
const rereadProperty = (await data.resolvePropertyVisibilityForContext({ context, propertyId: rebaseProperty.id })).record;
const [rereadTarget] = await data.listObjectImportTargets({ ...scope, caseId: rebaseCase.id });
const [rereadCandidate] = await data.listObjectImportCandidates({ ...scope, targetId: rereadTarget.id });
assert(rereadProperty && rereadTarget && rereadCandidate);
assert.equal(rereadTarget.targetVersion, rebaseOldVersion, "a normal case-page re-read retains the pending upload snapshot");
assert.equal(rereadCandidate.candidateValue, rebaseOldCandidate, "a normal case-page re-read retains the original candidate");
assert.notEqual(buildObjectVersionFingerprint(rereadProperty), rereadTarget.targetVersion, "the re-read exposes the version drift instead of manufacturing a fresh token");
await assert.rejects(saveCaseWorkbenchAction(rebaseWorkbenchReviewForm(rereadTarget.targetVersion, rereadCandidate.candidateValue)), /REDIRECT:/, "refreshing the case page alone must not bypass the stale object CAS");
assert.match(actionRedirects.at(-1), /flash=object_import_review_conflict/);
assert.equal((await data.getObjectImportTarget({ ...scope, id: rebaseTarget.id })).targetVersion, rebaseOldVersion, "the blocked re-read path must preserve the old target snapshot");
assert.equal((await data.resolvePropertyVisibilityForContext({ context, propertyId: rebaseProperty.id })).record.notes, "External visible edit", "conflict retries must preserve the external visible edit");
assert.deepEqual(await data.getBrokerageCaseById({ ...scope, caseId: rebaseCase.id }), rebaseCaseBeforeConflict, "stale conflict retries must not partially write the case");
function rebaseRefreshForm(expectedVersion, observedVersion, expectedCandidateValue) {
  const form = new FormData();
  form.set("importTargetId", rebaseTarget.id);
  form.set("fieldId", rebaseCandidate.id);
  form.set("importJobId", rebaseJob.id);
  form.set("expectedVersion", expectedVersion);
  form.set("observedVersion", observedVersion);
  form.set("expectedCandidateValue", expectedCandidateValue);
  form.set("field", "property.name");
  form.set("returnNode", "property");
  form.set("returnField", "property.name");
  form.set("returnView", "quick");
  form.set("returnAnchor", "case-main-editor");
  return form;
}
const rereadVersion = buildObjectVersionFingerprint(rereadProperty);
await assert.rejects(refreshObjectImportReviewAction(rebaseRefreshForm(rebaseOldVersion, `${rereadVersion}-stale-observation`, rereadCandidate.candidateValue)), /REDIRECT:/, "a forged observed fingerprint must not rebase the review");
assert.match(actionRedirects.at(-1), /flash=object_import_review_conflict/);
assert.equal((await data.getObjectImportTarget({ ...scope, id: rebaseTarget.id })).targetVersion, rebaseOldVersion);
await assert.rejects(refreshObjectImportReviewAction(rebaseRefreshForm(rebaseOldVersion, rereadVersion, rereadCandidate.candidateValue)), /REDIRECT:/, "an explicit re-read must use the server-observed record fingerprint");
assert.match(actionRedirects.at(-1), /flash=object_import_review_rebased/);
const rebasedTarget = await data.getObjectImportTarget({ ...scope, id: rebaseTarget.id });
assert.equal(rebasedTarget.targetVersion, rereadVersion, "re-read must atomically advance only the review baseline");
assert.equal(rebasedTarget.sourceAttachmentId, rebaseTarget.sourceAttachmentId, "re-read must preserve the original source attachment");
assert.equal((await data.listObjectImportCandidates({ ...scope, targetId: rebaseTarget.id }))[0].candidateValue, rebaseOldCandidate, "re-read must preserve the extracted candidate");
assert.equal((await data.resolvePropertyVisibilityForContext({ context, propertyId: rebaseProperty.id })).record.notes, "External visible edit", "re-read must preserve the object");
await assert.rejects(refreshObjectImportReviewAction(rebaseRefreshForm(rebaseOldVersion, rereadVersion, rereadCandidate.candidateValue)), /REDIRECT:/, "the old review action must not re-open after a successful re-read");
assert.match(actionRedirects.at(-1), /flash=object_import_review_conflict/);
externalEditForm.set("notes", "Changed after re-read");
await assert.rejects(updatePropertyProfileAction({}, externalEditForm), /REDIRECT:/, "a normal edit after re-read must complete before the next CAS attempt");
const postRebaseProperty = (await data.resolvePropertyVisibilityForContext({ context, propertyId: rebaseProperty.id })).record;
const postRebaseVersion = buildObjectVersionFingerprint(postRebaseProperty);
await assert.rejects(saveCaseWorkbenchAction(rebaseWorkbenchReviewForm(rebasedTarget.targetVersion, rebaseCandidate.candidateValue)), /REDIRECT:/, "a post-re-read object edit must still be rejected by CAS");
assert.match(actionRedirects.at(-1), /flash=object_import_review_conflict/);
await assert.rejects(refreshObjectImportReviewAction(rebaseRefreshForm(rebasedTarget.targetVersion, postRebaseVersion, rebaseCandidate.candidateValue)), /REDIRECT:/, "the user must explicitly re-read again after the second external edit");
assert.match(actionRedirects.at(-1), /flash=object_import_review_rebased/);
const finalRebasedTarget = await data.getObjectImportTarget({ ...scope, id: rebaseTarget.id });
await assert.rejects(saveCaseWorkbenchAction(rebaseWorkbenchReviewForm(finalRebasedTarget.targetVersion, rebaseCandidate.candidateValue)), /REDIRECT:/, "the refreshed binding must still require the normal explicit confirmation");
assert.match(actionRedirects.at(-1), /flash=case_workbench_saved/);
assert.equal((await data.resolvePropertyVisibilityForContext({ context, propertyId: rebaseProperty.id })).record.name, "Rebase candidate", "the explicit confirmation must use the rebased CAS version");
assert.equal((await data.getObjectImportTarget({ ...scope, id: rebaseTarget.id })).status, "completed");
const finalProperty = (await data.resolvePropertyVisibilityForContext({ context, propertyId: rebaseProperty.id })).record;
await assert.rejects(refreshObjectImportReviewAction(rebaseRefreshForm(finalRebasedTarget.targetVersion, buildObjectVersionFingerprint(finalProperty), rebaseCandidate.candidateValue)), /REDIRECT:/, "a confirmed target must not be re-opened by the re-read action");
assert.match(actionRedirects.at(-1), /flash=object_import_review_already_reviewed/);
function workbenchReviewForm(expectedVersion, expectedCandidateValue, value = "090-9999-8888") {
  const form = new FormData();
  form.set("caseId", atomicCase.id);
  form.set("presentFieldKeysJson", JSON.stringify(["applicant.phone"]));
  form.set("field:applicant.phone", value);
  form.set("fieldValueSnapshot", value);
  form.set("returnNode", "applicant");
  form.set("returnField", "applicant.phone");
  form.set("returnView", "quick");
  form.set("returnAnchor", "case-main-editor");
  form.set("objectImportReviewJson", JSON.stringify({ targetId: atomicTarget.id, fieldId: atomicPhone.id, importJobId: atomicJob.id, expectedVersion, expectedCandidateValue, caseFieldKey: "applicant.phone" }));
  return form;
}
const staleActionForm = workbenchReviewForm("stale-version", atomicPhone.candidateValue);
await assert.rejects(saveCaseWorkbenchAction(staleActionForm), /REDIRECT:/);
assert.match(actionRedirects.at(-1), new RegExp(`/cases/${atomicCase.id}\\?`));
assert.match(actionRedirects.at(-1), /flash=object_import_review_conflict/);
assert.match(actionRedirects.at(-1), new RegExp(`objectImportJob=${atomicJob.id}`));
assert.match(actionRedirects.at(-1), /field=applicant.phone/);
assert.match(actionRedirects.at(-1), /view=quick/);
assert.match(actionRedirects.at(-1), /#case-main-editor$/);
assert.deepEqual(await data.getBrokerageCaseById({ userId: user.id, tenantId: tenant.id, caseId: atomicCase.id }), atomicCaseBeforeConflict, "stale action conflict must preserve case data");
assert.equal((await data.getClientById(atomicPerson.id, tenant.id)).phone, "000-1111-2222", "stale action conflict must preserve object data");
const refreshedAtomicTarget = await data.getObjectImportTarget({ ...scope, id: atomicTarget.id });
const refreshedAtomicPhone = (await data.listObjectImportCandidates({ ...scope, targetId: atomicTarget.id })).find((item) => item.id === atomicPhone.id);
assert(refreshedAtomicPhone);
assert.equal(refreshedAtomicTarget.targetVersion, buildObjectVersionFingerprint(await data.getClientById(atomicPerson.id, tenant.id)), "refresh must use the current object version for the next CAS");
await assert.rejects(saveCaseWorkbenchAction(workbenchReviewForm(refreshedAtomicTarget.targetVersion, refreshedAtomicPhone.candidateValue)), /REDIRECT:/, "fresh target/candidate versions must allow the normal action redirect");
assert.match(actionRedirects.at(-1), /flash=case_workbench_saved/);
assert.equal((await data.getClientById(atomicPerson.id, tenant.id)).phone, "090-9999-8888", "a refreshed review must apply the confirmed object value");
const duplicateActionForm = workbenchReviewForm(refreshedAtomicTarget.targetVersion, refreshedAtomicPhone.candidateValue);
await assert.rejects(saveCaseWorkbenchAction(duplicateActionForm), /REDIRECT:/, "a duplicate review must return through the action redirect");
assert.match(actionRedirects.at(-1), /flash=object_import_review_already_reviewed/);
assert.equal((await data.getClientById(atomicPerson.id, tenant.id)).phone, "090-9999-8888", "duplicate review must preserve the confirmed value");
const invalidAtomicCase = await data.saveCaseWorkbenchWithObjectReview({
  context,
  caseId: "missing-case",
  confirmedDataJson: { "applicant.name": "must-not-write" },
  objectReview: { context, targetId: atomicTarget.id, fieldId: atomicPhone.id, expectedVersion: (await data.getObjectImportTarget({ ...scope, id: atomicTarget.id })).targetVersion, expectedCandidateValue: atomicPhone.candidateValue, decision: "confirm", value: "090-9999-8888", caseFieldValue: "090-9999-8888" },
});
assert.deepEqual(invalidAtomicCase, { ok: false, reason: "case_not_writable" });
assert.equal((await data.getClientById(atomicPerson.id, tenant.id)).phone, "090-9999-8888");
// Missing, cross-job and ambiguous sources cannot create usable object candidates.
const badJob = await data.addImportJob({ ...scope, sourceType: "scan", targetEntity: "parties", title: "Missing source", status: "queued", idempotencyKey: "source-negative", notes: atomicJob.notes });
await assert.rejects(ensureObjectImportTask(badJob, scope), /source_attachment_required/);
await data.addPrivateAttachment({ ...scope, targetType: "import_job", targetId: badJob.id, fileName: "source.pdf", content: Buffer.from("%PDF-bad-job") });
await assert.rejects(ensureObjectImportTask({ ...badJob, notes: JSON.stringify({ objectImport: { ...JSON.parse(badJob.notes).objectImport, sourceAttachmentId: propertySource.id } }) }, scope), /source_attachment_mismatch/);
await data.addPrivateAttachment({ ...scope, targetType: "import_job", targetId: badJob.id, fileName: "source2.pdf", content: Buffer.from("%PDF-second") });
await assert.rejects(ensureObjectImportTask(badJob, scope), /source_attachment_required/);
const beforeMissingSource = await data.getBrokerageCaseById({ ...scope, caseId: atomicCase.id });
await data.deletePrivateAttachmentForTenant({ tenantId: tenant.id, id: atomicSource.id });
const missingSourceReview = { context, targetId: atomicTarget.id, fieldId: atomicPhone.id, expectedVersion: (await data.getObjectImportTarget({ ...scope, id: atomicTarget.id })).targetVersion, expectedCandidateValue: atomicPhone.candidateValue, decision: "confirm", value: "090-9999-8888" };
assert.deepEqual(await data.reviewObjectImportCandidate(missingSourceReview), { ok: false, reason: "not_writable" });
assert.deepEqual(await data.saveCaseWorkbenchWithObjectReview({ context, caseId: atomicCase.id, confirmedDataJson: { ...beforeMissingSource.confirmedDataJson, "applicant.phone": "090-9999-8888" }, objectReview: missingSourceReview }), { ok: false, reason: "not_writable" });
assert.deepEqual(await data.getBrokerageCaseById({ ...scope, caseId: atomicCase.id }), beforeMissingSource);
assert.equal((await data.getClientById(atomicPerson.id, tenant.id)).phone, "090-9999-8888");
const postgresSource = readFileSync(resolve(root, "src/lib/data.postgres.ts"), "utf8");
const actionSource = readFileSync(resolve(root, "src/app/actions.ts"), "utf8");
const objectActionsSource = readFileSync(resolve(root, "src/app/object-import-actions.ts"), "utf8");
const casePageSource = readFileSync(resolve(root, "src/app/cases/[id]/page.tsx"), "utf8");
const queueProcessorSource = readFileSync(resolve(root, "src/components/excel-import-queue-processor.tsx"), "utf8");
const uploadFormSource = readFileSync(resolve(root, "src/components/excel-document-upload-form.tsx"), "utf8");
const importCenterSource = readFileSync(resolve(root, "src/app/import-center/page.tsx"), "utf8");
const objectUploadSource = readFileSync(resolve(root, "src/components/object-import-upload.tsx"), "utf8");
const statusBadgeSource = readFileSync(resolve(root, "src/components/object-import-status-badge.tsx"), "utf8");
const { ObjectImportFailureNotice } = require(resolve(root, "src/components/object-import-status-badge.tsx"));
const currentNoFieldsTarget = await data.getObjectImportTarget({ ...scope, id: noFieldsTarget.id });
assert.equal(currentNoFieldsTarget.status, "failed");
const olderCompletedTarget = await data.getObjectImportTarget({ ...scope, id: target.id });
assert.equal(olderCompletedTarget.status, "completed", "the older completed target remains alongside the current failed target");
const renderedCurrentFailure = renderToStaticMarkup(React.createElement(ObjectImportFailureNotice, { locale: "zh", errorCode: currentNoFieldsTarget.errorCode }));
assert.match(renderedCurrentFailure, /未能读取可填写的受支持内容，案件资料未更新/);
assert.doesNotMatch(renderedCurrentFailure, /object_import_no_supported_fields|No supported fields/);
const pipelineLoad = Module._load;
Module._load = function(request, parent, ...rest) {
  if (parent?.filename.endsWith("/src/components/case-association-manager.tsx")) {
    if (request === "@/components/client-form") return { ClientForm: () => null };
    if (request === "@/components/case-association-draft") return { FocusDialog: () => null };
    if (request === "@/components/property-responsive-form") return { PropertyResponsiveForm: () => null };
    if (request === "@/components/object-import-upload") return { ObjectImportUpload: () => null };
    if (request === "@/components/object-attachment-list") return { ObjectAttachmentList: () => null };
    if (request === "@/app/actions") return {};
  }
  return pipelineLoad.call(this, request, parent, ...rest);
};
const { CaseAssociationManager } = require(resolve(root, "src/components/case-association-manager.tsx"));
Module._load = pipelineLoad;
const renderedAssociationFailure = renderToStaticMarkup(React.createElement(CaseAssociationManager, {
  locale: "zh",
  caseId: brokerageCase.id,
  initialParties: [{ partyId: person.id, name: "Synthetic person", roles: [] }],
  candidates: [],
  properties: [],
  objectImportViews: [
    { target: currentNoFieldsTarget, fields: [] },
    { target: olderCompletedTarget, fields: [] },
  ],
}));
assert.match(renderedAssociationFailure, /未能读取可填写的受支持内容，案件资料未更新/);
assert.match(renderedAssociationFailure, /data-object-import-target="party:[^"]+"/);
const { ObjectImportUpload } = require(resolve(root, "src/components/object-import-upload.tsx"));
const renderedObjectUpload = renderToStaticMarkup(React.createElement(ObjectImportUpload, { action: async () => {}, caseId: brokerageCase.id, targetType: "property", targetId: supportedH034Property.id, locale: "zh" }));
assert.match(renderedObjectUpload, /name="caseId"/);
assert.match(renderedObjectUpload, /name="targetType" value="property"/);
assert.match(renderedObjectUpload, /name="targetId"/);
assert.match(renderedObjectUpload, />解析<\/button>/, "object card upload must expose its actual localized submit button");
assert.doesNotMatch(renderedObjectUpload, /正在读取/, "idle object upload must not claim processing before submission");
const objectUploadModulePath = resolve(root, "src/components/object-import-upload.tsx");
const pendingObjectUploadLoad = Module._load;
Module._load = function(request, parent, ...rest) {
  if (request === "react-dom" && parent?.filename === objectUploadModulePath) return { useFormStatus: () => ({ pending: true }) };
  return pendingObjectUploadLoad.call(this, request, parent, ...rest);
};
delete require.cache[objectUploadModulePath];
const { ObjectImportUpload: PendingObjectImportUpload } = require(objectUploadModulePath);
Module._load = pendingObjectUploadLoad;
const renderedPendingObjectUpload = renderToStaticMarkup(React.createElement(PendingObjectImportUpload, { action: async () => {}, caseId: brokerageCase.id, targetType: "property", targetId: supportedH034Property.id, locale: "zh" }));
assert.match(renderedPendingObjectUpload, /disabled=""/, "object card upload must disable controls while the server action is pending");
assert.match(renderedPendingObjectUpload, /aria-busy="true"/, "object card upload must expose pending state while the server action is pending");
assert.match(renderedPendingObjectUpload, /正在读取…/, "object card upload must show processing feedback while pending");
const renderedAssociationSuccess = renderToStaticMarkup(React.createElement(CaseAssociationManager, {
  locale: "zh",
  caseId: brokerageCase.id,
  initialParties: [{ partyId: person.id, name: "Synthetic person", roles: [] }],
  candidates: [],
  properties: [{ id: supportedH034Property.id, name: "H034 supported original", address: "H034 supported address" }],
  initialPrimaryPropertyId: supportedH034Property.id,
  objectImportViews: [{ target: supportedH034Target, fields: supportedH034Candidates }],
}));
assert.match(renderedAssociationSuccess, /待确认/, "object card must show a localized review-pending state");
assert.match(renderedAssociationSuccess, /H034 Local CAS Candidate 20260919/, "object card must show the reviewable candidate");
assert.doesNotMatch(renderedAssociationSuccess, /needs_review|completed|failed/, "object card must not expose technical object status names");
const renderedAssociationCompleted = renderToStaticMarkup(React.createElement(CaseAssociationManager, {
  locale: "zh",
  caseId: brokerageCase.id,
  initialParties: [{ partyId: person.id, name: "Synthetic person", roles: [] }],
  candidates: [],
  properties: [],
  objectImportViews: [{ target: olderCompletedTarget, fields: [] }],
}));
assert.match(renderedAssociationCompleted, /已确认/, "object card must show a localized completed state");
assert.match(casePageSource, /<ExcelImportQueueProcessor[\s\S]*jobId=\{target\.importJobId\}/, "case object upload must mount the protected process continuation for queued targets");
assert.match(casePageSource, /target\.importJobId === objectImportJobId/, "case page must filter continuation to the redirect job");
assert.match(casePageSource, /objectImportNoSupportedFieldsFailed/, "case page must surface a failed current job even when an older target is completed");
assert.match(actionSource, /object_import_review_conflict/, "stale object review must return through a dedicated conflict flash");
assert.match(actionSource, /object_import_review_already_reviewed/, "duplicate object review must return through a dedicated already-reviewed flash");
assert.match(actionSource, /reviewFieldKey = objectReviewFieldKey \|\| returnField/, "review conflict redirect must preserve the current case field context");
assert.match(actionSource, /objectImportJob/, "review conflict redirect must preserve the current object import job context");
assert.match(actionSource, /export async function refreshObjectImportReviewAction/, "review conflict must expose an explicit protected re-read action");
assert.match(actionSource, /observedVersion/, "re-read action must bind the user-observed object fingerprint");
assert.match(objectActionsSource, /object_import_review_conflict/, "standalone object review must return through the same conflict flash");
assert.match(objectActionsSource, /getObjectImportTarget/, "standalone object review must resolve the protected case before returning after a known conflict");
assert.match(casePageSource, /资料已在其他页面更新，请刷新案件页面，重新核对当前资料和候选；本次修改未保存，确认时仍会校验最新版本/, "case page must explain stale object review without promising that refresh creates a fresh token");
assert.match(casePageSource, /该候选已在其他页面处理完成，请刷新案件查看已确认值/, "case page must explain duplicate review while preserving the confirmed result");
assert.match(casePageSource, /objectImportTargetsForView = \[\.\.\.objectImportTargets\]\.sort/, "case page must prioritize the queried job when rendering multiple target attempts");
assert.match(casePageSource, /重新核对最新资料/, "the conflict field must offer an explicit re-read action");
assert.match(casePageSource, /name=\"observedVersion\"/, "the re-read action must submit the rendered object fingerprint");
assert.match(casePageSource, /statusOnly=\{target\.status === "processing"\}/, "processing jobs must use status-only polling and avoid a duplicate POST");
assert.match(casePageSource, /successHref=\{`\/cases\/\$\{encodeURIComponent\(stableCaseId\)\}/, "case object processing must return to the same case workbench");
assert.match(casePageSource, /successHref=\{`[^`]*objectImportJob=\$\{encodeURIComponent\(target\.importJobId\)\}/, "completion return must retain the processed object job for an unambiguous result");
assert.match(casePageSource, /objectImportCandidateCountForJob = objectImportViewForJob\?\.fields\.length/, "object completion feedback must count object candidates rather than extracted input fields");
assert.match(casePageSource, /已读取 \$\{objectImportCandidateCountForJob\} 项对象候选，请确认后再写入/, "object completion feedback must distinguish reviewable candidates from committed data");
assert.match(queueProcessorSource, /method: "POST"/, "the protected continuation must start processing through the process API");
assert.match(queueProcessorSource, /successHref\)/, "the protected continuation must honor the case return target");
assert.match(queueProcessorSource, /正在读取资料，完成后会返回确认结果/, "processing status must describe extraction rather than only task submission");
assert.match(queueProcessorSource, /type ImportProcessStatus = "submitting" \| "queued" \| "processing" \| "failed"/, "processing status must remain distinct from queued admission");
assert.match(queueProcessorSource, /setStatus\(payload\.status\)/, "queue polling must surface the server processing stage");
assert.match(queueProcessorSource, /noSupportedFields/, "zero-field object failures must use explicit user guidance");
assert.match(queueProcessorSource, /errorKind !== "noSupportedFields"/, "technical zero-field error summaries must not be exposed");
assert.match(queueProcessorSource, /objectRecoveryHref/, "object zero-field recovery must accept an object-specific case return target");
assert.match(casePageSource, /objectRecoveryHref=\{`\/cases\/\$\{encodeURIComponent\(stableCaseId\)\}\?objectImportJob=/, "object zero-field recovery must return to the current case association area");
assert.match(uploadFormSource, /const \[pending, setPending\] = useState\(false\)/, "upload form must track a single pending submission");
assert.match(uploadFormSource, /disabled=\{pending\}/, "upload form must disable duplicate submissions while pending");
assert.match(uploadFormSource, /aria-busy=\{pending\}/, "upload form must expose its pending state accessibly");
assert.match(uploadFormSource, /pending \? text\.processing : text\.submit/, "upload form must show a localized processing label while pending");
assert.match(objectUploadSource, /useFormStatus/, "object card upload must read the real form pending state");
assert.match(objectUploadSource, /disabled=\{pending\}/, "object card upload must disable the file and submit controls while pending");
assert.match(objectUploadSource, /aria-busy=\{pending\}/, "object card upload must expose pending state accessibly");
assert.match(objectUploadSource, /role="status" aria-live="polite"/, "object card upload must expose a processing status");
assert.match(objectUploadSource, /读取中|読み取り中|읽는 중/, "object card upload must have localized processing copy");
assert.match(statusBadgeSource, /needs_review: "待确认"/, "object card status must avoid exposing technical English status names");
assert.match(importCenterSource, /未能读取可填写内容，案件资料未更新。请重新选择受支持的资料。/, "empty extraction must explain that no case data was updated and give a neutral recovery instruction");
assert.match(importCenterSource, /targetCaseId\s*\?/, "import center must distinguish case-scoped empty extraction from the global ordinary import path");
assert.match(importCenterSource, /未能读取可填写内容。请重新选择受支持的资料。/, "global empty extraction must use neutral guidance without claiming a case or ledger update");
assert.doesNotMatch(importCenterSource, /普通物件台账可继续保存|一般 매물 대장은 계속 저장할 수 있습니다|通常の物件台帳は続けて保存できます/, "empty extraction must not imply that an unrelated object ledger was updated or is the recovery path");
const migrationSource = readFileSync(resolve(root, "db/migrations/20260917_001_object_import_targets.sql"), "utf8");
assert.match(migrationSource, /source_attachment_id TEXT NOT NULL REFERENCES attachments\(id\) ON DELETE RESTRICT/);
assert.match(migrationSource, /FOREIGN KEY \(tenant_id, object_import_target_id\) REFERENCES object_import_targets\(tenant_id, id\)/);
assert(postgresSource.includes("brokerdesk_private.lock_case_review_source($1,$2,$3,$4)"));
const lockMigration = readFileSync(resolve(root, "db/migrations/20260917_002_case_review_locks.sql"), "utf8");
assert(lockMigration.includes("a.target_id = p_import_job_id"));
assert(lockMigration.includes("FOR SHARE OF a, b"));
assert.equal((postgresSource.match(/if \(!await hasObjectImportSource\(client, target, field\)\)/g) ?? []).length, 2);
const reviewSource = postgresSource.slice(postgresSource.indexOf("export async function reviewObjectImportCandidate"));
for (const marker of ["withTransaction", "databaseActorMatches", "FOR UPDATE", "lockCaseReviewMembership", "resolveRecordVisibility", "validateObjectImportReview", "INSERT INTO audit_logs"]) assert(reviewSource.includes(marker), `missing PostgreSQL review boundary: ${marker}`);
const combinedSource = postgresSource.slice(postgresSource.indexOf("export async function saveCaseWorkbenchWithObjectReview"));
for (const marker of ["withTransaction", "FOR UPDATE", "UPDATE object_import_fields", "UPDATE object_import_targets", "UPDATE brokerage_cases", "RETURNING *"]) assert(combinedSource.includes(marker), `missing PostgreSQL atomic save boundary: ${marker}`);
console.log("PASS: upload/queue/processor/public pipeline; real H034 invalid/support Excel processing; zero-field failure and rendered UI guidance; association and tenant rejection; dedupe and metadata retention; synthetic extractor; review CAS exactly once with stale/forged guards; property four-field CAS/audit; atomic main-input save normal/conflict/non-writable rollback coverage");
