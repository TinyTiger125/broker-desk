#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const routeSource = fs.readFileSync("src/app/api/qa/seed-client-candidate/route.ts", "utf8");
const qaApiSource = fs.readFileSync("src/lib/qa-api.ts", "utf8");

assert.match(routeSource, /export async function POST\(request: Request\)/, "fixture seeding must be POST-only");
assert.doesNotMatch(routeSource, /export async function GET\(/, "fixture seeding must not expose a mutating GET route");
assert.match(routeSource, /activeDataDriver !== "memory"/, "fixture seeding must refuse non-memory drivers");
assert.match(routeSource, /isQaApiRequestAllowed\(request\)/, "fixture seeding must use the QA request guard");
assert.match(routeSource, /ui-only-client-candidate-fixture\.txt/, "fixture must remain explicitly UI-only");
assert.match(routeSource, /no identity document and no model invocation/, "fixture must not present itself as an identity document");

function loadModule(source, dependencies, env) {
  const module = { exports: {} };
  const outputText = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    require(name) {
      if (!(name in dependencies)) throw new Error(`unexpected module dependency: ${name}`);
      return dependencies[name];
    },
    process: { env },
    Buffer,
    console,
  });
  return module.exports;
}

const response = (body, options = {}) => ({ body, status: options.status ?? 200 });
const nextServer = { NextResponse: { json: response } };
const hashStub = { createHash: () => ({ update: () => ({ digest: () => "fixture-hash" }) }) };
const baseData = {
  getDefaultUser: async () => ({ id: "user_demo" }),
  getClientById: async () => null,
  addPrivateAttachment: async () => ({ id: "attachment" }),
  createObjectImportTarget: async () => {},
  listObjectImportTargets: async () => [],
  upsertObjectImportCandidate: async () => {},
};

const qaApiProduction = loadModule(qaApiSource, { "next/server": nextServer }, { NODE_ENV: "production" });
const productionRoute = loadModule(routeSource, {
  "node:crypto": hashStub,
  "next/server": nextServer,
  "@/lib/data": { ...baseData, activeDataDriver: "memory" },
  "@/lib/object-import-contract": { buildObjectVersionFingerprint: () => "fingerprint" },
  "@/lib/tenant-constants": { DEFAULT_TENANT_ID: "tenant" },
  "@/lib/qa-api": qaApiProduction,
}, { NODE_ENV: "production" });
const productionResponse = await productionRoute.POST(
  new Request("http://127.0.0.1:3016/api/qa/seed-client-candidate", {
    method: "POST",
    headers: { host: "127.0.0.1:3016", "content-type": "application/json" },
    body: JSON.stringify({ clientId: "client_fixture" }),
  }),
);
assert.equal(productionResponse.status, 404, "production must return 404 before seeding any fixture data");
assert.equal(productionResponse.body.error, "qa_api_disabled", "production must fail closed with qa_api_disabled");

const localEnv = { NODE_ENV: "development" };
const qaApiLocal = loadModule(qaApiSource, { "next/server": nextServer }, localEnv);
const nonMemoryRoute = loadModule(routeSource, {
  "node:crypto": hashStub,
  "next/server": nextServer,
  "@/lib/data": { ...baseData, activeDataDriver: "postgres" },
  "@/lib/object-import-contract": { buildObjectVersionFingerprint: () => "fingerprint" },
  "@/lib/tenant-constants": { DEFAULT_TENANT_ID: "tenant" },
  "@/lib/qa-api": qaApiLocal,
}, localEnv);
const nonMemoryResponse = await nonMemoryRoute.POST(
  new Request("http://127.0.0.1:3016/api/qa/seed-client-candidate", {
    method: "POST",
    headers: { host: "127.0.0.1:3016", "content-type": "application/json" },
    body: JSON.stringify({ clientId: "client_fixture" }),
  }),
);
assert.equal(nonMemoryResponse.status, 409, "local POST must refuse non-memory drivers");
assert.equal(nonMemoryResponse.body.error, "qa_client_candidate_requires_memory_driver");

console.log("Client candidate QA route contract: PASS (POST-only, production 404, memory-only)");
