#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import pg from "pg";

const rootUrl = process.env.BROKER_DESK_FIXTURE_ADMIN_URL?.trim() || "postgresql://postgres@127.0.0.1:55460/postgres";
const evidencePath = process.env.BROKER_DESK_ENTRY_CLAIM_LEGACY_ROLLBACK_EVIDENCE_PATH?.trim()
  || "/private/tmp/brokerdesk-entry-claim-legacy-rollback-evidence-20261102.json";
const parsedRoot = new URL(rootUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedRoot.hostname)) {
  throw new Error("local-only regression requires a loopback PostgreSQL connection");
}
if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
  throw new Error("local-only regression");
}

const migrationNames = [
  "20261102_001_entry_request_claims.sql",
  "20261102_002_entry_request_payload_digest.sql",
  "20261102_003_entry_request_intent_key.sql",
  "20261102_004_entry_request_claim_fencing.sql",
  "20261102_005_entry_request_claims_runtime_acl.sql",
  "20261102_006_entry_request_claims_authenticated_acl.sql",
];
const migrations = await Promise.all(
  migrationNames.map((name) => readFile(new URL(`../db/migrations/${name}`, import.meta.url), "utf8")),
);
const evidence = {
  localOnly: true,
  pass: false,
  schemaMigrationsApplied: migrationNames,
  contract: "legacy-hash SQL compatibility path; historical application binary not loaded",
  uuidClaimRowsBefore: 0,
  uuidClaimRowsAfter: 0,
  legacyClaimRowsAfter: 0,
  checks: [],
};

const { Client } = pg;
const root = new Client(rootUrl);
let admin;
let runtime;
let database;
let runtimeCreated = false;
let adminCreated = false;
let authenticatedCreated = false;

