import pg from "pg";
import { executeTokyoMigrations } from "./run-tokyo-supabase-migrations.mjs";

const { Client } = pg;
const database = process.argv[2];
const port = Number(process.argv[3]);
const projectRef = "ilujuwuzaqwcbpnqixen";

if (!database || !Number.isInteger(port)) throw new Error("database and port are required");

// This adapter only normalizes current_database() for the fixed Tokyo entry
// identity check. All queries and connection failures remain real pg traffic.
class LocalIdentityClient {
  constructor(config) {
    this.inner = new Client({ ...config, user: "postgres" });
  }

  async connect() { return this.inner.connect(); }

  async query(sql, params) {
    const result = await this.inner.query(sql, params);
    if (String(sql).includes("current_database()") && result.rows[0]) result.rows[0].database = "postgres";
    return result;
  }

  async end() { return this.inner.end(); }
}

await executeTokyoMigrations({
  config: {
    user: `postgres.${projectRef}`,
    database,
    port,
    host: "127.0.0.1",
    application_name: "broker-desk-entry-subprocess",
  },
  ClientConstructor: LocalIdentityClient,
  args: ["--prepare-empty-db"],
  environment: {
    BROKER_DESK_TOKYO_MIGRATIONS_APPROVED: "true",
    BROKER_DESK_PREPARE_EMPTY_DB: "true",
  },
  log: (message) => console.log(String(message)),
});
