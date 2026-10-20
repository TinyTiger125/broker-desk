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
function resolveCandidate(value) { return [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`].find((candidate) => existsSync(candidate) && statSync(candidate).isFile()); }
Module._resolveFilename = function(request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
require.extensions[".ts"] = (mod, filename) => mod._compile(typescript.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
const originalLoad = Module._load;
let lastRedirectUrl = "";
Module._load = function(request, parent, ...rest) {
  if (parent?.filename === resolve(root, "src/lib/data.ts")) {
    if (request === "@/lib/data.postgres") return {};
    if (request === "react") return { cache: (fn) => fn };
    if (["next/headers", "@/lib/actor", "@/lib/auth-mode", "@/lib/clerk-auth", "@/lib/staging-access-policy"].includes(request)) return {};
    if (request === "@/lib/production-readiness") return { isPostgresDataStoreConfigured: () => false, assertProductionDataStoreReady: () => {}, isProductionRuntime: () => false };
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
const property = await data.addProperty({ tenantId: tenant.id, createdByUserId: user.id, currentOwnerUserId: user.id, name: "Existing property", address: "Tokyo", listingPrice: 100000 });
const { writeCaseAssociationData } = require(resolve(root, "src/lib/case-associations.ts"));
const brokerageCase = await data.saveBrokerageCaseExtractionReview({ tenantId: tenant.id, userId: user.id, caseType: "rental", caseTitle: "Object reader synthetic", confirmedDataJson: writeCaseAssociationData({}, { parties: [], primaryPropertyId: property.id }, { propertyName: property.name }), sourceImportJobIds: [], reviewItems: [] });
let readerCalls = 0;
let readerResponse = { documentType: "property_lease_document", pages: [{ pageNumber: 1, lines: ["物件名: New reader name", "賃料 120000"] }], candidates: [
    { fieldKey: "property.name", value: "New reader name", pageNumber: 1, sourceText: "物件名: New reader name", uncertainty: "clear", subjectKey: "property-1", subjectLabel: "物件" },
    { fieldKey: "lease.rent", value: "120000", pageNumber: 1, sourceText: "賃料 120000", uncertainty: "clear", subjectKey: "property-1", subjectLabel: "物件" },
  ] };
const frameworkLoad = Module._load;
Module._load = function(request, parent, ...rest) {
  if (request === "@/lib/tenant-session" && parent?.filename.endsWith("/src/app/object-import-actions.ts")) return { requireTenantSession: async () => session };
  if (request === "next/navigation") return { redirect: (url) => { lastRedirectUrl = String(url); throw new Error(`REDIRECT:${url}`); } };
  if (request === "next/cache") return { revalidatePath: () => {} };
  if (request === "@/lib/openai-object-reader") return { readObjectDocumentWithOpenAi: async () => { readerCalls++; return readerResponse; } };
  return frameworkLoad.call(this, request, parent, ...rest);
};
const { uploadObjectImportAction } = require(resolve(root, "src/app/object-import-actions.ts"));
const { processIdentityImportJob } = require(resolve(root, "src/lib/identity-import-processor.ts"));
const { normalizeObjectReaderCandidateValue } = require(resolve(root, "src/lib/object-import-processor-adapter.ts"));
assert.deepEqual(normalizeObjectReaderCandidateValue("property.listingPrice", "750万円", "clear"), { value: "7500000", uncertainty: "clear" });
assert.deepEqual(normalizeObjectReaderCandidateValue("property.listingPrice", "750万円から", "clear"), { value: "750万円から", uncertainty: "unclear" }, "money with a from/range suffix must remain unresolved");
assert.deepEqual(normalizeObjectReaderCandidateValue("property.managementFee", "管理費 月額 2,210 円", "clear"), { value: "2210", uncertainty: "clear" }, "allowed labels may precede one anchored amount");
assert.deepEqual(normalizeObjectReaderCandidateValue("property.listingPrice", "合計 750,000円、残金 6,750,000円", "clear"), { value: "合計 750,000円、残金 6,750,000円", uncertainty: "unclear" }, "multiple money values must not select the first amount");
assert.deepEqual(normalizeObjectReaderCandidateValue("property.sizeSqm", "1,234.56㎡", "clear"), { value: "1234.56", uncertainty: "clear" });
assert.deepEqual(normalizeObjectReaderCandidateValue("property.sizeSqm", "19.45㎡ / 15.34㎡", "clear"), { value: "19.45㎡ / 15.34㎡", uncertainty: "unclear" }, "multiple area values must remain unresolved");
assert.deepEqual(normalizeObjectReaderCandidateValue("property.sizeSqm", "１５：３４㎡", "clear"), { value: "15.34", uncertainty: "unclear" }, "colon area convention must be explicit low-confidence normalization");
const form = new FormData(); form.set("caseId", brokerageCase.id); form.set("targetType", "property"); form.set("targetId", property.id); form.set("uploadFile", new File(["%PDF-synthetic"], "lease.pdf", { type: "application/pdf" }));
await assert.rejects(uploadObjectImportAction(form), /REDIRECT:/);
const scope = { tenantId: tenant.id, userId: user.id };
const [target] = await data.listObjectImportTargets({ ...scope, caseId: brokerageCase.id });
assert(target);
assert.equal((await processIdentityImportJob({ ...scope, jobId: target.importJobId })).ok, true);
assert.equal(readerCalls, 1);
const candidates = await data.listObjectImportCandidates({ ...scope, targetId: target.id });
assert.equal(candidates.length, 2);
const rent = candidates.find((item) => item.fieldKey === "lease.rent");
const name = candidates.find((item) => item.fieldKey === "property.name");
assert(rent && name);
assert.equal(rent.provenance.pageNumber, 1);
assert.equal(rent.provenance.sourceText, "賃料 120000");
assert.equal(rent.provenance.subjectKey, "property-1");
assert.equal((await data.getObjectImportTarget({ ...scope, id: target.id })).status, "needs_review");
const { createRequestContext } = require(resolve(root, "src/lib/visibility-resolver.ts"));
const context = createRequestContext(session);
const currentCase = await data.getBrokerageCaseById({ caseId: brokerageCase.id, tenantId: tenant.id, userId: user.id });
assert(currentCase);
const leaseData = { ...currentCase.confirmedDataJson, "lease.rent": "120000" };
const savedLease = await data.saveCaseWorkbenchWithObjectReview({ context, caseId: brokerageCase.id, confirmedDataJson: leaseData, objectReview: { context, targetId: target.id, fieldId: rent.id, expectedVersion: target.targetVersion, expectedCandidateValue: rent.candidateValue, decision: "confirm", value: "120000", caseFieldKey: "lease.rent", caseFieldValue: "120000" } });
assert.equal(savedLease.ok, true);
const afterLease = await data.getBrokerageCaseById({ caseId: brokerageCase.id, tenantId: tenant.id, userId: user.id });
assert.equal(afterLease.confirmedDataJson["lease.rent"], "120000");
assert.equal((await data.listObjectImportCandidates({ ...scope, targetId: target.id })).find((item) => item.id === rent.id).status, "confirmed");
const targetAfterLease = await data.getObjectImportTarget({ ...scope, id: target.id });
const explicitEdit = await data.saveCaseWorkbenchWithObjectReview({ context, caseId: brokerageCase.id, confirmedDataJson: { ...afterLease.confirmedDataJson, "property.name": "Manual property name" }, objectReview: { context, targetId: target.id, fieldId: name.id, expectedVersion: targetAfterLease.targetVersion, expectedCandidateValue: name.candidateValue, decision: "confirm", value: "Manual property name", caseFieldKey: "property.name", caseFieldValue: "Manual property name" } });
assert.equal(explicitEdit.ok, true);
assert.equal((await data.getPropertyById(property.id, tenant.id)).name, "Manual property name");
assert.equal((await data.listObjectImportCandidates({ ...scope, targetId: target.id })).find((item) => item.id === name.id).status, "confirmed");
assert.equal((await processIdentityImportJob({ ...scope, jobId: target.importJobId })).ok, true);
assert.equal(readerCalls, 1);

// Same object, two area bases: preserve both source candidates as one explicit
// conflict record so the reviewer chooses the existing sizeSqm field value.
const conflictProperty = await data.addProperty({ tenantId: tenant.id, createdByUserId: user.id, currentOwnerUserId: user.id, name: "Area conflict property", sizeSqm: 12.5 });
const conflictCase = await data.saveBrokerageCaseExtractionReview({ tenantId: tenant.id, userId: user.id, caseType: "rental", caseTitle: "Area basis conflict", confirmedDataJson: writeCaseAssociationData({}, { parties: [], primaryPropertyId: conflictProperty.id }, { propertyName: conflictProperty.name }), sourceImportJobIds: [], reviewItems: [] });
readerResponse = { documentType: "important_matters", pages: [{ pageNumber: 3, lines: ["専有面積（壁芯）19.45㎡", "登記面積 15.34㎡"] }], candidates: [
  { fieldKey: "property.name", value: "Area conflict property", pageNumber: 3, sourceText: "専有面積（壁芯）19.45㎡", uncertainty: "clear", subjectKey: "property-1", subjectLabel: "物件" },
  { fieldKey: "property.sizeSqm", value: "（壁芯）19.45㎡", pageNumber: 3, sourceText: "専有面積（壁芯）19.45㎡", uncertainty: "unclear", subjectKey: "property-1", subjectLabel: "物件", sourceLocation: { x: 10, y: 20, width: 30, height: 10 } },
  { fieldKey: "property.sizeSqm", value: "登記面積 15.34㎡", pageNumber: 3, sourceText: "登記面積 15.34㎡", uncertainty: "unclear", subjectKey: "property-1", subjectLabel: "物件", sourceLocation: { x: 10, y: 40, width: 30, height: 10 } },
] };
const conflictForm = new FormData(); conflictForm.set("caseId", conflictCase.id); conflictForm.set("targetType", "property"); conflictForm.set("targetId", conflictProperty.id); conflictForm.set("uploadFile", new File(["%PDF-area-conflict"], "重要事項説明書.pdf", { type: "application/pdf" }));
await assert.rejects(uploadObjectImportAction(conflictForm), /REDIRECT:/);
const [conflictTarget] = await data.listObjectImportTargets({ ...scope, caseId: conflictCase.id });
assert.equal((await processIdentityImportJob({ ...scope, jobId: conflictTarget.importJobId })).ok, true);
const conflictFields = await data.listObjectImportCandidates({ ...scope, targetId: conflictTarget.id });
const sizeConflict = conflictFields.find((item) => item.fieldKey === "property.sizeSqm");
assert(sizeConflict);
assert.equal(sizeConflict.status, "conflict");
assert.equal(sizeConflict.provenance.alternatives.length, 2);
assert.equal(sizeConflict.candidateValue, "19.45");
assert.equal(sizeConflict.provenance.alternatives[0].rawValue, "（壁芯）19.45㎡");
assert.equal(sizeConflict.provenance.alternatives[1].rawValue, "登記面積 15.34㎡");
assert.deepEqual(sizeConflict.provenance.sourceLocation, { x: 10, y: 20, width: 30, height: 10 });
assert.equal((await data.getPropertyById(conflictProperty.id, tenant.id)).sizeSqm, 12.5, "conflicting area candidates must not overwrite the existing value");
const chosenArea = await data.reviewObjectImportCandidate({ context: createRequestContext(session), targetId: conflictTarget.id, fieldId: sizeConflict.id, expectedVersion: conflictTarget.targetVersion, expectedCandidateValue: sizeConflict.candidateValue, decision: "confirm", value: "19.45" });
assert.equal(chosenArea.ok, true);
assert.equal((await data.getPropertyById(conflictProperty.id, tenant.id)).sizeSqm, 19.45, "explicit review may choose one existing sizeSqm value");
assert.equal((await data.listObjectImportCandidates({ ...scope, targetId: conflictTarget.id })).find((item) => item.id === sizeConflict.id).status, "confirmed");

const secondProperty = await data.addProperty({ tenantId: tenant.id, createdByUserId: user.id, currentOwnerUserId: user.id, name: "Second property", listingPrice: 200000 });
const secondCase = await data.saveBrokerageCaseExtractionReview({ tenantId: tenant.id, userId: user.id, caseType: "rental", caseTitle: "Ambiguous object reader", confirmedDataJson: writeCaseAssociationData({}, { parties: [], primaryPropertyId: secondProperty.id }, { propertyName: secondProperty.name }), sourceImportJobIds: [], reviewItems: [] });
readerResponse = { documentType: "property_lease_document", pages: [{ pageNumber: 1, lines: ["物件A 賃料 100", "物件B 賃料 200"] }], candidates: [
  { fieldKey: "lease.rent", value: "100", pageNumber: 1, sourceText: "物件A 賃料 100", uncertainty: "clear", subjectKey: "property-A", subjectLabel: "物件1" },
  { fieldKey: "lease.rent", value: "200", pageNumber: 1, sourceText: "物件B 賃料 200", uncertainty: "clear", subjectKey: "property-B", subjectLabel: "物件2" },
] };
const ambiguousForm = new FormData(); ambiguousForm.set("caseId", secondCase.id); ambiguousForm.set("targetType", "property"); ambiguousForm.set("targetId", secondProperty.id); ambiguousForm.set("uploadFile", new File(["%PDF-ambiguous"], "ambiguous.pdf", { type: "application/pdf" }));
await assert.rejects(uploadObjectImportAction(ambiguousForm), /REDIRECT:/);
const [ambiguousTarget] = await data.listObjectImportTargets({ ...scope, caseId: secondCase.id });
assert.equal((await processIdentityImportJob({ ...scope, jobId: ambiguousTarget.importJobId })).ok, true);
assert.equal((await data.getObjectImportTarget({ ...scope, id: ambiguousTarget.id })).status, "conflict");
assert.equal((await data.listObjectImportCandidates({ ...scope, targetId: ambiguousTarget.id })).length, 0);

const thirdProperty = await data.addProperty({ tenantId: tenant.id, createdByUserId: user.id, currentOwnerUserId: user.id, name: "Third property", listingPrice: 300000 });
const thirdPropertyBefore = await data.getPropertyById(thirdProperty.id, tenant.id);
const thirdCase = await data.saveBrokerageCaseExtractionReview({ tenantId: tenant.id, userId: user.id, caseType: "rental", caseTitle: "Not found object reader", confirmedDataJson: writeCaseAssociationData({}, { parties: [], primaryPropertyId: thirdProperty.id }, { propertyName: thirdProperty.name }), sourceImportJobIds: [], reviewItems: [] });
readerResponse = { documentType: "unknown_property_document", pages: [{ pageNumber: 1, lines: ["空白资料"] }], candidates: [
  { fieldKey: "property.name", value: "", pageNumber: 1, sourceText: "", uncertainty: "not_found", subjectKey: "property-1", subjectLabel: "物件" },
] };
const notFoundForm = new FormData(); notFoundForm.set("caseId", thirdCase.id); notFoundForm.set("targetType", "property"); notFoundForm.set("targetId", thirdProperty.id); notFoundForm.set("uploadFile", new File(["%PDF-not-found"], "not-found.pdf", { type: "application/pdf" }));
await assert.rejects(uploadObjectImportAction(notFoundForm), /REDIRECT:/);
const [notFoundTarget] = await data.listObjectImportTargets({ ...scope, caseId: thirdCase.id });
assert.deepEqual(await processIdentityImportJob({ ...scope, jobId: notFoundTarget.importJobId }), { ok: false, status: "failed", error: "object_reader_no_readable_fields" });
const notFoundAfter = await data.getObjectImportTarget({ ...scope, id: notFoundTarget.id });
assert.equal(notFoundAfter.status, "failed");
assert.equal(notFoundAfter.errorCode, "object_reader_no_readable_fields");
assert.equal((await data.listImportJobs(user.id, 500, tenant.id)).find((item) => item.id === notFoundTarget.importJobId).status, "failed");
assert.deepEqual(await data.getPropertyById(thirdProperty.id, tenant.id), thirdPropertyBefore, "unreadable object reader input must preserve the whole property record");

// Standalone property-profile intake has no case association. It may write
// only the 14 existing property fields; valid lease keys are out of context
// and must be filtered before review persistence.
const standaloneProperty = await data.addProperty({ tenantId: tenant.id, createdByUserId: user.id, currentOwnerUserId: user.id, name: "Standalone property" });
readerResponse = { documentType: "important_matters", pages: [{ pageNumber: 3, lines: ["通常の 月 額 2,210 円", "月額 3,540円", "7,500,000 円", "１５：３４㎡", "敷金 750,000 円"] }], candidates: [
  { fieldKey: "property.managementFee", value: "月額 2,210 円", pageNumber: 3, sourceText: "通常の 月 額 2,210 円", uncertainty: "clear", subjectKey: "property-1", subjectLabel: "物件" },
  { fieldKey: "property.repairFee", value: "月額 3,540円", pageNumber: 3, sourceText: "月額 3,540円", uncertainty: "clear", subjectKey: "property-1", subjectLabel: "物件" },
  { fieldKey: "property.listingPrice", value: "7,500,000 円", pageNumber: 3, sourceText: "7,500,000 円", uncertainty: "clear", subjectKey: "property-1", subjectLabel: "物件" },
  { fieldKey: "property.sizeSqm", value: "１５：３４㎡", pageNumber: 3, sourceText: "１５：３４㎡", uncertainty: "clear", subjectKey: "property-1", subjectLabel: "物件" },
  { fieldKey: "lease.deposit", value: "750,000 円", pageNumber: 3, sourceText: "敷金 750,000 円", uncertainty: "clear", subjectKey: "property-1", subjectLabel: "物件" },
] };
const standaloneForm = new FormData(); standaloneForm.set("targetType", "property"); standaloneForm.set("targetId", standaloneProperty.id); standaloneForm.set("uploadFile", new File(["%PDF-standalone"], "重要事項説明書.pdf", { type: "application/pdf" }));
await assert.rejects(uploadObjectImportAction(standaloneForm), /REDIRECT:/);
const [standaloneTarget] = await data.listObjectImportTargets({ ...scope, targetType: "property", targetId: standaloneProperty.id });
assert(standaloneTarget && !standaloneTarget.caseId);
assert.equal((await processIdentityImportJob({ ...scope, jobId: standaloneTarget.importJobId })).ok, true);
const standaloneFields = await data.listObjectImportCandidates({ ...scope, targetId: standaloneTarget.id });
assert.deepEqual(standaloneFields.map((item) => item.fieldKey).sort(), ["property.listingPrice", "property.managementFee", "property.repairFee", "property.sizeSqm"], "case-less property intake must filter lease candidates");
const management = standaloneFields.find((item) => item.fieldKey === "property.managementFee");
const repair = standaloneFields.find((item) => item.fieldKey === "property.repairFee");
const standaloneSize = standaloneFields.find((item) => item.fieldKey === "property.sizeSqm");
assert(management && repair && standaloneSize);
assert.equal(management.candidateValue, "2210");
assert.equal(management.provenance.rawCandidateValue, "月額 2,210 円");
assert.equal(repair.candidateValue, "3540");
assert.equal(standaloneSize.candidateValue, "15.34");
assert.equal(standaloneSize.status, "low_confidence", "area colon convention must remain explicitly unclear");
assert.equal(standaloneSize.provenance.rawCandidateValue, "１５：３４㎡");
const standaloneVersion = (await data.getObjectImportTarget({ ...scope, id: standaloneTarget.id })).targetVersion;
const standaloneReview = await data.reviewObjectImportCandidate({ context: createRequestContext(session), targetId: standaloneTarget.id, fieldId: management.id, expectedVersion: standaloneVersion, expectedCandidateValue: management.candidateValue, decision: "confirm", value: "2210" });
assert.equal(standaloneReview.ok, true);
assert.equal((await data.getPropertyById(standaloneProperty.id, tenant.id)).managementFee, 2210, "standalone confirmed profile field must survive property reopen");

// A standalone property upload may contain all supplied source documents. Each
// PDF receives its own immutable target/evidence chain so sources remain
// independently reviewable and no document silently replaces another.
const multiUploadProperty = await data.addProperty({ tenantId: tenant.id, createdByUserId: user.id, currentOwnerUserId: user.id, name: "Multi-document property" });
const multiUpload = new FormData();
multiUpload.set("targetType", "property");
multiUpload.set("targetId", multiUploadProperty.id);
multiUpload.append("uploadFile", new File(["%PDF-registry"], "registry.pdf", { type: "application/pdf" }));
multiUpload.append("uploadFile", new File(["%PDF-contract"], "contract.pdf", { type: "application/pdf" }));
multiUpload.append("uploadFile", new File(["%PDF-disclosure"], "disclosure.pdf", { type: "application/pdf" }));
await assert.rejects(uploadObjectImportAction(multiUpload), /REDIRECT:/);
const multiTargets = await data.listObjectImportTargets({ ...scope, targetType: "property", targetId: multiUploadProperty.id });
assert.equal(multiTargets.length, 3, "multi-file standalone property upload must queue one source target per document");
assert.equal(new Set(multiTargets.map((item) => item.sourceAttachmentId)).size, 3, "multi-file property sources must retain independent attachments");
const redirectedJobs = new URL(`http://brokerdesk.local${lastRedirectUrl}`).searchParams.get("objectImportJobs")?.split(",") ?? [];
assert.deepEqual(new Set(redirectedJobs), new Set(multiTargets.map((item) => item.importJobId)), "redirect must expose every queued property source job");

console.log("test-object-reader-pipeline: PASS");
