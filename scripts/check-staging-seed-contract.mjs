#!/usr/bin/env node
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
]) {
  if (!source.includes(required)) throw new Error(`seed contract missing ${required}`);
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
