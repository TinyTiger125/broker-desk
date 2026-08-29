import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const INTERNAL_TENANT_ID = "tenant_broker_desk_internal";
const INTERNAL_TENANT_NAME = "Broker Desk 内部工作区";
const INTERNAL_TENANT_SLUG = "broker-desk-internal";
const FIXED_MEMBERSHIP_ID = "membership_broker_desk_platform_owner";
const FIXED_AUDIT_ID = "audit_initial_platform_owner";
const BOOTSTRAP_AUDIT_MESSAGE = "Initial platform owner bootstrap completed";
const BOOTSTRAP_AUDIT_CONTEXT = Object.freeze({
  source: "scripts/bootstrap-initial-platform-owner.mjs",
  mode: "controlled-nonproduction",
});
const FIXED_STAGING_TARGET_FINGERPRINT = "aaf14cc84744d48e626ff90cea8e67be03707f73a55b6368e545a0b094ab545a";

export function assertNoPgEnvironment(environment = process.env) {
  if (Object.entries(environment).some(([key, value]) => key.startsWith("PG") && typeof value === "string" && value.trim() !== "")) {
    throw new Error("PostgreSQL environment overrides are forbidden for controlled bootstrap");
  }
}

function assertControlledOptions({ email, useLatestClerkUser, deploymentEnvironment, vercelEnvironment }) {
  if (deploymentEnvironment !== "staging" || vercelEnvironment !== "preview") {
    throw new Error("Controlled platform-owner bootstrap requires the fixed Staging Preview environment");
  }
  if ((!email || !email.includes("@")) && !useLatestClerkUser) {
    throw new Error("Use --email with an existing Clerk user's email address, or --latest-clerk-user for a controlled initial bootstrap");
  }
  if (email && useLatestClerkUser) throw new Error("Use either --email or --latest-clerk-user, not both");
}

function targetFingerprint(config) {
  return createHash("sha256")
    .update(`${config.protocol}\n${config.host}\n${config.database}\n${config.port}`)
    .digest("hex");
}

export function buildPoolConfig(connectionString) {
  if (typeof connectionString !== "string" || connectionString.trim() !== connectionString || !/^(postgres|postgresql):\/\//.test(connectionString)) {
    throw new Error("invalid migration database connection target");
  }
  let target;
  try {
    target = new URL(connectionString);
  } catch {
    throw new Error("invalid migration database connection target");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(target.protocol)) {
    throw new Error("invalid migration database connection target");
  }
  const options = new Map();
  const rawQuery = target.search.slice(1);
  if (rawQuery) {
    for (const rawOption of rawQuery.split("&")) {
      const separator = rawOption.indexOf("=");
      const rawKey = separator < 0 ? rawOption : rawOption.slice(0, separator);
      const rawValue = separator < 0 ? "" : rawOption.slice(separator + 1);
      if (rawOption.includes("%") || !new Set(["sslmode", "channel_binding"]).has(rawKey) || options.has(rawKey)) {
        throw new Error("unsupported or repeated database connection option");
      }
      options.set(rawKey, rawValue);
    }
  }
  const sslmode = options.get("sslmode");
  if (sslmode && !new Set(["require", "verify-full"]).has(sslmode)) {
    throw new Error("unsupported database ssl mode");
  }
  const channelBinding = options.get("channel_binding");
  if (channelBinding && !new Set(["disable", "prefer"]).has(channelBinding)) {
    throw new Error("unsupported database channel binding mode");
  }
  const port = target.port ? Number(target.port) : 5432;
  let database;
  let user;
  let password;
  try {
    database = decodeURIComponent(target.pathname.slice(1));
    user = decodeURIComponent(target.username);
    password = decodeURIComponent(target.password);
  } catch {
    throw new Error("invalid migration database connection target");
  }
  const parsed = { protocol: target.protocol, host: target.hostname, port, database, user, password };
  if (!parsed.host || !parsed.user || !parsed.password || !parsed.database || parsed.database.includes("/") || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("incomplete migration database connection target");
  }
  if (targetFingerprint(parsed) !== FIXED_STAGING_TARGET_FINGERPRINT) {
    throw new Error("migration database target is not the fixed Staging target");
  }
  return {
    host: parsed.host,
    port: parsed.port,
    database: parsed.database,
    user: parsed.user,
    password: parsed.password,
    ssl: { rejectUnauthorized: true },
    enableChannelBinding: channelBinding === "prefer" ? true : channelBinding === "disable" ? false : undefined,
    options: "-c search_path=pg_catalog,public",
    replication: "false",
    application_name: "broker-desk-platform-owner-bootstrap",
    max: 1,
  };
}

