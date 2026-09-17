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
const compiled = ts.transpileModule(declaration.getText(parsed), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { membershipId: "membership-a", tenantId: "tenant-a", userId: "user-a" };
const input = { context, caseId: "case-a", confirmedDataJson: { applicant: { name: "Neo Test Manual" } } };

// Runs the actual function with a narrow SQL adapter modelling the committed ACL.
// This is not a live PostgreSQL/RLS or Preview test.
async function run(overrides = {}, options = {}) {
  const queries = [];
  let writes = 0;
  let stored = null;
  let committed = false;
  const client = { async query(sql, params) {
    queries.push(sql);
    if (sql.includes("FROM tenant_memberships")) {
      assert.match(sql, /id=\$1 AND tenant_id=\$2 AND user_id=\$3 AND status='active'/);
      if (sql.includes("FOR SHARE")) throw Object.assign(new Error("permission denied for table tenant_memberships"), { code: "42501" });
      return { rows: !options.inactive && params[0] === context.membershipId && params[1] === context.tenantId && params[2] === context.userId ? [{}] : [] };
    }
    if (sql.startsWith("SELECT * FROM brokerage_cases")) {
      assert.match(sql, /current_owner_user_id=\$3 AND owner_resolution_status='resolved' FOR UPDATE/);
      return { rows: !options.wrongOwner && params[0] === input.caseId && params[1] === context.tenantId && params[2] === context.userId ? [{ lifecycleStatus: options.archived ? "archived" : "active" }] : [] };
    }
    if (sql.includes("UPDATE brokerage_cases")) {
      assert.match(sql, /tenant_id=\$2 AND current_owner_user_id=\$4 AND owner_resolution_status='resolved'/);
      writes += 1;
      stored = JSON.parse(params[2]);
      return { rows: [{ confirmedDataJson: stored }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const sandbox = { exports: {}, ensureSchema: async () => {}, databaseActorMatches: async (_client, id) => !options.actorMismatch && id === context.userId,
    withTransaction: async (fn) => { const result = await fn(client); committed = true; return result; },
    mapBrokerageCase: (row) => row, resolveRecordVisibility: () => ({ canWrite: !options.readOnly }) };
  vm.runInNewContext(compiled, sandbox);
  const result = await sandbox.exports.saveCaseWorkbenchWithObjectReview({ ...input, ...overrides });
  return { result, queries, writes, stored, committed };
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
// Explicitly keep candidate-review ACL incompatibility visible, not silently called fixed.
await assert.rejects(run({ objectReview: { targetId: "target-a" } }), { code: "42501" });
const sourceCheck = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "hasObjectImportSource").getText(parsed);
assert.match(sourceCheck, /FOR SHARE OF a,b/);
const acl = readFileSync(new URL("../db/migrations/20260902_003_runtime_acl_baseline.sql", import.meta.url), "utf8");
assert.match(acl, /GRANT SELECT ON TABLE\s+public.users,\s+public.tenants,\s+public.tenant_memberships\s+TO brokerdesk_runtime/);
assert.match(acl, /GRANT SELECT, INSERT, DELETE ON TABLE public.attachments/);
assert.match(acl, /GRANT SELECT, INSERT, DELETE ON TABLE public.private_attachment_blobs/);
console.log("PASS: actual plain-save function works with SELECT-only membership ACL; actor/tenant/member/owner/archive/visibility denials preserved. Candidate review still requires unsupported UPDATE lock privileges (known separate gate). SQL adapter only; no live PostgreSQL/Preview proof.");
