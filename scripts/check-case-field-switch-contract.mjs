import { readFileSync } from "node:fs";

const pageSource = readFileSync("src/app/cases/[id]/page.tsx", "utf8");
if (pageSource.includes('id="case-field-editor"')) throw new Error("the right-side case field editor must stay removed");
if (!pageSource.includes("<CaseWorkbenchFieldForm")) throw new Error("each visible field must own an inline save form");
if (!pageSource.includes("key={field.fieldKey}")) throw new Error("field rows must remount when the selected field changes");
if (!pageSource.includes("name={`field:${field.fieldKey}`}")) throw new Error("field rows must bind controls to their field key");
if (!pageSource.includes("action={saveCaseWorkbenchAction}")) throw new Error("field rows must keep the shared save action");
if (!pageSource.includes("initialValue={objectImportBinding?.candidateValue ?? field.value}")) {
  throw new Error("an unconfirmed model candidate must prefill the main input and fall back to the saved value");
}
if (!pageSource.includes("value={objectImportBinding?.candidateValue ?? field.value}")) {
  throw new Error("the visible main input must use the candidate-or-saved-value contract");
}
if (!pageSource.includes("<WorkbenchDecisionSelect locale={locale} field={field} flush />")) {
  throw new Error("low-confidence and conflict fields must retain an inline decision control");
}
if (!pageSource.includes("<CaseEvidenceSummary") || !pageSource.includes("field.evidenceItems")) {
  throw new Error("field evidence must remain visible beside the main input");
}

if (!pageSource.includes('fieldKey.endsWith(".email")')) {
  throw new Error("case email fields must retain the existing email input classification");
}
if (!pageSource.includes('fieldKey.endsWith(".phone")')) {
  throw new Error("case phone fields must retain the existing phone input classification");
}

console.log("Case field switch contract passed");
