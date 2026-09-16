import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const page = fs.readFileSync(path.join(root, "src/app/cases/[id]/page.tsx"), "utf8");
const form = fs.readFileSync(path.join(root, "src/components/case-workbench-field-form.tsx"), "utf8");

if (page.includes('id="case-field-editor"')) throw new Error("inline field editing must remove the right-side editor");
if (!page.includes("<CaseWorkbenchFieldForm")) throw new Error("each field row must own a save form");
if (!page.includes("name={`field:${field.fieldKey}`}")) throw new Error("row input must bind to its fieldKey");
if (!page.includes('saveButtonAriaLabel={`${getShortWorkbenchFieldLabel(field)}を確認して保存`}')) throw new Error("row confirm action needs an explicit accessible save label");
if (!page.includes('saveButtonWrapperClassName="col-start-4 row-start-1')) throw new Error("row save action must stay in the operation column");
if (!page.includes("<WorkbenchDecisionSelect locale={locale} field={field} flush />")) throw new Error("secondary decision controls must remain available per row");
if (!form.includes("saveButtonAriaLabel")) throw new Error("field form must expose an accessible save label");
if (!form.includes('data-case-field-kind="tel"')) throw new Error("contact validation must remain in the shared form");
console.log("inline field editing contract: PASS (row-bound inputs, inline confirmation, secondary decisions, and contact validation preserved)");
