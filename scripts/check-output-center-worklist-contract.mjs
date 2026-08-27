import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = fileURLToPath(new URL("..", import.meta.url));
const pagePath = resolve(root, "src/app/output-center/page.tsx");
const loadingPath = resolve(root, "src/app/output-center/loading.tsx");
const page = readFileSync(pagePath, "utf8");
const loading = readFileSync(loadingPath, "utf8");

const expectedCopy = {
  ja: {
    subtitle: "出力する文書を選び、必要な確認やプレビューへ進みます。公式原本はそのまま閲覧できます。",
    taskCategory: "出力タスク",
    chooseTaskTitle: "出力する文書を選択してください",
    chooseTaskDescription: "タスク一覧から文書を選ぶと、必要な確認と次の操作が表示されます。",
  },
  zh: {
    subtitle: "选择要处理的文书，查看所需确认并进入预览；官方原件可直接打开。",
    taskCategory: "输出任务",
    chooseTaskTitle: "请选择需要输出的文书",
    chooseTaskDescription: "从任务列表选择文书后，这里会显示所需确认和下一步操作。",
  },
  ko: {
    subtitle: "처리할 문서를 선택해 필요한 확인과 미리보기로 이동합니다. 공식 원본은 바로 열 수 있습니다.",
    taskCategory: "출력 작업",
    chooseTaskTitle: "출력할 문서를 선택해 주세요",
    chooseTaskDescription: "작업 목록에서 문서를 선택하면 필요한 확인과 다음 작업이 표시됩니다.",
  },
};
const expectedWorklistPolishCopy = {
  ja: { externalHint: "新しいタブで開く", templateMissing: "テンプレート未設定", templateRequired: "テンプレートが必要です" },
  zh: { externalHint: "在新标签页打开", templateMissing: "模板未设置", templateRequired: "需要先设置模板" },
  ko: { externalHint: "새 탭에서 열기", templateMissing: "템플릿 미설정", templateRequired: "템플릿 설정이 필요합니다" },
};
const expectedBlockedTaskHref = "/output-center?docGroup=application&doc=guarantee_application";
const expectedTemplateRecoveryHref = "/templates";
const expectedCreateCaseHref = "/cases/new?from=output";
const expectedOfficialDocumentHrefs = [
  "/official-forms/mlit-important-matters-example-2026-04-01.pdf",
  "/official-forms/mlit-rental-management-important-matters-2021-04-23.pdf",
  "/official-forms/mlit-standard-brokerage-agreement-terms-2024-04-01.pdf",
  "/official-forms/mlit-standard-rental-management-agreement-2021-04-23.pdf",
  "/official-forms/mlit-standard-residential-lease-joint-guarantor-2018.pdf",
  "/official-forms/mlit-standard-residential-lease-rent-guarantee-2018.pdf",
];
const longCjkLabelSamples = {
  ja: ["保証会社申込書と契約関連書類の出力グループ", "保証会社申込書と契約関連書類の作成タスク"],
  zh: ["保证公司申请书与合同相关文书输出分组", "保证公司申请书与合同相关文书创建任务"],
  ko: ["보증회사 신청서와 계약 관련 문서 출력 그룹", "보증회사 신청서와 계약 관련 문서 작성 작업"],
};
const longCjkCaseSamples = {
  ja: ["保証会社申込案件・東京都港区南青山共同住宅改修計画", "保証会社申込案件・東京都港区南青山共同住宅更新計画"],
  zh: ["保证公司申请案件・东京都港区南青山共同住宅改修计划", "保证公司申请案件・东京都港区南青山共同住宅更新计划"],
  ko: ["보증회사 신청 사건・도쿄도 미나토구 미나미아오야마 공동주택 개수 계획", "보증회사 신청 사건・도쿄도 미나토구 미나미아오야마 공동주택 갱신 계획"],
};

function parse(source, filename) {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(tree.parseDiagnostics.length, 0, `${filename} must parse as TSX`);
  return tree;
}

function visit(rootNode, predicate, matches = []) {
  if (predicate(rootNode)) matches.push(rootNode);
  ts.forEachChild(rootNode, (child) => {
    visit(child, predicate, matches);
  });
  return matches;
}

const containsNode = (container, node) => container.pos <= node.pos && container.end >= node.end;

function unwrapExpression(node) {
  let current = node;
  while (current && (ts.isAsExpression(current) || ts.isParenthesizedExpression(current) || ts.isSatisfiesExpression(current))) current = current.expression;
  return current;
}

