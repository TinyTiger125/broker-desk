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

const memory = require(resolve(root, "src/lib/data.memory.ts"));
memory.resetBusinessDataForQa();
const tenantId = "tenant_cherry";
const userId = "user_demo";
const commonClient = {
  tenantId,
  ownerUserId: userId,
  name: "Archive atomic person",
  phone: "000-0000-0000",
  budgetType: "total_price",
  purpose: "buy",
  loanPreApprovalStatus: "not_applied",
  stage: "lead",
  temperature: "cold",
  brokerageContractType: "none",
  amlCheckStatus: "not_required",
};

const person = await memory.addClient(commonClient);
const property = await memory.addProperty({ tenantId, createdByUserId: userId, currentOwnerUserId: userId, name: "Archive atomic property", listingPrice: 1 });
const brokerageCase = await memory.saveBrokerageCaseExtractionReview({
  tenantId,
  userId,
  caseType: "unit_sale",
  caseTitle: "Archive atomic case",
  confirmedDataJson: {},
  sourceImportJobIds: [],
  reviewItems: [],
});
await memory.addClient({ ...commonClient, name: "Archive atomic person sentinel", phone: "000-0000-0001" });
await memory.addProperty({ tenantId, createdByUserId: userId, currentOwnerUserId: userId, name: "Archive atomic property sentinel", listingPrice: 2 });
await memory.saveBrokerageCaseExtractionReview({
  tenantId,
  userId,
  caseType: "unit_sale",
  caseTitle: "Archive atomic case sentinel",
  confirmedDataJson: { sentinel: true },
  sourceImportJobIds: [],
  reviewItems: [],
});

const subjects = [
  { entityType: "case", entityId: brokerageCase.id, targetType: "case", collection: "brokerageCases", read: () => memory.getBrokerageCaseById({ tenantId, userId, caseId: brokerageCase.id }) },
  { entityType: "party", entityId: person.id, targetType: "client", collection: "clients", read: () => memory.getClientById(person.id, tenantId) },
  { entityType: "property", entityId: property.id, targetType: "property", collection: "properties", read: () => memory.getPropertyById(property.id, tenantId) },
];

const databaseForPreservation = globalThis.__brokerDb;
assert(databaseForPreservation, "atomic preservation fixture can inspect the shared database");
const tenantRequestSentinel = {
  id: "tenant_creation_atomic_sentinel",
  userId,
  idempotencyKey: "archive-atomic-preservation",
  requestName: "Archive atomic preservation sentinel",
  accountType: "company",
  tenantId,
  membershipId: "membership_atomic_sentinel",
  createdAt: new Date("2026-08-27T00:00:00.000Z"),
};
databaseForPreservation.tenantCreationRequests.push(tenantRequestSentinel);

function contentFingerprint(value) {
  return JSON.stringify(value);
}

function snapshotDatabase() {
  const current = globalThis.__brokerDb;
  assert(current, "atomic behavior can inspect the shared current database");
  const keys = Reflect.ownKeys(current);
  return {
    current,
    keys,
    capturedAt: Date.now(),
    entries: new Map(keys.map((key) => [key, { reference: current[key], content: contentFingerprint(current[key]) }])),
  };
}

