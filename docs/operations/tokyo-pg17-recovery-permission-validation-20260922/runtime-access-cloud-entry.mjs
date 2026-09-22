#!/usr/bin/env node
/**
 * Controlled Tokyo runtime-login entry.
 *
 * Default mode is --self-test and never opens a socket. Cloud execution
 * requires --execute-cloud plus one length-prefixed JSON frame on stdin.
 * The frame carries only controlled in-memory input; passwords are never
 * accepted in argv, environment, files, logs, or evidence.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "pg";

const TARGET = Object.freeze({
  ref: "ilujuwuzaqwcbpnqixen",
  host: "aws-0-ap-northeast-1.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  caSha256: "700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7",
  commit: "f5a3210aa1c5025c4ad9b593274fb66dca09abf8",
});
const ROLES = Object.freeze(["brokerdesk_runtime", "brokerdesk_admin"]);
const HELPER_SOURCE = resolve("docs/operations/tokyo-pg17-recovery-permission-validation-20260922/runtime-password-helper.c");
const MIGRATIONS_DIRECTORY = resolve("db/migrations");
const APP_NAMES = Object.freeze({
  brokerdesk_runtime: "broker-desk-runtime-login-test",
  brokerdesk_admin: "broker-desk-admin-login-test",
});
const EXPECTED_AUTH_REJECTION_SQLSTATES = new Set(["28000", "28P01", "28P02", "28001"]);

export function routeUsername(role, ref = TARGET.ref) {
  if (!ROLES.includes(role)) throw new Error("unsupported_runtime_role");
  return `${role}.${ref}`;
}

function expectedUsername(logicalRole, ref = TARGET.ref) {
  if (logicalRole === "postgres") return `postgres.${ref}`;
  return ROLES.includes(logicalRole) ? routeUsername(logicalRole, ref) : null;
}

function validateConnectionConfig(config, logicalRole, { checkTargetRef = true } = {}) {
  const errors = [];
  if (!config || typeof config !== "object") return ["config_missing"];
  if (config.host !== TARGET.host) errors.push("host_mismatch");
  if (config.port !== TARGET.port) errors.push("port_mismatch");
  if (config.database !== TARGET.database) errors.push("database_mismatch");
  if (config.user !== expectedUsername(logicalRole)) errors.push("route_username_mismatch");
  if (checkTargetRef && config.projectRef !== TARGET.ref) errors.push("project_ref_mismatch");
  if (config.password !== undefined) errors.push("password_must_not_be_in_route_config");
  const tls = config.tls;
  if (!tls || tls.mode !== "verify-full") errors.push("tls_mode_mismatch");
  if (tls?.rejectUnauthorized !== true) errors.push("tls_verification_disabled");
  if (tls?.servername !== TARGET.host) errors.push("tls_servername_mismatch");
  if (typeof tls?.caPath !== "string" || tls.caPath.length === 0) errors.push("ca_path_missing");
  if (tls?.caSha256 !== TARGET.caSha256) errors.push("ca_sha256_mismatch");
  return errors;
}

function validateInputShape(input) {
  const errors = [];
  if (!input || typeof input !== "object") return ["input_missing"];
  if (input.targetRef !== TARGET.ref) errors.push("target_ref_mismatch");
  if (typeof input.managementPassword !== "string" || input.managementPassword.length === 0) errors.push("management_password_missing_from_stdin_frame");
  if (!input.management || input.management.logicalRole !== "postgres") errors.push("management_logical_role_mismatch");
  errors.push(...validateConnectionConfig(input.management, "postgres", { checkTargetRef: true }));
  if (!input.roleRoutes || typeof input.roleRoutes !== "object") return [...errors, "role_routes_missing"];
  if (Object.keys(input.roleRoutes).sort().join(",") !== [...ROLES].sort().join(",")) errors.push("role_allowlist_mismatch");
  for (const role of ROLES) {
    const route = input.roleRoutes[role];
    if (!route || route.logicalRole !== role) errors.push(`${role}:logical_role_mismatch`);
    errors.push(...validateConnectionConfig(route, role, { checkTargetRef: true }).map((error) => `${role}:${error}`));
  }
  return errors;
}

function assertInputShape(input) {
  const errors = validateInputShape(input);
  if (errors.length > 0) throw new Error(`preflight_config_rejected:${errors.join(",")}`);
}

function readLengthPrefixedJson() {
  const frame = readFileSync(0);
  if (frame.length < 4) throw new Error("invalid_stdin_frame");
  const length = frame.readUInt32BE(0);
  if (length !== frame.length - 4 || length > 262144) throw new Error("invalid_stdin_frame");
  return JSON.parse(frame.subarray(4).toString("utf8"));
}

function encodeLengthPrefixedFrame(fields) {
  const buffers = fields.map((field) => Buffer.from(field, "utf8"));
  return Buffer.concat(buffers.flatMap((field) => {
    const header = Buffer.alloc(4);
    header.writeUInt32BE(field.length, 0);
    return [header, field];
  }));
}

function quoteConninfo(value) {
  return `'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function buildHelperConninfo(route, managementPassword) {
  return [
    `host=${quoteConninfo(route.host)}`,
    `port=${route.port}`,
    `dbname=${quoteConninfo(route.database)}`,
    `user=${quoteConninfo(route.user)}`,
    `password=${quoteConninfo(managementPassword)}`,
    "sslmode=verify-full",
    `sslrootcert=${quoteConninfo(route.tls.caPath)}`,
    `application_name=${quoteConninfo("broker-desk-runtime-password-helper")}`,
  ].join(" ");
}

function readAndVerifyCa(route) {
  const ca = readFileSync(route.tls.caPath, "utf8");
  const caSha256 = createHash("sha256").update(ca).digest("hex");
  if (caSha256 !== TARGET.caSha256) throw new Error("preflight_config_rejected:ca_sha256_mismatch");
  return ca;
}

function pgConfig(route, password, ca) {
  return {
    host: route.host,
    port: route.port,
    database: route.database,
    user: route.user,
    password,
    ssl: { ca, rejectUnauthorized: true, servername: route.tls.servername },
    application_name: route.applicationName ?? "broker-desk-runtime-entry",
    connectionTimeoutMillis: 10_000,
  };
}

function compileHelper(tempRoot) {
  const pgConfigPath = execFileSync("pg_config", ["--includedir", "--libdir"], { encoding: "utf8" }).trim().split("\n");
  const includeDir = pgConfigPath[0];
  const libDir = pgConfigPath[1];
  const binary = join(tempRoot, "runtime-password-helper");
  const result = spawnSync("cc", ["-std=c11", `-I${includeDir}`, `-L${libDir}`, `-Wl,-rpath,${libDir}`, HELPER_SOURCE, "-lpq", "-o", binary], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, LANG: "C" },
  });
  if (result.status !== 0) throw new Error("helper_compile_failed");
  return binary;
}

function setPasswordWithHelper(binary, route, managementPassword, role, password) {
  const frame = encodeLengthPrefixedFrame([buildHelperConninfo(route, managementPassword), role, password]);
  const result = spawnSync(binary, [], {
    input: frame,
    encoding: "utf8",
    env: { PATH: process.env.PATH, LANG: "C" },
  });
  if (result.status !== 0 || result.stdout.trim() !== "password_change_ok") {
    const error = new Error("password_change_failed");
    error.code = "helper_failed";
    throw error;
  }
}

function safeSqlState(error) {
  return typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : "unknown";
}

function safeErrorCode(error) {
  return typeof error?.code === "string" && /^[A-Za-z0-9_]+$/.test(error.code) ? error.code : "unknown";
}

function classifyAuthProbeError(error) {
  const sqlstate = safeSqlState(error);
  return EXPECTED_AUTH_REJECTION_SQLSTATES.has(sqlstate) ? "verified" : "unverified";
}

function createRoleAttempts() {
  return Object.fromEntries(ROLES.map((role) => [role, {
    passwordWriteAttempted: false,
    passwordWriteConfirmed: false,
    loginWriteAttempted: false,
    loginWriteConfirmed: false,
    loginProbeAttempted: false,
  }]));
}

function markRoleAttempt(roleAttempts, role, key) {
  roleAttempts[role][key] = true;
}

function rolesRequiringCleanup(roleAttempts) {
  return ROLES.filter((role) => {
    const attempt = roleAttempts[role];
    return attempt.passwordWriteAttempted || attempt.loginWriteAttempted;
  });
}

function createRecorder(events) {
  return (type, details = {}) => events.push({ atUtc: new Date().toISOString(), type, ...details });
}

async function readBaseline(client) {
  const identity = (await client.query("SELECT current_database() AS database, session_user, current_user, current_setting('password_encryption') AS password_encryption")).rows[0];
  const roles = (await client.query("SELECT rolname, rolsuper, rolcreaterole, rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname = ANY($1::name[]) ORDER BY rolname", [ROLES])).rows;
  const passwordState = (await client.query("SELECT rolname, rolpassword IS NULL AS password_is_null FROM pg_authid WHERE rolname = ANY($1::name[]) ORDER BY rolname", [ROLES])).rows;
  const memberships = (await client.query(`
    SELECT member.rolname AS member, role_name.rolname AS role, grantor.rolname AS grantor,
           m.admin_option, m.inherit_option, m.set_option
    FROM pg_auth_members m
    JOIN pg_roles role_name ON role_name.oid = m.roleid
    JOIN pg_roles member ON member.oid = m.member
    JOIN pg_roles grantor ON grantor.oid = m.grantor
    WHERE member.rolname = 'postgres' AND role_name.rolname = ANY($1::name[])
    ORDER BY role_name.rolname
  `, [ROLES])).rows;
  const sessions = (await client.query("SELECT pid, usename, application_name FROM pg_stat_activity WHERE application_name = ANY($1::text[])", [Object.values(APP_NAMES)])).rows;
  return { identity, roles, passwordState, memberships, sessions };
}

function assertBaseline(baseline) {
  if (baseline.identity.database !== TARGET.database || baseline.identity.session_user !== "postgres" || baseline.identity.current_user !== "postgres") throw new Error("baseline_identity_mismatch");
  if (baseline.identity.password_encryption !== "scram-sha-256") throw new Error("baseline_password_encryption_mismatch");
  if (baseline.roles.length !== ROLES.length || baseline.roles.some((row) => row.rolcanlogin || row.rolsuper || row.rolcreaterole || row.rolbypassrls)) throw new Error("baseline_role_state_mismatch");
  if (baseline.passwordState.some((row) => !row.password_is_null)) throw new Error("baseline_password_state_mismatch");
  if (baseline.sessions.length > 0) throw new Error("baseline_test_sessions_present");
}

function assertReadyForWrites({ baseline, classification }) {
  assertBaseline(baseline);
  if (classification.phase !== "complete" || classification.appliedCount !== 44) throw new Error("baseline_initialization_mismatch");
  return true;
}

function runGuardedWrite({ baseline, classification, write }) {
  assertReadyForWrites({ baseline, classification });
  return write();
}

async function expectLoginRejected(route, password, ca, phase, record) {
  const client = new Client(pgConfig({ ...route, applicationName: APP_NAMES[route.logicalRole] }, password, ca));
  try {
    await client.connect();
    await client.end().catch(() => undefined);
    record("login_rejection_probe", { role: route.logicalRole, phase, result: "unverified", reason: "connection_succeeded" });
    return { result: "unverified", reason: "connection_succeeded" };
  } catch (error) {
    const sqlstate = safeSqlState(error);
    const result = classifyAuthProbeError(error);
    record("login_rejection_probe", {
      role: route.logicalRole,
      phase,
      result,
      sqlstate,
      errorCode: safeErrorCode(error),
      reason: result === "verified" ? "expected_authentication_rejection" : "non_authentication_or_transport_error",
    });
    return { result, sqlstate };
  }
}

async function cleanupRuntimeState({ client, input, ca, credentials, connections, rolesToClean, record }) {
  const probeResults = [];
  try {
    for (const connection of connections.splice(0)) await connection.end().catch(() => undefined);
    record("test_connections_closed", { roles: rolesToClean });
    for (const role of rolesToClean) {
      await client.query(`ALTER ROLE ${role} NOLOGIN`);
      record("role_nologin", { role });
    }
    for (const role of rolesToClean) {
      const password = credentials.get(role);
      if (password) probeResults.push({ role, ...(await expectLoginRejected(input.roleRoutes[role], password, ca, "after_nologin", record)) });
    }
    const sessions = (await client.query("SELECT pid, usename, application_name FROM pg_stat_activity WHERE application_name = ANY($1::text[])", [Object.values(APP_NAMES)])).rows;
    if (sessions.length !== 0) throw new Error("test_sessions_remain");
    record("test_sessions_zero");
    for (const role of rolesToClean) {
      await client.query(`ALTER ROLE ${role} PASSWORD NULL`);
      record("database_password_cleared", { role });
    }
    const final = await readBaseline(client);
    const finalRoleState = new Map(final.roles.map((row) => [row.rolname, row]));
    const finalPasswordState = new Map(final.passwordState.map((row) => [row.rolname, row]));
    if (rolesToClean.some((role) => finalRoleState.get(role)?.rolcanlogin || !finalPasswordState.get(role)?.password_is_null) || final.sessions.length !== 0) throw new Error("final_cleanup_state_mismatch");
    for (const role of rolesToClean) credentials.delete(role);
    const probeResult = probeResults.every(({ result }) => result === "verified") ? "verified" : "unverified";
    record("credentials_released", { roles: rolesToClean });
    record("cleanup_completed", { finishedAtUtc: new Date().toISOString(), roles: rolesToClean, cleanupResult: "completed", probeResult, probeResults, credentialsReleasedAfterRejectionProbe: true });
    return { final, cleanupResult: "completed", probeResult, probeResults };
  } catch (error) {
    record("cleanup_incomplete", { sqlstate: safeSqlState(error), roles: rolesToClean, cleanupResult: "incomplete", probeResults });
    throw error;
  }
}

async function runRuntimePermissionProbes(runtimeClient, record) {
  const probes = [
    ["schema_create", "CREATE TABLE public.__brokerdesk_runtime_access_probe (id integer)"],
    ["persistent_ddl", "ALTER TABLE public.import_jobs ADD COLUMN __brokerdesk_runtime_access_probe integer"],
    ["set_role", "SET ROLE brokerdesk_admin"],
  ];
  const results = [];
  for (const [name, sql] of probes) {
    let result = "unverified";
    let sqlstate = null;
    try {
      await runtimeClient.query("BEGIN");
      try {
        await runtimeClient.query(sql);
        result = "failed_unexpectedly_allowed";
      } catch (error) {
        sqlstate = safeSqlState(error);
        result = sqlstate === "42501" ? "verified" : "unverified";
      }
    } catch (error) {
      sqlstate = safeSqlState(error);
      result = "unverified";
    } finally {
      await runtimeClient.query("ROLLBACK").catch(() => undefined);
    }
    const probe = { name, result, sqlstate, transactionRollback: true };
    results.push(probe);
    record("runtime_permission_probe", probe);
  }
  return { result: results.every(({ result }) => result === "verified") ? "verified" : "unverified", probes: results };
}

async function runAdminPermissionProbe(adminClient, record) {
  let rows = [];
  let policies = [];
  try {
    await adminClient.query("BEGIN READ ONLY");
    rows = (await adminClient.query(`
      SELECT c.relname,
             pg_get_userbyid(c.relowner) AS owner,
             c.relrowsecurity AS rls,
             c.relforcerowsecurity AS force_rls,
             has_table_privilege(current_user, format('public.%s', c.relname), 'SELECT') AS can_select,
             has_table_privilege(current_user, format('public.%s', c.relname), 'UPDATE') AS can_update
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::name[])
      ORDER BY c.relname
    `, [["import_jobs", "attachments"]])).rows;
    policies = (await adminClient.query("SELECT polname FROM pg_policy WHERE polname = ANY($1::name[]) ORDER BY polname", [["brokerdesk_import_worker_claim_select", "brokerdesk_import_worker_claim_update"]])).rows.map(({ polname }) => polname);
    await adminClient.query("ROLLBACK");
  } catch (error) {
    await adminClient.query("ROLLBACK").catch(() => undefined);
    const probe = { result: "unverified", sqlstate: safeSqlState(error), rows: [], policies: [], transactionRollback: true };
    record("admin_permission_probe", probe);
    return probe;
  }
  const result = rows.length === 2
    && rows.every((row) => row.can_select && row.can_update)
    && policies.length === 2;
  const probe = { result: result ? "verified" : "failed", rows, policies, transactionRollback: true };
  record("admin_permission_probe", probe);
  return probe;
}

function makeSelfTestConfig() {
  const route = (logicalRole) => ({
    projectRef: TARGET.ref,
    logicalRole,
    host: TARGET.host,
    port: TARGET.port,
    database: TARGET.database,
    user: expectedUsername(logicalRole),
    tls: { mode: "verify-full", rejectUnauthorized: true, servername: TARGET.host, caPath: "/controlled/ca.pem", caSha256: TARGET.caSha256 },
  });
  return { targetRef: TARGET.ref, managementPassword: "memory-only-self-test", management: route("postgres"), roleRoutes: Object.fromEntries(ROLES.map((role) => [role, route(role)])) };
}

export function runOfflineSelfTest() {
  const valid = makeSelfTestConfig();
  assert.doesNotThrow(() => assertInputShape(valid));
  const cases = [
    ["bare_role_username", (input) => { input.roleRoutes.brokerdesk_runtime.user = "brokerdesk_runtime"; }],
    ["wrong_project_ref", (input) => { input.roleRoutes.brokerdesk_runtime.user = "brokerdesk_runtime.otherref"; }],
    ["unexpected_role", (input) => { input.roleRoutes.brokerdesk_runtime.logicalRole = "unexpected_role"; }],
    ["wrong_host", (input) => { input.roleRoutes.brokerdesk_runtime.host = "aws-0-us-east-1.pooler.supabase.com"; }],
    ["wrong_port", (input) => { input.roleRoutes.brokerdesk_runtime.port = 6543; }],
    ["wrong_database", (input) => { input.roleRoutes.brokerdesk_runtime.database = "other"; }],
    ["wrong_tls", (input) => { input.roleRoutes.brokerdesk_runtime.tls.rejectUnauthorized = false; }],
    ["wrong_ca", (input) => { input.roleRoutes.brokerdesk_runtime.tls.caSha256 = "0".repeat(64); }],
  ];
  const checks = [];
  let writesBeforeGate = 0;
  for (const [name, mutate] of cases) {
    const candidate = structuredClone(valid);
    mutate(candidate);
    assert.throws(() => assertInputShape(candidate), /preflight_config_rejected/);
    checks.push({ name, rejectedBeforeWrite: true });
  }
  const validBaseline = {
    identity: { database: TARGET.database, session_user: "postgres", current_user: "postgres", password_encryption: "scram-sha-256" },
    roles: ROLES.map((rolname) => ({ rolname, rolcanlogin: false, rolsuper: false, rolcreaterole: false, rolbypassrls: false })),
    passwordState: ROLES.map((rolname) => ({ rolname, password_is_null: true })),
    sessions: [],
  };
  const rejectedBaseline = structuredClone(validBaseline);
  rejectedBaseline.roles[0].rolcanlogin = true;
  let rejectedBaselineWriteCalls = 0;
  assert.throws(() => runGuardedWrite({
    baseline: rejectedBaseline,
    classification: { phase: "complete", appliedCount: 44 },
    write: () => { rejectedBaselineWriteCalls += 1; },
  }), /baseline_role_state_mismatch/);
  assert.equal(rejectedBaselineWriteCalls, 0);
  checks.push({ name: "baseline_rejection_zero_write_calls", writeCalls: rejectedBaselineWriteCalls });
  let acceptedBaselineWriteCalls = 0;
  runGuardedWrite({
    baseline: validBaseline,
    classification: { phase: "complete", appliedCount: 44 },
    write: () => { acceptedBaselineWriteCalls += 1; },
  });
  assert.equal(acceptedBaselineWriteCalls, 1);
  checks.push({ name: "baseline_pass_allows_write_gate", writeCalls: acceptedBaselineWriteCalls });
  const attempts = createRoleAttempts();
  markRoleAttempt(attempts, "brokerdesk_runtime", "passwordWriteAttempted");
  assert.deepEqual(rolesRequiringCleanup(attempts), ["brokerdesk_runtime"]);
  markRoleAttempt(attempts, "brokerdesk_admin", "loginWriteAttempted");
  assert.deepEqual(rolesRequiringCleanup(attempts), ROLES);
  checks.push({ name: "partial_write_cleanup_roles", afterRuntimePassword: ["brokerdesk_runtime"], afterAdminLogin: [...ROLES] });
  const probeClassification = [
    ["28000", "verified"],
    ["28P01", "verified"],
    ["XX000", "unverified"],
    ["ETIMEDOUT", "unverified"],
    ["08001", "unverified"],
  ].map(([code, expected]) => ({ code, result: classifyAuthProbeError({ code }), expected }));
  assert.ok(probeClassification.every(({ result, expected }) => result === expected));
  checks.push({ name: "auth_probe_classification", cases: probeClassification });
  assert.equal(writesBeforeGate, 0);
  return { mode: "offline-self-test", cloudExecuted: false, writesBeforeGate, checks, validRouteUsers: [routeUsername("brokerdesk_runtime"), routeUsername("brokerdesk_admin")] };
}

async function runCloud(input) {
  assertInputShape(input);
  const events = [];
  const record = createRecorder(events);
  const credentials = new Map();
  const connections = [];
  const roleClients = new Map();
  const roleAttempts = createRoleAttempts();
  let managementClient = null;
  let cleanupCompleted = false;
  let tempRoot = null;
  try {
    const ca = readAndVerifyCa(input.management);
    for (const role of ROLES) {
      const roleCa = readAndVerifyCa(input.roleRoutes[role]);
      if (roleCa !== ca) throw new Error("preflight_config_rejected:ca_content_mismatch");
    }
    record("target_preflight_pass", {
      ref: TARGET.ref,
      host: TARGET.host,
      port: TARGET.port,
      database: TARGET.database,
      managementUser: input.management.user,
      roleUsers: Object.fromEntries(ROLES.map((role) => [role, input.roleRoutes[role].user])),
      tls: "verify-full",
      caSha256: TARGET.caSha256,
    });
    managementClient = new Client(pgConfig(input.management, input.managementPassword, ca));
    await managementClient.connect();
    const { preflightTokyoMigration, classifyTokyoInitialization } = await import("../../../scripts/run-tokyo-supabase-migrations.mjs");
    const migrationState = await preflightTokyoMigration({ config: pgConfig(input.management, input.managementPassword, ca), client: managementClient });
    const classification = await classifyTokyoInitialization(migrationState, MIGRATIONS_DIRECTORY);
    const baseline = await readBaseline(managementClient);
    assertReadyForWrites({ baseline, classification: { phase: classification.phase, appliedCount: migrationState.ledgerRows.length } });
    record("baseline_pass", { commit: TARGET.commit, marker: "complete", ledger: 44, checksumMatch: true });
    tempRoot = mkdtempSync(join(tmpdir(), "brokerdesk-runtime-entry-"));
    const helper = compileHelper(tempRoot);
    for (const role of ROLES) {
      const password = randomBytes(32).toString("base64url");
      credentials.set(role, password);
      markRoleAttempt(roleAttempts, role, "passwordWriteAttempted");
      setPasswordWithHelper(helper, input.management, input.managementPassword, role, password);
      markRoleAttempt(roleAttempts, role, "passwordWriteConfirmed");
      record("password_change_submitted", { role, api: "libpq.PQchangePassword", transport: "anonymous_stdin_pipe", argvCount: 0 });
    }
    const afterPassword = await readBaseline(managementClient);
    if (afterPassword.identity.password_encryption !== "scram-sha-256" || afterPassword.roles.some((row) => row.rolcanlogin)) throw new Error("password_stage_baseline_mismatch");
    for (const role of ROLES) {
      markRoleAttempt(roleAttempts, role, "loginWriteAttempted");
      await managementClient.query(`ALTER ROLE ${role} LOGIN`);
      markRoleAttempt(roleAttempts, role, "loginWriteConfirmed");
      record("role_login_submitted", { role });
    }
    for (const role of ROLES) {
      markRoleAttempt(roleAttempts, role, "loginProbeAttempted");
      const connection = new Client(pgConfig({ ...input.roleRoutes[role], applicationName: APP_NAMES[role] }, credentials.get(role), ca));
      try {
        await connection.connect();
      } catch (error) {
        record("role_login_probe", { role, result: "unverified", sqlstate: safeSqlState(error), errorCode: safeErrorCode(error) });
        throw error;
      }
      connections.push(connection);
      roleClients.set(role, connection);
      const identity = (await connection.query("SELECT current_user, session_user, current_database(), pg_backend_pid() AS pid")).rows[0];
      if (identity.current_user !== role || identity.session_user !== role || identity.current_database !== TARGET.database) throw new Error("role_identity_mismatch");
      record("role_login_probe", { role, result: "verified", currentUser: identity.current_user, sessionUser: identity.session_user, database: identity.current_database });
    }
    const runtimePermissions = await runRuntimePermissionProbes(roleClients.get("brokerdesk_runtime"), record);
    const adminPermissions = await runAdminPermissionProbe(roleClients.get("brokerdesk_admin"), record);
    if (runtimePermissions.result !== "verified" || adminPermissions.result !== "verified") {
      record("permission_probe_gate_failed", { runtime: runtimePermissions.result, admin: adminPermissions.result });
      const error = new Error("permission_probe_failed");
      error.code = "permission_probe_failed";
      throw error;
    }
    const cleanup = await cleanupRuntimeState({ client: managementClient, input, ca, credentials, connections, rolesToClean: rolesRequiringCleanup(roleAttempts), record });
    cleanupCompleted = true;
    if (cleanup.probeResult !== "verified") {
      record("entry_not_passed", { reason: "login_rejection_probe_unverified", cleanupResult: cleanup.cleanupResult, probeResult: cleanup.probeResult });
      return { target: { ref: TARGET.ref, database: TARGET.database, host: TARGET.host, port: TARGET.port, commit: TARGET.commit }, events, roleAttempts, result: "stopped" };
    }
    record("entry_pass", { cloudExecuted: true, finalState: "NOLOGIN/PASSWORD NULL" });
    return { target: { ref: TARGET.ref, database: TARGET.database, host: TARGET.host, port: TARGET.port, commit: TARGET.commit }, events, roleAttempts, result: "pass" };
  } catch (error) {
    record("stopped", { category: "sql_or_client_error", sqlstate: safeSqlState(error) });
    return { target: { ref: TARGET.ref, database: TARGET.database, host: TARGET.host, port: TARGET.port, commit: TARGET.commit }, events, roleAttempts, result: "stopped" };
  } finally {
    const rolesToClean = rolesRequiringCleanup(roleAttempts);
    if (managementClient && !cleanupCompleted && rolesToClean.length > 0) {
      try {
        const ca = readAndVerifyCa(input.management);
        await cleanupRuntimeState({ client: managementClient, input, ca, credentials, connections, rolesToClean, record });
        cleanupCompleted = true;
      } catch (error) {
        record("exception_cleanup_failure", { sqlstate: safeSqlState(error) });
      }
    } else if (managementClient && !cleanupCompleted) {
      record("cleanup_not_run", { reason: "preflight_failed_before_any_password_or_login_write", roles: [] });
    }
    record("role_attempt_state", { roleAttempts, rolesToClean });
    if (managementClient) await managementClient.end().catch(() => undefined);
    for (const role of ROLES) credentials.delete(role);
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  }
}

const mode = process.argv[2] ?? "--self-test";
if (mode === "--self-test") {
  process.stdout.write(`${JSON.stringify(runOfflineSelfTest())}\n`);
} else if (mode === "--execute-cloud") {
  try {
    const result = await runCloud(readLengthPrefixedJson());
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.result !== "pass") process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ mode, cloudExecuted: false, result: "preflight_rejected", category: "config", messageClass: String(error?.message ?? "").split(":")[0] })}\n`);
    process.exitCode = 1;
  }
} else {
  process.stdout.write(`${JSON.stringify({ result: "invalid_mode", allowed: ["--self-test", "--execute-cloud"] })}\n`);
  process.exitCode = 64;
}
