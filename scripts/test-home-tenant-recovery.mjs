import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const helperPath = resolve(root, "src/lib/tenant-recovery.ts");
const pagePath = resolve(root, "src/app/page.tsx");
const workspacePath = resolve(root, "src/app/workspace/page.tsx");
const selectorPath = resolve(root, "src/app/workspace/workspace-selector.tsx");

function compileTypeScript(module, filename) {
  const result = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
}

require.extensions[".ts"] = compileTypeScript;
assert(existsSync(helperPath) && statSync(helperPath).isFile(), "home tenant recovery helper must exist");
const { getHomeTenantSelectionRecoveryPath } = require(helperPath);

const expectedRecovery = "/workspace?reason=tenant_selection_required&returnTo=%2F";
assert.equal(getHomeTenantSelectionRecoveryPath("tenant_selection_required"), expectedRecovery, "multiple active memberships without a cookie must recover through workspace selection");
const expectedStaleTenantRecovery = "/workspace?reason=tenant_forbidden&returnTo=%2F";
assert.equal(getHomeTenantSelectionRecoveryPath("tenant_forbidden"), expectedStaleTenantRecovery, "a stale or unauthorized home tenant must recover through workspace selection without probing that tenant");
const staleTenantRecoveryUrl = new URL(expectedStaleTenantRecovery, "https://brokerdesk.invalid");
assert.equal(staleTenantRecoveryUrl.pathname, "/workspace", "stale tenant recovery must use the canonical workspace selector");
assert.equal(staleTenantRecoveryUrl.searchParams.get("reason"), "tenant_forbidden", "stale tenant recovery must preserve the forbidden-tenant reason without probing it");
assert.equal(staleTenantRecoveryUrl.searchParams.get("returnTo"), "/", "stale tenant recovery must return to the home route");
for (const code of ["user_not_found", "tenant_not_found", "permission_denied"]) {
  assert.equal(getHomeTenantSelectionRecoveryPath(code), null, `${code} must retain its original error behavior`);
}
const recoveryUrl = new URL(expectedRecovery, "https://brokerdesk.invalid");
assert.equal(recoveryUrl.pathname, "/workspace", "recovery must use the canonical workspace selector");
assert.equal(recoveryUrl.searchParams.get("reason"), "tenant_selection_required", "recovery must preserve the selection-required reason");
assert.equal(recoveryUrl.searchParams.get("returnTo"), "/", "workspace selection must return to the home route");

const page = readFileSync(pagePath, "utf8");
const workspace = readFileSync(workspacePath, "utf8");
const selector = readFileSync(selectorPath, "utf8");
const tree = ts.createSourceFile(pagePath, page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const visit = (node, predicate, matches = []) => {
  if (predicate(node)) matches.push(node);
  ts.forEachChild(node, (child) => { visit(child, predicate, matches); });
  return matches;
};

const tryStatements = visit(tree, ts.isTryStatement);
const tenantTry = tryStatements.find((statement) => visit(statement.tryBlock, (node) => ts.isCallExpression(node) && node.expression.getText() === "requireTenantSession").length > 0);
assert(tenantTry?.catchClause, "home tenant session must have a bounded recovery catch");
assert.equal(tenantTry.tryBlock.statements.length, 1, "tenant recovery try block must contain only the session read");
const sessionStatement = tenantTry.tryBlock.statements[0];
assert(ts.isExpressionStatement(sessionStatement) && ts.isBinaryExpression(sessionStatement.expression), "tenant recovery try block must assign the session read");
const sessionAssignment = sessionStatement.expression;
assert.equal(sessionAssignment.operatorToken.kind, ts.SyntaxKind.EqualsToken, "tenant session must be assigned directly");
assert(ts.isIdentifier(sessionAssignment.left) && sessionAssignment.left.text === "session", "tenant session read must bind the home session variable");
assert(ts.isAwaitExpression(sessionAssignment.right) && ts.isCallExpression(sessionAssignment.right.expression), "tenant session assignment must await requireTenantSession");
const sessionCall = sessionAssignment.right.expression;
assert.equal(sessionCall.expression.getText(), "requireTenantSession", "tenant recovery try must call requireTenantSession");
assert.equal(sessionCall.arguments.length, 1, "tenant session read must have one options object");
const sessionOptions = sessionCall.arguments[0];
assert(ts.isObjectLiteralExpression(sessionOptions), "tenant session options must be explicit");
const permissionProperty = sessionOptions.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText() === "permission");
assert(permissionProperty && ts.isPropertyAssignment(permissionProperty) && ts.isStringLiteral(permissionProperty.initializer) && permissionProperty.initializer.text === "tenant.read", "home tenant session must retain the tenant.read permission gate");

