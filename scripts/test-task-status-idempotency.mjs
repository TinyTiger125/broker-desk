import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = new URL("../", import.meta.url);

// Execute the checked-in functions, not a rewritten idempotency algorithm.
// DB transport is an isolated transactional double: no pg import, credentials,
// network, repository initialization, or live database is used by this test.
export function loadFunctions(relativePath, names, bindings) {
  const file = fileURLToPath(new URL(relativePath, root));
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const functions = names.map((name) => {
    const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert(declaration, `Missing actual function ${name} in ${relativePath}`);
    return declaration.getText(source);
  }).join("\n");
  const compiled = ts.transpileModule(functions, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  });
  const context = vm.createContext({ exports: {}, Date, ...bindings });
  vm.runInContext(compiled.outputText, context, { filename: file });
  return context.exports;
}

const tenantId = "test-tenant";
const actorId = "test-owner";
const input = (status, overrides = {}) => ({ tenantId, taskId: "test-task", expectedClientId: "test-client", status, updatedById: actorId, ...overrides });
const plain = (value) => JSON.parse(JSON.stringify(value));

export function harness(driver, { status = "pending", linked = true, clientId = "test-client", recordTenantId = tenantId, denyScope = false, failAudit = false } = {}) {
  const task = { id: "test-task", tenantId: recordTenantId, clientId: linked ? clientId : undefined, title: "Synthetic task", status,
    dueAt: new Date("2026-09-10T00:00:00Z"), createdAt: new Date("2026-09-01T00:00:00Z"), createdById: actorId };
  if (driver === "memory") {
    const db = { tasks: [task], followUps: [], auditLogs: [] };
    const api = loadFunctions("src/lib/data.memory.ts", ["resolveTenantId", "makeId", "addAuditLog", "updateTaskStatus", "rescheduleTask"], { db, DEFAULT_TENANT_ID: tenantId });
    return { update: api.updateTaskStatus, reschedule: api.rescheduleTask, state: () => plain(db), counts: () => [db.followUps.length, db.auditLogs.length] };
  }

  const state = { task: { id: task.id, tenant_id: task.tenantId, client_id: task.clientId, title: task.title, status: task.status,
    due_at: task.dueAt, created_at: task.createdAt, created_by_id: task.createdById }, followUps: [], auditLogs: [], updates: 0 };
  let queue = Promise.resolve();
  let lockReads = 0;
  const pool = { async connect() {
    let unlock;
    let local;
    const pendingFollowUps = [];
    const pendingAudits = [];
    let updates = 0;
    return {
      async query(sql, args = []) {
        const text = sql.replace(/\s+/g, " ").trim();
        if (text === "BEGIN") return { rows: [] };
        if (text.startsWith("SELECT * FROM tasks")) {
          assert.match(text, /FOR UPDATE$/);
          const previous = queue;
          queue = new Promise((resolve) => { unlock = resolve; });
          await previous;
          lockReads += 1;
          local = structuredClone(state.task);
          const clientParameter = text.match(/client_id = \$(\d+)/);
          const matchesClient = !clientParameter || (local.client_id != null && args[Number(clientParameter[1]) - 1] === local.client_id);
          return { rows: args[0] === local.id && args[1] === local.tenant_id && matchesClient ? [structuredClone(local)] : [] };
        }
        if (text.startsWith("UPDATE tasks SET")) {
          assert(local, "Task update requires the locked read");
          assert.equal(args[0], local.id);
          assert.equal(args[2], local.tenant_id);
          const clientParameter = text.match(/client_id = \$(\d+)/);
          if (clientParameter && (local.client_id == null || args[Number(clientParameter[1]) - 1] !== local.client_id)) return { rows: [] };
          if (text.startsWith("UPDATE tasks SET due_at")) {
            local.due_at = args[1];
            local.status = "pending";
          } else local.status = args[1];
          updates += 1;
          return { rows: [structuredClone(local)] };
        }
        if (text.startsWith("INSERT INTO follow_ups")) {
          assert(local);
          pendingFollowUps.push({ tenantId: args[1], clientId: args[2], type: "note", content: args[3], nextAction: args[4],
            ...(text.includes("next_follow_up_at") ? { nextFollowUpAt: args[5], createdById: args[6] } : { createdById: args[5] }) });
          return { rows: [] };
        }
        if (text.startsWith("INSERT INTO audit_logs")) {
          if (failAudit) throw new Error("TEST_AUDIT_REFUSED");
          pendingAudits.push({ tenantId: args[1], actorId: args[3], action: args[4], targetType: args[5], targetId: args[6], message: args[7] });
          return { rows: [] };
        }
        if (text === "COMMIT") {
          if (updates) state.task = local;
          state.updates += updates;
          state.followUps.push(...pendingFollowUps);
          state.auditLogs.push(...pendingAudits);
          unlock?.(); unlock = undefined;
          return { rows: [] };
        }
        if (text === "ROLLBACK") { unlock?.(); unlock = undefined; return { rows: [] }; }
        throw new Error(`Unexpected database operation in isolated double: ${text.split(" ")[0]}`);
      },
      release() { assert.equal(unlock, undefined, "Transaction must release its lock"); },
    };
  } };
  const api = loadFunctions("src/lib/data.postgres.ts", ["resolveTenantId", "mapTask", "genId", "withTransaction", "updateTaskStatus", "rescheduleTask"], {
    DEFAULT_TENANT_ID: tenantId, ensureSchema: async () => {}, getRawPool: () => pool,
    applyRequestScope: async () => { if (denyScope) throw new Error("TEST_SCOPE_DENIED"); },
    isProductionRuntime: () => true,
    ProductionReadinessError: Error,
    toDate: (value) => value ? new Date(value) : undefined,
  });
  return { update: api.updateTaskStatus, reschedule: api.rescheduleTask, state: () => plain(state), counts: () => [state.followUps.length, state.auditLogs.length],
    updates: () => state.updates, lockReads: () => lockReads };
}

