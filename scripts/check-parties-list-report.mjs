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

  const searched = nodeText(directVariable(fn, "searched"), tree);
  assert.match(searched, /lifecycleFiltered\.filter\(/, "keyword search must consume locally lifecycle-filtered parties");
  assert.match(searched, /:\s*lifecycleFiltered\s*$/, "no keyword must retain locally lifecycle-filtered parties");
  const filtered = nodeText(directVariable(fn, "filtered"), tree);
  assert.match(filtered, /^searched\.filter\(/, "type filtering must consume the searched collection");
  const visibleParties = nodeText(directVariable(fn, "visibleParties"), tree);
  assert.match(visibleParties, /^filtered\.slice\(/, "pagination must consume the fully filtered collection");

  const returns = fn.body.statements.filter(ts.isReturnStatement);
  assert.equal(returns.length, 1, "PartiesPage must have one top-level return");
  const finalReturn = returns[0];
  assert.equal(fn.body.statements.at(-1), finalReturn, "PartiesPage return must remain final and reachable");
  assertReachableStatement(fn.body, finalReturn, "PartiesPage final return");
  assert(finalReturn.expression, "PartiesPage must return live JSX");
  const liveText = nodeText(finalReturn.expression, tree);
  assert.match(liveText, /parties\.length\s*===\s*0\s*\?\s*copy\.noParties\s*:\s*copy\.noResult/, "empty state must distinguish absolute authorized empty from filtered empty");

  const mapCalls = visit(finalReturn.expression, (node) => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(tree) === "visibleParties" && node.expression.name.text === "map");
  assert.equal(mapCalls.length, 1, "visibleParties must have one live row renderer");
  const rowCallback = mapCalls[0].arguments[0];
  assert(rowCallback && (ts.isArrowFunction(rowCallback) || ts.isFunctionExpression(rowCallback)) && ts.isBlock(rowCallback.body), "party rows must use a block callback");
  const rowReturns = rowCallback.body.statements.filter(ts.isReturnStatement);
  assert.equal(rowReturns.length, 1, "party row callback must have one direct return");
  const rowReturn = rowReturns[0];
  assert.equal(rowCallback.body.statements.at(-1), rowReturn, "party row return must be the final callback statement");
  assert(rowReturn.expression, "party row callback must return live JSX");
  assertReachableStatement(rowCallback.body, rowReturn, "party row return");

  const nameLinks = visit(rowReturn.expression, (node) => ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "Link" && node.getText(tree).includes("/parties/") && node.getText(tree).includes("returnTo"));
  assert.equal(nameLinks.length, 1, "the live party name must have one detail link");
  const nameHref = nodeText(jsxAttribute(nameLinks[0].openingElement, "href"), tree);
  assert.match(nameHref, /^`\/parties\/\$\{encodeURIComponent\(party\.id\)\}\/edit\?returnTo=\$\{encodeURIComponent\(returnTo\)\}`$/, "party detail link must carry the safe list returnTo");
  const canWrite = nodeText(directVariable(rowCallback, "canWrite"), tree);
  const canArchive = nodeText(directVariable(rowCallback, "canArchive"), tree);
  assert.match(canWrite, /party\.canWrite\s*&&\s*capabilityCanWrite/, "row editing must preserve the resolver and record.update gate at the live caller");
  assert.equal(canArchive, "party.canArchive", "row archive must use the hub's combined object/archive decision");
  const readOnlyMessage = nodeText(directVariable(rowCallback, "readOnlyMessage"), tree);
  assert.match(readOnlyMessage, /party\.readOnlyReason\s*===\s*["']company_read["']/, "company_read must have its own message branch");
  assert.match(readOnlyMessage, /party\.readOnlyReason\s*===\s*["']owner_read_only["']/, "owner_read_only must have its own message branch");
  assert.match(readOnlyMessage, /!canWrite/, "capability-level read-only must retain the owner/account read-only message");

  const archiveNodes = visit(rowReturn.expression, (node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "ArchiveRecordButton");
  assert.equal(archiveNodes.length, 1, "party row must have one archive control caller");
  const archiveConditional = archiveNodes[0].parent;
  assert(archiveConditional && ts.isConditionalExpression(archiveConditional), "archive control must be directly state-gated");
  assert.equal(nodeText(archiveConditional.condition, tree), "canArchive", "archive control must be gated by canArchive, not general edit permission");
  assertReachable(archiveNodes[0], rowReturn.expression, "archive control");

  const relationshipLinks = visit(rowReturn.expression, (node) => ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "Link" && node.getText(tree).includes("/relationship-tree?type=party&id="));
  assert.equal(relationshipLinks.length, 1, "party row must have one live relationship link");
  const relationshipHref = nodeText(jsxAttribute(relationshipLinks[0].openingElement, "href"), tree);
  assert.match(relationshipHref, /^`\/relationship-tree\?type=party&id=\$\{encodeURIComponent\(party\.id\)\}`$/, "relationship link must target the live party identity");
  const relationshipConditional = relationshipLinks[0].parent;
  assert(relationshipConditional && ts.isConditionalExpression(relationshipConditional), "relationship link must be directly state-gated");
  assert.equal(nodeText(relationshipConditional.condition, tree), "canWrite", "relationship link must use record.update/object write, not archive permission");
  assertReachable(relationshipLinks[0], rowReturn.expression, "relationship link");

  assert(!liveText.includes("/parties/new"), "the List Report must not introduce a party create route");
  assert(!liveText.includes("contractCount"), "the List Report must not restore inferred relation counts");
}

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
  const visible = nodeText(directBlockVariable(contextIf.thenStatement, "visible", "request-context branch"), tree);
  assert.match(visible, /^await listClientsForContext\(/, "request-context branch must use the authorized party reader");
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

analyzePage(sources.page);
analyzeHub(sources.hub);

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

const pageCounterexamples = [
  sources.page.replace('"record.archive"', '"record.update"'),
  sources.page.replace('lifecycleStatus: "all"', "lifecycleStatus: lifecycle"),
  sources.page.replace('?returnTo=${encodeURIComponent(returnTo)}', ""),
  sources.page.replace("{canArchive ? <ArchiveRecordButton", "{false && canArchive ? <ArchiveRecordButton"),
  sources.page.replace("const filtered = searched.filter", "const filtered = parties.filter"),
  sources.page.replace("/relationship-tree?type=party&id=", "/relationship-tree-disabled?type=party&id="),
  sources.page.replace("{canWrite ? <Link\n                      href={`/relationship-tree", "{canArchive ? <Link\n                      href={`/relationship-tree"),
];
for (const broken of pageCounterexamples) assert.throws(() => analyzePage(broken), "each synthetic page regression must fail the contract");
const earlyPageReturn = sources.page.replace(
  "  const notSet = t(locale, \"common.notSet\");\n\n  return (",
  "  const notSet = t(locale, \"common.notSet\");\n\n  if (true) return <div>wrong page</div>;\n  return (",
);
assert.throws(() => analyzePage(earlyPageReturn), "a constant-true early page return must fail the contract");
const earlyRowReturn = sources.page.replace(
  "              const canArchive = party.canArchive;",
  "              const canArchive = party.canArchive;\n              if (true) return <li>wrong row</li>;",
);
assert.throws(() => analyzePage(earlyRowReturn), "a constant-true early row return must fail the contract");
const brokenHub = sources.hub.replace(': "owner_read_only";', ': "company_read";');
assert.throws(() => analyzeHub(brokenHub), "collapsing owner_read_only into company_read must fail the contract");
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
