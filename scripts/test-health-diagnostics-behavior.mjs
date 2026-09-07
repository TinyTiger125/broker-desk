import nodeAssert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const helperPath = path.join(root, "src/lib/health-diagnostics.ts");
const routePath = path.join(root, "src/app/api/health/data/route.ts");
const dataPath = path.join(root, "src/lib/data.ts");
const postgresPath = path.join(root, "src/lib/data.postgres.ts");
const require = createRequire(import.meta.url);
const typescript = require("typescript");

function assert(condition, message) {
  nodeAssert.ok(condition, message);
}

function loadHelper() {
  const source = fs.readFileSync(helperPath, "utf8");
  const output = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: helperPath,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    require,
    console,
    URL,
  }, { filename: helperPath });
  return module.exports;
}

assert(fs.existsSync(helperPath), "health diagnostics helper must exist");
const {
  buildHealthBindingDetail,
  buildHealthFailureDetail,
  buildHealthFailureCause,
  isHealthBindingDiagnosticsEnabled,
  parseHealthBindingTarget,
} = loadHelper();
assert(typeof buildHealthBindingDetail === "function", "health binding detail builder must be callable");
assert(typeof buildHealthFailureDetail === "function", "health failure detail builder must be callable");
assert(typeof buildHealthFailureCause === "function", "health failure cause builder must be callable");
assert(typeof isHealthBindingDiagnosticsEnabled === "function", "health binding environment gate must be callable");
assert(typeof parseHealthBindingTarget === "function", "health binding URL parser must be callable");

nodeAssert.equal(
  isHealthBindingDiagnosticsEnabled({ NODE_ENV: "production", BROKER_DESK_DEPLOYMENT_ENV: "staging" }),
  true,
  "staging production-runtime health may collect binding diagnostics"
);
nodeAssert.equal(
  isHealthBindingDiagnosticsEnabled({ NODE_ENV: "production", BROKER_DESK_DEPLOYMENT_ENV: "preview" }),
  true,
  "preview production-runtime health may collect binding diagnostics"
);
for (const environment of [
  { NODE_ENV: "production", BROKER_DESK_DEPLOYMENT_ENV: "production" },
  { NODE_ENV: "production", BROKER_DESK_DEPLOYMENT_ENV: "" },
  { NODE_ENV: "production", BROKER_DESK_DEPLOYMENT_ENV: "unknown" },
  { NODE_ENV: "development", BROKER_DESK_DEPLOYMENT_ENV: "staging" },
]) {
  nodeAssert.equal(
    isHealthBindingDiagnosticsEnabled(environment),
    false,
    "formal production, missing, unknown, and local runtimes must not collect binding diagnostics"
  );
}

const secretConnection = "postgresql://runtime_user:secret-password@db.example.test:6543/secret_database?sslmode=require";
const parsedTarget = parseHealthBindingTarget(secretConnection);
nodeAssert.equal(
  JSON.stringify(parsedTarget),
  JSON.stringify({ host: "db.example.test", port: "6543", database: "secret_database", user: "runtime_user" }),
  "connection URL parsing must retain only non-secret dimensions in memory"
);
for (const invalidConnection of [
  "",
  "https://db.example.test/secret_database",
  "postgresql://:secret-password@db.example.test/secret_database",
  "postgresql://runtime_user:secret-password@db.example.test",
]) {
  nodeAssert.equal(parseHealthBindingTarget(invalidConnection), undefined, "invalid connection targets must fail closed");
}
const binding = buildHealthBindingDetail({
  target: parsedTarget,
  databaseName: "secret_database",
  roleName: "runtime_user",
});
nodeAssert.deepEqual(
  Object.keys(binding).sort(),
  [
    "databaseTargetMatches",
    "roleTargetMatches",
    "runtimeDatabaseFingerprint",
    "runtimeRoleFingerprint",
    "source",
    "urlTargetFingerprint",
    "version",
  ],
  "binding diagnostics must contain only versioned source, fingerprints, and match booleans"
);
nodeAssert.equal(binding.version, "v1", "binding diagnostics version must be stable");
nodeAssert.equal(binding.source, "runtime_database_url", "binding diagnostics source must be stable");
for (const digest of [
  binding.urlTargetFingerprint,
  binding.runtimeDatabaseFingerprint,
  binding.runtimeRoleFingerprint,
]) {
  assert(/^[0-9a-f]{64}$/.test(digest), "binding diagnostics must use SHA-256 hex fingerprints");
}
nodeAssert.equal(binding.databaseTargetMatches, true, "database target comparison is retained");
nodeAssert.equal(binding.roleTargetMatches, true, "role target comparison is retained");
const serializedBinding = JSON.stringify(binding);
for (const forbiddenValue of ["secret-password", "db.example.test", "secret_database", "runtime_user", secretConnection]) {
  assert(!serializedBinding.includes(forbiddenValue), "binding diagnostics must not expose connection dimensions");
}

const secret = "postgres://user:password@internal.example/staging";
const detail = buildHealthFailureDetail({
  requestId: "health-request-123",
  phase: "data_driver",
  error: Object.assign(new Error(secret), {
    name: "UntrustedInternalError",
    code: "not-safe",
    stack: `sensitive stack ${secret}`,
  }),
});

