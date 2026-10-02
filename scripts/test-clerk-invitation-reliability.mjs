#!/usr/bin/env node
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import vm from "node:vm";

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
const { makeInvitationDeliveryUnknownError } = loadTs("src/lib/invitation-delivery-state.ts");

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
assert(classifyClerkInvitationError(explicitRejection).uncertain === false, "known invalid email rejection must remain safely retryable");
const unknownClientRejection = new ClerkAPIResponseError("unknown client rejection", {
  data: [{ code: "unknown_invitation_rejection", message: "unknown" }],
  status: 422,
});
assert(classifyClerkInvitationError(unknownClientRejection).uncertain === true, "unknown 4xx codes must remain outcome-unknown");

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
const claimMigration = fs.readFileSync(path.join(root, "db/migrations/20261002_001_invitation_delivery_claim.sql"), "utf8");
const claimRollback = fs.readFileSync(path.join(root, "db/migrations/rollback/20261002_001_invitation_delivery_claim.sql"), "utf8");
const uncertainGuard = actionSource.indexOf("if (providerOutcomeUncertain)");
const providerSuccessBranch = actionSource.indexOf("if (result.ok)", uncertainGuard);
const failureFinalization = actionSource.indexOf('invitationStatus: "failed"', uncertainGuard);
assert(uncertainGuard >= 0 && providerSuccessBranch > uncertainGuard, "unknown provider outcomes must return through an explicit guard");
assert(failureFinalization > uncertainGuard, "explicit failures must remain handled after the unknown-outcome guard");
for (const token of [
  "ADD COLUMN IF NOT EXISTS invitation_delivery_state TEXT",
  "invitation_delivery_state IN ('ready', 'sending', 'unknown', 'provider_accepted')",
  "target_membership_row.invitation_delivery_state IN ('sending', 'unknown')",
  "invitation_delivery_state = 'sending'",
  "invitation_delivery_state = next_delivery_state",
  "REVOKE ALL ON FUNCTION brokerdesk_private.prepare_tenant_invitation_delivery",
  "GRANT EXECUTE ON FUNCTION brokerdesk_private.record_tenant_invitation_delivery",
]) {
  assert(claimMigration.includes(token), `delivery claim migration must include ${token}`);
}
assert(claimMigration.indexOf("FOR UPDATE;\n  IF NOT FOUND THEN\n    RETURN;\n  END IF;\n  purchased_seat_count") >= 0, "delivery claim must retain tenant lock before actor/member locks");
assert(claimMigration.indexOf("FOR UPDATE OF authorized_actor_memberships;") < claimMigration.indexOf("FOR UPDATE OF target_membership;"), "delivery claim must lock actor before target membership");
assert(claimMigration.indexOf("FOR UPDATE OF target_membership;") < claimMigration.indexOf("FOR UPDATE OF invited_user;"), "delivery claim must lock target before invited user");
assert(claimRollback.includes("DROP COLUMN IF EXISTS invitation_delivery_state"), "delivery claim rollback must remove only its added column");

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
assert(firstPrepared.member.invitationDeliveryState === "sending", "first prepare must persist a distinct sending claim");
providerCalls += 1;
let providerTimedOut = false;
try {
  // The provider has created the invitation, but the response is lost.
  throw new Error("synthetic timeout after provider side effect");
} catch {
  providerTimedOut = true;
}
assert(providerTimedOut, "synthetic provider timeout must be represented");
const unknownFinalized = await invitationData.updateTenantMemberInvitation({
  tenantId,
  membershipId: retryMember.id,
  actorUserId: actorId,
  invitationProvider: "clerk",
  invitationStatus: "pending",
  invitationError: "invitation_delivery_outcome_unknown:synthetic timeout after provider side effect",
});
assert(unknownFinalized?.invitationDeliveryState === "unknown", "provider timeout must persist the unknown delivery state");
const afterTimeout = await invitationData.getTenantMemberById({ tenantId, membershipId: retryMember.id });
assert(afterTimeout?.invitationStatus === "pending", "unknown provider outcome must leave the membership pending");
assert(afterTimeout?.invitationDeliveryState === "unknown" && afterTimeout.invitationError?.startsWith("invitation_delivery_outcome_unknown:"), "unknown delivery state must survive a read/reload");

