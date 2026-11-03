import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import typescript from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const Module = require("module");
const originalResolve = Module._resolveFilename;
const candidatePath = (value) => [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`].find((item) => existsSync(item) && statSync(item).isFile());
Module._resolveFilename = function(request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return candidatePath(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
require.extensions[".ts"] = (mod, filename) => mod._compile(typescript.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);

const { collectClientIdentityDraftSuggestions, filterClientIdentityDraftSuggestionsForPartyType, isEditableClientIdentityDraftControl } = require(resolve(root, "src/lib/customer-identity-draft.ts"));
const { fillEmptyEntryDraftSuggestions } = require(resolve(root, "src/lib/entry-preview.ts"));

const field = (fieldKey, candidateValue, overrides = {}) => ({
  id: `field-${fieldKey}-${candidateValue}`,
  tenantId: "tenant-test",
  targetId: "target-test",
  fieldKey,
  candidateValue,
  confidence: 0.74,
  provenance: { uncertainty: "unclear", sourceAttachmentId: "attachment-test", sourceFileHash: "hash-test", ...overrides.provenance },
  finalSource: "model_draft",
  status: "low_confidence",
  ...overrides,
});
const view = (fields, status = "needs_review", targetVersion = "profile-v1") => ({ target: { status, targetVersion }, fields });

const suggestions = collectClientIdentityDraftSuggestions([
  view([
    field("name", "Candidate Name"),
    field("birthDate", "平成2年1月2日", { provenance: { alternatives: [{ value: "1990-01-02" }] } }),
    field("gender", "男性"),
    field("currentAddress", "未定"),
    field("currentAddress", "Draft Address"),
    field("phone", "not a phone"),
    field("nationality", "unsupported"),
    field("birthDate", "not-a-date"),
    field("email", "invalid-email"),
    field("currentPostalCode", "123"),
    field("currentAddress", "Ambiguous Address", { provenance: { uncertainty: "unclear", alternatives: [{ value: "Other Address" }] } }),
  ]),
  view([field("currentAddress", "Another Address")]),
  view([field("name", "Candidate Name")]),
  view([field("name", "Ignored completed target")], "completed", "old-profile"),
], "profile-v1");
assert.deepEqual(suggestions, [
  { key: "name", value: "Candidate Name" },
  { key: "gender", value: "male" },
], "only unique, valid, low-confidence existing fields become drafts");
assert.deepEqual(
  collectClientIdentityDraftSuggestions([view([field("birthDate", "平成2年1月2日")])], "profile-v1"),
  [{ key: "birthDate", value: "1990-01-02" }],
  "valid Japanese era dates normalize to the existing date control",
);

assert.deepEqual(
  collectClientIdentityDraftSuggestions([view([field("name", "Old Candidate")], "needs_review", "old-profile")], "profile-v1"),
  [],
  "stale target fingerprints never project old candidates",
);
assert.deepEqual(
  collectClientIdentityDraftSuggestions([view([field("currentAddress", "One Address", { provenance: { alternatives: [{ value: "Other Address" }] } })])], "profile-v1"),
  [],
  "alternative conflicts block the field even when no second row survives grouping",
);
assert.deepEqual(
  collectClientIdentityDraftSuggestions([view([field("name", "Candidate A"), field("name", "Candidate B", { status: "draft", confidence: 0.95 })])], "profile-v1"),
  [],
  "clear or draft values block a different low-confidence value",
);
assert.deepEqual(
  collectClientIdentityDraftSuggestions([view([field("name", "Rejected A", { status: "rejected" })]), view([field("name", "New B")])], "profile-v1"),
  [{ key: "name", value: "New B" }],
  "a rejected old candidate does not block a later source",
);
assert.deepEqual(
  collectClientIdentityDraftSuggestions([view([field("birthDate", "not-a-date"), field("birthDate", "1990-01-02", { status: "draft", confidence: 0.95 })])], "profile-v1"),
  [],
  "an invalid value blocks a different value for the same field",
);
assert.deepEqual(
  collectClientIdentityDraftSuggestions([view([field("gender", "male"), field("gender", "female", { finalSource: "human" })])], "profile-v1"),
  [],
  "a saved human value blocks a different model value",
);
assert.deepEqual(
  collectClientIdentityDraftSuggestions([view([field("currentAddress", "未确认")])], "profile-v1"),
  [],
  "placeholder addresses are never draft suggestions",
);
assert.deepEqual(
  filterClientIdentityDraftSuggestionsForPartyType("corporate", suggestions),
  [],
  "switching an individual form to corporate blocks all personal identity drafts",
);
const forgedCorporateEventValues = { partyType: "corporate", name: "Existing Company", birthDate: "" };
assert.deepEqual(
  fillEmptyEntryDraftSuggestions(forgedCorporateEventValues, filterClientIdentityDraftSuggestionsForPartyType("corporate", [{ key: "birthDate", value: "1990-01-02" }])),
  forgedCorporateEventValues,
  "a forged apply event cannot write personal fields after the live subject becomes corporate",
);
assert.deepEqual(
  filterClientIdentityDraftSuggestionsForPartyType("individual", suggestions),
  suggestions,
  "ordinary individual forms retain identity drafts",
);
assert.equal(
  isEditableClientIdentityDraftControl({ value: "", type: "hidden" }),
  false,
  "hidden controls are never eligible for a draft event",
);
assert.equal(
  isEditableClientIdentityDraftControl({ value: "", type: "text", disabled: true }),
  false,
  "disabled controls are never eligible for a draft event",
);
assert.equal(
  isEditableClientIdentityDraftControl({ value: "", type: "text", readOnly: true }),
  false,
  "read-only controls are never eligible for a draft event",
);
assert.equal(
  isEditableClientIdentityDraftControl({ value: "", type: "text" }),
  true,
  "an enabled blank individual control remains eligible",
);

const seeded = fillEmptyEntryDraftSuggestions(
  { name: "", birthDate: "saved-date", gender: "", phone: "" },
  suggestions,
);
assert.deepEqual(seeded, { name: "Candidate Name", birthDate: "saved-date", gender: "male", phone: "" }, "blank fields receive drafts while saved values remain unchanged");
const clearedByUser = fillEmptyEntryDraftSuggestions({ name: "", birthDate: "", gender: "" }, []);
assert.deepEqual(clearedByUser, { name: "", birthDate: "", gender: "" }, "no candidates means no synthetic form edits");

const clientForm = readFileSync(resolve(root, "src/components/client-form.tsx"), "utf8");
assert.match(clientForm, /CLIENT_IDENTITY_DRAFT_APPLY_EVENT/);
assert.match(clientForm, /fillEmptyEntryDraftSuggestions\(current, safeSuggestions/);
assert.match(clientForm, /current\.partyType === "corporate"/);
assert.match(clientForm, /type=\"hidden\" value=\{values\[field\]\} disabled/);
assert.doesNotMatch(clientForm, /const initial = fillEmptyEntryDraftSuggestions/);
const applyButton = readFileSync(resolve(root, "src/components/client-identity-draft-apply-button.tsx"), "utf8");
for (const copy of ["空欄に候補を入力", "填入空白字段", "빈 필드에 후보 입력"]) assert.match(applyButton, new RegExp(copy));
assert.match(applyButton, /CLIENT_IDENTITY_DRAFT_APPLY_EVENT/);
assert.match(applyButton, /partyType/);
assert.match(applyButton, /disabled|readOnly/);
const actions = readFileSync(resolve(root, "src/app/actions.ts"), "utf8");
assert.match(actions, /withoutClientIndividualFields/);
assert.match(actions, /partyTypeRaw === "corporate"/);
assert.match(actions, /const effectivePartyType = partyTypeSubmitted \? \(partyTypeRaw \|\| undefined\) : existingProfile\.type/);
assert.match(actions, /const normalizedValues = effectivePartyType === "corporate" \? withoutClientIndividualFields\(parsed\.normalized\) : parsed\.normalized/);
const editPage = readFileSync(resolve(root, "src/app/clients/[id]/edit/page.tsx"), "utf8");
assert.match(editPage, /!canEdit \|\| profile\.type === "corporate"/);
assert.match(editPage, /collectClientIdentityDraftSuggestions\(identityViews, clientProfileVersion\)/);
assert.match(editPage, /ClientIdentityDraftApplyButton/);

console.log("client low-confidence draft suggestions: PASS");
