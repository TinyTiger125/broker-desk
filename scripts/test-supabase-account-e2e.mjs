import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url);
const source = async (path) => readFile(new URL(path, root), "utf8");
const actions = await source("src/app/actions.ts");
const invitation = await source("src/lib/data.memory.ts");
const route = await source("src/app/auth/callback/route.ts");
const forgot = await source("src/components/supabase-forgot-password-form.tsx");
const reset = await source("src/components/supabase-reset-password-form.tsx");
const tenantSession = await source("src/lib/tenant-session.ts");
const migration = await source("db/migrations/20260921_001_supabase_auth_lifecycle.sql");
const rollback = await source("db/migrations/rollback/20260921_001_supabase_auth_lifecycle.sql");

assert.match(actions, /isSupabaseAuthEnabled\(\)/, "member invitation/status actions must branch for Supabase");
assert.match(actions, /invitationProvider: result\.provider/, "Supabase invitation must finalize through the existing delivery action");
assert.match(actions, /setSupabaseUserDisabled/, "member status action must call the server-only disable/revoke adapter");
assert.match(invitation, /"supabase"/, "memory delivery state must accept Supabase provider");
assert.match(forgot, /resetPasswordForEmail/, "forgot-password must use the public reset request");
assert.match(forgot, /如果邮箱对应有效账户/, "forgot-password must use generic anti-enumeration success");
assert.doesNotMatch(forgot, /actionLink|service.?role/i, "browser reset request must not expose provider links or admin secrets");
assert.match(reset, /auth\.updateUser\(\{ password \}\)/, "recovery landing must update the authenticated password");
assert.match(route, /exchangeCodeForSession/, "callback must exchange the recovery code server-side");
assert.match(route, /startsWith\("\/\/"\)/, "callback must reject protocol-relative redirect targets");
assert.match(tenantSession, /status === "active"/, "business resolver must select only active memberships");
assert.match(migration, /'supabase'/, "unexecuted migration must allow Supabase invitation delivery");
assert.match(migration, /Rollback:/, "migration must carry a rollback note");
assert.match(rollback, /none', 'manual', 'clerk/, "rollback must restore the pre-Supabase provider boundary");

const { resolveExplicitSupabaseUser } = await import("../scripts/bootstrap-initial-supabase-owner.mjs");
const admin = { auth: { admin: { async getUserById(id) { return { data: { user: { id, email: "owner@example.com" } }, error: null }; } } } };
assert.deepEqual(await resolveExplicitSupabaseUser({ admin, userId: "supabase-owner-1", email: "OWNER@example.com" }), { authUserId: "supabase-owner-1", email: "owner@example.com" });
await assert.rejects(() => resolveExplicitSupabaseUser({ admin, userId: "supabase-owner-1", email: "other@example.com" }), /mismatch/);
console.log("Supabase account end-to-end contract: PASS");
