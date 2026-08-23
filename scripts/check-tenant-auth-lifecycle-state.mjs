#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const live = process.argv.includes("--live");

if (!live) {
  const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
  if (!source.includes("TASK_AUTH_LIFECYCLE_RUNTIME_URL") || !source.includes("TASK_AUTH_LIFECYCLE_ADMIN_URL") || !source.includes("TASK_AUTH_LIFECYCLE_MIGRATION_URL")) {
    throw new Error("tenant auth lifecycle contract must define explicit TASK_AUTH_LIFECYCLE_* variables");
  }
  const implicitLoader = ["process", "loadEnvFile"].join(".");
  if (source.includes(implicitLoader)) {
    throw new Error("tenant auth lifecycle contract must not load implicit env files or target localhost");
  }
  console.log(
    "[PASS] tenant auth lifecycle contract: live verification requires explicit non-production URLs; use --live with TASK_AUTH_LIFECYCLE_* variables.",
  );
  process.exit(0);
}

const runtimeUrl = (process.env.TASK_AUTH_LIFECYCLE_RUNTIME_URL ?? "").trim();
const adminUrl = (process.env.TASK_AUTH_LIFECYCLE_ADMIN_URL ?? "").trim();
const migrationUrl = (process.env.TASK_AUTH_LIFECYCLE_MIGRATION_URL ?? "").trim();

if (!runtimeUrl || !adminUrl || !migrationUrl) {
  throw new Error(
    "--live requires TASK_AUTH_LIFECYCLE_RUNTIME_URL, TASK_AUTH_LIFECYCLE_ADMIN_URL, and TASK_AUTH_LIFECYCLE_MIGRATION_URL.",
  );
}

for (const [label, value] of [
  ["runtime", runtimeUrl],
  ["admin", adminUrl],
  ["migration", migrationUrl],
]) {
  if (/localhost|127\\.0\\.0\\.1|::1/i.test(value)) {
    throw new Error(`${label} URL must target an explicitly supplied non-production database, not localhost.`);
  }
}

const validRoles = new Set(["platform_owner", "tenant_owner", "tenant_admin", "manager", "broker", "data_operator", "reviewer", "viewer"]);
const validStatuses = new Set(["active", "invited", "suspended", "removed"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function connectRestricted(connectionString, label) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT current_user AS role_name, r.rolsuper, r.rolbypassrls
         FROM pg_roles r
        WHERE r.rolname = current_user`,
    );
    const role = rows[0];
    assert(role, `${label} role could not be resolved`);
    assert(!role.rolsuper, `${label} role ${role.role_name} has SUPERUSER`);
    assert(!role.rolbypassrls, `${label} role ${role.role_name} has BYPASSRLS`);
    return { client, role };
  } catch (error) {
    await client.end();
    throw error;
  }
}

const runtime = await connectRestricted(runtimeUrl, "runtime");
const admin = await connectRestricted(adminUrl, "webhook admin");
const migration = new Client({ connectionString: migrationUrl });
await migration.connect();

try {
  const [runtimePrivileges, adminPrivileges] = await Promise.all([
    runtime.client.query(
      `SELECT
        has_function_privilege(current_user, 'brokerdesk_private.sync_external_auth_user(text,text,text)', 'EXECUTE') AS can_sync,
        has_function_privilege(current_user, 'brokerdesk_private.suspend_external_auth_user(text)', 'EXECUTE') AS can_suspend`,
    ),
    admin.client.query(
      `SELECT
        has_function_privilege(current_user, 'brokerdesk_private.sync_external_auth_user(text,text,text)', 'EXECUTE') AS can_sync,
        has_function_privilege(current_user, 'brokerdesk_private.suspend_external_auth_user(text)', 'EXECUTE') AS can_suspend`,
    ),
  ]);

  assert(!runtimePrivileges.rows[0]?.can_sync, "runtime role can invoke external-auth sync");
  assert(!runtimePrivileges.rows[0]?.can_suspend, "runtime role can invoke external-auth suspension");
  assert(adminPrivileges.rows[0]?.can_sync, "webhook admin cannot invoke external-auth sync");
  assert(adminPrivileges.rows[0]?.can_suspend, "webhook admin cannot invoke external-auth suspension");

  // A single pg Client must not receive concurrent queries; keep this audit deterministic.
  const membershipResult = await migration.query(
    `SELECT role, status, count(*)::int AS count
       FROM public.tenant_memberships
      GROUP BY role, status
      ORDER BY role, status`,
  );
  const invalidReferenceResult = await migration.query(
    `SELECT count(*)::int AS count
       FROM public.tenant_memberships memberships
       LEFT JOIN public.users users ON users.id = memberships.user_id
       LEFT JOIN public.tenants tenants ON tenants.id = memberships.tenant_id
      WHERE users.id IS NULL OR tenants.id IS NULL`,
  );
  const migrationResult = await migration.query(
    `SELECT name FROM public.broker_desk_schema_migrations
      WHERE name = '20260809_001_external_auth_lifecycle_functions.sql'`,
  );

  for (const row of membershipResult.rows) {
    assert(validRoles.has(row.role), `invalid tenant membership role: ${row.role}`);
    assert(validStatuses.has(row.status), `invalid tenant membership status: ${row.status}`);
  }
  assert(invalidReferenceResult.rows[0]?.count === 0, "tenant membership has a missing user or tenant reference");
  assert(migrationResult.rowCount === 1, "external-auth lifecycle migration is missing from migration history");

  console.log(JSON.stringify({
    ok: true,
    runtimeRole: runtime.role.role_name,
    webhookAdminRole: admin.role.role_name,
    membershipStates: membershipResult.rows.map((row) => ({ role: row.role, status: row.status, count: row.count })),
  }, null, 2));
} finally {
  await Promise.all([runtime.client.end(), admin.client.end(), migration.end()]);
}
