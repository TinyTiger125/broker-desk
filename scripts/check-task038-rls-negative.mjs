#!/usr/bin/env node

import { Pool } from "pg";

const databaseUrl = process.env.TASK038_RUNTIME_DATABASE_URL;
const subject = process.env.TASK038_A_EXTERNAL_AUTH_SUBJECT;
const tenantA = process.env.TASK038_TENANT_A_ID;
const tenantC = process.env.TASK038_TENANT_C_ID;
const expectedProject = process.env.TASK038_EXPECTED_NEON_PROJECT_ID;
const expectedBranch = process.env.TASK038_EXPECTED_NEON_BRANCH_ID;
const expectedDatabase = process.env.TASK038_EXPECTED_DATABASE_NAME;

function requireEnv(name, value) {
  if (!value) throw new Error(`${name} is required; this check never falls back to .env.local`);
}

for (const [name, value] of Object.entries({
  TASK038_RUNTIME_DATABASE_URL: databaseUrl,
  TASK038_A_EXTERNAL_AUTH_SUBJECT: subject,
  TASK038_TENANT_A_ID: tenantA,
  TASK038_TENANT_C_ID: tenantC,
  TASK038_EXPECTED_NEON_PROJECT_ID: expectedProject,
  TASK038_EXPECTED_NEON_BRANCH_ID: expectedBranch,
  TASK038_EXPECTED_DATABASE_NAME: expectedDatabase,
})) requireEnv(name, value);

const tenantTables = [
  "clients",
  "properties",
  "brokerage_cases",
  "generated_outputs",
  "attachments",
  "private_attachment_blobs",
  "guarantee_blank_forms",
  "guarantee_company_masks",
];

const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10_000 });
const client = await pool.connect();

async function probeTenantTable(table, tenantId) {
  await client.query("SAVEPOINT task038_probe");
  try {
    const result = await client.query(`SELECT count(*)::int AS count FROM public.${table} WHERE tenant_id = $1`, [tenantId]);
    await client.query("RELEASE SAVEPOINT task038_probe");
    return { status: "read", count: result.rows[0]?.count ?? 0 };
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT task038_probe");
    return { status: "denied", code: error?.code ?? "unknown" };
  }
}

try {
  const role = (await client.query(`
    SELECT current_user AS role_name, r.rolsuper, r.rolbypassrls,
      EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'brokerage_cases'
          AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
      ) AS owns_business_tables
    FROM pg_roles r
    WHERE r.rolname = current_user
  `)).rows[0];

  if (!role || role.role_name !== "brokerdesk_runtime") throw new Error("runtime role mismatch");
  if (role.rolsuper || role.rolbypassrls || role.owns_business_tables) throw new Error("runtime role is over-privileged");

  const identity = (await client.query(`
    SELECT current_database() AS database_name,
      current_setting('neon.project_id', true) AS project_id,
      current_setting('neon.branch_id', true) AS branch_id
  `)).rows[0];
  if (identity.database_name !== expectedDatabase) throw new Error("database identity mismatch");
  if (identity.project_id && identity.project_id !== expectedProject) throw new Error("Neon project identity mismatch");
  if (identity.branch_id && identity.branch_id !== expectedBranch) throw new Error("Neon branch identity mismatch");

  await client.query("BEGIN");
  await client.query("SELECT set_config('app.external_auth_subject', $1, true)", [subject]);
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantC]);

  const bound = (await client.query("SELECT brokerdesk_private.current_user_id() IS NOT NULL AS bound")).rows[0]?.bound;
  if (!bound) throw new Error("A subject is not mapped to a local user in this database");

  const tenantAResults = {};
  const tenantCResults = {};
  for (const table of tenantTables) {
    tenantAResults[table] = await probeTenantTable(table, tenantA);
    tenantCResults[table] = await probeTenantTable(table, tenantC);
  }

  await client.query("SELECT set_config('app.external_auth_subject', $1, true)", [`invalid-task038-${Date.now()}`]);
  const invalidSubjectCases = await probeTenantTable("brokerage_cases", tenantA);

  await client.query("ROLLBACK");
  console.log(JSON.stringify({
    database: identity.database_name,
    project: identity.project_id || "not_exposed_by_server",
    branch: identity.branch_id || "not_exposed_by_server",
    role: { name: role.role_name, superuser: role.rolsuper, bypassRls: role.rolbypassrls, ownsBusinessTables: role.owns_business_tables },
    mappedSubject: true,
    tenantA: tenantAResults,
    tenantC: tenantCResults,
    invalidSubject: invalidSubjectCases,
    tenantContextForgeryDidNotWiden: Object.values(tenantCResults).every((result) => result.status === "denied" || result.count === 0),
  }, null, 2));
} finally {
  client.release();
  await pool.end();
}
