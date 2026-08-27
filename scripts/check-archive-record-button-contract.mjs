import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { Scanner } = require("@tailwindcss/oxide");

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const parse = (file, source = read(file)) => ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const text = (node, sf) => node.getText(sf);
const walk = (node, test, out = []) => { if (test(node)) out.push(node); node.forEachChild((child) => { walk(child, test, out); }); return out; };
const attr = (element, name) => element.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.text === name);
const attrText = (element, name, sf) => { const item = attr(element, name); return item ? text(item, sf) : ""; };
const attrExpression = (element, name) => {
  const item = attr(element, name);
  assert.ok(item?.initializer && ts.isJsxExpression(item.initializer) && item.initializer.expression, `${name} must be a live JSX expression`);
  return item.initializer.expression;
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

function injectStaticEarlyReturn(file, source, name) {
  const sf = parse(file, source);
  const fn = directFunction(sf, name);
  return `${source.slice(0, fn.body.getStart(sf) + 1)}\n  if (true) return null;${source.slice(fn.body.getStart(sf) + 1)}`;
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

function assertNoFalseAncestor(node, boundary, sf) {
  let current = node;
  while (current && current !== boundary) {
    assert.ok(!ts.isFunctionLike(current), "live JSX cannot be hidden inside an uncalled nested function");
    const parent = current.parent;
    assert.ok(!parent || parent === boundary || !ts.isFunctionLike(parent), "live JSX cannot be hidden inside an uncalled nested function");
    if (parent && ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && parent.right === current) {
      assert.notEqual(unwrap(parent.left).kind, ts.SyntaxKind.FalseKeyword, "live JSX cannot be behind false &&");
    }
    if (parent && ts.isConditionalExpression(parent)) {
      const condition = unwrap(parent.condition).kind;
      if (parent.whenTrue === current) assert.notEqual(condition, ts.SyntaxKind.FalseKeyword, "live JSX cannot be in a constant-false branch");
      if (parent.whenFalse === current) assert.notEqual(condition, ts.SyntaxKind.TrueKeyword, "live JSX cannot be in a constant-false branch");
    }
    current = parent;
  }
}

function wrapLiveCallerInDeadArrow(file, source, functionName, mapReceiver, tag = "ArchiveRecordButton") {
  const sf = parse(file, source);
  const fn = directFunction(sf, functionName);
  const liveReturn = finalReachableReturn(fn, sf);
  const liveRoot = mapReceiver ? returnedMapExpression(liveReturn.expression, mapReceiver, sf) : liveReturn.expression;
  const caller = oneOpening(liveRoot, tag, sf);
  const wholeCaller = ts.isJsxSelfClosingElement(caller) ? caller : caller.parent;
  const jsxChild = ts.isJsxElement(wholeCaller.parent) || ts.isJsxFragment(wholeCaller.parent);
  const prefix = jsxChild ? "{() => " : "(() => ";
  const suffix = jsxChild ? "}" : ")";
  return `${source.slice(0, wholeCaller.getStart(sf))}${prefix}${source.slice(wholeCaller.getStart(sf), wholeCaller.end)}${suffix}${source.slice(wholeCaller.end)}`;
}

function injectUnknownTerminatingBranches(file, source, name) {
  const sf = parse(file, source);
  const fn = directFunction(sf, name);
  const liveReturn = finalReachableReturn(fn, sf);
  return `${source.slice(0, liveReturn.getStart(sf))}if (unknownCondition) { return null; } else { throw new Error("dead"); }\n  ${source.slice(liveReturn.getStart(sf))}`;
}

function oneOpening(rootNode, tag, sf) {
  assert.ok(!ts.isFunctionLike(rootNode), `live ${tag} cannot be an uncalled nested function`);
  const nodes = walk(rootNode, (node) => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && text(node.tagName, sf) === tag);
  assert.equal(nodes.length, 1, `one live ${tag} expected`);
  assertNoFalseAncestor(nodes[0], rootNode, sf);
  return nodes[0];
}

function hideLiveTagInObjectMethod(file, source, functionName, tag) {
  const sf = parse(file, source);
  const fn = directFunction(sf, functionName);
  const liveReturn = finalReachableReturn(fn, sf);
  const caller = oneOpening(liveReturn.expression, tag, sf);
  const wholeCaller = ts.isJsxSelfClosingElement(caller) ? caller : caller.parent;
  const replacement = `<>{Boolean({ dead() { return (${wholeCaller.getText(sf)}); } }) ? null : null}</>`;
  return `${source.slice(0, liveReturn.expression.getStart(sf))}${replacement}${source.slice(liveReturn.expression.end)}`;
}

function returnedMapExpression(returnExpression, receiver, sf) {
  const calls = walk(returnExpression, (node) => ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === "map"
    && text(node.expression.expression, sf) === receiver);
  assert.equal(calls.length, 1, `${receiver}.map must feed the live return exactly once`);
  const callback = calls[0].arguments[0];
  assert.ok(callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)), `${receiver}.map needs a live callback`);
  if (!ts.isBlock(callback.body)) return unwrap(callback.body);
  const rowReturn = callback.body.statements.at(-1);
  assert.ok(rowReturn && ts.isReturnStatement(rowReturn) && rowReturn.expression, `${receiver}.map callback must end in its live row return`);
  for (const statement of callback.body.statements.slice(0, -1)) assert.ok(!staticallyTerminates(statement), `${receiver}.map live row cannot follow a static terminator`);
  return unwrap(rowReturn.expression);
}

