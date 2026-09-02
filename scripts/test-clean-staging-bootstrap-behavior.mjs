import assert from "node:assert/strict";
import { buildBootstrapPlan, runBootstrap, validateBootstrapSnapshot } from "./bootstrap-clean-staging.mjs";

const expected = buildBootstrapPlan({
  platformEmail: "neoyu0125@gmail.com",
  companyOwnerEmail: "rikiyoaki@gmail.com",
  ordinaryMemberEmail: "neoyu9@163.com",
  marker: "BROKER_DESK_CLEAN_STAGING_V1",
});

assert.equal(expected.customerTenant.name, "INTERNAL ALPHA / TEST");
assert.equal(expected.customerTenant.purchasedSeatCount, 2);
assert.deepEqual(expected.invites.map((invite) => [invite.email, invite.capability]), [
  ["rikiyoaki@gmail.com", "company_owner"],
  ["neoyu9@163.com", "ordinary_member"],
]);
assert.equal(expected.writesClerkUsers, false);
assert.equal(expected.sendsEmail, false);
assert.equal(expected.writesBusinessScenarios, false);
assert.deepEqual(Object.keys(expected).filter((key) => /password|secret|token/i.test(key)), []);

const freshSnapshot = {
  databaseName: "broker_desk_internal_alpha",
  nonprodMarker: "broker-desk-staging-nonprod",
  deploymentEnvironment: "staging",
  authority: { roleName: "brokerdesk_admin", rolsuper: false, rolbypassrls: false, auditForceRls: true, targetTables: [] },
  users: [{ id: "user_platform", email: "neoyu0125@gmail.com", external_auth_bound: true, invited_password_sentinel: false }],
  tenants: [],
  memberships: [],
  creationRequestCount: 0,
};
const minimalAdminTables = ["users", "tenants", "tenant_memberships"].map((name) => ({
  name,
  exists: true,
  owner: "neondb_owner",
  isCurrentOwner: false,
  rowSecurity: true,
  forceRowSecurity: false,
  select: true,
  insert: true,
  update: false,
  delete: false,
}));
const minimalAdminSnapshot = {
  ...freshSnapshot,
  authority: {
    roleName: "brokerdesk_admin",
    rolsuper: false,
    rolbypassrls: false,
    auditForceRls: true,
    targetTables: minimalAdminTables,
  },
};
assert.equal(validateBootstrapSnapshot(minimalAdminSnapshot, expected).state, "fresh");

assert.throws(
  () => validateBootstrapSnapshot({ ...minimalAdminSnapshot, authority: { ...minimalAdminSnapshot.authority, rolsuper: true } }, expected),
  /must not be superuser or BYPASSRLS/,
);
assert.throws(
  () => validateBootstrapSnapshot({ ...minimalAdminSnapshot, authority: { ...minimalAdminSnapshot.authority, rolbypassrls: true } }, expected),
  /must not be superuser or BYPASSRLS/,
);
assert.throws(
  () => validateBootstrapSnapshot({ ...minimalAdminSnapshot, authority: { ...minimalAdminSnapshot.authority, roleName: "neondb_owner" } }, expected),
  /fixed brokerdesk_admin role/,
);
assert.throws(
  () => validateBootstrapSnapshot({ ...minimalAdminSnapshot, authority: { ...minimalAdminSnapshot.authority, targetTables: minimalAdminTables.map((row) => row.name === "users" ? { ...row, insert: false } : row) } }, expected),
  /security boundary is invalid for users/,
);
assert.throws(
  () => validateBootstrapSnapshot({ ...minimalAdminSnapshot, authority: { ...minimalAdminSnapshot.authority, targetTables: minimalAdminTables.map((row) => row.name === "tenants" ? { ...row, forceRowSecurity: true } : row) } }, expected),
  /security boundary is invalid for tenants/,
);
assert.equal(validateBootstrapSnapshot(minimalAdminSnapshot, expected).state, "fresh");

const readOnlyQueries = [];
const fakeClient = {
  async query(sql) {
    readOnlyQueries.push(sql);
    if (sql.startsWith("BEGIN")) return { rows: [] };
    if (sql === "ROLLBACK") return { rows: [] };
    if (sql.includes("set_config")) return { rows: [] };
    if (sql.includes("current_database()")) return { rows: [{ database_name: freshSnapshot.databaseName, nonprod_marker: freshSnapshot.nonprodMarker, deployment_environment: freshSnapshot.deploymentEnvironment }] };
    if (sql.includes("current_setting('app.broker_desk_nonprod_marker'")) {
      return { rows: [{ nonprod_marker: freshSnapshot.nonprodMarker, deployment_environment: freshSnapshot.deploymentEnvironment }] };
    }
    if (sql.includes("pg_roles")) return { rows: [{ role_name: minimalAdminSnapshot.authority.roleName, rolsuper: false, rolbypassrls: false, audit_force_rls: true, target_tables: minimalAdminTables }] };
    if (sql.includes("external_auth_bound")) return { rows: freshSnapshot.users };
    if (sql.includes("purchased_seat_count")) return { rows: freshSnapshot.tenants };
    if (sql.includes("invitation_provider")) return { rows: freshSnapshot.memberships };
    if (sql.includes("tenant_creation_requests")) return { rows: [{ count: 0 }] };
    throw new Error(`unexpected fake query: ${sql}`);
  },
};
const dryRunResult = await runBootstrap({ client: fakeClient, plan: expected, dryRun: true });
assert.equal(dryRunResult.status, "dry-run");
assert.deepEqual(dryRunResult.expectedWrites, { users: 2, tenants: 2, memberships: 3 });
assert.equal(readOnlyQueries.some((query) => /^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(query)), false);
const markerSetupIndex = readOnlyQueries.findIndex((query) => query.includes("set_config"));
assert.notEqual(markerSetupIndex, -1, "bootstrap must establish transaction-local environment markers before snapshot validation");
assert.match(readOnlyQueries[markerSetupIndex], /app\.broker_desk_nonprod_marker/);
assert.match(readOnlyQueries[markerSetupIndex], /app\.broker_desk_deployment_env/);
assert.match(readOnlyQueries[markerSetupIndex], /true/);
const snapshotIndex = readOnlyQueries.findIndex((query) => query.includes("current_database()"));
assert.ok(markerSetupIndex < snapshotIndex, "marker setup must precede the target snapshot query");
assert.equal(readOnlyQueries.at(-1), "ROLLBACK");

