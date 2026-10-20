#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;
const resolveCandidate = (value) => [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`]
  .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
Module._resolveFilename = function(request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
const compile = (module, filename) => module._compile(typescript.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, jsx: typescript.JsxEmit.ReactJSX, esModuleInterop: true },
  fileName: filename,
}).outputText, filename);
require.extensions[".ts"] = compile;
require.extensions[".tsx"] = compile;

const originalLoad = Module._load;
let readerCalls = 0;
let readerGate = null;
let readerRelease = null;
let readerEntered = null;
let readerEnteredPromise = null;
Module._load = function(request, parent, ...rest) {
  if (request === "server-only") return {};
  if (parent?.filename === resolve(root, "src/lib/data.ts")) {
    if (request === "@/lib/data.postgres") return {};
    if (request === "react") return { cache: (fn) => fn };
    if (["next/headers", "@/lib/actor", "@/lib/auth-mode", "@/lib/clerk-auth", "@/lib/staging-access-policy"].includes(request)) return {};
    if (request === "@/lib/production-readiness") return { isPostgresDataStoreConfigured: () => false, assertProductionDataStoreReady: () => {}, isProductionRuntime: () => false };
  }
  if (request === "@/lib/openai-object-reader" && parent?.filename.endsWith("/src/lib/identity-import-processor.ts")) {
    return { readObjectDocumentWithOpenAi: async () => {
      readerCalls += 1;
      if (readerEntered) readerEntered();
      if (readerGate) await readerGate;
      return {
        documentType: "registry",
        pages: [{ pageNumber: 1, lines: ["Synthetic property"] }],
        candidates: [{ fieldKey: "property.name", value: "Synthetic property", pageNumber: 1, sourceText: "Synthetic property", uncertainty: "clear", subjectKey: "object_1", subjectLabel: "物件" }],
        processingMetadata: { provider: "test-only", model: "test-model", usage: { input_tokens: 1, output_tokens: 1 } },
      };
    } };
  }
  return originalLoad.call(this, request, parent, ...rest);
};

const data = require(resolve(root, "src/lib/data.ts"));
data.resetBusinessDataForQa();
const tenant = await data.getTenantById("tenant_cherry");
const user = await data.getUserById("user_demo");
const { serializeObjectImportNotes, buildObjectVersionFingerprint } = require(resolve(root, "src/lib/object-import-contract.ts"));
const { processIdentityImportJob } = require(resolve(root, "src/lib/identity-import-processor.ts"));
const scope = { tenantId: tenant.id, userId: user.id };

async function makePropertyImport(label, attemptCount = 0, jobStatus = "queued", targetStatus = "queued") {
  const property = await data.addProperty({ tenantId: tenant.id, createdByUserId: user.id, currentOwnerUserId: user.id, name: label, listingPrice: 1 });
  const job = await data.addImportJob({
    tenantId: tenant.id, userId: user.id, sourceType: "scan", targetEntity: "properties", title: `${label}.pdf`, status: jobStatus,
    notes: serializeObjectImportNotes({ targetObjectType: "property", targetObjectId: property.id, targetVersion: buildObjectVersionFingerprint(property), documentType: "registry" }),
  });
  const attachment = await data.addPrivateAttachment({ tenantId: tenant.id, userId: user.id, targetType: "import_job", targetId: job.id, fileName: `${label}.pdf`, fileType: "application/pdf", content: Buffer.from("%PDF-synthetic") });
  const target = await data.createObjectImportTarget({
    id: `target_${label}_${Date.now()}_${Math.random()}`, tenantId: tenant.id, userId: user.id, importJobId: job.id,
    targetType: "property", targetId: property.id, targetVersion: buildObjectVersionFingerprint(property), documentType: "registry",
    sourceAttachmentId: attachment.id, status: targetStatus, idempotencyKey: `key_${label}_${Date.now()}_${Math.random()}`,
    attemptCount, createdAt: new Date(), updatedAt: new Date(),
  });
  return { job, target };
}

readerEnteredPromise = new Promise((resolve) => { readerEntered = resolve; });
readerGate = new Promise((resolve) => { readerRelease = resolve; });
const first = await makePropertyImport("parallel-first");
const firstPair = Promise.all([
  processIdentityImportJob({ ...scope, jobId: first.job.id }),
  processIdentityImportJob({ ...scope, jobId: first.job.id }),
]);
await readerEnteredPromise;
assert.equal(readerCalls, 1, "parallel initial requests must call the reader once");
readerRelease();
readerGate = null;
const firstResults = await firstPair;
assert.equal(firstResults.filter((result) => result.ok && result.status === "mapped").length, 1);
assert.equal(firstResults.filter((result) => result.ok && result.status === "processing").length, 1);
assert.equal((await data.getObjectImportTarget({ ...scope, id: first.target.id })).attemptCount, 1);

readerEntered = null;
readerEnteredPromise = new Promise((resolve) => { readerEntered = resolve; });
readerGate = new Promise((resolve) => { readerRelease = resolve; });
const second = await makePropertyImport("parallel-second", 1);
const callsBeforeSecond = readerCalls;
const secondPair = Promise.all([
  processIdentityImportJob({ ...scope, jobId: second.job.id }),
  processIdentityImportJob({ ...scope, jobId: second.job.id }),
]);
await readerEnteredPromise;
assert.equal(readerCalls, callsBeforeSecond + 1, "parallel second attempt must call the reader once");
readerRelease();
readerGate = null;
const secondResults = await secondPair;
assert.equal(secondResults.filter((result) => result.ok && result.status === "processing").length, 1);
assert.equal((await data.getObjectImportTarget({ ...scope, id: second.target.id })).attemptCount, 2);

const mappedJob = await data.addImportJob({ tenantId: tenant.id, userId: user.id, sourceType: "scan", targetEntity: "parties", title: "mapped-loss.pdf", status: "queued" });
assert.equal((await data.claimImportJobProcessing({ ...scope, jobId: mappedJob.id })).claimed, true);
await data.updateImportJobMapping({ ...scope, jobId: mappedJob.id, mappingJson: {}, notes: JSON.stringify({ kind: "input_file_extraction", inputExtraction: { fields: [] } }), status: "mapped" });
const mappedResult = await processIdentityImportJob({ ...scope, jobId: mappedJob.id });
assert.equal(mappedResult.ok && mappedResult.status, "mapped", "a mapped CAS loser must report mapped");

const failedJob = await data.addImportJob({ tenantId: tenant.id, userId: user.id, sourceType: "scan", targetEntity: "parties", title: "failed-loss.pdf", status: "queued" });
assert.equal((await data.claimImportJobProcessing({ ...scope, jobId: failedJob.id })).claimed, true);
await data.updateImportJobExecution({ ...scope, jobId: failedJob.id, status: "failed", errorCode: "synthetic_failure", errorSummary: "synthetic" });
const failedResult = await processIdentityImportJob({ ...scope, jobId: failedJob.id });
assert.deepEqual(failedResult, { ok: false, status: "failed", error: "identity_extraction_failed" }, "a failed CAS loser must report failed");

const worker = await makePropertyImport("worker-preclaimed");
assert.equal((await data.claimImportJobProcessing({ ...scope, jobId: worker.job.id })).claimed, true);
const workerCallsBefore = readerCalls;
const workerResult = await processIdentityImportJob({ ...scope, jobId: worker.job.id, processingPreclaimed: true });
assert.equal(workerResult.ok, true, "a worker preclaim must still process");
assert.equal(readerCalls, workerCallsBefore + 1, "worker preclaim must not be rejected by the browser CAS guard");

console.log("PASS: processor concurrency has one reader winner, visible loser states, bounded second attempt and worker preclaim support");
