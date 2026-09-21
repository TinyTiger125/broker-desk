import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";
import {
  classifyTokyoInitialization,
  executeTokyoMigrations,
  preflightTokyoMigration,
} from "./run-tokyo-supabase-migrations.mjs";
import { runPostgresMigrations, MigrationOutcomeUncertainError } from "./run-postgres-migrations.mjs";

const { Client } = pg;
const postgresBin = "/opt/homebrew/opt/postgresql@16/bin";
const root = mkdtempSync(join(tmpdir(), "brokerdesk-tokyo-entry-pg-"));
const data = join(root, "data");
const port = 55449;
const migrationsDirectory = resolve("db/migrations");
const routeUser = "postgres.ilujuwuzaqwcbpnqixen";
const config = { user: routeUser, database: "postgres", ssl: { rejectUnauthorized: false } };
const databaseNames = ["tokyo_process_interrupt", "tokyo_complete_interrupt", "tokyo_lock_interrupt", "tokyo_marker_uncertain", "tokyo_concurrent", "tokyo_resume", "tokyo_snapshot", "tokyo_inconsistent"];
const databaseUrl = (database) => `postgresql://postgres@127.0.0.1:${port}/${database}`;

const run = (name, args) => execFileSync(join(postgresBin, name), args, {
  encoding: "utf8",
  env: { PATH: `${postgresBin}:/usr/bin:/bin`, LANG: "C", HOME: process.env.HOME },
});

async function adminClient(database = "postgres") {
  const client = new Client({ connectionString: databaseUrl(database), connectionTimeoutMillis: 5_000 });
  await client.connect();
  return client;
}

