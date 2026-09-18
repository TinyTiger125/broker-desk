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
  if (request === "next/navigation") return { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } };
  if (request === "next/cache") return { revalidatePath: () => {} };
  if (request === "@/lib/openai-object-reader") return { readObjectDocumentWithOpenAi: async () => { readerCalls++; return readerResponse; } };
  return frameworkLoad.call(this, request, parent, ...rest);
};
const { uploadObjectImportAction } = require(resolve(root, "src/app/object-import-actions.ts"));
const { processIdentityImportJob } = require(resolve(root, "src/lib/identity-import-processor.ts"));
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
const thirdCase = await data.saveBrokerageCaseExtractionReview({ tenantId: tenant.id, userId: user.id, caseType: "rental", caseTitle: "Not found object reader", confirmedDataJson: writeCaseAssociationData({}, { parties: [], primaryPropertyId: thirdProperty.id }, { propertyName: thirdProperty.name }), sourceImportJobIds: [], reviewItems: [] });
readerResponse = { documentType: "unknown_property_document", pages: [{ pageNumber: 1, lines: ["空白资料"] }], candidates: [
  { fieldKey: "property.name", value: "", pageNumber: 1, sourceText: "", uncertainty: "not_found", subjectKey: "property-1", subjectLabel: "物件" },
] };
const notFoundForm = new FormData(); notFoundForm.set("caseId", thirdCase.id); notFoundForm.set("targetType", "property"); notFoundForm.set("targetId", thirdProperty.id); notFoundForm.set("uploadFile", new File(["%PDF-not-found"], "not-found.pdf", { type: "application/pdf" }));
await assert.rejects(uploadObjectImportAction(notFoundForm), /REDIRECT:/);
const [notFoundTarget] = await data.listObjectImportTargets({ ...scope, caseId: thirdCase.id });
assert.equal((await processIdentityImportJob({ ...scope, jobId: notFoundTarget.importJobId })).ok, true);
assert.equal((await data.getObjectImportTarget({ ...scope, id: notFoundTarget.id })).status, "failed");

console.log("test-object-reader-pipeline: PASS");
