import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(`visibility-resolver contract failed: ${message}`);
};

const resolver = read("src/lib/visibility-resolver.ts");
const tenantSession = read("src/lib/tenant-session.ts");
const sessionProvenance = read("src/lib/tenant-session-provenance.ts");
const memory = read("src/lib/data.memory.ts");
const postgres = read("src/lib/data.postgres.ts");
const data = read("src/lib/data.ts");

for (const decision of ["owner_write", "company_read", "not_accessible"]) {
  assert(resolver.includes(`"${decision}"`), `resolver exposes ${decision}`);
}
for (const field of ["externalAuthSubject", "userId", "tenantId", "membershipId", "membershipStatus"]) {
  assert(resolver.includes(field), `RequestContext includes ${field}`);
}
assert(resolver.includes("createRequestContext(session: TenantSession)"), "context is built from trusted TenantSession");
assert(resolver.includes("hasTenantSessionProvenance(session)"), "context rejects unregistered session objects");
assert(resolver.includes("session.user.externalAuthSubject !== externalAuthSubject"), "context binds subject to local user");
assert(sessionProvenance.includes("WeakSet") && tenantSession.includes("registerTenantSessionProvenance(resolvedSession)"), "tenant session provenance is registered at the session boundary");
assert(resolver.includes("session.membership.status !== \"active\""), "context rejects non-active membership");
assert(resolver.includes("session.membership.userId !== userId"), "context binds membership to user");
assert(resolver.includes("session.membership.tenantId !== tenantId"), "context binds membership to tenant");
assert(resolver.includes("session.externalAuthSubject"), "context requires the authenticated subject");
assert(resolver.includes("Object.freeze"), "context and decisions are immutable");
assert(resolver.includes("requestContextBrand") && resolver.includes("trustedRequestContexts") && resolver.includes("trustedRequestContexts.has(value)"), "plain or spread caller input cannot forge RequestContext");
assert(resolver.includes("record.tenantId !== context.tenantId"), "record tenant must match context");
assert(resolver.includes("record.ownerResolutionStatus !== \"resolved\""), "pending ownership is fail-closed");
assert(resolver.includes("record.currentOwnerUserId"), "current owner is the only runtime owner field");
assert(!resolver.includes("record.userId") && !resolver.includes("record.ownerUserId"), "legacy owners are not runtime fallback");
assert(resolver.includes("record.visibilityScope !== \"private\"") && resolver.includes("record.visibilityScope !== \"company_read\""), "unknown scopes are fail-closed");
assert(resolver.includes('outcome: "owner_write"') && resolver.includes('outcome: "company_read"'), "read/write outcomes are explicit");
assert(tenantSession.includes("externalAuthSubject: string | null"), "trusted session carries auth subject");
assert(tenantSession.includes("externalAuthSubject: clerkSubject"), "subject comes from current auth/session lookup");

for (const source of [memory, postgres]) {
  assert(source.includes("resolveRecordVisibility"), "adapter uses the shared resolver");
  assert(source.includes("resolveClientVisibilityForContext"), "client probe exists");
  assert(source.includes("resolvePropertyVisibilityForContext"), "property probe exists");
  assert(source.includes("resolveCaseVisibilityForContext"), "case probe exists");
}
assert(postgres.includes("withPostgresAuthContext(input.context.externalAuthSubject"), "Postgres binds the real subject");
assert(postgres.includes("withTransaction(async (client)"), "Postgres resolver runs in a scoped transaction");
assert(postgres.includes("tenant_id = $2"), "Postgres resolver constrains the selected tenant");
assert(postgres.includes("visibilityScope: row.visibility_scope") && postgres.includes("ownerResolutionStatus: row.owner_resolution_status"), "Postgres resolver preserves unknown raw policy fields for fail-closed evaluation");
assert(data.includes("resolveClientVisibilityForContext") && data.includes("resolvePropertyVisibilityForContext") && data.includes("resolveCaseVisibilityForContext"), "repository proxy exposes all three probes");

for (const forbidden of ["src/app/clients/page.tsx", "src/app/properties/page.tsx", "src/app/cases/[id]/page.tsx", "src/app/api/hub/search/route.ts"]) {
  assert(!process.env.VISIBILITY_RESOLVER_CHANGED_FILES || !process.env.VISIBILITY_RESOLVER_CHANGED_FILES.includes(forbidden), `no page wiring: ${forbidden}`);
}

console.log("visibility-resolver contract: PASS");
