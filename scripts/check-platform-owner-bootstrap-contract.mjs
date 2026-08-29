#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const bootstrapPath = path.resolve("scripts/bootstrap-initial-platform-owner.mjs");
const source = fs.readFileSync(bootstrapPath, "utf8");

function assertSourceContract(candidate) {
  assert.match(candidate, /export async function bootstrapInitialPlatformOwner/);
  assert.match(candidate, /export function buildPoolConfig/);
  assert.match(candidate, /export function assertNoPgEnvironment/);
  assert.match(candidate, /FIXED_STAGING_TARGET_FINGERPRINT = "aaf14cc84744d48e626ff90cea8e67be03707f73a55b6368e545a0b094ab545a"/);
  assert.match(candidate, /export async function main/);
  const poolRunnerStart = candidate.indexOf("export async function runBootstrapWithPool");
  const poolRunnerEnd = candidate.indexOf("export async function main", poolRunnerStart);
  const poolRunnerSource = poolRunnerStart >= 0 && poolRunnerEnd > poolRunnerStart ? candidate.slice(poolRunnerStart, poolRunnerEnd) : "";
  assert.match(poolRunnerSource, /pool = new Pool\(poolConfig\)/);
  assert.match(poolRunnerSource, /client = await pool\.connect\(\)/);
  assert.match(poolRunnerSource, /bootstrapInitialPlatformOwner\(\{\s*client,/);
  assert.match(poolRunnerSource, /client\.release\(\)/);
  assert.match(poolRunnerSource, /await pool\.end\(\)/);
  assert.match(candidate, /deploymentEnvironment !== "staging" \|\| vercelEnvironment !== "preview"/);
  assert.match(candidate, /unsupported or repeated database connection option/);
  assert.match(candidate, /targetFingerprint/);
  assert.match(candidate, /ssl: \{ rejectUnauthorized: true \}/);
  assert.match(candidate, /max: 1(?:,|\n)/);
  assert.match(candidate, /options: "-c search_path=pg_catalog,public"/);
  assert.match(candidate, /replication: "false"/);
  assert.match(candidate, /application_name: "broker-desk-platform-owner-bootstrap"/);
  assert.match(candidate, /!parsed\.host \|\| !parsed\.user \|\| !parsed\.password \|\| !parsed\.database/);
  assert.match(candidate, /public\.users/);
  assert.match(candidate, /public\.tenant_memberships/);
  assert.match(candidate, /public\.tenants/);
  assert.match(candidate, /public\.audit_logs/);
  assert.match(candidate, /pg_catalog\.pg_roles/);
  assert.match(candidate, /enableChannelBinding/);
  assert(!candidate.includes("connectionString:"), "Pool must not receive the raw connection URL");
  assert(!candidate.includes("DATABASE_DEVELOPMENT_URL"), "bootstrap CLI must accept only DATABASE_MIGRATION_URL");
  assert.match(candidate, /audit_force_rls/);
  assert.match(candidate, /audit_rls/);
  assert.match(candidate, /rolsuper/);
  assert.match(candidate, /rolbypassrls/);
  assert.match(candidate, /authorityResult\.rows\.length !== 1\s*\|\| authority\.audit_rls !== true\s*\|\| authority\.audit_force_rls !== true\s*\|\| \(authority\.rolsuper !== true && authority\.rolbypassrls !== true\)/);
  assert.match(candidate, /BEGIN/);
  assert.match(candidate, /COMMIT/);
  assert.match(candidate, /ROLLBACK/);
  assert.match(candidate, /bootstrap:advisory-lock/);
  assert.match(candidate, /bootstrap:identity-tables-lock/);
  assert.match(candidate, /LOCK TABLE public\.users, public\.tenant_memberships IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(candidate, /bootstrap:resolve-user/);
  assert.match(candidate, /ORDER BY created_at DESC, id ASC/);
  assert.match(candidate, /LIMIT 2/);
  assert.match(candidate, /bootstrap:active-owner-lock/);
  assert.match(candidate, /ORDER BY tenant_id ASC, id ASC/);
  assert.match(candidate, /bootstrap:tenant-lock/);
  assert.match(candidate, /SELECT id, name, slug, account_type FROM public\.tenants/);
  assert.match(candidate, /isExactInternalTenant/);
  assert.match(candidate, /fixed bootstrap tenant id collision/);
  assert.match(candidate, /if \(!isExactInternalTenant\(tenantResult\.rows\[0\]\)\) \{\s*throw new Error\("fixed bootstrap tenant id collision"\);\s*\}/);
  assert.match(candidate, /bootstrap:target-membership-lock/);
  assert.match(candidate, /tenant_id = \$1 AND user_id = \$2/);
  assert.match(candidate, /bootstrap:fixed-membership-lock/);
  assert.match(candidate, /fixed membership id collision/);
  assert.match(candidate, /UPDATE public\.tenant_memberships[\s\S]*WHERE id = \$2/);
  assert.match(candidate, /INSERT INTO public\.tenant_memberships/);
  assert.match(candidate, /bootstrap:audit-lock/);
  assert.match(candidate, /bootstrap:audit-insert/);
  assert.match(candidate, /platform\.bootstrap/);
  assert.match(candidate, /BOOTSTRAP_AUDIT_MESSAGE/);
  assert.match(candidate, /contextKeys\.length === 2/);
  assert.match(candidate, /audit\.message === BOOTSTRAP_AUDIT_MESSAGE/);
  assert.match(candidate, /context\.source === BOOTSTRAP_AUDIT_CONTEXT\.source/);
  assert.match(candidate, /context\.mode === BOOTSTRAP_AUDIT_CONTEXT\.mode/);
  assert(!candidate.includes("ON CONFLICT (tenant_id, user_id)"), "bootstrap must not assume the tenant/user unique target exists");
  const begin = candidate.indexOf('query("BEGIN")');
  const advisory = candidate.indexOf("bootstrap:advisory-lock", begin);
  const membershipTableLock = candidate.indexOf("bootstrap:identity-tables-lock", advisory);
  const user = candidate.indexOf("bootstrap:resolve-user", membershipTableLock);
  const activeOwner = candidate.indexOf("bootstrap:active-owner-lock", user);
  const tenant = candidate.indexOf("bootstrap:tenant-lock", activeOwner);
  const targetMembership = candidate.indexOf("bootstrap:target-membership-lock", tenant);
  const fixedMembership = candidate.indexOf("bootstrap:fixed-membership-lock", targetMembership);
  const membershipWrite = Math.min(
    ...[candidate.indexOf("bootstrap:membership-insert", fixedMembership), candidate.indexOf("bootstrap:membership-update", fixedMembership)].filter((index) => index >= 0),
  );
  const auditLock = candidate.indexOf("bootstrap:audit-lock", membershipWrite);
  const auditInsert = candidate.indexOf("bootstrap:audit-insert", auditLock);
  const commit = candidate.indexOf('query("COMMIT")', auditLock);
  assert(begin >= 0 && advisory > begin && membershipTableLock > advisory && user > membershipTableLock && activeOwner > user && tenant > activeOwner && targetMembership > tenant && fixedMembership > targetMembership && membershipWrite > fixedMembership && auditLock > membershipWrite && auditInsert > auditLock && commit > auditLock, "bootstrap must preserve transaction and deterministic lock/write order");
  const poolCreate = candidate.indexOf("pool = new Pool(poolConfig)");
  const poolConnect = candidate.indexOf("client = await pool.connect()", poolCreate);
  const bootstrapCall = candidate.indexOf("bootstrapInitialPlatformOwner({", poolConnect);
  const release = candidate.indexOf("client.release()", bootstrapCall);
  const poolEnd = candidate.indexOf("await pool.end()", release);
  assert(poolCreate >= 0 && poolConnect > poolCreate && bootstrapCall > poolConnect && release > bootstrapCall && poolEnd > release, "CLI must acquire one PoolClient, pass it to bootstrap, release it, then end the Pool");
}

function assertMutationRejected(candidate, label) {
  assert.throws(() => assertSourceContract(candidate), undefined, `${label} mutation must fail`);
}

assertSourceContract(source);
assertMutationRejected(source.replace('await client.query("BEGIN")', 'await client.query("SELECT 1")'), "transaction begin");
assertMutationRejected(source.replace("/* bootstrap:advisory-lock */", "/* mutation */"), "advisory lock");
assertMutationRejected(source.replace("LOCK TABLE public.users, public.tenant_memberships IN SHARE ROW EXCLUSIVE MODE", "LOCK TABLE public.tenant_memberships IN SHARE ROW EXCLUSIVE MODE"), "users candidate lock");
assertMutationRejected(source.replace("LOCK TABLE public.users, public.tenant_memberships IN SHARE ROW EXCLUSIVE MODE", "LOCK TABLE public.tenant_memberships, public.users IN SHARE ROW EXCLUSIVE MODE"), "identity lock order");
assertMutationRejected(source.replace("ORDER BY tenant_id ASC, id ASC", "LIMIT 1"), "active-owner deterministic lock");
assertMutationRejected(source.replace("authorityResult.rows.length !== 1", "false"), "authority row count");
assertMutationRejected(source.replace("authority.audit_rls !== true", "false"), "audit RLS authority");
assertMutationRejected(source.replace("authority.audit_force_rls !== true", "false"), "audit FORCE RLS authority");
assertMutationRejected(source.replace("authority.rolsuper !== true && authority.rolbypassrls !== true", "authority.rolsuper !== true || authority.rolbypassrls !== true"), "super or bypass authority");
assertMutationRejected(source.replace("tenant_id = $1 AND user_id = $2", "tenant_id = $1"), "target membership identity");
assertMutationRejected(source.replace("WHERE id = $2", "WHERE tenant_id = $2"), "actual membership id update");
assertMutationRejected(source.replace("fixed membership id collision", "membership collision"), "fixed id collision");
assertMutationRejected(source.replace("if (!isExactInternalTenant(tenantResult.rows[0]))", "if (false)"), "fixed tenant identity guard removal");
assertMutationRejected(source.replace("if (!isExactInternalTenant(tenantResult.rows[0]))", "if (isExactInternalTenant(tenantResult.rows[0]))"), "fixed tenant identity guard inversion");
assertMutationRejected(source.replace("/* bootstrap:audit-insert */", "/* mutation */"), "atomic audit");
assertMutationRejected(source.replace("audit.message === BOOTSTRAP_AUDIT_MESSAGE", "true"), "audit message identity");
assertMutationRejected(source.replace("contextKeys.length === 2", "contextKeys.length >= 0"), "audit context key count");
assertMutationRejected(source.replace("context.source === BOOTSTRAP_AUDIT_CONTEXT.source", "true"), "audit context source");
assertMutationRejected(source.replace("context.mode === BOOTSTRAP_AUDIT_CONTEXT.mode", "true"), "audit context mode");
assertMutationRejected(`${source}\n-- ON CONFLICT (tenant_id, user_id)`, "nonexistent conflict target assumption");
assertMutationRejected(source.replace("client = await pool.connect()", "client = pool"), "PoolClient connect");
assertMutationRejected(source.replace("bootstrapInitialPlatformOwner({\n        client,", "bootstrapInitialPlatformOwner({\n        pool,"), "passing Pool instead of PoolClient");
assertMutationRejected(source.replace("client.release()", "void client"), "PoolClient release");
assertMutationRejected(source.replace("await pool.end()", "void pool"), "Pool end");
assertMutationRejected(source.replace('vercelEnvironment !== "preview"', 'vercelEnvironment === "production"'), "exact Preview environment");
assertMutationRejected(source.replace("aaf14cc84744d48e626ff90cea8e67be03707f73a55b6368e545a0b094ab545a", "0".repeat(64)), "fixed staging target fingerprint");
assertMutationRejected(source.replace("ssl: { rejectUnauthorized: true }", "ssl: true"), "verified TLS");
assertMutationRejected(source.replace("max: 1", "max: 10"), "single database connection");
assertMutationRejected(`${source}\nconst legacy = process.env.DATABASE_DEVELOPMENT_URL;`, "legacy development URL");
assertMutationRejected(`${source}\nconst leaked = { connectionString: databaseUrl };`, "raw URL Pool fallback");
assertMutationRejected(source.replace("export function assertNoPgEnvironment", "function removedPgEnvironmentGuard"), "PG environment guard");
assertMutationRejected(source.replace('options: "-c search_path=pg_catalog,public"', 'options: ""'), "fixed search path option");
assertMutationRejected(source.replace("public.users", "users"), "users schema qualifier");
assertMutationRejected(source.replace("public.tenant_memberships", "tenant_memberships"), "membership schema qualifier");
assertMutationRejected(source.replace("!parsed.password", "false"), "required URL password");

const { bootstrapInitialPlatformOwner, assertNoPgEnvironment, buildPoolConfig, main, runBootstrapWithPool } = await import(`../scripts/bootstrap-initial-platform-owner.mjs?contract=${Date.now()}`);

const clone = (value) => structuredClone(value);
class FakeClient {
  constructor(state, { failTag, failStatement, authorityRows } = {}) {
    this.state = clone(state);
    this.snapshot = null;
    this.failTag = failTag;
    this.failStatement = failStatement;
    this.authorityRows = authorityRows ?? [{ rolsuper: true, rolbypassrls: false, audit_rls: true, audit_force_rls: true }];
    this.calls = [];
    this.releaseCount = 0;
  }

  release() {
    this.releaseCount += 1;
  }

  async query(text, params = []) {
    const normalized = String(text).replace(/\s+/g, " ").trim();
    this.calls.push(normalized);
    if (this.failStatement === normalized) throw new Error(`injected ${normalized} failure`);
    if (this.failTag && normalized.includes(`bootstrap:${this.failTag}`)) throw new Error(`injected ${this.failTag} failure`);
    if (normalized === "BEGIN") {
      this.snapshot = clone(this.state);
      return { rows: [], rowCount: 0 };
    }
    if (normalized === "COMMIT") {
      this.snapshot = null;
      return { rows: [], rowCount: 0 };
    }
    if (normalized === "ROLLBACK") {
      if (this.snapshot) this.state = this.snapshot;
      this.snapshot = null;
      return { rows: [], rowCount: 0 };
    }
    if (normalized.includes("bootstrap:connection-authority")) {
      return { rows: clone(this.authorityRows), rowCount: this.authorityRows.length };
    }
    if (normalized.includes("bootstrap:advisory-lock")) return { rows: [{ pg_advisory_xact_lock: null }], rowCount: 1 };
    if (normalized.includes("bootstrap:identity-tables-lock")) return { rows: [], rowCount: 0 };
    if (normalized.includes("bootstrap:resolve-user")) {
      const users = this.state.users
        .filter((user) => user.external_auth_subject && !user.email.endsWith("@brokerdesk.local"))
        .filter((user) => params.length === 0 || user.email.toLowerCase() === String(params[0]).toLowerCase())
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
        .slice(0, 2);
      return { rows: clone(users), rowCount: users.length };
    }
    if (normalized.includes("bootstrap:active-owner-lock")) {
      const rows = this.state.memberships.filter((item) => item.role === "platform_owner" && item.status === "active").sort((a, b) => a.tenant_id.localeCompare(b.tenant_id) || a.id.localeCompare(b.id));
      return { rows: clone(rows), rowCount: rows.length };
    }
    if (normalized.includes("bootstrap:tenant-lock")) {
      const rows = this.state.tenants.filter((item) => item.id === params[0]);
      return { rows: clone(rows), rowCount: rows.length };
    }
    if (normalized.includes("bootstrap:tenant-insert")) {
      this.state.tenants.push({ id: params[0], name: params[1], slug: params[2], account_type: "company", status: "active" });
      return { rows: [], rowCount: 1 };
    }
    if (normalized.includes("bootstrap:tenant-update")) {
      const tenant = this.state.tenants.find((item) => item.id === params[0]);
      tenant.status = "active";
      return { rows: [], rowCount: 1 };
    }
    if (normalized.includes("bootstrap:target-membership-lock")) {
      const rows = this.state.memberships.filter((item) => item.tenant_id === params[0] && item.user_id === params[1]).sort((a, b) => a.id.localeCompare(b.id));
      return { rows: clone(rows), rowCount: rows.length };
    }
    if (normalized.includes("bootstrap:fixed-membership-lock")) {
      const rows = this.state.memberships.filter((item) => item.id === params[0]);
      return { rows: clone(rows), rowCount: rows.length };
    }
    if (normalized.includes("bootstrap:membership-insert")) {
      this.state.memberships.push({ id: params[0], tenant_id: params[1], user_id: params[2], role: "platform_owner", status: "active", invitation_provider: "manual", invitation_status: "accepted" });
      return { rows: [], rowCount: 1 };
    }
    if (normalized.includes("bootstrap:membership-update")) {
      const membership = this.state.memberships.find((item) => item.id === params[1]);
      Object.assign(membership, { role: "platform_owner", status: "active", invitation_provider: "manual", invitation_status: "accepted" });
      return { rows: [], rowCount: membership ? 1 : 0 };
    }
    if (normalized.includes("bootstrap:audit-lock")) {
      const rows = this.state.audits.filter((item) => item.id === params[0]);
      return { rows: clone(rows), rowCount: rows.length };
    }
    if (normalized.includes("bootstrap:audit-insert")) {
      this.state.audits.push({ id: params[0], tenant_id: params[1], user_id: params[2], actor_id: params[2], action: "platform.bootstrap", target_type: "tenant_membership", target_id: params[3], message: params[4], context_json: JSON.parse(params[5]) });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`unhandled fake query: ${normalized}`);
  }
}

class FakePool {
  static next;

  constructor(config) {
    const setup = FakePool.next;
    this.config = config;
    this.client = setup.client;
    this.connectError = setup.connectError;
    this.endError = setup.endError;
    this.connectCount = 0;
    this.endCount = 0;
    setup.instance = this;
  }

  async connect() {
    this.connectCount += 1;
    if (this.connectError) throw this.connectError;
    return this.client;
  }

  async end() {
    this.endCount += 1;
    if (this.endError) throw this.endError;
  }
}

const baseUser = { id: "user_clerk", email: "owner@example.test", external_auth_subject: "user_clerk_subject", created_at: "2026-08-28T00:00:00.000Z" };
const emptyState = () => ({ users: [baseUser], tenants: [], memberships: [], audits: [] });
const run = (client, options = {}) => bootstrapInitialPlatformOwner({ client, email: "owner@example.test", deploymentEnvironment: "staging", vercelEnvironment: "preview", ...options });

const rejectedAuthorities = [
  [],
  [{ rolsuper: true, rolbypassrls: false, audit_rls: false, audit_force_rls: true }],
  [{ rolsuper: true, rolbypassrls: false, audit_rls: true, audit_force_rls: false }],
  [{ rolsuper: false, rolbypassrls: false, audit_rls: true, audit_force_rls: true }],
];
for (const authorityRows of rejectedAuthorities) {
  const authorityState = emptyState();
  const rejectedAuthority = new FakeClient(authorityState, { authorityRows });
  await assert.rejects(run(rejectedAuthority), /privileged migration\/admin connection/);
  assert.deepEqual(rejectedAuthority.state, authorityState, "authority rejection must preserve the entire database state");
  assert.equal(rejectedAuthority.calls.some((call) => call.includes("bootstrap:resolve-user")), false, "authority rejection must occur before user resolution");
  assert.equal(rejectedAuthority.calls.some((call) => /bootstrap:(tenant|target-membership|fixed-membership|membership-|audit-)/.test(call)), false, "authority rejection must not access tenant, membership, or audit business data");
}

const bypassAuthority = new FakeClient(emptyState(), { authorityRows: [{ rolsuper: false, rolbypassrls: true, audit_rls: true, audit_force_rls: true }] });
await run(bypassAuthority);
assert.equal(bypassAuthority.state.audits.length, 1, "FORCE RLS plus explicit BYPASSRLS must authorize bootstrap");

const initial = new FakeClient(emptyState());
const created = await run(initial);
assert.equal(created.membershipId, "membership_broker_desk_platform_owner");
assert.equal(initial.state.tenants.length, 1);
assert.equal(initial.state.memberships.length, 1);
assert.equal(initial.state.audits.length, 1);
await run(initial);
assert.equal(initial.state.tenants.length, 1, "repeat must not duplicate tenant");
assert.equal(initial.state.memberships.length, 1, "repeat must not duplicate membership");
assert.equal(initial.state.audits.length, 1, "repeat must audit exactly once");
assert.equal(initial.state.audits[0].message, "Initial platform owner bootstrap completed");
assert.deepEqual(initial.state.audits[0].context_json, { source: "scripts/bootstrap-initial-platform-owner.mjs", mode: "controlled-nonproduction" });

const exactAuditState = clone(initial.state);
const exactAuditRepeat = new FakeClient(exactAuditState);
await run(exactAuditRepeat);
assert.deepEqual(exactAuditRepeat.state, exactAuditState, "an exact existing bootstrap audit must be idempotent");

const auditMutations = [
  ["tenant_id", "wrong_tenant"], ["user_id", "wrong_user"], ["actor_id", "wrong_actor"],
  ["action", "wrong.action"], ["target_type", "wrong_target_type"], ["target_id", "wrong_target"],
  ["message", "wrong message"],
];
for (const [field, value] of auditMutations) {
  const collisionState = clone(exactAuditState);
  collisionState.audits[0][field] = value;
  const collisionClient = new FakeClient(collisionState);
  await assert.rejects(run(collisionClient), /fixed bootstrap audit id collision/);
  assert.deepEqual(collisionClient.state, collisionState, `wrong audit ${field} must rollback the entire transaction`);
}
for (const context_json of [null, [], {}, { source: "wrong", mode: "controlled-nonproduction" }, { source: "scripts/bootstrap-initial-platform-owner.mjs", mode: "wrong" }, { source: "scripts/bootstrap-initial-platform-owner.mjs", mode: "controlled-nonproduction", extra: true }]) {
  const collisionState = clone(exactAuditState);
  collisionState.audits[0].context_json = context_json;
  const collisionClient = new FakeClient(collisionState);
  await assert.rejects(run(collisionClient), /fixed bootstrap audit id collision/);
  assert.deepEqual(collisionClient.state, collisionState, "non-exact audit context must rollback the entire transaction");
}

const validInternalTenant = { id: "tenant_broker_desk_internal", name: "Broker Desk 内部工作区", slug: "broker-desk-internal", account_type: "company", status: "active" };
const existingMembership = new FakeClient({ users: [baseUser], tenants: [validInternalTenant], memberships: [{ id: "membership_actual_existing", tenant_id: "tenant_broker_desk_internal", user_id: baseUser.id, role: "broker", status: "active" }], audits: [] });
const updated = await run(existingMembership);
assert.equal(updated.membershipId, "membership_actual_existing");
assert.equal(existingMembership.state.memberships[0].role, "platform_owner");
assert.equal(existingMembership.state.memberships.some((item) => item.id === "membership_broker_desk_platform_owner"), false, "existing membership must update by its real id");

for (const [field, value] of [["name", "Wrong Internal Name"], ["slug", "wrong-internal-slug"], ["account_type", "individual"]]) {
  const collisionState = { users: [baseUser], tenants: [{ ...validInternalTenant, [field]: value, status: "suspended" }], memberships: [], audits: [] };
  const tenantCollision = new FakeClient(collisionState);
  await assert.rejects(run(tenantCollision), /fixed bootstrap tenant id collision/);
  assert.deepEqual(tenantCollision.state, collisionState, `wrong tenant ${field} must reject with zero state change`);
}

const collisionState = { users: [baseUser, { ...baseUser, id: "other_user", email: "other@example.test" }], tenants: [{ id: "tenant_other", status: "active" }], memberships: [{ id: "membership_broker_desk_platform_owner", tenant_id: "tenant_other", user_id: "other_user", role: "broker", status: "active" }], audits: [] };
const collision = new FakeClient(collisionState);
await assert.rejects(run(collision), /fixed membership id collision/);
assert.deepEqual(collision.state, collisionState, "fixed-id collision must rollback every change");

const auditFailure = new FakeClient(emptyState(), { failTag: "audit-insert" });
await assert.rejects(run(auditFailure), /injected audit-insert failure/);
assert.deepEqual(auditFailure.state, emptyState(), "audit failure must rollback tenant, membership, and audit");

const otherOwnerState = { users: [baseUser, { ...baseUser, id: "other_user", email: "other@example.test" }], tenants: [{ id: "tenant_other", status: "active" }], memberships: [{ id: "membership_other_owner", tenant_id: "tenant_other", user_id: "other_user", role: "platform_owner", status: "active" }], audits: [] };
const otherOwner = new FakeClient(otherOwnerState);
await assert.rejects(run(otherOwner), /active platform owner already exists/);
assert.deepEqual(otherOwner.state, otherOwnerState, "another active platform owner must close bootstrap with zero writes");

const twoUsers = new FakeClient({ users: [baseUser, { ...baseUser, id: "user_second", email: "second@example.test", created_at: "2026-08-27T00:00:00.000Z" }], tenants: [], memberships: [], audits: [] });
await assert.rejects(bootstrapInitialPlatformOwner({ client: twoUsers, useLatestClerkUser: true, deploymentEnvironment: "staging", vercelEnvironment: "preview" }), /exactly one real Clerk user/);
const duplicateEmail = new FakeClient({ users: [baseUser, { ...baseUser, id: "user_duplicate", created_at: "2026-08-27T00:00:00.000Z" }], tenants: [], memberships: [], audits: [] });
await assert.rejects(run(duplicateEmail), /exactly one existing Clerk user/);
for (const [deploymentEnvironment, vercelEnvironment] of [[undefined, undefined], ["development", "preview"], ["staging", "production"], ["staging", "development"], ["unknown", "preview"], ["staging", "unknown"]]) {
  const rejectedEnvironment = new FakeClient(emptyState());
  await assert.rejects(run(rejectedEnvironment, { deploymentEnvironment, vercelEnvironment }), /fixed Staging Preview environment/);
  assert.deepEqual(rejectedEnvironment.state, emptyState(), "every non-exact environment must reject before writes");
}

const unsafeUrls = [
  "POSTGRES://user:secret@wrong.example.test/db?sslmode=verify-full",
  "postgres://user:secret@wrong.example.test:6432/db?sslmode=verify-full",
  "postgres://user:secret@wrong.example.test/db?host=override.example.test",
  "postgres://user:secret@wrong.example.test/db?sslmode=verify-full&sslmode=require",
  "postgres://user:secret@wrong.example.test/db?SSLMODE=verify-full",
  "postgres://user:secret@wrong.example.test/db?%73slmode=verify-full",
  "postgres://user:secret@wrong.example.test/db?sslmode=verify%2Dfull",
  "postgres://user:secret@wrong.example.test/db?channel_binding=require",
];
for (const unsafeUrl of unsafeUrls) {
  let caught;
  try {
    buildPoolConfig(unsafeUrl);
  } catch (error) {
    caught = error;
  }
  assert(caught, "unsafe database URL must reject");
  for (const secretFragment of ["wrong.example.test", "override.example.test", "user", "secret", "6432", unsafeUrl]) {
    assert(!caught.message.includes(secretFragment), "database validation errors must not leak connection details");
  }
}
assert.throws(
  () => buildPoolConfig("postgresql://user:@wrong.example.test/database?sslmode=verify-full"),
  /incomplete migration database connection target/,
  "an empty URL password must fail before target validation",
);

const { Client: PgClient } = await import("pg");
const explicitConnectionConfig = {
  host: "validated.example.test",
  port: 5432,
  database: "validated_database",
  user: "validated_user",
  password: "validated_password",
  ssl: { rejectUnauthorized: true },
  enableChannelBinding: true,
  options: "-c search_path=pg_catalog,public",
  replication: "false",
  application_name: "broker-desk-platform-owner-bootstrap",
  max: 1,
};
for (const pgKey of ["PGOPTIONS", "PGPASSWORD", "PGREPLICATION", "PGHOST", "PGDATABASE", "PGUSER", "PGPORT", "PGSSLMODE", "PGUNRECOGNIZED_OVERRIDE"]) {
  const hadKey = Object.hasOwn(process.env, pgKey);
  const previousValue = process.env[pgKey];
  try {
    process.env[pgKey] = "attacker-controlled";
    assert.throws(() => assertNoPgEnvironment(), /overrides are forbidden/, `${pgKey} must fail closed before Pool creation`);
    const parameters = new PgClient(explicitConnectionConfig).connectionParameters;
    assert.equal(parameters.host, explicitConnectionConfig.host);
    assert.equal(parameters.port, explicitConnectionConfig.port);
    assert.equal(parameters.database, explicitConnectionConfig.database);
    assert.equal(parameters.user, explicitConnectionConfig.user);
    assert.equal(parameters.password, explicitConnectionConfig.password);
    assert.equal(parameters.options, explicitConnectionConfig.options);
    assert.equal(parameters.replication, explicitConnectionConfig.replication);
    assert.equal(parameters.application_name, explicitConnectionConfig.application_name);
  } finally {
    if (hadKey) process.env[pgKey] = previousValue;
    else delete process.env[pgKey];
  }
}

const orderedTags = initial.calls.filter((call) => call.includes("bootstrap:")).map((call) => call.match(/bootstrap:([a-z-]+)/)?.[1]).filter(Boolean);
assert.deepEqual(orderedTags.slice(0, 10), ["advisory-lock", "identity-tables-lock", "connection-authority", "resolve-user", "active-owner-lock", "tenant-lock", "tenant-insert", "target-membership-lock", "fixed-membership-lock", "membership-insert"]);

class CandidateSetConcurrencyModel {
  constructor(users = []) {
    this.users = clone(users);
    this.locked = false;
  }
  acquireBootstrapIdentityLock() {
    this.locked = true;
  }
  tryConcurrentEligibleInsert(user) {
    if (this.locked) return "blocked";
    this.users.push(clone(user));
    return "inserted";
  }
}

const explicitCandidateRace = new CandidateSetConcurrencyModel([baseUser]);
assert.equal(explicitCandidateRace.tryConcurrentEligibleInsert({ ...baseUser, id: "duplicate_before_lock" }), "inserted", "a pre-lock insert can change the candidate set");
explicitCandidateRace.acquireBootstrapIdentityLock();
assert.equal(explicitCandidateRace.tryConcurrentEligibleInsert({ ...baseUser, id: "duplicate_after_lock" }), "blocked", "the joint identity lock must block an explicit-email duplicate insert");

const latestCandidateRace = new CandidateSetConcurrencyModel([baseUser]);
latestCandidateRace.acquireBootstrapIdentityLock();
assert.equal(latestCandidateRace.tryConcurrentEligibleInsert({ ...baseUser, id: "new_latest_after_lock", created_at: "2026-08-29T00:00:00.000Z" }), "blocked", "the joint identity lock must block a new latest eligible user");

async function runMainWithFakePool(client, poolOverrides = {}) {
  const setup = { client, ...poolOverrides };
  FakePool.next = setup;
  const invocation = runBootstrapWithPool({
    Pool: FakePool,
    poolConfig: explicitConnectionConfig,
    email: "owner@example.test",
    useLatestClerkUser: false,
    deploymentEnvironment: "staging",
    vercelEnvironment: "preview",
    log: () => {},
  });
  return { invocation, setup };
}

const cliSuccessClient = new FakeClient(emptyState());
const cliSuccess = await runMainWithFakePool(cliSuccessClient);
await cliSuccess.invocation;
assert.deepEqual(cliSuccess.setup.instance.config, explicitConnectionConfig);
assert.equal("connectionString" in cliSuccess.setup.instance.config, false, "Pool must never receive a raw URL");
assert.equal(cliSuccess.setup.instance.connectCount, 1);
assert.equal(cliSuccessClient.releaseCount, 1);
assert.equal(cliSuccess.setup.instance.endCount, 1);

const cliBusinessClient = new FakeClient(otherOwnerState);
const cliBusiness = await runMainWithFakePool(cliBusinessClient);
await assert.rejects(cliBusiness.invocation, /failed safely/);
assert.equal(cliBusinessClient.releaseCount, 1, "business failure must release PoolClient exactly once");
assert.equal(cliBusiness.setup.instance.endCount, 1, "business failure must end Pool exactly once");

const cliCommitClient = new FakeClient(emptyState(), { failStatement: "COMMIT" });
const cliCommit = await runMainWithFakePool(cliCommitClient);
await assert.rejects(cliCommit.invocation, /failed safely/);
assert.equal(cliCommitClient.releaseCount, 1, "COMMIT failure must release PoolClient exactly once");
assert.equal(cliCommit.setup.instance.endCount, 1, "COMMIT failure must end Pool exactly once");

const cliRollbackClient = new FakeClient(emptyState(), { failTag: "audit-insert", failStatement: "ROLLBACK" });
const cliRollback = await runMainWithFakePool(cliRollbackClient);
await assert.rejects(cliRollback.invocation, /failed safely/, "ROLLBACK failure must remain safely redacted");
assert.equal(cliRollbackClient.releaseCount, 1, "ROLLBACK failure must release PoolClient exactly once");
assert.equal(cliRollback.setup.instance.endCount, 1, "ROLLBACK failure must end Pool exactly once");

const rawLeakSample = "postgres://leaky_user:leaky_password@leaky.example.test:6432/leaky_database";
const connectSetup = { client: new FakeClient(emptyState()), connectError: new Error(rawLeakSample) };
FakePool.next = connectSetup;
let safeConnectError;
try {
  await runBootstrapWithPool({ Pool: FakePool, poolConfig: explicitConnectionConfig, email: "owner@example.test", deploymentEnvironment: "staging", vercelEnvironment: "preview", log: () => {} });
} catch (error) {
  safeConnectError = error;
}
assert.match(safeConnectError?.message ?? "", /failed safely/);
assert(!safeConnectError.message.includes(rawLeakSample), "driver errors must never leak raw connection details");
assert.equal(connectSetup.client.releaseCount, 0, "connect failure has no PoolClient to release");
assert.equal(connectSetup.instance.endCount, 1, "connect failure must still end Pool exactly once");

FakePool.next = { client: new FakeClient(emptyState()) };
await assert.rejects(main({ Pool: FakePool, databaseUrl: "postgres://user:secret@wrong.example.test/db?sslmode=verify-full", email: "owner@example.test", deploymentEnvironment: "staging", vercelEnvironment: "preview", log: () => {} }), /fixed Staging target/);
assert.equal(FakePool.next.instance, undefined, "wrong target must reject before Pool construction");

console.log("[PASS] controlled initial platform-owner bootstrap contract and fake-driver scenarios");
