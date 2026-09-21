import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  assert.deepEqual(result, { appliedCount: 44, skippedCount: 0, stoppedAfter: null });
  const verify = new Client({ connectionString: databaseUrl });
  await verify.connect();
  const ledgerCount = Number((await verify.query("SELECT count(*) AS count FROM broker_desk_schema_migrations")).rows[0].count);
  const owners = (await verify.query("SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.relforcerowsecurity AS force_rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = ANY($1::text[]) ORDER BY c.relname", [["import_jobs", "attachments", "private_attachment_blobs", "attachment_links", "audit_logs"]])).rows;
  assert.equal(ledgerCount, 44);
  assert.equal(owners.length, 5);
  assert.ok(owners.every((row) => row.owner === "brokerdesk_admin" && row.force_rls === true));
  await verify.end();
  const evidence = { postgres: "16", appliedCount: result.appliedCount, ledgerCount, owners };
  writeFileSync("/private/tmp/broker-desk-evidence/20260921-migration-runner-full-44-prereq.log", `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(evidence));
} finally {
  if (running) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  rmSync(root, { recursive: true, force: true });
}
