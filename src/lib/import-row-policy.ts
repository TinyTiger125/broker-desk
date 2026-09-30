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
 * Property name/address is only a candidate identity signal. The current
 * Property model has no room/unit or source-business identity field, so this
 * pair must never be treated as a unique key that drops a row.
 */
export function buildPropertyImportKey(name: unknown, address: unknown): string | undefined {
  const normalizedName = normalizeImportCellValue(name).toLocaleLowerCase();
  if (!normalizedName) return undefined;
  const normalizedAddress = normalizeImportCellValue(address).toLocaleLowerCase();
  return `${normalizedName}\u001f${normalizedAddress}`;
}

/**
 * Exact duplicate detection is deliberately limited to the raw row within
 * one uploaded file. It is not compared to existing business records.
 */
export function buildPropertyImportRowFingerprint(row: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(row)
      .sort()
      .map((key) => [key, normalizeImportCellValue(row[key])]),
  );
}
