import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  MigrationOutcomeUncertainError,
  runPostgresMigrations,
} from "./run-postgres-migrations.mjs";
import {
  EMPTY_DATABASE_PREREQUISITE_TABLES,
  buildEmptyDatabasePrerequisiteSql,
} from "./postgres-migration-runner-utils.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "brokerdesk-migration-runner-"));
const migrationsDirectory = path.join(root, "migrations");
await mkdir(migrationsDirectory);

const wrappedMigrations = [
  ["20260908_001_preimport_upload_lifecycle.sql", "-- preimport header\nBEGIN;\nSELECT '20260908';\nCOMMIT;\n"],
  ["20260921_002_import_worker_rls_admin_policy.sql", "/* worker header */\nBEGIN;\nSELECT '20260921';\nCOMMIT;\n"],
];
for (const [name, sql] of wrappedMigrations) await writeFile(path.join(migrationsDirectory, name), sql);

class FakeClient {
  static state = { ledger: new Map(), body: [], rolesPrepared: false, ownershipPrepared: false, instances: [] };
  static mode = {};

  constructor(config) {
    this.config = config;
    this.connected = false;
    this.inTransaction = false;
    this.snapshot = null;
    this.rollbackCount = 0;
    this.unlockCount = 0;
    this.endCount = 0;
    FakeClient.instances.push(this);
  }

  static reset({ ledger = new Map(), body = [], ...mode } = {}) {
    FakeClient.state = { ledger, body, rolesPrepared: false, ownershipPrepared: false, instances: [] };
    FakeClient.mode = mode;
    FakeClient.instances = [];
  }

  async connect() {
    if (FakeClient.mode.connectError) throw Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
    this.connected = true;
  }

