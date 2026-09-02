#!/usr/bin/env node

export const BOOTSTRAP_DATABASE_NAME = "broker_desk_internal_alpha";
export const BOOTSTRAP_ENVIRONMENT = "staging";
export const BOOTSTRAP_MARKER = "BROKER_DESK_CLEAN_STAGING_V1";
export const BOOTSTRAP_NONPROD_MARKER = "broker-desk-staging-nonprod";
export const INTERNAL_TENANT = Object.freeze({
  id: "tenant_broker_desk_internal",
  name: "Broker Desk 内部工作区",
  slug: "broker-desk-internal",
  accountType: "company",
  status: "active",
  purchasedSeatCount: 1,
});
export const CUSTOMER_TENANT = Object.freeze({
  id: "tenant_broker_desk_internal_alpha",
  name: "INTERNAL ALPHA / TEST",
  slug: "broker-desk-internal-alpha",
  accountType: "company",
  status: "active",
  purchasedSeatCount: 2,
});

const INTERNAL_MEMBERSHIP_ID = "membership_broker_desk_platform_owner";
const INVITED_USERS = Object.freeze({
  companyOwner: { id: "user_clean_staging_company_owner_invite", role: "tenant_owner", capability: "company_owner" },
  ordinaryMember: { id: "user_clean_staging_ordinary_member_invite", role: "broker", capability: "ordinary_member" },
});
const INVITED_MEMBERSHIPS = Object.freeze({
  companyOwner: "membership_clean_staging_company_owner_invite",
  ordinaryMember: "membership_clean_staging_ordinary_member_invite",
});
const INVITED_PASSWORD_SENTINEL = "local_invited_user";

function normalizeEmail(value, label) {
  if (typeof value !== "string") throw new Error(`${label} is required`);
  const normalized = value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new Error(`${label} is invalid`);
  return normalized;
}

function normalizeAllowlist(value) {
  if (typeof value !== "string") throw new Error("BROKER_DESK_STAGING_AUTH_ALLOWLIST is required");
  const emails = value.split(",").map((entry) => normalizeEmail(entry, "allowlist email"));
  if (emails.length !== new Set(emails).size) throw new Error("allowlist contains duplicate emails");
  return emails.sort();
}

export function buildBootstrapPlan({ platformEmail, companyOwnerEmail, ordinaryMemberEmail, marker = BOOTSTRAP_MARKER }) {
  const emails = {
    platform: normalizeEmail(platformEmail, "platform email"),
    companyOwner: normalizeEmail(companyOwnerEmail, "company owner email"),
    ordinaryMember: normalizeEmail(ordinaryMemberEmail, "ordinary member email"),
  };
  if (new Set(Object.values(emails)).size !== 3) throw new Error("bootstrap role emails must be distinct");
  if (marker !== BOOTSTRAP_MARKER) throw new Error("bootstrap marker is invalid");
  return Object.freeze({
    marker,
    databaseName: BOOTSTRAP_DATABASE_NAME,
    environment: BOOTSTRAP_ENVIRONMENT,
    emails,
    internalTenant: INTERNAL_TENANT,
    customerTenant: CUSTOMER_TENANT,
    invitedUsers: INVITED_USERS,
    invitedMemberships: INVITED_MEMBERSHIPS,
    invites: Object.freeze([
      Object.freeze({ email: emails.companyOwner, capability: "company_owner", status: "invited", invitationStatus: "pending" }),
      Object.freeze({ email: emails.ordinaryMember, capability: "ordinary_member", status: "invited", invitationStatus: "pending" }),
    ]),
    writesClerkUsers: false,
    sendsEmail: false,
    writesBusinessScenarios: false,
    writesTenantCreationRequests: false,
  });
}

function exactTenant(row, expected) {
  return row
    && row.id === expected.id
    && row.name === expected.name
    && row.slug === expected.slug
    && row.account_type === expected.accountType
    && row.status === expected.status
    && Number(row.purchased_seat_count) === expected.purchasedSeatCount
    && row.service_start_at === null
    && row.service_end_at === null;
}

