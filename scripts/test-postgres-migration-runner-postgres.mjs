import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { runPostgresMigrations } from "./run-postgres-migrations.mjs";

const { Client } = pg;
const postgresBin = "/opt/homebrew/opt/postgresql@16/bin";
assert.ok(readFileSync(join(postgresBin, "initdb")), "local PostgreSQL 16 is required");
const root = mkdtempSync(join(tmpdir(), "brokerdesk-runner-pg-"));
const data = join(root, "data");
const migrations = join(root, "migrations");
mkdirSync(migrations);
const port = 55446;
const logPath = join(root, "postgres.log");
const run = (name, args) => execFileSync(join(postgresBin, name), args, { encoding: "utf8", env: { PATH: `${postgresBin}:/usr/bin:/bin`, LANG: "C", HOME: process.env.HOME } });
const connect = async (database = "runner_test") => {
  const client = new Client({ connectionString: `postgresql://qa_initializer@127.0.0.1:${port}/${database}`, connectionTimeoutMillis: 5000 });
  await client.connect();
  return client;
};
const firstName = "20260908_001_preimport_upload_lifecycle.sql";
const secondName = "20260921_002_import_worker_rls_admin_policy.sql";
writeFileSync(join(migrations, firstName), "-- preimport header\nBEGIN;\nCREATE TABLE migration_marker (id INTEGER PRIMARY KEY);\nCOMMIT;\n");
writeFileSync(join(migrations, secondName), "/* worker header */\nBEGIN;\nINSERT INTO migration_marker VALUES (1);\nCOMMIT;\n");
let running = false;
try {
  run("initdb", ["-D", data, "-U", "qa_initializer", "--no-locale", "--encoding=UTF8", "--auth-local=trust", "--auth-host=trust"]);
  run("pg_ctl", ["-D", data, "-o", `-F -p ${port} -h 127.0.0.1`, "-l", logPath, "-w", "start"]);
  running = true;
  const setup = await connect("postgres");
  await setup.query("CREATE DATABASE runner_test OWNER qa_initializer");
  await setup.end();
  const db = await connect();
  await db.query("CREATE TABLE broker_desk_schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await db.query("CREATE OR REPLACE FUNCTION reject_migration_ledger_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected ledger failure'; END $$");
  await db.query("CREATE TRIGGER injected_ledger_failure BEFORE INSERT ON broker_desk_schema_migrations FOR EACH ROW EXECUTE FUNCTION reject_migration_ledger_insert()");
  await db.end();

  const databaseUrl = `postgresql://qa_initializer@127.0.0.1:${port}/runner_test`;
  await assert.rejects(() => runPostgresMigrations({ databaseUrl, migrationsDirectory: migrations, log: () => {} }), /injected ledger failure/);
  const failed = await connect();
  assert.equal((await failed.query("SELECT to_regclass('public.migration_marker') AS marker")).rows[0].marker, null, "migration body must roll back with ledger failure");
  assert.equal(Number((await failed.query("SELECT count(*) AS count FROM broker_desk_schema_migrations")).rows[0].count), 0, "ledger must remain empty after injected failure");
  await failed.query("DROP TRIGGER injected_ledger_failure ON broker_desk_schema_migrations");
  await failed.query("DROP FUNCTION reject_migration_ledger_insert()");
  await failed.end();

  const first = await runPostgresMigrations({ databaseUrl, migrationsDirectory: migrations, log: () => {} });
  assert.deepEqual(first, { appliedCount: 2, skippedCount: 0, stoppedAfter: null });
  const second = await runPostgresMigrations({ databaseUrl, migrationsDirectory: migrations, log: () => {} });
  assert.deepEqual(second, { appliedCount: 0, skippedCount: 2, stoppedAfter: null });

  const original = readFileSync(join(migrations, firstName), "utf8");
  writeFileSync(join(migrations, firstName), `${original}\n-- checksum mutation in isolated fixture\n`);
  await assert.rejects(() => runPostgresMigrations({ databaseUrl, migrationsDirectory: migrations, log: () => {} }), /checksum mismatch/);
  writeFileSync(join(migrations, firstName), original);

  const evidence = {
    postgres: "16",
    port,
    injectedLedgerFailure: "migration_marker absent and ledger count 0",
    normalRun: first,
    repeatRun: second,
    checksumMismatch: "rejected before execution",
  };
  mkdirSync("/private/tmp/broker-desk-evidence", { recursive: true, mode: 0o700 });
  writeFileSync("/private/tmp/broker-desk-evidence/20260921-migration-runner-postgres-fault-injection.log", `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(evidence));
} finally {
  if (running) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  rmSync(root, { recursive: true, force: true });
}
