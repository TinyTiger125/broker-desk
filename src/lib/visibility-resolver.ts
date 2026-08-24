import type { TenantSession } from "@/lib/tenant-session";
import { hasTenantSessionProvenance } from "@/lib/tenant-session-provenance";

export const VISIBILITY_DECISIONS = ["owner_write", "company_read", "not_accessible"] as const;
export type VisibilityDecision = (typeof VISIBILITY_DECISIONS)[number];

const requestContextBrand = Symbol("broker-desk-request-context");
const trustedRequestContexts = new WeakSet<object>();

export type RequestContext = Readonly<{
  /** The subject was established by the trusted authentication/session layer. */
  externalAuthSubject: string;
  userId: string;
  tenantId: string;
  membershipId: string;
  membershipStatus: "active";
  readonly [requestContextBrand]: true;
}>;

export type VisibilityRecord = {
  tenantId?: string | null;
  currentOwnerUserId?: string | null;
  visibilityScope?: unknown;
  ownerResolutionStatus?: unknown;
};

export type VisibilityResolution = Readonly<{
  outcome: VisibilityDecision;
  canRead: boolean;
  canWrite: boolean;
}>;

export type VisibilityRecordResult<T> = Readonly<{
  resolution: VisibilityResolution;
  record: T | null;
}>;

export class RequestContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestContextError";
  }
}

function requiredId(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RequestContextError(`${label} is required`);
  }
  return value.trim();
}

/**
 * Builds an immutable context from the result of requireTenantSession.
 * Callers must not pass query/body/form values here. The session object is the
 * only source for user, tenant and membership identity.
 */
export function createRequestContext(session: TenantSession): RequestContext {
  if (!hasTenantSessionProvenance(session)) {
    throw new RequestContextError("trusted tenant session is required");
  }
  const externalAuthSubject = requiredId(session.externalAuthSubject, "externalAuthSubject");
  const userId = requiredId(session.user.id, "userId");
  const tenantId = requiredId(session.tenant.id, "tenantId");
  const membershipId = requiredId(session.membership.id, "membershipId");

  if (session.membership.status !== "active") {
    throw new RequestContextError("active membership is required");
  }
  if (session.membership.userId !== userId) {
    throw new RequestContextError("membership user does not match the authenticated user");
  }
  if (session.membership.tenantId !== tenantId) {
    throw new RequestContextError("membership tenant does not match the selected tenant");
  }
  if (session.user.externalAuthSubject !== externalAuthSubject) {
    throw new RequestContextError("authenticated subject does not match the local user");
  }
  if (session.tenant.status !== "trial" && session.tenant.status !== "active") {
    throw new RequestContextError("tenant is not accessible");
  }

  const context = Object.freeze({
    externalAuthSubject,
    userId,
    tenantId,
    membershipId,
    membershipStatus: "active" as const,
    [requestContextBrand]: true as const,
  });
  trustedRequestContexts.add(context);
  return context;
}

export function isRequestContext(value: unknown): value is RequestContext {
  if (!value || typeof value !== "object") return false;
  if (!trustedRequestContexts.has(value)) return false;
  const candidate = value as Partial<RequestContext>;
  return (
    typeof candidate.externalAuthSubject === "string" && candidate.externalAuthSubject.trim().length > 0 &&
    typeof candidate.userId === "string" && candidate.userId.trim().length > 0 &&
    typeof candidate.tenantId === "string" && candidate.tenantId.trim().length > 0 &&
    typeof candidate.membershipId === "string" && candidate.membershipId.trim().length > 0 &&
    candidate.membershipStatus === "active" &&
    candidate[requestContextBrand] === true
  );
}

/** Unknown fields are deliberately fail-closed; legacy owner fields are ignored. */
export function resolveRecordVisibility(
  context: RequestContext | null | undefined,
  record: VisibilityRecord | null | undefined,
): VisibilityResolution {
  const denied: VisibilityResolution = Object.freeze({ outcome: "not_accessible", canRead: false, canWrite: false });
  if (!context || !isRequestContext(context) || !record) return denied;
  if (!record.tenantId || record.tenantId !== context.tenantId) return denied;
  if (record.ownerResolutionStatus !== "resolved") return denied;

  const ownerId = typeof record.currentOwnerUserId === "string" ? record.currentOwnerUserId.trim() : "";
  if (!ownerId) return denied;

  if (record.visibilityScope !== "private" && record.visibilityScope !== "company_read") return denied;
  if (ownerId === context.userId) {
    return Object.freeze({ outcome: "owner_write", canRead: true, canWrite: true });
  }
  if (record.visibilityScope === "company_read" && context.membershipStatus === "active") {
    return Object.freeze({ outcome: "company_read", canRead: true, canWrite: false });
  }
  return denied;
}

export function isReadable(decision: VisibilityResolution | VisibilityDecision): boolean {
  return typeof decision === "string" ? decision !== "not_accessible" : decision.canRead;
}

export function isWritable(decision: VisibilityResolution | VisibilityDecision): boolean {
  return typeof decision === "string" ? decision === "owner_write" : decision.canWrite;
}
