import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const page = readFileSync(new URL("../src/app/import-center/page.tsx", import.meta.url), "utf8");
const partyPage = readFileSync(new URL("../src/app/parties/new/page.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("../src/app/actions.ts", import.meta.url), "utf8");

const occurrences = (source, token) => source.split(token).length - 1;
const actionsTree = ts.createSourceFile("actions.ts", actions, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const compileActionFunction = (name, dependencies = {}) => {
  const declaration = actionsTree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert(declaration, `missing action policy function: ${name}`);
  const output = ts.transpileModule(`${declaration.getText(actionsTree)}\nmodule.exports = ${name};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  Function("module", ...Object.keys(dependencies), output)(module, ...Object.values(dependencies));
  return module.exports;
};

const safeClientReturnTo = compileActionFunction("safeClientReturnTo", { IMPORT_CENTER_RETURN_PATH: "/import-center" });
assert.equal(safeClientReturnTo("/import-center", "/clients", undefined, true), "/import-center", "validated create returnTo may use the import-center source");
assert.equal(safeClientReturnTo("/import-center", "/clients/client-1", "client-1", false), "/clients/client-1", "edit behavior must not gain the import-center return path");
assert.equal(safeClientReturnTo(null, "/clients", undefined, true), "/clients", "create without returnTo must keep the existing fallback");
for (const unsafe of ["https://attacker.invalid/import-center", "//attacker.invalid/import-center", "/import-center?job=forged", "/import-center#source-upload", "/%2e%2e/import-center"]) {
  assert.equal(safeClientReturnTo(unsafe, "/clients", undefined, true), "/clients", `unsafe create returnTo must fail closed: ${unsafe}`);
}
const getClientCreateCompletion = compileActionFunction("getClientCreateCompletion", { IMPORT_CENTER_RETURN_PATH: "/import-center" });
assert.deepEqual(getClientCreateCompletion({ returnTo: "/import-center", clientId: "client 1", clientName: "人物", values: { name: "人物" }, caseDraftReturn: false }), { kind: "redirect", href: "/import-center?flash=client_created" }, "import-center create success must return to its validated source with explicit feedback");
assert.deepEqual(getClientCreateCompletion({ returnTo: "/clients", clientId: "client 1", clientName: "人物", values: { name: "人物" }, caseDraftReturn: false }), { kind: "redirect", href: "/clients/client%201?flash=client_created" }, "default create success must keep the client detail destination");
assert.deepEqual(getClientCreateCompletion({ returnTo: "/import-center", clientId: "client 1", clientName: "人物", values: { name: "人物" }, caseDraftReturn: true }), { kind: "state", state: { status: "idle", fieldErrors: {}, values: { name: "人物" }, createdRecord: { id: "client 1", name: "人物" } } }, "case draft create must return the created record without redirecting");
for (const feedback of ["関係者を登録しました。", "人物资料已创建。", "관계자 자료를 만들었습니다."]) {
  assert(page.includes(feedback), `import-center must localize create success feedback: ${feedback}`);
}
assert(actions.includes("createCompletion.href.startsWith(`${IMPORT_CENTER_RETURN_PATH}?`)"), "create action must use the safe completion policy only for the allowed import-center source");

assert.deepEqual([...page.matchAll(/\{ key: "(case|person|property)"/g)].map((match) => match[1]), ["case", "person", "property"], "initial import center must expose exactly three material objects");
assert.equal(occurrences(page, 'data-import-action="manual"'), 1, "the three-object renderer must expose one manual-create action per object");
assert.equal(occurrences(page, 'data-import-action="file"'), 1, "the three-object renderer must expose one file-read action per object");
for (const href of [
  "/cases/new?from=entry",
  "/parties/new?from=entry",
  "/properties/new?from=entry",
]) assert(page.includes(href), `missing live object action ${href}`);
assert(page.includes("`/import-center?object=${object.key}#source-upload`"), "each object file action must preserve its object in the file-read deep link");

for (const forbidden of ["Excel 批量台账", "Excel 一括台帳", "Excel 일괄 대장", "未归属资料", "未割当資料", "미지정 자료"]) {
  assert(!page.includes(forbidden), `product entry concept must be hidden: ${forbidden}`);
}
assert(!page.includes("createImportJobAction"), "legacy create-job cards must not remain a product entry");
for (const legacyFormId of ["import-job-excel-form", "import-job-pdf-form", "import-job-manual-form"]) {
  assert(!page.includes(legacyFormId), `legacy product entry must be removed: ${legacyFormId}`);
}

for (const localeText of ["案件资料", "人物资料", "物件资料", "案件資料", "関係者資料", "物件資料", "안건 자료", "관계자 자료", "매물 자료"]) {
  assert(page.includes(localeText), `missing localized object copy: ${localeText}`);
}

assert(page.includes("IdentityDocumentUploadForm"), "identity file-reading form must remain available");
assert(page.includes("ExcelDocumentUploadForm"), "Excel file-reading form must remain available inside file read");
assert(page.includes("targetCaseId"), "target-case recovery must remain available");
assert(page.includes("xlsxJob"), "xlsx recovery must remain available");
assert(page.includes("advanced=1#job-mapping"), "legacy advanced recovery must remain available");

assert(partyPage.includes("ClientForm"), "party manual create must use the existing client form");
assert(partyPage.includes("createClientFormAction"), "party manual create must use the existing create action");
assert(!partyPage.includes("notFound()"), "party manual create must no longer return 404");
assert(partyPage.includes('params.from === "entry" ? "/import-center" : "/parties"'), "party manual create must return to import center when opened from entry");

console.log("import center object actions: PASS");
