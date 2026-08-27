import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = fileURLToPath(new URL("..", import.meta.url));
const paths = {
  page: resolve(root, "src/app/parties/page.tsx"),
  loading: resolve(root, "src/app/parties/loading.tsx"),
  hub: resolve(root, "src/lib/hub.ts"),
  permissions: resolve(root, "src/lib/tenant-permissions.ts"),
  actions: resolve(root, "src/app/actions.ts"),
  partyProfile: resolve(root, "src/lib/party-profile.ts"),
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

function visitLive(root, predicate, matches = []) {
  const walk = (node) => {
    if (node !== root && ts.isFunctionLike(node)) return;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && literalBoolean(node.left) === false) return;
    if (ts.isConditionalExpression(node)) {
      const condition = literalBoolean(node.condition);
      if (condition === true) return walk(node.whenTrue);
      if (condition === false) return walk(node.whenFalse);
    }
    if (ts.isIfStatement(node)) {
      const condition = literalBoolean(node.expression);
      if (condition === true) return walk(node.thenStatement);
      if (condition === false) return node.elseStatement ? walk(node.elseStatement) : undefined;
    }
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, walk);
  };
  walk(root);
  return matches;
}

function jsxAnyAttribute(node, name) {
  return node.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText() === name);
}

function jsxAttributeText(node, name, sourceFile) {
  return jsxAnyAttribute(node, name)?.getText(sourceFile);
}

function jsxClassText(node, sourceFile) {
  return jsxAnyAttribute(node, "className")?.initializer?.getText(sourceFile) ?? "";
}

function assertNoCompetingAccessibleName(node, label) {
  assert(!jsxAnyAttribute(node, "aria-label") && !jsxAnyAttribute(node, "aria-labelledby"), `${label} must use its visible localized name without a competing ARIA name`);
}

function assertOnlyVisibleExpression(element, expected, sourceFile, label) {
  assert(ts.isJsxElement(element), `${label} must be a JSX element with visible children`);
  const expressions = [];
  for (const child of element.children) {
    if (ts.isJsxText(child)) {
      assert.equal(child.text.trim(), "", `${label} must not contain competing visible text`);
      continue;
    }
    assert(ts.isJsxExpression(child) && child.expression, `${label} must not contain a competing visible child element`);
    expressions.push(child.expression);
  }
  assert.deepEqual(expressions.map((expression) => nodeText(expression, sourceFile)), [expected], `${label} must expose only ${expected} as its visible name`);
}

function assertVisibleNameHelperBehavior() {
  const tree = parse(`const sample = <>
    <Link>{copy.value}</Link>
    <Link>{copy.value} wrong</Link>
    <Link>{copy.value}<span>wrong</span></Link>
    <Link>{copy.value}{copy.other}</Link>
  </>;`, "parties/visible-name-helper.tsx");
  const elements = visit(tree, (node) => ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "Link");
  assert.equal(elements.length, 4, "visible-name helper fixture must retain four independent callers");
  assert.doesNotThrow(() => assertOnlyVisibleExpression(elements[0], "copy.value", tree, "valid visible name"));
  assert.throws(() => assertOnlyVisibleExpression(elements[1], "copy.value", tree, "extra visible text"), "visible-name helper must reject extra readable text");
  assert.throws(() => assertOnlyVisibleExpression(elements[2], "copy.value", tree, "extra visible child"), "visible-name helper must reject extra readable child elements");
  assert.throws(() => assertOnlyVisibleExpression(elements[3], "copy.value", tree, "extra visible expression"), "visible-name helper must reject competing readable expressions");
}

function isDescendant(node, ancestor) {
  for (let current = node.parent; current; current = current.parent) if (current === ancestor) return true;
  return false;
}

function evaluateExpression(node, environment) {
  const current = unwrap(node);
  if (ts.isIdentifier(current)) return environment[current.text];
  if (ts.isStringLiteral(current)) return current.text;
  if (ts.isNumericLiteral(current)) return Number(current.text);
  if (current.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (current.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isPropertyAccessExpression(current) && current.name.text === "length") return evaluateExpression(current.expression, environment)?.length;
  if (ts.isPrefixUnaryExpression(current) && current.operator === ts.SyntaxKind.ExclamationToken) return !evaluateExpression(current.operand, environment);
  if (ts.isBinaryExpression(current)) {
    const left = evaluateExpression(current.left, environment);
    const right = evaluateExpression(current.right, environment);
    switch (current.operatorToken.kind) {
      case ts.SyntaxKind.AmpersandAmpersandToken: return Boolean(left && right);
      case ts.SyntaxKind.BarBarToken: return Boolean(left || right);
      case ts.SyntaxKind.EqualsEqualsEqualsToken: return left === right;
      case ts.SyntaxKind.ExclamationEqualsEqualsToken: return left !== right;
      case ts.SyntaxKind.GreaterThanToken: return Number(left) > Number(right);
      case ts.SyntaxKind.LessThanToken: return Number(left) < Number(right);
      default: throw new Error(`unsupported predicate operator ${current.operatorToken.getText()}`);
    }
  }
  throw new Error(`unsupported predicate ${current.getText()}`);
}

function directFunction(tree, name) {
  const fn = tree.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert(fn?.body, `${name} must remain a top-level function`);
  return fn;
}

function directVariable(fn, name) {
  return directBlockVariable(fn.body, name, fn.name?.text ?? "callback");
}

function directBlockVariable(block, name, owner) {
  assert(ts.isBlock(block), `${owner} must have a block body`);
  for (const statement of block.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
        assert(declaration.initializer, `${name} must have an initializer`);
        return declaration.initializer;
      }
    }
  }
  assert.fail(`${name} must be declared directly in ${owner}`);
}

function nodeText(node, sourceFile) {
  return node.getText(sourceFile);
}

function unwrap(node) {
  let current = node;
  while (current && (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current))) current = current.expression;
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
  if (ts.isBlock(statement)) {
    return statement.statements.some((child) => statementAlwaysTerminates(child));
  }
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

function assertReachableStatement(block, target, label) {
  const index = block.statements.indexOf(target);
  assert(index >= 0, `${label} must be a direct statement in its authoritative block`);
  for (const statement of block.statements.slice(0, index)) {
    assert(!statementAlwaysTerminates(statement), `${label} must not follow a statically guaranteed return or throw`);
  }
}

function containsNode(container, child) {
  return container.pos <= child.pos && container.end >= child.end;
}

function assertReachable(node, boundary, label) {
  let current = node;
  while (current !== boundary) {
    const parent = current.parent;
    assert(parent, `${label} must remain inside its authoritative caller`);
    if (ts.isFunctionLike(parent) && parent !== boundary) assert.fail(`${label} must not be hidden in an uncalled nested function`);
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && containsNode(parent.right, current)) {
      assert.notEqual(literalBoolean(parent.left), false, `${label} must not be hidden behind false &&`);
    }
    if (ts.isConditionalExpression(parent)) {
      const condition = literalBoolean(parent.condition);
      if (containsNode(parent.whenTrue, current)) assert.notEqual(condition, false, `${label} must not be in a constant-false ternary branch`);
      if (containsNode(parent.whenFalse, current)) assert.notEqual(condition, true, `${label} must not be in an unreachable ternary branch`);
    }
    if (ts.isIfStatement(parent)) {
      const condition = literalBoolean(parent.expression);
      if (containsNode(parent.thenStatement, current)) assert.notEqual(condition, false, `${label} must not be in if(false)`);
      if (parent.elseStatement && containsNode(parent.elseStatement, current)) assert.notEqual(condition, true, `${label} must not be in an unreachable else`);
    }
    current = parent;
  }
}

