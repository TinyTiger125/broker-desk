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

const customerHolder = selectPrimaryIdentityReaderCandidates([
  candidate("person_1", "本人", "applicant.name", "本人 Synthetic"),
  candidate("person_1", "被保険者", "applicant.birthDate", "1990年4月12日"),
], { scope: "customer" });
assert.equal(customerHolder.status, "single_applicant", "standalone customer intake accepts explicit holder roles");
assert.equal(customerHolder.candidates.length, 2);

const sameSubjectRoleMix = selectPrimaryIdentityReaderCandidates([
  candidate("person_1", "本人", "applicant.name", "Holder Synthetic"),
  candidate("person_1", "世帯主", "applicant.currentAddress", "Household address"),
], { scope: "customer" });
assert.equal(sameSubjectRoleMix.status, "single_applicant");
assert.deepEqual(sameSubjectRoleMix.candidates.map((item) => item.fieldKey), ["applicant.name"], "customer output must remove non-holder candidates even when subjectKey is shared");

const applicantAgentMix = selectPrimaryIdentityReaderCandidates([
  candidate("person_1", "申請人代理人", "applicant.name", "Agent acting for applicant"),
], { scope: "customer" });
assert.equal(applicantAgentMix.status, "no_applicant", "a label containing 申請人 does not override an explicit agent role");

for (const label of ["世帯主", "保険者", "代理人", "代表者"]) {
  const nonHolder = selectPrimaryIdentityReaderCandidates([
    candidate("person_1", label, "applicant.name", "Non-holder"),
  ], { scope: "customer" });
  assert.equal(nonHolder.status, "no_applicant", `${label} must never become the customer subject`);
}

const multipleCustomerSubjects = selectPrimaryIdentityReaderCandidates([
  candidate("person_1", "本人", "applicant.name", "Person A"),
  candidate("person_2", "被保険者", "applicant.name", "Person B"),
], { scope: "customer" });
assert.equal(multipleCustomerSubjects.status, "ambiguous_applicants");
assert.equal(multipleCustomerSubjects.candidates.length, 0, "multiple holder subjects must remain blocked");

const caseInsuredRole = selectPrimaryIdentityReaderCandidates([
  candidate("person_1", "被保険者", "applicant.name", "Case holder"),
]);
assert.equal(caseInsuredRole.status, "no_applicant", "legacy case scope remains applicant-only");

console.log("PASS: multi-page identity candidates require one stable applicant group and never merge different people");
