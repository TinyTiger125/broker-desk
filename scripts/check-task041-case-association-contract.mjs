import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
};
const expect = (condition, message) => {
  if (!condition) fail(message);
};

const roles = ["主要申请人", "承租人", "同住人", "连带保证人", "紧急联系人", "出租人／业主", "其他关联人"];
const association = read("src/lib/case-associations.ts");
const newCase = read("src/components/case-association-draft.tsx");
const manager = read("src/components/case-association-manager.tsx");
const actions = read("src/app/actions.ts");
const page = read("src/app/cases/new/page.tsx");
const task = read("docs/tasks/TASK-041.md");

const approvedJaMappings = [
  ["案件草稿格式不正确，请重新选择资料。", "案件草稿の形式が正しくありません。資料を選び直してください。"],
  ["案件资料草稿格式不正确，请重新操作。", "案件資料の下書き形式が正しくありません。もう一度お試しください。"],
  ["一个案件最多只能有一位主要申请人。", "1案件につき、主たる申込人は1名までです。"],
  ["人物至少需要一个案件角色。", "人物には案件内の役割を1つ以上指定してください。"],
  ["选择的人物不存在或当前用户无法使用。", "選択した人物が存在しないか、利用する権限がありません。"],
  ["选择的物件不存在或当前用户无法使用。", "選択した物件が存在しないか、利用する権限がありません。"],
  ["案件保存失败，请保留当前草稿后重试。", "案件を保存できませんでした。現在の草稿を残したまま、もう一度お試しください。"],
  ["案件が見つからないか、保存できませんでした。", "案件が見つからないか、保存できませんでした。"],
];
const sourceString = (value) => JSON.stringify(value);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const readJaMapping = (message) => {
  const pattern = new RegExp(
    `${escapeRegExp(sourceString(message))}\\s*:\\s*\\{\\s*ja:\\s*(${escapeRegExp('"')}[^\\n]*?${escapeRegExp('"')})`,
    "u",
  );
  const match = association.match(pattern);
  return match ? JSON.parse(match[1]) : undefined;
};

expect(roles.every((role) => association.includes(`"${role}"`)), "approved role set is incomplete");
expect((association.match(/"主要申请人"/g) ?? []).length >= 3, "primary applicant role is not represented in validation and serialization");
expect(association.includes("CASE_ASSOCIATION_VERSION = 1"), "association payload version is missing");
for (const [message, expectedJa] of approvedJaMappings) {
  const actualJa = readJaMapping(message);
  expect(actualJa === expectedJa, `ja mapping mismatch for ${message}`);
  expect(!/(格式|不正确|当前用户|重新|请)/u.test(actualJa ?? ""), `ja mapping contains Chinese syntax for ${message}`);
}
expect(association.includes("CASE_ASSOCIATION_ERROR_FALLBACKS"), "locale-specific error fallbacks are missing");
expect(association.includes("CASE_ASSOCIATION_ERROR_MESSAGES[message]?.[locale] ?? CASE_ASSOCIATION_ERROR_FALLBACKS[locale]"), "unknown errors are not forced through the locale-specific fallback");
expect(association.includes("ja: \"案件の処理中に問題が発生しました。入力内容を確認して、もう一度お試しください。\""), "ja fallback is not the safe approved message");
expect(!association.includes("?? message"), "unknown errors can still be exposed verbatim");
expect(actions.includes("saveBrokerageCaseExtractionReview({") && actions.includes("confirmedDataJson: initialConfirmedData"), "new case does not use the existing atomic case save path");
expect(actions.includes("associationDraft.parties.map((party) => resolveClientVisibilityForContext"), "new case does not re-check every person candidate on the server");
expect(actions.includes("associationDraft.primaryPropertyId\n    ? await resolvePropertyVisibilityForContext"), "new case does not re-check the property candidate on the server");
expect(actions.includes("updateBrokerageCaseConfirmedData({") && actions.includes("primaryPropertyId: associationDraft.primaryPropertyId ?? null"), "existing-case association save does not update the primary property atomically with the payload");
expect(page.includes("createCaseAction={createBlankBrokerageCaseAction}"), "new case page is not wired to the approved action");
expect(newCase.includes("主资料已创建，并已加入本次案件草稿；创建案件后正式关联。"), "new-case quick-create feedback is missing");
expect(newCase.includes("已在本次草稿"), "new-case duplicate status is missing");
expect(!newCase.includes("已关联"), "new-case UI contains existing-case relation wording");
expect(!newCase.match(/owner_write|company_read|private/i), "new-case UI exposes internal permission terminology");
expect(manager.includes("已关联"), "existing-case duplicate status is missing");
expect(manager.includes("删除最后一个角色后将解除关联"), "last-role removal confirmation is missing");
expect(manager.includes("解除主要物件"), "primary property removal action is missing");
expect(!manager.match(/owner_write|company_read|private/i), "existing-case association UI exposes internal permission terminology");
expect(newCase.includes("explicitReturnTarget = returnFocusRef?.current") && newCase.includes("target?.isConnected") && newCase.includes("target.focus()"), "FocusDialog must restore focus to a connected origin or safe fallback");
expect(newCase.includes("data-case-association-focus-target") && manager.includes("data-case-association-focus-target"), "case association dialog triggers must provide a predictable focus fallback");
expect(newCase.includes('if (event.key === "Escape")') && newCase.includes("onCloseRef.current()"), "FocusDialog Escape close path is missing");
expect(task.includes("不部署 Production，不执行 Production migration") && task.includes("不新增数据库表或 migration"), "task boundary does not preserve the production and migration gate");

if (!process.exitCode) console.log("TASK-041 case association contract: PASS");
