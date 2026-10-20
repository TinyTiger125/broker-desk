import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, statSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;
const candidate = (value) => [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`].find((item) => existsSync(item) && statSync(item).isFile());
Module._resolveFilename = function(request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return candidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
Module._extensions[".ts"] = (mod, filename) => mod._compile(typescript.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, jsx: typescript.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: filename }).outputText, filename);
Module._extensions[".tsx"] = Module._extensions[".ts"];
const originalLoad = Module._load;
Module._load = function(request, parent, ...rest) {
  if (request === "server-only") return {};
  if (parent?.filename === resolve(root, "src/lib/data.ts")) {
    if (request === "@/lib/data.postgres") return {};
    if (request === "react") return { cache: (fn) => fn };
    if (["next/headers", "@/lib/actor", "@/lib/auth-mode", "@/lib/clerk-auth", "@/lib/staging-access-policy"].includes(request)) return {};
    if (request === "@/lib/production-readiness") return { isPostgresDataStoreConfigured: () => false, assertProductionDataStoreReady: () => {}, isProductionRuntime: () => false };
  }
  return originalLoad.call(this, request, parent, ...rest);
};

const { parseOpenAiIdentityReaderResponse } = require(resolve(root, "src/lib/identity-reader-contract.ts"));
const { isValidCustomerBirthDate, normalizeCustomerIdentityValue, CUSTOMER_IDENTITY_FIELDS } = require(resolve(root, "src/lib/customer-identity-field-catalog.ts"));
assert.equal(isValidCustomerBirthDate("1990-04-12"), true);
assert.equal(isValidCustomerBirthDate("1900-02-30"), false);
assert.deepEqual(Object.keys(CUSTOMER_IDENTITY_FIELDS), ["name", "furigana", "birthDate", "gender", "currentPostalCode", "currentAddress", "phone", "lineId", "email"]);
assert.equal(normalizeCustomerIdentityValue("birthDate", "12 APR 1990"), "1990-04-12");
assert.equal(normalizeCustomerIdentityValue("birthDate", "平成2年4月12日"), "1990-04-12");
assert.equal(normalizeCustomerIdentityValue("gender", "M"), "male");
assert.equal(normalizeCustomerIdentityValue("gender", "F"), "female");
assert.throws(() => parseOpenAiIdentityReaderResponse({ documentType: "identity_passport", pages: [{ pageNumber: 1, lines: ["SAMPLE TEST"] }, { pageNumber: 1, lines: ["DUPLICATE"] }], candidates: [] }));
assert.throws(() => parseOpenAiIdentityReaderResponse({ documentType: "identity_passport", pages: [{ pageNumber: 1, lines: ["SAMPLE TEST"] }], candidates: [{ fieldKey: "applicant.name", value: "YAMADA SHIKEN", pageNumber: 2, sourceText: "氏名 YAMADA SHIKEN", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人" }] }));
for (const documentType of ["identity_passport", "identity_residence_card", "identity_driver_license", "identity_health_insurance_card"]) {
  const parsed = parseOpenAiIdentityReaderResponse({ documentType, pages: [{ pageNumber: 1, lines: ["SAMPLE TEST"] }], candidates: [{ fieldKey: "applicant.name", value: "YAMADA SHIKEN", pageNumber: 1, sourceText: "氏名 YAMADA SHIKEN", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人" }] });
  assert.equal(parsed.documentType, documentType);
}

const data = require(resolve(root, "src/lib/data.ts"));
data.resetBusinessDataForQa();
const tenant = await data.getTenantById("tenant_cherry");
const user = await data.getUserById("user_demo");
const membership = (await data.listTenantMemberships(user.id)).find((item) => item.tenantId === tenant.id);
const session = { tenant, user, membership, externalAuthSubject: user.externalAuthSubject };
const { registerTenantSessionProvenance } = require(resolve(root, "src/lib/tenant-session-provenance.ts"));
registerTenantSessionProvenance(session);
const client = await data.addClient({ tenantId: tenant.id, ownerUserId: user.id, name: "Original customer", phone: "090-0000-0000", email: "keep@example.test", budgetType: "total_price", purpose: "buy", loanPreApprovalStatus: "not_applied", stage: "lead", temperature: "cold", brokerageContractType: "none", amlCheckStatus: "not_required" });
const { buildObjectImportIdempotencyKey, buildObjectVersionFingerprint } = require(resolve(root, "src/lib/object-import-contract.ts"));
const { persistObjectImportJobExtraction } = require(resolve(root, "src/lib/object-import-processor-adapter.ts"));
const { resolveObjectImportTarget } = require(resolve(root, "src/lib/object-import-target-service.ts"));
const content = Buffer.from("%PDF-SAMPLE-TEST");
const version = buildObjectVersionFingerprint(client);
const job = await data.addImportJob({ tenantId: tenant.id, userId: user.id, sourceType: "scan", targetEntity: "parties", title: "SAMPLE TEST passport", status: "queued", idempotencyKey: buildObjectImportIdempotencyKey({ tenantId: tenant.id, target: { targetObjectType: "party", targetObjectId: client.id, targetVersion: version }, sourceHash: "same_person:sample" }), notes: JSON.stringify({ objectImport: { targetObjectType: "party", targetObjectId: client.id, targetVersion: version } }) });
await data.addPrivateAttachment({ tenantId: tenant.id, userId: user.id, targetType: "import_job", targetId: job.id, fileName: "SAMPLE-TEST-passport.pdf", content });
const fields = [
  { fieldKey: "applicant.name", value: "YAMADA SHIKEN", normalizedValue: "YAMADA SHIKEN", confidence: 0.95, sourceRange: "page 1", method: "ai", sourcePageNumber: 1, sourceText: "氏名 YAMADA SHIKEN", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人", alternatives: [{ value: "YAMADA SHIKEN", pageNumber: 1, sourceText: "氏名 YAMADA SHIKEN", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人" }, { value: "YAMADA SHIKEN", pageNumber: 2, sourceText: "NAME YAMADA SHIKEN", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人" }] },
  { fieldKey: "applicant.furigana", value: "ヤマダ シケン", normalizedValue: "ヤマダ シケン", confidence: 0.95, sourceRange: "page 1", method: "ai" },
  { fieldKey: "applicant.birthDate", value: "1990年4月12日", normalizedValue: "1990年4月12日", confidence: 0.95, sourceRange: "page 1", method: "ai" },
  { fieldKey: "applicant.gender", value: "男性", normalizedValue: "男性", confidence: 0.95, sourceRange: "page 1", method: "ai" },
  { fieldKey: "applicant.currentPostalCode", value: "１５０１５００", normalizedValue: "１５０１５００", confidence: 0.95, sourceRange: "page 1", method: "ai" },
  { fieldKey: "applicant.currentAddress", value: "", normalizedValue: "", confidence: 0.0, sourceRange: "page 1", method: "ai" },
  { fieldKey: "applicant.phone", value: "", normalizedValue: "", confidence: 0.0, sourceRange: "page 1", method: "ai" },
  { fieldKey: "applicant.email", value: "", normalizedValue: "", confidence: 0.0, sourceRange: "page 1", method: "ai" },
  { fieldKey: "applicant.nationality", value: "日本", normalizedValue: "日本", confidence: 0.99, sourceRange: "page 1", method: "ai" },
];
const scope = { tenantId: tenant.id, userId: user.id };
await persistObjectImportJobExtraction({ ...scope, job, fields });
const target = await data.getObjectImportTargetByJob({ ...scope, importJobId: job.id });
assert(target && target.targetType === "party" && !target.caseId);
const candidates = await data.listObjectImportCandidates({ ...scope, targetId: target.id });
assert.deepEqual(candidates.map((item) => item.fieldKey).sort(), ["birthDate", "currentAddress", "currentPostalCode", "email", "furigana", "gender", "name", "phone"].sort());
assert.equal(candidates.find((item) => item.fieldKey === "nationality"), undefined);
assert.equal(candidates.find((item) => item.fieldKey === "currentAddress").status, "not_found");
assert.equal(candidates.find((item) => item.fieldKey === "phone").status, "not_found");
assert.equal(candidates.find((item) => item.fieldKey === "birthDate").candidateValue, "1990-04-12");
assert.equal(candidates.find((item) => item.fieldKey === "gender").candidateValue, "male");
assert.equal(candidates.find((item) => item.fieldKey === "currentPostalCode").candidateValue, "150-1500");
const nameProvenance = candidates.find((item) => item.fieldKey === "name").provenance;
assert.equal(nameProvenance.pageNumber, 1);
assert.equal(nameProvenance.sourceText, "氏名 YAMADA SHIKEN");
assert.equal(nameProvenance.uncertainty, "clear");
assert.equal(nameProvenance.subjectKey, "person-1");
assert.equal(nameProvenance.subjectLabel, "申請人");
assert.equal(Array.isArray(nameProvenance.alternatives), true);
assert.equal(nameProvenance.alternatives.length, 2);
const { createRequestContext } = require(resolve(root, "src/lib/visibility-resolver.ts"));
const context = createRequestContext(session);
for (const field of candidates.filter((item) => item.candidateValue)) {
  const currentTarget = await data.getObjectImportTarget({ ...scope, id: target.id });
  const result = await data.reviewObjectImportCandidate({ context, targetId: target.id, fieldId: field.id, expectedVersion: currentTarget.targetVersion, expectedCandidateValue: field.candidateValue, decision: "confirm", value: field.candidateValue });
  assert.equal(result.ok, true, `${field.fieldKey} should save in standalone customer context`);
}
const reopened = await data.getClientById(client.id, tenant.id);
assert.equal(reopened.name, "YAMADA SHIKEN");
assert.equal(reopened.furigana, "ヤマダ シケン");
assert.equal(reopened.birthDate.toISOString().slice(0, 10), "1990-04-12");
assert.equal(reopened.gender, "male");
assert.equal(reopened.currentPostalCode, "150-1500");
assert.equal(reopened.email, "keep@example.test");
assert.equal((await data.getObjectImportTarget({ ...scope, id: target.id })).status, "completed");

const corporate = await data.addClient({ tenantId: tenant.id, ownerUserId: user.id, name: "Corporate QA", phone: "090-0000-0001", budgetType: "total_price", purpose: "buy", loanPreApprovalStatus: "not_applied", stage: "lead", temperature: "cold", brokerageContractType: "none", amlCheckStatus: "not_required", notes: "関係者種別: 法人/会社" });
const corporateResolution = await resolveObjectImportTarget({ context, targetType: "party", targetId: corporate.id });
assert.deepEqual(corporateResolution, { ok: false, reason: "corporate_identity_unsupported" });

// Standalone customer extraction is model-first: a provider response is the
// only source accepted by this path, and an attribution conflict cannot turn
// into a regex-derived formal value.
let modelResponse = {
  documentType: "identity_passport",
  pages: [{ pageNumber: 1, lines: ["氏名 YAMADA SHIKEN", "発行官庁 ADDRESS SHOULD NOT BE USED"] }],
  candidates: [{ fieldKey: "applicant.name", value: "YAMADA SHIKEN", pageNumber: 1, sourceText: "氏名 YAMADA SHIKEN", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人" }],
};
const loaderBeforeIdentityExtractor = Module._load;
Module._load = function(request, parent, ...rest) {
  if (request === "@/lib/openai-identity-reader") return { readIdentityDocumentWithOpenAi: async () => modelResponse };
  return loaderBeforeIdentityExtractor.call(this, request, parent, ...rest);
};
const { extractIdentityDocumentFromBuffer } = require(resolve(root, "src/lib/identity-document-extractor.ts"));
const modelOnly = await extractIdentityDocumentFromBuffer({ buffer: Buffer.from("%PDF-MODEL-FIRST"), filename: "passport.pdf", requireModel: true });
assert.equal(modelOnly.fields.find((field) => field.fieldKey === "applicant.name")?.value, "YAMADA SHIKEN");
assert.match(modelOnly.templateVersion, /vision_ai_v1$/);
assert.equal(modelOnly.fields.find((field) => field.fieldKey === "applicant.name")?.method, "ai");
assert.equal(modelOnly.fields.some((field) => field.fieldKey === "applicant.nationality"), false);
assert.equal(modelOnly.fields.some((field) => field.fieldKey === "applicant.residenceStatus"), false);
modelResponse = {
  ...modelResponse,
  candidates: [
    { ...modelResponse.candidates[0], subjectKey: "person-1", subjectLabel: "申請人" },
    { ...modelResponse.candidates[0], value: "OTHER PERSON", sourceText: "氏名 OTHER PERSON", subjectKey: "person-2", subjectLabel: "申請人" },
  ],
};
const ambiguousModelOnly = await extractIdentityDocumentFromBuffer({ buffer: Buffer.from("%PDF-MODEL-FIRST-AMBIGUOUS"), filename: "passport.pdf", requireModel: true });
const ambiguousName = ambiguousModelOnly.fields.find((field) => field.fieldKey === "applicant.name");
assert.equal(ambiguousName?.value, "");
assert.equal(ambiguousName?.uncertainty, "conflict");
assert.equal(Array.isArray(ambiguousName?.alternatives), true);
console.log("PASS: four identity classifications, existing customer-only field mapping, not_found contacts, normalized date/gender/postal code, standalone review/save/reopen and source-only rejection");
