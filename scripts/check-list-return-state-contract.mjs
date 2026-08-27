import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = fileURLToPath(new URL("..", import.meta.url));
const paths = {
  component: resolve(root, "src/components/list-return-state.tsx"),
  appNav: resolve(root, "src/components/app-nav.tsx"),
  parties: resolve(root, "src/app/parties/page.tsx"),
  properties: resolve(root, "src/app/properties/page.tsx"),
  partyProfile: resolve(root, "src/lib/party-profile.ts"),
  propertyEdit: resolve(root, "src/app/properties/[id]/edit/page.tsx"),
};
const sources = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, readFileSync(path, "utf8")]));

function parse(source, filename) {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(tree.parseDiagnostics.length, 0, `${filename} must parse`);
  return tree;
}

function visit(node, predicate, matches = []) {
  if (predicate(node)) matches.push(node);
  ts.forEachChild(node, (child) => {
    visit(child, predicate, matches);
  });
  return matches;
}

function unwrap(node) {
  let current = node;
  while (current && (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isNonNullExpression(current)
  )) current = current.expression;
  return current;
}

function literalBoolean(node) {
  const value = unwrap(node);
  if (value?.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (value?.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
}

function statementAlwaysTerminates(statement) {
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
  if (ts.isBlock(statement)) return statement.statements.some(statementAlwaysTerminates);
  if (ts.isIfStatement(statement)) {
    const condition = literalBoolean(statement.expression);
    if (condition === true) return statementAlwaysTerminates(statement.thenStatement);
    if (condition === false) return statement.elseStatement ? statementAlwaysTerminates(statement.elseStatement) : false;
    return Boolean(statement.elseStatement)
      && statementAlwaysTerminates(statement.thenStatement)
      && statementAlwaysTerminates(statement.elseStatement);
  }
  return false;
}

function containsNode(container, child) {
  return container.pos <= child.pos && container.end >= child.end;
}

function assertReachable(node, boundary, label) {
  let current = node;
  while (current !== boundary) {
    const parent = current.parent;
    assert(parent, `${label} must remain inside its authoritative live return`);
    if (ts.isFunctionLike(parent)) assert.fail(`${label} must not be hidden in an uncalled nested function`);
    if (
      ts.isBinaryExpression(parent)
      && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      && containsNode(parent.right, current)
    ) assert.notEqual(literalBoolean(parent.left), false, `${label} must not be hidden behind false &&`);
    if (ts.isConditionalExpression(parent)) {
      const condition = literalBoolean(parent.condition);
      if (containsNode(parent.whenTrue, current)) assert.notEqual(condition, false, `${label} must not be in a constant-false branch`);
      if (containsNode(parent.whenFalse, current)) assert.notEqual(condition, true, `${label} must not be in an unreachable false branch`);
    }
    if (ts.isIfStatement(parent)) {
      const condition = literalBoolean(parent.expression);
      if (containsNode(parent.thenStatement, current)) assert.notEqual(condition, false, `${label} must not be in if(false)`);
      if (parent.elseStatement && containsNode(parent.elseStatement, current)) assert.notEqual(condition, true, `${label} must not be in an unreachable else`);
    }
    current = parent;
  }
}

function assertReachableStatement(block, target, label) {
  assert(ts.isBlock(block), `${label} owner must be a block`);
  const index = block.statements.indexOf(target);
  assert(index >= 0, `${label} must be a direct statement in its authoritative block`);
  for (const statement of block.statements.slice(0, index)) {
    assert(!statementAlwaysTerminates(statement), `${label} must not follow a guaranteed return or throw`);
  }
}

function directFunction(tree, name) {
  const fn = tree.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert(fn?.body, `${name} must remain a top-level function`);
  return fn;
}

function finalReturn(fn, label) {
  const returns = fn.body.statements.filter(ts.isReturnStatement);
  assert.equal(returns.length, 1, `${label} must have one direct return`);
  const result = returns[0];
  assert.equal(fn.body.statements.at(-1), result, `${label} return must remain final`);
  assertReachableStatement(fn.body, result, `${label} return`);
  assert(result.expression, `${label} must return live JSX`);
  return result.expression;
}

function directVariable(block, name, label) {
  assert(ts.isBlock(block), `${label} must have a block body`);
  for (const statement of block.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
        assert(declaration.initializer, `${name} must have an initializer`);
        return declaration.initializer;
      }
    }
  }
  assert.fail(`${name} must be declared directly in ${label}`);
}

function jsxAttribute(node, name) {
  return node.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText() === name);
}

function jsxExpressionAttribute(node, name) {
  const attribute = jsxAttribute(node, name);
  assert(attribute?.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression, `${name} must be a live JSX expression`);
  return unwrap(attribute.initializer.expression);
}

function jsxStringAttribute(node, name) {
  const attribute = jsxAttribute(node, name);
  assert(attribute?.initializer && ts.isStringLiteral(attribute.initializer), `${name} must be a direct string attribute`);
  return attribute.initializer.text;
}

function replaceOnce(source, search, replacement, label) {
  const index = source.indexOf(search);
  assert(index >= 0, `${label} mutation target must exist`);
  assert.equal(source.indexOf(search, index + search.length), -1, `${label} mutation target must be unique`);
  return `${source.slice(0, index)}${replacement}${source.slice(index + search.length)}`;
}

function expectFailure(run, label) {
  assert.throws(run, undefined, `${label} synthetic must fail`);
}

function expectReplacementFailure(source, search, replacement, mutationLabel, analyze, failureLabel) {
  const mutated = replaceOnce(source, search, replacement, mutationLabel);
  expectFailure(() => analyze(mutated), failureLabel);
}

