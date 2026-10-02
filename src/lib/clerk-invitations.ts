import { clerkClient } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { isClerkAuthConfigured, isClerkAuthEnabled } from "@/lib/auth-mode";
import type { TenantInvitationDeliveryContext } from "@/lib/data";

export type ClerkInvitationCreateParams = {
  emailAddress: string;
  ignoreExisting: boolean;
  notify: boolean;
  redirectUrl?: string;
  publicMetadata: Record<string, string>;
};

export type ClerkInvitationCreate = (
  params: ClerkInvitationCreateParams,
) => Promise<{ id: string; url?: string }>;

export type ClerkInvitationDependencies = {
  createInvitation?: ClerkInvitationCreate;
};

export type ClerkInvitationFailure = {
  uncertain: boolean;
  reason: string;
};

/**
 * The invitation endpoint is a POST. Clerk's SDK exposes the HTTP status and
 * error codes. Only the bounded validation/authentication codes below are
 * treated as a safe local rejection. Timeout, rate-limit, unknown-code, and
 * server responses remain outcome-unknown because the SDK/endpoint contract
 * does not prove that the POST did not reach the create side effect.
 */
export function classifyClerkInvitationError(error: unknown): ClerkInvitationFailure {
  if (isClerkAPIResponseError(error)) {
    const status = Number.isInteger(error.status) ? error.status : 0;
    const codes = error.errors.map(({ code }) => code).filter(Boolean).slice(0, 3).join(",");
    const safeLocalRejectionCodes = new Set([
      "email_address_invalid",
      "form_param_missing",
      "form_param_invalid",
      "authentication_invalid",
    ]);
    const isSafeLocalRejection = status >= 400
      && status < 500
      && status !== 408
      && status !== 429
      && error.errors.length > 0
      && error.errors.every(({ code }) => safeLocalRejectionCodes.has(code));
    return {
      uncertain: !isSafeLocalRejection,
      reason: `clerk_invitation_api_${status || "error"}${codes ? `:${codes}` : ""}`,
    };
  }

  return { uncertain: true, reason: "clerk_invitation_outcome_unknown" };
}

export type ClerkInvitationResult =
  | {
      ok: true;
      providerInvitationId: string;
      invitationUrl?: string;
      sentAt: Date;
    }
  | {
      ok: false;
      skipped: boolean;
      reason: string;
    };

export async function createClerkInvitationForTenantMember(
  context: TenantInvitationDeliveryContext,
  dependencies: ClerkInvitationDependencies = {},
): Promise<ClerkInvitationResult> {
  if (!isClerkAuthEnabled()) {
    return { ok: false, skipped: true, reason: "clerk_auth_mode_disabled" };
  }
  if (!isClerkAuthConfigured()) {
    return { ok: false, skipped: true, reason: "clerk_not_configured" };
  }

  const redirectUrl = process.env.BROKER_DESK_CLERK_INVITATION_REDIRECT_URL?.trim() || undefined;
  const createInvitation: ClerkInvitationCreate = dependencies.createInvitation ?? (async (params) => {
    const client = await clerkClient();
    return client.invitations.createInvitation(params);
  });
  const invitation = await createInvitation({
    emailAddress: context.member.user.email,
    ignoreExisting: true,
    notify: true,
    redirectUrl,
    publicMetadata: {
      brokerDeskTenantId: context.tenant.id,
      brokerDeskTenantName: context.tenant.name,
      brokerDeskMembershipId: context.member.id,
      brokerDeskRole: context.member.role,
    },
  });

  return {
    ok: true,
    providerInvitationId: invitation.id,
    invitationUrl: invitation.url,
    sentAt: new Date(),
  };
}
