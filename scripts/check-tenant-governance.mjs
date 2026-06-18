#!/usr/bin/env node
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const tsModuleCache = new Map();

function resolveProjectAlias(request) {
  if (!request.startsWith("@/lib/")) return null;
  return path.resolve(`src/lib/${request.slice("@/lib/".length)}.ts`);
}

function loadTsModule(sourcePath) {
  sourcePath = path.resolve(sourcePath);
  if (tsModuleCache.has(sourcePath)) return tsModuleCache.get(sourcePath);

  const source = fs.readFileSync(sourcePath, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = new Module(sourcePath);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(process.cwd());
  const originalRequire = mod.require.bind(mod);
  tsModuleCache.set(sourcePath, mod.exports);
  mod.require = (request) => {
    const aliasPath = resolveProjectAlias(request);
    return aliasPath ? loadTsModule(aliasPath) : originalRequire(request);
  };
  mod._compile(js, sourcePath);
  tsModuleCache.set(sourcePath, mod.exports);
  return mod.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const permissions = loadTsModule("src/lib/tenant-permissions.ts");
const data = loadTsModule("src/lib/data.memory.ts");
const friendsPdf = loadTsModule("src/lib/friends-guarantee-pdf.ts");

assert(!permissions.roleHasTenantPermission("broker", "output.download_final"), "broker must not download final outputs by default");
assert(!permissions.roleHasTenantPermission("broker", "extract.override_result"), "broker must not override extraction results by default");
assert(!permissions.roleHasTenantPermission("data_operator", "output.download_final"), "data operator must not download final outputs by default");
assert(permissions.roleHasTenantPermission("tenant_admin", "template.publish"), "tenant admin should publish tenant templates");
assert(!permissions.roleHasTenantPermission("tenant_admin", "template.manage_official"), "tenant admin must not manage official templates");
assert(permissions.roleHasAllTenantPermissions("tenant_owner", ["member.invite", "member.update_role", "member.remove"]), "tenant owner should manage members");

const tenantId = "tenant_cherry";
const suffix = Date.now().toString(36);
const invited = await data.inviteTenantMember({
  tenantId,
  name: `Governance Test ${suffix}`,
  email: `governance-${suffix}@example.test`,
  role: "broker",
});
assert(invited.status === "active", "local invite should create active membership");
assert(invited.role === "broker", "local invite should keep requested role");

const updated = await data.updateTenantMemberRole({
  tenantId,
  membershipId: invited.id,
  role: "viewer",
});
assert(updated?.role === "viewer", "member role update should persist");

const suspended = await data.updateTenantMemberStatus({
  tenantId,
  membershipId: invited.id,
  status: "suspended",
});
assert(suspended?.status === "suspended", "member suspension should persist");

const members = await data.listTenantMembers(tenantId);
assert(members.some((member) => member.id === invited.id && member.status === "suspended"), "tenant member list should include updated member");

const seatAccount = await data.createTenantAccount({
  name: `Seat Test ${suffix}`,
  accountType: "company",
  status: "active",
  purchasedSeatCount: 1,
  ownerName: "Seat Owner",
  ownerEmail: `seat-owner-${suffix}@example.test`,
});
assert(seatAccount.purchasedSeatCount === 1, "tenant account should persist purchased seat count");
assert(seatAccount.activeSeatCount === 1, "initial tenant owner should consume one active seat");

let overCapacityRejected = false;
try {
  await data.inviteTenantMember({
    tenantId: seatAccount.id,
    name: "Seat Broker",
    email: `seat-broker-${suffix}@example.test`,
    role: "broker",
  });
} catch (error) {
  overCapacityRejected = String(error?.message ?? error).includes("purchased seat count exceeded");
}
assert(overCapacityRejected, "tenant member invite must be blocked when purchased seats are exhausted");

const expandedSeatAccount = await data.updateTenantAccountLifecycle({
  tenantId: seatAccount.id,
  status: "active",
  purchasedSeatCount: 2,
});
assert(expandedSeatAccount?.purchasedSeatCount === 2, "platform lifecycle update should increase purchased seats");

const secondSeatMember = await data.inviteTenantMember({
  tenantId: seatAccount.id,
  name: "Seat Broker",
  email: `seat-broker-${suffix}@example.test`,
  role: "broker",
});
assert(secondSeatMember.status === "active", "expanded tenant should allow a second active member");

let shrinkRejected = false;
try {
  await data.updateTenantAccountLifecycle({
    tenantId: seatAccount.id,
    status: "active",
    purchasedSeatCount: 1,
  });
} catch (error) {
  shrinkRejected = String(error?.message ?? error).includes("purchased seat count cannot be lower than used seats");
}
assert(shrinkRejected, "platform lifecycle update must reject shrinking seats below used seats");

await data.updateTenantMemberStatus({
  tenantId: seatAccount.id,
  membershipId: secondSeatMember.id,
  status: "suspended",
});
const shrunkSeatAccount = await data.updateTenantAccountLifecycle({
  tenantId: seatAccount.id,
  status: "trial",
  purchasedSeatCount: 1,
});
assert(shrunkSeatAccount?.status === "trial", "tenant lifecycle should support trial status");
assert(data.isTenantAccessibleStatus(shrunkSeatAccount.status), "trial tenants should remain accessible");

let reactivateRejected = false;
try {
  await data.updateTenantMemberStatus({
    tenantId: seatAccount.id,
    membershipId: secondSeatMember.id,
    status: "active",
  });
} catch (error) {
  reactivateRejected = String(error?.message ?? error).includes("purchased seat count exceeded");
}
assert(reactivateRejected, "reactivating a suspended member must also honor purchased seats");

const layoutSnapshot = friendsPdf.getFriendsGuaranteeTemplateLayoutSnapshot("friends_guarantee_individual_v1");
assert(layoutSnapshot.templateId === "friends_guarantee_individual_v1", "layout snapshot should retain template id");
assert(typeof layoutSnapshot.baselineVersion === "string" && layoutSnapshot.baselineVersion.length > 0, "layout snapshot should include baseline version");

const output = await data.addGeneratedOutput({
  tenantId,
  userId: "user_demo",
  actorId: "user_demo",
  outputType: "guarantee_application",
  outputFormat: "pdf",
  language: "ja",
  title: `Governance output ${suffix}`,
  documentNumber: `BD-GOV-${suffix}`,
  templateVersionId: `official:friends_guarantee_individual_v1:${layoutSnapshot.baselineVersion}`,
  caseId: `case_${suffix}`,
  templateId: "friends_guarantee_individual_v1",
  inputDataSnapshot: { applicant: { name: "山田 太郎" } },
  draftValueSnapshot: { "company_option.friends_plan_type": "サポート50" },
  fieldMappingSnapshot: { overlayFieldKeys: ["applicant.name"] },
  layoutSnapshot,
});
const found = await data.getGeneratedOutputById({ tenantId, userId: "user_demo", id: output.id });
assert(found?.outputType === "guarantee_application", "generated output should preserve guarantee output type");
assert(found?.templateId === "friends_guarantee_individual_v1", "generated output should preserve template id");
assert(found?.inputDataSnapshot?.applicant, "generated output should preserve input data snapshot");
assert(found?.layoutSnapshot?.baselineVersion === layoutSnapshot.baselineVersion, "generated output should preserve layout snapshot");

console.log("[PASS] tenant governance regression");