const SENTINEL_RECORD_LABEL = 'A「长 이름」&<42>';
const EXPECTED_COPY = {
  ja: {
    archive: "保管", restore: "復元", archiving: "保管中…", restoring: "復元中…",
    confirmArchive: `「${SENTINEL_RECORD_LABEL}」を保管しますか？`, confirmRestore: `「${SENTINEL_RECORD_LABEL}」を復元しますか？`,
    accessibleArchive: `${SENTINEL_RECORD_LABEL}を保管`, accessibleRestore: `${SENTINEL_RECORD_LABEL}を復元`,
    accessibleArchiving: `${SENTINEL_RECORD_LABEL}を保管中`, accessibleRestoring: `${SENTINEL_RECORD_LABEL}を復元中`,
  },
  zh: {
    archive: "归档", restore: "恢复", archiving: "归档中…", restoring: "恢复中…",
    confirmArchive: `要归档“${SENTINEL_RECORD_LABEL}”吗？`, confirmRestore: `要恢复“${SENTINEL_RECORD_LABEL}”吗？`,
    accessibleArchive: `归档“${SENTINEL_RECORD_LABEL}”`, accessibleRestore: `恢复“${SENTINEL_RECORD_LABEL}”`,
    accessibleArchiving: `正在归档“${SENTINEL_RECORD_LABEL}”`, accessibleRestoring: `正在恢复“${SENTINEL_RECORD_LABEL}”`,
  },
  ko: {
    archive: "보관", restore: "복원", archiving: "보관 중…", restoring: "복원 중…",
    confirmArchive: `“${SENTINEL_RECORD_LABEL}” 기록을 보관할까요?`, confirmRestore: `“${SENTINEL_RECORD_LABEL}” 기록을 복원할까요?`,
    accessibleArchive: `${SENTINEL_RECORD_LABEL} 보관`, accessibleRestore: `${SENTINEL_RECORD_LABEL} 복원`,
    accessibleArchiving: `${SENTINEL_RECORD_LABEL} 보관 중`, accessibleRestoring: `${SENTINEL_RECORD_LABEL} 복원 중`,
  },
};

function objectProperties(object, sf) {
  assert.ok(ts.isObjectLiteralExpression(unwrap(object)), "copy value must remain a direct object literal");
  return new Map(unwrap(object).properties.filter(ts.isPropertyAssignment).map((property) => [property.name.getText(sf).replaceAll('"', ""), property.initializer]));
}

