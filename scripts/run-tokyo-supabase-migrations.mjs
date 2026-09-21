#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { Client } from "pg";
import { buildSupabasePoolConfig, SUPABASE_PROJECT_REF } from "./bootstrap-initial-supabase-owner.mjs";
import { assertNoPgEnvironment } from "./bootstrap-initial-platform-owner.mjs";
import {
  DEFAULT_CONNECTION_TIMEOUT_MS,
  DEFAULT_LOCK_TIMEOUT_MS,
  DEFAULT_STATEMENT_TIMEOUT_MS,
  MigrationOutcomeUncertainError,
  runPostgresMigrations,
} from "./run-postgres-migrations.mjs";

const FIRST_GATED_MIGRATION = "20260908_001_preimport_upload_lifecycle.sql";
const FINAL_CURRENT_MIGRATION = "20260921_002_import_worker_rls_admin_policy.sql";
const REQUIRED_TABLES = ["import_jobs", "attachments", "private_attachment_blobs", "attachment_links", "audit_logs"];
const FIRST_COLUMNS = ["final_import_started_at", "source_referenced_at", "upload_lifecycle_version"];
const FIRST_FUNCTIONS = ["claim_property_row_import", "delete_preimport_property_upload", "guard_preimport_source_reference", "guard_preimport_upload_lifecycle"];
const FIRST_TRIGGERS = ["attachment_links_preimport_source_reference_guard", "attachments_preimport_source_reference_guard", "import_jobs_preimport_upload_lifecycle_guard"];
const FINAL_POLICIES = ["brokerdesk_import_worker_claim_select", "brokerdesk_import_worker_claim_update"];
const MARKER_TABLE = "public.broker_desk_initialization_control";
const INITIALIZATION_LOCK_SQL = "SELECT pg_advisory_lock(hashtext('broker-desk-initialization-control'))";
const INITIALIZATION_UNLOCK_SQL = "SELECT pg_advisory_unlock(hashtext('broker-desk-initialization-control'))";

export function buildTokyoMigrationConfig(environment = process.env) {
  assertNoPgEnvironment(environment);
  if (environment.BROKER_DESK_DEPLOYMENT_ENV !== "staging" || environment.VERCEL_ENV !== "preview") {
    throw new Error("Tokyo migration requires the fixed Staging Preview environment");
  }
  const config = buildSupabasePoolConfig({
    connectionString: environment.DATABASE_MIGRATION_URL,
    supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL,
    caPath: environment.DATABASE_MIGRATION_CA_CERT_PATH,
  });
  // Historical migrations create some objects without a schema qualifier.
  // A public-only path keeps pg_catalog implicitly first for built-ins while
  // directing those objects into public.
  return { ...config, options: "-c search_path=public", application_name: "broker-desk-tokyo-migration", query_timeout: 65_000 };
}

