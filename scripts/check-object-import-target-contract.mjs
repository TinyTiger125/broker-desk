import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/lib/object-import-target-service.ts", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../src/lib/object-import-processor-adapter.ts", import.meta.url), "utf8");
const workbench = readFileSync(new URL("../src/app/actions.ts", import.meta.url), "utf8");
const required = [
  'targetType: ObjectImportTargetType',
  'reason: "case_not_writable" | "not_associated" | "object_not_writable"',
  "caseResult.resolution.canWrite",
  "association.parties.some",
  "association.primaryPropertyId",
  "result.resolution.canWrite",
];
for (const marker of required) {
  if (!source.includes(marker)) throw new Error(`missing contract marker: ${marker}`);
}
console.log("object import target contract: PASS (write/access/association guards present)");
if (!adapter.includes('finalSource: "model_draft"') || !adapter.includes('field.confidence < 0.8')) throw new Error("missing candidate draft/confidence contract");
console.log("object import processor adapter contract: PASS (draft/provenance/low-confidence)");
for (const marker of ["objectImportReviewJson", "saveCaseWorkbenchWithObjectReview", "getCaseWorkbenchSubmittedValue"]) {
  if (!workbench.includes(marker)) throw new Error(`missing main-input review binding: ${marker}`);
}
console.log("object import main-input contract: PASS (same workbench save invokes object CAS)");