function analyzePage(source, { filename, functionName, scope, collection, item, itemPrefix, detailPrefix, fallbackHeading }) {
  const tree = parse(source, filename);
  const fn = directFunction(tree, functionName);
  const liveReturn = finalReturn(fn, functionName);
  const returnTo = directVariable(fn.body, "returnTo", functionName).getText(tree);
  assert.match(returnTo, new RegExp(`^build${scope === "parties" ? "Parties" : "Properties"}Href\\(\\{ \\.\\.\\.filters, page: safePage \\}\\)$`), `${filename} must pass its real canonical filter URL`);

  const wrappers = visit(liveReturn, (node) => ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "ListReturnState");
  assert.equal(wrappers.length, 1, `${filename} must have one live ListReturnState wrapper`);
  const wrapper = wrappers[0];
  assertReachable(wrapper, liveReturn, `${filename} ListReturnState`);
  assert.equal(jsxStringAttribute(wrapper.openingElement, "scope"), scope, `${filename} must use the stable route scope`);
  assert.equal(jsxExpressionAttribute(wrapper.openingElement, "listUrl").getText(tree), "returnTo", `${filename} must key storage from its real canonical returnTo`);

  const fallbacks = visit(wrapper, (node) => {
    if (!ts.isJsxOpeningElement(node) || node.tagName.getText(tree) !== "section") return false;
    return Boolean(jsxAttribute(node, "data-list-return-fallback"));
  });
  assert.equal(fallbacks.length, 1, `${filename} must expose one stable fallback landmark`);
  const fallback = fallbacks[0];
  const tabIndex = jsxExpressionAttribute(fallback, "tabIndex");
  assert(ts.isPrefixUnaryExpression(tabIndex) && tabIndex.operator === ts.SyntaxKind.MinusToken && tabIndex.operand.text === "1", `${filename} fallback landmark must be programmatically focusable`);
  assert.equal(jsxStringAttribute(fallback, "aria-labelledby"), fallbackHeading, `${filename} fallback must retain its localized accessible heading`);

  const mapCalls = visit(wrapper, (node) => ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && node.expression.expression.getText(tree) === collection
    && node.expression.name.text === "map");
  assert.equal(mapCalls.length, 1, `${filename} must have one live ${collection} row renderer`);
  const callback = mapCalls[0].arguments[0];
  assert(callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && ts.isBlock(callback.body), `${filename} rows must use a block callback`);
  const rowReturns = callback.body.statements.filter(ts.isReturnStatement);
  assert.equal(rowReturns.length, 1, `${filename} row callback must have one direct return`);
  const rowReturn = rowReturns[0];
  assert.equal(callback.body.statements.at(-1), rowReturn, `${filename} row return must remain final`);
  assertReachableStatement(callback.body, rowReturn, `${filename} row return`);
  assert(rowReturn.expression, `${filename} row return must render JSX`);

  const detailLinks = visit(rowReturn.expression, (node) => {
    if (!ts.isJsxElement(node) || node.openingElement.tagName.getText(tree) !== "Link") return false;
    const href = jsxAttribute(node.openingElement, "href");
    return Boolean(href?.getText(tree).includes(detailPrefix) && href.getText(tree).includes("returnTo"));
  });
  assert.equal(detailLinks.length, 1, `${filename} must have one live name detail link`);
  const detailLink = detailLinks[0].openingElement;
  const trigger = jsxExpressionAttribute(detailLink, "data-list-return-trigger");
  assert(ts.isTemplateExpression(trigger), `${filename} trigger must be a stable template identity`);
  assert.equal(trigger.head.text, `${itemPrefix}:`, `${filename} trigger must use the entity namespace`);
  assert.equal(trigger.templateSpans.length, 1, `${filename} trigger must contain only the saved entity id`);
  assert.equal(trigger.templateSpans[0].expression.getText(tree), `${item}.id`, `${filename} trigger must use the stable entity id, not text or position`);
  assertReachable(detailLink, rowReturn.expression, `${filename} detail trigger`);
  assert(containsNode(wrapper, detailLink), `${filename} trigger must remain inside the live return-state wrapper`);
}

const pageSpecs = [
  { key: "parties", filename: "parties/page.tsx", functionName: "PartiesPage", scope: "parties", collection: "visibleParties", item: "party", itemPrefix: "party", detailPrefix: "/parties/", fallbackHeading: "parties-results-heading" },
  { key: "properties", filename: "properties/page.tsx", functionName: "PropertiesPage", scope: "properties", collection: "visibleProperties", item: "property", itemPrefix: "property", detailPrefix: "/properties/", fallbackHeading: "properties-results-heading" },
];

function componentFunctions(source) {
  const tree = parse(source, "list-return-state.tsx");
  const localOrigin = tree.statements.find((statement) => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "LOCAL_ORIGIN"));
  assert(localOrigin, "LOCAL_ORIGIN must be a top-level constant");
  const focusMargin = tree.statements.find((statement) => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "FOCUS_VISIBILITY_MARGIN"));
  assert(focusMargin, "FOCUS_VISIBILITY_MARGIN must be a top-level constant");
  const topSelector = tree.statements.find((statement) => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "TOP_OCCLUDER_SELECTOR"));
  assert(topSelector, "TOP_OCCLUDER_SELECTOR must be a top-level constant");
  const names = ["canonicalListUrl", "shouldRememberActivation", "parseStoredState", "clearStoredState", "readStoredState", "writeStoredState", "topOcclusionBoundary", "focusRestoredTarget"];
  const functions = names.map((name) => directFunction(tree, name));
  const input = `${localOrigin.getText(tree)}\n${focusMargin.getText(tree)}\n${topSelector.getText(tree)}\n${functions.map((fn) => fn.getText(tree)).join("\n")}\nmodule.exports = { ${names.join(", ")} };`;
  const output = ts.transpileModule(input, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const context = { module: { exports: {} }, exports: {}, URL, URLSearchParams, JSON, Number, window: undefined, document: undefined };
  vm.runInNewContext(output, context, { filename: "list-return-state-runtime.cjs" });
  return { api: context.module.exports, context };
}

