import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const page = fs.readFileSync("src/app/page.tsx", "utf8");
const modelSource = fs.readFileSync("src/lib/work-center.ts", "utf8");

function classify(due, today) {
  if (!due) return "unscheduled";
  if (due < today) return "overdue";
  if (due === today) return "today";
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return due <= end.toISOString().slice(0, 10) ? "upcoming" : "later";
}

const today = "2026-08-31";
assert.equal(classify("2026-08-30", today), "overdue");
assert.equal(classify(today, today), "today");
assert.equal(classify("2026-09-06", today), "upcoming");
assert.equal(classify("2026-09-07", today), "later");
assert.equal(classify(undefined, today), "unscheduled");

assert.match(modelSource, /const overdueTasks = snapshot\.tasks\.filter/);
assert.match(modelSource, /const todayTasks = snapshot\.tasks\.filter/);
assert.match(modelSource, /const upcomingTasks = snapshot\.tasks\.filter/);
assert.match(modelSource, /const unscheduledTasks = snapshot\.tasks\.filter/);
assert.match(modelSource, /truncated: snapshot\.hasMoreTasks \|\| snapshot\.hasMoreFollowUps \|\| snapshot\.hasMoreClients/);
assert.match(page, /model\.truncated \? copy\.more/);
assert.match(page, /canWrite \? <form action=\{changeTaskStatusAction\}/);
assert.match(page, /WorkCenterTaskSubmitButton/);
assert.match(page, /name="status" value="done"/);
assert.doesNotMatch(page, /\/tasks/, "Work Center must not retain the retired /tasks route");
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
assert.ok(openActions.every(([, , className]) => /(^| )min-h-11( |$)/.test(className) && /(^| )min-w-11( |$)/.test(className)), "mobile open actions must have a 44px minimum box");
// Render the real route. Only auth, data and framework/action boundaries are
// substituted; no database or Server Action is executed by this test.
const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const modules = new Map();
let locale = "ja";
let session;
let detail;
let resolution;
const action = () => { throw new Error("render must not execute a business action"); };
const actions = { addFollowUp: () => action(), changeTaskStatusAction: () => action(), rescheduleTaskAction: () => action(), updateClientStage: () => action() };
function loadRouteModule(request) {
  if (request === "next/link") return { default: ({ children, ...props }) => React.createElement("a", props, children), __esModule: true };
  if (request === "next/navigation") return { notFound: () => { throw new Error("TEST_NOT_FOUND"); } };
  if (request === "@/app/actions") return actions;
  if (request === "@/lib/locale") return { getLocale: async () => locale };
  if (request === "@/lib/tenant-session") return {
    requireTenantSession: async (input) => { assert.equal(input.permission, "record.read"); return session; },
    getTenantCapability: (membership) => membership.capability ?? "ordinary_member",
  };
  if (request === "@/lib/data") return { getClientDetailForContext: async ({ context, clientId }) => {
    assert.equal(context.userId, session.user.id);
    assert.equal(context.tenantId, session.tenant.id);
    assert.equal(clientId, "test-client");
    return { detail, resolution };
  } };
  if (!request.startsWith("@/")) return require(request);
  const base = path.resolve("src", request.slice(2));
  const filename = [base + ".ts", base + ".tsx"].find((file) => fs.existsSync(file));
  assert(filename, `unresolved test dependency: ${request}`);
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} };
  modules.set(filename, module);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), { fileName: filename, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } });
  new Function("require", "module", "exports", compiled.outputText)(loadRouteModule, module, module.exports);
  return module.exports;
}
const ClientDetailPage = loadRouteModule("@/app/clients/[id]/page").default;
const { registerTenantSessionProvenance } = loadRouteModule("@/lib/tenant-session-provenance");
const fixture = {
  id: "test-client", name: "架空テスト顧客", phone: "TEST", purpose: "residence", stage: "lead",
  quotations: [], budgetType: "total", loanPreApprovalStatus: "none", temperature: "warm",
  brokerageContractType: "none", amlCheckStatus: "not_started",
  tasks: [{ id: "test-task", title: "TEST_TASK_CONTENT", status: "pending", dueAt: new Date("2026-09-10T00:00:00Z"), createdAt: new Date("2026-09-08T00:00:00Z") }],
  followUps: [{ id: "test-follow", type: "email", content: "TEST_FOLLOW_CONTENT", nextAction: "TEST_NEXT_ACTION", nextFollowUpAt: new Date("2026-09-11T00:00:00Z"), createdAt: new Date("2026-09-08T00:00:00Z") }],
};
function identity(capability) {
  session = { externalAuthSubject: "test-subject", user: { id: "test-user", externalAuthSubject: "test-subject" },
    tenant: { id: "test-tenant", status: "active" }, membership: { id: "test-member", userId: "test-user", tenantId: "test-tenant", status: "active", capability } };
  registerTenantSessionProvenance(session);
}
async function renderClient() {
  return renderToStaticMarkup(await ClientDetailPage({ params: Promise.resolve({ id: "test-client" }), searchParams: Promise.resolve({}) }));
}
identity("ordinary_member");
detail = fixture;
resolution = { canRead: true, canWrite: false, outcome: "company_read" };
const ordinaryHtml = await renderClient();
assert(ordinaryHtml.includes("TEST_TASK_CONTENT"), "ordinary task destination must render its authorized task content");
assert(ordinaryHtml.includes("TEST_FOLLOW_CONTENT") && ordinaryHtml.includes("TEST_NEXT_ACTION"), "ordinary destination must retain authorized follow-up and next action");
assert.doesNotMatch(ordinaryHtml, /<(?:form|button|input|select|textarea)\b/, "read-only destination must have no write controls");
const { formatDate } = loadRouteModule("@/lib/format");
for (const [language, restriction, emptyTask, emptyFollow] of [
  ["ja", "完了・延期・変更はできません", "未完了タスクはありません", "フォロー履歴はありません"],
  ["zh", "不能完成、延期或修改", "暂无未完成任务", "暂无跟进记录"],
  ["ko", "완료, 연기 또는 수정할 수 없습니다", "미완료 작업이 없습니다", "팔로업 이력이 없습니다"],
]) {
  locale = language;
  detail = fixture;
  const html = await renderClient();
  for (const anchor of ["client-tasks", "client-follow-ups"]) {
    assert.equal(html.split(`id="${anchor}"`).length - 1, 1, `${language}: one visible ${anchor} destination`);
  }
  for (const content of [fixture.name, "TEST_TASK_CONTENT", "TEST_FOLLOW_CONTENT", "TEST_NEXT_ACTION", restriction,
    formatDate(fixture.tasks[0].dueAt, locale), formatDate(fixture.followUps[0].nextFollowUpAt, locale)]) {
    assert(html.includes(content), `${language}: destination is missing ${content}`);
  }
  assert.doesNotMatch(html, /<(?:form|button|input|select|textarea)\b/);
  assert(html.includes('href="/clients"'), "ordinary reader can return to client list");
  detail = { ...fixture, tasks: [], followUps: [] };
  const emptyHtml = await renderClient();
  assert(emptyHtml.includes(emptyTask) && emptyHtml.includes(emptyFollow), `${language}: honest empty state`);
  assert(!emptyHtml.includes("TEST_TASK_CONTENT") && !emptyHtml.includes("TEST_FOLLOW_CONTENT"));
}
for (const [language, labels] of [
  ["ja", ["未着手", "完了", "取消"]],
  ["zh", ["未开始", "已完成", "已取消"]],
  ["ko", ["미착수", "완료", "취소"]],
]) {
  locale = language;
  for (const [index, status] of ["pending", "done", "canceled"].entries()) {
    detail = { ...fixture, tasks: [{ ...fixture.tasks[0], status }] };
    assert((await renderClient()).includes(`${labels[index]} · `), `${language}: ${status} must appear as task status, not only in restriction copy`);
  }
}
detail = fixture;
resolution = { canRead: false, canWrite: false, outcome: "not_accessible" };
await assert.rejects(renderClient, /TEST_NOT_FOUND/, "unreadable client must not render even if data is supplied");
detail = null;
resolution = { canRead: true, canWrite: false, outcome: "company_read" };
await assert.rejects(renderClient, /TEST_NOT_FOUND/, "missing client must stay notFound");

