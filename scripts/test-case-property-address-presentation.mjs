import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;

function resolveCandidate(value) {
  if (!value || (!value.startsWith("/") && !value.startsWith("."))) return undefined;
  const candidates = [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

Module._resolveFilename = function (request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};

function compileTypeScript(module, filename) {
  const result = typescript.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      jsx: typescript.JsxEmit.ReactJSX,
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
}

require.extensions[".ts"] = compileTypeScript;
require.extensions[".tsx"] = compileTypeScript;

const presentationPath = resolve(root, "src/lib/case-property-address-presentation.ts");
const { resolveCasePropertyAddressPresentation } = require(presentationPath);

const common = {
  savedPrimaryPropertyId: "property-a",
  propertyId: "property-a",
  propertyAddress: "合成测试地址2-2",
  caseAddress: "福岡県福岡市中央区H039合成1-1",
  caseAddressConfirmed: true,
};

assert.deepEqual(
  resolveCasePropertyAddressPresentation({ locale: "zh", ...common }),
  {
    propertyAddressLabel: "物件资料库地址",
    caseAddressLabel: "本案件使用地址",
    differenceNotice: "本案件与物件资料库的地址不同；申请书使用本案件已确认的地址。",
    showDifferenceNotice: true,
  },
);
assert.equal(
  resolveCasePropertyAddressPresentation({ locale: "ja", ...common }).differenceNotice,
  "本案件と物件主資料の住所が異なります。申込書には、本案件で確認済みの住所を使用します。",
);
assert.equal(resolveCasePropertyAddressPresentation({ locale: "zh", ...common, caseAddress: " 合成测试地址２－２ " }).showDifferenceNotice, false, "normalized equal addresses must not warn");
assert.equal(resolveCasePropertyAddressPresentation({ locale: "zh", ...common, caseAddress: "" }).showDifferenceNotice, false, "missing case address must not promise an output value");
assert.equal(resolveCasePropertyAddressPresentation({ locale: "zh", ...common, propertyAddress: "" }).showDifferenceNotice, false, "missing property address must not warn");
assert.equal(resolveCasePropertyAddressPresentation({ locale: "zh", ...common, caseAddressConfirmed: false }).showDifferenceNotice, false, "unconfirmed case address must not promise an output value");
assert.equal(resolveCasePropertyAddressPresentation({ locale: "zh", ...common, savedPrimaryPropertyId: undefined }).showDifferenceNotice, false, "unlinked property must not warn");
assert.equal(resolveCasePropertyAddressPresentation({ locale: "zh", ...common, propertyId: "property-b" }).showDifferenceNotice, false, "a different property must not be compared");

const componentPath = resolve(root, "src/components/case-association-manager.tsx");
const originalLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (parent?.filename === componentPath) {
    if (request === "@/components/client-form") return { ClientForm: () => null };
    if (request === "@/components/case-association-draft") return { FocusDialog: () => null };
    if (request === "@/components/property-responsive-form") return { PropertyResponsiveForm: () => null };
    if (request === "@/components/object-import-status-badge") return { ObjectImportFailureNotice: () => null, ObjectImportStatusBadge: () => null };
    if (request === "@/components/object-import-upload") return { ObjectImportUpload: () => null };
    if (request === "@/components/object-attachment-list") return { ObjectAttachmentList: () => null };
  }
  return originalLoad.call(this, request, parent, ...rest);
};
const { CaseAssociationManager } = require(componentPath);
Module._load = originalLoad;

function render(locale, overrides = {}) {
  return renderToStaticMarkup(React.createElement(CaseAssociationManager, {
    locale,
    caseId: "case-a",
    initialParties: [],
    initialPrimaryPropertyId: "property-a",
    savedPrimaryPropertyId: "property-a",
    candidates: [],
    properties: [{ id: "property-a", name: "対象物件", address: common.propertyAddress }],
    caseAddress: common.caseAddress,
    caseAddressConfirmed: true,
    ...overrides,
  }));
}

const zhHtml = render("zh");
assert.match(zhHtml, /物件资料库地址/);
assert.match(zhHtml, /本案件与物件资料库的地址不同；申请书使用本案件已确认的地址。/);
assert.match(zhHtml, /data-case-property-address-difference/);

const jaHtml = render("ja");
assert.match(jaHtml, /物件主資料の住所/);
assert.match(jaHtml, /本案件と物件主資料の住所が異なります。申込書には、本案件で確認済みの住所を使用します。/);

for (const overrides of [
  { caseAddress: common.propertyAddress },
  { caseAddress: "" },
  { caseAddressConfirmed: false },
  { initialPrimaryPropertyId: undefined },
  { initialPrimaryPropertyId: "property-b", properties: [{ id: "property-b", name: "切替中の物件", address: common.propertyAddress }] },
]) {
  assert.doesNotMatch(render("zh", overrides), /data-case-property-address-difference/, "notice must remain conditional");
}

const pageSource = readFileSync(resolve(root, "src/app/cases/[id]/page.tsx"), "utf8");
assert.match(pageSource, /caseAddress=\{caseAddressField\?\.value\}/, "case value must come from the saved workbench field");
assert.match(pageSource, /savedPrimaryPropertyId=\{associationDraft\.primaryPropertyId\}/, "the comparison must use the persisted association id");
assert.match(pageSource, /caseAddressField\?\.state === "confirmed" \|\| caseAddressField\?\.state === "edited"/, "only confirmed or edited case values may drive the output notice");
assert.match(pageSource, /field\.fieldKey === "property\.address"/, "the case-address label override must remain field-specific");

console.log("case property address presentation: PASS");
