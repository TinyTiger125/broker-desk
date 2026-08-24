import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(`visibility-foundation contract failed: ${message}`);
};

const migration = read("db/migrations/20260824_001_visibility_foundation.sql");
const memory = read("src/lib/data.memory.ts");
const postgres = read("src/lib/data.postgres.ts");
const data = read("src/lib/data.ts");
const actions = read("src/app/actions.ts");

for (const value of ["case", "person", "property", "private", "company_read"]) {
  assert(migration.includes(`'${value}'`), `migration includes ${value}`);
}
assert(migration.includes("tenant_member_visibility_defaults"), "membership-scoped defaults table exists");
assert(migration.includes("membership_id TEXT NOT NULL"), "defaults are bound to membership");
assert(migration.includes("UNIQUE (tenant_id, membership_id, member_user_id, object_type)"), "defaults are isolated by tenant/member/object");
assert(migration.includes("ENABLE ROW LEVEL SECURITY") && migration.includes("FORCE ROW LEVEL SECURITY"), "defaults use RLS");
assert(migration.includes("brokerdesk_private.can_access_tenant(tenant_id)"), "defaults use tenant policy");
assert(migration.includes("member_user_id = brokerdesk_private.current_user_id()"), "defaults writes are bound to the member identity");
assert(migration.includes("membership.tenant_id = tenant_member_visibility_defaults.tenant_id") && migration.includes("membership.user_id = tenant_member_visibility_defaults.member_user_id") && migration.includes("membership.status = 'active'"), "defaults require a matching active membership relation");
assert(migration.includes("CREATE POLICY brokerdesk_tenant_visibility_defaults_select") && migration.includes("member_user_id = brokerdesk_private.current_user_id()"), "default reads are self-only at the RLS layer");
assert(migration.includes("owner_resolution_status = 'pending_confirmation'"), "unknown property ownership stays pending");

for (const field of ["created_by_user_id", "current_owner_user_id", "visibility_scope", "owner_resolution_status"]) {
  assert(migration.includes(`ADD COLUMN IF NOT EXISTS ${field}`), `migration adds ${field}`);
  assert(memory.includes(field === "created_by_user_id" ? "createdByUserId" : field === "current_owner_user_id" ? "currentOwnerUserId" : field === "visibility_scope" ? "visibilityScope" : "ownerResolutionStatus"), `memory maps ${field}`);
  assert(postgres.includes(field), `postgres maps ${field}`);
}
assert(migration.includes("created_by_user_id, current_owner_user_id") || migration.includes("created_by_user_id TEXT"), "legacy owner backfill is explicit");
assert(migration.includes("COALESCE(created_by_user_id, owner_user_id)") && migration.includes("COALESCE(created_by_user_id, user_id)"), "legacy owner source columns are explicit");
assert(postgres.includes('"20260824_001_visibility_foundation.sql"'), "migration readiness includes W9.1 migration");
assert(data.includes("setMemberVisibilityDefault") && data.includes("setRecordVisibilityScope"), "repository exposes owner-only writes");
assert(memory.includes('membership.status === "active"') && memory.includes("membership.userId !== input.actorUserId"), "memory default write requires active self membership");
assert(postgres.includes("m.status = 'active'") && postgres.includes("input.actorUserId !== input.memberUserId"), "postgres default write requires active self membership");
assert(postgres.includes("databaseActorMatches") && postgres.includes("brokerdesk_private.current_user_id()"), "postgres mutations bind actor to database identity");
assert(memory.includes("actorUserId: string") && postgres.includes("actorUserId: string"), "default reads require an actor identity");
assert(memory.includes("item.membershipId === membership.id") && postgres.includes("membership_id IN"), "default reads are restricted to the actor membership");
assert(migration.includes("VALIDATE CONSTRAINT clients_visibility_scope_check") && migration.includes("VALIDATE CONSTRAINT brokerage_cases_owner_resolution_status_check"), "visibility checks are validated after backfill");
assert(memory.includes('ownerResolutionStatus: input.currentOwnerUserId ? "resolved" : "pending_confirmation"') && postgres.includes('ownerUserId ? "resolved" : "pending_confirmation"'), "unknown ownership is fail-closed");
assert(actions.includes("createdByUserId: user.id") && actions.includes("currentOwnerUserId: user.id"), "property create/import paths record creator and current owner");
assert(memory.includes('defaultVisibilityScope(scopeTenantId, input.userId, "case")') && memory.includes('defaultVisibilityScope(scopeTenantId, input.ownerUserId, "person")'), "memory creation inherits object-specific defaults");
assert(postgres.includes('resolveMemberVisibilityScope(tenantId, input.userId, "case"') && postgres.includes('resolveMemberVisibilityScope(scopeTenantId, input.ownerUserId, "person"'), "postgres creation inherits object-specific defaults");
assert(memory.includes("isVisibilityRecordResolved(item)") && postgres.includes("owner_resolution_status = 'resolved'"), "ordinary reads hide unresolved ownership");
assert(memory.includes("visibility_scope_changed") && postgres.includes("visibility_scope_changed"), "scope changes are audited");
console.log("visibility-foundation contract: PASS");