  async query(text, params = []) {
    const sql = String(text).replace(/\s+/g, " ").trim();
    if (sql.startsWith("SET lock_timeout") && FakeClient.mode.lockError) throw Object.assign(new Error("lock timeout"), { code: "55P03" });
    if (sql.startsWith("SET lock_timeout")) return { rows: [], rowCount: 0 };
    if (sql.includes("pg_advisory_lock")) return { rows: [], rowCount: 0 };
    if (sql.includes("pg_advisory_unlock")) {
      this.unlockCount += 1;
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("CREATE TABLE IF NOT EXISTS")) return { rows: [], rowCount: 0 };
    if (sql === "SELECT name FROM broker_desk_schema_migrations") {
      return { rows: [...FakeClient.state.ledger.keys()].map((name) => ({ name })), rowCount: FakeClient.state.ledger.size };
    }
    if (sql.startsWith("SELECT checksum FROM")) {
      const checksum = FakeClient.state.ledger.get(params[0]);
      return checksum ? { rows: [{ checksum }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (sql === "BEGIN") {
      this.inTransaction = true;
      this.snapshot = { ledger: new Map(FakeClient.state.ledger), body: [...FakeClient.state.body] };
      return { rows: [], rowCount: 0 };
    }
    if (sql === "ROLLBACK") {
      this.rollbackCount += 1;
      FakeClient.state.ledger = this.snapshot.ledger;
      FakeClient.state.body = this.snapshot.body;
      this.inTransaction = false;
      return { rows: [], rowCount: 0 };
    }
    if (sql === "COMMIT") {
      if (FakeClient.mode.commitError) throw Object.assign(new Error("connection lost during commit"), { code: "08006" });
      this.inTransaction = false;
      return { rows: [], rowCount: 0 };
    }
    if (sql.startsWith("DO $$")) {
      FakeClient.state.rolesPrepared = true;
      return { rows: [], rowCount: 0 };
    }
    if (sql.startsWith("ALTER TABLE public.import_jobs OWNER TO brokerdesk_admin")) {
      FakeClient.state.ownershipPrepared = true;
      return { rows: [], rowCount: 0 };
    }
    if (sql.startsWith("INSERT INTO broker_desk_schema_migrations")) {
      if (FakeClient.mode.ledgerError) throw new Error("ledger write rejected");
      FakeClient.state.ledger.set(params[0], params[1]);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("SELECT '")) {
      FakeClient.state.body.push(sql.match(/SELECT '([^']+)'/)?.[1] ?? "body");
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`unexpected SQL in fake driver: ${sql}`);
  }

  async end() {
    this.endCount += 1;
  }
}

FakeClient.instances = [];

FakeClient.reset();
const first = await runPostgresMigrations({ Client: FakeClient, databaseUrl: "postgres://migration:test@example.test/db", migrationsDirectory, log: () => {} });
assert.deepEqual(first, { appliedCount: 2, skippedCount: 0, stoppedAfter: null });
assert.deepEqual(FakeClient.state.body, ["20260908", "20260921"]);
assert.equal(FakeClient.instances[0].config.connectionTimeoutMillis, 10_000);
assert.equal(FakeClient.instances[0].unlockCount, 1);
assert.equal(FakeClient.instances[0].endCount, 1);

const second = await runPostgresMigrations({ Client: FakeClient, databaseUrl: "postgres://migration:test@example.test/db", migrationsDirectory, log: () => {} });
assert.deepEqual(second, { appliedCount: 0, skippedCount: 2, stoppedAfter: null });

FakeClient.reset({ ledger: new Map([[wrappedMigrations[0][0], "wrong-checksum"]]) });
await assert.rejects(
  () => runPostgresMigrations({ Client: FakeClient, databaseUrl: "postgres://migration:test@example.test/db", migrationsDirectory, log: () => {} }),
  /checksum mismatch/,
);
assert.equal(FakeClient.instances[0].endCount, 1);

FakeClient.reset({ ledgerError: true });
await assert.rejects(
  () => runPostgresMigrations({ Client: FakeClient, databaseUrl: "postgres://migration:test@example.test/db", migrationsDirectory, log: () => {} }),
  /ledger write rejected/,
);
assert.deepEqual(FakeClient.state.body, [], "ledger failure must roll back the migration body");
assert.deepEqual([...FakeClient.state.ledger], [], "ledger failure must not leave a ledger row");
assert.equal(FakeClient.instances[0].rollbackCount, 1);

FakeClient.reset({ commitError: true });
await assert.rejects(
  () => runPostgresMigrations({ Client: FakeClient, databaseUrl: "postgres://migration:test@example.test/db", migrationsDirectory, log: () => {} }),
  (error) => error instanceof MigrationOutcomeUncertainError && /inspect the migration ledger/.test(error.message),
);
assert.equal(FakeClient.instances[0].rollbackCount, 0, "uncertain COMMIT must stop for inspection instead of blind rollback");
assert.equal(FakeClient.instances[0].endCount, 1);

FakeClient.reset({ connectError: true });
await assert.rejects(
  () => runPostgresMigrations({ Client: FakeClient, databaseUrl: "postgres://migration:test@example.test/db", migrationsDirectory, log: () => {} }),
  /connection refused/,
);
assert.equal(FakeClient.instances[0].endCount, 1, "connection failure must still close the client");

FakeClient.reset({ lockError: true });
await assert.rejects(
  () => runPostgresMigrations({ Client: FakeClient, databaseUrl: "postgres://migration:test@example.test/db", migrationsDirectory, log: () => {} }),
  /lock timeout/,
);
assert.equal(FakeClient.instances[0].unlockCount, 0, "lock timeout must not unlock a lock that was never acquired");
assert.equal(FakeClient.instances[0].endCount, 1);

const unsafeDirectory = path.join(root, "unsafe");
await mkdir(unsafeDirectory);
await writeFile(path.join(unsafeDirectory, "20260908_001_unsafe.sql"), "-- header\nBEGIN;\nSELECT 1;\n");
FakeClient.reset();
await assert.rejects(
  () => runPostgresMigrations({ Client: FakeClient, databaseUrl: "postgres://migration:test@example.test/db", migrationsDirectory: unsafeDirectory, log: () => {} }),
  /rejected before execution/,
);
assert.equal(FakeClient.instances[0].rollbackCount, 0, "unsafe transaction boundaries must be rejected before BEGIN");

FakeClient.reset();
const prepared = await runPostgresMigrations({
  Client: FakeClient,
  databaseUrl: "postgres://migration:test@example.test/db",
  migrationsDirectory,
  prepareEmptyDatabase: true,
  stopAfter: wrappedMigrations[0][0],
  log: () => {},
});
assert.deepEqual(prepared, { appliedCount: 1, skippedCount: 0, stoppedAfter: wrappedMigrations[0][0] });
assert.equal(FakeClient.state.rolesPrepared, true, "empty-db mode must create controlled placeholder roles");
assert.equal(FakeClient.state.ownershipPrepared, true, "empty-db mode must transfer the five preimport tables before 20260908");
const prerequisiteSql = buildEmptyDatabasePrerequisiteSql();
for (const table of EMPTY_DATABASE_PREREQUISITE_TABLES) {
  assert.match(prerequisiteSql.ownership, new RegExp(`ALTER TABLE public\\.${table} OWNER TO brokerdesk_admin`));
  assert.match(prerequisiteSql.ownership, new RegExp(`ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY`));
}
assert.match(prerequisiteSql.createRoles, /CREATE ROLE brokerdesk_runtime NOLOGIN/);
assert.match(prerequisiteSql.createRoles, /CREATE ROLE brokerdesk_admin NOLOGIN/);

console.log("PASS: migration runner transaction, checksum, failure cleanup, lock timeout and uncertainty scenarios");
