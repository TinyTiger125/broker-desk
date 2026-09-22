#!/usr/bin/env node
import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Client as PgClient } from "pg";
import { executeTokyoMigrations, preflightTokyoMigration, classifyTokyoInitialization } from "../../../scripts/run-tokyo-supabase-migrations.mjs";
import { runPostgresMigrations } from "../../../scripts/run-postgres-migrations.mjs";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const initdb = "/opt/homebrew/opt/postgresql@17/bin/initdb";
const pgCtl = "/opt/homebrew/opt/postgresql@17/bin/pg_ctl";
const baseMigrations = path.join(repo, "db/migrations");
const ref = "ilujuwuzaqwcbpnqixen";
const routeUser = `postgres.${ref}`;
const first38 = "20260904_001_runtime_external_auth_subject_execute.sql";
const requiredTables = ["import_jobs", "attachments", "private_attachment_blobs", "attachment_links", "audit_logs"];
const referenceTables = ["users", "brokerage_cases"];
const expectedPolicies = ["brokerdesk_import_worker_claim_select", "brokerdesk_import_worker_claim_update"];

function sqlError(error) {
  return { message: error.message, code: error.code ?? null, detail: error.detail ?? null, hint: error.hint ?? null };
}

async function query(client, text, values) {
  return (await client.query(text, values)).rows;
}

async function copyMigrations(destination, failing = false) {
  await mkdir(destination, { recursive: true });
  const names = (await readdir(baseMigrations)).filter((name) => /^\d{8}_\d{3}_.+\.sql$/.test(name)).sort();
  for (const name of names) {
    if (!failing || name !== "20260921_002_import_worker_rls_admin_policy.sql") {
      await cp(path.join(baseMigrations, name), path.join(destination, name));
      continue;
    }
    const original = await readFile(path.join(baseMigrations, name), "utf8");
    await writeFile(path.join(destination, name), original.replace(/\nCOMMIT;\s*$/i, "\nSELECT 1 / 0;\nCOMMIT;\n"));
  }
  return names;
}

function localClientClass(localConfig) {
  return class LocalClient extends PgClient {
    constructor() { super(localConfig); }
    async connect() {
      await super.connect();
      await super.query("SET search_path = public");
    }
  };
}