function runPureBehavior(source) {
  const { api, context } = componentFunctions(source);
  const canonicalCases = [
    ["/parties?type=individual&q=Alpha&page=2&lifecycle=all", "/parties?lifecycle=all&page=2&q=Alpha&type=individual"],
    ["/parties?lifecycle=all&page=2&q=Alpha&type=individual", "/parties?lifecycle=all&page=2&q=Alpha&type=individual"],
    ["/properties?sort=price&q=Tokyo&lifecycle=archived", "/properties?lifecycle=archived&q=Tokyo&sort=price"],
    ["/parties", "/parties"],
    ["https://evil.example/parties", undefined],
    ["//evil.example/parties", undefined],
    ["/parties#stolen", undefined],
    ["/\\evil", undefined],
  ];
  for (const [input, expected] of canonicalCases) assert.equal(api.canonicalListUrl(input), expected, `canonical list URL mismatch for ${input}`);

  const base = { altKey: false, button: 0, ctrlKey: false, download: false, metaKey: false, shiftKey: false, target: "" };
  const activationCases = [
    [base, true],
    [{ ...base, target: "_self" }, true],
    [{ ...base, target: "_blank" }, false],
    [{ ...base, target: "named-window" }, false],
    [{ ...base, download: true }, false],
    [{ ...base, button: 1 }, false],
    [{ ...base, metaKey: true }, false],
    [{ ...base, ctrlKey: true }, false],
    [{ ...base, shiftKey: true }, false],
    [{ ...base, altKey: true }, false],
  ];
  for (const [facts, expected] of activationCases) assert.equal(api.shouldRememberActivation(facts), expected, `activation policy mismatch for ${JSON.stringify(facts)}`);

  const focusOperations = [];
  let occluders = [];
  const occluder = (rect, style = { display: "block", visibility: "visible" }) => ({ getBoundingClientRect: () => rect, style });
  const target = (name, rects) => {
    let rectIndex = 0;
    return {
    focus: (options) => focusOperations.push([name, "focus", options]),
    getBoundingClientRect: () => rects[Math.min(rectIndex++, rects.length - 1)],
    scrollIntoView: (options) => focusOperations.push([name, "scroll", options]),
    };
  };
  context.document = {
    querySelectorAll: (selector) => {
      assert.equal(selector, "[data-app-shell-top-occluder]");
      return occluders;
    },
  };
  context.window = {
    innerHeight: 800,
    getComputedStyle: (candidate) => candidate.style,
    scrollBy: (options) => focusOperations.push(["window", "scroll", options]),
  };
  const desktop = occluder({ top: 0, bottom: 64, width: 1200, height: 64 });
  const mobile = occluder({ top: 0, bottom: 120, width: 768, height: 120 });
  const mobileExpanded = occluder({ top: 0, bottom: 220, width: 390, height: 220 });
  occluders = [];
  assert.equal(api.topOcclusionBoundary(), 5, "no AppShell marker must leave only the focus margin");
  occluders = [desktop];
  assert.equal(api.topOcclusionBoundary(), 69, "desktop boundary must use the measured fixed header bottom");
  occluders = [mobile];
  assert.equal(api.topOcclusionBoundary(), 125, "mobile boundary must use the measured dynamic sticky header bottom");
  occluders = [mobileExpanded];
  assert.equal(api.topOcclusionBoundary(), 225, "expanded mobile header height must be measured at runtime");
  occluders = [desktop, mobile];
  assert.equal(api.topOcclusionBoundary(), 125, "multiple visible top occluders must use the greatest bottom");
  occluders = [desktop, occluder({ top: 0, bottom: 220, width: 390, height: 220 }, { display: "none", visibility: "visible" })];
  assert.equal(api.topOcclusionBoundary(), 69, "display-none occluders must be ignored");
  occluders = [desktop, occluder({ top: 0, bottom: 220, width: 390, height: 220 }, { display: "block", visibility: "hidden" })];
  assert.equal(api.topOcclusionBoundary(), 69, "visibility-hidden occluders must be ignored");
  occluders = [desktop, occluder({ top: 0, bottom: 220, width: 0, height: 220 })];
  assert.equal(api.topOcclusionBoundary(), 69, "zero-size occluders must be ignored");
  occluders = [desktop, occluder({ top: 100, bottom: 180, width: 390, height: 80 })];
  assert.equal(api.topOcclusionBoundary(), 69, "non-top fixed content must not become a shell occluder");

  occluders = [desktop];
  api.focusRestoredTarget(target("same-position", [{ top: 100, bottom: 144, height: 44 }]));
  assert.equal(JSON.stringify(focusOperations), JSON.stringify([["same-position", "focus", { preventScroll: true }]]), "a fully visible exact target must keep restored scroll unchanged");
  focusOperations.length = 0;
  api.focusRestoredTarget(target("moved-exact", [{ top: 10, bottom: 54, height: 44 }, { top: 10, bottom: 54, height: 44 }]));
  assert.equal(JSON.stringify(focusOperations), JSON.stringify([
    ["moved-exact", "focus", { preventScroll: true }],
    ["moved-exact", "scroll", { block: "nearest", inline: "nearest" }],
    ["window", "scroll", { top: -59, behavior: "auto" }],
  ]), "a reordered exact target under the desktop header must receive measured top correction");
  focusOperations.length = 0;
  occluders = [mobile];
  api.focusRestoredTarget(target("mobile-exact", [{ top: 80, bottom: 124, height: 44 }, { top: 80, bottom: 124, height: 44 }]));
  assert.equal(JSON.stringify(focusOperations), JSON.stringify([
    ["mobile-exact", "focus", { preventScroll: true }],
    ["mobile-exact", "scroll", { block: "nearest", inline: "nearest" }],
    ["window", "scroll", { top: -45, behavior: "auto" }],
  ]), "a target under a dynamic mobile header must use its measured boundary");
  focusOperations.length = 0;
  occluders = [mobileExpanded];
  api.focusRestoredTarget(target("expanded-mobile-exact", [{ top: 180, bottom: 224, height: 44 }, { top: 180, bottom: 224, height: 44 }]));
  assert.equal(JSON.stringify(focusOperations), JSON.stringify([
    ["expanded-mobile-exact", "focus", { preventScroll: true }],
    ["expanded-mobile-exact", "scroll", { block: "nearest", inline: "nearest" }],
    ["window", "scroll", { top: -45, behavior: "auto" }],
  ]), "expanded mobile AppShell height must remain dynamic");
  focusOperations.length = 0;
  occluders = [desktop];
  api.focusRestoredTarget(target("below-exact", [{ top: 900, bottom: 944, height: 44 }, { top: 756, bottom: 800, height: 44 }]));
  assert.equal(JSON.stringify(focusOperations), JSON.stringify([
    ["below-exact", "focus", { preventScroll: true }],
    ["below-exact", "scroll", { block: "nearest", inline: "nearest" }],
    ["window", "scroll", { top: 5, behavior: "auto" }],
  ]), "an exact target aligned to the viewport bottom must retain focus-ring room");
  focusOperations.length = 0;
  occluders = [mobile];
  api.focusRestoredTarget(target("missing-fallback", [{ top: 900, bottom: 944, height: 44 }, { top: 756, bottom: 800, height: 44 }]));
  assert.equal(JSON.stringify(focusOperations), JSON.stringify([
    ["missing-fallback", "focus", { preventScroll: true }],
    ["missing-fallback", "scroll", { block: "nearest", inline: "nearest" }],
    ["window", "scroll", { top: 5, behavior: "auto" }],
  ]), "an offscreen missing-item fallback aligned to the bottom must retain focus-ring room");
  focusOperations.length = 0;
  occluders = [mobileExpanded];
  api.focusRestoredTarget(target("tall-fallback", [{ top: 900, bottom: 1600, height: 700 }, { top: 300, bottom: 1000, height: 700 }]));
  assert.equal(JSON.stringify(focusOperations), JSON.stringify([
    ["tall-fallback", "focus", { preventScroll: true }],
    ["tall-fallback", "scroll", { block: "nearest", inline: "nearest" }],
    ["window", "scroll", { top: 75, behavior: "auto" }],
  ]), "a target taller than the available viewport must prioritize its top and actionable start");
  focusOperations.length = 0;
  assert.doesNotThrow(() => api.focusRestoredTarget(undefined));
  assert.equal(focusOperations.length, 0, "a missing target must remain a no-op");

  const parsedState = api.parseStoredState('{"scrollY":42,"triggerKey":"party:abc"}');
  assert.equal(parsedState?.scrollY, 42);
  assert.equal(parsedState?.triggerKey, "party:abc");
  for (const raw of ['{"scrollY":"42","triggerKey":"party:abc"}', '{"scrollY":42,"triggerKey":""}', '{"scrollY":null,"triggerKey":"party:abc"}']) {
    assert.equal(api.parseStoredState(raw), undefined, `invalid stored state must be rejected: ${raw}`);
  }

  const operations = [];
  context.window = {
    sessionStorage: {
      getItem: () => "{malformed",
      removeItem: (key) => operations.push(["remove", key]),
      setItem: (key, value) => operations.push(["set", key, value]),
    },
  };
  assert.doesNotThrow(() => api.readStoredState("test-key"), "malformed storage must not block rendering");
  assert.equal(api.readStoredState("test-key"), undefined);
  assert(operations.some(([kind, key]) => kind === "remove" && key === "test-key"), "malformed storage must be cleaned");
  assert.equal(api.writeStoredState("write-key", { scrollY: 9, triggerKey: "property:p1" }), true);
  assert(operations.some(([kind, key]) => kind === "set" && key === "write-key"), "plain activation state must be written");
  context.window = { sessionStorage: { getItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } } };
  assert.doesNotThrow(() => api.readStoredState("blocked-key"), "storage read failure must not block rendering");
  assert.equal(api.writeStoredState("blocked-key", { scrollY: 0, triggerKey: "party:p1" }), false, "storage write failure must not block navigation");
}