function evaluateCopyExpression(expression, sf, recordLabel) {
  const value = unwrap(expression);
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text.replace("{recordLabel}", recordLabel);
  if (ts.isArrowFunction(value)) {
    assert.equal(value.parameters.length, 1, "accessible copy must take exactly one record label");
    const parameter = value.parameters[0].name.getText(sf);
    const body = unwrap(value.body);
    if (ts.isNoSubstitutionTemplateLiteral(body)) return body.text;
    assert.ok(ts.isTemplateExpression(body), "accessible copy must remain a direct template expression");
    let rendered = body.head.text;
    for (const span of body.templateSpans) {
      assert.equal(span.expression.getText(sf), parameter, "accessible copy may interpolate only its record label");
      rendered += recordLabel + span.literal.text;
    }
    return rendered;
  }
  assert.fail(`unsupported copy expression: ${value.getText(sf)}`);
}

function assertIndependentCopy(sf) {
  const labelsDeclaration = walk(sf, (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "labels")[0];
  assert.ok(labelsDeclaration?.initializer, "labels must remain a direct frozen implementation object");
  const locales = objectProperties(labelsDeclaration.initializer, sf);
  assert.deepEqual([...locales.keys()], ["ja", "zh", "ko"], "only the three supported locale branches are allowed");
  for (const [locale, expected] of Object.entries(EXPECTED_COPY)) {
    const fields = objectProperties(locales.get(locale), sf);
    for (const [field, expectedValue] of Object.entries(expected)) {
      assert.ok(fields.has(field), `${locale}.${field} is required`);
      assert.equal(evaluateCopyExpression(fields.get(field), sf, SENTINEL_RECORD_LABEL), expectedValue, `${locale}.${field} must preserve action and record identity`);
    }
  }
}

function evaluateStateField(expression, state, sf) {
  const node = unwrap(expression);
  if (ts.isConditionalExpression(node)) {
    const condition = unwrap(node.condition);
    assert.ok(ts.isIdentifier(condition) && Object.hasOwn(state, condition.text), `unsupported state condition ${condition.getText(sf)}`);
    return evaluateStateField(state[condition.text] ? node.whenTrue : node.whenFalse, state, sf);
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(sf) === "copy") return node.expression.name.text;
  if (ts.isPropertyAccessExpression(node) && node.expression.getText(sf) === "copy") return node.name.text;
  assert.fail(`unsupported state copy expression ${node.getText(sf)}`);
}

function assertComponent(source = read("src/components/archive-record-button.tsx")) {
  const file = "src/components/archive-record-button.tsx";
  const sf = parse(file, source);
  const propsType = walk(sf, (node) => ts.isTypeAliasDeclaration(node) && node.name.text === "ArchiveRecordButtonProps")[0];
  assert.ok(propsType && ts.isTypeLiteralNode(propsType.type), "ArchiveRecordButtonProps must remain a type literal");
  const recordLabelProp = propsType.type.members.find((member) => ts.isPropertySignature(member) && member.name?.getText(sf) === "recordLabel");
  assert.ok(recordLabelProp && !recordLabelProp.questionToken && recordLabelProp.type?.kind === ts.SyntaxKind.StringKeyword, "recordLabel must be required");
  assert.match(source, /import\s*\{\s*Button\s*\}\s*from\s*["']@\/components\/ui-foundation["']/, "shared Button required");
  assert.doesNotMatch(source, /tone=["']danger["']|\bdelete\b|削除|删除|삭제/i, "archive must not be presented as delete/danger");
  assertIndependentCopy(sf);
  const fn = directFunction(sf, "ArchiveRecordButton");
  const liveReturn = finalReachableReturn(fn, sf);
  const button = oneOpening(liveReturn.expression, "Button", sf);
  assert.equal(attrText(button, "controlSize", sf), 'controlSize="touch"', "live Button must use touch size");
  assert.equal(attrText(button, "loading", sf), "loading={isPending}", "live Button must expose pending state");
  assert.match(attrText(button, "aria-label", sf), /recordLabel/, "live Button accessible name must use recordLabel");
  for (const field of ["accessibleArchive", "accessibleRestore", "accessibleArchiving", "accessibleRestoring"]) assert.match(attrText(button, "aria-label", sf), new RegExp(`copy\\.${field}`), `live aria-label must use ${field}`);
  const ariaExpression = attrExpression(button, "aria-label");
  const ariaTruthTable = [
    [{ isPending: false, isArchived: false }, "accessibleArchive"],
    [{ isPending: false, isArchived: true }, "accessibleRestore"],
    [{ isPending: true, isArchived: false }, "accessibleArchiving"],
    [{ isPending: true, isArchived: true }, "accessibleRestoring"],
  ];
  for (const [state, expected] of ariaTruthTable) assert.equal(evaluateStateField(ariaExpression, state, sf), expected, `aria state mapping ${JSON.stringify(state)}`);
  assert.ok(ts.isJsxElement(button.parent), "live Button must retain its visible children");
  const visibleExpressions = button.parent.children.filter((child) => ts.isJsxExpression(child) && child.expression).map((child) => child.expression);
  assert.equal(visibleExpressions.length, 1, "live Button must expose one visible state label expression");
  const visibleTruthTable = [
    [{ isPending: false, isArchived: false }, "archive"],
    [{ isPending: false, isArchived: true }, "restore"],
    [{ isPending: true, isArchived: false }, "archiving"],
    [{ isPending: true, isArchived: true }, "restoring"],
  ];
  for (const [state, expected] of visibleTruthTable) assert.equal(evaluateStateField(visibleExpressions[0], state, sf), expected, `visible state mapping ${JSON.stringify(state)}`);
  assert.match(attrText(button, "tone", sf), /isArchived[\s\S]*quiet[\s\S]*warning/, "restore stays quiet and archive uses warning, never danger");
  const onClick = attrText(button, "onClick", sf);
  assert.match(onClick, /copy\.confirmArchive/, "live confirmation must use archive copy");
  assert.match(onClick, /copy\.confirmRestore/, "live confirmation must use restore copy");
  const onClickExpression = attrExpression(button, "onClick");
  const confirmDeclarations = walk(onClickExpression, (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "confirmMessage");
  assert.equal(confirmDeclarations.length, 1, "live click handler must derive one confirmMessage");
  const confirmConditional = walk(confirmDeclarations[0].initializer, ts.isConditionalExpression);
  assert.equal(confirmConditional.length, 1, "confirmMessage must have one archived-state choice");
  assert.equal(evaluateStateField(confirmConditional[0], { isArchived: false }, sf), "confirmArchive", "active records require archive confirmation");
  assert.equal(evaluateStateField(confirmConditional[0], { isArchived: true }, sf), "confirmRestore", "archived records require restore confirmation");
  assert.match(onClick, /window\.confirm\(confirmMessage\)/, "live action must confirm the named record");
  assert.match(onClick, /startTransition\(async\s*\(\)\s*=>\s*\{[\s\S]*await\s+setRecordLifecycleAction\(formData\)/, "live pending action must await lifecycle Action");
  return true;
}

const CALLERS = [
  ["src/app/parties/page.tsx", "PartiesPage", "visibleParties", "party.name", "canArchive"],
  ["src/app/properties/page.tsx", "PropertiesPage", "visibleProperties", "property.name", "property.canArchive"],
  ["src/app/cases/[id]/page.tsx", "CasePage", null, "brokerageCase.caseTitle", "canArchiveCase"],
  ["src/components/organize-center-object-browser.tsx", "OrganizeCenterObjectBrowser", "visibleItems", "item.title", "item.canArchive"],
];

function assertCaller(file, functionName, mapReceiver, label, gate, source = read(file)) {
  const sf = parse(file, source);
  const fn = directFunction(sf, functionName);
  const liveReturn = finalReachableReturn(fn, sf);
  const liveRoot = mapReceiver ? returnedMapExpression(liveReturn.expression, mapReceiver, sf) : liveReturn.expression;
  const caller = oneOpening(liveRoot, "ArchiveRecordButton", sf);
  assert.match(attrText(caller, "recordLabel", sf), new RegExp(label.replace(".", "\\.")), `${file}: real record label`);
  let current = caller.parent;
  let gateExpression = "";
  while (current && current !== liveRoot) {
    if (ts.isConditionalExpression(current)) { gateExpression = text(current.condition, sf); break; }
    if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) { gateExpression = text(current.left, sf); break; }
    current = current.parent;
  }
  assert.equal(gateExpression, gate, `${file}: live caller must be gated by ${gate}`);
  assert.ok(!text(caller, sf).includes('recordLabel="'), `${file}: fixed label forbidden`);
}

function assertOrganizePage(source = read("src/app/organize-center/page.tsx")) {
  const sf = parse("src/app/organize-center/page.tsx", source);
  const fn = directFunction(sf, "OrganizeCenterContent");
  const liveReturn = finalReachableReturn(fn, sf);
  const variables = new Map();
  for (const statement of fn.body.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name) && declaration.initializer) variables.set(declaration.name.text, declaration.initializer);
  }
  for (const name of ["caseItems", "partyItems", "propertyItems", "allItems", "browserItems"]) assert.ok(variables.has(name), `${name} must be a live direct dataflow binding`);
  const canArchiveValues = (name) => walk(variables.get(name), (node) => ts.isPropertyAssignment(node) && node.name.getText(sf) === "canArchive").map((node) => text(node.initializer, sf));
  assert.deepEqual(canArchiveValues("caseItems"), ['resolution.outcome === "owner_write" && capabilityCanArchive'], "case archive derives from owner_write plus archive capability");
  assert.deepEqual(canArchiveValues("partyItems"), ["item.canArchive"], "party archive authority comes from the hub object");
  assert.deepEqual(canArchiveValues("propertyItems"), ["item.canArchive"], "property archive authority comes from the hub object");
  assert.match(text(variables.get("allItems"), sf), /caseItems[\s\S]*partyItems[\s\S]*propertyItems/, "allItems must consume all three live object lists");
  assert.match(text(variables.get("browserItems"), sf), /^allItems\.map/);
  assert.deepEqual(canArchiveValues("browserItems"), ["item.canArchive"], "browserItems must preserve archive authority separately");
  const browser = oneOpening(liveReturn.expression, "OrganizeCenterObjectBrowser", sf);
  assert.equal(attrText(browser, "items", sf), "items={browserItems}", "live browser caller must consume browserItems");
}

function assertCapabilityMatrix() {
  const source = read("src/lib/tenant-permissions.ts");
  const section = (name, next) => source.slice(source.indexOf(`${name}: [`), next ? source.indexOf(`${next}: [`) : undefined);
  assert.match(section("company_owner", "company_form_admin"), /FULL_TENANT_ACTIONS/, "owner archive derives from full actions");
  assert.match(section("company_form_admin", "ordinary_member"), /["']record\.archive["']/, "form admin can archive");
  assert.doesNotMatch(section("ordinary_member"), /["']record\.archive["']/, "ordinary member cannot archive");
}

function relativeLuminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((channel) => Number.parseInt(channel, 16) / 255);
  const linear = channels.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function assertSmallTextContrast(foreground, background, state) {
  assert.ok(contrastRatio(foreground, background) >= 4.5, `${state} warning text contrast must be at least 4.5:1`);
}

function cssRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "s"));
  assert.ok(match, `missing CSS rule ${selector}`);
  return match[1];
}

function cssDeclaration(rule, property) {
  const match = rule.match(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`));
  assert.ok(match, `missing ${property} declaration`);
  return match[1].trim();
}

function assertWarningToneStyles(css, tokensSource = read("src/app/globals.css")) {
  const token = (name) => {
    const match = tokensSource.match(new RegExp(`--bd-${name}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(match, `missing semantic token --bd-${name}`);
    return match[1];
  };
  const expected = {
    base: ["var(--bd-warning)", "var(--bd-warning-bg)", token("warning"), token("warning-bg")],
    hover: ["var(--bd-ink)", "var(--bd-warning-line)", token("ink"), token("warning-line")],
    active: ["var(--bd-surface)", "var(--bd-warning)", token("surface"), token("warning")],
  };
  const base = cssRule(css, ".buttonToneWarning");
  const hover = cssRule(css, ".buttonToneWarning:hover");
  const activeMatch = css.match(/\.buttonToneWarning:active,\s*\.buttonToneWarning\[aria-pressed="true"\]\s*\{([^}]*)\}/s);
  assert.ok(activeMatch, "missing shared active/pressed warning rule");
  const active = activeMatch[1];
  for (const [state, rule] of [["base", base], ["hover", hover], ["active", active]]) {
    assert.equal(cssDeclaration(rule, "color"), expected[state][0], `${state} foreground semantic token`);
    assert.equal(cssDeclaration(rule, "background"), expected[state][1], `${state} background semantic token`);
    assertSmallTextContrast(expected[state][2], expected[state][3], state);
  }
}

function assertStyles(built = false) {
  const css = read("src/components/ui-foundation/ui-foundation.module.css");
  assert.match(css, /\.controlSizeTouch\s*\{[^}]*min-height:\s*var\(--bd-control-height-touch\)/s);
  assert.match(css, /\.button:focus-visible,[^{]*\{[^}]*outline:\s*var\(--bd-focus-ring-width\)\s+solid\s+var\(--bd-focus-ring-color\)[^}]*outline-offset:\s*var\(--bd-focus-ring-offset\)/s);
  assertWarningToneStyles(css);
  assert.throws(() => assertSmallTextContrast("#9a5b00", "#e8c779", "synthetic low-contrast"), /at least 4\.5/);
  assert.throws(() => assertSmallTextContrast("#9a5b00", "#9a5b00", "synthetic same-color"), /at least 4\.5/);
  const candidates = new Scanner({ sources: [] }).scanFiles([{ content: read("scripts/check-archive-record-button-contract.mjs"), extension: "mjs" }]);
  assert.ok(!candidates.some((candidate) => candidate.startsWith("bg-[") || candidate.startsWith("text-[") || candidate.startsWith("hover:bg-[")), "checker must not inject arbitrary production color utilities");
  if (!built) return;
  const dir = path.join(root, ".next/static/css");
  const compiled = readdirSync(dir).filter((name) => name.endsWith(".css")).map((name) => readFileSync(path.join(dir, name), "utf8")).join("\n");
  assert.match(compiled, /min-height:var\(--bd-control-height-touch\)/);
  assert.match(compiled, /outline:var\(--bd-focus-ring-width\) solid var\(--bd-focus-ring-color\)/);
  assert.match(compiled, /background:var\(--bd-warning-line\);color:var\(--bd-ink\)/, "built hover warning contrast rule");
  assert.match(compiled, /background:var\(--bd-warning\);color:var\(--bd-surface\)/, "built active warning contrast rule");
}

assertComponent();
for (const args of CALLERS) assertCaller(...args);
assertOrganizePage();
assertCapabilityMatrix();
assertStyles(process.argv.includes("--built-css"));

assert.throws(() => assertComponent(read("src/components/archive-record-button.tsx").replace(/recordLabel:\s*string;?/, "")), /recordLabel/);
for (const [file, functionName, mapReceiver, label, gate] of CALLERS) {
  const source = read(file);
  const mutate = (from, to) => { assert.ok(source.includes(from), `${file} synthetic target must exist: ${from}`); return source.replace(from, to); };
  assert.throws(() => assertCaller(file, functionName, mapReceiver, label, gate, mutate(`recordLabel={${label}}`, 'recordLabel="record"')), /real record label|fixed label/);
  assert.throws(() => assertCaller(file, functionName, mapReceiver, label, gate, mutate(`{${gate} ?`, "{false ?")), /gated|constant-false|one live/);
  assert.throws(() => assertCaller(file, functionName, mapReceiver, label, gate, injectStaticEarlyReturn(file, source, functionName)), /static terminator/);
  assert.throws(() => assertCaller(file, functionName, mapReceiver, label, gate, wrapLiveCallerInDeadArrow(file, source, functionName, mapReceiver)), /uncalled nested function/);
  assert.throws(() => assertCaller(file, functionName, mapReceiver, label, gate, injectUnknownTerminatingBranches(file, source, functionName)), /static terminator/);
  if (mapReceiver && source.includes(`${mapReceiver}.map((`)) {
    const rowTarget = `${mapReceiver}.map((`;
    const callbackBlock = source.indexOf("=> {", source.indexOf(rowTarget));
    if (callbackBlock >= 0) {
      const deadRow = `${source.slice(0, callbackBlock + 4)}\n              if (true) return <li>wrong row</li>;${source.slice(callbackBlock + 4)}`;
      assert.throws(() => assertCaller(file, functionName, mapReceiver, label, gate, deadRow), /live row cannot follow a static terminator/);
    }
  }
}
const organizeSource = read("src/app/organize-center/page.tsx");
assert.throws(() => assertOrganizePage(organizeSource.replaceAll("canArchive: item.canArchive", "canArchive: !item.readOnly")), /archive authority/);
assert.throws(() => assertOrganizePage(organizeSource.replace("items={browserItems}", "items={[]}")), /browser caller/);
assert.throws(() => assertOrganizePage(injectStaticEarlyReturn("src/app/organize-center/page.tsx", organizeSource, "OrganizeCenterContent")), /static terminator/);
assert.throws(() => assertOrganizePage(injectUnknownTerminatingBranches("src/app/organize-center/page.tsx", organizeSource, "OrganizeCenterContent")), /static terminator/);

const componentSource = read("src/components/archive-record-button.tsx");
const deadButton = '  const unused = () => <Button controlSize="touch" loading={isPending} aria-label={recordLabel} />;\n';
assert.throws(() => assertComponent(componentSource
  .replace("  return (", `${deadButton}  return (`)
  .replace("    <Button", "    <button")
  .replace("    </Button>", "    </button>")), /one live Button/);
assert.throws(() => assertComponent(injectUnknownTerminatingBranches("src/components/archive-record-button.tsx", componentSource, "ArchiveRecordButton")), /static terminator/);
assert.throws(() => assertComponent(wrapLiveCallerInDeadArrow("src/components/archive-record-button.tsx", componentSource, "ArchiveRecordButton", null, "Button")), /uncalled nested function/);
assert.throws(() => assertComponent(hideLiveTagInObjectMethod("src/components/archive-record-button.tsx", componentSource, "ArchiveRecordButton", "Button")), /uncalled nested function/);
const accessibleOnlyLabel = componentSource.replace(
  /(accessible(?:Archive|Restore|Archiving|Restoring):\s*\(recordLabel\)\s*=>)\s*[^,\n]+/g,
  '$1 `${recordLabel}`',
);
assert.equal((accessibleOnlyLabel.match(/=> `\$\{recordLabel\}`/g) ?? []).length, 12, "accessible-copy synthetic must mutate all twelve locale actions");
assert.throws(() => assertComponent(accessibleOnlyLabel), /preserve action and record identity/);
const confirmOnlyLabel = componentSource.replace(/(confirm(?:Archive|Restore):)\s*"[^"]+"/g, '$1 "{recordLabel}"');
assert.equal((confirmOnlyLabel.match(/confirm(?:Archive|Restore): "\{recordLabel\}"/g) ?? []).length, 6, "confirm-copy synthetic must mutate all six locale actions");
assert.throws(() => assertComponent(confirmOnlyLabel), /preserve action and record identity/);
const swapTokens = (source, left, right) => source.replaceAll(left, "__SWAP_LEFT__").replaceAll(right, left).replaceAll("__SWAP_LEFT__", right);
const reversedAria = swapTokens(
  swapTokens(componentSource, "copy.accessibleRestoring", "copy.accessibleArchive"),
  "copy.accessibleArchiving",
  "copy.accessibleRestore",
);
assert.throws(() => assertComponent(reversedAria), /aria state mapping/);
const reversedConfirm = swapTokens(componentSource, "copy.confirmRestore", "copy.confirmArchive");
assert.throws(() => assertComponent(reversedConfirm), /confirmation/);
const reversedVisible = swapTokens(
  swapTokens(componentSource, "copy.restoring", "copy.archiving"),
  "copy.restore",
  "copy.archive",
);
assert.throws(() => assertComponent(reversedVisible), /visible state mapping/);

console.log("archive record button contract: PASS");
