#!/usr/bin/env node
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const require = Module.createRequire(import.meta.url);
const { ClerkAPIResponseError } = require("@clerk/backend/errors");

const root = process.cwd();
const cache = new Map();

function resolveAlias(request) {
  const relative = request.slice("@/lib/".length);
  const candidates = /\.(?:ts|mjs|js|cjs)$/.test(relative)
    ? [path.resolve(`src/lib/${relative}`)]
    : [".ts", ".mjs", ".js", ".cjs"].map((extension) => path.resolve(`src/lib/${relative}${extension}`));
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function loadTs(sourcePath) {
  sourcePath = path.resolve(sourcePath);
  if (cache.has(sourcePath)) return cache.get(sourcePath);
  const output = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = new Module(sourcePath);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(process.cwd());
  cache.set(sourcePath, mod.exports);
  const originalRequire = mod.require.bind(mod);
  mod.require = (request) => request.startsWith("@/lib/") ? loadTs(resolveAlias(request)) : originalRequire(request);
  mod._compile(output, sourcePath);
  cache.set(sourcePath, mod.exports);
  return mod.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

process.env.BROKER_DESK_AUTH_MODE = "clerk";
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_injected";
process.env.CLERK_SECRET_KEY = "sk_test_injected";

const {
  classifyClerkInvitationError,
  createClerkInvitationForTenantMember,
} = loadTs("src/lib/clerk-invitations.ts");

const context = {
  tenant: { id: "tenant_mock", name: "Mock Tenant" },
  member: {
    id: "membership_mock",
    role: "tenant_owner",
    user: { id: "user_mock", name: "Mock User", email: "invite@example.test" },
  },
};

const paramsSeen = [];
const success = await createClerkInvitationForTenantMember(context, {
  createInvitation: async (params) => {
    paramsSeen.push(params);
    return { id: "inv_mock", url: "https://example.test/inv_mock" };
  },
});
assert(success.ok && success.providerInvitationId === "inv_mock", "injected provider success must return the provider id");
assert(paramsSeen.length === 1 && paramsSeen[0].notify === true && paramsSeen[0].ignoreExisting === true, "mock must receive explicit notify and resend semantics");

let unknownProviderError;
try {
  await createClerkInvitationForTenantMember(context, {
    createInvitation: async () => {
      throw new Error("fetch failed after provider request");
    },
  });
} catch (error) {
  unknownProviderError = error;
}
assert(unknownProviderError && classifyClerkInvitationError(unknownProviderError).uncertain === true, "injected provider interruption must be classified as unknown");

const explicitRejection = new ClerkAPIResponseError("invalid invitation", {
  data: [{ code: "email_address_invalid", message: "invalid" }],
  status: 422,
});
assert(classifyClerkInvitationError(explicitRejection).uncertain === false, "Clerk 4xx must remain an explicit failure");

const serverFailure = new ClerkAPIResponseError("provider unavailable", {
  data: [{ code: "internal_server_error", message: "unavailable" }],
  status: 500,
});
assert(classifyClerkInvitationError(serverFailure).uncertain === true, "Clerk 5xx must remain outcome-unknown");
assert(classifyClerkInvitationError(new Error("fetch failed")).uncertain === true, "network failure must remain outcome-unknown");

const actionSource = fs.readFileSync(path.join(root, "src/app/actions.ts"), "utf8");
const uncertainGuard = actionSource.indexOf("if (providerOutcomeUncertain)");
const providerSuccessBranch = actionSource.indexOf("if (result.ok)", uncertainGuard);
const failureFinalization = actionSource.indexOf('invitationStatus: "failed"', uncertainGuard);
assert(uncertainGuard >= 0 && providerSuccessBranch > uncertainGuard, "unknown provider outcomes must return through an explicit guard");
assert(failureFinalization > uncertainGuard, "explicit failures must remain handled after the unknown-outcome guard");

console.log("Clerk invitation reliability: PASS (injected success, explicit 4xx failure, 5xx/network uncertainty, no blind-finalize branch)");
