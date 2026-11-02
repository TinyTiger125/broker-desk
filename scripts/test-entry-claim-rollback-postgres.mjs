#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import pg from "pg";

const rootUrl = process.env.BROKER_DESK_FIXTURE_ADMIN_URL?.trim() || "postgresql://postgres@127.0.0.1:55460/postgres";
const evidencePath = process.env.BROKER_DESK_ENTRY_CLAIM_ROLLBACK_EVIDENCE_PATH?.trim()
  || "/private/tmp/brokerdesk-entry-claim-rollback-evidence-20261102.json";
const parsedRoot = new URL(rootUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedRoot.hostname)) {
  throw new Error("local-only regression requires a loopback PostgreSQL connection");
}
if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
  throw new Error("local-only regression");
}

const rollback001 = await readFile(new URL("../db/migrations/rollback/20261102_001_entry_request_claims.sql", import.meta.url), "utf8");
const rollback003 = await readFile(new URL("../db/migrations/rollback/20261102_003_entry_request_intent_key.sql", import.meta.url), "utf8");
const migration001 = await readFile(new URL("../db/migrations/20261102_001_entry_request_claims.sql", import.meta.url), "utf8");
const migration003 = await readFile(new URL("../db/migrations/20261102_003_entry_request_intent_key.sql", import.meta.url), "utf8");
const evidence = {
  localOnly: true,
  pass: false,
  uuidClaimRows: 0,
  checks: [],
};

const { Client } = pg;
const root = new Client(rootUrl);
let database;
let client;
let runtimeCreated = false;
let adminCreated = false;

function databaseUrl(name) {
  const url = new URL(rootUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function rollbackFailed(sql, pattern) {
  await assert.rejects(() => client.query(sql), pattern);
  await client.query("ROLLBACK");
}

try {
  await root.connect();
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  database = `bd_claim_rollback_${suffix}`;
  await root.query(`CREATE DATABASE "${database.replaceAll('"', '""')}"`);

  client = new Client(databaseUrl(database));
  await client.connect();
  const roles = await client.query("SELECT rolname FROM pg_roles WHERE rolname IN ('brokerdesk_runtime', 'brokerdesk_admin') ORDER BY rolname");
  const roleNames = new Set(roles.rows.map((row) => row.rolname));
  if (!roleNames.has("brokerdesk_runtime")) {
    await root.query("CREATE ROLE brokerdesk_runtime NOLOGIN");
    runtimeCreated = true;
  }
  if (!roleNames.has("brokerdesk_admin")) {
    await root.query("CREATE ROLE brokerdesk_admin NOLOGIN");
    adminCreated = true;
  }

  await client.query("CREATE TABLE public.users (id TEXT PRIMARY KEY)");
  await client.query("INSERT INTO public.users (id) VALUES ('user_demo')");
  await client.query("CREATE SCHEMA brokerdesk_private");
  await client.query("CREATE FUNCTION brokerdesk_private.current_user_id() RETURNS TEXT LANGUAGE sql STABLE AS $$ SELECT 'user_demo'::text $$");
  await client.query("CREATE FUNCTION brokerdesk_private.can_access_tenant(TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$ SELECT true $$");
  await client.query(migration001);
  await client.query(migration003);

  const uuidKey = randomUUID();
  await client.query(
    `INSERT INTO public.entry_request_claims (tenant_id, user_id, request_key, target_type)
     VALUES ('tenant_fixture', 'user_demo', $1, 'client')`,
    [uuidKey],
  );
  evidence.uuidClaimRows = Number((await client.query("SELECT COUNT(*)::int AS count FROM public.entry_request_claims WHERE request_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'")).rows[0].count);
  assert.equal(evidence.uuidClaimRows, 1);
  evidence.checks.push("one real UUID request_key claims row was persisted in the isolated fixture");

  await rollbackFailed(rollback003, /rollback 003 blocked: UUID entry_request_claims rows exist/);
  const after003Block = await client.query("SELECT COUNT(*)::int AS count, COUNT(*) FILTER (WHERE request_key = $1)::int AS uuid_count FROM public.entry_request_claims", [uuidKey]);
  assert.deepEqual(after003Block.rows[0], { count: 1, uuid_count: 1 });
  evidence.checks.push("rollback 003 failed closed and preserved the UUID row and forward-compatible constraint");

  await rollbackFailed(rollback001, /destructive rollback 001 blocked: public.entry_request_claims contains 1 durable claim rows/);
  const after001Block = await client.query("SELECT to_regclass('public.entry_request_claims') AS table_name, COUNT(*)::int AS count FROM public.entry_request_claims");
  assert.deepEqual(after001Block.rows[0], { table_name: "entry_request_claims", count: 1 });
  evidence.checks.push("rollback 001 failed closed on non-empty claims data and preserved the table");

  await client.query("DELETE FROM public.entry_request_claims WHERE request_key = $1", [uuidKey]);
  await client.query(rollback003);
  await client.query(
    `INSERT INTO public.entry_request_claims (tenant_id, user_id, request_key, target_type)
     VALUES ('tenant_fixture', 'user_demo', $1, 'client')`,
    ["a".repeat(64)],
  );
  await assert.rejects(
    () => client.query(
      `INSERT INTO public.entry_request_claims (tenant_id, user_id, request_key, target_type)
       VALUES ('tenant_fixture', 'user_demo', $1, 'client')`,
      [randomUUID()],
    ),
    /entry_request_claims_request_key_check/,
  );
  await client.query("DELETE FROM public.entry_request_claims");
  evidence.checks.push("rollback 003 succeeds only after UUID data is absent and restores hash-only validation");

  await client.query("SET brokerdesk.allow_destructive_entry_request_claims_drop = 'off'");
  await rollbackFailed(rollback001, /destructive rollback 001 blocked: explicit session opt-in/);
  assert.equal((await client.query("SELECT to_regclass('public.entry_request_claims') AS table_name")).rows[0].table_name, "entry_request_claims");
  evidence.checks.push("rollback 001 also requires an explicit destructive session opt-in when the table is empty");

  await client.query("SET brokerdesk.allow_destructive_entry_request_claims_drop = 'on'");
  await client.query(rollback001);
  assert.equal((await client.query("SELECT to_regclass('public.entry_request_claims') AS table_name")).rows[0].table_name, null);
  evidence.checks.push("explicitly opted-in emergency drop removes only the empty isolated table");
  evidence.pass = true;
} catch (error) {
  evidence.failure = { message: error instanceof Error ? error.message : String(error) };
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => undefined);
  await root.query(`DROP DATABASE IF EXISTS "${database?.replaceAll('"', '""')}"`).catch(() => undefined);
  if (runtimeCreated) await root.query("DROP ROLE IF EXISTS brokerdesk_runtime").catch(() => undefined);
  if (adminCreated) await root.query("DROP ROLE IF EXISTS brokerdesk_admin").catch(() => undefined);
  await root.end().catch(() => undefined);
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ evidencePath, pass: evidence.pass, uuidClaimRows: evidence.uuidClaimRows, checks: evidence.checks }, null, 2));
  process.exit(evidence.pass ? 0 : 1);
}
