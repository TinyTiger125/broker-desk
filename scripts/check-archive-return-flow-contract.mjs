import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const parse = (file, source = read(file)) => ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const walk = (node, predicate, out = []) => { if (predicate(node)) out.push(node); node.forEachChild((child) => { walk(child, predicate, out); }); return out; };
const jsxTag = (node, sf) => ts.isJsxElement(node) ? node.openingElement.tagName.getText(sf) : node.tagName.getText(sf);
const jsxAttribute = (node, name) => node.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText() === name);
const jsxAttributeExpression = (node, name) => {
  const attribute = jsxAttribute(node, name);
  assert.ok(attribute?.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression, `${name} must be a live expression`);
  return attribute.initializer.expression;
};
const unwrap = (node) => {
  let current = node;
  while (current && (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current))) current = current.expression;
  return current;
};

function directFunction(sf, name) {
  const found = sf.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(found?.body, `${name} must remain a top-level function declaration`);
  return found;
}

function staticallyTerminates(statement) {
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
  if (ts.isBlock(statement)) return statement.statements.length > 0 && staticallyTerminates(statement.statements.at(-1));
  if (ts.isIfStatement(statement)) {
    const condition = unwrap(statement.expression).kind;
    if (condition === ts.SyntaxKind.TrueKeyword) return staticallyTerminates(statement.thenStatement);
    if (condition === ts.SyntaxKind.FalseKeyword) return Boolean(statement.elseStatement && staticallyTerminates(statement.elseStatement));
    return Boolean(statement.elseStatement && staticallyTerminates(statement.thenStatement) && staticallyTerminates(statement.elseStatement));
  }
  return false;
}

function finalReachableReturn(fn, sf) {
  const statements = [...fn.body.statements];
  const result = statements.at(-1);
  assert.ok(result && ts.isReturnStatement(result) && result.expression, `${fn.name?.text} must end in its live return`);
  for (const statement of statements.slice(0, -1)) assert.ok(!staticallyTerminates(statement), `${fn.name?.text} live return cannot follow a static terminator`);
  return result;
}

function assertReachableStatement(block, target, label) {
  const index = block.statements.indexOf(target);
  assert.ok(index >= 0, `${label} must be a direct statement in the live block`);
  for (const statement of block.statements.slice(0, index)) {
    assert.ok(!staticallyTerminates(statement), `${label} cannot follow a static terminator`);
  }
  return index;
}

function assertNoDeadAncestor(node, boundary) {
  let current = node;
  while (current && current !== boundary) {
    assert.ok(!ts.isFunctionLike(current), "live evidence cannot be hidden in an uncalled function");
    const parent = current.parent;
    assert.ok(!parent || parent === boundary || !ts.isFunctionLike(parent), "live evidence cannot be hidden in an uncalled function");
    if (parent && ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && parent.right === current) {
      assert.notEqual(unwrap(parent.left).kind, ts.SyntaxKind.FalseKeyword, "live evidence cannot be behind false &&");
    }
    if (parent && ts.isConditionalExpression(parent)) {
      const condition = unwrap(parent.condition).kind;
      if (parent.whenTrue === current) assert.notEqual(condition, ts.SyntaxKind.FalseKeyword, "live evidence cannot be in a false branch");
      if (parent.whenFalse === current) assert.notEqual(condition, ts.SyntaxKind.TrueKeyword, "live evidence cannot be in a false branch");
    }
    current = parent;
  }
}

function oneOpening(rootNode, tag, sf) {
  const nodes = walk(rootNode, (node) => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(sf) === tag);
  assert.equal(nodes.length, 1, `one live ${tag} expected`);
  assertNoDeadAncestor(nodes[0], rootNode);
  return nodes[0];
}

function returnedMapExpression(returnExpression, receiver, sf) {
  const calls = walk(returnExpression, (node) => ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === "map"
    && node.expression.expression.getText(sf) === receiver);
  assert.equal(calls.length, 1, `${receiver}.map must feed the live return once`);
  const callback = calls[0].arguments[0];
  assert.ok(callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)), `${receiver}.map must use a live callback`);
  if (!ts.isBlock(callback.body)) return unwrap(callback.body);
  const rowReturn = callback.body.statements.at(-1);
  assert.ok(rowReturn && ts.isReturnStatement(rowReturn) && rowReturn.expression, `${receiver}.map must end in its live row return`);
  for (const statement of callback.body.statements.slice(0, -1)) assert.ok(!staticallyTerminates(statement), `${receiver}.map live row cannot follow a terminator`);
  return unwrap(rowReturn.expression);
}

function injectStaticEarlyReturn(file, source, name) {
  const sf = parse(file, source);
  const fn = directFunction(sf, name);
  const liveReturn = finalReachableReturn(fn, sf);
  return `${source.slice(0, liveReturn.getStart(sf))}if (true) return null;\n  ${source.slice(liveReturn.getStart(sf))}`;
}

function topLevelCalls(fn, name) {
  const calls = [];
  for (const statement of fn.body.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
    if (ts.isIdentifier(statement.expression.expression) && statement.expression.expression.text === name) calls.push(statement.expression);
  }
  return calls;
}

