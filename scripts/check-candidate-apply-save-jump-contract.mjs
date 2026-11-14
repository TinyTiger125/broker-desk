import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const overview = readFileSync("src/components/case-overview.tsx", "utf8");
const clientImport = readFileSync("src/components/client-identity-import-section.tsx", "utf8");
const propertyImport = readFileSync("src/components/property-object-import-section.tsx", "utf8");
const entryPreviewAction = readFileSync("src/app/entry-preview-actions.ts", "utf8");
const entryPreview = readFileSync("src/components/entry-preview.tsx", "utf8");
const entryPreviewLib = readFileSync("src/lib/entry-preview.ts", "utf8");
const clientForm = readFileSync("src/components/client-form.tsx", "utf8");
const entryAction = readFileSync("src/app/entry-actions.ts", "utf8");
const identityCatalog = readFileSync("src/lib/customer-identity-field-catalog.ts", "utf8");
const action = readFileSync("src/app/actions.ts", "utf8");

const summaryStart = overview.indexOf("export function CaseEvidenceSummary");
const summaryEnd = overview.indexOf("export function CaseEditPanel", summaryStart);
assert(summaryStart >= 0 && summaryEnd > summaryStart, "case evidence summary must remain a bounded component");
const summary = overview.slice(summaryStart, summaryEnd);

assert.match(summary, /name=\{`candidate:\$\{candidateFieldKey\}`\}/, "candidate selection must submit the matching candidate value");
assert.match(summary, /name="useCandidateField" value=\{candidateFieldKey\}/, "candidate selection must use the shared save action");
assert.match(summary, /hasConflictingCandidates/, "conflicting evidence must be detected before candidate save");
assert.match(summary, /!hasConflictingCandidates/, "conflicting candidates must not render an auto-save action");
assert.doesNotMatch(summary, /<input(?![^>]*type="hidden")/, "candidate evidence must remain read-only with no inline editor");
assert.match(entryPreviewAction, /toObjectRecordFieldKey\("property", field\.fieldKey\)/, "property preview must normalize both model and workbook field keys");
assert.doesNotMatch(entryPreviewAction, /field\.fieldKey\.startsWith\("property\."\)/, "property preview must not discard workbook property_name candidates before normalization");
assert.match(entryPreview, /onApplyCandidate\?:/, "entry preview must expose explicit candidate selection");
assert.match(entryPreview, /safeCandidateIds\.has\(candidate\.id\)/, "only safe candidates may become selectable values");
assert.match(entryPreview, /onApplyCandidate\(candidate, activePreview\)/, "selected candidates must send the current proof-backed preview to the form");
assert.doesNotMatch(entryPreview, /<input(?![^>]*type="hidden")/, "entry preview must not add inline candidate editing");
assert.match(entryPreviewLib, /fillSelectedEntryCandidateForm/, "selected candidate persistence must use a shared proof-backed form helper");
assert.match(entryPreviewLib, /entryPreviewDecisions.*confirmed/, "selected candidate persistence must retain explicit confirmation state");
assert.match(clientForm, /fillSelectedEntryCandidateForm\(data, preview, candidate\)/, "client form must persist the selected candidate immediately");
assert.match(clientForm, /startAutoSaving\(\(\) => formAction\(data\)\)/, "selected candidate save must use the existing action transition");
assert.match(clientForm, /candidate\.key === "name" \? "nameKanji"/, "legacy hidden name candidates must jump to a visible name field");
assert.match(entryAction, /decision !== "auto_saved" && decision !== "confirmed"/, "server must accept only proof-backed auto or explicit candidate decisions");
for (const field of ["nameLatin", "nameKanji", "nameKatakana"]) {
  assert.match(identityCatalog, new RegExp(`${field}:`), `customer identity catalog must retain ${field}`);
  assert.match(identityCatalog, new RegExp(`applicant\\.${field}.*${field}`), `${field} must map directly from its applicant evidence key`);
}

assert.match(action, /const useCandidateFieldKey = String\(formData\.get\("useCandidateField"\)/, "save action must read the selected candidate field");
assert.match(action, /formData\.get\(`candidate:\$\{fieldKey\}`\)/, "save action must read the selected candidate value");
assert.match(action, /if \(returnField\) redirectParams\.set\("field", returnField\)/, "save action must preserve the field jump target");
assert.match(action, /redirect\(`\/cases\/\$\{caseId\}\?\$\{redirectParams\.toString\(\)\}/, "candidate save must redirect back to the case workbench");

for (const [source, label] of [[clientImport, "client identity"], [propertyImport, "property object"]]) {
  assert.match(source, /reviewAction/, `${label} import review must expose its action`);
  assert.match(source, /name="decision" value="confirm"/, `${label} candidate confirmation must be explicit`);
  assert.match(source, /name="decision" value="reject"/, `${label} candidate rejection must be explicit`);
  assert.match(source, /expectedCandidateValue/, `${label} review must retain a compare-and-swap candidate value`);
  assert.doesNotMatch(source, /<input(?![^>]*type="hidden")/, `${label} review must not add inline candidate editing`);
}

console.log("candidate apply/save/jump contract: PASS");
