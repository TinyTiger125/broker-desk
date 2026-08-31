import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("src/app/page.tsx", "utf8");
const memory = fs.readFileSync("src/lib/data.memory.ts", "utf8");
const postgres = fs.readFileSync("src/lib/data.postgres.ts", "utf8");
const data = fs.readFileSync("src/lib/data.ts", "utf8");
const model = fs.readFileSync("src/lib/work-center.ts", "utf8");
const actionButton = fs.readFileSync("src/components/work-center-task-action.tsx", "utf8");

for (const label of ["今日の重点", "今日の重点", "今日重点", "오늘의 주요 업무", "作業センター", "工作中枢", "업무 센터", "七日間の予定", "七日议程", "7일 일정", "フォロー待ち", "等待跟进", "후속 연락 대기", "週次チェック", "周度检查", "주간 점검"]) {
  assert.match(page, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing locale copy: ${label}`);
}
for (const marker of ["getWorkCenterSnapshotForContext", "listBrokerageCasesForContext", "listHubImportJobs", "changeTaskStatusAction", "buildWorkCenterModel", "buildHomeResumableWork", "/clients/", "/import-center"]) {
  assert.match(page, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing work-center marker: ${marker}`);
}
const openActions = [...page.matchAll(/<Link href="(\/tasks|\/clients)" className="([^"]+)">\{copy\.open\}<\/Link>/g)];
assert.deepEqual(openActions.map((match) => match[1]), ["/tasks", "/clients"]);
for (const [, , className] of openActions) {
  assert.match(className, /(^| )min-h-11( |$)/);
  assert.match(className, /(^| )min-w-11( |$)/);
  assert.match(className, /(^| )items-center( |$)/);
  assert.match(className, /(^| )justify-center( |$)/);
}
assert.match(memory, /tenantId === input\.context\.tenantId/);
assert.match(memory, /resolveRecordVisibility\(input\.context/);
assert.match(memory, /taskLimit = 100/);
assert.match(memory, /hasMoreTasks/);
assert.match(postgres, /WHERE t\.tenant_id = \$1/);
assert.match(postgres, /resolveRecordVisibility\(input\.context/);
assert.match(postgres, /LIMIT \$3/);
assert.match(data, /repo\.getWorkCenterSnapshotForContext/);
assert.match(model, /overdueTasks/);
assert.match(model, /unscheduledTasks/);
assert.match(model, /truncated: snapshot\.hasMoreTasks/);
assert.match(actionButton, /useFormStatus/);
assert.match(actionButton, /disabled=\{pending\}/);
assert.doesNotMatch(page, /Gmail|Outlook|sendEmail|aiWrite/);
assert.doesNotMatch(page, /company_read|owner_write|private/);
console.log("Work Center contract: PASS");
