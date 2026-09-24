import assert from "node:assert/strict";
import ts from "typescript";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/lib/supabase/membership-lifecycle.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(transpiled, { exports, require: () => ({}) });
const { persistTenantMembershipStatus, applyGlobalSupabaseDisable } = exports;

const state = [{ id: "m-a", tenantId: "tenant-a", status: "active" }, { id: "m-b", tenantId: "tenant-b", status: "active" }];
const updated = await persistTenantMembershipStatus({
  targetTenantId: "tenant-a", status: "suspended",
  updateLocal: async () => { state[0].status = "suspended"; return state[0]; },
  recordAudit: async () => {},
});
assert.equal(updated.ok, true);
assert.equal(state[0].status, "suspended");
assert.equal(state[1].status, "active", "another company's membership must remain active");

const remoteFailure = await applyGlobalSupabaseDisable({ disableProvider: async () => { throw new Error("provider down"); }, persistLocal: async () => { throw new Error("must not run"); } });
assert.equal(remoteFailure.ok, false); assert.equal(remoteFailure.stage, "provider");
const localFailure = await applyGlobalSupabaseDisable({ disableProvider: async () => {}, persistLocal: async () => null });
assert.equal(localFailure.ok, false); assert.equal(localFailure.stage, "local");
const auditWarning = await persistTenantMembershipStatus({ targetTenantId: "tenant-a", status: "removed", updateLocal: async () => state[0], recordAudit: async () => { throw new Error("audit down"); } });
assert.equal(auditWarning.warning, "audit_pending");
console.log("Supabase membership lifecycle behavior: PASS");
