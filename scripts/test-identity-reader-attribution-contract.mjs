#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
function load(filePath, dependencies = {}) {
  const moduleInstance = new Module(filePath, null);
  moduleInstance.filename = filePath;
  moduleInstance.paths = Module._nodeModulePaths(root);
  const javascript = ts.transpileModule(fs.readFileSync(filePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filePath,
  }).outputText;
  const originalRequire = moduleInstance.require.bind(moduleInstance);
  moduleInstance.require = (name) => dependencies[name] ?? originalRequire(name);
  moduleInstance._compile(javascript, filePath);
  return moduleInstance.exports;
}

const contract = load(path.join(root, "src/lib/identity-reader-contract.ts"));
const { selectPrimaryIdentityReaderCandidates } = load(path.join(root, "src/lib/identity-reader-attribution.ts"), {
  "@/lib/identity-reader-contract": contract,
});
const candidate = (subjectKey, subjectLabel, fieldKey = "applicant.name", value = "Synthetic") => ({
  fieldKey, value, pageNumber: 1, sourceText: value, uncertainty: "clear", subjectKey, subjectLabel,
});

const onePerson = selectPrimaryIdentityReaderCandidates([
  candidate("person_1", "申請人"),
  candidate("person_1", "申請人", "applicant.currentAddress", "福岡県合成市1-1"),
  candidate("person_2", "代理人", "applicant.name", "Other Synthetic"),
]);
assert.equal(onePerson.status, "single_applicant");
assert.equal(onePerson.candidates.length, 2, "only the single applicant group may enter applicant fields");

const multipleApplicants = selectPrimaryIdentityReaderCandidates([
  candidate("person_1", "申請人", "applicant.name", "Person A"),
  candidate("person_2", "申請人", "applicant.name", "Person B"),
]);
assert.equal(multipleApplicants.status, "ambiguous_applicants");
assert.equal(multipleApplicants.candidates.length, 0, "different applicant groups must not be merged");

const noApplicant = selectPrimaryIdentityReaderCandidates([
  candidate("person_2", "代理人", "applicant.name", "Agent"),
]);
assert.equal(noApplicant.status, "no_applicant");
assert.equal(noApplicant.candidates.length, 0);

console.log("PASS: multi-page identity candidates require one stable applicant group and never merge different people");
