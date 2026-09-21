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

export async function generateSupabasePasswordResetLink(input: { email: string; redirectTo: string }) {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.redirectTo.startsWith("/")) throw new Error("supabase_password_reset_request_invalid");
  const { data, error } = await createSupabaseAdminClient().auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: input.redirectTo },
  });
  if (error || !data.properties?.action_link) throw new Error("supabase_password_reset_failed");
  return { actionLink: data.properties.action_link };
}

export async function disableSupabaseUser(userId: string) {
  const normalized = userId.trim();
  if (!normalized) throw new Error("supabase_user_id_required");
  const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(normalized, {
    ban_duration: "876000h",
  });
  if (error) throw new Error("supabase_user_disable_failed");
}