function isExactBootstrapAudit(audit, userId, membershipId) {
  const context = audit?.context_json;
  const contextKeys = context && typeof context === "object" && !Array.isArray(context)
    ? Object.keys(context).sort()
    : [];
  return audit
    && audit.tenant_id === INTERNAL_TENANT_ID
    && audit.user_id === userId
    && audit.actor_id === userId
    && audit.action === "platform.bootstrap"
    && audit.target_type === "tenant_membership"
    && audit.target_id === membershipId
    && audit.message === BOOTSTRAP_AUDIT_MESSAGE
    && context !== null
    && typeof context === "object"
    && !Array.isArray(context)
    && contextKeys.length === 2
    && contextKeys[0] === "mode"
    && contextKeys[1] === "source"
    && context.source === BOOTSTRAP_AUDIT_CONTEXT.source
    && context.mode === BOOTSTRAP_AUDIT_CONTEXT.mode;
}

function isExactInternalTenant(tenant) {
  return tenant
    && tenant.id === INTERNAL_TENANT_ID
    && tenant.name === INTERNAL_TENANT_NAME
    && tenant.slug === INTERNAL_TENANT_SLUG
    && tenant.account_type === "company";
}

export async function bootstrapInitialPlatformOwner({ client, email, useLatestClerkUser = false, deploymentEnvironment, vercelEnvironment }) {
  const normalizedEmail = email?.trim().toLowerCase();
  assertControlledOptions({ email: normalizedEmail, useLatestClerkUser, deploymentEnvironment, vercelEnvironment });
  await client.query("BEGIN");
  try {
    await client.query("/* bootstrap:advisory-lock */ SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('broker-desk-initial-platform-owner'))");
    await client.query("/* bootstrap:identity-tables-lock */ LOCK TABLE public.users, public.tenant_memberships IN SHARE ROW EXCLUSIVE MODE");
    const authorityResult = await client.query(
      `/* bootstrap:connection-authority */
       SELECT roles.rolsuper, roles.rolbypassrls,
              audit_table.relrowsecurity AS audit_rls,
              audit_table.relforcerowsecurity AS audit_force_rls
       FROM pg_catalog.pg_roles AS roles
       INNER JOIN pg_catalog.pg_class AS audit_table ON audit_table.relname = 'audit_logs'
       INNER JOIN pg_catalog.pg_namespace AS audit_schema ON audit_schema.oid = audit_table.relnamespace AND audit_schema.nspname = 'public'
       WHERE roles.rolname = current_user`,
    );
    const authority = authorityResult.rows[0];
    if (authorityResult.rows.length !== 1
      || authority.audit_rls !== true
      || authority.audit_force_rls !== true
      || (authority.rolsuper !== true && authority.rolbypassrls !== true)) {
      throw new Error("Bootstrap requires a privileged migration/admin connection that can atomically audit through FORCE RLS");
    }

    const userResult = normalizedEmail
      ? await client.query(
        `/* bootstrap:resolve-user */
         SELECT id, email, external_auth_subject, created_at FROM public.users
         WHERE lower(email) = lower($1) AND external_auth_subject IS NOT NULL
         ORDER BY created_at DESC, id ASC
         LIMIT 2 FOR UPDATE`,
        [normalizedEmail],
      )
      : await client.query(
        `/* bootstrap:resolve-user */
         SELECT id, email, external_auth_subject, created_at FROM public.users
         WHERE external_auth_subject IS NOT NULL AND email NOT LIKE '%@brokerdesk.local'
         ORDER BY created_at DESC, id ASC
         LIMIT 2 FOR UPDATE`,
      );
    if (userResult.rows.length !== 1) {
      throw new Error(useLatestClerkUser ? "Controlled bootstrap requires exactly one real Clerk user" : "Explicit bootstrap email must resolve to exactly one existing Clerk user");
    }
    const user = userResult.rows[0];

    const activeOwnerResult = await client.query(
      `/* bootstrap:active-owner-lock */
       SELECT id, tenant_id, user_id FROM public.tenant_memberships
       WHERE role = 'platform_owner' AND status = 'active'
       ORDER BY tenant_id ASC, id ASC FOR UPDATE`,
    );
    if (activeOwnerResult.rows.length > 0) {
      const exactIdempotentOwner = activeOwnerResult.rows.length === 1
        && activeOwnerResult.rows[0].tenant_id === INTERNAL_TENANT_ID
        && activeOwnerResult.rows[0].user_id === user.id;
      if (!exactIdempotentOwner) throw new Error("An active platform owner already exists; bootstrap is closed");
    }

    const tenantResult = await client.query(
      "/* bootstrap:tenant-lock */ SELECT id, name, slug, account_type FROM public.tenants WHERE id = $1 FOR UPDATE",
      [INTERNAL_TENANT_ID],
    );
    if (tenantResult.rows.length === 0) {
      await client.query(
        `/* bootstrap:tenant-insert */ INSERT INTO public.tenants (id, name, slug, account_type, status, purchased_seat_count)
         VALUES ($1, $2, $3, 'company', 'active', 5)`,
        [INTERNAL_TENANT_ID, INTERNAL_TENANT_NAME, INTERNAL_TENANT_SLUG],
      );
    } else {
      if (!isExactInternalTenant(tenantResult.rows[0])) {
        throw new Error("fixed bootstrap tenant id collision");
      }
      await client.query("/* bootstrap:tenant-update */ UPDATE public.tenants SET status = 'active', updated_at = NOW() WHERE id = $1", [INTERNAL_TENANT_ID]);
    }

    const targetMembershipResult = await client.query(
      `/* bootstrap:target-membership-lock */ SELECT id, tenant_id, user_id FROM public.tenant_memberships
       WHERE tenant_id = $1 AND user_id = $2 ORDER BY id ASC FOR UPDATE`,
      [INTERNAL_TENANT_ID, user.id],
    );
    if (targetMembershipResult.rows.length > 1) throw new Error("Target tenant/user has multiple memberships; bootstrap fails closed");
    const fixedMembershipResult = await client.query(
      "/* bootstrap:fixed-membership-lock */ SELECT id, tenant_id, user_id FROM public.tenant_memberships WHERE id = $1 FOR UPDATE",
      [FIXED_MEMBERSHIP_ID],
    );
    const fixedMembership = fixedMembershipResult.rows[0];
    if (fixedMembership && (fixedMembership.tenant_id !== INTERNAL_TENANT_ID || fixedMembership.user_id !== user.id)) {
      throw new Error("fixed membership id collision");
    }

    const existingMembership = targetMembershipResult.rows[0];
    const membershipId = existingMembership?.id ?? FIXED_MEMBERSHIP_ID;
    if (existingMembership) {
      const updateResult = await client.query(
        `/* bootstrap:membership-update */ UPDATE public.tenant_memberships
         SET role = 'platform_owner', status = 'active', capability = 'ordinary_member', invitation_provider = 'manual',
             invitation_status = 'accepted', invitation_accepted_at = COALESCE(invitation_accepted_at, NOW()), updated_at = NOW()
         WHERE id = $2 AND user_id = $1`,
        [user.id, membershipId],
      );
      if (updateResult.rowCount !== 1) throw new Error("Existing target membership update did not affect exactly one row");
    } else {
      const insertResult = await client.query(
        `/* bootstrap:membership-insert */ INSERT INTO public.tenant_memberships (
           id, tenant_id, user_id, role, capability, status, invitation_provider, invitation_status, invitation_accepted_at
         ) VALUES ($1, $2, $3, 'platform_owner', 'ordinary_member', 'active', 'manual', 'accepted', NOW())`,
        [FIXED_MEMBERSHIP_ID, INTERNAL_TENANT_ID, user.id],
      );
      if (insertResult.rowCount !== 1) throw new Error("Platform-owner membership insert did not affect exactly one row");
    }

    const auditResult = await client.query(
      `/* bootstrap:audit-lock */ SELECT id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json
       FROM public.audit_logs WHERE id = $1 FOR UPDATE`,
      [FIXED_AUDIT_ID],
    );
    let auditInserted = false;
    if (auditResult.rows[0]) {
      if (!isExactBootstrapAudit(auditResult.rows[0], user.id, membershipId)) throw new Error("fixed bootstrap audit id collision");
    } else {
      const insertAuditResult = await client.query(
        `/* bootstrap:audit-insert */ INSERT INTO public.audit_logs (
           id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json
         ) VALUES ($1, $2, $3, $3, 'platform.bootstrap', 'tenant_membership', $4, $5, $6::jsonb)`,
        [FIXED_AUDIT_ID, INTERNAL_TENANT_ID, user.id, membershipId, BOOTSTRAP_AUDIT_MESSAGE, JSON.stringify(BOOTSTRAP_AUDIT_CONTEXT)],
      );
      if (insertAuditResult.rowCount !== 1) throw new Error("Bootstrap audit insert did not affect exactly one row");
      auditInserted = true;
    }
    await client.query("COMMIT");
    return { tenantId: INTERNAL_TENANT_ID, userId: user.id, membershipId, auditInserted };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original business/COMMIT failure. The caller still owns
      // PoolClient release and Pool shutdown even when rollback also fails.
    }
    throw error;
  }
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

