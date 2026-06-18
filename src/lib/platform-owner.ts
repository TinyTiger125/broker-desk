import type { User } from "@/lib/data";

export function configuredPlatformOwnerIds(): Set<string> {
  const configured = process.env.BROKER_DESK_PLATFORM_OWNER_IDS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured && configured.length > 0) return new Set(configured);
  if (process.env.NODE_ENV !== "production") return new Set(["user_demo"]);
  return new Set();
}

export function isConfiguredPlatformOwnerUser(user: Pick<User, "id" | "externalAuthSubject"> | null | undefined) {
  if (!user) return false;
  const ownerIds = configuredPlatformOwnerIds();
  return ownerIds.has(user.id) || Boolean(user.externalAuthSubject && ownerIds.has(user.externalAuthSubject));
}

export function isDevelopmentPlatformOwnerTenantFallbackEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.BROKER_DESK_ENABLE_PLATFORM_OWNER_TENANT_FALLBACK !== "false";
}