async function startCluster() {
  console.error("stage:startCluster");
  const root = await mkdtemp(path.join(os.tmpdir(), "broker-desk-pg17-"));
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const logFile = path.join(root, "server.log");
  await mkdir(socket);
  const port = 55_400 + Math.floor(Math.random() * 300);
  console.error("stage:initdb", data);
  const init = spawnSync(initdb, ["-D", data, "-A", "trust", "-U", "platform_bootstrap"], { encoding: "utf8" });
  console.error("stage:initdbDone", init.status);
  if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr}`);
  const started = spawnSync(pgCtl, ["-D", data, "-l", logFile, "-o", `-p ${port} -k ${socket}`, "-w", "-t", "20", "start"], { stdio: "ignore" });
  if (started.status !== 0) throw new Error(`pg_ctl start failed: ${started.stderr}`);
  console.error("stage:clusterStarted", port);
  const stop = () => spawnSync(pgCtl, ["-D", data, "-w", "stop"], { stdio: "ignore" });
  return { root, data, socket, port, logFile, bootstrapConfig: { host: socket, port, database: "postgres", user: "platform_bootstrap" }, localConfig: { host: socket, port, database: "postgres", user: "postgres" }, stop };
}

async function setupFixture(local) {
  console.error("stage:setupFixture");
  const admin = new PgClient(local.bootstrapConfig);
  admin.on("error", (error) => console.error("stage:adminError", sqlError(error)));
  await admin.connect();
  const seedDir = path.join(local.root, "migrations38");
  const names = await copyMigrations(seedDir);
  const seed = await runPostgresMigrations({ client: admin, clientConfig: local.localConfig, migrationsDirectory: seedDir, prepareEmptyDatabase: true, stopAfter: first38, log: () => undefined });
  console.error("stage:seeded", seed);
  if (seed.appliedCount !== 38) throw new Error(`seed applied ${seed.appliedCount}, expected 38`);

  await admin.end();
  const bootstrap = new PgClient(local.bootstrapConfig);
  await bootstrap.connect();
  await bootstrap.query("CREATE ROLE postgres LOGIN NOSUPERUSER CREATEDB CREATEROLE BYPASSRLS");
  // Normalize the one-time fixture to the current Tokyo snapshot. The
  // bootstrap role is not used after this point; operational grants,
  // migrations, and cleanup all run as non-superuser postgres.
  await bootstrap.query("ALTER DATABASE postgres OWNER TO postgres");
  await bootstrap.query("ALTER ROLE postgres NOSUPERUSER CREATEDB CREATEROLE BYPASSRLS LOGIN");
  await bootstrap.query("ALTER TABLE public.broker_desk_schema_migrations OWNER TO postgres");
  for (const table of requiredTables) {
    await bootstrap.query(`ALTER TABLE public.${table} OWNER TO postgres`);
    await bootstrap.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    await bootstrap.query(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`);
  }
  // The cloud snapshot shows postgres as the effective owner/grantor for the
  // two pre-existing referenced tables. Only these tables need a temporary
  // REFERENCES grant for migrations executed as brokerdesk_admin.
  for (const table of referenceTables) await bootstrap.query(`ALTER TABLE public.${table} OWNER TO postgres`);
  await bootstrap.query("ALTER SCHEMA brokerdesk_private OWNER TO postgres");
  await bootstrap.query(`DO $$
DECLARE function_row RECORD;
BEGIN
  FOR function_row IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS arguments
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'brokerdesk_private'
  LOOP
    EXECUTE format('ALTER FUNCTION %I.%I(%s) OWNER TO postgres', function_row.nspname, function_row.proname, function_row.arguments);
  END LOOP;
END
$$`);
  // Preserve the cloud-observed baseline membership, but do not pre-grant
  // temporary schema CREATE or REFERENCES privileges.
  await bootstrap.query("GRANT brokerdesk_admin TO postgres WITH INHERIT FALSE, SET FALSE, ADMIN TRUE");
  await bootstrap.query("GRANT brokerdesk_runtime TO postgres WITH INHERIT FALSE, SET FALSE, ADMIN TRUE");
  for (const role of ["anon", "authenticated", "service_role"]) {
    await bootstrap.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  }
  await bootstrap.end();
  const baseline = new PgClient(local.localConfig);
  await baseline.connect();
  // These are cloud-observed baseline ACLs, granted by the non-superuser
  // postgres after ownership normalization and before the operational window.
  await baseline.query("GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role");
  await baseline.query("GRANT USAGE ON SCHEMA brokerdesk_private TO authenticated");
  await baseline.query("CREATE TABLE public.broker_desk_initialization_control (id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id), project_ref TEXT NOT NULL, phase TEXT NOT NULL CHECK (phase IN ('initializing', 'complete')), started_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await baseline.query("ALTER TABLE public.broker_desk_initialization_control OWNER TO postgres");
  await baseline.query("INSERT INTO public.broker_desk_initialization_control (id, project_ref, phase) VALUES (TRUE, $1, 'initializing')", [ref]);
  await baseline.end();
  console.error("stage:fixtureReady");
  return { names };
}

