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
 * A 4xx Clerk response is an explicit provider rejection. A network failure,
 * SDK failure, or 5xx response cannot prove that Clerk did not create the
 * invitation before the response was lost, so it must remain uncertain.
 */
export function classifyClerkInvitationError(error: unknown): ClerkInvitationFailure {
  if (isClerkAPIResponseError(error)) {
    const status = Number.isInteger(error.status) ? error.status : 0;
    const codes = error.errors.map(({ code }) => code).filter(Boolean).slice(0, 3).join(",");
    return {
      uncertain: status < 400 || status >= 500,
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
