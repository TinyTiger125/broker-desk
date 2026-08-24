import { cookies } from "next/headers";
import { cache } from "react";
import {
  getDefaultUser,
  getTenantById,
  getUserById,
  isTenantAccessibleStatus,
  listTenantSessionLookupsByExternalAuthSubject,
  listTenantMemberships,
  type Tenant,
  type TenantMembership,
  type User,
} from "@/lib/data";
import { isClerkAuthEnabled, isTrustedHeaderAuthEnabled } from "@/lib/auth-mode";
import { getClerkAuthSubject } from "@/lib/clerk-auth";
import {
  isConfiguredPlatformOwnerUser,
  isDevelopmentPlatformOwnerTenantFallbackEnabled,
} from "@/lib/platform-owner";
import { DEFAULT_TENANT_ID } from "@/lib/tenant-constants";
import {
  ACTIVE_TENANT_COOKIE_NAME,
  capabilityHasTenantPermission,
  type TenantCapabilityPreset,
  type TenantPermissionAction,
} from "@/lib/tenant-permissions";
import { isProductionRuntime } from "@/lib/auth-mode";
import { registerTenantSessionProvenance } from "@/lib/tenant-session-provenance";

export class TenantSessionError extends Error {
  constructor(
    message: string,
    public readonly code: "user_not_found" | "tenant_not_found" | "tenant_selection_required" | "tenant_forbidden" | "permission_denied",
    public readonly status: 401 | 403 | 404 = code === "user_not_found" ? 401 : code === "tenant_not_found" ? 404 : 403,
  ) {
    super(message);
    this.name = "TenantSessionError";
  }
}

export type TenantSession = {
  /** Clerk/trusted-auth subject used to bind the request-scoped database identity. */
  externalAuthSubject: string | null;
  user: User;
  tenant: Tenant;
  membership: TenantMembership;
};

/**
 * Preserve Secure cookies whenever the request is already HTTPS. A proxy may
 * expose the original HTTPS transport through x-forwarded-proto when the
 * application server receives HTTP, but an untrusted `http` header must never
 * downgrade an HTTPS request.
 */
export function shouldUseSecureCookie(request: Request): boolean {
  const requestProtocol = new URL(request.url).protocol;
  if (requestProtocol === "https:") return true;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return forwardedProto === "https";
}

export function getTenantCapability(membership: TenantMembership): TenantCapabilityPreset {
  return membership.capability ?? "ordinary_member";
}

export function selectActiveTenantMembership(input: {
  memberships: TenantMembership[];
  requestedTenantId?: string;
}): TenantMembership | null {
  const activeMemberships = input.memberships.filter((membership) => membership.status === "active");
  if (input.requestedTenantId) {
    return activeMemberships.find((membership) => membership.tenantId === input.requestedTenantId) ?? null;
  }
  if (activeMemberships.length > 1) return null;
  return activeMemberships[0] ?? null;
}