function exactInvitation(row, expected, email, tenantId, invitedByUserId) {
  return row
    && row.id === expected.membershipId
    && row.tenant_id === tenantId
    && row.user_id === expected.userId
    && row.role === expected.role
    && row.capability === expected.capability
    && row.status === "invited"
    && row.invitation_provider === "none"
    && row.invitation_status === "pending"
    && row.invitation_accepted_at === null
    && row.invited_email === email
    && row.invited_by_user_id === invitedByUserId
    && row.invitation_expires_at === null
    && row.invitation_token === null;
}

function expectedUsers(plan, platformUserId, users) {
  const platform = users.find((row) => row.id === platformUserId);
  return platform
    && platform.email === plan.emails.platform
    && platform.external_auth_bound === true
    && platform.invited_password_sentinel === false;
}

export function validateBootstrapSnapshot(snapshot, plan, phase = "preflight") {
  if (snapshot.databaseName !== plan.databaseName) throw new Error("bootstrap target database does not match the fixed Clean Staging database");
  if (snapshot.nonprodMarker !== "broker-desk-staging-nonprod") throw new Error("bootstrap target lacks the non-production marker");
  if (snapshot.deploymentEnvironment !== plan.environment) throw new Error("bootstrap target is not marked staging");
  if (!snapshot.authority || (snapshot.authority.rolsuper !== true && snapshot.authority.rolbypassrls !== true)) {
    throw new Error("bootstrap requires a privileged initialization connection");
  }
  if (snapshot.authority.auditForceRls !== true) throw new Error("audit_logs must retain FORCE ROW LEVEL SECURITY");
  if (snapshot.creationRequestCount !== 0) throw new Error("tenant creation requests must be empty for clean bootstrap");

  const platformUsers = snapshot.users.filter((row) => row.email === plan.emails.platform);
  if (platformUsers.length !== 1 || !expectedUsers(plan, platformUsers[0].id, snapshot.users)) {
    throw new Error("bootstrap requires exactly one existing bound platform identity");
  }
  const platformUserId = platformUsers[0].id;
  const exactFinalUsers = snapshot.users.length === 3
    && snapshot.users.every((row) => row.id === platformUserId
      || (row.id === plan.invitedUsers.companyOwner.id
        && row.email === plan.emails.companyOwner
        && row.external_auth_bound === false
        && row.invited_password_sentinel === true)
      || (row.id === plan.invitedUsers.ordinaryMember.id
        && row.email === plan.emails.ordinaryMember
        && row.external_auth_bound === false
        && row.invited_password_sentinel === true));
  const freshUsers = snapshot.users.length === 1;
  if (!freshUsers && !exactFinalUsers) throw new Error("existing users do not exactly match the clean bootstrap contract");

  const tenantsAreFresh = snapshot.tenants.length === 0;
  const tenantsAreFinal = snapshot.tenants.length === 2
    && snapshot.tenants.some((row) => exactTenant(row, plan.internalTenant))
    && snapshot.tenants.some((row) => exactTenant(row, plan.customerTenant));
  if (!tenantsAreFresh && !tenantsAreFinal) throw new Error("existing tenants do not exactly match the clean bootstrap contract");

  const membershipsAreFresh = snapshot.memberships.length === 0;
  const membershipsAreFinal = snapshot.memberships.length === 3
    && snapshot.memberships.some((row) => row.id === INTERNAL_MEMBERSHIP_ID
      && row.tenant_id === plan.internalTenant.id
      && row.user_id === platformUserId
      && row.role === "platform_owner"
      && row.capability === null
      && row.status === "active"
      && row.invitation_provider === "manual"
      && row.invitation_status === "accepted")
    && snapshot.memberships.some((row) => exactInvitation(row, {
      membershipId: INVITED_MEMBERSHIPS.companyOwner,
      userId: plan.invitedUsers.companyOwner.id,
      role: plan.invitedUsers.companyOwner.role,
      capability: plan.invitedUsers.companyOwner.capability,
    }, plan.emails.companyOwner, plan.customerTenant.id, platformUserId))
    && snapshot.memberships.some((row) => exactInvitation(row, {
      membershipId: INVITED_MEMBERSHIPS.ordinaryMember,
      userId: plan.invitedUsers.ordinaryMember.id,
      role: plan.invitedUsers.ordinaryMember.role,
      capability: plan.invitedUsers.ordinaryMember.capability,
    }, plan.emails.ordinaryMember, plan.customerTenant.id, platformUserId));
  if (!membershipsAreFresh && !membershipsAreFinal) throw new Error("existing memberships do not exactly match the clean bootstrap contract");

  const freshState = freshUsers && tenantsAreFresh && membershipsAreFresh;
  const finalState = exactFinalUsers && tenantsAreFinal && membershipsAreFinal;
  if (!freshState && !finalState) throw new Error("clean bootstrap state is partial; refusing to repair or overwrite it");

  if (phase === "post-write" && !finalState) {
    throw new Error("bootstrap did not produce the exact final identity and tenant shape");
  }
  return Object.freeze({ platformUserId, state: exactFinalUsers ? "initialized" : "fresh" });
}

