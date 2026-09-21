import { readFile } from "node:fs/promises";

const provider = await readFile(new URL("../src/lib/auth-provider.ts", import.meta.url), "utf8");
const data = await readFile(new URL("../src/lib/data.ts", import.meta.url), "utf8");
const tenantSession = await readFile(new URL("../src/lib/tenant-session.ts", import.meta.url), "utf8");
const workspace = await readFile(new URL("../src/app/workspace/page.tsx", import.meta.url), "utf8");

const checks = [
  ["provider-neutral subject facade", provider.includes("export const getAuthSubject")],
  ["provider-neutral identity facade", provider.includes("export const getAuthIdentity")],
  ["verified identity facade", provider.includes("export const getVerifiedAuthIdentity")],
  ["Supabase fail-closed", provider.includes('supabase_auth_provider_not_ready')],
  ["data uses facade", data.includes('from "@/lib/auth-provider"') && !data.includes('from "@/lib/clerk-auth"')],
  ["tenant session uses facade", tenantSession.includes('from "@/lib/auth-provider"')],
  ["workspace uses facade", workspace.includes('from "@/lib/auth-provider"')],
  ["legacy Clerk adapter retained", provider.includes("getClerkAuthSubject") && provider.includes("getVerifiedClerkAuthIdentity")],
  ["provider-neutral mode guard", data.includes("isExternalAuthEnabled") && tenantSession.includes("isExternalAuthEnabled")],
  ["Clerk-only invitation bind", data.includes('getConfiguredAuthProviderId() === "clerk"')],
  ["pure mode resolver", (await readFile(new URL("../src/lib/auth-mode.ts", import.meta.url), "utf8")).includes("resolveBrokerDeskAuthMode")],
];

const failed = checks.filter(([, ok]) => !ok).map(([label]) => label);
if (failed.length > 0) {
  console.error(`auth provider contract failed: ${failed.join(", ")}`);
  process.exit(1);
}

console.log(`auth provider contract passed (${checks.length} checks)`);