function assertLifecycleSuccessRedirect(source) {
  const sf = parse("src/app/actions.ts", source);
  const fn = directFunction(sf, "setRecordLifecycleAction");
  const finalStatement = fn.body.statements.at(-1);
  assert.ok(finalStatement && ts.isExpressionStatement(finalStatement), "lifecycle action must end in its success redirect");
  for (const statement of fn.body.statements.slice(0, -1)) assert.ok(!staticallyTerminates(statement), "lifecycle success redirect cannot follow a static terminator");
  const redirects = topLevelCalls(fn, "redirect").filter((call) => call.parent === finalStatement);
  assert.equal(redirects.length, 1, "lifecycle action must have one live success redirect");
  const argument = redirects[0].arguments[0];
  assert.ok(argument && ts.isCallExpression(argument) && ts.isIdentifier(argument.expression) && argument.expression.text === "withFlash", "success redirect must use withFlash");
  assert.equal(argument.arguments.length, 2, "withFlash must receive return path and lifecycle flash");
  const flash = argument.arguments[1];
  assert.ok(flash && ts.isConditionalExpression(flash), "lifecycle flash must be selected from status");
  assert.equal(flash.whenTrue.getText(sf), '"record_archived"');
  assert.equal(flash.whenFalse.getText(sf), '"record_restored"');
  const selectFlash = Function("status", `return (${flash.getText(sf)});`);
  assert.equal(selectFlash("archived"), "record_archived", "archived status must select the archived success flash");
  assert.equal(selectFlash("active"), "record_restored", "active status must select the restored success flash");
  const returnPath = argument.arguments[0];
  assert.ok(returnPath && ts.isCallExpression(returnPath) && ts.isIdentifier(returnPath.expression) && returnPath.expression.text === "safeReturnTo", "flash must wrap the existing safe return normalizer");
}

function compileClientModule(file, source) {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: file,
    reportDiagnostics: true,
  });
  assert.equal(output.diagnostics?.length ?? 0, 0, `${file} must transpile`);
  const module = { exports: {} };
  const mockRequire = (specifier) => {
    if (specifier === "react") return { useEffect() {}, useRef() { return { current: null }; } };
    if (specifier === "react/jsx-runtime") return { jsx() { return null; }, jsxs() { return null; } };
    throw new Error(`unexpected import ${specifier}`);
  };
  Function("require", "module", "exports", output.outputText)(mockRequire, module, module.exports);
  return module.exports;
}

function withWindow(run, { scrollY = 240, stored = new Map() } = {}) {
  const previous = globalThis.window;
  globalThis.window = {
    scrollY,
    sessionStorage: {
      getItem(key) { return stored.get(key) ?? null; },
      removeItem(key) { stored.delete(key); },
      setItem(key, value) { stored.set(key, value); },
    },
  };
  try {
    return run(stored);
  } finally {
    globalThis.window = previous;
  }
}

function assertReturnIntentBehavior(source) {
  const api = compileClientModule("src/components/list-return-state.tsx", source);
  assert.equal(typeof api.rememberListReturnIntent, "function", "shared return intent writer must be exported");

  const scopeCases = [
    { scope: "parties", listUrl: "/parties?type=all&q=abc", canonical: "/parties?q=abc&type=all", triggerKey: "party:p1", scrollY: 241 },
    { scope: "properties", listUrl: "/properties?sort=updated_desc&lifecycle=active&q=%E7%94%B2", canonical: "/properties?lifecycle=active&q=%E7%94%B2&sort=updated_desc", triggerKey: "property:r1", scrollY: 352 },
    { scope: "organize", listUrl: "/organize-center?type=party&page=2&q=abc", canonical: "/organize-center?page=2&q=abc&type=party", triggerKey: "party:p2", scrollY: 463 },
  ];
  for (const entry of scopeCases) {
    withWindow((stored) => {
      assert.equal(api.rememberListReturnIntent({ scope: entry.scope, listUrl: entry.listUrl, triggerKey: entry.triggerKey }), true, `${entry.scope} intent must be accepted`);
      const key = `list-return-state:${entry.scope}:${entry.canonical}`;
      assert.ok(stored.has(key), `${entry.scope} intent must use its canonical scoped storage key`);
      assert.deepEqual(JSON.parse(stored.get(key)), { scrollY: entry.scrollY, triggerKey: entry.triggerKey }, `${entry.scope} intent must preserve scroll and stable trigger`);
      assert.equal(stored.size, 1, `${entry.scope} intent must not write a second key`);
    }, { scrollY: entry.scrollY });
  }

  withWindow((stored) => {
    stored.set("list-return-state:organize:/organize-center?type=case", JSON.stringify({ scrollY: 840, triggerKey: "case:c1" }));
    assert.equal(api.rememberListReturnIntent({ scope: "organize", listUrl: "/organize-center?type=case", triggerKey: "case:c1", preserveExisting: true }), true);
    assert.deepEqual(JSON.parse(stored.get("list-return-state:organize:/organize-center?type=case")), { scrollY: 840, triggerKey: "case:c1" });
  }, { scrollY: 35 });

  withWindow((stored) => {
    assert.equal(api.rememberListReturnIntent({ scope: "organize", listUrl: "https://evil.example/", triggerKey: "case:c1" }), false);
    assert.equal(stored.size, 0);
  });
}

