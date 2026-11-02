import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;
const resolveCandidate = (value) => {
  if (!value || (!value.startsWith("/") && !value.startsWith("."))) return undefined;
  return [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
};
Module._resolveFilename = function(request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
require.extensions[".ts"] = (module, filename) => {
  const result = typescript.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};

const {
  CASE_WORKFLOW_TYPE_VALUES,
  CASE_LEGACY_WORKFLOW_TYPE_VALUES,
  getCaseWorkflowTypeFamily,
  getCaseWorkflowTypeGroups,
  getCaseWorkflowTypeLabel,
  isCaseWorkflowType,
} = require(resolve(root, "src/lib/options.ts"));
const { resolveCaseApplicabilityConditions } = require(resolve(root, "src/lib/case-field-applicability.ts"));

const detailedTypes = [
  "rental_new_application",
  "rental_listing_ad",
  "rental_lease_contract",
  "sale_listing_request",
  "sale_purchase_offer",
  "sale_contract",
  "management_new_contract",
  "management_periodic_report",
  "management_ad_hoc_report",
  "general_estimate",
  "general_proposal",
];
assert.deepEqual(CASE_WORKFLOW_TYPE_VALUES.slice(0, detailedTypes.length), detailedTypes, "the first options are the 11 approved detailed case types");
for (const type of detailedTypes) assert.equal(isCaseWorkflowType(type), true, `${type} is server-allowed`);
for (const legacy of CASE_LEGACY_WORKFLOW_TYPE_VALUES) {
  assert.equal(isCaseWorkflowType(legacy), true, `${legacy} remains accepted for old records and links`);
}
assert.equal(isCaseWorkflowType("not_a_case_type"), false, "unrecognized values are rejected");

const groups = getCaseWorkflowTypeGroups("ja");
assert.deepEqual(groups.map((group) => group.id), ["rental", "sale", "management", "general"], "new-case UI exposes exactly four PDF groups");
assert.deepEqual(groups.map((group) => group.options.map((option) => option.value)), [
  detailedTypes.slice(0, 3), detailedTypes.slice(3, 6), detailedTypes.slice(6, 9), detailedTypes.slice(9),
], "new-case UI exposes exactly the 11 detailed PDF types");
for (const locale of ["ja", "zh", "ko"]) {
  const localizedGroups = getCaseWorkflowTypeGroups(locale);
  assert.equal(localizedGroups.flatMap((group) => group.options).length, detailedTypes.length, `${locale} visibly labels only the 11 detailed types`);
  for (const type of detailedTypes) assert.notEqual(getCaseWorkflowTypeLabel(locale, type), "未分類", `${locale} labels ${type}`);
  for (const type of CASE_LEGACY_WORKFLOW_TYPE_VALUES) assert.notEqual(getCaseWorkflowTypeLabel(locale, type), "未分類", `${locale} preserves detail label for ${type}`);
}

for (const type of ["rental_new_application", "rental_listing_ad", "rental_lease_contract"]) {
  assert.equal(getCaseWorkflowTypeFamily(type), "rental");
  assert.equal(resolveCaseApplicabilityConditions({ confirmedData: { __workflowType: type } }).employment_required.choice, "included", `${type} keeps lease applicability`);
}
for (const type of ["sale_listing_request", "sale_purchase_offer", "sale_contract", "management_new_contract", "management_periodic_report", "management_ad_hoc_report", "general_estimate", "general_proposal"]) {
  assert.notEqual(getCaseWorkflowTypeFamily(type), "legacy");
  assert.equal(resolveCaseApplicabilityConditions({ confirmedData: { __workflowType: type } }).employment_required.choice, "excluded", `${type} does not inherit a rental workflow`);
}
assert.equal(resolveCaseApplicabilityConditions({ confirmedData: { __workflowType: "rental_application" } }).employment_required.choice, "included", "legacy rental behavior remains unchanged");

const newCasePage = readFileSync(resolve(root, "src/app/cases/new/page.tsx"), "utf8");
const draft = readFileSync(resolve(root, "src/components/case-association-draft.tsx"), "utf8");
const uploadAction = readFileSync(resolve(root, "src/app/case-entry-actions.ts"), "utf8");
const blankAction = readFileSync(resolve(root, "src/app/actions.ts"), "utf8");
const detail = readFileSync(resolve(root, "src/app/cases/[id]/page.tsx"), "utf8");
const overview = readFileSync(resolve(root, "src/components/case-overview.tsx"), "utf8");
assert.match(newCasePage, /getCaseWorkflowTypeGroups\(locale\)/, "normal new-case route uses the shared grouped options");
assert.match(draft, /<optgroup key=\{group\.id\} label=\{group\.label\}/, "normal new-case UI renders coherent groups");
assert.match(uploadAction, /isCaseWorkflowType\(workflowType\)/, "upload creation has a server allowlist");
assert.match(blankAction, /workflowType && !isCaseWorkflowType\(workflowType\)/, "blank creation has the same server allowlist");
assert.match(uploadAction, /confirmedDataJson\.__workflowType = workflowType/, "normal entry persists the selected type in existing JSON metadata");
assert.match(detail, /getCaseWorkflowTypeLabel\(locale, brokerageCase\.confirmedDataJson\.__workflowType\)/, "reopen derives a localized type label from persisted metadata");
assert.match(overview, /caseTypeLabel\?/, "detail header accepts the persisted type label without changing case_type");
assert.match(overview, /案件種別/, "detail header visibly labels the selected type");

console.log("case workflow types contract: PASS");
