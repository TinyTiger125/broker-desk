import assert from "node:assert/strict";
import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("vercel.worker-hnd1.json", "utf8"));
const route = fs.readFileSync("src/app/api/internal/import-jobs/cron/route.ts", "utf8");

assert.deepEqual(config.regions, ["hnd1"], "Tokyo worker config must use hnd1");
assert.deepEqual(config.crons, [{ path: "/api/internal/import-jobs/cron", schedule: "* * * * *" }], "Tokyo worker config must schedule the cron route every minute");
assert.match(route, /export async function GET\(request: Request\)/, "Tokyo worker must expose a GET cron entrypoint");
assert.match(route, /process\.env\.CRON_SECRET/, "cron entrypoint must validate CRON_SECRET");
assert.match(route, /process\.env\.BROKER_DESK_IMPORT_WORKER_TOKEN/, "cron entrypoint must forward the worker token");
assert.match(route, /POST as drainImportJobs/, "cron entrypoint must reuse the existing drain contract");
assert.match(route, /limit: 3/, "cron entrypoint must use the bounded worker batch");
assert.match(route, /logOperationalEvent/, "cron entrypoint must emit structured operational logs");
assert.match(route, /durationMs/, "cron entrypoint must emit duration in structured logs");

console.log("worker Tokyo cron contract: PASS");
