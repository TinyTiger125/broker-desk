import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const require = createRequire(import.meta.url);
const ts = require("typescript");
const paths = {
  memory: resolve(root, "src/lib/data.memory.ts"),
  postgres: resolve(root, "src/lib/data.postgres.ts"),
  facade: resolve(root, "src/lib/data.ts"),
  actions: resolve(root, "src/app/actions.ts"),
};
const source = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, readFileSync(path, "utf8")]));

function functionBody(text, name) {
  const start = text.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} must be exported`);
  const brace = text.indexOf("{", start);
  let depth = 0;
  for (let index = brace; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }
  assert.fail(`${name} body must close`);
}

function assertMemory(text) {
  const body = functionBody(text, "setRecordLifecycleWithAudit");
  assert.match(body, /makeId\("audit"\)/, "memory builds audit id before commit");
  assert.doesNotMatch(body, /Object\.assign\s*\(/, "memory atomic primitive never uses sequential multi-property Object.assign as a commit");
  assert.match(body, /const nextDb:\s*DB\s*=\s*\{\s*\.\.\.db,/, "memory preconstructs a complete next database state");
  assert.match(body, /_g\.__brokerDb\s*=\s*nextDb/, "memory commits with one database reference switch");
  assert.match(body, /auditLogs:\s*\[log,\s*\.\.\.db\.auditLogs\]/, "memory commit includes audit log");
  assert.ok(body.indexOf('makeId("audit")') < body.indexOf("_g.__brokerDb = nextDb"), "audit construction precedes memory reference switch");
  assert.doesNotMatch(body.slice(0, body.indexOf("_g.__brokerDb = nextDb")), /\.lifecycleStatus\s*=|\.archivedAt\s*=|\.archivedById\s*=/, "memory does not mutate a record before atomic commit");
  for (const entity of ["case", "party"]) assert.match(body, new RegExp(`input\\.entityType === "${entity}"`), `memory covers ${entity}`);
  assert.match(body, /db\.properties\.find/, "memory covers property fallback");
  if (text.includes("__brokerDbHolder")) assertMemoryGlobalHolder(text);
  assertMemoryCommitOrder(text);
}

function parse(text, name) {
  return ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function nodeText(node, file) {
  return node.getText(file);
}

function isExported(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function findExportedFunction(file, name) {
  const matches = file.statements.filter(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name && isExported(statement),
  );
  assert.equal(matches.length, 1, `${name} must be one top-level exported function`);
  assert(matches[0].body, `${name} must have a body`);
  return matches[0];
}

function findTopLevelVariable(file, name) {
  const matches = file.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations].map((declaration) => ({ statement, declaration })))
    .filter(({ declaration }) => ts.isIdentifier(declaration.name) && declaration.name.text === name);
  assert.equal(matches.length, 1, `${name} must be one top-level variable`);
  return matches[0];
}

function assertMemoryGlobalHolder(text) {
  const file = parse(text, "data.memory.ts");
  const localLiveDb = file.statements
    .filter(ts.isVariableStatement)
    .filter((statement) => !(statement.declarationList.flags & ts.NodeFlags.Const))
    .flatMap((statement) => [...statement.declarationList.declarations])
    .filter((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "db");
  assert.equal(localLiveDb.length, 0, "memory module cannot create a reload-local mutable db snapshot");

  const holder = findTopLevelVariable(file, "dbHolder");
  assert(holder.statement.declarationList.flags & ts.NodeFlags.Const, "memory holder binding is immutable per module instance");
  assert.equal(holder.declaration.type?.getText(file), "BrokerDbHolder", "memory holder uses the shared holder type");
  assert.equal(holder.declaration.initializer?.getText(file), "_g.__brokerDbHolder ?? { current: _g.__brokerDb ?? cloneDb(_freshDb) }", "memory reuses the unique global holder across module reloads");

  const holderPublish = file.statements.filter((statement) => ts.isExpressionStatement(statement)
    && ts.isBinaryExpression(statement.expression)
    && statement.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
    && statement.expression.left.getText(file) === "_g.__brokerDbHolder");
  assert.equal(holderPublish.length, 1, "memory publishes the shared holder once");
  assert.equal(holderPublish[0].expression.right.getText(file), "dbHolder", "memory publishes the reused holder, not a module-local database");

  const bridgeCalls = file.statements.filter((statement) => ts.isExpressionStatement(statement)
    && ts.isCallExpression(statement.expression)
    && statement.expression.expression.getText(file) === "Object.defineProperty"
    && statement.expression.arguments[0]?.getText(file) === "_g"
    && statement.expression.arguments[1]?.getText(file) === '"__brokerDb"');
  assert.equal(bridgeCalls.length, 1, "memory exposes one compatibility bridge for the shared current reference");
  const bridge = bridgeCalls[0].expression.arguments[2];
  assert(bridge && ts.isObjectLiteralExpression(bridge), "memory compatibility bridge uses a direct descriptor");
  const bridgeMap = new Map(bridge.properties.map((property) => [property.name?.getText(file), property]));
  const getter = bridgeMap.get("get");
  const setter = bridgeMap.get("set");
  assert(getter && ts.isPropertyAssignment(getter) && getter.initializer.getText(file) === "() => dbHolder.current", "memory bridge always reads the shared current reference");
  assert(setter && ts.isPropertyAssignment(setter) && ts.isArrowFunction(setter.initializer) && ts.isBlock(setter.initializer.body), "memory bridge has a direct current-reference setter");
  assert.equal(setter.initializer.body.statements.length, 1, "memory bridge setter performs one reference mutation");
  const setterStatement = setter.initializer.body.statements[0];
  assert(ts.isExpressionStatement(setterStatement)
    && ts.isBinaryExpression(setterStatement.expression)
    && setterStatement.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
    && setterStatement.expression.left.getText(file) === "dbHolder.current"
    && setterStatement.expression.right.getText(file) === "nextDb", "memory bridge atomically replaces only the shared holder current reference");

  const proxy = findTopLevelVariable(file, "db");
  assert(proxy.statement.declarationList.flags & ts.NodeFlags.Const, "memory database view is a stable proxy, not a mutable snapshot");
  assert(proxy.declaration.initializer && ts.isNewExpression(proxy.declaration.initializer)
    && proxy.declaration.initializer.expression.getText(file) === "Proxy", "memory database view dereferences the holder through a proxy");
  const proxyHandler = proxy.declaration.initializer.arguments?.[1];
  assert(proxyHandler && ts.isObjectLiteralExpression(proxyHandler), "memory database proxy has a direct handler");
  const proxyProperties = new Map(proxyHandler.properties.map((property) => [property.name?.getText(file), property]));
  const getTrap = proxyProperties.get("get");
  assert(getTrap && ts.isPropertyAssignment(getTrap) && ts.isArrowFunction(getTrap.initializer), "memory proxy has one direct get trap");
  assert(ts.isCallExpression(getTrap.initializer.body)
    && getTrap.initializer.body.expression.getText(file) === "Reflect.get"
    && getTrap.initializer.body.arguments.map((argument) => argument.getText(file)).join("|") === "dbHolder.current|property", "memory get trap directly reads the requested property from shared current");
  const setTrap = proxyProperties.get("set");
  assert(setTrap && ts.isPropertyAssignment(setTrap) && ts.isArrowFunction(setTrap.initializer), "memory proxy has one direct set trap");
  assert(ts.isCallExpression(setTrap.initializer.body)
    && setTrap.initializer.body.expression.getText(file) === "Reflect.set"
    && setTrap.initializer.body.arguments.map((argument) => argument.getText(file)).join("|") === "dbHolder.current|property|value", "memory set trap directly writes the requested property on shared current");
  const ownKeys = proxyProperties.get("ownKeys");
  assert(ownKeys && ts.isPropertyAssignment(ownKeys) && ts.isArrowFunction(ownKeys.initializer), "memory proxy has one direct ownKeys trap");
  assert(ts.isCallExpression(ownKeys.initializer.body)
    && ownKeys.initializer.body.expression.getText(file) === "Reflect.ownKeys"
    && ownKeys.initializer.body.arguments.length === 1
    && ownKeys.initializer.body.arguments[0].getText(file) === "dbHolder.current", "memory ownKeys trap returns exactly every key from the shared current database");
  const descriptorTrap = proxyProperties.get("getOwnPropertyDescriptor");
  assert(descriptorTrap && ts.isPropertyAssignment(descriptorTrap) && ts.isArrowFunction(descriptorTrap.initializer)
    && ts.isBlock(descriptorTrap.initializer.body), "memory proxy has one direct getOwnPropertyDescriptor trap");
  assert.equal(descriptorTrap.initializer.body.statements.length, 2, "memory descriptor trap has only lookup and return");
  const [descriptorDeclaration, descriptorReturn] = descriptorTrap.initializer.body.statements;
  assert(ts.isVariableStatement(descriptorDeclaration)
    && descriptorDeclaration.declarationList.declarations.length === 1, "memory descriptor trap has one direct descriptor binding");
  const descriptorBinding = descriptorDeclaration.declarationList.declarations[0];
  assert(ts.isIdentifier(descriptorBinding.name) && descriptorBinding.name.text === "descriptor"
    && ts.isCallExpression(descriptorBinding.initializer)
    && descriptorBinding.initializer.expression.getText(file) === "Reflect.getOwnPropertyDescriptor"
    && descriptorBinding.initializer.arguments.map((argument) => argument.getText(file)).join("|") === "dbHolder.current|property", "memory descriptor trap directly reads the shared current descriptor");
  assert(ts.isReturnStatement(descriptorReturn)
    && descriptorReturn.expression?.getText(file) === "descriptor ? { ...descriptor, configurable: true } : undefined", "memory descriptor trap returns only the live descriptor with proxy-safe configurability");
}

function literalBoolean(expression) {
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
}

function statementAlwaysTerminates(statement) {
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
  if (ts.isBlock(statement)) return statement.statements.some(statementAlwaysTerminates);
  if (ts.isIfStatement(statement)) {
    const literal = literalBoolean(statement.expression);
    if (literal === true) return statementAlwaysTerminates(statement.thenStatement);
    if (literal === false) return statement.elseStatement ? statementAlwaysTerminates(statement.elseStatement) : false;
    return Boolean(statement.elseStatement) && statementAlwaysTerminates(statement.thenStatement) && statementAlwaysTerminates(statement.elseStatement);
  }
  return false;
}

function isAssignmentOperator(kind) {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function isMutationExpression(node) {
  if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)) return true;
  if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
    && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)) return true;
  return ts.isDeleteExpression(node);
}

function directStatement(block, node) {
  let current = node;
  while (current?.parent && current.parent !== block) current = current.parent;
  assert(current && current.parent === block && ts.isStatement(current), "evidence node must belong to a direct block statement");
  return current;
}

function assertReachableStatement(block, statement, label) {
  const index = block.statements.indexOf(statement);
  assert(index >= 0, `${label} must be a direct statement in its live block`);
  for (const prior of block.statements.slice(0, index)) {
    assert(!statementAlwaysTerminates(prior), `${label} cannot follow an always-terminating statement`);
  }
}

function assertReachableThroughBlocks(node, callback, label) {
  let current = node;
  while (current && current !== callback.body) {
    const block = current.parent;
    if (ts.isBlock(block)) {
      const statement = directStatement(block, current);
      assertReachableStatement(block, statement, label);
      current = block;
      continue;
    }
    current = block;
  }
  assert.equal(current, callback.body, `${label} must remain inside the transaction callback`);
}

function directCalls(block, file, expressionText) {
  return block.statements.filter((statement) => {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) return false;
    return statement.expression.expression.getText(file) === expressionText;
  });
}

function variableIndex(block, name) {
  return block.statements.findIndex(
    (statement) =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name && declaration.initializer),
  );
}

function assertCollectionMap(block, file, collectionName, label) {
  const declarations = block.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .filter((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === collectionName);
  assert.equal(declarations.length, 1, `${label} constructs one live replacement collection`);
  const initializer = declarations[0].initializer;
  assert(initializer && ts.isCallExpression(initializer)
    && initializer.expression.getText(file) === `db.${collectionName}.map`
    && initializer.arguments.length === 1, `${label} replacement maps the live ${collectionName} collection exactly once`);
  const callback = initializer.arguments[0];
  assert(ts.isArrowFunction(callback)
    && callback.parameters.length === 1
    && callback.parameters[0].name.getText(file) === "entry"
    && ts.isParenthesizedExpression(callback.body), `${label} replacement uses one direct entry callback`);
  assert.equal(callback.body.expression.getText(file), "entry.id === item.id ? updated : entry", `${label} replaces only the target id and preserves every other entry`);
}

function assertCommitTail(block, file, collectionName, label) {
  assertCollectionMap(block, file, collectionName, label);
  const nextDbIndex = variableIndex(block, "nextDb");
  assert(nextDbIndex >= 0, `${label} constructs one complete next database state`);
  const nextDbStatement = block.statements[nextDbIndex];
  const nextDbDeclaration = nextDbStatement.declarationList.declarations.find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "nextDb");
  assert(nextDbDeclaration?.type?.getText(file) === "DB" && ts.isObjectLiteralExpression(nextDbDeclaration.initializer), `${label} next state is a direct complete DB object`);
  const payload = nextDbDeclaration.initializer;
  assert.equal(payload.properties.length, 3, `${label} next state has base DB, record collection and audit log properties`);
  const [baseProperty, collectionProperty, auditProperty] = payload.properties;
  assert(ts.isSpreadAssignment(baseProperty) && baseProperty.expression.getText(file) === "db", `${label} next state preserves every unaffected collection`);
  assert(ts.isShorthandPropertyAssignment(collectionProperty) && collectionProperty.name.text === collectionName, `${label} commit uses the preconstructed ${collectionName} collection`);
  assert(ts.isPropertyAssignment(auditProperty) && ts.isIdentifier(auditProperty.name) && auditProperty.name.text === "auditLogs", `${label} commit has one direct auditLogs property`);
  assert(ts.isArrayLiteralExpression(auditProperty.initializer) && auditProperty.initializer.elements.length === 2, `${label} commit prepends exactly one audit log`);
  const [newLog, existingLogs] = auditProperty.initializer.elements;
  assert.equal(newLog.getText(file), "log", `${label} commit prepends the preconstructed log`);
  assert(ts.isSpreadElement(existingLogs) && existingLogs.expression.getText(file) === "db.auditLogs", `${label} commit preserves the existing audit log collection`);
  const commits = block.statements.filter((statement) => ts.isExpressionStatement(statement)
    && ts.isBinaryExpression(statement.expression)
    && statement.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
    && statement.expression.left.getText(file) === "_g.__brokerDb");
  assert.equal(commits.length, 1, `${label} has one direct database reference switch`);
  const commit = commits[0];
  assert.equal(commit.expression.right.getText(file), "nextDb", `${label} atomically switches to the complete next state`);
  const commitIndex = block.statements.indexOf(commit);
  for (const dependency of ["updated", collectionName, "result", "nextDb"]) {
    const index = variableIndex(block, dependency);
    assert(index >= 0 && index < commitIndex, `${label} constructs ${dependency} before commit`);
  }
  assertReachableStatement(block, commit, `${label} commit`);
  const tail = block.statements.slice(commitIndex + 1);
  assert.equal(tail.length, 1, `${label} commit is followed only by return`);
  assert(ts.isReturnStatement(tail[0]) && tail[0].expression?.getText(file) === "result", `${label} returns the preconstructed result after commit`);
  const forbidden = descendants(tail[0], (node) => ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isThrowStatement(node) || ts.isAwaitExpression(node));
  assert.equal(forbidden.length, 0, `${label} performs no throwing work after commit`);
}

function assertMemoryCommitOrder(text) {
  const file = parse(text, "data.memory.ts");
  const fn = findExportedFunction(file, "setRecordLifecycleWithAudit");
  const memoryCalls = allDescendants(fn.body, (node) => ts.isCallExpression(node));
  memoryCalls.forEach((call) => assertReachableFromCallback(call, { body: fn.body }, file));
  assert.deepEqual(memoryCalls.map((call) => call.expression.getText(file)).sort(), [
    "cloneBrokerageCase",
    "db.brokerageCases.find",
    "db.brokerageCases.map",
    "db.clients.find",
    "db.clients.map",
    "db.properties.find",
    "db.properties.map",
    "makeId",
    "resolveTenantId",
  ].sort(), "memory composite calls only the frozen lookup, construction, clone and single-commit allowlist");
  const memoryConstructions = allDescendants(fn.body, (node) => ts.isNewExpression(node));
  memoryConstructions.forEach((construction) => assertReachableFromCallback(construction, { body: fn.body }, file));
  assert.deepEqual(memoryConstructions.map((construction) => construction.expression.getText(file)), ["Date"], "memory composite constructs only its frozen timestamp");
  const splitWriterNames = new Set(["addAuditLog", "setBrokerageCaseLifecycleStatus", "setClientLifecycleStatus", "setPropertyLifecycleStatus"]);
  const splitWriterReferences = allDescendants(fn.body, (node) => ts.isIdentifier(node) && splitWriterNames.has(node.text));
  assert.equal(splitWriterReferences.length, 0, "memory composite cannot directly, indirectly or through an alias reference split lifecycle/audit writers");
  const directMutations = allDescendants(fn.body, isMutationExpression);
  assert.equal(directMutations.length, 3, "memory composite has exactly three state mutations: one reference switch per entity branch");
  for (const mutation of directMutations) {
    assert(ts.isBinaryExpression(mutation)
      && mutation.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && mutation.left.getText(file) === "_g.__brokerDb"
      && mutation.right.getText(file) === "nextDb", "memory mutation must be the direct complete-state reference switch");
    assertReachableFromCallback(mutation, { body: fn.body }, file);
  }
  const caseIf = fn.body.statements.find((statement) => ts.isIfStatement(statement) && nodeText(statement.expression, file) === 'input.entityType === "case"');
  const partyIf = fn.body.statements.find((statement) => ts.isIfStatement(statement) && nodeText(statement.expression, file) === 'input.entityType === "party"');
  assert(caseIf && ts.isBlock(caseIf.thenStatement), "memory has live case branch");
  assert(partyIf && ts.isBlock(partyIf.thenStatement), "memory has live party branch");
  assertMemoryUpdatedObject(caseIf.thenStatement, file, "case");
  assertMemoryUpdatedObject(partyIf.thenStatement, file, "party");
  assertMemoryFindPredicate(caseIf.thenStatement, file, "brokerageCases", [
    "caseItem.currentOwnerUserId === input.userId",
    "caseItem.tenantId === scopeTenantId",
    "caseItem.id === input.entityId",
    'caseItem.ownerResolutionStatus === "resolved"',
  ], "case");
  assertMemoryFindPredicate(partyIf.thenStatement, file, "clients", [
    "client.currentOwnerUserId === input.userId",
    'client.ownerResolutionStatus === "resolved"',
    "client.tenantId === scopeTenantId",
    "client.id === input.entityId",
  ], "party");
  assertCommitTail(caseIf.thenStatement, file, "brokerageCases", "case");
  assertCommitTail(partyIf.thenStatement, file, "clients", "party");

  const partyIndex = fn.body.statements.indexOf(partyIf);
  const propertyStatements = fn.body.statements.slice(partyIndex + 1);
  const propertyBlock = ts.factory.createBlock(propertyStatements, true);
  propertyStatements.forEach((statement) => { statement.parent = propertyBlock; });
  assertMemoryUpdatedObject(propertyBlock, file, "property");
  assertMemoryFindPredicate(propertyBlock, file, "properties", [
    "property.tenantId === scopeTenantId",
    "property.id === input.entityId",
  ], "property");
  assertCommitTail(propertyBlock, file, "properties", "property");

  const targetTypeDeclaration = fn.body.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "targetType");
  assert.equal(targetTypeDeclaration?.initializer?.getText(file), 'input.entityType === "party" ? "client" : input.entityType', "memory target type maps party to client only");
  const logDeclaration = fn.body.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "log");
  assert(logDeclaration?.initializer && ts.isObjectLiteralExpression(logDeclaration.initializer), "memory constructs one live audit log before branches");
  const logProperties = logDeclaration.initializer.properties;
  const expectedLogNames = ["id", "tenantId", "actorId", "userId", "action", "targetType", "targetId", "message", "createdAt"];
  assert.equal(logProperties.length, expectedLogNames.length, "memory audit log has exactly the nine frozen fields");
  assert(logProperties.every((property) => ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)), "memory audit log fields are direct, non-spread properties");
  assert.deepEqual(logProperties.map((property) => property.name.getText(file)), expectedLogNames, "memory audit log has no spread, computed, duplicate, reordered or extra fields");
  const log = objectPropertyMap(logDeclaration.initializer, file);
  assert.deepEqual(log, {
    id: "auditId",
    tenantId: "scopeTenantId",
    actorId: "input.userId",
    userId: "input.userId",
    action: 'input.status === "archived" ? "record_archived" : "record_restored"',
    targetType: "targetType",
    targetId: "input.entityId",
    message: 'input.status === "archived" ? "记录已归档。" : "记录已恢复。"',
    createdAt: "nowDate",
  }, "memory audit log binds actor, tenant, target, action, message and time");
  for (const status of ["archived", "active"]) {
    const context = { status, entityType: "case", entityId: "record", userId: "actor" };
    const actionNode = logDeclaration.initializer.properties.find((property) => property.name?.getText(file) === "action").initializer;
    const messageNode = logDeclaration.initializer.properties.find((property) => property.name?.getText(file) === "message").initializer;
    assert.equal(evaluateAuditExpression(actionNode, file, context), status === "archived" ? "record_archived" : "record_restored", `memory audit action maps ${status}`);
    assert.equal(evaluateAuditExpression(messageNode, file, context), status === "archived" ? "记录已归档。" : "记录已恢复。", `memory audit message maps ${status}`);
  }
}

function objectPropertyMap(object, file) {
  return Object.fromEntries(object.properties.filter((property) => !ts.isSpreadAssignment(property)).map((property) => {
    if (ts.isShorthandPropertyAssignment(property)) return [property.name.text, property.name.text];
    assert(ts.isPropertyAssignment(property), "lifecycle objects use direct or shorthand assignments");
    return [property.name.getText(file), property.initializer.getText(file)];
  }));
}

function assertMemoryUpdatedObject(block, file, entityType) {
  const declaration = block.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((item) => ts.isIdentifier(item.name) && item.name.text === "updated");
  assert(declaration?.initializer && ts.isObjectLiteralExpression(declaration.initializer), `${entityType} constructs one updated object`);
  const properties = declaration.initializer.properties;
  const expectedNames = entityType === "property"
    ? ["lifecycleStatus", "archivedAt", "archivedById"]
    : ["lifecycleStatus", "archivedAt", "archivedById", "updatedAt"];
  assert.equal(properties.length, expectedNames.length + 1, `${entityType} updated object has only the source record and frozen lifecycle fields`);
  assert(ts.isSpreadAssignment(properties[0]) && properties[0].expression.getText(file) === "item", `${entityType} updated object begins with the one and only source item spread`);
  assert.equal(properties.filter(ts.isSpreadAssignment).length, 1, `${entityType} updated object cannot merge another record`);
  const directProperties = properties.slice(1);
  assert(directProperties.every(ts.isPropertyAssignment), `${entityType} lifecycle overrides are direct properties`);
  assert.deepEqual(directProperties.map((property) => property.name.getText(file)), expectedNames, `${entityType} updated object cannot override identity, ownership, tenant or business fields`);
  const props = objectPropertyMap(declaration.initializer, file);
  const archivedBy = entityType === "property"
    ? 'input.status === "archived" ? input.archivedById : undefined'
    : 'input.status === "archived" ? input.archivedById ?? input.userId : undefined';
  const expected = {
    lifecycleStatus: "input.status",
    archivedAt: 'input.status === "archived" ? nowDate : undefined',
    archivedById: archivedBy,
    ...(entityType === "property" ? {} : { updatedAt: "nowDate" }),
  };
  for (const [key, value] of Object.entries(expected)) assert.equal(props[key], value, `${entityType} ${key} preserves lifecycle metadata semantics`);
}

function flattenAnd(expression) {
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return [...flattenAnd(expression.left), ...flattenAnd(expression.right)];
  }
  return [expression];
}

function assertMemoryFindPredicate(block, file, collection, expected, label) {
  const itemDeclaration = block.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "item");
  assert(itemDeclaration?.initializer && ts.isCallExpression(itemDeclaration.initializer), `${label} has one live item lookup`);
  const call = itemDeclaration.initializer;
  assert(ts.isPropertyAccessExpression(call.expression) && call.expression.expression.getText(file) === `db.${collection}` && call.expression.name.text === "find", `${label} uses the expected collection find`);
  assert.equal(call.arguments.length, 1);
  const predicate = call.arguments[0];
  assert(ts.isArrowFunction(predicate) && !ts.isBlock(predicate.body), `${label} uses a direct predicate expression`);
  const terms = flattenAnd(predicate.body).map((term) => term.getText(file));
  assert.deepEqual(terms, expected, `${label} lookup preserves owner, tenant, id and resolution predicates`);
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

function allDescendants(rootNode, predicate) {
  const found = [];
  function visit(node) {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(rootNode);
  return found;
}

function assertReachableFromCallback(node, callback, file) {
  let current = node;
  while (current && current !== callback.body) {
    const parent = current.parent;
    assert(parent, "live query must stay inside transaction callback");
    if (ts.isFunctionLike(parent) && parent !== callback) assert.fail("live query cannot hide in a nested helper");
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && literalBoolean(parent.left) === false) {
      assert.fail("live query cannot hide in false &&");
    }
    if (ts.isConditionalExpression(parent)) {
      const literal = literalBoolean(parent.condition);
      if ((literal === true && current === parent.whenFalse) || (literal === false && current === parent.whenTrue)) {
        assert.fail("live query cannot hide in a constant-dead conditional");
      }
    }
    current = parent;
  }
  assert.equal(current, callback.body, `query must belong to live callback: ${nodeText(node, file)}`);
}

function awaitedClientQueries(callback, file) {
  return descendants(callback.body, (node) => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
    if (node.expression.expression.getText(file) !== "client" || node.expression.name.text !== "query") return false;
    return ts.isAwaitExpression(node.parent) && node.parent.expression === node;
  });
}

function querySql(call, file) {
  return call.arguments[0]?.getText(file) ?? "";
}

function normalizedSql(call, file) {
  const raw = querySql(call, file);
  const unquoted = raw.startsWith("`") && raw.endsWith("`") ? raw.slice(1, -1) : raw;
  return unquoted.replace(/\s+/g, " ").trim();
}

function evaluateAuditExpression(expression, file, context) {
  if (ts.isStringLiteral(expression)) return expression.text;
  if (ts.isIdentifier(expression) && Object.prototype.hasOwnProperty.call(context, expression.text)) return context[expression.text];
  if (ts.isPropertyAccessExpression(expression) && expression.expression.getText(file) === "input") return context[expression.name.text];
  if (ts.isConditionalExpression(expression)) {
    return evaluateAuditExpression(expression.condition, file, context)
      ? evaluateAuditExpression(expression.whenTrue, file, context)
      : evaluateAuditExpression(expression.whenFalse, file, context);
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
    return evaluateAuditExpression(expression.left, file, context) === evaluateAuditExpression(expression.right, file, context);
  }
  assert.fail(`unsupported audit expression: ${expression.getText(file)}`);
}

function evaluateValidationExpression(expression, file, context) {
  if (ts.isParenthesizedExpression(expression)) return evaluateValidationExpression(expression.expression, file, context);
  if (ts.isIdentifier(expression) && Object.prototype.hasOwnProperty.call(context, expression.text)) return context[expression.text];
  if (ts.isStringLiteral(expression)) return expression.text;
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.ExclamationToken) {
    return !evaluateValidationExpression(expression.operand, file, context);
  }
  if (ts.isConditionalExpression(expression)) {
    return evaluateValidationExpression(expression.condition, file, context)
      ? evaluateValidationExpression(expression.whenTrue, file, context)
      : evaluateValidationExpression(expression.whenFalse, file, context);
  }
  if (ts.isBinaryExpression(expression)) {
    if (expression.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      return Boolean(evaluateValidationExpression(expression.left, file, context) || evaluateValidationExpression(expression.right, file, context));
    }
    if (expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      return Boolean(evaluateValidationExpression(expression.left, file, context) && evaluateValidationExpression(expression.right, file, context));
    }
    if (expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
      return evaluateValidationExpression(expression.left, file, context) === evaluateValidationExpression(expression.right, file, context);
    }
  }
  if (ts.isCallExpression(expression) && expression.expression.getText(file) === "isLifecycleStatus" && expression.arguments.length === 1) {
    const status = evaluateValidationExpression(expression.arguments[0], file, context);
    return status === "archived" || status === "active";
  }
  assert.fail(`unsupported validation expression: ${expression.getText(file)}`);
}

function directThrow(statement) {
  if (ts.isThrowStatement(statement)) return statement;
  if (ts.isBlock(statement) && statement.statements.length === 1 && ts.isThrowStatement(statement.statements[0])) return statement.statements[0];
  return undefined;
}

const EXPECTED_LIFECYCLE_UPDATES = {
  brokerage_cases: {
    sql: "UPDATE brokerage_cases SET lifecycle_status = $4, archived_at = CASE WHEN $4 = 'archived' THEN NOW() ELSE NULL END, archived_by_id = CASE WHEN $4 = 'archived' THEN COALESCE($5, $2) ELSE NULL END, updated_at = NOW() WHERE id = $1 AND current_owner_user_id = $2 AND tenant_id = $3 AND owner_resolution_status = 'resolved' RETURNING *",
    args: ["input.entityId", "input.userId", "scopeTenantId", "input.status", "input.archivedById ?? null"],
  },
  clients: {
    sql: "UPDATE clients SET lifecycle_status = $4, archived_at = CASE WHEN $4 = 'archived' THEN NOW() ELSE NULL END, archived_by_id = CASE WHEN $4 = 'archived' THEN COALESCE($5, $2) ELSE NULL END, updated_at = NOW() WHERE id = $1 AND current_owner_user_id = $2 AND owner_resolution_status = 'resolved' AND tenant_id = $3 RETURNING *",
    args: ["input.entityId", "input.userId", "scopeTenantId", "input.status", "input.archivedById ?? null"],
  },
  properties: {
    sql: "UPDATE properties SET lifecycle_status = $3, updated_at = NOW(), archived_at = CASE WHEN $3 = 'archived' THEN NOW() ELSE NULL END, archived_by_id = CASE WHEN $3 = 'archived' THEN $4 ELSE NULL END WHERE id = $1 AND tenant_id = $2 RETURNING *",
    args: ["input.entityId", "scopeTenantId", "input.status", "input.archivedById ?? null"],
  },
};

function assertPostgres(text) {
  const file = parse(text, "data.postgres.ts");
  const fn = findExportedFunction(file, "setRecordLifecycleWithAudit");
  const statements = [...fn.body.statements];
  assert(statements.length > 0, "postgres composite body must not be empty");
  const finalStatement = statements.at(-1);
  assert(ts.isReturnStatement(finalStatement) && finalStatement.expression, "postgres composite final statement must return transaction");
  assert.equal(statements.length, 3, "postgres composite has only schema setup, tenant resolution and the transaction return");
  const [schemaStatement, tenantStatement] = statements;
  assert(ts.isExpressionStatement(schemaStatement) && ts.isAwaitExpression(schemaStatement.expression) && ts.isCallExpression(schemaStatement.expression.expression) && schemaStatement.expression.expression.expression.getText(file) === "ensureSchema", "postgres composite performs only direct awaited schema setup before the transaction");
  assert(ts.isVariableStatement(tenantStatement) && tenantStatement.declarationList.declarations.length === 1, "postgres composite directly resolves one tenant scope before the transaction");
  const tenantDeclaration = tenantStatement.declarationList.declarations[0];
  assert(ts.isIdentifier(tenantDeclaration.name) && tenantDeclaration.name.text === "scopeTenantId" && tenantDeclaration.initializer?.getText(file) === "resolveTenantId(input.tenantId)", "postgres composite resolves the live tenant scope without an outer write");
  for (const statement of statements.slice(0, -1)) {
    assert(!statementAlwaysTerminates(statement), "postgres transaction cannot be preceded by an always-terminating path");
  }
  const transactionCall = finalStatement.expression;
  assert(ts.isCallExpression(transactionCall) && transactionCall.expression.getText(file) === "withTransaction", "final return must call withTransaction directly");
  assert.equal(transactionCall.arguments.length, 1, "withTransaction receives one callback");
  const callback = transactionCall.arguments[0];
  assert((ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && callback.modifiers?.some((item) => item.kind === ts.SyntaxKind.AsyncKeyword), "transaction callback must be async");
  assert(ts.isBlock(callback.body), "transaction callback must use a direct block");
  assert.equal(callback.parameters.length, 1);
  assert.equal(callback.parameters[0].name.getText(file), "client", "transaction callback uses the live client binding");

  function databaseMethod(call) {
    if (!ts.isCallExpression(call)) return undefined;
    if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
    if (ts.isElementAccessExpression(call.expression) && call.expression.argumentExpression && ts.isStringLiteral(call.expression.argumentExpression)) {
      return call.expression.argumentExpression.text;
    }
    return undefined;
  }
  const allDatabaseCalls = allDescendants(fn.body, (node) => ["query", "execute"].includes(databaseMethod(node)));
  assert.equal(allDatabaseCalls.length, 4, "postgres composite has exactly three lifecycle updates and one audit insert database call");
  allDatabaseCalls.forEach((call) => {
    assert(ts.isPropertyAccessExpression(call.expression), "every database call uses direct property access");
    assert.equal(call.expression.expression.getText(file), "client", "every database call uses the transaction client");
    assert(ts.isAwaitExpression(call.parent) && call.parent.expression === call, "every database call is directly awaited");
    assertReachableFromCallback(call, callback, file);
  });
  const getPoolReferences = allDescendants(fn.body, (node) => ts.isIdentifier(node) && node.text === "getPool");
  assert.equal(getPoolReferences.length, 0, "postgres composite cannot reference or alias getPool outside the transaction client");
  const callbackCalls = allDescendants(callback.body, (node) => ts.isCallExpression(node));
  callbackCalls.forEach((call) => assertReachableFromCallback(call, callback, file));
  const allowedCallbackCallees = callbackCalls.map((call) => call.expression.getText(file)).sort();
  assert.deepEqual(allowedCallbackCallees, [
    "JSON.stringify",
    "client.query",
    "client.query",
    "client.query",
    "client.query",
    "genId",
    "mapBrokerageCase",
    "mapClient",
    "mapProperty",
  ], "transaction callback calls only the frozen query, audit-id, serialization and mapper allowlist");

  const queries = awaitedClientQueries(callback, file);
  queries.forEach((query) => assertReachableFromCallback(query, callback, file));
  const updateQueries = queries.filter((query) => /UPDATE\s+(brokerage_cases|clients|properties)/.test(querySql(query, file)));
  assert.equal(updateQueries.length, 3, "three entity branches use awaited client updates");
  const tables = updateQueries.map((query) => querySql(query, file).match(/UPDATE\s+(brokerage_cases|clients|properties)/)?.[1]).sort();
  assert.deepEqual(tables, ["brokerage_cases", "clients", "properties"], "all entity tables update through the transaction client");
  updateQueries.forEach((query) => {
    assert.match(querySql(query, file), /RETURNING \*/, "each lifecycle update returns the updated row");
    const table = querySql(query, file).match(/UPDATE\s+(brokerage_cases|clients|properties)/)?.[1];
    const expected = EXPECTED_LIFECYCLE_UPDATES[table];
    assert(expected, `independent SQL expectation exists for ${table}`);
    assert.equal(normalizedSql(query, file), expected.sql, `${table} lifecycle SQL preserves authorization and lifecycle placeholders`);
    const args = query.arguments[1];
    assert(ts.isArrayLiteralExpression(args), `${table} lifecycle query uses a direct parameter array`);
    assert.deepEqual(args.elements.map((element) => element.getText(file)), expected.args, `${table} lifecycle parameters preserve id/owner/tenant/status/archive order`);
    assertReachableThroughBlocks(query, callback, "lifecycle update");
  });

  const entityUpdate = callback.body.statements.find(
    (statement) => ts.isIfStatement(statement) && nodeText(statement.expression, file) === 'input.entityType === "case"',
  );
  assert(entityUpdate && ts.isIfStatement(entityUpdate), "postgres update chain starts with the live case branch");
  assertReachableStatement(callback.body, entityUpdate, "entity update chain");
  assert(ts.isBlock(entityUpdate.thenStatement), "case update branch is a direct block");
  const partyUpdate = entityUpdate.elseStatement;
  assert(partyUpdate && ts.isIfStatement(partyUpdate) && nodeText(partyUpdate.expression, file) === 'input.entityType === "party"', "postgres update chain uses the live party else-if branch");
  assert(ts.isBlock(partyUpdate.thenStatement), "party update branch is a direct block");
  assert(partyUpdate.elseStatement && ts.isBlock(partyUpdate.elseStatement), "property update uses the final else block");

  function assertEntityUpdateBranch(block, table, label) {
    assert.equal(block.statements.length, 2, `${label} update branch contains only update and shared-row assignment`);
    const [queryStatement, assignmentStatement] = block.statements;
    assert(ts.isVariableStatement(queryStatement) && queryStatement.declarationList.declarations.length === 1, `${label} update is one direct variable declaration`);
    const declaration = queryStatement.declarationList.declarations[0];
    assert(ts.isIdentifier(declaration.name) && declaration.name.text === "updateResult", `${label} update binds updateResult`);
    assert(declaration.initializer && ts.isAwaitExpression(declaration.initializer), `${label} update awaits the transaction client`);
    const query = declaration.initializer.expression;
    assert(ts.isCallExpression(query) && query.expression.getText(file) === "client.query", `${label} update uses the transaction client directly`);
    assert.equal(querySql(query, file).match(/UPDATE\s+(brokerage_cases|clients|properties)/)?.[1], table, `${label} update targets ${table}`);
    assert(updateQueries.includes(query), `${label} update is the same live query verified by the SQL matrix`);
    assert(ts.isExpressionStatement(assignmentStatement) && ts.isBinaryExpression(assignmentStatement.expression) && assignmentStatement.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken, `${label} assigns the shared updated row directly`);
    assert.equal(assignmentStatement.expression.left.getText(file), "updatedRow", `${label} assigns updatedRow`);
    assert.equal(assignmentStatement.expression.right.getText(file), "updateResult.rows[0]", `${label} assigns the query result row`);
  }
  assertEntityUpdateBranch(entityUpdate.thenStatement, "brokerage_cases", "case");
  assertEntityUpdateBranch(partyUpdate.thenStatement, "clients", "party");
  assertEntityUpdateBranch(partyUpdate.elseStatement, "properties", "property");

  const auditQueries = queries.filter((query) => /INSERT INTO audit_logs/.test(querySql(query, file)));
  assert.equal(auditQueries.length, 1, "one live awaited audit insert uses the transaction client");
  const auditQuery = auditQueries[0];
  assert.equal(
    normalizedSql(auditQuery, file),
    "INSERT INTO audit_logs ( id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",
    "audit insert preserves the frozen column and placeholder order",
  );
  const auditArgs = auditQuery.arguments[1];
  assert(ts.isArrayLiteralExpression(auditArgs) && auditArgs.elements.length === 9, "audit insert uses nine direct parameters");
  const auditArgText = auditArgs.elements.map((element) => element.getText(file));
  assert.deepEqual(auditArgText, [
    'genId("audit")',
    "scopeTenantId",
    "input.userId",
    "input.userId",
    'input.status === "archived" ? "record_archived" : "record_restored"',
    'input.entityType === "party" ? "client" : input.entityType',
    "input.entityId",
    'input.status === "archived" ? "记录已归档。" : "记录已恢复。"',
    "JSON.stringify({})",
  ], "audit parameters bind id, tenant, user, actor, action, target, message and context");
  for (const status of ["archived", "active"]) {
    const context = { status, entityType: "case", entityId: "record", userId: "actor" };
    assert.equal(evaluateAuditExpression(auditArgs.elements[4], file, context), status === "archived" ? "record_archived" : "record_restored", `audit action maps ${status}`);
    assert.equal(evaluateAuditExpression(auditArgs.elements[7], file, context), status === "archived" ? "记录已归档。" : "记录已恢复。", `audit message maps ${status}`);
  }
  for (const entityType of ["case", "party", "property"]) {
    assert.equal(
      evaluateAuditExpression(auditArgs.elements[5], file, { status: "active", entityType, entityId: "record", userId: "actor" }),
      entityType === "party" ? "client" : entityType,
      `audit target type maps ${entityType}`,
    );
  }
  const auditStatement = callback.body.statements.find((statement) => statement.pos <= auditQuery.pos && statement.end >= auditQuery.end);
  assert(auditStatement, "audit insert belongs to a direct callback statement");
  const guardIndex = callback.body.statements.findIndex(
    (statement) => ts.isIfStatement(statement) && nodeText(statement.expression, file) === "!updatedRow",
  );
  const auditIndex = callback.body.statements.indexOf(auditStatement);
  assert(guardIndex >= 0 && guardIndex < auditIndex, "not-found guard must precede the live audit insert");
  const notFoundGuard = callback.body.statements[guardIndex];
  assert(ts.isIfStatement(notFoundGuard) && ts.isReturnStatement(notFoundGuard.thenStatement) && notFoundGuard.thenStatement.expression?.kind === ts.SyntaxKind.NullKeyword, "postgres not-found guard directly returns null");
  assertReachableStatement(callback.body, notFoundGuard, "not-found guard");
  assertReachableStatement(callback.body, auditStatement, "audit insert");
  assert(updateQueries.every((query) => query.pos < callback.body.statements[guardIndex].pos), "all updates precede not-found and audit");

  const mappingStatements = callback.body.statements.slice(auditIndex + 1);
  assert.equal(mappingStatements.length, 3, "audit is followed by the three direct result mappings");
  const [caseMap, partyMap, propertyMap] = mappingStatements;
  function assertConditionalMap(statement, conditionText, mapper, label) {
    assert(ts.isIfStatement(statement) && nodeText(statement.expression, file) === conditionText && !statement.elseStatement, `${label} mapper uses its exact direct condition`);
    assert(ts.isReturnStatement(statement.thenStatement) && statement.thenStatement.expression, `${label} mapper directly returns`);
    assert.equal(statement.thenStatement.expression.getText(file), `${mapper}(updatedRow)`, `${label} maps the shared updatedRow`);
    assertReachableStatement(callback.body, statement, `${label} mapping`);
  }
  assertConditionalMap(caseMap, 'input.entityType === "case"', "mapBrokerageCase", "case");
  assertConditionalMap(partyMap, 'input.entityType === "party"', "mapClient", "party");
  assert(ts.isReturnStatement(propertyMap) && propertyMap.expression?.getText(file) === "mapProperty(updatedRow)", "property is the final direct updatedRow mapping");
  assertReachableStatement(callback.body, propertyMap, "property mapping");
}

function assertFacade(text) {
  const file = parse(text, "data.ts");
  const declarations = file.statements
    .filter((statement) => ts.isVariableStatement(statement) && isExported(statement))
    .flatMap((statement) => [...statement.declarationList.declarations])
    .filter((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "setRecordLifecycleWithAudit");
  assert.equal(declarations.length, 1, "facade has one top-level exported composite binding");
  const declaration = declarations[0];
  assert.equal(declaration.type?.getText(file), "typeof memory.setRecordLifecycleWithAudit", "facade type stays bound to the memory contract");
  assert(declaration.initializer && ts.isArrowFunction(declaration.initializer), "facade initializer is one direct arrow");
  const arrow = declaration.initializer;
  assert.equal(arrow.parameters.length, 1);
  assert(arrow.parameters[0].dotDotDotToken && arrow.parameters[0].name.getText(file) === "args", "facade receives one rest args binding");
  assert(ts.isCallExpression(arrow.body) && arrow.body.expression.getText(file) === "repo.setRecordLifecycleWithAudit", "facade live expression delegates to selected repo");
  assert.equal(arrow.body.arguments.length, 1);
  assert(ts.isSpreadElement(arrow.body.arguments[0]) && arrow.body.arguments[0].expression.getText(file) === "args", "facade forwards the complete args tuple");
}

function assertAction(text) {
  const file = parse(text, "actions.ts");
  const fn = findExportedFunction(file, "setRecordLifecycleAction");
  const statements = [...fn.body.statements];
  assert(statements.length > 0, "lifecycle action body must not be empty");
  const finalStatement = statements.at(-1);
  assert(ts.isExpressionStatement(finalStatement) && ts.isCallExpression(finalStatement.expression) && finalStatement.expression.expression.getText(file) === "redirect", "action ends in live redirect");
  statements.slice(0, -1).forEach((statement) => assert(!statementAlwaysTerminates(statement), "action redirect cannot follow an always-terminating path"));

  function declaration(name) {
    const matches = statements.filter(
      (statement) => ts.isVariableStatement(statement) && statement.declarationList.declarations.some((item) => ts.isIdentifier(item.name) && item.name.text === name),
    );
    assert.equal(matches.length, 1, `action has one live ${name} declaration`);
    return matches[0].declarationList.declarations.find((item) => ts.isIdentifier(item.name) && item.name.text === name);
  }
  const session = declaration("session");
  assert(session.initializer && ts.isAwaitExpression(session.initializer), "session lookup is awaited");
  assert.match(session.initializer.expression.getText(file), /^requireTenantSession\(\{ permission: "record\.archive" \}\)$/, "session requires record.archive");

  const forbiddenCalls = descendants(fn.body, (node) => ts.isCallExpression(node) && node.expression.getText(file) === "rejectForbiddenRecordInput");
  assert.equal(forbiddenCalls.length, 1, "action keeps one forbidden-input validation");
  const forbiddenCall = forbiddenCalls[0];
  assert(ts.isAwaitExpression(forbiddenCall.parent) && forbiddenCall.parent.expression === forbiddenCall, "forbidden-input validation is awaited");
  assert.equal(forbiddenCall.arguments.length, 4, "forbidden-input validation receives four arguments");
  assert.equal(forbiddenCall.arguments[0].getText(file), "formData", "forbidden-input validation receives the live form data");
  assert.equal(forbiddenCall.arguments[1].getText(file), "session", "forbidden-input validation receives the authorized session");
  for (const [entityType, expectedRecordType] of [["case", "case"], ["party", "client"], ["property", "property"]]) {
    assert.equal(
      evaluateValidationExpression(forbiddenCall.arguments[2], file, { entityType }),
      expectedRecordType,
      `forbidden-input validation maps ${entityType} to ${expectedRecordType}`,
    );
  }
  assert.equal(forbiddenCall.arguments[3].getText(file), "entityId || undefined", "forbidden-input validation receives the validated entity id when present");
  assertReachableFromCallback(forbiddenCall, { body: fn.body }, file);
  const forbiddenStatement = directStatement(fn.body, forbiddenCall);
  assertReachableStatement(fn.body, forbiddenStatement, "forbidden-input validation");

  const entityGuard = statements.find(
    (statement) => ts.isIfStatement(statement) && nodeText(statement.expression, file) === 'entityType === "case"',
  );
  assert(entityGuard, "action keeps one live entity guard chain");
  const forbiddenIndex = statements.indexOf(forbiddenStatement);
  const entityGuardIndex = statements.indexOf(entityGuard);
  const validationGuards = statements.slice(forbiddenIndex + 1, entityGuardIndex).filter(
    (statement) => ts.isIfStatement(statement) && Boolean(directThrow(statement.thenStatement)),
  );
  assert.equal(validationGuards.length, 1, "action has one direct invalid-input guard before entity authorization");
  const validationGuard = validationGuards[0];
  assertReachableStatement(fn.body, validationGuard, "invalid-input guard");
  assert(forbiddenIndex < statements.indexOf(validationGuard) && statements.indexOf(validationGuard) < entityGuardIndex, "invalid-input guard follows forbidden validation and precedes entity authorization");
  const validEntities = ["case", "party", "property"];
  const validStatuses = ["archived", "active"];
  for (const entityType of validEntities) {
    for (const statusRaw of validStatuses) {
      assert.equal(evaluateValidationExpression(validationGuard.expression, file, { entityType, entityId: "record-1", statusRaw }), false, `${entityType}/${statusRaw}/non-empty id passes input validation`);
    }
  }
  for (const [label, context] of [
    ["unknown entity", { entityType: "quote", entityId: "record-1", statusRaw: "archived" }],
    ["empty id", { entityType: "case", entityId: "", statusRaw: "archived" }],
    ["invalid status", { entityType: "case", entityId: "record-1", statusRaw: "removed" }],
  ]) {
    assert.equal(evaluateValidationExpression(validationGuard.expression, file, context), true, `${label} is rejected by input validation`);
  }
  assertReachableStatement(fn.body, entityGuard, "entity guard chain");
  assert(ts.isBlock(entityGuard.thenStatement), "case guard uses the case branch");
  const partyGuard = entityGuard.elseStatement;
  assert(partyGuard && ts.isIfStatement(partyGuard) && nodeText(partyGuard.expression, file) === 'entityType === "party"', "party guard uses the else-if branch");
  assert(ts.isBlock(partyGuard.thenStatement), "party guard branch is explicit");
  assert(partyGuard.elseStatement && ts.isBlock(partyGuard.elseStatement), "property guard uses the final else branch");
  function directGuardCalls(branch, expected) {
    const calls = descendants(branch, (node) => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["requireWritableCase", "ensureClientOwnership", "ensurePropertyOwnership"].includes(node.expression.text));
    assert.deepEqual(calls.map((call) => call.expression.text), [expected], `${expected} is bound to its correct entity branch`);
    return calls[0];
  }
  const guardCalls = [
    directGuardCalls(entityGuard.thenStatement, "requireWritableCase"),
    directGuardCalls(partyGuard.thenStatement, "ensureClientOwnership"),
    directGuardCalls(partyGuard.elseStatement, "ensurePropertyOwnership"),
  ];
  const expectedGuardArguments = {
    requireWritableCase: ["session", "entityId"],
    ensureClientOwnership: ["entityId", "session"],
    ensurePropertyOwnership: ["entityId", "session"],
  };
  guardCalls.forEach((call) => {
    assert(ts.isAwaitExpression(call.parent) && call.parent.expression === call, `${call.expression.text} remains awaited`);
    assert.deepEqual(call.arguments.map((argument) => argument.getText(file)), expectedGuardArguments[call.expression.text], `${call.expression.text} receives the validated id and authorized session in order`);
    assertReachableFromCallback(call, { body: fn.body }, file);
    assertReachableThroughBlocks(call, { body: fn.body }, `${call.expression.text} guard`);
  });

  const updated = declaration("updated");
  assert(updated.initializer && ts.isAwaitExpression(updated.initializer), "composite lifecycle write is awaited");
  const composite = updated.initializer.expression;
  assert(ts.isCallExpression(composite) && composite.expression.getText(file) === "setRecordLifecycleWithAudit", "action uses the composite primitive directly");
  assert.equal(composite.arguments.length, 1);
  const input = composite.arguments[0];
  assert(ts.isObjectLiteralExpression(input), "composite receives a direct object argument");
  const actualProperties = Object.fromEntries(input.properties.map((property) => {
    if (ts.isShorthandPropertyAssignment(property)) return [property.name.text, property.name.text];
    assert(ts.isPropertyAssignment(property) && ts.isIdentifier(property.name), "composite input uses explicit properties");
    return [property.name.text, property.initializer.getText(file)];
  }));
  assert.deepEqual(actualProperties, {
    tenantId: "session.tenant.id",
    userId: "session.user.id",
    entityType: "entityType",
    entityId: "entityId",
    status: "status",
    archivedById: "session.user.id",
  }, "composite receives the validated tenant, actor, entity and lifecycle values");
  const compositeStatement = directStatement(fn.body, updated);
  assertReachableStatement(fn.body, compositeStatement, "composite lifecycle write");

  const nullGuard = statements.find((statement) => ts.isIfStatement(statement) && nodeText(statement.expression, file) === "!updated");
  assert(nullGuard, "action keeps not-found guard after composite write");
  assert(directThrow(nullGuard.thenStatement), "action not-found guard directly throws");
  const nullGuardIndex = statements.indexOf(nullGuard);
  assert(statements.indexOf(compositeStatement) < nullGuardIndex, "composite write precedes not-found guard");
  assertReachableStatement(fn.body, nullGuard, "not-found guard");

  const revalidations = statements.filter(
    (statement) => ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) && statement.expression.expression.getText(file) === "revalidatePath",
  );
  assert.deepEqual(revalidations.map((statement) => statement.expression.arguments[0]?.getText(file)), ['"/organize-center"', '"/parties"', '"/properties"', '"/"'], "action preserves four ordered revalidations");
  revalidations.forEach((statement) => {
    assert(nullGuardIndex < statements.indexOf(statement) && statements.indexOf(statement) < statements.indexOf(finalStatement), "revalidation stays after success guard and before redirect");
    assertReachableStatement(fn.body, statement, "revalidation");
  });
  assert.equal(finalStatement.expression.arguments.length, 1, "redirect receives one destination");
  const withFlashCall = finalStatement.expression.arguments[0];
  assert(ts.isCallExpression(withFlashCall) && withFlashCall.expression.getText(file) === "withFlash" && withFlashCall.arguments.length === 2, "redirect uses the live success flash wrapper");
  const safeReturnCall = withFlashCall.arguments[0];
  assert(ts.isCallExpression(safeReturnCall) && safeReturnCall.expression.getText(file) === "safeReturnTo" && safeReturnCall.arguments.length === 2, "redirect normalizes returnTo through safeReturnTo");
  const formGet = safeReturnCall.arguments[0];
  assert(ts.isCallExpression(formGet) && formGet.expression.getText(file) === "formData.get" && formGet.arguments[0]?.getText(file) === '"returnTo"', "redirect reads the returnTo form field");
  assert.equal(safeReturnCall.arguments[1]?.getText(file), '"/organize-center"', "redirect uses organize-center as safe fallback");
  const flashExpression = withFlashCall.arguments[1];
  for (const statusValue of ["archived", "active"]) {
    assert.equal(
      evaluateAuditExpression(flashExpression, file, { status: statusValue }),
      statusValue === "archived" ? "record_archived" : "record_restored",
      `redirect flash maps ${statusValue}`,
    );
  }

  const liveCalls = descendants(fn.body, (node) => ts.isCallExpression(node) && node.expression.getText(file) === "setRecordLifecycleWithAudit");
  assert.equal(liveCalls.length, 1, "action has one live composite call");
  const actionCalls = allDescendants(fn.body, (node) => ts.isCallExpression(node));
  actionCalls.forEach((call) => assertReachableFromCallback(call, { body: fn.body }, file));
  function actionCallee(call) {
    if (ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === "trim") return "trim";
    return call.expression.getText(file);
  }
  assert.deepEqual(actionCalls.map(actionCallee).sort(), [
    "String", "String", "String",
    "ensureClientOwnership",
    "ensurePropertyOwnership",
    "formData.get", "formData.get", "formData.get", "formData.get",
    "isLifecycleStatus",
    "redirect",
    "rejectForbiddenRecordInput",
    "requireTenantSession",
    "requireWritableCase",
    "revalidatePath", "revalidatePath", "revalidatePath", "revalidatePath",
    "safeReturnTo",
    "setRecordLifecycleWithAudit",
    "trim",
    "withFlash",
  ].sort(), "action calls only the frozen session, validation, entity guard, composite, revalidation and redirect allowlist");
  const splitWriterNames = new Set(["addAuditLog", "setBrokerageCaseLifecycleStatus", "setClientLifecycleStatus", "setPropertyLifecycleStatus"]);
  const splitWriterReferences = allDescendants(fn.body, (node) => ts.isIdentifier(node) && splitWriterNames.has(node.text));
  assert.equal(splitWriterReferences.length, 0, "action cannot directly, indirectly or through an alias reference split lifecycle/audit writers");
  const actionMutations = allDescendants(fn.body, isMutationExpression);
  assert.equal(actionMutations.length, 0, "action performs no assignment, compound, increment, delete or destructuring mutation of its authorized inputs");
  assert(ts.isAwaitExpression(liveCalls[0].parent) && liveCalls[0].parent.expression === liveCalls[0], "action's unique composite write is directly awaited");
}

function assertAll(candidate = source) {
  assertMemory(candidate.memory);
  assertPostgres(candidate.postgres);
  assertFacade(candidate.facade);
  assertAction(candidate.actions);
}

assertAll();

const postgresBody = functionBody(source.postgres, "setRecordLifecycleWithAudit");
const memoryBody = functionBody(source.memory, "setRecordLifecycleWithAudit");
const actionBody = functionBody(source.actions, "setRecordLifecycleAction");
const escapedTransaction = postgresBody.replace("await client.query(\n      `INSERT INTO audit_logs", "await getPool().query(\n      `INSERT INTO audit_logs");
assert.notEqual(escapedTransaction, postgresBody, "postgres escape mutation must hit");
assert.throws(() => assertPostgres(escapedTransaction), /one live awaited audit insert|every database call uses the transaction client/);

const earlyReturn = postgresBody.replace("  await ensureSchema();", "  if (true) return null;\n  await ensureSchema();");
assert.notEqual(earlyReturn, postgresBody, "postgres early-return mutation must hit");
assert.throws(() => assertPostgres(earlyReturn), /always-terminating|only schema setup/);

const deadHelper = postgresBody
  .replace("  return withTransaction(async (client) => {", "  const dead = () => withTransaction(async (client) => {")
  .replace(/\n  \}\);\n\}$/, "\n  });\n  return null;\n}");
assert.notEqual(deadHelper, postgresBody, "postgres dead-helper mutation must hit");
assert.throws(() => assertPostgres(deadHelper), /only schema setup|final statement must return transaction|withTransaction directly/);

const wrongBranchClient = postgresBody.replace("const updateResult = await client.query(", "const updateResult = await getPool().query(");
assert.notEqual(wrongBranchClient, postgresBody, "postgres wrong-branch client mutation must hit");
assert.throws(() => assertPostgres(wrongBranchClient), /three entity branches|every database call uses the transaction client/);

const falseTransaction = postgresBody.replace("return withTransaction(async (client) => {", "return false && withTransaction(async (client) => {");
assert.notEqual(falseTransaction, postgresBody, "postgres false-transaction mutation must hit");
assert.throws(() => assertPostgres(falseTransaction), /withTransaction directly/);

const outerWrite = 'await getPool().query("UPDATE audit_logs SET message = message WHERE target_id = $1", [input.entityId]);';
for (const [label, insertion] of [
  ["direct outer write", `\n  ${outerWrite}`],
  ["live outer helper", `\n  const writeOutsideTransaction = async () => getPool().query("UPDATE audit_logs SET message = message WHERE target_id = $1", [input.entityId]);\n  await writeOutsideTransaction();`],
]) {
  const mutated = postgresBody.replace("  await ensureSchema();", `  await ensureSchema();${insertion}`);
  assert.notEqual(mutated, postgresBody, `postgres ${label} mutation must hit`);
  assert.throws(() => assertPostgres(mutated), /only schema setup|exactly three lifecycle updates|transaction client/);
}

for (const [label, insertion] of [
  ["getPool element access", '    await getPool()["query"]("UPDATE audit_logs SET message = message WHERE target_id = $1", [input.entityId]);'],
  ["extra client element access", '    await client["query"]("UPDATE audit_logs SET message = message WHERE target_id = $1", [input.entityId]);'],
  ["nested helper element escape", '    const deadElementWrite = async () => getPool()["query"]("UPDATE audit_logs SET message = message WHERE target_id = $1", [input.entityId]);'],
  ["aliased pool escape", '    const pool = getPool();\n    await pool.query("UPDATE audit_logs SET message = message WHERE target_id = $1", [input.entityId]);'],
]) {
  const mutated = postgresBody.replace("    let updatedRow: Record<string, unknown> | undefined;", `    let updatedRow: Record<string, unknown> | undefined;\n${insertion}`);
  assert.notEqual(mutated, postgresBody, `postgres ${label} mutation must hit`);
  assert.throws(() => assertPostgres(mutated), /exactly three lifecycle updates|direct property access|transaction client|directly awaited|cannot reference or alias getPool/);
}

const legacyWriterCall = "setPropertyLifecycleStatus({ tenantId: scopeTenantId, propertyId: input.entityId, status: input.status, archivedById: input.archivedById })";
for (const [label, insertion] of [
  ["legacy setter", `    await ${legacyWriterCall};`],
  ["split audit writer", '    await addAuditLog({ tenantId: scopeTenantId, userId: input.userId, actorId: input.userId, action: "record_archived", targetType: "property", targetId: input.entityId, message: "wrong" });'],
  ["unknown writer", "    await writeRecordOutsideTransaction(input);"],
  ["nested writer", `    const hiddenWriter = async () => ${legacyWriterCall};\n    await hiddenWriter();`],
  ["aliased writer", `    const escapedWriter = setPropertyLifecycleStatus;\n    await escapedWriter({ tenantId: scopeTenantId, propertyId: input.entityId, status: input.status });`],
]) {
  const mutated = postgresBody.replace("    let updatedRow: Record<string, unknown> | undefined;", `    let updatedRow: Record<string, unknown> | undefined;\n${insertion}`);
  assert.notEqual(mutated, postgresBody, `postgres ${label} mutation must hit`);
  assert.throws(() => assertPostgres(mutated), /cannot hide in a nested helper|transaction callback calls only/);
}

const postgresMutationFile = parse(postgresBody, "postgres-mutation.ts");
const postgresMutationFunction = findExportedFunction(postgresMutationFile, "setRecordLifecycleWithAudit");
const transactionReturnText = postgresMutationFunction.body.statements.at(-1).getText(postgresMutationFile);
const deadCorrectLiveOuterWrite = postgresBody.replace(
  transactionReturnText,
  `const deadCorrectTransaction = async () => { ${transactionReturnText} };\n  return getPool().query("UPDATE audit_logs SET message = message WHERE target_id = $1", [input.entityId]);`,
);
assert.notEqual(deadCorrectLiveOuterWrite, postgresBody, "postgres dead-correct live-outer-write mutation must hit");
assert.throws(() => assertPostgres(deadCorrectLiveOuterWrite), /only schema setup|final statement must return transaction|transaction client/);

const swappedUpdateBranches = postgresBody
  .replace('if (input.entityType === "case") {', 'if (input.entityType === "__swap__") {')
  .replace('} else if (input.entityType === "party") {', '} else if (input.entityType === "case") {')
  .replace('if (input.entityType === "__swap__") {', 'if (input.entityType === "party") {');
assert.notEqual(swappedUpdateBranches, postgresBody, "postgres swapped update branches mutation must hit");
assert.throws(() => assertPostgres(swappedUpdateBranches), /live case branch|case update branch is a direct block/);

for (const [label, original, replacement] of [
  ["false case condition", 'if (input.entityType === "case") {', "if (false) {"],
  ["wrong case table", "UPDATE brokerage_cases", "UPDATE clients"],
  ["dead case query helper", "const updateResult = await client.query(", "const deadUpdate = async () => client.query("],
  ["fallback table", "UPDATE properties", "UPDATE clients"],
  ["wrong shared row", "updatedRow = updateResult.rows[0];", "updatedRow = updateResult.rows[1];"],
]) {
  const mutated = postgresBody.replace(original, replacement);
  assert.notEqual(mutated, postgresBody, `postgres ${label} mutation must hit`);
  assert.throws(() => assertPostgres(mutated), /directly awaited|live query cannot hide|three entity branches|entity tables|lifecycle SQL|live case branch|update branch|awaits the transaction client|targets|assigns the query result row/);
}

const callbackEarlyReturn = postgresBody.replace("return withTransaction(async (client) => {", "return withTransaction(async (client) => {\n    if (true) return null;");
assert.notEqual(callbackEarlyReturn, postgresBody, "callback early-return mutation must hit");
assert.throws(() => assertPostgres(callbackEarlyReturn), /cannot follow an always-terminating/);

const branchEarlyReturn = postgresBody.replace("      const updateResult = await client.query(", "      if (true) return null;\n      const updateResult = await client.query(");
assert.notEqual(branchEarlyReturn, postgresBody, "branch early-return mutation must hit");
assert.throws(() => assertPostgres(branchEarlyReturn), /lifecycle update cannot follow an always-terminating/);

const auditEarlyThrow = postgresBody.replace("    await client.query(\n      `INSERT INTO audit_logs", "    if (true) throw new Error(\"stop\");\n    await client.query(\n      `INSERT INTO audit_logs");
assert.notEqual(auditEarlyThrow, postgresBody, "audit early-throw mutation must hit");
assert.throws(() => assertPostgres(auditEarlyThrow), /audit insert cannot follow an always-terminating/);

const postgresNullGuard = "if (!updatedRow) return null;";
assert(postgresBody.includes(postgresNullGuard), "postgres not-found mutation source must exist");
for (const [label, replacement] of [
  ["object", "if (!updatedRow) return {};"],
  ["undefined", "if (!updatedRow) return undefined;"],
  ["reverse", "if (updatedRow) return null;"],
  ["dead correct live wrong", `const deadNullGuard = () => { ${postgresNullGuard} };\n    if (!updatedRow) return {};`],
]) {
  const mutated = postgresBody.replace(postgresNullGuard, replacement);
  assert.notEqual(mutated, postgresBody, `postgres not-found ${label} mutation must hit`);
  assert.throws(() => assertPostgres(mutated), /not-found guard|directly returns null/);
}

for (const [label, original, replacement] of [
  ["case owner tautology", "current_owner_user_id = $2", "$2 = $2"],
  ["case resolved drop", "\n            AND owner_resolution_status = 'resolved'", ""],
  ["property tenant tautology", "WHERE id = $1 AND tenant_id = $2\n          RETURNING *`,\n        [input.entityId, scopeTenantId", "WHERE id = $1 AND $2 = $2\n          RETURNING *`,\n        [input.entityId, scopeTenantId"],
  ["case owner tenant args swap", "[input.entityId, input.userId, scopeTenantId, input.status", "[input.entityId, scopeTenantId, input.userId, input.status"],
  ["property status archive args swap", "[input.entityId, scopeTenantId, input.status, input.archivedById ?? null]", "[input.entityId, scopeTenantId, input.archivedById ?? null, input.status]"],
]) {
  const mutated = postgresBody.replace(original, replacement);
  assert.notEqual(mutated, postgresBody, `postgres ${label} mutation must hit`);
  assert.throws(() => assertPostgres(mutated), /lifecycle SQL preserves|lifecycle parameters preserve/);
}

for (const [label, original, replacement] of [
  ["flash reverse", 'status === "archived" ? "record_archived" : "record_restored"', 'status === "archived" ? "record_restored" : "record_archived"'],
  ["unsafe return", 'safeReturnTo(formData.get("returnTo"), "/organize-center")', 'String(formData.get("returnTo") ?? "/organize-center")'],
  ["wrong fallback", 'safeReturnTo(formData.get("returnTo"), "/organize-center")', 'safeReturnTo(formData.get("returnTo"), "/")'],
  ["wrong form key", 'safeReturnTo(formData.get("returnTo"), "/organize-center")', 'safeReturnTo(formData.get("next"), "/organize-center")'],
]) {
  const mutated = actionBody.replace(original, replacement);
  assert.notEqual(mutated, actionBody, `action redirect ${label} mutation must hit`);
  assert.throws(() => assertAction(mutated), /normalizes returnTo|returnTo form field|safe fallback|redirect flash maps/);
}

const correctRedirect = actionBody.match(/  redirect\(withFlash\([\s\S]*?\n  \)\);/)?.[0];
assert(correctRedirect, "action live redirect mutation source exists");
const deadCorrectRedirect = actionBody.replace(correctRedirect, `  const deadRedirect = () => { ${correctRedirect.trim()} };\n  redirect(withFlash("/", "record_archived"));`);
assert.notEqual(deadCorrectRedirect, actionBody, "action dead-correct redirect mutation must hit");
assert.throws(() => assertAction(deadCorrectRedirect), /normalizes returnTo/);

for (const [label, original, replacement] of [
  ["archivedAt retain", 'archivedAt: input.status === "archived" ? nowDate : undefined', 'archivedAt: input.status === "archived" ? item.archivedAt : undefined'],
  ["case archivedBy fallback", 'archivedById: input.status === "archived" ? input.archivedById ?? input.userId : undefined', 'archivedById: input.status === "archived" ? input.archivedById : undefined'],
  ["case updatedAt drop", "      updatedAt: nowDate,", ""],
  ["property archivedBy wrong fallback", 'archivedById: input.status === "archived" ? input.archivedById : undefined', 'archivedById: input.status === "archived" ? input.userId : undefined'],
  ["audit wrong actor", "    actorId: input.userId,", "    actorId: input.entityId,"],
  ["audit action reverse", 'action: input.status === "archived" ? "record_archived" : "record_restored"', 'action: input.status === "archived" ? "record_restored" : "record_archived"'],
  ["audit target reverse", 'input.entityType === "party" ? "client" : input.entityType', 'input.entityType === "case" ? "client" : input.entityType'],
]) {
  const mutated = memoryBody.replace(original, replacement);
  assert.notEqual(mutated, memoryBody, `memory ${label} mutation must hit`);
  assert.throws(() => assertMemory(mutated), /updated object has only|cannot override identity|preserves lifecycle metadata|memory audit log binds|memory target type maps/);
}

for (const [label, original, replacement] of [
  ["case party mapper swap", "return mapBrokerageCase(updatedRow);\n    if (input.entityType === \"party\") return mapClient(updatedRow);", "return mapClient(updatedRow);\n    if (input.entityType === \"party\") return mapBrokerageCase(updatedRow);"],
  ["case condition false", 'if (input.entityType === "case") return mapBrokerageCase(updatedRow);', 'if (false) return mapBrokerageCase(updatedRow);'],
  ["mapping early return", 'if (input.entityType === "case") return mapBrokerageCase(updatedRow);', 'if (true) return mapProperty(updatedRow);\n    if (input.entityType === "case") return mapBrokerageCase(updatedRow);'],
  ["case mapper dead helper", 'if (input.entityType === "case") return mapBrokerageCase(updatedRow);', 'if (input.entityType === "case") { const dead = () => mapBrokerageCase(updatedRow); return mapProperty(updatedRow); }'],
]) {
  const mutated = postgresBody.replace(original, replacement);
  assert.notEqual(mutated, postgresBody, `postgres ${label} mutation must hit`);
  assert.throws(() => assertPostgres(mutated), /live query cannot hide|transaction callback calls only|three direct result mappings|exact direct condition|mapper directly returns|maps the shared updatedRow|final direct updatedRow mapping/);
}

for (const [label, original, replacement] of [
  ["tenant", "        scopeTenantId,\n        input.userId,\n        input.userId,", "        input.entityId,\n        input.userId,\n        input.userId,"],
  ["actor", "        input.userId,\n        input.userId,\n        input.status ===", "        input.userId,\n        input.entityId,\n        input.status ==="],
  ["target id", "        input.entityId,\n        input.status === \"archived\" ? \"记录已归档。\"", "        input.userId,\n        input.status === \"archived\" ? \"记录已归档。\""],
  ["action reverse", 'input.status === "archived" ? "record_archived" : "record_restored"', 'input.status === "archived" ? "record_restored" : "record_archived"'],
  ["message reverse", 'input.status === "archived" ? "记录已归档。" : "记录已恢复。"', 'input.status === "archived" ? "记录已恢复。" : "记录已归档。"'],
  ["column order", "tenant_id, user_id, actor_id, action", "tenant_id, actor_id, user_id, action"],
]) {
  const mutated = postgresBody.replace(original, replacement);
  assert.notEqual(mutated, postgresBody, `postgres audit ${label} mutation must hit`);
  assert.throws(() => assertPostgres(mutated), /audit insert preserves|audit parameters bind|audit action maps|audit message maps/);
}

const facadeLine = "export const setRecordLifecycleWithAudit: typeof memory.setRecordLifecycleWithAudit = (...args) =>\n  repo.setRecordLifecycleWithAudit(...args);";
assert(source.facade.includes(facadeLine), "facade mutation source must exist");
const facadeMemoryDelegate = source.facade.replace(facadeLine, `${facadeLine.replace("repo.setRecordLifecycleWithAudit", "memory.setRecordLifecycleWithAudit")}\n/* ${facadeLine} */`);
assert.throws(() => assertFacade(facadeMemoryDelegate), /delegates to selected repo/);

const facadeWrongArgs = source.facade.replace("repo.setRecordLifecycleWithAudit(...args);", "repo.setRecordLifecycleWithAudit(args[0]);");
assert.notEqual(facadeWrongArgs, source.facade, "facade wrong-args mutation must hit");
assert.throws(() => assertFacade(facadeWrongArgs), /forwards the complete args tuple/);

const facadeFalseConditional = source.facade.replace("repo.setRecordLifecycleWithAudit(...args);", "false ? repo.setRecordLifecycleWithAudit(...args) : repo.setClientLifecycleStatus(...args);");
assert.notEqual(facadeFalseConditional, source.facade, "facade false-conditional mutation must hit");
assert.throws(() => assertFacade(facadeFalseConditional), /live expression delegates/);

const facadeDeadBinding = source.facade.replace(facadeLine, `const deadAtomicDelegate = ${facadeLine.split("= ").slice(1).join("= ")}\nexport const setRecordLifecycleWithAudit: typeof memory.setRecordLifecycleWithAudit = (...args) => repo.setClientLifecycleStatus(...args);`);
assert.notEqual(facadeDeadBinding, source.facade, "facade dead-binding mutation must hit");
assert.throws(() => assertFacade(facadeDeadBinding), /delegates to selected repo/);

const splitAction = actionBody.replace("setRecordLifecycleWithAudit({", "setClientLifecycleStatus({");
assert.notEqual(splitAction, actionBody, "action split mutation must hit");
assert.throws(() => assertAction(splitAction), /composite primitive|split lifecycle/);

const actionEarlyReturn = actionBody.replace("export async function setRecordLifecycleAction(formData: FormData) {", "export async function setRecordLifecycleAction(formData: FormData) {\n  if (true) return;");
assert.notEqual(actionEarlyReturn, actionBody, "action early-return mutation must hit");
assert.throws(() => assertAction(actionEarlyReturn), /always-terminating/);

const actionUnawaited = actionBody.replace("const updated = await setRecordLifecycleWithAudit({", "const updated = setRecordLifecycleWithAudit({");
assert.notEqual(actionUnawaited, actionBody, "action unawaited mutation must hit");
assert.throws(() => assertAction(actionUnawaited), /composite lifecycle write is awaited/);

const actionWrongArgument = actionBody.replace("    entityId,", '    entityId: "wrong",');
assert.notEqual(actionWrongArgument, actionBody, "action wrong-argument mutation must hit");
assert.throws(() => assertAction(actionWrongArgument), /validated tenant, actor, entity/);

const actionFalseBranch = actionBody.replace("const updated = await setRecordLifecycleWithAudit({", "const updated = false && await setRecordLifecycleWithAudit({");
assert.notEqual(actionFalseBranch, actionBody, "action false-branch mutation must hit");
assert.throws(() => assertAction(actionFalseBranch), /composite lifecycle write is awaited/);

const actionCompositeStatement = actionBody.match(/  const updated = await setRecordLifecycleWithAudit\(\{[\s\S]*?\n  \}\);/)?.[0];
assert(actionCompositeStatement, "action dead-helper mutation source must exist");
const actionDeadHelper = actionBody.replace(actionCompositeStatement, `  const dead = async () => ${actionCompositeStatement.trimStart().replace("const updated = ", "")};\n  const updated = null;`);
assert.notEqual(actionDeadHelper, actionBody, "action dead-helper mutation must hit");
assert.throws(() => assertAction(actionDeadHelper), /composite lifecycle write is awaited/);

const validationCondition = '!(entityType === "case" || entityType === "party" || entityType === "property") || !entityId || !isLifecycleStatus(statusRaw)';
const validationStatement = `if (${validationCondition}) {\n    throw new Error("归档对象或状态无效。");\n  }`;
assert(actionBody.includes(validationStatement), "action input-validation mutation source must exist");
for (const [label, mutated] of [
  ["drop empty id", actionBody.replace(" || !entityId ||", " ||")],
  ["reverse status", actionBody.replace("!isLifecycleStatus(statusRaw)", "isLifecycleStatus(statusRaw)")],
  ["constant false guard", actionBody.replace(`if (${validationCondition}) {`, "if (false) {")],
  ["dead guard", actionBody.replace(validationStatement, `if (false) {\n    ${validationStatement.replaceAll("\n", "\n    ")}\n  }`)],
  ["wrong status predicate", actionBody.replace("isLifecycleStatus(statusRaw)", "isLifecycleStatus(entityId)")],
  ["drop property entity", actionBody.replace(validationCondition, validationCondition.replace(' || entityType === "property"', ""))],
]) {
  assert.notEqual(mutated, actionBody, `action validation ${label} mutation must hit`);
  assert.throws(() => assertAction(mutated), /invalid-input guard|passes input validation|is rejected by input validation|unsupported validation expression/);
}

for (const [label, original] of [
  ["forbidden", "await rejectForbiddenRecordInput("],
  ["case", "await requireWritableCase("],
  ["party", "await ensureClientOwnership("],
  ["property", "await ensurePropertyOwnership("],
]) {
  const mutated = actionBody.replace(original, `false && ${original}`);
  assert.notEqual(mutated, actionBody, `action ${label} false-dead mutation must hit`);
  assert.throws(() => assertAction(mutated), /false &&|constant-dead|correct entity branch/);
}

for (const [label, original, replacement] of [
  ["forbidden form data", "    formData,\n    session,", "    new FormData(),\n    session,"],
  ["forbidden session", "    formData,\n    session,", "    formData,\n    null,"],
  ["forbidden type map", 'entityType === "party" ? "client" : entityType === "property" ? "property" : "case"', 'entityType === "party" ? "case" : entityType === "property" ? "property" : "client"'],
  ["forbidden id fallback", "    entityId || undefined,", "    entityId,"],
  ["case guard order", "await requireWritableCase(session, entityId);", "await requireWritableCase(entityId, session);"],
  ["party guard wrong id", "await ensureClientOwnership(entityId, session);", 'await ensureClientOwnership("wrong-id", session);'],
  ["property guard wrong session", "await ensurePropertyOwnership(entityId, session);", "await ensurePropertyOwnership(entityId, null);"],
]) {
  const mutated = actionBody.replace(original, replacement);
  assert.notEqual(mutated, actionBody, `action argument ${label} mutation must hit`);
  assert.throws(() => assertAction(mutated), /forbidden-input validation receives|forbidden-input validation maps|validated entity id|validated id and authorized session/);
}

const deadCorrectPartyGuard = actionBody.replace(
  "await ensureClientOwnership(entityId, session);",
  'const deadCorrectGuard = async () => ensureClientOwnership(entityId, session);\n    await ensureClientOwnership("wrong-id", session);',
);
assert.notEqual(deadCorrectPartyGuard, actionBody, "action dead-correct live-wrong guard mutation must hit");
assert.throws(() => assertAction(deadCorrectPartyGuard), /bound to its correct entity branch|validated id and authorized session/);

for (const [label, insertion] of [
  ["aliased split audit", '  const escapedAuditWriter = addAuditLog;\n  await escapedAuditWriter({});'],
  ["unknown writer", "  await writeLifecycleOutsideComposite({ entityId });"],
  ["nested legacy writer", '  const nestedLegacyWriter = async () => setPropertyLifecycleStatus({ propertyId: entityId, status });'],
  ["aliased legacy writer", '  const escapedLegacyWriter = setClientLifecycleStatus;\n  await escapedLegacyWriter({ clientId: entityId, status });'],
]) {
  const mutated = actionBody.replace(actionCompositeStatement, `${actionCompositeStatement}\n${insertion}`);
  assert.notEqual(mutated, actionBody, `action ${label} mutation must hit`);
  assert.throws(() => assertAction(mutated), /live query cannot hide|action calls only|cannot directly, indirectly|unique composite write/);
}

const deadCorrectLiveSplit = actionBody.replace(
  actionCompositeStatement,
  `  const deadCorrectComposite = async () => { ${actionCompositeStatement.trim()} };\n  const updated = await addAuditLog({});`,
);
assert.notEqual(deadCorrectLiveSplit, actionBody, "action dead-correct live-split mutation must hit");
assert.throws(() => assertAction(deadCorrectLiveSplit), /live query cannot hide|composite primitive|action calls only|cannot directly, indirectly/);

for (const [label, mutation] of [
  ["tenant assignment", '  session.tenant.id = "tenant_other";'],
  ["user assignment", '  session.user.id = "user_other";'],
  ["element assignment", '  session["tenant"]["id"] = "tenant_other";'],
  ["destructuring assignment", '  ({ id: session.tenant.id } = { id: "tenant_other" });'],
  ["compound assignment", '  session.tenant.id += "_other";'],
  ["delete mutation", "  delete session.tenant.id;"],
]) {
  const mutated = actionBody.replace(actionCompositeStatement, `${mutation}\n${actionCompositeStatement}`);
  assert.notEqual(mutated, actionBody, `action ${label} mutation must hit`);
  assert.throws(() => assertAction(mutated), /performs no assignment, compound, increment, delete or destructuring mutation/);
}

const deadCorrectLiveSessionMutation = actionBody.replace(
  actionCompositeStatement,
  `  const deadCorrectIdentity = () => session.tenant.id;\n  session.tenant.id = "tenant_other";\n${actionCompositeStatement}`,
);
assert.notEqual(deadCorrectLiveSessionMutation, actionBody, "action dead-correct live-mutation source must hit");
assert.throws(() => assertAction(deadCorrectLiveSessionMutation), /live query cannot hide|performs no assignment, compound, increment, delete or destructuring mutation/);

const actionNullGuard = 'if (!updated) throw new Error("对象不存在或无权操作。");';
assert(actionBody.includes(actionNullGuard), "action not-found mutation source must exist");
for (const [label, replacement] of [
  ["empty", "if (!updated) {}"],
  ["nonthrow", "if (!updated) return;"],
  ["reverse", 'if (updated) throw new Error("对象不存在或无权操作。");'],
  ["dead correct live wrong", `const deadNullGuard = () => { ${actionNullGuard} };\n  if (!updated) {}`],
]) {
  const mutated = actionBody.replace(actionNullGuard, replacement);
  assert.notEqual(mutated, actionBody, `action not-found ${label} mutation must hit`);
  assert.throws(() => assertAction(mutated), /not-found guard|directly throws|always-terminating/);
}

const earlyMutation = memoryBody.replace('const auditId = makeId("audit");', 'item.lifecycleStatus = input.status;\n  const auditId = makeId("audit");');
assert.notEqual(earlyMutation, memoryBody, "memory early mutation must hit");
assert.throws(() => assertMemory(earlyMutation), /does not mutate/);

const memoryLegacyWriterCall = "setPropertyLifecycleStatus({ tenantId: scopeTenantId, propertyId: input.entityId, status: input.status, archivedById: input.archivedById })";
for (const [label, insertion] of [
  ["legacy setter", `  await ${memoryLegacyWriterCall};`],
  ["split audit", '  await addAuditLog({ tenantId: scopeTenantId, userId: input.userId, action: "record_archived", targetType: "property", targetId: input.entityId, message: "wrong" });'],
  ["unknown writer", "  await writeMemoryOutsideComposite(input);"],
  ["nested legacy writer", `  const nestedMemoryWriter = async () => ${memoryLegacyWriterCall};`],
  ["aliased legacy writer", `  const escapedMemoryWriter = setPropertyLifecycleStatus;\n  await escapedMemoryWriter({ tenantId: scopeTenantId, propertyId: input.entityId, status: input.status });`],
]) {
  const mutated = memoryBody.replace('  if (input.entityType === "case") {', `${insertion}\n\n  if (input.entityType === "case") {`);
  assert.notEqual(mutated, memoryBody, `memory ${label} mutation must hit`);
  assert.throws(() => assertMemory(mutated), /live query cannot hide|memory composite calls only|cannot directly, indirectly/);
}

for (const [label, insertion] of [
  ["direct audit assignment", "  db.auditLogs = [log, ...db.auditLogs];"],
  ["direct collection assignment", "  db.properties = [];"],
  ["element record assignment", '  item["lifecycleStatus"] = input.status;'],
  ["delete state", "  delete db.auditLogs[0];"],
  ["destructuring state", "  ({ auditLogs: db.auditLogs } = { auditLogs: [] });"],
]) {
  const mutated = memoryBody.replace('  if (input.entityType === "case") {', `${insertion}\n\n  if (input.entityType === "case") {`);
  assert.notEqual(mutated, memoryBody, `memory ${label} mutation must hit`);
  assert.throws(() => assertMemory(mutated), /exactly three state mutations|direct complete-state reference switch/);
}

const caseNextState = "const nextDb: DB = { ...db, brokerageCases, auditLogs: [log, ...db.auditLogs] };";
const caseReferenceSwitch = "_g.__brokerDb = nextDb;";
for (const [label, replacement] of [
  ["extra collection", "const nextDb: DB = { ...db, brokerageCases, auditLogs: [log, ...db.auditLogs], properties: [] };"],
  ["missing base state", "const nextDb: DB = { brokerageCases, auditLogs: [log, ...db.auditLogs] } as DB;"],
  ["wrong collection", "const nextDb: DB = { ...db, properties, auditLogs: [log, ...db.auditLogs] };"],
  ["replace audit history", "const nextDb: DB = { ...db, brokerageCases, auditLogs: [log] };"],
  ["wrong audit source", "const nextDb: DB = { ...db, brokerageCases, auditLogs: [log, ...nextDb.auditLogs] };"],
]) {
  const mutated = memoryBody.replace(caseNextState, replacement);
  assert.notEqual(mutated, memoryBody, `memory next-state ${label} mutation must hit`);
  assert.throws(() => assertMemory(mutated), /next state|complete DB|preserves every unaffected|preconstructed brokerageCases|prepends exactly one audit log|preserves the existing audit log/);
}

const deadCorrectLiveSplitMemory = memoryBody.replace(
  caseReferenceSwitch,
  `const deadCorrectCommit = () => { _g.__brokerDb = nextDb; };\n    await setBrokerageCaseLifecycleStatus({ tenantId: scopeTenantId, caseId: input.entityId, status: input.status, archivedById: input.archivedById });`,
);
assert.notEqual(deadCorrectLiveSplitMemory, memoryBody, "memory dead-correct live-split mutation must hit");
assert.throws(() => assertMemory(deadCorrectLiveSplitMemory), /live query cannot hide|memory composite calls only|cannot directly, indirectly|one direct database reference switch|exactly three state mutations/);

const deadCorrectLiveDirectWrite = memoryBody.replace(
  caseReferenceSwitch,
  `const deadCorrectCommit = () => { _g.__brokerDb = nextDb; };\n    db.brokerageCases = brokerageCases;\n    db.auditLogs = [log, ...db.auditLogs];`,
);
assert.notEqual(deadCorrectLiveDirectWrite, memoryBody, "memory dead-correct live-direct-write mutation must hit");
assert.throws(() => assertMemory(deadCorrectLiveDirectWrite), /live query cannot hide|exactly three state mutations|direct complete-state reference switch|one direct database reference switch/);

const deadCorrectLiveExpandedCommit = memoryBody.replace(
  caseNextState,
  `const deadCorrectState = () => ({ ...db, brokerageCases, auditLogs: [log, ...db.auditLogs] });\n    const nextDb: DB = { ...db, brokerageCases, auditLogs: [log, ...db.auditLogs], properties: [] };`,
);
assert.notEqual(deadCorrectLiveExpandedCommit, memoryBody, "memory dead-correct live-expanded commit mutation must hit");
assert.throws(() => assertMemory(deadCorrectLiveExpandedCommit), /memory composite calls only|next state has base DB, record collection and audit log properties/);

const caseCommit = `    const result = cloneBrokerageCase(updated);\n    ${caseNextState}\n    ${caseReferenceSwitch}`;
const caseCommitMoved = memoryBody.replace(caseCommit, `    ${caseNextState}\n    ${caseReferenceSwitch}\n    const result = cloneBrokerageCase(updated);`);
assert.notEqual(caseCommitMoved, memoryBody, "case commit-before-clone mutation must hit");
assert.throws(() => assertMemory(caseCommitMoved), /constructs result before commit/);

const commitThenThrow = memoryBody.replace("    _g.__brokerDb = nextDb;\n    return result;", "    _g.__brokerDb = nextDb;\n    throw new Error(\"after commit\");\n    return result;");
assert.notEqual(commitThenThrow, memoryBody, "post-commit throw mutation must hit");
assert.throws(() => assertMemory(commitThenThrow), /constructs only its frozen timestamp|followed only by return|returns the preconstructed/);

const deadCommit = memoryBody.replace("  _g.__brokerDb = nextDb;", "  if (false) _g.__brokerDb = nextDb;");
assert.notEqual(deadCommit, memoryBody, "dead property commit mutation must hit");
assert.throws(() => assertMemory(deadCommit), /one direct database reference switch|exactly three state mutations/);

for (const [label, original, replacement] of [
  ["case owner", "caseItem.currentOwnerUserId === input.userId &&\n        ", ""],
  ["case resolved", 'caseItem.ownerResolutionStatus === "resolved"', "true"],
  ["party owner", "client.currentOwnerUserId === input.userId &&\n        ", ""],
  ["party tenant", "client.tenantId === scopeTenantId", "client.tenantId === input.userId"],
  ["property tenant", "property.tenantId === scopeTenantId && ", ""],
  ["property id", "property.id === input.entityId", "property.id === input.userId"],
]) {
  const mutated = memoryBody.replace(original, replacement);
  assert.notEqual(mutated, memoryBody, `${label} predicate mutation must hit`);
  assert.throws(() => assertMemory(mutated), /lookup preserves/);
}

for (const [label, original, replacement] of [
  [
    "new holder on every reload",
    "_g.__brokerDbHolder ?? { current: _g.__brokerDb ?? cloneDb(_freshDb) }",
    "{ current: _g.__brokerDb ?? cloneDb(_freshDb) }",
  ],
  [
    "bridge reads a module snapshot",
    "get: () => dbHolder.current",
    "get: () => moduleDb",
  ],
  [
    "bridge writes a module snapshot",
    "dbHolder.current = nextDb;",
    "moduleDb = nextDb;",
  ],
  [
    "proxy reads a captured database",
    "Reflect.get(dbHolder.current, property)",
    "Reflect.get(moduleDb, property)",
  ],
  [
    "proxy writes a captured database",
    "Reflect.set(dbHolder.current, property, value)",
    "Reflect.set(moduleDb, property, value)",
  ],
]) {
  const mutated = source.memory.replace(original, replacement);
  assert.notEqual(mutated, source.memory, `memory shared-holder ${label} mutation must hit`);
  assert.throws(() => assertMemory(mutated), /unique global holder|shared current reference|shared holder current reference|get trap directly reads|set trap directly writes/);
}

const liveOwnKeys = "ownKeys: () => Reflect.ownKeys(dbHolder.current)";
for (const [label, replacement] of [
  ["filter", 'ownKeys: () => Reflect.ownKeys(dbHolder.current).filter((key) => key !== "tenantCreationRequests")'],
  ["concat", "ownKeys: () => Reflect.ownKeys(dbHolder.current).concat([])"],
  ["slice", "ownKeys: () => Reflect.ownKeys(dbHolder.current).slice()"],
  ["conditional dead correct", "ownKeys: () => false ? Reflect.ownKeys(dbHolder.current) : []"],
  ["comment correct live filter", 'ownKeys: () => Reflect.ownKeys(dbHolder.current).filter(Boolean) /* Reflect.ownKeys(dbHolder.current) */'],
]) {
  const mutated = source.memory.replace(liveOwnKeys, replacement);
  assert.notEqual(mutated, source.memory, `memory ownKeys ${label} mutation must hit`);
  assert.throws(() => assertMemory(mutated), /ownKeys trap returns exactly every key/);
}

for (const [label, original, replacement] of [
  [
    "conditional get",
    "get: (_target, property) => Reflect.get(dbHolder.current, property)",
    'get: (_target, property) => property === "tenantCreationRequests" ? [] : Reflect.get(dbHolder.current, property)',
  ],
  [
    "dead-correct live-wrong get",
    "get: (_target, property) => Reflect.get(dbHolder.current, property)",
    'get: (_target, property) => false ? Reflect.get(dbHolder.current, property) : undefined',
  ],
  [
    "conditional set",
    "set: (_target, property, value) => Reflect.set(dbHolder.current, property, value)",
    'set: (_target, property, value) => property === "tenantCreationRequests" ? true : Reflect.set(dbHolder.current, property, value)',
  ],
  [
    "filtered descriptor",
    "const descriptor = Reflect.getOwnPropertyDescriptor(dbHolder.current, property);",
    'const descriptor = property === "tenantCreationRequests" ? undefined : Reflect.getOwnPropertyDescriptor(dbHolder.current, property);',
  ],
  [
    "dead-correct descriptor",
    "const descriptor = Reflect.getOwnPropertyDescriptor(dbHolder.current, property);",
    "const descriptor = false ? Reflect.getOwnPropertyDescriptor(dbHolder.current, property) : undefined;",
  ],
]) {
  const mutated = source.memory.replace(original, replacement);
  assert.notEqual(mutated, source.memory, `memory proxy ${label} mutation must hit`);
  assert.throws(() => assertMemory(mutated), /get trap directly reads|set trap directly writes|descriptor trap directly reads/);
}

const caseMap = "db.brokerageCases.map((entry) => (entry.id === item.id ? updated : entry))";
for (const [label, replacement] of [
  ["always updated", "db.brokerageCases.map((entry) => (entry.id === item.id ? updated : updated))"],
  ["drop non-target", "db.brokerageCases.filter((entry) => entry.id === item.id).map((entry) => updated)"],
  ["filter target", "db.brokerageCases.filter((entry) => entry.id !== item.id).map((entry) => entry)"],
  ["reorder", "db.brokerageCases.map((entry) => (entry.id === item.id ? updated : entry)).reverse()"],
  ["dead correct live wrong", "false ? db.brokerageCases.map((entry) => (entry.id === item.id ? updated : entry)) : db.brokerageCases.map((entry) => updated)"],
]) {
  const mutated = memoryBody.replace(caseMap, replacement);
  assert.notEqual(mutated, memoryBody, `memory target-map ${label} mutation must hit`);
  assert.throws(() => assertMemory(mutated), /live query cannot hide|memory composite calls only|replacement maps the live|one direct entry callback|replaces only the target id/);
}

const caseUpdated = `const updated: BrokerageCase = {
      ...item,
      lifecycleStatus: input.status,
      archivedAt: input.status === "archived" ? nowDate : undefined,
      archivedById: input.status === "archived" ? input.archivedById ?? input.userId : undefined,
      updatedAt: nowDate,
    };`;
for (const [label, replacement] of [
  ["second spread and id restore", caseUpdated.replace("...item,", "...item,\n      ...db.brokerageCases[1],\n      id: item.id,")],
  ["wrong base", caseUpdated.replace("...item,", "...db.brokerageCases[1],")],
  ["extra business field", caseUpdated.replace("lifecycleStatus: input.status,", 'caseTitle: "wrong",\n      lifecycleStatus: input.status,')],
  ["identity override", caseUpdated.replace("lifecycleStatus: input.status,", "tenantId: input.userId,\n      lifecycleStatus: input.status,")],
  ["dead correct live wrong", `const deadCorrectUpdated = () => ({ ...item, lifecycleStatus: input.status, archivedAt: input.status === "archived" ? nowDate : undefined, archivedById: input.status === "archived" ? input.archivedById ?? input.userId : undefined, updatedAt: nowDate });
    ${caseUpdated.replace("...item,", "...db.brokerageCases[1],\n      id: item.id,")}`],
]) {
  const mutated = memoryBody.replace(caseUpdated, replacement);
  assert.notEqual(mutated, memoryBody, `memory updated-object ${label} mutation must hit`);
  assert.throws(() => assertMemory(mutated), /updated object has only|one and only source item spread|cannot merge another record|cannot override identity/);
}

const memoryLog = `const log: AuditLog = {
    id: auditId,
    tenantId: scopeTenantId,
    actorId: input.userId,
    userId: input.userId,
    action: input.status === "archived" ? "record_archived" : "record_restored",
    targetType,
    targetId: input.entityId,
    message: input.status === "archived" ? "记录已归档。" : "记录已恢复。",
    createdAt: nowDate,
  };`;
for (const [label, replacement] of [
  ["spread old audit", memoryLog.replace("id: auditId,", "id: auditId,\n    ...db.auditLogs[0],")],
  ["fixed id", memoryLog.replace("id: auditId,", 'id: "audit_fixed",')],
  ["duplicate id", memoryLog.replace("tenantId: scopeTenantId,", "id: auditId,\n    tenantId: scopeTenantId,")],
  ["extra field", memoryLog.replace("createdAt: nowDate,", 'createdAt: nowDate,\n    context: "wrong",')],
  ["dead correct live wrong", `const deadCorrectLog = () => (${memoryLog.slice(memoryLog.indexOf("{")).replace(/;$/, "")});\n  ${memoryLog.replace("id: auditId,", 'id: "audit_fixed",')}`],
]) {
  const mutated = memoryBody.replace(memoryLog, replacement);
  assert.notEqual(mutated, memoryBody, `memory audit ${label} mutation must hit`);
  assert.throws(() => assertMemory(mutated), /audit log has exactly|audit log fields are direct|no spread, computed, duplicate, reordered or extra|memory audit log binds/);
}

for (const [label, replacement] of [
  ["drop old audit history", "auditLogs: [log]"],
  ["reorder old audit history", "auditLogs: [log, ...db.auditLogs].reverse()"],
]) {
  const mutated = memoryBody.replace("auditLogs: [log, ...db.auditLogs]", replacement);
  assert.notEqual(mutated, memoryBody, `memory audit-history ${label} mutation must hit`);
  assert.throws(() => assertMemory(mutated), /memory composite calls only|commit prepends exactly one audit log|preserves the existing audit log/);
}

console.log("archive atomic contract passed");
