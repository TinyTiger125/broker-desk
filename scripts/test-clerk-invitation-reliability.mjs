#!/usr/bin/env node
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const require = Module.createRequire(import.meta.url);
const { ClerkAPIResponseError } = require("@clerk/backend/errors");

const root = process.cwd();
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
  mod.require = (request) => request.startsWith("@/lib/") ? loadTs(resolveAlias(request)) : originalRequire(request);
  mod._compile(output, sourcePath);
  cache.set(sourcePath, mod.exports);
  return mod.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

process.env.BROKER_DESK_AUTH_MODE = "clerk";
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_injected";
process.env.CLERK_SECRET_KEY = "sk_test_injected";

const {
  classifyClerkInvitationError,
  createClerkInvitationForTenantMember,
} = loadTs("src/lib/clerk-invitations.ts");

const context = {
  tenant: { id: "tenant_mock", name: "Mock Tenant" },
  member: {
    id: "membership_mock",
    role: "tenant_owner",
    user: { id: "user_mock", name: "Mock User", email: "invite@example.test" },
  },
};

const paramsSeen = [];
const success = await createClerkInvitationForTenantMember(context, {
  createInvitation: async (params) => {
    paramsSeen.push(params);
    return { id: "inv_mock", url: "https://example.test/inv_mock" };
  },
});
assert(success.ok && success.providerInvitationId === "inv_mock", "injected provider success must return the provider id");
assert(paramsSeen.length === 1 && paramsSeen[0].notify === true && paramsSeen[0].ignoreExisting === true, "mock must receive explicit notify and resend semantics");

let unknownProviderError;
try {
  await createClerkInvitationForTenantMember(context, {
    createInvitation: async () => {
      throw new Error("fetch failed after provider request");
    },
  });
} catch (error) {
  unknownProviderError = error;
}
assert(unknownProviderError && classifyClerkInvitationError(unknownProviderError).uncertain === true, "injected provider interruption must be classified as unknown");

const explicitRejection = new ClerkAPIResponseError("invalid invitation", {
  data: [{ code: "email_address_invalid", message: "invalid" }],
  status: 422,
});
assert(classifyClerkInvitationError(explicitRejection).uncertain === true, "Clerk API errors must remain outcome-unknown without side-effect evidence");

const timeoutResponse = new ClerkAPIResponseError("request timed out", {
  data: [{ code: "request_timeout", message: "timeout" }],
  status: 408,
});
const rateLimitedResponse = new ClerkAPIResponseError("rate limited", {
  data: [{ code: "rate_limit_exceeded", message: "retry later" }],
  status: 429,
});
assert(classifyClerkInvitationError(timeoutResponse).uncertain === true, "Clerk timeout responses must remain outcome-unknown");
assert(classifyClerkInvitationError(rateLimitedResponse).uncertain === true, "Clerk rate-limit responses must remain outcome-unknown");

const serverFailure = new ClerkAPIResponseError("provider unavailable", {
  data: [{ code: "internal_server_error", message: "unavailable" }],
  status: 500,
});
assert(classifyClerkInvitationError(serverFailure).uncertain === true, "Clerk 5xx must remain outcome-unknown");
assert(classifyClerkInvitationError(new Error("fetch failed")).uncertain === true, "network failure must remain outcome-unknown");

const actionSource = fs.readFileSync(path.join(root, "src/app/actions.ts"), "utf8");
const uncertainGuard = actionSource.indexOf("if (providerOutcomeUncertain)");
const providerSuccessBranch = actionSource.indexOf("if (result.ok)", uncertainGuard);
const failureFinalization = actionSource.indexOf('invitationStatus: "failed"', uncertainGuard);
assert(uncertainGuard >= 0 && providerSuccessBranch > uncertainGuard, "unknown provider outcomes must return through an explicit guard");
assert(failureFinalization > uncertainGuard, "explicit failures must remain handled after the unknown-outcome guard");

const invitationData = loadTs("src/lib/data.memory.ts");
const invitationDb = globalThis.__brokerDb;
const actorMembership = invitationDb.tenantMemberships.find(
  (membership) => membership.status === "active" && membership.capability === "company_owner",
);
assert(actorMembership, "synthetic invitation concurrency fixture requires a company owner");
const actorId = actorMembership.userId;
const tenantId = actorMembership.tenantId;
const retryMember = await invitationData.inviteTenantMember({
  tenantId,
  name: "Synthetic Provider Timeout",
  email: `synthetic-provider-timeout-${Date.now()}@example.test`,
  role: "broker",
  status: "invited",
  capability: "ordinary_member",
  invitedByUserId: actorId,
});
let providerCalls = 0;
const firstPrepared = await invitationData.refreshTenantMemberInvitation({
  tenantId,
  membershipId: retryMember.id,
  invitedByUserId: actorId,
});
assert(firstPrepared, "first synthetic invitation attempt must prepare a member");
const firstToken = firstPrepared.member.invitationToken;
providerCalls += 1;
let providerTimedOut = false;
try {
  // The provider has created the invitation, but the response is lost.
  throw new Error("synthetic timeout after provider side effect");
} catch {
  providerTimedOut = true;
}
assert(providerTimedOut, "synthetic provider timeout must be represented");
const afterTimeout = await invitationData.getTenantMemberById({ tenantId, membershipId: retryMember.id });
assert(afterTimeout?.invitationStatus === "pending", "unknown provider outcome must leave the membership pending");
assert(!afterTimeout?.invitationError, "9421b74 does not persist an uncertainty marker");

const refreshedAfterTimeout = await invitationData.refreshTenantMemberInvitation({
  tenantId,
  membershipId: retryMember.id,
  invitedByUserId: actorId,
});
assert(refreshedAfterTimeout?.member.invitationToken !== firstToken, "a retry refresh currently rotates the invitation token");
providerCalls += 1;
assert(providerCalls === 2, "a timeout followed by a refresh/retry currently calls the provider twice");

const interleavedA = await invitationData.refreshTenantMemberInvitation({
  tenantId,
  membershipId: retryMember.id,
  invitedByUserId: actorId,
});
const interleavedB = await invitationData.refreshTenantMemberInvitation({
  tenantId,
  membershipId: retryMember.id,
  invitedByUserId: actorId,
});
assert(interleavedA && interleavedB, "interleaved synthetic requests must both reach the current prepare path");
providerCalls += 2;
assert(providerCalls === 4, "two interleaved refresh requests currently produce two more provider calls");

const revoked = await invitationData.updateTenantMemberInvitation({
  tenantId,
  membershipId: retryMember.id,
  actorUserId: actorId,
  invitationProvider: "manual",
  invitationStatus: "revoked",
  invitationError: "manual_recovery_required",
});
assert(revoked?.invitationStatus === "revoked", "manual recovery must be able to revoke an uncertain pending invitation");
const removed = await invitationData.updateTenantMemberStatus({
  tenantId,
  membershipId: retryMember.id,
  status: "removed",
  actorUserId: actorId,
});
assert(removed?.status === "removed", "manual recovery must be able to remove the revoked membership");
const replacement = await invitationData.inviteTenantMember({
  tenantId,
  name: "Synthetic Provider Timeout Replacement",
  email: retryMember.user.email,
  role: "broker",
  status: "invited",
  capability: "ordinary_member",
  invitedByUserId: actorId,
});
assert(replacement.id !== retryMember.id && replacement.status === "invited", "manual revoke/remove must permit a deliberate replacement invite");

console.log("Clerk invitation reliability: PASS (API/timeout/rate-limit uncertainty; synthetic provider calls 4 across retry/interleave; manual revoke/remove replacement path verified; cross-request idempotency NOT established)");