function databaseNameFromUrl(connectionString) {
  if (typeof connectionString !== "string" || connectionString.trim() !== connectionString || !/^(postgres|postgresql):\/\//.test(connectionString)) {
    throw new Error("clean bootstrap database URL is invalid");
  }
  let target;
  try {
    target = new URL(connectionString);
  } catch {
    throw new Error("clean bootstrap database URL is invalid");
  }
  let database;
  try {
    database = decodeURIComponent(target.pathname.slice(1));
  } catch {
    throw new Error("clean bootstrap database URL is invalid");
  }
  if (database !== BOOTSTRAP_DATABASE_NAME) throw new Error("clean bootstrap URL does not target the fixed Clean Staging database");
  return database;
}

function loadRuntimeConfig(environment = process.env) {
  const databaseUrl = environment.BROKER_DESK_CLEAN_STAGING_BOOTSTRAP_DATABASE_URL;
  databaseNameFromUrl(databaseUrl);
  if (environment.BROKER_DESK_DEPLOYMENT_ENV?.trim().toLowerCase() !== BOOTSTRAP_ENVIRONMENT
    || environment.BROKER_DESK_CLEAN_STAGING_BOOTSTRAP_ENV?.trim().toLowerCase() !== BOOTSTRAP_ENVIRONMENT
    || environment.VERCEL_ENV?.trim().toLowerCase() !== "preview") {
    throw new Error("clean bootstrap requires the fixed non-production Staging Preview environment");
  }
  const plan = buildBootstrapPlan({
    platformEmail: environment.BROKER_DESK_CLEAN_STAGING_PLATFORM_EMAIL,
    companyOwnerEmail: environment.BROKER_DESK_CLEAN_STAGING_COMPANY_OWNER_EMAIL,
    ordinaryMemberEmail: environment.BROKER_DESK_CLEAN_STAGING_ORDINARY_MEMBER_EMAIL,
  });
  const allowlist = normalizeAllowlist(environment.BROKER_DESK_STAGING_AUTH_ALLOWLIST);
  if (allowlist.join(",") !== Object.values(plan.emails).sort().join(",")) throw new Error("bootstrap allowlist must exactly match the three configured role emails");
  if (environment.BROKER_DESK_CLEAN_STAGING_BOOTSTRAP_MARKER !== BOOTSTRAP_MARKER) throw new Error("clean bootstrap marker is invalid");
  if (Object.keys(environment).some((key) => key.startsWith("PG") && String(environment[key] ?? "").trim() !== "")) {
    throw new Error("PostgreSQL environment overrides are forbidden for clean bootstrap");
  }
  return { databaseUrl, plan };
}

