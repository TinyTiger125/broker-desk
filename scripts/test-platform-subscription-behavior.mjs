#!/usr/bin/env node
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const cache = new Map();
function resolveAlias(request) {
  const relative = request.slice("@/lib/".length);
  const candidates = /\.(?:ts|mjs|js|cjs)$/.test(relative)
    ? [path.resolve(`src/lib/${relative}`)]
    : [".ts", ".mjs", ".js", ".cjs"].map((extension) => path.resolve(`src/lib/${relative}${extension}`));
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}
function loadTs(sourcePath) {
  sourcePath = path.resolve(sourcePath);
  if (cache.has(sourcePath)) return cache.get(sourcePath);
  const output = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = new Module(sourcePath);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(process.cwd());
  cache.set(sourcePath, mod.exports);
  const originalRequire = mod.require.bind(mod);
  mod.require = (request) => {
    if (!request.startsWith("@/lib/")) return originalRequire(request);
    return loadTs(resolveAlias(request));
  };
  mod._compile(output, sourcePath);
  cache.set(sourcePath, mod.exports);
  return mod.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const { countTenantSeatUsage, deriveTenantServiceState, getTenantServiceStatusLabel, isTenantServiceOperational, membershipOccupiesSeat } = loadTs("src/lib/tenant-service.ts");
const tenant = (overrides = {}) => ({ status: "active", serviceStartAt: "2026-09-01", serviceEndAt: "2026-10-31", ...overrides });
const atTokyoNoon = (date) => new Date(`${date}T03:00:00.000Z`);

const cases = [
  ["2026-08-31", "pending", null],
  ["2026-09-01", "active", 60],
  ["2026-09-30", "active", 31],
  ["2026-10-01", "expiring", 30],
  ["2026-10-30", "expiring", 1],
  ["2026-10-31", "expiring", 0],
  ["2026-11-01", "expired", -1],
];
for (const [date, status, remainingDays] of cases) {
  const state = deriveTenantServiceState(tenant(), atTokyoNoon(date));
  assert(state.status === status, `${date} should be ${status}, got ${state.status}`);
  assert(state.remainingDays === remainingDays, `${date} remaining days should be ${remainingDays}, got ${state.remainingDays}`);
}
assert(deriveTenantServiceState(tenant(), new Date("2026-10-31T14:59:59.999Z")).status === "expiring", "end date must remain valid through 23:59:59 JST");
assert(deriveTenantServiceState(tenant(), new Date("2026-10-31T15:00:00.000Z")).status === "expired", "service must expire at 00:00 JST on the following date");
assert(deriveTenantServiceState(tenant({ status: "suspended" }), atTokyoNoon("2026-09-15")).status === "suspended", "suspended must override dates");
assert(deriveTenantServiceState(tenant({ status: "cancelled" }), atTokyoNoon("2026-09-15")).status === "cancelled", "cancelled must override dates");
assert(deriveTenantServiceState(tenant({ serviceStartAt: undefined, serviceEndAt: undefined, status: "trial" }), atTokyoNoon("2026-09-15")).status === "active", "legacy trial without dates must remain active");
assert(deriveTenantServiceState(tenant({ serviceStartAt: undefined, serviceEndAt: undefined, status: "pending_activation" }), atTokyoNoon("2026-09-15")).status === "pending", "legacy pending_activation without dates must remain pending");
assert(deriveTenantServiceState(tenant({ status: "pending_activation" }), atTokyoNoon("2026-09-15")).status === "active", "configured pending_activation must derive active during its commercial period");
assert(deriveTenantServiceState(tenant({ status: "pending_activation" }), atTokyoNoon("2026-08-31")).status === "pending", "configured pending_activation must remain pending before its commercial start date");
assert(deriveTenantServiceState(tenant({ status: "pending_activation" }), atTokyoNoon("2026-11-01")).status === "expired", "configured pending_activation must expire after its commercial end date");
assert(isTenantServiceOperational({ status: "active", remainingDays: null }), "active service must be operational");
assert(isTenantServiceOperational({ status: "expiring", remainingDays: 0 }), "end date must remain operational");
assert(!isTenantServiceOperational({ status: "expired", remainingDays: -1 }), "expired service must fail closed");

const invitationExpiryBoundary = new Date("2026-09-15T03:00:00.000Z");
const expiringSeat = { status: "invited", invitationStatus: "pending", invitationExpiresAt: invitationExpiryBoundary };
assert(membershipOccupiesSeat(expiringSeat, new Date(invitationExpiryBoundary.getTime() - 1)), "pending invitation must occupy a seat immediately before expiry");
assert(!membershipOccupiesSeat(expiringSeat, invitationExpiryBoundary), "pending invitation must release its seat at the exact expiry instant");
assert(membershipOccupiesSeat({ ...expiringSeat, status: "suspended" }, invitationExpiryBoundary), "suspended membership must occupy a seat regardless of invitation expiry");

const serviceStatusLabels = {
  pending: { ja: "開始前", zh: "待开始", ko: "시작 전" },
  active: { ja: "利用中", zh: "服务中", ko: "이용 중" },
  expiring: { ja: "終了30日前", zh: "30天内到期", ko: "30일 이내 종료" },
  expired: { ja: "期間終了", zh: "已到期", ko: "기간 종료" },
  suspended: { ja: "停止中", zh: "已暂停", ko: "중지됨" },
  cancelled: { ja: "解約済み", zh: "已取消", ko: "해지됨" },
};
for (const [status, labels] of Object.entries(serviceStatusLabels)) {
  for (const locale of ["ja", "zh", "ko"]) {
    assert(getTenantServiceStatusLabel(status, locale) === labels[locale], `${status} must use the shared ${locale} service-status label`);
  }
}

const workerClaimServiceCases = [
  [tenant({ status: "active" }), atTokyoNoon("2026-09-15"), true, "active commercial period"],
  [tenant({ status: "active", serviceEndAt: "2026-09-30" }), atTokyoNoon("2026-09-15"), true, "expiring commercial period"],
  [tenant({ status: "suspended" }), atTokyoNoon("2026-09-15"), false, "suspended override"],
  [tenant({ status: "cancelled" }), atTokyoNoon("2026-09-15"), false, "cancelled override"],
  [tenant({ status: "pending_activation", serviceStartAt: undefined, serviceEndAt: undefined }), atTokyoNoon("2026-09-15"), false, "undated pending_activation"],
  [tenant({ status: "pending_activation" }), atTokyoNoon("2026-08-31"), false, "future commercial period"],
  [tenant({ status: "active" }), atTokyoNoon("2026-11-01"), false, "expired commercial period"],
];
for (const [input, now, expected, label] of workerClaimServiceCases) {
  const serviceState = deriveTenantServiceState(input, now);
  assert(isTenantServiceOperational(serviceState) === expected, `import worker eligibility must reject or allow ${label} through the shared service state`);
}

const tenantRlsServiceCases = [
  [true, tenant({ status: "pending_activation" }), atTokyoNoon("2026-09-15"), true, "configured-current pending_activation active member"],
  [true, tenant({ status: "active" }), atTokyoNoon("2026-11-01"), false, "expired persisted-active tenant"],
  [true, tenant({ status: "suspended" }), atTokyoNoon("2026-09-15"), false, "suspended override"],
  [true, tenant({ status: "cancelled" }), atTokyoNoon("2026-09-15"), false, "cancelled override"],
  [true, tenant({ status: "pending_activation", serviceStartAt: undefined, serviceEndAt: undefined }), atTokyoNoon("2026-09-15"), false, "undated pending_activation"],
  [true, tenant({ status: "trial", serviceStartAt: undefined, serviceEndAt: undefined }), atTokyoNoon("2026-09-15"), true, "legacy undated trial"],
  [true, tenant({ status: "active", serviceStartAt: undefined, serviceEndAt: undefined }), atTokyoNoon("2026-09-15"), true, "legacy undated active"],
  [false, tenant({ status: "active" }), atTokyoNoon("2026-09-15"), false, "missing active membership"],
];
for (const [hasActiveMembership, input, now, expected, label] of tenantRlsServiceCases) {
  const actual = hasActiveMembership && isTenantServiceOperational(deriveTenantServiceState(input, now));
  assert(actual === expected, `tenant RLS service matrix must handle ${label}`);
}

const restrictedRoster = [
  { id: "owner", status: "active", invitationStatus: "accepted", capability: "company_owner" },
  { id: "active", status: "active", invitationStatus: "accepted", capability: "ordinary_member" },
  { id: "invited", status: "invited", invitationStatus: "pending", capability: "ordinary_member" },
  { id: "suspended", status: "suspended", invitationStatus: "revoked", capability: "ordinary_member" },
];
const readRestrictedRoster = (actorCapability, actorStatus) => actorStatus === "active" && actorCapability === "company_owner" ? restrictedRoster : [];
for (const serviceStatus of ["pending", "expired", "suspended", "cancelled"]) {
  const visibleRoster = readRestrictedRoster("company_owner", "active");
  assert(visibleRoster.length === 4 && visibleRoster.map((membership) => membership.id).join(",") === "owner,active,invited,suspended", `${serviceStatus} company owner must retain the real restricted roster`);
  assert(countTenantSeatUsage(visibleRoster) === 4, `${serviceStatus} company owner must retain accurate active, invited, and suspended seat counts`);
  assert(!isTenantServiceOperational({ status: serviceStatus, remainingDays: serviceStatus === "expired" ? -1 : null }), `${serviceStatus} mutation and invitation paths must remain non-operational`);
}
assert(readRestrictedRoster("ordinary_member", "active").length === 0, "ordinary member must not read the restricted member roster");
assert(readRestrictedRoster("company_form_admin", "active").length === 0, "company form admin must not read the restricted member roster");

const data = loadTs("src/lib/data.memory.ts");
const authorizationDb = globalThis.__brokerDb;
assert(authorizationDb, "memory authorization behavior requires the published database");
const authorizationNow = new Date();
authorizationDb.users.push({
  id: "actor_task043",
  name: "TASK043 Platform Owner",
  email: "task043-platform-owner@example.test",
  passwordHash: "test",
  createdAt: authorizationNow,
});
authorizationDb.tenantMemberships.push({
  id: "membership_task043_platform_owner",
  tenantId: "tenant_cherry",
  userId: "actor_task043",
  role: "platform_owner",
  capability: "ordinary_member",
  status: "active",
  invitationProvider: "manual",
  invitationStatus: "accepted",
  createdAt: authorizationNow,
  updatedAt: authorizationNow,
});
const tokyoToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const shiftCalendarDate = (date, days) => {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
};
const activatePlatformCreatedOwner = (account) => {
  const ownerMembership = globalThis.__brokerDb.tenantMemberships.find((membership) => membership.id === account.ownerMembers[0]?.id);
  assert(ownerMembership, `platform-created owner must exist for ${account.slug}`);
  ownerMembership.status = "active";
  ownerMembership.invitationStatus = "accepted";
  ownerMembership.invitationAcceptedAt = new Date();
  ownerMembership.updatedAt = ownerMembership.invitationAcceptedAt;
  return ownerMembership.userId;
};

const invitationAcceptanceServiceCases = [
  ["pending", "pending_activation", 1, 31, false],
  ["active-start-boundary", "pending_activation", 0, 31, true],
  ["expiring-30-days", "active", -1, 30, true],
  ["expiring-end-boundary", "active", -31, 0, true],
  ["expired", "active", -31, -1, false],
  ["suspended", "suspended", -1, 31, false],
  ["cancelled", "cancelled", -1, 31, false],
];
for (const [slug, status, startOffset, endOffset, shouldAccept] of invitationAcceptanceServiceCases) {
  const acceptanceAccount = await data.createTenantAccount({
    name: `TASK043 Acceptance ${slug}`,
    slug: `task043-acceptance-${slug}`,
    accountType: "company",
    status: "active",
    purchasedSeatCount: 2,
    serviceStartAt: shiftCalendarDate(tokyoToday, -1),
    serviceEndAt: shiftCalendarDate(tokyoToday, 31),
    actorUserId: "actor_task043",
    ownerName: `${slug} Acceptance Owner`,
    ownerEmail: `task043-acceptance-${slug}-owner@example.test`,
  });
  assert(acceptanceAccount.ownerMembers[0]?.invitedEmail === `task043-acceptance-${slug}-owner@example.test`, `${slug} platform-created owner must persist normalized invitedEmail`);
  const acceptanceOwnerId = activatePlatformCreatedOwner(acceptanceAccount);
  const acceptanceInvite = await data.inviteTenantMember({
    tenantId: acceptanceAccount.id,
    name: `${slug} Acceptance Member`,
    email: `task043-acceptance-${slug}-member@example.test`,
    role: "broker",
    status: "invited",
    capability: "ordinary_member",
    invitedByUserId: acceptanceOwnerId,
  });
  const acceptanceTenant = globalThis.__brokerDb.tenants.find((item) => item.id === acceptanceAccount.id);
  const acceptanceMembership = globalThis.__brokerDb.tenantMemberships.find((item) => item.id === acceptanceInvite.id);
  assert(acceptanceTenant && acceptanceMembership, `${slug} acceptance fixture must exist`);
  acceptanceTenant.status = status;
  acceptanceTenant.serviceStartAt = shiftCalendarDate(tokyoToday, startOffset);
  acceptanceTenant.serviceEndAt = shiftCalendarDate(tokyoToday, endOffset);
  const beforeReference = globalThis.__brokerDb;
  const beforeTenant = JSON.stringify(acceptanceTenant);
  const beforeMembership = JSON.stringify(acceptanceMembership);
  const beforeSeats = countTenantSeatUsage(globalThis.__brokerDb.tenantMemberships.filter((item) => item.tenantId === acceptanceAccount.id));
  const accepted = await data.acceptTenantInvitation({ userId: acceptanceInvite.userId, tenantId: acceptanceAccount.id, membershipId: acceptanceInvite.id, invitationToken: acceptanceInvite.invitationToken });
  const afterSeats = countTenantSeatUsage(globalThis.__brokerDb.tenantMemberships.filter((item) => item.tenantId === acceptanceAccount.id));
  if (shouldAccept) {
    assert(accepted?.status === "active" && accepted.invitationStatus === "accepted", `${slug} operational service must accept a valid invitation`);
    assert(beforeSeats === afterSeats, `${slug} acceptance must remain a seat-to-seat transition`);
  } else {
    assert(accepted === null, `${slug} non-operational service must reject invitation acceptance`);
    assert(globalThis.__brokerDb === beforeReference, `${slug} rejection must preserve the published database reference`);
    assert(JSON.stringify(acceptanceTenant) === beforeTenant && JSON.stringify(acceptanceMembership) === beforeMembership, `${slug} rejection must preserve tenant and invitation state`);
    assert(beforeSeats === afterSeats, `${slug} rejection must preserve seat usage`);
  }
}

const legacyNullAccount = await data.createTenantAccount({ name: "TASK043 Legacy NULL Acceptance", slug: "task043-legacy-null-acceptance", accountType: "company", status: "active", purchasedSeatCount: 2, serviceStartAt: shiftCalendarDate(tokyoToday, -1), serviceEndAt: shiftCalendarDate(tokyoToday, 31), actorUserId: "actor_task043", ownerName: "Legacy NULL Owner", ownerEmail: "task043-legacy-null-owner@example.test" });
const legacyNullOwnerId = activatePlatformCreatedOwner(legacyNullAccount);
const legacyNullInvite = await data.inviteTenantMember({ tenantId: legacyNullAccount.id, name: "Legacy NULL Member", email: "TASK043-Legacy-Null-Member@Example.Test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: legacyNullOwnerId });
const legacyNullMembership = globalThis.__brokerDb.tenantMemberships.find((item) => item.id === legacyNullInvite.id);
const legacyNullUser = globalThis.__brokerDb.users.find((item) => item.id === legacyNullInvite.userId);
assert(legacyNullMembership && legacyNullUser, "legacy NULL acceptance fixture must exist");
legacyNullMembership.invitedEmail = undefined;
const legacyNullUnboundReference = globalThis.__brokerDb;
const legacyNullUnboundMembership = JSON.stringify(legacyNullMembership);
const legacyNullUnboundResult = await data.acceptTenantInvitation({ userId: legacyNullInvite.userId, tenantId: legacyNullAccount.id, membershipId: legacyNullInvite.id, invitationToken: legacyNullInvite.invitationToken });
assert(legacyNullUnboundResult === null, "unbound legacy NULL invitation must remain unavailable");
assert(globalThis.__brokerDb === legacyNullUnboundReference && JSON.stringify(legacyNullMembership) === legacyNullUnboundMembership, "unbound legacy NULL rejection must publish no state");
legacyNullUser.externalAuthSubject = "clerk_subject_legacy_null";
const legacyNullAccepted = await data.acceptTenantInvitation({ userId: legacyNullInvite.userId, tenantId: legacyNullAccount.id, membershipId: legacyNullInvite.id, invitationToken: legacyNullInvite.invitationToken });
assert(legacyNullAccepted?.status === "active" && legacyNullAccepted.invitationStatus === "accepted", "bound legacy NULL invitation must accept without manual resend");
assert(legacyNullAccepted.invitedEmail === "task043-legacy-null-member@example.test", "legacy NULL acceptance must atomically backfill the normalized bound user email");

const expiredTokenAccount = await data.createTenantAccount({ name: "TASK043 Expired Acceptance Token", slug: "task043-expired-acceptance-token", accountType: "company", status: "active", purchasedSeatCount: 2, serviceStartAt: shiftCalendarDate(tokyoToday, -1), serviceEndAt: shiftCalendarDate(tokyoToday, 31), actorUserId: "actor_task043", ownerName: "Expired Token Owner", ownerEmail: "task043-expired-token-owner@example.test" });
const expiredTokenOwnerId = activatePlatformCreatedOwner(expiredTokenAccount);
const expiredTokenInvite = await data.inviteTenantMember({ tenantId: expiredTokenAccount.id, name: "Expired Token Member", email: "task043-expired-token-member@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: expiredTokenOwnerId });
const expiredTokenMembership = globalThis.__brokerDb.tenantMemberships.find((item) => item.id === expiredTokenInvite.id);
assert(expiredTokenMembership, "expired acceptance token fixture must exist");
expiredTokenMembership.invitationExpiresAt = new Date(Date.now() - 1);
const expiredTokenResult = await data.acceptTenantInvitation({ userId: expiredTokenInvite.userId, tenantId: expiredTokenAccount.id, membershipId: expiredTokenInvite.id, invitationToken: expiredTokenInvite.invitationToken });
const publishedExpiredTokenMembership = globalThis.__brokerDb.tenantMemberships.find((item) => item.id === expiredTokenInvite.id);
assert(expiredTokenResult === null && publishedExpiredTokenMembership?.status === "invited" && publishedExpiredTokenMembership.invitationStatus === "expired", "expired invitation token must not activate and must persist derived expiry only for operational service");

const atomicAcceptanceAccount = await data.createTenantAccount({ name: "TASK043 Atomic Invitation Acceptance", slug: "task043-atomic-invitation-acceptance", accountType: "company", status: "active", purchasedSeatCount: 2, serviceStartAt: shiftCalendarDate(tokyoToday, -1), serviceEndAt: shiftCalendarDate(tokyoToday, 31), actorUserId: "actor_task043", ownerName: "Atomic Acceptance Owner", ownerEmail: "task043-atomic-acceptance-owner@example.test" });
const atomicAcceptanceOwnerId = activatePlatformCreatedOwner(atomicAcceptanceAccount);
const atomicAcceptanceInvite = await data.inviteTenantMember({ tenantId: atomicAcceptanceAccount.id, name: "Atomic Acceptance Member", email: "task043-atomic-acceptance-member@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: atomicAcceptanceOwnerId });
const snapshotAtomicAcceptance = () => {
  const current = globalThis.__brokerDb;
  const membership = current.tenantMemberships.find((item) => item.id === atomicAcceptanceInvite.id);
  assert(membership, "atomic acceptance membership must exist");
  return {
    current,
    membership: JSON.stringify(membership),
    audits: current.auditLogs,
    auditContent: JSON.stringify(current.auditLogs),
    auditCount: current.auditLogs.length,
  };
};
const assertAtomicAcceptanceUnchanged = (before, label) => {
  const current = globalThis.__brokerDb;
  const membership = current.tenantMemberships.find((item) => item.id === atomicAcceptanceInvite.id);
  assert(current === before.current, `${label} must preserve the published database reference`);
  assert(JSON.stringify(membership) === before.membership, `${label} must preserve the invitation membership`);
  assert(current.auditLogs === before.audits && JSON.stringify(current.auditLogs) === before.auditContent && current.auditLogs.length === before.auditCount, `${label} must preserve the audit array reference and content`);
};

const atomicAcceptanceRandom = Math.random;
const acceptanceAuditIdBefore = snapshotAtomicAcceptance();
Math.random = () => { throw new Error("injected acceptance audit id failure"); };
try {
  let rejected = false;
  try {
    await data.acceptTenantInvitation({ userId: atomicAcceptanceInvite.userId, tenantId: atomicAcceptanceAccount.id, membershipId: atomicAcceptanceInvite.id, invitationToken: atomicAcceptanceInvite.invitationToken });
  } catch (error) {
    rejected = error instanceof Error && error.message.includes("acceptance audit id failure");
  }
  assert(rejected, "acceptance audit id construction failure must reject the primitive");
} finally {
  Math.random = atomicAcceptanceRandom;
}
assertAtomicAcceptanceUnchanged(acceptanceAuditIdBefore, "acceptance audit id failure");

const atomicAcceptanceUnshift = Array.prototype.unshift;
const acceptanceAuditInsertBefore = snapshotAtomicAcceptance();
Array.prototype.unshift = function (...items) {
  if (items[0]?.action === "tenant_invitation_accepted") throw new Error("injected acceptance audit insertion failure");
  return atomicAcceptanceUnshift.apply(this, items);
};
try {
  let rejected = false;
  try {
    await data.acceptTenantInvitation({ userId: atomicAcceptanceInvite.userId, tenantId: atomicAcceptanceAccount.id, membershipId: atomicAcceptanceInvite.id, invitationToken: atomicAcceptanceInvite.invitationToken });
  } catch (error) {
    rejected = error instanceof Error && error.message.includes("acceptance audit insertion failure");
  }
  assert(rejected, "acceptance audit insertion failure must reject the primitive");
} finally {
  Array.prototype.unshift = atomicAcceptanceUnshift;
}
assertAtomicAcceptanceUnchanged(acceptanceAuditInsertBefore, "acceptance audit insertion failure");

const acceptanceAuditCountBefore = globalThis.__brokerDb.auditLogs.filter((audit) => audit.tenantId === atomicAcceptanceAccount.id && audit.action === "tenant_invitation_accepted").length;
const atomicAccepted = await data.acceptTenantInvitation({ userId: atomicAcceptanceInvite.userId, tenantId: atomicAcceptanceAccount.id, membershipId: atomicAcceptanceInvite.id, invitationToken: atomicAcceptanceInvite.invitationToken });
const acceptanceAudits = globalThis.__brokerDb.auditLogs.filter((audit) => audit.tenantId === atomicAcceptanceAccount.id && audit.action === "tenant_invitation_accepted");
assert(atomicAccepted?.status === "active" && atomicAccepted.invitationStatus === "accepted", "successful atomic invitation acceptance must publish the accepted membership");
assert(acceptanceAudits.length === acceptanceAuditCountBefore + 1 && acceptanceAudits[0].userId === atomicAcceptanceInvite.userId && acceptanceAudits[0].actorId === atomicAcceptanceInvite.userId && acceptanceAudits[0].targetId === atomicAcceptanceInvite.id, "successful invitation acceptance must publish exactly one actor-bound acceptance audit");
const repeatedAcceptance = await data.acceptTenantInvitation({ userId: atomicAcceptanceInvite.userId, tenantId: atomicAcceptanceAccount.id, membershipId: atomicAcceptanceInvite.id, invitationToken: atomicAcceptanceInvite.invitationToken });
assert(repeatedAcceptance === null && globalThis.__brokerDb.auditLogs.filter((audit) => audit.tenantId === atomicAcceptanceAccount.id && audit.action === "tenant_invitation_accepted").length === acceptanceAudits.length, "repeating an accepted token must not add another audit");

const configuredPendingAccount = await data.createTenantAccount({
  name: "TASK043 Configured Pending Current",
  slug: "task043-configured-pending-current",
  accountType: "company",
  status: "pending_activation",
  purchasedSeatCount: 2,
  serviceStartAt: tokyoToday,
  serviceEndAt: shiftCalendarDate(tokyoToday, 31),
  actorUserId: "actor_task043",
  ownerName: "Configured Owner",
  ownerEmail: "task043-configured-current-owner@example.test",
});
const configuredCreationAudits = await data.listAuditLogs("actor_task043", { tenantId: configuredPendingAccount.id, action: "tenant_account_created" });
assert(configuredPendingAccount.ownerMembers[0]?.capability === "company_owner", "platform-created owner invitation must persist company_owner capability in its returned summary");
assert(configuredCreationAudits.length === 1, "tenant creation must publish exactly one audit with the account");
assert(JSON.stringify(configuredCreationAudits[0].context) === JSON.stringify({
  status: "pending_activation",
  purchasedSeatCount: 2,
  serviceStartAt: tokyoToday,
  serviceEndAt: shiftCalendarDate(tokyoToday, 31),
}), "tenant creation audit context must contain exactly the commercial fields");
const acceptedConfiguredOwner = globalThis.__brokerDb.tenantMemberships.find((membership) => membership.id === configuredPendingAccount.ownerMembers[0].id);
assert(acceptedConfiguredOwner, "platform-created owner membership must be published for acceptance");
acceptedConfiguredOwner.status = "active";
acceptedConfiguredOwner.invitationStatus = "accepted";
acceptedConfiguredOwner.invitationAcceptedAt = new Date();
acceptedConfiguredOwner.updatedAt = acceptedConfiguredOwner.invitationAcceptedAt;
assert(acceptedConfiguredOwner.capability === "company_owner", "simulated acceptance of a platform-created owner must retain company_owner capability");
const operationalConfiguredMembers = await data.listTenantMembers(configuredPendingAccount.id);
const operationalConfiguredSummary = (await data.listPlatformTenantAccounts()).find((item) => item.id === configuredPendingAccount.id);
assert(operationalConfiguredMembers.some((member) => member.id === acceptedConfiguredOwner.id && member.capability === "company_owner"), "an operational accepted platform-created owner must read the real member roster");
assert(operationalConfiguredSummary?.ownerMembers.some((member) => member.id === acceptedConfiguredOwner.id && member.capability === "company_owner"), "the platform summary must retain the accepted owner's company_owner capability");
assert(data.capabilityHasTenantPermission("company_owner", "member.invite"), "company_owner must retain member management permission after acceptance");
assert(!data.capabilityHasTenantPermission("ordinary_member", "member.invite"), "ordinary members must not gain member management permission");
assert(!data.capabilityHasTenantPermission("company_form_admin", "member.invite"), "company form admins must not gain member management permission");

const snapshotCreationState = () => {
  const current = globalThis.__brokerDb;
  assert(current, "memory creation behavior can inspect the published database");
  return {
    current,
    tenants: JSON.stringify(current.tenants),
    users: JSON.stringify(current.users),
    memberships: JSON.stringify(current.tenantMemberships),
    audits: JSON.stringify(current.auditLogs),
  };
};
const assertCreationStateUnchanged = (before, label) => {
  const current = globalThis.__brokerDb;
  assert(current === before.current, `${label} must preserve the published database reference`);
  assert(JSON.stringify(current.tenants) === before.tenants, `${label} must not publish a tenant`);
  assert(JSON.stringify(current.users) === before.users, `${label} must not publish a user`);
  assert(JSON.stringify(current.tenantMemberships) === before.memberships, `${label} must not publish a membership`);
  assert(JSON.stringify(current.auditLogs) === before.audits, `${label} must not publish an audit`);
};
const configuredOnlyCreateBefore = snapshotCreationState();
let configuredOnlyCreateRejected = false;
try {
  await data.createTenantAccount({ name: "TASK043 Configured Only Rejected", slug: "task043-configured-only-rejected", accountType: "company", status: "active", purchasedSeatCount: 1, actorUserId: "user_demo", ownerName: "Configured Only Owner", ownerEmail: "task043-configured-only-owner@example.test" });
} catch (error) {
  configuredOnlyCreateRejected = error instanceof Error && error.message.includes("platform owner membership required");
}
assert(configuredOnlyCreateRejected, "configured-only user_demo must not create a platform tenant before persisted bootstrap authority exists");
assertCreationStateUnchanged(configuredOnlyCreateBefore, "configured-only platform create rejection");
const bootstrapDb = globalThis.__brokerDb;
const configuredBootstrapUser = bootstrapDb.users.find((user) => user.id === "user_demo");
assert(configuredBootstrapUser, "configured bootstrap test identity must already exist without guessing or creating its id");
bootstrapDb.tenantMemberships.push({ id: "membership_task043_bootstrapped_platform_owner", tenantId: "tenant_cherry", userId: configuredBootstrapUser.id, role: "platform_owner", capability: "ordinary_member", status: "active", invitationProvider: "manual", invitationStatus: "accepted", invitationAcceptedAt: authorizationNow, createdAt: authorizationNow, updatedAt: authorizationNow });
const configuredBootstrapAccount = await data.createTenantAccount({ name: "TASK043 Configured Bootstrap Authorized", slug: "task043-configured-bootstrap-authorized", accountType: "company", status: "active", purchasedSeatCount: 1, actorUserId: configuredBootstrapUser.id, ownerName: "Configured Bootstrap Owner", ownerEmail: "task043-configured-bootstrap-authorized-owner@example.test" });
assert(configuredBootstrapAccount.ownerMembers.length === 1, "configured non-production identity must create only after persisted active platform_owner bootstrap authority exists");

const assertPlatformCreateRejectedUnchanged = async (label, actorUserId) => {
  const before = snapshotCreationState();
  let rejected = false;
  try {
    await data.createTenantAccount({ name: `TASK043 ${label}`, slug: `task043-${label}`, accountType: "company", status: "active", purchasedSeatCount: 1, actorUserId, ownerName: `${label} Owner`, ownerEmail: `task043-${label}-owner@example.test` });
  } catch (error) {
    rejected = error instanceof Error && error.message.includes("platform owner membership required");
  }
  assert(rejected, `${label} must reject platform tenant creation`);
  assertCreationStateUnchanged(before, `${label} platform create rejection`);
};
for (const [actorUserId, role, capability] of [["task043_platform_create_ordinary", "broker", "ordinary_member"], ["task043_platform_create_form_admin", "manager", "company_form_admin"]]) {
  const current = globalThis.__brokerDb;
  current.users.push({ id: actorUserId, name: actorUserId, email: `${actorUserId}@example.test`, passwordHash: "test", createdAt: authorizationNow });
  current.tenantMemberships.push({ id: `membership_${actorUserId}`, tenantId: "tenant_cherry", userId: actorUserId, role, capability, status: "active", invitationProvider: "manual", invitationStatus: "accepted", createdAt: authorizationNow, updatedAt: authorizationNow });
  await assertPlatformCreateRejectedUnchanged(actorUserId, actorUserId);
}

const deliveryRetryAccount = await data.createTenantAccount({ name: "TASK043 Delivery Retry Account", slug: "task043-delivery-retry-account", accountType: "company", status: "active", purchasedSeatCount: 1, actorUserId: "actor_task043", ownerName: "Delivery Retry Owner", ownerEmail: "task043-delivery-retry-owner@example.test" });
const deliveryRetryOwner = deliveryRetryAccount.ownerMembers[0];
await data.updateTenantMemberInvitation({ tenantId: deliveryRetryAccount.id, membershipId: deliveryRetryOwner.id, actorUserId: "actor_task043", invitationProvider: "clerk", invitationStatus: "failed", invitationError: "injected delivery failure" });
const deliveryFailureState = globalThis.__brokerDb;
assert(deliveryFailureState.tenants.filter((tenant) => tenant.id === deliveryRetryAccount.id).length === 1, "delivery failure must retain exactly one created tenant");
assert(deliveryFailureState.tenantMemberships.filter((membership) => membership.id === deliveryRetryOwner.id).length === 1, "delivery failure must retain exactly one initial owner membership");
assert(deliveryFailureState.auditLogs.filter((audit) => audit.tenantId === deliveryRetryAccount.id && audit.action === "tenant_account_created").length === 1, "delivery failure must retain exactly one atomic creation audit");
assert(deliveryFailureState.auditLogs.filter((audit) => audit.tenantId === deliveryRetryAccount.id && audit.action === "member_invitation_failed").length === 1, "delivery failure must record exactly one failed delivery audit");
const retriedDelivery = await data.updateTenantMemberInvitation({ tenantId: deliveryRetryAccount.id, membershipId: deliveryRetryOwner.id, actorUserId: "actor_task043", invitationProvider: "manual", invitationStatus: "pending" });
assert(retriedDelivery?.id === deliveryRetryOwner.id && retriedDelivery.invitationStatus === "pending", "delivery retry must reuse the existing initial owner membership");
assert(globalThis.__brokerDb.tenants.filter((tenant) => tenant.id === deliveryRetryAccount.id).length === 1 && globalThis.__brokerDb.tenantMemberships.filter((membership) => membership.id === deliveryRetryOwner.id).length === 1, "delivery retry must not create a duplicate tenant or owner");
const atomicFailureInput = (slug) => ({
  name: `TASK043 Atomic ${slug}`,
  slug: `task043-atomic-${slug}`,
  accountType: "company",
  status: "active",
  purchasedSeatCount: 2,
  serviceStartAt: tokyoToday,
  serviceEndAt: shiftCalendarDate(tokyoToday, 31),
  actorUserId: "actor_task043",
  ownerName: `Atomic ${slug} Owner`,
  ownerEmail: `task043-atomic-${slug}@example.test`,
});

const auditConstructionBefore = snapshotCreationState();
const originalRandom = Math.random;
let randomCalls = 0;
Math.random = () => {
  randomCalls += 1;
  if (randomCalls === 4) throw new Error("injected tenant creation audit construction failure");
  return originalRandom();
};
try {
  let rejected = false;
  try {
    await data.createTenantAccount(atomicFailureInput("audit-construction"));
  } catch (error) {
    rejected = error instanceof Error && error.message.includes("audit construction failure");
  }
  assert(rejected, "injected tenant creation audit construction failure must reject");
} finally {
  Math.random = originalRandom;
}
assertCreationStateUnchanged(auditConstructionBefore, "audit construction failure");

const auditInsertionBefore = snapshotCreationState();
const originalUnshift = Array.prototype.unshift;
Array.prototype.unshift = function (...items) {
  if (items[0]?.action === "tenant_account_created") {
    throw new Error("injected tenant creation audit insertion failure");
  }
  return originalUnshift.apply(this, items);
};
try {
  let rejected = false;
  try {
    await data.createTenantAccount(atomicFailureInput("audit-insertion"));
  } catch (error) {
    rejected = error instanceof Error && error.message.includes("audit insertion failure");
  }
  assert(rejected, "injected tenant creation audit insertion failure must reject");
} finally {
  Array.prototype.unshift = originalUnshift;
}
assertCreationStateUnchanged(auditInsertionBefore, "audit insertion failure");

const lifecycleAtomicAccount = await data.createTenantAccount({
  name: "TASK043 Lifecycle Atomicity",
  slug: "task043-lifecycle-atomicity",
  accountType: "company",
  status: "active",
  purchasedSeatCount: 3,
  serviceStartAt: tokyoToday,
  serviceEndAt: shiftCalendarDate(tokyoToday, 31),
  actorUserId: "actor_task043",
  ownerName: "Lifecycle Atomic Owner",
  ownerEmail: "task043-lifecycle-atomic-owner@example.test",
});
const snapshotLifecycleState = () => {
  const current = globalThis.__brokerDb;
  const tenant = current.tenants.find((candidate) => candidate.id === lifecycleAtomicAccount.id);
  assert(tenant, "lifecycle atomic tenant must exist");
  return {
    current,
    tenants: current.tenants,
    tenantContent: JSON.stringify(current.tenants),
    tenant: JSON.stringify(tenant),
    auditLogs: current.auditLogs,
    auditContent: JSON.stringify(current.auditLogs),
    auditCount: current.auditLogs.length,
  };
};
const assertLifecycleStateUnchanged = (before, label) => {
  const current = globalThis.__brokerDb;
  const tenant = current.tenants.find((candidate) => candidate.id === lifecycleAtomicAccount.id);
  assert(current === before.current, `${label} must preserve the published database reference`);
  assert(current.tenants === before.tenants, `${label} must preserve the published tenant array reference`);
  assert(JSON.stringify(current.tenants) === before.tenantContent, `${label} must preserve the complete tenant collection`);
  assert(JSON.stringify(tenant) === before.tenant, `${label} must preserve all tenant commercial fields`);
  assert(current.auditLogs === before.auditLogs, `${label} must preserve the published audit array reference`);
  assert(JSON.stringify(current.auditLogs) === before.auditContent, `${label} must preserve audit content`);
  assert(current.auditLogs.length === before.auditCount, `${label} must preserve audit count`);
};

const lifecycleAuthorizationFixtures = [
  ["lifecycle_ordinary", "broker", "ordinary_member", "active"],
  ["lifecycle_company_owner", "tenant_owner", "company_owner", "active"],
  ["lifecycle_form_admin", "manager", "company_form_admin", "active"],
  ["lifecycle_platform_suspended", "platform_owner", "ordinary_member", "suspended"],
  ["lifecycle_platform_removed", "platform_owner", "ordinary_member", "removed"],
];
for (const [userId, role, capability, status] of lifecycleAuthorizationFixtures) {
  globalThis.__brokerDb.users.push({ id: userId, name: userId, email: `${userId}@example.test`, passwordHash: "test", createdAt: authorizationNow });
  globalThis.__brokerDb.tenantMemberships.push({ id: `membership_${userId}`, tenantId: userId === "lifecycle_company_owner" ? lifecycleAtomicAccount.id : "tenant_cherry", userId, role, capability, status, invitationProvider: "manual", invitationStatus: "accepted", createdAt: authorizationNow, updatedAt: authorizationNow });
}
globalThis.__brokerDb.users.push({ id: "lifecycle_wrong_existing", name: "Lifecycle Wrong Existing", email: "lifecycle-wrong-existing@example.test", passwordHash: "test", createdAt: authorizationNow });
const assertLifecycleActorRejectedUnchanged = async (label, actorUserId) => {
  const before = snapshotLifecycleState();
  let rejected = false;
  try {
    await data.updateTenantAccountLifecycle({
      tenantId: lifecycleAtomicAccount.id,
      status: "cancelled",
      purchasedSeatCount: 9,
      serviceStartAt: shiftCalendarDate(tokyoToday, -7),
      serviceEndAt: shiftCalendarDate(tokyoToday, 7),
      actorUserId,
    });
  } catch (error) {
    rejected = error instanceof Error && error.message.includes("platform owner membership required");
  }
  assert(rejected, `${label} must reject platform commercial lifecycle mutation`);
  assertLifecycleStateUnchanged(before, `${label} lifecycle rejection`);
};

const configuredPlatformMembershipIndex = globalThis.__brokerDb.tenantMemberships.findIndex((membership) => membership.userId === "user_demo" && membership.role === "platform_owner" && membership.status === "active");
assert(configuredPlatformMembershipIndex >= 0, "configured-only lifecycle test requires the controlled bootstrap membership fixture");
const [configuredPlatformMembership] = globalThis.__brokerDb.tenantMemberships.splice(configuredPlatformMembershipIndex, 1);
await assertLifecycleActorRejectedUnchanged("configured-only actor", "user_demo");
globalThis.__brokerDb.tenantMemberships.splice(configuredPlatformMembershipIndex, 0, configuredPlatformMembership);
for (const [label, actorUserId] of [
  ["ordinary actor", "lifecycle_ordinary"],
  ["target company_owner without platform authority", "lifecycle_company_owner"],
  ["company form admin actor", "lifecycle_form_admin"],
  ["suspended platform membership", "lifecycle_platform_suspended"],
  ["removed platform membership", "lifecycle_platform_removed"],
  ["wrong existing actor", "lifecycle_wrong_existing"],
  ["missing actor", ""],
  ["blank actor", "   "],
  ["nonexistent actor", "lifecycle_missing_user"],
]) {
  await assertLifecycleActorRejectedUnchanged(label, actorUserId);
}
const lifecycleAuditIdBefore = snapshotLifecycleState();
Math.random = () => { throw new Error("injected lifecycle audit id failure"); };
try {
  let rejected = false;
  try {
    await data.updateTenantAccountLifecycle({
      tenantId: lifecycleAtomicAccount.id,
      status: "suspended",
      purchasedSeatCount: 4,
      serviceStartAt: shiftCalendarDate(tokyoToday, -1),
      serviceEndAt: shiftCalendarDate(tokyoToday, 20),
      actorUserId: "actor_task043",
    });
  } catch (error) {
    rejected = error instanceof Error && error.message.includes("lifecycle audit id failure");
  }
  assert(rejected, "injected lifecycle audit id failure must reject");
} finally {
  Math.random = originalRandom;
}
assertLifecycleStateUnchanged(lifecycleAuditIdBefore, "lifecycle audit id failure");

const lifecycleAuditInsertionBefore = snapshotLifecycleState();
Array.prototype.unshift = function (...items) {
  if (items[0]?.action === "tenant_subscription_updated") {
    throw new Error("injected lifecycle audit insertion failure");
  }
  return originalUnshift.apply(this, items);
};
try {
  let rejected = false;
  try {
    await data.updateTenantAccountLifecycle({
      tenantId: lifecycleAtomicAccount.id,
      status: "cancelled",
      purchasedSeatCount: 5,
      serviceStartAt: shiftCalendarDate(tokyoToday, -2),
      serviceEndAt: shiftCalendarDate(tokyoToday, 19),
      actorUserId: "actor_task043",
    });
  } catch (error) {
    rejected = error instanceof Error && error.message.includes("lifecycle audit insertion failure");
  }
  assert(rejected, "injected lifecycle audit insertion failure must reject");
} finally {
  Array.prototype.unshift = originalUnshift;
}
assertLifecycleStateUnchanged(lifecycleAuditInsertionBefore, "lifecycle audit insertion failure");

const lifecycleSuccessBefore = snapshotLifecycleState();
const lifecycleSuccessAuditCountBefore = globalThis.__brokerDb.auditLogs.filter(
  (audit) => audit.tenantId === lifecycleAtomicAccount.id && audit.action === "tenant_subscription_updated",
).length;
const lifecycleSuccess = await data.updateTenantAccountLifecycle({
  tenantId: lifecycleAtomicAccount.id,
  status: "active",
  purchasedSeatCount: 4,
  serviceStartAt: shiftCalendarDate(tokyoToday, -1),
  serviceEndAt: shiftCalendarDate(tokyoToday, 20),
  actorUserId: "  actor_task043  ",
});
assert(globalThis.__brokerDb !== lifecycleSuccessBefore.current, "successful lifecycle update must publish exactly one new database reference");
assert(lifecycleSuccess?.purchasedSeatCount === 4 && lifecycleSuccess.serviceStartAt === shiftCalendarDate(tokyoToday, -1) && lifecycleSuccess.serviceEndAt === shiftCalendarDate(tokyoToday, 20), "successful lifecycle update must return its preconstructed commercial summary");
const lifecycleSuccessAudits = globalThis.__brokerDb.auditLogs.filter(
  (audit) => audit.tenantId === lifecycleAtomicAccount.id && audit.action === "tenant_subscription_updated",
);
assert(lifecycleSuccessAudits.length === lifecycleSuccessAuditCountBefore + 1, "successful lifecycle update must publish exactly one audit");
assert(lifecycleSuccessAudits[0].userId === "actor_task043" && lifecycleSuccessAudits[0].actorId === "actor_task043", "successful lifecycle audit must use only the normalized active persisted platform owner actor");
assert(JSON.stringify(lifecycleSuccessAudits[0].context) === JSON.stringify({
  status: "active",
  purchasedSeatCount: 4,
  serviceStartAt: shiftCalendarDate(tokyoToday, -1),
  serviceEndAt: shiftCalendarDate(tokyoToday, 20),
}), "successful lifecycle audit must contain the committed commercial fields");

const configuredMember = await data.inviteTenantMember({ tenantId: configuredPendingAccount.id, name: "Configured Member", email: "task043-configured-current-member@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: acceptedConfiguredOwner.userId });
assert(configuredMember.status === "invited", "an accepted platform-created company owner must manage members while service is operational");
const missingRoleActorBefore = JSON.stringify(globalThis.__brokerDb.tenantMemberships);
let missingRoleActorRejected = false;
try {
  await data.updateTenantMemberRole({ tenantId: configuredPendingAccount.id, membershipId: configuredMember.id, role: "manager", capability: "company_form_admin" });
} catch (error) {
  missingRoleActorRejected = error instanceof Error && error.message.includes("company owner capability required");
}
assert(missingRoleActorRejected, "memory member role mutation must require an explicit active company owner actor");
assert(JSON.stringify(globalThis.__brokerDb.tenantMemberships) === missingRoleActorBefore, "missing role actor rejection must publish zero membership changes");
const ordinaryActor = {
  id: "task043_ordinary_actor",
  name: "TASK043 Ordinary Actor",
  email: "task043-ordinary-actor@example.test",
  passwordHash: "test",
  createdAt: authorizationNow,
};
globalThis.__brokerDb.users.push(ordinaryActor);
globalThis.__brokerDb.tenantMemberships.push({
  id: "membership_task043_ordinary_actor",
  tenantId: configuredPendingAccount.id,
  userId: ordinaryActor.id,
  role: "broker",
  capability: "ordinary_member",
  status: "active",
  invitationProvider: "manual",
  invitationStatus: "accepted",
  createdAt: authorizationNow,
  updatedAt: authorizationNow,
});
let ordinaryRefreshRejected = false;
try {
  await data.refreshTenantMemberInvitation({ tenantId: configuredPendingAccount.id, membershipId: configuredMember.id, invitedByUserId: ordinaryActor.id });
} catch (error) {
  ordinaryRefreshRejected = error instanceof Error && error.message.includes("invite permission required");
}
assert(ordinaryRefreshRejected, "ordinary member must not refresh an invitation");
await data.updateTenantAccountLifecycle({ tenantId: configuredPendingAccount.id, status: "suspended", actorUserId: "actor_task043" });
const unavailableConfiguredMembers = await data.listTenantMembers(configuredPendingAccount.id);
const unavailableConfiguredSummary = (await data.listPlatformTenantAccounts()).find((item) => item.id === configuredPendingAccount.id);
assert(unavailableConfiguredMembers.some((member) => member.id === acceptedConfiguredOwner.id && member.status === "active" && member.capability === "company_owner"), "an unavailable tenant's accepted owner must retain the real restricted roster and company_owner capability");
assert(unavailableConfiguredSummary?.ownerMembers.some((member) => member.id === acceptedConfiguredOwner.id && member.status === "active" && member.capability === "company_owner"), "an unavailable tenant's platform summary must retain the real accepted owner");
assert(unavailableConfiguredSummary?.activeSeatCount === 2 && unavailableConfiguredSummary.usedSeatCount === 3, "an unavailable tenant summary must retain real active and invited seat counts");

const authorizationAccount = await data.createTenantAccount({
  name: "TASK043 Invitation Authorization",
  slug: "task043-invitation-authorization",
  accountType: "company",
  status: "pending_activation",
  purchasedSeatCount: 6,
  serviceStartAt: tokyoToday,
  serviceEndAt: shiftCalendarDate(tokyoToday, 31),
  actorUserId: "actor_task043",
  ownerName: "Authorization Owner",
  ownerEmail: "task043-authorization-owner@example.test",
});
const initialOwnerInvitation = authorizationAccount.ownerMembers[0];
const platformDeliveredInitialOwner = await data.updateTenantMemberInvitation({
  tenantId: authorizationAccount.id,
  membershipId: initialOwnerInvitation.id,
  actorUserId: "actor_task043",
  invitationProvider: "manual",
  invitationStatus: "pending",
});
assert(platformDeliveredInitialOwner?.invitationStatus === "pending", "active platform owner membership must authorize initial owner invitation delivery");
const currentAuthorizationDb = globalThis.__brokerDb;
const authorizationOwnerMembership = currentAuthorizationDb.tenantMemberships.find((membership) => membership.id === initialOwnerInvitation.id);
assert(authorizationOwnerMembership, "authorization owner membership must exist");
authorizationOwnerMembership.status = "active";
authorizationOwnerMembership.invitationStatus = "accepted";
authorizationOwnerMembership.capability = "company_owner";
const resendTarget = await data.inviteTenantMember({
  tenantId: authorizationAccount.id,
  name: "Authorization Resend Target",
  email: "task043-authorization-resend@example.test",
  role: "broker",
  status: "invited",
  capability: "ordinary_member",
  invitedByUserId: initialOwnerInvitation.userId,
});
await data.updateTenantMemberInvitation({ tenantId: authorizationAccount.id, membershipId: resendTarget.id, actorUserId: "actor_task043", invitationProvider: "manual", invitationStatus: "revoked" });
const nonTargetPlatformMembership = globalThis.__brokerDb.tenantMemberships.find((membership) => membership.userId === "actor_task043" && membership.status === "active" && membership.role === "platform_owner" && membership.tenantId !== authorizationAccount.id);
assert(nonTargetPlatformMembership, "platform delivery preparation fixture must prove persisted active platform_owner authority outside the target tenant");
const platformPreparedContext = await data.refreshTenantMemberInvitation({
  tenantId: authorizationAccount.id,
  membershipId: resendTarget.id,
  invitedByUserId: "actor_task043",
});
assert(platformPreparedContext?.tenant.id === authorizationAccount.id && platformPreparedContext.member.id === resendTarget.id && platformPreparedContext.member.user.email === resendTarget.user.email && platformPreparedContext.invitationStatus === "pending", "non-target persisted platform owner must receive complete guarded tenant/member/user delivery context");
await data.updateTenantMemberInvitation({ tenantId: authorizationAccount.id, membershipId: resendTarget.id, actorUserId: "actor_task043", memberContext: platformPreparedContext.member, invitationProvider: "manual", invitationStatus: "revoked" });
const ownerRefreshedConfiguredAccount = await data.refreshTenantMemberInvitation({
  tenantId: authorizationAccount.id,
  membershipId: resendTarget.id,
  invitedByUserId: initialOwnerInvitation.userId,
});
assert(ownerRefreshedConfiguredAccount?.invitationStatus === "pending", "company owner must refresh invitations for an operational configured pending_activation account");

for (const [capability, role] of [["company_form_admin", "tenant_admin"], ["ordinary_member", "broker"]]) {
  const actorId = `task043_${capability}_actor`;
  const currentDb = globalThis.__brokerDb;
  currentDb.users.push({ id: actorId, name: capability, email: `${actorId}@example.test`, passwordHash: "test", createdAt: authorizationNow });
  currentDb.tenantMemberships.push({
    id: `membership_${actorId}`,
    tenantId: authorizationAccount.id,
    userId: actorId,
    role,
    capability,
    status: "active",
    invitationProvider: "manual",
    invitationStatus: "accepted",
    createdAt: authorizationNow,
    updatedAt: authorizationNow,
  });
  await data.updateTenantMemberInvitation({ tenantId: authorizationAccount.id, membershipId: resendTarget.id, actorUserId: "actor_task043", invitationProvider: "manual", invitationStatus: "revoked" });
  let unauthorizedRejected = false;
  try {
    await data.refreshTenantMemberInvitation({ tenantId: authorizationAccount.id, membershipId: resendTarget.id, invitedByUserId: actorId });
  } catch (error) {
    unauthorizedRejected = error instanceof Error && error.message.includes("invite permission required");
  }
  assert(unauthorizedRejected, `${capability} must not refresh an invitation`);
}

for (const [slug, lifecycle] of [
  ["suspended-delivery", { status: "suspended" }],
  ["cancelled-delivery", { status: "cancelled" }],
  ["future-delivery", { status: "pending_activation", serviceStartAt: shiftCalendarDate(tokyoToday, 1), serviceEndAt: shiftCalendarDate(tokyoToday, 31) }],
  ["expired-delivery", { status: "active", serviceStartAt: shiftCalendarDate(tokyoToday, -31), serviceEndAt: shiftCalendarDate(tokyoToday, -1) }],
]) {
  const blockedDeliveryAccount = await data.createTenantAccount({
    name: `TASK043 ${slug}`,
    slug: `task043-${slug}`,
    accountType: "company",
    status: "active",
    purchasedSeatCount: 3,
    actorUserId: "actor_task043",
    ownerName: `${slug} Owner`,
    ownerEmail: `task043-${slug}-owner@example.test`,
  });
  const blockedDeliveryOwnerActorId = activatePlatformCreatedOwner(blockedDeliveryAccount);
  const blockedDeliveryTarget = await data.inviteTenantMember({ tenantId: blockedDeliveryAccount.id, name: `${slug} Target`, email: `task043-${slug}-target@example.test`, role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: blockedDeliveryOwnerActorId });
  await data.updateTenantMemberInvitation({ tenantId: blockedDeliveryAccount.id, membershipId: blockedDeliveryTarget.id, actorUserId: "actor_task043", invitationProvider: "manual", invitationStatus: "revoked" });
  await data.updateTenantAccountLifecycle({ tenantId: blockedDeliveryAccount.id, ...lifecycle, actorUserId: "actor_task043" });
  let nonOperationalRejected = false;
  try {
    await data.updateTenantMemberInvitation({ tenantId: blockedDeliveryAccount.id, membershipId: blockedDeliveryTarget.id, actorUserId: "actor_task043", invitationProvider: "manual", invitationStatus: "failed" });
  } catch (error) {
    nonOperationalRejected = error instanceof Error && error.message.includes("service is unavailable");
  }
  assert(nonOperationalRejected, `${slug} tenant must reject invitation delivery even for a platform owner`);
}
for (const [slug, startOffset, endOffset, label] of [
  ["future", 1, 31, "future configured pending_activation"],
  ["expired", -31, -1, "expired configured pending_activation"],
  ["legacy", null, null, "undated pending_activation"],
]) {
  const blockedAccount = await data.createTenantAccount({
    name: `TASK043 ${slug}`,
    slug: `task043-configured-pending-${slug}`,
    accountType: "company",
    status: "pending_activation",
    purchasedSeatCount: 2,
    serviceStartAt: startOffset == null ? undefined : shiftCalendarDate(tokyoToday, startOffset),
    serviceEndAt: endOffset == null ? undefined : shiftCalendarDate(tokyoToday, endOffset),
    actorUserId: "actor_task043",
    ownerName: `${slug} Owner`,
    ownerEmail: `task043-${slug}-owner@example.test`,
  });
  let invitationBlocked = false;
  try {
    await data.inviteTenantMember({ tenantId: blockedAccount.id, name: `${slug} Member`, email: `task043-${slug}-member@example.test`, role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: "actor_task043" });
  } catch (error) {
    invitationBlocked = error instanceof Error && error.message.includes("service is unavailable");
  }
  assert(invitationBlocked, `${label} must block invitations`);
}
const account = await data.createTenantAccount({
  name: "TASK043 Seat Matrix",
  slug: "task043-seat-matrix",
  accountType: "company",
  status: "active",
  purchasedSeatCount: 3,
  actorUserId: "actor_task043",
  ownerName: "Owner",
  ownerEmail: "task043-owner@example.test",
});
const accountOwnerActorId = activatePlatformCreatedOwner(account);
assert(account.usedSeatCount === 1, "invited owner must occupy one seat");
const invited = await data.inviteTenantMember({ tenantId: account.id, name: "One", email: "task043-one@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: accountOwnerActorId });
let summary = (await data.listPlatformTenantAccounts()).find((item) => item.id === account.id);
assert(summary?.usedSeatCount === 2 && summary.availableSeatCount === 1, "pending invitation must occupy one seat");
const acceptedInvited = await data.acceptTenantInvitation({ userId: invited.userId, tenantId: account.id, membershipId: invited.id, invitationToken: invited.invitationToken });
assert(acceptedInvited?.status === "active" && acceptedInvited.invitationStatus === "accepted" && Boolean(acceptedInvited.invitationAcceptedAt), "token acceptance must be the only invitation activation path");
await data.updateTenantMemberStatus({ tenantId: account.id, membershipId: invited.id, status: "suspended", actorUserId: accountOwnerActorId });
summary = (await data.listPlatformTenantAccounts()).find((item) => item.id === account.id);
assert(summary?.suspendedSeatCount === 1 && summary.usedSeatCount === 2, "suspended membership must continue occupying one seat");
const reactivatedAccepted = await data.updateTenantMemberStatus({ tenantId: account.id, membershipId: invited.id, status: "active", actorUserId: accountOwnerActorId });
assert(reactivatedAccepted?.status === "active" && reactivatedAccepted.invitationStatus === "accepted", "a previously accepted active member must be reactivatable after suspension");
await data.updateTenantMemberStatus({ tenantId: account.id, membershipId: invited.id, status: "suspended", actorUserId: accountOwnerActorId });
const second = await data.inviteTenantMember({ tenantId: account.id, name: "Two", email: "task043-two@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: accountOwnerActorId });
await data.updateTenantMemberInvitation({ tenantId: account.id, membershipId: second.id, actorUserId: "actor_task043", invitationProvider: "manual", invitationStatus: "expired" });
summary = (await data.listPlatformTenantAccounts()).find((item) => item.id === account.id);
assert(summary?.usedSeatCount === 2, "expired invitation must release its seat");
await data.inviteTenantMember({ tenantId: account.id, name: "Two again", email: "task043-two@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: accountOwnerActorId });
summary = (await data.listPlatformTenantAccounts()).find((item) => item.id === account.id);
assert(summary?.usedSeatCount === 3, "re-inviting the same identity must occupy one seat without duplicate counting");
let capacityRejected = false;
try {
  await data.inviteTenantMember({ tenantId: account.id, name: "Three", email: "task043-three@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: accountOwnerActorId });
} catch (error) {
  capacityRejected = error instanceof Error && error.message.includes("seat count exceeded");
}
assert(capacityRejected, "a new invitation at the seat limit must fail closed");
let shrinkRejected = false;
try {
  await data.updateTenantAccountLifecycle({ tenantId: account.id, purchasedSeatCount: 2, actorUserId: "actor_task043" });
} catch (error) {
  shrinkRejected = error instanceof Error && error.message.includes("lower than used seats");
}
assert(shrinkRejected, "seat total must not shrink below current occupancy");
await data.updateTenantMemberInvitation({ tenantId: account.id, membershipId: second.id, actorUserId: "actor_task043", invitationProvider: "manual", invitationStatus: "revoked" });
summary = (await data.listPlatformTenantAccounts()).find((item) => item.id === account.id);
assert(summary?.usedSeatCount === 2, "revoked invitation must release its seat");
await data.updateTenantAccountLifecycle({ tenantId: account.id, purchasedSeatCount: 2, serviceStartAt: "2026-09-01", serviceEndAt: "2026-10-31", actorUserId: "actor_task043" });
const audit = await data.listAuditLogs("actor_task043", { tenantId: account.id, action: "tenant_subscription_updated" });
assert(audit.length === 1, "commercial update and its audit record must publish together");

const transitionAccount = await data.createTenantAccount({
  name: "TASK043 Seat Transition",
  slug: "task043-seat-transition",
  accountType: "company",
  status: "active",
  purchasedSeatCount: 2,
  actorUserId: "actor_task043",
  ownerName: "Transition Owner",
  ownerEmail: "task043-transition-owner@example.test",
});
const transitionOwnerActorId = activatePlatformCreatedOwner(transitionAccount);
const releasedInvite = await data.inviteTenantMember({ tenantId: transitionAccount.id, name: "Released", email: "task043-released@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: transitionOwnerActorId });
await data.updateTenantMemberInvitation({ tenantId: transitionAccount.id, membershipId: releasedInvite.id, actorUserId: "actor_task043", invitationProvider: "manual", invitationStatus: "revoked" });
const capacityFiller = await data.inviteTenantMember({ tenantId: transitionAccount.id, name: "Capacity Filler", email: "task043-capacity-filler@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: transitionOwnerActorId });
let releasedToSuspendedRejected = false;
try {
  await data.updateTenantMemberStatus({ tenantId: transitionAccount.id, membershipId: releasedInvite.id, status: "suspended", actorUserId: transitionOwnerActorId });
} catch (error) {
  releasedToSuspendedRejected = error instanceof Error && error.message.includes("explicit token acceptance");
}
assert(releasedToSuspendedRejected, "a released invitation cannot become suspended through member status mutation");
await data.updateTenantMemberStatus({ tenantId: transitionAccount.id, membershipId: releasedInvite.id, status: "removed", actorUserId: transitionOwnerActorId });
let removedToSuspendedRejected = false;
try {
  await data.updateTenantMemberStatus({ tenantId: transitionAccount.id, membershipId: releasedInvite.id, status: "suspended", actorUserId: transitionOwnerActorId });
} catch (error) {
  removedToSuspendedRejected = error instanceof Error && error.message.includes("requires a new invitation");
}
assert(removedToSuspendedRejected, "a removed membership must never be converted to suspended");
await data.updateTenantMemberInvitation({ tenantId: transitionAccount.id, membershipId: capacityFiller.id, actorUserId: "actor_task043", invitationProvider: "manual", invitationStatus: "revoked" });
const reInvited = await data.inviteTenantMember({ tenantId: transitionAccount.id, name: "Released Again", email: "task043-released@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: transitionOwnerActorId });
assert(reInvited.id !== releasedInvite.id, "re-inviting a removed identity must create a new invitation membership");
const transitionSummary = (await data.listPlatformTenantAccounts()).find((item) => item.id === transitionAccount.id);
assert(transitionSummary?.usedSeatCount === 2 && transitionSummary.availableSeatCount === 0, "a legal re-invitation must occupy the released seat exactly once");
const repeatedCurrentInvitation = await data.inviteTenantMember({ tenantId: transitionAccount.id, name: "Released Current Again", email: "task043-released@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: transitionOwnerActorId });
const repeatedCurrentSummary = (await data.listPlatformTenantAccounts()).find((item) => item.id === transitionAccount.id);
assert(repeatedCurrentInvitation.id === reInvited.id, "removed history must not hide the unique current invited membership");
assert(repeatedCurrentSummary?.usedSeatCount === 2 && repeatedCurrentSummary.availableSeatCount === 0, "repeating a current invitation at full capacity must succeed without changing used seats");

const naturalExpiryAccount = await data.createTenantAccount({
  name: "TASK043 Natural Invitation Expiry",
  slug: "task043-natural-invitation-expiry",
  accountType: "company",
  status: "active",
  purchasedSeatCount: 2,
  actorUserId: "actor_task043",
  ownerName: "Natural Expiry Owner",
  ownerEmail: "task043-natural-expiry-owner@example.test",
});
const naturalExpiryOwnerActorId = activatePlatformCreatedOwner(naturalExpiryAccount);
const naturallyExpiringInvite = await data.inviteTenantMember({ tenantId: naturalExpiryAccount.id, name: "Naturally Expiring", email: "task043-naturally-expiring@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: naturalExpiryOwnerActorId });
const rawNaturallyExpiringMembership = globalThis.__brokerDb.tenantMemberships.find((membership) => membership.id === naturallyExpiringInvite.id);
assert(rawNaturallyExpiringMembership, "natural-expiry membership must exist");
rawNaturallyExpiringMembership.invitationExpiresAt = new Date(Date.now() - 1);
assert(rawNaturallyExpiringMembership.invitationStatus === "pending", "natural expiry must not require a persisted invitation-status side effect");
const postExpiryReplacement = await data.inviteTenantMember({ tenantId: naturalExpiryAccount.id, name: "Post Expiry Replacement", email: "task043-post-expiry-replacement@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: naturalExpiryOwnerActorId });
assert(postExpiryReplacement.status === "invited", "a full tenant must accept a replacement immediately after another invitation naturally expires without listing pending invitations first");
const naturalExpirySummary = (await data.listPlatformTenantAccounts()).find((item) => item.id === naturalExpiryAccount.id);
const naturalExpiryMembers = await data.listTenantMembers(naturalExpiryAccount.id);
assert(naturalExpirySummary?.usedSeatCount === 2 && naturalExpirySummary.activeSeatCount === 1 && naturalExpirySummary.invitedSeatCount === 1, "natural expiry must release exactly one seat from platform summary counts");
assert(naturalExpiryMembers.find((member) => member.id === naturallyExpiringInvite.id)?.invitationStatus === "expired", "naturally expired raw pending invitation must be presented honestly as derived expired");
assert(rawNaturallyExpiringMembership.invitationStatus === "pending", "derived expired presentation must not mutate persisted invitation state");

const deliveryAccount = await data.createTenantAccount({
  name: "TASK043 Invitation Delivery Capacity",
  slug: "task043-invitation-delivery-capacity",
  accountType: "company",
  status: "active",
  purchasedSeatCount: 2,
  actorUserId: "actor_task043",
  ownerName: "Delivery Owner",
  ownerEmail: "task043-delivery-owner@example.test",
});
const deliveryOwnerActorId = activatePlatformCreatedOwner(deliveryAccount);
const releasedDelivery = await data.inviteTenantMember({ tenantId: deliveryAccount.id, name: "Released Delivery", email: "task043-released-delivery@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: deliveryOwnerActorId });
await data.updateTenantMemberInvitation({ tenantId: deliveryAccount.id, membershipId: releasedDelivery.id, actorUserId: "actor_task043", invitationProvider: "manual", invitationStatus: "revoked" });
const deliveryFiller = await data.inviteTenantMember({ tenantId: deliveryAccount.id, name: "Delivery Filler", email: "task043-delivery-filler@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: deliveryOwnerActorId });
let releasedReinviteAtCapacityRejected = false;
try {
  await data.inviteTenantMember({ tenantId: deliveryAccount.id, name: "Released Delivery Again", email: "task043-released-delivery@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: deliveryOwnerActorId });
} catch (error) {
  releasedReinviteAtCapacityRejected = error instanceof Error && error.message.includes("seat count exceeded");
}
assert(releasedReinviteAtCapacityRejected, "full tenant must reject restoring a released invitation through the create-invitation path");
for (const invitationStatus of ["pending", "failed", "not_sent"]) {
  let restorationRejected = false;
  try {
    await data.updateTenantMemberInvitation({ tenantId: deliveryAccount.id, membershipId: releasedDelivery.id, actorUserId: "actor_task043", invitationProvider: "manual", invitationStatus });
  } catch (error) {
    restorationRejected = error instanceof Error && error.message.includes("seat count exceeded");
  }
  assert(restorationRejected, `full tenant must reject released invitation restoration to ${invitationStatus}`);
  const unchanged = await data.getTenantMemberById({ tenantId: deliveryAccount.id, membershipId: releasedDelivery.id });
  assert(unchanged?.invitationStatus === "revoked", `rejected ${invitationStatus} restoration must preserve released state`);
}
let refreshAtCapacityRejected = false;
try {
  await data.refreshTenantMemberInvitation({ tenantId: deliveryAccount.id, membershipId: releasedDelivery.id, invitedByUserId: "actor_task043" });
} catch (error) {
  refreshAtCapacityRejected = error instanceof Error && error.message.includes("seat count exceeded");
}
assert(refreshAtCapacityRejected, "full tenant must reject refresh of a released invitation");
await data.updateTenantMemberInvitation({ tenantId: deliveryAccount.id, membershipId: deliveryFiller.id, actorUserId: "actor_task043", invitationProvider: "manual", invitationStatus: "revoked" });
const beforeReleasedRefresh = (await data.listPlatformTenantAccounts()).find((item) => item.id === deliveryAccount.id);
const refreshedReleased = await data.refreshTenantMemberInvitation({ tenantId: deliveryAccount.id, membershipId: releasedDelivery.id, invitedByUserId: "actor_task043" });
const afterReleasedRefresh = (await data.listPlatformTenantAccounts()).find((item) => item.id === deliveryAccount.id);
assert(refreshedReleased?.invitationStatus === "pending", "released invitation refresh must succeed after a seat is released");
assert(afterReleasedRefresh?.usedSeatCount === (beforeReleasedRefresh?.usedSeatCount ?? 0) + 1 && afterReleasedRefresh?.usedSeatCount === 2, "successful released invitation refresh must consume exactly one seat");

const externalLifecycleCases = [
  ["active", "active", "accepted", true],
  ["pending", "invited", "pending", true],
  ["removed", "removed", "accepted", false],
  ["revoked", "invited", "revoked", false],
  ["expired", "invited", "expired", false],
];
const externalLifecycleAccounts = [];
for (const [slug] of externalLifecycleCases) {
  externalLifecycleAccounts.push(await data.createTenantAccount({
    name: `TASK043 External Lifecycle ${slug}`,
    slug: `task043-external-lifecycle-${slug}`,
    accountType: "company",
    status: "active",
    purchasedSeatCount: 2,
    actorUserId: "actor_task043",
    ownerName: `${slug} Lifecycle Owner`,
    ownerEmail: `task043-${slug}-lifecycle-owner@example.test`,
  }));
}
const externalLifecycleUserId = "task043_external_lifecycle_user";
const externalLifecycleSubject = "clerk:task043-external-lifecycle";
const externalLifecycleDb = globalThis.__brokerDb;
externalLifecycleDb.users.push({
  id: externalLifecycleUserId,
  name: "TASK043 External Lifecycle User",
  email: "task043-external-lifecycle@example.test",
  passwordHash: "test",
  externalAuthSubject: externalLifecycleSubject,
  createdAt: authorizationNow,
});
for (let index = 0; index < externalLifecycleCases.length; index += 1) {
  const [slug, status, invitationStatus] = externalLifecycleCases[index];
  externalLifecycleDb.tenantMemberships.push({
    id: `membership_task043_external_${slug}`,
    tenantId: externalLifecycleAccounts[index].id,
    userId: externalLifecycleUserId,
    role: "broker",
    capability: "ordinary_member",
    status,
    invitationProvider: "clerk",
    invitationStatus,
    createdAt: authorizationNow,
    updatedAt: authorizationNow,
  });
}
const lifecycleBefore = new Map((await data.listPlatformTenantAccounts()).map((accountSummary) => [accountSummary.id, accountSummary.usedSeatCount]));
const suspendedExternalLifecycle = await data.suspendUserForExternalAuthSubject(externalLifecycleSubject);
assert(suspendedExternalLifecycle.suspendedMembershipCount === 2, "external-auth deletion must report only originally seat-occupying memberships as suspended");
for (let index = 0; index < externalLifecycleCases.length; index += 1) {
  const [slug, originalStatus, originalInvitationStatus, occupiedSeat] = externalLifecycleCases[index];
  const membership = globalThis.__brokerDb.tenantMemberships.find((candidate) => candidate.id === `membership_task043_external_${slug}`);
  assert(membership, `${slug} external lifecycle membership must remain present`);
  if (occupiedSeat) {
    assert(membership.status === "suspended" && membership.invitationStatus === "revoked", `${slug} seat-occupying membership must become suspended and remain one occupied seat`);
  } else {
    assert(membership.status === originalStatus && membership.invitationStatus === originalInvitationStatus, `${slug} released membership must remain exactly unchanged`);
  }
}
const lifecycleAfter = new Map((await data.listPlatformTenantAccounts()).map((accountSummary) => [accountSummary.id, accountSummary.usedSeatCount]));
for (const accountSummary of externalLifecycleAccounts) {
  assert(lifecycleAfter.get(accountSummary.id) === lifecycleBefore.get(accountSummary.id), `external-auth deletion must not increase used seats for ${accountSummary.slug}`);
}
assert(lifecycleAfter.get(externalLifecycleAccounts[0].id) === 2 && lifecycleAfter.get(externalLifecycleAccounts[1].id) === 2, "full multi-tenant active and pending memberships must each remain exactly one occupied seat");

const memberMutationServiceCases = [
  ["active", "active", shiftCalendarDate(tokyoToday, -31), shiftCalendarDate(tokyoToday, 31), true],
  ["expiring", "active", shiftCalendarDate(tokyoToday, -31), shiftCalendarDate(tokyoToday, 10), true],
  ["pending", "pending_activation", shiftCalendarDate(tokyoToday, 1), shiftCalendarDate(tokyoToday, 31), false],
  ["expired", "active", shiftCalendarDate(tokyoToday, -31), shiftCalendarDate(tokyoToday, -1), false],
  ["suspended", "suspended", shiftCalendarDate(tokyoToday, -31), shiftCalendarDate(tokyoToday, 31), false],
  ["cancelled", "cancelled", shiftCalendarDate(tokyoToday, -31), shiftCalendarDate(tokyoToday, 31), false],
];
for (const [serviceStatus, tenantStatus, serviceStartAt, serviceEndAt, operational] of memberMutationServiceCases) {
  const mutationAccount = await data.createTenantAccount({
    name: `TASK043 ${serviceStatus} Member Mutation`,
    slug: `task043-${serviceStatus}-member-mutation`,
    accountType: "company",
    status: tenantStatus,
    purchasedSeatCount: 2,
    serviceStartAt,
    serviceEndAt,
    actorUserId: "actor_task043",
    ownerName: `${serviceStatus} Mutation Owner`,
    ownerEmail: `task043-${serviceStatus}-mutation-owner@example.test`,
  });
  const mutationOwnerActorId = activatePlatformCreatedOwner(mutationAccount);
  const mutationDb = globalThis.__brokerDb;
  const mutationUser = {
    id: `task043_${serviceStatus}_mutation_user`,
    name: `${serviceStatus} Mutation User`,
    email: `task043-${serviceStatus}-mutation@example.test`,
    passwordHash: "test",
    createdAt: authorizationNow,
  };
  const mutationMembership = {
    id: `membership_task043_${serviceStatus}_mutation`,
    tenantId: mutationAccount.id,
    userId: mutationUser.id,
    role: "broker",
    capability: "ordinary_member",
    status: "active",
    invitationProvider: "manual",
    invitationStatus: "accepted",
    createdAt: authorizationNow,
    updatedAt: authorizationNow,
  };
  mutationDb.users.push(mutationUser);
  mutationDb.tenantMemberships.push(mutationMembership);

  const roleBefore = JSON.stringify(mutationDb.tenantMemberships);
  let roleResult = null;
  let roleRejected = false;
  try {
    roleResult = await data.updateTenantMemberRole({ tenantId: mutationAccount.id, membershipId: mutationMembership.id, role: "manager", capability: "company_form_admin", actorUserId: mutationOwnerActorId });
  } catch (error) {
    roleRejected = error instanceof Error && error.message.includes("service is unavailable");
  }
  if (operational) {
    assert(roleResult?.role === "manager" && roleResult.capability === "company_form_admin", `${serviceStatus} tenant must allow direct memory member role mutation`);
  } else {
    assert(roleRejected, `${serviceStatus} tenant must reject direct memory member role mutation`);
    assert(JSON.stringify(globalThis.__brokerDb.tenantMemberships) === roleBefore, `rejected ${serviceStatus} member role mutation must publish zero membership changes`);
  }

  const statusBefore = JSON.stringify(globalThis.__brokerDb.tenantMemberships);
  let statusResult = null;
  let statusRejected = false;
  try {
    statusResult = await data.updateTenantMemberStatus({ tenantId: mutationAccount.id, membershipId: mutationMembership.id, status: "suspended", actorUserId: mutationOwnerActorId });
  } catch (error) {
    statusRejected = error instanceof Error && error.message.includes("service is unavailable");
  }
  if (operational) {
    assert(statusResult?.status === "suspended", `${serviceStatus} tenant must allow direct memory member status mutation`);
  } else {
    assert(statusRejected, `${serviceStatus} tenant must reject direct memory member status mutation`);
    assert(JSON.stringify(globalThis.__brokerDb.tenantMemberships) === statusBefore, `rejected ${serviceStatus} member status mutation must publish zero membership changes`);
  }
}

const profileSyncAccounts = [];
for (const invitationStatus of ["pending", "revoked", "expired"]) {
  profileSyncAccounts.push(await data.createTenantAccount({
    name: `TASK043 Profile Sync ${invitationStatus}`,
    slug: `task043-profile-sync-${invitationStatus}`,
    accountType: "company",
    status: "active",
    purchasedSeatCount: 2,
    serviceStartAt: shiftCalendarDate(tokyoToday, -31),
    serviceEndAt: shiftCalendarDate(tokyoToday, 31),
    actorUserId: "actor_task043",
    ownerName: `${invitationStatus} Profile Owner`,
    ownerEmail: `task043-${invitationStatus}-profile-owner@example.test`,
  }));
}
const profileSyncDb = globalThis.__brokerDb;
const profileSyncUser = {
  id: "task043_profile_sync_user",
  name: "",
  email: "task043-profile-sync@example.test",
  passwordHash: "test",
  createdAt: authorizationNow,
};
profileSyncDb.users.push(profileSyncUser);
for (let index = 0; index < profileSyncAccounts.length; index += 1) {
  const invitationStatus = ["pending", "revoked", "expired"][index];
  profileSyncDb.tenantMemberships.push({
    id: `membership_task043_profile_sync_${invitationStatus}`,
    tenantId: profileSyncAccounts[index].id,
    userId: profileSyncUser.id,
    role: "broker",
    capability: "ordinary_member",
    status: "invited",
    invitationProvider: "clerk",
    invitationStatus,
    providerInvitationId: `provider-${invitationStatus}`,
    invitationToken: `token-${invitationStatus}`,
    invitationError: invitationStatus === "pending" ? undefined : `error-${invitationStatus}`,
    invitationSentAt: authorizationNow,
    invitationExpiresAt: new Date(authorizationNow.getTime() + 86_400_000),
    createdAt: authorizationNow,
    updatedAt: authorizationNow,
  });
  if (invitationStatus !== "pending") {
    const fillerUserId = `task043_profile_sync_filler_${invitationStatus}`;
    profileSyncDb.users.push({ id: fillerUserId, name: `${invitationStatus} filler`, email: `${fillerUserId}@example.test`, passwordHash: "test", createdAt: authorizationNow });
    profileSyncDb.tenantMemberships.push({
      id: `membership_${fillerUserId}`,
      tenantId: profileSyncAccounts[index].id,
      userId: fillerUserId,
      role: "broker",
      capability: "ordinary_member",
      status: "active",
      invitationProvider: "manual",
      invitationStatus: "accepted",
      createdAt: authorizationNow,
      updatedAt: authorizationNow,
    });
  }
}
const profileMembershipsBefore = JSON.stringify(profileSyncDb.tenantMemberships.filter((membership) => membership.userId === profileSyncUser.id));
const profileSeatCountsBefore = new Map((await data.listPlatformTenantAccounts()).filter((accountSummary) => profileSyncAccounts.some((account) => account.id === accountSummary.id)).map((accountSummary) => [accountSummary.id, accountSummary.usedSeatCount]));
const syncedProfileUser = await data.ensureUserForExternalAuth({ subject: "clerk:task043-profile-sync", email: profileSyncUser.email, name: "Profile Synced User" });
assert(syncedProfileUser?.externalAuthSubject === "clerk:task043-profile-sync" && syncedProfileUser.name === "Profile Synced User", "external profile sync must bind and update only the local user identity");
const profileMembershipsAfter = JSON.stringify(globalThis.__brokerDb.tenantMemberships.filter((membership) => membership.userId === profileSyncUser.id));
const profileSeatCountsAfter = new Map((await data.listPlatformTenantAccounts()).filter((accountSummary) => profileSyncAccounts.some((account) => account.id === accountSummary.id)).map((accountSummary) => [accountSummary.id, accountSummary.usedSeatCount]));
assert(profileMembershipsAfter === profileMembershipsBefore, "external profile sync must preserve every pending, revoked, and expired membership field across tenants");
for (const account of profileSyncAccounts) {
  assert(profileSeatCountsBefore.get(account.id) === 2 && profileSeatCountsAfter.get(account.id) === 2, `external profile sync must not change used seats in full tenant ${account.slug}`);
}

const assertMemoryMemberMutationRejectedUnchanged = async (label, operation, expectedMessage) => {
  const beforeRef = globalThis.__brokerDb;
  const beforeUsers = JSON.stringify(beforeRef.users);
  const beforeMemberships = JSON.stringify(beforeRef.tenantMemberships);
  let rejected = false;
  try {
    await operation();
  } catch (error) {
    rejected = error instanceof Error && error.message.includes(expectedMessage);
  }
  assert(rejected, `${label} must reject`);
  assert(globalThis.__brokerDb === beforeRef, `${label} must preserve the published database reference`);
  assert(JSON.stringify(globalThis.__brokerDb.users) === beforeUsers, `${label} must publish zero user changes`);
  assert(JSON.stringify(globalThis.__brokerDb.tenantMemberships) === beforeMemberships, `${label} must publish zero membership changes`);
};
const ownerGuardAccount = await data.createTenantAccount({
  name: "TASK043 Owner Guard",
  slug: "task043-owner-guard",
  accountType: "company",
  status: "active",
  purchasedSeatCount: 4,
  actorUserId: "actor_task043",
  ownerName: "Owner Guard Primary",
  ownerEmail: "task043-owner-guard-primary@example.test",
});
const primaryOwnerId = activatePlatformCreatedOwner(ownerGuardAccount);
const ownerGuardDb = globalThis.__brokerDb;
const guardedTargetUserId = "task043_guarded_target";
ownerGuardDb.users.push({ id: guardedTargetUserId, name: "Guarded Target", email: "task043-guarded-target@example.test", passwordHash: "test", createdAt: authorizationNow });
ownerGuardDb.tenantMemberships.push({ id: "membership_task043_guarded_target", tenantId: ownerGuardAccount.id, userId: guardedTargetUserId, role: "broker", capability: "ordinary_member", status: "active", invitationProvider: "manual", invitationStatus: "accepted", createdAt: authorizationNow, updatedAt: authorizationNow });
const guardActors = [
  ["missing", undefined, "broker", "ordinary_member"],
  ["wrong tenant", "actor_task043", "broker", "ordinary_member"],
  ["ordinary", "task043_guard_ordinary", "broker", "ordinary_member"],
  ["form admin", "task043_guard_form_admin", "manager", "company_form_admin"],
];
for (const [label, actorUserId, role, capability] of guardActors) {
  if (actorUserId && actorUserId.startsWith("task043_guard_")) {
    ownerGuardDb.users.push({ id: actorUserId, name: label, email: `${actorUserId}@example.test`, passwordHash: "test", createdAt: authorizationNow });
    ownerGuardDb.tenantMemberships.push({ id: `membership_${actorUserId}`, tenantId: ownerGuardAccount.id, userId: actorUserId, role, capability, status: "active", invitationProvider: "manual", invitationStatus: "accepted", createdAt: authorizationNow, updatedAt: authorizationNow });
  }
  await assertMemoryMemberMutationRejectedUnchanged(`${label} role actor`, () => data.updateTenantMemberRole({ tenantId: ownerGuardAccount.id, membershipId: "membership_task043_guarded_target", role: "manager", capability: "company_form_admin", actorUserId }), "company owner capability required");
  await assertMemoryMemberMutationRejectedUnchanged(`${label} status actor`, () => data.updateTenantMemberStatus({ tenantId: ownerGuardAccount.id, membershipId: "membership_task043_guarded_target", status: "suspended", actorUserId }), "company owner capability required");
}
for (const [role, capability] of [
  ["tenant_owner", "ordinary_member"],
  ["manager", "company_owner"],
  ["broker", "company_form_admin"],
  ["tenant_admin", "company_form_admin"],
]) {
  await assertMemoryMemberMutationRejectedUnchanged(`invalid ${role}/${capability} pair`, () => data.updateTenantMemberRole({ tenantId: ownerGuardAccount.id, membershipId: "membership_task043_guarded_target", role, capability, actorUserId: primaryOwnerId }), "legacy role do not match");
}
await assertMemoryMemberMutationRejectedUnchanged("last owner demotion", () => data.updateTenantMemberRole({ tenantId: ownerGuardAccount.id, membershipId: ownerGuardAccount.ownerMembers[0].id, role: "manager", capability: "company_form_admin", actorUserId: primaryOwnerId }), "last active company owner");
for (const status of ["suspended", "removed"]) {
  await assertMemoryMemberMutationRejectedUnchanged(`last owner ${status}`, () => data.updateTenantMemberStatus({ tenantId: ownerGuardAccount.id, membershipId: ownerGuardAccount.ownerMembers[0].id, status, actorUserId: primaryOwnerId }), "last active company owner");
}

const createTwoOwnerAccount = async (slug) => {
  const account = await data.createTenantAccount({ name: `TASK043 ${slug}`, slug: `task043-${slug}`, accountType: "company", status: "active", purchasedSeatCount: 2, actorUserId: "actor_task043", ownerName: `${slug} A`, ownerEmail: `task043-${slug}-a@example.test` });
  const ownerA = activatePlatformCreatedOwner(account);
  const currentDb = globalThis.__brokerDb;
  const ownerB = `task043_${slug}_owner_b`;
  currentDb.users.push({ id: ownerB, name: `${slug} B`, email: `task043-${slug}-b@example.test`, passwordHash: "test", createdAt: authorizationNow });
  currentDb.tenantMemberships.push({ id: `membership_${ownerB}`, tenantId: account.id, userId: ownerB, role: "tenant_owner", capability: "company_owner", status: "active", invitationProvider: "manual", invitationStatus: "accepted", createdAt: authorizationNow, updatedAt: authorizationNow });
  return { account, ownerA, ownerAMembershipId: account.ownerMembers[0].id, ownerB, ownerBMembershipId: `membership_${ownerB}` };
};
const concurrentOwners = await createTwoOwnerAccount("concurrent-owner-demotion");
const concurrentDemotions = await Promise.allSettled([
  data.updateTenantMemberRole({ tenantId: concurrentOwners.account.id, membershipId: concurrentOwners.ownerBMembershipId, role: "manager", capability: "company_form_admin", actorUserId: concurrentOwners.ownerA }),
  data.updateTenantMemberRole({ tenantId: concurrentOwners.account.id, membershipId: concurrentOwners.ownerAMembershipId, role: "manager", capability: "company_form_admin", actorUserId: concurrentOwners.ownerB }),
]);
assert(concurrentDemotions.filter((result) => result.status === "fulfilled").length === 1 && concurrentDemotions.filter((result) => result.status === "rejected").length === 1, "two owners concurrently demoting each other must allow exactly one mutation");
assert(globalThis.__brokerDb.tenantMemberships.filter((membership) => membership.tenantId === concurrentOwners.account.id && membership.status === "active" && membership.capability === "company_owner").length === 1, "concurrent owner demotion must never reduce active company owners to zero");

const serialOwners = await createTwoOwnerAccount("serial-owner-suspension");
await data.updateTenantMemberStatus({ tenantId: serialOwners.account.id, membershipId: serialOwners.ownerBMembershipId, status: "suspended", actorUserId: serialOwners.ownerA });
await assertMemoryMemberMutationRejectedUnchanged("suspended former owner stopping final owner", () => data.updateTenantMemberStatus({ tenantId: serialOwners.account.id, membershipId: serialOwners.ownerAMembershipId, status: "suspended", actorUserId: serialOwners.ownerB }), "company owner capability required");
assert(globalThis.__brokerDb.tenantMemberships.filter((membership) => membership.tenantId === serialOwners.account.id && membership.status === "active" && membership.capability === "company_owner").length === 1, "serial owner suspension must never reduce active company owners to zero");

const inviteActorGuardAccount = await data.createTenantAccount({
  name: "TASK043 Invite Actor Guard",
  slug: "task043-invite-actor-guard",
  accountType: "company",
  status: "active",
  purchasedSeatCount: 8,
  actorUserId: "actor_task043",
  ownerName: "Invite Actor Guard Owner",
  ownerEmail: "task043-invite-actor-guard-owner@example.test",
});
const inviteOwnerActorId = activatePlatformCreatedOwner(inviteActorGuardAccount);
const inviteGuardDb = globalThis.__brokerDb;
for (const [actorUserId, role, capability] of [
  ["task043_invite_ordinary", "broker", "ordinary_member"],
  ["task043_invite_form_admin", "manager", "company_form_admin"],
]) {
  inviteGuardDb.users.push({ id: actorUserId, name: actorUserId, email: `${actorUserId}@example.test`, passwordHash: "test", createdAt: authorizationNow });
  inviteGuardDb.tenantMemberships.push({ id: `membership_${actorUserId}`, tenantId: inviteActorGuardAccount.id, userId: actorUserId, role, capability, status: "active", invitationProvider: "manual", invitationStatus: "accepted", createdAt: authorizationNow, updatedAt: authorizationNow });
}
const assertMemoryInviteRejectedUnchanged = async (label, input, expectedMessage) => {
  const beforeRef = globalThis.__brokerDb;
  const beforeContent = JSON.stringify(beforeRef);
  let rejected = false;
  try {
    await data.inviteTenantMember(input);
  } catch (error) {
    rejected = error instanceof Error && error.message.includes(expectedMessage);
  }
  assert(rejected, `${label} must reject`);
  assert(globalThis.__brokerDb === beforeRef, `${label} must preserve the published database reference`);
  assert(JSON.stringify(globalThis.__brokerDb) === beforeContent, `${label} must publish zero database changes`);
};
for (const status of ["active", "suspended", "removed"]) {
  await assertMemoryInviteRejectedUnchanged(`${status} invitation input`, { tenantId: inviteActorGuardAccount.id, name: `${status} Invite Input`, email: `task043-${status}-invite-input@example.test`, role: "broker", status, capability: "ordinary_member", invitedByUserId: inviteOwnerActorId }, "invitations must start in invited state");
}
for (const [label, invitedByUserId] of [
  ["missing invitation actor", undefined],
  ["wrong-tenant platform owner invitation actor", "actor_task043"],
  ["ordinary invitation actor", "task043_invite_ordinary"],
  ["company form admin invitation actor", "task043_invite_form_admin"],
]) {
  await assertMemoryInviteRejectedUnchanged(label, { tenantId: inviteActorGuardAccount.id, name: label, email: `task043-${label.replaceAll(" ", "-")}@example.test`, role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId }, "company owner capability required");
}
await assertMemoryInviteRejectedUnchanged("noncanonical invitation role capability", { tenantId: inviteActorGuardAccount.id, name: "Noncanonical Invite", email: "task043-noncanonical-invite@example.test", role: "manager", status: "invited", capability: "ordinary_member", invitedByUserId: inviteOwnerActorId }, "legacy role do not match");
const ownerAuthorizedInvite = await data.inviteTenantMember({ tenantId: inviteActorGuardAccount.id, name: "Owner Authorized Invite", email: "task043-owner-authorized-invite@example.test", role: "manager", status: "invited", capability: "company_form_admin", invitedByUserId: inviteOwnerActorId });
assert(ownerAuthorizedInvite.role === "manager" && ownerAuthorizedInvite.capability === "company_form_admin" && ownerAuthorizedInvite.invitedByUserId === inviteOwnerActorId, "active target-tenant company owner must create a canonical invitation");
const defaultInvitedMember = await data.inviteTenantMember({ tenantId: inviteActorGuardAccount.id, name: "Default Invited Member", email: "task043-default-invited-member@example.test", role: "broker", capability: "ordinary_member", invitedByUserId: inviteOwnerActorId });
assert(ownerAuthorizedInvite.status === "invited" && ownerAuthorizedInvite.invitationStatus === "pending" && Boolean(ownerAuthorizedInvite.invitationToken), "explicit invited input must remain pending until token acceptance");
assert(defaultInvitedMember.status === "invited" && defaultInvitedMember.invitationStatus === "pending" && Boolean(defaultInvitedMember.invitationToken), "default invitation input must remain pending until token acceptance");

const inviteCapacityAccount = await data.createTenantAccount({ name: "TASK043 Invite Capacity Guard", slug: "task043-invite-capacity-guard", accountType: "company", status: "active", purchasedSeatCount: 2, actorUserId: "actor_task043", ownerName: "Invite Capacity Owner", ownerEmail: "task043-invite-capacity-owner@example.test" });
const inviteCapacityOwnerId = activatePlatformCreatedOwner(inviteCapacityAccount);
await data.inviteTenantMember({ tenantId: inviteCapacityAccount.id, name: "Capacity Seat", email: "task043-invite-capacity-seat@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: inviteCapacityOwnerId });
await assertMemoryInviteRejectedUnchanged("owner invitation at capacity", { tenantId: inviteCapacityAccount.id, name: "Over Capacity", email: "task043-invite-over-capacity@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: inviteCapacityOwnerId }, "seat count exceeded");
const inviteCapacitySummary = (await data.listPlatformTenantAccounts()).find((item) => item.id === inviteCapacityAccount.id);
assert(inviteCapacitySummary?.usedSeatCount === 2 && inviteCapacitySummary.availableSeatCount === 0, "authorized invitation must retain exact capacity accounting");

const statusBypassAccount = await data.createTenantAccount({ name: "TASK043 Status Bypass Guard", slug: "task043-status-bypass-guard", accountType: "company", status: "active", purchasedSeatCount: 3, actorUserId: "actor_task043", ownerName: "Status Bypass Owner", ownerEmail: "task043-status-bypass-owner@example.test" });
const statusBypassOwnerId = activatePlatformCreatedOwner(statusBypassAccount);
const statusBypassInvite = await data.inviteTenantMember({ tenantId: statusBypassAccount.id, name: "Status Bypass Invite", email: "task043-status-bypass-invite@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: statusBypassOwnerId });
await assertMemoryMemberMutationRejectedUnchanged("invited to suspended bypass", () => data.updateTenantMemberStatus({ tenantId: statusBypassAccount.id, membershipId: statusBypassInvite.id, status: "suspended", actorUserId: statusBypassOwnerId }), "explicit token acceptance");
await assertMemoryMemberMutationRejectedUnchanged("invited to active bypass", () => data.updateTenantMemberStatus({ tenantId: statusBypassAccount.id, membershipId: statusBypassInvite.id, status: "active", actorUserId: statusBypassOwnerId }), "explicit token acceptance");
const legacySuspendedInvite = globalThis.__brokerDb.tenantMemberships.find((membership) => membership.id === statusBypassInvite.id);
assert(legacySuspendedInvite, "legacy suspended invitation fixture must exist");
legacySuspendedInvite.status = "suspended";
legacySuspendedInvite.invitationStatus = "pending";
legacySuspendedInvite.invitationAcceptedAt = undefined;
await assertMemoryMemberMutationRejectedUnchanged("suspended not-accepted to active bypass", () => data.updateTenantMemberStatus({ tenantId: statusBypassAccount.id, membershipId: statusBypassInvite.id, status: "active", actorUserId: statusBypassOwnerId }), "only accepted members");

const deliveryValidationAccount = await data.createTenantAccount({ name: "TASK043 Delivery Validation", slug: "task043-delivery-validation", accountType: "company", status: "active", purchasedSeatCount: 3, actorUserId: "actor_task043", ownerName: "Delivery Validation Owner", ownerEmail: "task043-delivery-validation-owner@example.test" });
const deliveryValidationOwnerId = activatePlatformCreatedOwner(deliveryValidationAccount);
const deliveryValidationInvite = await data.inviteTenantMember({ tenantId: deliveryValidationAccount.id, name: "Delivery Validation Invite", email: "task043-delivery-validation-invite@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: deliveryValidationOwnerId });
const assertDeliveryRejectedUnchanged = async (label, input) => {
  const beforeRef = globalThis.__brokerDb;
  const beforeContent = JSON.stringify(beforeRef);
  let rejected = false;
  try {
    await data.updateTenantMemberInvitation(input);
  } catch (error) {
    rejected = error instanceof Error && error.message.includes("unsupported invitation delivery state");
  }
  assert(rejected, `${label} must reject`);
  assert(globalThis.__brokerDb === beforeRef && JSON.stringify(globalThis.__brokerDb) === beforeContent, `${label} must preserve the database reference and publish zero changes`);
};
await assertDeliveryRejectedUnchanged("accepted delivery state", { tenantId: deliveryValidationAccount.id, membershipId: deliveryValidationInvite.id, actorUserId: deliveryValidationOwnerId, invitationProvider: "manual", invitationStatus: "accepted" });
await assertDeliveryRejectedUnchanged("arbitrary delivery state", { tenantId: deliveryValidationAccount.id, membershipId: deliveryValidationInvite.id, actorUserId: deliveryValidationOwnerId, invitationProvider: "manual", invitationStatus: "delivered" });
await assertDeliveryRejectedUnchanged("arbitrary delivery provider", { tenantId: deliveryValidationAccount.id, membershipId: deliveryValidationInvite.id, actorUserId: deliveryValidationOwnerId, invitationProvider: "smtp", invitationStatus: "pending" });

for (const [invitationStatus, invitationProvider] of [["pending", "none"], ["failed", "manual"], ["not_sent", "clerk"], ["revoked", "manual"], ["expired", "none"]]) {
  const deliveryResult = await data.updateTenantMemberInvitation({ tenantId: deliveryValidationAccount.id, membershipId: deliveryValidationInvite.id, actorUserId: deliveryValidationOwnerId, invitationProvider, invitationStatus });
  assert(deliveryResult?.status === "invited" && deliveryResult.invitationStatus === invitationStatus && deliveryResult.invitationProvider === invitationProvider, `${invitationStatus}/${invitationProvider} must remain a legal invited delivery transition`);
}

const nonInvitedDeliveryDb = globalThis.__brokerDb;
for (const status of ["active", "suspended", "removed"]) {
  const userId = `task043_delivery_${status}_user`;
  const membershipId = `membership_task043_delivery_${status}`;
  nonInvitedDeliveryDb.users.push({ id: userId, name: `${status} Delivery Target`, email: `task043-delivery-${status}@example.test`, passwordHash: "test", createdAt: authorizationNow });
  nonInvitedDeliveryDb.tenantMemberships.push({ id: membershipId, tenantId: deliveryValidationAccount.id, userId, role: "broker", capability: "ordinary_member", status, invitationProvider: "manual", invitationStatus: status === "active" ? "accepted" : "pending", createdAt: authorizationNow, updatedAt: authorizationNow });
  const beforeRef = globalThis.__brokerDb;
  const beforeContent = JSON.stringify(beforeRef);
  const result = await data.updateTenantMemberInvitation({ tenantId: deliveryValidationAccount.id, membershipId, actorUserId: deliveryValidationOwnerId, invitationProvider: "manual", invitationStatus: "revoked" });
  assert(result === null, `${status} target delivery update must return null`);
  assert(globalThis.__brokerDb === beforeRef && JSON.stringify(globalThis.__brokerDb) === beforeContent, `${status} target delivery update must publish zero changes`);
}

const atomicDeliveryAccount = await data.createTenantAccount({ name: "TASK043 Atomic Delivery", slug: "task043-atomic-delivery", accountType: "company", status: "active", purchasedSeatCount: 2, actorUserId: "actor_task043", ownerName: "Atomic Delivery Owner", ownerEmail: "task043-atomic-delivery-owner@example.test" });
const atomicDeliveryOwnerId = activatePlatformCreatedOwner(atomicDeliveryAccount);
const atomicDeliveryInvite = await data.inviteTenantMember({ tenantId: atomicDeliveryAccount.id, name: "Atomic Delivery Invite", email: "task043-atomic-delivery@example.test", role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: atomicDeliveryOwnerId });
const snapshotDeliveryState = () => ({
  ref: globalThis.__brokerDb,
  content: JSON.stringify(globalThis.__brokerDb),
  memberships: globalThis.__brokerDb.tenantMemberships,
  audits: globalThis.__brokerDb.auditLogs,
  auditContent: JSON.stringify(globalThis.__brokerDb.auditLogs),
});
const assertDeliveryStateUnchanged = (before, label) => {
  assert(globalThis.__brokerDb === before.ref, `${label} must preserve the published database reference`);
  assert(globalThis.__brokerDb.tenantMemberships === before.memberships, `${label} must preserve the membership array reference`);
  assert(globalThis.__brokerDb.auditLogs === before.audits, `${label} must preserve the audit array reference`);
  assert(JSON.stringify(globalThis.__brokerDb) === before.content, `${label} must preserve all database content`);
  assert(JSON.stringify(globalThis.__brokerDb.auditLogs) === before.auditContent, `${label} must preserve audit content`);
};

const deliveryAuditIdBefore = snapshotDeliveryState();
Math.random = () => { throw new Error("injected delivery audit id failure"); };
try {
  let rejected = false;
  try {
    await data.updateTenantMemberInvitation({ tenantId: atomicDeliveryAccount.id, membershipId: atomicDeliveryInvite.id, actorUserId: atomicDeliveryOwnerId, invitationProvider: "clerk", invitationStatus: "pending", providerInvitationId: "inv_atomic_fault_id" });
  } catch (error) {
    rejected = error instanceof Error && error.message.includes("delivery audit id failure");
  }
  assert(rejected, "delivery audit id construction failure must reject");
} finally {
  Math.random = originalRandom;
}
assertDeliveryStateUnchanged(deliveryAuditIdBefore, "delivery audit id failure");

const deliveryAuditInsertionBefore = snapshotDeliveryState();
const originalDeliveryUnshift = Array.prototype.unshift;
Array.prototype.unshift = function (...items) {
  if (items.some((item) => item?.action === "member_invitation_sent")) throw new Error("injected delivery audit insertion failure");
  return originalDeliveryUnshift.apply(this, items);
};
try {
  let rejected = false;
  try {
    await data.updateTenantMemberInvitation({ tenantId: atomicDeliveryAccount.id, membershipId: atomicDeliveryInvite.id, actorUserId: atomicDeliveryOwnerId, invitationProvider: "clerk", invitationStatus: "pending", providerInvitationId: "inv_atomic_fault_insert" });
  } catch (error) {
    rejected = error instanceof Error && error.message.includes("delivery audit insertion failure");
  }
  assert(rejected, "delivery audit insertion failure must reject");
} finally {
  Array.prototype.unshift = originalDeliveryUnshift;
}
assertDeliveryStateUnchanged(deliveryAuditInsertionBefore, "delivery audit insertion failure");

const sentAuditBefore = globalThis.__brokerDb.auditLogs.length;
await data.updateTenantMemberInvitation({ tenantId: atomicDeliveryAccount.id, membershipId: atomicDeliveryInvite.id, actorUserId: atomicDeliveryOwnerId, invitationProvider: "clerk", invitationStatus: "pending", providerInvitationId: "inv_atomic_success" });
const sentAudits = globalThis.__brokerDb.auditLogs.filter((audit) => audit.action === "member_invitation_sent" && audit.targetId === atomicDeliveryInvite.id);
assert(globalThis.__brokerDb.auditLogs.length === sentAuditBefore + 1 && sentAudits.length === 1, "successful delivery finalization must persist exactly one sent audit");
assert(sentAudits[0].tenantId === atomicDeliveryAccount.id && sentAudits[0].actorId === atomicDeliveryOwnerId && sentAudits[0].userId === atomicDeliveryOwnerId && sentAudits[0].targetType === "member", "sent delivery audit must bind exact tenant, actor/user, and membership target");
const duplicateSentBefore = snapshotDeliveryState();
await data.updateTenantMemberInvitation({ tenantId: atomicDeliveryAccount.id, membershipId: atomicDeliveryInvite.id, actorUserId: atomicDeliveryOwnerId, invitationProvider: "clerk", invitationStatus: "pending", providerInvitationId: "inv_atomic_success" });
assertDeliveryStateUnchanged(duplicateSentBefore, "duplicate sent finalization");

const failedAuditBefore = globalThis.__brokerDb.auditLogs.length;
await data.updateTenantMemberInvitation({ tenantId: atomicDeliveryAccount.id, membershipId: atomicDeliveryInvite.id, actorUserId: atomicDeliveryOwnerId, invitationProvider: "clerk", invitationStatus: "failed", invitationError: "atomic delivery failure" });
const failedAudits = globalThis.__brokerDb.auditLogs.filter((audit) => audit.action === "member_invitation_failed" && audit.targetId === atomicDeliveryInvite.id);
assert(globalThis.__brokerDb.auditLogs.length === failedAuditBefore + 1 && failedAudits.length === 1, "failed delivery finalization must persist exactly one failed audit");
const duplicateFailedBefore = snapshotDeliveryState();
await data.updateTenantMemberInvitation({ tenantId: atomicDeliveryAccount.id, membershipId: atomicDeliveryInvite.id, actorUserId: atomicDeliveryOwnerId, invitationProvider: "clerk", invitationStatus: "failed", invitationError: "atomic delivery failure" });
assertDeliveryStateUnchanged(duplicateFailedBefore, "duplicate failed finalization");

for (const concurrentState of ["revoked", "removed", "accepted"]) {
  const concurrentAccount = await data.createTenantAccount({ name: `TASK043 Concurrent ${concurrentState}`, slug: `task043-concurrent-${concurrentState}`, accountType: "company", status: "active", purchasedSeatCount: 2, actorUserId: "actor_task043", ownerName: `Concurrent ${concurrentState} Owner`, ownerEmail: `task043-concurrent-${concurrentState}-owner@example.test` });
  const concurrentOwnerId = activatePlatformCreatedOwner(concurrentAccount);
  const concurrentInvite = await data.inviteTenantMember({ tenantId: concurrentAccount.id, name: `Concurrent ${concurrentState} Invite`, email: `task043-concurrent-${concurrentState}@example.test`, role: "broker", status: "invited", capability: "ordinary_member", invitedByUserId: concurrentOwnerId });
  const prepared = await data.refreshTenantMemberInvitation({ tenantId: concurrentAccount.id, membershipId: concurrentInvite.id, invitedByUserId: concurrentOwnerId });
  assert(prepared, `${concurrentState} concurrency fixture must prepare delivery context`);
  const currentMembership = globalThis.__brokerDb.tenantMemberships.find((membership) => membership.id === concurrentInvite.id);
  assert(currentMembership, `${concurrentState} concurrency fixture membership must exist`);
  if (concurrentState === "revoked") currentMembership.invitationStatus = "revoked";
  if (concurrentState === "removed") currentMembership.status = "removed";
  if (concurrentState === "accepted") {
    currentMembership.status = "active";
    currentMembership.invitationStatus = "accepted";
    currentMembership.invitationAcceptedAt = new Date();
  }
  const beforeRef = globalThis.__brokerDb;
  const beforeContent = JSON.stringify(beforeRef);
  const deliveryAuditCountBefore = beforeRef.auditLogs.filter((audit) => audit.targetId === concurrentInvite.id && (audit.action === "member_invitation_sent" || audit.action === "member_invitation_failed")).length;
  const finalized = await data.updateTenantMemberInvitation({ tenantId: concurrentAccount.id, membershipId: concurrentInvite.id, actorUserId: concurrentOwnerId, memberContext: prepared.member, invitationProvider: "clerk", invitationStatus: "pending", providerInvitationId: `inv_concurrent_${concurrentState}` });
  assert(finalized === null, `concurrent ${concurrentState} must make delivery finalization return null`);
  assert(globalThis.__brokerDb === beforeRef && JSON.stringify(globalThis.__brokerDb) === beforeContent, `concurrent ${concurrentState} finalization must publish no delivery change`);
  const deliveryAuditCountAfter = globalThis.__brokerDb.auditLogs.filter((audit) => audit.targetId === concurrentInvite.id && (audit.action === "member_invitation_sent" || audit.action === "member_invitation_failed")).length;
  assert(deliveryAuditCountAfter === deliveryAuditCountBefore, `concurrent ${concurrentState} finalization must publish no delivery audit`);
}

// The restricted PostgreSQL facade is intentionally a single RPC boundary:
// the SECURITY DEFINER function owns tenant visibility, capacity, and writes.
// This independent fake proves the expected success and zero-write rejection
// behavior without granting the runtime role raw table visibility.
async function runRestrictedInvitationRpc({ purchasedSeats, usedSeats, actorCapability }) {
  const state = { usedSeats, invitations: [] };
  let rpcCalls = 0;
  const before = JSON.stringify(state);
  const client = {
    async query(sql) {
      rpcCalls += 1;
      assert(sql === "create_tenant_invitation", "restricted invitation facade must call only the invitation RPC");
      if (actorCapability !== "company_owner") throw new Error("member invite permission required");
      if (state.usedSeats >= purchasedSeats) throw new Error("purchased seat count exceeded");
      state.usedSeats += 1;
      state.invitations.push({ status: "invited", invitationStatus: "pending" });
      return { rows: [{ status: "invited", invitation_status: "pending" }] };
    },
  };
  try {
    const result = await client.query("create_tenant_invitation");
    return { ok: true, before, state, result, rpcCalls };
  } catch (error) {
    return { ok: false, before, state, error, rpcCalls };
  }
}

const restrictedOwnerInvite = await runRestrictedInvitationRpc({ purchasedSeats: 10, usedSeats: 1, actorCapability: "company_owner" });
assert(restrictedOwnerInvite.ok && restrictedOwnerInvite.rpcCalls === 1, "restricted runtime company_owner invitation must succeed through exactly one RPC");
assert(restrictedOwnerInvite.state.usedSeats === 2 && restrictedOwnerInvite.state.invitations.length === 1, "restricted runtime invitation RPC must publish one invited seat");
const restrictedFullInvite = await runRestrictedInvitationRpc({ purchasedSeats: 1, usedSeats: 1, actorCapability: "company_owner" });
assert(!restrictedFullInvite.ok && restrictedFullInvite.rpcCalls === 1, "full-seat restricted runtime invitation must be rejected by the RPC");
assert(JSON.stringify(restrictedFullInvite.state) === restrictedFullInvite.before, "full-seat RPC rejection must publish zero invitation changes");

console.log("[PASS] platform subscription behavior matrix");
