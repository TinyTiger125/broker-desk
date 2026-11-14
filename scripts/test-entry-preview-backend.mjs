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
const session = { tenant: { id: "tenant_test" }, user: { id: "user_test" } };
Module._load = function(request, parent, ...rest) {
  if (request === "@/lib/tenant-session") return { requireTenantSession: async (input) => { assert.equal(input.permission, "source.upload"); return session; } };
  if (request === "@/lib/locale") return { getLocale: async () => "zh" };
  if (request === "@/lib/data") return { addAuditLog: () => { throw new Error("preview must not persist"); } };
  if (request === "@/lib/identity-import-queue") return { MAX_IDENTITY_DOCUMENT_FILES: 6, getIdentityDocumentUploadLimitBytes: () => 10 * 1024 * 1024 };
  if (request === "@/lib/excel-import-queue") return { getExcelUploadLimitBytes: () => 10 * 1024 * 1024 };
  if (request === "@/lib/object-import-processor-adapter") return { normalizeObjectReaderCandidateValue: (_, value, uncertainty) => ({ value, uncertainty }) };
  if (request === "@/lib/openai-identity-reader") return { readIdentityDocumentWithOpenAi: async ({ filename, scope }) => {
    readerCalls += 1;
    assert.equal(scope, "customer");
    if (filename === "fail.pdf") throw new Error("synthetic_provider_failure");
    const shared = { value: "Synthetic Person", pageNumber: 1, sourceText: "Name: Synthetic Person", uncertainty: "clear", subjectKey: "holder", subjectLabel: "document holder" };
    if (filename === "unknown.pdf") return { documentType: "unknown_identity_scan", candidates: [{ ...shared, fieldKey: "applicant.name" }] };
    if (filename === "address-only.pdf") return { documentType: "identity_residence_card", candidates: [{ ...shared, fieldKey: "applicant.currentAddress", value: "Synthetic address", sourceText: "住所: Synthetic address" }] };
    if (filename === "direct-names.pdf") return { documentType: "identity_passport", candidates: [
      { ...shared, fieldKey: "applicant.nameLatin", value: "YAMADA SHIKEN", sourceText: "Name: YAMADA SHIKEN" },
      { ...shared, fieldKey: "applicant.nameKanji", value: "山田 試験", sourceText: "氏名: 山田 試験" },
    ] };
    if (filename === "direct-names-a.pdf" || filename === "direct-names-b.pdf") return { documentType: "identity_passport", candidates: [
      { ...shared, fieldKey: "applicant.nameLatin", value: filename === "direct-names-a.pdf" ? "YAMADA SHIKEN" : "OTHER PERSON", sourceText: `Name: ${filename === "direct-names-a.pdf" ? "YAMADA SHIKEN" : "OTHER PERSON"}` },
    ] };
    if (filename === "direct-names-safe.pdf") return { documentType: "identity_passport", candidates: [
      { ...shared, fieldKey: "applicant.nameKanji", value: "山田 試験", sourceText: "氏名: 山田 試験" },
    ] };
    return { documentType: "identity_passport", candidates: [{ ...shared, fieldKey: "applicant.name" }, { ...shared, fieldKey: "applicant.residenceCardNumber", value: "DO_NOT_MAP" }] };
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
const { fillSelectedEntryCandidateForm, hasClientNameEntryPreviewConflict, safeEntryPreviewCandidates, selectableEntryPreviewCandidates } = require(resolve(root, "src/lib/entry-preview.ts"));
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
const directNamesResult = await previewEntryDocumentsAction(request("customer", ["direct-names.pdf"]));
assert.deepEqual(directNamesResult.candidates.map((field) => field.key), ["nameLatin", "nameKanji"], "direct name evidence must map only to the matching visible fields");
assert.equal(directNamesResult.candidates.some((field) => field.key === "nameKatakana"), false, "Katakana must remain empty when the document does not print it");
const selectedForm = new FormData();
assert.equal(fillSelectedEntryCandidateForm(selectedForm, directNamesResult, directNamesResult.candidates[0]), true, "a clear candidate must be selectable");
assert.equal(selectedForm.get("nameLatin"), "YAMADA SHIKEN");
assert.match(String(selectedForm.get("entryPreviewDecisions")), /confirmed/);
assert.equal(safeEntryPreviewCandidates(directNamesResult.candidates).length, 2);
assert.equal(visibleClientNameFieldFromEvidence("name", "YAMADA SHIKEN"), "nameLatin");
assert.equal(visibleClientNameFieldFromEvidence("name", "山田 試験"), "nameKanji");
assert.equal(visibleClientNameFieldFromEvidence("name", "ヤマダ シケン"), "nameKatakana");
assert.equal(visibleClientNameFieldFromEvidence("name", "YAMADA 山田"), null, "mixed scripts must not be assigned to a representation field");
const conflictRequest = request("customer", ["direct-names-a.pdf", "direct-names-b.pdf", "direct-names-safe.pdf"]);
const conflictResult = await previewEntryDocumentsAction(conflictRequest);
assert.equal(conflictResult.candidates.length, 3);
assert.equal(conflictResult.candidates.filter((candidate) => candidate.key === "nameLatin").every((candidate) => candidate.uncertainty === "conflict"), true, "same-field alternatives must be marked as conflict");
assert.deepEqual(safeEntryPreviewCandidates(conflictResult.candidates).map((candidate) => candidate.key), ["nameKanji"], "an unrelated safe name field remains available but must not bypass a conflicting name");
assert.equal(selectableEntryPreviewCandidates(conflictResult.candidates).length, 3, "conflicting alternatives and the safe name field must remain explicitly selectable");
assert.equal(hasClientNameEntryPreviewConflict(conflictResult.candidates), true, "name conflicts must hold the preview open for explicit review");
const selectedConflict = conflictResult.candidates.find((candidate) => candidate.key === "nameLatin");
assert.ok(selectedConflict);
assert.equal(fillSelectedEntryCandidateForm(conflictRequest, conflictResult, selectedConflict), true, "one selected conflict candidate must be form-fillable");
assert.equal(conflictRequest.get("nameLatin"), selectedConflict.value);
assert.equal(conflictRequest.get("entryPreviewDecisions"), JSON.stringify({ [selectedConflict.id]: "confirmed" }));
const conflictProofs = await verifyEntryPreviewProofs({ formData: conflictRequest, files: conflictRequest.getAll("uploadFile"), session, kind: "customer", context: "entry" });
assert.equal(validateEntryPreviewDecisions(conflictRequest, conflictProofs), true, "server proof validation must accept the explicitly selected conflict candidate");
const tamperedConflict = new FormData();
for (const [key, value] of conflictRequest.entries()) tamperedConflict.append(key, value);
tamperedConflict.set("entryPreviewDecisions", JSON.stringify({ [selectedConflict.id]: "confirmed", [conflictResult.candidates[1].id]: "confirmed" }));
assert.equal(validateEntryPreviewDecisions(tamperedConflict, conflictProofs), false, "server proof validation must reject an unselected conflict candidate");
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
const beforeDuplicate = readerCalls;
const duplicate = await previewEntryDocumentsAction(request("customer", ["same.pdf", "same.pdf"]));
assert.equal(duplicate.status, "error");
assert.match(duplicate.message, /同名/);
assert.equal(readerCalls, beforeDuplicate, "duplicate identities must fail before any paid reader call");
console.log("preview backend: no-target read, field allowlist, attribution, source evidence, signed content proof, partial provider failure, duplicate-file guard: PASS");
