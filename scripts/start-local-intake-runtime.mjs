#!/usr/bin/env node

/**
 * Start the durable local PostgreSQL runtime used by unified intake.
 *
 * The database owner is used only for migration/bootstrap work. The app is
 * always given brokerdesk_runtime, a non-superuser/non-BYPASSRLS role. This
 * script never loads an env file and never prints credentials.
 */
import { randomBytes } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import net from "node:net";
import pg from "pg";
import { runPostgresMigrations } from "./run-postgres-migrations.mjs";

const { Client } = pg;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = path.resolve(process.env.BROKER_DESK_LOCAL_RUNTIME_DIR?.trim() || path.join(repoRoot, ".broker-desk", "local-intake"));
const pgDataDirectory = path.join(runtimeRoot, "postgres");
const pgLogPath = path.join(runtimeRoot, "postgres.log");
const appLogPath = path.join(runtimeRoot, "app.log");
const runtimeEnvPath = path.join(runtimeRoot, "runtime.env");
const pgPort = Number(process.env.BROKER_DESK_LOCAL_PG_PORT || 55460);
const appPort = Number(process.env.BROKER_DESK_LOCAL_APP_PORT || 3004);
const databaseName = process.env.BROKER_DESK_LOCAL_PG_DATABASE?.trim() || "broker_desk_local_intake";
const databaseUser = process.env.BROKER_DESK_LOCAL_PG_USER?.trim() || "postgres";

if (!Number.isInteger(pgPort) || pgPort < 1024 || pgPort > 65535) throw new Error("BROKER_DESK_LOCAL_PG_PORT must be a valid local TCP port");
if (!Number.isInteger(appPort) || appPort < 1024 || appPort > 65535) throw new Error("BROKER_DESK_LOCAL_APP_PORT must be a valid local TCP port");
if (!/^[a-z_][a-z0-9_]*$/i.test(databaseName)) throw new Error("BROKER_DESK_LOCAL_PG_DATABASE must be a plain PostgreSQL identifier");
if (!/^[a-z_][a-z0-9_]*$/i.test(databaseUser)) throw new Error("BROKER_DESK_LOCAL_PG_USER must be a plain PostgreSQL role identifier");

const candidatePgBins = [
  process.env.BROKER_DESK_LOCAL_PG_BIN?.trim(),
  "/opt/homebrew/opt/postgresql@17/bin",
  "/opt/homebrew/opt/postgresql@16/bin",
].filter(Boolean);
const pgBin = candidatePgBins.find((candidate) => existsSync(path.join(candidate, "pg_ctl")) && existsSync(path.join(candidate, "initdb")));
if (!pgBin) throw new Error("PostgreSQL 17 or 16 Homebrew binaries are required; set BROKER_DESK_LOCAL_PG_BIN to the bin directory");

mkdirSync(runtimeRoot, { recursive: true });