const wrongMarkerQueries = [];
const wrongMarkerClient = {
  async query(sql) {
    wrongMarkerQueries.push(sql);
    if (sql.startsWith("BEGIN") || sql.includes("set_config")) return { rows: [] };
    if (sql.includes("current_setting('app.broker_desk_nonprod_marker'")) {
      return { rows: [{ nonprod_marker: "production", deployment_environment: "production" }] };
    }
    if (sql === "ROLLBACK") return { rows: [] };
    throw new Error(`unexpected wrong-marker query: ${sql}`);
  },
};
await assert.rejects(
  runBootstrap({ client: wrongMarkerClient, plan: expected, dryRun: true }),
  /bootstrap session marker verification failed/,
);
assert.equal(wrongMarkerQueries.at(-1), "ROLLBACK");

const finalSnapshot = {
  ...freshSnapshot,
  authority: minimalAdminSnapshot.authority,
  users: [
    ...freshSnapshot.users,
    { id: "user_clean_staging_company_owner_invite", email: "rikiyoaki@gmail.com", external_auth_bound: false, invited_password_sentinel: true },
    { id: "user_clean_staging_ordinary_member_invite", email: "neoyu9@163.com", external_auth_bound: false, invited_password_sentinel: true },
  ],
  tenants: [
    { id: "tenant_broker_desk_internal", name: "Broker Desk 内部工作区", slug: "broker-desk-internal", account_type: "company", status: "active", purchased_seat_count: 1, service_start_at: null, service_end_at: null },
    { id: "tenant_broker_desk_internal_alpha", name: "INTERNAL ALPHA / TEST", slug: "broker-desk-internal-alpha", account_type: "company", status: "active", purchased_seat_count: 2, service_start_at: null, service_end_at: null },
  ],
  memberships: [
    { id: "membership_broker_desk_platform_owner", tenant_id: "tenant_broker_desk_internal", user_id: "user_platform", role: "platform_owner", capability: null, status: "active", invitation_provider: "manual", invitation_status: "accepted", invitation_accepted_at: "set", invited_email: null, invited_by_user_id: null, invitation_expires_at: null, invitation_token: null },
    { id: "membership_clean_staging_company_owner_invite", tenant_id: "tenant_broker_desk_internal_alpha", user_id: "user_clean_staging_company_owner_invite", role: "tenant_owner", capability: "company_owner", status: "invited", invitation_provider: "none", invitation_status: "pending", invitation_accepted_at: null, invited_email: "rikiyoaki@gmail.com", invited_by_user_id: "user_platform", invitation_expires_at: null, invitation_token: null },
    { id: "membership_clean_staging_ordinary_member_invite", tenant_id: "tenant_broker_desk_internal_alpha", user_id: "user_clean_staging_ordinary_member_invite", role: "broker", capability: "ordinary_member", status: "invited", invitation_provider: "none", invitation_status: "pending", invitation_accepted_at: null, invited_email: "neoyu9@163.com", invited_by_user_id: "user_platform", invitation_expires_at: null, invitation_token: null },
  ],
};
assert.equal(validateBootstrapSnapshot(finalSnapshot, expected, "post-write").state, "initialized");

const wrongRoleSnapshot = {
  ...finalSnapshot,
  memberships: finalSnapshot.memberships.map((row) => row.id === "membership_clean_staging_ordinary_member_invite"
    ? { ...row, capability: "company_owner" }
    : row),
};
assert.throws(() => validateBootstrapSnapshot(wrongRoleSnapshot, expected), /memberships do not exactly match/);

const partialSnapshot = {
  ...freshSnapshot,
  authority: minimalAdminSnapshot.authority,
  tenants: [{ id: "tenant_broker_desk_internal", name: "Broker Desk 内部工作区", slug: "broker-desk-internal", account_type: "company", status: "active", purchased_seat_count: 1, service_start_at: null, service_end_at: null }],
};
assert.throws(() => validateBootstrapSnapshot(partialSnapshot, expected), /exactly match/);

const malformedAllowlistPlan = () => buildBootstrapPlan({
  platformEmail: "neoyu0125@gmail.com",
  companyOwnerEmail: "rikiyoaki@gmail.com",
  ordinaryMemberEmail: "neoyu9@163.com",
  marker: "WRONG_MARKER",
});
assert.throws(malformedAllowlistPlan, /marker/);

console.log("clean staging bootstrap behavior: PASS");
