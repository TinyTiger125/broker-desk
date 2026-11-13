import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const overview = readFileSync("src/components/case-overview.tsx", "utf8");
const clientImport = readFileSync("src/components/client-identity-import-section.tsx", "utf8");
const propertyImport = readFileSync("src/components/property-object-import-section.tsx", "utf8");
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
