#!/usr/bin/env node
import fs from "node:fs";
import { Pool } from "pg";

if (!process.env.DATABASE_ADMIN_URL && fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const connectionString = (process.env.DATABASE_ADMIN_URL ?? "").trim();
if (!connectionString) {
  throw new Error("DATABASE_ADMIN_URL is required for the import worker authorization check");
}

const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });

try {
  const result = await pool.query(
    `SELECT current_user AS role_name,
            r.rolsuper,
            r.rolbypassrls,
            has_function_privilege(current_user, 'brokerdesk_private.claim_next_import_jobs(integer)', 'EXECUTE') AS can_claim
       FROM pg_roles r
      WHERE r.rolname = current_user`,
  );
  const role = result.rows[0];
  if (!role) throw new Error("could not determine import worker database role");
  if (role.rolsuper || role.rolbypassrls) {
    throw new Error(`import worker role ${role.role_name} has unsafe elevated database privileges`);
  }
  if (!role.can_claim) {
    throw new Error(`import worker role ${role.role_name} cannot claim queued import jobs`);
  }
  console.log(`[PASS] import worker authorization: ${role.role_name} can claim jobs without elevated database privileges`);
} finally {
  await pool.end();
}
