import { readFile } from "node:fs/promises";

const provider = await readFile(new URL("../src/lib/auth-provider.ts", import.meta.url), "utf8");
const data = await readFile(new URL("../src/lib/data.ts", import.meta.url), "utf8");
const tenantSession = await readFile(new URL("../src/lib/tenant-session.ts", import.meta.url), "utf8");
const workspace = await readFile(new URL("../src/app/workspace/page.tsx", import.meta.url), "utf8");
const proxy = await readFile(new URL("../src/proxy.ts", import.meta.url), "utf8");
const signIn = await readFile(new URL("../src/app/sign-in/[[...sign-in]]/page.tsx", import.meta.url), "utf8");
const supabaseAuth = await readFile(new URL("../src/lib/supabase/auth.ts", import.meta.url), "utf8");
const supabaseProxy = await readFile(new URL("../src/lib/supabase/proxy.ts", import.meta.url), "utf8");
const supabaseSignIn = await readFile(new URL("../src/components/supabase-sign-in-form.tsx", import.meta.url), "utf8");
const supabaseClient = await readFile(new URL("../src/lib/supabase/client.ts", import.meta.url), "utf8");
const accountSignOut = await readFile(new URL("../src/components/account-sign-out-button.tsx", import.meta.url), "utf8");
const workspaceSignOut = await readFile(new URL("../src/app/workspace/sign-out-button.tsx", import.meta.url), "utf8");
const accountLifecycle = await readFile(new URL("../src/lib/supabase/account-lifecycle.ts", import.meta.url), "utf8");
const supabaseAdmin = await readFile(new URL("../src/lib/supabase/admin.ts", import.meta.url), "utf8");
const signUp = await readFile(new URL("../src/app/sign-up/[[...sign-up]]/page.tsx", import.meta.url), "utf8");

const checks = [
  ["provider-neutral subject facade", provider.includes("export const getAuthSubject")],
  ["provider-neutral identity facade", provider.includes("export const getAuthIdentity")],
  ["verified identity facade", provider.includes("export const getVerifiedAuthIdentity")],
  ["Supabase provider adapter", provider.includes("supabaseProvider") && provider.includes("getSupabaseAuthIdentity")],
  ["data uses facade", data.includes('from "@/lib/auth-provider"') && !data.includes('from "@/lib/clerk-auth"')],
  ["tenant session uses facade", tenantSession.includes('from "@/lib/auth-provider"')],
  ["workspace uses facade", workspace.includes('from "@/lib/auth-provider"')],
  ["legacy Clerk adapter retained", provider.includes("getClerkAuthSubject") && provider.includes("getVerifiedClerkAuthIdentity")],
  ["provider-neutral mode guard", data.includes("isExternalAuthEnabled") && tenantSession.includes("isExternalAuthEnabled")],
  ["Clerk-only invitation bind", data.includes('getConfiguredAuthProviderId() === "clerk"')],
  ["pure mode resolver", (await readFile(new URL("../src/lib/auth-mode.ts", import.meta.url), "utf8")).includes("resolveBrokerDeskAuthMode")],
  ["Supabase claims verification", supabaseAuth.includes("auth.getClaims()")],
  ["Supabase proxy refresh", supabaseProxy.includes("auth.getClaims()") && proxy.includes("updateSupabaseSession")],
  ["Supabase sign-in path", signIn.includes("SupabaseSignInForm") && supabaseSignIn.includes("signInWithPassword")],
  ["Supabase browser client", supabaseClient.includes("createBrowserClient")],
  ["Supabase response cookie propagation", supabaseProxy.includes("copySupabaseResponseState") && supabaseProxy.includes("source.cookies.getAll") && supabaseProxy.includes("target.cookies.set(cookie)") && supabaseProxy.includes("Object.entries(headers)" )],
  ["Supabase claim boundary", supabaseAuth.includes("validateSupabaseClaims")],
  ["Supabase proxy claim boundary", supabaseProxy.includes("validateSupabaseClaims") && supabaseProxy.includes("hasValidClaims")],
  ["Supabase account sign-out failure state", accountSignOut.includes("signOutError") && accountSignOut.includes("disabled={pending}") && accountSignOut.includes('role="alert"')],
  ["Supabase workspace sign-out failure state", workspaceSignOut.includes("signOutError") && workspaceSignOut.includes("disabled={pending}") && workspaceSignOut.includes('role="alert"')],
  ["Supabase lifecycle bootstrap policy", accountLifecycle.includes("planPlatformOwnerBootstrap") && accountLifecycle.includes("kind: \"idempotent\"")],
  ["Supabase lifecycle invitation scope", accountLifecycle.includes("validateMemberInvitation") && accountLifecycle.includes("cannot grant platform owner")],
  ["Supabase lifecycle reset/revocation policy", accountLifecycle.includes("planPasswordReset") && accountLifecycle.includes("revokeExistingSessions") && accountLifecycle.includes("canUseSupabaseSession")],
  ["Supabase admin key server boundary", supabaseAdmin.includes('import "server-only"') && supabaseAdmin.includes("SUPABASE_SERVICE_ROLE_KEY") && supabaseAdmin.includes("inviteUserByEmail") && supabaseAdmin.includes("updateUserById")],
  ["Public self-signup remains closed", signUp.includes("邀请制") && !signUp.includes("createBrowserClient")],
];

const failed = checks.filter(([, ok]) => !ok).map(([label]) => label);
if (failed.length > 0) {
  console.error(`auth provider contract failed: ${failed.join(", ")}`);
  process.exit(1);
}

console.log(`auth provider contract passed (${checks.length} checks)`);