for (const driver of ["memory", "postgres"]) {
  for (const target of ["done", "canceled"]) {
    for (const concurrent of [false, true]) {
      test(`${driver}: ${concurrent ? "concurrent" : "sequential"} repeated ${target} has one transition`, async () => {
        const h = harness(driver);
        const before = h.state();
        const results = concurrent
          ? await Promise.all([h.update(input(target)), h.update(input(target))])
          : [await h.update(input(target)), await h.update(input(target))];
        assert.deepEqual(plain(results[0]), plain(results[1]));
        assert.deepEqual(h.counts(), [1, 1], "only one business follow-up and one transition audit");
        const task = h.state().task ?? h.state().tasks[0];
        assert.deepEqual(task, { ...(before.task ?? before.tasks[0]), status: target });
        if (driver === "postgres") { assert.equal(h.updates(), 1); assert.equal(h.lockReads(), 2); }
      });
    }
  }

  for (const status of ["pending", "done", "canceled"]) {
    test(`${driver}: already ${status} returns current task without touching any state`, async () => {
      const h = harness(driver, { status });
      const before = h.state();
      const result = await h.update(input(status));
      assert.equal(result.id, "test-task");
      assert.equal(result.status, status);
      assert.deepEqual(h.state(), before);
    });
  }

  test(`${driver}: genuine transitions retain their effects and other fields`, async () => {
    const h = harness(driver);
    const before = h.state().task ?? h.state().tasks[0];
    for (const [index, status] of ["done", "canceled", "pending"].entries()) {
      const result = await h.update(input(status));
      assert.equal(result.status, status);
      assert.deepEqual(h.counts(), [index + 1, index + 1]);
      assert.deepEqual(h.state().task ?? h.state().tasks[0], { ...before, status });
    }
  });

  for (const status of ["done", "canceled"]) {
    test(`${driver}: repeated ${status} without a client is denied without effects`, async () => {
      const h = harness(driver, { linked: false });
      const before = h.state();
      assert.deepEqual(await Promise.all([h.update(input(status)), h.update(input(status))]), [null, null]);
      assert.deepEqual(h.state(), before);
    });
  }

  test(`${driver}: missing task or wrong tenant remains a side-effect-free miss`, async () => {
    const h = harness(driver);
    const before = h.state();
    assert.equal(await h.update(input("done", { taskId: "missing" })), null);
    assert.equal(await h.update(input("done", { tenantId: "other-tenant" })), null);
    assert.deepEqual(h.state(), before);
  });
}

