#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/import-center-recent.ts", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../src/app/import-center/page.tsx", import.meta.url), "utf8");
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
assert.match(page, /buildImportCenterRecentInputs\(\{/);
assert.match(page, /locale === "zh" \? "顾客资料" : locale === "ko" \? "고객 자료" : "顧客情報"/);
assert.match(page, /targetEntity: job\.targetEntity/);
assert.match(page, /linkedCaseId: caseByImportJobId\.get\(job\.id\)\?\.id/);
for (const icon of ["business_center", "group", "apartment", "description"]) {
  assert(page.includes(icon), `recent category UI must include the ${icon} icon`);
}
assert.match(partyPage, /createClientFormAction/);
assert.match(partyPage, /params\.from === "entry" \? "\/import-center"/);
assert.match(actions, /client = await addClient\(\{ tenantId, ownerUserId: user\.id, \.\.\.parsed\.normalized \}\)/);
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
    entry("case-imported", at(59), { sourceImportJobIds: ["job-1"] }),
    entry("case-manual", at(20), { sourceImportJobIds: [], category: "case" }),
  ],
  clients: [entry("client-manual", at(40), { category: "person" })],
  fileJobs: [entry("job-1", at(50), { targetEntity: "properties" }), entry("job-failed", at(10))],
});
assert.equal(
  JSON.stringify(recent.map((item) => item.id)),
  JSON.stringify(["job-1", "client-manual", "case-manual"]),
  "manual records and persisted file jobs must share one newest-first list; imported cases must not duplicate their file job",
);
assert.equal(
  JSON.stringify(recent.map((item) => item.category)),
  JSON.stringify(["property", "person", "case"]),
  "categories must follow persisted target/record type without changing the shared order",
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

const empty = buildImportCenterRecentInputs({ cases: [], clients: [], fileJobs: [], limit: 0 });
assert.equal(JSON.stringify(empty), JSON.stringify([]), "an empty persisted read must not synthesize a recent record");

console.log("import center recent inputs: PASS");
