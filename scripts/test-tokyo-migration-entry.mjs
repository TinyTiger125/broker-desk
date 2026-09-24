import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  classifyTokyoInitialization,
  executeTokyoMigrations,
  preflightTokyoMigration,
} from "./run-tokyo-supabase-migrations.mjs";

const directory = path.resolve("db/migrations");
const names = (await readdir(directory)).filter((name) => /^\d{8}_\d{3}_.+\.sql$/.test(name)).sort();
const firstIndex = names.indexOf("20260908_001_preimport_upload_lifecycle.sql");
const finalIndex = names.indexOf("20260921_002_import_worker_rls_admin_policy.sql");
assert.ok(firstIndex > 0 && finalIndex > firstIndex);
const ledger = await Promise.all(names.map(async (name) => ({ name, checksum: createHash("sha256").update(await readFile(path.join(directory, name))).digest("hex") })));
const projectRef = "ilujuwuzaqwcbpnqixen";
const routeUser = `postgres.${projectRef}`;
const config = { user: routeUser, database: "postgres", ssl: { rejectUnauthorized: true } };
const safeRoles = ["brokerdesk_admin", "brokerdesk_runtime"].map((rolname) => ({ rolname, rolsuper: false, rolcreaterole: false, rolbypassrls: false, rolcanlogin: false }));
const fiveTables = ["attachment_links", "attachments", "audit_logs", "import_jobs", "private_attachment_blobs"].map((relname) => ({ relname, owner: "brokerdesk_admin", rls: true, force_rls: true }));
const firstColumns = ["final_import_started_at", "source_referenced_at", "upload_lifecycle_version"];
const firstFunctions = ["claim_property_row_import", "delete_preimport_property_upload", "guard_preimport_source_reference", "guard_preimport_upload_lifecycle"];
const firstTriggers = ["attachment_links_preimport_source_reference_guard", "attachments_preimport_source_reference_guard", "import_jobs_preimport_upload_lifecycle_guard"];
const finalPolicies = ["brokerdesk_import_worker_claim_select", "brokerdesk_import_worker_claim_update"];

function fixture(appliedCount, phase = "initializing") {
  const afterFirst = appliedCount > firstIndex;
  const afterFinal = appliedCount > finalIndex;
  return {
    currentUser: "postgres",
    markerExists: phase !== "none",
    markerRows: phase === "none" ? [] : [{ project_ref: projectRef, phase }],
    ledgerExists: appliedCount > 0,
    ledgerRows: structuredClone(ledger.slice(0, appliedCount)),
    tenantsExists: appliedCount > 0,
    publicTables: phase === "none" ? [] : ["broker_desk_initialization_control", ...(appliedCount > 0 ? ["broker_desk_schema_migrations", "tenants"] : [])],
    roles: appliedCount > 0 ? structuredClone(safeRoles) : [],
    tableState: afterFirst ? structuredClone(fiveTables) : [],
    firstColumns: afterFirst ? firstColumns : [],
    firstFunctions: afterFirst ? firstFunctions : [],
    firstTriggers: afterFirst ? firstTriggers : [],
    finalPolicies: afterFinal ? finalPolicies : [],
    writes: [],
  };
}

function fakeClientFor(state) {
  return class FakeClient {
    constructor(receivedConfig) { assert.equal(receivedConfig.user, routeUser); }
    async connect() {}
    async end() {}
    async query(sql) {
      if (/^(BEGIN|ROLLBACK|COMMIT|SET LOCAL|SET lock_timeout|SET statement_timeout)/.test(sql)) return { rows: [], rowCount: 0 };
      if (sql === "SELECT 1") return { rows: [{ "?column?": 1 }], rowCount: 1 };
      if (sql.includes("broker-desk-initialization-control")) return { rows: [], rowCount: 1 };
      if (sql.includes("current_database()")) return { rows: [{ database: "postgres", session_user_name: state.currentUser, user_name: state.currentUser, schema: "public", schemas: ["public"], transaction_read_only: "on" }] };
      if (sql.includes("to_regclass('public.broker_desk_initialization_control')")) return { rows: [{ marker_exists: state.markerExists, ledger_exists: state.ledgerExists, tenants_exists: state.tenantsExists }] };
      if (sql.startsWith("SELECT project_ref, phase")) return { rows: state.markerRows };
      if (sql.startsWith("SELECT name, checksum")) return { rows: state.ledgerRows };
      if (sql.includes("c.relkind IN")) return { rows: state.publicTables.map((relname) => ({ relname })) };
      if (sql.includes("FROM pg_roles")) return { rows: state.roles };
      if (sql.includes("pg_get_userbyid")) return { rows: state.tableState };
      if (sql.includes("FROM pg_attribute")) return { rows: state.firstColumns.map((attname) => ({ attname })) };
      if (sql.includes("FROM pg_proc")) return { rows: state.firstFunctions.map((proname) => ({ proname })) };
      if (sql.includes("FROM pg_trigger")) return { rows: state.firstTriggers.map((tgname) => ({ tgname })) };
      if (sql.includes("FROM pg_policy")) return { rows: state.finalPolicies.map((polname) => ({ polname })) };
      if (sql.startsWith("CREATE TABLE public.broker_desk_initialization_control")) { state.markerExists = true; state.publicTables.push("broker_desk_initialization_control"); state.writes.push("marker create"); return { rows: [], rowCount: 0 }; }
      if (sql.startsWith("INSERT INTO public.broker_desk_initialization_control")) { state.markerRows = [{ project_ref: projectRef, phase: "initializing" }]; state.writes.push("marker start"); return { rows: [], rowCount: 1 }; }
      if (sql.startsWith("UPDATE public.broker_desk_initialization_control")) { state.markerRows[0].phase = "complete"; state.writes.push("marker complete"); return { rows: [], rowCount: 1 }; }
      throw new Error(`unexpected fake SQL: ${sql}`);
    }
  };
}

