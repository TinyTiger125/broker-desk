#!/usr/bin/env node
/**
 * Queue-only regression for the unified object intake boundary.
 *
 * This deliberately never imports a worker or model reader. It proves that a
 * four-file standalone property upload creates four durable source jobs,
 * attachments, and object targets, while case-level same_person remains one
 * batched job with two attachments.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;
const candidate = (value) => [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`]
  .find((item) => existsSync(item) && statSync(item).isFile());
Module._resolveFilename = function(request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return candidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
Module._extensions[".ts"] = (mod, filename) => mod._compile(typescript.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: filename,
}).outputText, filename);
Module._extensions[".tsx"] = Module._extensions[".ts"];
const originalLoad = Module._load;
Module._load = function(request, parent, ...rest) {
  if (request === "server-only") return {};
  if (parent?.filename === resolve(root, "src/lib/data.ts")) {
    if (request === "@/lib/data.postgres") return {};
    if (request === "react") return { cache: (fn) => fn };
    if (["next/headers", "@/lib/actor", "@/lib/auth-mode", "@/lib/clerk-auth", "@/lib/staging-access-policy"].includes(request)) return {};
    if (request === "@/lib/production-readiness") return { isPostgresDataStoreConfigured: () => false, assertProductionDataStoreReady: () => {}, isProductionRuntime: () => false };
  }
  return originalLoad.call(this, request, parent, ...rest);
};

const data = require(resolve(root, "src/lib/data.ts"));
const { queueIdentityImportSources } = require(resolve(root, "src/lib/identity-import-queue.ts"));
const { buildObjectVersionFingerprint, buildObjectImportIdempotencyKey, serializeObjectImportNotes } = require(resolve(root, "src/lib/object-import-contract.ts"));
const { inferPropertyDocumentType } = require(resolve(root, "src/lib/object-reader-contract.ts"));

data.resetBusinessDataForQa();
const tenantId = "tenant_cherry";
const userId = "user_demo";
const property = await data.addProperty({
  tenantId,
  createdByUserId: userId,
  currentOwnerUserId: userId,
  name: "Queue-only four source property",
  listingPrice: 1,
});
const files = ["registry.pdf", "explanation.pdf", "sale-contract.pdf", "seller-notice.pdf"]
  .map((name, index) => new File([Buffer.from(`%PDF-QUEUE-TEST-${index}`)], name, { type: "application/pdf" }));
const queued = await queueIdentityImportSources({
  tenantId,
  userId,
  files,
  uploadMode: "same_person",
  targetObjectType: "property",
  targetObjectId: property.id,
  targetVersion: buildObjectVersionFingerprint(property),
});
assert.equal(queued.ok, true);
if (!queued.ok) throw new Error(queued.error);
assert.equal(queued.jobIds.length, 4, "standalone four-file upload must create four jobs");
const objectJobs = await data.listImportJobs(userId, 100, tenantId);
const objectJobIds = new Set(queued.jobIds);
assert.equal(objectJobs.filter((job) => objectJobIds.has(job.id)).length, 4);
for (const jobId of queued.jobIds) {
  const attachments = await data.listAttachments({ tenantId, userId, targetType: "import_job", targetId: jobId });
  assert.equal(attachments.length, 1, `job ${jobId} must have one source attachment`);
  const target = await data.getObjectImportTargetByJob({ tenantId, userId, importJobId: jobId });
  assert(target, `job ${jobId} must have an object target`);
  assert.equal(target.targetType, "property");
  assert.equal(target.targetId, property.id);
  assert.equal(target.sourceAttachmentId, attachments[0].id);
}

const caseQueued = await queueIdentityImportSources({
  tenantId,
  userId,
  files: files.slice(0, 2),
  uploadMode: "same_person",
  targetCaseId: "case_same_person_queue_test",
});
assert.equal(caseQueued.ok, true);
if (!caseQueued.ok) throw new Error(caseQueued.error);
assert.equal(caseQueued.jobIds.length, 1, "case same_person must retain one batch job");
const caseAttachments = await data.listAttachments({ tenantId, userId, targetType: "import_job", targetId: caseQueued.jobIds[0] });
assert.equal(caseAttachments.length, 2, "case same_person must retain two source attachments");
assert.equal(await data.getObjectImportTargetByJob({ tenantId, userId, importJobId: caseQueued.jobIds[0] }), null);

// A legacy failed/queued row with no source must be recoverable without
// creating a duplicate job or calling a reader.
const recoveryProperty = await data.addProperty({
  tenantId,
  createdByUserId: userId,
  currentOwnerUserId: userId,
  name: "Queue recovery property",
  listingPrice: 1,
});
const recoveryBuffer = Buffer.from("%PDF-QUEUE-RECOVERY");
const recoveryFilename = "recovery-registry.pdf";
const recoveryTarget = {
  targetObjectType: "property",
  targetObjectId: recoveryProperty.id,
  targetVersion: buildObjectVersionFingerprint(recoveryProperty),
  documentType: inferPropertyDocumentType(recoveryFilename),
};
const recoveryKey = buildObjectImportIdempotencyKey({
  tenantId,
  target: recoveryTarget,
  sourceHash: `same_person:${createHash("sha256").update(recoveryBuffer).digest("hex")}`,
});
const failedRow = await data.addImportJob({
  tenantId,
  userId,
  sourceType: "scan",
  targetEntity: "properties",
  title: recoveryFilename,
  status: "queued",
  idempotencyKey: recoveryKey,
  notes: serializeObjectImportNotes(recoveryTarget),
});
const failedSourceRow = await data.updateImportJobExecution({
  tenantId,
  userId,
  jobId: failedRow.id,
  status: "failed",
  errorCode: "source_persistence_failed",
  errorSummary: "synthetic missing source",
});
assert.equal(failedSourceRow?.status, "failed");
const recovered = await queueIdentityImportSources({
  tenantId,
  userId,
  files: [new File([recoveryBuffer], recoveryFilename, { type: "application/pdf" })],
  uploadMode: "same_person",
  targetObjectType: "property",
  targetObjectId: recoveryProperty.id,
  targetVersion: recoveryTarget.targetVersion,
});
assert.equal(recovered.ok, true);
if (!recovered.ok) throw new Error(recovered.error);
assert.deepEqual(recovered.jobIds, [failedRow.id], "failed source row must be reused");
assert.equal((await data.listAttachments({ tenantId, userId, targetType: "import_job", targetId: failedRow.id })).length, 1);
assert(await data.getObjectImportTargetByJob({ tenantId, userId, importJobId: failedRow.id }));

console.log("PASS: standalone four-file upload creates 4 jobs/4 one-source targets; case same_person remains one 2-source job; failed source row is repaired in place; no processor/model invoked");
