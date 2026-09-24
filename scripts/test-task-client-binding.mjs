import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { harness, loadFunctions } from "./test-task-status-idempotency.mjs";

const tenantId = "test-tenant";
const userId = "test-owner";
const actions = ["changeTaskStatusAction", "rescheduleTaskAction", "undoTaskStatusAction"];
const notFound = "タスクが見つかりません。";

function actionHarness(h, { denyPermission = false, denyOwnership = false, extraBindings = {} } = {}) {
  const checked = [];
  const bindings = {
    requireTenantSession: async ({ permission }) => {
      assert.equal(permission, "review_task.resolve");
      if (denyPermission) throw new Error("TEST_PERMISSION_DENIED");
      return { user: { id: userId }, tenant: { id: tenantId } };
    },
    ensureClientOwnership: async (clientId) => {
      if (denyOwnership) throw new Error("TEST_OWNERSHIP_DENIED");
      assert.equal(clientId, "authorized-client-A");
      checked.push(clientId);
    },
    updateTaskStatus: async (input) => { assert(checked.length > 0); return h.update(input); },
    rescheduleTask: async (input) => { assert(checked.length > 0); return h.reschedule(input); },
    safeReturnTo: (_value, fallback) => fallback,
    parseDate: (value) => new Date(value),
    revalidatePath: () => {},
    withFlash: (path) => path,
    appendQuery: (path) => path,
    redirect: () => { throw new Error("TEST_REDIRECT"); },
    ...extraBindings,
  };
  return loadFunctions("src/app/actions.ts", [...actions, "batchUpdateServiceRequestStatusAction", "isTaskStatus"], bindings);
}

function form(values = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ taskId: "test-task", clientId: "authorized-client-A", status: "done", dueAt: "2026-10-10", ...values })) result.set(key, value);
  return result;
}

for (const driver of ["memory", "postgres"]) {
  for (const action of actions) {
    test(`${driver}: ${action} refuses authorized A paired with B task without effects`, async () => {
      const h = harness(driver, { clientId: "unauthorized-client-B" });
      const before = h.state();
      let error;
      try { await actionHarness(h)[action](form()); } catch (caught) { error = caught; }
      assert.deepEqual(h.state(), before, "no task change, follow-up or audit for wrong client");
      assert.equal(error?.message, notFound);
    });
  }
}

for (const driver of ["memory", "postgres"]) {
  for (const action of actions) {
    for (const mismatch of ["missing", "wrong-tenant", "no-client"]) {
      test(`${driver}: ${action} ${mismatch} has identical not-found and no effects`, async () => {
        const h = harness(driver, { clientId: "authorized-client-A", recordTenantId: mismatch === "wrong-tenant" ? "other-tenant" : tenantId, linked: mismatch !== "no-client" });
        const before = h.state();
        await assert.rejects(actionHarness(h)[action](form(mismatch === "missing" ? { taskId: "missing" } : {})), (error) => error.message === notFound);
        assert.deepEqual(h.state(), before);
      });
    }
    test(`${driver}: ${action} authorized same-client preserves real transition`, async () => {
      const h = harness(driver, { clientId: "authorized-client-A" });
      await assert.rejects(actionHarness(h)[action](form()), /TEST_REDIRECT/);
      assert.deepEqual(h.counts(), [1, 1]);
      const task = h.state().task ?? h.state().tasks[0];
      assert.equal(task.status, action === "rescheduleTaskAction" ? "pending" : "done");
      if (action === "rescheduleTaskAction") assert.equal(task.due_at ?? task.dueAt, "2026-10-10T00:00:00.000Z");
    });
    for (const refusal of ["denyPermission", "denyOwnership"]) {
      test(`${driver}: ${action} ${refusal} remains before all writes`, async () => {
        const h = harness(driver, { clientId: "authorized-client-A" });
        const before = h.state();
        await assert.rejects(actionHarness(h, { [refusal]: true })[action](form()), /TEST_(PERMISSION|OWNERSHIP)_DENIED/);
        assert.deepEqual(h.state(), before);
      });
    }
  }

  for (const target of ["done", "canceled"]) {
    test(`${driver}: concurrent valid/invalid bindings preserve only the valid transition`, async () => {
      const h = harness(driver);
      const common = { tenantId, taskId: "test-task", status: target, updatedById: userId };
      const [invalid, valid, repeated] = await Promise.all([
        h.update({ ...common, expectedClientId: "wrong-client" }),
        h.update({ ...common, expectedClientId: "test-client" }),
        h.update({ ...common, expectedClientId: "test-client" }),
      ]);
      assert.equal(invalid, null);
      assert.equal(valid.status, target);
      assert.equal(repeated.status, target);
      assert.deepEqual(h.counts(), [1, 1]);
      if (driver === "postgres") assert.equal(h.updates(), 1);
    });
    test(`${driver}: same-status IDOR attempts cannot return the foreign task`, async () => {
      const h = harness(driver, { clientId: "unauthorized-client-B", status: target });
      const before = h.state();
      const api = actionHarness(h);
      const results = await Promise.allSettled([api.changeTaskStatusAction(form({ status: target })), api.undoTaskStatusAction(form({ status: target }))]);
      assert(results.every((result) => result.status === "rejected" && result.reason.message === notFound));
      assert.deepEqual(h.state(), before);
    });
  }

  for (const method of ["update", "reschedule"]) {
    for (const expectedClientId of [undefined, null, "", "wrong-client"]) {
      test(`${driver}: ${method} cannot bypass mandatory binding (${String(expectedClientId)})`, async () => {
        const h = harness(driver);
        const before = h.state();
        assert.equal(await h[method]({ tenantId, taskId: "test-task", expectedClientId, status: "done", dueAt: new Date("2026-10-10"), updatedById: userId }), null);
        assert.deepEqual(h.state(), before);
      });
    }
  }

  for (const denyOwnership of [false, true]) {
    test(`${driver}: batch binds server-selected clients and rechecks ownership (${denyOwnership ? "denied" : "allowed"})`, async () => {
      const h = harness(driver, { clientId: "authorized-client-A" });
      const before = h.state();
      const inputs = [];
      let batchAudits = 0;
      const api = actionHarness(h, { denyOwnership, extraBindings: {
        getLocale: async () => "ja",
        tr: (_locale, copy) => copy.ja,
        listClients: async (actor, filter) => {
          assert.equal(actor, userId); assert.equal(filter.tenantId, tenantId);
          return [{ id: "authorized-client-A" }];
        },
        getClientDetail: async (clientId, tenant) => {
          assert.equal(clientId, "authorized-client-A"); assert.equal(tenant, tenantId);
          return { id: clientId, tasks: [{ id: "test-task", clientId }, { id: "foreign-task", clientId: "unauthorized-client-B" }] };
        },
        updateTaskStatus: async (value) => { inputs.push(value); return h.update(value); },
        addAuditLog: async () => { batchAudits += 1; },
      } });
      const data = form({ clientId: "untrusted-form-client" });
      for (const id of ["test-task", "foreign-task", "missing", "test-task"]) data.append("taskIds", id);
      await assert.rejects(api.batchUpdateServiceRequestStatusAction(data), denyOwnership ? /TEST_OWNERSHIP_DENIED/ : /TEST_REDIRECT/);
      if (denyOwnership) {
        assert.equal(inputs.length, 0); assert.equal(batchAudits, 0); assert.deepEqual(h.state(), before);
      } else {
        assert.equal(inputs.length, 2);
        assert(inputs.every((value) => value.taskId === "test-task" && value.expectedClientId === "authorized-client-A"));
        assert.deepEqual(h.counts(), [1, 1]);
        assert.equal(batchAudits, 1, "existing batch audit contract is distinct from per-task transition audit");
      }
    });
  }
}

