import { cookies } from "next/headers";

export const ACTOR_COOKIE_NAME = "brokerdesk_actor_id";

export function isActorSwitchingEnabled() {
  if (process.env.BROKER_DESK_ENABLE_ACTOR_SWITCHING === "true") return true;
  return process.env.NODE_ENV !== "production";
}

export async function getActorIdFromCookie(): Promise<string | undefined> {
  if (!isActorSwitchingEnabled()) return undefined;
  try {
    const store = await cookies();
    const value = store.get(ACTOR_COOKIE_NAME)?.value?.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}
