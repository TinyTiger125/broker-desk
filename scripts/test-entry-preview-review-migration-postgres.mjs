#!/usr/bin/env node
/* Local-only, rollback-only migration contract for PostgreSQL 17. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertSafeMigrationSql } from "./postgres-migration-runner-utils.mjs";

const { Client } = createRequire(import.meta.url)("pg");
const url = process.env.DATABASE_DEVELOPMENT_URL?.trim();
if (!url) throw new Error("DATABASE_DEVELOPMENT_URL is required");
const parsed = new URL(url);
if (!(parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") || parsed.port !== "55473" || !parsed.pathname.endsWith("/broker_desk_local_intake")) {
  throw new Error("This regression is restricted to the isolated broker_desk_local_intake PostgreSQL port 55473");
}

const migrationPath = resolve("db/migrations/20261117_001_entry_preview_review_cleanup_guards.sql");
const source = readFileSync(migrationPath, "utf8");
const body = assertSafeMigrationSql(source, migrationPath);
const client = new Client({ connectionString: url });
await client.connect();
try {
  const version = (await client.query("SHOW server_version_num")).rows[0].server_version_num;
  assert.equal(String(version).slice(0, 2), "17");
  const beforeSchema = (await client.query("SELECT has_schema_privilege('brokerdesk_admin','brokerdesk_private','USAGE') AS usage, has_schema_privilege('brokerdesk_admin','brokerdesk_private','CREATE') AS create")).rows[0];
  await client.query("BEGIN");
  // Simulate the reviewed release bundle's temporary capability grant. The
  // transaction is rolled back, so no local privilege or function definition
  // is persisted by this test.
  await client.query("ALTER FUNCTION brokerdesk_private.guard_object_import_target() OWNER TO brokerdesk_admin");
  await client.query("ALTER FUNCTION brokerdesk_private.lock_case_review_source(text,text,text,text) OWNER TO brokerdesk_admin");
  await client.query("ALTER FUNCTION brokerdesk_private.cleanup_entry_preview_review_target(text,text,text,text,text,text) OWNER TO brokerdesk_admin");
  await client.query("GRANT USAGE, CREATE ON SCHEMA brokerdesk_private TO brokerdesk_admin");
  await client.query("SET LOCAL ROLE brokerdesk_admin");
  await client.query(body);
  const { rows } = await client.query(`
    SELECT p.oid::regprocedure::text AS proc,
           pg_get_userbyid(p.proowner) AS owner,
           p.prosecdef AS security_definer,
           p.proconfig AS config,
           has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute,
           has_function_privilege('brokerdesk_runtime', p.oid, 'EXECUTE') AS runtime_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='brokerdesk_private'
       AND p.oid::regprocedure::text IN (
         'brokerdesk_private.cleanup_entry_preview_review_target(text,text,text,text,text,text)',
         'brokerdesk_private.guard_object_import_target()',
         'brokerdesk_private.lock_case_review_source(text,text,text,text)'
       ) ORDER BY 1
  `);
  const byProc = new Map(rows.map((row) => [row.proc, row]));
  const cleanup = byProc.get("brokerdesk_private.cleanup_entry_preview_review_target(text,text,text,text,text,text)");
  const guard = byProc.get("brokerdesk_private.guard_object_import_target()");
  const sourceLock = byProc.get("brokerdesk_private.lock_case_review_source(text,text,text,text)");
  assert(cleanup && guard && sourceLock);
  for (const row of [cleanup, guard, sourceLock]) assert.equal(row.owner, "brokerdesk_admin");
  assert.match((cleanup.config ?? []).join(","), /search_path=pg_catalog, public, pg_temp/);
  assert.match((guard.config ?? []).join(","), /search_path=pg_catalog, public, pg_temp/);
  assert.match((sourceLock.config ?? []).join(","), /search_path=pg_catalog, pg_temp/);
  assert.equal(cleanup.security_definer, true);
  assert.equal(sourceLock.security_definer, true);
  assert.equal(guard.security_definer, false);
  assert.equal(cleanup.public_execute, false);
  assert.equal(cleanup.runtime_execute, true);
  const schemaInside = (await client.query("SELECT has_schema_privilege('brokerdesk_admin','brokerdesk_private','USAGE') AS usage, has_schema_privilege('brokerdesk_admin','brokerdesk_private','CREATE') AS create")).rows[0];
  assert.deepEqual(schemaInside, { usage: true, create: true });
  await client.query("ROLLBACK");
  const afterSchema = (await client.query("SELECT has_schema_privilege('brokerdesk_admin','brokerdesk_private','USAGE') AS usage, has_schema_privilege('brokerdesk_admin','brokerdesk_private','CREATE') AS create")).rows[0];
  assert.deepEqual(afterSchema, beforeSchema, "temporary schema privileges must be restored by rollback");
  console.log(JSON.stringify({ postgresMajor: 17, migrationSha256: createHash("sha256").update(source).digest("hex"), owner: "brokerdesk_admin", securityDefinerCleanup: true, publicExecuteCleanup: false, runtimeExecuteCleanup: true, temporarySchemaPrivilegesRolledBack: true, syntheticOnly: true }));
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
