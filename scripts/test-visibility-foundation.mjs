import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;
function resolveCandidate(value) {
  if (!value || (!value.startsWith("/") && !value.startsWith("."))) return undefined;
  const candidates = [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}
Module._resolveFilename = function (request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
function compileTypeScript(module, filename) {
  const result = typescript.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
}
require.extensions[".ts"] = compileTypeScript;
require.extensions[".tsx"] = compileTypeScript;

process.env.BROKER_DESK_DEPLOYMENT_ENV = "preview";
const data = require(resolve(root, "src/lib/data.ts"));
const tenantA = "tenant_cherry";
const user = "user_demo";
const newClient = (tenantId, name) => data.addClient({
  tenantId, ownerUserId: user, name, phone: "000-0000-0000", budgetType: "total_price", purpose: "buy",
  loanPreApprovalStatus: "not_applied", stage: "lead", temperature: "cold", brokerageContractType: "none",
  amlCheckStatus: "not_required",
});

const second = await data.createTenantAccountForUser({ userId: user, name: "TASK-040 Second Tenant", slug: "task040-second", idempotencyKey: "task040-visibility-foundation" });
const tenantB = second.tenant.id;

await data.setMemberVisibilityDefault({ tenantId: tenantA, memberUserId: user, actorUserId: user, objectType: "person", visibilityScope: "company_read" });
await data.setMemberVisibilityDefault({ tenantId: tenantA, memberUserId: user, actorUserId: user, objectType: "case", visibilityScope: "private" });
await data.setMemberVisibilityDefault({ tenantId: tenantA, memberUserId: user, actorUserId: user, objectType: "property", visibilityScope: "company_read" });
await data.setMemberVisibilityDefault({ tenantId: tenantB, memberUserId: user, actorUserId: user, objectType: "person", visibilityScope: "private" });
assert.equal((await data.listMemberVisibilityDefaults({ tenantId: tenantA, memberUserId: user })).length, 3);
assert.equal((await data.listMemberVisibilityDefaults({ tenantId: tenantB, memberUserId: user })).length, 1);

const clientA = await newClient(tenantA, "TASK-040 person A");
const clientB = await newClient(tenantB, "TASK-040 person B");
assert.equal(clientA.visibilityScope, "company_read");
assert.equal(clientB.visibilityScope, "private");
await data.setMemberVisibilityDefault({ tenantId: tenantA, memberUserId: user, actorUserId: user, objectType: "person", visibilityScope: "private" });
const clientAfterChange = await newClient(tenantA, "TASK-040 person after default change");
assert.equal(clientA.visibilityScope, "company_read", "changing a default does not rewrite old records");
assert.equal(clientAfterChange.visibilityScope, "private");

const propertyUnknown = await data.addProperty({ tenantId: tenantA, name: "TASK-040 unknown property", listingPrice: 1 });
assert.equal(await data.getPropertyById(propertyUnknown.id, tenantA), null, "unknown owner is hidden from ordinary reads");
assert.equal(await data.setRecordVisibilityScope({ tenantId: tenantA, objectType: "person", recordId: clientA.id, actorUserId: "user_ops", visibilityScope: "private" }), null, "non-owner cannot change scope");
const updated = await data.setRecordVisibilityScope({ tenantId: tenantA, objectType: "person", recordId: clientA.id, actorUserId: user, visibilityScope: "private" });
assert.equal(updated?.visibilityScope, "private");

console.log("visibility-foundation behavior: PASS");
