import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = fileURLToPath(new URL("..", import.meta.url));
const filePath = resolve(root, "src/app/clients/page.tsx");
const source = readFileSync(filePath, "utf8");
const tree = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(tree.parseDiagnostics.length, 0, "clients page must parse");

function visit(node, predicate, matches = []) {
  if (predicate(node)) matches.push(node);
  ts.forEachChild(node, (child) => {
    visit(child, predicate, matches);
  });
  return matches;
}

function topLevelFunction(name) {
  const fn = tree.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert(fn?.body, `${name} must remain a top-level function`);
  return fn;
}

function variableInitializer(fn, name) {
  for (const statement of fn.body.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
        assert(declaration.initializer, `${name} must have an initializer`);
        return declaration.initializer;
      }
    }
  }
  assert.fail(`${name} must be declared directly in ${fn.name.text}`);
}

const page = topLevelFunction("ClientsPage");
const calls = visit(page.body, (node) => ts.isCallExpression(node));
const callNamed = (name) => calls.filter((call) => call.expression.getText(tree) === name);

assert.equal(callNamed("createRequestContext").length, 1, "client list must create one trusted request context");
assert.equal(callNamed("createRequestContext")[0].arguments[0]?.getText(tree), "session", "request context must derive from the authorized session");
assert.equal(callNamed("listClientsForContext").length, 1, "client list must use one context-bound reader");
assert.equal(callNamed("listClients").length, 0, "legacy owner-only reader must not remain reachable");

const reader = callNamed("listClientsForContext")[0];
assert(ts.isObjectLiteralExpression(reader.arguments[0]), "context-bound reader must receive one explicit options object");
const readerInput = reader.arguments[0];
const contextProperty = readerInput.properties.find((item) => ts.isPropertyAssignment(item) && item.name.getText(tree) === "context");
const filterProperty = readerInput.properties.find((item) => ts.isPropertyAssignment(item) && item.name.getText(tree) === "filter");
assert(contextProperty && contextProperty.initializer.getText(tree) === "requestContext", "reader must receive the trusted request context");
assert(filterProperty && ts.isObjectLiteralExpression(filterProperty.initializer), "reader must receive the page filters directly");
assert(filterProperty.initializer.properties.some((item) => ts.isPropertyAssignment(item) && item.name.getText(tree) === "lifecycleStatus" && item.initializer.getText(tree) === '"active"'), "active lifecycle filter must be explicit and repository-independent");

const clients = variableInitializer(page, "clients");
assert(ts.isAwaitExpression(clients) && clients.expression === reader, "authorized reader result must be the sole clients collection");
const canCreateClient = variableInitializer(page, "canCreateClient");
const canCreateClientSource = canCreateClient.getText(tree);
assert(canCreateClientSource.includes('session.membership.status === "active"'), "client quick-create must require an active membership");
assert(canCreateClientSource.includes('capabilityHasTenantPermission') && canCreateClientSource.includes('"record.update"'), "client quick-create must retain the existing record.update permission gate");
assert(canCreateClientSource.includes('getTenantCapability(session.membership) !== "ordinary_member"'), "ordinary members must not receive the client quick-create surface");
const visibleClients = variableInitializer(page, "visibleClients");
assert(ts.isCallExpression(visibleClients) && visibleClients.expression.getText(tree) === "clients.slice", "pagination must slice the authorized clients collection");

for (const name of ["pageCount", "rangeStart", "rangeEnd"]) {
  assert(variableInitializer(page, name).getText(tree).includes("clients.length"), `${name} must derive from the authorized clients collection`);
}

const rowMaps = calls.filter((call) => call.expression.getText(tree) === "visibleClients.map");
assert.equal(rowMaps.length, 1, "authorized page slice must render exactly one row map");
const rowCallback = rowMaps[0].arguments[0];
assert(ts.isArrowFunction(rowCallback) && ts.isObjectBindingPattern(rowCallback.parameters[0]?.name), "row renderer must retain client and resolution together");
assert.deepEqual(rowCallback.parameters[0].name.elements.map((item) => item.name.getText(tree)).sort(), ["client", "resolution"], "row renderer must bind only client and its visibility resolution");

const rowConditionals = visit(rowCallback.body, (node) => ts.isConditionalExpression(node));
const writeGate = rowConditionals.find((node) => node.condition.getText(tree) === "resolution.canWrite");
assert(writeGate, "owner-only row actions must be gated by resolver canWrite");
assert(writeGate.whenTrue.getText(tree).includes("#timeline") && writeGate.whenTrue.getText(tree).includes("/quotes/new"), "write gate must own the follow-up and quotation actions");
assert(writeGate.whenFalse.getText(tree).includes("text.readOnly"), "company-read rows must expose an explicit localized read-only state");

const quickDetails = visit(page.body, (node) => ts.isJsxElement(node) && node.openingElement.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === "className" && attribute.initializer?.getText(tree) === "{styles.quickDetails}"));
assert.equal(quickDetails.length, 1, "clients page must retain exactly one quick-create surface");
const quickCreateGate = visit(page.body, (node) => ts.isConditionalExpression(node) && node.condition.getText(tree) === "canCreateClient");
assert.equal(quickCreateGate.length, 1, "client quick-create must be conditionally rendered by canCreateClient");
assert(quickCreateGate[0].whenTrue === quickDetails[0] || quickCreateGate[0].whenTrue.getText(tree).includes("styles.quickDetails"), "canCreateClient must own the complete quick-create surface");
assert.equal(quickCreateGate[0].whenFalse.kind, ts.SyntaxKind.NullKeyword, "unauthorized users must receive no quick-create DOM");

console.log("clients visibility consistency contract: PASS");
