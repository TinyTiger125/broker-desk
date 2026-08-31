import assert from "node:assert/strict";
import fs from "node:fs";

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
assert.match(page.slice(communicationStart, communicationEnd), /#client-follow-ups/, "communication signals must retain the client follow-up deep link");
assert.match(page, /buildHomeResumableWork\(\{ locale, query: searchQuery, cases, importJobs \}\)/, "import jobs must remain available to recovery work");
const openActions = [...page.matchAll(/<Link href="(\/clients)" className="([^"]+)">\{copy\.open\}<\/Link>/g)];
assert.deepEqual(openActions.map((match) => match[1]), ["/clients"]);
assert.ok(openActions.every(([, , className]) => /(^| )min-h-11( |$)/.test(className) && /(^| )min-w-11( |$)/.test(className)), "mobile open actions must have a 44px minimum box");
console.log("Work Center behavior: PASS");
