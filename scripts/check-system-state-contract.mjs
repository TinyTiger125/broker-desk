#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const paths = {
  copy: "src/lib/system-state-copy.ts",
  panel: "src/components/system-state-panel.tsx",
  notFound: "src/app/not-found.tsx",
  routeError: "src/app/error.tsx",
  globalError: "src/app/global-error.tsx",
  loading: "src/app/loading.tsx",
  globals: "src/app/globals.css",
};

const entries = await Promise.all(Object.values(paths).map((path) => readFile(path, "utf8")));
const source = Object.fromEntries(Object.keys(paths).map((key, index) => [key, entries[index]]));

const expectedCopy = {
  ja: {
    notFoundTitle: "ページが見つかりません",
    notFoundDescription: "ページが移動したか、アクセス権がない可能性があります。資料は削除されていません。",
    routeErrorTitle: "このページを一時的に開けません",
    routeErrorDescription: "資料は削除されていません。まず再試行してください。問題が続く場合は、ワークスペースに戻ってからもう一度開いてください。",
    globalErrorTitle: "サービスを一時的に利用できません",
    globalErrorDescription: "しばらくしてから再試行してください。問題が続く場合は、ワークスペースに戻ってからもう一度開いてください。",
    loading: "読み込んでいます",
    requestId: "リクエスト番号",
    retry: "再試行",
    back: "ワークスペース選択に戻る",
  },
  zh: {
    notFoundTitle: "页面未找到",
    notFoundDescription: "该页面可能已移动，或你当前没有访问权限。资料没有被删除。",
    routeErrorTitle: "此页面暂时无法打开",
    routeErrorDescription: "资料没有被删除。请先重试；若问题持续，请返回工作台后重新进入。",
    globalErrorTitle: "服务暂时不可用",
    globalErrorDescription: "请稍后重试。若问题持续，请返回工作台后重新进入。",
    loading: "正在加载",
    requestId: "请求编号",
    retry: "重试",
    back: "返回工作区选择",
  },
  ko: {
    notFoundTitle: "페이지를 찾을 수 없습니다",
    notFoundDescription: "페이지가 이동했거나 접근 권한이 없을 수 있습니다. 자료는 삭제되지 않았습니다.",
    routeErrorTitle: "이 페이지를 일시적으로 열 수 없습니다",
    routeErrorDescription: "자료는 삭제되지 않았습니다. 먼저 다시 시도해 주세요. 문제가 계속되면 워크스페이스로 돌아간 뒤 다시 열어 주세요.",
    globalErrorTitle: "서비스를 일시적으로 이용할 수 없습니다",
    globalErrorDescription: "잠시 후 다시 시도해 주세요. 문제가 계속되면 워크스페이스로 돌아간 뒤 다시 열어 주세요.",
    loading: "불러오는 중입니다",
    requestId: "요청 번호",
    retry: "다시 시도",
    back: "워크스페이스 선택으로 돌아가기",
  },
};

const compiledCopy = ts.transpileModule(source.copy, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: paths.copy,
}).outputText;
const runtimeModule = { exports: {} };
const runtimeContext = vm.createContext({ module: runtimeModule, exports: runtimeModule.exports, decodeURIComponent });
vm.runInContext(compiledCopy, runtimeContext, { filename: paths.copy });
const runtime = runtimeModule.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));

for (const [locale, expected] of Object.entries(expectedCopy)) {
  assert.deepEqual(plain(runtime.getSystemStateCopy(locale)), expected, `${locale} system-state copy must match its independent field contract`);
  for (const kind of ["route", "global"]) {
    const view = plain(runtime.getSystemStateErrorView(locale, kind, {
      digest: "request_123",
      message: "relation does not exist",
      stack: "postgres internal stack",
      code: "permission_denied",
      context: "owner_write",
    }));
    assert.deepEqual(view, {
      title: kind === "route" ? expected.routeErrorTitle : expected.globalErrorTitle,
      description: kind === "route" ? expected.routeErrorDescription : expected.globalErrorDescription,
      requestIdLabel: expected.requestId,
      requestId: "request_123",
      retry: expected.retry,
      back: expected.back,
    }, `${locale} ${kind} error view must use only approved localized fields`);
    const renderedView = JSON.stringify(view);
    for (const forbidden of ["relation does not exist", "postgres", "permission_denied", "owner_write"]) {
      assert(!renderedView.includes(forbidden), `${locale} ${kind} error view must not expose ${forbidden}`);
    }
  }
}