function constantBoolean(node) {
  const value = unwrapExpression(node);
  if (value?.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (value?.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (value && ts.isPrefixUnaryExpression(value) && value.operator === ts.SyntaxKind.ExclamationToken) {
    const operand = constantBoolean(value.operand);
    return operand === undefined ? undefined : !operand;
  }
  return undefined;
}

function assertReachablePath(node, boundary, label) {
  let current = node;
  while (current !== boundary) {
    const parent = current.parent;
    assert(parent, `${label} must remain inside its live boundary`);
    if (ts.isFunctionLike(parent)) assert.fail(`${label} must not be hidden in an uncalled nested function`);
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && containsNode(parent.right, current)) {
      assert.notEqual(constantBoolean(parent.left), false, `${label} must not be hidden behind false &&`);
    }
    if (ts.isConditionalExpression(parent)) {
      const condition = constantBoolean(parent.condition);
      if (containsNode(parent.whenTrue, current)) assert.notEqual(condition, false, `${label} must not be in a constant-false ternary branch`);
      if (containsNode(parent.whenFalse, current)) assert.notEqual(condition, true, `${label} must not be in a constant-true ternary false branch`);
    }
    if (ts.isIfStatement(parent)) {
      const condition = constantBoolean(parent.expression);
      if (containsNode(parent.thenStatement, current)) assert.notEqual(condition, false, `${label} must not be in if(false)`);
      if (parent.elseStatement && containsNode(parent.elseStatement, current)) assert.notEqual(condition, true, `${label} must not be in an unreachable else branch`);
    }
    current = parent;
  }
}

function directFunction(tree, name) {
  const fn = tree.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert(fn?.body, `${name} must be a top-level declared function`);
  return fn;
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

function finalReturn(fn) {
  const returns = fn.body.statements.filter(ts.isReturnStatement);
  assert.equal(returns.length, 1, `${fn.name.text} must have one top-level return`);
  const result = returns[0];
  assert.equal(fn.body.statements.at(-1), result, `${fn.name.text} return must be the final top-level statement`);
  assert(result.expression, `${fn.name.text} final return must have an expression`);
  for (const statement of fn.body.statements.slice(0, -1)) {
    assert(!statementAlwaysTerminates(statement), `${fn.name.text} must not have a statically guaranteed return or throw before its final return`);
  }
  return result.expression;
}

function directVariable(fn, name) {
  for (const statement of fn.body.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return declaration;
    }
  }
  assert.fail(`${name} must be a direct ${fn.name.text} variable`);
}

function variableInTree(tree, name) {
  const declaration = visit(tree, (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name)[0];
  assert(declaration, `${name} must be declared`);
  return declaration;
}

function objectProperty(objectNode, name) {
  const object = unwrapExpression(objectNode);
  assert(ts.isObjectLiteralExpression(object), `${name} parent must be an object literal`);
  const property = object.properties.find((entry) => ts.isPropertyAssignment(entry) && entry.name.getText().replaceAll('"', "") === name);
  assert(property && ts.isPropertyAssignment(property), `${name} must be an explicit property assignment`);
  return property.initializer;
}

function assertLocaleTernary(node, expected, tree, label) {
  const zhBranch = unwrapExpression(node);
  assert(ts.isConditionalExpression(zhBranch), `${label} must use an explicit locale conditional`);
  assert.equal(zhBranch.condition.getText(tree), 'locale === "zh"', `${label} must select zh first`);
  assert(ts.isStringLiteral(zhBranch.whenTrue), `${label} zh branch must be a direct string`);
  assert.equal(zhBranch.whenTrue.text, expected.zh, `${label} zh copy must match the independent expectation`);
  const koBranch = unwrapExpression(zhBranch.whenFalse);
  assert(ts.isConditionalExpression(koBranch), `${label} must provide a ko fallback branch`);
  assert.equal(koBranch.condition.getText(tree), 'locale === "ko"', `${label} must select ko second`);
  assert(ts.isStringLiteral(koBranch.whenTrue), `${label} ko branch must be a direct string`);
  assert.equal(koBranch.whenTrue.text, expected.ko, `${label} ko copy must match the independent expectation`);
  assert(ts.isStringLiteral(koBranch.whenFalse), `${label} ja branch must be a direct string`);
  assert.equal(koBranch.whenFalse.text, expected.ja, `${label} ja copy must match the independent expectation`);
}

function assertSemanticFocusClass(classText, label) {
  for (const token of ["--bd-focus-ring-width", "--bd-focus-ring-color", "--bd-focus-ring-offset"]) {
    assert(classText.includes(token), `${label} must use the global semantic focus ${token}`);
  }
}

function jsxName(node, tree) {
  if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return undefined;
  return (ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName).getText(tree);
}

function jsxAttributes(node) {
  return ts.isJsxElement(node) ? node.openingElement.attributes.properties : node.attributes.properties;
}

function jsxAttribute(node, name) {
  return jsxAttributes(node).find((attribute) => ts.isJsxAttribute(attribute) && attribute.name.text === name);
}

function jsxAttributeExpression(node, name, tree) {
  const attribute = jsxAttribute(node, name);
  assert(attribute?.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression, `<${jsxName(node, tree)}> must provide live ${name}`);
  return attribute.initializer.expression;
}

function propertyAccessCall(node, expressionText, tree) {
  return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.getText(tree) === expressionText;
}

function renderedExpressionElement(boundary, expressionText, tree, label) {
  const expressions = visit(boundary, (node) => ts.isJsxExpression(node) && node.expression?.getText(tree) === expressionText);
  assert.equal(expressions.length, 1, `${label} must have one live rendered expression`);
  let current = expressions[0].parent;
  while (current && !ts.isJsxElement(current) && !ts.isJsxSelfClosingElement(current)) current = current.parent;
  assert(current, `${label} must belong to a JSX element`);
  return current;
}

function renderedExpressionElementMatching(boundary, predicate, tree, label) {
  const expressions = visit(boundary, (node) => ts.isJsxExpression(node) && node.expression && predicate(node.expression.getText(tree)));
  assert.equal(expressions.length, 1, `${label} must have one live rendered expression`);
  let current = expressions[0].parent;
  while (current && !ts.isJsxElement(current) && !ts.isJsxSelfClosingElement(current)) current = current.parent;
  assert(current, `${label} must belong to a JSX element`);
  return current;
}

function staticClassText(element, tree, label) {
  const attribute = jsxAttribute(element, "className");
  assert(attribute?.initializer, `${label} must provide className`);
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  assert(ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression, `${label} className must be a live expression`);
  return attribute.initializer.expression.getText(tree);
}

function assertNaturalCjkWrapping(element, tree, label) {
  const classText = staticClassText(element, tree, label);
  assert(!/\btruncate\b|\bline-clamp-|\bwhitespace-nowrap\b/.test(classText), `${label} must not truncate or clamp CJK labels`);
  assert(/\bbreak-words\b/.test(classText), `${label} must allow natural word breaking`);
  assert(classText.includes("overflow-wrap:anywhere"), `${label} must wrap long unbroken content`);
  assert(/\bleading-/.test(classText), `${label} must keep a defined multiline line-height`);
}

function ancestorWithClass(element, boundary, tree, requiredToken, label) {
  let current = element.parent;
  while (current && current !== boundary) {
    if ((ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) && jsxAttribute(current, "className")) {
      const classText = staticClassText(current, tree, label);
      if (classText.includes(requiredToken)) return current;
    }
    current = current.parent;
  }
  assert.fail(`${label} must have a live ${requiredToken} container`);
}

function assertSelectedCaseSummary(source, filename) {
  const tree = parse(source, filename);
  const pageFunction = directFunction(tree, "OutputCenterPage");
  const returnExpression = finalReturn(pageFunction);
  const summaries = visit(returnExpression, (node) => jsxName(node, tree) === "summary");
  assert.equal(summaries.length, 1, "visible output flow must have one selected-case disclosure summary");
  const summary = summaries[0];
  assertReachablePath(summary, returnExpression, "selected-case disclosure summary");
  const classText = staticClassText(summary, tree, "selected-case disclosure summary");
  for (const token of ["inline-flex", "min-h-11", "items-center", "px-", "py-", "leading-", "--bd-focus-ring-width", "--bd-focus-ring-color", "--bd-focus-ring-offset"]) {
    assert(classText.includes(token), `selected-case disclosure summary must include ${token}`);
  }
  assert(!/\btruncate\b|\bline-clamp-|\bwhitespace-nowrap\b/.test(classText), "selected-case disclosure summary must not truncate its label");
  assert(visit(summary, (node) => ts.isJsxAttribute(node) && node.name.text === "className" && node.getText(tree).includes("break-words")).length >= 1, "selected-case disclosure label must wrap naturally");
  assert.equal(visit(summary, (node) => ts.isJsxExpression(node) && node.expression?.getText(tree) === "copy.guaranteeDetailToggle").length, 1, "selected-case disclosure must render the live locale label");
  const disclosureIcons = visit(summary, (node) => (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && jsxAttribute(node, "className") && staticClassText(node, tree, "selected-case disclosure icon").includes("group-open:rotate-180"));
  assert.equal(disclosureIcons.length, 1, "selected-case disclosure must have one visible expansion indicator");
  assert(staticClassText(disclosureIcons[0], tree, "selected-case disclosure icon").includes("motion-reduce:transition-none"), "disclosure motion must stop for reduced-motion users");
  let current = summary.parent;
  let selectedCaseBranch;
  while (current && current !== returnExpression) {
    if (ts.isConditionalExpression(current) && current.condition.getText(tree) === "shouldShowGuaranteeFlow && selectedCase" && containsNode(current.whenTrue, summary)) {
      selectedCaseBranch = current;
      break;
    }
    current = current.parent;
  }
  assert(selectedCaseBranch, "disclosure summary must be reachable only in the real selected-case branch");
  return { tree, summary };
}

function analyzeLiveWorklist(source, filename) {
  const tree = parse(source, filename);
  const pageFunction = directFunction(tree, "OutputCenterPage");
  const returnExpression = finalReturn(pageFunction);
  const worklists = visit(returnExpression, (node) => jsxName(node, tree) === "WorklistShell");
  assert.equal(worklists.length, 1, "final page return must render one WorklistShell");
  const worklist = worklists[0];
  assertReachablePath(worklist, returnExpression, "WorklistShell");
  const items = jsxAttributeExpression(worklist, "items", tree);
  const detail = jsxAttributeExpression(worklist, "detail", tree);
  assertReachablePath(items, returnExpression, "WorklistShell items");
  assertReachablePath(detail, returnExpression, "WorklistShell detail");

  const documentGroups = directVariable(pageFunction, "documentTreeGroups");
  assert(documentGroups.initializer, "documentTreeGroups must have a live initializer");
  const guaranteeTasks = visit(documentGroups.initializer, (node) => {
    if (!ts.isObjectLiteralExpression(node)) return false;
    return node.properties.some((property) =>
      ts.isPropertyAssignment(property) && property.name.getText(tree) === "id" &&
      ts.isStringLiteral(property.initializer) && property.initializer.text === "guarantee_application"
    );
  });
  assert.equal(guaranteeTasks.length, 1, "live documentTreeGroups must own one guarantee task");
  const groupMaps = visit(items, (node) => propertyAccessCall(node, "documentTreeGroups.map", tree));
  const itemMaps = visit(items, (node) => propertyAccessCall(node, "activeDocumentTreeGroup.items.map", tree));
  assert.equal(groupMaps.length, 1, "live Worklist items must render documentTreeGroups");
  assert.equal(itemMaps.length, 1, "live Worklist items must render active group tasks");
  assertReachablePath(groupMaps[0], items, "document group map");
  assertReachablePath(itemMaps[0], items, "active task map");
  const groupTitle = renderedExpressionElement(groupMaps[0], "group.title", tree, "document group title");
  const taskLabel = renderedExpressionElement(itemMaps[0], "item.label", tree, "document task label");
  const taskDescription = renderedExpressionElement(itemMaps[0], "item.description", tree, "document task description");
  const groupStatus = renderedExpressionElement(groupMaps[0], "group.status", tree, "document group status");
  const taskStatus = renderedExpressionElement(itemMaps[0], "item.status", tree, "document task status");
  assertNaturalCjkWrapping(groupTitle, tree, "document group title");
  assertNaturalCjkWrapping(taskLabel, tree, "document task label");
  assertNaturalCjkWrapping(taskDescription, tree, "document task description");
  assertNaturalCjkWrapping(groupStatus, tree, "document group status");
  assertNaturalCjkWrapping(taskStatus, tree, "document task status");
  assert(staticClassText(groupStatus, tree, "document group status").includes("text-xs"), "group status badges must use at least 12px text");
  assert(staticClassText(taskStatus, tree, "document task status").includes("text-xs"), "task status badges must use at least 12px text");
  ancestorWithClass(groupTitle, groupMaps[0], tree, "flex-wrap", "document group row");
  ancestorWithClass(taskLabel, itemMaps[0], tree, "flex-wrap", "document task row");
  assert(!/\bshrink-0\b/.test(staticClassText(groupStatus, tree, "document group status")), "group status must not squeeze the group title");
  assert(!/\bshrink-0\b/.test(staticClassText(taskStatus, tree, "document task status")), "task status must not squeeze the task label");

  const groupLinks = visit(groupMaps[0], (node) => jsxName(node, tree) === "Link" && jsxAttributeExpression(node, "href", tree).getText(tree) === "documentTreeGroupHref(group.id)");
  assert.equal(groupLinks.length, 1, "live group renderer must own one category link");
  const groupClass = staticClassText(groupLinks[0], tree, "document group link");
  assertSemanticFocusClass(groupClass, "document group link");
  assert(groupClass.includes("border-blue-200") && groupClass.includes("bg-blue-50/50"), "selected group must use the approved restrained category treatment");
  assert(!groupClass.includes('selected ? "border-[#002FA7]'), "selected group must remain weaker than an exact task selection");

  const itemClassBindings = visit(itemMaps[0], (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "itemClass");
  assert.equal(itemClassBindings.length, 1, "live task renderer must define one itemClass");
  const itemClassText = itemClassBindings[0].initializer?.getText(tree) ?? "";
  assertSemanticFocusClass(itemClassText, "document task link");
  assert(itemClassText.includes('item.selected') && itemClassText.includes('border-[#002FA7]') && itemClassText.includes("shadow-sm"), "exact task selection must retain the stronger task treatment");

  const externalHints = visit(itemMaps[0], (node) => ts.isJsxExpression(node) && node.expression?.getText(tree) === "documentTreeCopy.externalHint");
  assert.equal(externalHints.length, 1, "external task rows must render one visible localized new-tab hint");
  const externalHintElement = renderedExpressionElement(itemMaps[0], "documentTreeCopy.externalHint", tree, "external new-tab hint");
  assert(staticClassText(externalHintElement, tree, "external new-tab hint").includes("text-xs"), "external new-tab hint must remain visibly readable");
  const externalIcons = visit(itemMaps[0], (node) => ts.isJsxElement(node) && node.children.some((child) => ts.isJsxText(child) && child.text.trim() === "open_in_new"));
  assert.equal(externalIcons.length, 1, "external hint must have one decorative new-tab icon");
  const hiddenIcon = jsxAttribute(externalIcons[0], "aria-hidden");
  assert(hiddenIcon?.initializer && hiddenIcon.initializer.getText(tree) === '"true"', "external new-tab icon must be hidden from assistive technology");
  const externalAnchors = visit(itemMaps[0], (node) => jsxName(node, tree) === "a" && jsxAttribute(node, "target")?.initializer?.getText(tree) === '"_blank"');
  assert.equal(externalAnchors.length, 1, "external task branch must retain one real new-tab anchor");
  assert.equal(jsxAttribute(externalAnchors[0], "rel")?.initializer?.getText(tree), '"noreferrer"', "external task links must retain noreferrer");
  return { tree, pageFunction, returnExpression, guaranteeTask: guaranteeTasks[0], groupMap: groupMaps[0], itemMap: itemMaps[0], groupLink: groupLinks[0], itemClassText };
}

function analyzeLivePageCurrent(source, filename) {
  const tree = parse(source, filename);
  const pageFunction = directFunction(tree, "OutputCenterPage");
  const returnExpression = finalReturn(pageFunction);
  const currentAttributes = visit(returnExpression, (node) => {
    if (!ts.isJsxAttribute(node) || node.name.text !== "aria-current" || !node.initializer || !ts.isJsxExpression(node.initializer) || !node.initializer.expression) return false;
    return visit(node.initializer.expression, (child) => ts.isStringLiteral(child) && child.text === "page").length > 0;
  });
  assert.equal(currentAttributes.length, 2, "live Worklist must expose one mutually exclusive group current and one task current binding");
  const groupMap = visit(returnExpression, (node) => propertyAccessCall(node, "documentTreeGroups.map", tree))[0];
  const itemMap = visit(returnExpression, (node) => propertyAccessCall(node, "activeDocumentTreeGroup.items.map", tree))[0];
  assert(groupMap && itemMap, "current bindings must stay in the live group and task renderers");
  const groupCurrent = currentAttributes.find((attribute) => containsNode(groupMap, attribute));
  const taskCurrent = currentAttributes.find((attribute) => containsNode(itemMap, attribute));
  assert(groupCurrent && taskCurrent && groupCurrent !== taskCurrent, "group and task current bindings must remain in their own live renderers");
  assertReachablePath(groupMap, returnExpression, "group-only aria-current renderer");
  assertReachablePath(itemMap, returnExpression, "task aria-current renderer");

  const groupExpression = groupCurrent.initializer.expression;
  const taskExpression = taskCurrent.initializer.expression;
  assert(ts.isConditionalExpression(groupExpression) && ts.isIdentifier(groupExpression.condition) && groupExpression.condition.text === "groupOwnsCurrent", "group current must use the group-only state binding");
  assert(ts.isConditionalExpression(taskExpression) && taskExpression.condition.getText(tree) === "item.selected", "task current must use exact task selection");
  for (const [label, expression] of [["group", groupExpression], ["task", taskExpression]]) {
    assert(ts.isStringLiteral(expression.whenTrue) && expression.whenTrue.text === "page", `${label} current true branch must be page`);
    assert(expression.whenFalse.kind === ts.SyntaxKind.UndefinedKeyword || expression.whenFalse.getText(tree) === "undefined", `${label} current false branch must be undefined`);
  }

  const ownershipBindings = visit(groupMap, (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "groupOwnsCurrent");
  assert.equal(ownershipBindings.length, 1, "live group renderer must define one group-only current binding");
  const ownership = unwrapExpression(ownershipBindings[0].initializer);
  assert(ts.isBinaryExpression(ownership) && ownership.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken, "group current must require both selected group and no selected task");
  assert(ownership.left.getText(tree) === "selected", "group current must require the active group");
  assert(ts.isPrefixUnaryExpression(ownership.right) && ownership.right.operator === ts.SyntaxKind.ExclamationToken, "group current must exclude groups with a selected task");
  const selectedTaskLookup = unwrapExpression(ownership.right.operand);
  assert(ts.isCallExpression(selectedTaskLookup) && ts.isPropertyAccessExpression(selectedTaskLookup.expression) && selectedTaskLookup.expression.getText(tree) === "group.items.some", "group current must inspect its rendered task selection");
  assert.equal(selectedTaskLookup.arguments.length, 1, "group selected-task lookup must have one predicate");
  const predicate = selectedTaskLookup.arguments[0];
  assert(ts.isArrowFunction(predicate) && predicate.parameters.length === 1 && predicate.parameters[0].name.getText(tree) === "item" && predicate.body.getText(tree) === "item.selected", "group current must exclude an exact selected task");
  return { tree, groupCurrent, taskCurrent };
}

const analysis = analyzeLiveWorklist(page, pagePath);
const { tree: pageTree, pageFunction, returnExpression: pageReturn, guaranteeTask } = analysis;
analyzeLivePageCurrent(page, pagePath);
assertSelectedCaseSummary(page, pagePath);
const activeGroupStatusElement = renderedExpressionElement(pageReturn, "activeDocumentTreeGroup.status", pageTree, "active group category badge");
const activeGroupStatusClass = staticClassText(activeGroupStatusElement, pageTree, "active group category badge");
assert(activeGroupStatusClass.includes("bg-slate-100") && activeGroupStatusClass.includes("text-slate-600"), "active group category badge must use the approved neutral treatment");
assert(!activeGroupStatusClass.includes("bg-slate-950") && !activeGroupStatusClass.includes("text-white"), "active group category badge must not compete with the exact task selection");

const currentStateMatrix = [
  { name: "official group-only", selectedGroup: true, groupHasSelectedTask: false, selectedTask: false, expected: ["group"] },
  { name: "application exact task", selectedGroup: true, groupHasSelectedTask: true, selectedTask: true, expected: ["task"] },
  { name: "unselected", selectedGroup: false, groupHasSelectedTask: false, selectedTask: false, expected: [] },
];
const evaluateCurrentState = ({ selectedGroup, groupHasSelectedTask, selectedTask }) => [
  selectedGroup && !groupHasSelectedTask ? "group" : null,
  selectedTask ? "task" : null,
].filter(Boolean);
for (const state of currentStateMatrix) {
  assert.deepEqual(evaluateCurrentState(state), state.expected, `${state.name} must expose the independently expected current item`);
}
for (const selectedGroup of [false, true]) {
  for (const groupHasSelectedTask of [false, true]) {
    for (const selectedTask of [false, true]) {
      if (groupHasSelectedTask && !selectedGroup) continue;
      if (selectedTask && (!selectedGroup || !groupHasSelectedTask)) continue;
      assert(evaluateCurrentState({ selectedGroup, groupHasSelectedTask, selectedTask }).length <= 1, "every valid Worklist state must expose at most one current item");
    }
  }
}

for (const [locale, [groupLabel, taskLabel]] of Object.entries(longCjkLabelSamples)) {
  assert(groupLabel.length >= 18 && taskLabel.length >= 18, `${locale} responsive samples must exercise long labels`);
  assert.notEqual(groupLabel, taskLabel, `${locale} group and task samples must remain distinct`);
  assert.equal(groupLabel.slice(0, 8), taskLabel.slice(0, 8), `${locale} samples must expose prefix-similarity scanning risk`);
}
for (const [locale, [firstCase, secondCase]] of Object.entries(longCjkCaseSamples)) {
  assert(firstCase.length >= 24 && secondCase.length >= 24, `${locale} responsive case samples must exercise long identities`);
  assert.notEqual(firstCase, secondCase, `${locale} case samples must remain distinguishable`);
  assert.equal(firstCase.slice(0, 12), secondCase.slice(0, 12), `${locale} case samples must expose long shared-prefix scanning risk`);
}

const caseMaps = visit(pageReturn, (node) => propertyAccessCall(node, "caseSelectorCards.map", pageTree));
assert.equal(caseMaps.length, 1, "live detail must render one real case selector map");
assertReachablePath(caseMaps[0], pageReturn, "case selector cards");
const caseTitleElement = renderedExpressionElement(caseMaps[0], "caseItem.caseTitle", pageTree, "case selector identity");
assertNaturalCjkWrapping(caseTitleElement, pageTree, "case selector identity");
const updatedAtElement = renderedExpressionElementMatching(caseMaps[0], (text) => text.includes("formatDate(caseItem.updatedAt, locale)"), pageTree, "case updated date");
ancestorWithClass(updatedAtElement, caseMaps[0], pageTree, "flex-wrap", "case card identity row");
const caseStatusElement = renderedExpressionElementMatching(caseMaps[0], (text) => text.includes("copy.caseMissingItems") && text.includes("copy.caseReadyForPreview"), pageTree, "case readiness status");
assertNaturalCjkWrapping(caseStatusElement, pageTree, "case readiness status");
assert(!/\bshrink-0\b/.test(staticClassText(caseStatusElement, pageTree, "case readiness status")), "case readiness status must not squeeze the case identity");
const selectedCaseTitleElements = visit(pageReturn, (node) => jsxName(node, pageTree) === "h2" && node.getText(pageTree).includes("selectedCase?.caseTitle") && node.getText(pageTree).includes("copy.guaranteeSelectCaseFirst"));
assert.equal(selectedCaseTitleElements.length, 1, "selected case identity must have one live rendered heading");
const selectedCaseTitleElement = selectedCaseTitleElements[0];
assertNaturalCjkWrapping(selectedCaseTitleElement, pageTree, "selected case identity");

const copyDeclaration = variableInTree(pageTree, "outputCenterCopy");
assert(copyDeclaration.initializer && ts.isObjectLiteralExpression(unwrapExpression(copyDeclaration.initializer)), "outputCenterCopy must remain an explicit locale map");
for (const [locale, fields] of Object.entries(expectedCopy)) {
  const localeObject = objectProperty(unwrapExpression(copyDeclaration.initializer), locale);
  for (const [key, expected] of Object.entries(fields)) {
    const value = objectProperty(localeObject, key);
    assert(ts.isStringLiteral(value), `${locale}.${key} must be a direct localized string`);
    assert.equal(value.text, expected, `${locale}.${key} must match the independently approved worklist copy`);
  }
}
const pageHeaders = visit(pageReturn, (node) => jsxName(node, pageTree) === "PageHeader");
assert.equal(pageHeaders.length, 1, "live output page must render one PageHeader");
assert.equal(jsxAttributeExpression(pageHeaders[0], "description", pageTree).getText(pageTree), "copy.subtitle", "PageHeader must render the approved neutral locale subtitle");

const documentTreeCopyDeclaration = directVariable(pageFunction, "documentTreeCopy");
assert(documentTreeCopyDeclaration.initializer && ts.isObjectLiteralExpression(unwrapExpression(documentTreeCopyDeclaration.initializer)), "documentTreeCopy must remain an explicit live object");
for (const key of ["externalHint", "templateMissing", "templateRequired"]) {
  const expected = Object.fromEntries(Object.entries(expectedWorklistPolishCopy).map(([locale, fields]) => [locale, fields[key]]));
  const value = objectProperty(documentTreeCopyDeclaration.initializer, key);
  assertLocaleTernary(value, expected, pageTree, `documentTreeCopy.${key}`);
}

const sessionBinding = pageFunction.body.statements
  .filter(ts.isVariableStatement)
  .flatMap((statement) => [...statement.declarationList.declarations])
  .find((declaration) => ts.isArrayBindingPattern(declaration.name) && declaration.name.elements.some((element) => ts.isBindingElement(element) && ts.isIdentifier(element.name) && element.name.text === "session"));
assert(sessionBinding?.initializer && ts.isAwaitExpression(sessionBinding.initializer), "locale, params and session must come from an awaited top-level read");
const promiseAll = sessionBinding.initializer.expression;
assert(ts.isCallExpression(promiseAll) && promiseAll.expression.getText(pageTree) === "Promise.all", "session must remain in the awaited Promise.all read");
const permissionCalls = visit(promiseAll, (node) => ts.isCallExpression(node) && node.expression.getText(pageTree) === "requireTenantSession");
assert.equal(permissionCalls.length, 1, "page data path must use one tenant session permission gate");
assert.equal(permissionCalls[0].arguments[0]?.getText(pageTree), '{ permission: "output.preview" }', "output.preview permission must remain explicit");

const requestContext = directVariable(pageFunction, "requestContext");
assert.equal(requestContext.initializer?.getText(pageTree), "createRequestContext(session)", "visibility must derive from the live tenant session");
for (const name of ["propertiesPromise", "quotesPromise", "partiesPromise", "outputsPromise", "installedGuaranteeTemplatesPromise", "casesPromise"]) {
  const dataRead = directVariable(pageFunction, name);
  assert(dataRead.initializer && visit(dataRead.initializer, ts.isCallExpression).length > 0, `${name} must remain a live top-level data read`);
}
for (const name of ["selectedGuaranteeMissingCount", "selectedGuaranteeCanDownload", "outputNextHref", "selectedGuaranteeDownloadHref"]) {
  directVariable(pageFunction, name);
  const liveReferences = visit(pageReturn, (node) => ts.isIdentifier(node) && node.text === name);
  assert(liveReferences.length > 0, `${name} must reach the final rendered caller`);
  liveReferences.forEach((reference) => assertReachablePath(reference, pageReturn, `${name} rendered caller`));
}

const guaranteeHref = guaranteeTask.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText(pageTree) === "href");
assert(guaranteeHref && ts.isPropertyAssignment(guaranteeHref) && ts.isConditionalExpression(guaranteeHref.initializer), "guarantee task href must branch only on installed-template availability");
assert.equal(guaranteeHref.initializer.condition.getText(pageTree), "hasInstalledGuaranteeTemplates", "guarantee task href must retain its real availability condition");
assert(ts.isStringLiteral(guaranteeHref.initializer.whenFalse) && guaranteeHref.initializer.whenFalse.text === expectedBlockedTaskHref, "blocked task must select the real Worklist row before recovery");
const documentGroupsInitializer = directVariable(pageFunction, "documentTreeGroups").initializer;
const applicationGroups = visit(documentGroupsInitializer, (node) => ts.isObjectLiteralExpression(node) && (() => {
  const id = node.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText(pageTree) === "id");
  return Boolean(id && ts.isPropertyAssignment(id) && ts.isStringLiteral(id.initializer) && id.initializer.text === "application");
})());
assert.equal(applicationGroups.length, 1, "document tree must define one application category");
assert.equal(objectProperty(applicationGroups[0], "status").getText(pageTree), "documentTreeCopy.taskCategory", "application group status must describe only its category");
const guaranteeStatus = directVariable(pageFunction, "guaranteeDocumentStatus");
const guaranteeStatusExpression = unwrapExpression(guaranteeStatus.initializer);
assert(ts.isConditionalExpression(guaranteeStatusExpression) && guaranteeStatusExpression.condition.getText(pageTree) === "!hasInstalledGuaranteeTemplates", "guarantee task status must branch on the existing template availability fact");
assert.equal(guaranteeStatusExpression.whenTrue.getText(pageTree), "documentTreeCopy.templateMissing", "blocked guarantee task must state that its template is not configured");
const officialGroups = visit(documentGroupsInitializer, (node) => ts.isObjectLiteralExpression(node) && (() => {
  const id = node.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText(pageTree) === "id");
  return Boolean(id && ts.isPropertyAssignment(id) && ts.isStringLiteral(id.initializer) && id.initializer.text === "official");
})());
assert.equal(officialGroups.length, 1, "document tree must define one official category");
const officialItems = unwrapExpression(objectProperty(officialGroups[0], "items"));
assert(ts.isArrayLiteralExpression(officialItems) && officialItems.elements.length === 6, "official category must retain all six source documents");
for (const [index, item] of officialItems.elements.entries()) {
  assert(ts.isObjectLiteralExpression(item), `official item ${index} must remain explicit data`);
  assert.equal(objectProperty(item, "external").kind, ts.SyntaxKind.TrueKeyword, `official item ${index} must retain its external-link contract`);
  const href = objectProperty(item, "href");
  assert(ts.isStringLiteral(href), `official item ${index} href must remain a direct string`);
  assert.equal(href.text, expectedOfficialDocumentHrefs[index], `official item ${index} must retain its independently expected PDF path`);
}
const selectedAssignments = visit(directVariable(pageFunction, "documentTreeGroups").initializer, (node) => ts.isPropertyAssignment(node) && node.name.getText(pageTree) === "selected");
assert.equal(selectedAssignments.length, 1, "document task data must define only one selectable current row");
assert.equal(selectedAssignments[0].initializer.getText(pageTree), "isGuaranteeDocumentSelected", "the sole selected task must use the real URL-derived guarantee selection state");

const templateRecoveryLinks = visit(pageReturn, (node) => jsxName(node, pageTree) === "Link" && (() => {
  const href = jsxAttribute(node, "href");
  return Boolean(href?.initializer && ts.isStringLiteral(href.initializer) && href.initializer.text === expectedTemplateRecoveryHref);
})());
assert.equal(templateRecoveryLinks.length, 1, "blocked detail must expose one real template-library recovery action");
assertSemanticFocusClass(staticClassText(templateRecoveryLinks[0], pageTree, "template recovery action"), "template recovery action");
let blockedState = templateRecoveryLinks[0].parent;
while (blockedState && jsxName(blockedState, pageTree) !== "StateSurface") blockedState = blockedState.parent;
assert(blockedState, "template recovery action must belong to the blocked StateSurface");
assert.equal(jsxAttributeExpression(blockedState, "title", pageTree).getText(pageTree), "documentTreeCopy.templateRequired", "blocked detail must use the approved recovery title");
assert.equal(jsxAttributeExpression(blockedState, "description", pageTree).getText(pageTree), "copy.guaranteeLibraryRequired", "blocked detail must retain the real template reason");

const outputNextLinks = visit(pageReturn, (node) => jsxName(node, pageTree) === "Link" && (() => {
  const href = jsxAttribute(node, "href");
  return Boolean(href?.initializer && ts.isJsxExpression(href.initializer) && href.initializer.expression?.getText(pageTree) === "outputNextHref");
})());
assert.equal(outputNextLinks.length, 2, "outputNextHref must have one selected-case caller and one no-case recovery caller");

const summaryAction = outputNextLinks.find((link) => {
  let current = link.parent;
  while (current && current !== pageReturn) {
    if (ts.isConditionalExpression(current) && current.condition.getText(pageTree) === "selectedCase" && containsNode(current.whenTrue, link)) return true;
    current = current.parent;
  }
  return false;
});
assert(summaryAction, "summary next action must be reachable only with a real selected case");

const noCaseStates = visit(pageReturn, (node) => jsxName(node, pageTree) === "StateSurface" && (() => {
  const title = jsxAttribute(node, "title");
  return Boolean(title?.initializer && ts.isJsxExpression(title.initializer) && title.initializer.expression?.getText(pageTree) === "copy.guaranteeNoCase");
})());
assert.equal(noCaseStates.length, 1, "no-case state must render through one StateSurface");
assert.equal(visit(noCaseStates[0], (node) => outputNextLinks.includes(node)).length, 1, "no-case StateSurface must own exactly one next action");
let noCaseBranch = noCaseStates[0].parent;
while (noCaseBranch && !(ts.isConditionalExpression(noCaseBranch) && noCaseBranch.condition.getText(pageTree) === "hasAvailableCases")) noCaseBranch = noCaseBranch.parent;
assert(noCaseBranch && containsNode(noCaseBranch.whenFalse, noCaseStates[0]), "no-case StateSurface must be the live false branch of hasAvailableCases");
const outputNextDeclaration = directVariable(pageFunction, "outputNextHref");
assert(outputNextDeclaration.initializer && visit(outputNextDeclaration.initializer, (node) => ts.isStringLiteral(node) && node.text === expectedCreateCaseHref).length === 1, "no-case path derivation must retain the real case creation URL");

const downloadConditions = visit(pageReturn, (node) => ts.isConditionalExpression(node) && node.condition.getText(pageTree) === "selectedGuaranteeCanDownload");
assert.equal(downloadConditions.length, 1, "download action must remain guarded by selectedGuaranteeCanDownload");
assert(visit(downloadConditions[0].whenTrue, (node) => jsxName(node, pageTree) === "Link" && jsxAttributeExpression(node, "href", pageTree).getText(pageTree) === "selectedGuaranteeDownloadHref").length === 1, "download gate must render only the existing derived download URL");

const legacyDeclaration = directVariable(pageFunction, "shouldShowLegacyOutputFlow");
assert(legacyDeclaration.initializer?.kind === ts.SyntaxKind.FalseKeyword, "legacy output/history/595px preview flow must remain hard disabled");
const legacyBranches = visit(pageReturn, (node) => ts.isConditionalExpression(node) && node.condition.getText(pageTree) === "shouldShowLegacyOutputFlow");
assert.equal(legacyBranches.length, 1, "legacy area must have one explicit rendered guard");
assert(visit(legacyBranches[0].whenTrue, (node) => ts.isJsxAttribute(node) && node.name.text === "id" && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression?.getText(pageTree) === "legacySectionId").length === 1, "legacy content must remain entirely inside its false guard");
const livePrimaryLinks = visit(pageReturn, (node) => ["Link", "a"].includes(jsxName(node, pageTree)) && jsxAttribute(node, "href"))
  .filter((node) => !containsNode(legacyBranches[0].whenTrue, node));
assert(livePrimaryLinks.length >= 10, "visible output workflow must retain its full set of primary links");
for (const [index, link] of livePrimaryLinks.entries()) {
  const classAttribute = jsxAttribute(link, "className");
  assert(classAttribute?.initializer, `live primary link ${index} must provide a focusable class`);
  if (ts.isJsxExpression(classAttribute.initializer) && classAttribute.initializer.expression?.getText(pageTree) === "itemClass") continue;
  assertSemanticFocusClass(staticClassText(link, pageTree, `live primary link ${index}`), `live primary link ${index}`);
}
const undersizedLiveBadges = visit(pageReturn, (node) => {
  if (!ts.isJsxAttribute(node) || node.name.text !== "className" || !node.initializer) return false;
  const classText = ts.isStringLiteral(node.initializer)
    ? node.initializer.text
    : ts.isJsxExpression(node.initializer) && node.initializer.expression
      ? node.initializer.expression.getText(pageTree)
      : "";
  return classText.includes("text-[10px]");
}).filter((attribute) => !containsNode(legacyBranches[0].whenTrue, attribute));
assert.equal(undersizedLiveBadges.length, 0, "visible output status badges must not fall below 12px");
const singleLineClasses = visit(pageReturn, (node) => {
  if (!ts.isJsxAttribute(node) || node.name.text !== "className" || !node.initializer) return false;
  const classText = ts.isStringLiteral(node.initializer)
    ? node.initializer.text
    : ts.isJsxExpression(node.initializer) && node.initializer.expression
      ? node.initializer.expression.getText(pageTree)
      : "";
  return /\btruncate\b|\bline-clamp-|\bwhitespace-nowrap\b/.test(classText);
});
for (const classAttribute of singleLineClasses) {
  assert(containsNode(legacyBranches[0].whenTrue, classAttribute), "visible Worklist flow must not truncate or clamp dynamic identity text; any remaining legacy class must stay behind the hard-off guard");
}

for (const fixtureMarker of ["task-suzuki", "prototype-template-setup", "selected-ready", "selected-blocked"]) {
  assert(!page.includes(fixtureMarker), `formal output center must not include prototype fixture marker ${fixtureMarker}`);
}
for (const fixedClaim of ["可生成", "생성 가능", "作成可能"]) {
  assert(!page.includes(fixedClaim), `task category must not claim fixed eligibility: ${fixedClaim}`);
}

const loadingTree = parse(loading, loadingPath);
const loadingFunction = directFunction(loadingTree, "OutputCenterLoading");
const loadingReturn = finalReturn(loadingFunction);
const loadingText = directVariable(loadingFunction, "text");
assert(loadingText.initializer && ts.isElementAccessExpression(loadingText.initializer), "loading copy must be selected from the locale map");
assert(ts.isAwaitExpression(loadingText.initializer.argumentExpression) && ts.isCallExpression(loadingText.initializer.argumentExpression.expression) && loadingText.initializer.argumentExpression.expression.expression.getText(loadingTree) === "getLocale", "loading boundary must await the safe product locale");
for (const component of ["PageFrame", "PageHeader", "WorklistShell", "StateSurface"]) {
  const liveComponents = visit(loadingReturn, (node) => jsxName(node, loadingTree) === component);
  assert.equal(liveComponents.length, 1, `loading final return must render one ${component}`);
  assertReachablePath(liveComponents[0], loadingReturn, `loading ${component}`);
}
assert.equal(visit(loadingReturn, (node) => ts.isStringLiteral(node) && ["caseId", "templateId", "missingCount", "downloadHref", "canDownload"].includes(node.text)).length, 0, "loading boundary must not fabricate domain state or eligibility");

const validSynthetic = `async function OutputCenterPage(){const documentTreeCopy={externalHint:"hint"};const documentTreeGroupHref=()=>"/group";const documentTreeGroups=[{title:"group",status:"status",items:[{id:"guarantee_application",label:"task",description:"description",status:"status",selected:true,external:true}]}];const activeDocumentTreeGroup=documentTreeGroups[0];return <WorklistShell items={<>{documentTreeGroups.map((group)=><Link href={documentTreeGroupHref(group.id)} className={\`flex flex-wrap border-blue-200 bg-blue-50/50 focus-visible:outline-[var(--bd-focus-ring-width)_solid_var(--bd-focus-ring-color)] focus-visible:outline-offset-[var(--bd-focus-ring-offset)]\`}><span className="break-words leading-5 [overflow-wrap:anywhere]">{group.title}</span><span className="break-words text-xs leading-4 [overflow-wrap:anywhere]">{group.status}</span></Link>)}{activeDocumentTreeGroup.items.map((item)=>{const itemClass=\`focus-visible:outline-[var(--bd-focus-ring-width)_solid_var(--bd-focus-ring-color)] focus-visible:outline-offset-[var(--bd-focus-ring-offset)] \${item.selected?"border-[#002FA7] bg-blue-50 shadow-sm":"border-slate-200"}\`;return <a href="/official.pdf" target="_blank" rel="noreferrer" className={itemClass}><div className="flex flex-wrap"><span className="break-words leading-5 [overflow-wrap:anywhere]">{item.label}</span><span className="break-words leading-5 [overflow-wrap:anywhere]">{item.description}</span><span className="break-words text-xs leading-4 [overflow-wrap:anywhere]">{item.status}</span>{item.external?<span className="text-xs">{documentTreeCopy.externalHint}<span aria-hidden="true">open_in_new</span></span>:null}</div></a>})}</>} detail={<StateSurface/>}/>;}`;
assert.doesNotThrow(() => analyzeLiveWorklist(validSynthetic, "valid-synthetic.tsx"), "live semantic Worklist fixture must pass the analyzer");
for (const [name, invalid] of [
  ["missing semantic focus", validSynthetic.replaceAll("var(--bd-focus-ring-color)", "red")],
  ["strong group treatment", validSynthetic.replace("border-blue-200 bg-blue-50/50", "border-[#002FA7] bg-blue-50")],
  ["undersized task status", validSynthetic.replace('break-words text-xs leading-4 [overflow-wrap:anywhere]">{item.status}', 'break-words text-[10px] leading-4 [overflow-wrap:anywhere]">{item.status}')],
  ["missing external hint", validSynthetic.replace("{documentTreeCopy.externalHint}", "")],
  ["exposed decorative icon", validSynthetic.replace('aria-hidden="true"', 'aria-hidden="false"')],
]) {
  assert.throws(() => analyzeLiveWorklist(invalid, `invalid-polish-${name}.tsx`), `${name} must fail the Worklist polish analyzer`);
}
const invalidSynthetics = [
  `// WorklistShell documentTreeGroups.map activeDocumentTreeGroup.items.map guarantee_application\nasync function OutputCenterPage(){return <div/>;}`,
  `async function OutputCenterPage(){const documentTreeGroups=[{items:[{id:"guarantee_application"}]}];const activeDocumentTreeGroup=documentTreeGroups[0];function unused(){return <WorklistShell items={<>{documentTreeGroups.map(()=>null)}{activeDocumentTreeGroup.items.map(()=>null)}</>} detail={<StateSurface/>}/>;}return <div/>;}`,
  `async function OutputCenterPage(){const documentTreeGroups=[{items:[{id:"guarantee_application"}]}];const activeDocumentTreeGroup=documentTreeGroups[0];return false&&<WorklistShell items={<>{documentTreeGroups.map(()=>null)}{activeDocumentTreeGroup.items.map(()=>null)}</>} detail={<StateSurface/>}/>;}`,
  `async function OutputCenterPage(){const dead=[{items:[{id:"guarantee_application"}]}];const documentTreeGroups=[];const activeDocumentTreeGroup={items:[]};return <WorklistShell items={<>{documentTreeGroups.map(()=>null)}{activeDocumentTreeGroup.items.map(()=>null)}</>} detail={<StateSurface/>}/>;}`,
  `const copied="WorklistShell documentTreeGroups.map activeDocumentTreeGroup.items.map guarantee_application";async function OutputCenterPage(){return <div/>;}`,
  `async function OutputCenterPage(){const documentTreeGroups=[{items:[{id:"guarantee_application"}]}];const activeDocumentTreeGroup=documentTreeGroups[0];if(true)return <div/>;return <WorklistShell items={<>{documentTreeGroups.map(()=>null)}{activeDocumentTreeGroup.items.map(()=>null)}</>} detail={<StateSurface/>}/>;}`,
  `async function OutputCenterPage(){const documentTreeGroups=[{items:[{id:"guarantee_application"}]}];const activeDocumentTreeGroup=documentTreeGroups[0];if(true){throw new Error("stop");}return <WorklistShell items={<>{documentTreeGroups.map(()=>null)}{activeDocumentTreeGroup.items.map(()=>null)}</>} detail={<StateSurface/>}/>;}`,
];
for (const [index, invalid] of invalidSynthetics.entries()) {
  assert.throws(() => analyzeLiveWorklist(invalid, `invalid-synthetic-${index}.tsx`), `synthetic false-positive ${index} must fail the semantic analyzer`);
}
const duplicatePageCurrentSynthetic = `async function OutputCenterPage(){const documentTreeGroups=[];const activeDocumentTreeGroup={items:[]};return <WorklistShell items={<>{documentTreeGroups.map((group)=><Link aria-current={group.selected?"page":undefined}/>)}{activeDocumentTreeGroup.items.map((item)=><Link aria-current={item.selected?"page":undefined}/>)}</>} detail={<StateSurface/>}/>;}`;
assert.throws(() => analyzeLivePageCurrent(duplicatePageCurrentSynthetic, "duplicate-page-current.tsx"), "selected group plus selected task must fail the mutually exclusive current gate");
const validSummarySynthetic = `async function OutputCenterPage(){const shouldShowGuaranteeFlow=true;const selectedCase={};const copy={guaranteeDetailToggle:"details"};return <>{shouldShowGuaranteeFlow && selectedCase ? <details><summary className="inline-flex min-h-11 items-center px-3 py-2 leading-5 focus-visible:outline-[var(--bd-focus-ring-width)_solid_var(--bd-focus-ring-color)] focus-visible:outline-offset-[var(--bd-focus-ring-offset)]"><span className="group-open:rotate-180 motion-reduce:transition-none"/><span className="break-words">{copy.guaranteeDetailToggle}</span></summary></details> : null}</>;}`;
assert.doesNotThrow(() => assertSelectedCaseSummary(validSummarySynthetic, "valid-summary.tsx"), "complete selected-case disclosure fixture must pass");
for (const [index, invalidSummary] of [
  validSummarySynthetic.replace(" min-h-11", ""),
  validSummarySynthetic.replace("var(--bd-focus-ring-color)", "red"),
  validSummarySynthetic.replace(" motion-reduce:transition-none", ""),
  validSummarySynthetic.replace("shouldShowGuaranteeFlow && selectedCase", "false"),
].entries()) {
  assert.throws(() => assertSelectedCaseSummary(invalidSummary, `invalid-summary-${index}.tsx`), `incomplete disclosure fixture ${index} must fail`);
}

console.log("Output center Worklist contract check passed.");
