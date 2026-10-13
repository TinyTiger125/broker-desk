#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/import-center-recent.ts", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../src/app/import-center/page.tsx", import.meta.url), "utf8");
const memoryData = fs.readFileSync(new URL("../src/lib/data.memory.ts", import.meta.url), "utf8");
const postgresData = fs.readFileSync(new URL("../src/lib/data.postgres.ts", import.meta.url), "utf8");
const partyPage = fs.readFileSync(new URL("../src/app/parties/new/page.tsx", import.meta.url), "utf8");
const actions = fs.readFileSync(new URL("../src/app/actions.ts", import.meta.url), "utf8");
const module = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { module, exports: module.exports },
);
const { buildImportCenterRecentInputs } = module.exports;

assert.match(page, /listBrokerageCasesForContext\(\{ context: hubContext\.requestContext/);
assert.match(page, /listClientsForContext\(\{ context: hubContext\.requestContext/);
assert.match(page, /listPropertiesForContext\(\{ context: hubContext\.requestContext/);
assert.match(page, /listRecentPropertyActivitiesForContext\(\{ context: hubContext\.requestContext, since: recentSince \}\)/);
assert.match(page, /listHubImportJobs\(hubContext, locale, null\)/);
assert.match(page, /listHubImportJobs\(hubContext, locale, null, recentSince\)/);
assert.match(page, /fileJobs: recentJobs\.map/);
assert.match(page, /listBrokerageCasesForContext\(\{ context: hubContext\.requestContext, updatedSince: recentSince \}\)/);
assert.match(page, /updatedSince: recentSince/);
assert.match(page, /createdSince: recentSince/);
assert.match(memoryData, /updatedSince\?: Date/);
assert.match(memoryData, /!updatedSince \|\| item\.updatedAt >= updatedSince/);
assert.match(memoryData, /createdSince\?: Date/);
assert.match(memoryData, /!input\.createdSince \|\| item\.createdAt >= input\.createdSince/);
assert.match(memoryData, /listRecentPropertyActivitiesForContext/);
assert.match(memoryData, /property\.lifecycleStatus \?\? "active"\) === "active"/);
const memoryPropertyActivity = memoryData.slice(memoryData.indexOf("export async function listRecentPropertyActivitiesForContext"), memoryData.indexOf("export type VisiblePropertyDetail", memoryData.indexOf("export async function listRecentPropertyActivitiesForContext")));
assert(!memoryPropertyActivity.includes("input.limit ?? 200"), "memory property activity reader must not truncate before visibility checks");
for (const action of ["property_created", "property_updated", "object_import_confirm", "record_archived", "record_restored"]) {
  assert(memoryData.includes(`"${action}"`), `memory property activity must include ${action}`);
}
assert.match(postgresData, /updated_at >= \$\$\{parameterIndex\+\+\}/);
assert.match(postgresData, /created_at >= \$3/);
assert.match(postgresData, /listRecentPropertyActivitiesForContext/);
assert.match(postgresData, /resolveRecordVisibility\(input\.context/);
assert.match(postgresData, /COALESCE\(p\.lifecycle_status, 'active'\) = 'active'/);
const postgresPropertyActivity = postgresData.slice(postgresData.indexOf("export async function listRecentPropertyActivitiesForContext"), postgresData.indexOf("export type VisiblePropertyDetail", postgresData.indexOf("export async function listRecentPropertyActivitiesForContext")));
assert(!postgresPropertyActivity.includes("input.limit ?? 200"), "postgres property activity reader must not truncate before visibility checks");
assert.match(page, /recentPageSize = 5/);
assert.match(page, /recentPageItems/);
assert.match(page, /最近录入与修改/);
assert.match(page, /chevron_left/);
assert.match(page, /chevron_right/);
assert.match(page, /buildImportCenterRecentInputs\(\{/);
assert.match(page, /locale === "zh" \? "顾客资料" : locale === "ko" \? "고객 자료" : "顧客情報"/);
assert.match(page, /targetEntity: job\.targetEntity/);
assert.match(page, /linkedCaseId: caseByImportJobId\.get\(job\.id\)\?\.id/);
for (const icon of ["business_center", "group", "apartment", "description"]) {
  assert(page.includes(icon), `recent category UI must include the ${icon} icon`);
}
assert.match(partyPage, /createClientFormAction/);
assert.match(partyPage, /params\.from === "entry" \? "\/import-center"/);
assert.match(
  actions,
  /if \(mode === "create"\) \{[\s\S]*?client = await addClient\(\{[\s\S]*?tenantId,[\s\S]*?ownerUserId: user\.id,[\s\S]*?\.\.\.parsed\.normalized/,
  "manual client creation must persist through the tenant-owned addClient path",
);
assert.match(actions, /IMPORT_CENTER_RETURN_PATH\}\?flash=client_created/);
assert.match(page, /href: `\/clients\/\$\{encodeURIComponent\(client\.id\)\}`/);
for (const sourceLabel of ["手动顾客", "수기 고객", "手入力顧客"]) {
  assert(!page.includes(sourceLabel), `recent customer entries must not claim a manual source: ${sourceLabel}`);
}

const at = (minutes) => new Date(Date.UTC(2026, 9, 12, 0, minutes));
const entry = (id, updatedAt, extra = {}) => ({
  id,
  title: id,
  type: "fixture",
  href: `/${id}`,
  updatedAt,
  category: "unknown",
  ...extra,
});

const recent = buildImportCenterRecentInputs({
  cases: [
    entry("case:case-imported", at(59), { sourceImportJobIds: ["job-1"] }),
    entry("case:case-manual", at(20), { sourceImportJobIds: [], category: "case" }),
  ],
  clients: [entry("client-manual", at(40), { category: "person" })],
  fileJobs: [entry("job-1", at(50), { targetEntity: "properties", linkedCaseId: "case-imported" }), entry("job-failed", at(10))],
  limit: 3,
});
assert.equal(
  JSON.stringify(recent.map((item) => item.id)),
  JSON.stringify(["case:case-imported", "client-manual", "case:case-manual"]),
  "the newest case activity replaces its older linked file job while other records stay newest-first",
);
assert.equal(
  JSON.stringify(recent.map((item) => item.category)),
  JSON.stringify(["case", "person", "case"]),
  "categories must follow persisted record type without changing the shared order",
);

const associationFallback = buildImportCenterRecentInputs({
  fileJobs: [
    entry("job-case", at(30), { targetEntity: "contracts", linkedCaseId: "case-1" }),
    entry("job-unknown", at(29), { targetEntity: "contracts" }),
  ],
});
assert.equal(
  JSON.stringify(associationFallback.map((item) => item.category)),
  JSON.stringify(["case", "unknown"]),
  "a linked case may classify an otherwise non-case target, while an unlinked target remains neutral",
);

const bounded = buildImportCenterRecentInputs({
  cases: [
    entry("case-b", at(1), { sourceImportJobIds: [], category: "case" }),
    entry("case-a", at(1), { sourceImportJobIds: [], category: "case" }),
  ],
  limit: 1,
});
assert.equal(JSON.stringify(bounded.map((item) => item.id)), JSON.stringify(["case-a"]), "equal timestamps must have deterministic ordering and respect the limit");

const now = at(60);
const withinWindow = buildImportCenterRecentInputs({
  cases: [
    entry("case:case-8-days-old", new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000), { sourceImportJobIds: [] }),
    entry("case:case-7-days-old", new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), { sourceImportJobIds: [] }),
    entry("case:case-new", new Date(now.getTime() - 2 * 60 * 60 * 1000), { sourceImportJobIds: [] }),
  ],
  properties: [entry("property-created", new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), { category: "property" })],
  since: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
});
assert.equal(
  JSON.stringify(withinWindow.map((item) => item.id)),
  JSON.stringify(["case:case-new", "property-created", "case:case-7-days-old"]),
  "the seven-day boundary is inclusive, older records are excluded, and property creation activity remains visible",
);

const sixItems = buildImportCenterRecentInputs({
  clients: Array.from({ length: 6 }, (_, index) => entry(`party-${index}`, new Date(now.getTime() - index * 60_000), { category: "person" })),
});
assert.equal(sixItems.length, 6, "the helper must return all recent candidates so the page can paginate instead of truncating at three");

const untouched = entry("unchanged", at(55), { category: "person" });
const untouchedTime = untouched.updatedAt.getTime();
buildImportCenterRecentInputs({ clients: [untouched] });
assert.equal(untouched.updatedAt.getTime(), untouchedTime, "reading recent activity must not mutate persisted timestamps");

const empty = buildImportCenterRecentInputs({ cases: [], clients: [], properties: [], fileJobs: [], limit: 0 });
assert.equal(JSON.stringify(empty), JSON.stringify([]), "an empty persisted read must not synthesize a recent record");

console.log("import center recent inputs: PASS");