function assertOnlyAtomicCollectionsChanged(before, subject, status, label) {
  const { collection: changedCollection, entityId: targetId, targetType } = subject;
  const after = snapshotDatabase();
  assert.deepEqual(after.keys.map(String).sort(), before.keys.map(String).sort(), `${label} preserves every database top-level key`);
  for (const key of before.keys) {
    const oldValue = before.entries.get(key);
    assert(oldValue, `${label} snapshots ${String(key)}`);
    if (key === changedCollection || key === "auditLogs") {
      assert.notEqual(after.current[key], oldValue.reference, `${label} replaces ${String(key)} in the single next state`);
      if (key === changedCollection) {
        assert(Array.isArray(oldValue.reference) && Array.isArray(after.current[key]), `${label} target collection remains an array`);
        assert(oldValue.reference.length >= 2, `${label} target collection includes an independent non-target sentinel`);
        assert.equal(after.current[key].length, oldValue.reference.length, `${label} preserves target collection length`);
        assert.deepEqual(after.current[key].map((entry) => entry.id), oldValue.reference.map((entry) => entry.id), `${label} preserves target collection order and ids`);
        const oldTarget = oldValue.reference.find((entry) => entry.id === targetId);
        const newTarget = after.current[key].find((entry) => entry.id === targetId);
        assert(oldTarget && newTarget, `${label} preserves the exact target identity`);
        const allowedChanges = new Set(changedCollection === "properties"
          ? ["lifecycleStatus", "archivedAt", "archivedById"]
          : ["lifecycleStatus", "archivedAt", "archivedById", "updatedAt"]);
        assert.deepEqual(
          Reflect.ownKeys(newTarget).filter((field) => !allowedChanges.has(field)).map(String).sort(),
          Reflect.ownKeys(oldTarget).filter((field) => !allowedChanges.has(field)).map(String).sort(),
          `${label} preserves every non-lifecycle target field key`,
        );
        for (const field of Reflect.ownKeys(oldTarget)) {
          if (allowedChanges.has(field)) continue;
          assert.equal(newTarget[field], oldTarget[field], `${label} preserves target ${String(field)} reference/value`);
          assert.equal(contentFingerprint(newTarget[field]), contentFingerprint(oldTarget[field]), `${label} preserves target ${String(field)} content`);
        }
        oldValue.reference.forEach((entry, index) => {
          if (entry.id === targetId) return;
          assert.equal(after.current[key][index], entry, `${label} preserves non-target ${entry.id} reference`);
          assert.equal(contentFingerprint(after.current[key][index]), contentFingerprint(entry), `${label} preserves non-target ${entry.id} content`);
        });
      } else {
        const oldLogs = oldValue.reference;
        const newLogs = after.current.auditLogs;
        assert(Array.isArray(oldLogs) && Array.isArray(newLogs), `${label} audit history remains an array`);
        assert.equal(newLogs.length, oldLogs.length + 1, `${label} prepends exactly one audit log`);
        const newLog = newLogs[0];
        assert.equal(typeof newLog.id, "string", `${label} audit id is a string`);
        assert(newLog.id.length > 0, `${label} audit id is non-empty`);
        assert(!oldLogs.some((entry) => entry.id === newLog.id), `${label} audit id is unique across existing history`);
        assert.equal(newLog.tenantId, tenantId, `${label} audit tenant is exact`);
        assert.equal(newLog.actorId, userId, `${label} audit actor is exact`);
        assert.equal(newLog.userId, userId, `${label} audit user is exact`);
        assert.equal(newLog.action, status === "archived" ? "record_archived" : "record_restored", `${label} audit action matches lifecycle transition`);
        assert.equal(newLog.targetType, targetType, `${label} audit target type is exact`);
        assert.equal(newLog.targetId, targetId, `${label} audit target id is exact`);
        assert.equal(newLog.message, status === "archived" ? "记录已归档。" : "记录已恢复。", `${label} audit message matches lifecycle transition`);
        assert(newLog.createdAt instanceof Date, `${label} audit createdAt is a Date`);
        assert(newLog.createdAt.getTime() >= before.capturedAt && newLog.createdAt.getTime() <= after.capturedAt, `${label} audit createdAt belongs to this transition`);
        oldLogs.forEach((entry, index) => {
          assert.equal(newLogs[index + 1], entry, `${label} preserves old audit ${entry.id} reference and order`);
          assert.equal(contentFingerprint(newLogs[index + 1]), contentFingerprint(entry), `${label} preserves old audit ${entry.id} content`);
        });
      }
      continue;
    }
    assert.equal(after.current[key], oldValue.reference, `${label} preserves ${String(key)} reference`);
    assert.equal(contentFingerprint(after.current[key]), oldValue.content, `${label} preserves ${String(key)} content`);
  }
}