nodeAssert.deepEqual(Object.keys(detail).sort(), ["digest", "errorClass", "phase", "requestId"], "unknown errors expose only the safe diagnostic fields");
nodeAssert.equal(detail.requestId, "health-request-123", "request correlation is preserved");
nodeAssert.equal(detail.phase, "data_driver", "the failure phase is preserved");
nodeAssert.equal(detail.errorClass, "UnknownError", "unknown error classes are normalized");
assert(!JSON.stringify(detail).includes(secret), "connection details must not enter health diagnostics");

const sqlStateDetail = buildHealthFailureDetail({
  requestId: "health-request-42501",
  phase: "data_driver",
  error: Object.assign(new Error("permission denied"), { code: "42501" }),
});
nodeAssert.equal(sqlStateDetail.sqlState, "42501", "PostgreSQL SQLSTATE is retained when it is structurally valid");

const appCodeDetail = buildHealthFailureDetail({
  requestId: "health-request-readiness",
  phase: "readiness",
  error: Object.assign(new Error("internal message"), { code: "production_migrations_required" }),
});
nodeAssert.equal(appCodeDetail.appErrorCode, "production_migrations_required", "known application error codes are retained");

const wrappedDetail = buildHealthFailureDetail({
  requestId: "health-request-wrapped",
  phase: "data_driver",
  error: Object.assign(new Error("safe wrapper"), {
    name: "ProductionReadinessError",
    code: "production_migrations_required",
    cause: buildHealthFailureCause(Object.assign(new Error("permission denied"), {
      code: "42501",
      stack: `sensitive stack ${secret}`,
    })),
  }),
});
nodeAssert.equal(
  JSON.stringify({
    causeErrorClass: wrappedDetail.causeErrorClass,
    causePhase: wrappedDetail.causePhase,
    causeSqlState: wrappedDetail.causeSqlState,
    causeAppErrorCode: wrappedDetail.causeAppErrorCode,
  }),
  JSON.stringify({ causeErrorClass: "Error", causePhase: "ledger_query", causeSqlState: "42501" }),
  "wrapped readiness errors preserve only safe inner cause metadata"
);
assert(!JSON.stringify(wrappedDetail).includes(secret), "wrapped diagnostics must not include secret cause details");

const unknownCauseDetail = buildHealthFailureDetail({
  requestId: "health-request-unknown-cause",
  phase: "data_driver",
  error: Object.assign(new Error("safe wrapper"), {
    name: "ProductionReadinessError",
    code: "production_migrations_required",
    cause: { errorClass: "InternalDatabaseError", phase: "required_set_compare", message: secret, stack: secret },
  }),
});
nodeAssert.equal(
  JSON.stringify({
    causeErrorClass: unknownCauseDetail.causeErrorClass,
    causePhase: unknownCauseDetail.causePhase,
    causeSqlState: unknownCauseDetail.causeSqlState,
    causeAppErrorCode: unknownCauseDetail.causeAppErrorCode,
  }),
  JSON.stringify({ causeErrorClass: "UnknownError", causePhase: "required_set_compare" }),
  "unknown wrapped causes normalize to safe phase and class"
);

const routeSource = fs.readFileSync(routePath, "utf8");
const dataSource = fs.readFileSync(dataPath, "utf8");
const postgresSource = fs.readFileSync(postgresPath, "utf8");
const bindingHealthSource = postgresSource.slice(
  postgresSource.indexOf("async function getHealthBindingDiagnostics"),
  postgresSource.indexOf("async function getHealthBindingDiagnostics") + 2200,
);
assert(routeSource.includes("buildHealthFailureDetail"), "health route must use the safe diagnostic builder");
assert(routeSource.includes("status: \"unavailable\""), "health response must remain generic");
assert(routeSource.includes("{ status: 503"), "health response must remain HTTP 503");
assert(!routeSource.includes("error.message"), "health route must not log raw error messages");
assert(!routeSource.includes("error.stack"), "health route must not log raw error stacks");
assert(routeSource.includes("detail: health.binding"), "binding diagnostics must be logged only as structured detail");
for (const forbiddenSourceValue of ["databaseName", "roleName", "DATABASE_URL", "urlTargetFingerprint", "runtimeDatabaseFingerprint"]) {
  assert(!routeSource.includes(forbiddenSourceValue), "health route must not handle raw or fingerprint internals");
}
assert(dataSource.includes("isHealthBindingDiagnosticsEnabled"), "data facade must gate binding diagnostics by deployment class");
assert(dataSource.includes("binding: postgresHealth.binding"), "data facade must pass binding diagnostics to the health route");
assert(postgresSource.includes("parseHealthBindingTarget"), "Postgres health must parse the configured database target safely");
assert(postgresSource.includes("current_database()") && postgresSource.includes("current_user"), "Postgres health must read live identity dimensions");
assert(postgresSource.includes("return undefined"), "optional binding query failures must degrade without changing health readiness");
assert(!bindingHealthSource.includes("targetCaseId") && !bindingHealthSource.includes("tenant_"), "binding diagnostics must not query business targets");
assert(
  postgresSource.includes('buildHealthFailureCause(error, "ledger_query")'),
  "migration readiness wrapping must preserve only the safe ledger cause"
);
assert(
  postgresSource.includes('Object.defineProperty(readinessError, "cause"'),
  "migration readiness wrapping must attach the safe cause metadata"
);

console.log("[PASS] health diagnostics whitelist behavior and generic failure response");
