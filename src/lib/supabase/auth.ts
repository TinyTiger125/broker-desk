import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthIdentity } from "@/lib/auth-provider";
import { normalizeSupabaseIdentity, validateSupabaseClaims } from "@/lib/supabase/identity";

export { normalizeSupabaseIdentity } from "@/lib/supabase/identity";

async function getSupabaseClaims() {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims) return null;
  const claims = data.claims as Record<string, unknown>;
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!projectUrl || !validateSupabaseClaims(claims, projectUrl)) return null;
  return claims;
}

export async function getSupabaseAuthIdentity(): Promise<AuthIdentity | null> {
  const claims = await getSupabaseClaims();
  return claims ? normalizeSupabaseIdentity(claims) : null;
}

export async function getVerifiedSupabaseAuthIdentity(): Promise<AuthIdentity | null> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || (!data.user.email_confirmed_at && !data.user.confirmed_at)) return null;
  return normalizeSupabaseIdentity({
    sub: data.user.id,
    email: data.user.email,
    user_metadata: data.user.user_metadata,
  });
}
