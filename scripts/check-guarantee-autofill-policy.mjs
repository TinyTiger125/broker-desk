#!/usr/bin/env node
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

function loadTsModule(sourcePath) {
  const source = fs.readFileSync(sourcePath, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = new Module(sourcePath);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(process.cwd());
  mod.require = (request) => {
    if (request === "@/lib/data.memory") return {};
    if (request === "@/lib/case-field-normalization") return { getCaseFieldValue: () => "" };
    return Module.createRequire(sourcePath)(request);
  };
  mod._compile(js, sourcePath);
  return mod.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const {
  GUARANTEE_FIELD_COMPLETION_LABELS,
  guaranteeCompanyTemplates,
  getGuaranteeFieldCompletionMode,
  getGuaranteeFieldCompletionSummary,
} = loadTsModule(path.resolve("src/lib/guarantee-application.ts"));

const activeTemplates = guaranteeCompanyTemplates.filter((template) => template.outputStatus === "active");

assert(activeTemplates.length >= 5, "all five guarantee templates should be active");

activeTemplates.forEach((template) => {
  assert(template.qualityStatus === "verified", `${template.id} should be in the Phase E verified baseline`);
  assert(template.allowDirectDownload === true, `${template.id} should allow gated direct download after preview confirmation`);
  assert(
    getGuaranteeFieldCompletionMode(template, "lease.rent") === "certified_auto",
    `${template.id} rent should be certified as the minimum safe automatic output field`,
  );
  assert(
    getGuaranteeFieldCompletionMode(template, "property.name") === "assisted_candidate",
    `${template.id} property name should remain a preview-confirmed candidate because long text is layout-risky`,
  );
  template.companySpecificOptionKeys.forEach((fieldKey) => {
    assert(
      getGuaranteeFieldCompletionMode(template, fieldKey) === "manual_electronic",
      `${template.id} ${fieldKey} should require electronic manual completion`,
    );
  });
});

const friends = activeTemplates.find((template) => template.id === "friends_guarantee_individual_v1");
assert(friends, "friends guarantee template should exist");
const summary = getGuaranteeFieldCompletionSummary({
  template: friends,
  fieldKeys: [
    "lease.rent",
    "lease.rent",
    "applicant.phone",
    "company_option.friends_plan_type",
  ],
});
assert(summary.certified_auto === 1, "summary should de-duplicate certified auto fields");
assert(summary.assisted_candidate === 1, "summary should count candidate fields");
assert(summary.manual_electronic === 1, "summary should count manual electronic fields");
assert(GUARANTEE_FIELD_COMPLETION_LABELS.certified_auto === "安全自動入力", "labels should be broker-facing");

console.log("[PASS] guarantee autofill policy regression");
