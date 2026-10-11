import "server-only";

import {
  createClosedBetaTenantAccount,
  getTenantMemberById,
  listAuditLogs,
  listPlatformTenantAccounts,
  refreshTenantMemberInvitation,
  updateTenantMemberInvitation,
  type AuditLog,
  type TenantAccountSummary,
  type TenantInvitationProvider,
} from "@/lib/data";
import { isDemoAuthEnabled, isSupabaseAuthEnabled } from "@/lib/auth-mode";
import { generateSupabaseInvitationLink, normalizeFixedOrigin } from "@/lib/supabase/admin";
import { makeInvitationDeliveryUnknownError } from "@/lib/invitation-delivery-state";
import { normalizeInvitationDeliveryState } from "@/lib/invitation-delivery-state";
import { getTokyoCalendarDate, validateTenantServicePeriod } from "@/lib/tenant-service";
import { randomUUID } from "node:crypto";
import type { Locale } from "@/lib/locale";

export type ClosedBetaTesterInput = {
  actorUserId: string;
  testerName: string;
  testerEmail: string;
  serviceStartAt?: string;
  serviceEndAt: string;
  locale?: Locale;
};

export type ClosedBetaInvitationResult = {
  provider: TenantInvitationProvider;
  providerInvitationId: string;
  invitationUrl: string;
  linkExpiry: "provider_defined_or_unknown" | "synthetic_fixture_not_provider_ttl";
  membershipInvitationExpiresAt?: string;
  issuedAt: string;
};

export type ClosedBetaTesterResult = {
  account: Pick<TenantAccountSummary, "id" | "name" | "serviceStartAt" | "serviceEndAt" | "status">;
  tester: { name: string; email: string; membershipId: string };
  invitation: ClosedBetaInvitationResult;
};

export type ClosedBetaAccessSummary = {
  account: TenantAccountSummary;
  audit: AuditLog[];
};

export const CLOSED_BETA_FLOW = "closed_beta" as const;

function buildClosedBetaTenantDisplayName(testerName: string, locale: Locale = "ja"): string {
  if (locale === "zh") return `${testerName}的测试工作区`;
  if (locale === "ko") return `${testerName} 테스트 워크스페이스`;
  return `${testerName}のテストワークスペース`;
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!email || !email.includes("@") || email.length > 320) {
    throw new Error("closed_beta_tester_email_invalid");
  }
  return email;
}

function resolveAppOrigin(): string {
  const configured = process.env.BROKER_DESK_APP_ORIGIN?.trim()
    || process.env.BROKER_DESK_APP_URL?.trim();
  if (configured) return configured;
  if (isDemoAuthEnabled()) return "http://localhost:3000";
  throw new Error("closed_beta_app_origin_required");
}

function syntheticInvitation(email: string) {
  const marker = `synthetic-closed-beta-${randomUUID()}`;
  const url = new URL("/auth/invite", `${normalizeFixedOrigin(resolveAppOrigin())}/`);
  url.hash = new URLSearchParams({
    token_hash: marker,
    type: "invite",
    next: "/reset-password",
  }).toString();
  return {
    provider: "manual" as const,
    providerInvitationId: `synthetic-invite-${randomUUID()}`,
    invitationUrl: url.toString(),
    linkExpiry: "synthetic_fixture_not_provider_ttl" as const,
    sentAt: new Date(),
    email,
  };
}

async function createProviderInvitation(email: string) {
  if (isSupabaseAuthEnabled()) {
    const result = await generateSupabaseInvitationLink({
      email,
      origin: resolveAppOrigin(),
    });
    return { provider: "supabase" as const, ...result };
  }
  if (isDemoAuthEnabled()) return syntheticInvitation(email);
  throw new Error("closed_beta_invitation_provider_not_configured");
}

function safeDeliveryError(error: unknown): string {
  if (error instanceof Error && error.message === "closed_beta_invitation_provider_not_configured") {
    return error.message;
  }
  return "closed_beta_invitation_delivery_failed";
}

async function finalizeDeliveryFailure(input: {
  tenantId: string;
  membershipId: string;
  actorUserId: string;
  memberContext: Parameters<typeof updateTenantMemberInvitation>[0]["memberContext"];
  provider: TenantInvitationProvider;
  uncertain: boolean;
  providerInvitationId?: string;
  sentAt?: Date;
}) {
  try {
    await updateTenantMemberInvitation({
      tenantId: input.tenantId,
      membershipId: input.membershipId,
      memberContext: input.memberContext,
      invitationProvider: input.provider,
      invitationStatus: input.uncertain ? "pending" : "failed",
      providerInvitationId: input.providerInvitationId,
      sentAt: input.sentAt,
      invitationError: input.uncertain
        ? makeInvitationDeliveryUnknownError("closed_beta_provider_outcome_unknown")
        : "closed_beta_provider_failed",
      actorUserId: input.actorUserId,
    });
  } catch {
    // The membership remains in its sending state. The caller must not offer a
    // blind retry when the provider outcome or local finalization is unknown.
  }
}

