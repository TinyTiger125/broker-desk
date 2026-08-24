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
const casePage = read("src/app/cases/[id]/page.tsx");
const caseApplicationPage = read("src/app/cases/[id]/guarantee-application/page.tsx");
const organizePage = read("src/app/organize-center/page.tsx");
const organizeBrowser = read("src/components/organize-center-object-browser.tsx");
const actions = read("src/app/actions.ts");
const clientStageRoute = read("src/app/api/clients/[id]/stage/route.ts");
const partiesPage = read("src/app/parties/page.tsx");
const partyEditPage = read("src/app/parties/[id]/edit/page.tsx");
const clientDetailPage = read("src/app/clients/[id]/page.tsx");
const clientEditPage = read("src/app/clients/[id]/edit/page.tsx");
const partyProfile = read("src/components/party-profile-form.tsx");
const hub = read("src/lib/hub.ts");

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
assert(memory.includes("listBrokerageCasesForContext") && memory.includes("getBrokerageCaseByIdForContext"), "memory exposes context-bound case page reads");
assert(postgres.includes("listBrokerageCasesForContext") && postgres.includes("getBrokerageCaseByIdForContext"), "Postgres exposes context-bound case page reads");
assert(data.includes("listBrokerageCasesForContext") && data.includes("getBrokerageCaseByIdForContext"), "repository proxy exposes context-bound case page reads");
assert(organizePage.includes("createRequestContext(session)") && organizePage.includes("listBrokerageCasesForContext"), "case list uses trusted RequestContext resolver");
assert(organizePage.includes("readOnly: item.readOnly") && organizePage.includes('capabilityHasTenantPermission') && organizePage.includes('"record.update"') && organizePage.includes("readOnly: !canWrite") && organizeBrowser.includes("!item.readOnly"), "person list write controls require the record.update capability");
assert(casePage.includes("getBrokerageCaseByIdForContext") && casePage.includes("createRequestContext(session)"), "case detail uses trusted RequestContext resolver");
assert(casePage.includes("caseVisibility.resolution.outcome"), "case detail branches on resolver outcome");
assert(casePage.includes("resolveClientVisibilityForContext") && casePage.includes("resolvePropertyVisibilityForContext"), "case detail rechecks related object visibility");
assert(casePage.includes("primaryPropertyId") && casePage.includes("tenant.name") && casePage.includes('key.startsWith("guarantor.")'), "case detail redacts inaccessible related content and fallback names");
assert(caseApplicationPage.includes("getBrokerageCaseByIdForContext") && caseApplicationPage.includes('!== "owner_write"') && caseApplicationPage.includes("if (inaccessible) notFound()"), "application entry is owner-write only with uniform not-found");
assert(actions.includes("async function requireWritableCase") && actions.includes("resolveCaseVisibilityForContext"), "case write actions re-check owner_write server-side");
assert(memory.includes("listClientsForContext") && memory.includes("getClientDetailForContext"), "memory person reads are context-bound");
assert(postgres.includes("listClientsForContext") && postgres.includes("getClientDetailForContext"), "Postgres person reads are context-bound");
assert(data.includes("listClientsForContext") && data.includes("getClientDetailForContext"), "repository proxy exposes context-bound person reads");
assert(partiesPage.includes("createRequestContext(session)") && partiesPage.includes("requestContext"), "person list uses trusted RequestContext");
assert(partiesPage.includes("party.readOnly") && partiesPage.includes("party.canWrite") && partiesPage.includes('capabilityHasTenantPermission') && partiesPage.includes('"record.update"') && partiesPage.includes("const canWrite = party.canWrite && capabilityCanWrite") && partiesPage.includes('capabilityCanWrite ? <Link') && partiesPage.includes('href="/parties/new"'), "person list create and write controls require capability and resolver");
assert(partyEditPage.includes("getClientDetailForContext") && partyEditPage.includes("!visible.detail"), "person detail uses uniform not-found for denied records");
assert(partyEditPage.includes("PartyProfileReadOnly") && partyEditPage.includes("visible.resolution.canWrite") && partyEditPage.includes("const canEdit = visible.resolution.canWrite && capabilityCanWrite") && partyEditPage.includes('readOnlyReason'), "person detail distinguishes owner read-only from company-read");
assert(clientDetailPage.includes("getClientDetailForContext") && clientDetailPage.includes("createRequestContext(session)") && clientDetailPage.includes("const canEdit = visible.resolution.canWrite && capabilityCanWrite"), "legacy client detail hides write controls without record.update");
assert(clientEditPage.includes("getClientDetailForContext") && clientEditPage.includes("PartyProfileReadOnly") && clientEditPage.includes("visible.resolution.canWrite") && clientEditPage.includes("const canEdit = visible.resolution.canWrite && capabilityCanWrite"), "legacy client edit uses capability-aware read-only shell");
assert(partyProfile.includes("<dl") && partyProfile.includes("<dt") && partyProfile.includes("<dd"), "read-only person details use semantic definition-list markup");
assert(partyProfile.includes("ownerReadOnly") && partyProfile.includes('reason = "company_read"') && partyProfile.includes('reason === "owner_read_only"'), "person read-only reasons remain distinct and localized");
assert(hub.includes("listClientsForContext") && hub.includes("readOnly: !canWrite"), "hub person mapping derives read-only from resolver");
assert(actions.includes("resolveClientVisibilityForContext") && actions.includes("async function ensureClientOwnership(clientId: string, session"), "person write actions require owner resolver context");
assert(actions.includes("resolvePropertyVisibilityForContext") && actions.includes("const requestedPropertyId") && actions.includes("property.resolution.canWrite"), "quotation writes require owner access to referenced properties");
assert(memory.includes("visibleQuotationCount") && postgres.includes("propertyReadable"), "person list counts exclude unreadable referenced quotations");
assert(memory.includes("quotationResults") && postgres.includes("quotationResults"), "person detail drops quotations whose referenced property is unreadable");
assert(memory.includes("currentOwnerUserId === input.userId") && postgres.includes("current_owner_user_id = $2"), "person lifecycle writes use current owner, not legacy owner fallback");
assert(clientStageRoute.includes("resolveClientVisibilityForContext") && clientStageRoute.includes("visibility.resolution.canWrite"), "person stage API requires owner resolver context");

console.log("visibility-resolver contract: PASS");