for (const subject of subjects) {
  const recordBefore = await subject.read();
  const beforeLogs = await memory.listAuditLogs(userId, { tenantId, targetType: subject.targetType });
  const beforeArchiveState = snapshotDatabase();
  const archived = await memory.setRecordLifecycleWithAudit({ tenantId, userId, entityType: subject.entityType, entityId: subject.entityId, status: "archived", archivedById: userId });
  assertOnlyAtomicCollectionsChanged(beforeArchiveState, subject, "archived", `${subject.entityType} archive`);
  assert.equal(archived?.lifecycleStatus, "archived", `${subject.entityType} archive returns updated record`);
  assert.equal((await subject.read())?.lifecycleStatus, "archived", `${subject.entityType} archive commits record`);
  const archivedRecord = await subject.read();
  assert(archivedRecord?.archivedAt instanceof Date, `${subject.entityType} archive records a timestamp`);
  assert.equal(archivedRecord?.archivedById, userId, `${subject.entityType} archive records the actor`);
  if (subject.entityType !== "property") assert((archivedRecord?.updatedAt?.getTime() ?? 0) >= (recordBefore?.updatedAt?.getTime() ?? 0), `${subject.entityType} archive advances updatedAt`);
  const afterArchive = await memory.listAuditLogs(userId, { tenantId, targetType: subject.targetType });
  assert.equal(afterArchive.length, beforeLogs.length + 1, `${subject.entityType} archive commits one audit`);
  assert.equal(afterArchive[0].action, "record_archived");
  assert.equal(afterArchive[0].targetId, subject.entityId);
  assert.equal(afterArchive[0].actorId, userId);
  assert.equal(afterArchive[0].userId, userId);
  assert.equal(afterArchive[0].message, "记录已归档。");

  const beforeRestoreState = snapshotDatabase();
  const restored = await memory.setRecordLifecycleWithAudit({ tenantId, userId, entityType: subject.entityType, entityId: subject.entityId, status: "active", archivedById: userId });
  assertOnlyAtomicCollectionsChanged(beforeRestoreState, subject, "active", `${subject.entityType} restore`);
  assert.equal(restored?.lifecycleStatus, "active", `${subject.entityType} restore returns updated record`);
  assert.equal((await subject.read())?.lifecycleStatus, "active", `${subject.entityType} restore commits record`);
  const restoredRecord = await subject.read();
  assert.equal(restoredRecord?.archivedAt, undefined, `${subject.entityType} restore clears archivedAt`);
  assert.equal(restoredRecord?.archivedById, undefined, `${subject.entityType} restore clears archivedById`);
  if (subject.entityType !== "property") assert((restoredRecord?.updatedAt?.getTime() ?? 0) >= (archivedRecord?.updatedAt?.getTime() ?? 0), `${subject.entityType} restore advances updatedAt`);
  const afterRestore = await memory.listAuditLogs(userId, { tenantId, targetType: subject.targetType });
  assert.equal(afterRestore.length, beforeLogs.length + 2, `${subject.entityType} restore commits one audit`);
  assert.equal(afterRestore[0].action, "record_restored");
  assert.equal(afterRestore[0].message, "记录已恢复。");
}

async function assertRejectedWithoutMutation(input, read, label) {
  const recordBefore = await read();
  const logsBefore = (await memory.listAuditLogs(userId, { tenantId })).length;
  assert.equal(await memory.setRecordLifecycleWithAudit(input), null, `${label} is rejected`);
  assert.equal((await read())?.lifecycleStatus, recordBefore?.lifecycleStatus, `${label} preserves lifecycle`);
  assert.equal((await memory.listAuditLogs(userId, { tenantId })).length, logsBefore, `${label} writes no audit`);
}

await assertRejectedWithoutMutation(
  { tenantId, userId: "user_ops", entityType: "case", entityId: brokerageCase.id, status: "archived", archivedById: "user_ops" },
  subjects[0].read,
  "wrong-owner case",
);
await assertRejectedWithoutMutation(
  { tenantId, userId: "user_ops", entityType: "party", entityId: person.id, status: "archived", archivedById: "user_ops" },
  subjects[1].read,
  "wrong-owner party",
);
await assertRejectedWithoutMutation(
  { tenantId: "tenant_other", userId, entityType: "property", entityId: property.id, status: "archived", archivedById: userId },
  subjects[2].read,
  "cross-tenant property",
);

const internalDbForAuthorization = globalThis.__brokerDb;
assert(internalDbForAuthorization, "memory authorization test can inspect isolated data");
for (const [collection, id, subject, label] of [
  ["brokerageCases", brokerageCase.id, subjects[0], "unresolved case"],
  ["clients", person.id, subjects[1], "unresolved party"],
]) {
  const internal = internalDbForAuthorization[collection].find((item) => item.id === id);
  assert(internal, `${label} fixture exists`);
  const previous = internal.ownerResolutionStatus;
  internal.ownerResolutionStatus = "pending_confirmation";
  try {
    await assertRejectedWithoutMutation(
      { tenantId, userId, entityType: subject.entityType, entityId: id, status: "archived", archivedById: userId },
      subject.read,
      label,
    );
  } finally {
    internal.ownerResolutionStatus = previous;
  }
}