identity("company_owner");
detail = fixture;
resolution = { canRead: true, canWrite: true, outcome: "owner_write" };
const ownerTree = await ClientDetailPage({ params: Promise.resolve({ id: "test-client" }), searchParams: Promise.resolve({}) });
const ownerActions = [];
function collectActions(node) {
  if (Array.isArray(node)) { node.forEach(collectActions); return; }
  if (!React.isValidElement(node)) return;
  if (node.type === "form") ownerActions.push(node.props.action);
  collectActions(node.props.children);
}
collectActions(ownerTree);
assert.equal(ownerActions.length, 5, "owner retains follow-up, stage, complete, cancel and reschedule forms");
assert.deepEqual(ownerActions, [actions.addFollowUp, actions.updateClientStage, actions.changeTaskStatusAction, actions.changeTaskStatusAction, actions.rescheduleTaskAction], "owner forms retain existing Actions and order");
const ownerHtml = renderToStaticMarkup(ownerTree);
assert(ownerHtml.includes("TEST_TASK_CONTENT") && ownerHtml.includes("TEST_FOLLOW_CONTENT"));
for (const anchor of ["client-tasks", "client-follow-ups"]) assert.equal(ownerHtml.split(`id="${anchor}"`).length - 1, 1);
console.log("Work Center behavior: PASS");
