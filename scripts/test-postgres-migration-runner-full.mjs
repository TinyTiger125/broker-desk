import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { runPostgresMigrations } from "./run-postgres-migrations.mjs";

const { Client } = pg;
const postgresBin = "/opt/homebrew/opt/postgresql@16/bin";
const root = mkdtempSync(join(tmpdir(), "brokerdesk-full-runner-"));
const data = join(root, "data");
const port = 55447;
const run = (name, args) => execFileSync(join(postgresBin, name), args, {
  encoding: "utf8",
  env: { PATH: `${postgresBin}:/usr/bin:/bin`, LANG: "C", HOME: process.env.HOME },
});
let running = false;
try {
  run("initdb", ["-D", data, "-U", "qa_initializer", "--no-locale", "--encoding=UTF8", "--auth-local=trust", "--auth-host=trust"]);
  run("pg_ctl", ["-D", data, "-o", `-F -p ${port} -h 127.0.0.1`, "-l", join(root, "postgres.log"), "-w", "start"]);
  running = true;
  const admin = new Client({ connectionString: `postgresql://qa_initializer@127.0.0.1:${port}/postgres` });
  await admin.connect();
  await admin.query("CREATE DATABASE broker_desk_runner_test OWNER qa_initializer");
  await admin.end();
  const databaseUrl = `postgresql://qa_initializer@127.0.0.1:${port}/broker_desk_runner_test`;
  const result = await runPostgresMigrations({ databaseUrl, prepareEmptyDatabase: true, log: () => {} });
  const migrationNames = readdirSync("db/migrations")
    .filter((name) => /^\d{8}_\d{3}_.+\.sql$/u.test(name))
    .sort();
  assert.ok(migrationNames.length > 0, "current migration directory must not be empty");
  assert.deepEqual(result, { appliedCount: migrationNames.length, skippedCount: 0, stoppedAfter: null });
  const verify = new Client({ connectionString: databaseUrl });
  await verify.connect();
  const ledgerRows = (await verify.query("SELECT name, checksum FROM broker_desk_schema_migrations ORDER BY name")).rows;
  const expectedLedgerRows = migrationNames.map((name) => ({
    name,
    checksum: createHash("sha256").update(readFileSync(`db/migrations/${name}`)).digest("hex"),
  }));
  assert.deepEqual(ledgerRows, expectedLedgerRows, "every current migration must be applied once with its current checksum");
  const ledgerCount = ledgerRows.length;
  const owners = (await verify.query("SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.relforcerowsecurity AS force_rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = ANY($1::text[]) ORDER BY c.relname", [["import_jobs", "attachments", "private_attachment_blobs", "attachment_links", "audit_logs"]])).rows;
  assert.equal(ledgerCount, migrationNames.length);
  assert.equal(owners.length, 5);
  assert.ok(owners.every((row) => row.owner === "brokerdesk_admin" && row.force_rls === true));
  await verify.end();
  const evidence = { postgres: "16", appliedCount: result.appliedCount, ledgerCount, owners };
  mkdirSync("/private/tmp/broker-desk-evidence", { recursive: true, mode: 0o700 });
  writeFileSync("/private/tmp/broker-desk-evidence/current-migration-runner-full-prereq.log", `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(evidence));
} finally {
  if (running) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  rmSync(root, { recursive: true, force: true });
}
