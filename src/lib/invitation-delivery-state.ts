/** Provider accepted the create request; this is not an inbox-delivery receipt. */
export type TenantInvitationDeliveryState = "ready" | "sending" | "unknown" | "provider_accepted";

export const INVITATION_DELIVERY_UNKNOWN_PREFIX = "invitation_delivery_outcome_unknown:";

export function isInvitationDeliveryUnknown(error?: string): boolean {
  return Boolean(error?.startsWith(INVITATION_DELIVERY_UNKNOWN_PREFIX));
}

export function makeInvitationDeliveryUnknownError(reason: string): string {
  const normalizedReason = reason.trim() || "unknown";
  return `${INVITATION_DELIVERY_UNKNOWN_PREFIX}${normalizedReason}`;
}

export function normalizeInvitationDeliveryState(
  state: unknown,
  input: { invitationStatus?: string; providerInvitationId?: string; invitationError?: string } = {},
): TenantInvitationDeliveryState {
  if (state === "ready" || state === "sending" || state === "unknown" || state === "provider_accepted") return state;
  if (isInvitationDeliveryUnknown(input.invitationError)) return "unknown";
  if (input.invitationStatus === "pending" && input.providerInvitationId) return "provider_accepted";
  return "ready";
}

export function deliveryStateAfterFinalization(input: {
  invitationStatus: string;
  providerInvitationId?: string;
  invitationError?: string;
}): TenantInvitationDeliveryState {
  if (isInvitationDeliveryUnknown(input.invitationError)) return "unknown";
  if (input.invitationStatus === "pending" && input.providerInvitationId) return "provider_accepted";
  return "ready";
}
