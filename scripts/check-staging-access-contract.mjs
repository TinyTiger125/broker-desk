#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataSource = fs.readFileSync(path.resolve(root, "src/lib/data.ts"), "utf8");
const policySource = fs.readFileSync(path.resolve(root, "src/lib/staging-access-policy.ts"), "utf8");
const sessionLookupStart = dataSource.indexOf("const resolveTenantSessionLookupsByExternalAuthSubject = cache");
const sessionLookupEnd = dataSource.indexOf("\n\nconst resolveDefaultUser", sessionLookupStart);
const resolveStart = dataSource.indexOf("const resolveDefaultUser = cache");
const clerkStart = dataSource.indexOf('if (isClerkAuthEnabled()) {', resolveStart);
const resolveEnd = dataSource.indexOf("\n  if (isTrustedHeaderAuthEnabled())", clerkStart);
const clerkBranch = dataSource.slice(clerkStart, resolveEnd);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(sessionLookupStart >= 0 && sessionLookupEnd > sessionLookupStart, "tenant session lookup boundary is missing");
const sessionLookup = dataSource.slice(sessionLookupStart, sessionLookupEnd);
assert(sessionLookup.includes("getClerkAuthIdentity()"), "tenant session lookup must verify the current Clerk identity");
const sessionAllowlistPosition = sessionLookup.indexOf("isStagingAllowlistEnforced()");
for (const laterRead of [
  "repo.listTenantSessionLookupsByExternalAuthSubject(normalized)",
  "repo.getUserByExternalAuthSubject(normalized)",
]) {
  assert(sessionLookup.indexOf(laterRead) > sessionAllowlistPosition, `allowlist guard must precede ${laterRead}`);
}

assert(resolveStart >= 0 && clerkStart > resolveStart && resolveEnd > clerkStart, "Clerk resolver boundary is missing");
assert(clerkBranch.includes("getClerkAuthIdentity()"), "Clerk resolver must obtain the current identity before local access");
assert(clerkBranch.includes("isStagingAllowlistEnforced()"), "Clerk resolver must enforce the staging allowlist");
assert(clerkBranch.includes("isEmailOnStagingAllowlist(identity.email)"), "allowlist must use the authenticated identity email");
const guardPosition = clerkBranch.indexOf("isStagingAllowlistEnforced()");
for (const laterCall of [
  "repo.getUserByExternalAuthSubject(subject)",
  "bindCurrentClerkIdentityToPendingInvitation",
  "repo.ensureUserForExternalAuth(identity)",
]) {
  assert(clerkBranch.indexOf(laterCall) > guardPosition, `allowlist guard must precede ${laterCall}`);
}
assert(policySource.includes('new Set(["preview", "staging"])'), "only preview/staging deployments may enforce the gate");
assert(policySource.includes("entries.length === 0"), "missing allowlist must fail closed");
assert(policySource.includes("entries.some((entry) => !EMAIL_PATTERN.test(entry))"), "malformed allowlist must fail closed");
assert(!dataSource.includes("BROKER_DESK_STAGING_AUTH_ALLOWLIST"), "data resolver must not parse policy configuration itself");
assert(dataSource.includes("createTenantAccountForUser"), "workspace creation must remain behind the authenticated data boundary");

console.log("Staging access contract: PASS");
