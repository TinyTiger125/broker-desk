#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import path from "node:path";
import { Client } from "pg";
import { buildSupabasePoolConfig } from "./bootstrap-initial-supabase-owner.mjs";
import { assertNoPgEnvironment } from "./bootstrap-initial-platform-owner.mjs";
import {
  DEFAULT_CONNECTION_TIMEOUT_MS,
  DEFAULT_LOCK_TIMEOUT_MS,
  DEFAULT_STATEMENT_TIMEOUT_MS,
  runPostgresMigrations,
} from "./run-postgres-migrations.mjs";

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

export async function preflightTokyoMigration({ config, ClientConstructor = Client }) {
  const client = new ClientConstructor(config);
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const identity = (await client.query("SELECT current_database() AS database, current_user AS user_name, current_schema() AS schema, current_schemas(false) AS schemas, current_setting('transaction_read_only') AS transaction_read_only")).rows[0];
    const inventory = (await client.query("SELECT to_regclass('public.broker_desk_schema_migrations') IS NOT NULL AS ledger_exists, to_regclass('public.tenants') IS NOT NULL AS tenants_exists")).rows[0];
    const ledgerCount = inventory.ledger_exists
      ? Number((await client.query("SELECT count(*) AS count FROM public.broker_desk_schema_migrations")).rows[0].count)
      : 0;
    await client.query("ROLLBACK");
    if (identity.database !== "postgres" || identity.user_name !== config.user || !identity.schemas?.includes("public") || identity.transaction_read_only !== "on") {
      throw new Error("Tokyo migration identity preflight failed");
    }
    return { database: identity.database, user: identity.user_name, schema: identity.schema, ledgerExists: inventory.ledger_exists, tenantsExists: inventory.tenants_exists, ledgerCount };
  } finally {
    await client.end();
  }
}

async function runFromCommandLine() {
  const args = process.argv.slice(2);
  if (args.some((argument) => !["--preflight", "--prepare-empty-db"].includes(argument)) || (args.includes("--preflight") && args.includes("--prepare-empty-db"))) {
    throw new Error("Use --preflight or --prepare-empty-db; do not combine them");
  }
  const config = buildTokyoMigrationConfig();
  const preflight = await preflightTokyoMigration({ config });
  console.log(JSON.stringify({ preflight }));
  if (args.includes("--preflight")) return;
  if (process.env.BROKER_DESK_TOKYO_MIGRATIONS_APPROVED !== "true") {
    throw new Error("BROKER_DESK_TOKYO_MIGRATIONS_APPROVED=true is required for Tokyo migration writes");
  }
  const prepareEmptyDatabase = args.includes("--prepare-empty-db");
  if (prepareEmptyDatabase && (preflight.ledgerExists || preflight.tenantsExists)) {
    throw new Error("Tokyo empty-database preparation requires no existing migration ledger or tenant table");
  }
  if (prepareEmptyDatabase && process.env.BROKER_DESK_PREPARE_EMPTY_DB !== "true") {
    throw new Error("BROKER_DESK_PREPARE_EMPTY_DB=true is required for empty-database preparation");
  }
  await runPostgresMigrations({
    clientConfig: config,
    prepareEmptyDatabase,
    connectionTimeoutMillis: DEFAULT_CONNECTION_TIMEOUT_MS,
    lockTimeoutMillis: DEFAULT_LOCK_TIMEOUT_MS,
    statementTimeoutMillis: DEFAULT_STATEMENT_TIMEOUT_MS,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runFromCommandLine();
}
