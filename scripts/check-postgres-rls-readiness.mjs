#!/usr/bin/env node
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

if (!process.env.DATABASE_URL && fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const connectionString = (process.env.DATABASE_URL ?? "").trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for the Postgres RLS readiness check");
}

const tenantTables = [
  "clients",
  "properties",
  "quotations",
  "follow_ups",
  "tasks",
  "audit_logs",
  "output_template_settings",
  "output_template_versions",
  "generated_outputs",
  "import_jobs",
  "attachments",
  "private_attachment_blobs",
  "brokerage_cases",
  "extraction_review_items",
  "guarantee_application_drafts",
  "correction_events",
  "ai_experience_drafts",
  "case_workbench_field_rules",
  "tenant_guarantee_template_installs",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });

try {
  const roleResult = await pool.query(
    "SELECT current_user AS role_name, r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user",
  );
  const role = roleResult.rows[0];
  assert(role, "could not determine current database role");
  assert(!role.rolsuper, `database role ${role.role_name} has SUPERUSER and is unsafe for runtime`);
  assert(!role.rolbypassrls, `database role ${role.role_name} has BYPASSRLS and is unsafe for runtime`);

  const tableResult = await pool.query(
    `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
    [tenantTables],
  );
  const tablesByName = new Map(tableResult.rows.map((row) => [row.relname, row]));
  for (const table of tenantTables) {
    const row = tablesByName.get(table);
    assert(row, `tenant table public.${table} is missing`);
    assert(row.relrowsecurity, `tenant table public.${table} does not have RLS enabled`);
    assert(row.relforcerowsecurity, `tenant table public.${table} does not force RLS for owners`);
  }

  const functionResult = await pool.query(
    `SELECT to_regprocedure('brokerdesk_private.sync_external_auth_user(text,text,text)') AS sync_fn,
            to_regprocedure('brokerdesk_private.suspend_external_auth_user(text)') AS suspend_fn`,
  );
  assert(functionResult.rows[0]?.sync_fn, "external-auth sync function is missing");
  assert(functionResult.rows[0]?.suspend_fn, "external-auth suspension function is missing");

  const blobConstraint = await pool.query(
    `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
      WHERE conrelid = 'public.private_attachment_blobs'::regclass
        AND contype = 'c'`,
  );
  assert(
    blobConstraint.rows.some((row) => /octet_length\(content\).*10485760/i.test(row.definition ?? "")),
    "private attachment blob 10 MB size constraint is missing",
  );

  // A runtime connection with no mapped Clerk subject must not be able to
  // discover another tenant's records. This catches an accidental RLS bypass
  // even when table flags still look correct.
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.external_auth_subject', $1, false)", [
      `public-beta-negative-${randomUUID()}`,
    ]);
    const deniedRead = await client.query("SELECT count(*)::int AS count FROM brokerage_cases");
    assert(deniedRead.rows[0]?.count === 0, "runtime role can read cases without a tenant membership");
  } finally {
    try {
      await client.query("RESET app.external_auth_subject");
    } finally {
      client.release();
    }
  }

  console.log(`[PASS] Postgres RLS readiness: ${role.role_name}; ${tenantTables.length} tenant tables forced; lifecycle functions present; anonymous tenant read denied`);
} finally {
  await pool.end();
}
