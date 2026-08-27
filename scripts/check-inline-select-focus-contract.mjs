import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { Scanner } = require("@tailwindcss/oxide");
const root = fileURLToPath(new URL("..", import.meta.url));
const sharedFrameClass = "bd-inline-select-frame";
const globals = readFileSync(resolve(root, "src/app/globals.css"), "utf8");
const builtCssMode = process.argv.includes("--built-css");

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

function directFunction(tree, name) {
  const fn = tree.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert(fn?.body, `${name} must remain a top-level function`);
  return fn;
}

function jsxAttribute(node, name) {
  return node.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.text === name);
}

function stringAttribute(node, name) {
  const attribute = jsxAttribute(node, name);
  assert(attribute?.initializer && ts.isStringLiteral(attribute.initializer), `${name} must remain a direct string attribute`);
  return attribute.initializer.text;
}

function staticClassText(node) {
  const attribute = jsxAttribute(node, "className");
  assert(attribute?.initializer, "className must exist");
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  assert(ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression, "className must be a string or expression");
  const expression = unwrap(attribute.initializer.expression);
  if (ts.isNoSubstitutionTemplateLiteral(expression) || ts.isStringLiteral(expression)) return expression.text;
  assert(ts.isTemplateExpression(expression), "className expression must retain static template segments");
  return [expression.head.text, ...expression.templateSpans.map((span) => span.literal.text)].join(" ");
}

function unwrap(node) {
  let current = node;
  while (current && (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current))) current = current.expression;
  return current;
}

