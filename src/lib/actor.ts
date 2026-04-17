import { cookies } from "next/headers";

export const ACTOR_COOKIE_NAME = "brokerdesk_actor_id";

export async function getActorIdFromCookie(): Promise<string | undefined> {
  try {
    const store = await cookies();
    const value = store.get(ACTOR_COOKIE_NAME)?.value?.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}