const ts = createRequire(import.meta.url)("typescript");
const root = fileURLToPath(new URL("../", import.meta.url));
const parse = (file) => ts.createSourceFile(file, readFileSync(path.join(root, file), "utf8"), ts.ScriptTarget.Latest, true);
const visit = (node, callback) => { callback(node); ts.forEachChild(node, (child) => visit(child, callback)); };

test("source contract: mandatory client binding at every mutation call, no optional escape", () => {
  for (const driver of ["memory", "postgres"]) {
    const source = parse(`src/lib/data.${driver}.ts`);
    for (const name of ["updateTaskStatus", "rescheduleTask"]) {
      const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
      const property = declaration.parameters[0].type.members.find((member) => member.name?.getText(source) === "expectedClientId");
      assert(property && !property.questionToken && property.type.kind === ts.SyntaxKind.StringKeyword, `${driver}.${name} requires a string binding`);
      if (driver === "postgres") {
        const queries = [];
        visit(declaration.body, (node) => {
          if (ts.isCallExpression(node) && node.expression.getText(source) === "client.query" && ts.isStringLiteral(node.arguments[0])) queries.push(node);
        });
        const select = queries.find((query) => query.arguments[0].text.startsWith("SELECT * FROM tasks"));
        const update = queries.find((query) => query.arguments[0].text.startsWith("UPDATE tasks"));
        assert(select && update);
        for (const [query, index] of [[select, 2], [update, 3]]) {
          const sql = query.arguments[0].text;
          assert.match(sql, new RegExp(`AND client_id = \\$${index + 1}(?: |$)`));
          assert.equal(query.arguments[1].elements[index].getText(source), "input.expectedClientId");
        }
        assert.match(select.arguments[0].text, /FOR UPDATE$/);
      }
    }
  }
  const sourceFiles = (directory) => readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(relative) : /\.tsx?$/.test(entry.name) ? [relative] : [];
  });
  let mutationCalls = 0;
  for (const file of sourceFiles("src")) {
    const source = parse(file);
    visit(source, (node) => {
      if (!ts.isCallExpression(node)) return;
      const callee = node.expression.getText(source);
      if (!/(?:^|\.)(?:updateTaskStatus|rescheduleTask)$/.test(callee)) return;
      if (file === "src/lib/data.ts" && /^repo\./.test(callee)) return; // typed transparent forwarding, checked below
      mutationCalls += 1;
      const argument = node.arguments[0];
      assert(argument && ts.isObjectLiteralExpression(argument), `Uninspectable mutation binding in ${file}`);
      assert(argument.properties.some((property) => property.name?.getText(source) === "expectedClientId"), `Unbound mutation call in ${file}`);
    });
  }
  assert.equal(mutationCalls, 4);
  const proxy = readFileSync(path.join(root, "src/lib/data.ts"), "utf8");
  for (const name of ["updateTaskStatus", "rescheduleTask"]) assert(proxy.includes(`export const ${name}: typeof memory.${name}`));
});