const before = fixture(firstIndex, "initializing");
const beforeState = await preflightTokyoMigration({ config, ClientConstructor: fakeClientFor(before) });
assert.equal(beforeState.identity.user_name, "postgres");
assert.equal(config.user, routeUser);
assert.deepEqual(await classifyTokyoInitialization(beforeState, directory), { phase: "resume", prepareEmptyDatabase: true, appliedCount: firstIndex });
const after = fixture(firstIndex + 1, "initializing");
assert.deepEqual(await classifyTokyoInitialization(await preflightTokyoMigration({ config, ClientConstructor: fakeClientFor(after) }), directory), { phase: "resume", prepareEmptyDatabase: false, appliedCount: firstIndex + 1 });
const wrongExecutionUser = fixture(firstIndex, "initializing");
wrongExecutionUser.currentUser = routeUser;
await assert.rejects(() => preflightTokyoMigration({ config, ClientConstructor: fakeClientFor(wrongExecutionUser) }), /identity preflight failed/);
const wrongChecksum = fixture(firstIndex, "initializing");
wrongChecksum.ledgerRows[0].checksum = "incorrect";
await assert.rejects(() => preflightTokyoMigration({ config, ClientConstructor: fakeClientFor(wrongChecksum) }).then((state) => classifyTokyoInitialization(state, directory)), /matching contiguous prefix/);
const existingBusiness = fixture(0, "none");
existingBusiness.publicTables = ["tenants"];
await assert.rejects(() => preflightTokyoMigration({ config, ClientConstructor: fakeClientFor(existingBusiness) }).then((state) => classifyTokyoInitialization(state, directory)), /existing database has no initialization marker/);

for (const [label, initial, expectedPrepare] of [
  ["new", fixture(0, "none"), true],
  ["before-first", fixture(firstIndex, "initializing"), true],
  ["after-first", fixture(firstIndex + 1, "initializing"), false],
]) {
  let runCount = 0;
  await executeTokyoMigrations({
    config,
    args: ["--prepare-empty-db"],
    environment: { BROKER_DESK_TOKYO_MIGRATIONS_APPROVED: "true", BROKER_DESK_PREPARE_EMPTY_DB: "true" },
    ClientConstructor: fakeClientFor(initial),
    migrationsDirectory: directory,
    runMigrations: async ({ prepareEmptyDatabase }) => {
      assert.equal(prepareEmptyDatabase, expectedPrepare, label);
      runCount += 1;
      return { appliedCount: names.length - initial.ledgerRows.length };
    },
    log: () => {},
  });
  assert.equal(runCount, 1, label);
  assert.equal(initial.markerRows[0].phase, "complete", label);
  assert.equal(initial.writes.includes("marker create"), label === "new", label);
}
const noApproval = fixture(firstIndex, "initializing");
await assert.rejects(() => executeTokyoMigrations({ config, args: ["--prepare-empty-db"], environment: {}, ClientConstructor: fakeClientFor(noApproval), migrationsDirectory: directory, log: () => {} }), /APPROVED=true/);
assert.deepEqual(noApproval.writes, []);
console.log("PASS: Tokyo pooler identity, explicit initialization marker, before/after 20260908 recovery, checksum and write gates");