function toTesterResult(
  account: TenantAccountSummary,
  member: { id: string; user: { name: string; email: string } },
  invitation: Awaited<ReturnType<typeof createProviderInvitation>>,
  invitationExpiresAt?: Date,
): ClosedBetaTesterResult {
  return {
    account: {
      id: account.id,
      name: account.name,
      status: account.status,
      serviceStartAt: account.serviceStartAt,
      serviceEndAt: account.serviceEndAt,
    },
    tester: { name: member.user.name, email: member.user.email, membershipId: member.id },
    invitation: {
      provider: invitation.provider,
      providerInvitationId: invitation.providerInvitationId,
      invitationUrl: invitation.invitationUrl,
      linkExpiry: invitation.linkExpiry,
      membershipInvitationExpiresAt: invitationExpiresAt?.toISOString(),
      issuedAt: invitation.sentAt.toISOString(),
    },
  };
}

async function issueClosedBetaInvitation(input: {
  account: TenantAccountSummary;
  membershipId: string;
  actorUserId: string;
  prepared: Awaited<ReturnType<typeof refreshTenantMemberInvitation>>;
  email: string;
}): Promise<ClosedBetaTesterResult> {
  const prepared = input.prepared;
  if (!prepared) throw new Error("closed_beta_invitation_membership_missing");
  if (prepared.invitationDeliveryBlocked) {
    throw new Error("closed_beta_invitation_delivery_in_progress");
  }

  const expectedProvider: TenantInvitationProvider = isSupabaseAuthEnabled() ? "supabase" : "manual";
  let invitation: Awaited<ReturnType<typeof createProviderInvitation>>;
  try {
    invitation = await createProviderInvitation(input.email);
  } catch (error) {
    await finalizeDeliveryFailure({
      tenantId: input.account.id,
      membershipId: input.membershipId,
      actorUserId: input.actorUserId,
      memberContext: prepared.member,
      provider: expectedProvider,
      uncertain: false,
    });
    throw new Error(safeDeliveryError(error));
  }

  let updated;
  try {
    updated = await updateTenantMemberInvitation({
      tenantId: input.account.id,
      membershipId: input.membershipId,
      memberContext: prepared.member,
      invitationProvider: invitation.provider,
      invitationStatus: "pending",
      providerInvitationId: invitation.providerInvitationId,
      sentAt: invitation.sentAt,
      actorUserId: input.actorUserId,
    });
  } catch {
    await finalizeDeliveryFailure({
      tenantId: input.account.id,
      membershipId: input.membershipId,
      actorUserId: input.actorUserId,
      memberContext: prepared.member,
      provider: invitation.provider,
      uncertain: true,
      providerInvitationId: invitation.providerInvitationId,
      sentAt: invitation.sentAt,
    });
    throw new Error("closed_beta_invitation_delivery_uncertain");
  }
  if (!updated) {
    // A provider response was obtained but the local finalization returned no
    // row. Treat that as an unknown outcome and run the same compensation path
    // as a thrown finalization error; never hand the caller a retryable state.
    await finalizeDeliveryFailure({
      tenantId: input.account.id,
      membershipId: input.membershipId,
      actorUserId: input.actorUserId,
      memberContext: prepared.member,
      provider: invitation.provider,
      uncertain: true,
      providerInvitationId: invitation.providerInvitationId,
      sentAt: invitation.sentAt,
    });
    throw new Error("closed_beta_invitation_delivery_uncertain");
  }

  return toTesterResult(input.account, prepared.member, invitation, updated.invitationExpiresAt);
}

async function findClosedBetaAccessSummary(actorUserId: string, tenantId: string) {
  const actor = actorUserId.trim();
  const tenant = tenantId.trim();
  if (!actor) throw new Error("closed_beta_platform_actor_required");
  if (!tenant) throw new Error("closed_beta_tenant_id_required");
  const account = (await listPlatformTenantAccounts()).find((item) => item.id === tenant);
  if (!account) return null;
  const audit = await listAuditLogs(actor, {
    tenantId: account.id,
    action: "tenant_account_created",
    limit: 20,
  });
  const marker = audit.find((entry) =>
    entry.actorId === actor
    && entry.targetType === "tenant"
    && entry.targetId === account.id
    && entry.context?.flow === CLOSED_BETA_FLOW,
  );
  return marker ? { account, audit } : null;
}

