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
    "DATABASE_ADMIN_URL",
    "BROKER_DESK_DEPLOYMENT_ENV",
    "BROKER_DESK_PRODUCTION_DATA_RUNTIME_APPROVED",
    "ATTACHMENT_STORAGE_MODE",
    "BROKER_DESK_ATTACHMENT_SIGNED_URL_ENDPOINT",
    "DOCUMENT_READING_PROVIDER",
    "DOCUMENT_READING_ENDPOINT",
    "DOCUMENT_READING_API_TOKEN",
    "DOCUMENT_READING_ALLOWED_HOSTS",
    "BROKER_DESK_IMPORT_WORKER_ENABLED",
    "BROKER_DESK_IMPORT_WORKER_SCHEDULE",
    "BROKER_DESK_IMPORT_WORKER_TOKEN",
    "BROKER_DESK_EDGE_RATE_LIMIT_ENFORCED",
    "BROKER_DESK_EDGE_RATE_LIMIT_POLICY_ID",
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

withEnv({ NODE_ENV: "development" }, () => {
  assert(authMode.getAuthMode() === "disabled", "development auth mode must not silently fall back to demo access");
  assert(!authMode.isDemoAuthEnabled(), "development demo access must require an explicit auth mode");
});

withEnv(
  {
    NODE_ENV: "development",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_regression",
    CLERK_SECRET_KEY: "sk_test_regression",
  },
  () => {
    assert(authMode.getAuthMode() === "clerk", "configured Clerk keys must select the login path by default");
  },
);

withEnv({ NODE_ENV: "development", BROKER_DESK_AUTH_MODE: "demo" }, () => {
  assert(authMode.isDemoAuthEnabled(), "demo access must remain available only when explicitly requested locally");
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
    ATTACHMENT_STORAGE_MODE: "postgres_private",
  },
  () => {
    readiness.assertProductionAttachmentStorageReady();
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

withEnv({ NODE_ENV: "production" }, () => {
  assertThrowsCode(
    readiness.assertProductionRateLimitReady,
    "production_rate_limit_required",
    "production runtime must reject a missing shared edge rate-limit policy",
  );
});

withEnv(
  {
    NODE_ENV: "production",
    BROKER_DESK_EDGE_RATE_LIMIT_ENFORCED: "true",
    BROKER_DESK_EDGE_RATE_LIMIT_POLICY_ID: "policy_public_beta_v1",
  },
  () => {
    readiness.assertProductionRateLimitReady();
  },
);

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
  assertThrowsCode(
    readiness.assertProductionImportWorkerReady,
    "production_import_worker_required",
    "production runtime must reject a missing import worker",
  );
});

withEnv(
  {
    NODE_ENV: "production",
    DOCUMENT_READING_PROVIDER: "remote",
    DOCUMENT_READING_ENDPOINT: "https://reader.example.test/extract",
    DOCUMENT_READING_API_TOKEN: "reader-token",
  },
  () => {
    assertThrowsCode(
      readiness.assertProductionDocumentReaderReady,
      "production_document_reader_endpoint_not_allowed",
      "production reader must require an explicit hostname allowlist",
    );
  },
);

withEnv(
  {
    NODE_ENV: "production",
    DOCUMENT_READING_PROVIDER: "remote",
    DOCUMENT_READING_ENDPOINT: "http://reader.example.test/extract",
    DOCUMENT_READING_API_TOKEN: "reader-token",
    DOCUMENT_READING_ALLOWED_HOSTS: "reader.example.test",
  },
  () => {
    assertThrowsCode(
      readiness.assertProductionDocumentReaderReady,
      "production_document_reader_endpoint_invalid",
      "production reader must require HTTPS",
    );
  },
);

withEnv(
  {
    NODE_ENV: "production",
    DOCUMENT_READING_PROVIDER: "remote",
    DOCUMENT_READING_ENDPOINT: "https://reader.example.test/extract",
    DOCUMENT_READING_API_TOKEN: "reader-token",
    DOCUMENT_READING_ALLOWED_HOSTS: "reader.example.test",
    BROKER_DESK_IMPORT_WORKER_ENABLED: "true",
    BROKER_DESK_IMPORT_WORKER_SCHEDULE: "every 1 minute",
    BROKER_DESK_IMPORT_WORKER_TOKEN: "a-32-character-import-worker-token",
  },
  () => {
    readiness.assertProductionDocumentReaderReady();
    readiness.assertProductionImportWorkerReady();
  },
);