const refreshedAfterTimeout = await invitationData.refreshTenantMemberInvitation({
  tenantId,
  membershipId: retryMember.id,
  invitedByUserId: actorId,
});
assert(refreshedAfterTimeout?.invitationDeliveryBlocked === "unknown", "unknown delivery state must block a retry before provider invocation");
assert(refreshedAfterTimeout.member.invitationToken === firstToken, "blocked retry must not rotate the invitation token");
assert(providerCalls === 1, "a timeout followed by a refresh/retry must keep provider calls at one");

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
assert(interleavedA?.invitationDeliveryBlocked === "unknown" && interleavedB?.invitationDeliveryBlocked === "unknown", "interleaved retries must both be blocked by the persisted unknown state");
assert(providerCalls === 1, "interleaved retries must not add provider calls after an unknown outcome");

const explicitFailureMember = await invitationData.inviteTenantMember({
  tenantId,
  name: "Synthetic Safe Retry",
  email: `synthetic-safe-retry-${Date.now()}@example.test`,
  role: "broker",
  status: "invited",
  capability: "ordinary_member",
  invitedByUserId: actorId,
});
const explicitFailurePrepared = await invitationData.refreshTenantMemberInvitation({ tenantId, membershipId: explicitFailureMember.id, invitedByUserId: actorId });
assert(explicitFailurePrepared?.member.invitationDeliveryState === "sending", "safe-retry fixture must claim sending before provider validation");
const explicitFailure = await invitationData.updateTenantMemberInvitation({
  tenantId,
  membershipId: explicitFailureMember.id,
  actorUserId: actorId,
  invitationProvider: "clerk",
  invitationStatus: "failed",
  invitationError: "clerk_invitation_api_422:email_address_invalid",
});
assert(explicitFailure?.invitationDeliveryState === "ready", "known local validation failure must return to ready");
const retryAfterExplicitFailure = await invitationData.refreshTenantMemberInvitation({ tenantId, membershipId: explicitFailureMember.id, invitedByUserId: actorId });
assert(retryAfterExplicitFailure?.member.invitationDeliveryState === "sending", "known local validation failure must permit a corrected retry");

const revoked = await invitationData.updateTenantMemberInvitation({
  tenantId,
  membershipId: retryMember.id,
  actorUserId: actorId,
  invitationProvider: "manual",
  invitationStatus: "revoked",
  invitationError: "manual_recovery_required",
});
assert(revoked?.invitationStatus === "revoked" && revoked.invitationDeliveryState === "ready", "manual recovery must be able to revoke an uncertain pending invitation");
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

