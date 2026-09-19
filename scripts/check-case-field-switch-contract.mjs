import { readFileSync } from "node:fs";

const pageSource = readFileSync("src/app/cases/[id]/page.tsx", "utf8");
const actionSource = readFileSync("src/app/actions.ts", "utf8");
const fieldFormSource = readFileSync("src/components/case-workbench-field-form.tsx", "utf8");
if (pageSource.includes('id="case-field-editor"')) throw new Error("the right-side case field editor must stay removed");
if (!pageSource.includes("<CaseWorkbenchFieldForm")) throw new Error("each visible field must own an inline save form");
if (!pageSource.includes("key={field.fieldKey}")) throw new Error("field rows must remount when the selected field changes");
if (!pageSource.includes("name={`field:${field.fieldKey}`}")) throw new Error("field rows must bind controls to their field key");
if (!pageSource.includes("action={saveCaseWorkbenchAction}")) throw new Error("field rows must keep the shared save action");
if (!pageSource.includes("initialValue={candidateValue}")) {
  throw new Error("an unconfirmed model candidate must prefill the main input and fall back to the saved value");
}
if (!pageSource.includes("value={candidateValue}")) {
  throw new Error("the visible main input must use the candidate-or-saved-value contract");
}
if (pageSource.includes("资料候补・判定") || pageSource.includes("<WorkbenchDecisionSelect")) {
  throw new Error("the field row must not render a second candidate decision panel");
}
if (!pageSource.includes("fieldNeedsAttention(field)")) {
  throw new Error("low-confidence and conflict fields must retain their inline state marker");
}

if (!pageSource.includes('fieldKey.endsWith(".email")')) {
  throw new Error("case email fields must retain the existing email input classification");
}
if (!pageSource.includes('fieldKey.endsWith(".phone")')) {
  throw new Error("case phone fields must retain the existing phone input classification");
}

if (!actionSource.includes("if (formData.has(submittedFieldName)) return String(formData.get(submittedFieldName) ?? \"\").trim();")) {
  throw new Error("an explicitly submitted empty field must remain empty instead of falling back to an old snapshot");
}
if (!actionSource.includes('flash", "case_required_field_missing"')) {
  throw new Error("required blank saves must redirect with an explicit validation flash");
}
if (!actionSource.includes("resolveCaseWorkbenchFieldRequirement(fieldKey, information.importance, ruleMap) !== \"required\"")) {
  throw new Error("required blank validation must use the existing field rules");
}
if (!fieldFormSource.includes('name="fieldValueSnapshot"')) {
  throw new Error("field snapshot must remain available only for a missing native control");
}

console.log("Case field switch contract passed");
