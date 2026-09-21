import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/supabase/account-lifecycle.ts", import.meta.url), "utf8");
const module = await import(`data:text/javascript,${encodeURIComponent(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText)}`);

const owner = {
  authUserId: "supabase_owner_01",
  email: "owner@example.test",
  tenantId: "tenant_alpha",
  role: "platform_owner",
  status: "active",
  sessionVersion: 1,
};
const employee = {
  authUserId: "supabase_employee_01",
  email: "employee@example.test",
  tenantId: "tenant_alpha",
  role: "ordinary_member",
  status: "active",
  sessionVersion: 1,
};

const bootstrapInput = {
  requestedAuthUserId: owner.authUserId,
  requestedEmail: owner.email,
  fixedTenantId: "tenant_internal",
  fixedMembershipId: "membership_platform_owner",
  fixedAuditId: "audit_platform_bootstrap",
  users: [],
  audits: [],
};
const firstPlan = module.planPlatformOwnerBootstrap(bootstrapInput);
if (firstPlan.kind !== "create" || firstPlan.idempotencyKey !== "tenant_internal:supabase_owner_01") {
  throw new Error("first platform-owner bootstrap must produce a fixed create plan");
}
const idempotentPlan = module.planPlatformOwnerBootstrap({
  ...bootstrapInput,
  users: [owner],
  audits: [{
    id: "audit_platform_bootstrap",
    action: "platform.bootstrap",
    actorAuthUserId: owner.authUserId,
    targetAuthUserId: owner.authUserId,
    tenantId: "tenant_internal",
    idempotencyKey: "tenant_internal:supabase_owner_01",
  }],
});
if (idempotentPlan.kind !== "idempotent") throw new Error("repeating the exact bootstrap must be idempotent");
try {
  module.planPlatformOwnerBootstrap({ ...bootstrapInput, users: [{ ...employee, role: "platform_owner" }] });
  throw new Error("conflicting active platform owner was accepted");
} catch (error) {
  if (!String(error.message).includes("bootstrap conflict")) throw error;
}

module.validateMemberInvitation({ actor: owner, tenantId: "tenant_alpha", email: "new@example.test", role: "ordinary_member" });
for (const invalid of [
  { actor: employee, tenantId: "tenant_beta", email: "cross@example.test", role: "ordinary_member" },
  { actor: owner, tenantId: "tenant_alpha", email: "owner2@example.test", role: "platform_owner" },
  { actor: { ...owner, status: "disabled" }, tenantId: "tenant_alpha", email: "disabled@example.test", role: "ordinary_member" },
]) {
  try {
    module.validateMemberInvitation(invalid);
    throw new Error("invalid member invitation was accepted");
  } catch (error) {
    if (!String(error.message).includes("cannot") && !String(error.message).includes("requires") && !String(error.message).includes("outside")) throw error;
  }
}

const resetPlan = module.planPasswordReset(employee, employee.email);
if (resetPlan.kind !== "password_reset_requested" || resetPlan.idempotencyKey.includes("token")) {
  throw new Error("password reset plan must be provider-owned and token-free");
}
try {
  module.planPasswordReset({ ...employee, status: "disabled" }, employee.email);
  throw new Error("disabled user was allowed to request password reset");
} catch (error) {
  if (!String(error.message).includes("disabled")) throw error;
}

const disablePlan = module.planDisableUser({ actor: owner, target: employee });
if (!disablePlan.revokeExistingSessions) throw new Error("disable plan must revoke existing sessions");
if (module.canUseSupabaseSession({ ...employee, status: "disabled", sessionVersion: 2 }, 1)) {
  throw new Error("disabled user session remained valid");
}
if (!module.canUseSupabaseSession(employee, 1)) throw new Error("active user session was rejected");

console.log("supabase account lifecycle fixture passed (bootstrap idempotency/conflict, scoped invitations, password reset, immediate session revocation)");