function callNamed(calls, tree, name) {
  return calls.filter((call) => {
    const expression = call.expression;
    if (ts.isIdentifier(expression)) return expression.text === name;
    return ts.isPropertyAccessExpression(expression) && expression.name.text === name;
  });
}

function analyzeComponent(source) {
  const tree = parse(source, "list-return-state.tsx");
  assert(ts.isExpressionStatement(tree.statements[0]) && ts.isStringLiteral(tree.statements[0].expression) && tree.statements[0].expression.text === "use client", "ListReturnState must remain a client component");
  assert(!source.includes(".app-mobile-header") && !source.includes(".app-desktop-header"), "return-state recovery must not query fragile AppNav classes");
  assert(!/\b64(?:px)?\b/.test(source), "return-state recovery must not hardcode the desktop header height");
  const occlusionHelper = directFunction(tree, "topOcclusionBoundary");
  assert.equal(occlusionHelper.body.statements.length, 3, "top occlusion helper must expose accumulator, live marker loop, and final margin boundary");
  const [bottomStatement, occluderLoop, boundaryReturn] = occlusionHelper.body.statements;
  assert(ts.isVariableStatement(bottomStatement) && bottomStatement.declarationList.declarations.length === 1 && bottomStatement.declarationList.declarations[0].name.getText(tree) === "bottom" && bottomStatement.declarationList.declarations[0].initializer?.getText(tree) === "0", "occlusion helper must start without a fabricated header height");
  assert(ts.isForOfStatement(occluderLoop) && occluderLoop.expression.getText(tree) === "document.querySelectorAll<HTMLElement>(TOP_OCCLUDER_SELECTOR)" && ts.isBlock(occluderLoop.statement), "occlusion helper must iterate every semantic AppShell top marker");
  const loopText = occluderLoop.statement.getText(tree);
  assert.match(loopText, /candidate\.getBoundingClientRect\(\)/, "occlusion helper must measure each live marker rectangle");
  assert.match(loopText, /window\.getComputedStyle\(candidate\)/, "occlusion helper must read marker visibility");
  assert.match(loopText, /style\.display\s*===\s*"none"/, "hidden display markers must not occlude");
  assert.match(loopText, /style\.visibility\s*===\s*"hidden"/, "hidden visibility markers must not occlude");
  assert.match(loopText, /rect\.width\s*<=\s*0/, "zero-width markers must not occlude");
  assert.match(loopText, /rect\.height\s*<=\s*0/, "zero-height markers must not occlude");
  assert.match(loopText, /rect\.top\s*>\s*FOCUS_VISIBILITY_MARGIN/, "non-top markers must not occlude");
  assert.match(loopText, /rect\.bottom\s*<=\s*FOCUS_VISIBILITY_MARGIN/, "markers outside the visible top edge must not occlude");
  assert.match(loopText, /bottom\s*=\s*Math\.max\(bottom,\s*rect\.bottom\)/, "multiple visible top occluders must use the greatest bottom edge");
  assert(ts.isReturnStatement(boundaryReturn) && boundaryReturn.expression?.getText(tree) === "bottom + FOCUS_VISIBILITY_MARGIN", "occlusion boundary must add the focus-ring visibility margin to the measured bottom");
  const focusHelper = directFunction(tree, "focusRestoredTarget");
  assert.equal(focusHelper.body.statements.length, 4, "focus visibility helper must keep one direct guard, focus, rect read, and conditional scroll path");
  const [targetGuard, directFocus, rectStatement, visibilityGuard] = focusHelper.body.statements;
  assert(ts.isIfStatement(targetGuard) && targetGuard.expression.getText(tree) === "!target" && ts.isReturnStatement(targetGuard.thenStatement), "focus helper must safely ignore a missing target");
  assert(ts.isExpressionStatement(directFocus) && ts.isCallExpression(directFocus.expression) && directFocus.expression.expression.getText(tree) === "target.focus", "focus helper must focus the selected target directly");
  assert.match(directFocus.getText(tree), /preventScroll\s*:\s*true/, "focus helper must preserve the restored scroll before measuring visibility");
  assert(ts.isVariableStatement(rectStatement) && rectStatement.declarationList.declarations.length === 1 && rectStatement.declarationList.declarations[0].name.getText(tree) === "rect" && rectStatement.declarationList.declarations[0].initializer?.getText(tree) === "target.getBoundingClientRect()", "focus helper must read the focused target rectangle after focus");
  assert(ts.isIfStatement(visibilityGuard), "focus helper must conditionally scroll only an offscreen target");
  assert.match(visibilityGuard.expression.getText(tree), /rect\.top\s*<\s*topOcclusionBoundary\(\)/, "visibility check must use the live AppShell top boundary");
  assert.match(visibilityGuard.expression.getText(tree), /rect\.bottom\s*>\s*window\.innerHeight\s*-\s*FOCUS_VISIBILITY_MARGIN/, "visibility check must include the target bottom and viewport focus margin");
  assert(ts.isBlock(visibilityGuard.thenStatement) && visibilityGuard.thenStatement.statements.length === 6, "offscreen path must expose nearest scroll, remeasurement, visible boundaries, and correction in order");
  const [nearestScroll, correctedRectStatement, correctedTopStatement, correctedBottomStatement, availableHeightStatement, correctionGuard] = visibilityGuard.thenStatement.statements;
  assert(ts.isExpressionStatement(nearestScroll) && ts.isCallExpression(nearestScroll.expression) && nearestScroll.expression.expression.getText(tree) === "target.scrollIntoView", "offscreen path must directly scroll the focused target into view");
  assert.match(nearestScroll.getText(tree), /block:\s*"nearest"/, "offscreen target must use nearest block scrolling");
  assert.match(nearestScroll.getText(tree), /inline:\s*"nearest"/, "offscreen target must use nearest inline scrolling");
  assert(ts.isVariableStatement(correctedRectStatement) && correctedRectStatement.declarationList.declarations[0]?.name.getText(tree) === "correctedRect" && correctedRectStatement.declarationList.declarations[0]?.initializer?.getText(tree) === "target.getBoundingClientRect()", "nearest scroll must be followed by a fresh target rectangle");
  assert(ts.isVariableStatement(correctedTopStatement) && correctedTopStatement.declarationList.declarations[0]?.name.getText(tree) === "correctedTop" && correctedTopStatement.declarationList.declarations[0]?.initializer?.getText(tree) === "topOcclusionBoundary()", "nearest scroll must be followed by a fresh AppShell boundary");
  assert(ts.isVariableStatement(correctedBottomStatement) && correctedBottomStatement.declarationList.declarations[0]?.name.getText(tree) === "correctedBottom" && correctedBottomStatement.declarationList.declarations[0]?.initializer?.getText(tree) === "window.innerHeight - FOCUS_VISIBILITY_MARGIN", "nearest scroll must retain focus-ring room at the viewport bottom");
  assert(ts.isVariableStatement(availableHeightStatement) && availableHeightStatement.declarationList.declarations[0]?.name.getText(tree) === "availableHeight" && availableHeightStatement.declarationList.declarations[0]?.initializer?.getText(tree) === "correctedBottom - correctedTop", "correction must derive the visible height between shell and viewport boundaries");
  assert(ts.isIfStatement(correctionGuard) && correctionGuard.expression.getText(tree) === "correctedRect.height > availableHeight || correctedRect.top < correctedTop" && ts.isBlock(correctionGuard.thenStatement) && correctionGuard.thenStatement.statements.length === 1, "tall targets must prioritize top alignment before ordinary top occlusion");
  const topCorrection = correctionGuard.thenStatement.statements[0];
  assert(ts.isExpressionStatement(topCorrection) && ts.isCallExpression(topCorrection.expression) && topCorrection.expression.expression.getText(tree) === "window.scrollBy", "top overlay correction must directly adjust window scroll");
  assert.match(topCorrection.getText(tree), /top:\s*correctedRect\.top\s*-\s*correctedTop/, "top correction must use the measured overlap, not a hardcoded header height");
  const bottomGuard = correctionGuard.elseStatement;
  assert(bottomGuard && ts.isIfStatement(bottomGuard) && bottomGuard.expression.getText(tree) === "correctedRect.bottom > correctedBottom" && ts.isBlock(bottomGuard.thenStatement) && bottomGuard.thenStatement.statements.length === 1, "ordinary targets below the visible bottom must receive a separate correction");
  const bottomCorrection = bottomGuard.thenStatement.statements[0];
  assert(ts.isExpressionStatement(bottomCorrection) && ts.isCallExpression(bottomCorrection.expression) && bottomCorrection.expression.expression.getText(tree) === "window.scrollBy", "bottom correction must directly adjust window scroll");
  assert.match(bottomCorrection.getText(tree), /top:\s*correctedRect\.bottom\s*-\s*correctedBottom/, "bottom correction must use the measured focus-ring overflow with the correct sign");
  const fn = directFunction(tree, "ListReturnState");
  const liveReturn = finalReturn(fn, "ListReturnState");
  assert.equal(directVariable(fn.body, "canonicalUrl", "ListReturnState").getText(tree), "canonicalListUrl(listUrl)", "live component must canonicalize its real listUrl prop");
  const rootDivs = visit(liveReturn, (node) => ts.isJsxOpeningElement(node) && node.tagName.getText(tree) === "div" && jsxAttribute(node, "ref")?.getText(tree).includes("rootRef"));
  assert.equal(rootDivs.length, 1, "ListReturnState must return one live rootRef wrapper");
  assert(liveReturn.getText(tree).includes("{children}"), "ListReturnState must render its children");

  const effectStatements = fn.body.statements.filter((statement) => ts.isExpressionStatement(statement)
    && ts.isCallExpression(statement.expression)
    && statement.expression.expression.getText(tree) === "useEffect");
  assert.equal(effectStatements.length, 2, "ListReturnState must have one restore effect and one activation effect");
  const effects = effectStatements.map((statement) => statement.expression.arguments[0]);
  assert(effects.every((effect) => effect && ts.isArrowFunction(effect) && ts.isBlock(effect.body)), "both effects must use direct block callbacks");
  const restoreEffect = effects.find((effect) => effect.body.getText(tree).includes("requestAnimationFrame"));
  const activationEffect = effects.find((effect) => effect.body.getText(tree).includes("addEventListener"));
  assert(restoreEffect && activationEffect, "restore and activation effects must remain live and distinct");

  const frameStatements = restoreEffect.body.statements.filter((statement) => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "frame"));
  assert.equal(frameStatements.length, 1, "restore effect must declare one live animation frame");
  const frameStatement = frameStatements[0];
  assertReachableStatement(restoreEffect.body, frameStatement, "restore animation frame");
  const frameDeclaration = frameStatement.declarationList.declarations.find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "frame");
  const frameCall = unwrap(frameDeclaration.initializer);
  assert(ts.isCallExpression(frameCall) && ts.isPropertyAccessExpression(frameCall.expression) && frameCall.expression.getText(tree) === "window.requestAnimationFrame", "live frame binding must call window.requestAnimationFrame directly");
  const frameCallback = frameCall.arguments[0];
  assert(frameCallback && ts.isArrowFunction(frameCallback) && ts.isBlock(frameCallback.body), "restore frame must be a direct callback");
  assert.equal(frameCallback.body.statements.length, 1, "restore frame must expose one direct try/finally path");
  const restoreTry = frameCallback.body.statements[0];
  assert(ts.isTryStatement(restoreTry) && restoreTry.finallyBlock && !restoreTry.catchClause, "restore frame must use one direct try/finally");
  const restorePath = restoreTry.tryBlock.statements;
  assert.equal(restorePath.length, 5, "restore try path must contain scroll, root, exact, fallback, and focus in order");
  const scrollStatement = restorePath[0];
  assert(ts.isExpressionStatement(scrollStatement) && ts.isCallExpression(unwrap(scrollStatement.expression)) && unwrap(scrollStatement.expression).expression.getText(tree) === "window.scrollTo", "restore path must first restore scroll");
  assert.match(scrollStatement.getText(tree), /top:\s*state\.scrollY/, "scroll restore must use the saved position");
  const rootStatement = restorePath[1];
  assert(ts.isVariableStatement(rootStatement) && rootStatement.declarationList.declarations.length === 1 && rootStatement.declarationList.declarations[0].name.getText(tree) === "root" && rootStatement.declarationList.declarations[0].initializer?.getText(tree) === "rootRef.current", "restore path must next bind the live wrapper root");
  const exactStatement = restorePath[2];
  assert(ts.isVariableStatement(exactStatement) && exactStatement.declarationList.declarations.length === 1 && exactStatement.declarationList.declarations[0].name.getText(tree) === "exact", "restore path must next bind the exact trigger");
  const exactInitializer = exactStatement.declarationList.declarations[0].initializer;
  assert(exactInitializer, "exact trigger must have a live initializer");
  const exactCalls = visit(exactInitializer, ts.isCallExpression);
  assert.equal(callNamed(exactCalls, tree, "querySelectorAll").filter((call) => call.arguments[0]?.getText(tree).includes("data-list-return-trigger")).length, 1, "exact restore must query stable trigger elements");
  const findCalls = callNamed(exactCalls, tree, "find");
  assert.equal(findCalls.length, 1, "exact restore must perform one stable identity lookup");
  assert.match(findCalls[0].getText(tree), /candidate\.dataset\.listReturnTrigger\s*===\s*state\.triggerKey/, "exact restore must compare stable identity, not text or position");
  const fallbackStatement = restorePath[3];
  assert(ts.isVariableStatement(fallbackStatement) && fallbackStatement.declarationList.declarations.length === 1 && fallbackStatement.declarationList.declarations[0].name.getText(tree) === "fallback", "restore path must next bind the fallback landmark");
  const fallbackInitializer = fallbackStatement.declarationList.declarations[0].initializer;
  assert(fallbackInitializer && visit(fallbackInitializer, ts.isCallExpression).some((call) => callNamed([call], tree, "querySelector").length === 1 && call.arguments[0]?.getText(tree).includes("data-list-return-fallback")), "fallback restore must query the stable result landmark");
  const focusStatement = restorePath[4];
  assert(ts.isExpressionStatement(focusStatement) && ts.isCallExpression(unwrap(focusStatement.expression)), "restore path must end by focusing one selected target");
  const focusCall = unwrap(focusStatement.expression);
  assert(ts.isIdentifier(focusCall.expression) && focusCall.expression.text === "focusRestoredTarget", "restore path must call the shared visible-focus helper directly");
  assert.equal(focusCall.arguments.length, 1, "restore path must select one focus target");
  assert.match(focusCall.arguments[0].getText(tree), /^exact\s*\?\?\s*fallback$/, "exact trigger must take priority over fallback");
  assert.equal(restoreTry.finallyBlock.statements.length, 1, "restore cleanup must have one direct action");
  const clearStatement = restoreTry.finallyBlock.statements[0];
  assert(ts.isExpressionStatement(clearStatement) && ts.isCallExpression(clearStatement.expression) && clearStatement.expression.expression.getText(tree) === "clearStoredState" && clearStatement.expression.arguments[0]?.getText(tree) === "key", "restore cleanup must directly clear the same storage key");

  const restoreCleanup = restoreEffect.body.statements.at(-1);
  assert(ts.isReturnStatement(restoreCleanup) && restoreCleanup.expression && ts.isArrowFunction(restoreCleanup.expression), "restore effect must end with a direct cleanup return");
  assertReachableStatement(restoreEffect.body, restoreCleanup, "restore effect cleanup");
  const cancelCall = unwrap(restoreCleanup.expression.body);
  assert(ts.isCallExpression(cancelCall) && ts.isPropertyAccessExpression(cancelCall.expression) && cancelCall.expression.getText(tree) === "window.cancelAnimationFrame" && cancelCall.arguments[0]?.getText(tree) === "frame", "restore cleanup must directly cancel the live frame");

  const remember = unwrap(directVariable(activationEffect.body, "rememberTrigger", "activation effect"));
  assert(ts.isArrowFunction(remember) && ts.isBlock(remember.body), "rememberTrigger must remain a direct block callback");
  const writes = remember.body.statements.filter((statement) => ts.isExpressionStatement(statement) && statement.expression.getText(tree).startsWith("writeStoredState("));
  assert.equal(writes.length, 1, "activation callback must perform one final storage write");
  assert.equal(remember.body.statements.at(-1), writes[0], "storage write must remain the final activation statement");
  assertReachableStatement(remember.body, writes[0], "activation storage write");
  const rememberText = remember.body.getText(tree);
  assert.match(rememberText, /closest<HTMLElement>\("\[data-list-return-trigger\]"\)/, "activation must resolve the stable trigger from the actual click target");
  assert.match(rememberText, /root\.contains\(trigger\)/, "activation must reject triggers outside its live wrapper");
  assert.match(rememberText, /shouldRememberActivation\(\{/, "modifier and new-tab policy must gate the live write");
  assert.match(rememberText, /download:\s*trigger\s+instanceof\s+HTMLAnchorElement\s*&&\s*trigger\.hasAttribute\("download"\)/, "live activation must pass the real anchor download fact into policy");
  assert.match(rememberText, /trigger\.dataset\.listReturnTrigger/, "activation must store the stable trigger id");
  assert.match(writes[0].getText(tree), /scrollY:\s*window\.scrollY/, "activation must store the real scroll position");

  const listenerStatement = activationEffect.body.statements.at(-2);
  assert(ts.isExpressionStatement(listenerStatement) && ts.isCallExpression(listenerStatement.expression) && listenerStatement.expression.expression.getText(tree) === "root.addEventListener", "activation effect must directly register its live listener");
  assert.equal(listenerStatement.expression.arguments[0]?.getText(tree), '"click"', "activation listener must handle clicks");
  assert.equal(listenerStatement.expression.arguments[1]?.getText(tree), "rememberTrigger", "activation listener must use the live rememberTrigger callback");
  assertReachableStatement(activationEffect.body, listenerStatement, "activation listener registration");
  const listenerCleanup = activationEffect.body.statements.at(-1);
  assert(ts.isReturnStatement(listenerCleanup) && listenerCleanup.expression && ts.isArrowFunction(listenerCleanup.expression), "activation effect must end with a direct cleanup return");
  const removeCall = unwrap(listenerCleanup.expression.body);
  assert(ts.isCallExpression(removeCall) && removeCall.expression.getText(tree) === "root.removeEventListener", "activation cleanup must directly remove its listener");
  assert.equal(removeCall.arguments[0]?.getText(tree), '"click"', "activation cleanup must remove the click listener");
  assert.equal(removeCall.arguments[1]?.getText(tree), "rememberTrigger", "activation cleanup must remove the same live rememberTrigger callback");
}

function analyzeAppNav(source) {
  const tree = parse(source, "app-nav.tsx");
  const fn = directFunction(tree, "AppNav");
  const liveReturn = finalReturn(fn, "AppNav");
  const markedHeaders = visit(liveReturn, (node) => ts.isJsxElement(node)
    && node.openingElement.tagName.getText(tree) === "header"
    && Boolean(jsxAttribute(node.openingElement, "data-app-shell-top-occluder")));
  assert.equal(markedHeaders.length, 2, "AppNav must mark exactly its real mobile and desktop top headers");
  for (const header of markedHeaders) assertReachable(header, liveReturn, "AppShell top occluder marker");
  const classes = markedHeaders.map((header) => jsxStringAttribute(header.openingElement, "className"));
  assert.equal(classes.filter((value) => value.includes("app-mobile-header") && value.includes("sticky") && value.includes("top-0") && value.includes("lg:hidden")).length, 1, "the real mobile sticky header must own one semantic occluder marker");
  assert.equal(classes.filter((value) => value.includes("app-desktop-header") && value.includes("fixed") && value.includes("top-0") && value.includes("lg:flex")).length, 1, "the real desktop fixed header must own one semantic occluder marker");
}

function compileFunction(source, filename, name) {
  const tree = parse(source, filename);
  const fn = directFunction(tree, name);
  const output = ts.transpileModule(`${fn.getText(tree)}\nmodule.exports = ${name};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const context = { module: { exports: undefined }, exports: {}, URL, URLSearchParams, decodeURIComponent };
  vm.runInNewContext(output, context, { filename: `${name}.cjs` });
  return context.module.exports;
}

function runReturnToBoundaryChecks() {
  const party = compileFunction(sources.partyProfile, "party-profile.ts", "normalizePartyReturnTo");
  const property = compileFunction(sources.propertyEdit, "properties-edit.tsx", "normalizeReturnTo");
  const partyCases = [
    ["/parties?q=Alpha&type=individual&lifecycle=archived&page=2", "/parties?q=Alpha&type=individual&lifecycle=archived&page=2"],
    ["/organize-center?type=party&q=Alpha&lifecycle=all&page=2", "/organize-center?type=party&q=Alpha&lifecycle=all&page=2"],
    ["https://evil.example/parties", "/parties"], ["//evil.example/parties", "/parties"], ["/parties/../admin", "/parties"],
    ["/parties#private", "/parties"], ["/parties?admin=true", "/parties"], ["/organize-center?type=property", "/parties"], ["/\\evil", "/parties"],
  ];
  const propertyCases = [
    ["/properties?q=Tokyo&lifecycle=all&sort=price&page=2", "/properties?q=Tokyo&lifecycle=all&sort=price&page=2"],
    ["/organize-center?type=property&q=Tokyo&lifecycle=all&page=2", "/organize-center?type=property&q=Tokyo&lifecycle=all&page=2"],
    ["https://evil.example/properties", "/properties"], ["//evil.example/properties", "/properties"], ["/properties/../admin", "/properties"],
    ["/properties?admin=true", "/properties"], ["/organize-center?type=party", "/properties"], ["/\\evil", "/properties"],
  ];
  for (const [input, expected] of partyCases) assert.equal(party(input), expected, `party returnTo boundary mismatch for ${input}`);
  for (const [input, expected] of propertyCases) assert.equal(property(input), expected, `property returnTo boundary mismatch for ${input}`);
}

analyzeComponent(sources.component);
analyzeAppNav(sources.appNav);
runPureBehavior(sources.component);
for (const spec of pageSpecs) analyzePage(sources[spec.key], spec);
runReturnToBoundaryChecks();

expectReplacementFailure(sources.component, "parsed.searchParams.sort();", "void parsed.searchParams;", "unsorted key", runPureBehavior, "unsorted canonical key");
expectReplacementFailure(sources.component, 'return !facts.target || facts.target === "_self";', "return true;", "new-tab policy", runPureBehavior, "new-tab activation policy");
expectReplacementFailure(sources.component, " || facts.download", "", "download policy", runPureBehavior, "download activation policy");
expectReplacementFailure(sources.component, 'download: trigger instanceof HTMLAnchorElement && trigger.hasAttribute("download"),', "download: false,", "live download fact", analyzeComponent, "constant-false live download fact");
expectReplacementFailure(sources.component, "focusRestoredTarget(exact ?? fallback)", "focusRestoredTarget(fallback ?? exact)", "fallback priority", analyzeComponent, "fallback before exact");
expectReplacementFailure(sources.component, "clearStoredState(key);\n      }\n    });", "void key;\n      }\n    });", "restore cleanup", analyzeComponent, "missing restore cleanup");
expectReplacementFailure(sources.component, '        window.scrollTo({ top: state.scrollY, behavior: "auto" });', '        const deadRestore = () => window.scrollTo({ top: state.scrollY, behavior: "auto" });', "dead restore helper", analyzeComponent, "restore hidden in an uncalled helper");
expectReplacementFailure(sources.component, 'root.addEventListener("click", rememberTrigger);', 'root.addEventListener("click", () => {});', "noop listener", analyzeComponent, "noop live listener");
expectReplacementFailure(sources.component, '    return () => window.cancelAnimationFrame(frame);', '    const deadCancel = () => window.cancelAnimationFrame(frame);\n    return () => {};', "dead cancel helper", analyzeComponent, "cancel hidden in an uncalled helper");
expectReplacementFailure(sources.component, '    target.scrollIntoView({ block: "nearest", inline: "nearest" });', "    void target;", "missing offscreen scroll", analyzeComponent, "missing offscreen visibility recovery");
expectReplacementFailure(sources.component, "  if (rect.top < topOcclusionBoundary() || rect.bottom > window.innerHeight - FOCUS_VISIBILITY_MARGIN) {", "  if (false) {", "constant-false visibility check", runPureBehavior, "constant-false offscreen visibility recovery");
expectReplacementFailure(sources.component, "  if (rect.top < topOcclusionBoundary() || rect.bottom > window.innerHeight - FOCUS_VISIBILITY_MARGIN) {", "  if (true) {", "unconditional visibility scroll", runPureBehavior, "unconditional visibility scrolling");
expectReplacementFailure(sources.component, "bottom = Math.max(bottom, rect.bottom);", "bottom = rect.bottom;", "first occluder only", analyzeComponent, "multiple occluders without max boundary");
expectReplacementFailure(sources.component, '      style.display === "none"\n      || ', "      ", "hidden occluder filter", analyzeComponent, "display-none occluder counted as visible");
expectReplacementFailure(sources.component, "rect.top < topOcclusionBoundary()", "rect.top < 64", "hardcoded desktop boundary", analyzeComponent, "hardcoded AppShell header height");
expectReplacementFailure(sources.component, '      window.scrollBy({ top: correctedRect.top - correctedTop, behavior: "auto" });', "      void correctedTop;", "missing top correction", analyzeComponent, "nearest scroll without top-overlay correction");
expectReplacementFailure(sources.component, "correctedRect.height > availableHeight || ", "", "missing tall target priority", runPureBehavior, "tall fallback without top priority");
expectReplacementFailure(sources.component, "    } else if (correctedRect.bottom > correctedBottom) {\n      window.scrollBy({ top: correctedRect.bottom - correctedBottom, behavior: \"auto\" });\n", "", "missing bottom correction", analyzeComponent, "nearest scroll with top-only correction");
expectReplacementFailure(sources.component, "} else if (correctedRect.bottom > correctedBottom) {", "} else if (false) {", "constant-false bottom correction", runPureBehavior, "constant-false bottom visibility correction");
expectReplacementFailure(sources.component, "correctedRect.bottom - correctedBottom", "correctedBottom - correctedRect.bottom", "reversed bottom correction", analyzeComponent, "bottom correction with reversed scroll sign");

const appNavWithoutMarkers = sources.appNav.replaceAll(" data-app-shell-top-occluder", "");
assert.notEqual(appNavWithoutMarkers, sources.appNav, "AppNav marker removal mutation target must exist");
expectFailure(() => analyzeAppNav(appNavWithoutMarkers), "AppNav without semantic top occluders");
const appNavWrongMarker = replaceOnce(
  replaceOnce(sources.appNav, '<header data-app-shell-top-occluder className="app-mobile-header', '<header className="app-mobile-header', "mobile marker removal"),
  '<div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">',
  '<div data-app-shell-top-occluder className="mx-auto max-w-7xl px-4 py-3 sm:px-6">',
  "mobile marker wrong node",
);
expectFailure(() => analyzeAppNav(appNavWrongMarker), "AppNav marker on a non-header node");

const partyWithoutWrapper = replaceOnce(sources.parties, '<ListReturnState scope="parties" listUrl={returnTo}>', "<div>", "party wrapper open")
  .replace("</ListReturnState>", "</div>");
expectFailure(() => analyzePage(partyWithoutWrapper, pageSpecs[0]), "party without live wrapper");
expectReplacementFailure(sources.parties, "data-list-return-trigger={`party:${party.id}`}", "data-list-return-trigger={`party:${party.name}`}", "party unstable id", (source) => analyzePage(source, pageSpecs[0]), "party trigger using visible text");
expectReplacementFailure(sources.parties, "  return (\n    <div className=\"space-y-6 pb-12\">", "  if (true) return <div />;\n  return (\n    <div className=\"space-y-6 pb-12\">", "party dead final return", (source) => analyzePage(source, pageSpecs[0]), "party live JSX after guaranteed return");
expectReplacementFailure(sources.properties, "data-list-return-trigger={`property:${property.id}`}", "data-list-return-trigger={`property:${property.name}`}", "property unstable id", (source) => analyzePage(source, pageSpecs[1]), "property trigger using visible text");

console.log("list return state contract: PASS");