assert.equal(runtime.resolveSystemStateLocale({ cookie: "brokerdesk_locale=zh", documentLang: "ja" }), "zh", "cookie zh must override document ja");
assert.equal(runtime.resolveSystemStateLocale({ cookie: "brokerdesk_locale=ko", documentLang: "ja" }), "ko", "cookie ko must override document ja");
assert.equal(runtime.resolveSystemStateLocale({ cookie: "brokerdesk_locale=invalid", documentLang: "zh-CN" }), "zh", "invalid cookie must fall back to document locale");
assert.equal(runtime.resolveSystemStateLocale({ cookie: "brokerdesk_locale=%E0%A4%A", documentLang: "ko" }), "ko", "malformed cookie must not throw and must fall back to document locale");
assert.equal(runtime.resolveSystemStateLocale({ cookie: "", documentLang: "invalid" }), "ja", "invalid inputs must use the safe default locale");
assert.equal(runtime.getSystemStateErrorView("ja", "route", { digest: "postgres relation does not exist" }).requestId, undefined, "unsafe digest text must not be displayed");

const parseTsx = (key) => ts.createSourceFile(paths[key], source[key], ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const visit = (node, predicate, matches = []) => {
  if (predicate(node)) matches.push(node);
  ts.forEachChild(node, (child) => { visit(child, predicate, matches); });
  return matches;
};
const tagName = (node) => node.tagName.getText();
const jsxElements = (tree, name) => visit(tree, (node) => (
  (ts.isJsxElement(node) && tagName(node.openingElement) === name)
  || (ts.isJsxSelfClosingElement(node) && tagName(node) === name)
));
const openingNode = (node) => ts.isJsxElement(node) ? node.openingElement : node;
const attribute = (node, name) => openingNode(node).attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.getText() === name);
const attributeText = (node, name) => attribute(node, name)?.initializer?.getText() ?? "";
const containsIdentifier = (node, name) => visit(node, (child) => ts.isIdentifier(child) && child.text === name).length > 0;
const closest = (node, predicate) => {
  for (let current = node.parent; current; current = current.parent) {
    if (predicate(current)) return current;
  }
  return null;
};
const hasTouchTarget = (node) => /(?:^|\s)(?:min-h-11|h-11|min-h-\[44px\])(?:\s|$)/.test(attributeText(node, "className").replace(/^['"]|['"]$/g, ""));

const panelTree = parseTsx("panel");
for (const shell of ["PageFrame", "PageHeader", "StateSurface"]) {
  assert.equal(jsxElements(panelTree, shell).length, 1, `system-state panel must use one ${shell}`);
}
assert.equal(jsxElements(panelTree, "main").length, 0, "system-state panel must not own a main landmark");
const semanticContainer = jsxElements(panelTree, "section").find((node) => attribute(node, "role"));
assert(semanticContainer, "system-state panel must provide a shared alert/status container");
const roleContract = attributeText(semanticContainer, "role");
assert(roleContract.includes("alert") && roleContract.includes("status"), "system-state semantic container must distinguish alert and status");
const liveContract = attributeText(semanticContainer, "aria-live");
assert(liveContract.includes("assertive") && liveContract.includes("polite"), "system-state semantic container must distinguish assertive and polite announcements");
const semanticHeaders = jsxElements(semanticContainer, "PageHeader");
assert.equal(semanticHeaders.length, 1, "title and description must be inside the shared semantic container");
assert(containsIdentifier(attribute(semanticHeaders[0], "title"), "title"), "PageHeader title must come from the panel title");
assert(containsIdentifier(attribute(semanticHeaders[0], "description"), "description"), "PageHeader description must come from the panel description");
assert.equal(jsxElements(semanticContainer, "StateSurface").length, 1, "state details must share the title semantic container");
assert(containsIdentifier(semanticContainer, "actions"), "recovery actions must share the title semantic container");

for (const [key, kind] of [["routeError", "route"], ["globalError", "global"]]) {
  const tree = parseTsx(key);
  const panels = jsxElements(tree, "SystemStatePanel");
  assert.equal(panels.length, 1, `${kind} error must render one shared SystemStatePanel`);
  for (const prop of ["title", "description", "requestIdLabel", "requestId", "actions"]) {
    assert(attribute(panels[0], prop), `${kind} error must supply ${prop} through the shared panel`);
  }
  const bannedNames = new Set(["message", "stack", "cause", "code", "context"]);
  const leakedIdentifiers = visit(tree, (node) => ts.isIdentifier(node) && bannedNames.has(node.text));
  assert.equal(leakedIdentifiers.length, 0, `${kind} error caller must not access or independently render internal error fields`);
  const errorReferenceKinds = [];
  const unexpectedErrorReferences = [];
  for (const identifier of visit(tree, (node) => ts.isIdentifier(node) && node.text === "error")) {
    if ((ts.isBindingElement(identifier.parent) || ts.isPropertySignature(identifier.parent)) && identifier.parent.name === identifier) continue;
    if (ts.isPropertyAccessExpression(identifier.parent) && identifier.parent.name === identifier) continue;
    const parent = identifier.parent;
    if (ts.isCallExpression(parent) && parent.arguments[2] === identifier && parent.expression.getText() === "getSystemStateErrorView") {
      errorReferenceKinds.push("safe-view-argument");
      continue;
    }
    if (ts.isPropertyAccessExpression(parent) && parent.expression === identifier && parent.name.text === "digest") {
      const call = closest(parent, ts.isCallExpression);
      if (call && call.expression.getText() === "console.error") {
        errorReferenceKinds.push("digest-console");
        continue;
      }
    }
    if (ts.isArrayLiteralExpression(parent)) {
      const call = closest(parent, ts.isCallExpression);
      if (call && call.expression.getText() === "useEffect" && call.arguments[1] === parent) {
        errorReferenceKinds.push("effect-dependency");
        continue;
      }
    }
    unexpectedErrorReferences.push(identifier.getStart());
  }
  assert.deepEqual(errorReferenceKinds.sort(), ["digest-console", "effect-dependency", "safe-view-argument"], `${kind} error must use the raw error only in the three approved locations`);
  assert.deepEqual(unexpectedErrorReferences, [], `${kind} error must reject JSX, serialization, computed properties and any other raw error propagation`);
  const resets = jsxElements(tree, "button").filter((node) => attributeText(node, "onClick").includes("reset"));
  assert.equal(resets.length, 1, `${kind} error must expose one reset action`);
  assert(hasTouchTarget(resets[0]), `${kind} reset action must provide a 44px touch target`);
  const backLinks = jsxElements(tree, "Link").filter((node) => attributeText(node, "href") === '"/workspace"');
  assert.equal(backLinks.length, 1, `${kind} error must expose one workspace recovery link`);
  assert(hasTouchTarget(backLinks[0]), `${kind} back action must provide a 44px touch target`);
  if (key === "routeError") assert.equal(jsxElements(tree, "main").length, 0, "route error must not nest a main landmark inside RootLayout");
  if (key === "globalError") {
    assert.equal(jsxElements(tree, "html").length, 1, "global error must retain one html element");
    assert.equal(jsxElements(tree, "body").length, 1, "global error must retain one body element");
    assert.equal(jsxElements(tree, "main").length, 1, "global error must retain one main landmark");
    assert(containsIdentifier(attribute(jsxElements(tree, "html")[0], "lang"), "locale"), "global error html lang must use the resolved locale");
  }
}

const notFoundTree = parseTsx("notFound");
assert.equal(jsxElements(notFoundTree, "SystemStatePanel").length, 1, "not-found must use one shared system-state shell");
assert.equal(jsxElements(notFoundTree, "main").length, 0, "not-found must not nest a main landmark inside RootLayout");
const notFoundBackLinks = jsxElements(notFoundTree, "Link").filter((node) => attributeText(node, "href") === '"/workspace"');
assert.equal(notFoundBackLinks.length, 1, "not-found must expose one workspace recovery link");
assert(hasTouchTarget(notFoundBackLinks[0]), "not-found recovery action must provide a 44px touch target");

const loadingTree = parseTsx("loading");
const localeDeclaration = visit(loadingTree, (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "locale")[0];
assert(localeDeclaration?.initializer && ts.isAwaitExpression(localeDeclaration.initializer), "root loading locale must await its locale source");
assert(ts.isCallExpression(localeDeclaration.initializer.expression) && localeDeclaration.initializer.expression.expression.getText() === "getLocale", "root loading locale must come from getLocale()");
const copyDeclaration = visit(loadingTree, (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "text")[0];
assert(copyDeclaration?.initializer && ts.isCallExpression(copyDeclaration.initializer), "root loading copy must be resolved at runtime");
assert(copyDeclaration.initializer.expression.getText() === "getSystemStateCopy" && copyDeclaration.initializer.arguments.length === 1 && copyDeclaration.initializer.arguments[0].getText() === "locale", "root loading copy must come from getSystemStateCopy(locale)");
const loadingRoot = jsxElements(loadingTree, "div").find((node) => attribute(node, "aria-busy"));
assert(loadingRoot, "root loading must expose a busy status container");
assert(containsIdentifier(attribute(loadingRoot, "lang"), "locale"), "root loading must use the resolved locale");
const assistiveLoading = jsxElements(loadingRoot, "span").find((node) => attributeText(node, "className").includes("sr-only"));
const loadingCopyAccess = assistiveLoading ? visit(assistiveLoading, (node) => ts.isPropertyAccessExpression(node) && node.expression.getText() === "text" && node.name.text === "loading") : [];
assert.equal(loadingCopyAccess.length, 1, "root loading assistive text must come from copy.loading");
const reducedMotion = source.globals.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/);
assert(reducedMotion, "root styles must provide a reduced-motion rule");
assert(/\.bd-route-loading-bar\s*\{[\s\S]*?animation:\s*none/.test(reducedMotion[1]), "reduced-motion must stop the root loading animation");

console.log("system-state contract: PASS (runtime locale fields/callers, cookie precedence, shared semantics, recovery, loading motion)");
