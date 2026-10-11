#!/usr/bin/env node

import assert from "node:assert/strict";
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const closedBetaMigration = fs.readFileSync(path.resolve(ROOT, "db/migrations/20261008_001_closed_beta_atomic_provisioning.sql"), "utf8");
assert.match(closedBetaMigration, /SECURITY DEFINER[\s\S]+SET search_path = public, pg_temp/);
assert.match(closedBetaMigration, /CREATE OR REPLACE FUNCTION brokerdesk_private\.create_closed_beta_tenant_account/);
assert.doesNotMatch(closedBetaMigration, /reset_closed_beta_demo_data|closed_beta_demo_fixture_guard_failed/);

function resolveAlias(request) {
  const relative = request.startsWith("@/lib/") ? request.slice(6) : request.slice(2);
  const base = request.startsWith("@/lib/") ? path.resolve(ROOT, "src/lib") : path.resolve(ROOT, "src");
  const extensions = /\.(?:ts|tsx|mjs|js|cjs)$/.test(relative) ? [""] : [".ts", ".tsx", ".mjs", ".js", ".cjs"];
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
    return originalRequire(request);
  };
  mod._compile(output, absolutePath);
  return mod.exports;
}

process.env.NODE_ENV = "development";
process.env.BROKER_DESK_AUTH_MODE = "demo";
delete process.env.DATA_DRIVER;
delete process.env.DATABASE_URL;

