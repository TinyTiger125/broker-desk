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

expect(roles.every((role) => association.includes(`"${role}"`)), "approved role set is incomplete");
expect((association.match(/"主要申请人"/g) ?? []).length >= 3, "primary applicant role is not represented in validation and serialization");
expect(association.includes("CASE_ASSOCIATION_VERSION = 1"), "association payload version is missing");
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
expect(task.includes("不部署 Production，不执行 Production migration") && task.includes("不新增数据库表或 migration"), "task boundary does not preserve the production and migration gate");

if (!process.exitCode) console.log("TASK-041 case association contract: PASS");
