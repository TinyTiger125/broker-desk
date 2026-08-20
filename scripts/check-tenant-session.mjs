#!/usr/bin/env node
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const tsModuleCache = new Map();

function resolveProjectAlias(request) {
  if (!request.startsWith("@/lib/")) return null;
  const relative = request.slice("@/lib/".length);
  const candidates = /\.(?:ts|mjs|js|cjs)$/.test(relative)
    ? [path.resolve(`src/lib/${relative}`)]
    : [".ts", ".mjs", ".js", ".cjs"].map((extension) => path.resolve(`src/lib/${relative}${extension}`));
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function loadTsModule(sourcePath) {
  sourcePath = path.resolve(sourcePath);
  if (tsModuleCache.has(sourcePath)) return tsModuleCache.get(sourcePath);

  const source = fs.readFileSync(sourcePath, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = new Module(sourcePath);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(process.cwd());
  const originalRequire = mod.require.bind(mod);
  tsModuleCache.set(sourcePath, mod.exports);
  mod.require = (request) => {
    const aliasPath = resolveProjectAlias(request);
    return aliasPath ? loadTsModule(aliasPath) : originalRequire(request);
  };
  mod._compile(js, sourcePath);
  tsModuleCache.set(sourcePath, mod.exports);
  return mod.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const {
  roleHasTenantPermission,
  listTenantRolePermissions,
} = loadTsModule("src/lib/tenant-permissions.ts");
const { selectActiveTenantMembership, shouldUseSecureCookie } = loadTsModule("src/lib/tenant-session.ts");
const { requireTenantSession } = loadTsModule("src/lib/tenant-session.ts");
const {
  hasActivePlatformOwnerMembership,
  isDevelopmentPlatformOwnerTenantFallbackEnabled,
} = loadTsModule("src/lib/platform-owner.ts");
const {
  ensureUserForExternalAuth,
  getTenantById,
  listTenantMemberships,
  listTenantsForUser,
} = loadTsModule("src/lib/data.memory.ts");

assert(roleHasTenantPermission("tenant_owner", "member.invite"), "tenant owner should manage members");
assert(roleHasTenantPermission("tenant_admin", "template.edit_draft"), "tenant admin should edit tenant template drafts");
assert(roleHasTenantPermission("broker", "output.preview"), "broker should preview outputs");
assert(!roleHasTenantPermission("broker", "output.download_final"), "broker must not download final outputs by default");
assert(!roleHasTenantPermission("broker", "extract.override_result"), "broker must not override extraction results by default");
assert(!roleHasTenantPermission("broker", "template.publish"), "broker must not publish reusable templates by default");
assert(!roleHasTenantPermission("data_operator", "output.download_final"), "data operator must not download final outputs by default");
assert(!roleHasTenantPermission("viewer", "source.upload"), "viewer must not upload source files");
assert(listTenantRolePermissions("platform_owner").includes("template.manage_official"), "platform owner should manage official templates");
assert(
  hasActivePlatformOwnerMembership([{ role: "platform_owner", status: "active" }]),
  "an active database platform_owner membership should authorize platform access",
);
assert(
  !hasActivePlatformOwnerMembership([{ role: "platform_owner", status: "suspended" }]),
  "a suspended database platform_owner membership must not authorize platform access",
);

const memberships = await listTenantMemberships("user_demo");
assert(memberships.length >= 1, "demo user should have at least one tenant membership");
assert(memberships[0].role === "tenant_owner", "demo user should be the default tenant owner");

const selectedDefault = selectActiveTenantMembership({ memberships });
assert(selectedDefault?.tenantId === "tenant_cherry", "default active tenant should be Cherry tenant");

const selectedRequested = selectActiveTenantMembership({
  memberships,
  requestedTenantId: "tenant_cherry",
});
assert(selectedRequested?.tenantId === "tenant_cherry", "requested owned tenant should be selected");

assert(
  shouldUseSecureCookie(new Request("https://brokerdesk.example.test/workspace", { headers: { "x-forwarded-proto": "http" } })),
  "HTTPS request must remain Secure despite a conflicting forwarded HTTP header",
);
assert(
  shouldUseSecureCookie(new Request("http://brokerdesk.example.test/workspace", { headers: { "x-forwarded-proto": "https" } })),
  "HTTP request behind an HTTPS proxy should use Secure cookies",
);
assert(
  !shouldUseSecureCookie(new Request("http://brokerdesk.example.test/workspace", { headers: { "x-forwarded-proto": "http" } })),
  "HTTP request with forwarded HTTP must not use Secure cookies",
);
assert(shouldUseSecureCookie(new Request("https://brokerdesk.example.test/workspace")), "HTTPS without a proxy header must use Secure cookies");
assert(!shouldUseSecureCookie(new Request("http://brokerdesk.example.test/workspace")), "HTTP without a proxy header must not use Secure cookies");

const forbiddenRequested = selectActiveTenantMembership({
  memberships,
  requestedTenantId: "tenant_other",
});
assert(forbiddenRequested === null, "unowned requested tenant must not be selected");

const tenant = await getTenantById("tenant_cherry");
assert(tenant?.status === "active", "Cherry tenant should be active");

const tenants = await listTenantsForUser("user_ops");
assert(tenants.some((item) => item.id === "tenant_cherry"), "ops user should resolve Cherry tenant");

process.env.BROKER_DESK_AUTH_MODE = "demo";
process.env.BROKER_DESK_PLATFORM_OWNER_IDS = "clerk_platform_owner_regression";
const externalPlatformOwner = await ensureUserForExternalAuth({
  subject: "clerk_platform_owner_regression",
  email: "platform-owner-regression@brokerdesk.local",
  name: "Platform Owner Regression",
});
assert(externalPlatformOwner, "external platform owner should be materialized");
const externalOwnerMemberships = await listTenantMemberships(externalPlatformOwner.id);
assert(externalOwnerMemberships.length === 0, "external platform owner fixture should start without tenant membership");
const fallbackSession = await requireTenantSession({
  preferredUserId: externalPlatformOwner.id,
  permission: "output.preview",
});
assert(fallbackSession.tenant.id === "tenant_cherry", "local platform owner should fall back to the default tenant");
assert(fallbackSession.user.id === "user_demo", "local platform owner fallback should use seeded demo data user");
assert(fallbackSession.membership.role === "platform_owner", "local platform owner fallback should retain full platform role");

process.env.NODE_ENV = "production";
process.env.BROKER_DESK_ENABLE_DEMO_AUTH = "true";
process.env.BROKER_DESK_ENABLE_PLATFORM_OWNER_TENANT_FALLBACK = "true";
assert(
  !isDevelopmentPlatformOwnerTenantFallbackEnabled(),
  "production runtime must not enable local platform owner tenant fallback, even when the environment variable is set",
);
const tenantSessionSource = fs.readFileSync("src/lib/tenant-session.ts", "utf8");
assert(
  tenantSessionSource.includes("if (isProductionRuntime()) return null;"),
  "tenant session fallback must remain explicitly unavailable in production",
);

const appNavSource = fs.readFileSync("src/components/app-nav.tsx", "utf8");
assert(appNavSource.includes("getTenantSessionForNavigation"), "AppNav should resolve navigation identity only when required");
assert(
  appNavSource.includes("getTenantSessionForNavigation()") &&
    appNavSource.includes('capabilityHasTenantPermission(currentCapability, "member.invite")'),
  "AppNav must resolve current membership capability so Clerk users without member-management permission do not see the members link",
);
assert(
  appNavSource.includes("Protected pages") && appNavSource.includes("their own authorization"),
  "AppNav must leave actual tenant authorization to protected pages",
);

const dataSource = fs.readFileSync("src/lib/data.ts", "utf8");
assert(
  dataSource.includes("const resolveDefaultUser = cache"),
  "default user resolution must remain request-cached so shell and page do not duplicate authentication work",
);
assert(
  dataSource.includes("repo.getUserByExternalAuthSubject(subject)"),
  "returning Clerk users must be resolved locally before a profile lookup or provisioning write",
);

const clerkAuthSource = fs.readFileSync("src/lib/clerk-auth.ts", "utf8");
assert(
  clerkAuthSource.includes("export const getClerkAuthSubject = cache"),
  "Clerk session subject lookup must be request-cached",
);

console.log("[PASS] tenant session foundation regression");