const catchClause = tenantTry.catchClause;
assert(catchClause.variableDeclaration && ts.isIdentifier(catchClause.variableDeclaration.name), "tenant recovery catch must bind the thrown error");
const errorName = catchClause.variableDeclaration.name.text;
assert.deepEqual(catchClause.block.statements.map((statement) => statement.kind), [ts.SyntaxKind.IfStatement, ts.SyntaxKind.ThrowStatement], "tenant recovery catch must contain only classification and final rethrow");
const guardedRecovery = catchClause.block.statements[0];
assert(ts.isIfStatement(guardedRecovery) && ts.isBinaryExpression(guardedRecovery.expression), "tenant recovery must be guarded by an instanceof check");
assert.equal(guardedRecovery.expression.operatorToken.kind, ts.SyntaxKind.InstanceOfKeyword, "tenant recovery guard must use instanceof");
assert.equal(guardedRecovery.expression.left.getText(), errorName, "tenant recovery guard must inspect the catch binding");
assert.equal(guardedRecovery.expression.right.getText(), "TenantSessionError", "tenant recovery must require the canonical TenantSessionError type");
assert(ts.isBlock(guardedRecovery.thenStatement), "typed tenant recovery must use an explicit block");
assert.deepEqual(guardedRecovery.thenStatement.statements.map((statement) => statement.kind), [ts.SyntaxKind.VariableStatement, ts.SyntaxKind.IfStatement], "typed recovery block must only classify and conditionally redirect");

const recoveryDeclaration = guardedRecovery.thenStatement.statements[0];
assert(ts.isVariableStatement(recoveryDeclaration) && recoveryDeclaration.declarationList.declarations.length === 1, "tenant recovery path must have one declaration");
const recoveryBinding = recoveryDeclaration.declarationList.declarations[0];
assert(ts.isIdentifier(recoveryBinding.name) && recoveryBinding.initializer && ts.isCallExpression(recoveryBinding.initializer), "tenant recovery path must come from the classifier helper");
const recoveryName = recoveryBinding.name.text;
assert.equal(recoveryBinding.initializer.expression.getText(), "getHomeTenantSelectionRecoveryPath", "tenant recovery must call the canonical classifier helper");
assert.equal(recoveryBinding.initializer.arguments.length, 1, "tenant recovery classifier must receive only the error code");
const recoveryCode = recoveryBinding.initializer.arguments[0];
assert(ts.isPropertyAccessExpression(recoveryCode) && recoveryCode.expression.getText() === errorName && recoveryCode.name.text === "code", "tenant recovery classifier must receive the catch binding code");

const redirectGuard = guardedRecovery.thenStatement.statements[1];
assert(ts.isIfStatement(redirectGuard) && redirectGuard.expression.getText() === recoveryName && !redirectGuard.elseStatement, "redirect must be guarded only by the classifier result");
const redirectStatement = ts.isBlock(redirectGuard.thenStatement) ? redirectGuard.thenStatement.statements[0] : redirectGuard.thenStatement;
assert(ts.isExpressionStatement(redirectStatement) && ts.isCallExpression(redirectStatement.expression), "guarded recovery must call redirect");
assert.equal(redirectStatement.expression.expression.getText(), "redirect", "guarded recovery must use Next redirect");
assert.equal(redirectStatement.expression.arguments.length, 1, "redirect must receive one recovery target");
assert.equal(redirectStatement.expression.arguments[0].getText(), recoveryName, "redirect must receive the guarded classifier result");
assert.equal((ts.isBlock(redirectGuard.thenStatement) ? redirectGuard.thenStatement.statements.length : 1), 1, "redirect guard must contain no extra behavior");