function constantBoolean(node) {
  const current = unwrap(node);
  if (current?.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (current?.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
}

function statementAlwaysTerminates(statement) {
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
  if (ts.isBlock(statement)) return statement.statements.some(statementAlwaysTerminates);
  if (ts.isIfStatement(statement)) {
    const condition = constantBoolean(statement.expression);
    if (condition === true) return statementAlwaysTerminates(statement.thenStatement);
    if (condition === false) return statement.elseStatement ? statementAlwaysTerminates(statement.elseStatement) : false;
    return Boolean(statement.elseStatement) && statementAlwaysTerminates(statement.thenStatement) && statementAlwaysTerminates(statement.elseStatement);
  }
  return false;
}

function assertFinalReturn(fn, label) {
  const returns = fn.body.statements.filter(ts.isReturnStatement);
  assert.equal(returns.length, 1, `${label} must retain one direct return`);
  const finalReturn = returns[0];
  assert.equal(fn.body.statements.at(-1), finalReturn, `${label} return must remain final`);
  const returnIndex = fn.body.statements.indexOf(finalReturn);
  for (const statement of fn.body.statements.slice(0, returnIndex)) {
    assert(!statementAlwaysTerminates(statement), `${label} live JSX must not follow a statically guaranteed return or throw`);
  }
  assert(finalReturn.expression, `${label} must return live JSX`);
  return finalReturn.expression;
}

function containsNode(container, child) {
  return container.pos <= child.pos && container.end >= child.end;
}

function assertReachable(node, boundary, label) {
  let current = node;
  while (current !== boundary) {
    const parent = current.parent;
    assert(parent, `${label} must remain inside its live return`);
    if (ts.isFunctionLike(parent)) assert.fail(`${label} must not be hidden in an uncalled function`);
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && containsNode(parent.right, current)) {
      assert.notEqual(constantBoolean(parent.left), false, `${label} must not be hidden behind false &&`);
    }
    if (ts.isConditionalExpression(parent)) {
      const condition = constantBoolean(parent.condition);
      if (containsNode(parent.whenTrue, current)) assert.notEqual(condition, false, `${label} must not be in a constant-false branch`);
      if (containsNode(parent.whenFalse, current)) assert.notEqual(condition, true, `${label} must not be in an unreachable false branch`);
    }
    current = parent;
  }
}

function analyzePageCallerSource(source, path, functionName, selectName) {
  const tree = parse(source, path);
  const fn = directFunction(tree, functionName);
  const liveReturn = assertFinalReturn(fn, functionName);
  const selectOpenings = visit(liveReturn, (node) => {
    if (!ts.isJsxOpeningElement(node) || node.tagName.getText(tree) !== "select") return false;
    return node.attributes.properties.some((attribute) => {
      if (!ts.isJsxAttribute(attribute) || attribute.name.getText(tree) !== "name") return false;
      return Boolean(attribute.initializer && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === selectName);
    });
  });
  assert.equal(selectOpenings.length, 1, `${path} must expose one live ${selectName} select`);
  const selectOpening = selectOpenings[0];
  assertReachable(selectOpening, liveReturn, `${path} ${selectName} select`);
  const select = selectOpening.parent;
  assert(ts.isJsxElement(select), `${selectName} select must have a live JSX element`);
  assert(staticClassText(selectOpening).split(/\s+/).includes("outline-none"), `${selectName} select must make its replacement-focus contract explicit`);
  let parent = select.parent;
  while (parent && !ts.isJsxElement(parent)) parent = parent.parent;
  assert(parent && parent.openingElement.tagName.getText(tree) === "label", `${selectName} select must remain inside its visible label frame`);
  assert(staticClassText(parent.openingElement).split(/\s+/).includes(sharedFrameClass), `${selectName} visible label must use the shared inline-select focus frame`);
}

function analyzePageCaller(path, functionName, selectName) {
  analyzePageCallerSource(readFileSync(resolve(root, path), "utf8"), path, functionName, selectName);
}

function analyzeSingleSelectComponentSource(source, path, functionName) {
  const tree = parse(source, path);
  const fn = directFunction(tree, functionName);
  const liveReturn = assertFinalReturn(fn, functionName);
  const selectOpenings = visit(liveReturn, (node) => ts.isJsxOpeningElement(node) && node.tagName.getText(tree) === "select");
  assert.equal(selectOpenings.length, 1, `${path} must expose one live inline select`);
  const selectOpening = selectOpenings[0];
  assertReachable(selectOpening, liveReturn, `${path} inline select`);
  assert(staticClassText(selectOpening).split(/\s+/).includes("outline-none"), `${path} select must make its replacement-focus contract explicit`);
  const select = selectOpening.parent;
  assert(ts.isJsxElement(select), `${path} select must have a live JSX element`);
  let parent = select.parent;
  while (parent && !ts.isJsxElement(parent)) parent = parent.parent;
  assert(parent && parent.openingElement.tagName.getText(tree) === "label", `${path} select must remain inside its visible label frame`);
  assert(staticClassText(parent.openingElement).split(/\s+/).includes(sharedFrameClass), `${path} visible label must use the shared inline-select focus frame`);
}

function analyzeSingleSelectComponent(path, functionName) {
  analyzeSingleSelectComponentSource(readFileSync(resolve(root, path), "utf8"), path, functionName);
}

function jsxComponentOpenings(container, tree, componentName) {
  return visit(container, (node) => {
    if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText(tree) === componentName;
    if (ts.isJsxOpeningElement(node)) return node.tagName.getText(tree) === componentName;
    return false;
  });
}

function assertActorAvailabilityBranch(node, boundary, tree, label) {
  let current = node;
  while (current !== boundary) {
    const parent = current.parent;
    assert(parent, `${label} must remain inside AppNav's live return`);
    if (
      ts.isConditionalExpression(parent)
      && containsNode(parent.whenTrue, current)
      && unwrap(parent.condition).getText(tree) === "actorSwitchingAvailable"
    ) return;
    current = parent;
  }
  assert.fail(`${label} must remain in the actorSwitchingAvailable true branch`);
}

function analyzeAppNavMountsSource(source, path) {
  const tree = parse(source, path);
  const fn = directFunction(tree, "AppNav");
  const liveReturn = assertFinalReturn(fn, "AppNav");
  const languageCallers = jsxComponentOpenings(liveReturn, tree, "LanguageSwitcher");
  const actorCallers = jsxComponentOpenings(liveReturn, tree, "ActorSwitcher");
  assert.equal(languageCallers.length, 3, "AppNav must retain its three live LanguageSwitcher mounts");
  assert.equal(actorCallers.length, 3, "AppNav must retain its three live ActorSwitcher mounts");
  for (const [index, caller] of languageCallers.entries()) {
    assertReachable(caller, liveReturn, `AppNav LanguageSwitcher mount ${index + 1}`);
  }
  for (const [index, caller] of actorCallers.entries()) {
    assertReachable(caller, liveReturn, `AppNav ActorSwitcher mount ${index + 1}`);
    assertActorAvailabilityBranch(caller, liveReturn, tree, `AppNav ActorSwitcher mount ${index + 1}`);
  }
}

function analyzeAppNavMounts(path) {
  analyzeAppNavMountsSource(readFileSync(resolve(root, path), "utf8"), path);
}

assert.match(globals, /\.bd-inline-select-frame:focus-within\s*\{[^}]*outline:\s*var\(--bd-focus-ring-width\)\s+solid\s+var\(--bd-focus-ring-color\);[^}]*outline-offset:\s*var\(--bd-focus-ring-offset\);[^}]*\}/s, "shared inline select frame must use the three global focus tokens");
analyzePageCaller("src/app/parties/page.tsx", "PartiesPage", "type");
analyzePageCaller("src/app/parties/page.tsx", "PartiesPage", "lifecycle");
analyzePageCaller("src/app/properties/page.tsx", "PropertiesPage", "lifecycle");
analyzePageCaller("src/app/properties/page.tsx", "PropertiesPage", "sort");
analyzeSingleSelectComponent("src/components/language-switcher.tsx", "LanguageSwitcher");
analyzeSingleSelectComponent("src/components/actor-switcher.tsx", "ActorSwitcher");
analyzeAppNavMounts("src/components/app-nav.tsx");

const validSynthetic = `
  function LanguageSwitcher() {
    return (
      <label className="${sharedFrameClass} inline-flex min-h-11">
        <select className="bg-transparent outline-none"><option>日本語</option></select>
      </label>
    );
  }
`;
analyzeSingleSelectComponentSource(validSynthetic, "synthetic-valid.tsx", "LanguageSwitcher");

