/**
 * Client-profile money fields are stored as yen.  The current form accepts
 * integer 万円, but old records can contain any exact yen amount because the
 * previous UI accepted yen and did not record a unit provenance marker.
 *
 * The server supplies the existing value from the tenant-owned record and
 * compares the submitted display text with the exact decimal representation
 * below. An unchanged legacy value round-trips as-is; a changed value must be
 * a new integer 万円. Browser-submitted baselines must never be used here.
 */

export type ClientMoneyParseResult = {
  value?: number;
  error: boolean;
  preservedLegacy: boolean;
};

export function formatLegacyYenAsManYen(value?: number): string {
  if (value == null || !Number.isSafeInteger(value) || value < 0) return "";
  const whole = Math.floor(value / 10_000);
  const remainder = value % 10_000;
  if (remainder === 0) return String(whole);
  const fraction = String(remainder).padStart(4, "0").replace(/0+$/, "");
  return `${whole}.${fraction}`;
}

export function isLegacyNonIntegerManYen(value?: number): boolean {
  return value != null && Number.isSafeInteger(value) && value >= 0 && value % 10_000 !== 0;
}

function parseLegacyYen(value: string): number | undefined {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export function parseClientMoneyInput(input: string, authoritativeYenInput: string, allowZero: boolean): ClientMoneyParseResult {
  const raw = input.trim();
  if (!raw) return { value: undefined, error: false, preservedLegacy: false };

  const legacyYen = parseLegacyYen(authoritativeYenInput);
  if (legacyYen !== undefined && raw === formatLegacyYenAsManYen(legacyYen)) {
    return { value: legacyYen, error: false, preservedLegacy: true };
  }

  const parsed = Number(raw);
  const isIntegerInput = /^\d+$/.test(raw);
  const valid = isIntegerInput && Number.isSafeInteger(parsed) && (allowZero ? parsed >= 0 : parsed > 0) && parsed <= Number.MAX_SAFE_INTEGER / 10_000;
  return {
    value: valid ? parsed * 10_000 : undefined,
    error: !valid,
    preservedLegacy: false,
  };
}
