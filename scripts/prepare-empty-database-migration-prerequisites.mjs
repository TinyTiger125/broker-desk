#!/usr/bin/env node
import { Client } from "pg";

const REQUIRED_TABLES = [
  "import_jobs",
  "attachments",
  "private_attachment_blobs",
  "attachment_links",
  "audit_logs",
];
const approved = process.env.BROKER_DESK_PREPARE_EMPTY_DATABASE_APPROVED === "true";
if (!approved) {
  throw new Error("Set BROKER_DESK_PREPARE_EMPTY_DATABASE_APPROVED=true for the controlled empty-database prerequisite step.");
}

const connectionString = (process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_DEVELOPMENT_URL ?? "").trim();
if (!connectionString) throw new Error("DATABASE_MIGRATION_URL or DATABASE_DEVELOPMENT_URL is required.");

const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '10s'");
  await client.query("SET LOCAL statement_timeout = '30s'");

  const identity = (await client.query("SELECT current_database() AS database, current_schema() AS schema, current_user AS user_name, current_setting('transaction_read_only') AS transaction_read_only")).rows[0];
  if (identity.schema !== "public" || identity.transaction_read_only !== "off") throw new Error("empty-database prerequisites require a writable public-schema migration connection");

  const ledgerExists = (await client.query("SELECT to_regclass('public.broker_desk_schema_migrations') AS ledger")).rows[0].ledger;
  if (!ledgerExists) throw new Error("run through 20260830_002_object_attachment_runtime_grant.sql before the empty-database prerequisite step");
  const ledger = (await client.query("SELECT name FROM broker_desk_schema_migrations")).rows;
  if (!ledger.some(({ name }) => name === "20260830_002_object_attachment_runtime_grant.sql")) {
    throw new Error("empty-database prerequisite step requires 20260830_002_object_attachment_runtime_grant.sql in the migration ledger");
  }
  if (ledger.some(({ name }) => name >= "20260908_001_preimport_upload_lifecycle.sql")) {
    throw new Error("empty-database prerequisite step must run before 20260908_001_preimport_upload_lifecycle.sql");
  }

  const currentRole = (await client.query("SELECT rolsuper, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = current_user")).rows[0];
  if (!currentRole?.rolsuper && !currentRole?.rolcreaterole) throw new Error("migration connection cannot create constrained roles");

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
        CREATE ROLE brokerdesk_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'brokerdesk_admin') THEN
        CREATE ROLE brokerdesk_admin NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      END IF;
    END
    $$;
  `);

  const roles = (await client.query("SELECT rolname, rolsuper, rolcreaterole, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname IN ('brokerdesk_runtime', 'brokerdesk_admin') ORDER BY rolname")).rows;
  if (roles.length !== 2 || roles.some((role) => role.rolsuper || role.rolcreaterole || role.rolbypassrls || role.rolcanlogin)) {
    throw new Error("runtime/admin roles must be NOLOGIN, NOSUPERUSER, NOCREATEROLE and NOBYPASSRLS");
  }

  const missing = (await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
    [REQUIRED_TABLES],
  )).rows;
  const present = new Set(missing.map((row) => row.table_name));
  const absent = REQUIRED_TABLES.filter((table) => !present.has(table));
  if (absent.length) throw new Error(`required migration tables are missing; stop before this step: ${absent.join(", ")}`);

  const canSetAdmin = (await client.query("SELECT pg_has_role(current_user, 'brokerdesk_admin', 'USAGE') AS can_set_admin")).rows[0].can_set_admin;
  if (!canSetAdmin) throw new Error("migration connection cannot SET ROLE brokerdesk_admin; refusing to change table owners");

  for (const table of REQUIRED_TABLES) {
    await client.query(`ALTER TABLE public.${table} OWNER TO brokerdesk_admin`);
    await client.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`);
  }

  await client.query("COMMIT");
  console.log(JSON.stringify({ ok: true, database: identity.database, schema: identity.schema, currentUser: identity.user_name, requiredTables: REQUIRED_TABLES, owner: "brokerdesk_admin", forceRls: true }));
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
