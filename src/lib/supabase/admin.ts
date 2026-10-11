import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseInvitationCreate = (
  email: string,
  options?: { redirectTo?: string },
) => ReturnType<SupabaseClient["auth"]["admin"]["inviteUserByEmail"]>;

export type SupabaseInvitationDependencies = {
  inviteUserByEmail?: SupabaseInvitationCreate;
};

export type SupabaseGenerateInvitationLink = (
  params: Parameters<SupabaseClient["auth"]["admin"]["generateLink"]>[0],
) => ReturnType<SupabaseClient["auth"]["admin"]["generateLink"]>;

export type SupabaseGenerateInvitationLinkDependencies = {
  generateLink?: SupabaseGenerateInvitationLink;
};

let adminClient: SupabaseClient | null = null;

function getSupabaseAdminConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) throw new Error("supabase_admin_not_configured");
  return { url, serviceRoleKey };
}

/** Server-only. Never import this module from a client component or browser bundle. */
export function createSupabaseAdminClient(): SupabaseClient {
  if (!adminClient) {
    const { url, serviceRoleKey } = getSupabaseAdminConfig();
    adminClient = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
  }
  return adminClient;
}

export async function inviteSupabaseUserByEmail(
  input: { email: string; redirectTo?: string },
  dependencies: SupabaseInvitationDependencies = {},
) {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("supabase_invitation_email_required");
  const inviteUserByEmail = dependencies.inviteUserByEmail
    ?? ((inviteEmail, options) => createSupabaseAdminClient().auth.admin.inviteUserByEmail(inviteEmail, options));
  const { data, error } = await inviteUserByEmail(email, {
    redirectTo: input.redirectTo,
  });
  if (error) throw error;
  if (!data.user?.id) throw new Error("supabase_invitation_missing_user");
  return { providerInvitationId: data.user.id, sentAt: new Date() };
}

export function normalizeFixedOrigin(origin: string): string {
  const value = origin.trim();
  if (!value) throw new Error("supabase_invitation_origin_required");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("supabase_invitation_origin_invalid");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("supabase_invitation_origin_invalid");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("supabase_invitation_origin_invalid");
  }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error("supabase_invitation_origin_https_required");
  }
  return parsed.toString().replace(/\/$/, "");
}

/**
 * Server-only invitation-link generation. The provider's action_link and raw
 * token are deliberately discarded; callers receive one fixed-origin app URL
 * for one-time manual delivery and must not persist it.
 */
export async function generateSupabaseInvitationLink(
  input: { email: string; origin: string },
  dependencies: SupabaseGenerateInvitationLinkDependencies = {},
) {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("supabase_invitation_email_required");
  const origin = normalizeFixedOrigin(input.origin);
  const redirectTo = `${origin}/auth/confirm?next=${encodeURIComponent("/reset-password")}`;
  const generateLink = dependencies.generateLink
    ?? ((params) => createSupabaseAdminClient().auth.admin.generateLink(params));
  const { data, error } = await generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });
  if (error) throw error;
  const generatedEmail = data.user?.email?.trim().toLowerCase();
  const hashedToken = data.properties?.hashed_token?.trim();
  if (!data.user?.id || generatedEmail !== email) {
    throw new Error("supabase_invitation_user_mismatch");
  }
  if (data.properties?.verification_type !== "invite" || !hashedToken) {
    throw new Error("supabase_invitation_response_invalid");
  }
  // Keep the one-time provider secret in the URL fragment. Browsers do not
  // send fragments in HTTP requests, referrers, or request-log paths. The
  // dedicated client route removes it before the user can submit it once in
  // a same-origin POST to the server-side verifier.
  const invitationUrl = new URL("/auth/invite", `${origin}/`);
  invitationUrl.hash = new URLSearchParams({
    token_hash: hashedToken,
    type: "invite",
    next: "/reset-password",
  }).toString();
  return {
    providerInvitationId: data.user.id,
    invitationUrl: invitationUrl.toString(),
    sentAt: new Date(),
    linkExpiry: "provider_defined_or_unknown" as const,
  };
}

/** Server-only global account ban. Use only for an explicit platform-account lifecycle action. */
export async function setSupabaseUserDisabled(userId: string, disabled: boolean) {
  const normalized = userId.trim();
  if (!normalized) throw new Error("supabase_user_id_required");
  const admin = createSupabaseAdminClient().auth.admin;
  const { error } = await admin.updateUserById(normalized, { ban_duration: disabled ? "876000h" : "none" });
  if (error) throw new Error(disabled ? "supabase_user_disable_failed" : "supabase_user_enable_failed");
}

export const disableSupabaseUser = (userId: string) => setSupabaseUserDisabled(userId, true);

/** Supabase's admin signOut accepts a JWT, never a user id. Do not persist or log this token. */
export async function revokeSupabaseSessionsWithAccessToken(accessToken: string) {
  const token = accessToken.trim();
  if (!token) throw new Error("supabase_access_token_required");
  const { error } = await createSupabaseAdminClient().auth.admin.signOut(token, "global");
  if (error) throw new Error("supabase_user_session_revoke_failed");
}
