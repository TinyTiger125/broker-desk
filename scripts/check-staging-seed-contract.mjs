#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const seedPath = path.resolve(root, "scripts/seed-staging-acceptance.mjs");
if (!fs.existsSync(seedPath)) throw new Error("staging acceptance seed tool is missing");

const source = fs.readFileSync(seedPath, "utf8");
const beginPosition = source.lastIndexOf("await one(\"BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE\"");
const markerPosition = source.lastIndexOf("await establishSeedSessionMarkers();");
const targetPosition = source.lastIndexOf("await assertTarget();");
const dryRunPosition = source.lastIndexOf("if (dryRun)");
if (beginPosition < 0 || markerPosition < 0 || targetPosition < 0 || dryRunPosition < 0 || !(beginPosition < markerPosition && markerPosition < targetPosition && targetPosition < dryRunPosition)) {
  throw new Error("dry-run must share the transaction-local marker and target preflight before planning");
}
const dryRunBlockEnd = source.indexOf("} else {", dryRunPosition);
const dryRunBlock = source.slice(dryRunPosition, dryRunBlockEnd);
if (dryRunBlockEnd < 0 || !dryRunBlock.includes("ROLLBACK") || /seedRows|resetRows|COMMIT/.test(dryRunBlock)) {
  throw new Error("dry-run must rollback without fixture writes or commit");
}
for (const required of [
  "--dry-run",
  "BROKER_DESK_STAGING_SEED_DATABASE_URL",
  "--confirm-nonprod",
  "broker-desk-staging-nonprod",
  "BEGIN",
  "ON CONFLICT",
  "TASK-047",
  "information_schema.tables",
  "current_setting('app.broker_desk_nonprod_marker', true)",
  "set_config('app.broker_desk_nonprod_marker', $1, true)",
  "expectedWrites",
  "partial fixture state",
  "formal seed requires a fresh target",
  "tenant_guarantee_template_installs",
  "tenant_68d4f3676778",
  "LIYU株式会社",
  "company_owner",
  "brokerdesk_private.current_user_id()",
  "set_config('app.external_auth_subject', $1, true)",
  "current_user_id must match the tenant owner actor",
]) {
  if (!source.includes(required)) throw new Error(`seed contract missing ${required}`);
}
for (const forbidden of [
  "INTERNAL ALPHA / TEST",
  "seed actor must be an existing active platform owner",
]) {
  if (source.includes(forbidden)) throw new Error(`seed must not retain the obsolete ${forbidden} contract`);
}
for (const forbidden of [
  "INSERT INTO users",
  "INSERT INTO tenants",
  "INSERT INTO tenant_memberships",
  "INSERT INTO tenant_creation_requests",
  "CREATE TABLE",
]) {
  if (source.includes(forbidden)) throw new Error(`seed must not mutate ${forbidden}`);
}

const assertNoUnmarkedRowsStart = source.indexOf("async function assertNoUnmarkedRows() {");
const assertNoUnmarkedRowsEnd = source.indexOf("\n}\n\nconst expectedFixtureCounts", assertNoUnmarkedRowsStart) + 2;
if (assertNoUnmarkedRowsStart < 0 || assertNoUnmarkedRowsEnd <= assertNoUnmarkedRowsStart) {
  throw new Error("unmarked-row guard is missing or could not be isolated for behavior verification");
}

const assertNoUnmarkedRowsSource = source.slice(assertNoUnmarkedRowsStart, assertNoUnmarkedRowsEnd);
const duplicateSqlArgumentSource = assertNoUnmarkedRowsSource.replace(
  "      `SELECT COUNT(*)::int AS count FROM ${table} WHERE tenant_id = $1 AND COALESCE(${column}, '') NOT LIKE $2`,\n      [tenantId, `${marker}%`],",
  "      `SELECT COUNT(*)::int AS count FROM ${table} WHERE tenant_id = $1 AND COALESCE(${column}, '') NOT LIKE $2`,\n      `SELECT COUNT(*)::int AS count FROM ${table} WHERE tenant_id = $1 AND COALESCE(${column}, '') NOT LIKE $2`,\n      [tenantId, `${marker}%`],",
);
if (duplicateSqlArgumentSource === assertNoUnmarkedRowsSource) {
  throw new Error("parameter regression fixture could not be constructed");
}

async function runUnmarkedRowsBehavior(functionSource) {
  const calls = [];
  const one = async (...args) => {
    if (args.length !== 2) throw new Error("one(sql, values) must receive exactly two arguments");
    const [sql, values] = args;
    if (!Array.isArray(values)) throw new Error("unmarked-row query parameters must be an array");
    calls.push({ sql, values });
    return { rows: [{ count: 0 }] };
  };
  const load = Function("one", "tenantId", "marker", `${functionSource}; return assertNoUnmarkedRows;`);
  await load(one, "tenant_behavior", "TASK-047-ACCEPTANCE-BEHAVIOR")();
  assert.equal(calls.length, 7, "unmarked-row guard must check all six marker columns and cases");
  for (const call of calls.slice(0, 6)) {
    assert.deepEqual(call.values, ["tenant_behavior", "TASK-047-ACCEPTANCE-BEHAVIOR%"], "marker-column query must pass tenant and marker parameters as an array");
  }
  assert.deepEqual(calls[6].values, ["tenant_behavior", "TASK-047-ACCEPTANCE-BEHAVIOR"], "case query must pass tenant and marker parameters as an array");
}

let oldImplementationRejected = false;
try {
  await runUnmarkedRowsBehavior(duplicateSqlArgumentSource);
} catch (error) {
  oldImplementationRejected = true;
  assert.match(String(error?.message), /exactly two arguments/);
}
assert(oldImplementationRejected, "behavior test must fail for the duplicate SQL-argument regression");
await runUnmarkedRowsBehavior(assertNoUnmarkedRowsSource);

const result = spawnSync(process.execPath, [seedPath, "--dry-run", "--environment", "staging"], {
  cwd: root,
  encoding: "utf8",
});
if (result.status === 0 || !`${result.stdout}${result.stderr}`.includes("required")) {
  throw new Error("seed dry-run must refuse without an explicit target and marker");
}

const fullySpecifiedWithoutUrl = spawnSync(process.execPath, [
  seedPath,
  "--dry-run",
  "--environment", "staging",
  "--confirm-nonprod",
  "--tenant-id", "tenant_fixture",
  "--actor-user-id", "user_fixture",
  "--marker", "TASK-047-ACCEPTANCE-SEED-CONTRACT",
  "--database-name", "broker_desk_internal_alpha",
], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, BROKER_DESK_STAGING_SEED_DATABASE_URL: "" },
});
if (fullySpecifiedWithoutUrl.status === 0 || !`${fullySpecifiedWithoutUrl.stdout}${fullySpecifiedWithoutUrl.stderr}`.includes("database URL")) {
  throw new Error("dry-run must refuse without a target database URL; it may not bypass the target marker gate");
}

console.log("Staging acceptance seed contract: PASS");
