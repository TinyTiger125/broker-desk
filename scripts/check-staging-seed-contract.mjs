#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const seedPath = path.resolve(root, "scripts/seed-staging-acceptance.mjs");
if (!fs.existsSync(seedPath)) throw new Error("staging acceptance seed tool is missing");

const source = fs.readFileSync(seedPath, "utf8");
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

console.log("Staging acceptance seed contract: PASS");
