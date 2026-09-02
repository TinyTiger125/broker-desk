import nodeAssert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const helperPath = path.join(root, "src/lib/health-diagnostics.ts");
const routePath = path.join(root, "src/app/api/health/data/route.ts");
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
  }, { filename: helperPath });
  return module.exports;
}

assert(fs.existsSync(helperPath), "health diagnostics helper must exist");
const { buildHealthFailureDetail } = loadHelper();
assert(typeof buildHealthFailureDetail === "function", "health failure detail builder must be callable");

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

const routeSource = fs.readFileSync(routePath, "utf8");
assert(routeSource.includes("buildHealthFailureDetail"), "health route must use the safe diagnostic builder");
assert(routeSource.includes("status: \"unavailable\""), "health response must remain generic");
assert(routeSource.includes("{ status: 503"), "health response must remain HTTP 503");
assert(!routeSource.includes("error.message"), "health route must not log raw error messages");
assert(!routeSource.includes("error.stack"), "health route must not log raw error stacks");

console.log("[PASS] health diagnostics whitelist behavior and generic failure response");
