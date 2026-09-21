import type { AuthIdentity } from "@/lib/auth-provider";

export function validateSupabaseClaims(claims: Record<string, unknown>, projectUrl: string): boolean {
  const issuer = `${projectUrl.replace(/\/$/, "")}/auth/v1`;
  const audience = claims.aud;
  const hasAuthenticatedAudience = Array.isArray(audience)
    ? audience.includes("authenticated")
    : audience === "authenticated";
  return claims.iss === issuer && hasAuthenticatedAudience && claims.role === "authenticated" && claims.is_anonymous !== true;
}

export function normalizeSupabaseIdentity(claims: Record<string, unknown>): AuthIdentity | null {
  const subject = typeof claims.sub === "string" ? claims.sub.trim() : "";
  if (!subject) return null;
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : undefined;
  const userMetadata = claims.user_metadata && typeof claims.user_metadata === "object"
    ? claims.user_metadata as Record<string, unknown>
    : undefined;
  const name = typeof userMetadata?.full_name === "string"
    ? userMetadata.full_name.trim()
    : typeof userMetadata?.name === "string"
      ? userMetadata.name.trim()
      : undefined;
  return { subject: `supabase:${subject}`, email: email || undefined, name: name || undefined };
}
