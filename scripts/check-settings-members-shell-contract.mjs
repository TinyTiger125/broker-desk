import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;

function resolveCandidate(value) {
  if (!value || (!value.startsWith("/") && !value.startsWith("."))) return undefined;
  return [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`]
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

Module._resolveFilename = function (request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};

function compileTypeScript(module, filename) {
  const result = typescript.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
}

require.extensions[".ts"] = compileTypeScript;

const copyModule = require(resolve(root, "src/lib/member-management-copy.ts"));
const permissions = require(resolve(root, "src/lib/tenant-permissions.ts"));
const page = readFileSync(resolve(root, "src/app/settings/members/page.tsx"), "utf8");
const layout = readFileSync(resolve(root, "src/components/layout-system/index.tsx"), "utf8");
const layoutCss = readFileSync(resolve(root, "src/components/layout-system/layout-system.module.css"), "utf8");
const pageTree = typescript.createSourceFile(
  "members-page.tsx",
  page,
  typescript.ScriptTarget.Latest,
  true,
  typescript.ScriptKind.TSX,
);

function visit(node, predicate, matches = []) {
  if (predicate(node)) matches.push(node);
  typescript.forEachChild(node, (child) => {
    visit(child, predicate, matches);
  });
  return matches;
}

function jsxTagName(node) {
  if (!typescript.isJsxElement(node) && !typescript.isJsxSelfClosingElement(node)) return undefined;
  const tagName = typescript.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  return tagName.getText(pageTree);
}

function jsxAttributes(node) {
  if (typescript.isJsxElement(node)) return node.openingElement.attributes.properties;
  if (typescript.isJsxSelfClosingElement(node)) return node.attributes.properties;
  return [];
}

function jsxAttribute(node, name) {
  return jsxAttributes(node).find((attribute) => typescript.isJsxAttribute(attribute) && attribute.name.text === name);
}

function jsxAttributeExpressionText(node, name) {
  const attribute = jsxAttribute(node, name);
  assert(attribute && typescript.isJsxAttribute(attribute), `<${jsxTagName(node)}> must define ${name}`);
  assert(attribute.initializer && typescript.isJsxExpression(attribute.initializer) && attribute.initializer.expression, `<${jsxTagName(node)}> ${name} must be a JSX expression`);
  return attribute.initializer.expression.getText(pageTree);
}

function descendants(node, predicate) {
  return visit(node, predicate, []);
}

function enclosingConditional(node) {
  let current = node.parent;
  while (current && !typescript.isConditionalExpression(current)) current = current.parent;
  return current;
}

function ancestors(node, predicate) {
  const matches = [];
  let current = node.parent;
  while (current) {
    if (predicate(current)) matches.push(current);
    current = current.parent;
  }
  return matches;
}

function normalizedExpression(node) {
  return node.getText(pageTree).replace(/\s+/gu, "");
}

function constantBoolean(node) {
  if (typescript.isParenthesizedExpression(node)) return constantBoolean(node.expression);
  if (node.kind === typescript.SyntaxKind.TrueKeyword) return true;
  if (node.kind === typescript.SyntaxKind.FalseKeyword) return false;
  if (typescript.isPrefixUnaryExpression(node) && node.operator === typescript.SyntaxKind.ExclamationToken) {
    const value = constantBoolean(node.operand);
    return value === undefined ? undefined : !value;
  }
  return undefined;
}

function containsNode(container, node) {
  return container.pos <= node.pos && container.end >= node.end;
}

function assertReachablePath(node, boundary, label) {
  let current = node;
  while (current !== boundary) {
    const parent = current.parent;
    assert(parent, `${label} must remain inside its declared live boundary`);
    if (typescript.isFunctionLike(parent)) {
      assert.fail(`${label} must not be hidden inside an uninvoked nested function`);
    }
    if (typescript.isBinaryExpression(parent) && parent.operatorToken.kind === typescript.SyntaxKind.AmpersandAmpersandToken && containsNode(parent.right, current)) {
      assert.notEqual(constantBoolean(parent.left), false, `${label} must not be hidden behind a constant-false && branch`);
    }
    if (typescript.isConditionalExpression(parent)) {
      const condition = constantBoolean(parent.condition);
      if (containsNode(parent.whenTrue, current)) assert.notEqual(condition, false, `${label} must not be hidden in a constant-false ternary branch`);
      if (containsNode(parent.whenFalse, current)) assert.notEqual(condition, true, `${label} must not be hidden in a constant-true ternary false branch`);
    }
    if (typescript.isIfStatement(parent)) {
      const condition = constantBoolean(parent.expression);
      if (containsNode(parent.thenStatement, current)) assert.notEqual(condition, false, `${label} must not be hidden in an if(false) branch`);
      if (parent.elseStatement && containsNode(parent.elseStatement, current)) assert.notEqual(condition, true, `${label} must not be hidden in an unreachable else branch`);
    }
    current = parent;
  }
}

function syntheticMapPath(source, boundarySelector) {
  const tree = typescript.createSourceFile("reachability.tsx", source, typescript.ScriptTarget.Latest, true, typescript.ScriptKind.TSX);
  const mapCall = visit(tree, (node) => typescript.isCallExpression(node)
    && typescript.isPropertyAccessExpression(node.expression)
    && node.expression.getText(tree) === "members.map")[0];
  const boundary = boundarySelector(tree);
  assert(mapCall && boundary, "reachability guard fixture must expose map call and boundary");
  return { mapCall, boundary };
}

{
  const live = syntheticMapPath("members.map(render);", (tree) => tree.statements[0].expression);
  assert.doesNotThrow(() => assertReachablePath(live.mapCall, live.boundary, "live fixture"), "reachability guard must accept a direct live map");
  for (const [source, boundarySelector] of [
    ["false && members.map(render);", (tree) => tree.statements[0].expression],
    ["false ? members.map(render) : undefined;", (tree) => tree.statements[0].expression],
    ["function fixture(){ if (false) { return members.map(render); } }", (tree) => tree.statements[0].body],
    ["(() => members.map(render));", (tree) => tree.statements[0].expression],
  ]) {
    const fixture = syntheticMapPath(source, boundarySelector);
    assert.throws(() => assertReachablePath(fixture.mapCall, fixture.boundary, "dead fixture"), "reachability guard must reject constant-false and uninvoked paths");
  }
}

const expectedStatuses = {
  active: { ja: "所属中", zh: "已加入", ko: "소속 중" },
  invited: { ja: "所属待ち", zh: "待加入", ko: "소속 대기" },
  suspended: { ja: "利用停止中", zh: "成员关系已暂停", ko: "이용 중지" },
  removed: { ja: "メンバー登録解除済み", zh: "成员关系已解除", ko: "멤버 등록 해제" },
};
const expectedInvitationStatuses = {
  not_sent: { ja: "未送信", zh: "未发送", ko: "미발송" },
  pending: { ja: "承諾待ち・処理中", zh: "待接受，处理中", ko: "수락 대기·처리 중" },
  accepted: { ja: "承諾済み", zh: "已接受", ko: "수락됨" },
  revoked: { ja: "取消済み", zh: "已撤销", ko: "취소됨" },
  expired: { ja: "期限切れ", zh: "已过期", ko: "만료됨" },
  failed: { ja: "送信失敗", zh: "发送失败", ko: "전송 실패" },
};
const expectedCapabilityLabels = {
  company_owner: { ja: "会社の責任者", zh: "公司负责人", ko: "회사 책임자" },
  company_form_admin: { ja: "会社フォーム管理者", zh: "公司表格管理员", ko: "회사 양식 관리자" },
  ordinary_member: { ja: "一般メンバー", zh: "普通成员", ko: "일반 멤버" },
};
const expectedCapabilityDescriptions = {
  company_owner: {
    ja: "会社設定、メンバー、会社テンプレートを管理し、操作履歴を確認できます。案件・資料の閲覧・更新と出力は、それぞれの資料に実際に付与された権限に従います。この役割だけで他のメンバーの非公開資料にアクセスできるわけではありません。",
    zh: "可管理公司设置、成员和公司模板，并查看操作记录。每份案件和资料的查看、更新及输出，均以该资料实际授予的权限为准；该身份本身不会自动获得其他成员的私有资料访问权。",
    ko: "회사 설정, 멤버, 회사 템플릿을 관리하고 작업 기록을 확인할 수 있습니다. 각 안건과 자료의 열람·수정 및 출력은 해당 자료에 실제로 부여된 권한을 따릅니다. 이 역할만으로 다른 멤버의 비공개 자료에 자동으로 접근할 수는 없습니다.",
  },
  company_form_admin: {
    ja: "案件・資料に関する業務と出力、会社テンプレートの管理、操作履歴の確認を行えます。各案件・資料の閲覧・更新と出力は、それぞれの資料に実際に付与された権限に従います。この役割だけで他のメンバーの非公開資料にはアクセスできず、メンバー管理もできません。",
    zh: "可处理案件与资料相关工作及输出，并管理公司模板、查看操作记录。每份案件和资料的查看、更新及输出，均以该资料实际授予的权限为准；该身份本身不会自动获得其他成员的私有资料访问权，也不能管理成员。",
    ko: "안건·자료 관련 업무와 출력, 회사 템플릿 관리, 작업 기록 확인을 수행할 수 있습니다. 각 안건과 자료의 열람·수정 및 출력은 해당 자료에 실제로 부여된 권한을 따릅니다. 이 역할만으로 다른 멤버의 비공개 자료에 자동으로 접근할 수 없으며 멤버 관리도 할 수 없습니다.",
  },
  ordinary_member: {
    ja: "案件・資料の入力や更新、出力の作成を行えます。各案件・資料の閲覧・更新と出力は、それぞれの資料に実際に付与された権限に従います。メンバー管理や会社全体の管理はできません。",
    zh: "可录入和更新案件与资料，并制作输出。每份案件和资料的查看、更新及输出，均以该资料实际授予的权限为准；不能管理成员或执行公司级管理。",
    ko: "안건과 자료를 입력·수정하고 출력을 만들 수 있습니다. 각 안건과 자료의 열람·수정 및 출력은 해당 자료에 실제로 부여된 권한을 따릅니다. 멤버 관리나 회사 전체 관리는 할 수 없습니다.",
  },
};

assert.deepEqual(copyModule.MEMBERSHIP_STATUS_LABELS, expectedStatuses, "membership status copy must be isolated and complete for ja/zh/ko");
assert.deepEqual(copyModule.INVITATION_STATUS_LABELS, expectedInvitationStatuses, "invitation status copy must remain separate from membership status for ja/zh/ko");
assert.deepEqual(copyModule.MEMBER_CAPABILITY_LABELS, expectedCapabilityLabels, "capability labels must be isolated and complete for ja/zh/ko");
assert.deepEqual(copyModule.MEMBER_CAPABILITY_DESCRIPTIONS, expectedCapabilityDescriptions, "capability descriptions must be isolated and complete for ja/zh/ko");
assert.deepEqual(copyModule.MEMBER_CAPABILITY_PRESETS, ["company_owner", "company_form_admin", "ordinary_member"], "only the three approved presets are displayed");

const has = (preset, action) => permissions.capabilityHasTenantPermission(preset, action);
for (const action of ["member.invite", "member.update_role", "member.remove", "audit.view", "record.archive", "output.generate_final", "template.publish"]) {
  assert.equal(has("company_owner", action), true, `company owner capability fact: ${action}`);
}
for (const action of ["audit.view", "case.assign", "record.archive", "output.generate_final", "template.publish", "template.archive"]) {
  assert.equal(has("company_form_admin", action), true, `form admin broad management fact: ${action}`);
}
for (const action of ["member.invite", "member.update_role", "member.remove"]) {
  assert.equal(has("company_form_admin", action), false, `form admin member-management exclusion: ${action}`);
  assert.equal(has("ordinary_member", action), false, `ordinary member member-management exclusion: ${action}`);
}
for (const action of ["case.create", "case.update_assigned", "record.update", "output.generate_final"]) {
  assert.equal(has("ordinary_member", action), true, `ordinary member assigned-work fact: ${action}`);
}
for (const action of ["audit.view", "case.assign", "record.archive", "template.publish", "template.archive"]) {
  assert.equal(has("ordinary_member", action), false, `ordinary member company-management exclusion: ${action}`);
}

for (const locale of ["ja", "zh", "ko"]) {
  const ui = copyModule.getMemberManagementCopy(locale);
  assert.equal(typeof ui.memberCount(2), "string", `${locale} member count is localized`);
  assert.notEqual(ui.membershipStatus, ui.invitationStatus, `${locale} membership and invitation labels must remain distinct`);
  for (const preset of copyModule.MEMBER_CAPABILITY_PRESETS) {
    const description = copyModule.MEMBER_CAPABILITY_DESCRIPTIONS[preset][locale];
    assert(description.length >= 20, `${locale}/${preset} description must explain the scope`);
    assert(!/(member\.|record\.|case\.|output\.|template\.|company_form_admin|ordinary_member|tenant_owner|owner_write)/u.test(description), `${locale}/${preset} description must not expose internal capability tokens`);
  }
}

const jsxNodes = visit(pageTree, (node) => typescript.isJsxElement(node) || typescript.isJsxSelfClosingElement(node));
for (const component of ["PageFrame", "PageHeader", "StateSurface", "WorklistShell"]) {
  assert(jsxNodes.some((node) => jsxTagName(node) === component), `members page must render ${component}`);
}

const component = visit(pageTree, (node) => typescript.isFunctionDeclaration(node) && node.name?.text === "TenantMembersPage")[0];
assert(component && component.modifiers?.some((modifier) => modifier.kind === typescript.SyntaxKind.DefaultKeyword), "members page contract must inspect the exported route component");
const memberItemsDeclaration = descendants(component, (node) => typescript.isVariableDeclaration(node) && typescript.isIdentifier(node.name) && node.name.text === "memberItems");
assert.equal(memberItemsDeclaration.length, 1, "route component must define one memberItems value");
assert(typescript.isVariableDeclarationList(memberItemsDeclaration[0].parent)
  && typescript.isVariableStatement(memberItemsDeclaration[0].parent.parent)
  && memberItemsDeclaration[0].parent.parent.parent === component.body,
"memberItems must be a direct top-level declaration in the exported route component");
const memberItemsInitializer = memberItemsDeclaration[0].initializer;
assert(memberItemsInitializer && typescript.isConditionalExpression(memberItemsInitializer), "memberItems must be produced by the live members-length branch");
assert.equal(normalizedExpression(memberItemsInitializer.condition), "members.length>0", "memberItems must enter its row branch only for a non-empty live member list");
assert(typescript.isIdentifier(memberItemsInitializer.whenFalse) && memberItemsInitializer.whenFalse.text === "undefined", "empty members must not render a disconnected row tree");
const memberMapCalls = descendants(memberItemsInitializer.whenTrue, (node) => typescript.isCallExpression(node)
  && typescript.isPropertyAccessExpression(node.expression)
  && node.expression.expression.getText(pageTree) === "members"
  && node.expression.name.text === "map");
assert.equal(memberMapCalls.length, 1, "memberItems live branch must be produced directly from members.map");
assertReachablePath(memberMapCalls[0], memberItemsInitializer.whenTrue, "members.map row source");
assert.equal(memberMapCalls[0].arguments.length, 1, "members.map must use one row renderer");
const memberRowRenderer = memberMapCalls[0].arguments[0];
assert(typescript.isArrowFunction(memberRowRenderer), "members.map row renderer must remain an inline reachable arrow function");

const worklistCallers = jsxNodes.filter((node) => jsxTagName(node) === "WorklistShell");
assert.equal(worklistCallers.length, 1, "members page must render exactly one WorklistShell");
const worklistReturn = ancestors(worklistCallers[0], typescript.isReturnStatement)[0];
assert(worklistReturn && ancestors(worklistReturn, (node) => node === component).length === 1, "WorklistShell must be reachable from the exported route component return");
assert(worklistReturn.parent === component.body, "WorklistShell must be rendered by a direct top-level route return, not a nested or dead wrapper");
const componentStatements = [...component.body.statements];
assert(componentStatements.at(-1) === worklistReturn, "WorklistShell return must be the final reachable statement in the exported route component");
for (const statement of componentStatements.slice(0, -1)) {
  assert(!typescript.isReturnStatement(statement) && !typescript.isThrowStatement(statement), "no unconditional top-level return or throw may make the WorklistShell return unreachable");
}
assert.equal(jsxAttributeExpressionText(worklistCallers[0], "items"), "memberItems", "WorklistShell items slot must receive the live memberItems value");
for (const slot of ["controls", "summary", "state"]) jsxAttributeExpressionText(worklistCallers[0], slot);

const forms = jsxNodes.filter((node) => jsxTagName(node) === "form");
const rowForms = descendants(memberRowRenderer.body, (node) => (typescript.isJsxElement(node) || typescript.isJsxSelfClosingElement(node)) && jsxTagName(node) === "form");
const formsByAction = new Map();
for (const form of forms) {
  const action = jsxAttributeExpressionText(form, "action");
  const bucket = formsByAction.get(action) ?? [];
  bucket.push(form);
  formsByAction.set(action, bucket);
}
assert.equal(formsByAction.get("inviteTenantMemberAction")?.length, 1, "invite panel must preserve the invite action once");
assert.equal(formsByAction.get("updateTenantMemberRoleAction")?.length, 1, "each rendered member row must expose one role-update form definition");
assert.equal(formsByAction.get("sendTenantMemberInvitationAction")?.length, 1, "each rendered invited row must expose one send-invitation form definition");
assert.equal(formsByAction.get("revokeTenantMemberInvitationAction")?.length, 1, "each rendered invited row must expose one revoke-invitation form definition");
assert.equal(formsByAction.get("updateTenantMemberStatusAction")?.length, 2, "member rows must retain remove and suspend/reactivate form definitions");
const inviteFormCondition = enclosingConditional(formsByAction.get("inviteTenantMemberAction")[0]);
assert(inviteFormCondition && normalizedExpression(inviteFormCondition.condition) === "canInvite", "invite form must remain reachable only under the canInvite capability branch");
for (const rowAction of ["updateTenantMemberRoleAction", "sendTenantMemberInvitationAction", "revokeTenantMemberInvitationAction", "updateTenantMemberStatusAction"]) {
  for (const form of formsByAction.get(rowAction)) assert(rowForms.includes(form), `${rowAction} must be reachable inside the live members.map row subtree`);
}
assert.equal(rowForms.length, forms.length - 1, "all forms except the invite panel must belong to the live member row subtree");

function assertTargetedAction(form, expectedActionText, expectedConditionText, conditionOwner = "form") {
  const buttons = descendants(form, (node) => (typescript.isJsxElement(node) || typescript.isJsxSelfClosingElement(node)) && jsxTagName(node) === "button");
  assert.equal(buttons.length, 1, `${expectedActionText} form must contain one action button`);
  const accessibleName = jsxAttributeExpressionText(buttons[0], "aria-label").replace(/\s+/gu, "");
  assert(accessibleName.includes(expectedActionText.replace(/\s+/gu, "")), `${expectedActionText} accessible name must identify the action`);
  assert(accessibleName.includes("member.user.name") && accessibleName.includes("member.user.email"), `${expectedActionText} accessible name must identify the target member by name and email`);
  const conditional = enclosingConditional(conditionOwner === "button" ? buttons[0] : form);
  assert(conditional, `${expectedActionText} form must remain guarded by a conditional expression`);
  assert.equal(normalizedExpression(conditional.condition), expectedConditionText.replace(/\s+/gu, ""), `${expectedActionText} action condition must preserve the approved state/capability gate`);
}

assertTargetedAction(formsByAction.get("updateTenantMemberRoleAction")[0], "ui.saveRole", "canUpdateRole", "button");
assertTargetedAction(formsByAction.get("sendTenantMemberInvitationAction")[0], "ui.sendInvite", 'canInvite && member.status === "invited"');
assertTargetedAction(formsByAction.get("revokeTenantMemberInvitationAction")[0], "ui.revokeInvite", 'canRemove && member.status === "invited"');

const statusForms = formsByAction.get("updateTenantMemberStatusAction");
const removeForm = statusForms.find((form) => descendants(form, (node) => {
  if ((!typescript.isJsxElement(node) && !typescript.isJsxSelfClosingElement(node)) || jsxTagName(node) !== "input") return false;
  const name = jsxAttribute(node, "name");
  const value = jsxAttribute(node, "value");
  return name?.initializer && typescript.isStringLiteral(name.initializer) && name.initializer.text === "status"
    && value?.initializer && typescript.isStringLiteral(value.initializer) && value.initializer.text === "removed";
}).length === 1);
const toggleForm = statusForms.find((form) => form !== removeForm);
assert(removeForm && toggleForm, "status forms must distinguish removal from suspend/reactivate");
assertTargetedAction(removeForm, "ui.remove", 'canRemove && member.status === "active" && member.id !== session.membership.id');
assertTargetedAction(toggleForm, 'member.status === "active" ? ui.suspend : ui.reactivate', 'canRemove && (member.status === "active" || member.status === "suspended")');

const roleFormConditions = ancestors(formsByAction.get("updateTenantMemberRoleAction")[0], typescript.isConditionalExpression)
  .map((conditional) => normalizedExpression(conditional.condition));
assert(roleFormConditions.includes('member.status==="removed"'), "role editor must stay outside the removed-member branch");
assert(roleFormConditions.includes("isCurrentMember(member)&&isActiveCompanyOwner(member)&&activeOwnerCount<=1"), "role editor must stay outside the sole active owner lock branch");
const roleForm = formsByAction.get("updateTenantMemberRoleAction")[0];
const roleConditionals = ancestors(roleForm, typescript.isConditionalExpression);
const removedConditional = roleConditionals.find((conditional) => normalizedExpression(conditional.condition) === 'member.status==="removed"');
const soleOwnerConditional = roleConditionals.find((conditional) => normalizedExpression(conditional.condition) === "isCurrentMember(member)&&isActiveCompanyOwner(member)&&activeOwnerCount<=1");
assert(removedConditional && containsNode(removedConditional.whenFalse, roleForm), "role editor must be in the removed-member condition's false branch");
assert(soleOwnerConditional && containsNode(soleOwnerConditional.whenFalse, roleForm), "role editor must be in the sole-owner lock condition's false branch");
for (const form of rowForms) assertReachablePath(form, memberRowRenderer.body, `${jsxAttributeExpressionText(form, "action")} row form`);
const toggleButton = descendants(toggleForm, (node) => (typescript.isJsxElement(node) || typescript.isJsxSelfClosingElement(node)) && jsxTagName(node) === "button")[0];
assert.equal(jsxAttributeExpressionText(toggleButton, "disabled").replace(/\s+/gu, ""), 'member.id===session.membership.id&&member.status==="active"', "current active member must not be able to suspend their own membership");

const membershipStatusExpressions = visit(pageTree, (node) => typescript.isJsxExpression(node) && node.expression?.getText(pageTree) === "MEMBERSHIP_STATUS_LABELS[member.status][locale]");
const invitationStatusExpressions = visit(pageTree, (node) => typescript.isJsxExpression(node) && node.expression?.getText(pageTree) === "INVITATION_STATUS_LABELS[member.invitationStatus][locale]");
assert.equal(membershipStatusExpressions.length, 1, "member row must render one localized membership status value");
assert.equal(invitationStatusExpressions.length, 1, "member row must render one separately localized invitation status value");
assert(membershipStatusExpressions[0].parent.getText(pageTree).includes("ui.membershipStatus"), "membership status value must share its visible badge with the membership label");
assert(invitationStatusExpressions[0].parent.getText(pageTree).includes("ui.invitationStatus"), "invitation status value must share its visible badge with the invitation label");

assert(page.includes('role={feedbackFailed ? "alert" : "status"}'), "member feedback must expose alert/status semantics");
assert(page.includes('aria-live={feedbackFailed ? "assertive" : "polite"}'), "member feedback must expose live priority");
assert(!page.includes(">{member.status}</span>"), "raw membership status must not be rendered");
assert(page.includes("min-h-11"), "member controls must use the 44px touch contract");
assert(page.includes("flex min-w-0 flex-wrap"), "member controls must wrap on narrow screens");
assert(page.includes("break-words") && page.includes("break-all"), "long member and CJK content must wrap without horizontal scrolling");
assert(page.includes('tone="empty"') && page.includes('tone="error"') && page.includes('tone="permission"'), "empty, error and permission states must remain distinct");
assert(page.includes('href="/"') && page.includes('href="/settings/members"'), "permission and error states must provide recovery paths");
assert(page.includes("activeOwnerCount") && page.includes("confirmSelfDemotion"), "last owner and self-demotion safeguards must remain visible");
assert(page.includes('member.status === "removed"') && page.includes('member.status === "invited"'), "member lifecycle branches must remain explicit");

assert(layout.includes("export function WorklistShell"), "layout system must export WorklistShell");
assert(layout.includes('data-worklist-slot="controls"') && layout.includes('data-worklist-slot="summary"') && layout.includes('data-worklist-slot="items"') && layout.includes('data-worklist-slot="state"'), "WorklistShell must expose only its approved slots");
for (const forbidden of ["Tenant", "member.invite", "membership", "capability", "inviteTenantMemberAction"]) {
  assert(!layout.includes(forbidden), `WorklistShell must not own domain logic: ${forbidden}`);
}
assert(layoutCss.includes(".worklistShell") && layoutCss.includes("var(--bd-line)") && layoutCss.includes("var(--bd-surface)"), "WorklistShell must reuse Broker Desk tokens");
const worklistRule = layoutCss.match(/\.worklistShell\s*\{([^}]*)\}/u)?.[1] ?? "";
assert(!/overflow\s*:\s*(hidden|clip)/u.test(worklistRule), "WorklistShell must not clip descendant focus rings");
assert(layoutCss.includes(".worklistShell button") && layoutCss.includes("var(--bd-control-height-touch)"), "WorklistShell narrow controls must preserve touch targets");

console.log("Settings members shell contract passed");
