import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url);
const source = async (path) => readFile(new URL(path, root), "utf8");
const actions = await source("src/app/actions.ts");
const invitation = await source("src/lib/data.memory.ts");
const dataFacade = await source("src/lib/data.ts");
const postgres = await source("src/lib/data.postgres.ts");
const route = await source("src/app/auth/callback/route.ts");
const forgot = await source("src/components/supabase-forgot-password-form.tsx");
const reset = await source("src/components/supabase-reset-password-form.tsx");
const adminSource = await source("src/lib/supabase/admin.ts");
const lifecycle = await source("src/lib/supabase/membership-lifecycle.ts");
const tenantSession = await source("src/lib/tenant-session.ts");
const migration = await source("db/migrations/20260921_001_supabase_auth_lifecycle.sql");
const rollback = await source("db/migrations/rollback/20260921_001_supabase_auth_lifecycle.sql");
const supabaseBootstrap = await source("scripts/bootstrap-initial-supabase-owner.mjs");
const runtimeRoles = await source("docs/engineering/postgres_runtime_roles.sql");
const runtimeProvisioner = await source("scripts/provision-postgres-runtime-roles.mjs");

assert.match(actions, /isSupabaseAuthEnabled\(\)/, "member invitation/status actions must branch for Supabase");
assert.match(actions, /invitationProvider: result\.provider/, "Supabase invitation must finalize through the existing delivery action");
assert.match(actions, /persistTenantMembershipStatus/, "member status action must persist local membership state through the lifecycle service");
assert.doesNotMatch(actions, /setSupabaseUserDisabled/, "tenant membership action must not globally ban a user across companies");
assert.match(invitation, /"supabase"/, "memory delivery state must accept Supabase provider");
assert.match(dataFacade, /bindCurrentSupabaseIdentityToPendingInvitation/, "provider facade must bind Supabase invited identities");
assert.match(postgres, /bind_current_supabase_identity_to_pending_invitation/, "PostgreSQL facade must call the Supabase binding function");
assert.match(forgot, /resetPasswordForEmail/, "forgot-password must use the public reset request");
assert.match(forgot, /如果邮箱对应有效账户/, "forgot-password must use generic anti-enumeration success");
assert.doesNotMatch(forgot, /actionLink|service.?role/i, "browser reset request must not expose provider links or admin secrets");
assert.match(reset, /auth\.updateUser\(\{ password \}\)/, "recovery landing must update the authenticated password");
assert.match(adminSource, /signOut\(token, "global"\)/, "global sign-out must receive an access JWT, never a user id");
assert.doesNotMatch(adminSource, /signOut\(normalized/, "admin sign-out must not pass a UUID as JWT");
assert.match(lifecycle, /local_membership_update_failed/, "tenant membership lifecycle must fail closed on local persistence failure");
assert.match(route, /exchangeCodeForSession/, "callback must exchange the recovery code server-side");
assert.match(route, /startsWith\("\/\/"\)/, "callback must reject protocol-relative redirect targets");
assert.match(route, /includes\("\\\\"\)/, "callback must reject backslash redirect targets");
assert.match(tenantSession, /status === "active"/, "business resolver must select only active memberships");
assert.match(migration, /'supabase'/, "unexecuted migration must allow Supabase invitation delivery");
assert.match(migration, /bind_current_supabase_identity_to_pending_invitation/, "migration must define the Supabase pending-invitation binding function");
assert.match(migration, /Rollback:/, "migration must carry a rollback note");
assert.match(rollback, /none', 'manual', 'clerk/, "rollback must restore the pre-Supabase provider boundary");
assert.match(supabaseBootstrap, /BROKER_DESK_SUPABASE_OWNER_BOOTSTRAP_APPROVED/, "Supabase owner bootstrap must require an explicit approval gate");
assert.doesNotMatch(supabaseBootstrap, /process\.loadEnvFile\([^)]*\.env\.local/, "Supabase owner bootstrap must never auto-load the old .env.local");
assert.match(supabaseBootstrap, /DATABASE_MIGRATION_URL/, "Supabase owner bootstrap must use the explicit migration connection");
assert.match(supabaseBootstrap, /DATABASE_MIGRATION_CA_CERT_PATH/, "Supabase owner bootstrap must require the dedicated CA path");
assert.match(supabaseBootstrap, /runSupabaseOwnerPreflight/, "Supabase owner bootstrap must expose a read-only preflight");
assert.match(supabaseBootstrap, /rejectUnauthorized: true/, "Supabase owner bootstrap must keep verified TLS");
assert.match(runtimeRoles, /public\.users,[\s\S]*public\.tenants,[\s\S]*public\.tenant_memberships[\s\S]*TO brokerdesk_runtime/, "runtime roles must retain identity reads");
assert.match(runtimeRoles, /brokerdesk_admin ownership and FORCE RLS/, "runtime roles must fail closed when migration ownership is wrong");
assert.doesNotMatch(runtimeProvisioner, /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES/, "programmatic role provisioner must not grant every table");
assert.match(runtimeProvisioner, /20260902_003_runtime_acl_baseline\.sql/, "programmatic role provisioner must reuse the reviewed ACL baseline");
assert.match(runtimeProvisioner, /GRANT USAGE ON SCHEMA public TO brokerdesk_runtime/, "programmatic role provisioner must retain public schema usage");
assert.match(runtimeProvisioner, /brokerdesk_admin ownership and FORCE RLS/, "programmatic role provisioner must fail closed on migration ownership");

const { resolveExplicitSupabaseUser, bootstrapInitialSupabaseOwner, buildSupabasePoolConfig, SUPABASE_PROJECT_REF, SUPABASE_POOLER_HOST } = await import("../scripts/bootstrap-initial-supabase-owner.mjs");
const admin = { auth: { admin: { async getUserById(id) { return { data: { user: { id, email: "owner@example.com" } }, error: null }; } } } };
const authUserId = "11111111-1111-4111-8111-111111111111";
assert.deepEqual(await resolveExplicitSupabaseUser({ admin, userId: authUserId, email: "OWNER@example.com" }), { authUserId, email: "owner@example.com" });
await assert.rejects(() => resolveExplicitSupabaseUser({ admin, userId: authUserId, email: "other@example.com" }), /mismatch/);
await assert.rejects(
  () => bootstrapInitialSupabaseOwner({ admin, client: { query: async () => ({ rows: [] }) }, userId: authUserId, email: "owner@example.com", explicitApproval: true, deploymentEnvironment: "production", vercelEnvironment: "production" }),
  /fixed Staging Preview environment/,
);

const caPath = process.env.DATABASE_MIGRATION_CA_CERT_PATH ?? "/Users/laineyzhu/Documents/独立开发项目/房产专家/东京环境验证/supabase-prod-ca-2021.crt";
if (existsSync(caPath)) {
  const validDatabaseUrl = `postgresql://postgres.${SUPABASE_PROJECT_REF}:secret@${SUPABASE_POOLER_HOST}:5432/postgres`;
  const config = buildSupabasePoolConfig({
    connectionString: validDatabaseUrl,
    supabaseUrl: `https://${SUPABASE_PROJECT_REF}.supabase.co`,
    caPath,
  });
  assert.equal(config.host, SUPABASE_POOLER_HOST);
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.ok(Buffer.isBuffer(config.ssl.ca), "Tokyo Supabase pool config must carry the pinned CA");
  assert.equal(config.connectionTimeoutMillis, 8_000);
  assert.equal(config.query_timeout, 8_000);
  assert.throws(() => buildSupabasePoolConfig({ connectionString: validDatabaseUrl, supabaseUrl: "https://wrong-project.supabase.co", caPath }), /fixed Tokyo validation project/);
  assert.throws(() => buildSupabasePoolConfig({ connectionString: validDatabaseUrl, supabaseUrl: `https://user:pass@${SUPABASE_PROJECT_REF}.supabase.co`, caPath }), /fixed Tokyo validation project/);
  assert.throws(() => buildSupabasePoolConfig({ connectionString: validDatabaseUrl, supabaseUrl: `https://${SUPABASE_PROJECT_REF}.supabase.co:8443`, caPath }), /fixed Tokyo validation project/);
  assert.throws(() => buildSupabasePoolConfig({ connectionString: `${validDatabaseUrl}?sslmode=require`, supabaseUrl: `https://${SUPABASE_PROJECT_REF}.supabase.co`, caPath }), /fixed Tokyo pooler/);
  assert.throws(() => buildSupabasePoolConfig({ connectionString: validDatabaseUrl.replace(`postgres.${SUPABASE_PROJECT_REF}`, "postgres.otherref"), supabaseUrl: `https://${SUPABASE_PROJECT_REF}.supabase.co`, caPath }), /fixed Tokyo project/);
}
console.log("Supabase account end-to-end contract: PASS");
