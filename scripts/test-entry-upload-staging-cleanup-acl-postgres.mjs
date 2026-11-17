#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeMigrationSql } from "./postgres-migration-runner-utils.mjs";

const require = Module.createRequire(import.meta.url);
const { Client } = require("pg");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const postgresBin = process.env.BROKER_DESK_TEST_POSTGRES_BIN ?? "/opt/homebrew/opt/postgresql@17/bin";
const postgres = join(postgresBin, "postgres");
const initdb = join(postgresBin, "initdb");
const pgCtl = join(postgresBin, "pg_ctl");
if (![postgres, initdb, pgCtl].every((file) => existsSync(file))) {
  throw new Error(`PostgreSQL 17 binaries are required under ${postgresBin}`);
}

const root = mkdtempSync(join(tmpdir(), "brokerdesk-entry-staging-cleanup-acl-pg17-"));
const dataDirectory = join(root, "data");
const logPath = join(root, "postgres.log");
const port = Number(process.env.BROKER_DESK_TEST_POSTGRES_PORT ?? 55462);
const databaseName = "brokerdesk_entry_staging_acl_test";
const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/${databaseName}`;
let running = false;

function runBinary(binary, args) {
  return execFileSync(binary, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, PATH: `${postgresBin}:/usr/bin:/bin`, LANG: "C" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function connect(connectionString) {
  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
  await client.connect();
  return client;
}

async function inspectAcl(client) {
  const result = await client.query(`
    SELECT
      pg_get_userbyid(p.proowner) AS owner,
      EXISTS (
        SELECT 1
        FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) AS public_execute,
      has_function_privilege('brokerdesk_admin', p.oid, 'EXECUTE') AS admin_execute,
      has_function_privilege('brokerdesk_runtime', p.oid, 'EXECUTE') AS runtime_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute
    FROM pg_catalog.pg_proc AS p
    WHERE p.oid = 'brokerdesk_private.cleanup_expired_entry_upload_staging_system(integer)'::regprocedure
  `);
  assert.equal(result.rowCount, 1, "cleanup helper must exist in the fixture");
  return result.rows[0];
}

async function applyRepair(client) {
  const migration = readFileSync(
    path.join(repoRoot, "db/migrations/20261117_002_entry_upload_staging_cleanup_acl.sql"),
    "utf8",
  );
  await client.query("BEGIN");
  try {
    await client.query("SET ROLE brokerdesk_admin");
    await client.query(assertSafeMigrationSql(migration, "20261117_002_entry_upload_staging_cleanup_acl.sql"));
    await client.query("RESET ROLE");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("RESET ROLE").catch(() => undefined);
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

try {
  runBinary(initdb, ["-D", dataDirectory, "-U", "qa_initializer", "--no-locale", "--encoding=UTF8", "--auth-local=trust", "--auth-host=trust"]);
  runBinary(pgCtl, ["-D", dataDirectory, "-o", `-F -p ${port} -h 127.0.0.1`, "-l", logPath, "-w", "start"]);
  running = true;

  const bootstrap = await connect(`postgresql://qa_initializer@127.0.0.1:${port}/postgres`);
  await bootstrap.query("CREATE ROLE postgres LOGIN SUPERUSER CREATEDB CREATEROLE BYPASSRLS");
  await bootstrap.query(`CREATE DATABASE ${databaseName} OWNER postgres`);
  await bootstrap.end();

  const db = await connect(databaseUrl);
  await db.query(`
    CREATE ROLE brokerdesk_admin NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    CREATE ROLE brokerdesk_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE anon NOLOGIN;
    CREATE SCHEMA brokerdesk_private AUTHORIZATION postgres;
    CREATE FUNCTION brokerdesk_private.cleanup_expired_entry_upload_staging_system(integer)
      RETURNS integer LANGUAGE sql SECURITY DEFINER
      SET search_path = pg_catalog, public, pg_temp
      SET row_security = on
      AS $$ SELECT 0 $$;
    ALTER FUNCTION brokerdesk_private.cleanup_expired_entry_upload_staging_system(integer) OWNER TO brokerdesk_admin;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.cleanup_expired_entry_upload_staging_system(integer) TO PUBLIC;
  `);

  const unsafe = await inspectAcl(db);
  assert.deepEqual(unsafe, {
    owner: "brokerdesk_admin",
    public_execute: true,
    admin_execute: true,
    runtime_execute: true,
    authenticated_execute: true,
    anon_execute: true,
  }, "fixture must reproduce the unsafe PUBLIC grant");

  await applyRepair(db);
  const repaired = await inspectAcl(db);
  assert.deepEqual(repaired, {
    owner: "brokerdesk_admin",
    public_execute: false,
    admin_execute: true,
    runtime_execute: false,
    authenticated_execute: false,
    anon_execute: false,
  }, "ACL repair must leave only the admin worker execution path");

  await applyRepair(db);
  assert.deepEqual(await inspectAcl(db), repaired, "ACL repair must be idempotent");

  await db.query("SET ROLE brokerdesk_admin");
  await db.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.cleanup_expired_entry_upload_staging_system(integer) TO PUBLIC");
  await db.query("RESET ROLE");
  await db.query("BEGIN");
  try {
    await db.query("SET ROLE brokerdesk_admin");
    await db.query("REVOKE ALL PRIVILEGES ON FUNCTION brokerdesk_private.cleanup_expired_entry_upload_staging_system(integer) FROM PUBLIC");
    await db.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.cleanup_expired_entry_upload_staging_system(integer) TO brokerdesk_admin");
    await assert.rejects(() => db.query("SELECT * FROM missing_acl_repair_relation"), /does not exist/);
  } finally {
    await db.query("RESET ROLE").catch(() => undefined);
    await db.query("ROLLBACK");
  }
  const afterInjectedFailure = await inspectAcl(db);
  assert.equal(afterInjectedFailure.public_execute, true, "injected failure must roll back the ACL repair transaction");
  assert.equal(afterInjectedFailure.admin_execute, true, "rollback must preserve the owner/admin execution path");

  await db.query("ALTER FUNCTION brokerdesk_private.cleanup_expired_entry_upload_staging_system(integer) OWNER TO postgres");
  await db.query("BEGIN");
  try {
    await db.query("SET ROLE brokerdesk_admin");
    await assert.rejects(() => db.query(assertSafeMigrationSql(
      readFileSync(path.join(repoRoot, "db/migrations/20261117_002_entry_upload_staging_cleanup_acl.sql"), "utf8"),
      "20261117_002_entry_upload_staging_cleanup_acl.sql",
    )), /requires brokerdesk_admin ownership/);
  } finally {
    await db.query("RESET ROLE").catch(() => undefined);
    await db.query("ROLLBACK");
  }
  const afterOwnerDrift = await inspectAcl(db);
  assert.equal(afterOwnerDrift.owner, "postgres", "owner drift must remain unchanged after fail-closed rejection");
  assert.equal(afterOwnerDrift.public_execute, true, "owner drift rejection must not partially revoke ACL");

  await db.end();
  console.log("entry-upload staging cleanup ACL PostgreSQL 17 owner/PUBLIC denial/idempotence/rollback: PASS");
} finally {
  if (running) {
    try { runBinary(pgCtl, ["-D", dataDirectory, "-m", "immediate", "-w", "stop"]); } catch { /* best effort cleanup */ }
  }
  rmSync(root, { recursive: true, force: true });
}
