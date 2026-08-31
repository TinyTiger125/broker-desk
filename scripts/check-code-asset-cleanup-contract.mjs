import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const removedFiles = [
  "src/app/quotes/[id]/print/page.tsx",
  "src/app/templates/page 2.tsx",
  "src/lib/excel-workbook 2.ts",
  "src/components/case-progress-experience.tsx",
  "src/components/global-search-box.tsx",
  "src/components/kpi-card.tsx",
  "src/components/object-workbench-shell.tsx",
  "src/components/pdfme-official-template-designer.tsx",
  "src/components/print-toolbar.tsx",
  "src/components/ui-gov-003-preview/case-object-preview.tsx",
  "src/components/ui-gov-003-preview/case-object-preview.module.css",
];

for (const file of removedFiles) expect(!exists(file), `${file} must be removed`);

const outputCenter = read("src/app/output-center/page.tsx");
const actions = read("src/app/actions.ts");
expect(!outputCenter.includes("shouldShowLegacyOutputFlow"), "legacy output feature flag must be removed");
expect(!outputCenter.includes("generateOutputDocumentAction"), "retired generation Action must have no caller");
expect(!outputCenter.includes("/quotes/${previewQuoteId}/print"), "retired quote print route must have no caller");
expect(!outputCenter.includes('id="output-generate-form"'), "retired ordinary output form must be removed");
expect(!actions.includes("export async function generateOutputDocumentAction"), "retired generation Action must be removed");
expect(!actions.includes('/quotes/[id]/print'), "retired quote print route must not be revalidated");
expect(outputCenter.includes("GuaranteeTemplateSelector"), "supported guarantee output selector must remain");
expect(outputCenter.includes("selectedGuaranteePreviewHref"), "supported guarantee preview path must remain");
expect(outputCenter.includes("selectedGuaranteeDownloadHref"), "supported guarantee download path must remain");

if (failures.length > 0) {
  console.error(`Code asset cleanup contract failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log("Code asset cleanup contract passed.");
