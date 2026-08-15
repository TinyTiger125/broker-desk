export function normalizeJapanesePostalCode(value: string): string {
  return value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[^\d]/g, "");
}

export function isValidJapanesePostalCode(value: string): boolean {
  return /^\d{7}$/.test(normalizeJapanesePostalCode(value));
}