function runPostgresBinary(name, args) {
  return execFileSync(path.join(pgBin, name), args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, PATH: `${pgBin}:/usr/bin:/bin`, LANG: "C" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function isTcpPortOccupied(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (occupied) => {
      socket.destroy();
      resolve(occupied);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

async function isPostgresRunning() {
  if (!(await isTcpPortOccupied(pgPort))) return false;
  const probe = new Client({
    connectionString: `postgresql://${databaseUser}@127.0.0.1:${pgPort}/postgres`,
    connectionTimeoutMillis: 2000,
  });
  try {
    await probe.connect();
    const result = await probe.query("SELECT current_setting('data_directory') AS data_directory, current_setting('fsync') AS fsync");
    const actualDataDirectory = realpathSync(result.rows[0]?.data_directory || "");
    const expectedDataDirectory = realpathSync(pgDataDirectory);
    if (actualDataDirectory !== expectedDataDirectory) {
      throw new Error(`PostgreSQL port ${pgPort} belongs to ${actualDataDirectory}, expected ${expectedDataDirectory}`);
    }
    if (String(result.rows[0]?.fsync).toLowerCase() !== "on") {
      throw new Error(`PostgreSQL runtime at ${expectedDataDirectory} has fsync=${result.rows[0]?.fsync}; refusing a non-durable cluster`);
    }
    return true;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

function roleUrl(baseUrl, role, password) {
  const url = new URL(baseUrl);
  url.username = role;
  url.password = password;
  return url.toString();
}

function readAuthorizedOpenAiKey() {
  const authorizedEnvPath = path.resolve(repoRoot, "..", "broker-desk-web-dev", ".env.local");
  if (!existsSync(authorizedEnvPath)) return undefined;
  const line = readFileSync(authorizedEnvPath, "utf8")
    .split(/\r?\n/)
    .find((entry) => /^\s*OPENAI_API_KEY\s*=/.test(entry));
  if (!line) return undefined;
  const value = line.replace(/^\s*OPENAI_API_KEY\s*=\s*/, "").trim();
  if (!value) return undefined;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

async function configureRuntimeRoles(client, { runtimePassword, adminPassword }) {
  // base64url output contains no quote characters; the escaping keeps this
  // safe even if the password source changes in a future revision.
  const quotePassword = (value) => `'${value.replaceAll("'", "''")}'`;
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
        CREATE ROLE brokerdesk_runtime NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_admin') THEN
        CREATE ROLE brokerdesk_admin NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      END IF;
    END $$;
  `);
  await client.query(`ALTER ROLE brokerdesk_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${quotePassword(runtimePassword)}`);
  await client.query(`ALTER ROLE brokerdesk_admin LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${quotePassword(adminPassword)}`);

  await client.query("REVOKE ALL ON SCHEMA public FROM brokerdesk_runtime, brokerdesk_admin");
  await client.query("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM brokerdesk_runtime, brokerdesk_admin");
  await client.query("REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM brokerdesk_runtime, brokerdesk_admin");
  await client.query(readFileSync(path.join(repoRoot, "db", "migrations", "20260902_003_runtime_acl_baseline.sql"), "utf8"));
  await client.query("REVOKE REFERENCES ON TABLE public.users, public.tenants, public.attachments, public.brokerage_cases, public.import_jobs, public.object_import_targets FROM brokerdesk_runtime");
  await client.query("GRANT SELECT, INSERT, UPDATE ON TABLE public.object_import_targets, public.object_import_fields TO brokerdesk_runtime");
  await client.query("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO brokerdesk_runtime");

  await client.query(`
    GRANT USAGE ON SCHEMA public TO brokerdesk_admin;
    GRANT SELECT (id, external_auth_subject) ON public.users TO brokerdesk_admin;
    GRANT SELECT (id, status, service_start_at, service_end_at) ON public.tenants TO brokerdesk_admin;
    GRANT SELECT, UPDATE ON public.tenant_memberships TO brokerdesk_admin;
    GRANT SELECT, UPDATE ON public.import_jobs TO brokerdesk_admin;
    GRANT SELECT, DELETE ON public.attachments, public.private_attachment_blobs TO brokerdesk_admin;
    GRANT SELECT ON public.attachment_links TO brokerdesk_admin;
    GRANT INSERT ON public.audit_logs TO brokerdesk_admin;
    GRANT REFERENCES ON public.users, public.tenants TO brokerdesk_admin;
    GRANT UPDATE (updated_at) ON public.tenants TO brokerdesk_admin;
    GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_runtime, brokerdesk_admin;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.current_external_auth_subject() TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.current_user_id() TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_tenant(TEXT) TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_user(TEXT) TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.publish_official_template_layout(TEXT,TEXT,TEXT,TEXT,JSONB,TEXT) TO brokerdesk_runtime;
    REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA brokerdesk_private FROM brokerdesk_admin;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_tenant(TEXT) TO brokerdesk_admin;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.current_user_id() TO brokerdesk_admin;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_user(TEXT) TO brokerdesk_admin;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.sync_external_auth_user(TEXT, TEXT, TEXT) TO brokerdesk_admin;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.suspend_external_auth_user(TEXT) TO brokerdesk_admin;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.claim_next_import_jobs(INTEGER) TO brokerdesk_admin;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.claim_import_job_by_id(TEXT) TO brokerdesk_admin;
  `);
}

async function normalizeLocalBusinessTableOwnership(client, ownershipRole) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(ownershipRole)) {
    throw new Error("local migration ownership role must be a plain PostgreSQL role identifier");
  }
  const quoteIdentifier = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const tables = await client.query(`
    SELECT c.relname
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ORDER BY c.relname
  `);
  for (const row of tables.rows) {
    await client.query(`ALTER TABLE public.${quoteIdentifier(row.relname)} OWNER TO ${quoteIdentifier(ownershipRole)}`);
  }
}

if (await isTcpPortOccupied(appPort)) {
  throw new Error(`Local intake app port ${appPort} is already occupied; refusing to rotate runtime credentials or mutate the database`);
}

if (!existsSync(path.join(pgDataDirectory, "PG_VERSION"))) {
  mkdirSync(pgDataDirectory, { recursive: true });
  runPostgresBinary("initdb", [
    "-D", pgDataDirectory,
    "-U", databaseUser,
    "--no-locale",
    "--encoding=UTF8",
    "--auth-local=trust",
    "--auth-host=trust",
  ]);
}

if (!(await isPostgresRunning())) {
  runPostgresBinary("pg_ctl", [
    "-D", pgDataDirectory,
    "-o", `-p ${pgPort} -h 127.0.0.1`,
    "-l", pgLogPath,
    "-w",
    "start",
  ]);
  if (!(await isPostgresRunning())) throw new Error(`PostgreSQL did not become ready on 127.0.0.1:${pgPort}`);
}

const adminUrl = `postgresql://${databaseUser}@127.0.0.1:${pgPort}/postgres`;
const databaseUrl = `postgresql://${databaseUser}@127.0.0.1:${pgPort}/${databaseName}`;
const runtimePassword = randomBytes(32).toString("base64url");
const adminPassword = randomBytes(32).toString("base64url");
const runtimeDatabaseUrl = roleUrl(databaseUrl, "brokerdesk_runtime", runtimePassword);
const lifecycleAdminUrl = roleUrl(databaseUrl, "brokerdesk_admin", adminPassword);

const admin = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 10000 });
await admin.connect();
try {
  const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
  if (existing.rowCount === 0) await admin.query(`CREATE DATABASE "${databaseName}"`);
} finally {
  await admin.end();
}

const migrationProbe = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10000 });
await migrationProbe.connect();
const migrationLedger = await migrationProbe.query("SELECT to_regclass('public.broker_desk_schema_migrations') IS NOT NULL AS exists");
const hasPreimportMigration = migrationLedger.rows[0]?.exists
  ? await migrationProbe.query("SELECT EXISTS (SELECT 1 FROM broker_desk_schema_migrations WHERE name >= '20260908_001_preimport_upload_lifecycle.sql') AS applied")
  : { rows: [{ applied: false }] };
await migrationProbe.end();

const migrationResult = await runPostgresMigrations({
  databaseUrl,
  prepareEmptyDatabase: !hasPreimportMigration.rows[0]?.applied,
  log: (message) => process.stdout.write(`[db] ${message}\n`),
});

const db = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10000 });
await db.connect();
try {
  // The migration/bootstrap role owns local business tables. Runtime and
  // lifecycle roles receive only the grants declared below; neither becomes
  // an owner when the runtime is restarted.
  await normalizeLocalBusinessTableOwnership(db, databaseUser);
  await configureRuntimeRoles(db, { runtimePassword, adminPassword });
  await db.query("BEGIN");
  await db.query(`
    INSERT INTO users (id, name, email, password_hash, external_auth_subject)
    VALUES
      ('user_demo', 'Local Intake Owner', 'local-intake-owner@example.test', 'local-fixture', 'demo:user_demo'),
      ('user_ops', 'Local Intake Operator', 'local-intake-ops@example.test', 'local-fixture', 'demo:user_ops')
    ON CONFLICT (id) DO NOTHING`);
  await db.query(`
    INSERT INTO tenants (id, name, slug, account_type, status, purchased_seat_count)
    VALUES ('tenant_cherry', 'Local Intake Workspace', 'local-intake-workspace', 'company', 'active', 5)
    ON CONFLICT (id) DO NOTHING`);
  await db.query(`
    INSERT INTO tenant_memberships
      (id, tenant_id, user_id, role, capability, status, invitation_provider, invitation_status, invitation_accepted_at)
    VALUES
      ('membership_local_intake_owner', 'tenant_cherry', 'user_demo', 'tenant_owner', 'company_owner', 'active', 'manual', 'accepted', NOW()),
      ('membership_local_intake_ops', 'tenant_cherry', 'user_ops', 'broker', 'ordinary_member', 'active', 'manual', 'accepted', NOW())
    ON CONFLICT (id) DO NOTHING`);
  await db.query(`
    INSERT INTO clients
      (id, tenant_id, name, phone, purpose, stage, temperature, owner_user_id, created_by_user_id,
       current_owner_user_id, visibility_scope, owner_resolution_status)
    VALUES
      ('client_local_intake', 'tenant_cherry', '入力確認用 顧客', '09000000000', 'rent', 'lead', 'warm',
       'user_demo', 'user_demo', 'user_demo', 'private', 'resolved')
    ON CONFLICT (id) DO NOTHING`);
  await db.query(`
    INSERT INTO properties
      (id, tenant_id, name, area, address, listing_price, created_by_user_id, current_owner_user_id,
       visibility_scope, owner_resolution_status)
    VALUES
      ('property_local_intake', 'tenant_cherry', '入力確認用 物件', '福岡市中央区', '福岡市中央区天神1-1', 100000,
       'user_demo', 'user_demo', 'private', 'resolved')
    ON CONFLICT (id) DO NOTHING`);
  await db.query(`
    INSERT INTO brokerage_cases
      (id, tenant_id, user_id, case_type, case_title, primary_property_id, status, confirmed_data_json,
       source_import_job_ids, created_by_user_id, current_owner_user_id, visibility_scope, owner_resolution_status)
    VALUES
      ('case_local_intake', 'tenant_cherry', 'user_demo', 'unit_sale', '入力確認用 案件', 'property_local_intake',
       'draft', '{}'::jsonb, ARRAY[]::text[], 'user_demo', 'user_demo', 'private', 'resolved')
    ON CONFLICT (id) DO NOTHING`);
  await db.query("COMMIT");
} catch (error) {
  await db.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await db.end();
}

process.stdout.write("Local intake PostgreSQL is ready.\n");
process.stdout.write(`  data: ${pgDataDirectory}\n`);
process.stdout.write(`  log: ${pgLogPath}\n`);
process.stdout.write(`  database: ${databaseName} on 127.0.0.1:${pgPort}\n`);
process.stdout.write(`  migrations: ${migrationResult.appliedCount} applied, ${migrationResult.skippedCount} current\n`);

const runtimeEnv = [
  `DATABASE_URL=${runtimeDatabaseUrl}`,
  `DATABASE_DEVELOPMENT_URL=${runtimeDatabaseUrl}`,
  `DATABASE_ADMIN_URL=${lifecycleAdminUrl}`,
  "DATA_DRIVER=postgres",
  "BROKER_DESK_AUTH_MODE=demo",
  "BROKER_DESK_TEST_REQUEST_SCOPE=1",
  "ATTACHMENT_STORAGE_MODE=postgres_private",
  "BROKER_DESK_LOCAL_RUNTIME=1",
].join("\n") + "\n";
writeFileSync(runtimeEnvPath, runtimeEnv, { encoding: "utf8", mode: 0o600 });
chmodSync(runtimeEnvPath, 0o600);

if (process.argv.includes("--app")) {
  const childEnv = {
    ...process.env,
    DATABASE_URL: runtimeDatabaseUrl,
    DATABASE_DEVELOPMENT_URL: runtimeDatabaseUrl,
    DATABASE_ADMIN_URL: lifecycleAdminUrl,
    DATA_DRIVER: "postgres",
    BROKER_DESK_AUTH_MODE: "demo",
    BROKER_DESK_TEST_REQUEST_SCOPE: "1",
    ATTACHMENT_STORAGE_MODE: "postgres_private",
    BROKER_DESK_LOCAL_RUNTIME: "1",
    BROKER_DESK_AUTH_PROVIDER: "",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
    CLERK_SECRET_KEY: "",
  };
  const authorizedOpenAiKey = readAuthorizedOpenAiKey();
  if (authorizedOpenAiKey) childEnv.OPENAI_API_KEY = authorizedOpenAiKey;
  chmodSync(runtimeRoot, 0o700);
  const appLogFd = openSync(appLogPath, "a", 0o600);
  chmodSync(appLogPath, 0o600);
  process.stdout.write(`  app log: ${appLogPath}\n`);
  process.stdout.write(`  document reader key: ${authorizedOpenAiKey ? "configured" : "not configured"}\n`);
  const nextBinary = path.join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");
  if (!existsSync(nextBinary)) {
    closeSync(appLogFd);
    throw new Error(`Next.js binary not found at ${nextBinary}`);
  }
  const app = spawn(nextBinary, ["dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(appPort)], {
    cwd: repoRoot,
    env: childEnv,
    stdio: ["ignore", appLogFd, appLogFd],
  });
  const stopApp = () => {
    if (!app.killed) app.kill("SIGTERM");
  };
  process.once("SIGINT", stopApp);
  process.once("SIGTERM", stopApp);
  try {
    await new Promise((resolve, reject) => {
      app.once("error", reject);
      app.once("exit", (code, signal) => {
        if (code === 0 || signal === "SIGTERM" || signal === "SIGINT") resolve();
        else reject(new Error(`app exited with ${code ?? signal}`));
      });
    });
  } finally {
    closeSync(appLogFd);
  }
}