function clientConstructor(database, { failMarkerCommit = false, onLedgerQuery = null, onLockAcquired = null, events = null, label = "" } = {}) {
  return class LocalClient {
    constructor() {
      this.inner = new Client({ connectionString: databaseUrl(database), connectionTimeoutMillis: 10_000 });
      this.markerMutation = false;
      this.failedMarkerCommit = false;
      this.ledgerHooked = false;
      this.inner.on("error", (error) => events?.push({ label, event: "lock_connection_error", code: error.code }));
    }

    async connect() { await this.inner.connect(); }

    async query(sql, params) {
      const text = String(sql);
      if (text.includes("broker-desk-initialization-control") && text.includes("pg_advisory_unlock")) {
        const result = await this.inner.query(sql, params);
        events?.push({ label, event: "lock_released" });
        return result;
      }
      if (text.includes("broker-desk-initialization-control") && text.includes("pg_advisory_lock")) {
        const result = await this.inner.query(sql, params);
        const pid = Number((await this.inner.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
        events?.push({ label, event: "lock_acquired", pid });
        if (onLockAcquired) await onLockAcquired({ pid });
        return result;
      }
      if (text.startsWith("CREATE TABLE public.broker_desk_initialization_control") || text.startsWith("UPDATE public.broker_desk_initialization_control")) {
        this.markerMutation = true;
      }
      if (onLedgerQuery && !this.ledgerHooked && text.includes("SELECT name, checksum FROM public.broker_desk_schema_migrations")) {
        this.ledgerHooked = true;
        await onLedgerQuery();
      }
      if (failMarkerCommit && this.markerMutation && !this.failedMarkerCommit && text.trim() === "COMMIT") {
        await this.inner.query(text, params);
        this.failedMarkerCommit = true;
        throw Object.assign(new Error("connection lost after marker COMMIT"), { code: "08006" });
      }
      const result = await this.inner.query(sql, params);
      if (text.includes("current_database()") && result.rows[0]) result.rows[0].database = "postgres";
      return result;
    }

    async end() { await this.inner.end(); }
  };
}

async function createDatabase(name) {
  const client = await adminClient();
  await client.query(`CREATE DATABASE "${name}"`);
  await client.end();
}

async function createSafeClusterRoles() {
  const client = await adminClient();
  await client.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_admin') THEN CREATE ROLE brokerdesk_admin NOSUPERUSER NOCREATEDB NOCREATEROLE NOLOGIN NOINHERIT; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN CREATE ROLE brokerdesk_runtime NOSUPERUSER NOCREATEDB NOCREATEROLE NOLOGIN NOINHERIT; END IF; END $$");
  await client.end();
}

async function prepareFullDatabase(name) {
  await runPostgresMigrations({
    Client: clientConstructor(name),
    clientConfig: config,
    migrationsDirectory,
    prepareEmptyDatabase: true,
    log: () => {},
  });
}

async function createMarker(name, phase = "initializing") {
  const client = await adminClient(name);
  await client.query("CREATE TABLE public.broker_desk_initialization_control (id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id), project_ref TEXT NOT NULL, phase TEXT NOT NULL CHECK (phase IN ('initializing', 'complete')), started_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await client.query("INSERT INTO public.broker_desk_initialization_control (id, project_ref, phase) VALUES (TRUE, $1, $2)", ["ilujuwuzaqwcbpnqixen", phase]);
  await client.end();
}

async function setMarkerPhase(name, phase) {
  const client = await adminClient(name);
  await client.query("UPDATE public.broker_desk_initialization_control SET phase = $1 WHERE id = TRUE", [phase]);
  await client.end();
}

async function inspect(name) {
  const client = await adminClient(name);
  const markerExists = (await client.query("SELECT to_regclass('public.broker_desk_initialization_control') IS NOT NULL AS exists")).rows[0].exists;
  const marker = markerExists ? (await client.query("SELECT project_ref, phase FROM public.broker_desk_initialization_control ORDER BY id")).rows : [];
  const ledgerExists = (await client.query("SELECT to_regclass('public.broker_desk_schema_migrations') IS NOT NULL AS exists")).rows[0].exists;
  const ledger = ledgerExists ? Number((await client.query("SELECT count(*) AS count FROM public.broker_desk_schema_migrations")).rows[0].count) : 0;
  await client.end();
  return { marker, ledger };
}

let running = false;
try {
  run("initdb", ["-D", data, "-U", "postgres", "--no-locale", "--encoding=UTF8", "--auth-local=trust", "--auth-host=trust"]);
  run("pg_ctl", ["-D", data, "-o", `-F -p ${port} -h 127.0.0.1`, "-l", join(root, "postgres.log"), "-w", "start"]);
  running = true;
  for (const name of databaseNames) await createDatabase(name);
  await createSafeClusterRoles();

  const entryEnvironment = { BROKER_DESK_TOKYO_MIGRATIONS_APPROVED: "true", BROKER_DESK_PREPARE_EMPTY_DB: "true" };

  // 1. Run the actual Tokyo entrypoint in a child process. After the first
  // migration commits, terminate the same backend that owns the initialization
  // lock and runner connection. The old process must stop before completion;
  // a fresh entry then resumes from the committed ledger prefix.
  const childOutput = [];
  const childErrors = [];
  const child = spawn(process.execPath, [resolve("scripts/test-tokyo-migration-entry-child.mjs"), "tokyo_process_interrupt", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, PATH: `${postgresBin}:${process.env.PATH ?? ""}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => childOutput.push(String(chunk)));
  child.stderr.on("data", (chunk) => childErrors.push(String(chunk)));
  const firstApplied = new Promise((resolveApplied, rejectApplied) => {
    let buffer = "";
    const onData = (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      const line = lines.find((candidate) => candidate.startsWith("Applied "));
      if (line) {
        child.stdout.off("data", onData);
        resolveApplied(line);
      }
    };
    child.stdout.on("data", onData);
    child.once("error", rejectApplied);
    child.once("exit", (code, signal) => rejectApplied(new Error(`entry subprocess exited before first migration: ${code ?? signal}`)));
  });
  const firstAppliedName = await firstApplied.catch((error) => {
    throw new Error(`${error.message}; stdout=${childOutput.join("")}; stderr=${childErrors.join("")}`);
  });
  let processPid = null;
  for (let attempt = 0; attempt < 100 && processPid === null; attempt += 1) {
    const activity = await adminClient();
    const rows = (await activity.query("SELECT pid FROM pg_stat_activity WHERE application_name = 'broker-desk-entry-subprocess' AND datname = $1 AND pid <> pg_backend_pid() ORDER BY backend_start DESC LIMIT 1", ["tokyo_process_interrupt"])).rows;
    await activity.end();
    if (rows[0]) processPid = Number(rows[0].pid);
    else await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(processPid, "entry subprocess backend must be discoverable after first migration");
  const processTerminator = await adminClient();
  const processTerminated = (await processTerminator.query("SELECT pg_terminate_backend($1) AS terminated", [processPid])).rows[0].terminated;
  await processTerminator.end();
  assert.equal(processTerminated, true);
  const processExit = await new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
  assert.notEqual(processExit.code, 0);
  const processInterrupted = await inspect("tokyo_process_interrupt");
  assert.equal(processInterrupted.marker[0].phase, "initializing");
  assert.ok(processInterrupted.ledger > 0 && processInterrupted.ledger < 44);
  await executeTokyoMigrations({ config, ClientConstructor: clientConstructor("tokyo_process_interrupt"), args: ["--prepare-empty-db"], environment: entryEnvironment, migrationsDirectory, log: () => {} });
  const processRecovered = await inspect("tokyo_process_interrupt");
  assert.deepEqual(processRecovered.marker[0].phase, "complete");
  assert.equal(processRecovered.ledger, 44);
  const processRecoveredPreflight = await preflightTokyoMigration({ config, ClientConstructor: clientConstructor("tokyo_process_interrupt") });
  assert.ok(processRecoveredPreflight.tableState.every(({ owner, rls, force_rls }) => owner === "brokerdesk_admin" && rls && force_rls));

  // 2. Hold the marker row after start, let the real child finish all ledger
  // rows, then terminate its same lock/runner backend while complete is
  // blocked. The marker must remain initializing and recovery must complete it.
  const completeOutput = [];
  const completeErrors = [];
  const completeChild = spawn(process.execPath, [resolve("scripts/test-tokyo-migration-entry-child.mjs"), "tokyo_complete_interrupt", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, PATH: `${postgresBin}:${process.env.PATH ?? ""}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  completeChild.stdout.setEncoding("utf8");
  completeChild.stderr.setEncoding("utf8");
  completeChild.stdout.on("data", (chunk) => completeOutput.push(String(chunk)));
  completeChild.stderr.on("data", (chunk) => completeErrors.push(String(chunk)));
  let markerLocker = null;
  for (let attempt = 0; attempt < 200 && markerLocker === null; attempt += 1) {
    const probe = await adminClient("tokyo_complete_interrupt");
    const markerExists = (await probe.query("SELECT to_regclass('public.broker_desk_initialization_control') IS NOT NULL AS exists")).rows[0].exists;
    const rows = markerExists ? (await probe.query("SELECT phase FROM public.broker_desk_initialization_control WHERE id = TRUE")).rows : [];
    await probe.end();
    if (rows[0]?.phase === "initializing") {
      markerLocker = await adminClient("tokyo_complete_interrupt");
      await markerLocker.query("BEGIN");
      await markerLocker.query("SELECT id FROM public.broker_desk_initialization_control WHERE id = TRUE FOR UPDATE");
    } else await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(markerLocker, "marker row must be lockable before completion");
  let completePid = null;
  for (let attempt = 0; attempt < 100 && completePid === null; attempt += 1) {
    const activity = await adminClient();
    const rows = (await activity.query("SELECT pid FROM pg_stat_activity WHERE application_name = 'broker-desk-entry-subprocess' AND datname = $1 AND pid <> pg_backend_pid() ORDER BY backend_start DESC LIMIT 1", ["tokyo_complete_interrupt"])).rows;
    await activity.end();
    if (rows[0]) completePid = Number(rows[0].pid);
    else await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(completePid, "completion subprocess backend must be discoverable");
  let completeLedger = 0;
  for (let attempt = 0; attempt < 300 && completeLedger < 44; attempt += 1) {
    const probe = await adminClient("tokyo_complete_interrupt");
    const exists = (await probe.query("SELECT to_regclass('public.broker_desk_schema_migrations') IS NOT NULL AS exists")).rows[0].exists;
    completeLedger = exists ? Number((await probe.query("SELECT count(*) AS count FROM public.broker_desk_schema_migrations")).rows[0].count) : 0;
    await probe.end();
    if (completeLedger < 44) await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(completeLedger, 44);
  const completeTerminator = await adminClient();
  const completeTerminated = (await completeTerminator.query("SELECT pg_terminate_backend($1) AS terminated", [completePid])).rows[0].terminated;
  await completeTerminator.end();
  assert.equal(completeTerminated, true);
  const completeExit = await new Promise((resolve) => completeChild.once("exit", (code, signal) => resolve({ code, signal })));
  await markerLocker.query("ROLLBACK");
  await markerLocker.end();
  assert.notEqual(completeExit.code, 0);
  const completeInterrupted = await inspect("tokyo_complete_interrupt");
  assert.deepEqual(completeInterrupted.marker[0].phase, "initializing");
  assert.equal(completeInterrupted.ledger, 44);
  await executeTokyoMigrations({ config, ClientConstructor: clientConstructor("tokyo_complete_interrupt"), args: ["--prepare-empty-db"], environment: entryEnvironment, migrationsDirectory, log: () => {} });
  const completeRecovered = await inspect("tokyo_complete_interrupt");
  assert.deepEqual(completeRecovered.marker[0].phase, "complete");
  assert.equal(completeRecovered.ledger, 44);

  // 3. Terminating the real session that owns the initialization lock stops
  // the first entry before it can create a marker; a fresh entry recovers.
  const interruptionEvents = [];
  let lockPidResolve;
  const lockPid = new Promise((resolve) => { lockPidResolve = resolve; });
  let releaseHeldLock;
  const heldLock = new Promise((resolve) => { releaseHeldLock = resolve; });
  const interruptedEntry = executeTokyoMigrations({
    config,
    ClientConstructor: clientConstructor("tokyo_lock_interrupt", {
      label: "interrupted",
      events: interruptionEvents,
      onLockAcquired: async ({ pid }) => {
        lockPidResolve(pid);
        await heldLock;
      },
    }),
    args: ["--prepare-empty-db"],
    environment: entryEnvironment,
    migrationsDirectory,
    log: () => {},
  });
  const interruptedPid = await lockPid;
  const terminator = await adminClient();
  const terminated = (await terminator.query("SELECT pg_terminate_backend($1) AS terminated", [interruptedPid])).rows[0].terminated;
  await terminator.end();
  assert.equal(terminated, true);
  releaseHeldLock();
  const interruptedResult = await Promise.allSettled([interruptedEntry]);
  assert.equal(interruptedResult[0].status, "rejected");
  assert.deepEqual(await inspect("tokyo_lock_interrupt"), { marker: [], ledger: 0 });
  await executeTokyoMigrations({ config, ClientConstructor: clientConstructor("tokyo_lock_interrupt"), args: ["--prepare-empty-db"], environment: entryEnvironment, migrationsDirectory, log: () => {} });
  const interruptedRecovered = await inspect("tokyo_lock_interrupt");
  assert.deepEqual(interruptedRecovered.marker[0].phase, "complete");
  assert.equal(interruptedRecovered.ledger, 44);
  const interruptedRecoveredPreflight = await preflightTokyoMigration({ config, ClientConstructor: clientConstructor("tokyo_lock_interrupt") });
  assert.deepEqual(interruptedRecoveredPreflight.tableState.map(({ relname }) => relname), ["attachment_links", "attachments", "audit_logs", "import_jobs", "private_attachment_blobs"]);
  assert.ok(interruptedRecoveredPreflight.tableState.every(({ owner, rls, force_rls }) => owner === "brokerdesk_admin" && rls && force_rls));
  assert.deepEqual(interruptedRecoveredPreflight.finalPolicies, ["brokerdesk_import_worker_claim_select", "brokerdesk_import_worker_claim_update"]);

  // 4. Marker COMMIT succeeds but its response is uncertain; the entrypoint stops.
  const uncertain = clientConstructor("tokyo_marker_uncertain", { failMarkerCommit: true });
  await assert.rejects(
    () => executeTokyoMigrations({ config, ClientConstructor: uncertain, args: ["--prepare-empty-db"], environment: entryEnvironment, migrationsDirectory, log: () => {} }),
    (error) => error instanceof MigrationOutcomeUncertainError,
  );
  const uncertainState = await inspect("tokyo_marker_uncertain");
  assert.deepEqual(uncertainState, { marker: [{ project_ref: "ilujuwuzaqwcbpnqixen", phase: "initializing" }], ledger: 0 });
  const uncertainRecoveryPreflight = await preflightTokyoMigration({ config, ClientConstructor: clientConstructor("tokyo_marker_uncertain") });
  assert.equal(uncertainRecoveryPreflight.inventory.ledger_exists, false);
  assert.deepEqual(uncertainRecoveryPreflight.publicTables, ["broker_desk_initialization_control"]);
  assert.equal(uncertainRecoveryPreflight.roles.length, 2);
  assert.ok(uncertainRecoveryPreflight.roles.every(({ rolsuper, rolcreaterole, rolbypassrls, rolcanlogin }) => !rolsuper && !rolcreaterole && !rolbypassrls && !rolcanlogin));
  await executeTokyoMigrations({ config, ClientConstructor: clientConstructor("tokyo_marker_uncertain"), args: ["--prepare-empty-db"], environment: entryEnvironment, migrationsDirectory, log: () => {} });
  const uncertainRecovered = await inspect("tokyo_marker_uncertain");
  assert.equal(uncertainRecovered.marker[0].phase, "complete");
  assert.equal(uncertainRecovered.ledger, 44);
  await setMarkerPhase("tokyo_marker_uncertain", "initializing");
  await assert.rejects(
    () => executeTokyoMigrations({ config, ClientConstructor: clientConstructor("tokyo_marker_uncertain", { failMarkerCommit: true }), args: ["--prepare-empty-db"], environment: entryEnvironment, migrationsDirectory, log: () => {} }),
    (error) => error instanceof MigrationOutcomeUncertainError,
  );
  const uncertainCompletion = await inspect("tokyo_marker_uncertain");
  assert.equal(uncertainCompletion.marker[0].phase, "complete");
  assert.equal(uncertainCompletion.ledger, 44);
  await assert.rejects(
    () => executeTokyoMigrations({ config, ClientConstructor: clientConstructor("tokyo_marker_uncertain"), args: ["--prepare-empty-db"], environment: entryEnvironment, migrationsDirectory, log: () => {} }),
    /Tokyo initialization is already complete/,
  );
  const uncertainCompletionRerun = await inspect("tokyo_marker_uncertain");
  assert.deepEqual(uncertainCompletionRerun, uncertainCompletion);

  // 5. Two real entrypoints start at the same time; the lock serializes state
  // and the second entry is rejected after the first completes.
  const concurrentEvents = [];
  const concurrentRun = (label) => executeTokyoMigrations({
    config,
    ClientConstructor: clientConstructor("tokyo_concurrent", { label, events: concurrentEvents }),
    args: ["--prepare-empty-db"],
    environment: entryEnvironment,
    migrationsDirectory,
    runMigrations: async (options) => {
      concurrentEvents.push({ label, event: "runner_start" });
      const result = await runPostgresMigrations(options);
      concurrentEvents.push({ label, event: "runner_end" });
      return result;
    },
    log: () => {},
  });
  const concurrentResults = await Promise.allSettled([
    concurrentRun("A"),
    concurrentRun("B"),
  ]);
  assert.equal(concurrentResults.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(concurrentResults.filter(({ status }) => status === "rejected").length, 1);
  const rejectedConcurrent = concurrentResults.find(({ status }) => status === "rejected");
  assert.match(String(rejectedConcurrent.reason?.message), /Tokyo initialization is already complete/);
  assert.equal(concurrentEvents.filter(({ event }) => event === "runner_start").length, 1);
  const firstRunnerEnd = concurrentEvents.findIndex(({ event }) => event === "runner_end");
  assert.ok(firstRunnerEnd >= 0);
  assert.equal(concurrentEvents.filter(({ event }) => event === "lock_acquired").length, 2);
  assert.ok(concurrentEvents.findIndex((entry, index) => index > firstRunnerEnd && entry.event === "lock_acquired") > firstRunnerEnd);
  const concurrentState = await inspect("tokyo_concurrent");
  assert.deepEqual(concurrentState.marker[0].phase, "complete");
  assert.equal(concurrentState.ledger, 44);

  // 6. All migration rows exist but completion marker is still initializing; resume is controlled.
  await prepareFullDatabase("tokyo_resume");
  await createMarker("tokyo_resume", "initializing");
  const resumeResult = await executeTokyoMigrations({ config, ClientConstructor: clientConstructor("tokyo_resume"), args: ["--prepare-empty-db"], environment: { BROKER_DESK_TOKYO_MIGRATIONS_APPROVED: "true", BROKER_DESK_PREPARE_EMPTY_DB: "true" }, migrationsDirectory, log: () => {} });
  assert.equal(resumeResult.appliedCount, 0);
  assert.equal(resumeResult.skippedCount, 44);
  const resumeState = await inspect("tokyo_resume");
  assert.deepEqual(resumeState.marker[0].phase, "complete");
  assert.equal(resumeState.ledger, 44);

  // Inconsistent marker state is refused before any migration attempt.
  await createMarker("tokyo_inconsistent", "complete");
  await assert.rejects(
    () => executeTokyoMigrations({ config, ClientConstructor: clientConstructor("tokyo_inconsistent"), args: ["--prepare-empty-db"], environment: { BROKER_DESK_TOKYO_MIGRATIONS_APPROVED: "true", BROKER_DESK_PREPARE_EMPTY_DB: "true" }, migrationsDirectory, log: () => {} }),
    /initialization state rejected/,
  );
  assert.deepEqual(await inspect("tokyo_inconsistent"), { marker: [{ project_ref: "ilujuwuzaqwcbpnqixen", phase: "complete" }], ledger: 0 });

  // 7. Repeatable-read preflight does not mix a changing marker and ledger.
  await prepareFullDatabase("tokyo_snapshot");
  await createMarker("tokyo_snapshot", "initializing");
  let mutationDone = false;
  const snapshotClient = clientConstructor("tokyo_snapshot", {
    onLedgerQuery: async () => {
      const client = await adminClient("tokyo_snapshot");
      await client.query("UPDATE public.broker_desk_initialization_control SET phase = 'complete' WHERE id = TRUE");
      await client.query("DELETE FROM public.broker_desk_schema_migrations WHERE name = (SELECT max(name) FROM public.broker_desk_schema_migrations)");
      await client.end();
      mutationDone = true;
    },
  });
  const snapshotState = await preflightTokyoMigration({ config, ClientConstructor: snapshotClient });
  const snapshotClassification = await classifyTokyoInitialization(snapshotState, migrationsDirectory);
  assert.equal(mutationDone, true);
  assert.equal(snapshotState.markerRows[0].phase, "initializing");
  assert.equal(snapshotState.ledgerRows.length, 44);
  assert.deepEqual(snapshotClassification, { phase: "resume", prepareEmptyDatabase: false, appliedCount: 44 });
  assert.deepEqual(await inspect("tokyo_snapshot"), { marker: [{ project_ref: "ilujuwuzaqwcbpnqixen", phase: "complete" }], ledger: 43 });
  const changedSnapshotState = await preflightTokyoMigration({ config, ClientConstructor: clientConstructor("tokyo_snapshot") });
  await assert.rejects(
    () => classifyTokyoInitialization(changedSnapshotState, migrationsDirectory),
    /initialization state rejected/,
  );
  let changedSnapshotRunnerInvoked = false;
  await assert.rejects(
    () => executeTokyoMigrations({
      config,
      ClientConstructor: clientConstructor("tokyo_snapshot"),
      args: ["--prepare-empty-db"],
      environment: entryEnvironment,
      migrationsDirectory,
      runMigrations: async () => {
        changedSnapshotRunnerInvoked = true;
        throw new Error("migration runner must not start for an inconsistent snapshot");
      },
      log: () => {},
    }),
    /initialization state rejected/,
  );
  assert.equal(changedSnapshotRunnerInvoked, false);
  const changedSnapshotFinal = await inspect("tokyo_snapshot");
  assert.deepEqual(changedSnapshotFinal, { marker: [{ project_ref: "ilujuwuzaqwcbpnqixen", phase: "complete" }], ledger: 43 });

  const evidence = {
    postgres: "16",
    port,
    scenarios: {
      processLockInterrupt: { firstAppliedName, terminatedBackendPid: processPid, terminated: processTerminated, childExit: processExit, interruptedState: processInterrupted, recoveredState: processRecovered, recoveredRequiredTables: processRecoveredPreflight.tableState, childStdout: childOutput.join(""), childStderr: childErrors.join("") },
      completeBeforeMarkerInterrupt: { terminatedBackendPid: completePid, terminated: completeTerminated, childExit: completeExit, interruptedState: completeInterrupted, recoveredState: completeRecovered, childStdout: completeOutput.join(""), childStderr: completeErrors.join("") },
      lockConnectionInterrupted: { terminated, firstEntry: interruptedResult[0].status, firstEntryState: { marker: [], ledger: 0 }, recovery: { marker: interruptedRecovered.marker, ledger: interruptedRecovered.ledger, requiredTables: interruptedRecoveredPreflight.tableState, finalPolicies: interruptedRecoveredPreflight.finalPolicies }, events: interruptionEvents },
      markerCommitUncertain: { stopped: true, markerOnlySafeRolesAccepted: true, markerOnlySafeRoles: uncertainRecoveryPreflight.roles, startRecovery: uncertainRecovered, completionStopped: uncertainCompletion, completionRerun: { rejected: true, reason: "Tokyo initialization is already complete", final: uncertainCompletionRerun } },
      concurrentStart: { fulfilled: 1, rejected: 1, rejectedReason: rejectedConcurrent.reason?.message, executionOrder: concurrentEvents, final: concurrentState },
      ledgerCompleteMarkerIncomplete: { resumed: resumeResult, final: resumeState, inconsistentRejected: true },
      repeatableReadSnapshot: { observedBeforeMutation: snapshotClassification, finalDbAfterMutation: changedSnapshotFinal, changedSnapshotRejected: true, migrationRunnerInvokedAfterChange: changedSnapshotRunnerInvoked },
    },
    scope: "isolated local PostgreSQL; actual migration runner and Tokyo entrypoint; no cloud writes",
  };
  mkdirSync("/private/tmp/broker-desk-evidence", { recursive: true, mode: 0o700 });
  writeFileSync("/private/tmp/broker-desk-evidence/20260922-tokyo-migration-entry-lifecycle-real.log", `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(evidence));
} finally {
  if (running) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  rmSync(root, { recursive: true, force: true });
}
