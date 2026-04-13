import { cookies } from "next/headers";

export const LOCALE_COOKIE_NAME = "brokerdesk_locale";
export const SUPPORTED_LOCALES = ["ja", "zh", "ko"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE_NAME)?.value?.trim();
  if (value && isLocale(value)) return value;
  return "ja";
}
