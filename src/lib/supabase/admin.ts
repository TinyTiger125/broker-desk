import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

export async function inviteSupabaseUserByEmail(input: { email: string; redirectTo?: string }) {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("supabase_invitation_email_required");
  const { data, error } = await createSupabaseAdminClient().auth.admin.inviteUserByEmail(email, {
    redirectTo: input.redirectTo,
  });
  if (error || !data.user?.id) throw new Error("supabase_invitation_failed");
  return { providerInvitationId: data.user.id, sentAt: new Date() };
}

export async function setSupabaseUserDisabled(userId: string, disabled: boolean) {
  const normalized = userId.trim();
  if (!normalized) throw new Error("supabase_user_id_required");
  const admin = createSupabaseAdminClient().auth.admin;
  const { error } = await admin.updateUserById(normalized, { ban_duration: disabled ? "876000h" : "none" });
  if (error) throw new Error(disabled ? "supabase_user_disable_failed" : "supabase_user_enable_failed");
  if (disabled) {
    const revoke = await admin.signOut(normalized, "global");
    if (revoke.error) throw new Error("supabase_user_session_revoke_failed");
  }
}

export const disableSupabaseUser = (userId: string) => setSupabaseUserDisabled(userId, true);
