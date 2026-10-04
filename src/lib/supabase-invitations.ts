export type SupabaseInvitationFailure = {
  uncertain: boolean;
  reason: string;
};

/**
 * Supabase Auth inviteUserByEmail is a POST with a provider-side email side
 * effect. Only bounded request/configuration rejections are safe to retry;
 * timeouts, rate limits, unknown 4xx codes, 5xx responses, and transport
 * failures remain outcome-unknown.
 */
export function classifySupabaseInvitationError(error: unknown): SupabaseInvitationFailure {
  const candidate = typeof error === "object" && error !== null ? error as Record<string, unknown> : {};
  const message = error instanceof Error ? error.message : "";
  const localFailureCodes = new Set([
    "supabase_admin_not_configured",
    "supabase_invitation_email_required",
  ]);
  if (localFailureCodes.has(message)) {
    return { uncertain: false, reason: message };
  }
  if (message === "supabase_invitation_missing_user") {
    // The provider call may have had a side effect even though the SDK did
    // not return a usable user record, so keep this outcome unknown while
    // preserving the actionable reason.
    return { uncertain: true, reason: message };
  }
  const status = typeof candidate.status === "number" && Number.isInteger(candidate.status) ? candidate.status : 0;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const safeLocalRejectionCodes = new Set([
    "email_address_invalid",
    "email_address_not_authorized",
    "email_exists",
    "email_provider_disabled",
    "no_authorization",
    "not_admin",
    "provider_disabled",
    "user_already_exists",
    "validation_failed",
  ]);
  const isSafeLocalRejection = status >= 400
    && status < 500
    && status !== 408
    && status !== 429
    && safeLocalRejectionCodes.has(code);
  return {
    uncertain: !isSafeLocalRejection,
    reason: `supabase_invitation_api_${status || "error"}${code ? `:${code}` : ""}`,
  };
}