withEnv(
  {
    NODE_ENV: "production",
    BROKER_DESK_DEPLOYMENT_ENV: "production",
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
    BROKER_DESK_DEPLOYMENT_ENV: "production",
    DATA_DRIVER: "postgres",
    DATABASE_URL: "postgresql://runtime:password@localhost:5432/broker_desk",
    BROKER_DESK_PRODUCTION_DATA_RUNTIME_APPROVED: "true",
  },
  () => {
    readiness.assertProductionDataStoreReady();
  },
);

for (const deploymentEnvironment of ["preview", "staging"]) {
  withEnv(
    {
      NODE_ENV: "production",
      BROKER_DESK_DEPLOYMENT_ENV: deploymentEnvironment,
      DATA_DRIVER: "postgres",
      DATABASE_URL: "postgresql://runtime:password@localhost:5432/broker_desk",
    },
    () => {
      readiness.assertProductionDataStoreReady();
      assert(
        !readiness.isFormalProductionDeployment(),
        `${deploymentEnvironment} must not require the formal production release approval flag`,
      );
    },
  );
}

withEnv(
  {
    NODE_ENV: "production",
    BROKER_DESK_DEPLOYMENT_ENV: "preview",
  },
  () => {
    assertThrowsCode(
      readiness.assertProductionDataStoreReady,
      "production_database_required",
      "preview must retain the production-runtime Postgres requirement",
    );
  },
);