async function snapshot(client) {
  return {
    database: await query(client, "SELECT current_database() AS database_name, pg_get_userbyid(datdba) AS database_owner, current_user, session_user FROM pg_database WHERE datname = current_database()"),
    schema: await query(client, `SELECT n.nspname AS schema_name, pg_get_userbyid(n.nspowner) AS schema_owner, has_schema_privilege('brokerdesk_admin','public','USAGE') AS admin_usage, has_schema_privilege('brokerdesk_admin','public','CREATE') AS admin_create, has_schema_privilege('postgres','public','USAGE') AS postgres_usage, has_schema_privilege('postgres','public','CREATE') AS postgres_create, n.nspacl::text AS nspacl, COALESCE((SELECT json_agg(x ORDER BY x.grantee, x.privilege_type) FROM (SELECT (aclexplode(n.nspacl)).grantee::regrole::text AS grantee, (aclexplode(n.nspacl)).privilege_type, (aclexplode(n.nspacl)).grantor::regrole::text AS grantor, (aclexplode(n.nspacl)).is_grantable AS is_grantable) x), '[]'::json) AS acl FROM pg_namespace n WHERE n.nspname='public'`),
    privateSchema: await query(client, `SELECT n.nspname AS schema_name, pg_get_userbyid(n.nspowner) AS schema_owner, has_schema_privilege('brokerdesk_admin','brokerdesk_private','USAGE') AS admin_usage, has_schema_privilege('brokerdesk_admin','brokerdesk_private','CREATE') AS admin_create, n.nspacl::text AS nspacl, COALESCE((SELECT json_agg(x ORDER BY x.grantee, x.privilege_type) FROM (SELECT (aclexplode(n.nspacl)).grantee::regrole::text AS grantee, (aclexplode(n.nspacl)).privilege_type, (aclexplode(n.nspacl)).grantor::regrole::text AS grantor, (aclexplode(n.nspacl)).is_grantable AS is_grantable) x), '[]'::json) AS acl FROM pg_namespace n WHERE n.nspname='brokerdesk_private'`),
    prerequisiteReferences: await query(client, "SELECT table_name, has_table_privilege('brokerdesk_admin', format('public.%I', table_name), 'REFERENCES') AS admin_references FROM (VALUES ('users'), ('brokerage_cases'), ('import_jobs'), ('attachments')) AS t(table_name)"),
    referenceTableOwnership: await query(client, "SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.relacl::text AS relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname", [referenceTables]),
    tableOwnership: await query(client, "SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.relacl::text AS relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname", [requiredTables]),
    functionOwnership: await query(client, "SELECT pg_get_userbyid(p.proowner) AS owner, count(*)::int AS function_count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='brokerdesk_private' GROUP BY p.proowner ORDER BY owner"),
    memberships: await query(client, `SELECT member.rolname AS member, role.rolname AS role, grantor.rolname AS grantor, m.admin_option AS admin, m.inherit_option AS inherit, m.set_option AS set_option FROM pg_auth_members m JOIN pg_roles role ON role.oid=m.roleid JOIN pg_roles member ON member.oid=m.member JOIN pg_roles grantor ON grantor.oid=m.grantor WHERE member.rolname='postgres' AND role.rolname IN ('brokerdesk_admin','brokerdesk_runtime') ORDER BY role.rolname, grantor.rolname`),
    roles: await query(client, "SELECT rolname, rolsuper, rolcreaterole, rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','brokerdesk_admin','brokerdesk_runtime','postgres') ORDER BY rolname"),
  };
}

async function setupPermissions(local) {
  console.error("stage:setupPermissions");
  const postgres = new PgClient(local.localConfig);
  await postgres.connect();
  const before = await snapshot(postgres);
  const statements = [
    "GRANT brokerdesk_admin TO postgres WITH INHERIT FALSE, SET TRUE, ADMIN FALSE",
    "GRANT CREATE ON SCHEMA public TO brokerdesk_admin",
    "GRANT CREATE ON SCHEMA brokerdesk_private TO brokerdesk_admin",
    "GRANT REFERENCES ON TABLE public.users, public.brokerage_cases TO brokerdesk_admin",
  ];
  for (const statement of statements) await postgres.query(statement);
  const after = await snapshot(postgres);
  const authority = await query(postgres, "SELECT current_user, session_user, current_database(), (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()) AS database_owner, has_schema_privilege(current_user, 'public', 'CREATE') AS can_grant_public_create, has_schema_privilege(current_user, 'brokerdesk_private', 'CREATE') AS can_grant_private_create");
  await postgres.end();
  return { grantor: "postgres", statements, authority, before, after };
}

