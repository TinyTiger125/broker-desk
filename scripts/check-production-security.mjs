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
    "DATA_DRIVER",
    "DATABASE_URL",
    "BROKER_DESK_PRODUCTION_DATA_RUNTIME_APPROVED",
    "ATTACHMENT_STORAGE_MODE",
    "BROKER_DESK_ATTACHMENT_SIGNED_URL_ENDPOINT",
    "DOCUMENT_READING_PROVIDER",
    "DOCUMENT_READING_ENDPOINT",
    "DOCUMENT_READING_API_TOKEN",
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

function assertThrowsCode(fn, code, message) {
  try {
    fn();
  } catch (error) {
    assert(error?.code === code, `${message}: expected ${code}, received ${error?.code ?? error}`);
    return;
  }
  throw new Error(`${message}: expected ${code} to be thrown`);
}

const authMode = loadTsModule("src/lib/auth-mode.ts");
const readiness = loadTsModule("src/lib/production-readiness.ts");
const platformOwner = loadTsModule("src/lib/platform-owner.ts");

withEnv({ NODE_ENV: "production" }, () => {
  assert(authMode.getAuthMode() === "disabled", "production auth mode must fail closed when not configured");
  assert(!authMode.isDemoAuthEnabled(), "production demo auth must be disabled by default");
});

withEnv(
  {
    NODE_ENV: "production",
    BROKER_DESK_ENABLE_PLATFORM_OWNER_TENANT_FALLBACK: "true",
  },
  () => {
    assert(
      !platformOwner.isDevelopmentPlatformOwnerTenantFallbackEnabled(),
      "production runtime must force local platform-owner tenant fallback off",
    );
  },
);

withEnv(
  {
    NODE_ENV: "production",
    ATTACHMENT_STORAGE_MODE: "object_private",
    BROKER_DESK_ATTACHMENT_SIGNED_URL_ENDPOINT: "https://storage.example.test/sign",
  },
  () => {
    assertThrowsCode(
      readiness.assertProductionAttachmentStorageReady,
      "production_attachment_adapter_required",
      "production runtime must reject object storage until its private adapter is implemented",
    );
  },
);

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
  assert(result.ok === false && result.error === "trusted_header_auth_disabled", "trusted header auth must be disabled in production");
});