function assertArchiveButtonIntent(source) {
  const sf = parse("src/components/archive-record-button.tsx", source);
  const fn = directFunction(sf, "ArchiveRecordButton");
  const final = finalReachableReturn(fn, sf);
  const button = oneOpening(final.expression, "Button", sf);
  const onClick = jsxAttributeExpression(button, "onClick");
  assert.ok(ts.isArrowFunction(onClick) && ts.isBlock(onClick.body), "archive click handler must remain an inline block");
  const statements = [...onClick.body.statements];
  const confirmGuardIndex = statements.findIndex((statement) => ts.isIfStatement(statement) && statement.expression.getText(sf).includes("window.confirm"));
  const rememberStatements = statements.filter((statement) => ts.isExpressionStatement(statement)
    && ts.isCallExpression(statement.expression)
    && statement.expression.expression.getText(sf) === "rememberListReturnIntent");
  const transitionStatements = statements.filter((statement) => ts.isExpressionStatement(statement)
    && ts.isCallExpression(statement.expression)
    && statement.expression.expression.getText(sf) === "startTransition");
  assert.equal(rememberStatements.length, 1, "archive click must have one direct live return-intent write");
  assert.equal(transitionStatements.length, 1, "archive click must have one direct live transition submission");
  assert.ok(confirmGuardIndex >= 0, "archive click must retain confirmation guard");
  const guard = statements[confirmGuardIndex];
  assert.ok(ts.isIfStatement(guard) && ts.isReturnStatement(ts.isBlock(guard.thenStatement) ? guard.thenStatement.statements[0] : guard.thenStatement), "cancel must terminate before recording intent");
  const rememberIndex = assertReachableStatement(onClick.body, rememberStatements[0], "return intent");
  const transitionIndex = assertReachableStatement(onClick.body, transitionStatements[0], "transition submission");
  assert.ok(rememberIndex > confirmGuardIndex, "return intent must only be recorded after confirmation passes");
  assert.ok(transitionIndex > rememberIndex, "transition submission must follow the return-intent write");
  const rememberCall = rememberStatements[0].expression;
  const argument = rememberCall.arguments[0];
  assert.ok(argument && ts.isObjectLiteralExpression(argument), "return intent must use the shared structured format");
  const fields = new Map(argument.properties.filter(ts.isPropertyAssignment).map((item) => [item.name.getText(sf), item.initializer.getText(sf)]));
  assert.equal(fields.get("listUrl"), "returnTo");
  assert.equal(fields.get("scope"), "returnStateScope");
  assert.equal(fields.get("triggerKey"), "returnFocusKey");
  assert.equal(fields.get("preserveExisting"), "preserveExistingReturnState");
}

function assertCaller(file, functionName, mapReceiver, expected, source = read(file)) {
  const sf = parse(file, source);
  const fn = directFunction(sf, functionName);
  const liveReturn = finalReachableReturn(fn, sf);
  const liveRoot = mapReceiver ? returnedMapExpression(liveReturn.expression, mapReceiver, sf) : liveReturn.expression;
  const caller = oneOpening(liveRoot, "ArchiveRecordButton", sf);
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(jsxAttributeExpression(caller, name).getText(sf), value, `${file} ${name} must use its stable return intent`);
  }
}

