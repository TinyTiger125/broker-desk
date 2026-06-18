import { clerkClient } from "@clerk/nextjs/server";
import { isClerkAuthConfigured, isClerkAuthEnabled } from "@/lib/auth-mode";
import type { TenantMemberListItem } from "@/lib/data";

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

export async function createClerkInvitationForTenantMember(member: TenantMemberListItem): Promise<ClerkInvitationResult> {
  if (!isClerkAuthEnabled()) {
    return { ok: false, skipped: true, reason: "clerk_auth_mode_disabled" };
  }
  if (!isClerkAuthConfigured()) {
    return { ok: false, skipped: true, reason: "clerk_not_configured" };
  }

  const redirectUrl = process.env.BROKER_DESK_CLERK_INVITATION_REDIRECT_URL?.trim() || undefined;
  const client = await clerkClient();
  const invitation = await client.invitations.createInvitation({
    emailAddress: member.user.email,
    ignoreExisting: true,
    notify: true,
    redirectUrl,
    publicMetadata: {
      brokerDeskTenantId: member.tenantId,
      brokerDeskMembershipId: member.id,
      brokerDeskRole: member.role,
    },
  });

  return {
    ok: true,
    providerInvitationId: invitation.id,
    invitationUrl: invitation.url,
    sentAt: new Date(),
  };
}
