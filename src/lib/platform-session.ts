import { getDefaultUser, type User } from "@/lib/data";

export class PlatformSessionError extends Error {
  constructor(
    message: string,
    public readonly code: "platform_forbidden" | "user_not_found",
  ) {
    super(message);
    this.name = "PlatformSessionError";
  }
}

function configuredPlatformOwnerIds(): Set<string> {
  const configured = process.env.BROKER_DESK_PLATFORM_OWNER_IDS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured && configured.length > 0) return new Set(configured);
  if (process.env.NODE_ENV !== "production") return new Set(["user_demo"]);
  return new Set();
}

export async function requirePlatformOwnerSession(): Promise<{ user: User }> {
  const user = await getDefaultUser();
  if (!user) throw new PlatformSessionError("Authenticated user is required.", "user_not_found");
  const ownerIds = configuredPlatformOwnerIds();
  if (!ownerIds.has(user.id) && (!user.externalAuthSubject || !ownerIds.has(user.externalAuthSubject))) {
    throw new PlatformSessionError("Platform owner access is required.", "platform_forbidden");
  }
  return { user };
}
