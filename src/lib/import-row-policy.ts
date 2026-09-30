/**
 * Normalize values at the Excel boundary so dates, blanks, and human-entered
 * whitespace have one deterministic representation before mapping or saving.
 */
export function normalizeImportCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return value.toISOString().slice(0, 10);
  }
  return String(value)
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Property row imports are additive. A duplicate key is deliberately based on
 * the existing visible name/address pair; no hidden record is inspected and
 * no existing record is overwritten by the import action.
 */
export function buildPropertyImportKey(name: unknown, address: unknown): string | undefined {
  const normalizedName = normalizeImportCellValue(name).toLocaleLowerCase();
  if (!normalizedName) return undefined;
  const normalizedAddress = normalizeImportCellValue(address).toLocaleLowerCase();
  return `${normalizedName}\u001f${normalizedAddress}`;
}
