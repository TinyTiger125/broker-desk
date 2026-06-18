import { getDefaultUser, type User } from "@/lib/data";
import { isConfiguredPlatformOwnerUser } from "@/lib/platform-owner";

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
  if (!isConfiguredPlatformOwnerUser(user)) {
    throw new PlatformSessionError("Platform owner access is required.", "platform_forbidden");
  }
  return { user };
}