const internalDb = globalThis.__brokerDb;
assert(internalDb, "memory test can inspect the isolated in-process database");
const internalCase = internalDb.brokerageCases.find((item) => item.id === brokerageCase.id);
assert(internalCase, "case fixture remains in the isolated database");
const safeConfirmedData = internalCase.confirmedDataJson;
const cloneFailureData = {};
Object.defineProperty(cloneFailureData, "explode", {
  enumerable: true,
  get() { throw new Error("injected result clone failure"); },
});
internalCase.confirmedDataJson = cloneFailureData;
const cloneFailureLogsBefore = (await memory.listAuditLogs(userId, { tenantId })).length;
const cloneFailureLifecycleBefore = internalCase.lifecycleStatus;
try {
  await assert.rejects(
    memory.setRecordLifecycleWithAudit({ tenantId, userId, entityType: "case", entityId: brokerageCase.id, status: "archived", archivedById: userId }),
    /injected result clone failure/,
  );
} finally {
  internalCase.confirmedDataJson = safeConfirmedData;
}
assert.equal(internalCase.lifecycleStatus, cloneFailureLifecycleBefore, "case clone failure occurs before lifecycle commit");
assert.equal((await memory.listAuditLogs(userId, { tenantId })).length, cloneFailureLogsBefore, "case clone failure occurs before audit commit");

const missingBefore = (await memory.listAuditLogs(userId, { tenantId })).length;
assert.equal(await memory.setRecordLifecycleWithAudit({ tenantId, userId, entityType: "party", entityId: "missing", status: "archived", archivedById: userId }), null);
assert.equal((await memory.listAuditLogs(userId, { tenantId })).length, missingBefore, "not found writes no audit");

for (const subject of subjects) {
  const recordBefore = await subject.read();
  const logsBefore = (await memory.listAuditLogs(userId, { tenantId })).length;
  const originalRandom = Math.random;
  Math.random = () => { throw new Error("injected audit id failure"); };
  try {
    await assert.rejects(
      memory.setRecordLifecycleWithAudit({ tenantId, userId, entityType: subject.entityType, entityId: subject.entityId, status: "archived", archivedById: userId }),
      /injected audit id failure/,
    );
  } finally {
    Math.random = originalRandom;
  }
  assert.equal((await subject.read())?.lifecycleStatus, recordBefore?.lifecycleStatus, `${subject.entityType} rollback preserves lifecycle`);
  assert.equal((await memory.listAuditLogs(userId, { tenantId })).length, logsBefore, `${subject.entityType} rollback preserves audit count`);
}

for (const subject of subjects) {
  const oldDb = globalThis.__brokerDb;
  assert(oldDb, `${subject.entityType} old database state is available`);
  const originalAuditDescriptor = Object.getOwnPropertyDescriptor(oldDb, "auditLogs");
  assert(originalAuditDescriptor, `${subject.entityType} old audit collection descriptor exists`);
  const oldAuditLogs = oldDb.auditLogs;
  let oldAuditSetterCalls = 0;
  Object.defineProperty(oldDb, "auditLogs", {
    configurable: true,
    enumerable: true,
    get: () => oldAuditLogs,
    set: () => {
      oldAuditSetterCalls += 1;
      throw new Error("injected old audit setter failure");
    },
  });
  const beforeRecord = await subject.read();
  const beforeCount = (await memory.listAuditLogs(userId, { tenantId })).length;
  try {
    const nextStatus = beforeRecord?.lifecycleStatus === "archived" ? "active" : "archived";
    const updated = await memory.setRecordLifecycleWithAudit({
      tenantId,
      userId,
      entityType: subject.entityType,
      entityId: subject.entityId,
      status: nextStatus,
      archivedById: userId,
    });
    assert.equal(updated?.lifecycleStatus, nextStatus, `${subject.entityType} reference switch commits despite an armed old audit setter`);
    assert.equal((await subject.read())?.lifecycleStatus, nextStatus, `${subject.entityType} reference switch publishes the record and audit together`);
    assert.equal((await memory.listAuditLogs(userId, { tenantId })).length, beforeCount + 1, `${subject.entityType} reference switch publishes exactly one audit`);
    assert.equal(oldAuditSetterCalls, 0, `${subject.entityType} atomic commit never writes the old database object's audit property`);
  } finally {
    Object.defineProperty(oldDb, "auditLogs", originalAuditDescriptor);
  }
}

