import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";
import { runPostgresMigrations } from "./run-postgres-migrations.mjs";

const { Client } = pg;
const postgresBin = "/opt/homebrew/opt/postgresql@16/bin";
const root = mkdtempSync(join(tmpdir(), "brokerdesk-real-migration-faults-"));
const data = join(root, "data");
const port = 55448;
const migrationsDirectory = resolve("db/migrations");
const firstName = "20260908_001_preimport_upload_lifecycle.sql";
const secondName = "20260921_002_import_worker_rls_admin_policy.sql";
const sha256 = (name) => createHash("sha256").update(readFileSync(join(migrationsDirectory, name))).digest("hex");
const run = (name, args) => execFileSync(join(postgresBin, name), args, {
  encoding: "utf8",
  env: { PATH: `${postgresBin}:/usr/bin:/bin`, LANG: "C", HOME: process.env.HOME },
});
const databaseUrl = `postgresql://qa_initializer@127.0.0.1:${port}/real_faults`;
async function connect() {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  await client.connect();
  return client;
}
async function installLedgerFailure(client, name) {
  assert.ok([firstName, secondName].includes(name));
  await client.query("CREATE OR REPLACE FUNCTION reject_target_migration_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name = TG_ARGV[0] THEN RAISE EXCEPTION 'injected ledger failure for %', NEW.name; END IF; RETURN NEW; END $$");
  await client.query(`CREATE TRIGGER injected_ledger_failure BEFORE INSERT ON broker_desk_schema_migrations FOR EACH ROW EXECUTE FUNCTION reject_target_migration_ledger('${name}')`);
}
async function removeLedgerFailure(client) {
  await client.query("DROP TRIGGER injected_ledger_failure ON broker_desk_schema_migrations");
  await client.query("DROP FUNCTION reject_target_migration_ledger()");
}
async function inspectFirst(client) {
  const columns = (await client.query("SELECT attname FROM pg_attribute WHERE attrelid = 'public.import_jobs'::regclass AND attname = ANY($1::text[]) AND attnum > 0 AND NOT attisdropped ORDER BY attname", [["upload_lifecycle_version", "final_import_started_at", "source_referenced_at"]])).rows.map((row) => row.attname);
  const functions = (await client.query("SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'brokerdesk_private' AND proname = ANY($1::text[]) ORDER BY proname", [["guard_preimport_upload_lifecycle", "claim_property_row_import", "delete_preimport_property_upload", "guard_preimport_source_reference"]])).rows.map((row) => row.proname);
  const triggers = (await client.query("SELECT tgname FROM pg_trigger WHERE tgrelid = ANY(ARRAY['public.import_jobs'::regclass, 'public.attachments'::regclass, 'public.attachment_links'::regclass]) AND tgname = ANY($1::text[]) ORDER BY tgname", [["import_jobs_preimport_upload_lifecycle_guard", "attachments_preimport_source_reference_guard", "attachment_links_preimport_source_reference_guard"]])).rows.map((row) => row.tgname);
  const ledger = Number((await client.query("SELECT count(*) AS count FROM broker_desk_schema_migrations WHERE name = $1", [firstName])).rows[0].count);
  return { columns, functions, triggers, ledger };
}
async function inspectSecond(client) {
  const policies = (await client.query("SELECT polname FROM pg_policy WHERE polrelid = 'public.import_jobs'::regclass AND polname = ANY($1::text[]) ORDER BY polname", [["brokerdesk_import_worker_claim_select", "brokerdesk_import_worker_claim_update"]])).rows.map((row) => row.polname);
  const ledger = Number((await client.query("SELECT count(*) AS count FROM broker_desk_schema_migrations WHERE name = $1", [secondName])).rows[0].count);
  return { policies, ledger };
}

let running = false;
try {
  run("initdb", ["-D", data, "-U", "qa_initializer", "--no-locale", "--encoding=UTF8", "--auth-local=trust", "--auth-host=trust"]);
  run("pg_ctl", ["-D", data, "-o", `-F -p ${port} -h 127.0.0.1`, "-l", join(root, "postgres.log"), "-w", "start"]);
  running = true;
  const initializer = new Client({ connectionString: `postgresql://qa_initializer@127.0.0.1:${port}/postgres` });
  await initializer.connect();
  await initializer.query("CREATE DATABASE real_faults OWNER qa_initializer");
  await initializer.end();
  const steps = [];
  steps.push(await runPostgresMigrations({ databaseUrl, migrationsDirectory, prepareEmptyDatabase: true, stopAfter: "20260904_001_runtime_external_auth_subject_execute.sql", log: () => {} }));
  const db = await connect();
  const firstBefore = await inspectFirst(db);
  assert.deepEqual(firstBefore, { columns: [], functions: [], triggers: [], ledger: 0 });
  await installLedgerFailure(db, firstName);
  await assert.rejects(
    () => runPostgresMigrations({ databaseUrl, migrationsDirectory, prepareEmptyDatabase: true, stopAfter: firstName, log: () => {} }),
    /injected ledger failure/,
  );
  const firstFailed = await inspectFirst(db);
  assert.deepEqual(firstFailed, firstBefore, "actual 20260908 migration columns, functions, triggers and ledger must roll back");
  await removeLedgerFailure(db);
  steps.push(await runPostgresMigrations({ databaseUrl, migrationsDirectory, prepareEmptyDatabase: true, stopAfter: firstName, log: () => {} }));
  const firstApplied = await inspectFirst(db);
  assert.equal(firstApplied.columns.length, 3);
  assert.equal(firstApplied.functions.length, 4);
  assert.equal(firstApplied.triggers.length, 3);
  assert.equal(firstApplied.ledger, 1);

  steps.push(await runPostgresMigrations({ databaseUrl, migrationsDirectory, stopAfter: "20260921_001_supabase_auth_lifecycle.sql", log: () => {} }));
  const secondBefore = await inspectSecond(db);
  assert.deepEqual(secondBefore, { policies: [], ledger: 0 });
  await installLedgerFailure(db, secondName);
  await assert.rejects(
    () => runPostgresMigrations({ databaseUrl, migrationsDirectory, stopAfter: secondName, log: () => {} }),
    /injected ledger failure/,
  );
  const secondFailed = await inspectSecond(db);
  assert.deepEqual(secondFailed, secondBefore, "actual 20260921 policy changes and ledger must roll back");
  await removeLedgerFailure(db);
  steps.push(await runPostgresMigrations({ databaseUrl, migrationsDirectory, stopAfter: secondName, log: () => {} }));
  const secondApplied = await inspectSecond(db);
  assert.deepEqual(secondApplied.policies, ["brokerdesk_import_worker_claim_select", "brokerdesk_import_worker_claim_update"]);
  assert.equal(secondApplied.ledger, 1);
  await db.end();
  const evidence = {
    postgres: "16", port, migrationSha256: { [firstName]: sha256(firstName), [secondName]: sha256(secondName) },
    steps, firstBefore, firstFailed, firstApplied, secondBefore, secondFailed, secondApplied,
    scope: "isolated local PostgreSQL; actual unmodified migration files; injected failure on ledger INSERT",
  };
  mkdirSync("/private/tmp/broker-desk-evidence", { recursive: true, mode: 0o700 });
  writeFileSync("/private/tmp/broker-desk-evidence/20260921-migration-runner-real-sql-faults.log", `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(evidence));
} finally {
  if (running) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  rmSync(root, { recursive: true, force: true });
}
