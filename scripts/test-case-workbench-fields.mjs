import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const helperSource = read("src/lib/case-date.ts");
const helperModuleSource = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helper = await import(`data:text/javascript,${encodeURIComponent(helperModuleSource)}`);

const parsedCompact = helper.parseCaseDateInput("19870101");
assert.deepEqual(parsedCompact, { iso: "1987-01-01", display: "1987/01/01" });
assert.deepEqual(helper.parseCaseDateInput("20000229"), { iso: "2000-02-29", display: "2000/02/29" });
assert.equal(helper.parseCaseDateInput("19000229"), undefined);
assert.equal(helper.parseCaseDateInput("20230229"), undefined);
assert.equal(helper.parseCaseDateInput("19870230"), undefined);
assert.equal(helper.parseCaseDateInput("198702"), undefined);
assert.equal(helper.isValidCaseDateInput(""), true);
assert.equal(helper.isValidCaseDateInput("19870101"), true);
assert.equal(helper.isValidCaseDateInput("19870231"), false);
assert.equal(helper.normalizeCaseDateValue("1987/1/1"), "1987-01-01");
assert.equal(helper.formatCaseDateForDisplay("1987-01-01"), "1987/01/01");
assert.equal(helper.formatCaseDateForDisplay("1987/02"), "1987/02");

const overviewSource = read("src/components/case-overview.tsx");
const fieldFormSource = read("src/components/case-workbench-field-form.tsx");
const actionSource = read("src/app/actions.ts");
const pageSource = read("src/app/cases/[id]/page.tsx");

assert.match(overviewSource, /data-case-field-kind="date"/);
assert.match(overviewSource, /type="text"/);
assert.match(overviewSource, /parseCaseDateInput/);
assert.match(overviewSource, /groupSaveCurrentFieldRef/);
assert.match(overviewSource, /returnFieldInput\.value = currentFieldKey/);
assert.doesNotMatch(overviewSource, /pendingGroupFieldKey/);
assert.match(fieldFormSource, /isValidCaseDateInput/);
assert.match(fieldFormSource, /onPendingChange/);
assert.match(fieldFormSource, /onSubmitAccepted/);
assert.match(actionSource, /normalizeCaseDateValue/);
assert.match(actionSource, /isValidCaseDateInput/);
assert.match(actionSource, /invalidDateFieldKey/);
assert.match(actionSource, /continuationFieldKey/);
assert.match(actionSource, /redirectParams\.set\("edit", "1"\)/);
assert.match(pageSource, /field\.inputSpec\.kind === "date"/);
assert.doesNotMatch(pageSource, /return field\.value \|\| evidence\?\.value \|\| "-"/);

console.log("case workbench field contracts passed");