function objectProperty(object, name) {
  const value = unwrap(object);
  assert(ts.isObjectLiteralExpression(value), `${name} owner must be an object literal`);
  const property = value.properties.find((item) => (ts.isPropertyAssignment(item) || ts.isShorthandPropertyAssignment(item)) && item.name.getText().replaceAll(/["']/g, "") === name);
  assert(property && (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)), `${name} property must exist`);
  return ts.isPropertyAssignment(property) ? property.initializer : property.name;
}

function jsxAttribute(node, name) {
  const attribute = node.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.text === name);
  assert(attribute?.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression, `${name} JSX attribute must have an expression`);
  return attribute.initializer.expression;
}

function analyzePage(source) {
  const tree = parse(source, "parties/page.tsx");
  const fn = directFunction(tree, "PartiesPage");
  const liveCalls = visitLive(fn.body, (node) => ts.isCallExpression(node));
  const sessionCalls = liveCalls.filter((call) => call.expression.getText(tree) === "requireTenantSession");
  assert.equal(sessionCalls.length, 1, "live page must require one tenant session");
  assert.match(sessionCalls[0].arguments[0]?.getText(tree) ?? "", /permission:\s*["']record\.read["']/, "live page session must require record.read");
  const localeCalls = liveCalls.filter((call) => call.expression.getText(tree) === "getLocale");
  assert.equal(localeCalls.length, 1, "live page must read one request locale");
  const requestContextCalls = liveCalls.filter((call) => call.expression.getText(tree) === "createRequestContext");
  assert.equal(requestContextCalls.length, 1, "live page must build one request context");
  assert.equal(requestContextCalls[0].arguments[0]?.getText(tree), "session", "request context must use the authorized session");
  const readerCalls = liveCalls.filter((call) => call.expression.getText(tree) === "listHubParties");
  assert.equal(readerCalls.length, 1, "live page must call the authorized party reader exactly once");
  assert.deepEqual(readerCalls[0].arguments.map((argument) => argument.getText(tree)), ["locale", "context"], "party reader must receive locale and the live authorized context");
  assert(ts.isAwaitExpression(readerCalls[0].parent), "party reader must be awaited");
  const readerAssignment = readerCalls[0].parent.parent;
  assert(ts.isBinaryExpression(readerAssignment) && readerAssignment.operatorToken.kind === ts.SyntaxKind.EqualsToken && readerAssignment.left.getText(tree) === "parties", "awaited authorized parties must feed the live parties collection");
  const capabilityCanWrite = nodeText(directVariable(fn, "capabilityCanWrite"), tree);
  const capabilityCanArchive = nodeText(directVariable(fn, "capabilityCanArchive"), tree);
  assert.match(capabilityCanWrite, /capabilityHasTenantPermission\([^,]+,\s*["']record\.update["']\)/, "editing must retain record.update capability");
  assert.match(capabilityCanArchive, /capabilityHasTenantPermission\([^,]+,\s*["']record\.archive["']\)/, "archive visibility must use record.archive capability");

  const context = directVariable(fn, "context");
  const lifecycleStatus = unwrap(objectProperty(context, "lifecycleStatus"));
  assert(ts.isStringLiteral(lifecycleStatus) && lifecycleStatus.text === "all", "authorized parties must be read for all lifecycle states before local filtering");
  assert.equal(nodeText(objectProperty(context, "canUpdateRecords"), tree), "capabilityCanWrite", "hub write mapping must receive record.update capability");
  assert.equal(nodeText(objectProperty(context, "canArchiveRecords"), tree), "capabilityCanArchive", "hub archive mapping must receive record.archive capability");

  const lifecycleFiltered = unwrap(directVariable(fn, "lifecycleFiltered"));
  assert(ts.isConditionalExpression(lifecycleFiltered), "lifecycleFiltered must explicitly distinguish all vs selected lifecycle");
  assert.match(nodeText(lifecycleFiltered.condition, tree), /^lifecycle\s*===\s*["']all["']$/, "all lifecycle must preserve the authorized collection");
  assert.equal(nodeText(lifecycleFiltered.whenTrue, tree), "parties", "all lifecycle must use the complete authorized collection");
  assert.match(nodeText(lifecycleFiltered.whenFalse, tree), /^parties\.filter\(/, "selected lifecycle must filter the authorized collection locally");
  assert.match(nodeText(lifecycleFiltered.whenFalse, tree), /party\.status\s*===\s*lifecycle/, "local lifecycle filtering must use the saved party status");

  const queryInitializer = unwrap(directVariable(fn, "query"));
  assert(ts.isBinaryExpression(queryInitializer) && queryInitializer.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken, "query must use a nullish empty-string fallback");
  assert(ts.isStringLiteral(queryInitializer.right) && queryInitializer.right.text === "", "missing query must normalize to an empty string");
  const trimCall = unwrap(queryInitializer.left);
  assert(ts.isCallExpression(trimCall) && trimCall.arguments.length === 0 && ts.isPropertyAccessExpression(trimCall.expression), "query must be normalized by a direct trim call");
  assert.equal(trimCall.expression.name.text, "trim", "query normalization must trim surrounding whitespace");
  assert.equal(nodeText(trimCall.expression.expression, tree), "params.q", "query trim must consume the live q parameter");
  assert(trimCall.questionDotToken || trimCall.expression.questionDotToken, "query trim must remain safe for an omitted q parameter");

  const searched = unwrap(directVariable(fn, "searched"));
  assert(ts.isConditionalExpression(searched), "searched must explicitly distinguish query and no-query paths");
  assert.equal(nodeText(searched.condition, tree), "query", "searched condition must use the normalized live query");
  assert.equal(nodeText(searched.whenFalse, tree), "lifecycleFiltered", "no query must retain locally lifecycle-filtered parties");
  const searchCall = unwrap(searched.whenTrue);
  assert(ts.isCallExpression(searchCall) && ts.isPropertyAccessExpression(searchCall.expression), "query path must directly filter the lifecycle collection");
  assert.equal(nodeText(searchCall.expression.expression, tree), "lifecycleFiltered", "keyword search must consume locally lifecycle-filtered parties");
  assert.equal(searchCall.expression.name.text, "filter", "keyword search must use a direct filter callback");
  assert.equal(searchCall.arguments.length, 1, "keyword search must have one inline predicate");
  const searchCallback = searchCall.arguments[0];
  assert(searchCallback && ts.isArrowFunction(searchCallback) && ts.isBlock(searchCallback.body), "keyword search must retain an inline block callback");
  assert.equal(searchCallback.parameters.length, 1, "keyword predicate must receive one party");
  assert.equal(nodeText(searchCallback.parameters[0].name, tree), "party", "keyword predicate must search the live party row");
  const normalized = unwrap(directVariable(searchCallback, "normalized"));
  assert(ts.isCallExpression(normalized) && normalized.arguments.length === 0 && ts.isPropertyAccessExpression(normalized.expression), "keyword predicate must lowercase the normalized query");
  assert.equal(nodeText(normalized.expression.expression, tree), "query", "keyword lowercase normalization must use the trimmed query");
  assert.equal(normalized.expression.name.text, "toLowerCase", "keyword query must be case-insensitive");
  const searchReturns = searchCallback.body.statements.filter(ts.isReturnStatement);
  assert.equal(searchReturns.length, 1, "keyword predicate must have one direct return");
  assert.equal(searchCallback.body.statements.at(-1), searchReturns[0], "keyword predicate return must remain final");
  assertReachableStatement(searchCallback.body, searchReturns[0], "keyword predicate return");
  const flattenOr = (expression, terms = []) => {
    const value = unwrap(expression);
    if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      flattenOr(value.left, terms);
      flattenOr(value.right, terms);
    } else terms.push(value);
    return terms;
  };
  const searchTerms = flattenOr(searchReturns[0].expression);
  assert.equal(searchTerms.length, 4, "keyword predicate must OR exactly name, phone, email and role matches");
  const compact = (node) => nodeText(node, tree).replaceAll(/\s+/g, "");
  assert.deepEqual(searchTerms.map(compact), [
    "party.name.toLowerCase().includes(normalized)",
    "party.phone.toLowerCase().includes(normalized)",
    "party.email?.toLowerCase().includes(normalized)??false",
    "party.explicitRoles.some((role)=>role.toLowerCase().includes(normalized))",
  ], "keyword predicate must preserve the independent four-field search contract");
  const typeInitializer = unwrap(directVariable(fn, "type"));
  assert(ts.isCallExpression(typeInitializer) && nodeText(typeInitializer.expression, tree) === "normalizeType", "type must use the canonical normalizer");
  assert.deepEqual(typeInitializer.arguments.map((argument) => nodeText(argument, tree)), ["params.type"], "type normalizer must consume the live type parameter");
  const filtered = unwrap(directVariable(fn, "filtered"));
  assert(ts.isCallExpression(filtered) && ts.isPropertyAccessExpression(filtered.expression), "type filtering must be a direct searched.filter call");
  assert.equal(nodeText(filtered.expression.expression, tree), "searched", "type filtering must consume the searched collection");
  assert.equal(filtered.expression.name.text, "filter", "type filtering must use filter");
  assert.equal(filtered.arguments.length, 1, "type filtering must have one inline callback");
  const typeCallback = filtered.arguments[0];
  assert(typeCallback && ts.isArrowFunction(typeCallback) && ts.isBlock(typeCallback.body), "type filter must retain an inline block callback");
  assert.equal(nodeText(typeCallback.parameters[0]?.name, tree), "party", "type filter must inspect the live party row");
  assert.equal(nodeText(directVariable(typeCallback, "matchesType"), tree), 'type === "all" || party.explicitPartyType === type', "type filter must preserve all or exact explicitPartyType matching");
  const typeReturns = typeCallback.body.statements.filter(ts.isReturnStatement);
  assert.equal(typeReturns.length, 1, "type filter must have one direct return");
  assert.equal(typeCallback.body.statements.at(-1), typeReturns[0], "type filter return must remain final");
  assertReachableStatement(typeCallback.body, typeReturns[0], "type filter return");
  assert.equal(nodeText(typeReturns[0].expression, tree), "matchesType", "type filter must return its live exact match decision");

  const pageSizeDeclaration = tree.statements.find((statement) => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "PARTIES_PAGE_SIZE"));
  assert(pageSizeDeclaration, "parties page must retain a top-level page-size constant");
  const pageSize = pageSizeDeclaration.declarationList.declarations.find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "PARTIES_PAGE_SIZE")?.initializer;
  assert(pageSize && ts.isNumericLiteral(pageSize) && pageSize.text === "12", "parties pagination must remain fixed at 12 rows");
  assert.equal(nodeText(directVariable(fn, "pageCount"), tree).replaceAll(/\s+/g, ""), "Math.max(1,Math.ceil(filtered.length/PARTIES_PAGE_SIZE))", "pageCount must derive from filtered rows and the 12-row constant");
  assert.equal(nodeText(directVariable(fn, "safePage"), tree).replaceAll(/\s+/g, ""), "Math.min(requestedPage,pageCount)", "safePage must clamp the requested page to the filtered page count");
  const redirectIf = fn.body.statements.find((statement) => ts.isIfStatement(statement) && nodeText(statement.expression, tree).includes("params.page"));
  assert(redirectIf, "out-of-range pagination must retain one direct redirect guard");
  assertReachableStatement(fn.body, redirectIf, "pagination redirect guard");
  assert.equal(nodeText(redirectIf.expression, tree).replaceAll(/\s+/g, ""), '!readError&&params.page!==undefined&&(params.page!==String(safePage)||safePage===1)', "pagination redirect guard must preserve error and canonical-page semantics");
  const redirectCalls = visitLive(redirectIf.thenStatement, (node) => ts.isCallExpression(node) && nodeText(node.expression, tree) === "redirect");
  assert.equal(redirectCalls.length, 1, "pagination guard must perform one live redirect");
  assert.equal(nodeText(redirectCalls[0].arguments[0], tree).replaceAll(/\s+/g, ""), "buildPartiesHref({...filters,page:safePage})", "pagination redirect must preserve filters and canonical safePage");
  const visibleParties = unwrap(directVariable(fn, "visibleParties"));
  assert(ts.isCallExpression(visibleParties) && ts.isPropertyAccessExpression(visibleParties.expression), "visibleParties must use a direct slice");
  assert.equal(nodeText(visibleParties.expression.expression, tree), "filtered", "pagination must slice the fully filtered collection");
  assert.equal(visibleParties.expression.name.text, "slice", "pagination must use slice");
  assert.deepEqual(visibleParties.arguments.map((argument) => nodeText(argument, tree).replaceAll(/\s+/g, "")), ["(safePage-1)*PARTIES_PAGE_SIZE", "safePage*PARTIES_PAGE_SIZE"], "visible rows must use the exact 12-row page boundaries");
  assert.equal(nodeText(directVariable(fn, "rangeStart"), tree).replaceAll(/\s+/g, ""), "filtered.length===0?0:(safePage-1)*PARTIES_PAGE_SIZE+1", "summary start must match the visible slice");
  assert.equal(nodeText(directVariable(fn, "rangeEnd"), tree).replaceAll(/\s+/g, ""), "Math.min(filtered.length,safePage*PARTIES_PAGE_SIZE)", "summary end must match the visible slice");
  assert.equal(nodeText(directVariable(fn, "filters"), tree).replaceAll(/\s+/g, ""), "{query,type,lifecycle}satisfiesOmit<PartyFilters,\"page\">", "pagination filters must preserve q, type and lifecycle");

  const returns = fn.body.statements.filter(ts.isReturnStatement);
  assert.equal(returns.length, 1, "PartiesPage must have one top-level return");
  const finalReturn = returns[0];
  assert.equal(fn.body.statements.at(-1), finalReturn, "PartiesPage return must remain final and reachable");
  assertReachableStatement(fn.body, finalReturn, "PartiesPage final return");
  assert(finalReturn.expression, "PartiesPage must return live JSX");
  const liveText = nodeText(finalReturn.expression, tree);
  assert.match(liveText, /parties\.length\s*===\s*0\s*\?\s*copy\.noParties\s*:\s*copy\.noResult/, "empty state must distinguish absolute authorized empty from filtered empty");
  const openings = visitLive(finalReturn.expression, (node) => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node));
  const byTag = (tag) => openings.filter((node) => node.tagName.getText(tree) === tag);
  const frames = byTag("PageFrame");
  const headers = byTag("PageHeader");
  const returnStates = byTag("ListReturnState");
  const shells = byTag("ListReportShell");
  assert.equal(frames.length, 1, "live page must render one PageFrame");
  assert.equal(headers.length, 1, "live page must render one PageHeader");
  assert.equal(returnStates.length, 1, "live page must render one ListReturnState");
  assert.equal(shells.length, 1, "live page must render one ListReportShell");
  const shell = shells[0];
  assert(isDescendant(headers[0], frames[0].parent), "PageHeader must be a live PageFrame child");
  assert(isDescendant(returnStates[0], frames[0].parent) && isDescendant(shell, returnStates[0].parent), "ListReportShell must remain inside ListReturnState and PageFrame");
  assert.equal(jsxAttributeText(returnStates[0], "scope", tree), 'scope="parties"', "shared return state must retain parties scope");
  assert.equal(jsxAttributeText(returnStates[0], "listUrl", tree), "listUrl={returnTo}", "shared return state must retain returnTo");
  assert(ts.isJsxSelfClosingElement(headers[0]), "parties PageHeader must remain action-free and self-closing");
  assert.equal(jsxAttributeText(headers[0], "title", tree), "title={copy.pageTitle}", "PageHeader must consume localized title");
  assert.equal(jsxAttributeText(headers[0], "description", tree), "description={copy.description}", "PageHeader must consume localized description");
  for (const name of ["scope", "filters", "summary", "pagination", "state", "results"]) assert(jsxAnyAttribute(shell, name), `ListReportShell must wire live ${name}`);
  const scopeHeading = unwrap(jsxAttribute(shell, "scope"));
  assert(ts.isJsxElement(scopeHeading) && scopeHeading.openingElement.tagName.getText(tree) === "h2", "live shell scope must render one h2 results heading");
  assert.equal(jsxAttributeText(scopeHeading.openingElement, "id", tree), 'id="parties-results-heading"', "live results heading must expose the stable fallback target id");
  assertOnlyVisibleExpression(scopeHeading, "copy.results", tree, "live results heading");
  const fallback = openings.filter((node) => jsxAnyAttribute(node, "data-list-return-fallback"));
  assert.equal(fallback.length, 1, "page must expose one live list return fallback");
  assert(jsxAnyAttribute(fallback[0], "tabIndex") && jsxAnyAttribute(fallback[0], "aria-labelledby") && isDescendant(shell, fallback[0].parent), "fallback must be accessible and wrap the live shell");
  assert.equal(jsxAttributeText(fallback[0], "aria-labelledby", tree), 'aria-labelledby="parties-results-heading"', "fallback must be named by the live results heading");

  const flashBanners = byTag("PageFlashBanner");
  assert.equal(flashBanners.length, 1, "live page must render one PageFlashBanner");
  assert.equal(jsxAttributeText(flashBanners[0], "message", tree), "message={flashMessage}", "PageFlashBanner must consume the selected live flash message");
  const flashMap = unwrap(directVariable(fn, "flashMap"));
  assert(ts.isObjectLiteralExpression(flashMap), "flashMap must remain a direct object literal");
  const flashExpected = Object.freeze({
    party_created: "copy.created",
    party_updated: "copy.updated",
    record_archived: "copy.archivedFeedback",
    record_restored: "copy.restoredFeedback",
  });
  assert.equal(flashMap.properties.length, 4, "flashMap must expose exactly four supported success states");
  for (const [key, value] of Object.entries(flashExpected)) assert.equal(nodeText(objectProperty(flashMap, key), tree), value, `${key} must map to ${value}`);
  assert.equal(nodeText(directVariable(fn, "flashMessage"), tree).replaceAll(/\s+/g, ""), 'flashMap[String(params.flash??"").trim()askeyoftypeofflashMap]', "flashMessage must select the trimmed live params.flash key from flashMap");

  const mapCalls = visitLive(finalReturn.expression, (node) => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(tree) === "visibleParties" && node.expression.name.text === "map");
  assert.equal(mapCalls.length, 1, "visibleParties must have one live row renderer");
  const rowCallback = mapCalls[0].arguments[0];
  assert(rowCallback && (ts.isArrowFunction(rowCallback) || ts.isFunctionExpression(rowCallback)) && ts.isBlock(rowCallback.body), "party rows must use a block callback");
  const rowReturns = rowCallback.body.statements.filter(ts.isReturnStatement);
  assert.equal(rowReturns.length, 1, "party row callback must have one direct return");
  const rowReturn = rowReturns[0];
  assert.equal(rowCallback.body.statements.at(-1), rowReturn, "party row return must be the final callback statement");
  assert(rowReturn.expression, "party row callback must return live JSX");
  assertReachableStatement(rowCallback.body, rowReturn, "party row return");

  const nameLinks = visitLive(rowReturn.expression, (node) => ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "Link" && node.getText(tree).includes("/parties/") && node.getText(tree).includes("returnTo"));
  assert.equal(nameLinks.length, 1, "the live party name must have one detail link");
  const nameHref = nodeText(jsxAttribute(nameLinks[0].openingElement, "href"), tree);
  assert.match(nameHref, /^`\/parties\/\$\{encodeURIComponent\(party\.id\)\}\/edit\?returnTo=\$\{encodeURIComponent\(returnTo\)\}`$/, "party detail link must carry the safe list returnTo");
  assert.equal(jsxAttributeText(nameLinks[0].openingElement, "data-list-return-trigger", tree), 'data-list-return-trigger={`party:${party.id}`}', "party name must retain its stable return trigger");
  assertNoCompetingAccessibleName(nameLinks[0].openingElement, "party name link");
  assertOnlyVisibleExpression(nameLinks[0], "party.name", tree, "party name link");
  const nameClass = jsxClassText(nameLinks[0].openingElement, tree);
  for (const token of ["inline-flex", "min-h-11", "max-w-full", "items-center", "break-words", "leading-relaxed", "[overflow-wrap:anywhere]", "focus-visible:outline", "focus-visible:outline-[length:var(--bd-focus-ring-width)]", "focus-visible:outline-[color:var(--bd-focus-ring-color)]", "focus-visible:outline-offset-[var(--bd-focus-ring-offset)]"]) assert(nameClass.includes(token), `party name must retain ${token}`);
  assert(!/\btruncate\b|line-clamp|whitespace-nowrap/.test(nameClass), "party name must wrap naturally");
  const canWrite = nodeText(directVariable(rowCallback, "canWrite"), tree);
  const canArchive = nodeText(directVariable(rowCallback, "canArchive"), tree);
  assert.match(canWrite, /party\.canWrite\s*&&\s*capabilityCanWrite/, "row editing must preserve the resolver and record.update gate at the live caller");
  assert.equal(canArchive, "party.canArchive", "row archive must use the hub's combined object/archive decision");
  const readOnlyMessage = nodeText(directVariable(rowCallback, "readOnlyMessage"), tree);
  assert.match(readOnlyMessage, /party\.readOnlyReason\s*===\s*["']company_read["']/, "company_read must have its own message branch");
  assert.match(readOnlyMessage, /party\.readOnlyReason\s*===\s*["']owner_read_only["']/, "owner_read_only must have its own message branch");
  assert.match(readOnlyMessage, /!canWrite/, "capability-level read-only must retain the owner/account read-only message");
  assert.equal(nodeText(directVariable(rowCallback, "roleLabel"), tree), 'party.explicitRoles.join(" / ") || notSet', "role label must preserve every explicit role with a readable separator and fallback");

  const archiveNodes = visitLive(rowReturn.expression, (node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "ArchiveRecordButton");
  assert.equal(archiveNodes.length, 1, "party row must have one archive control caller");
  assert.equal(jsxAttributeText(archiveNodes[0], "recordLabel", tree), "recordLabel={party.name}", "archive control must receive the visible party identity for its accessible name");
  assert(!jsxAnyAttribute(archiveNodes[0], "aria-label") && !jsxAnyAttribute(archiveNodes[0], "aria-labelledby"), "archive caller must not override the shared component accessible name");
  const archiveConditional = archiveNodes[0].parent;
  assert(archiveConditional && ts.isConditionalExpression(archiveConditional), "archive control must be directly state-gated");
  assert.equal(nodeText(archiveConditional.condition, tree), "canArchive", "archive control must be gated by canArchive, not general edit permission");
  assertReachable(archiveNodes[0], rowReturn.expression, "archive control");

  const relationshipLinks = visitLive(rowReturn.expression, (node) => ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "Link" && node.getText(tree).includes("/relationship-tree?type=party&id="));
  assert.equal(relationshipLinks.length, 1, "party row must have one live relationship link");
  const relationshipHref = nodeText(jsxAttribute(relationshipLinks[0].openingElement, "href"), tree);
  assert.match(relationshipHref, /^`\/relationship-tree\?type=party&id=\$\{encodeURIComponent\(party\.id\)\}`$/, "relationship link must target the live party identity");
  const relationshipConditional = relationshipLinks[0].parent;
  assert(relationshipConditional && ts.isConditionalExpression(relationshipConditional), "relationship link must be directly state-gated");
  assert.equal(nodeText(relationshipConditional.condition, tree), "canWrite", "relationship link must use record.update/object write, not archive permission");
  assertReachable(relationshipLinks[0], rowReturn.expression, "relationship link");
  assert.equal(jsxAttributeText(relationshipLinks[0].openingElement, "data-list-return-trigger", tree), 'data-list-return-trigger={`party:${party.id}:relationship`}', "relationship action must retain its independent stable return trigger");
  assertNoCompetingAccessibleName(relationshipLinks[0].openingElement, "relationship link");
  assertOnlyVisibleExpression(relationshipLinks[0], "copy.relationTree", tree, "relationship link");
  const relationshipClass = jsxClassText(relationshipLinks[0].openingElement, tree);
  for (const token of ["inline-flex", "min-h-11", "items-center", "focus-visible:outline", "focus-visible:outline-[length:var(--bd-focus-ring-width)]", "focus-visible:outline-[color:var(--bd-focus-ring-color)]", "focus-visible:outline-offset-[var(--bd-focus-ring-offset)]"]) assert(relationshipClass.includes(token), `relationship action must retain ${token}`);

  const contactCells = visitLive(rowReturn.expression, (node) => ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "div" && jsxAttributeText(node.openingElement, "role", tree) === 'role="cell"' && node.getText(tree).includes("contactSummary(party, notSet)"));
  assert.equal(contactCells.length, 1, "party row must expose one live contact cell");
  assert.equal(jsxAttributeText(contactCells[0].openingElement, "role", tree), 'role="cell"', "contact must remain a table cell");
  const contactClass = jsxClassText(contactCells[0].openingElement, tree);
  for (const token of ["break-words", "leading-relaxed", "[overflow-wrap:anywhere]"]) assert(contactClass.includes(token), `party contact must retain ${token}`);
  assert(!/\btruncate\b|line-clamp|whitespace-nowrap/.test(contactClass), "party contact must wrap naturally");

  const tables = openings.filter((node) => jsxAttributeText(node, "role", tree) === 'role="table"');
  assert.equal(tables.length, 1, "results must expose one accessible table");
  assert.equal(jsxAttributeText(tables[0], "aria-label", tree), "aria-label={copy.results}", "results table must use the localized results accessible name");
  assert(ts.isJsxOpeningElement(tables[0]) && ts.isJsxElement(tables[0].parent), "accessible table must use a live JSX element");
  const tableElement = tables[0].parent;
  const tableOpenings = openings.filter((node) => isDescendant(node, tables[0].parent));
  const rowgroups = tableOpenings.filter((node) => jsxAttributeText(node, "role", tree) === 'role="rowgroup"');
  assert.equal(rowgroups.length, 2, "results table must expose header and body rowgroups");
  assert(rowgroups.every((node) => ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent) && node.parent.parent === tableElement), "header and body rowgroups must be direct accessible-table children");
  const headerRowgroup = rowgroups[0].parent;
  const bodyRowgroup = rowgroups[1].parent;
  const headerRows = headerRowgroup.children.filter((child) => ts.isJsxElement(child) && jsxAttributeText(child.openingElement, "role", tree) === 'role="row"');
  assert.equal(headerRows.length, 1, "header rowgroup must directly own one role=row header row");
  const headersInTable = visitLive(headerRows[0], (node) => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && jsxAttributeText(node, "role", tree) === 'role="columnheader"');
  assert.equal(headersInTable.length, 6, "header row must own six real column headers");
  for (const label of ["copy.name", "copy.contact", "copy.type", "copy.role", "copy.status", "copy.actions"]) assert(headersInTable.some((node) => node.parent.getText(tree).includes(label)), `header row must expose ${label}`);
  assert(isDescendant(mapCalls[0], bodyRowgroup), "body rowgroup must own the live visibleParties row renderer");
  const rowRoot = unwrap(rowReturn.expression);
  assert(ts.isJsxElement(rowRoot) && jsxAttributeText(rowRoot.openingElement, "role", tree) === 'role="row"', "live row callback final return root must be role=row");
  const rowCells = visitLive(rowRoot, (node) => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && jsxAttributeText(node, "role", tree) === 'role="cell"');
  assert.equal(rowCells.length, 6, "each live party row must expose six table cells");
  const mobileLabels = [
    [1, "copy.contact"],
    [2, "copy.type"],
    [3, "copy.role"],
    [4, "copy.status"],
  ];
  for (const [cellIndex, expected] of mobileLabels) {
    const labels = visitLive(rowCells[cellIndex].parent, (node) => ts.isJsxElement(node)
      && node.openingElement.tagName.getText(tree) === "span"
      && jsxClassText(node.openingElement, tree).replace(/^['"]|['"]$/g, "").split(/\s+/).includes("lg:hidden"));
    assert.equal(labels.length, 1, `mobile ${expected} cell must expose one inline label`);
    assertOnlyVisibleExpression(labels[0], expected, tree, `mobile ${expected} label`);
  }
  assert.equal(nodeText(directVariable(rowCallback, "typeLabel"), tree).replaceAll(/\s+/g, ""), 'party.explicitPartyType==="corporate"?copy.corporate:party.explicitPartyType==="individual"?copy.individual:notSet', "mobile and desktop type value must derive from the live explicit party type");
  assert.equal(nodeText(directVariable(rowCallback, "statusLabel"), tree).replaceAll(/\s+/g, ""), 'party.status==="archived"?copy.archived:copy.active', "mobile and desktop status value must derive from the live lifecycle status");
  const roleCells = rowCells.filter((node) => node.parent.getText(tree).includes("roleLabel"));
  assert.equal(roleCells.length, 1, "live row must expose roleLabel in one dedicated cell");
  const roleClass = jsxClassText(roleCells[0], tree);
  for (const token of ["break-words", "leading-relaxed", "[overflow-wrap:anywhere]"]) assert(roleClass.includes(token), `role cell must retain ${token}`);
  assert(!/\btruncate\b|line-clamp|whitespace-nowrap/.test(roleClass), "role cell must wrap naturally");
  const readOnlyMessages = visitLive(rowRoot, (node) => ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "p" && node.getText(tree).includes("readOnlyMessage"));
  assert.equal(readOnlyMessages.length, 1, "live name cell must expose one conditional read-only reason");
  const readOnlyClass = jsxClassText(readOnlyMessages[0].openingElement, tree);
  for (const token of ["leading-relaxed", "[overflow-wrap:anywhere]"]) assert(readOnlyClass.includes(token), `read-only reason must retain ${token}`);
  assert(!/\btruncate\b|line-clamp|whitespace-nowrap/.test(readOnlyClass), "read-only reason must wrap naturally");

  assert(!liveText.includes("/parties/new"), "the List Report must not introduce a party create route");
  assert(!liveText.includes("contractCount"), "the List Report must not restore inferred relation counts");
}

function analyzePageStateAndControls(source) {
  const tree = parse(source, "parties/page-state.tsx");
  const fn = directFunction(tree, "PartiesPage");
  const finalReturn = fn.body.statements.at(-1);
  assert(finalReturn && ts.isReturnStatement(finalReturn) && finalReturn.expression, "state contract must bind the final page return");
  assertReachableStatement(fn.body, finalReturn, "state contract final return");
  const openings = visitLive(finalReturn.expression, (node) => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node));
  const shells = openings.filter((node) => node.tagName.getText(tree) === "ListReportShell");
  assert.equal(shells.length, 1, "state contract must bind one live ListReportShell");
  const shell = shells[0];
  const shellExpression = (name) => {
    const attribute = jsxAnyAttribute(shell, name);
    assert(attribute?.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression, `shell ${name} must be an expression`);
    return attribute.initializer.expression;
  };
  const summary = shellExpression("summary");
  const pagination = shellExpression("pagination");
  const state = shellExpression("state");
  const results = shellExpression("results");
  const summaryConditional = unwrap(summary);
  assert(ts.isConditionalExpression(summaryConditional) && nodeText(summaryConditional.condition, tree).replaceAll(/\s+/g, "") === "!readError", "summary must be absent during readError");
  assert(ts.isIdentifier(unwrap(summaryConditional.whenFalse)) && unwrap(summaryConditional.whenFalse).text === "undefined", "summary false branch must remain undefined");
  const summaryParagraph = unwrap(summaryConditional.whenTrue);
  assert(ts.isJsxElement(summaryParagraph) && summaryParagraph.openingElement.tagName.getText(tree) === "p", "summary true branch must render one visible paragraph");
  const summaryExpressions = summaryParagraph.children.filter(ts.isJsxExpression).map((child) => child.expression).filter(Boolean);
  assert.equal(summaryExpressions.length, 1, "summary paragraph must contain one visible localized range expression");
  const summaryCall = unwrap(summaryExpressions[0]);
  assert(ts.isCallExpression(summaryCall) && nodeText(summaryCall.expression, tree) === "copy.resultRange", "summary must use the localized resultRange caller");
  assert.deepEqual(summaryCall.arguments.map((argument) => nodeText(argument, tree)), ["rangeStart", "rangeEnd", "filtered.length"], "summary resultRange must receive exact visible start, end and filtered total");
  const paginationConditional = unwrap(pagination);
  assert(ts.isConditionalExpression(paginationConditional), "pagination must remain an explicit conditional");
  assert.equal(nodeText(paginationConditional.condition, tree).replaceAll(/\s+/g, ""), "pageCount>1&&!readError", "pagination must be absent during readError and single-page states");
  assert(ts.isIdentifier(unwrap(paginationConditional.whenFalse)) && unwrap(paginationConditional.whenFalse).text === "undefined", "pagination false branch must remain undefined");
  const paginationNav = unwrap(paginationConditional.whenTrue);
  assert(ts.isJsxElement(paginationNav) && paginationNav.openingElement.tagName.getText(tree) === "nav", "pagination true branch must render one live nav");
  assert.equal(jsxAttributeText(paginationNav.openingElement, "aria-label", tree), "aria-label={copy.results}", "pagination nav must use the localized results name");
  const boundaryConditionals = visitLive(paginationNav, (node) => ts.isConditionalExpression(node));
  assert.equal(boundaryConditionals.length, 2, "pagination nav must expose exactly previous and next boundary conditions");
  const assertBoundaryLink = (conditional, condition, href, copyField, label) => {
    assert.equal(nodeText(conditional.condition, tree).replaceAll(/\s+/g, ""), condition, `${label} must use its exact safe-page boundary`);
    assert(unwrap(conditional.whenFalse).kind === ts.SyntaxKind.NullKeyword, `${label} false branch must render null`);
    const link = unwrap(conditional.whenTrue);
    assert(ts.isJsxElement(link) && link.openingElement.tagName.getText(tree) === "Link", `${label} true branch must render one Link`);
    assert.equal(nodeText(jsxAttribute(link.openingElement, "href"), tree).replaceAll(/\s+/g, ""), href, `${label} href must preserve all live filters`);
    assertNoCompetingAccessibleName(link.openingElement, `${label} link`);
    assertOnlyVisibleExpression(link, copyField, tree, `${label} link`);
  };
  assertBoundaryLink(boundaryConditionals[0], "safePage>1", "buildPartiesHref({...filters,page:safePage-1})", "copy.previous", "previous pagination");
  assertBoundaryLink(boundaryConditionals[1], "safePage<pageCount", "buildPartiesHref({...filters,page:safePage+1})", "copy.next", "next pagination");
  const pageLabels = paginationNav.children.filter((child) => ts.isJsxElement(child) && child.openingElement.tagName.getText(tree) === "span");
  assert.equal(pageLabels.length, 1, "pagination must expose one visible page-position label");
  assertOnlyVisibleExpression(pageLabels[0], "copy.page(safePage, pageCount)", tree, "pagination position");
  assert(nodeText(state, tree).startsWith("readError ?") && nodeText(state, tree).includes(": filtered.length === 0 ?"), "state must distinguish error, empty and normal paths");
  assert(nodeText(results, tree).startsWith("!readError && filtered.length > 0 ?"), "results must be absent during error and empty states");
  assert.equal(visitLive(state, (node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "StateSurface").length, 2, "state slot must use exactly two live StateSurface callers");

  assert.equal(nodeText(directVariable(fn, "hasNonDefaultFilters"), tree), 'query.length > 0 || type !== "all" || lifecycle !== "active"', "clear visibility must depend only on q, type and lifecycle");
  assert.equal(nodeText(directVariable(fn, "allPartiesHref"), tree), 'buildPartiesHref({ query: "", type: "all", lifecycle: "all" })', "archived-only recovery must use the canonical all-lifecycle URL");
  assert.equal(nodeText(directVariable(fn, "emptyRecoveryHref"), tree), "hasArchivedOnlyAtDefault ? allPartiesHref : clearHref", "empty recovery must select the real all-lifecycle URL only for archived-only default state");
  const assertStatusCount = (name, status) => {
    const initializer = unwrap(directVariable(fn, name));
    assert(ts.isPropertyAccessExpression(initializer) && initializer.name.text === "length", `${name} must count a filtered collection`);
    const filterCall = unwrap(initializer.expression);
    assert(ts.isCallExpression(filterCall) && ts.isPropertyAccessExpression(filterCall.expression), `${name} must use parties.filter`);
    assert.equal(nodeText(filterCall.expression.expression, tree), "parties", `${name} must derive from the complete authorized parties collection`);
    assert.equal(filterCall.expression.name.text, "filter", `${name} must use a status filter`);
    assert.equal(filterCall.arguments.length, 1, `${name} must have one inline status predicate`);
    const callback = filterCall.arguments[0];
    assert(callback && ts.isArrowFunction(callback) && !ts.isBlock(callback.body), `${name} must use a direct status predicate`);
    assert.equal(nodeText(callback.parameters[0]?.name, tree), "party", `${name} must inspect each authorized party`);
    assert.equal(nodeText(callback.body, tree), `party.status === "${status}"`, `${name} must count only ${status} parties`);
  };
  assertStatusCount("activePartyCount", "active");
  assertStatusCount("archivedPartyCount", "archived");
  const archivedPredicate = directVariable(fn, "hasArchivedOnlyAtDefault");
  for (const readError of [false, true]) for (const query of ["", "x"]) for (const type of ["all", "corporate"]) for (const lifecycle of ["active", "all"]) for (const activePartyCount of [0, 1]) for (const archivedPartyCount of [0, 1]) {
    const expected = !readError && query.length === 0 && type === "all" && lifecycle === "active" && activePartyCount === 0 && archivedPartyCount > 0;
    assert.equal(Boolean(evaluateExpression(archivedPredicate, { readError, query, type, lifecycle, activePartyCount, archivedPartyCount })), expected, `archived-only recovery truth table changed for error=${readError},q=${query || "empty"},type=${type},lifecycle=${lifecycle},active=${activePartyCount},archived=${archivedPartyCount}`);
  }

  const filters = shellExpression("filters");
  const filterOpenings = visitLive(filters, (node) => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node));
  const forms = filterOpenings.filter((node) => node.tagName.getText(tree) === "form");
  assert.equal(forms.length, 1, "filters must expose one live GET form");
  assert.equal(jsxAttributeText(forms[0], "action", tree), 'action="/parties"', "filters form must submit to the canonical parties route");
  assert.equal(jsxAttributeText(forms[0], "method", tree), 'method="get"', "filters form must preserve query parameters with GET");
  const filterSections = filterOpenings.filter((node) => node.tagName.getText(tree) === "section");
  assert.equal(filterSections.length, 1, "filters slot must expose one named section");
  assert.equal(jsxAttributeText(filterSections[0], "aria-labelledby", tree), 'aria-labelledby="parties-filter-heading"', "filter section must reference the stable filter heading");
  const filterHeadings = filterOpenings.filter((node) => node.tagName.getText(tree) === "h2" && jsxAttributeText(node, "id", tree) === 'id="parties-filter-heading"');
  assert.equal(filterHeadings.length, 1, "filter section must expose one matching heading id");
  assert(ts.isJsxOpeningElement(filterHeadings[0]) && ts.isJsxElement(filterHeadings[0].parent), "filter heading must expose visible localized copy");
  assertOnlyVisibleExpression(filterHeadings[0].parent, "copy.searchLabel", tree, "filter heading");
  const clearLinks = filterOpenings.filter((node) => node.tagName.getText(tree) === "Link" && jsxAttributeText(node, "href", tree) === "href={clearHref}");
  assert.equal(clearLinks.length, 1, "filters must expose one live clear action");
  assert(ts.isJsxOpeningElement(clearLinks[0]) && ts.isJsxElement(clearLinks[0].parent), "top clear must retain visible localized copy");
  assertNoCompetingAccessibleName(clearLinks[0], "top clear link");
  assertOnlyVisibleExpression(clearLinks[0].parent, "copy.clear", tree, "top clear link");
  let clearConditional = clearLinks[0].parent;
  while (clearConditional && !ts.isConditionalExpression(clearConditional)) clearConditional = clearConditional.parent;
  assert(clearConditional && clearConditional.condition.getText(tree) === "hasNonDefaultFilters", "top clear must be gated by non-default filters");
  const stateConditional = unwrap(state);
  assert(ts.isConditionalExpression(stateConditional) && nodeText(stateConditional.condition, tree) === "readError", "state slot must branch first on readError");
  const errorSurface = unwrap(stateConditional.whenTrue);
  const emptyConditional = unwrap(stateConditional.whenFalse);
  assert(ts.isJsxSelfClosingElement(errorSurface) && errorSurface.tagName.getText(tree) === "StateSurface", "readError branch must render the live error StateSurface");
  assert.equal(jsxAttributeText(errorSurface, "tone", tree), 'tone="error"', "readError StateSurface must retain error tone");
  assert.equal(nodeText(jsxAttribute(errorSurface, "title"), tree), "copy.readError", "readError StateSurface must use localized error copy");
  const errorAction = unwrap(jsxAttribute(errorSurface, "action"));
  assert(ts.isJsxElement(errorAction), "readError StateSurface must expose a live action group");
  const errorLinks = visitLive(errorAction, (node) => ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "Link");
  assert.equal(errorLinks.length, 2, "readError action must contain exactly retry and workbench links");
  const retryLink = errorLinks.find((link) => nodeText(jsxAttribute(link.openingElement, "href"), tree) === "returnTo");
  const workbenchLink = errorLinks.find((link) => jsxAttributeText(link.openingElement, "href", tree) === 'href="/organize-center"');
  assert(retryLink && workbenchLink, "readError actions must retain returnTo retry and organize-center fallback");
  assertNoCompetingAccessibleName(retryLink.openingElement, "readError retry");
  assertOnlyVisibleExpression(retryLink, "copy.retry", tree, "readError retry");
  assertNoCompetingAccessibleName(workbenchLink.openingElement, "readError workbench link");
  assertOnlyVisibleExpression(workbenchLink, "copy.backToWorkbench", tree, "readError workbench link");
  assert(ts.isConditionalExpression(emptyConditional) && nodeText(emptyConditional.condition, tree).replaceAll(/\s+/g, "") === "filtered.length===0", "non-error state must branch on the fully filtered collection");
  assert(ts.isIdentifier(unwrap(emptyConditional.whenFalse)) && unwrap(emptyConditional.whenFalse).text === "undefined", "normal state must not render a StateSurface");
  const emptySurface = unwrap(emptyConditional.whenTrue);
  assert(ts.isJsxSelfClosingElement(emptySurface) && emptySurface.tagName.getText(tree) === "StateSurface", "empty branch must render one live StateSurface");
  assert.equal(jsxAttributeText(emptySurface, "tone", tree), 'tone="empty"', "empty StateSurface must retain empty tone");
  assert.equal(nodeText(jsxAttribute(emptySurface, "title"), tree).replaceAll(/\s+/g, ""), "parties.length===0?copy.noParties:copy.noResult", "empty title must distinguish absolute and filtered empty");
  assert.equal(nodeText(jsxAttribute(emptySurface, "description"), tree).replaceAll(/\s+/g, ""), "parties.length===0?undefined:hasArchivedOnlyAtDefault?copy.archivedOnlyHint:copy.noResultHint", "empty description must omit absolute-empty guidance and align archived-only guidance with view-all recovery");
  const emptyAction = unwrap(jsxAttribute(emptySurface, "action"));
  assert(ts.isConditionalExpression(emptyAction) && nodeText(emptyAction.condition, tree).replaceAll(/\s+/g, "") === "parties.length===0", "absolute empty must explicitly suppress recovery actions");
  assert(ts.isIdentifier(unwrap(emptyAction.whenTrue)) && unwrap(emptyAction.whenTrue).text === "undefined", "absolute empty must not render a recovery action");
  const recoveryLink = unwrap(emptyAction.whenFalse);
  assert(ts.isJsxElement(recoveryLink) && recoveryLink.openingElement.tagName.getText(tree) === "Link", "filtered empty must render one live recovery Link");
  assert.equal(nodeText(jsxAttribute(recoveryLink.openingElement, "href"), tree), "emptyRecoveryHref", "filtered empty recovery must use the selected canonical URL");
  assertNoCompetingAccessibleName(recoveryLink.openingElement, "filtered empty recovery");
  const recoveryCopy = recoveryLink.children.filter(ts.isJsxExpression).map((child) => child.expression).find(Boolean);
  assert(recoveryCopy && nodeText(recoveryCopy, tree).replaceAll(/\s+/g, "") === "hasArchivedOnlyAtDefault?copy.viewAll:copy.clear", "filtered and archived-only recovery must use matching independent copy");

  const controls = filterOpenings.filter((node) => ["input", "select"].includes(node.tagName.getText(tree)));
  const expectedControls = [
    ["input", 'name="q"'],
    ["select", 'name="type"'],
    ["select", 'name="lifecycle"'],
  ];
  for (const [tag, name] of expectedControls) {
    const matches = controls.filter((node) => node.tagName.getText(tree) === tag && jsxAttributeText(node, "name", tree) === name);
    assert.equal(matches.length, 1, `filters must expose one live ${name} control`);
    const tokens = jsxClassText(matches[0], tree).replace(/^['"]|['"]$/g, "").split(/\s+/);
    assert(tokens.includes("text-base") && tokens.includes("sm:text-sm") && !tokens.includes("text-sm"), `${name} must use mobile 16px and compact only from sm`);
    if (tag === "select") {
      let label = matches[0].parent;
      while (label && !(ts.isJsxElement(label) && label.openingElement.tagName.getText(tree) === "label")) label = label.parent;
      assert(label && jsxClassText(label.openingElement, tree).includes("bd-inline-select-frame") && jsxClassText(label.openingElement, tree).includes("min-h-11"), `${name} must retain the shared 44px focus frame`);
    }
  }
  const typeSelect = controls.find((node) => node.tagName.getText(tree) === "select" && jsxAttributeText(node, "name", tree) === 'name="type"');
  assert(typeSelect && jsxAttributeText(typeSelect, "defaultValue", tree) === "defaultValue={type}", "type select must reflect the normalized live type");
  assert(ts.isJsxOpeningElement(typeSelect) && ts.isJsxElement(typeSelect.parent), "type select must retain explicit options");
  const typeOptions = typeSelect.parent.children.filter((child) => ts.isJsxElement(child) && child.openingElement.tagName.getText(tree) === "option");
  assert.deepEqual(typeOptions.map((option) => jsxAttributeText(option.openingElement, "value", tree)), ['value="all"', 'value="individual"', 'value="corporate"'], "type select must expose all, individual and corporate options in the live form");
  const queryInput = controls.find((node) => node.tagName.getText(tree) === "input" && jsxAttributeText(node, "name", tree) === 'name="q"');
  assert(queryInput && jsxAttributeText(queryInput, "defaultValue", tree) === "defaultValue={query}", "query input must reflect the trimmed live query");
  const queryIdAttribute = jsxAnyAttribute(queryInput, "id");
  assert(queryIdAttribute?.initializer && ts.isStringLiteral(queryIdAttribute.initializer) && queryIdAttribute.initializer.text.length > 0, "query input must retain a non-empty stable id");
  const queryLabels = filterOpenings.filter((node) => node.tagName.getText(tree) === "label"
    && ts.isJsxOpeningElement(node)
    && ts.isJsxElement(node.parent)
    && node.parent.getText(tree).includes("copy.searchLabel")
    && isDescendant(node, forms[0].parent));
  assert.equal(queryLabels.length, 1, "live GET form must expose one localized query label");
  const queryForAttribute = jsxAnyAttribute(queryLabels[0], "htmlFor");
  assert(queryForAttribute?.initializer && ts.isStringLiteral(queryForAttribute.initializer) && queryForAttribute.initializer.text.length > 0, "query label must retain a non-empty htmlFor");
  assert.equal(queryForAttribute.initializer.text, queryIdAttribute.initializer.text, "query label htmlFor must exactly match the live q input id");
  const lifecycleSelect = controls.find((node) => node.tagName.getText(tree) === "select" && jsxAttributeText(node, "name", tree) === 'name="lifecycle"');
  assert(lifecycleSelect && jsxAttributeText(lifecycleSelect, "defaultValue", tree) === "defaultValue={lifecycle}", "lifecycle select must reflect the normalized live lifecycle");
  assert(ts.isJsxOpeningElement(lifecycleSelect) && ts.isJsxElement(lifecycleSelect.parent), "lifecycle select must retain explicit options");
  const lifecycleOptions = lifecycleSelect.parent.children.filter((child) => ts.isJsxElement(child) && child.openingElement.tagName.getText(tree) === "option");
  assert.deepEqual(lifecycleOptions.map((option) => jsxAttributeText(option.openingElement, "value", tree)), ['value="active"', 'value="archived"', 'value="all"'], "lifecycle select must expose active, archived and all exactly once");
  const assertWrappedSelectLabel = (select, copyField) => {
    assert(ts.isJsxOpeningElement(select) && ts.isJsxElement(select.parent), `${copyField} select must use a JSX element`);
    const selectElement = select.parent;
    let wrapper = selectElement.parent;
    while (wrapper && !(ts.isJsxElement(wrapper) && wrapper.openingElement.tagName.getText(tree) === "label")) wrapper = wrapper.parent;
    assert(wrapper && ts.isJsxElement(wrapper), `${copyField} select must remain inside its nearest wrapper label`);
    assert.equal(selectElement.parent, wrapper, `${copyField} select must be a direct control of its wrapper label`);
    const srOnlySpans = wrapper.children.filter((child) => ts.isJsxElement(child)
      && child.openingElement.tagName.getText(tree) === "span"
      && jsxClassText(child.openingElement, tree).replace(/^['"]|['"]$/g, "").split(/\s+/).includes("sr-only"));
    assert.equal(srOnlySpans.length, 1, `${copyField} wrapper label must expose one and only one sr-only accessible name`);
    const expressions = srOnlySpans[0].children.filter(ts.isJsxExpression).map((child) => child.expression).filter(Boolean);
    assert.equal(expressions.length, 1, `${copyField} sr-only label must contain one localized expression`);
    assert.equal(nodeText(expressions[0], tree), `copy.${copyField}`, `${copyField} wrapper label must use its exact localized accessible name`);
  };
  assertWrappedSelectLabel(typeSelect, "type");
  assertWrappedSelectLabel(lifecycleSelect, "lifecycle");
  const submitButtons = filterOpenings.filter((node) => node.tagName.getText(tree) === "button" && jsxAttributeText(node, "type", tree) === 'type="submit"');
  assert.equal(submitButtons.length, 1, "filters form must retain one live submit button");
  assert(isDescendant(submitButtons[0], forms[0].parent), "submit button must remain inside the live GET form");
  assert(ts.isJsxOpeningElement(submitButtons[0]) && ts.isJsxElement(submitButtons[0].parent), "live submit button must retain explicit children");
  assert(!jsxAnyAttribute(submitButtons[0], "aria-label") && !jsxAnyAttribute(submitButtons[0], "aria-labelledby"), "submit button must use its visible localized name without a competing hidden label");
  const submitElement = submitButtons[0].parent;
  const submitLabels = submitElement.children.filter(ts.isJsxExpression).map((child) => child.expression).filter(Boolean);
  assert.deepEqual(submitLabels.map((expression) => nodeText(expression, tree)), ["copy.filter"], "submit button must expose one visible localized copy.filter name");
  const submitIcons = submitElement.children.filter((child) => ts.isJsxElement(child)
    && child.openingElement.tagName.getText(tree) === "span"
    && jsxClassText(child.openingElement, tree).includes("material-symbols-outlined"));
  assert.equal(submitIcons.length, 1, "submit button must retain one decorative search icon");
  assert.equal(jsxAttributeText(submitIcons[0].openingElement, "aria-hidden", tree), 'aria-hidden="true"', "submit search icon must remain hidden from assistive technology");

  const interactive = openings.filter((node) => ["Link", "button"].includes(node.tagName.getText(tree)) && isDescendant(node, shell.parent));
  assert(interactive.length >= 7, "live shell must retain its navigation and recovery actions");
  const focusTokens = ["focus-visible:outline", "focus-visible:outline-[length:var(--bd-focus-ring-width)]", "focus-visible:outline-[color:var(--bd-focus-ring-color)]", "focus-visible:outline-offset-[var(--bd-focus-ring-offset)]"];
  for (const node of interactive) {
    const className = jsxClassText(node, tree);
    assert(className.includes("min-h-11"), `${node.tagName.getText(tree)} live action must retain a 44px target`);
    for (const token of focusTokens) assert(className.includes(token), `${node.tagName.getText(tree)} live action must retain ${token}`);
  }
  const input = controls.find((node) => node.tagName.getText(tree) === "input");
  for (const token of focusTokens) assert(jsxClassText(input, tree).includes(token), `search input must retain ${token}`);
  const fallback = openings.find((node) => jsxAnyAttribute(node, "data-list-return-fallback"));
  for (const token of focusTokens) assert(jsxClassText(fallback, tree).includes(token), `list return fallback must retain ${token}`);
  assert(!nodeText(finalReturn.expression, tree).includes("shadow-sm"), "parties main flow must not restore decorative shadows");
}

const HUB_READER_EXPECTED = Object.freeze({
  callee: "listClientsForContext",
  context: "context.requestContext",
  sort: "recent_contact",
  lifecycleStatus: "context.lifecycleStatus",
});

function analyzeHub(source) {
  const tree = parse(source, "hub.ts");
  const partyInterface = tree.statements.find((statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === "HubPartyItem");
  assert(partyInterface && ts.isTypeLiteralNode(partyInterface.type), "HubPartyItem must remain a type literal");
  const reasonMember = partyInterface.type.members.find((member) => ts.isPropertySignature(member) && member.name.getText(tree) === "readOnlyReason");
  assert(reasonMember?.questionToken, "HubPartyItem must carry an optional readOnlyReason");
  assert.match(nodeText(reasonMember.type, tree), /["']company_read["']\s*\|\s*["']owner_read_only["']/, "readOnlyReason must preserve both visibility outcomes");

  const mapper = directFunction(tree, "mapVisibleHubParty");
  assert(mapper.parameters.some((parameter) => parameter.name.getText(tree) === "readOnlyReason"), "visible party mapper must accept the resolved reason");
  assert(mapper.parameters.some((parameter) => parameter.name.getText(tree) === "canArchive"), "visible party mapper must accept the archive decision");
  const mapperReturn = mapper.body.statements.find(ts.isReturnStatement);
  assert(mapperReturn?.expression, "visible party mapper must return its item");
  assertReachableStatement(mapper.body, mapperReturn, "visible party mapper return");
  assert.equal(nodeText(objectProperty(mapperReturn.expression, "canWrite"), tree), "canWrite", "visible party item must expose the live write decision");
  assert.equal(nodeText(objectProperty(mapperReturn.expression, "canArchive"), tree), "canArchive", "visible party item must expose the live archive decision");
  assert.equal(nodeText(objectProperty(mapperReturn.expression, "readOnlyReason"), tree), "readOnlyReason", "visible party item must expose the live reason");

  const listFn = directFunction(tree, "listHubParties");
  const contextIf = listFn.body.statements.find((statement) => ts.isIfStatement(statement) && nodeText(statement.expression, tree) === "context.requestContext");
  assert(contextIf && ts.isBlock(contextIf.thenStatement), "request-context list path must remain a direct live branch");
  assertReachableStatement(listFn.body, contextIf, "request-context list branch");
  const visibleInitializer = unwrap(directBlockVariable(contextIf.thenStatement, "visible", "request-context branch"));
  assert(ts.isAwaitExpression(visibleInitializer), "request-context party reader must be awaited");
  const visibleCall = unwrap(visibleInitializer.expression);
  assert(visibleCall && ts.isCallExpression(visibleCall), "request-context visible initializer must be a direct call");
  assert.equal(nodeText(visibleCall.expression, tree), HUB_READER_EXPECTED.callee, "request-context branch must use the authorized party reader");
  assert.equal(visibleCall.arguments.length, 1, "authorized party reader must receive one options object");
  const readerOptions = unwrap(visibleCall.arguments[0]);
  assert(ts.isObjectLiteralExpression(readerOptions), "authorized party reader options must remain an object literal");
  assert.equal(readerOptions.properties.length, 2, "authorized party reader options must contain only context and filter");
  assert(readerOptions.properties.every((property) => ts.isPropertyAssignment(property)), "authorized party reader options must use direct named fields");
  assert.equal(nodeText(objectProperty(readerOptions, "context"), tree), HUB_READER_EXPECTED.context, "authorized party reader must use the live request context");
  const filter = unwrap(objectProperty(readerOptions, "filter"));
  assert(ts.isObjectLiteralExpression(filter), "authorized party reader filter must remain an object literal");
  assert.equal(filter.properties.length, 2, "authorized party reader filter must contain only sort and lifecycleStatus");
  assert(filter.properties.every((property) => ts.isPropertyAssignment(property)), "authorized party reader filter must use direct named fields");
  const sort = unwrap(objectProperty(filter, "sort"));
  assert(ts.isStringLiteral(sort) && sort.text === HUB_READER_EXPECTED.sort, "authorized party reader must retain recent-contact ordering");
  assert.equal(nodeText(objectProperty(filter, "lifecycleStatus"), tree), HUB_READER_EXPECTED.lifecycleStatus, "authorized party reader must retain the live lifecycle filter");
  const branchReturns = contextIf.thenStatement.statements.filter(ts.isReturnStatement);
  assert.equal(branchReturns.length, 1, "request-context branch must have one direct return");
  assert.equal(contextIf.thenStatement.statements.at(-1), branchReturns[0], "visible map return must be the final request-context statement");
  assertReachableStatement(contextIf.thenStatement, branchReturns[0], "authorized visible map return");
  const mapExpression = unwrap(branchReturns[0].expression);
  assert(mapExpression && ts.isCallExpression(mapExpression) && ts.isPropertyAccessExpression(mapExpression.expression), "request-context branch must return a map call");
  assert.equal(nodeText(mapExpression.expression.expression, tree), "visible", "live map must consume the authorized visible collection");
  assert.equal(mapExpression.expression.name.text, "map", "authorized collection must be mapped directly");
  const itemCallback = mapExpression.arguments[0];
  assert(itemCallback && ts.isArrowFunction(itemCallback) && ts.isBlock(itemCallback.body), "visible map must use an inline live callback");
  const liveCanWrite = nodeText(directVariable(itemCallback, "canWrite"), tree);
  const liveCanArchive = nodeText(directVariable(itemCallback, "canArchive"), tree);
  const liveReason = nodeText(directVariable(itemCallback, "readOnlyReason"), tree);
  assert.match(liveCanWrite, /^item\.resolution\.canWrite\s*&&\s*context\.canUpdateRecords\s*!==\s*false$/, "write decision must combine owner_write with record.update capability");
  assert.match(liveCanArchive, /^canWrite\s*&&\s*context\.canArchiveRecords\s*===\s*true$/, "archive decision must additionally require record.archive capability");
  assert.match(liveReason, /^canWrite\s*\?\s*undefined\s*:\s*item\.resolution\.outcome\s*===\s*["']company_read["']\s*\?\s*["']company_read["']\s*:\s*["']owner_read_only["']$/, "live reason must distinguish writable owner, company read, and owner capability read-only");
  const callbackReturns = itemCallback.body.statements.filter(ts.isReturnStatement);
  assert.equal(callbackReturns.length, 1, "visible item callback must have one direct return");
  assert.equal(itemCallback.body.statements.at(-1), callbackReturns[0], "visible item mapper must be the final callback statement");
  assertReachableStatement(itemCallback.body, callbackReturns[0], "visible item callback return");
  const mapperCall = unwrap(callbackReturns[0].expression);
  assert(mapperCall && ts.isCallExpression(mapperCall) && nodeText(mapperCall.expression, tree) === "mapVisibleHubParty", "live callback must return mapVisibleHubParty");
  assert.deepEqual(mapperCall.arguments.map((argument) => nodeText(argument, tree)), ["locale", "item.client", "canWrite", "canArchive", "readOnlyReason", "item._count.quotations"], "live mapper must receive the exact derived decisions");
}

const LOADING_COPY_EXPECTED = {
  ja: { pageTitle: "関係者", description: "関係者を検索し、連絡先・役割・状態を確認します。", results: "関係者一覧", loadingTitle: "関係者を読み込んでいます", loadingDescription: "検索条件と関係者一覧を準備しています。" },
  zh: { pageTitle: "相关主体", description: "搜索相关主体，查看联系方式、角色和状态。", results: "主体列表", loadingTitle: "正在加载相关主体", loadingDescription: "正在准备搜索条件和主体列表。" },
  ko: { pageTitle: "관계자", description: "관계자를 검색하고 연락처, 역할, 상태를 확인합니다.", results: "관계자 목록", loadingTitle: "관계자를 불러오는 중입니다", loadingDescription: "검색 조건과 관계자 목록을 준비하고 있습니다." },
};

const ARCHIVED_ONLY_HINT_EXPECTED = Object.freeze({
  ja: "すべての関係者を表示すると、アーカイブ済みの記録を確認できます。",
  zh: "查看全部主体后，可确认已归档的记录。",
  ko: "전체 관계자를 보면 보관된 기록을 확인할 수 있습니다.",
});

function analyzeArchivedOnlyCopy(source) {
  const tree = parse(source, "parties/page-copy.tsx");
  const declaration = tree.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((item) => ts.isIdentifier(item.name) && item.name.text === "partiesCopy");
  assert(declaration?.initializer, "partiesCopy must remain a top-level locale object");
  const copy = unwrap(declaration.initializer);
  assert(ts.isObjectLiteralExpression(copy), "partiesCopy must remain an object literal");
  for (const [locale, expected] of Object.entries(ARCHIVED_ONLY_HINT_EXPECTED)) {
    const localeCopy = unwrap(objectProperty(copy, locale));
    const hint = unwrap(objectProperty(localeCopy, "archivedOnlyHint"));
    assert(ts.isStringLiteral(hint) && hint.text === expected, `${locale} archived-only guidance must match the independent view-all expectation`);
  }
}

function analyzeLoading(source) {
  const tree = parse(source, "parties/loading.tsx");
  const declaration = visit(tree, (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "loadingCopy")[0];
  const copyObject = declaration?.initializer && unwrap(declaration.initializer);
  assert(copyObject && ts.isObjectLiteralExpression(copyObject), "loading must expose independent top-level locale copy");
  const property = (object, name) => {
    const value = unwrap(object);
    assert(ts.isObjectLiteralExpression(value), `${name} owner must be an object literal`);
    const entry = value.properties.find((item) => ts.isPropertyAssignment(item) && item.name.getText(tree).replaceAll(/["']/g, "") === name);
    assert(entry && ts.isPropertyAssignment(entry), `${name} loading copy field must exist`);
    return unwrap(entry.initializer);
  };
  for (const [locale, fields] of Object.entries(LOADING_COPY_EXPECTED)) {
    const localeObject = property(copyObject, locale);
    assert(ts.isObjectLiteralExpression(localeObject), `loading ${locale} copy must remain an object literal`);
    assert.equal(localeObject.properties.length, Object.keys(fields).length, `loading ${locale} copy must not add visible static count fields`);
    assert(localeObject.properties.every((entry) => ts.isPropertyAssignment(entry)), `loading ${locale} copy must use only direct named fields`);
    for (const [field, expected] of Object.entries(fields)) {
      const value = property(localeObject, field);
      assert(ts.isStringLiteral(value) && value.text === expected, `loading ${locale}.${field} must match its independent expectation`);
    }
  }
  const fn = directFunction(tree, "PartiesLoading");
  const finalReturn = fn.body.statements.at(-1);
  assert(finalReturn && ts.isReturnStatement(finalReturn) && finalReturn.expression, "PartiesLoading must end in live route JSX");
  assertReachableStatement(fn.body, finalReturn, "PartiesLoading final return");
  const calls = visitLive(fn.body, (node) => ts.isCallExpression(node));
  const localeCalls = calls.filter((node) => node.expression.getText(tree) === "getLocale");
  assert.equal(localeCalls.length, 1, "loading must read one live locale");
  assert(ts.isAwaitExpression(localeCalls[0].parent), "loading locale must be awaited");
  assert.equal(nodeText(directVariable(fn, "copy"), tree), "loadingCopy[locale]", "loading must select live locale copy");
  const openings = visitLive(finalReturn.expression, (node) => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node));
  const byTag = (tag) => openings.filter((node) => node.tagName.getText(tree) === tag);
  for (const tag of ["PageFrame", "PageHeader", "ListReportShell", "StateSurface"]) assert.equal(byTag(tag).length, 1, `loading must render one live ${tag}`);
  const header = byTag("PageHeader")[0];
  assert.equal(jsxAttributeText(header, "title", tree), "title={copy.pageTitle}", "loading header must use localized title");
  assert.equal(jsxAttributeText(header, "description", tree), "description={copy.description}", "loading header must use localized description");
  const shell = byTag("ListReportShell")[0];
  assert.equal(jsxAttributeText(shell, "aria-busy", tree), 'aria-busy="true"', "loading shell must expose busy state");
  const summary = jsxAnyAttribute(shell, "summary");
  if (summary) {
    assert(
      summary.initializer
      && ts.isJsxExpression(summary.initializer)
      && summary.initializer.expression
      && ts.isIdentifier(summary.initializer.expression)
      && summary.initializer.expression.text === "undefined",
      "loading shell summary must be absent or explicitly undefined so it cannot invent result counts",
    );
  }
  for (const slot of ["scope", "filters", "results", "state"]) assert(jsxAnyAttribute(shell, slot), `loading shell must preserve ${slot} identity`);
  assert.equal(jsxAttributeText(byTag("StateSurface")[0], "tone", tree), 'tone="loading"', "loading state must use loading tone");
  const maps = visitLive(finalReturn.expression, (node) => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "map");
  assert.equal(maps.length, 2, "loading must expose one filter and one result skeleton map");
  assert.deepEqual(maps.map((node) => node.expression.expression.getText(tree)), ["[0, 1, 2, 3]", "[0, 1, 2]"], "loading skeletons must remain bounded and must not use business data");
  for (const map of maps) {
    const skeletons = visitLive(map.arguments[0], (node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "div");
    assert(skeletons.length > 0, "each loading map must render live skeletons");
    for (const skeleton of skeletons) {
      const className = jsxClassText(skeleton, tree);
      assert(className.includes("animate-pulse") && className.includes("motion-reduce:animate-none") && className.includes("min-h-11"), "live skeletons must be touch-height and reduced-motion safe");
    }
  }
  const resultCallback = maps[1].arguments[0];
  assert(resultCallback && ts.isArrowFunction(resultCallback), "result skeleton map must retain one inline row callback");
  const resultRow = unwrap(resultCallback.body);
  assert(ts.isJsxElement(resultRow), "result skeleton callback must render one row");
  assert(jsxClassText(resultRow.openingElement, tree).includes("lg:grid-cols-6"), "desktop loading row must reserve the formal six-column table geometry");
  const resultCells = visitLive(resultRow, (node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "div");
  assert.equal(resultCells.length, 6, "each loading result row must render six column skeletons");
  assert(!/resultRange|pageCount|visibleParties|listHubParties/.test(source), "route loading must not invent counts, rows or data reads");
}

function extractStringArray(source, name) {
  const tree = parse(source, "tenant-permissions.ts");
  const declaration = visit(tree, (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name)[0];
  assert(declaration?.initializer, `${name} must exist`);
  const initializer = unwrap(declaration.initializer);
  assert(ts.isArrayLiteralExpression(initializer), `${name} must be an array`);
  return initializer.elements.filter(ts.isStringLiteral).map((item) => item.text);
}

function extractCapabilityActions(source, preset) {
  const tree = parse(source, "tenant-permissions.ts");
  const declaration = visit(tree, (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "CAPABILITY_PERMISSIONS")[0];
  assert(declaration?.initializer, "CAPABILITY_PERMISSIONS must exist");
  const object = unwrap(declaration.initializer);
  assert(ts.isObjectLiteralExpression(object), "CAPABILITY_PERMISSIONS must be an object");
  const property = object.properties.find((item) => item.name?.getText(tree) === preset);
  assert(property && ts.isPropertyAssignment(property), `${preset} capability list must exist`);
  const initializer = unwrap(property.initializer);
  if (preset === "company_owner") {
    assert.match(nodeText(initializer, tree), /FULL_TENANT_ACTIONS/, "company_owner must retain the complete action set");
    return extractStringArray(source, "TENANT_PERMISSION_ACTIONS");
  }
  assert(ts.isArrayLiteralExpression(initializer), `${preset} capabilities must be an array`);
  return initializer.elements.filter(ts.isStringLiteral).map((item) => item.text);
}

function evaluateNormalizePartyReturnTo(source) {
  const tree = parse(source, "party-profile.ts");
  const fn = directFunction(tree, "normalizePartyReturnTo");
  const transpiled = ts.transpileModule(nodeText(fn, tree), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  return Function("exports", `${transpiled}; return exports.normalizePartyReturnTo;`)({});
}

function assertLiveSearchBehavior(source) {
  const tree = parse(source, "parties/search-behavior.tsx");
  const fn = directFunction(tree, "PartiesPage");
  const query = nodeText(directVariable(fn, "query"), tree);
  const searched = nodeText(directVariable(fn, "searched"), tree);
  const search = Function(`return function search(params, lifecycleFiltered) { const query = ${query}; const searched = ${searched}; return searched; };`)();
  const rows = [
    { id: "name", name: "Alpha Estates", phone: "000-0000", email: undefined, explicitRoles: ["tenant"] },
    { id: "phone", name: "Bravo", phone: "090-2468-1357", email: undefined, explicitRoles: ["buyer"] },
    { id: "email", name: "Charlie", phone: "111-1111", email: "Desk@Example.COM", explicitRoles: ["seller"] },
    { id: "role", name: "Delta", phone: "222-2222", email: undefined, explicitRoles: ["Property MANAGER"] },
  ];
  const ids = (result) => result.map((row) => row.id);
  assert.deepEqual(ids(search({ q: "alpha" }, rows)), ["name"], "name search must match case-insensitively");
  assert.deepEqual(ids(search({ q: "2468" }, rows)), ["phone"], "phone search must match independently");
  assert.deepEqual(ids(search({ q: "EXAMPLE.com" }, rows)), ["email"], "optional email search must match case-insensitively");
  assert.deepEqual(ids(search({ q: "manager" }, rows)), ["role"], "explicit role search must match case-insensitively");
  assert.deepEqual(ids(search({ q: "  ALPHA  " }, rows)), ["name"], "query search must trim before lowercase matching");
  assert.deepEqual(ids(search({ q: "not-present" }, rows)), [], "nonmatching query must return no rows");
  assert.equal(search({}, rows), rows, "omitted query must preserve the lifecycle-filtered collection identity");
  assert.equal(search({ q: "   " }, rows), rows, "whitespace-only query must preserve the lifecycle-filtered collection identity");
}

function assertLiveTypeAndPaginationBehavior(source) {
  const tree = parse(source, "parties/type-pagination-behavior.tsx");
  const fn = directFunction(tree, "PartiesPage");
  const normalizeTypeFn = directFunction(tree, "normalizeType");
  const normalizeTypeCode = ts.transpileModule(nodeText(normalizeTypeFn, tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const typeExpression = nodeText(directVariable(fn, "type"), tree);
  const filteredExpression = nodeText(directVariable(fn, "filtered"), tree);
  const filterRows = Function(`${normalizeTypeCode}; return function(params, searched) { const type = ${typeExpression}; const filtered = ${filteredExpression}; return { type, filtered }; };`)();
  const rows = [
    { id: "corp", explicitPartyType: "corporate" },
    { id: "person", explicitPartyType: "individual" },
    { id: "unset", explicitPartyType: undefined },
  ];
  assert.deepEqual(filterRows({}, rows), { type: "all", filtered: rows }, "missing type must normalize to all without dropping rows");
  assert.deepEqual(filterRows({ type: "invalid" }, rows), { type: "all", filtered: rows }, "invalid type must normalize to all");
  assert.deepEqual(filterRows({ type: "corporate" }, rows).filtered.map((row) => row.id), ["corp"], "corporate filter must match only explicit corporate rows");
  assert.deepEqual(filterRows({ type: "individual" }, rows).filtered.map((row) => row.id), ["person"], "individual filter must match only explicit individual rows");

  const pageCount = nodeText(directVariable(fn, "pageCount"), tree);
  const safePage = nodeText(directVariable(fn, "safePage"), tree);
  const visibleParties = nodeText(directVariable(fn, "visibleParties"), tree);
  const rangeStart = nodeText(directVariable(fn, "rangeStart"), tree);
  const rangeEnd = nodeText(directVariable(fn, "rangeEnd"), tree);
  const paginate = Function(`return function(filtered, requestedPage) { const PARTIES_PAGE_SIZE = 12; const pageCount = ${pageCount}; const safePage = ${safePage}; const visibleParties = ${visibleParties}; const rangeStart = ${rangeStart}; const rangeEnd = ${rangeEnd}; return { pageCount, safePage, visibleParties, rangeStart, rangeEnd }; };`)();
  const records = Array.from({ length: 25 }, (_, id) => ({ id }));
  const middle = paginate(records, 2);
  assert.deepEqual({ pageCount: middle.pageCount, safePage: middle.safePage, ids: middle.visibleParties.map((row) => row.id), rangeStart: middle.rangeStart, rangeEnd: middle.rangeEnd }, { pageCount: 3, safePage: 2, ids: records.slice(12, 24).map((row) => row.id), rangeStart: 13, rangeEnd: 24 }, "second page must expose exactly rows 13-24");
  const clamped = paginate(records, 99);
  assert.deepEqual({ safePage: clamped.safePage, ids: clamped.visibleParties.map((row) => row.id), rangeStart: clamped.rangeStart, rangeEnd: clamped.rangeEnd }, { safePage: 3, ids: [24], rangeStart: 25, rangeEnd: 25 }, "out-of-range page must clamp to the final 12-row slice");
  assert.deepEqual(paginate([], 4), { pageCount: 1, safePage: 1, visibleParties: [], rangeStart: 0, rangeEnd: 0 }, "empty pagination must remain canonical and count-free");

  const hrefFn = directFunction(tree, "buildPartiesHref");
  const hrefCode = ts.transpileModule(nodeText(hrefFn, tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const buildHref = Function(`${hrefCode}; return buildPartiesHref;`)();
  assert.equal(buildHref({ query: "Alpha", type: "corporate", lifecycle: "archived", page: 2 }), "/parties?q=Alpha&type=corporate&lifecycle=archived&page=2", "pagination href must preserve q, type, lifecycle and page");
}

function assertLiveEmptyRecoveryBehavior(source) {
  const tree = parse(source, "parties/empty-recovery-behavior.tsx");
  const fn = directFunction(tree, "PartiesPage");
  const activeCount = nodeText(directVariable(fn, "activePartyCount"), tree);
  const archivedCount = nodeText(directVariable(fn, "archivedPartyCount"), tree);
  const archivedOnly = nodeText(directVariable(fn, "hasArchivedOnlyAtDefault"), tree);
  const recovery = nodeText(directVariable(fn, "emptyRecoveryHref"), tree);
  const evaluate = Function(`return function(parties, readError, query, type, lifecycle) { const activePartyCount = ${activeCount}; const archivedPartyCount = ${archivedCount}; const hasArchivedOnlyAtDefault = ${archivedOnly}; const allPartiesHref = "/parties?lifecycle=all"; const clearHref = "/parties"; const emptyRecoveryHref = ${recovery}; return { activePartyCount, archivedPartyCount, hasArchivedOnlyAtDefault, emptyRecoveryHref }; };`)();
  assert.deepEqual(evaluate([], false, "", "all", "active"), { activePartyCount: 0, archivedPartyCount: 0, hasArchivedOnlyAtDefault: false, emptyRecoveryHref: "/parties" }, "absolute empty must not masquerade as archived-only recovery");
  assert.deepEqual(evaluate([{ status: "archived" }], false, "", "all", "active"), { activePartyCount: 0, archivedPartyCount: 1, hasArchivedOnlyAtDefault: true, emptyRecoveryHref: "/parties?lifecycle=all" }, "archived-only default must recover through the real all-lifecycle URL");
  assert.deepEqual(evaluate([{ status: "active" }, { status: "archived" }], false, "missing", "all", "active"), { activePartyCount: 1, archivedPartyCount: 1, hasArchivedOnlyAtDefault: false, emptyRecoveryHref: "/parties" }, "ordinary filtered empty must clear conditions rather than force all lifecycle");
  assert.equal(evaluate([{ status: "archived" }], true, "", "all", "active").hasArchivedOnlyAtDefault, false, "read error must never expose archived-only recovery");
}

function assertLiveFilterFormBehavior(source) {
  const tree = parse(source, "parties/filter-form-behavior.tsx");
  const fn = directFunction(tree, "PartiesPage");
  const finalReturn = fn.body.statements.at(-1);
  assert(finalReturn && ts.isReturnStatement(finalReturn) && finalReturn.expression, "filter behavior must bind the live page return");
  const openings = visitLive(finalReturn.expression, (node) => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node));
  const control = (tag, name) => {
    const matches = openings.filter((node) => node.tagName.getText(tree) === tag && jsxAttributeText(node, "name", tree) === `name="${name}"`);
    assert.equal(matches.length, 1, `filter behavior must bind one ${name} control`);
    return matches[0];
  };
  const queryDefault = nodeText(jsxAttribute(control("input", "q"), "defaultValue"), tree);
  const lifecycleDefault = nodeText(jsxAttribute(control("select", "lifecycle"), "defaultValue"), tree);
  const snapshot = Function(`return function(query, lifecycle) { return { query: ${queryDefault}, lifecycle: ${lifecycleDefault} }; };`)();
  for (const [query, lifecycle] of [["", "active"], ["Alpha", "archived"], ["同一接頭辞", "all"]]) {
    assert.deepEqual(snapshot(query, lifecycle), { query, lifecycle }, `filter form must preserve q=${query || "empty"} and lifecycle=${lifecycle}`);
  }
}

function assertLiveSummaryBehavior(source) {
  const tree = parse(source, "parties/summary-behavior.tsx");
  const fn = directFunction(tree, "PartiesPage");
  const finalReturn = fn.body.statements.at(-1);
  assert(finalReturn && ts.isReturnStatement(finalReturn) && finalReturn.expression, "summary behavior must bind the live page return");
  const shells = visitLive(finalReturn.expression, (node) => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(tree) === "ListReportShell");
  assert.equal(shells.length, 1, "summary behavior must bind one live shell");
  const summary = unwrap(jsxAttribute(shells[0], "summary"));
  assert(ts.isConditionalExpression(summary), "summary behavior must retain a conditional");
  const paragraph = unwrap(summary.whenTrue);
  assert(ts.isJsxElement(paragraph), "summary behavior true branch must render JSX");
  const expression = paragraph.children.filter(ts.isJsxExpression).map((child) => child.expression).find(Boolean);
  assert(expression, "summary behavior must retain its live result expression");
  const evaluate = Function(`return function(rangeStart, rangeEnd, filtered) { const copy = { resultRange: (...args) => args }; return ${nodeText(expression, tree)}; };`)();
  assert.deepEqual(evaluate(0, 0, []), [0, 0, 0], "empty summary arguments must remain 0,0,0");
  assert.deepEqual(evaluate(13, 24, Array.from({ length: 25 })), [13, 24, 25], "paged summary must report visible range and complete filtered total");
}

function assertLivePaginationAndRowLabelBehavior(source) {
  const tree = parse(source, "parties/pagination-row-label-behavior.tsx");
  const fn = directFunction(tree, "PartiesPage");
  const finalReturn = fn.body.statements.at(-1);
  assert(finalReturn && ts.isReturnStatement(finalReturn) && finalReturn.expression, "pagination behavior must bind the live page return");
  const shell = visitLive(finalReturn.expression, (node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "ListReportShell")[0];
  assert(shell, "pagination behavior must bind the live shell");
  const pagination = unwrap(jsxAttribute(shell, "pagination"));
  assert(ts.isConditionalExpression(pagination), "pagination behavior must retain its live conditional");
  for (const [pageCount, readError, expected] of [[1, false, false], [2, true, false], [2, false, true]]) {
    assert.equal(Boolean(evaluateExpression(pagination.condition, { pageCount, readError })), expected, `pagination visibility changed for pages=${pageCount},error=${readError}`);
  }
  const nav = unwrap(pagination.whenTrue);
  const boundaries = visitLive(nav, (node) => ts.isConditionalExpression(node));
  for (const [safePage, pageCount, previous, next] of [[1, 3, false, true], [2, 3, true, true], [3, 3, true, false]]) {
    assert.equal(Boolean(evaluateExpression(boundaries[0].condition, { safePage, pageCount })), previous, `previous boundary changed at ${safePage}/${pageCount}`);
    assert.equal(Boolean(evaluateExpression(boundaries[1].condition, { safePage, pageCount })), next, `next boundary changed at ${safePage}/${pageCount}`);
  }

  const rowMap = visitLive(finalReturn.expression, (node) => ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && nodeText(node.expression.expression, tree) === "visibleParties"
    && node.expression.name.text === "map")[0];
  const callback = rowMap?.arguments[0];
  assert(callback && ts.isArrowFunction(callback) && ts.isBlock(callback.body), "row-label behavior must bind the live row callback");
  const typeExpression = nodeText(directVariable(callback, "typeLabel"), tree);
  const statusExpression = nodeText(directVariable(callback, "statusLabel"), tree);
  const evaluateType = Function("party", "copy", "notSet", `return ${typeExpression};`);
  const evaluateStatus = Function("party", "copy", `return ${statusExpression};`);
  const copy = { corporate: "CORPORATE_LONG_CJK_会社法人主体", individual: "INDIVIDUAL_LONG_CJK_個人関係者", archived: "ARCHIVED_LONG_CJK_已归档", active: "ACTIVE_LONG_CJK_진행중" };
  assert.equal(evaluateType({ explicitPartyType: "corporate" }, copy, "NOT_SET"), copy.corporate, "corporate row label must preserve the full localized value");
  assert.equal(evaluateType({ explicitPartyType: "individual" }, copy, "NOT_SET"), copy.individual, "individual row label must preserve the full localized value");
  assert.equal(evaluateType({ explicitPartyType: undefined }, copy, "NOT_SET"), "NOT_SET", "unknown row type must retain the localized fallback");
  assert.equal(evaluateStatus({ status: "archived" }, copy), copy.archived, "archived row label must preserve the full localized value");
  assert.equal(evaluateStatus({ status: "active" }, copy), copy.active, "active row label must preserve the full localized value");
}

analyzePage(sources.page);
assertVisibleNameHelperBehavior();
analyzePageStateAndControls(sources.page);
analyzeHub(sources.hub);
analyzeLoading(sources.loading);
analyzeArchivedOnlyCopy(sources.page);
assertLiveSearchBehavior(sources.page);
assertLiveTypeAndPaginationBehavior(sources.page);
assertLiveEmptyRecoveryBehavior(sources.page);
assertLiveFilterFormBehavior(sources.page);
assertLiveSummaryBehavior(sources.page);
assertLivePaginationAndRowLabelBehavior(sources.page);

const expectedCapabilityFacts = {
  company_owner: { update: true, archive: true },
  company_form_admin: { update: true, archive: true },
  ordinary_member: { update: true, archive: false },
};
for (const [preset, expected] of Object.entries(expectedCapabilityFacts)) {
  const actions = new Set(extractCapabilityActions(sources.permissions, preset));
  assert.equal(actions.has("record.update"), expected.update, `${preset} record.update fact changed`);
  assert.equal(actions.has("record.archive"), expected.archive, `${preset} record.archive fact changed`);
}
const accessMatrix = [
  { preset: "company_owner", objectCanWrite: true, canWrite: true, canArchive: true },
  { preset: "company_form_admin", objectCanWrite: true, canWrite: true, canArchive: true },
  { preset: "ordinary_member", objectCanWrite: true, canWrite: true, canArchive: false },
  { preset: "company_owner", objectCanWrite: false, canWrite: false, canArchive: false },
];
for (const row of accessMatrix) {
  const capability = expectedCapabilityFacts[row.preset];
  const actualCanWrite = row.objectCanWrite && capability.update;
  const actualCanArchive = actualCanWrite && capability.archive;
  assert.equal(actualCanWrite, row.canWrite, `${row.preset} write matrix changed`);
  assert.equal(actualCanArchive, row.canArchive, `${row.preset} archive matrix changed`);
}

const emptyStateFixture = [
  { name: "Active Individual", status: "active", type: "individual" },
  { name: "Archived Corporation", status: "archived", type: "corporate" },
];
function expectedPartyResults(parties, { lifecycle, query = "", type = "all" }) {
  return parties
    .filter((party) => lifecycle === "all" || party.status === lifecycle)
    .filter((party) => !query || party.name.toLowerCase().includes(query.toLowerCase()))
    .filter((party) => type === "all" || party.type === type);
}
const emptyStateCases = [
  { parties: [], filters: { lifecycle: "all" }, kind: "absolute-empty" },
  { parties: emptyStateFixture, filters: { lifecycle: "archived", query: "missing" }, kind: "query-empty" },
  { parties: emptyStateFixture, filters: { lifecycle: "active", type: "corporate" }, kind: "type-empty" },
  { parties: emptyStateFixture.slice(0, 1), filters: { lifecycle: "archived" }, kind: "lifecycle-empty" },
];
for (const testCase of emptyStateCases) {
  const results = expectedPartyResults(testCase.parties, testCase.filters);
  assert.equal(results.length, 0, `${testCase.kind} fixture must remain empty`);
  assert.equal(testCase.parties.length === 0 ? "absolute-empty" : "filtered-empty", testCase.kind === "absolute-empty" ? "absolute-empty" : "filtered-empty", `${testCase.kind} copy classification changed`);
}
const actionTree = parse(sources.actions, "actions.ts");
const archiveAction = directFunction(actionTree, "setRecordLifecycleAction");
assert.match(nodeText(archiveAction.body, actionTree), /requireTenantSession\(\{\s*permission:\s*["']record\.archive["']\s*\}\)/, "server archive action must retain record.archive authorization");

const normalizePartyReturnTo = evaluateNormalizePartyReturnTo(sources.partyProfile);
const returnToCases = [
  ["/parties?q=Alpha&type=corporate&lifecycle=archived&page=2", "/parties?q=Alpha&type=corporate&lifecycle=archived&page=2"],
  ["/organize-center?type=party&q=Alpha&lifecycle=active&page=2", "/organize-center?type=party&q=Alpha&lifecycle=active&page=2"],
  ["", "/parties"],
  ["https://evil.example/parties", "/parties"],
  ["//evil.example/parties", "/parties"],
  ["/workspace", "/parties"],
  ["/parties?unexpected=1", "/parties"],
  ["/parties#stolen", "/parties"],
  ["/parties/%2e%2e/workspace", "/parties"],
  ["/parties?q=%E0%A4%A", "/parties?q=%E0%A4%A"],
];
for (const [input, expected] of returnToCases) assert.equal(normalizePartyReturnTo(input), expected, `returnTo normalization failed for ${input || "empty input"}`);

function assertMutationFails(label, source, mutate, checks) {
  const broken = mutate(source);
  assert.notEqual(broken, source, `${label} synthetic must hit its target`);
  assert.throws(() => checks.forEach((check) => check(broken)), `${label} synthetic must fail its targeted contract`);
}

for (const [label, mutate] of [
  ["archive capability", (source) => source.replace('"record.archive"', '"record.update"')],
  ["authorized all lifecycle", (source) => source.replace('lifecycleStatus: "all"', "lifecycleStatus: lifecycle")],
  ["safe name returnTo", (source) => source.replace('?returnTo=${encodeURIComponent(returnTo)}', "")],
  ["dead archive caller", (source) => source.replace("{canArchive ? <ArchiveRecordButton", "{false && canArchive ? <ArchiveRecordButton")],
  ["broken filter dataflow", (source) => source.replace("const filtered = searched.filter", "const filtered = parties.filter")],
  ["wrong relationship route", (source) => source.replace("/relationship-tree?type=party&id=", "/relationship-tree-disabled?type=party&id=")],
  ["wrong relationship gate", (source) => source.replace("{canWrite ? <Link\n                            href={`/relationship-tree", "{canArchive ? <Link\n                            href={`/relationship-tree")],
  ["wrong record read", (source) => `${source.replace('permission: "record.read"', 'permission: "record.update"')}\nfunction DeadReader(){ return requireTenantSession({ permission: "record.read" }); }`],
  ["wrong live reader", (source) => `${source.replace("parties = await listHubParties(locale, context);", "parties = [];")}\nfunction DeadPartyReader(){ return listHubParties(locale, context); }`],
  ["dead row map", (source) => source.replace("{visibleParties.map((party) => {", "{false && visibleParties.map((party) => {")],
  ["missing header row role", (source) => source.replace('<div role="row" className="hidden', '<div className="hidden')],
  ["missing live data row role", (source) => source.replace('<div key={party.id} role="row"', '<div key={party.id}')],
  ["dead correct live wrong row", (source) => source
    .replace("const canWrite = party.canWrite && capabilityCanWrite;", 'const deadRow = () => <div role="row" />; void deadRow;\n                    const canWrite = party.canWrite && capabilityCanWrite;')
    .replace('<div key={party.id} role="row"', '<div key={party.id}')],
  ["dead correct live wrong header row", (source) => source
    .replace('<div role="rowgroup">', '<div role="rowgroup">{false && <div role="row" />}')
    .replace('<div role="row" className="hidden', '<div className="hidden')],
  ["missing relationship trigger", (source) => source.replace('data-list-return-trigger={`party:${party.id}:relationship`}', 'data-list-return-trigger={`party:${party.id}`}')],
  ["truncated identity", (source) => source.replace("items-center break-words text-sm font-bold", "items-center truncate text-sm font-bold")],
  ["missing identity height", (source) => source.replace("inline-flex min-h-11 max-w-full", "inline-flex max-w-full")],
]) assertMutationFails(label, sources.page, mutate, [analyzePage]);

for (const [label, mutate] of [
  ["search drops phone", (source) => source.replace('          party.phone.toLowerCase().includes(normalized) ||\n', "")],
  ["search drops optional email", (source) => source.replace('          (party.email?.toLowerCase().includes(normalized) ?? false) ||\n', "")],
  ["search drops explicit roles", (source) => source.replace('          party.explicitRoles.some((role) => role.toLowerCase().includes(normalized))', "          false")],
  ["search wrong normalization", (source) => source.replace("const normalized = query.toLowerCase();", "const normalized = query;")],
  ["search constant true", (source) => source.replace("const normalized = query.toLowerCase();\n        return (", "const normalized = query.toLowerCase();\n        return true || (")],
  ["search dead correct live wrong", (source) => `${source.replace("const normalized = query.toLowerCase();\n        return (", "const normalized = query.toLowerCase();\n        return true || (")}\nfunction DeadCorrectPartySearch(party, normalized) { return party.name.toLowerCase().includes(normalized) || party.phone.toLowerCase().includes(normalized) || (party.email?.toLowerCase().includes(normalized) ?? false) || party.explicitRoles.some((role) => role.toLowerCase().includes(normalized)); }`],
]) assertMutationFails(label, sources.page, mutate, [analyzePage, assertLiveSearchBehavior]);

for (const [label, mutate] of [
  ["type filter constant true", (source) => source.replace('const matchesType = type === "all" || party.explicitPartyType === type;', "const matchesType = true;")],
  ["type filter wrong field", (source) => source.replace('const matchesType = type === "all" || party.explicitPartyType === type;', 'const matchesType = type === "all" || party.status === type;')],
  ["type fixed all", (source) => source.replace("const type = normalizeType(params.type);", 'const type = "all" as const;')],
  ["type wrong form action", (source) => source.replace('<form action="/parties"', '<form action="/properties"')],
  ["type dead correct live wrong", (source) => `${source.replace('const matchesType = type === "all" || party.explicitPartyType === type;', "const matchesType = true;")}\nfunction DeadTypeFilter(party, type) { return type === "all" || party.explicitPartyType === type; }`],
]) assertMutationFails(label, sources.page, mutate, [analyzePage, analyzePageStateAndControls, assertLiveTypeAndPaginationBehavior]);

for (const [label, mutate] of [
  ["query default emptied", (source) => source.replace("defaultValue={query}", 'defaultValue={""}')],
  ["lifecycle default fixed active", (source) => source.replace("defaultValue={lifecycle}", 'defaultValue={"active"}')],
  ["archived lifecycle option duplicates active", (source) => source.replace('<option value="archived">', '<option value="active">')],
  ["filter submit becomes plain button", (source) => source.replace('<button type="submit"', '<button type="button"')],
  ["submit visible label missing", (source) => source.replace("                    {copy.filter}\n", "")],
  ["submit visible label wrong", (source) => source.replace("                    {copy.filter}\n", "                    {copy.searchLabel}\n")],
  ["submit icon aria exposed", (source) => source.replace('aria-hidden="true">search</span>', '>search</span>')],
  ["submit dead correct live wrong", (source) => `${source.replace("                    {copy.filter}\n", "")}\nfunction DeadSubmit({ copy }) { return <button type="submit"><span className="material-symbols-outlined" aria-hidden="true">search</span>{copy.filter}</button>; }`],
  ["query input missing id", (source) => source.replace('id="party-query"\n                    name="q"', 'name="q"')],
  ["query label wrong for", (source) => source.replace('htmlFor="party-query"', 'htmlFor="wrong-query"')],
  ["query label duplicated", (source) => source.replace('<label className="sr-only" htmlFor="party-query">{copy.searchLabel}</label>', '<label className="sr-only" htmlFor="party-query">{copy.searchLabel}</label><label className="sr-only" htmlFor="party-query">{copy.searchLabel}</label>')],
  ["query dead correct live wrong", (source) => `${source.replace('htmlFor="party-query"', 'htmlFor="wrong-query"')}\nfunction DeadQueryLabel({ copy }) { return <><label htmlFor="party-query">{copy.searchLabel}</label><input id="party-query" name="q" /></>; }`],
  ["type wrapper label missing", (source) => source.replace('<span className="sr-only">{copy.type}</span>', "")],
  ["type lifecycle labels swapped", (source) => source.replace("{copy.type}", "{copy.__swap__}").replace("{copy.lifecycle}", "{copy.type}").replace("{copy.__swap__}", "{copy.lifecycle}")],
  ["lifecycle wrapper label duplicated", (source) => source.replace('<span className="sr-only">{copy.lifecycle}</span>', '<span className="sr-only">{copy.lifecycle}</span><span className="sr-only">{copy.lifecycle}</span>')],
  ["type label dead correct live wrong", (source) => `${source.replace('<span className="sr-only">{copy.type}</span>', "")}\nfunction DeadTypeLabel({ copy }) { return <label><span className="sr-only">{copy.type}</span><select name="type" /></label>; }`],
  ["filter dead correct live wrong", (source) => `${source.replace("defaultValue={lifecycle}", 'defaultValue={"active"}')}\nfunction DeadFilterForm({ lifecycle }) { return <form action="/parties" method="get"><select name="lifecycle" defaultValue={lifecycle}><option value="active"/><option value="archived"/><option value="all"/></select><button type="submit"/></form>; }`],
]) assertMutationFails(label, sources.page, mutate, [analyzePageStateAndControls, assertLiveFilterFormBehavior]);

for (const [label, mutate] of [
  ["pagination size 24", (source) => source.replace("const PARTIES_PAGE_SIZE = 12;", "const PARTIES_PAGE_SIZE = 24;")],
  ["pagination wrong slice", (source) => source.replace("filtered.slice((safePage - 1) * PARTIES_PAGE_SIZE, safePage * PARTIES_PAGE_SIZE)", "filtered.slice(safePage * PARTIES_PAGE_SIZE, (safePage + 1) * PARTIES_PAGE_SIZE)")],
  ["pagination previous drops filters", (source) => source.replace("buildPartiesHref({ ...filters, page: safePage - 1 })", 'buildPartiesHref({ query: "", type: "all", lifecycle: "active", page: safePage - 1 })')],
  ["pagination next drops lifecycle", (source) => source.replace("buildPartiesHref({ ...filters, page: safePage + 1 })", "buildPartiesHref({ ...filters, lifecycle: \"active\", page: safePage + 1 })")],
  ["pagination dead correct live wrong", (source) => `${source.replace("const PARTIES_PAGE_SIZE = 12;", "const PARTIES_PAGE_SIZE = 24;")}\nfunction DeadPagination(filtered, safePage) { const PARTIES_PAGE_SIZE = 12; return filtered.slice((safePage - 1) * PARTIES_PAGE_SIZE, safePage * PARTIES_PAGE_SIZE); }`],
]) assertMutationFails(label, sources.page, mutate, [analyzePage, analyzePageStateAndControls, assertLiveTypeAndPaginationBehavior]);

assertMutationFails("early page return", sources.page, (source) => source.replace(
  "  const notSet = t(locale, \"common.notSet\");\n\n  return (",
  "  const notSet = t(locale, \"common.notSet\");\n\n  if (true) return <div>wrong page</div>;\n  return (",
), [analyzePage]);
assertMutationFails("early row return", sources.page, (source) => source.replace(
  "                    const canArchive = party.canArchive;",
  "                    const canArchive = party.canArchive;\n                    if (true) return <div>wrong row</div>;",
), [analyzePage]);

for (const [label, mutate] of [
  ["summary during read error", (source) => source.replace("summary={!readError ?", "summary={true ?")],
  ["always-visible clear", (source) => source.replace("{hasNonDefaultFilters ? (", "{true ? (")],
  ["page treated as filter", (source) => source.replace('const hasNonDefaultFilters = query.length > 0 || type !== "all" || lifecycle !== "active";', 'const hasNonDefaultFilters = query.length > 0 || type !== "all" || lifecycle !== "active" || safePage > 1;')],
  ["same-url archived recovery", (source) => source.replace("hasArchivedOnlyAtDefault ? allPartiesHref : clearHref", "hasArchivedOnlyAtDefault ? clearHref : clearHref")],
  ["archived predicate or", (source) => source.replace("!readError\n    && query.length === 0", "!readError\n    || query.length === 0")],
  ["archived predicate removed", (source) => source.replace('    && type === "all"\n', "")],
  ["archived predicate reversed", (source) => source.replace("activePartyCount === 0", "activePartyCount > 0")],
  ["mobile input 14px", (source) => source.replace("text-base font-medium", "text-sm font-medium")],
  ["wrong compact breakpoint", (source) => source.replaceAll("sm:text-sm", "max-sm:text-sm")],
  ["missing action height", (source) => source.replace("inline-flex min-h-11 items-center text-sm", "inline-flex items-center text-sm")],
  ["hardcoded focus", (source) => source.replace("focus-visible:outline-[color:var(--bd-focus-ring-color)]", "focus-visible:outline-[#0046ad]")],
  ["decorative shadow", (source) => source.replace('className="rounded-lg focus-visible:outline', 'className="rounded-lg shadow-sm focus-visible:outline')],
  ["dead correct live wrong filters", (source) => source.replace("filters={(\n", "filters={false ? (\n").replace("            )}\n            summary=", "            ) : null}\n            summary=")],
  ["dead correct live wrong results", (source) => source.replace("results={!readError && filtered.length > 0 ? (", "results={false ? (")],
]) assertMutationFails(label, sources.page, mutate, [analyzePageStateAndControls, assertLivePaginationAndRowLabelBehavior]);

for (const [label, mutate] of [
  ["summary wrong start", (source) => source.replace("copy.resultRange(rangeStart, rangeEnd, filtered.length)", "copy.resultRange(0, rangeEnd, filtered.length)")],
  ["summary wrong end", (source) => source.replace("copy.resultRange(rangeStart, rangeEnd, filtered.length)", "copy.resultRange(rangeStart, rangeStart, filtered.length)")],
  ["summary wrong total", (source) => source.replace("copy.resultRange(rangeStart, rangeEnd, filtered.length)", "copy.resultRange(rangeStart, rangeEnd, visibleParties.length)")],
  ["summary wrong copy", (source) => source.replace("copy.resultRange(rangeStart, rangeEnd, filtered.length)", "copy.page(rangeStart, rangeEnd)")],
  ["summary dead correct live wrong", (source) => `${source.replace("copy.resultRange(rangeStart, rangeEnd, filtered.length)", "copy.resultRange(0, 0, 0)")}\nfunction DeadSummary(copy, rangeStart, rangeEnd, filtered) { return copy.resultRange(rangeStart, rangeEnd, filtered.length); }`],
]) assertMutationFails(label, sources.page, mutate, [analyzePageStateAndControls, assertLiveSummaryBehavior]);

for (const [label, mutate] of [
  ["pagination missing nav name", (source) => source.replace("<nav aria-label={copy.results}", "<nav")],
  ["pagination previous wrong boundary", (source) => source.replace("safePage > 1 ? <Link href={buildPartiesHref({ ...filters, page: safePage - 1 })}", "safePage < pageCount ? <Link href={buildPartiesHref({ ...filters, page: safePage - 1 })}")],
  ["pagination next wrong boundary", (source) => source.replace("safePage < pageCount ? <Link href={buildPartiesHref({ ...filters, page: safePage + 1 })}", "safePage > 1 ? <Link href={buildPartiesHref({ ...filters, page: safePage + 1 })}")],
  ["pagination previous copy swapped", (source) => source.replace("{copy.previous}</Link>", "{copy.next}</Link>")],
  ["pagination next copy swapped", (source) => source.replace("{copy.next}</Link>", "{copy.previous}</Link>")],
  ["pagination position wrong caller", (source) => source.replace("copy.page(safePage, pageCount)", "copy.page(pageCount, safePage)")],
  ["pagination false branch null", (source) => source.replace("            ) : undefined}\n            state=", "            ) : null}\n            state=")],
  ["pagination dead correct live wrong", (source) => `${source.replace("<nav aria-label={copy.results}", '<nav aria-label="wrong-pagination"')}\nfunction DeadPaginationNav({ copy }) { return <nav aria-label={copy.results} />; }`],
]) assertMutationFails(label, sources.page, mutate, [analyzePageStateAndControls, assertLivePaginationAndRowLabelBehavior]);

for (const [label, mutate] of [
  ["error retry wrong href", (source) => source.replace('<Link href={returnTo} className="inline-flex min-h-11', '<Link href="/parties" className="inline-flex min-h-11')],
  ["error retry wrong copy", (source) => source.replace("{copy.retry}</Link>", "{copy.backToWorkbench}</Link>")],
  ["error workbench wrong href", (source) => source.replace('<Link href="/organize-center" className="inline-flex min-h-11', '<Link href="/parties" className="inline-flex min-h-11')],
  ["error workbench wrong copy", (source) => source.replace("{copy.backToWorkbench}</Link>", "{copy.retry}</Link>")],
  ["error adds unrelated action", (source) => source.replace('<div className="flex flex-wrap justify-center gap-3">', '<div className="flex flex-wrap justify-center gap-3"><Link href="/wrong">wrong</Link>')],
  ["error dead correct live wrong", (source) => `${source.replace("{copy.retry}</Link>", "{copy.backToWorkbench}</Link>")}\nfunction DeadErrorAction({ copy, returnTo }) { return <Link href={returnTo}>{copy.retry}</Link>; }`],
]) assertMutationFails(label, sources.page, mutate, [analyzePageStateAndControls]);

for (const [label, mutate] of [
  ["top clear visible name missing", (source) => source.replace("{copy.clear}</Link>", "</Link>")],
  ["party name visible name wrong", (source) => source.replace("                            {party.name}\n                          </Link>", "                            {copy.name}\n                          </Link>")],
  ["relationship visible name wrong", (source) => source.replace(">{copy.relationTree}</Link>", ">{copy.actions}</Link>")],
  ["empty recovery competing aria name", (source) => source.replace("<Link href={emptyRecoveryHref} className=", '<Link href={emptyRecoveryHref} aria-label="wrong" className=')],
  ["party name competing aria name", (source) => source.replace("data-list-return-trigger={`party:${party.id}`}\n                            className=", 'data-list-return-trigger={`party:${party.id}`}\n                            aria-label="wrong"\n                            className=')],
  ["accessible names dead correct live wrong", (source) => `${source.replace(">{copy.relationTree}</Link>", ">{copy.actions}</Link>")}\nfunction DeadNamedRelationship({ copy }) { return <Link>{copy.relationTree}</Link>; }`],
]) assertMutationFails(label, sources.page, mutate, [analyzePage, analyzePageStateAndControls]);

for (const [label, mutate] of [
  ["fallback wrong heading reference", (source) => source.replace('aria-labelledby="parties-results-heading"', 'aria-labelledby="wrong-results-heading"')],
  ["scope heading missing id", (source) => source.replace('<h2 id="parties-results-heading"', '<h2')],
  ["scope heading wrong copy", (source) => source.replace('{copy.results}</h2>}', '{copy.pageTitle}</h2>}')],
  ["table missing accessible name", (source) => source.replace('<div role="table" aria-label={copy.results}>', '<div role="table">')],
  ["filter section wrong heading reference", (source) => source.replace('aria-labelledby="parties-filter-heading"', 'aria-labelledby="wrong-filter-heading"')],
  ["filter heading wrong id", (source) => source.replace('id="parties-filter-heading"', 'id="wrong-filter-heading"')],
  ["landmark dead correct live wrong", (source) => `${source.replace('<div role="table" aria-label={copy.results}>', '<div role="table" aria-label="wrong">')}\nfunction DeadNamedTable({ copy }) { return <div role="table" aria-label={copy.results} />; }`],
  ["scope dead correct live wrong", (source) => `${source.replace('{copy.results}</h2>}', '{copy.pageTitle}</h2>}')}\nfunction DeadScope({ copy }) { return <h2 id="parties-results-heading">{copy.results}</h2>; }`],
]) assertMutationFails(label, sources.page, mutate, [analyzePage, analyzePageStateAndControls]);

for (const [label, mutate] of [
  ["action adds visible text", (source) => source.replace("{copy.clear}</Link>", "{copy.clear} wrong</Link>")],
  ["action adds visible child", (source) => source.replace(">{copy.relationTree}</Link>", ">{copy.relationTree}<span>wrong</span></Link>")],
  ["action adds competing expression", (source) => source.replace("{copy.previous}</Link>", "{copy.previous}{copy.next}</Link>")],
  ["visible name dead correct live wrong", (source) => `${source.replace(">{copy.relationTree}</Link>", ">{copy.relationTree}<span>wrong</span></Link>")}\nfunction DeadVisibleName({ copy }) { return <Link>{copy.relationTree}</Link>; }`],
]) assertMutationFails(label, sources.page, mutate, [analyzePage, analyzePageStateAndControls]);

for (const [label, mutate] of [
  ["mobile contact label wrong", (source) => source.replace("{copy.contact}</span>{contactSummary", "{copy.type}</span>{contactSummary")],
  ["mobile type label wrong", (source) => source.replace("{copy.type}</span>{typeLabel}", "{copy.role}</span>{typeLabel}")],
  ["mobile role label wrong", (source) => source.replace("{copy.role}</span>{roleLabel}", "{copy.status}</span>{roleLabel}")],
  ["mobile status label wrong", (source) => source.replace("{copy.status}</span>{statusLabel}", "{copy.type}</span>{statusLabel}")],
  ["type value wrong derivation", (source) => source.replace('party.explicitPartyType === "corporate"\n                      ? copy.corporate', 'party.explicitPartyType === "corporate"\n                      ? copy.individual')],
  ["status value reversed", (source) => source.replace('party.status === "archived" ? copy.archived : copy.active', 'party.status === "archived" ? copy.active : copy.archived')],
  ["mobile label dead correct live wrong", (source) => `${source.replace("{copy.contact}</span>{contactSummary", "{copy.type}</span>{contactSummary")}\nfunction DeadMobileLabel({ copy }) { return <span className="lg:hidden">{copy.contact}</span>; }`],
]) assertMutationFails(label, sources.page, mutate, [analyzePage, assertLivePaginationAndRowLabelBehavior]);

for (const [label, mutate] of [
  ["flash banner drops message", (source) => source.replace("<PageFlashBanner message={flashMessage} />", "<PageFlashBanner />")],
  ["flash created wrong copy", (source) => source.replace("party_created: copy.created", "party_created: copy.updated")],
  ["flash updated wrong copy", (source) => source.replace("party_updated: copy.updated", "party_updated: copy.created")],
  ["flash archive restore swapped", (source) => source.replace("record_archived: copy.archivedFeedback", "record_archived: copy.restoredFeedback")],
  ["flash selector fixed key", (source) => source.replace('flashMap[String(params.flash ?? "").trim() as keyof typeof flashMap]', "flashMap.party_created")],
  ["flash dead correct live wrong", (source) => `${source.replace("<PageFlashBanner message={flashMessage} />", "<PageFlashBanner message={undefined} />")}\nfunction DeadFlash({ flashMessage }) { return <PageFlashBanner message={flashMessage} />; }`],
]) assertMutationFails(label, sources.page, mutate, [analyzePage]);

for (const [label, mutate] of [
  ["active count fixed zero", (source) => source.replace('const activePartyCount = parties.filter((party) => party.status === "active").length;', "const activePartyCount = 0;")],
  ["archived count uses active", (source) => source.replace('const archivedPartyCount = parties.filter((party) => party.status === "archived").length;', 'const archivedPartyCount = parties.filter((party) => party.status === "active").length;')],
  ["absolute empty gets description", (source) => source.replace("description={parties.length === 0 ? undefined : hasArchivedOnlyAtDefault", "description={parties.length === 0 ? copy.noResultHint : hasArchivedOnlyAtDefault")],
  ["absolute empty gets action", (source) => source.replace("action={parties.length === 0 ? undefined : (", "action={false ? undefined : (")],
  ["archived-only wrong guidance", (source) => source.replace("hasArchivedOnlyAtDefault ? copy.archivedOnlyHint : copy.noResultHint", "hasArchivedOnlyAtDefault ? copy.noResultHint : copy.archivedOnlyHint")],
  ["state dead correct live wrong", (source) => `${source.replace('const activePartyCount = parties.filter((party) => party.status === "active").length;', "const activePartyCount = 0;")}\nfunction DeadActiveCount(parties) { return parties.filter((party) => party.status === "active").length; }`],
]) assertMutationFails(label, sources.page, mutate, [analyzePageStateAndControls, assertLiveEmptyRecoveryBehavior]);

for (const [label, mutate] of [
  ["role label fixed", (source) => source.replace('const roleLabel = party.explicitRoles.join(" / ") || notSet;', "const roleLabel = notSet;")],
  ["role cell nowrap", (source) => source.replace('className="break-words text-sm leading-relaxed text-slate-700 [overflow-wrap:anywhere]"><span className="mr-2 text-xs font-bold text-slate-400 lg:hidden">{copy.role}', 'className="whitespace-nowrap text-sm text-slate-700"><span className="mr-2 text-xs font-bold text-slate-400 lg:hidden">{copy.role}')],
  ["read-only reason truncated", (source) => source.replace('className="mt-1 text-xs font-bold leading-relaxed text-slate-600 [overflow-wrap:anywhere]"', 'className="mt-1 truncate text-xs font-bold text-slate-600"')],
  ["role dead correct live wrong", (source) => `${source.replace('const roleLabel = party.explicitRoles.join(" / ") || notSet;', "const roleLabel = notSet;")}\nfunction DeadRoleLabel(party, notSet) { return party.explicitRoles.join(" / ") || notSet; }`],
]) assertMutationFails(label, sources.page, mutate, [analyzePage]);

const longIdentitySamples = [
  ["東京都千代田区同一接頭辞を持つ長い関係者法人名称甲", "東京都千代田区同一接頭辞を持つ長い関係者法人名称乙"],
  ["上海市浦东新区相同前缀的长期业务相关主体名称甲", "上海市浦东新区相同前缀的长期业务相关主体名称乙"],
  ["서울특별시강남구같은접두어를가진장기관계자법인명가", "서울특별시강남구같은접두어를가진장기관계자법인명나"],
];
for (const [first, second] of longIdentitySamples) assert(first.length >= 20 && second.length >= 20 && first.slice(0, 10) === second.slice(0, 10) && first !== second, "independent ja/zh/ko party samples must stay long and prefix-similar");
const longRoleAndReasonSamples = [
  ["長期管理契約における同一接頭辞の関係調整担当者甲", "長期管理契約における同一接頭辞の関係調整担当者乙", "会社メンバーに公開された同一接頭辞の長い読み取り専用理由"],
  ["长期管理合同中具有相同前缀的关系协调负责人甲", "长期管理合同中具有相同前缀的关系协调负责人乙", "向公司成员公开且具有相同前缀的长期只读原因说明"],
  ["장기관리계약에서같은접두어를가진관계조정담당자가", "장기관리계약에서같은접두어를가진관계조정담당자나", "회사구성원에게공개된같은접두어의긴읽기전용사유"],
];
for (const [first, second, reason] of longRoleAndReasonSamples) assert(first.length >= 20 && second.length >= 20 && reason.length >= 20 && first.slice(0, 10) === second.slice(0, 10) && first !== second, "independent ja/zh/ko role and read-only samples must stay long and distinguishable");

for (const [label, mutate] of [
  ["loading wrong zh copy", (source) => source.replace('loadingTitle: "正在加载相关主体"', 'loadingTitle: "関係者を読み込んでいます"')],
  ["loading missing busy", (source) => source.replace('aria-busy="true"', 'aria-busy="false"')],
  ["loading fake count", (source) => `${source}\nconst pageCount = 12;`],
  ["loading visible count copy", (source) => source.replace('pageTitle: "関係者",', 'pageTitle: "関係者",\n    staticCount: "12名",')],
  ["loading live fake summary", (source) => source.replace('<ListReportShell\n        aria-busy="true"', '<ListReportShell\n        summary={<p>12 / 12</p>}\n        aria-busy="true"')],
  ["loading dead correct live fake summary", (source) => source.replace(
    '<ListReportShell\n        aria-busy="true"',
    '{false && <ListReportShell aria-busy="true" scope={null} filters={null} results={null} state={null} />}\n      <ListReportShell\n        summary={<p>12 / 12</p>}\n        aria-busy="true"',
  )],
  ["loading missing motion", (source) => source.replaceAll(" motion-reduce:animate-none", "")],
  ["loading result keeps three columns", (source) => source.replace("sm:grid-cols-3 lg:grid-cols-6", "sm:grid-cols-3")],
  ["loading result drops one skeleton", (source) => source.replace("                <div className=\"min-h-11 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none\" />\n              </div>", "              </div>")],
  ["loading dead filter skeleton", (source) => source.replace("{[0, 1, 2, 3].map((item) =>", "{false && [0, 1, 2, 3].map((item) =>")],
  ["loading nested correct live wrong", (source) => `${source.replaceAll(" motion-reduce:animate-none", "")}\nfunction DeadLoadingSkeleton(){ return [0].map((item) => <div key={item} className="min-h-11 animate-pulse motion-reduce:animate-none" />); }`],
]) assertMutationFails(label, sources.loading, mutate, [analyzeLoading]);
for (const [locale, expected] of Object.entries(ARCHIVED_ONLY_HINT_EXPECTED)) {
  assertMutationFails(`wrong ${locale} archived-only guidance`, sources.page, (source) => source.replace(expected, `${expected} wrong`), [analyzeArchivedOnlyCopy]);
}
const brokenHub = sources.hub.replace(': "owner_read_only";', ': "company_read";');
assert.throws(() => analyzeHub(brokenHub), "collapsing owner_read_only into company_read must fail the contract");
for (const [label, mutate] of [
  ["wrong live party sort", (source) => source.replace('filter: { sort: "recent_contact", lifecycleStatus: context.lifecycleStatus }', 'filter: { sort: "name", lifecycleStatus: context.lifecycleStatus }')],
  ["fixed active party lifecycle", (source) => source.replace('filter: { sort: "recent_contact", lifecycleStatus: context.lifecycleStatus }', 'filter: { sort: "recent_contact", lifecycleStatus: "active" }')],
  ["omitted party lifecycle", (source) => source.replace('filter: { sort: "recent_contact", lifecycleStatus: context.lifecycleStatus }', 'filter: { sort: "recent_contact" }')],
  ["dead correct reader with wrong live filter", (source) => source.replace(
    'const visible = await listClientsForContext({\n      context: context.requestContext,\n      filter: { sort: "recent_contact", lifecycleStatus: context.lifecycleStatus },\n    });',
    'const deadReader = async () => listClientsForContext({ context: context.requestContext, filter: { sort: "recent_contact", lifecycleStatus: context.lifecycleStatus } });\n    void deadReader;\n    const visible = await listClientsForContext({\n      context: context.requestContext,\n      filter: { sort: "name", lifecycleStatus: "active" },\n    });',
  )],
]) assertMutationFails(label, sources.hub, mutate, [analyzeHub]);
const deadArchiveHub = sources.hub.replace(
  "const canArchive = canWrite && context.canArchiveRecords === true;",
  "const canArchive = false; function ignoredArchiveDecision() { const canArchive = canWrite && context.canArchiveRecords === true; return canArchive; }",
);
assert.throws(() => analyzeHub(deadArchiveHub), "an uncalled archive helper must not satisfy the live map contract");
const deadMapperHub = sources.hub.replace(
  "return mapVisibleHubParty(locale, item.client, canWrite, canArchive, readOnlyReason, item._count.quotations);",
  "function ignoredMapper() { return mapVisibleHubParty(locale, item.client, canWrite, canArchive, readOnlyReason, item._count.quotations); } return mapVisibleHubParty(locale, item.client, false, false, undefined, item._count.quotations);",
);
assert.throws(() => analyzeHub(deadMapperHub), "an uncalled mapper must not satisfy the live return contract");
const earlyHubReturn = sources.hub.replace(
  'export async function listHubParties(locale: Locale = "ja", context: HubQueryContext = {}): Promise<HubPartyItem[]> {',
  'export async function listHubParties(locale: Locale = "ja", context: HubQueryContext = {}): Promise<HubPartyItem[]> { if (true) return [];',
);
assert.throws(() => analyzeHub(earlyHubReturn), "a constant-true early hub return must fail the contract");
const earlyHubThrow = sources.hub.replace(
  'export async function listHubParties(locale: Locale = "ja", context: HubQueryContext = {}): Promise<HubPartyItem[]> {',
  'export async function listHubParties(locale: Locale = "ja", context: HubQueryContext = {}): Promise<HubPartyItem[]> { if (true) throw new Error("wrong path");',
);
assert.throws(() => analyzeHub(earlyHubThrow), "a constant-true early hub throw must fail the contract");
const earlyMapperReturn = sources.hub.replace(
  "  const profile = extractPartyProfileFromNotes(client.notes);\n  return {",
  "  const profile = extractPartyProfileFromNotes(client.notes);\n  if (true) return {} as HubPartyItem;\n  return {",
);
assert.throws(() => analyzeHub(earlyMapperReturn), "a constant-true early mapper return must fail the contract");

console.log("Parties behavior contract passed (archive capability, safe returnTo, local lifecycle empty states, and visibility reason).");
