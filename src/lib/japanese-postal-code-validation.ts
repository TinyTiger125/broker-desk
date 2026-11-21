export function normalizeJapanesePostalCode(value: string): string {
  return value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[^\d]/g, "");
}

export function isValidJapanesePostalCode(value: string): boolean {
  return /^\d{7}$/.test(normalizeJapanesePostalCode(value));
}

/** Display complete Japanese postal codes as 123-4567 without changing storage. */
export function formatJapanesePostalCode(value: string): string {
  const digits = normalizeJapanesePostalCode(value);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  // Keep excess input visible so validation can reject it instead of silently truncating it.
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}
