#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

// Node parses dotenv values correctly, including DATABASE_URL query strings.
// Do not source .env.local in a shell: '&' in a connection string becomes a
// shell control character and can silently break a migration command.
if (!process.env.DATABASE_URL && !process.env.DATABASE_MIGRATION_URL && !process.env.DATABASE_DEVELOPMENT_URL && existsSync(path.resolve(".env.local"))) {
  process.loadEnvFile(path.resolve(".env.local"));
}

const migrationsDirectory = path.resolve("db/migrations");
const databaseUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_DEVELOPMENT_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_MIGRATION_URL or DATABASE_DEVELOPMENT_URL is required to run database migrations.");
}

if (process.env.NODE_ENV === "production" && process.env.BROKER_DESK_RUN_MIGRATIONS !== "true") {
  throw new Error("Set BROKER_DESK_RUN_MIGRATIONS=true before running production migrations.");
}

const migrationNames = (await readdir(migrationsDirectory))
  .filter((name) => /^\d{8}_\d{3}_.+\.sql$/.test(name))
  .sort();

if (migrationNames.length === 0) {
  throw new Error("No SQL migrations were found in db/migrations.");
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query("SELECT pg_advisory_lock(hashtext('broker-desk-schema-migrations'))");
  await client.query(`
    CREATE TABLE IF NOT EXISTS broker_desk_schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  let appliedCount = 0;
  let skippedCount = 0;

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
      skippedCount += 1;
      continue;
    }

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO broker_desk_schema_migrations (name, checksum) VALUES ($1, $2)",
        [name, checksum],
      );
      await client.query("COMMIT");
      appliedCount += 1;
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  console.log(`Migration check complete: ${appliedCount} applied, ${skippedCount} already current.`);
} finally {
  try {
    await client.query("SELECT pg_advisory_unlock(hashtext('broker-desk-schema-migrations'))");
  } finally {
    await client.end();
  }
}
