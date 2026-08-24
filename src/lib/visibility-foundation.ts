/**
 * W9.1 visibility vocabulary.  This module is intentionally policy-only:
 * page-level sharing, delegation and co-editing belong to later slices.
 */
export const VISIBILITY_SCOPES = ["private", "company_read"] as const;
export type VisibilityScope = (typeof VISIBILITY_SCOPES)[number];

export const VISIBILITY_OBJECT_TYPES = ["case", "person", "property"] as const;
export type VisibilityObjectType = (typeof VISIBILITY_OBJECT_TYPES)[number];

export const OWNER_RESOLUTION_STATUSES = ["resolved", "pending_confirmation"] as const;
export type OwnerResolutionStatus = (typeof OWNER_RESOLUTION_STATUSES)[number];

export function normalizeVisibilityScope(value: unknown): VisibilityScope {
  return value === "company_read" ? "company_read" : "private";
}

export function normalizeOwnerResolutionStatus(value: unknown): OwnerResolutionStatus {
  return value === "pending_confirmation" ? "pending_confirmation" : "resolved";
}

export function isVisibilityObjectType(value: unknown): value is VisibilityObjectType {
  return VISIBILITY_OBJECT_TYPES.includes(value as VisibilityObjectType);
}

/** Unknown ownership is fail-closed and therefore never listable. */
export function isVisibilityRecordResolved(input: {
  ownerResolutionStatus?: unknown;
  currentOwnerUserId?: string | null;
}): boolean {
  return normalizeOwnerResolutionStatus(input.ownerResolutionStatus) === "resolved" && Boolean(input.currentOwnerUserId);
}