const finalThrow = catchClause.block.statements[1];
assert(ts.isThrowStatement(finalThrow) && finalThrow.expression?.getText() === errorName, "every unclassified error must rethrow the same catch binding");
assert.equal(visit(catchClause.block, ts.isReturnStatement).length, 0, "tenant recovery catch must not return or swallow an error");
const redirects = visit(catchClause.block, (node) => ts.isCallExpression(node) && node.expression.getText() === "redirect");
assert.equal(redirects.length, 1, "tenant recovery catch must have exactly one guarded redirect");

const workspaceTree = ts.createSourceFile(workspacePath, workspace, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const returnToFunctions = visit(workspaceTree, (node) => ts.isFunctionDeclaration(node) && node.name?.text === "safeWorkspaceReturnTo");
assert.equal(returnToFunctions.length, 1, "workspace page must have one returnTo normalizer");
const isolatedReturnToModuleSource = `${returnToFunctions[0].getText()}\nexport { safeWorkspaceReturnTo };`;
const isolatedReturnToModuleOutput = ts.transpileModule(isolatedReturnToModuleSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: workspacePath,
}).outputText;
const isolatedReturnToModule = { exports: {} };
Function("module", "exports", isolatedReturnToModuleOutput)(isolatedReturnToModule, isolatedReturnToModule.exports);
const { safeWorkspaceReturnTo } = isolatedReturnToModule.exports;
assert.equal(typeof safeWorkspaceReturnTo, "function", "workspace returnTo normalizer must be runnable in isolation");
const returnToCases = [
  { input: undefined, expected: "/", label: "missing return path" },
  { input: "", expected: "/", label: "empty return path" },
  { input: "/", expected: "/", label: "home path" },
  { input: "https://attacker.invalid/cases", expected: "/", label: "external URL" },
  { input: "//attacker.invalid/cases", expected: "/", label: "protocol-relative URL" },
  { input: "/workspace", expected: "/", label: "workspace root loop" },
  { input: "/workspace/", expected: "/", label: "workspace slash loop" },
  { input: "/workspace/invitations?from=case", expected: "/", label: "workspace descendant loop" },
  { input: "/cases/case_safe?view=overview#case-main-editor", expected: "/cases/case_safe?view=overview#case-main-editor", label: "safe case path" },
  { input: "  /organize-center?type=case  ", expected: "/organize-center?type=case", label: "trimmed safe internal path" },
];
for (const { input, expected, label } of returnToCases) {
  assert.equal(safeWorkspaceReturnTo(input), expected, label);
}
const safeReturnCalls = visit(workspaceTree, (node) => ts.isCallExpression(node) && node.expression.getText() === "safeWorkspaceReturnTo");
assert.equal(safeReturnCalls.length, 1, "workspace page must normalize returnTo exactly once");
assert.equal(safeReturnCalls[0].arguments[0]?.getText(), "params.returnTo", "workspace page must normalize the requested return path");

