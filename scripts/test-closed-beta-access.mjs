#!/usr/bin/env node

import assert from "node:assert/strict";
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

const atomicMigration = fs.readFileSync(path.resolve(ROOT, "db/migrations/20261008_001_closed_beta_atomic_provisioning.sql"), "utf8");
const formSource = fs.readFileSync(path.resolve(ROOT, "src/components/closed-beta-tester-form.tsx"), "utf8");
const pageSource = fs.readFileSync(path.resolve(ROOT, "src/app/platform/closed-beta/page.tsx"), "utf8");
const actionSource = fs.readFileSync(path.resolve(ROOT, "src/app/platform/closed-beta/actions.ts"), "utf8");
const closedBetaSource = fs.readFileSync(path.resolve(ROOT, "src/lib/closed-beta-access.ts"), "utf8");
const postgresSource = fs.readFileSync(path.resolve(ROOT, "src/lib/data.postgres.ts"), "utf8");
assert.match(atomicMigration, /ALTER FUNCTION brokerdesk_private\.create_closed_beta_tenant_account[\s\S]+OWNER TO postgres/);
assert.match(atomicMigration, /GRANT EXECUTE ON FUNCTION brokerdesk_private\.create_closed_beta_tenant_account[\s\S]+TO brokerdesk_runtime/);
assert.match(atomicMigration, /jsonb_build_object\('flow', 'closed_beta'\)/, "closed-beta flow marker must be persisted in the creation audit");
assert.ok(
  atomicMigration.indexOf("active platform owner membership required") < atomicMigration.indexOf("pg_advisory_xact_lock"),
  "closed-beta migration must authorize the actor before the email lock/check",
);
assert.ok(
  atomicMigration.indexOf("lower(trim(existing_users.email))") > atomicMigration.indexOf("active platform owner membership required"),
  "closed-beta migration must perform the global duplicate check only after authorization",
);
assert.doesNotMatch(formSource, /name="slug"/, "closed-beta UI must not expose a slug input");
assert.doesNotMatch(formSource, /name="tenantName"/, "closed-beta UI must not expose a technical tenant-name input");
assert.doesNotMatch(actionSource, /formData,\s*"slug"/, "closed-beta action must ignore forged client slug fields");
assert.doesNotMatch(actionSource, /formData,\s*"tenantName"/, "closed-beta action must derive the tenant display name server-side");
assert.doesNotMatch(pageSource, /text\.intro|intro:/, "closed-beta header must not carry a redundant explanatory paragraph");
assert.doesNotMatch(pageSource, /UNVERIFIED|synthetic marker|browser Auth/, "production page copy must not expose internal auth verification terms");
assert.match(pageSource, /demoMode=\{isDemoAuthEnabled\(\)\}/, "local demo warning must be gated to demo auth mode");
assert.match(formSource, /demoMode \? <p[^>]+>\{text\.demoNotice\}/, "local demo warning must appear beside the create action");
assert.match(formSource, /className="grid grid-cols-1[^\n]+md:grid-cols-2/, "narrow closed-beta form must use one column before the desktop breakpoint");
assert.match(formSource, /name="testerName"[\s\S]+name="testerEmail"[\s\S]+name="serviceStartAt"[\s\S]+name="serviceEndAt"/, "desktop field order must keep the two intended pairs together");
assert.match(formSource, /md:col-span-2[^\n]*>\{text\.endHint\}/, "service-end explanation must sit below the two-column date row");
assert.match(postgresSource, /slug TEXT UNIQUE NOT NULL/, "database tenant slug must remain uniquely constrained");
assert.match(postgresSource, /createClosedBetaTechnicalSlug\(\)/, "PostgreSQL closed-beta path must use a server-generated technical slug");
assert.match(closedBetaSource, /buildClosedBetaTenantDisplayName/, "closed-beta tenant display name must be generated in the server module");

function resolveAlias(request) {
  const isLibAlias = request.startsWith("@/lib/");
  const relative = request.slice(isLibAlias ? "@/lib/".length : "@/".length);
  const base = isLibAlias ? path.resolve(ROOT, "src/lib") : path.resolve(ROOT, "src");
  const extensions = /\.(?:ts|tsx|mjs|js|cjs)$/.test(relative)
    ? [""]
    : [".ts", ".tsx", ".mjs", ".js", ".cjs"];
  const candidates = extensions.map((extension) => path.resolve(base, `${relative}${extension}`));
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function loadTs(sourcePath, overrides = {}) {
  const absolutePath = path.resolve(ROOT, sourcePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const source = fs.readFileSync(absolutePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: absolutePath,
  }).outputText;
  const mod = new Module(absolutePath);
  mod.filename = absolutePath;
  mod.paths = Module._nodeModulePaths(ROOT);
  moduleCache.set(absolutePath, mod);
  const originalRequire = mod.require.bind(mod);
  mod.require = (request) => {
    if (Object.prototype.hasOwnProperty.call(overrides, request)) return overrides[request];
    if (request.startsWith("@/")) return loadTs(resolveAlias(request), overrides);
    if (request === "react") return { cache: (fn) => fn };
    if (request === "next/headers") {
      return {
        headers: async () => new Headers(),
        cookies: async () => ({ getAll: () => [], get: () => undefined, set() {} }),
      };
    }
    return originalRequire(request);
  };
  mod._compile(output, absolutePath);
  return mod.exports;
}

process.env.NODE_ENV = "development";
process.env.BROKER_DESK_AUTH_MODE = "demo";
process.env.BROKER_DESK_DEFAULT_LOCALE = "zh";
delete process.env.BROKER_DESK_AUTH_PROVIDER;
delete process.env.DATA_DRIVER;
delete process.env.DATABASE_URL;
delete process.env.BROKER_DESK_APP_ORIGIN;
delete process.env.BROKER_DESK_APP_URL;

const memory = loadTs("src/lib/data.memory.ts");
const data = loadTs("src/lib/data.ts");
const closedBeta = loadTs("src/lib/closed-beta-access.ts", { "server-only": {} });
const admin = loadTs("src/lib/supabase/admin.ts", { "server-only": {} });

const actorUserId = "user_demo";
const authorizationNow = new Date();
globalThis.__brokerDb.tenantMemberships.push({
  id: `membership_closed_beta_test_${Date.now()}`,
  tenantId: "tenant_cherry",
  userId: actorUserId,
  role: "platform_owner",
  capability: "ordinary_member",
  status: "active",
  invitationProvider: "manual",
  invitationStatus: "accepted",
  invitationAcceptedAt: authorizationNow,
  createdAt: authorizationNow,
  updatedAt: authorizationNow,
});
const email = `closed-beta-${Date.now()}@example.test`;
const input = {
  actorUserId,
  testerName: "Synthetic Tester",
  testerEmail: email,
  serviceStartAt: "2026-10-08",
  serviceEndAt: "2026-10-31",
  locale: "zh",
};

const result = await closedBeta.createClosedBetaTester(input);
assert.equal(result.invitation.provider, "manual");
assert.match(result.invitation.invitationUrl, /synthetic-closed-beta-/);
const syntheticUrl = new URL(result.invitation.invitationUrl);
const syntheticFragment = new URLSearchParams(syntheticUrl.hash.slice(1));
assert.equal(syntheticUrl.pathname, "/auth/invite");
assert.equal(syntheticUrl.search, "");
assert.equal(syntheticFragment.get("type"), "invite");
assert.match(syntheticFragment.get("token_hash") ?? "", /^synthetic-closed-beta-/);
assert.equal(result.account.serviceEndAt, input.serviceEndAt);
assert.ok(result.invitation.membershipInvitationExpiresAt);

const owner = (await memory.listPlatformTenantAccounts()).find((account) => account.id === result.account.id)?.ownerMembers[0];
assert.ok(owner, "created account must expose its owner membership");
const createdAccount = (await memory.listPlatformTenantAccounts()).find((account) => account.id === result.account.id);
assert.ok(createdAccount, "created account must be readable after invitation issuance");
assert.equal(createdAccount.name, "Synthetic Tester的测试工作区", "tenant display name must be generated from the tester name");
assert.match(createdAccount.slug, /^closed-beta-[0-9a-f-]{36}$/, "closed-beta slug must be an opaque UUID technical identifier");
assert.equal(createdAccount.slug.includes(email.split("@")[0]), false, "closed-beta slug must not contain the tester email");
assert.equal(owner.user.email, email);
assert.equal(owner.isBoundToExternalAuth, false, "synthetic issue must not bind a tester identity");
assert.equal((await memory.listTenantMemberships(owner.user.id)).filter((membership) => membership.tenantId === result.account.id).length, 1);
assert.equal((await memory.getTenantMemberById({ tenantId: result.account.id, membershipId: owner.id }))?.invitationUrl, undefined);
const accountAudit = await memory.listAuditLogs(actorUserId, { tenantId: result.account.id, limit: 20 });
assert.ok(accountAudit.some((entry) => entry.action === "tenant_account_created"));
assert.ok(accountAudit.some((entry) => entry.action === "tenant_account_created" && entry.context?.flow === "closed_beta"));
assert.equal(accountAudit.some((entry) => JSON.stringify(entry).includes("synthetic-closed-beta-")), false, "synthetic marker must not enter audit evidence");
const scopedSummaries = await closedBeta.listClosedBetaAccessSummary(actorUserId);
assert.equal(scopedSummaries.some((summary) => summary.account.id === result.account.id), true);
assert.equal(scopedSummaries.some((summary) => summary.account.id === "tenant_cherry"), false, "ordinary tenant must not enter closed-beta summary");

// Verify the real Server Action/FormData boundary, not only the closed-beta
// facade. The session and Next side effects are explicitly mocked so this
// stays an offline test; the action must ignore forged tenant and slug fields
// while creating a server-generated display name and UUID slug.
const closedBetaActions = loadTs("src/app/platform/closed-beta/actions.ts", {
  "@/lib/platform-session": {
    requirePlatformOwnerSession: async () => ({ user: { id: actorUserId } }),
  },
  "next/cache": { revalidatePath() {} },
  "next/navigation": { redirect() { throw new Error("unexpected redirect in create action test"); } },
});
const actionForm = new FormData();
actionForm.set("testerName", "Action Boundary Tester");
actionForm.set("testerEmail", `closed-beta-action-${Date.now()}@example.test`);
actionForm.set("serviceStartAt", input.serviceStartAt);
actionForm.set("serviceEndAt", input.serviceEndAt);
actionForm.set("tenantName", "forged tenant name");
actionForm.set("slug", "forged-email@example.test");
const actionResult = await closedBetaActions.createClosedBetaTesterAction({ status: "idle" }, actionForm);
assert.equal(actionResult.status, "success", "Server Action should accept the controlled offline FormData fixture");
assert.ok(actionResult.result?.account.id, "Server Action should return the created account");
const actionAccount = (await memory.listPlatformTenantAccounts()).find((account) => account.id === actionResult.result.account.id);
assert.ok(actionAccount, "Server Action account must be persisted in the memory adapter");
assert.equal(actionAccount.name, "Action Boundary Tester的测试工作区", "Server Action must derive a user-facing tenant display name");
assert.match(actionAccount.slug, /^closed-beta-[0-9a-f-]{36}$/, "Server Action must persist a server-generated UUID slug");
assert.equal(actionAccount.slug.includes("forged-email"), false, "Server Action must ignore a forged FormData slug");

// Non-Latin same-name accounts must not fall back to a timestamp slug or collide
// when created in the same turn. A forged client slug is accepted as input here
// only to prove the server-side closed-beta path ignores it.
const sameNameResults = await Promise.all([
  closedBeta.createClosedBetaTester({
    ...input,
    testerName: "同名テスター",
    testerEmail: `same-name-one-${Date.now()}@example.test`,
  }),
  closedBeta.createClosedBetaTester({
    ...input,
    testerName: "同名テスター",
    testerEmail: `same-name-two-${Date.now()}@example.test`,
    slug: "forged-email@example.test",
  }),
  closedBeta.createClosedBetaTester({
    ...input,
    testerName: "中文同名测试者",
    testerEmail: `same-name-three-${Date.now()}@example.test`,
  }),
]);
const sameNameAccounts = (await memory.listPlatformTenantAccounts()).filter((account) =>
  sameNameResults.some((candidate) => candidate.account.id === account.id),
);
assert.equal(sameNameAccounts.length, 3, "same-name closed-beta accounts must all be created");
assert.equal(sameNameAccounts.filter((account) => account.name === "同名テスター的测试工作区").length, 2, "same tester names may share a display name");
assert.equal(sameNameAccounts.some((account) => account.name.includes("中文同名测试者")), true, "non-Latin tester names must remain readable");
assert.equal(new Set(sameNameAccounts.map((account) => account.slug)).size, 3, "same-name accounts must have distinct technical slugs");
assert.ok(sameNameAccounts.every((account) => /^closed-beta-[0-9a-f-]{36}$/.test(account.slug)));
assert.equal(sameNameAccounts.some((account) => account.slug.includes("forged-email")), false, "forged slug must not reach the repository");
const stableSlug = sameNameAccounts[0].slug;
assert.equal((await memory.listPlatformTenantAccounts()).find((account) => account.id === sameNameAccounts[0].id)?.slug, stableSlug, "generated slug must remain stable after persistence");

const beforeDuplicate = (await memory.listPlatformTenantAccounts()).length;
await assert.rejects(
  closedBeta.createClosedBetaTester({ ...input, testerName: "Duplicate tester" }),
  /closed_beta_owner_email_in_use/,
);
assert.equal((await memory.listPlatformTenantAccounts()).length, beforeDuplicate, "duplicate email must not create another tenant");

// P1 negative: authorization must run before the global email duplicate probe.
await assert.rejects(
  closedBeta.createClosedBetaTester({
    ...input,
    actorUserId: "not-a-platform-owner",
    testerName: "Unauthorized tester",
    testerEmail: "qa-fixture-10@example.test",
  }),
  /active platform owner membership required/,
);
assert.equal((await memory.listPlatformTenantAccounts()).length, beforeDuplicate, "unauthorized duplicate probe must not create a tenant");

// P1 negative: sending and unknown delivery outcomes cannot be blindly retried.
const deliveryMembership = globalThis.__brokerDb.tenantMemberships.find((candidate) => candidate.id === result.tester.membershipId);
assert.ok(deliveryMembership);
const originalDeliveryState = { invitationDeliveryState: deliveryMembership.invitationDeliveryState, invitationStatus: deliveryMembership.invitationStatus };
deliveryMembership.invitationDeliveryState = "unknown";
await assert.rejects(
  closedBeta.recoverClosedBetaInvitation({ actorUserId, tenantId: result.account.id, membershipId: result.tester.membershipId }),
  /closed_beta_invitation_delivery_in_progress/,
);
deliveryMembership.invitationDeliveryState = "sending";
await assert.rejects(
  closedBeta.recoverClosedBetaInvitation({ actorUserId, tenantId: result.account.id, membershipId: result.tester.membershipId }),
  /closed_beta_invitation_delivery_in_progress/,
);
Object.assign(deliveryMembership, originalDeliveryState);

// P1 negative: ordinary tenants are rejected by the server-side persisted
// closed-beta flow marker, regardless of any client-provided tenant id.
await assert.rejects(
  closedBeta.getClosedBetaAccessSummary(actorUserId, "tenant_cherry"),
  /closed_beta_tenant_not_found/,
);

// P1 negative: a null local finalization after provider success must enter
// the unknown compensation state instead of becoming a retryable success.
const originalUpdateTenantMemberInvitation = data.updateTenantMemberInvitation;
let firstPendingFinalization = true;
data.updateTenantMemberInvitation = async (deliveryInput) => {
  if (deliveryInput.invitationStatus === "pending" && firstPendingFinalization) {
    firstPendingFinalization = false;
    return null;
  }
  return originalUpdateTenantMemberInvitation(deliveryInput);
};
const nullFinalizationEmail = `closed-beta-null-finalization-${Date.now()}@example.test`;
try {
  await assert.rejects(
    closedBeta.createClosedBetaTester({
      ...input,
      testerName: "Null finalization tester",
      testerEmail: nullFinalizationEmail,
    }),
    /closed_beta_invitation_delivery_uncertain/,
  );
} finally {
  data.updateTenantMemberInvitation = originalUpdateTenantMemberInvitation;
}
const nullFinalizationOwner = (await memory.listPlatformTenantAccounts())
  .flatMap((account) => account.ownerMembers)
  .find((member) => member.user.email === nullFinalizationEmail);
assert.equal(nullFinalizationOwner?.invitationDeliveryState, "unknown");

await data.updateTenantAccountLifecycle({
  tenantId: result.account.id,
  status: "suspended",
  serviceStartAt: input.serviceStartAt,
  serviceEndAt: input.serviceEndAt,
  actorUserId,
});
assert.equal((await memory.getTenantById(result.account.id))?.status, "suspended");
const extended = await data.updateTenantAccountLifecycle({
  tenantId: result.account.id,
  status: "active",
  serviceStartAt: input.serviceStartAt,
  serviceEndAt: "2026-11-30",
  actorUserId,
});
assert.equal(extended?.serviceEndAt, "2026-11-30");
const lifecycleAudit = await memory.listAuditLogs(actorUserId, { tenantId: result.account.id, limit: 20 });
assert.ok(lifecycleAudit.filter((entry) => entry.action === "tenant_subscription_updated").length >= 2);

let providerCalls = 0;
const generated = await admin.generateSupabaseInvitationLink(
  { email: "tester@example.test", origin: "https://app.example.test" },
  {
    generateLink: async (params) => {
      providerCalls += 1;
      assert.equal(params.type, "invite");
      assert.equal(params.email, "tester@example.test");
      assert.equal(params.options?.redirectTo, "https://app.example.test/auth/confirm?next=%2Freset-password");
      return {
        data: {
          properties: {
            action_link: "https://provider.example.test/action-link",
            email_otp: "synthetic-otp-marker",
            hashed_token: "synthetic-hashed-provider-marker",
            redirect_to: params.options?.redirectTo ?? "",
            verification_type: "invite",
          },
          user: { id: "provider-user-marker", email: "tester@example.test" },
        },
        error: null,
      };
    },
  },
);
assert.equal(providerCalls, 1);
assert.equal(generated.providerInvitationId, "provider-user-marker");
const generatedUrl = new URL(generated.invitationUrl);
const generatedFragment = new URLSearchParams(generatedUrl.hash.slice(1));
assert.equal(generatedUrl.origin, "https://app.example.test");
assert.equal(generatedUrl.pathname, "/auth/invite");
assert.equal(generatedUrl.search, "");
assert.equal(generatedFragment.get("type"), "invite");
assert.equal(generatedFragment.get("token_hash"), "synthetic-hashed-provider-marker");
assert.equal(generated.linkExpiry, "provider_defined_or_unknown");

assert.equal(admin.normalizeFixedOrigin("https://app.example.test"), "https://app.example.test");
assert.throws(() => admin.normalizeFixedOrigin("https://app.example.test/base"), /supabase_invitation_origin_invalid/);

await assert.rejects(
  admin.generateSupabaseInvitationLink(
    { email: "tester@example.test", origin: "https://app.example.test" },
    {
      generateLink: async () => ({
        data: {
          properties: {
            action_link: "https://provider.example.test/action-link",
            email_otp: "synthetic-otp-marker",
            hashed_token: "synthetic-hashed-provider-marker",
            redirect_to: "https://app.example.test/auth/confirm?next=%2Freset-password",
            verification_type: "magiclink",
          },
          user: { id: "provider-user-marker", email: "other@example.test" },
        },
        error: null,
      }),
    },
  ),
  /supabase_invitation_user_mismatch/,
);

console.log("closed beta access offline checks passed (atomic duplicate guard, Server Action/FormData slug boundary, synthetic one-time response, lifecycle audit, provider-link validation)");