withEnv(
  {
    NODE_ENV: "development",
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

withEnv({ NODE_ENV: "production" }, () => {
  assertThrowsCode(
    readiness.assertProductionDataStoreReady,
    "production_database_required",
    "production runtime must reject a missing Postgres data store",
  );
  assertThrowsCode(
    readiness.assertProductionAttachmentStorageReady,
    "production_attachment_storage_required",
    "production runtime must reject unconfigured private attachment storage",
  );
  assertThrowsCode(
    readiness.assertProductionDocumentReaderReady,
    "production_document_reader_required",
    "production runtime must reject the local document reader",
  );
});

withEnv(
  {
    NODE_ENV: "production",
    DATA_DRIVER: "postgres",
    DATABASE_URL: "postgresql://runtime:password@localhost:5432/broker_desk",
  },
  () => {
    assertThrowsCode(
      readiness.assertProductionDataStoreReady,
      "production_release_not_approved",
      "production runtime must require explicit release approval after operational checks",
    );
  },
);

withEnv(
  {
    NODE_ENV: "production",
    DATA_DRIVER: "postgres",
    DATABASE_URL: "postgresql://runtime:password@localhost:5432/broker_desk",
    BROKER_DESK_PRODUCTION_DATA_RUNTIME_APPROVED: "true",
  },
  () => {
    assertThrowsCode(
      readiness.assertProductionDataStoreReady,
      "production_tenant_scope_required",
      "production runtime must reject data access until Clerk identity is bound in every database transaction",
    );
  },
);

const schemaSql = fs.readFileSync("docs/engineering/postgres_schema.sql", "utf8");
assert(schemaSql.includes("external_auth_subject TEXT UNIQUE"), "schema must include external auth subject");
assert(schemaSql.includes("idx_users_external_auth_subject"), "schema must index external auth subject");
assert(schemaSql.includes("account_type TEXT NOT NULL DEFAULT 'company'"), "schema must include tenant account type");
assert(schemaSql.includes("purchased_seat_count INTEGER NOT NULL DEFAULT 1"), "schema must include tenant purchased seat count");
assert(schemaSql.includes("invitation_status TEXT NOT NULL DEFAULT 'not_sent'"), "schema must include tenant invitation status");
assert(schemaSql.includes("provider_invitation_id TEXT"), "schema must include provider invitation id");
assert(schemaSql.includes("CREATE TABLE IF NOT EXISTS case_workbench_field_rules"), "schema must include tenant case workbench field rules");

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
assert(packageJson.dependencies?.["@clerk/nextjs"], "package must include @clerk/nextjs");
assert(packageJson.scripts?.["db:migrate"] === "node scripts/run-postgres-migrations.mjs", "package must provide the checked migration runner");
assert(fs.existsSync("db/migrations/20260727_000_baseline_schema.sql"), "baseline schema migration must exist");
assert(fs.existsSync("db/migrations/20260727_001_tenant_rls.sql"), "tenant RLS migration must exist");
assert(fs.existsSync("db/migrations/20260729_002_force_tenant_rls.sql"), "forced tenant RLS migration must exist");

const postgresDataSource = fs.readFileSync("src/lib/data.postgres.ts", "utf8");
assert(
  postgresDataSource.includes('"20260729_002_force_tenant_rls.sql"'),
  "production migration ledger must require the forced tenant RLS migration",
);

const signUpSource = fs.readFileSync("src/app/sign-up/[[...sign-up]]/page.tsx", "utf8");
assert(!signUpSource.includes("@clerk/nextjs") && !signUpSource.includes("<SignUp"), "app-level public Clerk sign-up route must remain closed");

const proxySource = fs.readFileSync("src/proxy.ts", "utf8");
assert(proxySource.includes("clerkMiddleware"), "Next proxy must wire Clerk middleware");
assert(proxySource.includes("isClerkAuthEnabled()"), "Clerk proxy must be gated by auth mode");
assert(proxySource.includes("/api/webhooks/clerk(.*)"), "Clerk webhook route must stay public");
assert(proxySource.includes("assertProductionAuthReady"), "production proxy must block an unconfigured production auth boundary");
assert(!proxySource.includes("/api/qa(.*)"), "QA route must not remain public in production");

const dataSource = fs.readFileSync("src/lib/data.ts", "utf8");
assert(dataSource.includes("ensureUserForExternalAuth"), "data layer must map external auth subjects to local users");
assert(dataSource.includes("suspendUserForExternalAuthSubject"), "data layer must suspend deleted external identities");
assert(dataSource.includes("getClerkAuthIdentity"), "data layer must read Clerk identity in clerk mode");
assert(dataSource.includes("assertProductionDataStoreReady"), "data layer must reject production memory fallback");

const platformSessionSource = fs.readFileSync("src/lib/platform-session.ts", "utf8");
assert(platformSessionSource.includes("isConfiguredPlatformOwnerUser"), "platform owner access must use centralized owner-id checks");

const platformOwnerSource = fs.readFileSync("src/lib/platform-owner.ts", "utf8");
assert(platformOwnerSource.includes("externalAuthSubject"), "platform owner access must support external auth subjects such as Clerk user ids");
assert(platformOwnerSource.includes('configured === "true"'), "platform owner tenant fallback must support explicit local next-start opt-in");
assert(platformOwnerSource.includes('configured === "false"'), "platform owner tenant fallback must support explicit local opt-out");
assert(platformOwnerSource.includes("if (isProductionRuntime()) return false;"), "platform owner tenant fallback must be force-disabled in production");
assert(platformOwnerSource.includes("BROKER_DESK_ENABLE_PLATFORM_OWNER_TENANT_FALLBACK"), "platform owner tenant fallback must have an explicit disable switch");

const tenantSessionSource = fs.readFileSync("src/lib/tenant-session.ts", "utf8");
assert(tenantSessionSource.includes("isDevelopmentPlatformOwnerTenantFallbackEnabled"), "tenant sessions should avoid local platform-owner navigation crashes");
assert(tenantSessionSource.includes('role: "platform_owner"'), "local platform-owner tenant fallback should retain full local permissions");

const clerkInvitationSource = fs.readFileSync("src/lib/clerk-invitations.ts", "utf8");
assert(clerkInvitationSource.includes("client.invitations.createInvitation"), "Clerk invitation helper must use Clerk Invitations API");
assert(clerkInvitationSource.includes("brokerDeskMembershipId"), "Clerk invitation helper must include local membership metadata");

const clerkWebhookSource = fs.readFileSync("src/app/api/webhooks/clerk/route.ts", "utf8");
assert(clerkWebhookSource.includes("verifyWebhook"), "Clerk webhook route must verify signatures");
assert(clerkWebhookSource.includes("ensureUserForExternalAuth"), "Clerk webhook route must sync external users");
assert(clerkWebhookSource.includes("suspendUserForExternalAuthSubject"), "Clerk webhook route must handle deleted users");

const rlsSql = fs.readFileSync("docs/engineering/postgres_rls.sql", "utf8");
assert(rlsSql.includes("brokerdesk_private"), "RLS helpers must live outside the exposed public schema");
assert(!/GRANT\s+[^;]*\s+TO\s+anon\b/i.test(rlsSql), "RLS baseline must not grant Broker Desk business tables to anon");
assert(rlsSql.includes("tenants.status IN ('trial', 'active')"), "RLS baseline must allow only accessible tenant lifecycle states");
assert(rlsSql.includes("FORCE ROW LEVEL SECURITY"), "RLS baseline must force policies for table owners");

const forcedRlsMigrationSql = fs.readFileSync("db/migrations/20260729_002_force_tenant_rls.sql", "utf8");
assert(forcedRlsMigrationSql.includes("FORCE ROW LEVEL SECURITY"), "RLS migration must force policies for table owners");

const rlsStagingVerificationSql = fs.readFileSync("docs/engineering/postgres_rls_staging_verification.sql", "utf8");
assert(
  rlsStagingVerificationSql.includes("set_config('app.external_auth_subject'"),
  "RLS staging verification must bind the Clerk subject inside a transaction",
);
assert(
  rlsStagingVerificationSql.includes("tenant_b_case_visible_to_subject_a_expected_zero"),
  "RLS staging verification must assert cross-tenant case invisibility",
);
assert(
  rlsStagingVerificationSql.includes("tenant_b_attachment_visible_to_subject_a_expected_zero"),
  "RLS staging verification must assert cross-tenant attachment invisibility",
);

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
  "case_workbench_field_rules",
];

for (const table of tenantScopedTables) {
  assert(rlsSql.includes(`'${table}'`), `RLS baseline missing tenant table ${table}`);
}

for (const globalTable of ["public.users", "public.tenants", "public.tenant_memberships"]) {
  assert(rlsSql.includes(`ALTER TABLE ${globalTable} ENABLE ROW LEVEL SECURITY`), `RLS baseline missing ${globalTable}`);
  assert(!forcedRlsMigrationSql.includes(`ALTER TABLE ${globalTable} FORCE ROW LEVEL SECURITY`), `${globalTable} must not force RLS while authorization helpers resolve membership through SECURITY DEFINER`);
}

const healthRouteSource = fs.readFileSync("src/app/api/health/data/route.ts", "utf8");
assert(!healthRouteSource.includes("error.message"), "health route must not expose internal errors");
assert(!healthRouteSource.includes("driver:"), "health route must not expose the selected data driver");

const attachmentSource = fs.readFileSync("src/lib/attachment-storage.ts", "utf8");
assert(attachmentSource.includes("local-private://"), "development attachments must use a private server URI");
assert(!attachmentSource.includes("public/uploads"), "development attachments must not use public upload storage");
assert(attachmentSource.includes("url.protocol !== \"local-private:\""), "private attachment paths must validate their protocol");
assert(attachmentSource.includes("attachment storage requires a valid tenant scope"), "private attachment writes must validate their tenant scope");

const productionReadinessSource = fs.readFileSync("src/lib/production-readiness.ts", "utf8");
assert(
  productionReadinessSource.includes('"production_attachment_adapter_required"'),
  "production readiness must remain closed until a private object-storage adapter exists",
);
assert(
  productionReadinessSource.includes("assertProductionTenantScopeBindingReady"),
  "production readiness must remain closed until request-scoped tenant identity binding exists",
);

const actionsSource = fs.readFileSync("src/app/actions.ts", "utf8");
assert(actionsSource.includes("isProductionRuntime()"), "attachment registration must detect the production runtime");
assert(actionsSource.includes("外部公開URLを資料の保存先として利用できません"), "production attachments must reject public external URLs");

const attachmentRouteSource = fs.readFileSync("src/app/api/attachments/[attachmentId]/route.ts", "utf8");
assert(attachmentRouteSource.includes("requireTenantSession"), "attachment downloads must require a tenant session");
assert(attachmentRouteSource.includes("session.tenant.id"), "attachment downloads must enforce the attachment tenant");
assert(attachmentRouteSource.includes("readLocalPrivateAttachment"), "attachment downloads must resolve only private server storage");

const identityReaderSource = fs.readFileSync("src/lib/identity-document-extractor.ts", "utf8");
assert(identityReaderSource.includes("assertProductionDocumentReaderReady"), "identity reading must block the local reader in production");

const identityRouteSource = fs.readFileSync("src/app/api/input-files/identity/route.ts", "utf8");
assert(identityRouteSource.includes("service_unavailable"), "identity API must fail generically when production reading is unavailable");

console.log("[PASS] production security, storage, reader, migration and RLS baseline regression");
