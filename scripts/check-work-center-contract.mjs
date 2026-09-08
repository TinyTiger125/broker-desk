import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

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
assert.ok(fs.existsSync("src/app/service-requests/page.tsx"), "existing service-request task route must remain available");
assert.doesNotMatch(page, /\/tasks/, "Work Center must not expose the retired /tasks route");
const todayStart = page.indexOf('aria-labelledby="work-center-today"');
const waitingStart = page.indexOf('aria-labelledby="work-center-waiting"');
assert.ok(todayStart >= 0 && waitingStart > todayStart, "today and waiting sections must remain distinct");
const todaySection = page.slice(todayStart, waitingStart);
assert.doesNotMatch(todaySection, /href="\/(?:tasks|service-requests)"/, "today heading must not expose an invalid global task entry point");
assert.match(page, /href=\{`\/clients\/\$\{encodeURIComponent\(client\.id\)\}#client-tasks`\}/, "task rows must retain client task deep links");
const weeklyStart = page.indexOf('aria-labelledby="work-center-weekly"');
const recentStart = page.indexOf('aria-labelledby="work-center-recent"');
assert.ok(weeklyStart >= 0 && recentStart > weeklyStart, "weekly and recent sections must remain distinct");
const weeklySection = page.slice(weeklyStart, recentStart);
assert.match(weeklySection, /<CommunicationSignals model=\{model\} copy=\{copy\} locale=\{locale\} \/>/, "weekly checks must consume communication signals");
assert.doesNotMatch(weeklySection, /<ImportSignals jobs=\{importJobs\}/, "weekly checks must not consume import jobs");
assert.match(page, /function CommunicationSignals\(\{ model, copy, locale \}/, "email signals must be rendered from the Work Center model");
assert.match(page, /const signals = model\.communicationSignals\.slice\(0, 8\)/, "weekly checks must use the bounded communication signal collection");
assert.match(page, /signals\.map\(\(\{ followUp, client \}\)/, "communication signals must preserve follow-up and client context");
const communicationStart = page.indexOf("function CommunicationSignals");
const communicationEnd = page.indexOf("export default async function HomePage", communicationStart);
assert.ok(communicationStart >= 0 && communicationEnd > communicationStart, "communication signal renderer must remain a local component");
const communicationSource = page.slice(communicationStart, communicationEnd);
assert.match(communicationSource, /#client-follow-ups/, "communication signals must retain the client follow-up deep link");
assert.match(communicationSource, /className="[^"]*min-h-11[^"]*min-w-11[^"]*items-center[^"]*justify-center[^"]*"[^>]*>\{copy\.open\}/, "communication signal open action must expose a 44px touch target");
assert.match(page, /<Link href=\{item\.href\} className="[^"]*min-h-11[^"]*min-w-11[^"]*items-center[^"]*justify-center[^"]*">\{copy\.continueItem\}<\/Link>/, "saved-item continue action must expose a 44px touch target");
const taskAction = fs.readFileSync("src/components/work-center-task-action.tsx", "utf8");
assert.match(taskAction, /className="[^"]*min-h-11[^"]*min-w-11[^"]*items-center[^"]*justify-center[^"]*"/, "task completion action must expose a 44px touch target");
assert.match(page, /buildHomeResumableWork\(\{ locale, query: searchQuery, cases, importJobs \}\)/, "import jobs must remain available to recovery work");
const openActions = [...page.matchAll(/<Link href="(\/clients)" className="([^"]+)">\{copy\.open\}<\/Link>/g)];
assert.deepEqual(openActions.map((match) => match[1]), ["/clients"]);
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
const ts = createRequire(import.meta.url)("typescript");
const destination = fs.readFileSync("src/app/clients/[id]/page.tsx", "utf8");
const tree = ts.createSourceFile("page.tsx", destination, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(tree.parseDiagnostics.length, 0, "task destination must parse");
const route = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "ClientDetailPage");
assert(route?.body);
const guards = route.body.statements.filter(ts.isIfStatement);
const denied = guards.find((node) => node.expression.getText(tree).includes("!visible.resolution.canRead"));
const readonly = guards.find((node) => node.expression.getText(tree) === "!canEdit");
assert(denied && readonly && denied.pos < readonly.pos, "read authorization must precede display branches");
assert(denied.thenStatement.getText(tree).includes("notFound()"), "unreadable client stays fail-closed");
function descendants(node, predicate, found = []) {
  if (predicate(node)) found.push(node);
  ts.forEachChild(node, (child) => { descendants(child, predicate, found); });
  return found;
}
const readonlySource = readonly.thenStatement.getText(tree);
const readonlyTags = descendants(readonly.thenStatement, (node) => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node));
assert(!readonlyTags.some((node) => ["form", "button", "input", "select", "textarea"].includes(node.tagName.getText(tree))), "read-only branch cannot contain write controls");
assert(!descendants(readonly.thenStatement, ts.isJsxAttribute).some((node) => ["action", "formAction", "onSubmit"].includes(node.name.getText(tree))), "read-only branch cannot bind a mutation");
for (const collection of ["client.tasks.map", "client.followUps.map"]) {
  assert(descendants(readonly.thenStatement, ts.isCallExpression).some((node) => node.expression.getText(tree) === collection), `read-only route must render ${collection}`);
}
for (const anchor of ["client-tasks", "client-follow-ups"]) {
  const element = readonlyTags.find((node) => node.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.text === "id" && attribute.initializer?.text === anchor));
  assert(element && element.parent.getText(tree).includes("<SectionCard"), `${anchor} must wrap visible content, not an empty anchor`);
  assert(!element.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.text === "hidden"));
}
assert(!readonlySource.includes("client.quotations"), "task repair must not expand shared quotation display");
console.log("Work Center contract: PASS");