function compileTopLevelFunction(file, source, name) {
  const sf = parse(file, source);
  const fn = directFunction(sf, name);
  const output = ts.transpileModule(`export ${fn.getText(sf)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
    reportDiagnostics: true,
  });
  assert.equal(output.diagnostics?.length ?? 0, 0, `${name} must transpile independently`);
  const module = { exports: {} };
  Function("module", "exports", output.outputText)(module, module.exports);
  return module.exports[name];
}

function compileExpressionEvaluator(file, expression, sf, argumentNames) {
  const output = ts.transpileModule(
    `export function evaluate(${argumentNames.join(", ")}) { return (${expression.getText(sf)}); }`,
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: file,
      reportDiagnostics: true,
    },
  );
  assert.equal(output.diagnostics?.length ?? 0, 0, `${file} live expression must transpile`);
  const module = { exports: {} };
  Function("module", "exports", output.outputText)(module, module.exports);
  return module.exports.evaluate;
}

function assertCaseReturnNormalizer(source) {
  const normalize = compileTopLevelFunction("src/app/cases/[id]/page.tsx", source, "normalizeCaseArchiveReturnTo");
  const fallback = "/organize-center?type=case";
  const cases = [
    ["/organize-center?type=case", fallback],
    ["/organize-center?type=case&q=%E7%94%B2&lifecycle=archived&page=2", "/organize-center?type=case&q=%E7%94%B2&lifecycle=archived&page=2"],
    ["https://evil.example/organize-center?type=case", fallback],
    ["//evil.example/organize-center?type=case", fallback],
    ["/organize-center?type=party", fallback],
    ["/organize-center?type=case&type=party", fallback],
    ["/organize-center?type=case&lifecycle=deleted", fallback],
    ["/organize-center?type=case&page=0", fallback],
    ["/organize-center?type=case&page=two", fallback],
    ["/organize-center?type=case&unexpected=1", fallback],
    ["/organize-center?type=case#row", fallback],
    ["/organize-center/%2e%2e/cases?type=case", fallback],
    ["/organize-center/%5c/cases?type=case", fallback],
    ["/parties?type=case", fallback],
  ];
  for (const [input, expected] of cases) assert.equal(normalize(input), expected, `case archive returnTo mismatch for ${input}`);
  const sf = parse("src/app/cases/[id]/page.tsx", source);
  const page = directFunction(sf, "CasePage");
  const binding = page.body.statements.find((statement) => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "caseArchiveReturnTo"));
  assert.ok(binding, "CasePage must derive the live archive return path");
  const declaration = binding.declarationList.declarations.find((item) => ts.isIdentifier(item.name) && item.name.text === "caseArchiveReturnTo");
  assert.equal(declaration.initializer?.getText(sf), "normalizeCaseArchiveReturnTo(query.returnTo)");
}

const ORGANIZE_FLASH = {
  ja: { recordArchived: "記録を保管しました。", recordRestored: "記録を復元しました。" },
  zh: { recordArchived: "记录已归档。", recordRestored: "记录已恢复。" },
  ko: { recordArchived: "기록을 보관했습니다.", recordRestored: "기록을 복원했습니다." },
};

const LIST_FLASH = {
  "src/app/parties/page.tsx": {
    copyName: "partiesCopy",
    locales: {
      ja: { archivedFeedback: "関係者をアーカイブしました。", restoredFeedback: "関係者を復元しました。" },
      zh: { archivedFeedback: "主体已归档。", restoredFeedback: "主体已恢复。" },
      ko: { archivedFeedback: "관계자를 보관했습니다.", restoredFeedback: "관계자를 복원했습니다." },
    },
  },
  "src/app/properties/page.tsx": {
    copyName: "propertiesCopy",
    locales: {
      ja: { archivedFeedback: "物件をアーカイブしました。", restoredFeedback: "物件を復元しました。" },
      zh: { archivedFeedback: "物件已归档。", restoredFeedback: "物件已恢复。" },
      ko: { archivedFeedback: "매물을 보관했습니다.", restoredFeedback: "매물을 복원했습니다." },
    },
  },
};

function objectProperty(object, name, message) {
  const property = object.properties.find((item) => ts.isPropertyAssignment(item) && item.name.getText().replaceAll('"', "") === name);
  assert.ok(property && ts.isPropertyAssignment(property), message);
  return property;
}

function assertListFlash(file, functionName, source = read(file)) {
  const sf = parse(file, source);
  const expectedCopy = LIST_FLASH[file];
  const copyStatement = sf.statements.find((statement) => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === expectedCopy.copyName));
  assert.ok(copyStatement, `${file} must keep its live locale copy source`);
  const copyBinding = copyStatement.declarationList.declarations.find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === expectedCopy.copyName);
  const copyInitializer = copyBinding?.initializer ? unwrap(copyBinding.initializer) : undefined;
  assert.ok(copyInitializer && ts.isObjectLiteralExpression(copyInitializer), `${file} locale copy must remain an object literal`);
  for (const [locale, fields] of Object.entries(expectedCopy.locales)) {
    const localeProperty = objectProperty(copyInitializer, locale, `${file} must define ${locale} copy`);
    assert.ok(ts.isObjectLiteralExpression(localeProperty.initializer), `${file} ${locale} copy must remain an object literal`);
    for (const [field, expected] of Object.entries(fields)) {
      const fieldProperty = objectProperty(localeProperty.initializer, field, `${file} ${locale}.${field} must exist`);
      assert.ok(ts.isStringLiteral(fieldProperty.initializer), `${file} ${locale}.${field} must remain a literal`);
      assert.equal(fieldProperty.initializer.text, expected, `${file} ${locale}.${field} must retain its independent lifecycle meaning`);
    }
  }
  const fn = directFunction(sf, functionName);
  const liveReturn = finalReachableReturn(fn, sf);
  const banner = oneOpening(liveReturn.expression, "PageFlashBanner", sf);
  assert.equal(jsxAttributeExpression(banner, "message").getText(sf), "flashMessage");
  const flashMap = fn.body.statements.find((statement) => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "flashMap"));
  assert.ok(flashMap && /record_archived:\s*copy\.archivedFeedback[\s\S]*record_restored:\s*copy\.restoredFeedback/.test(flashMap.getText(sf)), `${file} must map both action flashes`);
  const flashMessage = fn.body.statements.find((statement) => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "flashMessage"));
  assert.ok(flashMessage, `${file} must keep a direct live flashMessage declaration`);
  const flashBinding = flashMessage.declarationList.declarations.find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "flashMessage");
  assert.ok(flashBinding?.initializer, `${file} flashMessage must have a live initializer`);
  const selectFlash = compileExpressionEvaluator(file, flashBinding.initializer, sf, ["params", "flashMap"]);
  const sentinel = {
    party_created: Symbol("created"),
    party_updated: Symbol("updated"),
    property_created: Symbol("created"),
    property_updated: Symbol("updated"),
    record_archived: Symbol("archived"),
    record_restored: Symbol("restored"),
  };
  assert.equal(selectFlash({ flash: "record_archived" }, sentinel), sentinel.record_archived, `${file} archived params flash must select archived feedback`);
  assert.equal(selectFlash({ flash: "record_restored" }, sentinel), sentinel.record_restored, `${file} restored params flash must select restored feedback`);
  assert.equal(selectFlash({ flash: "other" }, sentinel), undefined, `${file} unrelated params flash must not select lifecycle feedback`);
  assert.equal(selectFlash({}, sentinel), undefined, `${file} missing params flash must not select lifecycle feedback`);
}

function assertOrganizeSharedReturn(source, pageSource) {
  for (const legacy of ["FOCUS_STORAGE_PREFIX", "RETURN_STATE_STORAGE_PREFIX", "rememberListReturnState", "clearListReturnState", "usePathname", "useSearchParams"]) {
    assert.ok(!source.includes(legacy), `organize must remove legacy restorer: ${legacy}`);
  }
  const sf = parse("src/components/organize-center-object-browser.tsx", source);
  const fn = directFunction(sf, "OrganizeCenterObjectBrowser");
  const liveReturn = finalReachableReturn(fn, sf);
  const sharedOpening = oneOpening(liveReturn.expression, "ListReturnState", sf);
  const shared = ts.isJsxSelfClosingElement(sharedOpening) ? sharedOpening : sharedOpening.parent;
  assert.equal(jsxAttributeExpression(sharedOpening, "scope").getText(sf), '"organize"');
  assert.equal(jsxAttributeExpression(sharedOpening, "listUrl").getText(sf), "listHref");
  const fallbacks = walk(shared, (node) => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && Boolean(jsxAttribute(node, "data-list-return-fallback")));
  assert.equal(fallbacks.length, 1, "organize must provide one accessible missing-target fallback");
  assert.ok(jsxAttribute(fallbacks[0], "tabIndex"), "organize fallback must be programmatically focusable");
  assert.ok(jsxAttribute(fallbacks[0], "aria-label"), "organize fallback must be named");
  const row = returnedMapExpression(liveReturn.expression, "visibleItems", sf);
  const triggers = walk(row, (node) => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && Boolean(jsxAttribute(node, "data-list-return-trigger")));
  assert.equal(triggers.length, 1, "organize object link must use one shared stable trigger template");
  assert.equal(jsxAttributeExpression(triggers[0], "data-list-return-trigger").getText(sf), "`${item.type}:${item.id}`");
  assert.equal(jsxAttributeExpression(triggers[0], "href").getText(sf), "itemHref", "live object link must consume the source-aware href");
  const mapCall = walk(liveReturn.expression, (node) => ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === "map"
    && node.expression.expression.getText(sf) === "visibleItems")[0];
  const callback = mapCall.arguments[0];
  assert.ok(callback && ts.isArrowFunction(callback) && ts.isBlock(callback.body), "organize rows must keep a direct callback body");
  const itemHref = callback.body.statements.find((statement) => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "itemHref"));
  assert.ok(itemHref, "case source returnTo must be derived in the live row callback");
  const itemHrefBinding = itemHref.declarationList.declarations.find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "itemHref");
  assert.ok(itemHrefBinding?.initializer, "live itemHref must have an initializer");
  const selectItemHref = Function("item", "listHref", `return (${itemHrefBinding.initializer.getText(sf)});`);
  const listHref = "/organize-center?type=case&q=%E7%94%B2";
  assert.equal(selectItemHref({ type: "case", id: "c1", href: "/cases/c1" }, listHref), `/cases/c1?returnTo=${encodeURIComponent(listHref)}`, "case itemHref must append the source list to its real detail href");
  assert.equal(selectItemHref({ type: "party", id: "p1", href: "/parties/p1/edit" }, listHref), "/parties/p1/edit", "party itemHref must preserve its real detail href");
  assert.equal(selectItemHref({ type: "property", id: "r1", href: "/properties/r1/edit" }, listHref), "/properties/r1/edit", "property itemHref must preserve its real detail href");

  const page = parse("src/app/organize-center/page.tsx", pageSource);
  const copy = page.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((item) => ts.isIdentifier(item.name) && item.name.text === "copyByLocale"));
  assert.ok(copy, "organize locale copy must remain top-level");
  const copyBinding = copy.declarationList.declarations.find((item) => ts.isIdentifier(item.name) && item.name.text === "copyByLocale");
  const copyInitializer = copyBinding?.initializer ? unwrap(copyBinding.initializer) : undefined;
  assert.ok(copyInitializer && ts.isObjectLiteralExpression(copyInitializer), "organize locale copy must remain an object literal");
  for (const [locale, fields] of Object.entries(ORGANIZE_FLASH)) {
    const localeProperty = objectProperty(copyInitializer, locale, `organize copy must define ${locale}`);
    assert.ok(ts.isObjectLiteralExpression(localeProperty.initializer), `organize ${locale} copy must remain an object literal`);
    for (const [field, expected] of Object.entries(fields)) {
      const fieldProperty = objectProperty(localeProperty.initializer, field, `organize ${locale}.${field} must exist`);
      assert.ok(ts.isStringLiteral(fieldProperty.initializer), `organize ${locale}.${field} must remain a literal`);
      assert.equal(fieldProperty.initializer.text, expected, `organize ${locale}.${field} must retain its independent lifecycle meaning`);
    }
  }
  const pageFn = directFunction(page, "OrganizeCenterPage");
  const pageReturn = finalReachableReturn(pageFn, page);
  const banner = oneOpening(pageReturn.expression, "PageFlashBanner", page);
  assert.equal(jsxAttributeExpression(banner, "message").getText(page), "flashMessage", "live banner must consume the lifecycle flash mapping");
  const flashDeclaration = pageFn.body.statements.find((statement) => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "flashMessage"));
  assert.ok(flashDeclaration, "organize flash must remain a direct live declaration");
  const flashBinding = flashDeclaration.declarationList.declarations.find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "flashMessage");
  assert.ok(flashBinding?.initializer, "organize flash must have a live initializer");
  const selectFlash = Function("params", "copy", `return (${flashBinding.initializer.getText(page)});`);
  const sentinelCopy = { recordArchived: Symbol("archived"), recordRestored: Symbol("restored") };
  assert.equal(selectFlash({ flash: "record_archived" }, sentinelCopy), sentinelCopy.recordArchived, "organize archived flash must select recordArchived copy");
  assert.equal(selectFlash({ flash: "record_restored" }, sentinelCopy), sentinelCopy.recordRestored, "organize restored flash must select recordRestored copy");
  assert.equal(selectFlash({ flash: "other" }, sentinelCopy), undefined, "organize unrelated flash must not show lifecycle feedback");
}

const actions = read("src/app/actions.ts");
assertLifecycleSuccessRedirect(actions);
const listReturnSource = read("src/components/list-return-state.tsx");
assertReturnIntentBehavior(listReturnSource);
assertArchiveButtonIntent(read("src/components/archive-record-button.tsx"));
assertCaller("src/app/parties/page.tsx", "PartiesPage", "visibleParties", { returnTo: "returnTo", returnStateScope: '"parties"', returnFocusKey: "`party:${party.id}`" });
assertCaller("src/app/properties/page.tsx", "PropertiesPage", "visibleProperties", { returnTo: "returnTo", returnStateScope: '"properties"', returnFocusKey: "`property:${property.id}`" });
assertCaller("src/components/organize-center-object-browser.tsx", "OrganizeCenterObjectBrowser", "visibleItems", { returnTo: "listHref", returnStateScope: '"organize"', returnFocusKey: "`${item.type}:${item.id}`" });
assertCaller("src/app/cases/[id]/page.tsx", "CasePage", null, { returnTo: "caseArchiveReturnTo", returnStateScope: '"organize"', returnFocusKey: "`case:${brokerageCase.id}`", preserveExistingReturnState: "true" });
assertCaseReturnNormalizer(read("src/app/cases/[id]/page.tsx"));
assertOrganizeSharedReturn(read("src/components/organize-center-object-browser.tsx"), read("src/app/organize-center/page.tsx"));
assertListFlash("src/app/parties/page.tsx", "PartiesPage");
assertListFlash("src/app/properties/page.tsx", "PropertiesPage");

for (const [file, functionName] of [["src/app/parties/page.tsx", "PartiesPage"], ["src/app/properties/page.tsx", "PropertiesPage"]]) {
  const source = read(file);
  const liveInitializer = 'flashMap[String(params.flash ?? "").trim() as keyof typeof flashMap]';
  const mutations = [
    ["flashMap.record_archived", /restored params flash must select/],
    ['params.flash === "record_archived" ? flashMap.record_restored : params.flash === "record_restored" ? flashMap.record_archived : undefined', /archived params flash must select/],
    ['flashMap["record_restored"]', /archived params flash must select/],
  ];
  for (const [replacement, expectedFailure] of mutations) {
    const mutated = source.replace(liveInitializer, replacement);
    assert.notEqual(mutated, source, `${file} flash initializer mutation target must exist`);
    assert.throws(() => assertListFlash(file, functionName, mutated), expectedFailure);
  }
  for (const [locale, fields] of Object.entries(LIST_FLASH[file].locales)) {
    const target = `    archivedFeedback: ${JSON.stringify(fields.archivedFeedback)},\n    restoredFeedback: ${JSON.stringify(fields.restoredFeedback)},`;
    const swapped = source.replace(
      target,
      `    archivedFeedback: ${JSON.stringify(fields.restoredFeedback)},\n    restoredFeedback: ${JSON.stringify(fields.archivedFeedback)},`,
    );
    assert.notEqual(swapped, source, `${file} ${locale} lifecycle copy swap target must exist`);
    assert.throws(() => assertListFlash(file, functionName, swapped), new RegExp(`${locale}\\.archivedFeedback`));
  }
}

const sharedKeyTarget = "  const key = storageKey(scope, canonicalUrl);";
const wrongPropertiesKey = listReturnSource.replace(sharedKeyTarget, '  const key = scope === "properties" ? "wrong-key" : storageKey(scope, canonicalUrl);');
assert.notEqual(wrongPropertiesKey, listReturnSource, "properties storage-key mutation target must exist");
assert.throws(() => assertReturnIntentBehavior(wrongPropertiesKey), /properties intent must use its canonical scoped storage key/);

const flashConditionTarget = `    safeReturnTo(formData.get("returnTo"), "/organize-center"),
    status === "archived" ? "record_archived" : "record_restored",`;
const reversedFlashCondition = actions.replace(
  flashConditionTarget,
  `    safeReturnTo(formData.get("returnTo"), "/organize-center"),
    status === "active" ? "record_archived" : "record_restored",`,
);
assert.notEqual(reversedFlashCondition, actions, "flash condition reversal mutation target must exist");
assert.throws(() => assertLifecycleSuccessRedirect(reversedFlashCondition), /archived status must select/);

const deadFlash = actions.replace(
  /redirect\(withFlash\([\s\S]*?status === "archived" \? "record_archived" : "record_restored",\n  \)\);/,
  'redirect(safeReturnTo(formData.get("returnTo"), "/organize-center"));\n  function dead() { return withFlash("/organize-center", status === "archived" ? "record_archived" : "record_restored"); }',
);
assert.notEqual(deadFlash, actions, "success redirect mutation target must exist");
assert.throws(() => assertLifecycleSuccessRedirect(deadFlash), /success redirect|withFlash/);

const buttonSource = read("src/components/archive-record-button.tsx");
const rememberBlock = `        rememberListReturnIntent({
          listUrl: returnTo,
          scope: returnStateScope,
          triggerKey: returnFocusKey,
          preserveExisting: preserveExistingReturnState,
        });`;
assert.ok(buttonSource.includes(rememberBlock), "button intent mutation target must exist");
assert.throws(() => assertArchiveButtonIntent(buttonSource.replace(rememberBlock, `{false && (() => { ${rememberBlock.trim()} })()}`)), /one direct live/);
const movedBeforeConfirm = buttonSource.replace(rememberBlock, "").replace("        if (!window.confirm(confirmMessage)) return;", `${rememberBlock}\n        if (!window.confirm(confirmMessage)) return;`);
assert.throws(() => assertArchiveButtonIntent(movedBeforeConfirm), /after confirmation/);
const afterConfirmReturn = buttonSource.replace("        if (!window.confirm(confirmMessage)) return;", "        if (!window.confirm(confirmMessage)) return;\n        if (true) return;");
assert.throws(() => assertArchiveButtonIntent(afterConfirmReturn), /return intent cannot follow a static terminator/);
const afterConfirmThrow = buttonSource.replace("        if (!window.confirm(confirmMessage)) return;", '        if (!window.confirm(confirmMessage)) return;\n        throw new Error("synthetic stop");');
assert.throws(() => assertArchiveButtonIntent(afterConfirmThrow), /return intent cannot follow a static terminator/);
const afterConfirmBothTerminate = buttonSource.replace("        if (!window.confirm(confirmMessage)) return;", '        if (!window.confirm(confirmMessage)) return;\n        if (syntheticCondition) return; else throw new Error("synthetic stop");');
assert.throws(() => assertArchiveButtonIntent(afterConfirmBothTerminate), /return intent cannot follow a static terminator/);
assert.throws(() => assertArchiveButtonIntent(injectStaticEarlyReturn("src/components/archive-record-button.tsx", buttonSource, "ArchiveRecordButton")), /static terminator/);

const callerCases = [
  ["src/app/parties/page.tsx", "PartiesPage", "visibleParties", 'returnStateScope={"parties"}', 'returnStateScope={"organize"}'],
  ["src/app/properties/page.tsx", "PropertiesPage", "visibleProperties", 'returnFocusKey={`property:${property.id}`}', 'returnFocusKey={`property:fixed`}'],
  ["src/components/organize-center-object-browser.tsx", "OrganizeCenterObjectBrowser", "visibleItems", 'returnFocusKey={`${item.type}:${item.id}`}', 'returnFocusKey={`fixed`}'],
  ["src/app/cases/[id]/page.tsx", "CasePage", null, "preserveExistingReturnState={true}", "preserveExistingReturnState={false}"],
];
for (const [file, functionName, mapReceiver, from, to] of callerCases) {
  const source = read(file);
  assert.ok(source.includes(from), `${file} caller mutation target must exist`);
  const expected = file.includes("parties/")
    ? { returnTo: "returnTo", returnStateScope: '"parties"', returnFocusKey: "`party:${party.id}`" }
    : file.includes("properties/")
      ? { returnTo: "returnTo", returnStateScope: '"properties"', returnFocusKey: "`property:${property.id}`" }
      : file.includes("organize-center")
        ? { returnTo: "listHref", returnStateScope: '"organize"', returnFocusKey: "`${item.type}:${item.id}`" }
        : { returnTo: "caseArchiveReturnTo", returnStateScope: '"organize"', returnFocusKey: "`case:${brokerageCase.id}`", preserveExistingReturnState: "true" };
  assert.throws(() => assertCaller(file, functionName, mapReceiver, expected, source.replace(from, to)));
  assert.throws(() => assertCaller(file, functionName, mapReceiver, expected, injectStaticEarlyReturn(file, source, functionName)), /static terminator/);
}

const wrongReturnToCases = [
  ["src/app/parties/page.tsx", "PartiesPage", "visibleParties", "returnTo={returnTo}", "returnTo={clearHref}", { returnTo: "returnTo", returnStateScope: '"parties"', returnFocusKey: "`party:${party.id}`" }],
  ["src/components/organize-center-object-browser.tsx", "OrganizeCenterObjectBrowser", "visibleItems", "returnTo={listHref}", 'returnTo={"/organize-center?type=all"}', { returnTo: "listHref", returnStateScope: '"organize"', returnFocusKey: "`${item.type}:${item.id}`" }],
  ["src/app/cases/[id]/page.tsx", "CasePage", null, "returnTo={caseArchiveReturnTo}", 'returnTo={"/organize-center?type=case"}', { returnTo: "caseArchiveReturnTo", returnStateScope: '"organize"', returnFocusKey: "`case:${brokerageCase.id}`", preserveExistingReturnState: "true" }],
];
for (const [file, functionName, mapReceiver, from, to, expected] of wrongReturnToCases) {
  const source = read(file);
  const mutated = source.replace(from, to);
  assert.notEqual(mutated, source, `${file} returnTo mutation target must exist`);
  assert.throws(() => assertCaller(file, functionName, mapReceiver, expected, mutated), /returnTo/);
}

const organizeBrowser = read("src/components/organize-center-object-browser.tsx");
const organizePage = read("src/app/organize-center/page.tsx");
const wrongListSourceMutation = organizeBrowser.replace("encodeURIComponent(listHref)", "encodeURIComponent('/organize-center?type=case')");
assert.notEqual(wrongListSourceMutation, organizeBrowser, "case list source mutation target must exist");
assert.throws(() => assertOrganizeSharedReturn(wrongListSourceMutation, organizePage), /case itemHref must append/);
const nonCaseHrefMutation = organizeBrowser.replace(": item.href;", ": item.id;");
assert.notEqual(nonCaseHrefMutation, organizeBrowser, "non-case itemHref mutation target must exist");
assert.throws(() => assertOrganizeSharedReturn(nonCaseHrefMutation, organizePage), /party itemHref must preserve/);
const caseHrefTarget = '`${item.href}?returnTo=${encodeURIComponent(listHref)}`';
const hardcodedCaseHrefMutation = organizeBrowser.replace(caseHrefTarget, '`/cases/fixed?returnTo=${encodeURIComponent(listHref)}`');
assert.notEqual(hardcodedCaseHrefMutation, organizeBrowser, "case itemHref mutation target must exist");
assert.throws(() => assertOrganizeSharedReturn(hardcodedCaseHrefMutation, organizePage), /case itemHref must append/);
assert.throws(() => assertOrganizeSharedReturn(`${organizeBrowser}\nconst FOCUS_STORAGE_PREFIX = "legacy";`, organizePage), /legacy restorer/);
assert.throws(() => assertOrganizeSharedReturn(organizeBrowser, organizePage.replace("<PageFlashBanner message={flashMessage} />", "{false && <PageFlashBanner message={flashMessage} />}")), /false/);
const organizeFlashTarget = `params.flash === "record_archived"
    ? copy.recordArchived
    : params.flash === "record_restored"
      ? copy.recordRestored`;
const swappedOrganizeFlash = organizePage.replace(
  organizeFlashTarget,
  `params.flash === "record_archived"
    ? copy.recordRestored
    : params.flash === "record_restored"
      ? copy.recordArchived`,
);
assert.notEqual(swappedOrganizeFlash, organizePage, "organize flash swap mutation target must exist");
assert.throws(() => assertOrganizeSharedReturn(organizeBrowser, swappedOrganizeFlash), /archived flash must select/);
for (const [locale, fields] of Object.entries(ORGANIZE_FLASH)) {
  const target = `    recordArchived: ${JSON.stringify(fields.recordArchived)},\n    recordRestored: ${JSON.stringify(fields.recordRestored)},`;
  const swappedCopy = organizePage.replace(
    target,
    `    recordArchived: ${JSON.stringify(fields.recordRestored)},\n    recordRestored: ${JSON.stringify(fields.recordArchived)},`,
  );
  assert.notEqual(swappedCopy, organizePage, `organize ${locale} lifecycle copy swap target must exist`);
  assert.throws(() => assertOrganizeSharedReturn(organizeBrowser, swappedCopy), new RegExp(`${locale}\\.recordArchived`));
}

const caseSource = read("src/app/cases/[id]/page.tsx");
assert.throws(() => assertCaseReturnNormalizer(caseSource.replace('["type", "q", "lifecycle", "page"]', '["type", "q", "lifecycle", "page", "unexpected"]')), /unexpected/);

console.log("archive return flow contract passed");