const invalidSyntheticCases = [
  ["comment-only class", validSynthetic.replace(`${sharedFrameClass} inline-flex`, "inline-flex") + `\n/* ${sharedFrameClass} */`],
  ["class on wrong node", validSynthetic.replace(`${sharedFrameClass} inline-flex`, "inline-flex").replace("bg-transparent outline-none", `${sharedFrameClass} bg-transparent outline-none`)],
  ["constant-false caller", `
    function LanguageSwitcher() {
      return (<>{false && (
        <label className="${sharedFrameClass} inline-flex min-h-11">
          <select className="bg-transparent outline-none"><option>日本語</option></select>
        </label>
      )}</>);
    }
  `],
  ["unreachable final return", validSynthetic.replace("return (", "if (true) return <div />;\n    return (")],
];
for (const [label, source] of invalidSyntheticCases) {
  parse(source, `synthetic-${label}.tsx`);
  assert.throws(() => analyzeSingleSelectComponentSource(source, `synthetic-${label}.tsx`, "LanguageSwitcher"), `${label} must fail the focus contract`);
}

const validAppNavSynthetic = `
  async function AppNav() {
    return (<>
      {[1, 2, 3].map((key) => <LanguageSwitcher key={key} />)}
      {actorSwitchingAvailable ? <ActorSwitcher /> : null}
      {actorSwitchingAvailable ? <ActorSwitcher /> : null}
      {actorSwitchingAvailable ? <ActorSwitcher /> : null}
    </>);
  }
`;
// Keep the synthetic mount count explicit without duplicating the production JSX.
const expandedValidAppNavSynthetic = validAppNavSynthetic.replace(
  "{[1, 2, 3].map((key) => <LanguageSwitcher key={key} />)}",
  "<LanguageSwitcher /><LanguageSwitcher /><LanguageSwitcher />",
);
analyzeAppNavMountsSource(expandedValidAppNavSynthetic, "synthetic-valid-app-nav.tsx");

const invalidAppNavCases = [
  ["all callers deleted", expandedValidAppNavSynthetic
    .replaceAll("<LanguageSwitcher />", "")
    .replaceAll("{actorSwitchingAvailable ? <ActorSwitcher /> : null}", "")],
  ["callers in uncalled function", `
    async function AppNav() {
      const hidden = () => (<>
        <LanguageSwitcher /><LanguageSwitcher /><LanguageSwitcher />
        {actorSwitchingAvailable ? <ActorSwitcher /> : null}
        {actorSwitchingAvailable ? <ActorSwitcher /> : null}
        {actorSwitchingAvailable ? <ActorSwitcher /> : null}
      </>);
      return <main />;
    }
  `],
  ["callers behind false", expandedValidAppNavSynthetic.replace("return (<>", "return (<>{false && <>").replace("</>);", "</>}</>);")],
];
for (const [label, source] of invalidAppNavCases) {
  parse(source, `synthetic-app-nav-${label}.tsx`);
  assert.throws(() => analyzeAppNavMountsSource(source, `synthetic-app-nav-${label}.tsx`), `${label} must fail the AppNav mount contract`);
}

const partiesSource = readFileSync(resolve(root, "src/app/parties/page.tsx"), "utf8");
const lifecycleFrame = '<label className="bd-inline-select-frame flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">\n            <span className="sr-only">{copy.lifecycle}</span>';
assert(partiesSource.includes(lifecycleFrame), "the lifecycle synthetic target must match the live caller");
assert.throws(
  () => analyzePageCallerSource(partiesSource.replace(lifecycleFrame, lifecycleFrame.replace(`${sharedFrameClass} `, "")), "synthetic-parties-one-missed.tsx", "PartiesPage", "lifecycle"),
  "fixing only one parties select must fail",
);

const contractCandidates = new Set(new Scanner({ sources: [] }).scanFiles([{ content: readFileSync(fileURLToPath(import.meta.url), "utf8"), extension: "mjs" }]));
assert.equal([...contractCandidates].filter((candidate) => candidate.startsWith(`${["focus", "within"].join("-")}:`)).length, 0, "the checker must not inject Tailwind focus-within utility candidates");

if (builtCssMode) {
  const cssDirectory = resolve(root, ".next/static/css");
  const builtCss = readdirSync(cssDirectory)
    .filter((name) => name.endsWith(".css"))
    .map((name) => readFileSync(resolve(cssDirectory, name), "utf8"))
    .join("\n");
  assert.match(builtCss, /\.bd-inline-select-frame:focus-within\s*\{[^}]*outline:\s*var\(--bd-focus-ring-width\)\s+solid\s+var\(--bd-focus-ring-color\);?[^}]*outline-offset:\s*var\(--bd-focus-ring-offset\);?[^}]*\}/s, "built CSS must retain the tokenized inline-select focus rule");
}

console.log(`inline-select focus contract: PASS${builtCssMode ? " (built CSS verified)" : ""}`);