for (const subject of subjects) {
  const oldDb = globalThis.__brokerDb;
  assert(oldDb, `${subject.entityType} current database state is available before switch failure`);
  const globalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "__brokerDb");
  assert(globalDescriptor, `${subject.entityType} global database reference descriptor exists`);
  const beforeRecord = await subject.read();
  const beforeCount = (await memory.listAuditLogs(userId, { tenantId })).length;
  Object.defineProperty(globalThis, "__brokerDb", {
    configurable: true,
    enumerable: true,
    get: () => oldDb,
    set: () => {
      throw new Error("injected database reference switch failure");
    },
  });
  try {
    const nextStatus = beforeRecord?.lifecycleStatus === "archived" ? "active" : "archived";
    await assert.rejects(
      memory.setRecordLifecycleWithAudit({
        tenantId,
        userId,
        entityType: subject.entityType,
        entityId: subject.entityId,
        status: nextStatus,
        archivedById: userId,
      }),
      /injected database reference switch failure/,
    );
    assert.equal((await subject.read())?.lifecycleStatus, beforeRecord?.lifecycleStatus, `${subject.entityType} failed reference switch leaves the record unchanged`);
    assert.equal((await memory.listAuditLogs(userId, { tenantId })).length, beforeCount, `${subject.entityType} failed reference switch leaves audit unchanged`);
    assert.equal(globalThis.__brokerDb, oldDb, `${subject.entityType} failed reference switch preserves the published database reference`);
  } finally {
    Object.defineProperty(globalThis, "__brokerDb", globalDescriptor);
  }
}

const memoryModulePath = resolve(root, "src/lib/data.memory.ts");
const memoryA = memory;
const sharedBeforeReload = globalThis.__brokerDb;
assert(sharedBeforeReload, "module A publishes the shared current database");
delete require.cache[require.resolve(memoryModulePath)];
const memoryB = require(memoryModulePath);
assert.equal(globalThis.__brokerDb, sharedBeforeReload, "module B reload reuses module A's current database reference");

const reloadSubject = subjects[2];
const reloadLogsBefore = (await memoryA.listAuditLogs(userId, { tenantId })).length;
assert.equal(
  (await memoryA.getPropertyById(reloadSubject.entityId, tenantId))?.lifecycleStatus,
  (await memoryB.getPropertyById(reloadSubject.entityId, tenantId))?.lifecycleStatus,
  "module A and B initially read the same current state",
);

await memoryA.setRecordLifecycleWithAudit({
  tenantId,
  userId,
  entityType: "property",
  entityId: reloadSubject.entityId,
  status: "archived",
  archivedById: userId,
});
assert.equal((await memoryB.getPropertyById(reloadSubject.entityId, tenantId))?.lifecycleStatus, "archived", "module B observes module A composite reference switch");
await memoryA.setPropertyLifecycleStatus({ tenantId, propertyId: reloadSubject.entityId, status: "active", archivedById: userId });
assert.equal((await memoryB.getPropertyById(reloadSubject.entityId, tenantId))?.lifecycleStatus, "active", "module B observes module A ordinary setter after reload");

await memoryB.setRecordLifecycleWithAudit({
  tenantId,
  userId,
  entityType: "property",
  entityId: reloadSubject.entityId,
  status: "archived",
  archivedById: userId,
});
assert.equal((await memoryA.getPropertyById(reloadSubject.entityId, tenantId))?.lifecycleStatus, "archived", "module A observes module B composite reference switch");
await memoryB.setPropertyLifecycleStatus({ tenantId, propertyId: reloadSubject.entityId, status: "active", archivedById: userId });
assert.equal((await memoryA.getPropertyById(reloadSubject.entityId, tenantId))?.lifecycleStatus, "active", "module A observes module B ordinary setter after reload");
assert.equal((await memoryA.listAuditLogs(userId, { tenantId })).length, reloadLogsBefore + 2, "both module instances publish exactly their composite audit entries");
assert.equal((await memoryB.listAuditLogs(userId, { tenantId })).length, reloadLogsBefore + 2, "both module instances read the same audit collection");
assert.notEqual(globalThis.__brokerDb, sharedBeforeReload, "composite writes replace the shared current database reference");

console.log("archive atomic behavior passed");