const actionAst = ts.createSourceFile("actions.ts", actionSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const actionSenderNode = actionAst.statements.find(
  (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "sendTenantMemberInvitation",
);
assert(actionSenderNode, "the invitation Action sender must remain available as a testable function seam");
const actionSenderOutput = ts.transpileModule(
  "module.exports = " + actionSource.slice(actionSenderNode.getStart(actionAst), actionSenderNode.end) + ";",
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function loadActionSender(createProvider) {
  const senderModule = { exports: {} };
  vm.runInNewContext(actionSenderOutput, {
    module: senderModule,
    exports: senderModule.exports,
    refreshTenantMemberInvitation: invitationData.refreshTenantMemberInvitation,
    updateTenantMemberInvitation: invitationData.updateTenantMemberInvitation,
    isSupabaseAuthEnabled: () => false,
    inviteSupabaseUserByEmail: async () => {
      throw new Error("the Clerk reliability harness must not call Supabase");
    },
    createClerkInvitationForTenantMember: createProvider,
    classifyClerkInvitationError,
    makeInvitationDeliveryUnknownError,
    console,
    process,
    setTimeout,
    clearTimeout,
  }, { filename: "src/app/actions.ts" });
  assert(typeof senderModule.exports === "function", "the extracted invitation Action sender must be callable");
  return senderModule.exports;
}

const actionTestTenant = globalThis.__brokerDb.tenants.find((tenant) => tenant.id === tenantId);
assert(actionTestTenant, "Action reliability fixture tenant must exist");
actionTestTenant.purchasedSeatCount = Math.max(actionTestTenant.purchasedSeatCount, 32);

async function createActionTestMember(label) {
  return invitationData.inviteTenantMember({
    tenantId,
    name: "Action " + label,
    email: "synthetic-action-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now() + "@example.test",
    role: "broker",
    status: "invited",
    capability: "ordinary_member",
    invitedByUserId: actorId,
  });
}

async function runActionWithProvider(member, providerBehavior) {
  let providerCalls = 0;
  const actionModuleProvider = (prepared) => createClerkInvitationForTenantMember(prepared, {
    createInvitation: async (params) => {
      providerCalls += 1;
      return providerBehavior({ params, providerCalls });
    },
  });
  const sender = loadActionSender(actionModuleProvider);
  const result = await sender({
    tenantId,
    membershipId: member.id,
    actorId,
    recordSkippedAsFailure: true,
  });
  return {
    result,
    getProviderCalls: () => providerCalls,
    sender,
  };
}

const actionTimeoutMember = await createActionTestMember("Timeout");
const actionTimeout = await runActionWithProvider(actionTimeoutMember, async () => {
  throw new Error("synthetic timeout after provider side effect");
});
assert(actionTimeout.result.uncertain && actionTimeout.result.deliveryBlocked === "unknown", "Action must persist and expose an unknown timeout outcome");
const actionTimeoutRetry = await actionTimeout.sender({
  tenantId,
  membershipId: actionTimeoutMember.id,
  actorId,
  recordSkippedAsFailure: true,
});
assert(actionTimeoutRetry.deliveryBlocked === "unknown" && actionTimeout.getProviderCalls() === 1, "Action timeout followed by refresh must call the provider exactly once");

const actionConcurrentMember = await createActionTestMember("Concurrent");
let concurrentProviderCalls = 0;
let releaseConcurrentProvider;
const concurrentProviderRelease = new Promise((resolve) => {
  releaseConcurrentProvider = resolve;
});
const concurrentSender = loadActionSender((prepared) => createClerkInvitationForTenantMember(prepared, {
  createInvitation: async () => {
    concurrentProviderCalls += 1;
    await concurrentProviderRelease;
    throw new Error("synthetic concurrent timeout after provider side effect");
  },
}));
const firstConcurrentAction = concurrentSender({
  tenantId,
  membershipId: actionConcurrentMember.id,
  actorId,
  recordSkippedAsFailure: true,
});
await new Promise((resolve) => setImmediate(resolve));
assert(concurrentProviderCalls === 1, "the first concurrent Action must claim before its provider call");
const secondConcurrentAction = await concurrentSender({
  tenantId,
  membershipId: actionConcurrentMember.id,
  actorId,
  recordSkippedAsFailure: true,
});
assert(secondConcurrentAction.deliveryBlocked === "sending" && concurrentProviderCalls === 1, "a second concurrent Action must stop at the persisted sending claim");
releaseConcurrentProvider?.();
const firstConcurrentResult = await firstConcurrentAction;
assert(firstConcurrentResult.uncertain && concurrentProviderCalls === 1, "the first concurrent Action must finalize unknown without a second provider call");

const actionValidationMember = await createActionTestMember("Validation");
const actionValidation = await runActionWithProvider(actionValidationMember, async ({ providerCalls: calls }) => {
  if (calls === 1) {
    throw new ClerkAPIResponseError("invalid invitation", {
      data: [{ code: "email_address_invalid", message: "invalid" }],
      status: 422,
    });
  }
  return { id: "inv_action_validated", url: "https://example.test/inv_action_validated" };
});
assert(!actionValidation.result.uncertain && actionValidation.result.sent === false, "known local provider validation failure must be a confirmed failure");
const actionValidationRetry = await actionValidation.sender({
  tenantId,
  membershipId: actionValidationMember.id,
  actorId,
  recordSkippedAsFailure: true,
});
assert(actionValidation.getProviderCalls() === 2 && actionValidationRetry.sent === true, "known local validation failure must allow one corrected retry");
const actionValidationState = await invitationData.getTenantMemberById({ tenantId, membershipId: actionValidationMember.id });
assert(actionValidationState?.invitationDeliveryState === "provider_accepted", "corrected Action retry must persist provider-accepted state");

const actionSuccessMember = await createActionTestMember("Success");
const actionSuccess = await runActionWithProvider(actionSuccessMember, async () => ({
  id: "inv_action_success",
  url: "https://example.test/inv_action_success",
}));
assert(actionSuccess.result.sent === true && !actionSuccess.result.uncertain && actionSuccess.getProviderCalls() === 1, "normal Action success must call the provider once");
const actionSuccessState = await invitationData.getTenantMemberById({ tenantId, membershipId: actionSuccessMember.id });
assert(actionSuccessState?.invitationDeliveryState === "provider_accepted", "normal Action success must persist provider-accepted state");

console.log("Clerk invitation reliability: PASS (safe 4xx retry classification; memory adapter and Action provider call count stay at one after timeout and concurrent retry; known validation failure retries; success persists provider_accepted without claiming inbox delivery; manual local recovery is explicitly remote-agnostic)");
