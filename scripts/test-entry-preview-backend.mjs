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
let readerCalls = 0;
const { RemoteDocumentReaderError } = require(resolve(root, "src/lib/identity-reader-contract.ts"));
const session = { tenant: { id: "tenant_test" }, user: { id: "user_test" } };
Module._load = function(request, parent, ...rest) {
  if (request === "@/lib/tenant-session") return { requireTenantSession: async (input) => { assert.equal(input.permission, "source.upload"); return session; } };
  if (request === "@/lib/locale") return { getLocale: async () => "zh" };
  if (request === "@/lib/data") return { addAuditLog: () => { throw new Error("preview must not persist"); } };
  if (request === "@/lib/identity-import-queue") return { MAX_IDENTITY_DOCUMENT_FILES: 6, getIdentityDocumentUploadLimitBytes: () => 10 * 1024 * 1024 };
  if (request === "@/lib/excel-import-queue") return { getExcelUploadLimitBytes: () => 10 * 1024 * 1024 };
  if (request === "@/lib/object-import-processor-adapter") return { normalizeObjectReaderCandidateValue: (_, value, uncertainty) => ({ value, uncertainty }) };
  if (request === "@/lib/openai-identity-reader") return { readIdentityDocumentWithOpenAi: async ({ filename, scope, customerMode }) => {
    readerCalls += 1;
    assert.equal(scope, "customer");
    assert.equal(customerMode, "direct", "normal direct preview must use the direct holder-name prompt contract");
    if (filename === "fail.pdf") throw new Error("synthetic_provider_failure");
    if (filename === "large-upload-fail.pdf") throw new RemoteDocumentReaderError("file_upload_failed", { status: 413 });
    const shared = { value: "Synthetic Person", pageNumber: 1, sourceText: "Name: Synthetic Person", uncertainty: "clear", subjectKey: "holder", subjectLabel: "document holder" };
    const page = (lines) => [{ pageNumber: 1, lines }];
    if (filename === "unknown.pdf") return { documentType: "unknown_identity_scan", pages: page(["Name: Synthetic Person"]), candidates: [{ ...shared, fieldKey: "applicant.name" }] };
    if (filename === "address-only.pdf") return { documentType: "identity_residence_card", pages: page(["住所: Synthetic address"]), candidates: [{ ...shared, fieldKey: "applicant.currentAddress", value: "Synthetic address", sourceText: "住所: Synthetic address" }] };
    if (filename === "direct-names.pdf") return { documentType: "identity_passport", candidates: [
      { ...shared, fieldKey: "applicant.nameLatin", value: "YAMADA SHIKEN", sourceText: "Name: YAMADA SHIKEN" },
      { ...shared, fieldKey: "applicant.nameKanji", value: "山田 試験", sourceText: "氏名: 山田 試験" },
    ], pages: page(["Name: YAMADA SHIKEN", "氏名: 山田 試験"]) };
    if (filename === "direct-comma-name.pdf") return { documentType: "identity_passport", candidates: [
      { ...shared, fieldKey: "applicant.nameLatin", value: "YAMADA, TARO", sourceText: "Name: YAMADA, TARO" },
    ], pages: page(["Name: YAMADA, TARO"]) };
    if (filename === "direct-unsupported-punctuation.pdf") return { documentType: "identity_passport", candidates: [
      { ...shared, fieldKey: "applicant.nameLatin", value: "YAMADA; TARO", sourceText: "Name: YAMADA; TARO" },
    ], pages: page(["Name: YAMADA; TARO"]) };
    if (filename === "direct-address.pdf") return { documentType: "identity_residence_card", pages: page(["Name: ADDRESS HOLDER", "Birth: 1990-04-12", "住所: 東京都テスト区1-2-3"]), candidates: [
      { ...shared, fieldKey: "applicant.name", value: "ADDRESS HOLDER", sourceText: "Name: ADDRESS HOLDER" },
      { ...shared, fieldKey: "applicant.birthDate", value: "1990-04-12", sourceText: "Birth: 1990-04-12" },
      { ...shared, fieldKey: "applicant.currentAddress", value: "東京都テスト区1-2-3", sourceText: "住所: 東京都テスト区1-2-3" },
    ] };
    if (filename === "expired.pdf") return { documentType: "identity_passport", pages: [{ pageNumber: 1, lines: ["氏名: EXPIRED PERSON", "DATE OF EXPIRY 2020-01-01"] }], candidates: [
      { ...shared, fieldKey: "applicant.name", value: "EXPIRED PERSON", sourceText: "氏名: EXPIRED PERSON" },
    ] };
    if (filename === "direct-names-a.pdf" || filename === "direct-names-b.pdf") return { documentType: "identity_passport", pages: page([`Name: ${filename === "direct-names-a.pdf" ? "YAMADA SHIKEN" : "OTHER PERSON"}`]), candidates: [
      { ...shared, fieldKey: "applicant.nameLatin", value: filename === "direct-names-a.pdf" ? "YAMADA SHIKEN" : "OTHER PERSON", sourceText: `Name: ${filename === "direct-names-a.pdf" ? "YAMADA SHIKEN" : "OTHER PERSON"}` },
    ] };
    if (filename === "direct-names-safe.pdf") return { documentType: "identity_passport", pages: page(["氏名: 山田 試験"]), candidates: [
      { ...shared, fieldKey: "applicant.nameKanji", value: "山田 試験", sourceText: "氏名: 山田 試験" },
    ] };
    if (filename === "partial-person-a.pdf") return { documentType: "identity_passport", pages: page(["Name: PERSON A"]), candidates: [
      { ...shared, fieldKey: "applicant.name", value: "PERSON A", sourceText: "Name: PERSON A" },
    ] };
    if (filename === "partial-person-b.pdf") return { documentType: "identity_passport", pages: page(["Name: PERSON B"]), candidates: [
      { ...shared, fieldKey: "applicant.name", value: "PERSON B", sourceText: "Name: PERSON B" },
    ] };
    if (filename === "same-dob-a.pdf" || filename === "same-dob-b.pdf") return { documentType: "identity_passport", pages: page([`Name: ${filename === "same-dob-a.pdf" ? "PERSON A" : "PERSON B"}`, "Birth: 1990-04-12"]), candidates: [
      { ...shared, fieldKey: "applicant.nameLatin", value: filename === "same-dob-a.pdf" ? "PERSON A" : "PERSON B", sourceText: `Name: ${filename === "same-dob-a.pdf" ? "PERSON A" : "PERSON B"}` },
      { ...shared, fieldKey: "applicant.birthDate", value: "1990-04-12", sourceText: "Birth: 1990-04-12" },
    ] };
    if (filename === "same-name-a.pdf" || filename === "same-name-b.pdf") return { documentType: "identity_passport", pages: page(["Name: SAME PERSON", `Birth: ${filename === "same-name-a.pdf" ? "1990-04-12" : "1980-01-01"}`]), candidates: [
      { ...shared, fieldKey: "applicant.nameLatin", value: "SAME PERSON", sourceText: "Name: SAME PERSON" },
      { ...shared, fieldKey: "applicant.birthDate", value: filename === "same-name-a.pdf" ? "1990-04-12" : "1980-01-01", sourceText: `Birth: ${filename === "same-name-a.pdf" ? "1990-04-12" : "1980-01-01"}` },
    ] };
    if (filename === "same-identity-a.pdf" || filename === "same-identity-b.pdf") return { documentType: "identity_passport", pages: page(["Name: SAME PERSON", "Birth: 1990-04-12"]), candidates: [
      { ...shared, fieldKey: "applicant.nameLatin", value: "SAME PERSON", sourceText: "Name: SAME PERSON" },
      { ...shared, fieldKey: "applicant.birthDate", value: "1990-04-12", sourceText: "Birth: 1990-04-12" },
    ] };
    if (filename === "wrong-script.pdf") return { documentType: "identity_passport", pages: page(["Name: YAMADA SHIKEN"]), candidates: [
      { ...shared, fieldKey: "applicant.nameKatakana", value: "YAMADA SHIKEN", sourceText: "Name: YAMADA SHIKEN" },
    ] };
    if (filename === "missing-name-evidence.pdf") return { documentType: "identity_passport", pages: page(["氏名: 別の文字列"]), candidates: [
      { ...shared, fieldKey: "applicant.nameKanji", value: "山田 試験", sourceText: "氏名: 別の文字列" },
    ] };
    if (filename === "empty-page-evidence.pdf") return { documentType: "identity_passport", pages: page([]), candidates: [
      { ...shared, fieldKey: "applicant.name", value: "EMPTY PAGE PERSON", sourceText: "氏名: EMPTY PAGE PERSON" },
    ] };
    if (filename === "gender-only.pdf") return { documentType: "identity_passport", pages: page(["性別: M"]), candidates: [
      { ...shared, fieldKey: "applicant.gender", value: "M", sourceText: "性別: M" },
    ] };
    if (filename === "unclear-name.pdf") return { documentType: "identity_passport", pages: page(["Name: UNCLEAR PERSON"]), candidates: [
      { ...shared, fieldKey: "applicant.name", value: "UNCLEAR PERSON", sourceText: "Name: UNCLEAR PERSON", uncertainty: "unclear" },
    ] };
    if (filename === "guarantor-name.pdf") return { documentType: "identity_passport", pages: page(["Name: GUARANTOR PERSON"]), candidates: [
      { ...shared, fieldKey: "applicant.name", value: "GUARANTOR PERSON", sourceText: "Name: GUARANTOR PERSON", subjectLabel: "保証人" },
    ] };
    if (filename === "name-not-on-page.pdf") return { documentType: "identity_passport", pages: page(["Name: DIFFERENT PRINTED PERSON"]), candidates: [
      { ...shared, fieldKey: "applicant.name", value: "NOT PRINTED PERSON", sourceText: "Name: NOT PRINTED PERSON" },
    ] };
    return { documentType: "identity_passport", pages: page(["Name: Synthetic Person"]), candidates: [{ ...shared, fieldKey: "applicant.name" }, { ...shared, fieldKey: "applicant.residenceCardNumber", value: "DO_NOT_MAP" }] };
  } };
  if (request === "@/lib/openai-object-reader") return { readObjectDocumentWithOpenAi: async () => {
    readerCalls += 1;
    const shared = { value: "Example", pageNumber: 2, sourceText: "Property: Example", uncertainty: "clear", subjectKey: "one", subjectLabel: "property" };
    return { candidates: [{ ...shared, fieldKey: "property.name" }, { ...shared, fieldKey: "property.listingPrice", value: "750-800 JPY" }, { ...shared, fieldKey: "lease.rent", value: "50000" }] };
  } };
  return originalLoad.call(this, request, parent, ...rest);
};
const { previewEntryDocumentsAction } = require(resolve(root, "src/app/entry-preview-actions.ts"));
const { verifyEntryPreviewProofs } = require(resolve(root, "src/lib/entry-preview-proof.ts"));
const { fillAutoSavedEntryForm, fillSelectedEntryCandidateForm, hasClientNameEntryPreviewConflict, requiresCrossFileIdentityReview, safeEntryPreviewCandidates, selectableEntryPreviewCandidates } = require(resolve(root, "src/lib/entry-preview.ts"));
const { validateEntryPreviewDecisions } = require(resolve(root, "src/lib/entry-preview-proof.ts"));
const { visibleClientNameFieldFromEvidence } = require(resolve(root, "src/lib/client-name-representation.ts"));
function request(kind, names = ["source.pdf"]) {
  const fd = new FormData(); fd.set("previewKind", kind);
  for (const name of names) fd.append("uploadFile", new File(["%PDF-synthetic"], name, { type: "application/pdf" }));
  return fd;
}
const person = request("customer");
const customerResult = await previewEntryDocumentsAction(person);
assert.equal(customerResult.status, "ready");
assert.deepEqual(customerResult.candidates.map((field) => field.key), ["name"], "customer preview must exclude document-only fields");
assert.equal(customerResult.candidates[0].pageNumber, 1);
assert.equal(customerResult.candidates[0].sourceText, "Name: Synthetic Person");
const legacyLatinForm = new FormData();
assert.equal(fillAutoSavedEntryForm(legacyLatinForm, customerResult), 1);
assert.equal(legacyLatinForm.get("nameLatin"), "Synthetic Person", "a legacy Latin name with exact printed evidence must fill nameLatin without transliteration");
const directNamesResult = await previewEntryDocumentsAction(request("customer", ["direct-names.pdf"]));
assert.deepEqual(directNamesResult.candidates.map((field) => field.key), ["nameLatin", "nameKanji"], "direct name evidence must map only to the matching visible fields");
assert.equal(directNamesResult.candidates.some((field) => field.key === "nameKatakana"), false, "Katakana must remain empty when the document does not print it");
const representationOnlyForm = new FormData();
assert.equal(fillAutoSavedEntryForm(representationOnlyForm, directNamesResult), 2, "clear exact-script name candidates must remain auto-saveable");
assert.equal(representationOnlyForm.get("nameKanji"), "山田 試験");
assert.equal(representationOnlyForm.get("name"), "山田 試験", "compatibility name must derive from exact printed representation");
const selectedForm = new FormData();
assert.equal(fillSelectedEntryCandidateForm(selectedForm, directNamesResult, directNamesResult.candidates[0]), true, "a clear candidate must be selectable");
assert.equal(selectedForm.get("nameLatin"), "YAMADA SHIKEN");
assert.match(String(selectedForm.get("entryPreviewDecisions")), /confirmed/);
assert.equal(safeEntryPreviewCandidates(directNamesResult.candidates).length, 2);
const directCommaNameRequest = request("customer", ["direct-comma-name.pdf"]);
const directCommaNameResult = await previewEntryDocumentsAction(directCommaNameRequest);
assert.equal(directCommaNameResult.candidates.length, 1);
assert.equal(directCommaNameResult.candidates[0].value, "YAMADA, TARO", "direct preview must preserve the exact comma-separated Latin value");
assert.equal(directCommaNameResult.candidates[0].confidence, undefined, "direct preview regression keeps the model's absent confidence distinct from proof evidence");
assert.equal(directCommaNameResult.candidates[0].uncertainty, "clear", "an exact comma-separated Latin value with page evidence must remain clear");
assert.equal(directCommaNameResult.candidates[0].pageEvidenceVerified, true, "the complete comma-separated source quote must retain page evidence");
assert.deepEqual(safeEntryPreviewCandidates(directCommaNameResult.candidates).map((candidate) => candidate.value), ["YAMADA, TARO"]);
const directCommaNameForm = new FormData();
assert.equal(fillAutoSavedEntryForm(directCommaNameForm, directCommaNameResult), 1, "a direct comma-separated Latin name may pass the existing exact-evidence preview gate");
assert.equal(directCommaNameForm.get("nameLatin"), "YAMADA, TARO", "direct preview auto-save must write the normalized visible Latin field");
assert.equal(directCommaNameForm.get("name"), "YAMADA, TARO", "legacy compatibility name must preserve the selected Latin value");
const directCommaNameProofs = await verifyEntryPreviewProofs({ formData: directCommaNameForm, files: directCommaNameRequest.getAll("uploadFile").filter((file) => file instanceof File), session, kind: "customer", context: "entry" });
assert.equal(validateEntryPreviewDecisions(directCommaNameForm, directCommaNameProofs), true, "the signed direct preview proof must accept the exact comma-separated value through the existing decision gate");
const directUnsupportedPunctuationResult = await previewEntryDocumentsAction(request("customer", ["direct-unsupported-punctuation.pdf"]));
assert.equal(directUnsupportedPunctuationResult.candidates[0].uncertainty, "unclear", "direct preview must downgrade unsupported Latin punctuation even when the quote is present on the page");
assert.deepEqual(safeEntryPreviewCandidates(directUnsupportedPunctuationResult.candidates), [], "unsupported Latin punctuation must never enter the direct auto-save set");
const directAddressResult = await previewEntryDocumentsAction(request("customer", ["direct-address.pdf"]));
assert.equal(directAddressResult.candidates.some((candidate) => candidate.key === "currentAddress"), true, "document address remains visible as a candidate");
assert.equal(safeEntryPreviewCandidates(directAddressResult.candidates).some((candidate) => candidate.key === "currentAddress"), false, "document address must never auto-save into a new client");
assert.equal(selectableEntryPreviewCandidates(directAddressResult.candidates).some((candidate) => candidate.key === "currentAddress"), false, "document address is reviewed after the client is created");
const directAddressForm = new FormData();
assert.equal(fillAutoSavedEntryForm(directAddressForm, directAddressResult), 2, "identity anchors remain auto-saveable while address stays review-only");
assert.equal(directAddressForm.get("currentAddress"), null);
assert.equal(visibleClientNameFieldFromEvidence("name", "YAMADA SHIKEN"), "nameLatin");
assert.equal(visibleClientNameFieldFromEvidence("name", "YAMADA，TARO"), "nameLatin", "fullwidth comma must normalize to the visible Latin field");
assert.equal(visibleClientNameFieldFromEvidence("name", "YAMADA; TARO"), null, "unsupported punctuation must not be mapped to a visible Latin field");
assert.equal(visibleClientNameFieldFromEvidence("name", "山田 試験"), "nameKanji");
assert.equal(visibleClientNameFieldFromEvidence("name", "ヤマダ シケン"), "nameKatakana");
assert.equal(visibleClientNameFieldFromEvidence("name", "YAMADA 山田"), null, "mixed scripts must not be assigned to a representation field");
const conflictRequest = request("customer", ["direct-names-a.pdf", "direct-names-b.pdf", "direct-names-safe.pdf"]);
const conflictResult = await previewEntryDocumentsAction(conflictRequest);
assert.equal(conflictResult.candidates.length, 3);
assert.equal(conflictResult.candidates.filter((candidate) => candidate.key === "nameLatin").every((candidate) => candidate.uncertainty === "conflict"), true, "same-field alternatives must be marked as conflict");
assert.deepEqual(safeEntryPreviewCandidates(conflictResult.candidates), [], "a multi-file batch without a shared identity anchor must not auto-save any complementary field");
assert.deepEqual(selectableEntryPreviewCandidates(conflictResult.candidates), [], "a multi-file batch without a shared identity anchor must remain review-only");
assert.equal(hasClientNameEntryPreviewConflict(conflictResult.candidates), true, "name conflicts must hold the preview open for explicit review");
const selectedConflict = conflictResult.candidates.find((candidate) => candidate.key === "nameLatin");
assert.ok(selectedConflict);
assert.equal(fillSelectedEntryCandidateForm(conflictRequest, conflictResult, selectedConflict), false, "cross-file identity uncertainty must not expose a direct confirmation action");
assert.equal(conflictRequest.get("nameLatin"), null);
conflictRequest.set("entryPreviewDecisions", JSON.stringify({ [selectedConflict.id]: "confirmed" }));
conflictRequest.set("entryAutoSave", "1");
const conflictProofs = await verifyEntryPreviewProofs({ formData: conflictRequest, files: conflictRequest.getAll("uploadFile"), session, kind: "customer", context: "entry" });
assert.equal(validateEntryPreviewDecisions(conflictRequest, conflictProofs), false, "server proof validation must reject cross-file identity decisions");
const tamperedConflict = new FormData();
for (const [key, value] of conflictRequest.entries()) tamperedConflict.append(key, value);
tamperedConflict.set("entryPreviewDecisions", JSON.stringify({ [selectedConflict.id]: "confirmed", [conflictResult.candidates[1].id]: "confirmed" }));
assert.equal(validateEntryPreviewDecisions(tamperedConflict, conflictProofs), false, "server proof validation must reject an unselected conflict candidate");
const partialDifferentPeople = await previewEntryDocumentsAction(request("customer", ["partial-person-a.pdf", "partial-person-b.pdf"]));
assert.equal(partialDifferentPeople.status, "ready");
assert.equal(partialDifferentPeople.candidates.length, 2);
assert.equal(requiresCrossFileIdentityReview(partialDifferentPeople.candidates), true, "cross-file batches without a shared identity anchor must remain review-only");
assert.equal(safeEntryPreviewCandidates(partialDifferentPeople.candidates).length, 0);
assert.equal(selectableEntryPreviewCandidates(partialDifferentPeople.candidates).length, 0);
const sameBirthDifferentNames = await previewEntryDocumentsAction(request("customer", ["same-dob-a.pdf", "same-dob-b.pdf"]));
assert.equal(requiresCrossFileIdentityReview(sameBirthDifferentNames.candidates), true, "a shared birth date without a shared name must not permit complementary-field merging");
assert.deepEqual(safeEntryPreviewCandidates(sameBirthDifferentNames.candidates), []);
const sameNameDifferentBirthDates = await previewEntryDocumentsAction(request("customer", ["same-name-a.pdf", "same-name-b.pdf"]));
assert.equal(requiresCrossFileIdentityReview(sameNameDifferentBirthDates.candidates), true, "a shared name without a shared birth date must not permit complementary-field merging");
assert.deepEqual(safeEntryPreviewCandidates(sameNameDifferentBirthDates.candidates), []);
const sameIdentity = await previewEntryDocumentsAction(request("customer", ["same-identity-a.pdf", "same-identity-b.pdf"]));
assert.equal(requiresCrossFileIdentityReview(sameIdentity.candidates), false, "matching name and birth date anchors may proceed to ordinary duplicate-value handling");
assert.equal(safeEntryPreviewCandidates(sameIdentity.candidates).length, 4);
const wrongScript = await previewEntryDocumentsAction(request("customer", ["wrong-script.pdf"]));
assert.equal(wrongScript.candidates[0].uncertainty, "unclear", "a Latin value labelled Katakana must remain review-only");
assert.deepEqual(safeEntryPreviewCandidates(wrongScript.candidates), []);
assert.deepEqual(selectableEntryPreviewCandidates(wrongScript.candidates), []);
assert.equal(fillSelectedEntryCandidateForm(new FormData(), wrongScript, wrongScript.candidates[0]), false, "invalid script must not expose a confirmation action");
const missingNameEvidence = await previewEntryDocumentsAction(request("customer", ["missing-name-evidence.pdf"]));
assert.deepEqual(missingNameEvidence.candidates, [], "a name without matching printed evidence must not create a direct customer");
const emptyPageEvidence = await previewEntryDocumentsAction(request("customer", ["empty-page-evidence.pdf"]));
assert.deepEqual(emptyPageEvidence.candidates, [], "a name whose referenced page has no lines must not create a direct customer");
const genderOnly = await previewEntryDocumentsAction(request("customer", ["gender-only.pdf"]));
assert.equal(genderOnly.status, "ready");
assert.deepEqual(genderOnly.candidates, [], "gender-only evidence must never create a direct customer");
const unclearName = await previewEntryDocumentsAction(request("customer", ["unclear-name.pdf"]));
assert.equal(unclearName.status, "ready");
assert.deepEqual(unclearName.candidates, [], "unclear names must not create a direct customer");
const guarantorName = await previewEntryDocumentsAction(request("customer", ["guarantor-name.pdf"]));
assert.equal(guarantorName.status, "ready");
assert.deepEqual(guarantorName.candidates, [], "guarantor names must not become holder identity anchors");
const nameNotOnPage = await previewEntryDocumentsAction(request("customer", ["name-not-on-page.pdf"]));
assert.equal(nameNotOnPage.status, "ready");
assert.deepEqual(nameNotOnPage.candidates, [], "name values without matching page evidence must not create a direct customer");
const expiredResult = await previewEntryDocumentsAction(request("customer", ["expired.pdf"]));
assert.equal(expiredResult.candidates[0].reviewOnly, true, "expired direct-entry evidence must remain review-only");
assert.equal(safeEntryPreviewCandidates(expiredResult.candidates).length, 0);
assert.match(expiredResult.message ?? "", /有効期限|过期|유효기간/);
const unknownDocumentResult = await previewEntryDocumentsAction(request("customer", ["unknown.pdf"]));
assert.equal(unknownDocumentResult.status, "ready");
assert.equal(unknownDocumentResult.candidates.length, 0, "unsupported identity type must remain source-only in customer preview");
assert.match(unknownDocumentResult.message, /没有可确认|手动填写/);
const addressOnlyResult = await previewEntryDocumentsAction(request("customer", ["address-only.pdf"]));
assert.equal(addressOnlyResult.status, "ready");
assert.equal(addressOnlyResult.candidates.length, 0, "address-only identity output must fail closed without a holder anchor");
assert.match(addressOnlyResult.message, /没有可确认|手动填写/);
person.set("entryReadProofs", JSON.stringify(customerResult.readProofs));
person.set("entryReadFileKeys", JSON.stringify(customerResult.readFileKeys));
assert.equal((await verifyEntryPreviewProofs({ formData: person, files: person.getAll("uploadFile"), session, kind: "customer", context: "entry" })).size, 1);
const propertyResult = await previewEntryDocumentsAction(request("property"));
assert.deepEqual(propertyResult.candidates.map((field) => field.key), ["name"], "standalone property preview must exclude lease fields and numeric candidates that cannot fill the form");
const partial = await previewEntryDocumentsAction(request("customer", ["good.pdf", "fail.pdf"]));
assert.equal(partial.status, "error");
assert.equal(partial.candidates.length, 1);
assert.deepEqual(partial.readFileKeys, ["good.pdf:14"]);
const largeUploadFailure = await previewEntryDocumentsAction(request("customer", ["large-upload-fail.pdf"]));
assert.equal(largeUploadFailure.status, "error");
assert.equal(largeUploadFailure.errorCode, "remote_document_reader_file_upload_failed");
assert.match(largeUploadFailure.message, /临时读取服务/);
const beforeDuplicate = readerCalls;
const duplicate = await previewEntryDocumentsAction(request("customer", ["same.pdf", "same.pdf"]));
assert.equal(duplicate.status, "error");
assert.match(duplicate.message, /同名/);
assert.equal(readerCalls, beforeDuplicate, "duplicate identities must fail before any paid reader call");
console.log("preview backend: no-target read, field allowlist, attribution, source evidence, signed content proof, partial provider failure, duplicate-file guard: PASS");
