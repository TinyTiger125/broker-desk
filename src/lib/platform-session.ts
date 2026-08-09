import { getDefaultUser, listTenantMemberships, type User } from "@/lib/data";
import { hasActivePlatformOwnerMembership, isConfiguredPlatformOwnerUser } from "@/lib/platform-owner";

export class PlatformSessionError extends Error {
  constructor(
    message: string,
    public readonly code: "platform_forbidden" | "user_not_found",
  ) {
    super(message);
    this.name = "PlatformSessionError";
  }
}

export async function requirePlatformOwnerSession(): Promise<{ user: User }> {
  const user = await getDefaultUser();
  if (!user) throw new PlatformSessionError("Authenticated user is required.", "user_not_found");
  const memberships = await listTenantMemberships(user.id);
  if (!isConfiguredPlatformOwnerUser(user) && !hasActivePlatformOwnerMembership(memberships)) {
    throw new PlatformSessionError("Platform owner access is required.", "platform_forbidden");
  }
  return { user };
}
