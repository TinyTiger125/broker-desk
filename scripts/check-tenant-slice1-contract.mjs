#!/usr/bin/env node
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const cache = new Map();
function resolveAlias(request) {
  if (!request.startsWith("@/lib/")) return null;
  const relative = request.slice("@/lib/".length);
  const candidates = /\.(?:ts|mjs|js|cjs)$/.test(relative)
    ? [path.resolve(`src/lib/${relative}`)]
    : [".ts", ".mjs", ".js", ".cjs"].map((extension) => path.resolve(`src/lib/${relative}${extension}`));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.resolve(`src/lib/${relative}.ts`);
}
function loadTsModule(sourcePath) {
  sourcePath = path.resolve(sourcePath);
  if (cache.has(sourcePath)) return cache.get(sourcePath);
  const source = fs.readFileSync(sourcePath, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const mod = new Module(sourcePath);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(process.cwd());
  const originalRequire = mod.require.bind(mod);
  cache.set(sourcePath, mod.exports);
  mod.require = (request) => {
    const alias = resolveAlias(request);
    return alias ? loadTsModule(alias) : originalRequire(request);
  };
  mod._compile(js, sourcePath);
  cache.set(sourcePath, mod.exports);
  return mod.exports;
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const memory = loadTsModule("src/lib/data.memory.ts");
const bootstrapPolicy = loadTsModule("src/lib/tenant-bootstrap-policy.ts");
const bootstrapMigration = fs.readFileSync(path.resolve("db/migrations/20260819_003_tenant_owner_create_path.sql"), "utf8");
const invitedUserMigration = fs.readFileSync(path.resolve("db/migrations/20260819_004_invited_user_bootstrap.sql"), "utf8");
const pendingInvitationReadMigration = fs.readFileSync(path.resolve("db/migrations/20260819_005_pending_invitations_read_function.sql"), "utf8");
const invitationAcceptanceFixMigration = fs.readFileSync(path.resolve("db/migrations/20260819_006_fix_invitation_acceptance_scope.sql"), "utf8");
const memberLifecycleMigration = fs.readFileSync(path.resolve("db/migrations/20260819_007_tenant_member_lifecycle_functions.sql"), "utf8");
const membershipStateMigration = fs.readFileSync(path.resolve("db/migrations/20260819_008_current_user_membership_state_function.sql"), "utf8");
const ownerLifecycleLockMigration = fs.readFileSync(path.resolve("db/migrations/20260819_009_tenant_owner_lifecycle_lock.sql"), "utf8");
const tenantCreationIdempotencyMigration = fs.readFileSync(path.resolve("db/migrations/20260820_010_tenant_creation_idempotency.sql"), "utf8");
const invitedIdentityBindingMigration = fs.readFileSync(path.resolve("db/migrations/20260820_011_bind_invited_clerk_identity.sql"), "utf8");
const tenantMemberReadMigration = fs.readFileSync(path.resolve("db/migrations/20260820_012_current_tenant_member_read.sql"), "utf8");
const removedInvitationFixMigration = fs.readFileSync(path.resolve("db/migrations/20260821_013_fix_removed_invitation_return.sql"), "utf8");
const postgresSource = fs.readFileSync(path.resolve("src/lib/data.postgres.ts"), "utf8");
const requestScopeQueryExecutor = postgresSource.slice(
  postgresSource.indexOf("async function queryWithinRequestScope"),
  postgresSource.indexOf("function getPool()", postgresSource.indexOf("async function queryWithinRequestScope")),
);
const transactionExecutor = postgresSource.slice(
  postgresSource.indexOf("async function withTransaction"),
  postgresSource.indexOf("function isValidImportStatusTransition", postgresSource.indexOf("async function withTransaction")),
);
const clerkAuthSource = fs.readFileSync(path.resolve("src/lib/clerk-auth.ts"), "utf8");
const createWorkspacePageSource = fs.readFileSync(path.resolve("src/app/workspace/create/page.tsx"), "utf8");
const createWorkspaceFormSource = fs.readFileSync(path.resolve("src/app/workspace/create/create-workspace-form.tsx"), "utf8");
const invitationPageSource = fs.readFileSync(path.resolve("src/app/workspace/invitations/page.tsx"), "utf8");
const acceptInvitationFormSource = fs.readFileSync(path.resolve("src/app/workspace/invitations/accept-invitation-form.tsx"), "utf8");
const membersPageSource = fs.readFileSync(path.resolve("src/app/settings/members/page.tsx"), "utf8");
const dataSource = fs.readFileSync(path.resolve("src/lib/data.ts"), "utf8");
const actionsSource = fs.readFileSync(path.resolve("src/app/actions.ts"), "utf8");
const appNavSource = fs.readFileSync(path.resolve("src/components/app-nav.tsx"), "utf8");
const workspacePageSource = fs.readFileSync(path.resolve("src/app/workspace/page.tsx"), "utf8");
const workspaceSelectorSource = fs.readFileSync(path.resolve("src/app/workspace/workspace-selector.tsx"), "utf8");
const organizeCenterSource = fs.readFileSync(path.resolve("src/app/organize-center/page.tsx"), "utf8");
const workspaceRouteSource = fs.readFileSync(path.resolve("src/app/api/workspace/route.ts"), "utf8");
const workspaceResetSource = fs.readFileSync(path.resolve("src/app/workspace/reset/route.ts"), "utf8");

assert(bootstrapMigration.includes("SECURITY DEFINER"), "tenant bootstrap must use a SECURITY DEFINER function");
assert(bootstrapMigration.includes("brokerdesk_private.current_user_id()"), "tenant bootstrap must bind the current authenticated local user");
assert(bootstrapMigration.includes("app.broker_desk_deployment_env"), "tenant bootstrap status must use the server deployment environment");
assert(!/\bp_status\b/.test(bootstrapMigration), "tenant bootstrap must not accept a caller-selected status");
assert(!bootstrapMigration.includes("rolname = 'authenticated'"), "tenant bootstrap must not grant direct authenticated RPC execution");
assert(tenantCreationIdempotencyMigration.includes("CREATE TABLE IF NOT EXISTS public.tenant_creation_requests"), "tenant creation must persist an idempotency mapping");
assert(tenantCreationIdempotencyMigration.includes("UNIQUE (user_id, idempotency_key)"), "tenant creation idempotency must be scoped to the user and request key");
assert(tenantCreationIdempotencyMigration.includes("request_name TEXT NOT NULL"), "tenant creation mapping must bind the request name");
assert(tenantCreationIdempotencyMigration.includes("account_type TEXT NOT NULL"), "tenant creation mapping must bind the account type");
assert(tenantCreationIdempotencyMigration.includes("ENABLE ROW LEVEL SECURITY"), "tenant creation mapping must remain protected by RLS");
assert(tenantCreationIdempotencyMigration.includes("REVOKE ALL ON TABLE public.tenant_creation_requests FROM PUBLIC"), "tenant creation mapping must not be directly public");
assert(tenantCreationIdempotencyMigration.includes("pg_advisory_xact_lock"), "tenant creation retries must be serialized across processes");
assert(tenantCreationIdempotencyMigration.includes("CREATE OR REPLACE FUNCTION brokerdesk_private.create_tenant_for_current_user("), "tenant creation must retain an explicit compatibility function");
assert(tenantCreationIdempotencyMigration.includes("legacy-"), "legacy tenant creation calls must use a distinct compatibility key");
assert(!tenantCreationIdempotencyMigration.includes("UNIQUE (name)"), "company names must not become globally unique");
assert(postgresSource.includes("brokerdesk_private.create_tenant_for_current_user($1, $2, $3)"), "Postgres adapter must pass the stable idempotency key");
assert(postgresSource.includes("20260820_010_tenant_creation_idempotency.sql"), "required migration list must include tenant creation idempotency");
assert(postgresSource.includes("20260820_011_bind_invited_clerk_identity.sql"), "required migration list must include invited identity binding");
assert(postgresSource.includes("20260820_012_current_tenant_member_read.sql"), "required migration list must include current-tenant member read");
assert(postgresSource.includes("20260821_013_fix_removed_invitation_return.sql"), "required migration list must include removed-invitation return fix");
assert(postgresSource.includes("set_config('app.external_auth_subject', $1, true)"), "Postgres request scope must be transaction-local");
assert(requestScopeQueryExecutor.indexOf('client.query("BEGIN")') < requestScopeQueryExecutor.indexOf("applyRequestScope(client)"), "scoped Pool.query must begin before applying the Clerk subject");
assert(requestScopeQueryExecutor.includes('client.query("COMMIT")'), "scoped Pool.query must commit the business query transaction");
assert(requestScopeQueryExecutor.includes('client.query("ROLLBACK")'), "scoped Pool.query must roll back failed business queries");
assert(transactionExecutor.indexOf('client.query("BEGIN")') < transactionExecutor.indexOf("applyRequestScope(client)"), "withTransaction must begin before applying the Clerk subject");
assert(transactionExecutor.includes('client.query("COMMIT")'), "withTransaction must commit after the business operation");
assert(transactionExecutor.includes('client.query("ROLLBACK")'), "withTransaction must roll back failed business operations");
assert(!postgresSource.includes("clearRequestScope"), "transaction-local request scope must not rely on an out-of-transaction reset");
assert(createWorkspacePageSource.includes("requestId"), "workspace creation must preserve the request key across reloads");
assert(createWorkspaceFormSource.includes("useActionState"), "workspace creation must expose structured retry state");
assert(createWorkspaceFormSource.includes("disabled={pending}"), "workspace creation must disable duplicate submission while pending");
assert(createWorkspaceFormSource.includes("history.replaceState"), "workspace creation must persist the request key in browser history");
assert(createWorkspaceFormSource.includes("resetRequestKey"), "a changed request must receive a new client operation key");
assert(createWorkspaceFormSource.includes("navigation?.type === \"reload\""), "only a page reload may reuse a request key from the URL");
assert(invitedUserMigration.includes("create_tenant_invitation"), "invite bootstrap migration must define the restricted atomic function");
assert(invitedUserMigration.includes("SECURITY DEFINER"), "invite user bootstrap must use a SECURITY DEFINER function");
assert(invitedUserMigration.includes("ON CONFLICT (email) DO NOTHING"), "invite user bootstrap must be idempotent by email");
assert(invitedUserMigration.includes("external_auth_subject"), "invite user bootstrap must preserve external identity binding");
assert(invitedUserMigration.includes("current_actor_id <> normalized_actor_id"), "invite bootstrap must bind the actor to the authenticated user");
assert(invitedUserMigration.includes("member invite permission required"), "invite bootstrap must enforce company invite permission");
assert(invitedUserMigration.includes("refresh_tenant_invitation"), "invite migration must define a restricted refresh function");
assert(invitedUserMigration.includes("record_tenant_invitation_delivery"), "invite migration must define a restricted delivery-state function");
assert(invitedUserMigration.includes("accept_tenant_invitation"), "invite migration must define a restricted acceptance function");
assert(!invitedUserMigration.includes("rolname = 'authenticated'"), "invite user bootstrap must not grant authenticated RPC execution");
assert(pendingInvitationReadMigration.includes("list_pending_tenant_invitations_for_current_user"), "pending invitation read migration must define the current-user function");
assert(pendingInvitationReadMigration.includes("SECURITY DEFINER"), "pending invitation read must bypass membership RLS through a definer function");
assert(pendingInvitationReadMigration.includes("brokerdesk_private.current_user_id()"), "pending invitation read must bind to the current local user");
assert(pendingInvitationReadMigration.includes("memberships.status = 'invited'"), "pending invitation read must restrict invited memberships");
assert(pendingInvitationReadMigration.includes("memberships.invitation_status = 'pending'"), "pending invitation read must restrict pending invitations");
assert(pendingInvitationReadMigration.includes("invitation_expires_at IS NULL OR memberships.invitation_expires_at > NOW()"), "pending invitation read must exclude expired invitations");
assert(pendingInvitationReadMigration.includes("tenants.status IN ('trial', 'active')"), "pending invitation read must exclude unavailable tenants");
assert(!pendingInvitationReadMigration.includes("rolname = 'authenticated'"), "pending invitation read must not grant authenticated RPC execution");
assert(pendingInvitationReadMigration.includes("GRANT EXECUTE ON FUNCTION brokerdesk_private.list_pending_tenant_invitations_for_current_user() TO brokerdesk_runtime"), "pending invitation read must grant only the runtime role");
assert(invitationAcceptanceFixMigration.includes("CREATE OR REPLACE FUNCTION brokerdesk_private.accept_tenant_invitation"), "invitation acceptance fix must replace the existing function without editing migration 004");
assert(invitationAcceptanceFixMigration.includes("memberships.invitation_expires_at IS NULL OR memberships.invitation_expires_at > NOW()"), "invitation acceptance fix must qualify the expiry column");
assert(invitationAcceptanceFixMigration.includes("expires_at_value"), "invitation acceptance fix must avoid ambiguous expiry variable names");
assert(!invitationAcceptanceFixMigration.includes("rolname = 'authenticated'"), "invitation acceptance fix must not grant authenticated RPC execution");
assert(invitationAcceptanceFixMigration.includes("GRANT EXECUTE ON FUNCTION brokerdesk_private.accept_tenant_invitation(TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime"), "invitation acceptance fix must preserve the runtime grant");
assert(memberLifecycleMigration.includes("update_tenant_member_capability"), "member lifecycle migration must define capability updates");
assert(memberLifecycleMigration.includes("update_tenant_member_status"), "member lifecycle migration must define status updates");
assert(memberLifecycleMigration.includes("SECURITY DEFINER"), "member lifecycle writes must use restricted definer functions");
assert(memberLifecycleMigration.includes("actor_membership.capability = 'company_owner'"), "member lifecycle writes must require explicit company owner capability");
assert(memberLifecycleMigration.includes("target_status = 'invited' AND p_status = 'active'"), "invited memberships must not be activated by status updates");
assert(memberLifecycleMigration.includes("target_status = 'removed' AND p_status = 'active'"), "removed memberships must not be reactivated by status updates");
assert(memberLifecycleMigration.includes("target_role = 'tenant_owner'"), "member lifecycle writes must protect the last company owner");
assert(actionsSource.includes("confirmSelfDemotion"), "self owner demotion must require an explicit server-checked confirmation");
assert(actionsSource.includes("nextCapability") && actionsSource.includes('member.capability === "company_owner"'), "last owner guard must use role and capability together");
assert(actionsSource.includes("last_owner_protected"), "last owner rejection must return a user-understandable result");
assert(membersPageSource.includes("activeOwnerCount"), "members page must calculate active owners before rendering role controls");
assert(membersPageSource.includes("isActiveCompanyOwner"), "members page owner counting must use role and capability together");
assert(membersPageSource.includes("member.user.id === session.user.id"), "current member detection must remain bound to the authenticated local user");
assert(membersPageSource.includes("soleOwnerLocked"), "last owner role controls must be visibly locked");
assert(membersPageSource.includes('name="confirmSelfDemotion"') && membersPageSource.includes("required"), "self owner demotion must expose a required second confirmation");
assert(memberLifecycleMigration.includes("GRANT EXECUTE ON FUNCTION brokerdesk_private.update_tenant_member_capability(TEXT, TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime"), "capability lifecycle function must be runtime-only");
assert(memberLifecycleMigration.includes("GRANT EXECUTE ON FUNCTION brokerdesk_private.update_tenant_member_status(TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime"), "status lifecycle function must be runtime-only");
assert(membershipStateMigration.includes("list_tenant_session_lookups_for_current_user"), "membership state migration must define a current-user-only lookup function");
assert(membershipStateMigration.includes("memberships.user_id = users.id"), "membership state lookup must join membership to the bound user");
assert(membershipStateMigration.includes("current_external_auth_subject()"), "membership state lookup must bind to the current Clerk subject");
assert(!membershipStateMigration.includes("rolname = 'authenticated'"), "membership state lookup must not grant authenticated RPC execution");
assert(postgresSource.includes("brokerdesk_private.list_tenant_session_lookups_for_current_user()"), "Postgres session lookup must use the restricted membership state function");
const postgresSessionLookupFunction = postgresSource.slice(
  postgresSource.indexOf("export const listTenantSessionLookupsByExternalAuthSubject"),
  postgresSource.indexOf("export async function getTenantMembership", postgresSource.indexOf("export const listTenantSessionLookupsByExternalAuthSubject")),
);
assert(postgresSessionLookupFunction.includes("withPostgresAuthContext(normalized"), "Postgres session lookup must bind the supplied Clerk subject at its adapter boundary");
assert(ownerLifecycleLockMigration.includes("pg_advisory_xact_lock(hashtextextended(COALESCE(p_tenant_id, ''), 0))"), "owner lifecycle writes must serialize per tenant");
assert(ownerLifecycleLockMigration.includes("actor_membership.capability = 'company_owner'"), "owner lifecycle lock must preserve explicit capability authorization");
assert(ownerLifecycleLockMigration.includes("target_status = 'invited' AND p_status = 'active'"), "locked status path must reject invited activation");
assert(ownerLifecycleLockMigration.includes("target_status = 'removed' AND p_status = 'active'"), "locked status path must reject removed reactivation");
assert(membersPageSource.includes("if (!canManageMembers)"), "member management page must return an explicit no-permission state before loading member data");
assert(membersPageSource.includes("member_invited_pending"), "member management page must explain a created but not provider-sent invitation");
assert(membersPageSource.includes("member_invitation_failed"), "member management page must explain invitation delivery failure");
assert(membersPageSource.includes('canRemove && (member.status === "active" || member.status === "suspended")'), "removed members must not expose a direct reactivation action");
assert(membersPageSource.includes('member.status === "removed" ? ('), "removed members must expose a read-only capability state");
assert(actionsSource.includes("invitation.sent ? \"member_invited\""), "member invite action must report provider delivery success separately");
assert(actionsSource.includes("invitation.skipped ? \"member_invited_pending\" : \"member_invitation_failed\""), "member invite action must report pending and failed delivery states");
assert(actionsSource.includes("invitation.sent ? \"invitation_sent\""), "member resend action must report provider delivery success separately");
assert(actionsSource.includes("invitation.sent ? \"invitation_sent\" : \"invitation_failed\""), "member resend must report skipped provider delivery as failed when persistence marks it failed");
assert(membersPageSource.includes("feedbackPending"), "member pending feedback must use a neutral state presentation");
const membersReadBoundary = membersPageSource.slice(0, membersPageSource.indexOf("const members = await listTenantMembers"));
assert(membersReadBoundary.includes("requireTenantReadOnlySession()"), "member management page must establish session without broad read permission");
assert(membersPageSource.includes("listTenantMembersForAuthenticatedTenant"), "member management page must read with the established authenticated session identity");
assert(membersPageSource.includes("membersLoadFailed"), "member management page must expose a retryable member-read failure state");
const tenantSessionSource = fs.readFileSync(path.resolve("src/lib/tenant-session.ts"), "utf8");
assert(membersPageSource.includes('error.code === "tenant_selection_required"'), "member management page must redirect only the explicit workspace-selection state");
assert(tenantSessionSource.includes('"tenant_selection_required"'), "tenant session must distinguish missing selection from forbidden tenant access");
assert(tenantSessionSource.includes('An active tenant must be selected.", "tenant_selection_required"'), "multiple active memberships without a selection must use the selection-required state");
assert(membersPageSource.includes('redirect("/workspace")'), "member management page must return multi-tenant users to the canonical workspace selector");
assert(dataSource.includes("postgres.withPostgresAuthContext(subject"), "authenticated member read must bind the established Clerk subject at the adapter boundary");
assert(appNavSource.includes("link.href !== \"/settings/members\" || canManageMembers"), "member management navigation must be hidden without member-management capability");
assert(workspacePageSource.includes("listTenantSessionLookupsByExternalAuthSubject"), "workspace page must use current Clerk subject membership state lookup");
assert(workspacePageSource.includes("sessionLookups.map((lookup) => lookup.membership)"), "workspace page must derive status branches from current subject memberships");
assert(workspacePageSource.includes("sessionLookups[0]?.user"), "workspace page must prefer the user returned by the current-subject lookup");
assert(workspacePageSource.includes("sessionLookupFailed"), "workspace page must expose a retryable current-subject lookup failure state");
assert(workspaceSelectorSource.includes("new AbortController()"), "workspace selection must fail visibly instead of waiting forever");
assert(workspaceSelectorSource.includes("pendingRef.current = true"), "workspace selection must remain an explicit user action");
assert(!workspaceSelectorSource.includes("items.length === 1 && !error"), "single-workspace selection must not auto-enter");
assert(workspaceSelectorSource.includes("items.map"), "workspace selection must render the current user's verified workspace cards");
assert(workspaceSelectorSource.includes('role="alert"'), "workspace selection failures must be announced and retryable");
assert(workspaceSelectorSource.includes('credentials: "include"'), "workspace selection must include the current Clerk session when persisting the tenant cookie");
assert(workspaceSelectorSource.includes('cache: "no-store"'), "workspace selection must not reuse a stale selection response");
assert(workspaceSelectorSource.includes("await response.json()"), "workspace selection must consume the response before navigating so Set-Cookie is committed");
assert(workspaceSelectorSource.includes("window.location.replace(returnTo)"), "workspace selection must return to the requested page after persisting the cookie");
assert(workspaceSelectorSource.includes("returnTo?: string"), "workspace selection return path must be explicit");
assert(workspacePageSource.includes("safeWorkspaceReturnTo"), "workspace return paths must be same-origin and constrained");
assert(workspacePageSource.includes("selectionRequiredTitle"), "workspace selector must explain a missing current company context");
assert(organizeCenterSource.includes('error.code === "tenant_selection_required"') && organizeCenterSource.includes('encodeURIComponent(buildListHref'), "organize center must return to workspace selection and preserve the requested page");
assert(workspaceRouteSource.includes("shouldUseSecureCookie(request)"), "workspace cookie security must follow the request transport, not NODE_ENV alone");
assert(workspaceResetSource.includes("shouldUseSecureCookie(request)"), "workspace reset must use the same request-aware cookie security");
assert(workspaceRouteSource.includes("requireTenantSession"), "workspace selection must use the canonical current-identity tenant session resolver");
assert(workspaceRouteSource.includes("requestedTenantId: tenantId"), "workspace selection must validate the requested tenant against the current identity");
assert(workspaceRouteSource.includes("TenantSessionError"), "workspace selection must expose canonical session errors without swallowing them");
assert(!workspaceRouteSource.includes("getDefaultUser"), "workspace selection must not resolve membership through a default user shortcut");
assert(!workspaceRouteSource.includes("listTenantMemberships"), "workspace selection must not use a divergent user-id membership lookup");
assert(postgresSource.includes("brokerdesk_private.update_tenant_member_capability($1, $2, $3, $4, $5)"), "Postgres role path must use the restricted capability function");
assert(postgresSource.includes("brokerdesk_private.update_tenant_member_status($1, $2, $3, $4)"), "Postgres status path must use the restricted lifecycle function");
const postgresRoleFunction = postgresSource.slice(
  postgresSource.indexOf("export async function updateTenantMemberRole"),
  postgresSource.indexOf("export async function updateTenantMemberStatus", postgresSource.indexOf("export async function updateTenantMemberRole")),
);
assert(!postgresRoleFunction.includes("UPDATE tenant_memberships"), "Postgres role path must not bypass the lifecycle function with direct RLS update");
const postgresStatusFunction = postgresSource.slice(
  postgresSource.indexOf("export async function updateTenantMemberStatus"),
  postgresSource.indexOf("export async function listCaseWorkbenchFieldRules", postgresSource.indexOf("export async function updateTenantMemberStatus")),
);
assert(!postgresStatusFunction.includes("UPDATE tenant_memberships"), "Postgres status path must not bypass the lifecycle function with direct RLS update");
assert(postgresStatusFunction.includes("listTenantMembers(scopeTenantId)"), "Postgres status path must capture the target user before RLS can hide a suspended member");
assert(!postgresStatusFunction.includes('SELECT * FROM users WHERE id = $1 LIMIT 1'), "Postgres status path must not reread a suspended user through ordinary RLS after updating");
assert(postgresSource.includes("brokerdesk_private.create_tenant_invitation($1, $2, $3, $4, $5, $6)"), "Postgres invite path must call the restricted atomic function");
assert(removedInvitationFixMigration.includes("memberships.status = 'invited'"), "removed-member re-invite must return only the new invited membership");
assert(removedInvitationFixMigration.includes("WHEN 'removed' THEN 3"), "removed-member re-invite must rank historical removed rows after usable memberships");
assert(removedInvitationFixMigration.includes("CREATE OR REPLACE FUNCTION brokerdesk_private.create_tenant_invitation"), "removed-member re-invite must use an append-only function replacement");
assert(postgresSource.includes("brokerdesk_private.prepare_tenant_invitation_delivery($1, $2, $3, $4)"), "Postgres refresh path must call the restricted delivery-preparation function");
assert(postgresSource.includes("brokerdesk_private.record_tenant_invitation_delivery("), "Postgres delivery path must call the restricted function");
assert(postgresSource.includes("brokerdesk_private.accept_tenant_invitation($1, $2, $3, $4)"), "Postgres acceptance path must call the restricted function");
assert(postgresSource.includes("brokerdesk_private.list_pending_tenant_invitations_for_current_user()"), "Postgres pending invitation path must call the current-user function");
assert(postgresSource.includes("brokerdesk_private.bind_current_clerk_identity_to_pending_invitation($1, $2, $3)"), "Postgres Clerk invite binding must use the restricted current-identity function");
assert(clerkAuthSource.includes("getVerifiedClerkAuthIdentity"), "invitation binding must use a dedicated verified Clerk identity helper");
assert(clerkAuthSource.includes('item?.verification?.status === "verified"'), "invitation binding must require Clerk email verification");
assert(fs.readFileSync(path.resolve("src/lib/data.ts"), "utf8").includes("getVerifiedClerkAuthIdentity"), "default user resolution must use the verified invitation identity");
const acceptInvitationActionSource = actionsSource.slice(actionsSource.indexOf("export async function acceptTenantInvitationAction"));
assert(acceptInvitationActionSource.includes("getVerifiedClerkAuthIdentity"), "invitation acceptance must use the verified Clerk identity helper");
assert(!acceptInvitationActionSource.includes("getClerkAuthIdentity()"), "invitation acceptance must not fall back to an unverified Clerk email");
assert(acceptInvitationActionSource.includes("TenantInvitationActionState"), "invitation acceptance must expose structured UI state");
assert(acceptInvitationActionSource.includes('return { status: "error"'), "invitation acceptance failures must return visible structured errors");
assert(acceptInvitationActionSource.includes("try {"), "invitation acceptance must catch retryable server failures");
assert(acceptInvitationFormSource.includes("useActionState"), "invitation acceptance UI must use the server action state contract");
assert(acceptInvitationFormSource.includes('role="alert"'), "invitation acceptance UI must expose errors to assistive technology");
assert(acceptInvitationFormSource.includes("disabled={pending}"), "invitation acceptance UI must prevent duplicate submissions while pending");
assert(invitationPageSource.includes("AcceptInvitationForm"), "invitation page must render the retryable acceptance form");
assert(postgresSource.includes("42883"), "Postgres invite binding must fail closed when the append-only function is not applied");
assert(invitedIdentityBindingMigration.includes("SECURITY DEFINER"), "invited identity binding must use a restricted definer function");
assert(invitedIdentityBindingMigration.includes("current_external_auth_subject"), "invited identity binding must verify the request-scoped Clerk subject");
assert(invitedIdentityBindingMigration.includes("configured_subject IS NULL OR configured_subject <> normalized_subject"), "invited identity binding must fail closed without a request-scoped Clerk subject");
assert(invitedIdentityBindingMigration.includes("memberships.status = 'invited'"), "invited identity binding must require an invited membership");
assert(invitedIdentityBindingMigration.includes("memberships.invitation_status = 'pending'"), "invited identity binding must require a pending invitation");
assert(invitedIdentityBindingMigration.includes("memberships.invitation_expires_at IS NULL OR memberships.invitation_expires_at > NOW()"), "invited identity binding must reject expired invitations");
assert(invitedIdentityBindingMigration.includes("users.external_auth_subject IS NULL"), "invited identity binding must not overwrite a bound user");
assert(invitedIdentityBindingMigration.includes("pg_advisory_xact_lock(hashtextextended(normalized_email, 0))"), "invited identity binding must serialize same-email races");
assert(invitedIdentityBindingMigration.includes("GRANT EXECUTE ON FUNCTION brokerdesk_private.bind_current_clerk_identity_to_pending_invitation(TEXT, TEXT, TEXT) TO brokerdesk_runtime"), "invited identity binding must be runtime-only");
assert(postgresSource.includes("getAuthenticatedInvitationActorId"), "Postgres invitation writes must derive the actor from the authenticated database identity");
assert(postgresSource.includes("brokerdesk_private.current_user_id() AS user_id"), "Postgres invitation actor resolution must use the current Clerk-bound database user");
const pendingInvitationFunction = postgresSource.slice(
  postgresSource.indexOf("export async function listPendingTenantInvitations"),
  postgresSource.indexOf("export async function acceptTenantInvitation", postgresSource.indexOf("export async function listPendingTenantInvitations")),
);
assert(!pendingInvitationFunction.includes("FROM tenant_memberships"), "Postgres pending invitation path must not rely on RLS-filtered direct membership reads");
assert(invitationPageSource.includes("invitation.tenantName"), "invitation page must render the tenant name returned by the scoped invitation read");
const inviteTenantFunction = postgresSource.slice(
  postgresSource.indexOf("export async function inviteTenantMember"),
  postgresSource.indexOf("export async function updateTenantMemberRole", postgresSource.indexOf("export async function inviteTenantMember")),
);
assert(!inviteTenantFunction.includes("INSERT INTO users"), "Postgres invite path must not directly insert users");
assert(!inviteTenantFunction.includes("INSERT INTO tenant_memberships"), "Postgres invite path must not directly insert memberships");
assert(inviteTenantFunction.includes("getAuthenticatedInvitationActorId(input.invitedByUserId)"), "Postgres invite path must not trust the supplied actor id");
const refreshTenantFunction = postgresSource.slice(
  postgresSource.indexOf("export async function refreshTenantMemberInvitation"),
  postgresSource.indexOf("export async function inviteTenantMember", postgresSource.indexOf("export async function refreshTenantMemberInvitation")),
);
assert(!refreshTenantFunction.includes("UPDATE tenant_memberships"), "Postgres refresh path must not directly update memberships");
assert(refreshTenantFunction.includes("getAuthenticatedInvitationActorId(input.invitedByUserId)"), "Postgres refresh path must use the authenticated actor id");
const updateInvitationFunction = postgresSource.slice(
  postgresSource.indexOf("export async function updateTenantMemberInvitation"),
  postgresSource.indexOf("export async function refreshTenantMemberInvitation", postgresSource.indexOf("export async function updateTenantMemberInvitation")),
);
assert(!updateInvitationFunction.includes("UPDATE tenant_memberships"), "Postgres delivery path must not directly update memberships");
assert(updateInvitationFunction.includes("getAuthenticatedInvitationActorId(input.actorUserId)"), "Postgres delivery path must use the authenticated actor id");
const acceptInvitationFunction = postgresSource.slice(
  postgresSource.indexOf("export async function acceptTenantInvitation"),
  postgresSource.indexOf("export const listTenantSessionLookupsByExternalAuthSubject", postgresSource.indexOf("export async function acceptTenantInvitation")),
);
assert(!acceptInvitationFunction.includes("UPDATE tenant_memberships"), "Postgres acceptance path must not directly update memberships");
const createTenantFunction = postgresSource.slice(
  postgresSource.indexOf("export async function createTenantAccountForUser"),
  postgresSource.indexOf("export async function listTenantMemberships", postgresSource.indexOf("export async function createTenantAccountForUser")),
);
assert(!createTenantFunction.includes("INSERT INTO tenants"), "Postgres adapter must not bypass the owner bootstrap function with a direct tenant insert");
const listTenantMembersFunction = postgresSource.slice(
  postgresSource.indexOf("export async function listTenantMembers("),
  postgresSource.indexOf("export async function getTenantMemberById(", postgresSource.indexOf("export async function listTenantMembers(")),
);
assert(listTenantMembersFunction.includes("brokerdesk_private.list_tenant_members_for_current_tenant($1)"), "Postgres member list must use the current-identity restricted read function");
assert(!listTenantMembersFunction.includes("FROM tenant_memberships"), "Postgres member list must not directly read tenant membership tables");
assert(tenantMemberReadMigration.includes("SECURITY DEFINER"), "member list read must use a restricted definer function");
assert(tenantMemberReadMigration.includes("brokerdesk_private.current_user_id()"), "member list read must bind to the current Clerk identity");
assert(tenantMemberReadMigration.includes("actor_membership.capability = 'company_owner'"), "member list read must require company owner capability");
assert(tenantMemberReadMigration.includes("memberships.tenant_id = NULLIF(trim(COALESCE(p_tenant_id, '')), '')"), "member list read must scope to the requested tenant");
assert(tenantMemberReadMigration.includes("GRANT EXECUTE ON FUNCTION brokerdesk_private.list_tenant_members_for_current_tenant(TEXT) TO brokerdesk_runtime"), "member list read must grant only the runtime role");

const previousDeployment = process.env.BROKER_DESK_DEPLOYMENT_ENV;
process.env.BROKER_DESK_DEPLOYMENT_ENV = "preview";
assert(bootstrapPolicy.getTenantBootstrapStatus() === "active", "preview bootstrap should create an active non-production tenant");
process.env.BROKER_DESK_DEPLOYMENT_ENV = "production";
assert(bootstrapPolicy.getTenantBootstrapStatus() === "pending_activation", "production bootstrap must remain pending activation");
if (previousDeployment == null) delete process.env.BROKER_DESK_DEPLOYMENT_ENV;
else process.env.BROKER_DESK_DEPLOYMENT_ENV = previousDeployment;

const owner = await memory.ensureUserForExternalAuth({
  subject: `slice1-owner-${Date.now()}`,
  email: `slice1-owner-${Date.now()}@example.test`,
  name: "Slice 1 Owner",
});
assert(owner, "owner identity should be provisioned");
const creationName = `Slice 1 Company ${Date.now()}`;
const creationKey = `slice1-create-${Date.now()}`;
const created = await memory.createTenantAccountForUser({ userId: owner.id, name: creationName, idempotencyKey: creationKey });
assert(created.membership.status === "active", "company creation must create an active owner membership");
assert(created.membership.role === "tenant_owner", "company creator must become tenant_owner");

const retried = await memory.createTenantAccountForUser({ userId: owner.id, name: creationName, idempotencyKey: creationKey });
assert(retried.tenant.id === created.tenant.id, "retrying the same creation key must return the original tenant");
assert(retried.membership.id === created.membership.id, "retrying the same creation key must return the original owner membership");
const sameKeyConcurrent = await Promise.all(
  Array.from({ length: 4 }, () => memory.createTenantAccountForUser({ userId: owner.id, name: creationName, idempotencyKey: creationKey })),
);
assert(new Set(sameKeyConcurrent.map((result) => result.tenant.id)).size === 1, "parallel memory-adapter calls must converge on one tenant");
let keyReuseRejected = false;
try {
  await memory.createTenantAccountForUser({ userId: owner.id, name: `${creationName} changed`, idempotencyKey: creationKey });
} catch (error) {
  keyReuseRejected = error instanceof Error && error.message.includes("idempotency key was reused");
}
assert(keyReuseRejected, "reusing a key with changed request data must be rejected");
const sameNameDifferentKey = await memory.createTenantAccountForUser({
  userId: owner.id,
  name: creationName,
  idempotencyKey: `${creationKey}-different`,
});
assert(sameNameDifferentKey.tenant.id !== created.tenant.id, "a different idempotency key may create another same-name company");
let failedCreationRejected = false;
try {
  await memory.createTenantAccountForUser({ userId: owner.id, name: "", idempotencyKey: `${creationKey}-failed` });
} catch (error) {
  failedCreationRejected = error instanceof Error && error.message === "tenant name is required";
}
assert(failedCreationRejected, "invalid company creation must fail before persistence");
const retriedAfterFailure = await memory.createTenantAccountForUser({
  userId: owner.id,
  name: `${creationName} retry`,
  idempotencyKey: `${creationKey}-failed`,
});
assert(retriedAfterFailure.membership.status === "active", "a failed creation key must remain safely retryable");

const invited = await memory.inviteTenantMember({
  tenantId: created.tenant.id,
  name: "Slice 1 Member",
  email: `slice1-member-${Date.now()}@example.test`,
  role: "broker",
  status: "invited",
  capability: "ordinary_member",
  invitedByUserId: owner.id,
});
await memory.updateTenantMemberInvitation({
  tenantId: created.tenant.id,
  membershipId: invited.id,
  invitationProvider: "manual",
  invitationStatus: "pending",
  sentAt: new Date(),
});
assert(
  (await memory.bindCurrentClerkIdentityToPendingInvitation({ subject: `slice1-wrong-email-${Date.now()}`, email: `wrong-${Date.now()}@example.test` })) === null,
  "an identity with a different email must not bind to an invitation",
);
const invitedSubject = `slice1-member-${Date.now()}`;
const member = await memory.bindCurrentClerkIdentityToPendingInvitation({ subject: invitedSubject, email: invited.user.email, name: invited.user.name });
assert(member, "invited identity should bind to the invited local user");
assert(member.externalAuthSubject === invitedSubject, "pending invitation binding should persist the current Clerk subject");
const overwritten = await memory.bindCurrentClerkIdentityToPendingInvitation({ subject: `${invitedSubject}-other`, email: invited.user.email, name: invited.user.name });
assert(overwritten === null, "a different Clerk subject must not overwrite a bound invited user");
const pendingInvitations = await memory.listPendingTenantInvitations(member.id);
assert(pendingInvitations.some((item) => item.id === invited.id), "invited user should see their own pending invitation");
assert(pendingInvitations.find((item) => item.id === invited.id)?.tenantName === created.tenant.name, "pending invitation should include its tenant name without tenant membership access");
const stillPending = await memory.getTenantMembership({ userId: member.id, tenantId: created.tenant.id });
assert(stillPending?.status === "invited", "binding an identity must not auto-accept an invitation");
const accepted = await memory.acceptTenantInvitation({
  userId: member.id,
  tenantId: created.tenant.id,
  membershipId: invited.id,
  invitationToken: invited.invitationToken,
});
assert(accepted?.status === "active" && accepted.invitationStatus === "accepted", "explicit matching acceptance should activate membership");
const activeMemberLookups = await memory.listTenantSessionLookupsByExternalAuthSubject(invitedSubject);
assert(activeMemberLookups.length === 1, "an accepted Clerk subject must resolve its active workspace membership");
assert(activeMemberLookups[0].membership.status === "active", "subject workspace lookup must return the active membership state");
assert(activeMemberLookups[0].tenant.id === created.tenant.id, "subject workspace lookup must return the invited company only");
assert(
  (await memory.acceptTenantInvitation({
    userId: member.id,
    tenantId: created.tenant.id,
    membershipId: invited.id,
    invitationToken: invited.invitationToken,
  })) === null,
  "a second acceptance must not create or alter another membership",
);

const activeMember = await memory.inviteTenantMember({
  tenantId: created.tenant.id,
  name: "Active Member",
  email: `slice1-active-${Date.now()}@example.test`,
  role: "broker",
  status: "active",
});
let activeDowngradeRejected = false;
try {
  await memory.inviteTenantMember({
    tenantId: created.tenant.id,
    name: activeMember.user.name,
    email: activeMember.user.email,
    role: "broker",
    status: "invited",
  });
} catch {
  activeDowngradeRejected = true;
}
assert(activeDowngradeRejected, "re-inviting an active member must not downgrade it to invited");

const other = await memory.ensureUserForExternalAuth({ subject: `slice1-other-${Date.now()}`, email: `other-${Date.now()}@example.test` });
assert(other, "second identity should be provisioned");
const rejected = await memory.acceptTenantInvitation({
  userId: other.id,
  tenantId: created.tenant.id,
  membershipId: invited.id,
  invitationToken: invited.invitationToken,
});
assert(rejected === null, "a different identity must not accept another user's invitation");

assert(created.membership.capability === "company_owner", "owner capability must be persisted");
assert(invited.capability === "ordinary_member", "ordinary member capability must be persisted");
assert(memory.capabilityHasTenantPermission("company_owner", "member.invite"), "owner capability must invite");
assert(!memory.capabilityHasTenantPermission("ordinary_member", "member.invite"), "ordinary member must not invite");
const ownerMembers = await memory.listTenantMembers(created.tenant.id);
assert(ownerMembers.some((item) => item.id === created.membership.id), "company owner must read the current company's member list");

const expiring = await memory.inviteTenantMember({
  tenantId: created.tenant.id,
  name: "Expiring Member",
  email: `slice1-expiring-${Date.now()}@example.test`,
  role: "broker",
  status: "invited",
  capability: "ordinary_member",
});
await memory.updateTenantMemberInvitation({
  tenantId: created.tenant.id,
  membershipId: expiring.id,
  invitationProvider: "manual",
  invitationStatus: "pending",
  expiresAt: new Date(Date.now() - 1),
});
assert(
  (await memory.bindCurrentClerkIdentityToPendingInvitation({ subject: `slice1-expiring-${Date.now()}`, email: expiring.user.email })) === null,
  "expired invitations must not bind a Clerk identity",
);
assert(
  (await memory.acceptTenantInvitation({
    userId: expiring.userId,
    tenantId: created.tenant.id,
    membershipId: expiring.id,
    invitationToken: expiring.invitationToken,
  })) === null,
  "expired invitation must be rejected",
);
assert((await memory.getTenantMembership({ userId: expiring.userId, tenantId: created.tenant.id }))?.invitationStatus === "expired", "expired invitation state must persist");

const revoked = await memory.inviteTenantMember({
  tenantId: created.tenant.id,
  name: "Revoked Member",
  email: `slice1-revoked-${Date.now()}@example.test`,
  role: "broker",
  status: "invited",
  capability: "ordinary_member",
});
await memory.updateTenantMemberInvitation({
  tenantId: created.tenant.id,
  membershipId: revoked.id,
  invitationProvider: "manual",
  invitationStatus: "revoked",
});
assert(
  (await memory.bindCurrentClerkIdentityToPendingInvitation({ subject: `slice1-revoked-${Date.now()}`, email: revoked.user.email })) === null,
  "revoked invitations must not bind a Clerk identity",
);
assert(
  (await memory.acceptTenantInvitation({ userId: revoked.userId, tenantId: created.tenant.id, membershipId: revoked.id, invitationToken: revoked.invitationToken })) === null,
  "revoked invitation must be rejected",
);

let directAcceptRejected = false;
try {
  await memory.updateTenantMemberStatus({ tenantId: created.tenant.id, membershipId: revoked.id, status: "active" });
} catch {
  directAcceptRejected = true;
}
assert(directAcceptRejected, "invited membership must not be activated by a status action");

await memory.updateTenantMemberStatus({ tenantId: created.tenant.id, membershipId: activeMember.id, status: "suspended" });
const resumed = await memory.updateTenantMemberStatus({ tenantId: created.tenant.id, membershipId: activeMember.id, status: "active" });
assert(resumed?.status === "active", "suspended membership should be recoverable");
await memory.updateTenantMemberStatus({ tenantId: created.tenant.id, membershipId: activeMember.id, status: "removed" });
let removedReactivationRejected = false;
try {
  await memory.updateTenantMemberStatus({ tenantId: created.tenant.id, membershipId: activeMember.id, status: "active" });
} catch {
  removedReactivationRejected = true;
}
assert(removedReactivationRejected, "removed membership must require a new invitation");
const replacement = await memory.inviteTenantMember({
  tenantId: created.tenant.id,
  name: activeMember.user.name,
  email: activeMember.user.email,
  role: "broker",
  status: "invited",
  capability: "ordinary_member",
});
assert(replacement.id !== activeMember.id && replacement.status === "invited", "removed membership must be replaced by a new invitation");
console.log("[PASS] TASK-039 Slice 1 memory identity, invitation, and capability contract");