const selectorTree = ts.createSourceFile(selectorPath, selector, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const chooseWorkspaceDeclarations = visit(selectorTree, (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "chooseWorkspace");
assert.equal(chooseWorkspaceDeclarations.length, 1, "workspace selector must define one chooseWorkspace callback");
const chooseWorkspaceDeclaration = chooseWorkspaceDeclarations[0];
assert(chooseWorkspaceDeclaration.initializer && ts.isCallExpression(chooseWorkspaceDeclaration.initializer) && chooseWorkspaceDeclaration.initializer.expression.getText() === "useCallback", "chooseWorkspace must remain a memoized callback");
const chooseWorkspaceCallback = chooseWorkspaceDeclaration.initializer.arguments[0];
assert(chooseWorkspaceCallback && ts.isArrowFunction(chooseWorkspaceCallback) && chooseWorkspaceCallback.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword), "chooseWorkspace must be async");
assert(ts.isBlock(chooseWorkspaceCallback.body), "chooseWorkspace must use an explicit control-flow block");
const directSelectorTryStatements = chooseWorkspaceCallback.body.statements.filter(ts.isTryStatement);
assert.equal(directSelectorTryStatements.length, 1, "chooseWorkspace must have one direct persistence try block, not a dead nested branch");
const selectorTry = directSelectorTryStatements[0];
const selectorTryIndex = chooseWorkspaceCallback.body.statements.indexOf(selectorTry);
assert(selectorTryIndex > 0, "chooseWorkspace persistence try must follow the pending guard and setup");
const statementsBeforeSelectorTry = chooseWorkspaceCallback.body.statements.slice(0, selectorTryIndex);
assert.equal(statementsBeforeSelectorTry.filter(ts.isIfStatement).length, 1, "only the pending guard may conditionally terminate before persistence");
assert(statementsBeforeSelectorTry.every((statement) => ts.isIfStatement(statement) || ts.isExpressionStatement(statement) || ts.isVariableStatement(statement)), "persistence setup must not be wrapped in loops, switches, or other unreachable control flow");
assert.equal(statementsBeforeSelectorTry.filter((statement) => ts.isReturnStatement(statement) || ts.isThrowStatement(statement)).length, 0, "chooseWorkspace must not terminate unconditionally before persistence");
const pendingGuard = statementsBeforeSelectorTry[0];
assert(ts.isIfStatement(pendingGuard) && !pendingGuard.elseStatement, "the first chooseWorkspace statement must be the pending guard");
assert(ts.isPropertyAccessExpression(pendingGuard.expression) && pendingGuard.expression.expression.getText() === "pendingRef" && pendingGuard.expression.name.text === "current", "the only pre-persistence guard must read pendingRef.current");
const pendingGuardStatement = ts.isBlock(pendingGuard.thenStatement) ? pendingGuard.thenStatement.statements[0] : pendingGuard.thenStatement;
assert(ts.isReturnStatement(pendingGuardStatement) && !pendingGuardStatement.expression, "the pending guard may only return without a value");
assert.equal(ts.isBlock(pendingGuard.thenStatement) ? pendingGuard.thenStatement.statements.length : 1, 1, "the pending guard must not hide additional behavior");
const preTryReturns = statementsBeforeSelectorTry.flatMap((statement) => visit(statement, ts.isReturnStatement));
const preTryThrows = statementsBeforeSelectorTry.flatMap((statement) => visit(statement, ts.isThrowStatement));
assert.deepEqual(preTryReturns, [pendingGuardStatement], "no return other than the pending guard may precede persistence");
assert.equal(preTryThrows.length, 0, "no throw may make persistence unreachable");
const pendingWrites = statementsBeforeSelectorTry.flatMap((statement) => visit(statement, (node) => ts.isBinaryExpression(node)
  && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
  && ts.isPropertyAccessExpression(node.left)
  && node.left.expression.getText() === "pendingRef"
  && node.left.name.text === "current"
  && node.right.kind === ts.SyntaxKind.TrueKeyword));
assert.equal(pendingWrites.length, 1, "chooseWorkspace must mark pending exactly once before persistence");
assert(pendingGuard.getStart() < pendingWrites[0].getStart() && pendingWrites[0].getStart() < selectorTry.getStart(), "pending guard must run before pendingRef.current is set and before persistence");
assert.deepEqual(selectorTry.tryBlock.statements.map((statement) => statement.kind), [
  ts.SyntaxKind.VariableStatement,
  ts.SyntaxKind.VariableStatement,
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ExpressionStatement,
], "workspace persistence must await POST, await JSON, reject failure, then navigate");

const unwrapExpression = (expression) => {
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isNonNullExpression(current) || ts.isSatisfiesExpression(current)) {
    current = current.expression;
  }
  return current;
};
const variableBinding = (statement, expectedName, message) => {
  assert(ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1, message);
  const declaration = statement.declarationList.declarations[0];
  assert(ts.isIdentifier(declaration.name) && declaration.name.text === expectedName && declaration.initializer, message);
  return declaration.initializer;
};