const memory = loadTs("src/lib/data.memory.ts");
const fixture = loadTs("src/lib/closed-beta-demo-fixture.ts");
const data = loadTs("src/lib/data.ts");
const postgresSource = fs.readFileSync(path.resolve(ROOT, "src/lib/data.postgres.ts"), "utf8");
const homeSource = fs.readFileSync(path.resolve(ROOT, "src/app/page.tsx"), "utf8");
assert.match(postgresSource, /pg_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/);
assert.ok(postgresSource.indexOf("pg_advisory_xact_lock") < postgresSource.indexOf("readClosedBetaDemoState(client, tenantId, fixture)"));
assert.doesNotMatch(postgresSource, /resetClosedBetaDemoData|reset_closed_beta_demo_data/);
assert.match(homeSource, /seedClosedBetaDemoData\(\{ tenantId: session\.tenant\.id, userId: session\.user\.id \}\)/);
const actorUserId = "user_demo";
const now = new Date();
if (!globalThis.__brokerDb.tenantMemberships.some((item) => item.userId === actorUserId && item.role === "platform_owner" && item.status === "active")) {
  globalThis.__brokerDb.tenantMemberships.push({
    id: "membership_closed_beta_demo_test_platform_owner",
    tenantId: "tenant_cherry",
    userId: actorUserId,
    role: "platform_owner",
    capability: "ordinary_member",
    status: "active",
    invitationProvider: "manual",
    invitationStatus: "accepted",
    invitationAcceptedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

async function createAcceptedClosedBetaAccount(suffix) {
  const account = await memory.createClosedBetaTenantAccount({
    name: `Local closed beta ${suffix}`,
    slug: `local-closed-beta-${suffix}`,
    accountType: "company",
    status: "active",
    purchasedSeatCount: 1,
    actorUserId,
    ownerName: `Synthetic Tester ${suffix}`,
    ownerEmail: `synthetic-closed-beta-${suffix}-${Date.now()}@example.test`,
  });
  const owner = account.ownerMembers[0];
  const membership = globalThis.__brokerDb.tenantMemberships.find((item) => item.id === owner.id);
  assert.ok(membership);
  membership.status = "active";
  membership.invitationStatus = "accepted";
  membership.invitationAcceptedAt = new Date();
  return { account, userId: owner.user.id };
}

const first = await createAcceptedClosedBetaAccount("one");
const firstFixture = fixture.buildClosedBetaDemoFixture(first.account.id);
memory.__failNextClosedBetaDemoSeedForTest();
await assert.rejects(
  memory.seedClosedBetaDemoData({ tenantId: first.account.id, userId: first.userId }),
  /closed_beta_demo_injected_failure/,
);
assert.equal(globalThis.__brokerDb.clients.some((item) => item.id === firstFixture.clients[0].id), false);
assert.equal(globalThis.__brokerDb.properties.some((item) => item.id === firstFixture.properties[0].id), false);
assert.equal(globalThis.__brokerDb.brokerageCases.some((item) => item.id === firstFixture.cases[0].id), false);
assert.equal(globalThis.__brokerDb.auditLogs.some((item) => item.tenantId === first.account.id && item.action === "closed_beta_demo_seeded"), false);
const firstSeed = await memory.seedClosedBetaDemoData({ tenantId: first.account.id, userId: first.userId });
assert.equal(firstSeed.status, "seeded");
assert.deepEqual(firstSeed.counts, { clients: 2, properties: 2, cases: 2, tasks: 2, followUps: 2 });
assert.equal(firstFixture.marker, firstSeed.marker);
assert.ok(firstFixture.clients.every((item) => item.name.startsWith("【合成上手】")));
assert.equal(JSON.stringify(firstFixture).includes("李 杰明"), false);

const secondSeed = await memory.seedClosedBetaDemoData({ tenantId: first.account.id, userId: first.userId });
assert.equal(secondSeed.status, "already_initialized");
assert.deepEqual(secondSeed.counts, firstSeed.counts);
assert.equal(globalThis.__brokerDb.clients.filter((item) => item.tenantId === first.account.id).length, 2);

const unrelated = await memory.addClient({
  tenantId: first.account.id,
  ownerUserId: first.userId,
  name: "Synthetic tester-owned unrelated record",
  phone: "00000000099",
  budgetType: "total_price",
  purpose: "self_use",
  loanPreApprovalStatus: "not_applied",
  stage: "lead",
  temperature: "low",
  brokerageContractType: "none",
  amlCheckStatus: "not_required",
});
const second = await createAcceptedClosedBetaAccount("two");
const concurrentResults = await Promise.all([
  memory.seedClosedBetaDemoData({ tenantId: second.account.id, userId: second.userId }),
  memory.seedClosedBetaDemoData({ tenantId: second.account.id, userId: second.userId }),
]);
assert.deepEqual(new Set(concurrentResults.map((result) => result.status)), new Set(["seeded", "already_initialized"]));
assert.equal(globalThis.__brokerDb.clients.filter((item) => item.tenantId === second.account.id).length, 2);
assert.equal(globalThis.__brokerDb.clients.filter((item) => item.tenantId === first.account.id).some((item) => item.id === unrelated.id), true);
assert.equal(globalThis.__brokerDb.clients.filter((item) => item.tenantId === second.account.id).some((item) => item.id === unrelated.id), false);
const partialId = firstFixture.clients[0].id;
globalThis.__brokerDb.clients = globalThis.__brokerDb.clients.filter((item) => item.id !== partialId);
await assert.rejects(
  memory.seedClosedBetaDemoData({ tenantId: first.account.id, userId: first.userId }),
  /closed_beta_demo_partial_state/,
);
const ordinary = await memory.seedClosedBetaDemoData({ tenantId: "tenant_cherry", userId: actorUserId });
assert.equal(ordinary.status, "skipped");
assert.equal(globalThis.__brokerDb.clients.some((item) => item.tenantId === "tenant_cherry" && item.id.startsWith("closed_beta_demo_")), false);

// Invitation acceptance commits the membership only. The first authenticated
// landing performs the separate, retryable seed, so a failed seed never makes
// the invitation impossible to recover.
const inviteFlow = await memory.createClosedBetaTenantAccount({
  name: "Local closed beta invite flow",
  slug: `local-closed-beta-invite-flow-${Date.now()}`,
  accountType: "company",
  status: "active",
  purchasedSeatCount: 1,
  actorUserId,
  ownerName: "Synthetic Invite Tester",
  ownerEmail: `synthetic-invite-flow-${Date.now()}@example.test`,
});
const inviteOwner = inviteFlow.ownerMembers[0];
const prepared = await memory.refreshTenantMemberInvitation({
  tenantId: inviteFlow.id,
  membershipId: inviteOwner.id,
  invitedByUserId: actorUserId,
});
assert.ok(prepared?.member.invitationToken);
const acceptedByFacade = await data.acceptTenantInvitation({
  userId: inviteOwner.user.id,
  tenantId: inviteFlow.id,
  membershipId: inviteOwner.id,
  invitationToken: prepared.member.invitationToken,
});
assert.equal(acceptedByFacade?.status, "active");
assert.equal(globalThis.__brokerDb.clients.filter((item) => item.tenantId === inviteFlow.id).length, 0);
const firstLoginSeed = await data.seedClosedBetaDemoData({ tenantId: inviteFlow.id, userId: inviteOwner.user.id });
assert.equal(firstLoginSeed.status, "seeded");
assert.equal(globalThis.__brokerDb.clients.filter((item) => item.tenantId === inviteFlow.id).length, 2);

console.log("closed beta demo data checks passed (tenant marker, synthetic fixtures, failure rollback/retry, idempotence, concurrent isolation, partial-state refusal, ordinary-tenant no-op, acceptance recovery)");
