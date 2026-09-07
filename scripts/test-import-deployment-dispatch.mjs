#!/usr/bin/env node
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const read = (path) => fs.readFileSync(path, "utf8");
function assert(condition, message) { if (!condition) throw new Error(message); }
const processRoute = read("src/app/api/input-files/[jobId]/process/route.ts");

// Execute the actual route and readiness module; only external I/O is stubbed.
function loadModule(source, dependencies, env) {
  const module = { exports: {} };
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    module, exports: module.exports, process: { env },
    require(name) {
      if (!(name in dependencies)) throw new Error(`unexpected route dependency: ${name}`);
      return dependencies[name];
    },
  });
  return module.exports;
}

for (const environment of ["preview", "staging", "production", "unknown", undefined]) {
  for (const workerReady of [false, true]) {
    const env = { NODE_ENV: "production" };
    if (environment !== undefined) env.BROKER_DESK_DEPLOYMENT_ENV = environment;
    if (workerReady) Object.assign(env, {
      BROKER_DESK_IMPORT_WORKER_ENABLED: "true",
      BROKER_DESK_IMPORT_WORKER_SCHEDULE: "every minute",
      BROKER_DESK_IMPORT_WORKER_TOKEN: "test-only-worker-token-with-32-characters",
    });
    const readiness = loadModule(read("src/lib/production-readiness.ts"), {}, env);
    const calls = [];
    class TenantSessionError extends Error {}
    const route = loadModule(processRoute, {
      "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
      "@/lib/data": {
        listImportJobs: async (userId, limit, tenantId) => {
          assert(userId === "owner" && tenantId === "tenant-a", "lookup must retain session scope");
          return [{ id: "existing-job", status: "queued", sourceType: "excel" }];
        },
        retryImportJobExecution: async () => { throw new Error("queued jobs must not be reset"); },
      },
      "@/lib/excel-import-processor": { processExcelImportJob: async (input) => {
        calls.push(input);
        return { ok: true, status: "mapped" };
      } },
      "@/lib/identity-import-processor": { processIdentityImportJob: async () => { throw new Error("unexpected identity processing"); } },
      "@/lib/operational-logging": { getRequestId: () => "test-request", logOperationalEvent: () => {} },
      "@/lib/production-readiness": readiness,
      "@/lib/tenant-session": {
        TenantSessionError,
        requireTenantSession: async ({ permission }) => {
          assert(permission === "source.upload", "processing must require the existing upload permission");
          return { user: { id: "owner" }, tenant: { id: "tenant-a" } };
        },
      },
    }, env);
    const response = await route.POST({}, { params: Promise.resolve({ jobId: "existing-job" }) });
    const local = environment === "preview" || environment === "staging";
    const label = `${environment ?? "missing"}, worker=${workerReady}`;
    if (local) {
      assert(response.status === 200 && response.body.status === "mapped" && calls.length === 1,
        `${label}: explicit non-production must process the existing job locally`);
      assert(JSON.stringify(calls[0]) === JSON.stringify({ tenantId: "tenant-a", userId: "owner", jobId: "existing-job" }),
        `${label}: processor must receive the exact authorized job and tenant`);
    } else {
      assert(calls.length === 0, `${label}: formal/unknown/missing must never process locally`);
      assert(workerReady
        ? response.status === 202 && response.body.status === "queued"
        : response.status === 503 && response.body.error === "production_import_worker_required",
      `${label}: formal production must preserve worker readiness and fail-closed behavior`);
    }
  }
}

console.log("[PASS] queued Excel route deployment dispatch (10 cases)");