async function cleanupPermissions(local) {
  const postgres = new PgClient(local.localConfig);
  await postgres.connect();
  const statements = [
    "REVOKE CREATE ON SCHEMA public FROM brokerdesk_admin",
    "REVOKE CREATE ON SCHEMA brokerdesk_private FROM brokerdesk_admin",
    "REVOKE REFERENCES ON TABLE public.users, public.brokerage_cases FROM brokerdesk_admin",
    "REVOKE brokerdesk_admin FROM postgres",
  ];
  for (const statement of statements) await postgres.query(statement);
  const final = await snapshot(postgres);
  let setRoleError = null;
  try { await postgres.query("SET ROLE brokerdesk_admin"); } catch (error) { setRoleError = sqlError(error); }
  await postgres.end();
  return { revokeExecutor: "postgres", statements, final, setRoleError };
}

/*
 * Keep the old owner-mismatch observation explicit in the evidence. It is not
 * rerun here: the old fixture changed database ownership to platform_db_owner,
 * so the previous GRANT CREATE failure was not a valid model of Tokyo.
 */
const legacyOwnerMismatch = {
  oldFixtureDatabaseOwner: "platform_db_owner",
  correctedFixtureDatabaseOwner: "postgres",
  interpretation: "The prior cannot-grant-public-CREATE result came from a database-owner mismatch and is superseded by the corrected model.",
};

async function runScenario({ failing }) {
  console.error("stage:scenario", failing ? "failure" : "success");
  const local = await startCluster();
  try {
    await setupFixture(local);
    const perms = await setupPermissions(local);
    const migrationDir = path.join(local.root, failing ? "migrations-failing" : "migrations");
    await copyMigrations(migrationDir, failing);
    const config = { ...local.localConfig, user: routeUser, options: "-c search_path=public" };
    const ClientConstructor = localClientClass(local.localConfig);
    const environment = { BROKER_DESK_DEPLOYMENT_ENV: "staging", VERCEL_ENV: "preview", BROKER_DESK_TOKYO_MIGRATIONS_APPROVED: "true", BROKER_DESK_PREPARE_EMPTY_DB: "true" };
    let runResult = null;
    let runError = null;
    try {
      runResult = await executeTokyoMigrations({ config, args: ["--prepare-empty-db"], environment, ClientConstructor, migrationsDirectory: migrationDir, log: () => undefined });
    } catch (error) { runError = sqlError(error); }
    const probe = new PgClient(local.localConfig);
    await probe.connect();
    const marker = await query(probe, "SELECT project_ref, phase FROM public.broker_desk_initialization_control");
    const ledger = await query(probe, "SELECT name, checksum FROM public.broker_desk_schema_migrations ORDER BY name");
    const tables = await query(probe, "SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname", [requiredTables]);
    const policies = await query(probe, "SELECT polname FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND polname=ANY($1::text[]) ORDER BY polname", [expectedPolicies]);
    await probe.end();
    const cleanup = await cleanupPermissions(local);
    const verify = new PgClient(local.localConfig);
    await verify.connect();
    const postCleanup = await snapshot(verify);
    const state = await preflightTokyoMigration({ config, ClientConstructor, client: verify });
    const classification = await classifyTokyoInitialization(state, migrationDir);
    await verify.end();
    return { queriedAtUtc: new Date().toISOString(), postgresVersion: "17.11", failing, legacyOwnerMismatch, permissionAuthority: perms, runResult, runError, marker, ledgerCount: ledger.length, ledgerTail: ledger.slice(-3), tables, policies, cleanup, postCleanup, classification };
  } catch (error) {
    console.error("stage:scenarioError", error.stack || error);
    try { console.error(await readFile(local.logFile, "utf8")); } catch {}
    throw error;
  } finally {
    local.stop();
    await rm(local.root, { recursive: true, force: true });
  }
}

const output = { success: await runScenario({ failing: false }), failure: await runScenario({ failing: true }) };
console.log(JSON.stringify(output, null, 2));
