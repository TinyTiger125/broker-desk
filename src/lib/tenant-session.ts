import { cookies } from "next/headers";
import {
  getDefaultUser,
  getTenantById,
  listTenantMemberships,
  type Tenant,
  type TenantMembership,
  type User,
} from "@/lib/data";
import {
  ACTIVE_TENANT_COOKIE_NAME,
  roleHasTenantPermission,
  type TenantPermissionAction,
} from "@/lib/tenant-permissions";

export class TenantSessionError extends Error {
  constructor(
    message: string,
    public readonly code: "user_not_found" | "tenant_not_found" | "tenant_forbidden" | "permission_denied",
    public readonly status: 401 | 403 | 404 = code === "user_not_found" ? 401 : code === "tenant_not_found" ? 404 : 403,
  ) {
    super(message);
    this.name = "TenantSessionError";
  }
}

export type TenantSession = {
  user: User;
  tenant: Tenant;
  membership: TenantMembership;
};

export function selectActiveTenantMembership(input: {
  memberships: TenantMembership[];
  requestedTenantId?: string;
}): TenantMembership | null {
  const activeMemberships = input.memberships.filter((membership) => membership.status === "active");
  if (input.requestedTenantId) {
    return activeMemberships.find((membership) => membership.tenantId === input.requestedTenantId) ?? null;
  }
  return activeMemberships[0] ?? null;
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

export async function requireTenantSession(options: {
  preferredUserId?: string;
  requestedTenantId?: string;
  permission?: TenantPermissionAction;
} = {}): Promise<TenantSession> {
  const user = await getDefaultUser(options.preferredUserId);
  if (!user) {
    throw new TenantSessionError("Authenticated user is required.", "user_not_found");
  }

  const requestedTenantId = options.requestedTenantId ?? (await getActiveTenantIdFromCookie());
  const memberships = await listTenantMemberships(user.id);
  const membership = selectActiveTenantMembership({ memberships, requestedTenantId });
  if (!membership) {
    throw new TenantSessionError("User does not belong to the requested tenant.", "tenant_forbidden");
  }

  const tenant = await getTenantById(membership.tenantId);
  if (!tenant || tenant.status !== "active") {
    throw new TenantSessionError("Active tenant was not found.", "tenant_not_found");
  }

  if (options.permission && !roleHasTenantPermission(membership.role, options.permission)) {
    throw new TenantSessionError("Tenant membership does not allow this action.", "permission_denied");
  }

  return { user, tenant, membership };
}
