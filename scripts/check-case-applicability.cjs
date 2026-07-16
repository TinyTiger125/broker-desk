const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = process.cwd();
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, join(root, "src", request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const {
  CASE_WORKBENCH_FIELD_KEYS,
  buildCaseWorkbenchRuleMap,
} = require("../src/lib/case-workbench-field-rules.ts");
const { getCaseWorkbenchProgressSnapshot } = require("../src/lib/case-workbench-progress.ts");
const {
  resolveCaseApplicabilityConditions,
  writeCaseApplicabilitySettings,
} = require("../src/lib/case-field-applicability.ts");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeRuleMap(requiredFieldKeys) {
  const required = new Set(requiredFieldKeys);
  return buildCaseWorkbenchRuleMap(
    CASE_WORKBENCH_FIELD_KEYS.map((fieldKey) => ({
      id: `rule_${fieldKey}`,
      tenantId: "tenant_test",
      userId: "user_test",
      fieldKey,
      requirement: required.has(fieldKey) ? "required" : "optional",
      updatedAt: new Date("2026-07-15T00:00:00.000Z"),
    })),
  );
}

function reviewItem(fieldKey, reviewStatus = "suggested") {
  return {
    id: `review_${fieldKey}`,
    importJobId: "import_test",
    caseId: "case_test",
    fieldKey,
    fieldLabel: fieldKey,
    sourceSheet: "Sheet1",
    sourceCell: "A1",
    sourceRange: null,
    extractedValue: "sample",
    normalizedValue: "sample",
    editedValue: null,
    finalValue: null,
    confidence: 0.91,
    reviewStatus,
    method: "mock",
    createdAt: new Date("2026-07-15T00:00:00.000Z"),
    updatedAt: new Date("2026-07-15T00:00:00.000Z"),
  };
}

const requiredFields = [
  "applicant.name",
  "applicant.phone",
  "emergencyContact.name",
  "emergencyContact.phone",
  "guarantor.name",
];
const ruleMap = makeRuleMap(requiredFields);

const baseCaseData = {
  __workflowType: "rental_application",
  "applicant.name": "山田 愛",
  "emergencyContact.name": "ヤマダ ハナコ",
};

const baseProgress = getCaseWorkbenchProgressSnapshot({
  confirmedData: baseCaseData,
  reviewItems: [reviewItem("applicant.phone")],
  ruleMap,
});

assert(baseProgress.total === 4, `Expected 4 applicable required fields, got ${baseProgress.total}`);
assert(baseProgress.completed === 2, `Expected 2 completed required fields, got ${baseProgress.completed}`);
assert(baseProgress.open === 2, `Expected 2 open required fields, got ${baseProgress.open}`);
assert(
  !baseProgress.applicableRequiredFieldKeys.includes("guarantor.name"),
  "Guarantor fields should be excluded until the case requires a guarantor",
);

const guarantorIncluded = writeCaseApplicabilitySettings(baseCaseData, {
  guarantor_required: "included",
});
const guarantorProgress = getCaseWorkbenchProgressSnapshot({
  confirmedData: guarantorIncluded,
  reviewItems: [reviewItem("applicant.phone")],
  ruleMap,
});

assert(guarantorProgress.total === 5, `Expected guarantor to add one required field, got ${guarantorProgress.total}`);
assert(guarantorProgress.open === 3, `Expected guarantor to increase open fields, got ${guarantorProgress.open}`);

const notApplicableProgress = getCaseWorkbenchProgressSnapshot({
  confirmedData: {
    ...guarantorIncluded,
    __workbenchFieldStatuses: {
      "emergencyContact.phone": "not_applicable",
    },
  },
  reviewItems: [reviewItem("applicant.phone")],
  ruleMap,
});

assert(
  !notApplicableProgress.applicableRequiredFieldKeys.includes("emergencyContact.phone"),
  "Manual not_applicable should remove a field from required progress",
);

const rejectedProgress = getCaseWorkbenchProgressSnapshot({
  confirmedData: {
    ...baseCaseData,
    "applicant.phone": "090-1234-5678",
    __workbenchFieldStatuses: {
      "applicant.phone": "rejected",
    },
  },
  reviewItems: [],
  ruleMap,
});

assert(rejectedProgress.completed === 2, `Rejected required field must not count as completed, got ${rejectedProgress.completed}`);
assert(rejectedProgress.open === 2, `Rejected required field must remain open, got ${rejectedProgress.open}`);

const inferredConditions = resolveCaseApplicabilityConditions({
  confirmedData: baseCaseData,
  evidenceFieldKeys: new Set(["guarantor.name"]),
});

assert(
  inferredConditions.guarantor_required.choice === "included",
  "Guarantor evidence should infer guarantor fields as applicable",
);

console.log("[PASS] Case applicability and required-field progress rules are consistent.");