async function readSnapshot(client) {
  const target = await client.query(`
    SELECT current_database() AS database_name,
           current_setting('app.broker_desk_nonprod_marker', true) AS nonprod_marker,
           current_setting('app.broker_desk_deployment_env', true) AS deployment_environment
  `);
  const authority = await client.query(`
    SELECT roles.rolsuper, roles.rolbypassrls,
           audit_table.relforcerowsecurity AS audit_force_rls
      FROM pg_catalog.pg_roles AS roles
      JOIN pg_catalog.pg_class AS audit_table ON audit_table.relname = 'audit_logs'
      JOIN pg_catalog.pg_namespace AS audit_schema
        ON audit_schema.oid = audit_table.relnamespace AND audit_schema.nspname = 'public'
     WHERE roles.rolname = current_user
  `);
  const users = await client.query(`
    SELECT id, lower(trim(email)) AS email,
           (external_auth_subject IS NOT NULL) AS external_auth_bound,
           (password_hash = $1) AS invited_password_sentinel
      FROM public.users
     ORDER BY id
  `, [INVITED_PASSWORD_SENTINEL]);
  const tenants = await client.query(`
    SELECT id, name, slug, account_type, status, purchased_seat_count,
           service_start_at, service_end_at
      FROM public.tenants
     ORDER BY id
  `);
  const memberships = await client.query(`
    SELECT id, tenant_id, user_id, role, capability, status,
           invitation_provider, invitation_status, invitation_accepted_at,
           invited_email, invited_by_user_id, invitation_expires_at, invitation_token
      FROM public.tenant_memberships
     ORDER BY id
  `);
  const creationRequests = await client.query("SELECT COUNT(*)::INTEGER AS count FROM public.tenant_creation_requests");
  return {
    databaseName: target.rows[0]?.database_name,
    nonprodMarker: target.rows[0]?.nonprod_marker,
    deploymentEnvironment: target.rows[0]?.deployment_environment,
    authority: {
      rolsuper: authority.rows[0]?.rolsuper === true,
      rolbypassrls: authority.rows[0]?.rolbypassrls === true,
      auditForceRls: authority.rows[0]?.audit_force_rls === true,
    },
    users: users.rows,
    tenants: tenants.rows,
    memberships: memberships.rows,
    creationRequestCount: Number(creationRequests.rows[0]?.count ?? -1),
  };
}

async function insertIfAbsent(client, id, sql, values, existingIds) {
  if (existingIds.has(id)) return false;
  await client.query(sql, values);
  return true;
}

async function establishBootstrapSessionMarkers(client, plan) {
  await client.query(`
    SELECT pg_catalog.set_config('app.broker_desk_nonprod_marker', $1, true),
           pg_catalog.set_config('app.broker_desk_deployment_env', $2, true)
  `, [BOOTSTRAP_NONPROD_MARKER, plan.environment]);
  const markerResult = await client.query(`
    SELECT current_setting('app.broker_desk_nonprod_marker', true) AS nonprod_marker,
           current_setting('app.broker_desk_deployment_env', true) AS deployment_environment
  `);
  const markerRow = markerResult.rows[0];
  if (markerRow?.nonprod_marker !== BOOTSTRAP_NONPROD_MARKER
    || markerRow?.deployment_environment !== plan.environment) {
    throw new Error("bootstrap session marker verification failed");
  }
}

async function writeBootstrap(client, plan, platformUserId, snapshot) {
  const userIds = new Set(snapshot.users.map((row) => row.id));
  const tenantIds = new Set(snapshot.tenants.map((row) => row.id));
  const membershipIds = new Set(snapshot.memberships.map((row) => row.id));
  const writes = { users: 0, tenants: 0, memberships: 0 };

  if (await insertIfAbsent(client, plan.internalTenant.id,
    `INSERT INTO public.tenants (id, name, slug, account_type, status, purchased_seat_count)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [plan.internalTenant.id, plan.internalTenant.name, plan.internalTenant.slug, plan.internalTenant.accountType, plan.internalTenant.status, plan.internalTenant.purchasedSeatCount], tenantIds)) writes.tenants += 1;
  if (await insertIfAbsent(client, plan.customerTenant.id,
    `INSERT INTO public.tenants (id, name, slug, account_type, status, purchased_seat_count)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [plan.customerTenant.id, plan.customerTenant.name, plan.customerTenant.slug, plan.customerTenant.accountType, plan.customerTenant.status, plan.customerTenant.purchasedSeatCount], tenantIds)) writes.tenants += 1;

  if (await insertIfAbsent(client, plan.invitedUsers.companyOwner.id,
    `INSERT INTO public.users (id, name, email, password_hash, external_auth_subject)
     VALUES ($1, $2, $3, $4, NULL)`,
    [plan.invitedUsers.companyOwner.id, "INTERNAL ALPHA company owner invitation", plan.emails.companyOwner, INVITED_PASSWORD_SENTINEL], userIds)) writes.users += 1;
  if (await insertIfAbsent(client, plan.invitedUsers.ordinaryMember.id,
    `INSERT INTO public.users (id, name, email, password_hash, external_auth_subject)
     VALUES ($1, $2, $3, $4, NULL)`,
    [plan.invitedUsers.ordinaryMember.id, "INTERNAL ALPHA ordinary member invitation", plan.emails.ordinaryMember, INVITED_PASSWORD_SENTINEL], userIds)) writes.users += 1;

  if (await insertIfAbsent(client, INTERNAL_MEMBERSHIP_ID,
    `INSERT INTO public.tenant_memberships
       (id, tenant_id, user_id, role, capability, status, invitation_provider, invitation_status, invitation_accepted_at)
     VALUES ($1, $2, $3, 'platform_owner', NULL, 'active', 'manual', 'accepted', NOW())`,
    [INTERNAL_MEMBERSHIP_ID, plan.internalTenant.id, platformUserId], membershipIds)) writes.memberships += 1;
  if (await insertIfAbsent(client, INVITED_MEMBERSHIPS.companyOwner,
    `INSERT INTO public.tenant_memberships
       (id, tenant_id, user_id, role, capability, status, invitation_provider, invitation_status,
        invitation_accepted_at, invited_email, invited_by_user_id, invitation_expires_at, invitation_token)
     VALUES ($1, $2, $3, $4, $5, 'invited', 'none', 'pending', NULL, $6, $7, NULL, NULL)`,
    [INVITED_MEMBERSHIPS.companyOwner, plan.customerTenant.id, plan.invitedUsers.companyOwner.id, plan.invitedUsers.companyOwner.role, plan.invitedUsers.companyOwner.capability, plan.emails.companyOwner, platformUserId], membershipIds)) writes.memberships += 1;
  if (await insertIfAbsent(client, INVITED_MEMBERSHIPS.ordinaryMember,
    `INSERT INTO public.tenant_memberships
       (id, tenant_id, user_id, role, capability, status, invitation_provider, invitation_status,
        invitation_accepted_at, invited_email, invited_by_user_id, invitation_expires_at, invitation_token)
     VALUES ($1, $2, $3, $4, $5, 'invited', 'none', 'pending', NULL, $6, $7, NULL, NULL)`,
    [INVITED_MEMBERSHIPS.ordinaryMember, plan.customerTenant.id, plan.invitedUsers.ordinaryMember.id, plan.invitedUsers.ordinaryMember.role, plan.invitedUsers.ordinaryMember.capability, plan.emails.ordinaryMember, platformUserId], membershipIds)) writes.memberships += 1;
  return writes;
}

