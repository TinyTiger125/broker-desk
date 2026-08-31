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
console.log("Work Center behavior: PASS");