export async function runBootstrapWithPool({ Pool, poolConfig, email, useLatestClerkUser = false, deploymentEnvironment, vercelEnvironment, log = console.log }) {
  let pool;
  let result;
  let failed = false;
  try {
    pool = new Pool(poolConfig);
    let client;
    try {
      client = await pool.connect();
      result = await bootstrapInitialPlatformOwner({
        client,
        email,
        useLatestClerkUser,
        deploymentEnvironment,
        vercelEnvironment,
      });
      log(`Initial platform owner bootstrap completed for membership ${result.membershipId}.`);
    } catch {
      failed = true;
    } finally {
      if (client) {
        try {
          client.release();
        } catch {
          failed = true;
        }
      }
    }
  } catch {
    failed = true;
  } finally {
    if (pool) {
      try {
        await pool.end();
      } catch {
        failed = true;
      }
    }
  }
  if (failed) throw new Error("Controlled platform-owner bootstrap failed safely");
  return result;
}

export async function main({ Pool, databaseUrl, email, useLatestClerkUser = false, deploymentEnvironment, vercelEnvironment, log = console.log }) {
  assertNoPgEnvironment();
  assertControlledOptions({ email: email?.trim().toLowerCase(), useLatestClerkUser, deploymentEnvironment, vercelEnvironment });
  const poolConfig = buildPoolConfig(databaseUrl);
  return runBootstrapWithPool({ Pool, poolConfig, email, useLatestClerkUser, deploymentEnvironment, vercelEnvironment, log });
}

async function runFromCommandLine() {
  if (!process.env.DATABASE_MIGRATION_URL && existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }
  const databaseUrl = process.env.DATABASE_MIGRATION_URL;
  if (!databaseUrl) throw new Error("DATABASE_MIGRATION_URL is required");
  const { Pool } = await import("pg");
  await main({
    Pool,
    databaseUrl,
    email: readOption("--email"),
    useLatestClerkUser: process.argv.includes("--latest-clerk-user"),
    deploymentEnvironment: process.env.BROKER_DESK_DEPLOYMENT_ENV,
    vercelEnvironment: process.env.VERCEL_ENV,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runFromCommandLine();
}