withEnv(
  {
    NODE_ENV: "production",
    BROKER_DESK_DEPLOYMENT_ENV: "unknown",
    DATA_DRIVER: "postgres",
    DATABASE_URL: "postgresql://runtime:password@localhost:5432/broker_desk",
  },
  () => {
    assertThrowsCode(
      readiness.assertProductionDataStoreReady,
      "production_release_not_approved",
      "unknown deployment classifications must fail closed as formal production",
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
assert(fs.existsSync("db/migrations/20260809_001_external_auth_lifecycle_functions.sql"), "external-auth lifecycle function migration must exist");
assert(fs.existsSync("db/migrations/20260809_002_force_tenant_template_installs_rls.sql"), "template-install forced RLS migration must exist");
assert(fs.existsSync("db/migrations/20260809_003_private_attachment_blobs.sql"), "private attachment blob migration must exist");
assert(fs.existsSync("db/migrations/20260809_004_import_job_execution_state.sql"), "import job execution migration must exist");
assert(fs.existsSync("db/migrations/20260809_005_import_worker_claim.sql"), "import worker claim migration must exist");

const postgresDataSource = fs.readFileSync("src/lib/data.postgres.ts", "utf8");
assert(
  postgresDataSource.includes('"20260729_002_force_tenant_rls.sql"'),
  "production migration ledger must require the forced tenant RLS migration",
);
assert(
  postgresDataSource.includes("set_config('app.external_auth_subject'") && postgresDataSource.includes("RESET app.external_auth_subject"),
  "Postgres repository must bind and clear the Clerk subject on the same pooled connection as each business query",
);
assert(
  postgresDataSource.includes("rolbypassrls"),
  "Postgres repository must reject a production role that can bypass RLS",
);
assert(
  postgresDataSource.includes('"20260809_002_force_tenant_template_installs_rls.sql"'),
  "production migration ledger must require tenant-template-install forced RLS",
);
assert(
  postgresDataSource.includes('"20260809_003_private_attachment_blobs.sql"'),
  "production migration ledger must require private attachment blob storage",
);
assert(
  postgresDataSource.includes('"20260809_004_import_job_execution_state.sql"') && postgresDataSource.includes('"20260809_005_import_worker_claim.sql"'),
  "production migration ledger must require import execution and worker claim migrations",
);

const signUpSource = fs.readFileSync("src/app/sign-up/[[...sign-up]]/page.tsx", "utf8");
assert(!signUpSource.includes("@clerk/nextjs") && !signUpSource.includes("<SignUp"), "app-level public Clerk sign-up route must remain closed");

const proxySource = fs.readFileSync("src/proxy.ts", "utf8");
assert(proxySource.includes("clerkMiddleware"), "Next proxy must wire Clerk middleware");
assert(proxySource.includes("isClerkAuthEnabled()"), "Clerk proxy must be gated by auth mode");
assert(proxySource.includes("/api/webhooks/clerk(.*)"), "Clerk webhook route must stay public");
assert(proxySource.includes("assertProductionAuthReady"), "production proxy must block an unconfigured production auth boundary");
const publicRouteMatcherSource = proxySource.match(/const isPublicRoute = createRouteMatcher\(\[([\s\S]*?)\]\);/);
assert(publicRouteMatcherSource && !publicRouteMatcherSource[1].includes("/api/qa(.*)"), "QA route must not remain public in production");
assert(proxySource.includes("invalid_request_origin"), "unsafe browser API writes must have a same-origin guard");
assert(proxySource.includes("req.headers.get(\"origin\") === req.nextUrl.origin"), "same-origin guard must compare the canonical request origin");

const nextConfigSource = fs.readFileSync("next.config.ts", "utf8");
for (const header of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security"]) {
  assert(nextConfigSource.includes(header), `security header ${header} must be configured`);
}

const dataSource = fs.readFileSync("src/lib/data.ts", "utf8");
assert(dataSource.includes("ensureUserForExternalAuth"), "data layer must map external auth subjects to local users");
assert(dataSource.includes("suspendUserForExternalAuthSubject"), "data layer must suspend deleted external identities");
assert(dataSource.includes("getClerkAuthIdentity"), "data layer must read Clerk identity in clerk mode");
assert(dataSource.includes("assertProductionDataStoreReady"), "data layer must reject production memory fallback");
assert(dataSource.includes("withPostgresAuthContext"), "data layer must bind Clerk identity before calling the Postgres repository");

const platformSessionSource = fs.readFileSync("src/lib/platform-session.ts", "utf8");
assert(platformSessionSource.includes("isConfiguredPlatformOwnerUser"), "platform owner access must use centralized owner-id checks");
assert(platformSessionSource.includes("hasActivePlatformOwnerMembership"), "platform owner access must accept only active database platform-owner memberships");

const platformOwnerSource = fs.readFileSync("src/lib/platform-owner.ts", "utf8");
assert(platformOwnerSource.includes("externalAuthSubject"), "platform owner access must support external auth subjects such as Clerk user ids");
assert(platformOwnerSource.includes('membership.role === "platform_owner" && membership.status === "active"'), "database platform-owner access must require an active membership");
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
assert(clerkWebhookSource.includes("@/lib/data.admin.postgres"), "Clerk webhook route must use the isolated lifecycle data module");
assert(clerkWebhookSource.includes("syncExternalAuthUser"), "Clerk webhook route must sync external users through the isolated lifecycle data module");
assert(clerkWebhookSource.includes("suspendExternalAuthUser"), "Clerk webhook route must handle deleted users through the isolated lifecycle data module");

const adminDataSource = fs.readFileSync("src/lib/data.admin.postgres.ts", "utf8");
assert(adminDataSource.includes('import "server-only"'), "admin lifecycle module must be server-only");
assert(adminDataSource.includes("DATABASE_ADMIN_URL"), "admin lifecycle module must require its own production connection");
assert(adminDataSource.includes("sync_external_auth_user") && adminDataSource.includes("suspend_external_auth_user"), "admin lifecycle module must call only the approved lifecycle functions");
assert(!/\b(?:INSERT|UPDATE|DELETE)\s+INTO\s+(?:public\.)?(?:users|tenant_memberships)/i.test(adminDataSource), "admin lifecycle module must not write identity tables directly");

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

const templateInstallRlsMigrationSql = fs.readFileSync("db/migrations/20260805_004_tenant_guarantee_template_installs.sql", "utf8");
const templateInstallForceRlsMigrationSql = fs.readFileSync("db/migrations/20260809_002_force_tenant_template_installs_rls.sql", "utf8");
assert(templateInstallRlsMigrationSql.includes("ENABLE ROW LEVEL SECURITY"), "template-install migration must enable RLS");
assert(templateInstallForceRlsMigrationSql.includes("FORCE ROW LEVEL SECURITY"), "template-install migration must force RLS");

for (const globalTable of ["public.users", "public.tenants", "public.tenant_memberships"]) {
  assert(rlsSql.includes(`ALTER TABLE ${globalTable} ENABLE ROW LEVEL SECURITY`), `RLS baseline missing ${globalTable}`);
  assert(!forcedRlsMigrationSql.includes(`ALTER TABLE ${globalTable} FORCE ROW LEVEL SECURITY`), `${globalTable} must not force RLS while authorization helpers resolve membership through SECURITY DEFINER`);
}

const healthRouteSource = fs.readFileSync("src/app/api/health/data/route.ts", "utf8");
assert(!healthRouteSource.includes("error.message"), "health route must not expose internal errors");
assert(!healthRouteSource.includes("driver:"), "health route must not expose the selected data driver");
assert(publicRouteMatcherSource?.[1]?.includes("/api/health/data(.*)"), "data health must remain publicly probeable without Clerk identity");
const healthCheckPostgresSource = postgresDataSource.slice(postgresDataSource.indexOf("export async function healthCheckPostgres"));
assert(healthCheckPostgresSource.includes("await ensureSchema();"), "data health must retain migration and runtime-role readiness checks");
assert(healthCheckPostgresSource.includes('await getRawPool().query("SELECT 1")'), "data health liveness must use the unscoped raw pool");
assert(!healthCheckPostgresSource.includes('await getPool().query("SELECT 1")'), "data health must not require a Clerk business-query scope");

const attachmentSource = fs.readFileSync("src/lib/attachment-storage.ts", "utf8");
assert(attachmentSource.includes("local-private://"), "development attachments must use a private server URI");
assert(attachmentSource.includes("postgres-private://"), "public-beta attachments must support a private database URI");
assert(attachmentSource.includes("10 * 1024 * 1024"), "private database attachments must enforce a 10 MB limit");
assert(!attachmentSource.includes("public/uploads"), "development attachments must not use public upload storage");
assert(attachmentSource.includes("url.protocol !== \"local-private:\""), "private attachment paths must validate their protocol");
assert(attachmentSource.includes("attachment storage requires a valid tenant scope"), "private attachment writes must validate their tenant scope");

const productionReadinessSource = fs.readFileSync("src/lib/production-readiness.ts", "utf8");
assert(
  productionReadinessSource.includes('"production_attachment_adapter_required"'),
  "production readiness must reject object storage until its private adapter exists",
);
assert(
  productionReadinessSource.includes("assertProductionTenantScopeBindingReady"),
  "production readiness must remain closed until request-scoped tenant identity binding exists",
);
assert(
  productionReadinessSource.includes("DOCUMENT_READING_ALLOWED_HOSTS") && productionReadinessSource.includes("production_document_reader_endpoint_not_allowed"),
  "production document reading must restrict remote endpoints to an explicit allowlist",
);
assert(
  productionReadinessSource.includes("assertProductionImportWorkerReady") && productionReadinessSource.includes("BROKER_DESK_IMPORT_WORKER_TOKEN"),
  "production imports must require an authenticated worker configuration",
);

const actionsSource = fs.readFileSync("src/app/actions.ts", "utf8");
assert(actionsSource.includes("isProductionRuntime()"), "attachment registration must detect the production runtime");
assert(actionsSource.includes("外部公開URLを資料の保存先として利用できません"), "production attachments must reject public external URLs");
assert(actionsSource.includes("addPrivateAttachment"), "private database attachments must be registered through the tenant repository");

assert(
  postgresDataSource.includes("createHash(\"sha256\")") && postgresDataSource.includes("private_attachment_blobs"),
  "private database attachments must retain a content integrity hash",
);

const attachmentRouteSource = fs.readFileSync("src/app/api/attachments/[attachmentId]/route.ts", "utf8");
assert(attachmentRouteSource.includes("requireTenantSession"), "attachment downloads must require a tenant session");
assert(attachmentRouteSource.includes("session.tenant.id"), "attachment downloads must enforce the attachment tenant");
assert(attachmentRouteSource.includes("readLocalPrivateAttachment"), "attachment downloads must resolve only private server storage");

const identityReaderSource = fs.readFileSync("src/lib/identity-document-extractor.ts", "utf8");
assert(identityReaderSource.includes("assertProductionDocumentReaderReady"), "identity reading must block the local reader in production");

const identityRouteSource = fs.readFileSync("src/app/api/input-files/identity/route.ts", "utf8");
assert(
  identityRouteSource.includes("ProductionReadinessError") && identityRouteSource.includes("status: 503"),
  "identity API must fail closed without exposing reader internals when production reading is unavailable",
);

const importDrainRouteSource = fs.readFileSync("src/app/api/internal/import-jobs/drain/route.ts", "utf8");
assert(importDrainRouteSource.includes("timingSafeEqual"), "import worker route must compare its bearer token safely");
assert(importDrainRouteSource.includes("claimQueuedImportJobs"), "import worker route must claim queued work atomically");
assert(importDrainRouteSource.includes("withWorkerRepositoryIdentity"), "import worker route must retain tenant identity while processing jobs");

const importProcessorSource = fs.readFileSync("src/components/excel-import-queue-processor.tsx", "utf8");
assert(importProcessorSource.includes("retryKey"), "import status polling must reset deterministically after a retry");
assert(importProcessorSource.includes("/process"), "import UI must support explicit server-side retry processing");

console.log("[PASS] production security, storage, reader, migration and RLS baseline regression");