async function selectDevelopmentPlatformOwnerTenantMembership(input: {
  user: User;
  requestedTenantId?: string;
}): Promise<{ user: User; membership: TenantMembership } | null> {
  if (isProductionRuntime()) return null;
  // A real Clerk identity must never be upgraded by the demo recovery path.
  // Missing membership is an onboarding state, not a reason to fabricate one.
  if (isClerkAuthEnabled()) return null;
  if (isTrustedHeaderAuthEnabled()) return null;
  if (!isDevelopmentPlatformOwnerTenantFallbackEnabled()) return null;
  if (!isConfiguredPlatformOwnerUser(input.user)) return null;

  const dataUser = (await getUserById("user_demo")) ?? input.user;
  const candidateTenantIds = Array.from(
    new Set([input.requestedTenantId, DEFAULT_TENANT_ID].filter((value): value is string => Boolean(value))),
  );
  for (const tenantId of candidateTenantIds) {
    const tenant = await getTenantById(tenantId);
    if (tenant && isTenantAccessibleStatus(tenant.status)) {
      const now = new Date();
      return {
        user: dataUser,
        membership: {
          id: `platform_owner_dev_${input.user.id}_${tenant.id}`,
          tenantId: tenant.id,
          userId: dataUser.id,
          role: "platform_owner",
          status: "active",
          invitationProvider: "manual",
          invitationStatus: "accepted",
          invitationAcceptedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      };
    }
  }

  return null;
}

export async function getActiveTenantIdFromCookie(): Promise<string | undefined> {
  try {
    const store = await cookies();
    const value = store.get(ACTIVE_TENANT_COOKIE_NAME)?.value?.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

const resolveTenantSession = cache(async (preferredUserId?: string, requestedTenantIdOverride?: string): Promise<TenantSession> => {
  const [requestedTenantId, clerkSubject] = await Promise.all([
    requestedTenantIdOverride ?? getActiveTenantIdFromCookie(),
    isClerkAuthEnabled() ? getClerkAuthSubject() : Promise.resolve(null),
  ]);
  const sessionLookups = clerkSubject
    ? await listTenantSessionLookupsByExternalAuthSubject(clerkSubject)
    : [];
  const user = sessionLookups[0]?.user ?? (await getDefaultUser(preferredUserId));
  if (!user) {
    throw new TenantSessionError("Authenticated user is required.", "user_not_found");
  }

  const memberships = sessionLookups.length > 0
    ? sessionLookups.map((item) => item.membership)
    : await listTenantMemberships(user.id);
  if (!requestedTenantId && memberships.filter((membership) => membership.status === "active").length > 1) {
    throw new TenantSessionError("An active tenant must be selected.", "tenant_selection_required");
  }
  const activeMembership = selectActiveTenantMembership({ memberships, requestedTenantId });
  const fallbackSession = activeMembership ? null : await selectDevelopmentPlatformOwnerTenantMembership({ user, requestedTenantId });
  const sessionUser = fallbackSession?.user ?? user;
  const membership = activeMembership ?? fallbackSession?.membership;
  if (!membership) {
    throw new TenantSessionError("User does not belong to the requested tenant.", "tenant_forbidden");
  }

  const tenant = sessionLookups.find((item) => item.membership.id === membership.id)?.tenant
    ?? await getTenantById(membership.tenantId);
  if (!tenant || !isTenantAccessibleStatus(tenant.status)) {
    throw new TenantSessionError("Active tenant was not found.", "tenant_not_found");
  }

  const resolvedSession = {
    // A persisted user mapping is not an authentication event. Resolver
    // contexts must carry only the subject established by the current Clerk
    // session; demo/development fallbacks stay ineligible for resolver access.
    externalAuthSubject: clerkSubject ?? null,
    user: sessionUser,
    tenant,
    membership,
  };
  registerTenantSessionProvenance(resolvedSession);
  return resolvedSession;
});

export const getTenantSessionForNavigation = cache(async (): Promise<TenantSession | null> => {
  try {
    return await resolveTenantSession();
  } catch {
    // Public auth pages render the shell before a tenant exists. Protected
    // routes still surface the original session error from requireTenantSession.
    return null;
  }
});

export async function requireTenantSession(options: {
  preferredUserId?: string;
  requestedTenantId?: string;
  permission?: TenantPermissionAction;
  permissions?: readonly TenantPermissionAction[];
} = {}): Promise<TenantSession> {
  const session = await resolveTenantSession(options.preferredUserId, options.requestedTenantId);
  const requiredPermissions = [
    ...(options.permission ? [options.permission] : []),
    ...(options.permissions ?? []),
  ];
  if (
    requiredPermissions.length > 0 &&
    !requiredPermissions.every((permission) => capabilityHasTenantPermission(getTenantCapability(session.membership), permission))
  ) {
    throw new TenantSessionError("Tenant membership does not allow this action.", "permission_denied");
  }

  return session;
}

export function assertTenantPermission(session: TenantSession, permission: TenantPermissionAction) {
  if (!capabilityHasTenantPermission(getTenantCapability(session.membership), permission)) {
    throw new TenantSessionError("Tenant membership does not allow this action.", "permission_denied");
  }
}

export function assertTenantPermissions(session: TenantSession, permissions: readonly TenantPermissionAction[]) {
  if (!permissions.every((permission) => capabilityHasTenantPermission(getTenantCapability(session.membership), permission))) {
    throw new TenantSessionError("Tenant membership does not allow this action.", "permission_denied");
  }
}
