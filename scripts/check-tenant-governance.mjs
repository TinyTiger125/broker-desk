#!/usr/bin/env node
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const tsModuleCache = new Map();

function resolveProjectAlias(request) {
  if (!request.startsWith("@/lib/")) return null;
  const relative = request.slice("@/lib/".length);
  const candidates = [
    path.resolve(`src/lib/${relative}`),
    path.resolve(`src/lib/${relative}.ts`),
    relative.endsWith(".mjs")
      ? path.resolve(`src/lib/${relative.slice(0, -4)}.ts`)
      : null,
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
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
const tenantOwnerActorId = "user_demo";
const platformOwnerActorId = `platform_governance_${suffix}`;
const platformOwnerNow = new Date();
assert(globalThis.__brokerDb, "tenant governance requires the published memory database");
globalThis.__brokerDb.users.push({
  id: platformOwnerActorId,
  name: "Governance Platform Owner",
  email: `platform-governance-${suffix}@example.test`,
  passwordHash: "test",
  createdAt: platformOwnerNow,
});
globalThis.__brokerDb.tenantMemberships.push({
  id: `membership_${platformOwnerActorId}`,
  tenantId,
  userId: platformOwnerActorId,
  role: "platform_owner",
  capability: "ordinary_member",
  status: "active",
  invitationProvider: "manual",
  invitationStatus: "accepted",
  invitationAcceptedAt: platformOwnerNow,
  createdAt: platformOwnerNow,
  updatedAt: platformOwnerNow,
});
const invited = await data.inviteTenantMember({
  tenantId,
  name: `Governance Test ${suffix}`,
  email: `governance-${suffix}@example.test`,
  role: "broker",
  status: "invited",
  capability: "ordinary_member",
  invitedByUserId: tenantOwnerActorId,
});
assert(invited.status === "invited", "local invite must start as invited");
assert(invited.role === "broker", "local invite should keep requested role");
const governanceSubject = `clerk_governance_${suffix}`;
const governanceUser = await data.bindCurrentClerkIdentityToPendingInvitation({
  subject: governanceSubject,
  email: invited.user.email,
  name: invited.user.name,
});
assert(governanceUser?.externalAuthSubject === governanceSubject, "invited governance identity should bind before acceptance");
const accepted = await data.acceptTenantInvitation({
  userId: governanceUser.id,
  tenantId,
  membershipId: invited.id,
  invitationToken: invited.invitationToken,
});
assert(accepted?.status === "active" && accepted.invitationStatus === "accepted", "explicit token acceptance should activate the invited membership");

const updated = await data.updateTenantMemberRole({
  tenantId,
  membershipId: invited.id,
  role: "manager",
  capability: "company_form_admin",
  actorUserId: tenantOwnerActorId,
});
assert(updated?.role === "manager" && updated.capability === "company_form_admin", "member role update should persist the canonical capability mapping");

const suspended = await data.updateTenantMemberStatus({
  tenantId,
  membershipId: invited.id,
  status: "suspended",
  actorUserId: tenantOwnerActorId,
});
assert(suspended?.status === "suspended", "member suspension should persist");

const members = await data.listTenantMembers(tenantId);
assert(members.some((member) => member.id === invited.id && member.status === "suspended"), "tenant member list should include updated member");

const seatAccount = await data.createTenantAccount({
  name: `Seat Test ${suffix}`,
  accountType: "company",
  status: "active",
  purchasedSeatCount: 1,
  actorUserId: platformOwnerActorId,
  ownerName: "Seat Owner",
  ownerEmail: `seat-owner-${suffix}@example.test`,
});
assert(seatAccount.purchasedSeatCount === 1, "tenant account should persist purchased seat count");
assert(seatAccount.activeSeatCount === 0, "new platform-created owner should not be active before login binding");
assert(seatAccount.invitedSeatCount === 1, "new platform-created owner should consume one invited seat");
assert(seatAccount.ownerMembers[0]?.invitationStatus === "not_sent", "new platform-created owner should start as not sent");

const expandedSeatAccount = await data.updateTenantAccountLifecycle({
  tenantId: seatAccount.id,
  status: "active",
  purchasedSeatCount: 2,
  actorUserId: platformOwnerActorId,
});
assert(expandedSeatAccount?.purchasedSeatCount === 2, "platform lifecycle update should increase purchased seats");
const shrunkSeatAccount = await data.updateTenantAccountLifecycle({
  tenantId: seatAccount.id,
  status: "trial",
  purchasedSeatCount: 1,
  actorUserId: platformOwnerActorId,
});
assert(shrunkSeatAccount?.status === "trial", "tenant lifecycle should support trial status");
assert(data.isTenantAccessibleStatus(shrunkSeatAccount.status), "trial tenants should remain accessible");

const loginOwnerEmail = `login-owner-${suffix}@example.test`;
const loginAccount = await data.createTenantAccount({
  name: `Login Test ${suffix}`,
  accountType: "individual",
  status: "trial",
  purchasedSeatCount: 2,
  actorUserId: platformOwnerActorId,
  ownerName: "Login Owner",
  ownerEmail: loginOwnerEmail,
});
const invitation = loginAccount.ownerMembers[0];
assert(invitation?.status === "invited" && invitation.role === "tenant_owner", "platform-created owner must start as an invited company owner");

const externalSubject = `clerk_user_${suffix}`;
const pendingOwner = await data.refreshTenantMemberInvitation({
  tenantId: loginAccount.id,
  membershipId: invitation.id,
  invitedByUserId: platformOwnerActorId,
});
assert(pendingOwner?.invitationStatus === "pending", "owner invitation should be pending before acceptance");
const linkedUser = await data.bindCurrentClerkIdentityToPendingInvitation({
  subject: externalSubject,
  email: loginOwnerEmail,
  name: "Login Owner",
});
assert(linkedUser?.externalAuthSubject === externalSubject, "external auth identity should bind invited local user");
const acceptedOwner = await data.acceptTenantInvitation({
  userId: linkedUser.id,
  tenantId: loginAccount.id,
  membershipId: pendingOwner.id,
  invitationToken: pendingOwner.invitationToken,
});
assert(acceptedOwner?.status === "active", "invitation acceptance should activate invited membership");

const loginMembers = await data.listTenantMembers(loginAccount.id);
const loginOwner = loginMembers.find((member) => member.user.email === loginOwnerEmail);
assert(loginOwner?.status === "active", "accepted invitation should activate membership");
assert(loginOwner?.invitationStatus === "accepted", "accepted invitation should mark invitation accepted");
assert(loginOwner?.user.externalAuthSubject === externalSubject, "member list should expose external auth binding");

const ownerTenants = await data.listTenantsForUser(linkedUser.id);
assert(ownerTenants.some((tenant) => tenant.id === loginAccount.id), "activated owner should be able to resolve their tenant");

const suspendedExternal = await data.suspendUserForExternalAuthSubject(externalSubject);
assert(suspendedExternal.suspendedMembershipCount >= 1, "external auth deletion should suspend linked memberships");
const suspendedLoginMembers = await data.listTenantMembers(loginAccount.id);
assert(
  suspendedLoginMembers.some((member) => member.user.email === loginOwnerEmail && member.status === "suspended"),
  "external auth deletion should suspend the tenant membership",
);
const suspendedOwnerTenants = await data.listTenantsForUser(linkedUser.id);
assert(!suspendedOwnerTenants.some((tenant) => tenant.id === loginAccount.id), "suspended external user should lose tenant resolution");

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
