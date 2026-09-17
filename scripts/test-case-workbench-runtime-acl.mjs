import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(process.argv[2] || new URL("../src/lib/data.postgres.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("data.ts", source, ts.ScriptTarget.Latest, true);
const declaration = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "saveCaseWorkbenchWithObjectReview");
assert(declaration);
const functionSource = (name) => parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(parsed);
const compiled = ts.transpileModule([declaration.getText(parsed), functionSource("withTransaction"), functionSource("hasObjectImportSource"), functionSource("reviewObjectImportCandidate")].join("\n"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { membershipId: "membership-a", tenantId: "tenant-a", userId: "user-a" };
const input = { context, caseId: "case-a", confirmedDataJson: { applicant: { name: "Neo Test Manual" } } };

// Runs the actual function with a narrow SQL adapter modelling the committed ACL.
// This is not a live PostgreSQL/RLS or Preview test.
async function run(overrides = {}, options = {}) {
  const queries = [];
  let writes = 0;
  let stored = null;
  let committed = false;
  let rolledBack = false;
  const state = options.state ?? { writes: 0 };
  const client = { release() {}, async query(sql, params) {
    queries.push(sql);
    if (sql === "BEGIN") return { rows: [] };
    if (sql === "COMMIT") { committed = true; return { rows: [] }; }
    if (sql === "ROLLBACK") { state.writes = 0; rolledBack = true; return { rows: [] }; }
    if (sql.includes("FROM tenant_memberships") || sql.includes("FOR SHARE OF a,b")) {
      throw Object.assign(new Error("baseline ACL rejects raw row locking"), { code: "42501" });
    }
    if (sql.includes("lock_case_review_membership")) {
      return { rows: [{ allowed: !options.inactive && params[0] === context.membershipId && params[1] === context.tenantId && params[2] === context.userId }] };
    }
    if (sql.includes("lock_case_review_source")) {
      assert.deepEqual(Array.from(params), ["attachment-a", context.tenantId, context.userId, "job-a"]);
      return { rows: [{ sha256: options.unreadableSource ? null : options.wrongHash ? "wrong" : "hash-a" }] };
    }
    if (sql.startsWith("SELECT * FROM brokerage_cases")) {
      assert.match(sql, /FOR UPDATE/);
      if (!options.standalone) assert.match(sql, /current_owner_user_id=\$3 AND owner_resolution_status='resolved'/);
      return { rows: !options.wrongOwner && params[0] === input.caseId && params[1] === context.tenantId && (options.standalone || params[2] === context.userId) ? [{ lifecycleStatus: options.archived ? "archived" : "active" }] : [] };
    }
    if (sql.includes("UPDATE brokerage_cases")) {
      assert.match(sql, /tenant_id=\$2 AND current_owner_user_id=\$4 AND owner_resolution_status='resolved'/);
      writes += 1;
      stored = JSON.parse(params[2]);
      if (options.finalWriteMissing) return { rows: [] };
      state.writes += 1;
      return { rows: [{ confirmedDataJson: stored }] };
    }
    if (sql.startsWith("SELECT case_id FROM object_import_targets")) return { rows: [{ case_id: input.caseId }] };
    if (sql.includes("FROM object_import_targets")) return { rows: [{ id: "target-a", caseId: input.caseId, targetType: "party", targetId: "party-a", sourceAttachmentId: "attachment-a", tenantId: context.tenantId, userId: context.userId, importJobId: "job-a" }] };
    if (sql.includes("FROM clients")) return { rows: [{ id: "party-a", lifecycleStatus: "active", name: "before" }] };
    if (sql.includes("FROM object_import_fields")) return { rows: [{ id: "field-a", provenance: { sourceAttachmentId: options.wrongSourceId ? "other" : "attachment-a", sourceFileHash: "hash-a" } }] };
    if (/^(UPDATE (clients|object_import_)|INSERT INTO audit_logs)/.test(sql)) {
      state.writes += 1;
      if (options.auditFailure && sql.startsWith("INSERT INTO audit_logs")) throw new Error("audit_insert_failed");
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const sandbox = { exports: {}, ensureSchema: async () => {}, databaseActorMatches: async (_client, id) => !options.actorMismatch && id === context.userId,
    getRawPool: () => ({ connect: async () => client }), applyRequestScope: async () => {},
    mapObjectImportTarget: (row) => row, mapObjectImportCandidate: (row) => row, mapClient: (row) => row,
    readCaseAssociationDraft: () => ({ parties: [{ partyId: "party-a" }] }),
    validateObjectImportReview: () => ({ ok: true, key: "name", value: "Neo Test Manual", recordValue: "Neo Test Manual" }),
    buildObjectVersionFingerprint: () => "v2", genId: () => "audit-a",
    mapBrokerageCase: (row) => row, resolveRecordVisibility: () => ({ canWrite: !options.readOnly }) };
  vm.runInNewContext(compiled, sandbox);
  const result = options.standalone
    ? await sandbox.exports.reviewObjectImportCandidate({ ...overrides.objectReview, context: overrides.context ?? context })
    : await sandbox.exports.saveCaseWorkbenchWithObjectReview({ ...input, ...overrides });
  return { result, queries, writes, stored, committed, rolledBack };
}
const saved = await run();
assert.equal(saved.result.ok, true);
assert.equal(saved.committed, true);
assert.equal(saved.writes, 1);
assert.deepEqual(saved.stored, input.confirmedDataJson);
assert(!saved.queries.some((sql) => sql.includes("object_import")));
for (const options of [{ inactive: true }, { wrongOwner: true }, { archived: true }, { actorMismatch: true }, { readOnly: true }]) {
  const denied = await run({}, options);
  assert.equal(denied.result.reason, "case_not_writable");
  assert.equal(denied.writes, 0);
}
for (const changed of [{ tenantId: "tenant-b" }, { userId: "user-b" }, { membershipId: "membership-b" }]) {
  const denied = await run({ context: { ...context, ...changed } });
  assert.equal(denied.result.reason, "case_not_writable");
  assert.equal(denied.writes, 0);
}
const sourceCheck = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "hasObjectImportSource").getText(parsed);
assert.match(sourceCheck, /lock_case_review_source/);
const acl = readFileSync(new URL("../db/migrations/20260902_003_runtime_acl_baseline.sql", import.meta.url), "utf8");
assert.match(acl, /GRANT SELECT ON TABLE\s+public.users,\s+public.tenants,\s+public.tenant_memberships\s+TO brokerdesk_runtime/);
assert.match(acl, /GRANT SELECT, INSERT, DELETE ON TABLE public.attachments/);
assert.match(acl, /GRANT SELECT, INSERT, DELETE ON TABLE public.private_attachment_blobs/);
console.log("PASS: actual save and transaction functions use helper EXECUTE under baseline table ACL; actor/tenant/member/owner/archive/visibility denials preserved. SQL adapter only; no live PostgreSQL/Preview proof.");

// Test actual transaction/source SQL paths; helper bodies are statically checked below.
const objectReview = { targetId: "target-a", fieldId: "field-a", decision: "confirm" };
const reviewed = await run({ objectReview }, {});
assert.equal(reviewed.result.ok, true);
const unavailable = await run({ objectReview }, { unreadableSource: true });
assert.equal(unavailable.result.reason, "not_writable");
assert.equal(unavailable.writes, 0);
for (const failure of [{ finalWriteMissing: true }, { auditFailure: true }]) {
  const state = { writes: 0 };
  await assert.rejects(run({ objectReview }, { ...failure, state }), /case_workbench_write_not_applied|audit_insert_failed/);
  assert.equal(state.writes, 0, "transaction failure must discard every object/candidate/audit/case write");
}
const standalone = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "reviewObjectImportCandidate").getText(parsed);
assert(standalone.indexOf('SELECT * FROM brokerage_cases') < standalone.indexOf('SELECT * FROM object_import_targets'));
assert.match(standalone, /target.caseId !== targetHint.rows\[0\].case_id/);
console.log("PASS: combined-save transaction simulation commits success and rolls back missing final case write/audit failure; unreadable source denies before mutation; review entry points lock case before target.");

for (const options of [{ inactive: true }, { unreadableSource: true }, { wrongHash: true }, { wrongSourceId: true }]) {
  const state = { writes: 0 };
  const denied = await run({ objectReview }, { ...options, state });
  assert.equal(denied.result.ok, false);
  assert.equal(state.writes, 0);
}
const migration = readFileSync(new URL("../db/migrations/20260917_002_case_review_locks.sql", import.meta.url), "utf8");
assert.equal((migration.match(/SECURITY DEFINER/g) ?? []).length, 2);
assert.equal((migration.match(/SET search_path = pg_catalog, pg_temp/g) ?? []).length, 2);
assert.equal((migration.match(/REVOKE ALL ON FUNCTION .* FROM PUBLIC/g) ?? []).length, 2);
assert.equal((migration.match(/GRANT EXECUTE ON FUNCTION .* TO brokerdesk_runtime/g) ?? []).length, 2);
assert(!/GRANT (UPDATE|ALL)|GRANT .* ON TABLE/.test(migration));
assert.match(migration, /m.id = p_membership_id AND m.tenant_id = p_tenant_id/);
assert.match(migration, /m.user_id = p_actor_user_id AND m.status = 'active'/);
assert.match(migration, /FOR SHARE OF m/);
assert.match(migration, /FOR SHARE OF a, b/);
assert.match(migration, /current_user_id\(\) IS DISTINCT FROM p_actor_user_id/);
assert.match(migration, /a.target_id = p_import_job_id AND octet_length\(b.content\) > 0/);
assert.match(migration, /j.user_id = a.user_id/);
assert.match(source, /to_regprocedure\('brokerdesk_private.lock_case_review_membership/);
assert.match(source, /has_function_privilege\(current_user, 'brokerdesk_private.lock_case_review_source/);
console.log("PASS: helper SQL retains member/source row locks with scoped actor/tenant/job/hash provenance and no table UPDATE grants; readiness checks helper existence and EXECUTE. Migration not executed.");

const standaloneSuccess = await run({ objectReview }, { standalone: true });
assert.equal(standaloneSuccess.result.ok, true);
for (const options of [{ inactive: true }, { unreadableSource: true }, { wrongHash: true }, { actorMismatch: true }]) {
  const state = { writes: 0 };
  const denied = await run({ objectReview }, { ...options, standalone: true, state });
  assert.equal(denied.result.ok, false);
  assert.equal(state.writes, 0);
}
const standaloneState = { writes: 0 };
await assert.rejects(run({ objectReview }, { standalone: true, auditFailure: true, state: standaloneState }), /audit_insert_failed/);
assert.equal(standaloneState.writes, 0);
console.log("PASS: actual standalone review function confirms, denies inactive/unreadable/forged source and actor, and rolls back audit failure under the same helper ACL adapter.");
