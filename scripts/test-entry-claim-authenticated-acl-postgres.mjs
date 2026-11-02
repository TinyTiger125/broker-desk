#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

const adminUrl = process.env.BROKER_DESK_FIXTURE_ADMIN_URL?.trim();
if (!adminUrl) throw new Error("BROKER_DESK_FIXTURE_ADMIN_URL is required");
if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") throw new Error("local-only regression");

const migrationPath = new URL("../db/migrations/20261102_006_entry_request_claims_authenticated_acl.sql", import.meta.url);
const migrationSql = readFileSync(migrationPath, "utf8");
const evidencePath = process.env.BROKER_DESK_ENTRY_CLAIM_AUTH_ACL_EVIDENCE_PATH?.trim()
  || "/private/tmp/brokerdesk-entry-claim-authenticated-acl-evidence-20261102.json";
let client = new pg.Client(adminUrl);
const evidence = {
  localOnly: true,
  pass: false,
  migration: "20261102_006_entry_request_claims_authenticated_acl.sql",
  authenticatedRoleExistedBefore006: false,
  authenticatedRoleProvisionedForIsolatedFixture: false,
  localRoleAdminFallbackUsed: false,
  checks: [],
};

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

let maintenanceRole;
let grantedMaintenanceMembership = false;
try {
  await client.connect();
  maintenanceRole = (await client.query("SELECT current_user AS name")).rows[0].name;
  const table = (await client.query("SELECT to_regclass('public.entry_request_claims') AS name")).rows[0].name;
  assert.equal(table, "entry_request_claims", "the isolated fixture must have the entry claims table");

  let existingRole = await client.query("SELECT rolname FROM pg_roles WHERE rolname='authenticated'");
  if (existingRole.rowCount === 0) {
    const currentRole = (await client.query("SELECT current_user AS name, rolcreaterole FROM pg_roles WHERE rolname=current_user")).rows[0];
    if (!currentRole.rolcreaterole) {
      const localAdmin = new URL(adminUrl);
      if (!["127.0.0.1", "localhost", "::1"].includes(localAdmin.hostname)) {
        throw new Error("authenticated role is absent and a local role-admin connection is required");
      }
      const roleAdminUrl = process.env.BROKER_DESK_FIXTURE_ROLE_ADMIN_URL?.trim() || (() => {
        localAdmin.username = "postgres";
        localAdmin.password = "";
        return localAdmin.toString();
      })();
      await client.end();
      client = new pg.Client(roleAdminUrl);
      await client.connect();
      evidence.localRoleAdminFallbackUsed = true;
      existingRole = await client.query("SELECT rolname FROM pg_roles WHERE rolname='authenticated'");
    }
  }
  if (existingRole.rowCount === 0) {
    await client.query("CREATE ROLE authenticated NOLOGIN");
    evidence.authenticatedRoleProvisionedForIsolatedFixture = true;
  }
  evidence.authenticatedRoleExistedBefore006 = true;

  // Recreate the pre-006 state in this disposable fixture: 001 granted the
  // broad Supabase role, while 006 must remove all three data privileges.
  await client.query("GRANT SELECT, INSERT, UPDATE ON TABLE public.entry_request_claims TO authenticated");
  const before = await client.query(`SELECT
    has_table_privilege('authenticated', 'public.entry_request_claims', 'SELECT') AS can_read,
    has_table_privilege('authenticated', 'public.entry_request_claims', 'INSERT') AS can_insert,
    has_table_privilege('authenticated', 'public.entry_request_claims', 'UPDATE') AS can_update`);
  assert.deepEqual(before.rows[0], { can_read: true, can_insert: true, can_update: true }, "the fixture must prove authenticated had the broad pre-006 ACL");
  evidence.checks.push("authenticated role existed before 006 and had the simulated 001 SELECT/INSERT/UPDATE grants");

  await client.query(migrationSql);
  const after = await client.query(`SELECT
    has_table_privilege('authenticated', 'public.entry_request_claims', 'SELECT') AS can_read,
    has_table_privilege('authenticated', 'public.entry_request_claims', 'INSERT') AS can_insert,
    has_table_privilege('authenticated', 'public.entry_request_claims', 'UPDATE') AS can_update`);
  assert.deepEqual(after.rows[0], { can_read: false, can_insert: false, can_update: false }, "006 must revoke authenticated SELECT/INSERT/UPDATE");
  evidence.checks.push("006 revokes authenticated SELECT/INSERT/UPDATE");

  const runtimeAcl = await client.query(`SELECT
    has_table_privilege('brokerdesk_runtime', 'public.entry_request_claims', 'SELECT') AS can_read,
    has_table_privilege('brokerdesk_runtime', 'public.entry_request_claims', 'INSERT') AS can_insert,
    has_table_privilege('brokerdesk_runtime', 'public.entry_request_claims', 'UPDATE') AS can_update,
    has_table_privilege('brokerdesk_runtime', 'public.entry_request_claims', 'DELETE') AS can_delete`);
  assert.deepEqual(runtimeAcl.rows[0], { can_read: true, can_insert: true, can_update: true, can_delete: false }, "runtime ACL must retain only claim lifecycle writes and no DELETE");
  evidence.checks.push("brokerdesk_runtime retains SELECT/INSERT/UPDATE and has no DELETE");

  const rls = await client.query(`SELECT relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
    FROM pg_class WHERE oid='public.entry_request_claims'::regclass`);
  assert.deepEqual(rls.rows[0], { rls_enabled: true, rls_forced: true }, "claims table must remain FORCE RLS");
  evidence.checks.push("entry_request_claims remains enabled and FORCE RLS");

  // ACL checks above are role-aware, but also exercise the actual denied path
  // in the isolated database. Temporarily make the maintenance role a member
  // of the NOLOGIN fixture role so SET ROLE can verify permission denial.
  await client.query(`GRANT authenticated TO ${quoteIdentifier(maintenanceRole)}`);
  grantedMaintenanceMembership = true;
  await client.query("SET ROLE authenticated");
  for (const sql of [
    "SELECT 1 FROM public.entry_request_claims LIMIT 1",
    `INSERT INTO public.entry_request_claims (tenant_id,user_id,request_key,target_type) VALUES ('tenant_cherry','user_demo','${'a'.repeat(64)}','client')`,
    "UPDATE public.entry_request_claims SET state='failed' WHERE false",
  ]) {
    await assert.rejects(() => client.query(sql), /permission denied/i, "authenticated must be denied by the final ACL");
  }
  await client.query("RESET ROLE");
  evidence.checks.push("authenticated SELECT/INSERT/UPDATE operations are denied after 006");
  evidence.pass = true;
} catch (error) {
  evidence.failure = { message: error instanceof Error ? error.message : String(error) };
  process.exitCode = 1;
} finally {
  try {
    await client.query("RESET ROLE").catch(() => undefined);
    if (grantedMaintenanceMembership && maintenanceRole) {
      await client.query(`REVOKE authenticated FROM ${quoteIdentifier(maintenanceRole)}`);
    }
    if (evidence.authenticatedRoleProvisionedForIsolatedFixture) {
      await client.query("DROP ROLE IF EXISTS authenticated");
    }
  } catch (error) {
    evidence.cleanupFailure = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  }
  await client.end().catch(() => undefined);
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ evidencePath, pass: evidence.pass, checks: evidence.checks }, null, 2));
  process.exit(evidence.pass && !evidence.cleanupFailure ? 0 : 1);
}
