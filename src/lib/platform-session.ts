import { getDefaultUser, listTenantMemberships, type User } from "@/lib/data";
import { hasActivePlatformOwnerMembership } from "@/lib/platform-owner";

export class PlatformSessionError extends Error {
  constructor(
    message: string,
    public readonly code: "platform_forbidden" | "user_not_found",
  ) {
    super(message);
    this.name = "PlatformSessionError";
  }
}

export async function getPlatformOwnerSession(): Promise<{ user: User } | null> {
  const user = await getDefaultUser();
  if (!user) return null;
  const memberships = await listTenantMemberships(user.id);
  if (!hasActivePlatformOwnerMembership(memberships)) {
    return null;
  }
  return { user };
}

export async function requirePlatformOwnerSession(): Promise<{ user: User }> {
  const session = await getPlatformOwnerSession();
  if (session) return session;
  const user = await getDefaultUser();
  if (!user) throw new PlatformSessionError("Authenticated user is required.", "user_not_found");
  throw new PlatformSessionError("Platform owner access is required.", "platform_forbidden");
}
