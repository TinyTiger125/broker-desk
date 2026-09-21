#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import {
  assertSafeMigrationSql,
  buildEmptyDatabasePrerequisiteSql,
} from "./postgres-migration-runner-utils.mjs";

export const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;
export const DEFAULT_LOCK_TIMEOUT_MS = 10_000;
export const DEFAULT_STATEMENT_TIMEOUT_MS = 60_000;
const MIGRATION_LEDGER_SQL = `
  CREATE TABLE IF NOT EXISTS broker_desk_schema_migrations (
    name TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
const EMPTY_DATABASE_BOUNDARY = "20260908_001_preimport_upload_lifecycle.sql";

export class MigrationOutcomeUncertainError extends Error {
  constructor(name, cause) {
    super(`Migration outcome is uncertain for ${name}; inspect the migration ledger before retrying.`);
    this.name = "MigrationOutcomeUncertainError";
    this.cause = cause;
  }
}

function isConnectionUncertain(error) {
  const code = error?.code;
  return ["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "57P01", "57P02", "57P03"].includes(code)
    || (typeof code === "string" && /^08/.test(code));
}

function assertTimeout(name, value) {
  if (!Number.isInteger(value) || value < 1_000 || value > 60_000) {
    throw new Error(`${name} must be an integer between 1000 and 60000 milliseconds`);
  }
}

async function rollbackAfterFailure(client, error, name = "current migration") {
  if (isConnectionUncertain(error)) throw new MigrationOutcomeUncertainError(name, error);
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    if (isConnectionUncertain(rollbackError)) throw new MigrationOutcomeUncertainError(name, rollbackError);
    throw rollbackError;
  }
  throw error;
}

async function runPrerequisiteTransaction(client, sql, name) {
  await client.query("BEGIN");
  let commitAttempted = false;
  try {
    await client.query(sql);
    commitAttempted = true;
    await client.query("COMMIT");
  } catch (error) {
    if (commitAttempted || isConnectionUncertain(error)) {
      throw new MigrationOutcomeUncertainError(name, error);
    }
    await rollbackAfterFailure(client, error, name);
  }
}

export async function runPostgresMigrations({
  Client: ClientConstructor = Client,
  databaseUrl,
  clientConfig = null,
  migrationsDirectory = path.resolve("db/migrations"),
  stopAfter = null,
  connectionTimeoutMillis = DEFAULT_CONNECTION_TIMEOUT_MS,
  lockTimeoutMillis = DEFAULT_LOCK_TIMEOUT_MS,
  statementTimeoutMillis = DEFAULT_STATEMENT_TIMEOUT_MS,
  prepareEmptyDatabase = false,
  log = console.log,
} = {}) {
  if (!databaseUrl && !clientConfig) throw new Error("An explicit migration database connection is required.");
  assertTimeout("connectionTimeoutMillis", connectionTimeoutMillis);
  assertTimeout("lockTimeoutMillis", lockTimeoutMillis);
  assertTimeout("statementTimeoutMillis", statementTimeoutMillis);

  const migrationNames = (await readdir(migrationsDirectory))
    .filter((name) => /^\d{8}_\d{3}_.+\.sql$/.test(name))
    .sort();
  if (migrationNames.length === 0) throw new Error("No SQL migrations were found in db/migrations.");

  const client = new ClientConstructor(clientConfig
    ? { ...clientConfig, connectionTimeoutMillis }
    : { connectionString: databaseUrl, connectionTimeoutMillis });
  let lockAcquired = false;
  let primaryError = null;
  let cleanupError = null;
  const result = { appliedCount: 0, skippedCount: 0, stoppedAfter: null };
  try {
    await client.connect();
    await client.query(`SET lock_timeout = '${lockTimeoutMillis}ms'`);
    await client.query(`SET statement_timeout = '${statementTimeoutMillis}ms'`);
    await client.query("SELECT pg_advisory_lock(hashtext('broker-desk-schema-migrations'))");
    lockAcquired = true;
    await client.query(MIGRATION_LEDGER_SQL);

    if (prepareEmptyDatabase) {
      const ledger = await client.query("SELECT name FROM broker_desk_schema_migrations");
      if (ledger.rows.some(({ name }) => name >= EMPTY_DATABASE_BOUNDARY)) {
        throw new Error(`--prepare-empty-db is only allowed before ${EMPTY_DATABASE_BOUNDARY} has been applied.`);
      }
      const { createRoles } = buildEmptyDatabasePrerequisiteSql();
      await runPrerequisiteTransaction(client, createRoles, "empty database role prerequisites");
      log("Prepared brokerdesk_runtime and brokerdesk_admin role prerequisites.");
    }

    for (const name of migrationNames) {
      const sql = await readFile(path.join(migrationsDirectory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query(
        "SELECT checksum FROM broker_desk_schema_migrations WHERE name = $1",
        [name],
      );

      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`Migration checksum mismatch: ${name}. Create a new migration instead of editing an applied one.`);
        }
        result.skippedCount += 1;
        if (name === stopAfter) {
          result.stoppedAfter = name;
          break;
        }
        continue;
      }

      if (prepareEmptyDatabase && name === EMPTY_DATABASE_BOUNDARY) {
        const { ownership } = buildEmptyDatabasePrerequisiteSql();
        await runPrerequisiteTransaction(client, ownership, "empty database table ownership prerequisites");
        log("Prepared 20260908 preimport table ownership and FORCE RLS prerequisites.");
      }

      const executionSql = assertSafeMigrationSql(sql, name);
      await client.query("BEGIN");
      let commitAttempted = false;
      try {
        await client.query(executionSql);
        await client.query(
          "INSERT INTO broker_desk_schema_migrations (name, checksum) VALUES ($1, $2)",
          [name, checksum],
        );
        commitAttempted = true;
        await client.query("COMMIT");
      } catch (error) {
        if (commitAttempted || isConnectionUncertain(error)) {
          throw new MigrationOutcomeUncertainError(name, error);
        }
        await rollbackAfterFailure(client, error, name);
      }
      result.appliedCount += 1;
      log(`Applied ${name}`);
      if (name === stopAfter) {
        result.stoppedAfter = name;
        break;
      }
    }
    if (!result.stoppedAfter) log(`Migration check complete: ${result.appliedCount} applied, ${result.skippedCount} already current.`);
    return result;
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      if (lockAcquired) await client.query("SELECT pg_advisory_unlock(hashtext('broker-desk-schema-migrations'))");
    } catch (error) {
      cleanupError = error;
    }
    try {
      await client.end();
    } catch (error) {
      cleanupError ??= error;
    }
    if (!primaryError && cleanupError) throw cleanupError;
  }
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

async function runFromCommandLine() {
  // Migration targets must be supplied explicitly. An ambient .env.local can
  // point at a different database and is never loaded by this command.
  if (process.env.NODE_ENV === "production" && process.env.BROKER_DESK_RUN_MIGRATIONS !== "true") {
    throw new Error("Set BROKER_DESK_RUN_MIGRATIONS=true before running production migrations.");
  }
  const stopAfter = readOption("--stop-after") ?? null;
  const prepareEmptyDatabase = process.argv.includes("--prepare-empty-db");
  if (prepareEmptyDatabase && process.env.BROKER_DESK_PREPARE_EMPTY_DB !== "true") {
    throw new Error("Pass BROKER_DESK_PREPARE_EMPTY_DB=true to explicitly enable empty-database prerequisite writes.");
  }
  const databaseUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_DEVELOPMENT_URL;
  if (databaseUrl) {
    const hostname = new URL(databaseUrl).hostname;
    if (hostname === "supabase.com" || hostname.endsWith(".supabase.com")) {
      throw new Error("Use db:migrate:tokyo for the pinned Supabase migration target and verified CA");
    }
  }
  await runPostgresMigrations({
    databaseUrl,
    stopAfter,
    connectionTimeoutMillis: Number(process.env.BROKER_DESK_MIGRATION_CONNECTION_TIMEOUT_MS ?? DEFAULT_CONNECTION_TIMEOUT_MS),
    lockTimeoutMillis: Number(process.env.BROKER_DESK_MIGRATION_LOCK_TIMEOUT_MS ?? DEFAULT_LOCK_TIMEOUT_MS),
    statementTimeoutMillis: Number(process.env.BROKER_DESK_MIGRATION_STATEMENT_TIMEOUT_MS ?? DEFAULT_STATEMENT_TIMEOUT_MS),
    prepareEmptyDatabase,
  });
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  await runFromCommandLine();
}