const responseInitializer = unwrapExpression(variableBinding(selectorTry.tryBlock.statements[0], "response", "workspace POST response must have one explicit binding"));
assert(ts.isAwaitExpression(responseInitializer), "workspace POST fetch must be awaited");
const fetchCall = unwrapExpression(responseInitializer.expression);
assert(ts.isCallExpression(fetchCall) && fetchCall.expression.getText() === "fetch", "workspace response must bind the fetch call");
assert.equal(fetchCall.arguments.length, 2, "workspace POST fetch must include request options");
const fetchOptions = fetchCall.arguments[1];
assert(ts.isObjectLiteralExpression(fetchOptions), "workspace POST options must be explicit");
const methodProperty = fetchOptions.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText() === "method");
assert(methodProperty && ts.isPropertyAssignment(methodProperty) && ts.isStringLiteral(methodProperty.initializer) && methodProperty.initializer.text === "POST", "workspace selection must persist with POST");

const resultInitializer = unwrapExpression(variableBinding(selectorTry.tryBlock.statements[1], "result", "workspace JSON result must have one explicit binding"));
assert(ts.isAwaitExpression(resultInitializer), "workspace response JSON must be awaited");
const jsonCall = unwrapExpression(resultInitializer.expression);
assert(ts.isCallExpression(jsonCall) && ts.isPropertyAccessExpression(jsonCall.expression), "workspace result must call response.json");
assert.equal(jsonCall.expression.expression.getText(), "response", "workspace result must read the bound response");
assert.equal(jsonCall.expression.name.text, "json", "workspace result must await response.json");
assert.equal(jsonCall.arguments.length, 0, "response.json must not receive unrelated arguments");

const failureGuard = selectorTry.tryBlock.statements[2];
assert(ts.isIfStatement(failureGuard) && !failureGuard.elseStatement, "workspace persistence failure must have one rejecting guard");
assert(ts.isBinaryExpression(failureGuard.expression) && failureGuard.expression.operatorToken.kind === ts.SyntaxKind.BarBarToken, "workspace failure must reject either HTTP or payload failure");
const isNegatedProperty = (node, objectName, propertyName) => ts.isPrefixUnaryExpression(node)
  && node.operator === ts.SyntaxKind.ExclamationToken
  && ts.isPropertyAccessExpression(node.operand)
  && node.operand.expression.getText() === objectName
  && node.operand.name.text === propertyName;
assert(isNegatedProperty(failureGuard.expression.left, "response", "ok"), "workspace failure guard must reject a non-ok response");
assert(isNegatedProperty(failureGuard.expression.right, "result", "ok"), "workspace failure guard must reject a non-ok payload");
const failureStatement = ts.isBlock(failureGuard.thenStatement) ? failureGuard.thenStatement.statements[0] : failureGuard.thenStatement;
assert(ts.isThrowStatement(failureStatement), "workspace failure guard must throw before navigation");
assert.equal(ts.isBlock(failureGuard.thenStatement) ? failureGuard.thenStatement.statements.length : 1, 1, "workspace failure branch must not navigate or continue");

const replacementStatement = selectorTry.tryBlock.statements[3];
assert(ts.isExpressionStatement(replacementStatement) && ts.isCallExpression(replacementStatement.expression), "workspace success path must complete navigation");
const replacementCall = replacementStatement.expression;
assert.equal(replacementCall.expression.getText(), "window.location.replace", "workspace success path must use a complete navigation");
assert.equal(replacementCall.arguments.length, 1, "workspace navigation must receive one return path");
assert.equal(replacementCall.arguments[0].getText(), "returnTo", "workspace selection must navigate to the normalized return path");

const callbackFetches = visit(chooseWorkspaceCallback.body, (node) => ts.isCallExpression(node) && node.expression.getText() === "fetch");
const callbackReplacements = visit(chooseWorkspaceCallback.body, (node) => ts.isCallExpression(node) && node.expression.getText() === "window.location.replace");
assert.equal(callbackFetches.length, 1, "chooseWorkspace must not contain an unverified or duplicate fetch path");
assert.equal(callbackReplacements.length, 1, "chooseWorkspace must not navigate from failure or dead branches");
assert(fetchCall === callbackFetches[0] && replacementCall === callbackReplacements[0], "verified persistence and navigation must be the only chooseWorkspace path");

console.log("home tenant recovery behavior: PASS");