test("postgres: refused request scope cannot reach task reads or writes", async () => {
  const h = harness("postgres", { denyScope: true });
  const before = h.state();
  await assert.rejects(h.update(input("done")), /TEST_SCOPE_DENIED/);
  assert.equal(h.lockReads(), 0);
  assert.deepEqual(h.state(), before);
});

test("postgres: audit failure rolls the real transition back", async () => {
  const h = harness("postgres", { failAudit: true });
  const before = h.state();
  await assert.rejects(h.update(input("done")), /TEST_AUDIT_REFUSED/);
  assert.deepEqual(h.state(), before);
});

test("memory/postgres: status, returned task and business effects remain equivalent", async () => {
  const memory = harness("memory");
  const postgres = harness("postgres");
  for (const status of ["pending", "done", "done", "canceled", "canceled", "pending"]) {
    assert.deepEqual(plain(await memory.update(input(status))), plain(await postgres.update(input(status))));
    assert.deepEqual(memory.counts(), postgres.counts());
  }
  const normalize = (state) => ({
    followUps: state.followUps.map(({ tenantId, clientId, type, content, nextAction, createdById }) =>
      ({ tenantId, clientId, type, content, nextAction, createdById })).sort((a, b) => a.content.localeCompare(b.content)),
    auditLogs: state.auditLogs.map(({ tenantId, actorId, action, targetType, targetId, message }) =>
      ({ tenantId, actorId, action, targetType, targetId, message })).sort((a, b) => a.message.localeCompare(b.message)),
  });
  assert.deepEqual(normalize(memory.state()), normalize(postgres.state()));
});

// Authentication/ownership are existing Action boundaries. Inject refusal at
// each boundary and execute the real Action; this is not a live RLS proof.
for (const driver of ["memory", "postgres"]) {
  for (const refusal of ["permission", "ownership"]) {
    test(`${driver}: Action ${refusal} refusal cannot invoke the repository`, async () => {
      const h = harness(driver);
      const before = h.state();
      let calls = 0;
      const api = loadFunctions("src/app/actions.ts", ["changeTaskStatusAction", "isTaskStatus"], {
        requireTenantSession: async (options) => {
          assert.equal(options.permission, "review_task.resolve");
          if (refusal === "permission") throw new Error("TEST_PERMISSION_DENIED");
          return { user: { id: actorId }, tenant: { id: tenantId } };
        },
        safeReturnTo: (_value, fallback) => fallback,
        ensureClientOwnership: async (clientId) => {
          assert.equal(clientId, "test-client");
          throw new Error("TEST_OWNERSHIP_DENIED");
        },
        updateTaskStatus: async (value) => { calls += 1; return h.update(value); },
      });
      const form = new FormData();
      for (const [key, value] of Object.entries({ taskId: "test-task", clientId: "test-client", status: "done" })) form.set(key, value);
      await assert.rejects(api.changeTaskStatusAction(form), refusal === "permission" ? /TEST_PERMISSION_DENIED/ : /TEST_OWNERSHIP_DENIED/);
      assert.equal(calls, 0);
      assert.deepEqual(h.state(), before);
    });
  }
}
