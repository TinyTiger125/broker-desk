import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const routeFilename = resolve(root, "src/app/api/clients/exact-name/route.ts");
const originalResolve = Module._resolveFilename;
const resolveCandidate = (value) => [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`]
  .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());

Module._resolveFilename = function(request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
require.extensions[".ts"] = (mod, filename) => mod._compile(typescript.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: {
    module: typescript.ModuleKind.CommonJS,
    target: typescript.ScriptTarget.ES2022,
    jsx: typescript.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
  fileName: filename,
}).outputText, filename);
require.extensions[".tsx"] = require.extensions[".ts"];

let sessionMode = "authorized";
let routeSession;
let capturedPermission;
class StubTenantSessionError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "TenantSessionError";
    this.code = code;
    this.status = status;
  }
}

const originalLoad = Module._load;
Module._load = function(request, parent, ...rest) {
  if (request === "server-only") return {};
  if (parent?.filename === routeFilename && request === "next/server") {
    return { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } }) } };
  }
  if (parent?.filename === routeFilename && request === "@/lib/tenant-session") {
    return {
      TenantSessionError: StubTenantSessionError,
      requireTenantSession: async (options) => {
        capturedPermission = options.permission;
        if (sessionMode === "missing") throw new StubTenantSessionError("user_not_found", 401);
        if (sessionMode === "denied") throw new StubTenantSessionError("permission_denied", 403);
        return routeSession;
      },
    };
  }
  if (parent?.filename === resolve(root, "src/lib/data.ts")) {
    if (request === "@/lib/data.postgres") return {};
    if (request === "react") return { cache: (fn) => fn };
    if (["next/headers", "@/lib/actor", "@/lib/auth-mode", "@/lib/clerk-auth", "@/lib/staging-access-policy"].includes(request)) return {};
    if (request === "@/lib/production-readiness") return { isPostgresDataStoreConfigured: () => false, assertProductionDataStoreReady: () => {}, isProductionRuntime: () => false };
  }
  return originalLoad.call(this, request, parent, ...rest);
};

const data = require(resolve(root, "src/lib/data.ts"));
const { registerTenantSessionProvenance } = require(resolve(root, "src/lib/tenant-session-provenance.ts"));
const { GET } = require(routeFilename);

data.resetBusinessDataForQa();
const tenant = await data.getTenantById("tenant_cherry");
const user = await data.getUserById("user_demo");
const membership = (await data.listTenantMemberships(user.id)).find((item) => item.tenantId === tenant.id);
routeSession = { tenant, user, membership, externalAuthSubject: user.externalAuthSubject };
registerTenantSessionProvenance(routeSession);

const clientDefaults = {
  tenantId: tenant.id,
  ownerUserId: user.id,
  name: "Legacy Name",
  nameLatin: "YAMADA, TARO",
  nameKanji: "山田 太郎",
  nameKatakana: "ヤマダ タロウ",
  phone: "090-0000-0000",
  email: "lookup-visible@example.test",
  budgetType: "total_price",
  purpose: "buy",
  loanPreApprovalStatus: "not_applied",
  stage: "lead",
  temperature: "cold",
  brokerageContractType: "none",
  amlCheckStatus: "not_required",
};
const visibleClient = await data.addClient(clientDefaults);
const privateSameName = await data.addClient({ ...clientDefaults, id: "client-private-same-name", ownerUserId: "user_ops", email: "lookup-private@example.test" });
const foreignSameName = await data.addClient({ ...clientDefaults, id: "client-foreign-same-name", tenantId: "tenant-foreign", email: "lookup-foreign@example.test" });

async function lookup(query) {
  const response = await GET(new Request(`http://broker-desk.local/api/clients/exact-name?q=${encodeURIComponent(query)}`));
  return { response, body: await response.json() };
}

for (const [query, label] of [
  ["Legacy Name", "legacy name"],
  ["ＹＡＭＡＤＡ，　ＴＡＲＯ", "Latin name"],
  ["山田 太郎", "Hanzi name"],
  ["ﾔﾏﾀﾞ ﾀﾛｳ", "Katakana name"],
]) {
  const { response, body } = await lookup(query);
  assert.equal(response.status, 200, `${label} lookup must succeed`);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(body.ok, true);
  assert.deepEqual(body.matches.map((item) => item.id), [visibleClient.id], `${label} lookup must obey tenant and visibility scope`);
}

assert.equal(capturedPermission, "record.read", "lookup route must request record.read before reading names");
assert.equal(privateSameName.id, "client-private-same-name");
assert.equal(foreignSameName.id, "client-foreign-same-name");

sessionMode = "missing";
const unauthenticated = await lookup("Legacy Name");
assert.equal(unauthenticated.response.status, 401);
assert.deepEqual(unauthenticated.body, { ok: false, error: "user_not_found" });

sessionMode = "denied";
const unauthorized = await lookup("Legacy Name");
assert.equal(unauthorized.response.status, 403);
assert.deepEqual(unauthorized.body, { ok: false, error: "permission_denied" });

console.log("PASS: exact-name API route enforces session permission and returns only visible tenant-scoped matches across legacy, Latin, Hanzi, and Katakana names");
