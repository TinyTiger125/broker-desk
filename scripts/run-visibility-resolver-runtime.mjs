#!/usr/bin/env node

import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function readStdin() {
  return new Promise((resolveInput, reject) => {
    let value = "";
    process.stdin.setEncoding("utf8");
    let settled = false;
    process.stdin.on("data", (chunk) => {
      value += chunk;
      const newline = value.indexOf("\n");
      if (newline >= 0 && !settled) {
        settled = true;
        try { resolveInput(JSON.parse(value.slice(0, newline))); } catch (error) { reject(error); }
        process.stdin.pause();
      }
    });
    process.stdin.on("end", () => {
      if (settled) return;
      settled = true;
      try { resolveInput(JSON.parse(value)); } catch (error) { reject(error); }
    });
  });
}

const input = await readStdin();
for (const name of ["databaseUrl", "ownerSubject", "colleagueSubject", "tenantId", "personId", "propertyId", "caseId", "pendingPropertyId"]) {
  if (typeof input[name] !== "string" || input[name].trim() === "") throw new Error(`${name} is required`);
}

// The disposable branch intentionally starts from the current Staging ledger;
// do not pretend it is Production or bypass the production-readiness gate.
// The database role/RLS remain the restricted runtime boundary under test.
process.env.BROKER_DESK_DEPLOYMENT_ENV = "preview";
process.env.NODE_ENV = "production";
process.env.DATABASE_URL = input.databaseUrl;
delete process.env.DATABASE_DEVELOPMENT_URL;

const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
let currentSubject = "";
Module._load = function (request, parent, ...rest) {
  if (request === "@clerk/nextjs/server") {
    return {
      auth: async () => ({ userId: currentSubject }),
      currentUser: async () => null,
    };
  }
  return originalLoad.call(this, request, parent, ...rest);
};
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

const postgres = require(resolve(root, "src/lib/data.postgres.ts"));
const resolver = require(resolve(root, "src/lib/visibility-resolver.ts"));
process.env.BROKER_DESK_AUTH_MODE = "clerk";

async function contextFor(subject) {
  currentSubject = subject;
  const tenantSessionPath = resolve(root, "src/lib/tenant-session.ts");
  const clerkAuthPath = resolve(root, "src/lib/clerk-auth.ts");
  delete require.cache[tenantSessionPath];
  delete require.cache[clerkAuthPath];
  const tenantSession = require(tenantSessionPath);
  const session = await tenantSession.requireTenantSession({ requestedTenantId: input.tenantId });
  return resolver.createRequestContext(session);
}

const ownerContext = await contextFor(input.ownerSubject);
const colleagueContext = await contextFor(input.colleagueSubject);
const results = { owner: {}, colleague: {}, negative: {} };

async function probe(label, fn) {
  const result = await fn();
  results[label] = { outcome: result.resolution.outcome, canRead: result.resolution.canRead, canWrite: result.resolution.canWrite, hasRecord: Boolean(result.record) };
}

await probe("ownerPerson", () => postgres.resolveClientVisibilityForContext({ context: ownerContext, clientId: input.personId }));
await probe("ownerProperty", () => postgres.resolvePropertyVisibilityForContext({ context: ownerContext, propertyId: input.propertyId }));
await probe("ownerCase", () => postgres.resolveCaseVisibilityForContext({ context: ownerContext, caseId: input.caseId }));
await probe("colleaguePersonPrivate", () => postgres.resolveClientVisibilityForContext({ context: colleagueContext, clientId: input.personId }));
await probe("colleaguePropertyPrivate", () => postgres.resolvePropertyVisibilityForContext({ context: colleagueContext, propertyId: input.propertyId }));
await probe("colleagueCasePrivate", () => postgres.resolveCaseVisibilityForContext({ context: colleagueContext, caseId: input.caseId }));

const pending = await postgres.resolvePropertyVisibilityForContext({ context: ownerContext, propertyId: input.pendingPropertyId });
results.pending = { outcome: pending.resolution.outcome, canRead: pending.resolution.canRead, canWrite: pending.resolution.canWrite, hasRecord: Boolean(pending.record) };

const forgedTenantContext = Object.freeze({ ...ownerContext, tenantId: `${ownerContext.tenantId}-forged` });
const forgedTenant = await postgres.resolveClientVisibilityForContext({ context: forgedTenantContext, clientId: input.personId });
results.negative.forgedTenant = { outcome: forgedTenant.resolution.outcome, hasRecord: Boolean(forgedTenant.record) };
const missing = await postgres.resolveClientVisibilityForContext({ context: ownerContext, clientId: "missing-resolver-record" });
results.negative.missing = { outcome: missing.resolution.outcome, hasRecord: Boolean(missing.record) };
const plainContext = JSON.parse(JSON.stringify(ownerContext));
const plain = resolver.resolveRecordVisibility(plainContext, { tenantId: input.tenantId, currentOwnerUserId: ownerContext.userId, visibilityScope: "private", ownerResolutionStatus: "resolved" });
results.negative.plainContext = { outcome: plain.outcome, hasRecord: false };

const ownerWrite = await postgres.withPostgresAuthContext(input.ownerSubject, () => postgres.setRecordVisibilityScope({ tenantId: input.tenantId, objectType: "person", recordId: input.personId, actorUserId: ownerContext.userId, visibilityScope: "company_read" }));
results.ownerScopeChange = { succeeded: Boolean(ownerWrite) };
await probe("companyReadColleague", () => postgres.resolveClientVisibilityForContext({ context: colleagueContext, clientId: input.personId }));
const colleagueWrite = await postgres.withPostgresAuthContext(input.colleagueSubject, () => postgres.setRecordVisibilityScope({ tenantId: input.tenantId, objectType: "person", recordId: input.personId, actorUserId: colleagueContext.userId, visibilityScope: "private" }));
results.companyReadColleagueWrite = { denied: colleagueWrite === null };
await postgres.withPostgresAuthContext(input.ownerSubject, () => postgres.setRecordVisibilityScope({ tenantId: input.tenantId, objectType: "person", recordId: input.personId, actorUserId: ownerContext.userId, visibilityScope: "private" }));

for (const status of ["suspended", "removed"]) {
  try {
    resolver.createRequestContext({ ...colleagueContext, membership: { ...colleagueContext.membership, status } });
    results.negative[`${status}MutationInput`] = { untrustedInputDenied: false };
  } catch {
    results.negative[`${status}MutationInput`] = { untrustedInputDenied: true };
  }
}

console.log(JSON.stringify({
  database: input.databaseName ?? "neondb",
  project: input.projectId ?? "redacted",
  branch: input.branchId ?? "redacted",
  objectTypes: ["person", "property", "case"],
  results,
}, null, 2));
process.exit(0);
