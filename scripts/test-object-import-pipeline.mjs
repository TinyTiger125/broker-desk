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
function resolveCandidate(value) {
  if (!value || (!value.startsWith("/") && !value.startsWith("."))) return undefined;
  return [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}
Module._resolveFilename = function (request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
require.extensions[".ts"] = function (module, filename) {
  const result = typescript.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};


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
let lastRedirectUrl = "";
Module._load = function(request, parent, ...rest) {
  if (request === "@/lib/tenant-session" && parent?.filename.endsWith("/src/app/object-import-actions.ts")) return { requireTenantSession: async ({ permission }) => { assert(["source.upload", "extract.accept_result"].includes(permission)); return session; } };
  if (request === "next/navigation") return { redirect: (url) => { lastRedirectUrl = String(url); throw new Error(`REDIRECT:${url}`); } };
  if (request === "next/cache") return { revalidatePath: () => {} };
  if (request === "@/lib/identity-document-extractor") return { extractIdentityDocumentsFromFiles: async (sources) => { extractCalls++; assert.equal(sources.length, 1); return { schemaVersion: "v1", documentType: "identity_residence_card", documentTypeLabel: "Test", extractionStatus: "recognized", fields: [field("applicant.name", "Extracted name"), field("applicant.phone", "090-1234-5678", 0.6), field("guarantor.name", "Must not leak"), field("applicant.residenceCardNumber", "Must not persist")], fingerprintConfidence: 0.9 }; } };
  return frameworkLoad.call(this, request, parent, ...rest);
};
const { uploadObjectImportAction } = require(resolve(root, "src/app/object-import-actions.ts"));
const { processIdentityImportJob } = require(resolve(root, "src/lib/identity-import-processor.ts"));
function form(targetId = person.id) { const f = new FormData(); f.set("caseId", brokerageCase.id); f.set("targetType", "party"); f.set("targetId", targetId); f.set("uploadFile", new File(["%PDF-synthetic"], "synthetic.pdf", { type: "application/pdf" })); return f; }
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
const rejectForm = new FormData();
rejectForm.set("importTargetId", target.id); rejectForm.set("fieldId", phoneField.id);
rejectForm.set("expectedVersion", target.targetVersion); rejectForm.set("expectedCandidateValue", phoneField.candidateValue); rejectForm.set("decision", "reject");
await assert.rejects(reviewObjectImportAction(rejectForm), /object_import_review_conflict/);
const refreshed = await data.getObjectImportTarget({ ...scope, id: target.id });
rejectForm.set("expectedVersion", refreshed.targetVersion);
await assert.rejects(reviewObjectImportAction(rejectForm), /REDIRECT:/);
assert.equal((await data.getClientById(person.id, tenant.id)).phone, "000-0000-0000");
assert.equal((await data.getObjectImportTarget({ ...scope, id: target.id })).status, "completed");
assert.equal((await data.listObjectImportCandidates({ ...scope, targetId: target.id })).find((item) => item.id === phoneField.id).status, "rejected");
await data.upsertObjectImportCandidate({ ...phoneField, candidateValue: "new model suggestion", finalValue: "new model suggestion" });
assert.equal((await data.listObjectImportCandidates({ ...scope, targetId: target.id })).find((item) => item.id === phoneField.id).status, "rejected");
const { ensureObjectImportTask } = require(resolve(root, "src/lib/object-import-processor-adapter.ts"));
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
const { buildObjectVersionFingerprint } = require(resolve(root, "src/lib/object-import-contract.ts"));
const { persistObjectImportJobExtraction } = require(resolve(root, "src/lib/object-import-processor-adapter.ts"));
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
const invalidAtomicCase = await data.saveCaseWorkbenchWithObjectReview({
  context,
  caseId: "missing-case",
  confirmedDataJson: { "applicant.name": "must-not-write" },
  objectReview: { context, targetId: atomicTarget.id, fieldId: atomicPhone.id, expectedVersion: (await data.getObjectImportTarget({ ...scope, id: atomicTarget.id })).targetVersion, expectedCandidateValue: atomicPhone.candidateValue, decision: "confirm", value: "090-9999-8888", caseFieldValue: "090-9999-8888" },
});
assert.deepEqual(invalidAtomicCase, { ok: false, reason: "case_not_writable" });
assert.equal((await data.getClientById(atomicPerson.id, tenant.id)).phone, "000-1111-2222");
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
assert.equal((await data.getClientById(atomicPerson.id, tenant.id)).phone, "000-1111-2222");
const postgresSource = readFileSync(resolve(root, "src/lib/data.postgres.ts"), "utf8");
const casePageSource = readFileSync(resolve(root, "src/app/cases/[id]/page.tsx"), "utf8");
const queueProcessorSource = readFileSync(resolve(root, "src/components/excel-import-queue-processor.tsx"), "utf8");
assert.match(casePageSource, /<ExcelImportQueueProcessor[\s\S]*jobId=\{target\.importJobId\}/, "case object upload must mount the protected process continuation for queued targets");
assert.match(casePageSource, /target\.importJobId === objectImportJobId/, "case page must filter continuation to the redirect job");
assert.match(casePageSource, /statusOnly=\{target\.status === "processing"\}/, "processing jobs must use status-only polling and avoid a duplicate POST");
assert.match(casePageSource, /successHref=\{`\/cases\/\$\{encodeURIComponent\(stableCaseId\)\}/, "case object processing must return to the same case workbench");
assert.match(queueProcessorSource, /method: "POST"/, "the protected continuation must start processing through the process API");
assert.match(queueProcessorSource, /successHref\)/, "the protected continuation must honor the case return target");
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
console.log("PASS: upload/queue/processor/public pipeline; association and tenant rejection; dedupe and metadata retention; synthetic extractor; review CAS exactly once with stale/forged guards; property four-field CAS/audit; atomic main-input save normal/conflict/non-writable rollback coverage");