function safeResult(plan, writes, dryRun, state) {
  return {
    status: dryRun ? "dry-run" : "initialized",
    state,
    dryRun,
    environment: plan.environment,
    databaseName: plan.databaseName,
    marker: plan.marker,
    writes,
    writesClerkUsers: plan.writesClerkUsers,
    sendsEmail: plan.sendsEmail,
    writesBusinessScenarios: plan.writesBusinessScenarios,
    writesTenantCreationRequests: plan.writesTenantCreationRequests,
    invitedRoles: ["company_owner", "ordinary_member"],
    activeCustomerTenants: 1,
  };
}

export async function runBootstrap({ client, plan, dryRun = false }) {
  await client.query(dryRun ? "BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY" : "BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
  try {
    await establishBootstrapSessionMarkers(client, plan);
    if (!dryRun) {
      await client.query("SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1, 0))", [plan.marker]);
      await client.query("LOCK TABLE public.users, public.tenants, public.tenant_memberships IN SHARE ROW EXCLUSIVE MODE");
    }
    const before = await readSnapshot(client);
    const validation = validateBootstrapSnapshot(before, plan, "preflight");
    if (dryRun) {
      await client.query("ROLLBACK");
      return { ...safeResult(plan, { users: 0, tenants: 0, memberships: 0 }, true, validation.state), expectedWrites: validation.state === "fresh" ? { users: 2, tenants: 2, memberships: 3 } : { users: 0, tenants: 0, memberships: 0 } };
    }
    const writes = await writeBootstrap(client, plan, validation.platformUserId, before);
    const after = await readSnapshot(client);
    validateBootstrapSnapshot(after, plan, "post-write");
    await client.query("COMMIT");
    return safeResult(plan, writes, false, "initialized");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--dry-run")) throw new Error("only --dry-run is supported; target and role inputs are fixed by protected environment configuration");
  const dryRun = args.includes("--dry-run");
  const { databaseUrl, plan } = loadRuntimeConfig();
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl, max: 1, application_name: "broker-desk-clean-staging-bootstrap" });
  const client = await pool.connect();
  try {
    const result = await runBootstrap({ client, plan, dryRun });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    console.error(`Clean Staging bootstrap refused: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  }
}
