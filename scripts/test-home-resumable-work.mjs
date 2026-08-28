import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const helperPath = resolve(root, "src/lib/home-resumable-work.ts");
const pagePath = resolve(root, "src/app/page.tsx");
const hubPath = resolve(root, "src/lib/hub.ts");

require.extensions[".ts"] = (module, filename) => {
  const result = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};

const { buildHomeResumableWork } = require(helperPath);
const now = new Date("2026-08-28T10:00:00.000Z");

const result = buildHomeResumableWork({
  locale: "zh",
  cases: [
    { id: "case-draft", title: "草稿案件", status: "draft", updatedAt: now, sourceImportJobIds: [] },
    { id: "case-reviewed", title: "已检查案件", status: "reviewed", updatedAt: now, sourceImportJobIds: [] },
  ],
  importJobs: [],
});

assert.deepEqual(result.map((item) => item.id), ["case:case-draft"], "only recoverable draft cases belong on home");
assert.equal(result[0].href, "/cases/case-draft", "draft cases resume at their persisted case");

const combined = buildHomeResumableWork({
  locale: "ja",
  cases: [
    { id: "case-older", title: "Older", status: "draft", updatedAt: new Date("2026-08-28T01:00:00Z"), sourceImportJobIds: [] },
    { id: "case-linked", title: "Linked", status: "draft", updatedAt: new Date("2026-08-28T03:00:00Z"), sourceImportJobIds: ["job-linked"] },
    { id: "case-mid", title: "Mid", status: "draft", updatedAt: new Date("2026-08-28T05:00:00Z"), sourceImportJobIds: [] },
  ],
  importJobs: [
    { id: "job-complete", title: "Complete", sourceType: "excel", status: "completed", createdAt: now, updatedAt: new Date("2026-08-28T10:00:00Z") },
    { id: "job-unknown", title: "Unknown", sourceType: "pdf", status: "mystery", createdAt: now, updatedAt: new Date("2026-08-28T09:00:00Z") },
    { id: "job-input", title: "Input", sourceType: "scan", status: "processing", notes: JSON.stringify({ kind: "identity_import_source" }), createdAt: now, updatedAt: new Date("2026-08-28T08:00:00Z") },
    { id: "job-batch", title: "Batch recovery", sourceType: "excel", status: "mapped", createdAt: now, updatedAt: new Date("2026-08-28T07:00:00Z") },
    { id: "job-linked", title: "Linked source", sourceType: "pdf", status: "failed", createdAt: now, updatedAt: new Date("2026-08-28T06:00:00Z") },
    { id: "job-queued", title: "Queued", sourceType: "excel", status: "queued", createdAt: now, updatedAt: new Date("2026-08-28T04:00:00Z") },
  ],
});

assert.deepEqual(combined.map((item) => item.id), ["source:job-input", "source:job-batch", "source:job-linked", "case:case-mid", "source:job-queued"], "items are fail-closed, sorted by updatedAt and capped at five");
assert.equal(combined[0].href, "/import-center?xlsxJob=job-input#source-upload", "input extraction keeps its deep recovery path");
assert.equal(combined[1].href, "/import-center?job=job-batch&advanced=1#job-mapping", "legacy batch mapping remains recoverable without a batch entry point");
assert.equal(combined[2].href, "/cases/case-linked#case-main-editor", "linked source resumes in its visible case");
assert(combined.every((item) => item.reason.length > 0), "every item explains why it can be resumed");

const searched = buildHomeResumableWork({
  locale: "zh",
  query: "唯一命中",
  cases: Array.from({ length: 6 }, (_, index) => ({
    id: `search-case-${index + 1}`,
    title: index === 5 ? "唯一命中案件" : `其他案件 ${index + 1}`,
    status: "draft",
    updatedAt: new Date(`2026-08-${28 - index}T10:00:00Z`),
    sourceImportJobIds: [],
  })),
  importJobs: [],
});
assert.deepEqual(searched.map((item) => item.id), ["case:search-case-6"], "search must filter all eligible work before the five-item limit");

const pageSource = readFileSync(pagePath, "utf8");
const hubSource = readFileSync(hubPath, "utf8");
assert(pageSource.includes("createRequestContext(session)"), "home must derive visibility from the authenticated session");
assert(pageSource.includes("listBrokerageCasesForContext({ context: requestContext"), "home must use the visibility-resolved case read path");
assert(pageSource.includes("listHubImportJobs({ userId: session.user.id, tenantId: session.tenant.id }, locale)"), "home imports must be scoped to the current user and tenant while retaining locale behavior");
assert(pageSource.includes("buildHomeResumableWork("), "home must delegate filtering and ordering to the tested policy");
assert(pageSource.includes("query: searchQuery"), "home must pass search into the resumable-work policy before limiting");
assert(hubSource.includes("updatedAt: item.updatedAt"), "home import candidates must expose persisted update time");
console.log("home resumable work behavior: PASS");
