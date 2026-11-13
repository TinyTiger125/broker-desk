const JAPANESE_MOBILE_PREFIXES = ["060", "070", "080", "090"] as const;

/** Normalize user-entered digits without silently truncating invalid input. */
export function normalizeJapaneseMobilePhone(value: string): string {
  return value.normalize("NFKC").replace(/[()\-\s]/g, "");
}

/**
 * Japanese mobile numbers are optional in Broker Desk records. When present,
 * require the complete 11-digit mobile shape and a currently assigned mobile
 * prefix. This deliberately rejects foreign numbers such as 139… even when
 * they happen to contain eleven digits.
 */
export function isJapaneseMobilePhone(value: string): boolean {
  const digits = normalizeJapaneseMobilePhone(value);
  return /^\d{11}$/.test(digits) && JAPANESE_MOBILE_PREFIXES.some((prefix) => digits.startsWith(prefix));
}

export function formatJapaneseMobilePhone(value: string): string {
  const digits = normalizeJapaneseMobilePhone(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
