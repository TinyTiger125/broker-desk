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
function resolveCandidate(value) {
  if (!value || (!value.startsWith("/") && !value.startsWith("."))) return undefined;
  return [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}
Module._resolveFilename = function (request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
require.extensions[".ts"] = function (module, filename) {
  const result = typescript.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};


// Only framework/auth boundaries are stubbed; public data proxy and memory driver execute.
const originalLoad = Module._load;
Module._load = function(request, parent, ...rest) {
  if (parent?.filename === resolve(root, "src/lib/data.ts")) {
    if (request === "@/lib/data.postgres") return {};
    if (request === "react") return { cache: (fn) => fn };
    if (["next/headers", "@/lib/actor", "@/lib/auth-mode", "@/lib/clerk-auth", "@/lib/staging-access-policy"].includes(request)) return {};
    if (request === "@/lib/production-readiness") return {
      isPostgresDataStoreConfigured: () => false, assertProductionDataStoreReady: () => {}, isProductionRuntime: () => false,
    };
  }
  return originalLoad.call(this, request, parent, ...rest);
};
const dataPath = resolve(root, "src/lib/data.ts");
const memoryPath = resolve(root, "src/lib/data.memory.ts");
const data = require(dataPath);
const date = new Date("2026-09-17T00:00:00Z");
const scope = { tenantId: "object-import-test-a", userId: "object-import-test-owner" };
const target = { ...scope, id: "target-test-a", caseId: "case-test-a", importJobId: "job-test-a", targetType: "party", targetId: "party-test-a", targetVersion: "v1", status: "queued", idempotencyKey: "same-source", attemptCount: 0, createdAt: date, updatedAt: date };
const candidate = { id: "candidate-test-a", tenantId: scope.tenantId, targetId: target.id, fieldKey: "name", candidateValue: "Synthetic A", confidence: 0.9, provenance: { sheet: "Sheet1" }, finalValue: "Synthetic A", finalSource: "model_draft", status: "draft" };
data.resetBusinessDataForQa();
assert.deepEqual(await data.createObjectImportTarget(target), target);
assert.deepEqual(await data.upsertObjectImportCandidate(candidate), candidate);
assert.deepEqual(await data.getObjectImportTargetByJob({ ...scope, importJobId: target.importJobId }), target);
assert.deepEqual(await data.listObjectImportCandidates({ ...scope, targetId: target.id }), [candidate]);
assert.deepEqual(await data.listObjectImportTargets({ ...scope, caseId: target.caseId }), [target]);
// Re-import driver modules, as happens during development, without losing the shared holder.
delete require.cache[dataPath]; delete require.cache[memoryPath];
const reloaded = require(dataPath);
assert.deepEqual(await reloaded.getObjectImportTarget({ ...scope, id: target.id }), target);
assert.deepEqual(await reloaded.listObjectImportCandidates({ ...scope, targetId: target.id }), [candidate]);
for (const denied of [{ ...scope, tenantId: "object-import-test-b" }, { ...scope, userId: "other-user" }]) {
  assert.equal(await reloaded.getObjectImportTarget({ ...denied, id: target.id }), null);
  assert.equal(await reloaded.getObjectImportTargetByJob({ ...denied, importJobId: target.importJobId }), null);
  assert.deepEqual(await reloaded.listObjectImportTargets({ ...denied, caseId: target.caseId }), []);
  assert.deepEqual(await reloaded.listObjectImportCandidates({ ...denied, targetId: target.id }), []);
  assert.equal(await reloaded.updateObjectImportTarget({ ...denied, id: target.id, status: "failed" }), null);
}
await assert.rejects(reloaded.upsertObjectImportCandidate({ ...candidate, tenantId: "object-import-test-b" }), /object_import_target_not_found/);
await assert.rejects(reloaded.createObjectImportTarget({ ...target, userId: "other-user" }), /scope_mismatch/);
const other = { ...target, id: "target-test-b", tenantId: "object-import-test-b" };
assert.deepEqual(await reloaded.createObjectImportTarget(other), other);
assert.equal((await reloaded.getObjectImportTarget({ ...scope, id: target.id })).tenantId, scope.tenantId);
// Read results cannot mutate the backing store.
const read = await reloaded.listObjectImportCandidates({ ...scope, targetId: target.id });
read[0].provenance.sheet = "mutated";
assert.equal((await reloaded.listObjectImportCandidates({ ...scope, targetId: target.id }))[0].provenance.sheet, "Sheet1");
await reloaded.upsertObjectImportCandidate({ ...candidate, candidateValue: "Synthetic B", finalValue: "Synthetic B" });
assert.equal((await reloaded.listObjectImportCandidates({ ...scope, targetId: target.id }))[0].finalValue, "Synthetic B");
reloaded.resetBusinessDataForQa();
assert.equal(await data.getObjectImportTarget({ ...scope, id: target.id }), null);
assert.deepEqual(await data.listObjectImportCandidates({ ...scope, targetId: target.id }), []);

const { PostgresObjectImportRepository, mapObjectImportTarget, mapObjectImportCandidate } = require(resolve(root, "src/lib/object-import-repository.postgres.ts"));
const row = { id: target.id, tenant_id: target.tenantId, user_id: target.userId, case_id: target.caseId, import_job_id: target.importJobId, target_type: target.targetType, target_id: target.targetId, target_version: target.targetVersion, status: target.status, idempotency_key: target.idempotencyKey, attempt_count: "0", created_at: date.toISOString(), updated_at: date.toISOString() };
assert.equal(mapObjectImportTarget(row).createdAt.getTime(), date.getTime());
assert.equal(mapObjectImportTarget(row).targetId, target.targetId);
const fieldRow = { id: candidate.id, tenant_id: scope.tenantId, object_import_target_id: target.id, field_key: candidate.fieldKey, model_value: candidate.candidateValue, model_confidence: "0.9", model_source: JSON.stringify(candidate.provenance), final_value: candidate.finalValue, final_source: candidate.finalSource, status: candidate.status };
assert.equal(mapObjectImportCandidate(fieldRow).confidence, 0.9);
assert.deepEqual(mapObjectImportCandidate(fieldRow).provenance, candidate.provenance);
const mappedRepo = new PostgresObjectImportRepository({ query: async (sql) => ({ rows: [sql.includes("object_import_fields") ? fieldRow : row] }) });
assert.equal((await mappedRepo.createTarget(target)).tenantId, scope.tenantId);
assert.equal((await mappedRepo.getTargetByJob({ ...scope, importJobId: target.importJobId })).targetVersion, "v1");
assert.equal((await mappedRepo.upsertCandidate(candidate)).candidateValue, candidate.candidateValue);
assert.equal((await mappedRepo.listCandidates({ ...scope, targetId: target.id }))[0].fieldKey, candidate.fieldKey);
const pgSource = readFileSync(resolve(root, "src/lib/data.postgres.ts"), "utf8");
assert.match(pgSource, /new PostgresObjectImportRepository\(getPool\(\)\)/);
assert(!pgSource.includes("new PostgresObjectImportRepository(getRawPool())"));
const { MemoryObjectImportRepository } = require(resolve(root, "src/lib/object-import-repository.memory.ts"));
const confirmed = { ...candidate, finalValue: "Human value", finalSource: "human", status: "confirmed", confirmedByUserId: scope.userId, confirmedAt: date };
const isolatedMemory = new MemoryObjectImportRepository([target], [confirmed]);
await isolatedMemory.upsertCandidate({ ...candidate, finalValue: "New draft", candidateValue: "New draft" });
const [preserved] = await isolatedMemory.listCandidates({ ...scope, targetId: target.id });
assert.equal(preserved.finalValue, "Human value");
assert.equal(preserved.status, "confirmed");
assert.equal(preserved.confirmedByUserId, scope.userId);
const statements = [];
const repo = new PostgresObjectImportRepository({ query: async (sql, params) => { statements.push({ sql, params }); return { rows: [] }; } });
await repo.getTarget({ ...scope, id: target.id });
await repo.listCandidates({ ...scope, targetId: target.id });
assert.match(statements[0].sql, /tenant_id=\$1 AND user_id=\$2 AND id=\$3/);
assert.deepEqual(statements[1].params, [scope.tenantId, scope.userId, target.id]);
assert.match(statements[1].sql, /t.tenant_id=f.tenant_id/);
await assert.rejects(repo.upsertCandidate(candidate), /object_import_target_not_found/);
assert.match(statements.at(-1).sql, /WHERE EXISTS/);
assert.match(statements.at(-1).sql, /object_import_fields.tenant_id=EXCLUDED.tenant_id/);
console.log("PASS: public memory data create/read, reload/reset lifecycle, tenant/user isolation, PostgreSQL mapping and scoped SQL contract; no live database used");
