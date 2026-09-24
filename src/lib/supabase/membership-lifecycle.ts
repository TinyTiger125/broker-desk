export type SupabaseMembershipStatus = "active" | "suspended" | "removed";

export async function persistTenantMembershipStatus<T extends { tenantId: string }>(input: {
  targetTenantId: string;
  status: SupabaseMembershipStatus;
  updateLocal: () => Promise<T | null>;
  recordAudit: (member: T) => Promise<unknown>;
}) {
  if (input.targetTenantId.trim() === "") return { ok: false as const, reason: "tenant_required" as const };
  const member = await input.updateLocal();
  if (!member) return { ok: false as const, reason: "local_membership_update_failed" as const };
  try {
    await input.recordAudit(member);
    return { ok: true as const, member, warning: null };
  } catch {
    // Local access is already revoked; retain the state and surface a retryable audit warning.
    return { ok: true as const, member, warning: "audit_pending" as const };
  }
}

export async function applyGlobalSupabaseDisable<T>(input: {
  disableProvider: () => Promise<void>;
  persistLocal: () => Promise<T | null>;
}) {
  try {
    await input.disableProvider();
  } catch {
    return { ok: false as const, stage: "provider" as const };
  }
  const local = await input.persistLocal();
  if (!local) return { ok: false as const, stage: "local" as const };
  return { ok: true as const, local };
}
