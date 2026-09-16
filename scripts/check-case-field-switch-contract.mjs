import { readFileSync } from "node:fs";

const pageSource = readFileSync("src/app/cases/[id]/page.tsx", "utf8");
const editorStart = pageSource.indexOf('<aside id="case-field-editor"');
if (editorStart < 0) throw new Error("case field editor must remain present");

const editorSource = pageSource.slice(editorStart, editorStart + 7000);
if (!editorSource.includes("key={selectedWorkbenchField.fieldKey}")) {
  throw new Error("selected case field editor must remount when the selected field changes");
}
if (!editorSource.includes("field:${selectedWorkbenchField.fieldKey}")) {
  throw new Error("selected case field editor must keep the selected field form name contract");
}
if (!editorSource.includes("action={saveCaseWorkbenchAction}")) {
  throw new Error("selected case field editor must keep the existing save action");
}

if (!pageSource.includes('fieldKey.endsWith(".email")')) {
  throw new Error("case email fields must retain the existing email input classification");
}
if (!pageSource.includes('fieldKey.endsWith(".phone")')) {
  throw new Error("case phone fields must retain the existing phone input classification");
}

console.log("Case field switch contract passed");
