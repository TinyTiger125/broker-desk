#!/usr/bin/env node
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const tsModuleCache = new Map();

function resolveProjectAlias(request) {
  if (!request.startsWith("@/lib/")) return null;
  return path.resolve(`src/lib/${request.slice("@/lib/".length)}.ts`);
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

function withEnv(nextEnv, fn) {
  const keys = [
    "NODE_ENV",
    "BROKER_DESK_AUTH_MODE",
    "BROKER_DESK_ENABLE_DEMO_AUTH",
    "BROKER_DESK_AUTH_TRUSTED_HEADER_SECRET",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, nextEnv);
  try {
    return fn();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

const authMode = loadTsModule("src/lib/auth-mode.ts");

withEnv({ NODE_ENV: "production" }, () => {
  assert(authMode.getAuthMode() === "disabled", "production auth mode must fail closed when not configured");
  assert(!authMode.isDemoAuthEnabled(), "production demo auth must be disabled by default");
});

withEnv({ NODE_ENV: "production", BROKER_DESK_AUTH_MODE: "clerk" }, () => {
  assert(authMode.getAuthMode() === "clerk", "clerk must be an explicit production auth mode");
  assert(!authMode.isClerkAuthConfigured(), "clerk auth must require Clerk keys");
});

withEnv(
  {
    NODE_ENV: "production",
    BROKER_DESK_AUTH_MODE: "clerk",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_regression",
    CLERK_SECRET_KEY: "sk_test_regression",
  },
  () => {
    assert(authMode.isClerkAuthConfigured(), "clerk auth should be configured only when both keys are present");
  },
);

withEnv({ NODE_ENV: "production", BROKER_DESK_AUTH_MODE: "trusted_header" }, () => {
  const result = authMode.readTrustedHeaderAuthIdentity(new Headers());
  assert(result.ok === false && result.error === "trusted_header_secret_not_configured", "trusted header auth must require a shared ingress secret");
});

withEnv(
  {
    NODE_ENV: "production",
    BROKER_DESK_AUTH_MODE: "trusted_header",
    BROKER_DESK_AUTH_TRUSTED_HEADER_SECRET: "regression-secret",
  },
  () => {
    const missingSecret = authMode.readTrustedHeaderAuthIdentity(
      new Headers([["x-brokerdesk-auth-subject", "demo:user_demo"]]),
    );
    assert(missingSecret.ok === false && missingSecret.error === "trusted_header_secret_invalid", "trusted header auth must reject unsigned headers");

    const accepted = authMode.readTrustedHeaderAuthIdentity(
      new Headers([
        ["x-brokerdesk-auth-secret", "regression-secret"],
        ["x-brokerdesk-auth-subject", "demo:user_demo"],
        ["x-brokerdesk-auth-email", "lijieming@cherry-investment.co.jp"],
      ]),
    );
    assert(accepted.ok === true, "trusted header auth should accept a signed subject");
    assert(accepted.identity.subject === "demo:user_demo", "trusted header auth should preserve immutable subject");
  },
);

const schemaSql = fs.readFileSync("docs/engineering/postgres_schema.sql", "utf8");
assert(schemaSql.includes("external_auth_subject TEXT UNIQUE"), "schema must include external auth subject");
assert(schemaSql.includes("idx_users_external_auth_subject"), "schema must index external auth subject");

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
assert(packageJson.dependencies?.["@clerk/nextjs"], "package must include @clerk/nextjs");

const proxySource = fs.readFileSync("src/proxy.ts", "utf8");
assert(proxySource.includes("clerkMiddleware"), "Next proxy must wire Clerk middleware");
assert(proxySource.includes("isClerkAuthEnabled()"), "Clerk proxy must be gated by auth mode");
assert(proxySource.includes("/api/webhooks/clerk(.*)"), "Clerk webhook route must stay public");

const dataSource = fs.readFileSync("src/lib/data.ts", "utf8");
assert(dataSource.includes("ensureUserForExternalAuth"), "data layer must map external auth subjects to local users");
assert(dataSource.includes("getClerkAuthIdentity"), "data layer must read Clerk identity in clerk mode");

const rlsSql = fs.readFileSync("docs/engineering/postgres_rls.sql", "utf8");
assert(rlsSql.includes("brokerdesk_private"), "RLS helpers must live outside the exposed public schema");
assert(!/GRANT\s+[^;]*\s+TO\s+anon\b/i.test(rlsSql), "RLS baseline must not grant Broker Desk business tables to anon");

const tenantScopedTables = [
  "clients",
  "properties",
  "quotations",
  "follow_ups",
  "tasks",
  "audit_logs",
  "output_template_settings",
  "output_template_versions",
  "generated_outputs",
  "import_jobs",
  "attachments",
  "brokerage_cases",
  "extraction_review_items",
  "guarantee_application_drafts",
  "correction_events",
  "ai_experience_drafts",
];

for (const table of tenantScopedTables) {
  assert(rlsSql.includes(`'${table}'`), `RLS baseline missing tenant table ${table}`);
}

for (const globalTable of ["public.users", "public.tenants", "public.tenant_memberships"]) {
  assert(rlsSql.includes(`ALTER TABLE ${globalTable} ENABLE ROW LEVEL SECURITY`), `RLS baseline missing ${globalTable}`);
}

console.log("[PASS] production auth and RLS baseline regression");