export async function preflightTokyoMigration({ config, ClientConstructor = Client, client: providedClient = null }) {
  const ownsClient = !providedClient;
  const client = providedClient ?? new ClientConstructor(config);
  try {
    if (ownsClient) await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const identity = (await client.query("SELECT current_database() AS database, session_user AS session_user_name, current_user AS user_name, current_schema() AS schema, current_schemas(false) AS schemas, current_setting('transaction_read_only') AS transaction_read_only")).rows[0];
    const inventory = (await client.query("SELECT to_regclass('public.broker_desk_initialization_control') IS NOT NULL AS marker_exists, to_regclass('public.broker_desk_schema_migrations') IS NOT NULL AS ledger_exists, to_regclass('public.tenants') IS NOT NULL AS tenants_exists")).rows[0];
    const markerRows = inventory.marker_exists ? (await client.query(`SELECT project_ref, phase FROM ${MARKER_TABLE}`)).rows : [];
    const ledgerRows = inventory.ledger_exists ? (await client.query("SELECT name, checksum FROM public.broker_desk_schema_migrations ORDER BY name")).rows : [];
    const publicTables = (await client.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY c.relname")).rows.map(({ relname }) => relname);
    const roles = (await client.query("SELECT rolname, rolsuper, rolcreaterole, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname IN ('brokerdesk_runtime', 'brokerdesk_admin') ORDER BY rolname")).rows;
    const tableState = (await client.query("SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = ANY($1::text[]) ORDER BY c.relname", [REQUIRED_TABLES])).rows;
    const firstColumns = (await client.query("SELECT attname FROM pg_attribute WHERE attrelid = to_regclass('public.import_jobs') AND attname = ANY($1::text[]) AND attnum > 0 AND NOT attisdropped ORDER BY attname", [FIRST_COLUMNS])).rows.map(({ attname }) => attname);
    const firstFunctions = (await client.query("SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'brokerdesk_private' AND proname = ANY($1::text[]) ORDER BY proname", [FIRST_FUNCTIONS])).rows.map(({ proname }) => proname);
    const firstTriggers = (await client.query("SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND tgname = ANY($1::text[]) ORDER BY tgname", [FIRST_TRIGGERS])).rows.map(({ tgname }) => tgname);
    const finalPolicies = (await client.query("SELECT polname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND polname = ANY($1::text[]) ORDER BY polname", [FINAL_POLICIES])).rows.map(({ polname }) => polname);
    await client.query("ROLLBACK");
    // Pooler credentials use postgres.<project-ref>; execution is postgres.
    if (config.user !== `postgres.${SUPABASE_PROJECT_REF}` || identity.database !== "postgres" || identity.user_name !== "postgres" || identity.session_user_name !== "postgres" || identity.schema !== "public" || !identity.schemas?.includes("public") || identity.transaction_read_only !== "on") {
      throw new Error("Tokyo migration identity preflight failed");
    }
    return { identity, inventory, markerRows, ledgerRows, publicTables, roles, tableState, firstColumns, firstFunctions, firstTriggers, finalPolicies };
  } finally {
    if (ownsClient) await client.end();
  }
}

function sameNames(actual, expected) {
  return actual.length === expected.length && expected.every((name) => actual.includes(name));
}

export async function classifyTokyoInitialization(state, migrationsDirectory = path.resolve("db/migrations")) {
  const names = (await readdir(migrationsDirectory)).filter((name) => /^\d{8}_\d{3}_.+\.sql$/.test(name)).sort();
  const fail = (reason) => { throw new Error(`Tokyo initialization state rejected: ${reason}`); };
  if (!names.includes(FIRST_GATED_MIGRATION) || !names.includes(FINAL_CURRENT_MIGRATION)) fail("migration directory is incomplete");
  if (!state.inventory.marker_exists) {
    if (state.inventory.ledger_exists || state.inventory.tenants_exists || state.ledgerRows.length || state.publicTables.length) fail("existing database has no initialization marker");
    if (state.roles.some((role) => role.rolsuper || role.rolcreaterole || role.rolbypassrls || role.rolcanlogin)) fail("existing roles are unsafe for initialization");
    return { phase: "new", prepareEmptyDatabase: true, appliedCount: 0 };
  }
  if (state.markerRows.length !== 1) fail("initialization marker is missing or ambiguous");
  const marker = state.markerRows[0];
  if (marker.project_ref !== SUPABASE_PROJECT_REF || !["initializing", "complete"].includes(marker.phase)) fail("initialization marker does not match the fixed project or phase");
  if (!state.inventory.ledger_exists) {
    const unsafeRoles = state.roles.some((role) => role.rolsuper || role.rolcreaterole || role.rolbypassrls || role.rolcanlogin);
    if (state.ledgerRows.length || !sameNames(state.publicTables, ["broker_desk_initialization_control"]) || unsafeRoles || marker.phase !== "initializing") fail("new initialization marker has unexpected objects");
    return { phase: "resume", prepareEmptyDatabase: true, appliedCount: 0 };
  }
  if (state.ledgerRows.length > names.length) fail("migration ledger has unexpected entries");
  for (let index = 0; index < state.ledgerRows.length; index += 1) {
    const expectedName = names[index];
    const checksum = createHash("sha256").update(await readFile(path.join(migrationsDirectory, expectedName))).digest("hex");
    if (state.ledgerRows[index].name !== expectedName || state.ledgerRows[index].checksum !== checksum) fail("migration ledger is not a matching contiguous prefix");
  }
  const applied = new Set(state.ledgerRows.map(({ name }) => name));
  const beforeFirst = !applied.has(FIRST_GATED_MIGRATION);
  const rolesValid = sameNames(state.roles.map(({ rolname }) => rolname), ["brokerdesk_runtime", "brokerdesk_admin"])
    && state.roles.every((role) => !role.rolsuper && !role.rolcreaterole && !role.rolbypassrls && !role.rolcanlogin);
  if (!rolesValid && !(state.ledgerRows.length === 0 && state.roles.length === 0 && marker.phase === "initializing")) fail("constrained initialization roles are missing or unsafe");
  if (!sameNames(state.firstColumns, beforeFirst ? [] : FIRST_COLUMNS)
    || !sameNames(state.firstFunctions, beforeFirst ? [] : FIRST_FUNCTIONS)
    || !sameNames(state.firstTriggers, beforeFirst ? [] : FIRST_TRIGGERS)) fail("preimport objects do not match ledger phase");
  if (!sameNames(state.finalPolicies, applied.has(FINAL_CURRENT_MIGRATION) ? FINAL_POLICIES : [])) fail("worker policies do not match ledger phase");
  if (!beforeFirst && (!sameNames(state.tableState.map(({ relname }) => relname), REQUIRED_TABLES)
    || state.tableState.some((row) => row.owner !== "brokerdesk_admin" || !row.rls || !row.force_rls))) fail("preimport table ownership and FORCE RLS are incomplete");
  if (marker.phase === "complete" && !applied.has(FINAL_CURRENT_MIGRATION)) fail("complete marker has not reached the fixed initialization baseline");
  return { phase: marker.phase === "complete" ? "complete" : "resume", prepareEmptyDatabase: beforeFirst, appliedCount: state.ledgerRows.length };
}

async function changeInitializationMarker({ config, ClientConstructor, mode, client: providedClient = null }) {
  const ownsClient = !providedClient;
  const client = providedClient ?? new ClientConstructor(config);
  let inTransaction = false;
  let commitAttempted = false;
  try {
    if (ownsClient) await client.connect();
    await client.query("BEGIN");
    inTransaction = true;
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    if (mode === "start") {
      await client.query(`CREATE TABLE ${MARKER_TABLE} (id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id), project_ref TEXT NOT NULL, phase TEXT NOT NULL CHECK (phase IN ('initializing', 'complete')), started_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await client.query(`INSERT INTO ${MARKER_TABLE} (id, project_ref, phase) VALUES (TRUE, $1, 'initializing')`, [SUPABASE_PROJECT_REF]);
    } else {
      const result = await client.query(`UPDATE ${MARKER_TABLE} SET phase = 'complete' WHERE id = TRUE AND project_ref = $1 AND phase = 'initializing'`, [SUPABASE_PROJECT_REF]);
      if (result.rowCount !== 1) throw new Error("Tokyo initialization marker could not be completed");
    }
    commitAttempted = true;
    await client.query("COMMIT");
    inTransaction = false;
  } catch (error) {
    if (commitAttempted || isConnectionUncertain(error)) {
      throw new MigrationOutcomeUncertainError(`Tokyo initialization marker ${mode}`, error);
    }
    if (inTransaction) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    if (ownsClient) await client.end();
  }
}

function isConnectionUncertain(error) {
  const code = error?.code;
  return ["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "57P01", "57P02", "57P03"].includes(code)
    || (typeof code === "string" && /^08/.test(code));
}

async function withInitializationLock({ config, ClientConstructor, fn }) {
  const client = new ClientConstructor(config);
  let lockAcquired = false;
  try {
    await client.connect();
    await client.query(`SET lock_timeout = '${DEFAULT_LOCK_TIMEOUT_MS}ms'`);
    await client.query(`SET statement_timeout = '${DEFAULT_STATEMENT_TIMEOUT_MS}ms'`);
    await client.query(INITIALIZATION_LOCK_SQL);
    lockAcquired = true;
    // Preflight, marker writes and the runner reuse this same session. Verify
    // it is alive immediately before any work begins; terminating the lock
    // holder therefore also terminates the actual write connection.
    await client.query("SELECT 1");
    return await fn(client);
  } finally {
    if (lockAcquired) await client.query(INITIALIZATION_UNLOCK_SQL).catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

export async function executeTokyoMigrations({
  config,
  args = [],
  environment = process.env,
  ClientConstructor = Client,
  runMigrations = runPostgresMigrations,
  migrationsDirectory = path.resolve("db/migrations"),
  log = console.log,
}) {
  return withInitializationLock({ config, ClientConstructor, fn: async (lockClient) => {
    if (args.some((argument) => !["--preflight", "--prepare-empty-db"].includes(argument)) || (args.includes("--preflight") && args.includes("--prepare-empty-db"))) {
      throw new Error("Use --preflight or --prepare-empty-db; do not combine them");
    }
    const state = await preflightTokyoMigration({ config, ClientConstructor, client: lockClient });
    const classification = await classifyTokyoInitialization(state, migrationsDirectory);
    log(JSON.stringify({ preflight: { database: state.identity.database, routeUser: config.user, executionUser: state.identity.user_name, phase: classification.phase, appliedCount: classification.appliedCount } }));
    if (args.includes("--preflight")) return classification;
    if (environment.BROKER_DESK_TOKYO_MIGRATIONS_APPROVED !== "true") throw new Error("BROKER_DESK_TOKYO_MIGRATIONS_APPROVED=true is required for Tokyo migration writes");
    const initialMode = args.includes("--prepare-empty-db");
    if (initialMode && classification.phase === "complete") throw new Error("Tokyo initialization is already complete");
    if (!initialMode && classification.phase !== "complete") throw new Error("Tokyo initialization is incomplete; use the controlled --prepare-empty-db route");
    if (initialMode && environment.BROKER_DESK_PREPARE_EMPTY_DB !== "true") throw new Error("BROKER_DESK_PREPARE_EMPTY_DB=true is required for empty-database initialization or recovery");
    if (classification.phase === "new") await changeInitializationMarker({ config, ClientConstructor, mode: "start", client: lockClient });
    const result = await runMigrations({
      Client: ClientConstructor,
      client: lockClient,
      clientConfig: config,
      migrationsDirectory,
      prepareEmptyDatabase: initialMode && classification.prepareEmptyDatabase,
      connectionTimeoutMillis: DEFAULT_CONNECTION_TIMEOUT_MS,
      lockTimeoutMillis: DEFAULT_LOCK_TIMEOUT_MS,
      statementTimeoutMillis: DEFAULT_STATEMENT_TIMEOUT_MS,
      log,
    });
    if (initialMode) await changeInitializationMarker({ config, ClientConstructor, mode: "complete", client: lockClient });
    return result;
  } });
}

async function runFromCommandLine() {
  const config = buildTokyoMigrationConfig();
  await executeTokyoMigrations({ config, args: process.argv.slice(2) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runFromCommandLine();
}
