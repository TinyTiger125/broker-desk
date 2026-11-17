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
const { isValidCustomerBirthDate, isCustomerGenderValue, isCustomerNameRepresentationValue, normalizeCustomerGenderValue, normalizeCustomerIdentityValue, customerIdentityFieldKey, CUSTOMER_IDENTITY_FIELDS, hasStrictPrintedAddressPageEvidence } = require(resolve(root, "src/lib/customer-identity-field-catalog.ts"));
const postgresSource = readFileSync(resolve(root, "src/lib/data.postgres.ts"), "utf8");
assert.match(postgresSource, /nameLatin:\s*"name_latin"/);
assert.match(postgresSource, /nameKanji:\s*"name_kanji"/);
assert.match(postgresSource, /nameKatakana:\s*"name_katakana"/);
const identityImportUiSource = readFileSync(resolve(root, "src/components/client-identity-import-section.tsx"), "utf8");
const objectImportActionsSource = readFileSync(resolve(root, "src/app/object-import-actions.ts"), "utf8");
const clientEditPageSource = readFileSync(resolve(root, "src/app/clients/[id]/edit/page.tsx"), "utf8");
assert.match(identityImportUiSource, /isCustomerGenderValue/);
assert.match(identityImportUiSource, /invalidGenderCandidate/);
assert.match(identityImportUiSource, /!invalidGenderCandidate/);
assert.match(identityImportUiSource, /証明書記載の住所は現在住所とは限らない/);
assert.match(identityImportUiSource, /!documentAddressCandidate/);
assert.match(identityImportUiSource, /生年月日などの安定した印字事実/);
assert.match(identityImportUiSource, /原本の独立証明ではありません/);
assert.match(identityImportUiSource, /请先打开上方原始资料/);
assert.match(identityImportUiSource, /먼저 위의 원본 자료를 열어/);
assert.doesNotMatch(identityImportUiSource, /页面证据不足/);
assert.doesNotMatch(identityImportUiSource, /페이지 증거가 없으므로/);
assert.match(identityImportUiSource, /manualBirthDateBlocked/);
assert.match(identityImportUiSource, /isObjectImportBirthDateManualReviewRequired/);
assert.match(identityImportUiSource, /isObjectImportManualBirthDateAttributable/);
assert.match(identityImportUiSource, /manualBirthDateBlocked && reviewAction[\s\S]*name="decision" value="reject"/);
assert.match(identityImportUiSource, /manualAttestation/);
assert.match(identityImportUiSource, /type="date"/);
assert.match(objectImportActionsSource, /decision === "reject" \? "object_import_rejected"/);
assert.match(clientEditPageSource, /object_import_rejected/);
assert.equal(isValidCustomerBirthDate("1990-04-12"), true);
assert.equal(isValidCustomerBirthDate("1900-02-30"), false);
assert.deepEqual(Object.keys(CUSTOMER_IDENTITY_FIELDS), ["name", "nameLatin", "nameKanji", "nameKatakana", "furigana", "birthDate", "gender", "currentPostalCode", "currentAddress", "phone", "lineId", "email"]);
assert.equal(customerIdentityFieldKey("applicant.nameLatin"), "nameLatin");
assert.equal(isCustomerNameRepresentationValue("nameLatin", "YAMADA, TARO"), true, "a single surname/given-name comma is a supported Latin representation");
assert.equal(isCustomerNameRepresentationValue("nameLatin", "YAMADA，TARO"), true, "a fullwidth comma normalizes to the supported Latin separator");
assert.equal(isCustomerNameRepresentationValue("nameLatin", "YAMADA; TARO"), false, "arbitrary punctuation must not be accepted as a Latin name");
assert.equal(isCustomerNameRepresentationValue("nameLatin", "YAMADA, TARO, TEST"), false, "multiple comma separators must remain invalid");
assert.equal(normalizeCustomerIdentityValue("nameLatin", "YAMADA， TARO"), "YAMADA, TARO", "Latin comma formatting must normalize before persistence");
assert.equal(customerIdentityFieldKey("applicant.nameKanji"), "nameKanji");
assert.equal(customerIdentityFieldKey("applicant.nameKatakana"), "nameKatakana");
assert.equal(normalizeCustomerIdentityValue("birthDate", "12 APR 1990"), "1990-04-12");
assert.equal(normalizeCustomerIdentityValue("birthDate", "平成2年4月12日"), "1990-04-12");
assert.equal(normalizeCustomerIdentityValue("gender", "M"), "male");
assert.equal(normalizeCustomerIdentityValue("gender", "F"), "female");
assert.equal(hasStrictPrintedAddressPageEvidence(
  "東京都テスト区3丁目1番2号",
  "住所 東京都テスト区3丁目1番2号",
  [{ pageNumber: 1, lines: ["住所 東京都テスト区3丁目1番2号"] }],
  1,
), true);
assert.equal(hasStrictPrintedAddressPageEvidence(
  "東京都テスト区5丁目1番2号",
  "住所 東京都テスト区5丁目1番2号",
  [{ pageNumber: 1, lines: ["住所 東京都テスト区3丁目1番2号"] }],
  1,
), false);
assert.equal(hasStrictPrintedAddressPageEvidence(
  "東京都テスト区3丁目1番2号",
  "住所 東京都テスト区3丁目1番2号",
  [{ pageNumber: 1, lines: ["住所", "東京都テスト区3丁目1番2号"] }],
  1,
), false);
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
const { isSafeModelAutoSave } = require(resolve(root, "src/lib/object-import-review.ts"));
const { resolveObjectImportTarget } = require(resolve(root, "src/lib/object-import-target-service.ts"));
const { isObjectImportBirthDateManualReviewRequired, isObjectImportManualBirthDateAttributable, validateObjectImportReview } = require(resolve(root, "src/lib/object-import-review.ts"));
const reviewRecord = { id: "client-synthetic-review", name: "", notes: undefined };
const reviewVersion = buildObjectVersionFingerprint(reviewRecord);
const reviewTarget = { id: "target-synthetic-review", tenantId: tenant.id, userId: user.id, importJobId: "job-synthetic-review", targetType: "party", targetId: reviewRecord.id, targetVersion: reviewVersion, sourceAttachmentId: "attachment-synthetic", status: "needs_review", idempotencyKey: "synthetic-review", attemptCount: 1, createdAt: new Date(), updatedAt: new Date() };
const invalidScriptReview = validateObjectImportReview({ targetId: reviewTarget.id, fieldId: "field-synthetic-review", expectedVersion: reviewVersion, expectedCandidateValue: "YAMADA SHIKEN", decision: "confirm" }, reviewTarget, { id: "field-synthetic-review", tenantId: tenant.id, targetId: reviewTarget.id, fieldKey: "nameKatakana", candidateValue: "YAMADA SHIKEN", confidence: 0.99, provenance: { sourceAttachmentId: reviewTarget.sourceAttachmentId, sourceFileHash: "synthetic-hash", sourceText: "Name: YAMADA SHIKEN", pageEvidenceVerified: true, uncertainty: "clear" }, status: "draft" }, reviewRecord);
assert.deepEqual(invalidScriptReview, { ok: false, reason: "invalid_value" }, "queued review must reject a Latin value in the Katakana field at the server boundary");
const missingEvidenceReview = validateObjectImportReview({ targetId: reviewTarget.id, fieldId: "field-synthetic-review", expectedVersion: reviewVersion, expectedCandidateValue: "山田 試験", decision: "confirm" }, reviewTarget, { id: "field-synthetic-review", tenantId: tenant.id, targetId: reviewTarget.id, fieldKey: "nameKanji", candidateValue: "山田 試験", confidence: 0.99, provenance: { sourceAttachmentId: reviewTarget.sourceAttachmentId, sourceFileHash: "synthetic-hash", pageEvidenceVerified: true, uncertainty: "clear" }, status: "draft" }, reviewRecord);
assert.deepEqual(missingEvidenceReview, { ok: false, reason: "invalid_value" }, "queued review must reject a name without matching printed evidence");
const commaNameReview = validateObjectImportReview({ targetId: reviewTarget.id, fieldId: "field-synthetic-review", expectedVersion: reviewVersion, expectedCandidateValue: "YAMADA, TARO", decision: "confirm" }, reviewTarget, { id: "field-synthetic-review", tenantId: tenant.id, targetId: reviewTarget.id, fieldKey: "nameLatin", candidateValue: "YAMADA, TARO", confidence: 0.74, provenance: { sourceAttachmentId: reviewTarget.sourceAttachmentId, sourceFileHash: "synthetic-hash", sourceText: "Name: YAMADA, TARO", pageEvidenceVerified: true, uncertainty: "clear" }, status: "draft" }, reviewRecord);
assert.deepEqual(commaNameReview, { ok: true, scope: "object", key: "nameLatin", value: "YAMADA, TARO", recordValue: "YAMADA, TARO" }, "server review confirmation must accept only the controlled comma-separated Latin format with exact evidence");
const unsupportedLatinPunctuationReview = validateObjectImportReview({ targetId: reviewTarget.id, fieldId: "field-synthetic-review", expectedVersion: reviewVersion, expectedCandidateValue: "YAMADA; TARO", decision: "confirm" }, reviewTarget, { id: "field-synthetic-review", tenantId: tenant.id, targetId: reviewTarget.id, fieldKey: "nameLatin", candidateValue: "YAMADA; TARO", confidence: 0.99, provenance: { sourceAttachmentId: reviewTarget.sourceAttachmentId, sourceFileHash: "synthetic-hash", sourceText: "Name: YAMADA; TARO", pageEvidenceVerified: true, uncertainty: "clear" }, status: "draft" }, reviewRecord);
assert.deepEqual(unsupportedLatinPunctuationReview, { ok: false, reason: "invalid_value" }, "server review confirmation must reject unsupported Latin punctuation");
const missingPageEvidenceReview = validateObjectImportReview({ targetId: reviewTarget.id, fieldId: "field-synthetic-review", expectedVersion: reviewVersion, expectedCandidateValue: "090-1111-2222", decision: "confirm" }, reviewTarget, { id: "field-synthetic-review", tenantId: tenant.id, targetId: reviewTarget.id, fieldKey: "phone", candidateValue: "090-1111-2222", confidence: 0.99, provenance: { sourceAttachmentId: reviewTarget.sourceAttachmentId, sourceFileHash: "synthetic-hash", uncertainty: "clear" }, status: "draft" }, reviewRecord);
assert.deepEqual(missingPageEvidenceReview, { ok: false, reason: "invalid_value" }, "queued review must fail closed for any candidate from an old record without page evidence");
const content = Buffer.from("%PDF-SAMPLE-TEST");
const version = buildObjectVersionFingerprint(client);
const job = await data.addImportJob({ tenantId: tenant.id, userId: user.id, sourceType: "scan", targetEntity: "parties", title: "SAMPLE TEST passport", status: "queued", idempotencyKey: buildObjectImportIdempotencyKey({ tenantId: tenant.id, target: { targetObjectType: "party", targetObjectId: client.id, targetVersion: version }, sourceHash: "same_person:sample" }), notes: JSON.stringify({ objectImport: { targetObjectType: "party", targetObjectId: client.id, targetVersion: version } }) });
await data.addPrivateAttachment({ tenantId: tenant.id, userId: user.id, targetType: "import_job", targetId: job.id, fileName: "SAMPLE-TEST-passport.pdf", content });
const fields = [
  { fieldKey: "applicant.name", value: "YAMADA SHIKEN", normalizedValue: "YAMADA SHIKEN", confidence: 0.95, sourceRange: "page 1", method: "ai", sourcePageNumber: 1, sourceText: "氏名 YAMADA SHIKEN", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人", alternatives: [{ value: "YAMADA SHIKEN", pageNumber: 1, sourceText: "氏名 YAMADA SHIKEN", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人" }, { value: "YAMADA SHIKEN", pageNumber: 2, sourceText: "NAME YAMADA SHIKEN", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人" }] },
  { fieldKey: "applicant.nameLatin", value: "YAMADA SHIKEN", normalizedValue: "YAMADA SHIKEN", confidence: 0.95, sourceRange: "page 1", method: "ai", sourcePageNumber: 1, sourceText: "Name YAMADA SHIKEN", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人" },
  { fieldKey: "applicant.nameKanji", value: "山田 試験", normalizedValue: "山田 試験", confidence: 0.95, sourceRange: "page 1", method: "ai", sourcePageNumber: 1, sourceText: "氏名 山田 試験", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人" },
  { fieldKey: "applicant.nameKatakana", value: "ヤマダ シケン", normalizedValue: "ヤマダ シケン", confidence: 0.95, sourceRange: "page 1", method: "ai", sourcePageNumber: 1, sourceText: "氏名 ヤマダ シケン", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人" },
  { fieldKey: "applicant.furigana", value: "ヤマダ シケン", normalizedValue: "ヤマダ シケン", confidence: 0.95, sourceRange: "page 1", method: "ai" },
  { fieldKey: "applicant.birthDate", value: "1990年4月12日", normalizedValue: "1990年4月12日", confidence: 0.95, sourceRange: "page 1", method: "ai" },
  { fieldKey: "applicant.gender", value: "男/M", normalizedValue: "男/M", rawValue: "男/M", confidence: 0.95, sourceRange: "page 1", method: "ai", sourceText: "性別 男/M" },
  { fieldKey: "applicant.currentPostalCode", value: "１５０１５００", normalizedValue: "１５０１５００", confidence: 0.95, sourceRange: "page 1", method: "ai" },
  { fieldKey: "applicant.currentAddress", value: "", normalizedValue: "", confidence: 0.0, sourceRange: "page 1", method: "ai" },
  { fieldKey: "applicant.phone", value: "", normalizedValue: "", confidence: 0.0, sourceRange: "page 1", method: "ai" },
  { fieldKey: "applicant.email", value: "", normalizedValue: "", confidence: 0.0, sourceRange: "page 1", method: "ai" },
  { fieldKey: "applicant.nationality", value: "日本", normalizedValue: "日本", confidence: 0.99, sourceRange: "page 1", method: "ai" },
];
// The fixture represents the server's page-lines consistency result. This is
// deliberately explicit so final review tests do not rely on a candidate quote
// alone; it is not an independent assertion about document authenticity.
for (const field of fields) {
  field.pageEvidenceVerified = Boolean(field.value.trim());
}
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
const queuedWrongScript = await persistObjectExtraction({
  customerTarget: true,
  repository: { upsertCandidate: async (candidate) => candidate },
  target: { id: "target-name-validation", tenantId: tenant.id, sourceAttachmentId: "attachment-synthetic" },
  sourceFileHash: "synthetic-hash",
  fields: [{ fieldKey: "nameKatakana", value: "YAMADA SHIKEN", confidence: 0.99, sourceText: "Name: YAMADA SHIKEN", uncertainty: "clear" }],
});
assert.equal(queuedWrongScript[0].status, "low_confidence", "queued wrong-script name must remain review-only at persistence");
assert.equal(queuedWrongScript[0].finalValue, undefined, "queued wrong-script name must not receive a model final value");
const queuedMissingEvidence = await persistObjectExtraction({
  customerTarget: true,
  repository: { upsertCandidate: async (candidate) => candidate },
  target: { id: "target-name-evidence", tenantId: tenant.id, sourceAttachmentId: "attachment-synthetic" },
  sourceFileHash: "synthetic-hash",
  fields: [{ fieldKey: "nameKanji", value: "山田 試験", confidence: 0.99, uncertainty: "clear" }],
});
assert.equal(queuedMissingEvidence[0].status, "low_confidence", "queued name without printed evidence must remain review-only at persistence");
assert.equal(queuedMissingEvidence[0].finalValue, undefined, "queued name without printed evidence must not receive a model final value");
const queuedDocumentAddress = await persistObjectExtraction({
  customerTarget: true,
  repository: { upsertCandidate: async (candidate) => candidate },
  target: { id: "target-address-review", tenantId: tenant.id, sourceAttachmentId: "attachment-synthetic" },
  sourceFileHash: "synthetic-hash",
  fields: [{ fieldKey: "currentAddress", value: "東京都テスト区1-2-3", confidence: 0.99, pageEvidenceVerified: true, sourceText: "住所: 東京都テスト区1-2-3", uncertainty: "clear" }],
});
assert.equal(queuedDocumentAddress[0].status, "draft", "queued document address remains a review candidate");
assert.equal(queuedDocumentAddress[0].finalValue, undefined, "queued document address must not receive a model final value");
await persistObjectImportJobExtraction({ ...scope, job, fields });
const target = await data.getObjectImportTargetByJob({ ...scope, importJobId: job.id });
assert(target && target.targetType === "party" && !target.caseId);
const candidates = await data.listObjectImportCandidates({ ...scope, targetId: target.id });
assert.deepEqual(candidates.map((item) => item.fieldKey).sort(), ["birthDate", "currentAddress", "currentPostalCode", "email", "furigana", "gender", "name", "nameKanji", "nameKatakana", "nameLatin", "phone"].sort());
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
assert.equal(reopened.nameLatin, "YAMADA SHIKEN");
assert.equal(reopened.nameKanji, "山田 試験");
assert.equal(reopened.nameKatakana, "ヤマダ シケン");
assert.equal(reopened.furigana, "ヤマダ シケン");
assert.equal(reopened.birthDate.toISOString().slice(0, 10), "1990-04-12");
assert.equal(reopened.gender, "male");
assert.equal(reopened.currentPostalCode, "150-1500");
assert.equal(reopened.email, "keep@example.test");
assert.equal((await data.getObjectImportTarget({ ...scope, id: target.id })).status, "completed");

// An expired document keeps its printed stable DOB as a review candidate. It
// must not produce a model final value, but an explicit human confirmation of
// the page-evidenced DOB is still allowed. A residence-card address remains
// evidence only: it must never be written as the customer's current address.
const expiredReviewClient = await data.addClient({ tenantId: tenant.id, ownerUserId: user.id, name: "Expired review baseline", phone: "090-0000-0003", budgetType: "total_price", purpose: "buy", loanPreApprovalStatus: "not_applied", stage: "lead", temperature: "cold", brokerageContractType: "none", amlCheckStatus: "not_required" });
const expiredReviewVersion = buildObjectVersionFingerprint(expiredReviewClient);
const expiredReviewBytes = Buffer.from("%PDF-SYNTHETIC-EXPIRED-REVIEW%");
const expiredReviewJob = await data.addImportJob({
  tenantId: tenant.id,
  userId: user.id,
  sourceType: "scan",
  targetEntity: "parties",
  title: "SAMPLE TEST expired review",
  status: "queued",
  idempotencyKey: "synthetic-expired-review-job",
  notes: JSON.stringify({ objectImport: { targetObjectType: "party", targetObjectId: expiredReviewClient.id, targetVersion: expiredReviewVersion } }),
});
await data.addPrivateAttachment({ tenantId: tenant.id, userId: user.id, targetType: "import_job", targetId: expiredReviewJob.id, fileName: "SAMPLE-expired-review.pdf", content: expiredReviewBytes });
const expiredReviewFields = [
  { fieldKey: "applicant.name", value: "EXPIRED REVIEW HOLDER", normalizedValue: "EXPIRED REVIEW HOLDER", confidence: 0.95, method: "ai", sourcePageNumber: 1, sourceText: "氏名 EXPIRED REVIEW HOLDER", pageEvidenceVerified: true, sourceRange: "page 1; identity_document_validity=expired", uncertainty: "unclear", subjectKey: "person-expired", subjectLabel: "本人" },
  // This mirrors the production shape: the candidate is unclear, has no
  // confidence/page proof, and the persisted source range is absent.
  { fieldKey: "applicant.birthDate", value: "1990-04-12", normalizedValue: "1990-04-12", method: "ai", sourcePageNumber: 1, sourceText: "生年月日 1990-04-12", pageEvidenceVerified: false, uncertainty: "unclear", subjectKey: "person-expired", subjectLabel: "本人" },
  { fieldKey: "applicant.currentAddress", value: "東京都テスト区9-9-9", normalizedValue: "東京都テスト区9-9-9", confidence: 0.99, method: "ai", sourcePageNumber: 1, sourceText: "住居地 東京都テスト区9-9-9", pageEvidenceVerified: true, sourceRange: "page 1; identity_document_validity=expired", uncertainty: "unclear", subjectKey: "person-expired", subjectLabel: "本人" },
];
await persistObjectImportJobExtraction({ ...scope, job: expiredReviewJob, fields: expiredReviewFields });
const expiredReviewTarget = await data.getObjectImportTargetByJob({ ...scope, importJobId: expiredReviewJob.id });
assert(expiredReviewTarget);
const expiredReviewCandidates = await data.listObjectImportCandidates({ ...scope, targetId: expiredReviewTarget.id });
const expiredBirthDate = expiredReviewCandidates.find((item) => item.fieldKey === "birthDate");
const expiredAddress = expiredReviewCandidates.find((item) => item.fieldKey === "currentAddress");
assert(expiredBirthDate && expiredAddress);
assert.equal(expiredBirthDate.finalValue, undefined, "expired DOB must not be a model final value before human review");
assert.equal(expiredBirthDate.finalSource, undefined, "expired DOB must not be marked model-saved before human review");
let expiredTargetNow = await data.getObjectImportTarget({ ...scope, id: expiredReviewTarget.id });
const rejectedUnverifiedDob = await data.reviewObjectImportCandidate({ context, targetId: expiredReviewTarget.id, fieldId: expiredBirthDate.id, expectedVersion: expiredTargetNow.targetVersion, expectedCandidateValue: expiredBirthDate.candidateValue, decision: "confirm", value: expiredBirthDate.candidateValue });
assert.deepEqual(rejectedUnverifiedDob, { ok: false, reason: "invalid_value" }, "unverified DOB must reject the model quote without manual attestation");
const expiredDobReview = await data.reviewObjectImportCandidate({ context, targetId: expiredReviewTarget.id, fieldId: expiredBirthDate.id, expectedVersion: expiredTargetNow.targetVersion, expectedCandidateValue: expiredBirthDate.candidateValue, decision: "confirm", value: "1990-04-12", manualAttestation: true });
assert.equal(expiredDobReview.ok, true, "an explicitly attested DOB remains confirmable without trusting the model quote");
const expiredReopened = await data.getClientById(expiredReviewClient.id, tenant.id);
assert.equal(expiredReopened.birthDate?.toISOString().slice(0, 10), "1990-04-12", "confirmed expired DOB must persist after reopen");
assert.equal((await data.listAuditLogs(user.id, { tenantId: tenant.id, limit: 10 })).some((item) => item.action === "object_import_confirm" && item.context?.manualAttestation === true), true, "manual DOB attestation must be auditable");
expiredTargetNow = await data.getObjectImportTarget({ ...scope, id: expiredReviewTarget.id });
const expiredAddressReview = await data.reviewObjectImportCandidate({ context, targetId: expiredReviewTarget.id, fieldId: expiredAddress.id, expectedVersion: expiredTargetNow.targetVersion, expectedCandidateValue: expiredAddress.candidateValue, decision: "confirm", value: expiredAddress.candidateValue });
assert.deepEqual(expiredAddressReview, { ok: false, reason: "invalid_value" }, "document address must remain a pending candidate, not a current-address write");
assert.equal((await data.getClientById(expiredReviewClient.id, tenant.id)).currentAddress, undefined, "document address must not persist as current address");

// A standalone applicant.name value may populate the Latin display slot only
// when the server has both clear uncertainty and page-evidence proof. It must
// not be inferred from a candidate quote or from an unverified old payload.
const latinOnlyClient = await data.addClient({ tenantId: tenant.id, ownerUserId: user.id, name: "Latin-only baseline", phone: "090-0000-0002", budgetType: "total_price", purpose: "buy", loanPreApprovalStatus: "not_applied", stage: "lead", temperature: "cold", brokerageContractType: "none", amlCheckStatus: "not_required" });
const latinOnlyVersion = buildObjectVersionFingerprint(latinOnlyClient);
const latinOnlyJob = await data.addImportJob({
  tenantId: tenant.id,
  userId: user.id,
  sourceType: "scan",
  targetEntity: "parties",
  title: "SAMPLE TEST Latin-only passport",
  status: "queued",
  idempotencyKey: "synthetic-latin-only-job",
  notes: JSON.stringify({ objectImport: { targetObjectType: "party", targetObjectId: latinOnlyClient.id, targetVersion: latinOnlyVersion } }),
});
const latinOnlyContent = Buffer.from("%PDF-LATIN-ONLY-SAMPLE%");
await data.addPrivateAttachment({ tenantId: tenant.id, userId: user.id, targetType: "import_job", targetId: latinOnlyJob.id, fileName: "SAMPLE-LATIN-only.pdf", content: latinOnlyContent });
await persistObjectImportJobExtraction({
  ...scope,
  job: latinOnlyJob,
  fields: [{ fieldKey: "applicant.name", value: "LATIN ONLY", normalizedValue: "LATIN ONLY", confidence: 0.95, method: "ai", sourcePageNumber: 1, sourceText: "Name: LATIN ONLY", pageEvidenceVerified: true, uncertainty: "clear", subjectKey: "person-latin", subjectLabel: "本人" }],
});
const latinOnlyTarget = await data.getObjectImportTargetByJob({ ...scope, importJobId: latinOnlyJob.id });
assert(latinOnlyTarget);
const latinOnlyCandidates = await data.listObjectImportCandidates({ ...scope, targetId: latinOnlyTarget.id });
assert.deepEqual(latinOnlyCandidates.map((item) => item.fieldKey), ["nameLatin"], "verified applicant.name must map to nameLatin");
assert.equal(latinOnlyCandidates[0].status, "draft");
const unverifiedGenericName = await persistObjectExtraction({
  customerTarget: true,
  repository: { upsertCandidate: async (candidate) => candidate },
  target: { id: "target-generic-name-unverified", tenantId: tenant.id, sourceAttachmentId: "attachment-synthetic" },
  sourceFileHash: "synthetic-hash",
  fields: [{ fieldKey: "name", value: "UNVERIFIED GENERIC", confidence: 0.99, sourceText: "Name: UNVERIFIED GENERIC", uncertainty: "clear", pageEvidenceVerified: false }],
});
assert.equal(unverifiedGenericName[0].fieldKey, "name");
assert.equal(unverifiedGenericName[0].status, "low_confidence", "unverified generic names must not be mapped into a visible representation");
assert.equal(unverifiedGenericName[0].finalValue, undefined);
const unverifiedClearBirthDate = await persistObjectExtraction({
  customerTarget: true,
  repository: { upsertCandidate: async (candidate) => candidate },
  target: { id: "target-birth-date-unverified", tenantId: tenant.id, sourceAttachmentId: "attachment-synthetic" },
  sourceFileHash: "synthetic-hash-birth-date-unverified",
  fields: [{ fieldKey: "applicant.birthDate", value: "1990-04-12", confidence: 0.99, sourceText: "生年月日 1990-04-12", uncertainty: "clear", pageEvidenceVerified: false, subjectKey: "person-unverified", subjectLabel: "本人" }],
});
assert.equal(unverifiedClearBirthDate[0].status, "low_confidence", "clear high-confidence DOB without page proof must remain review-only");
assert.equal(unverifiedClearBirthDate[0].finalValue, undefined, "every unverified identity field must omit model final values");
assert.equal(unverifiedClearBirthDate[0].finalSource, undefined, "every unverified identity field must omit model final source");

const attributableManualDob = {
  fieldKey: "birthDate",
  provenance: { subjectKey: "person-holder", subjectLabel: "本人", uncertainty: "unclear", pageEvidenceVerified: false },
};
assert.equal(isObjectImportManualBirthDateAttributable(attributableManualDob), true, "manual DOB requires an attributable holder subject");
assert.equal(isObjectImportManualBirthDateAttributable({ ...attributableManualDob, provenance: { ...attributableManualDob.provenance, sourceRange: "model_attribution_blocked=ambiguous_applicants" } }), false, "ambiguous attribution must block manual DOB");
assert.equal(isObjectImportManualBirthDateAttributable({ ...attributableManualDob, provenance: { ...attributableManualDob.provenance, subjectLabel: "代理人" } }), false, "non-holder subject must block manual DOB");
assert.equal(isObjectImportManualBirthDateAttributable({ ...attributableManualDob, provenance: { ...attributableManualDob.provenance, alternatives: [{ subjectKey: "person-other", subjectLabel: "本人" }] } }), false, "an alternative subject must block manual DOB");
assert.equal(isObjectImportBirthDateManualReviewRequired({ ...attributableManualDob, provenance: { ...attributableManualDob.provenance, pageEvidenceVerified: true, sourceRange: "page 1; identity_document_validity=expired" } }), true, "expired DOB requires manual review even with page evidence");
assert.equal(isObjectImportBirthDateManualReviewRequired({ ...attributableManualDob, provenance: { ...attributableManualDob.provenance, pageEvidenceVerified: true, sourceRange: "page 1; identity_document_validity=unclear" } }), true, "unclear validity DOB requires manual review even with page evidence");
const pageVerifiedExpiredDob = { id: "field-page-verified-expired-dob", tenantId: tenant.id, targetId: reviewTarget.id, fieldKey: "birthDate", candidateValue: "1990-04-12", confidence: 0.99, provenance: { sourceAttachmentId: reviewTarget.sourceAttachmentId, sourceFileHash: "synthetic-hash", pageEvidenceVerified: true, uncertainty: "unclear", subjectKey: "person-holder", subjectLabel: "本人", sourceRange: "page 1; identity_document_validity=expired" }, status: "low_confidence" };
assert.deepEqual(validateObjectImportReview({ targetId: reviewTarget.id, fieldId: pageVerifiedExpiredDob.id, expectedVersion: reviewVersion, expectedCandidateValue: pageVerifiedExpiredDob.candidateValue, decision: "confirm", value: pageVerifiedExpiredDob.candidateValue }, reviewTarget, pageVerifiedExpiredDob, reviewRecord), { ok: false, reason: "invalid_value" }, "page-evidenced expired DOB must not accept one-click model confirmation");
assert.equal(validateObjectImportReview({ targetId: reviewTarget.id, fieldId: pageVerifiedExpiredDob.id, expectedVersion: reviewVersion, expectedCandidateValue: pageVerifiedExpiredDob.candidateValue, decision: "confirm", value: "1990-04-12", manualAttestation: true }, reviewTarget, pageVerifiedExpiredDob, reviewRecord).ok, true, "page-evidenced expired DOB may be saved only after manual attestation");
const pageVerifiedUnclearDob = { ...pageVerifiedExpiredDob, id: "field-page-verified-unclear-dob", provenance: { ...pageVerifiedExpiredDob.provenance, sourceRange: "page 1; identity_document_validity=unclear" } };
assert.deepEqual(validateObjectImportReview({ targetId: reviewTarget.id, fieldId: pageVerifiedUnclearDob.id, expectedVersion: reviewVersion, expectedCandidateValue: pageVerifiedUnclearDob.candidateValue, decision: "confirm", value: pageVerifiedUnclearDob.candidateValue }, reviewTarget, pageVerifiedUnclearDob, reviewRecord), { ok: false, reason: "invalid_value" }, "page-evidenced unclear-validity DOB must not accept one-click model confirmation");
const blockedManualDobReview = validateObjectImportReview({ targetId: reviewTarget.id, fieldId: "field-blocked-manual-dob", expectedVersion: reviewVersion, expectedCandidateValue: "1990-04-12", decision: "confirm", value: "1990-04-12", manualAttestation: true }, reviewTarget, { id: "field-blocked-manual-dob", tenantId: tenant.id, targetId: reviewTarget.id, fieldKey: "birthDate", candidateValue: "1990-04-12", confidence: 0.99, provenance: { sourceAttachmentId: reviewTarget.sourceAttachmentId, sourceFileHash: "synthetic-hash", pageEvidenceVerified: false, uncertainty: "unclear", subjectKey: "person-holder", subjectLabel: "本人", sourceRange: "model_attribution_blocked=ambiguous_applicants" }, status: "low_confidence" }, reviewRecord);
assert.deepEqual(blockedManualDobReview, { ok: false, reason: "invalid_value" }, "manual attestation must not bypass server attribution blocking");

const corporate = await data.addClient({ tenantId: tenant.id, ownerUserId: user.id, name: "Corporate QA", phone: "090-0000-0001", budgetType: "total_price", purpose: "buy", loanPreApprovalStatus: "not_applied", stage: "lead", temperature: "cold", brokerageContractType: "none", amlCheckStatus: "not_required", notes: "関係者種別: 法人/会社" });
const corporateResolution = await resolveObjectImportTarget({ context, targetType: "party", targetId: corporate.id });
assert.deepEqual(corporateResolution, { ok: false, reason: "corporate_identity_unsupported" });

// Standalone customer extraction is model-first: a provider response is the
// only source accepted by this path, and an attribution conflict cannot turn
// into a regex-derived formal value.
let modelResponse = {
  documentType: "identity_passport",
  pages: [{ pageNumber: 1, lines: ["氏名 YAMADA SHIKEN", "Name YAMADA SHIKEN", "氏名 山田 試験", "発行官庁 ADDRESS SHOULD NOT BE USED"] }],
  candidates: [
    { fieldKey: "applicant.name", value: "YAMADA SHIKEN", pageNumber: 1, sourceText: "氏名 YAMADA SHIKEN", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人" },
    { fieldKey: "applicant.nameLatin", value: "YAMADA SHIKEN", pageNumber: 1, sourceText: "Name YAMADA SHIKEN", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人" },
    { fieldKey: "applicant.nameKanji", value: "山田 試験", pageNumber: 1, sourceText: "氏名 山田 試験", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "申請人" },
  ],
};
const loaderBeforeIdentityExtractor = Module._load;
Module._load = function(request, parent, ...rest) {
  if (request === "@/lib/openai-identity-reader") return { readIdentityDocumentWithOpenAi: async ({ buffer }) => {
    if (Buffer.from(buffer).toString().includes("GENDER-CONFLICT")) {
      return { ...modelResponse, candidates: [
        { fieldKey: "applicant.gender", value: "男/M", pageNumber: 1, sourceText: "性別 男/M", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "本人" },
        { fieldKey: "applicant.gender", value: "女性", pageNumber: 1, sourceText: "性別 女性", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "本人" },
      ] };
    }
    if (Buffer.from(buffer).toString().includes("GENDER-SECOND")) {
      return { ...modelResponse, candidates: modelResponse.candidates.map((candidate) => ({ ...candidate, value: "男/M", sourceText: "性別 男/M" })) };
    }
    if (Buffer.from(buffer).toString().includes("PARTIAL-A")) {
      return { ...modelResponse, candidates: [{ fieldKey: "applicant.name", value: "PERSON A", pageNumber: 1, sourceText: "氏名 PERSON A", uncertainty: "clear", subjectKey: "person-a", subjectLabel: "本人" }] };
    }
    if (Buffer.from(buffer).toString().includes("PARTIAL-B")) {
      return { ...modelResponse, candidates: [{ fieldKey: "applicant.birthDate", value: "1990-04-12", pageNumber: 1, sourceText: "生年月日 1990-04-12", uncertainty: "clear", subjectKey: "person-b", subjectLabel: "本人" }] };
    }
    if (Buffer.from(buffer).toString().includes("PARTIAL-SINGLE-NAME")) {
      return { ...modelResponse, candidates: [{ fieldKey: "applicant.name", value: "PERSON A", pageNumber: 1, sourceText: "氏名 PERSON A", uncertainty: "clear", subjectKey: "person-a", subjectLabel: "本人" }] };
    }
    if (Buffer.from(buffer).toString().includes("PARTIAL-SINGLE-BIRTH")) {
      return { ...modelResponse, candidates: [{ fieldKey: "applicant.birthDate", value: "1990-04-12", pageNumber: 1, sourceText: "生年月日 1990-04-12", uncertainty: "clear", subjectKey: "person-a", subjectLabel: "本人" }] };
    }
    if (Buffer.from(buffer).toString().includes("ADDRESS-DIGIT-MISMATCH")) {
      return {
        documentType: "identity_residence_card",
        pages: [{ pageNumber: 1, lines: ["住所 東京都テスト区3丁目1番2号"] }],
        candidates: [{ fieldKey: "applicant.currentAddress", value: "東京都テスト区5丁目1番2号", pageNumber: 1, sourceText: "住所 東京都テスト区5丁目1番2号", uncertainty: "clear", subjectKey: "person", subjectLabel: "本人" }],
      };
    }
    if (Buffer.from(buffer).toString().includes("ADDRESS-SAME-RESPONSE-CONFLICT")) {
      return {
        documentType: "identity_residence_card",
        pages: [{ pageNumber: 1, lines: ["住所 東京都テスト区3丁目1番2号", "住所 東京都テスト区5丁目1番2号"] }],
        candidates: [
          { fieldKey: "applicant.currentAddress", value: "東京都テスト区3丁目1番2号", pageNumber: 1, sourceText: "住所 東京都テスト区3丁目1番2号", uncertainty: "clear", subjectKey: "person", subjectLabel: "本人" },
          { fieldKey: "applicant.currentAddress", value: "東京都テスト区5丁目1番2号", pageNumber: 1, sourceText: "住所 東京都テスト区5丁目1番2号", uncertainty: "clear", subjectKey: "person", subjectLabel: "本人" },
        ],
      };
    }
    if (Buffer.from(buffer).toString().includes("LATIN-EVIDENCE-DRAFT")) {
      return {
        documentType: "identity_passport",
        pages: [{ pageNumber: 1, lines: ["Name YAMADA SHIKEN", "生年月日 1990-04-12"] }],
        candidates: [
          { fieldKey: "applicant.nameLatin", value: "YAMADA SHIKEN", pageNumber: 1, sourceText: "Name YAMADA SHIKEN", uncertainty: "clear", subjectKey: "person", subjectLabel: "本人" },
          { fieldKey: "applicant.birthDate", value: "1990-04-12", pageNumber: 1, sourceText: "生年月日 1990-04-12", uncertainty: "clear", subjectKey: "person", subjectLabel: "本人" },
        ],
      };
    }
    if (Buffer.from(buffer).toString().includes("SAME-DOB-A") || Buffer.from(buffer).toString().includes("SAME-DOB-B")) {
      const personName = Buffer.from(buffer).toString().includes("SAME-DOB-A") ? "PERSON A" : "PERSON B";
      return { ...modelResponse, candidates: [
        { fieldKey: "applicant.name", value: personName, pageNumber: 1, sourceText: `氏名 ${personName}`, uncertainty: "clear", subjectKey: "person", subjectLabel: "本人" },
        { fieldKey: "applicant.birthDate", value: "1990-04-12", pageNumber: 1, sourceText: "生年月日 1990-04-12", uncertainty: "clear", subjectKey: "person", subjectLabel: "本人" },
      ] };
    }
    if (Buffer.from(buffer).toString().includes("SAME-NAME-A") || Buffer.from(buffer).toString().includes("SAME-NAME-B")) {
      const birthDate = Buffer.from(buffer).toString().includes("SAME-NAME-A") ? "1990-04-12" : "1980-01-01";
      return { ...modelResponse, candidates: [
        { fieldKey: "applicant.name", value: "SAME PERSON", pageNumber: 1, sourceText: "氏名 SAME PERSON", uncertainty: "clear", subjectKey: "person", subjectLabel: "本人" },
        { fieldKey: "applicant.birthDate", value: birthDate, pageNumber: 1, sourceText: `生年月日 ${birthDate}`, uncertainty: "clear", subjectKey: "person", subjectLabel: "本人" },
      ] };
    }
    if (Buffer.from(buffer).toString().includes("QUEUE-A") || Buffer.from(buffer).toString().includes("QUEUE-B")) {
      const personName = Buffer.from(buffer).toString().includes("QUEUE-A") ? "QUEUE PERSON A" : "QUEUE PERSON B";
      const birthDate = Buffer.from(buffer).toString().includes("QUEUE-A") ? "1990-04-12" : "1980-01-01";
      return {
        documentType: "identity_passport",
        pages: [{ pageNumber: 1, lines: [`氏名 ${personName}`, `生年月日 ${birthDate}`] }],
        candidates: [
          { fieldKey: "applicant.name", value: personName, pageNumber: 1, sourceText: `氏名 ${personName}`, uncertainty: "clear", subjectKey: "person", subjectLabel: "本人" },
          { fieldKey: "applicant.birthDate", value: birthDate, pageNumber: 1, sourceText: `生年月日 ${birthDate}`, uncertainty: "clear", subjectKey: "person", subjectLabel: "本人" },
        ],
      };
    }
    if (Buffer.from(buffer).toString().includes("EMPTY-PAGE")) {
      return parseOpenAiIdentityReaderResponse({
        documentType: "identity_passport",
        pages: [{ pageNumber: 1, lines: [] }, { pageNumber: 2, lines: ["unrelated page text"] }],
        candidates: [{ fieldKey: "applicant.name", value: "EMPTY PAGE PERSON", pageNumber: 1, sourceText: "氏名 EMPTY PAGE PERSON", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "本人" }],
      });
    }
    if (Buffer.from(buffer).toString().includes("DIRECT-QUEUED-B")) {
      return {
        documentType: "identity_passport",
        pages: [{ pageNumber: 1, lines: ["氏名 QUEUED DIFFERENT PERSON", "生年月日 1980-01-01"] }],
        candidates: [
          { fieldKey: "applicant.name", value: "QUEUED DIFFERENT PERSON", pageNumber: 1, sourceText: "氏名 QUEUED DIFFERENT PERSON", uncertainty: "clear", subjectKey: "person", subjectLabel: "本人" },
          { fieldKey: "applicant.birthDate", value: "1980-01-01", pageNumber: 1, sourceText: "生年月日 1980-01-01", uncertainty: "clear", subjectKey: "person", subjectLabel: "本人" },
        ],
      };
    }
    return modelResponse;
  } };
  return loaderBeforeIdentityExtractor.call(this, request, parent, ...rest);
};
const { extractIdentityDocumentFromBuffer, extractIdentityDocumentsFromFiles } = require(resolve(root, "src/lib/identity-document-extractor.ts"));
const { queueIdentityImportSources } = require(resolve(root, "src/lib/identity-import-queue.ts"));
const { processIdentityImportJob } = require(resolve(root, "src/lib/identity-import-processor.ts"));
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
const conflictingGenderBatch = await extractIdentityDocumentsFromFiles([
  { buffer: Buffer.from("%PDF-GENDER-CONFLICT-A"), filename: "gender-conflict-a.pdf" },
  { buffer: Buffer.from("%PDF-GENDER-CONFLICT-B"), filename: "gender-conflict-b.pdf" },
], { requireModel: true });
const conflictingGenderBatchField = conflictingGenderBatch.fields.find((field) => field.fieldKey === "applicant.gender");
assert.equal(conflictingGenderBatchField?.uncertainty, "conflict", "queued contradictory gender must remain review-only instead of failing the whole job");
const partialDifferentPeopleResult = await extractIdentityDocumentsFromFiles([
  { buffer: Buffer.from("%PDF-PARTIAL-A"), filename: "partial-a.pdf" },
  { buffer: Buffer.from("%PDF-PARTIAL-B"), filename: "partial-b.pdf" },
], { requireModel: true });
const partialName = partialDifferentPeopleResult.fields.find((field) => field.fieldKey === "applicant.name");
const partialBirthDate = partialDifferentPeopleResult.fields.find((field) => field.fieldKey === "applicant.birthDate");
assert.equal(partialName?.value, "PERSON A");
assert.equal(partialBirthDate?.value, "1990-04-12");
assert.equal(partialName?.uncertainty, "unclear", "cross-file complementary identity fields must remain review-only");
assert.equal(partialBirthDate?.uncertainty, "unclear", "cross-file complementary identity fields must remain review-only");
assert.match(partialName?.sourceRange ?? "", /identity_merge_review=missing_shared_anchor/);
assert.match(partialBirthDate?.sourceRange ?? "", /identity_merge_review=missing_shared_anchor/);
const queuedPartialName = await extractIdentityDocumentFromBuffer({ buffer: Buffer.from("%PDF-PARTIAL-SINGLE-NAME"), filename: "partial-name.pdf", requireModel: true });
const queuedPartialNameField = queuedPartialName.fields.find((field) => field.fieldKey === "applicant.name");
assert.equal(queuedPartialNameField?.value, "PERSON A");
assert.equal(queuedPartialNameField?.uncertainty, "unclear", "queued single-file name-only extraction must remain review-only");
assert.match(queuedPartialNameField?.sourceRange ?? "", /identity_single_file_review=missing_name_or_birth_date/);
const queuedPartialBirth = await extractIdentityDocumentFromBuffer({ buffer: Buffer.from("%PDF-PARTIAL-SINGLE-BIRTH"), filename: "partial-birth.pdf", requireModel: true });
const queuedPartialBirthField = queuedPartialBirth.fields.find((field) => field.fieldKey === "applicant.birthDate");
assert.equal(queuedPartialBirthField?.value, "1990-04-12");
assert.equal(queuedPartialBirthField?.uncertainty, "unclear", "queued single-file birth-only extraction must remain review-only");
assert.match(queuedPartialBirthField?.sourceRange ?? "", /identity_single_file_review=missing_name_or_birth_date/);
const queuedSameBirthDifferentNames = await extractIdentityDocumentsFromFiles([
  { buffer: Buffer.from("%PDF-SAME-DOB-A"), filename: "same-dob-a.pdf" },
  { buffer: Buffer.from("%PDF-SAME-DOB-B"), filename: "same-dob-b.pdf" },
], { requireModel: true });
assert.notEqual(queuedSameBirthDifferentNames.fields.find((field) => field.fieldKey === "applicant.name")?.uncertainty, "clear", "queued same-DOB different-name sources must remain review-only");
assert.notEqual(queuedSameBirthDifferentNames.fields.find((field) => field.fieldKey === "applicant.birthDate")?.uncertainty, "clear", "queued same-DOB different-name birth evidence must not be used for merge");
const queuedSameNameDifferentBirthDates = await extractIdentityDocumentsFromFiles([
  { buffer: Buffer.from("%PDF-SAME-NAME-A"), filename: "same-name-a.pdf" },
  { buffer: Buffer.from("%PDF-SAME-NAME-B"), filename: "same-name-b.pdf" },
], { requireModel: true });
assert.notEqual(queuedSameNameDifferentBirthDates.fields.find((field) => field.fieldKey === "applicant.name")?.uncertainty, "clear", "queued same-name different-DOB sources must remain review-only");
assert.notEqual(queuedSameNameDifferentBirthDates.fields.find((field) => field.fieldKey === "applicant.birthDate")?.uncertainty, "clear", "queued same-name different-DOB evidence must not be used for merge");
modelResponse = {
  documentType: "identity_passport",
  pages: [{ pageNumber: 1, lines: ["氏名 PAGE PERSON"] }],
  candidates: [{ fieldKey: "applicant.name", value: "WRONG QUOTE PERSON", pageNumber: 1, sourceText: "氏名 WRONG QUOTE PERSON", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "本人" }],
};
const wrongPageQuote = await extractIdentityDocumentFromBuffer({ buffer: Buffer.from("%PDF-WRONG-PAGE-QUOTE"), filename: "wrong-page-quote.pdf", requireModel: true });
assert.equal(wrongPageQuote.fields.find((field) => field.fieldKey === "applicant.name")?.uncertainty, "unclear", "a queued candidate quote absent from page lines must remain review-only");
const addressDigitMismatch = await extractIdentityDocumentFromBuffer({ buffer: Buffer.from("%PDF-ADDRESS-DIGIT-MISMATCH"), filename: "address-digit-mismatch.pdf", requireModel: true });
const mismatchedAddressField = addressDigitMismatch.fields.find((field) => field.fieldKey === "applicant.currentAddress");
assert.equal(mismatchedAddressField?.pageEvidenceVerified, false, "an address digit absent from the page line must not pass strict evidence");
assert.equal(mismatchedAddressField?.uncertainty, "unclear", "a 5丁目 model quote against a 3丁目 page line must remain review-only");
const persistedMismatchedAddress = await persistObjectExtraction({
  customerTarget: true,
  repository: { upsertCandidate: async (candidate) => candidate },
  target: { id: "target-address-digit-mismatch", tenantId: tenant.id, sourceAttachmentId: "attachment-synthetic" },
  sourceFileHash: "synthetic-hash-address-digit",
  fields: [mismatchedAddressField],
});
assert.equal(persistedMismatchedAddress[0].finalValue, undefined, "a mismatched address must never receive a model final value");
assert.equal(isSafeModelAutoSave(persistedMismatchedAddress[0]), false, "a mismatched address must never qualify for auto-save");
const sameResponseAddressConflict = await extractIdentityDocumentFromBuffer({ buffer: Buffer.from("%PDF-ADDRESS-SAME-RESPONSE-CONFLICT"), filename: "address-same-response-conflict.pdf", requireModel: true });
const sameResponseAddressField = sameResponseAddressConflict.fields.find((field) => field.fieldKey === "applicant.currentAddress");
assert.equal(sameResponseAddressField?.uncertainty, "conflict", "同一响应中的地址候选冲突必须保持冲突证据");
assert.equal((sameResponseAddressField?.alternatives ?? []).length >= 2, true, "同一响应的地址候选冲突必须保留两个待核对备选值");
const latinEvidenceDraft = await extractIdentityDocumentFromBuffer({ buffer: Buffer.from("%PDF-LATIN-EVIDENCE-DRAFT"), filename: "latin-evidence-draft.pdf", requireModel: true });
const latinEvidenceField = latinEvidenceDraft.fields.find((field) => field.fieldKey === "applicant.nameLatin");
assert.equal(latinEvidenceField?.uncertainty, "clear", "exact Latin evidence remains clear at extraction");
assert.equal(latinEvidenceField?.pageEvidenceVerified, true, "exact Latin evidence must retain page proof");
const persistedLatinEvidence = await persistObjectExtraction({
  customerTarget: true,
  repository: { upsertCandidate: async (candidate) => candidate },
  target: { id: "target-latin-evidence-draft", tenantId: tenant.id, sourceAttachmentId: "attachment-synthetic" },
  sourceFileHash: "synthetic-hash-latin-evidence",
  fields: [latinEvidenceField],
});
assert.equal(persistedLatinEvidence[0].confidence, 0.74, "Latin evidence calibration must not inflate the generic AI confidence score");
assert.equal(persistedLatinEvidence[0].status, "low_confidence", "even exact Latin evidence below the auto-save threshold remains review-only");
assert.doesNotMatch(persistedLatinEvidence[0].provenance.sourceRange ?? "", /identity_name_latin_exact_evidence/, "the original evidence range must not be rewritten as a synthetic proof marker");
assert.equal(persistedLatinEvidence[0].finalValue, undefined, "low-confidence Latin evidence must not receive a model final value");
assert.equal(isSafeModelAutoSave(persistedLatinEvidence[0]), false, "the unchanged 0.8 auto-save gate must still block the calibrated Latin draft");
const latinCommaEvidenceDraft = await persistObjectExtraction({
  customerTarget: true,
  repository: { upsertCandidate: async (candidate) => candidate },
  target: { id: "target-latin-comma-evidence", tenantId: tenant.id, sourceAttachmentId: "attachment-synthetic" },
  sourceFileHash: "synthetic-hash-latin-comma",
  fields: [{ fieldKey: "nameLatin", value: "YAMADA, TARO", confidence: 0.74, method: "ai", pageEvidenceVerified: true, sourceText: "Name YAMADA, TARO", uncertainty: "clear" }],
});
assert.equal(latinCommaEvidenceDraft[0].candidateValue, "YAMADA, TARO", "the queued Latin candidate must preserve the exact comma-separated value");
assert.equal(latinCommaEvidenceDraft[0].status, "low_confidence", "a supported comma-separated Latin value below the threshold remains review-only");
assert.equal(latinCommaEvidenceDraft[0].finalValue, undefined, "normalization must not turn low-confidence Latin evidence into a model final value");
assert.equal(isSafeModelAutoSave(latinCommaEvidenceDraft[0]), false, "the existing confidence gate must still block automatic persistence of the calibrated draft");
const emptyPageCandidate = await extractIdentityDocumentFromBuffer({ buffer: Buffer.from("%PDF-EMPTY-PAGE"), filename: "empty-page.pdf", requireModel: true });
assert.equal(emptyPageCandidate.fields.find((field) => field.fieldKey === "applicant.name")?.uncertainty, "unclear", "a queued candidate on an empty page must remain review-only");
assert.equal(emptyPageCandidate.fields.find((field) => field.fieldKey === "applicant.name")?.pageEvidenceVerified, false, "a pseudo quote must not mark an empty page as verified");
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
modelResponse = {
  documentType: "identity_residence_card",
  pages: [{ pageNumber: 1, lines: ["氏名 PERSON EXPIRY", "有効期限 2020年01月01日"] }],
  candidates: [{ fieldKey: "applicant.name", value: "PERSON EXPIRY", pageNumber: 1, sourceText: "氏名 PERSON EXPIRY", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "本人" }],
};
const expiredDocument = await extractIdentityDocumentFromBuffer({ buffer: Buffer.from("%PDF-MODEL-EXPIRED"), filename: "expired-residence-card.pdf", requireModel: true });
const expiredName = expiredDocument.fields.find((field) => field.fieldKey === "applicant.name");
assert.equal(expiredName?.value, "PERSON EXPIRY", "expired evidence remains retained");
assert.equal(expiredName?.uncertainty, "unclear", "expired identity documents must not auto-save");
assert.match(expiredName?.sourceRange ?? "", /identity_document_validity=expired/);
modelResponse = {
  documentType: "identity_residence_card",
  pages: [{ pageNumber: 1, lines: ["氏名 PERSON VALID", "生年月日 1990-04-12", "有効期限 2099年12月31日"] }],
  candidates: [
    { fieldKey: "applicant.name", value: "PERSON VALID", pageNumber: 1, sourceText: "氏名 PERSON VALID", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "本人" },
    { fieldKey: "applicant.birthDate", value: "1990-04-12", pageNumber: 1, sourceText: "生年月日 1990-04-12", uncertainty: "clear", subjectKey: "person-1", subjectLabel: "本人" },
  ],
};
const validDocument = await extractIdentityDocumentFromBuffer({ buffer: Buffer.from("%PDF-MODEL-VALID"), filename: "valid-residence-card.pdf", requireModel: true });
assert.equal(validDocument.fields.find((field) => field.fieldKey === "applicant.name")?.uncertainty, "clear", "future expiry remains eligible for the existing review pipeline");
const { entryFileKey, fillAutoSavedEntryForm, safeEntryPreviewCandidates, selectableEntryPreviewCandidates } = require(resolve(root, "src/lib/entry-preview.ts"));
const { buildEntryPreviewFormData } = require(resolve(root, "src/components/entry-preview.tsx"));
assert.equal(entryFileKey({ name: " e\u0301xample.pdf ", size: 42 }), entryFileKey({ name: "éxample.pdf", size: 42 }), "NFD and surrounding spaces must not bypass staging identity");
const normalizedStageForm = buildEntryPreviewFormData([new File([Buffer.alloc(42)], " e\u0301xample.pdf ", { type: "application/pdf" })], "customer", undefined, [{ id: "entry_stage_test", fileName: "éxample.pdf", fileSizeBytes: 42, sha256: "a".repeat(64) }]);
assert.equal(normalizedStageForm.getAll("uploadFile").length, 0, "NFD/trim-equivalent staged refs must remove raw preview upload");
assert.deepEqual(safeEntryPreviewCandidates([{ id: "address-placeholder", key: "currentAddress", sourceKey: "applicant.currentAddress", label: "现住址", value: "未定", fileName: "residence-card.jpg", uncertainty: "clear" }]), []);
const documentAddressCandidate = [{ id: "address-document", key: "currentAddress", sourceKey: "applicant.currentAddress", label: "现住址", value: "東京都テスト区1-2-3", fileName: "residence-card.jpg", pageEvidenceVerified: true, uncertainty: "clear", confidence: 0.99 }];
assert.deepEqual(safeEntryPreviewCandidates(documentAddressCandidate), [], "a non-placeholder document address must not auto-save");
assert.deepEqual(selectableEntryPreviewCandidates(documentAddressCandidate), [], "a document address must be confirmed from the persisted client review area");
assert.equal(isSafeModelAutoSave({ id: "field-address-document", tenantId: tenant.id, targetId: "target-address-review", fieldKey: "currentAddress", candidateValue: "東京都テスト区1-2-3", confidence: 0.99, provenance: { uncertainty: "clear" }, status: "draft" }), false, "queued model auto-save must never write a document address");
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
// Real queued-path regression: each standalone file has its own immutable
// target, but both point to one client. A succeeds first; B fails before read,
// is retried, then returns a complete different identity. B must remain review
// only and must not fill any complementary fields on A's client.
const queuedBatchClient = await data.addClient({ tenantId: tenant.id, ownerUserId: user.id, name: "Queue target original", phone: "090-0000-0099", budgetType: "total_price", purpose: "buy", loanPreApprovalStatus: "not_applied", stage: "lead", temperature: "cold", brokerageContractType: "none", amlCheckStatus: "not_required" });
const queuedBatchVersion = buildObjectVersionFingerprint(queuedBatchClient);
const queuedBatch = await queueIdentityImportSources({
  tenantId: tenant.id,
  userId: user.id,
  files: [
    new File([Buffer.from("%PDF-QUEUE-A")], "queue-a.pdf", { type: "application/pdf" }),
    new File([Buffer.from("%PDF-QUEUE-B")], "queue-b.pdf", { type: "application/pdf" }),
  ],
  uploadMode: "same_person",
  targetObjectType: "party",
  targetObjectId: queuedBatchClient.id,
  targetVersion: queuedBatchVersion,
});
assert.equal(queuedBatch.ok, true);
if (!queuedBatch.ok) throw new Error(queuedBatch.error);
assert.equal(queuedBatch.jobIds.length, 2, "standalone queued files must retain separate source jobs");
const [queuedJobA, queuedJobB] = queuedBatch.jobIds;
const queuedBAttachment = (await data.listAttachments({ tenantId: tenant.id, userId: user.id, targetType: "import_job", targetId: queuedJobB }))[0];
assert(queuedBAttachment);
const realReadPrivateAttachmentContent = data.readPrivateAttachmentContent;
let failQueuedBPreRead = true;
data.readPrivateAttachmentContent = async (input) => {
  if (failQueuedBPreRead && input.id === queuedBAttachment.id) {
    failQueuedBPreRead = false;
    return null;
  }
  return realReadPrivateAttachmentContent(input);
};
try {
  const processedA = await processIdentityImportJob({ tenantId: tenant.id, userId: user.id, jobId: queuedJobA });
  assert.equal(processedA.ok, true, "queued A must process successfully");
  const queuedATarget = await data.getObjectImportTargetByJob({ tenantId: tenant.id, userId: user.id, importJobId: queuedJobA });
  assert(queuedATarget);
  for (const fieldKey of ["name", "birthDate"]) {
    const queuedAFields = await data.listObjectImportCandidates({ tenantId: tenant.id, userId: user.id, targetId: queuedATarget.id });
    const candidate = queuedAFields.find((field) => field.fieldKey === fieldKey);
    assert(candidate?.candidateValue);
    const currentTarget = await data.getObjectImportTarget({ tenantId: tenant.id, userId: user.id, id: queuedATarget.id });
    assert(currentTarget);
    const accepted = await data.reviewObjectImportCandidate({ context, targetId: queuedATarget.id, fieldId: candidate.id, expectedVersion: currentTarget.targetVersion, expectedCandidateValue: candidate.candidateValue, decision: "confirm", value: candidate.candidateValue });
    assert.equal(accepted.ok, true, `queued A ${fieldKey} must be explicitly accepted before B is evaluated`);
  }
  const failedB = await processIdentityImportJob({ tenantId: tenant.id, userId: user.id, jobId: queuedJobB });
  assert.deepEqual(failedB, { ok: false, status: "failed", error: "source_attachment_missing" }, "queued B pre-read failure must be classified before model extraction");
  await data.retryImportJobExecution({ tenantId: tenant.id, userId: user.id, jobId: queuedJobB });
  const retriedB = await processIdentityImportJob({ tenantId: tenant.id, userId: user.id, jobId: queuedJobB });
  assert.equal(retriedB.ok, true, "queued B retry must reach review without failing the job");
} finally {
  data.readPrivateAttachmentContent = realReadPrivateAttachmentContent;
}
const queuedBatchReopened = await data.getClientById(queuedBatchClient.id, tenant.id);
assert.equal(queuedBatchReopened?.birthDate?.toISOString().slice(0, 10), "1990-04-12", "A's accepted birth date must remain on the client");
assert.equal(queuedBatchReopened?.name, "QUEUE PERSON A", "B's different name must not overwrite A's accepted client identity");
assert.equal(queuedBatchReopened?.nameLatin, undefined, "B's different identity must not fill a complementary name field");
const queuedBTarget = await data.getObjectImportTargetByJob({ tenantId: tenant.id, userId: user.id, importJobId: queuedJobB });
assert.equal(queuedBTarget?.status, "needs_review", "B's different identity must remain review-only");
// A first queued file after a direct save must still compare its complete
// identity pair to the existing client; sibling-count heuristics are not a
// sufficient identity boundary.
const directCreatedClient = await data.addClient({
  tenantId: tenant.id,
  ownerUserId: user.id,
  name: "DIRECT PERSON A",
  birthDate: new Date("1990-04-12T00:00:00Z"),
  phone: "090-0000-0088",
  budgetType: "total_price",
  purpose: "buy",
  loanPreApprovalStatus: "not_applied",
  stage: "lead",
  temperature: "cold",
  brokerageContractType: "none",
  amlCheckStatus: "not_required",
});
const directQueued = await queueIdentityImportSources({
  tenantId: tenant.id,
  userId: user.id,
  files: [new File([Buffer.from("%PDF-DIRECT-QUEUED-B")], "direct-queued-b.pdf", { type: "application/pdf" })],
  uploadMode: "same_person",
  targetObjectType: "party",
  targetObjectId: directCreatedClient.id,
  targetVersion: buildObjectVersionFingerprint(directCreatedClient),
});
assert.equal(directQueued.ok, true);
if (!directQueued.ok) throw new Error(directQueued.error);
const directQueuedResult = await processIdentityImportJob({ tenantId: tenant.id, userId: user.id, jobId: directQueued.jobIds[0] });
assert.equal(directQueuedResult.ok, true, "first queued file after direct creation must still be reviewable");
const directQueuedReopened = await data.getClientById(directCreatedClient.id, tenant.id);
assert.equal(directQueuedReopened?.name, "DIRECT PERSON A", "different first queued identity must not overwrite direct client name");
assert.equal(directQueuedReopened?.birthDate?.toISOString().slice(0, 10), "1990-04-12", "different first queued identity must not overwrite direct client birth date");
const directQueuedTarget = await data.getObjectImportTargetByJob({ tenantId: tenant.id, userId: user.id, importJobId: directQueued.jobIds[0] });
assert.equal(directQueuedTarget?.status, "needs_review", "different first queued identity must remain review-only");
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
