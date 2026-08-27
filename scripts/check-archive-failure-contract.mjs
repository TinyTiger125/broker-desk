import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { compile } from "tailwindcss";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const require = createRequire(import.meta.url);
const ts = require("typescript");
const { Scanner } = require("@tailwindcss/oxide");
const paths = {
  action: resolve(root, "src/app/actions.ts"),
  button: resolve(root, "src/components/archive-record-button.tsx"),
  listReturn: resolve(root, "src/components/list-return-state.tsx"),
};
const source = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, readFileSync(path, "utf8")]));

const FAILURE_COPY = {
  ja: "操作を完了できませんでした。もう一度お試しください。",
  zh: "操作未完成，请重试。",
  ko: "작업을 완료하지 못했습니다. 다시 시도해 주세요.",
};

const focusVariant = ["focus", "visible"].join("-");
const outlineUtility = ["out", "line"].join("");
const alertFocusClasses = [
  `${focusVariant}:${outlineUtility}`,
  `${focusVariant}:${outlineUtility}-[${["length", "var"].join(":")}(--bd-focus-ring-width)]`,
  `${focusVariant}:${outlineUtility}-[${["color", "var"].join(":")}(--bd-focus-ring-color)]`,
  `${focusVariant}:${outlineUtility}-offset-[${["length", "var"].join(":")}(--bd-focus-ring-offset)]`,
];
const hiddenUtility = ["hid", "den"].join("");
const utilityCompiler = await compile("@tailwind utilities;", { base: root, onDependency() {} });
const utilityCss = utilityCompiler.build([...alertFocusClasses, hiddenUtility]);
assert.match(utilityCss, /\.hidden\s*\{\s*display:\s*none/, "compiled Tailwind hidden utility removes the alert from layout");
assert.match(utilityCss, /outline-style:\s*var\(--tw-outline-style\)/, "compiled alert focus utility sets outline style");
assert.match(utilityCss, /outline-width:\s*var\(--bd-focus-ring-width\)/, "compiled alert focus utility uses the width token");
assert.match(utilityCss, /outline-color:\s*var\(--bd-focus-ring-color\)/, "compiled alert focus utility uses the color token");
assert.match(utilityCss, /outline-offset:\s*var\(--bd-focus-ring-offset\)/, "compiled alert focus utility uses the offset token");
const scannedUtilities = new Set(new Scanner({ sources: [] }).scanFiles([{
  content: `<div class="${[...alertFocusClasses, hiddenUtility].join(" ")}"></div>`,
  extension: "tsx",
}]));
for (const candidate of [...alertFocusClasses, hiddenUtility]) assert(scannedUtilities.has(candidate), `Oxide must detect ${candidate}`);
const globalCss = readFileSync(resolve(root, "src/app/globals.css"), "utf8");
for (const token of ["width", "color", "offset"]) {
  assert.match(globalCss, new RegExp(`--bd-focus-ring-${token}:\\s*[^;]+;`), `global CSS defines the alert focus ${token} token`);
}

function parse(text, name, jsx = false) {
  return ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function descendants(rootNode, predicate) {
  const found = [];
  function visit(node) {
    if (node !== rootNode && ts.isFunctionLike(node)) return;
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(rootNode);
  return found;
}

function exportedFunction(file, name) {
  const matches = file.statements.filter((statement) => ts.isFunctionDeclaration(statement)
    && statement.name?.text === name
    && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
  assert.equal(matches.length, 1, `${name} must be one live top-level export`);
  assert(matches[0].body, `${name} must have a body`);
  return matches[0];
}

function assertAction(text) {
  const file = parse(text, "actions.ts");
  const fn = exportedFunction(file, "setRecordLifecycleAction");
  const calls = descendants(fn.body, ts.isCallExpression);
  const composite = calls.filter((call) => call.expression.getText(file) === "setRecordLifecycleWithAudit");
  assert.equal(composite.length, 1, "Action has one composite repository call");
  assert(ts.isAwaitExpression(composite[0].parent), "composite repository call is awaited");
  const tryStatement = fn.body.statements.find(ts.isTryStatement);
  assert(tryStatement?.catchClause && !tryStatement.finallyBlock, "Action catches only the safe repository failure boundary");
  assert(composite[0].pos >= tryStatement.tryBlock.pos && composite[0].end <= tryStatement.tryBlock.end, "composite call is inside the safe catch boundary");
  const guardedCalls = ["requireTenantSession", "rejectForbiddenRecordInput", "requireWritableCase", "ensureClientOwnership", "ensurePropertyOwnership"];
  for (const name of guardedCalls) {
    const matches = calls.filter((call) => call.expression.getText(file) === name);
    assert(matches.length >= 1, `${name} remains live`);
    assert(matches.every((call) => call.pos < tryStatement.pos), `${name} stays outside safe repository catch`);
  }
  const catchReturns = descendants(tryStatement.catchClause.block, ts.isReturnStatement);
  assert.equal(catchReturns.length, 1, "repository catch returns one typed failure");
  assert.equal(catchReturns[0].expression?.getText(file), '{ status: "error", code: "update_failed" }', "repository failure returns the frozen safe code");
  const afterTry = fn.body.statements.slice(fn.body.statements.indexOf(tryStatement) + 1);
  const afterText = afterTry.map((statement) => statement.getText(file)).join("\n");
  assert.match(afterText, /if \(!updated\) return \{ status: "error", code: "not_found" \};/, "null result returns a typed safe failure");
  for (const call of ["revalidatePath", "redirect"]) assert(afterText.includes(`${call}(`), `${call} remains after the catch boundary`);
  assert.doesNotMatch(fn.body.getText(file), /error\.(?:message|stack|cause)|String\s*\(\s*error|JSON\.stringify\s*\(\s*error/, "Action never exposes raw error details");
}

function assertListReturn(text) {
  const file = parse(text, "list-return-state.tsx", true);
  const fn = exportedFunction(file, "clearListReturnIntent");
  assert.equal(fn.body.statements.length, 5, "intent cleanup is one direct canonical scoped removal flow");
  const [canonicalStatement, invalidGuard, keyStatement, clearStatement, successReturn] = fn.body.statements;
  assert(ts.isVariableStatement(canonicalStatement), "intent cleanup first canonicalizes the list URL");
  const canonicalDeclarations = [...canonicalStatement.declarationList.declarations];
  assert.equal(canonicalDeclarations.length, 1, "intent cleanup has one canonical URL binding");
  assert(ts.isIdentifier(canonicalDeclarations[0].name) && canonicalDeclarations[0].name.text === "canonicalUrl"
    && canonicalDeclarations[0].initializer?.getText(file) === "canonicalListUrl(listUrl)", "intent cleanup canonicalizes its live listUrl");
  assert(ts.isIfStatement(invalidGuard) && invalidGuard.expression.getText(file) === "!canonicalUrl"
    && ts.isReturnStatement(invalidGuard.thenStatement) && invalidGuard.thenStatement.expression?.kind === ts.SyntaxKind.FalseKeyword
    && !invalidGuard.elseStatement, "invalid canonical URLs fail without touching storage");
  assert(ts.isVariableStatement(keyStatement), "intent cleanup next derives its scoped key");
  const keyDeclarations = [...keyStatement.declarationList.declarations];
  assert.equal(keyDeclarations.length, 1, "intent cleanup has one storage key binding");
  assert(ts.isIdentifier(keyDeclarations[0].name) && keyDeclarations[0].name.text === "key"
    && keyDeclarations[0].initializer?.getText(file) === "storageKey(scope, canonicalUrl)", "intent cleanup derives the exact scope and canonical URL key");
  assert(ts.isExpressionStatement(clearStatement) && ts.isCallExpression(clearStatement.expression)
    && clearStatement.expression.expression.getText(file) === "clearStoredState"
    && clearStatement.expression.arguments.length === 1
    && clearStatement.expression.arguments[0].getText(file) === "key", "intent cleanup directly removes only its derived key");
  assert(ts.isReturnStatement(successReturn) && successReturn.expression?.kind === ts.SyntaxKind.TrueKeyword, "intent cleanup reports successful scoped removal");
  const calls = descendants(fn.body, ts.isCallExpression);
  assert.deepEqual(calls.map((call) => call.expression.getText(file)), ["canonicalListUrl", "storageKey", "clearStoredState"], "intent cleanup has no clear-all, direct storage, or extra writer calls");

  const declarations = ["LOCAL_ORIGIN", "STORAGE_PREFIX"].map((name) => file.statements.find((statement) => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name)));
  assert(declarations.every(Boolean), "intent runtime uses the production origin and storage prefix");
  const localFunctions = ["canonicalListUrl", "storageKey", "clearStoredState"].map((name) => file.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name));
  assert(localFunctions.every(Boolean), "intent runtime uses the production canonical/key/clear helpers");
  const runtimeInput = `${declarations.map((node) => node.getText(file)).join("\n")}\n${localFunctions.map((node) => node.getText(file)).join("\n")}\n${fn.getText(file)}\nmodule.exports = { clearListReturnIntent };`;
  const runtimeOutput = ts.transpileModule(runtimeInput, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const stored = new Map([
    ["list-return-state:parties:/parties?lifecycle=all&q=Alpha", "target"],
    ["list-return-state:properties:/properties", "property"],
    ["template-pending:unrelated", "template"],
  ]);
  const removed = [];
  const context = {
    module: { exports: {} }, exports: {}, URL, URLSearchParams,
    window: { sessionStorage: { removeItem(key) { removed.push(key); stored.delete(key); } } },
  };
  vm.runInNewContext(runtimeOutput, context, { filename: "archive-failure-clear-runtime.cjs" });
  assert.equal(context.module.exports.clearListReturnIntent({ listUrl: "/parties?q=Alpha&lifecycle=all", scope: "parties" }), true, "valid intent cleanup succeeds");
  assert.deepEqual(removed, ["list-return-state:parties:/parties?lifecycle=all&q=Alpha"], "runtime cleanup removes only the canonical scoped key");
  assert.deepEqual([...stored.entries()], [
    ["list-return-state:properties:/properties", "property"],
    ["template-pending:unrelated", "template"],
  ], "runtime cleanup preserves all unrelated session state");
  assert.equal(context.module.exports.clearListReturnIntent({ listUrl: "https://evil.example/parties", scope: "parties" }), false, "invalid intent cleanup is rejected");
  assert.equal(removed.length, 1, "invalid intent cleanup does not touch storage");
}

function assertButton(text) {
  const file = parse(text, "archive-record-button.tsx", true);
  const fn = exportedFunction(file, "ArchiveRecordButton");
  const body = fn.body.getText(file);
  const labelsDeclaration = file.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "labels");
  assert(labelsDeclaration?.initializer && ts.isObjectLiteralExpression(labelsDeclaration.initializer), "button has one live locale copy object");
  const localeObjects = new Map(labelsDeclaration.initializer.properties.map((property) => {
    assert(ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && ts.isObjectLiteralExpression(property.initializer), "locale copy is a direct object");
    return [property.name.text, property.initializer];
  }));
  for (const [locale, expected] of Object.entries(FAILURE_COPY)) {
    const localeObject = localeObjects.get(locale);
    assert(localeObject, `button has ${locale} copy`);
    const failures = localeObject.properties.filter((property) => property.name?.getText(file) === "failure");
    assert.equal(failures.length, 1, `${locale} has one failure field`);
    assert(ts.isPropertyAssignment(failures[0]) && ts.isStringLiteral(failures[0].initializer), `${locale} failure is a direct string`);
    assert.equal(failures[0].initializer.text, expected, `${locale} failure copy matches the independent safe expectation`);
  }
  assert.match(body, /useState<[^>]*>\(undefined\)/, "button stores only a typed safe failure code");
  const effectStatements = fn.body.statements.filter((statement) => ts.isExpressionStatement(statement)
    && ts.isCallExpression(statement.expression)
    && statement.expression.expression.getText(file) === "useEffect");
  assert.equal(effectStatements.length, 1, "button has one live top-level failure focus effect");
  const effectCall = effectStatements[0].expression;
  assert.equal(effectCall.arguments.length, 2, "failure focus effect has callback and dependency list");
  const [effectCallback, effectDependencies] = effectCall.arguments;
  assert(ts.isArrowFunction(effectCallback) && ts.isBlock(effectCallback.body), "failure focus effect uses a direct block callback");
  assert(ts.isArrayLiteralExpression(effectDependencies)
    && effectDependencies.elements.length === 1
    && effectDependencies.elements[0].getText(file) === "failureCode", "failure focus effect depends only on failureCode");
  assert.equal(effectCallback.body.statements.length, 1, "failure focus effect has one direct guard");
  const focusGuard = effectCallback.body.statements[0];
  assert(ts.isIfStatement(focusGuard) && focusGuard.expression.getText(file) === "failureCode" && !focusGuard.elseStatement, "failure focus is guarded only by failureCode");
  assert(ts.isExpressionStatement(focusGuard.thenStatement), "failure focus guard directly focuses the alert");
  assert.equal(focusGuard.thenStatement.expression.getText(file), "errorRef.current?.focus()", "failure focus targets the live alert ref");
  const directReturns = fn.body.statements.filter(ts.isReturnStatement);
  assert.equal(directReturns.length, 1, "button has one direct live return");
  const finalReturn = directReturns[0];
  assert(finalReturn.expression && fn.body.statements.at(-1) === finalReturn, "button alert belongs to the final reachable return");
  const liveButtons = descendants(finalReturn.expression, (node) => ts.isJsxElement(node)
    && node.openingElement.tagName.getText(file) === "Button");
  assert.equal(liveButtons.length, 1, "button has one live archive control");
  const onClickAttributes = liveButtons[0].openingElement.attributes.properties.filter((property) => ts.isJsxAttribute(property)
    && property.name.getText(file) === "onClick");
  assert.equal(onClickAttributes.length, 1, "live archive control has one onClick handler");
  const onClickInitializer = onClickAttributes[0].initializer;
  assert(onClickInitializer && ts.isJsxExpression(onClickInitializer) && onClickInitializer.expression
    && ts.isArrowFunction(onClickInitializer.expression) && ts.isBlock(onClickInitializer.expression.body), "live archive handler is a direct block callback");
  const clickBody = onClickInitializer.expression.body;
  const confirmGuards = clickBody.statements.filter((statement) => ts.isIfStatement(statement)
    && statement.expression.getText(file) === "!window.confirm(confirmMessage)");
  assert.equal(confirmGuards.length, 1, "live archive handler has one direct confirmation guard");
  const confirmGuard = confirmGuards[0];
  assert(ts.isReturnStatement(confirmGuard.thenStatement) && !confirmGuard.thenStatement.expression && !confirmGuard.elseStatement, "cancel exits before retry state changes");
  const directResets = clickBody.statements.filter((statement) => ts.isExpressionStatement(statement)
    && ts.isCallExpression(statement.expression)
    && statement.expression.expression.getText(file) === "setFailureCode");
  assert.equal(directResets.length, 1, "live archive handler has one direct retry reset");
  const retryReset = directResets[0];
  assert.equal(retryReset.expression.arguments.length, 1, "retry reset has one value");
  assert.equal(retryReset.expression.arguments[0].getText(file), "undefined", "retry clears the prior typed failure");
  const rememberStatements = clickBody.statements.filter((statement) => ts.isExpressionStatement(statement)
    && ts.isCallExpression(statement.expression)
    && statement.expression.expression.getText(file) === "rememberListReturnIntent");
  assert.equal(rememberStatements.length, 1, "live archive handler has one direct return-intent write");
  const confirmIndex = clickBody.statements.indexOf(confirmGuard);
  const resetIndex = clickBody.statements.indexOf(retryReset);
  const rememberIndex = clickBody.statements.indexOf(rememberStatements[0]);
  assert.equal(resetIndex, confirmIndex + 1, "retry reset is the first direct action after confirmation");
  assert.equal(rememberIndex, resetIndex + 1, "retry reset happens immediately before return-intent write");
  const transitionStatements = clickBody.statements.filter((statement) => ts.isExpressionStatement(statement)
    && ts.isCallExpression(statement.expression)
    && statement.expression.expression.getText(file) === "startTransition");
  assert.equal(transitionStatements.length, 1, "live archive handler has one direct transition");
  const transitionCall = transitionStatements[0].expression;
  assert(clickBody.statements.indexOf(transitionStatements[0]) > rememberIndex, "return-intent write precedes the live transition");
  assert.equal(transitionCall.arguments.length, 1, "transition has one callback");
  const transitionCallback = transitionCall.arguments[0];
  assert(ts.isArrowFunction(transitionCallback) && transitionCallback.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)
    && ts.isBlock(transitionCallback.body), "transition uses one live async callback");
  assert.equal(transitionCallback.body.statements.length, 3, "transition contains only result binding, narrow Action catch, and typed failure branch");
  const resultDeclarationStatement = transitionCallback.body.statements[0];
  assert(ts.isVariableStatement(resultDeclarationStatement), "transition first binds the Action result");
  const resultDeclarations = [...resultDeclarationStatement.declarationList.declarations];
  assert.equal(resultDeclarations.length, 1, "transition binds one Action result");
  const resultDeclaration = resultDeclarations[0];
  assert(ts.isIdentifier(resultDeclaration.name) && resultDeclaration.name.text === "result"
    && !resultDeclaration.initializer
    && resultDeclaration.type?.getText(file) === "Awaited<ReturnType<typeof setRecordLifecycleAction>>", "transition declares only the typed Action result binding");
  const assertExactClearStatement = (statement, label) => {
    assert(ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)
      && statement.expression.expression.getText(file) === "clearListReturnIntent", `${label} directly clears its return intent`);
    assert.equal(statement.expression.arguments.length, 1, `${label} cleanup has one options object`);
    const options = statement.expression.arguments[0];
    assert(ts.isObjectLiteralExpression(options) && options.properties.length === 2, `${label} cleanup has only listUrl and scope`);
    const properties = new Map(options.properties.map((property) => {
      assert(ts.isPropertyAssignment(property) && ts.isIdentifier(property.name), `${label} cleanup uses direct named properties`);
      return [property.name.text, property.initializer.getText(file)];
    }));
    assert.deepEqual(Object.fromEntries(properties), { listUrl: "returnTo", scope: "returnStateScope" }, `${label} clears the exact scoped canonical return intent`);
  };
  const actionTry = transitionCallback.body.statements[1];
  assert(ts.isTryStatement(actionTry) && actionTry.catchClause && !actionTry.finallyBlock, "transition has one narrow Action rejection boundary");
  assert.equal(actionTry.tryBlock.statements.length, 1, "Action try contains only the awaited server Action");
  const actionAssignment = actionTry.tryBlock.statements[0];
  assert(ts.isExpressionStatement(actionAssignment) && ts.isBinaryExpression(actionAssignment.expression)
    && actionAssignment.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
    && actionAssignment.expression.left.getText(file) === "result"
    && ts.isAwaitExpression(actionAssignment.expression.right)
    && ts.isCallExpression(actionAssignment.expression.right.expression)
    && actionAssignment.expression.right.expression.expression.getText(file) === "setRecordLifecycleAction"
    && actionAssignment.expression.right.expression.arguments.length === 1
    && actionAssignment.expression.right.expression.arguments[0].getText(file) === "formData", "Action try awaits the server Action into result");
  assert(actionTry.catchClause.variableDeclaration && ts.isIdentifier(actionTry.catchClause.variableDeclaration.name)
    && actionTry.catchClause.variableDeclaration.name.text === "error", "Action rejection catch binds the original error");
  assert.equal(actionTry.catchClause.block.statements.length, 2, "Action rejection catch only clears intent and rethrows");
  assertExactClearStatement(actionTry.catchClause.block.statements[0], "Action rejection");
  const rejectionThrow = actionTry.catchClause.block.statements[1];
  assert(ts.isThrowStatement(rejectionThrow) && rejectionThrow.expression.getText(file) === "error", "Action rejection rethrows the same error unchanged");
  const failureBranch = transitionCallback.body.statements[2];
  assert(ts.isIfStatement(failureBranch) && failureBranch.expression.getText(file) === 'result?.status === "error"'
    && !failureBranch.elseStatement && ts.isBlock(failureBranch.thenStatement), "transition handles only the live typed error branch");
  assert.equal(failureBranch.thenStatement.statements.length, 2, "typed error branch clears intent before setting failure state");
  const [clearStatement, stateStatement] = failureBranch.thenStatement.statements;
  assertExactClearStatement(clearStatement, "typed failure");
  assert(ts.isExpressionStatement(stateStatement) && ts.isCallExpression(stateStatement.expression)
    && stateStatement.expression.expression.getText(file) === "setFailureCode"
    && stateStatement.expression.arguments.length === 1
    && stateStatement.expression.arguments[0].getText(file) === "result.code", "intent cleanup precedes the live typed failure state");
  const alerts = descendants(finalReturn.expression, (node) => ts.isJsxElement(node)
    && node.openingElement.tagName.getText(file) === "div"
    && node.openingElement.attributes.properties.some((property) => ts.isJsxAttribute(property) && property.name.getText(file) === "role" && property.initializer?.getText(file) === '"alert"'));
  assert.equal(alerts.length, 1, "button renders one live role=alert failure surface");
  const alert = alerts[0];
  let conditional = alert.parent;
  while (conditional && conditional !== finalReturn.expression && !ts.isConditionalExpression(conditional)) conditional = conditional.parent;
  assert(conditional && ts.isConditionalExpression(conditional) && conditional.condition.getText(file) === "failureCode", "live alert is rendered only by the typed failure state");
  const alertAttributes = alert.openingElement.attributes.properties;
  const attribute = (name) => alertAttributes.filter((property) => ts.isJsxAttribute(property) && property.name.getText(file) === name);
  assert.equal(attribute("role").length, 1, "failure alert has one role");
  assert.equal(attribute("role")[0].initializer?.getText(file), '"alert"', "failure surface retains alert semantics");
  assert.equal(attribute("aria-live").length, 1, "failure alert has one live-region policy");
  assert.equal(attribute("aria-live")[0].initializer?.getText(file), '"assertive"', "failure alert announces immediately");
  assert.equal(attribute("ref").length, 1, "failure alert has one focus ref");
  assert.equal(attribute("ref")[0].initializer?.getText(file), "{errorRef}", "failure alert receives focus through the live ref");
  assert.equal(attribute("tabIndex").length, 1, "failure alert has one programmatic tab index");
  assert.equal(attribute("tabIndex")[0].initializer?.getText(file), "{-1}", "failure alert is programmatically focusable");
  assert.equal(attribute("hidden").length, 0, "failure alert cannot use the hidden attribute");
  assert.equal(attribute("aria-hidden").length, 0, "failure alert cannot be hidden from assistive technology");
  const classAttributes = attribute("className");
  assert.equal(classAttributes.length, 1, "failure alert has one direct className");
  assert(classAttributes[0].initializer && ts.isStringLiteral(classAttributes[0].initializer), "failure alert className is statically auditable");
  const alertClasses = classAttributes[0].initializer.text.split(/\s+/).filter(Boolean);
  for (const forbidden of [hiddenUtility, "invisible", "collapse", "opacity-0", "pointer-events-none"]) {
    assert(!alertClasses.includes(forbidden), `failure alert cannot use ${forbidden}`);
  }
  for (const focusClass of alertFocusClasses) assert(alertClasses.includes(focusClass), `failure alert must use ${focusClass}`);
  const content = alert.children.filter((child) => ts.isJsxExpression(child) && child.expression);
  assert.equal(content.length, 1, "live alert has one dynamic message child");
  assert.equal(content[0].expression.getText(file), "copy.failure", "live alert renders the current locale failure copy");
  assert.doesNotMatch(body, /error\.(?:message|stack|cause)|String\s*\(\s*error|JSON\.stringify\s*\(\s*error/, "button never renders raw error details");
}

function transitionRuntime(text) {
  const file = parse(text, "archive-record-button.tsx", true);
  const fn = exportedFunction(file, "ArchiveRecordButton");
  const finalReturn = fn.body.statements.find(ts.isReturnStatement);
  assert(finalReturn?.expression, "runtime uses the live component return");
  const button = descendants(finalReturn.expression, (node) => ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === "Button")[0];
  assert(button, "runtime uses the live archive button");
  const onClick = button.openingElement.attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.getText(file) === "onClick");
  assert(onClick?.initializer && ts.isJsxExpression(onClick.initializer) && onClick.initializer.expression && ts.isArrowFunction(onClick.initializer.expression)
    && ts.isBlock(onClick.initializer.expression.body), "runtime uses the live click callback");
  const transition = onClick.initializer.expression.body.statements.find((statement) => ts.isExpressionStatement(statement)
    && ts.isCallExpression(statement.expression) && statement.expression.expression.getText(file) === "startTransition");
  assert(transition && ts.isCallExpression(transition.expression), "runtime uses the live transition");
  const callback = transition.expression.arguments[0];
  assert(ts.isArrowFunction(callback) && ts.isBlock(callback.body), "runtime extracts the live transition callback");
  const input = `async function run(deps) {
    const formData = deps.formData;
    const returnTo = deps.returnTo;
    const returnStateScope = deps.returnStateScope;
    const setRecordLifecycleAction = deps.action;
    const clearListReturnIntent = deps.clear;
    const setFailureCode = deps.setFailure;
    ${callback.body.statements.map((statement) => statement.getText(file)).join("\n")}
    return "success";
  }
  module.exports = { run };`;
  const output = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const context = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(output, context, { filename: "archive-failure-transition-runtime.cjs" });
  return context.module.exports.run;
}

async function assertTransitionBehavior(text) {
  const run = transitionRuntime(text);
  const execute = async (action) => {
    const events = [];
    const value = await run({
      action,
      clear: (options) => events.push(["clear", options]),
      formData: { marker: "form" },
      returnStateScope: "parties",
      returnTo: "/parties?lifecycle=all&q=Alpha",
      setFailure: (code) => events.push(["failure", code]),
    });
    return { events, value };
  };
  for (const code of ["update_failed", "not_found"]) {
    const outcome = await execute(async () => ({ status: "error", code }));
    assert.equal(outcome.value, "success", `${code} typed failure settles the transition`);
    assert.deepEqual(JSON.parse(JSON.stringify(outcome.events)), [
      ["clear", { listUrl: "/parties?lifecycle=all&q=Alpha", scope: "parties" }],
      ["failure", code],
    ], `${code} clears exact intent before safe feedback`);
  }
  const sentinel = new Error("opaque rejection");
  const rejectionEvents = [];
  await assert.rejects(() => run({
    action: async () => { throw sentinel; },
    clear: (options) => rejectionEvents.push(["clear", options]),
    formData: { marker: "form" },
    returnStateScope: "properties",
    returnTo: "/properties?sort=price",
    setFailure: (code) => rejectionEvents.push(["failure", code]),
  }), (error) => error === sentinel, "server rejection is rethrown unchanged");
  assert.deepEqual(JSON.parse(JSON.stringify(rejectionEvents)), [["clear", { listUrl: "/properties?sort=price", scope: "properties" }]], "server rejection clears exact intent without typed feedback");
  const success = await execute(async () => undefined);
  assert.equal(success.value, "success", "success settles without local failure handling");
  assert.deepEqual(success.events, [], "success does not clear the return intent or show failure feedback");
}

assertAction(source.action);
assertListReturn(source.listReturn);
assertButton(source.button);
await assertTransitionBehavior(source.button);

const liveCatch = `            } catch (error) {
              clearListReturnIntent({ listUrl: returnTo, scope: returnStateScope });
              throw error;
            }`;
for (const [label, replacement, expectedFailure] of [
  ["swallowed rejection", `            } catch (error) {
              clearListReturnIntent({ listUrl: returnTo, scope: returnStateScope });
              return;
            }`, /Action rejection rethrows the same error unchanged/],
  ["typed rejection conversion", `            } catch (error) {
              clearListReturnIntent({ listUrl: returnTo, scope: returnStateScope });
              setFailureCode("update_failed");
              return;
            }`, /Action rejection catch only clears intent and rethrows/],
  ["raw rejection message", `            } catch (error) {
              clearListReturnIntent({ listUrl: returnTo, scope: returnStateScope });
              setFailureCode(error.message);
              throw error;
            }`, /Action rejection catch only clears intent and rethrows/],
  ["missing rejection cleanup", `            } catch (error) {
              throw error;
            }`, /Action rejection catch only clears intent and rethrows/],
  ["wrong rejection cleanup scope", `            } catch (error) {
              clearListReturnIntent({ listUrl: returnTo, scope: "parties" });
              throw error;
            }`, /Action rejection clears the exact scoped canonical return intent/],
  ["dead rejection cleanup", `            } catch (error) {
              const deadCleanup = () => clearListReturnIntent({ listUrl: returnTo, scope: returnStateScope });
              throw error;
            }`, /Action rejection directly clears its return intent/],
]) {
  const mutated = source.button.replace(liveCatch, replacement);
  assert.notEqual(mutated, source.button, `button ${label} mutation must hit`);
  assert.throws(() => assertButton(mutated), expectedFailure);
}
const clearOnSuccess = source.button.replace(
  "            if (result?.status === \"error\") {\n              clearListReturnIntent({ listUrl: returnTo, scope: returnStateScope });\n              setFailureCode(result.code);\n            }",
  "            if (result?.status === \"error\") {\n              clearListReturnIntent({ listUrl: returnTo, scope: returnStateScope });\n              setFailureCode(result.code);\n            }\n            clearListReturnIntent({ listUrl: returnTo, scope: returnStateScope });",
);
assert.notEqual(clearOnSuccess, source.button, "button success cleanup mutation must hit");
assert.throws(() => assertButton(clearOnSuccess), /transition contains only result binding, narrow Action catch, and typed failure branch/);

function mutateClearListReturn(transform, label) {
  const file = parse(source.listReturn, "list-return-state.tsx", true);
  const fn = exportedFunction(file, "clearListReturnIntent");
  const original = source.listReturn.slice(fn.pos, fn.end);
  const mutatedFunction = transform(original);
  assert.notEqual(mutatedFunction, original, `${label} mutation must hit the live clearListReturnIntent`);
  return `${source.listReturn.slice(0, fn.pos)}${mutatedFunction}${source.listReturn.slice(fn.end)}`;
}

for (const [label, transform] of [
  ["clear all storage", (text) => text.replace("clearStoredState(key);", "window.sessionStorage.clear();")],
  ["clear wrong key", (text) => text.replace("clearStoredState(key);", "clearStoredState(canonicalUrl);")],
  ["derive key with wrong scope", (text) => text.replace("storageKey(scope, canonicalUrl)", 'storageKey("parties", canonicalUrl)')],
  ["derive key from unnormalized URL", (text) => text.replace("storageKey(scope, canonicalUrl)", "storageKey(scope, listUrl)")],
  ["extra direct storage writer", (text) => text.replace("clearStoredState(key);", "clearStoredState(key);\n  window.sessionStorage.removeItem(key);")],
  ["dead correct clear with live clear-all", (text) => text.replace("clearStoredState(key);", "if (false) clearStoredState(key);\n  window.sessionStorage.clear();")],
]) {
  const mutated = mutateClearListReturn(transform, label);
  assert.throws(() => assertListReturn(mutated), undefined, `${label} must fail the scoped cleanup contract`);
}

for (const [label, replacement] of [
  ["fixed Japanese", '"操作を完了できませんでした。もう一度お試しください。"'],
  ["wrong copy field", "copy.archive"],
]) {
  const mutated = source.button.replace("{copy.failure}", `{${replacement}}`);
  assert.notEqual(mutated, source.button, `button alert ${label} mutation must hit`);
  assert.throws(() => assertButton(mutated), /live alert renders the current locale failure copy/);
}
const deadCorrectAlert = source.button
  .replace("{copy.failure}", '{"操作を完了できませんでした。もう一度お試しください。"}')
  .replace("  return (", '  const deadAlert = <div role="alert">{copy.failure}</div>;\n\n  return (');
assert.notEqual(deadCorrectAlert, source.button, "button dead-correct live-wrong alert mutation must hit");
assert.throws(() => assertButton(deadCorrectAlert), /live alert renders the current locale failure copy/);
for (const [label, target, replacement, expectedFailure] of [
  ["wrong focus guard", "if (failureCode) errorRef.current?.focus();", "if (isArchived) errorRef.current?.focus();", /failure focus is guarded only by failureCode/],
  ["wrong focus dependencies", "}, [failureCode]);", "}, [isArchived]);", /failure focus effect depends only on failureCode/],
  ["wrong focus ref", "errorRef.current?.focus()", "buttonRef.current?.focus()", /failure focus targets the live alert ref/],
]) {
  const mutated = source.button.replace(target, replacement);
  assert.notEqual(mutated, source.button, `button ${label} mutation must hit`);
  assert.throws(() => assertButton(mutated), expectedFailure);
}
const deadFocusEffect = source.button.replace(
  "  useEffect(() => {\n    if (failureCode) errorRef.current?.focus();\n  }, [failureCode]);",
  "  const deadFocusEffect = () => {\n    useEffect(() => {\n      if (failureCode) errorRef.current?.focus();\n    }, [failureCode]);\n  };\n  useEffect(() => {\n    if (isArchived) errorRef.current?.focus();\n  }, [failureCode]);",
);
assert.notEqual(deadFocusEffect, source.button, "button dead effect mutation must hit");
assert.throws(() => assertButton(deadFocusEffect), /failure focus is guarded only by failureCode/);
for (const [label, target, replacement, expectedFailure] of [
  ["wrong cleanup scope", "              clearListReturnIntent({ listUrl: returnTo, scope: returnStateScope });\n              setFailureCode(result.code);", '              clearListReturnIntent({ listUrl: returnTo, scope: "parties" });\n              setFailureCode(result.code);', /typed failure clears the exact scoped canonical return intent/],
  ["wrong cleanup URL", "              clearListReturnIntent({ listUrl: returnTo, scope: returnStateScope });\n              setFailureCode(result.code);", "              clearListReturnIntent({ listUrl: recordLabel, scope: returnStateScope });\n              setFailureCode(result.code);", /typed failure clears the exact scoped canonical return intent/],
  ["constant-false cleanup", "              clearListReturnIntent({ listUrl: returnTo, scope: returnStateScope });\n              setFailureCode(result.code);", "              false && clearListReturnIntent({ listUrl: returnTo, scope: returnStateScope });\n              setFailureCode(result.code);", /typed failure directly clears its return intent/],
  ["cleanup after failure state", "              clearListReturnIntent({ listUrl: returnTo, scope: returnStateScope });\n              setFailureCode(result.code);", "              setFailureCode(result.code);\n              clearListReturnIntent({ listUrl: returnTo, scope: returnStateScope });", /typed failure directly clears its return intent/],
]) {
  const mutated = source.button.replace(target, replacement);
  assert.notEqual(mutated, source.button, `button ${label} mutation must hit`);
  assert.throws(() => assertButton(mutated), expectedFailure);
}
const deadCorrectCleanup = source.button.replace(
  "              clearListReturnIntent({ listUrl: returnTo, scope: returnStateScope });\n              setFailureCode(result.code);",
  '              (() => clearListReturnIntent({ listUrl: returnTo, scope: returnStateScope }), clearListReturnIntent({ listUrl: returnTo, scope: "parties" }))();\n              setFailureCode(result.code);',
);
assert.notEqual(deadCorrectCleanup, source.button, "button dead-correct live-wrong cleanup mutation must hit");
assert.throws(() => assertButton(deadCorrectCleanup), /typed failure directly clears its return intent/);
for (const [label, target, replacement, expectedFailure] of [
  ["deleted retry reset", "          setFailureCode(undefined);\n", "", /live archive handler has one direct retry reset/],
  ["wrong retry reset value", "setFailureCode(undefined);", 'setFailureCode("update_failed");', /retry clears the prior typed failure/],
  ["constant-false retry reset", "setFailureCode(undefined);", "false && setFailureCode(undefined);", /live archive handler has one direct retry reset/],
  ["reset after intent write", "          setFailureCode(undefined);\n          rememberListReturnIntent({", "          rememberListReturnIntent({", /retry reset is the first direct action after confirmation/],
]) {
  let mutated = source.button.replace(target, replacement);
  if (label === "reset after intent write") {
    mutated = mutated.replace("            preserveExisting: preserveExistingReturnState,\n          });", "            preserveExisting: preserveExistingReturnState,\n          });\n          setFailureCode(undefined);");
  }
  assert.notEqual(mutated, source.button, `button ${label} mutation must hit`);
  assert.throws(() => assertButton(mutated), expectedFailure ?? /retry reset happens immediately before return-intent write/);
}
const deadRetryReset = source.button.replace(
  "          setFailureCode(undefined);",
  "          const deadRetryReset = () => setFailureCode(undefined);",
);
assert.notEqual(deadRetryReset, source.button, "button dead retry reset mutation must hit");
assert.throws(() => assertButton(deadRetryReset), /live archive handler has one direct retry reset/);
const resetAfterTransition = source.button
  .replace("          setFailureCode(undefined);\n", "")
  .replace("          });\n        }}", "          });\n          setFailureCode(undefined);\n        }}");
assert.notEqual(resetAfterTransition, source.button, "button reset-after-transition mutation must hit");
assert.throws(() => assertButton(resetAfterTransition), /retry reset is the first direct action after confirmation/);
for (const forbiddenClass of [hiddenUtility, "invisible", "collapse", "opacity-0", "pointer-events-none"]) {
  const mutated = source.button.replace("break-words ", `break-words ${forbiddenClass} `);
  assert.notEqual(mutated, source.button, `button ${forbiddenClass} mutation must hit`);
  assert.throws(() => assertButton(mutated), new RegExp(`failure alert cannot use ${forbiddenClass}`));
}
for (const [label, insertion, expectedFailure] of [
  ["hidden attribute", " hidden", /failure alert cannot use the hidden attribute/],
  ["aria-hidden attribute", ' aria-hidden="true"', /failure alert cannot be hidden from assistive technology/],
]) {
  const mutated = source.button.replace('          role="alert"', `         ${insertion}\n          role="alert"`);
  assert.notEqual(mutated, source.button, `button ${label} mutation must hit`);
  assert.throws(() => assertButton(mutated), expectedFailure);
}
for (const focusClass of alertFocusClasses) {
  const mutated = source.button.replace(`${focusClass} `, "").replace(` ${focusClass}\"`, '"');
  assert.notEqual(mutated, source.button, `button missing ${focusClass} mutation must hit`);
  assert.throws(() => assertButton(mutated), new RegExp(`failure alert must use ${focusClass.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
}
const deadVisibleLiveHiddenAlert = source.button
  .replace("break-words ", `break-words ${hiddenUtility} `)
  .replace("  return (", `  const deadVisibleAlert = <div ref={errorRef} role="alert" aria-live="assertive" tabIndex={-1} className="${alertFocusClasses.join(" ")}">{copy.failure}</div>;\n\n  return (`);
assert.notEqual(deadVisibleLiveHiddenAlert, source.button, "button dead-visible live-hidden alert mutation must hit");
assert.throws(() => assertButton(deadVisibleLiveHiddenAlert), /failure alert cannot use hidden/);
console.log("archive failure contract passed");