export async function getClosedBetaAccessSummary(actorUserId: string, tenantId: string): Promise<ClosedBetaAccessSummary> {
  const summary = await findClosedBetaAccessSummary(actorUserId, tenantId);
  if (!summary) throw new Error("closed_beta_tenant_not_found");
  return summary;
}

/**
 * Creates one new tenant and issues exactly one provider/manual invitation.
 * The returned URL is intentionally only in the action response; it is never
 * passed to the repository, audit context, or any persistent field.
 */
export async function createClosedBetaTester(input: ClosedBetaTesterInput): Promise<ClosedBetaTesterResult> {
  const actorUserId = input.actorUserId.trim();
  const testerName = input.testerName.trim();
  const testerEmail = normalizeEmail(input.testerEmail);
  if (!actorUserId) throw new Error("closed_beta_platform_actor_required");
  if (!testerName) throw new Error("closed_beta_tester_name_required");
  const serviceStartAt = input.serviceStartAt?.trim() || getTokyoCalendarDate();
  const serviceEndAt = input.serviceEndAt.trim();
  validateTenantServicePeriod({ serviceStartAt, serviceEndAt });

  const account = await createClosedBetaTenantAccount({
    name: buildClosedBetaTenantDisplayName(testerName, input.locale),
    accountType: "company",
    status: "active",
    purchasedSeatCount: 1,
    serviceStartAt,
    serviceEndAt,
    actorUserId,
    ownerName: testerName,
    ownerEmail: testerEmail,
  });
  const owner = account.ownerMembers[0];
  if (!owner) throw new Error("closed_beta_owner_membership_missing");

  const prepared = await refreshTenantMemberInvitation({
    tenantId: account.id,
    membershipId: owner.id,
    invitedByUserId: actorUserId,
  });
  if (!prepared) throw new Error("closed_beta_invitation_membership_missing");
  if (prepared.invitationDeliveryBlocked) {
    throw new Error("closed_beta_invitation_delivery_in_progress");
  }

  return issueClosedBetaInvitation({
    account,
    membershipId: owner.id,
    actorUserId,
    prepared,
    email: testerEmail,
  }).then((result) => ({
    ...result,
    tester: { ...result.tester, name: testerName },
  }));
}

export async function listClosedBetaAccessSummary(actorUserId: string): Promise<ClosedBetaAccessSummary[]> {
  const actor = actorUserId.trim();
  if (!actor) throw new Error("closed_beta_platform_actor_required");
  const accounts = await listPlatformTenantAccounts();
  const summaries = await Promise.all(accounts.map((account) => findClosedBetaAccessSummary(actor, account.id)));
  return summaries.filter((summary): summary is ClosedBetaAccessSummary => Boolean(summary));
}

/**
 * Re-issues only for an explicitly identified invited owner whose previous
 * delivery is known not to have completed. Provider-accepted, sending, and
 * unknown outcomes are deliberately blocked because this adapter cannot claim
 * that the provider revoked an earlier link.
 */
export async function recoverClosedBetaInvitation(input: {
  actorUserId: string;
  tenantId: string;
  membershipId: string;
}): Promise<ClosedBetaTesterResult> {
  const scoped = await getClosedBetaAccessSummary(input.actorUserId, input.tenantId);
  const member = await getTenantMemberById({ tenantId: scoped.account.id, membershipId: input.membershipId });
  if (!member || member.role !== "tenant_owner" || member.status !== "invited") {
    throw new Error("closed_beta_invitation_membership_missing");
  }
  const deliveryState = normalizeInvitationDeliveryState(member.invitationDeliveryState, member);
  if (deliveryState === "sending" || deliveryState === "unknown") {
    throw new Error("closed_beta_invitation_delivery_in_progress");
  }
  if (member.invitationStatus !== "failed" && member.invitationStatus !== "not_sent") {
    throw new Error("closed_beta_invitation_reissue_not_allowed");
  }
  const prepared = await refreshTenantMemberInvitation({
    tenantId: scoped.account.id,
    membershipId: member.id,
    invitedByUserId: input.actorUserId,
  });
  return issueClosedBetaInvitation({
    account: scoped.account,
    membershipId: member.id,
    actorUserId: input.actorUserId,
    prepared,
    email: member.user.email,
  });
}
