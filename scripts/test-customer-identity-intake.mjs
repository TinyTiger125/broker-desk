import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  if (request === "@/app/entry-preview-actions") return { previewEntryDocumentsAction: async () => ({ status: "ready", candidates: [], readFileKeys: [], readProofs: {} }) };
  if (request === "@/components/help-hint") return { HelpHint: () => null };
  if (request === "@/lib/entry-upload-staging-client") return { stageEntryUploadFiles: async () => [] };
  if (parent?.filename === resolve(root, "src/lib/data.ts")) {
    if (request === "@/lib/data.postgres") return {};
    if (request === "react") return { cache: (fn) => fn };
    if (["next/headers", "@/lib/actor", "@/lib/auth-mode", "@/lib/clerk-auth", "@/lib/staging-access-policy"].includes(request)) return {};
    if (request === "@/lib/production-readiness") return { isPostgresDataStoreConfigured: () => false, assertProductionDataStoreReady: () => {}, isProductionRuntime: () => false };
  }
  return originalLoad.call(this, request, parent, ...rest);
};

const { parseOpenAiIdentityReaderResponse } = require(resolve(root, "src/lib/identity-reader-contract.ts"));
const { isValidCustomerBirthDate, isCustomerGenderValue, normalizeCustomerGenderValue, normalizeCustomerIdentityValue, customerIdentityFieldKey, CUSTOMER_IDENTITY_FIELDS } = require(resolve(root, "src/lib/customer-identity-field-catalog.ts"));
assert.equal(isValidCustomerBirthDate("1990-04-12"), true);
assert.equal(isValidCustomerBirthDate("1900-02-30"), false);
assert.deepEqual(Object.keys(CUSTOMER_IDENTITY_FIELDS), ["name", "nameLatin", "nameKanji", "nameKatakana", "furigana", "birthDate", "gender", "currentPostalCode", "currentAddress", "phone", "lineId", "email"]);
assert.equal(customerIdentityFieldKey("applicant.nameLatin"), "nameLatin");
assert.equal(customerIdentityFieldKey("applicant.nameKanji"), "nameKanji");
assert.equal(customerIdentityFieldKey("applicant.nameKatakana"), "nameKatakana");
assert.equal(normalizeCustomerIdentityValue("birthDate", "12 APR 1990"), "1990-04-12");
assert.equal(normalizeCustomerIdentityValue("birthDate", "平成2年4月12日"), "1990-04-12");
assert.equal(normalizeCustomerIdentityValue("gender", "M"), "male");
assert.equal(normalizeCustomerIdentityValue("gender", "F"), "female");
for (const [raw, expected] of [["男 M", "male"], ["男/M", "male"], ["男性 (Male)", "male"], ["Ｍ／男性", "male"], ["女 F", "female"], ["女性/F", "female"], ["その他 / Other", "other"]]) {
  assert.equal(normalizeCustomerGenderValue(raw), expected, `gender expression ${raw} must normalize`);
  assert.equal(normalizeCustomerIdentityValue("gender", raw), expected);
  assert.equal(isCustomerGenderValue(normalizeCustomerIdentityValue("gender", raw)), true);
}
for (const raw of ["男 / 女", "male female", "男 unknown", "性別:?"]) {
  assert.equal(normalizeCustomerGenderValue(raw), null, `ambiguous gender ${raw} must not be guessed`);
  assert.equal(isCustomerGenderValue(normalizeCustomerIdentityValue("gender", raw)), false);
}
assert.throws(() => parseOpenAiIdentityReaderResponse({ documentType: "identity_passport", pages: [{ pageNumber: 1, lines: ["SAMPLE TEST"] }, { pageNumber: 1, lines: ["DUPLICATE"] }], candidates: [] }));
assert.throws(() => parseOpenAiIdentityReaderResponse({ documentType: "identity_passport", pages: [{ pageNumber: 1, lines: ["SAMPLE TEST"] }], candidates: [{ fieldKey: "applicant.name", value: "YAMADA SHIKEN", pageNumber: 2, sourceText: "氏名 YAMADA SHIKEN", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人" }] }));
for (const documentType of ["identity_passport", "identity_residence_card", "identity_driver_license", "identity_health_insurance_card"]) {
  const parsed = parseOpenAiIdentityReaderResponse({ documentType, pages: [{ pageNumber: 1, lines: ["SAMPLE TEST"] }], candidates: [{ fieldKey: "applicant.name", value: "YAMADA SHIKEN", pageNumber: 1, sourceText: "氏名 YAMADA SHIKEN", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人" }] });
  assert.equal(parsed.documentType, documentType);
}
const unsupportedMyNumber = parseOpenAiIdentityReaderResponse({ documentType: "identity_residence_card", pages: [{ pageNumber: 1, lines: ["個人番号カード"] }], candidates: [{ fieldKey: "applicant.name", value: "UNSUPPORTED HOLDER", pageNumber: 1, sourceText: "個人番号カード 氏名 UNSUPPORTED HOLDER", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "本人" }] });
assert.equal(unsupportedMyNumber.documentType, "unknown_identity_scan", "My Number markers must override a false supported-document classification");
const splitUnsupportedMyNumber = parseOpenAiIdentityReaderResponse({ documentType: "identity_residence_card", pages: [{ pageNumber: 1, lines: ["個人", "番号カード"] }], candidates: [{ fieldKey: "applicant.currentAddress", value: "UNSUPPORTED ADDRESS", pageNumber: 1, sourceText: "UNSUPPORTED ADDRESS", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "本人" }] });
assert.equal(splitUnsupportedMyNumber.documentType, "unknown_identity_scan", "split OCR My Number markers must also fail closed");

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
const { persistObjectExtraction, persistObjectImportJobExtraction } = require(resolve(root, "src/lib/object-import-processor-adapter.ts"));
const { resolveObjectImportTarget } = require(resolve(root, "src/lib/object-import-target-service.ts"));
const content = Buffer.from("%PDF-SAMPLE-TEST");
const version = buildObjectVersionFingerprint(client);
const job = await data.addImportJob({ tenantId: tenant.id, userId: user.id, sourceType: "scan", targetEntity: "parties", title: "SAMPLE TEST passport", status: "queued", idempotencyKey: buildObjectImportIdempotencyKey({ tenantId: tenant.id, target: { targetObjectType: "party", targetObjectId: client.id, targetVersion: version }, sourceHash: "same_person:sample" }), notes: JSON.stringify({ objectImport: { targetObjectType: "party", targetObjectId: client.id, targetVersion: version } }) });
await data.addPrivateAttachment({ tenantId: tenant.id, userId: user.id, targetType: "import_job", targetId: job.id, fileName: "SAMPLE-TEST-passport.pdf", content });
const fields = [
  { fieldKey: "applicant.name", value: "YAMADA SHIKEN", normalizedValue: "YAMADA SHIKEN", confidence: 0.95, sourceRange: "page 1", method: "ai", sourcePageNumber: 1, sourceText: "氏名 YAMADA SHIKEN", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人", alternatives: [{ value: "YAMADA SHIKEN", pageNumber: 1, sourceText: "氏名 YAMADA SHIKEN", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人" }, { value: "YAMADA SHIKEN", pageNumber: 2, sourceText: "NAME YAMADA SHIKEN", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人" }] },
  { fieldKey: "applicant.furigana", value: "ヤマダ シケン", normalizedValue: "ヤマダ シケン", confidence: 0.95, sourceRange: "page 1", method: "ai" },
  { fieldKey: "applicant.birthDate", value: "1990年4月12日", normalizedValue: "1990年4月12日", confidence: 0.95, sourceRange: "page 1", method: "ai" },
  { fieldKey: "applicant.gender", value: "男/M", normalizedValue: "男/M", rawValue: "男/M", confidence: 0.95, sourceRange: "page 1", method: "ai", sourceText: "性別 男/M" },
  { fieldKey: "applicant.currentPostalCode", value: "１５０１５００", normalizedValue: "１５０１５００", confidence: 0.95, sourceRange: "page 1", method: "ai" },
  { fieldKey: "applicant.currentAddress", value: "", normalizedValue: "", confidence: 0.0, sourceRange: "page 1", method: "ai" },
  { fieldKey: "applicant.phone", value: "", normalizedValue: "", confidence: 0.0, sourceRange: "page 1", method: "ai" },
  { fieldKey: "applicant.email", value: "", normalizedValue: "", confidence: 0.0, sourceRange: "page 1", method: "ai" },
  { fieldKey: "applicant.nationality", value: "日本", normalizedValue: "日本", confidence: 0.99, sourceRange: "page 1", method: "ai" },
];
const scope = { tenantId: tenant.id, userId: user.id };
const queuedGenderReview = await persistObjectExtraction({
  repository: { upsertCandidate: async (candidate) => candidate },
  target: { id: "target-gender-validation", tenantId: tenant.id, sourceAttachmentId: "attachment-synthetic" },
  sourceFileHash: "synthetic-hash",
  fields: [{ fieldKey: "gender", value: "男/女", normalizedValue: "男/女", confidence: 0.9 }],
});
assert.equal(queuedGenderReview[0].candidateValue, "男/女", "queued conflict must retain the raw candidate for review");
assert.equal(queuedGenderReview[0].status, "conflict", "queued conflict must be review-only");
assert.equal(queuedGenderReview[0].finalValue, undefined, "queued conflict must not produce a model final value");
assert.equal(queuedGenderReview[0].provenance.rawCandidateValue, "男/女", "queued conflict must retain raw evidence");
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
assert.equal(candidates.find((item) => item.fieldKey === "gender").provenance.rawCandidateValue, "男/M");
assert.equal(candidates.find((item) => item.fieldKey === "currentPostalCode").candidateValue, "150-1500");
const candidateCountBeforeReplay = candidates.length;
await persistObjectImportJobExtraction({ ...scope, job, fields });
const replayedCandidates = await data.listObjectImportCandidates({ ...scope, targetId: target.id });
assert.equal(replayedCandidates.length, candidateCountBeforeReplay, "replaying the queued extraction must upsert, not duplicate, candidates");
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
  candidates: [
    { fieldKey: "applicant.name", value: "YAMADA SHIKEN", pageNumber: 1, sourceText: "氏名 YAMADA SHIKEN", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人" },
    { fieldKey: "applicant.nameLatin", value: "YAMADA SHIKEN", pageNumber: 1, sourceText: "Name YAMADA SHIKEN", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人" },
    { fieldKey: "applicant.nameKanji", value: "山田 試験", pageNumber: 1, sourceText: "氏名 山田 試験", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人" },
  ],
};
const loaderBeforeIdentityExtractor = Module._load;
Module._load = function(request, parent, ...rest) {
  if (request === "@/lib/openai-identity-reader") return { readIdentityDocumentWithOpenAi: async ({ buffer }) => {
    if (Buffer.from(buffer).toString().includes("GENDER-SECOND")) {
      return { ...modelResponse, candidates: modelResponse.candidates.map((candidate) => ({ ...candidate, value: "男/M", sourceText: "性別 男/M" })) };
    }
    return modelResponse;
  } };
  return loaderBeforeIdentityExtractor.call(this, request, parent, ...rest);
};
const { extractIdentityDocumentFromBuffer, extractIdentityDocumentsFromFiles } = require(resolve(root, "src/lib/identity-document-extractor.ts"));
const modelOnly = await extractIdentityDocumentFromBuffer({ buffer: Buffer.from("%PDF-MODEL-FIRST"), filename: "passport.pdf", requireModel: true });
assert.equal(modelOnly.fields.find((field) => field.fieldKey === "applicant.name")?.value, "YAMADA SHIKEN");
assert.match(modelOnly.templateVersion, /vision_ai_v1$/);
assert.equal(modelOnly.fields.find((field) => field.fieldKey === "applicant.name")?.method, "ai");
assert.equal(modelOnly.fields.find((field) => field.fieldKey === "applicant.nameLatin")?.value, "YAMADA SHIKEN");
assert.equal(modelOnly.fields.find((field) => field.fieldKey === "applicant.nameKanji")?.value, "山田 試験");
assert.equal(modelOnly.fields.find((field) => field.fieldKey === "applicant.nameKatakana")?.value, "", "missing Katakana evidence must remain empty");
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
modelResponse = {
  documentType: "identity_residence_card",
  pages: [{ pageNumber: 1, lines: ["性別 男/M", "性別 女性"] }],
  candidates: [
    { fieldKey: "applicant.gender", value: "男/M", pageNumber: 1, sourceText: "性別 男/M", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "本人" },
    { fieldKey: "applicant.gender", value: "女性", pageNumber: 1, sourceText: "性別 女性", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "本人" },
  ],
};
const ambiguousGenderModelOnly = await extractIdentityDocumentFromBuffer({ buffer: Buffer.from("%PDF-MODEL-GENDER-CONFLICT"), filename: "residence-card.pdf", requireModel: true });
const ambiguousGender = ambiguousGenderModelOnly.fields.find((field) => field.fieldKey === "applicant.gender");
assert.equal(ambiguousGender?.uncertainty, "conflict", "male/female evidence must remain a conflict");
assert.equal(Array.isArray(ambiguousGender?.alternatives), true);
modelResponse = {
  documentType: "identity_residence_card",
  pages: [{ pageNumber: 1, lines: ["性別 男 M"] }],
  candidates: [{ fieldKey: "applicant.gender", value: "男 M", pageNumber: 1, sourceText: "性別 男 M", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "本人" }],
};
const equivalentGenderFirst = Buffer.from("%PDF-SYNTHETIC-GENDER-FIRST");
const equivalentGenderFirstResult = await extractIdentityDocumentsFromFiles([
  { buffer: equivalentGenderFirst, filename: "gender-first.pdf" },
  { buffer: Buffer.from("%PDF-SYNTHETIC-GENDER-SECOND"), filename: "gender-second.pdf" },
], { requireModel: true });
const equivalentGenderField = equivalentGenderFirstResult.fields.find((field) => field.fieldKey === "applicant.gender");
assert.notEqual(equivalentGenderField?.uncertainty, "conflict", "equivalent cross-file gender evidence must not conflict");
modelResponse = {
  documentType: "unknown_identity_scan",
  pages: [{ pageNumber: 1, lines: ["unsupported identity card"] }],
  candidates: [{ fieldKey: "applicant.name", value: "UNSUPPORTED HOLDER", pageNumber: 1, sourceText: "氏名 UNSUPPORTED HOLDER", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "本人" }],
};
const unsupportedModelOnly = await extractIdentityDocumentFromBuffer({ buffer: Buffer.from("%PDF-UNSUPPORTED-IDENTITY"), filename: "unsupported.jpg", requireModel: true });
assert.equal(unsupportedModelOnly.documentType, "unknown_identity_scan");
assert.equal(unsupportedModelOnly.fields.find((field) => field.fieldKey === "applicant.name")?.value, "", "unsupported identity types must not produce a customer name candidate");
modelResponse = {
  documentType: "identity_residence_card",
  pages: [{ pageNumber: 1, lines: ["住居地 未定"] }],
  candidates: [{ fieldKey: "applicant.currentAddress", value: "未定", pageNumber: 1, sourceText: "住居地 未定", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "本人" }],
};
const placeholderAddress = await extractIdentityDocumentFromBuffer({ buffer: Buffer.from("%PDF-MODEL-UNSET-ADDRESS"), filename: "residence-card.jpg", requireModel: true });
const placeholderAddressField = placeholderAddress.fields.find((field) => field.fieldKey === "applicant.currentAddress");
assert.equal(placeholderAddressField?.value, "未定");
assert.equal(placeholderAddressField?.uncertainty, "unclear");
const { entryFileKey, fillAutoSavedEntryForm, safeEntryPreviewCandidates, selectableEntryPreviewCandidates } = require(resolve(root, "src/lib/entry-preview.ts"));
const { buildEntryPreviewFormData } = require(resolve(root, "src/components/entry-preview.tsx"));
assert.equal(entryFileKey({ name: " e\u0301xample.pdf ", size: 42 }), entryFileKey({ name: "éxample.pdf", size: 42 }), "NFD and surrounding spaces must not bypass staging identity");
const normalizedStageForm = buildEntryPreviewFormData([new File([Buffer.alloc(42)], " e\u0301xample.pdf ", { type: "application/pdf" })], "customer", undefined, [{ id: "entry_stage_test", fileName: "éxample.pdf", fileSizeBytes: 42, sha256: "a".repeat(64) }]);
assert.equal(normalizedStageForm.getAll("uploadFile").length, 0, "NFD/trim-equivalent staged refs must remove raw preview upload");
assert.deepEqual(safeEntryPreviewCandidates([{ id: "address-placeholder", key: "currentAddress", sourceKey: "applicant.currentAddress", label: "现住址", value: "未定", fileName: "residence-card.jpg", uncertainty: "clear" }]), []);
const ambiguousGenderPreview = [{ id: "gender-ambiguous", key: "gender", sourceKey: "applicant.gender", label: "性别", value: "男/女", rawValue: "男/女", fileName: "identity.pdf", uncertainty: "clear" }];
assert.deepEqual(safeEntryPreviewCandidates(ambiguousGenderPreview), [], "ambiguous gender must not be auto-saved from preview");
assert.deepEqual(selectableEntryPreviewCandidates(ambiguousGenderPreview), [], "ambiguous gender must not expose a direct confirmation action");
const previewForm = new FormData();
assert.equal(fillAutoSavedEntryForm(previewForm, {
  status: "ready",
  candidates: [{ id: "gender-1", key: "gender", sourceKey: "applicant.gender", label: "性別", value: "male", rawValue: "男/M", fileName: "identity.pdf", pageNumber: 1, sourceText: "性別 男/M", uncertainty: "clear" }],
  readFileKeys: ["identity.pdf:42"],
}), 1);
assert.equal(previewForm.get("gender"), "male", "direct entry auto-save must write the canonical select value");
assert.equal(JSON.parse(String(previewForm.get("entryPreviewDecisions")))["gender-1"], "auto_saved");
const genderConflict = [
  { id: "gender-male", key: "gender", sourceKey: "applicant.gender", label: "性別", value: "male", fileName: "identity.pdf", uncertainty: "conflict" },
  { id: "gender-female", key: "gender", sourceKey: "applicant.gender", label: "性別", value: "female", fileName: "identity.pdf", uncertainty: "conflict" },
];
assert.deepEqual(safeEntryPreviewCandidates(genderConflict), [], "conflicting gender candidates must not auto-save");
assert.equal(selectableEntryPreviewCandidates(genderConflict).length, 2, "conflicting gender candidates remain explicit choices");

// Large-entry staging is tested with deterministic synthetic bytes only. The
// memory adapter proves exact byte reconstruction, tenant/user scoping, one-
// time consumption, missing-chunk rejection and bounded TTL cleanup without
// touching a real customer document or a production account.
const stageBytes = Buffer.concat([Buffer.from("%PDF-synthetic-entry\n"), Buffer.alloc(2 * 1024 * 1024 + 123, 0x5a)]);
const stageDigest = createHash("sha256").update(stageBytes).digest("hex");
const stage = await data.createEntryUploadStaging({ tenantId: tenant.id, userId: user.id, fileName: "合成资料（大文件）.pdf", fileType: "application/pdf", fileSizeBytes: stageBytes.length, sha256: stageDigest, chunkCount: 3 });
for (let index = 0; index < 3; index += 1) {
  const chunk = stageBytes.subarray(index * 1024 * 1024, Math.min(stageBytes.length, (index + 1) * 1024 * 1024));
  await data.putEntryUploadStagingChunk({ tenantId: tenant.id, userId: user.id, id: stage.id, chunkIndex: index, content: chunk, sha256: createHash("sha256").update(chunk).digest("hex") });
}
await data.completeEntryUploadStaging({ tenantId: tenant.id, userId: user.id, id: stage.id });
const stagedRead = await data.readEntryUploadStaging({ tenantId: tenant.id, userId: user.id, id: stage.id });
assert.ok(stagedRead && stagedRead.content.equals(stageBytes), "staging must reconstruct exact original bytes");
assert.equal(await data.readEntryUploadStaging({ tenantId: "other-tenant", userId: user.id, id: stage.id }), null, "staging must be tenant scoped");
assert.equal(await data.consumeEntryUploadStaging({ tenantId: tenant.id, userId: user.id, id: stage.id, requestKey: "intent-a" }), true);
assert.equal((await data.readEntryUploadStaging({ tenantId: tenant.id, userId: user.id, id: stage.id, requestKey: "intent-a" }))?.content.equals(stageBytes), true, "same intent replay may verify the consumed ref");
assert.equal(await data.readEntryUploadStaging({ tenantId: tenant.id, userId: user.id, id: stage.id, requestKey: "intent-b" }), null, "consumed ref must reject a different intent");

// Repeated init calls cannot accumulate unbounded active bytes. Six files are
// allowed for the normal UX; the seventh is rejected before any chunk is sent.
const quotaDigest = createHash("sha256").update(Buffer.from("q")).digest("hex");
for (let index = 0; index < 6; index += 1) {
  await data.createEntryUploadStaging({ tenantId: "quota-tenant", userId: "quota-user", fileName: `quota-${index}.pdf`, fileType: "application/pdf", fileSizeBytes: 1, sha256: quotaDigest, chunkCount: 1 });
}
await assert.rejects(
  () => data.createEntryUploadStaging({ tenantId: "quota-tenant", userId: "quota-user", fileName: "quota-overflow.pdf", fileType: "application/pdf", fileSizeBytes: 1, sha256: quotaDigest, chunkCount: 1 }),
  /entry_upload_staging_quota_exceeded/,
  "active staging must be bounded per tenant/user",
);

const missing = await data.createEntryUploadStaging({ tenantId: tenant.id, userId: user.id, fileName: "synthetic-missing.pdf", fileType: "application/pdf", fileSizeBytes: 2 * 1024 * 1024, sha256: createHash("sha256").update(Buffer.alloc(2 * 1024 * 1024, 0x41)).digest("hex"), chunkCount: 2 });
const firstChunk = Buffer.alloc(1024 * 1024, 0x41);
await data.putEntryUploadStagingChunk({ tenantId: tenant.id, userId: user.id, id: missing.id, chunkIndex: 0, content: firstChunk, sha256: createHash("sha256").update(firstChunk).digest("hex") });
await assert.rejects(() => data.completeEntryUploadStaging({ tenantId: tenant.id, userId: user.id, id: missing.id }), /entry_upload_staging_missing_chunk/);
assert.equal(await data.cleanupExpiredEntryUploadStaging({ tenantId: tenant.id, userId: user.id, now: new Date(Date.now() + 31 * 60 * 1000) }), 2, "TTL cleanup must remove expired staging rows by exact tenant/user scope");
// Exercise the browser uploader against a local protocol fake: metadata-only
// POSTs, binary PUTs no larger than 1 MiB, and a final reference response.
const { applyEntryStagedFilesToFormData, stageEntryUploadFiles } = require(resolve(root, "src/lib/entry-upload-staging-client.ts"));
const realFetch = globalThis.fetch;
const protocolRows = new Map();
let protocolId = 0;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url, "http://local.test");
  const body = init.body;
  if (init.method === "POST") {
    const payload = JSON.parse(String(body));
    if (payload.action === "init") {
      const id = `entry_stage_test_${++protocolId}`;
      protocolRows.set(id, { ...payload, chunks: new Map() });
      return new Response(JSON.stringify({ ok: true, staging: { id, fileName: payload.fileName, fileType: payload.fileType, fileSizeBytes: payload.fileSizeBytes, sha256: payload.sha256, chunkCount: payload.chunkCount, chunkSizeBytes: 1024 * 1024 } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (payload.action === "complete") {
      const row = protocolRows.get(payload.id);
      assert.equal(row.chunks.size, row.chunkCount, "client must send every chunk before complete");
      return new Response(JSON.stringify({ ok: true, staging: { id: payload.id, fileName: row.fileName, fileType: row.fileType, fileSizeBytes: row.fileSizeBytes, sha256: row.sha256, status: "ready" } }), { status: 200, headers: { "content-type": "application/json" } });
    }
  }
  if (init.method === "PUT") {
    const row = protocolRows.get(url.searchParams.get("id"));
    const bytes = new Uint8Array(await new Response(body).arrayBuffer());
    assert.ok(bytes.length <= 1024 * 1024, "each browser staging request must be at most 1 MiB");
    row.chunks.set(Number(url.searchParams.get("index")), bytes);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (init.method === "DELETE") return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  throw new Error(`unexpected staging request ${init.method} ${url}`);
};
const protocolBytes = Buffer.concat([Buffer.from("opaque-browser-protocol\n"), Buffer.alloc(5 * 1024 * 1024 + 9, 0x37)]);
const protocolRefs = await stageEntryUploadFiles([new File([protocolBytes], "中文（测试）.pdf", { type: "application/pdf" })]);
assert.equal(protocolRefs[0].fileName, "中文（测试）.pdf");
assert.equal(protocolRows.size, 1);
const mixedRefs = await stageEntryUploadFiles([
  new File([Buffer.alloc(3 * 1024 * 1024, 0x21)], "mixed-a.pdf", { type: "application/pdf" }),
  new File([Buffer.alloc(3 * 1024 * 1024, 0x22)], "mixed-b.pdf", { type: "application/pdf" }),
]);
assert.equal(mixedRefs.length, 2, "mixed batch references must preserve both files when total exceeds ingress cap");
const submitForm = new FormData();
submitForm.append("uploadFile", new File([protocolBytes], "中文（测试）.pdf", { type: "application/pdf" }));
applyEntryStagedFilesToFormData(submitForm, protocolRefs);
assert.equal(submitForm.getAll("uploadFile").length, 0, "final normal-entry FormData must omit raw files after staging");
assert.equal(JSON.parse(String(submitForm.get("entryStagedFiles"))).length, 1);
globalThis.fetch = realFetch;
console.log("PASS: identity classification/mapping, canonical gender persistence and review gates, exact large-upload staging bytes, tenant scoping, one-time replay and TTL cleanup");