function databaseUrl(name) {
  const url = new URL(rootUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function ensureRole(roleName) {
  const existing = await root.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [roleName]);
  if (existing.rowCount === 0) {
    await root.query(`CREATE ROLE ${quoteIdentifier(roleName)} NOLOGIN`);
    return true;
  }
  return false;
}

try {
  await root.connect();
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  database = `bd_claim_legacy_${suffix}`;
  await root.query(`CREATE DATABASE ${quoteIdentifier(database)}`);
  runtimeCreated = await ensureRole("brokerdesk_runtime");
  adminCreated = await ensureRole("brokerdesk_admin");
  authenticatedCreated = await ensureRole("authenticated");

  admin = new Client(databaseUrl(database));
  await admin.connect();
  await admin.query("CREATE TABLE public.users (id TEXT PRIMARY KEY)");
  await admin.query("INSERT INTO public.users (id) VALUES ('user_demo')");
  await admin.query("CREATE SCHEMA brokerdesk_private");
  await admin.query("CREATE FUNCTION brokerdesk_private.current_user_id() RETURNS TEXT LANGUAGE sql STABLE AS $$ SELECT current_setting('app.external_auth_subject', true) $$");
  await admin.query("CREATE FUNCTION brokerdesk_private.can_access_tenant(TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$ SELECT true $$");
  await admin.query("CREATE TABLE public.broker_desk_schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  const legacyLedger = Array.from({ length: 55 }, (_, index) => `20250000_001_legacy_${String(index + 1).padStart(3, "0")}.sql`);
  legacyLedger.push("20261020_001_case_review_membership_v2.sql");
  await admin.query("INSERT INTO public.broker_desk_schema_migrations (name, checksum) SELECT name, 'legacy' FROM UNNEST($1::text[]) AS name", [legacyLedger]);
  await admin.query("GRANT SELECT ON public.users TO brokerdesk_runtime");
  await admin.query("GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_runtime");
  await admin.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.current_user_id() TO brokerdesk_runtime");
  await admin.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_tenant(TEXT) TO brokerdesk_runtime");

  for (const [index, sql] of migrations.entries()) {
    await admin.query(sql);
    await admin.query(
      "INSERT INTO public.broker_desk_schema_migrations (name, checksum) VALUES ($1, $2)",
      [migrationNames[index], createHash("sha256").update(sql).digest("hex")],
    );
  }
  const ledger = await admin.query("SELECT COUNT(*)::int AS count FROM public.broker_desk_schema_migrations");
  assert.equal(ledger.rows[0].count, 62);
  evidence.checks.push("the same isolated fixture applied all six 20261102 migrations and reached the 62-row ledger");

  const uuidKey = randomUUID();
  await admin.query(
    `INSERT INTO public.entry_request_claims (tenant_id, user_id, request_key, target_type)
     VALUES ('tenant_fixture', 'user_demo', $1, 'client')`,
    [uuidKey],
  );
  evidence.uuidClaimRowsBefore = Number((await admin.query(
    "SELECT COUNT(*)::int AS count FROM public.entry_request_claims WHERE request_key=$1",
    [uuidKey],
  )).rows[0].count);
  assert.equal(evidence.uuidClaimRowsBefore, 1);

  runtime = new Client(databaseUrl(database));
  await runtime.connect();
  await runtime.query("SET ROLE brokerdesk_runtime");
  await runtime.query("SET app.external_auth_subject = 'user_demo'");

  // This is the deterministic compatibility contract for the previously
  // verified app: a content-hash request key, base-column insert, then a
  // target completion update without the newer payload/token columns.
  const legacyKey = createHash("sha256").update("legacy-app-fixture-intent").digest("hex");
  const claimed = await runtime.query(
    `INSERT INTO public.entry_request_claims (tenant_id, user_id, request_key, target_type)
     VALUES ('tenant_fixture', 'user_demo', $1, 'client')
     ON CONFLICT (tenant_id, user_id, request_key, target_type) DO NOTHING
     RETURNING state`,
    [legacyKey],
  );
  assert.deepEqual(claimed.rows[0], { state: "claimed" });
  const completed = await runtime.query(
    `UPDATE public.entry_request_claims
        SET state='completed', target_id='legacy_target_fixture', updated_at=NOW()
      WHERE tenant_id='tenant_fixture' AND user_id='user_demo'
        AND request_key=$1 AND target_type='client' AND state='claimed'
      RETURNING state, target_id`,
    [legacyKey],
  );
  assert.deepEqual(completed.rows[0], { state: "completed", target_id: "legacy_target_fixture" });
  const reopened = await runtime.query(
    `SELECT state, target_id
       FROM public.entry_request_claims
      WHERE tenant_id='tenant_fixture' AND user_id='user_demo'
        AND request_key=$1 AND target_type='client'`,
    [legacyKey],
  );
  assert.deepEqual(reopened.rows[0], { state: "completed", target_id: "legacy_target_fixture" });
  evidence.checks.push("legacy-hash base-column claim, completion, and reopen read all succeed under brokerdesk_runtime");

  const uuidAfter = await runtime.query(
    `SELECT COUNT(*)::int AS count,
            COUNT(*) FILTER (WHERE state='claimed')::int AS claimed_count,
            COUNT(*) FILTER (WHERE target_id IS NULL)::int AS unmodified_count
       FROM public.entry_request_claims
      WHERE request_key=$1`,
    [uuidKey],
  );
  evidence.uuidClaimRowsAfter = uuidAfter.rows[0].count;
  assert.deepEqual(uuidAfter.rows[0], { count: 1, claimed_count: 1, unmodified_count: 1 });
  evidence.legacyClaimRowsAfter = Number((await runtime.query(
    "SELECT COUNT(*)::int AS count FROM public.entry_request_claims WHERE request_key=$1 AND state='completed' AND target_id='legacy_target_fixture'",
    [legacyKey],
  )).rows[0].count);
  assert.equal(evidence.legacyClaimRowsAfter, 1);
  evidence.checks.push("the persisted UUID claim remains one claimed row with no target mutation after legacy-hash flow");
  evidence.pass = true;
} catch (error) {
  evidence.failure = { message: error instanceof Error ? error.message : String(error) };
  process.exitCode = 1;
} finally {
  await runtime?.query("RESET ROLE").catch(() => undefined);
  await runtime?.end().catch(() => undefined);
  await admin?.end().catch(() => undefined);
  await root.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)}`).catch(() => undefined);
  if (runtimeCreated) await root.query("DROP ROLE IF EXISTS brokerdesk_runtime").catch(() => undefined);
  if (adminCreated) await root.query("DROP ROLE IF EXISTS brokerdesk_admin").catch(() => undefined);
  if (authenticatedCreated) await root.query("DROP ROLE IF EXISTS authenticated").catch(() => undefined);
  await root.end().catch(() => undefined);
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    evidencePath,
    pass: evidence.pass,
    schemaMigrationsApplied: evidence.schemaMigrationsApplied.length,
    uuidClaimRowsBefore: evidence.uuidClaimRowsBefore,
    uuidClaimRowsAfter: evidence.uuidClaimRowsAfter,
    legacyClaimRowsAfter: evidence.legacyClaimRowsAfter,
    checks: evidence.checks,
  }, null, 2));
  process.exit(evidence.pass ? 0 : 1);
}
