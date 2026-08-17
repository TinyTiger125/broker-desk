#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const NodeModule = require("node:module");

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing required file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadTranspiledModule(filePath, stubs = {}) {
  const source = read(filePath);
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const moduleInstance = new NodeModule(filePath, null);
  moduleInstance.filename = filePath;
  moduleInstance.paths = NodeModule._nodeModulePaths(process.cwd());
  const originalLoad = NodeModule._load;
  NodeModule._load = function load(request, parent, isMain) {
    if (request in stubs) return stubs[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    moduleInstance._compile(javascript, filePath);
  } finally {
    NodeModule._load = originalLoad;
  }
  return moduleInstance.exports;
}

const review = read("src/components/input-extraction-review.tsx");
const page = read("src/app/import-center/page.tsx");
const materialization = loadTranspiledModule(path.resolve("src/lib/extraction-review-materialization.ts"));
const reviewModule = loadTranspiledModule(path.resolve("src/components/input-extraction-review.tsx"), {
  react: {
    useMemo: (factory) => factory(),
    useState: () => [undefined, () => undefined],
  },
  "react-dom": { useFormStatus: () => ({ pending: false }) },
  "react/jsx-runtime": { jsx: () => null, jsxs: () => null, Fragment: Symbol("Fragment") },
  "@/app/actions": { saveExtractionReviewAction: () => undefined },
  "@/lib/case-field-catalog": { getCaseFieldDefinition: () => undefined },
});

assert(review.includes("export function buildExtractionReviewDecisions"), "review decisions must have a pure payload builder");
assert(review.includes('isImplicitNormalField(field, explicitStatus) ? "accepted"'), "normal suggested values must be accepted only by the final payload builder");
assert(review.includes('status === "unknown"'), "unknown fields must remain in the exception state");
assert(review.includes("!hasReadableValue(field) || field.confidence < 0.65"), "empty and low-confidence suggested fields must remain exceptions");
assert(review.includes('reviewStatus === "edited" ? editedValues[fieldId]'), "edited fields must submit the corrected value");
assert(review.includes('<form action={saveExtractionReviewAction}'), "business materialization must remain behind the final review form");
assert(!review.includes("saveExtractionReviewAction("), "the review component must not invoke business materialization before submit");
assert(review.includes('status === "rejected"'), "rejected fields must be represented in the decision payload");
assert(review.includes("待处理"), "review UI must expose unresolved work");
assert(page.includes("flow?: string"), "wizard flow intent must be accepted as an explicit UI parameter");
assert(page.includes('wizardStep === "processing"'), "processing must be a distinct wizard state");
assert(page.includes('wizardStep === "failed"'), "failure must be a distinct wizard state");
assert(page.includes('wizardStep === "mapping"'), "mapping must be a distinct wizard state");
assert(page.includes('? "result"'), "result must be a distinct wizard state");
assert(page.includes('wizardStep === "select" && !flowIntent'), "initial screen must be path selection, not both upload panels");
assert(page.includes('flowIntent === "case" ?'), "case flow must control which upload controls are shown");
assert(page.includes('flowIntent === "ledger"'), "ledger flow must control which upload controls are shown");
assert(page.includes("isModernExcelImportJob"), "modern Excel jobs must recover through the xlsxJob path");
assert(page.includes("statusOnly"), "failed recovery must rehydrate the existing processor status without re-uploading");
assert(!page.includes("mappedJobCount + completedJobCount"), "default import center must not expose a jobs-wide percentage KPI");
assert(page.includes("skipped.length"), "result summaries must preserve partial or skipped outcomes");

const { buildExtractionReviewDecisions } = reviewModule;
const { materializeExtractionReviewValue } = materialization;
const fields = [
  { fieldKey: "normal", sourceCell: "A1", sourceSheet: "Sheet1", value: "", normalizedValue: "Readable", confidence: 0.95 },
  { fieldKey: "low", sourceCell: "A2", sourceSheet: "Sheet1", value: "Low", normalizedValue: "Low", confidence: 0.4 },
  { fieldKey: "empty", sourceCell: "A3", sourceSheet: "Sheet1", value: "", normalizedValue: "", confidence: 0.99 },
  { fieldKey: "unknown", sourceCell: "A4", sourceSheet: "Sheet1", value: "Hidden", normalizedValue: "Hidden", confidence: 0.99, reviewStatus: "unknown" },
  { fieldKey: "rejected", sourceCell: "A5", sourceSheet: "Sheet1", value: "Reject", normalizedValue: "Reject", confidence: 0.99, reviewStatus: "rejected" },
  { fieldKey: "edited", sourceCell: "A6", sourceSheet: "Sheet1", value: "Original", normalizedValue: "Original", confidence: 0.99 },
];
const fieldId = (field) => `${field.fieldKey}:${field.sourceCell}`;
const decisions = buildExtractionReviewDecisions(
  fields,
  { [fieldId(fields[5])]: "edited" },
  { [fieldId(fields[5])]: "Corrected" },
);
const decisionsById = new Map(decisions.map((decision) => [decision.fieldId, decision]));
assert(decisionsById.get(fieldId(fields[0])).reviewStatus === "accepted", "normal suggested should become accepted in final payload");
assert(decisionsById.get(fieldId(fields[1])).reviewStatus === "suggested", "low-confidence suggested must remain unresolved");
assert(decisionsById.get(fieldId(fields[2])).reviewStatus === "suggested", "empty suggested must remain unresolved");
assert(decisionsById.get(fieldId(fields[3])).reviewStatus === "unknown", "unknown must remain unknown");
assert(decisionsById.get(fieldId(fields[4])).reviewStatus === "rejected", "rejected must remain rejected");
assert(decisionsById.get(fieldId(fields[5])).editedValue === "Corrected", "edited must carry the corrected value");

const materialized = (field) => {
  const decision = decisionsById.get(fieldId(field));
  return materializeExtractionReviewValue({
    reviewStatus: decision.reviewStatus,
    editedValue: decision.editedValue,
    baseValue: field.normalizedValue || field.value,
  });
};
assert(materialized(fields[0]).shouldConfirm === true, "normal suggested should materialize only at final confirmation");
assert(materialized(fields[1]).shouldConfirm === false, "low-confidence suggested must not materialize");
assert(materialized(fields[2]).shouldConfirm === false, "empty values must not materialize");
assert(materialized(fields[3]).shouldConfirm === false, "unknown values must not materialize");
assert(materialized(fields[4]).shouldConfirm === false, "rejected values must not materialize");
assert(materialized(fields[5]).finalValue === "Corrected", "edited values must materialize the correction");
assert(page.includes("hasPendingExceptions"), "unresolved extraction exceptions must remain a distinct wizard state");
assert(review.includes("未读取、拒绝和仍待处理的信息不会写入"), "result copy must not claim unresolved fields were imported");
assert(page.includes("不能据此确认已写入或全部导入"), "completed alone must not be treated as a write confirmation");

console.log("[PASS] import review decision payload and wizard state contract");
