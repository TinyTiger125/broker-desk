export type ParsedCaseDate = {
  iso: string;
  display: string;
};

const COMPACT_DATE = /^(\d{4})(\d{2})(\d{2})$/;
const SEPARATED_DATE = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/;
const JAPANESE_DATE = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/;

function toDateParts(value: string): [number, number, number] | undefined {
  const raw = value.trim();
  const match = COMPACT_DATE.exec(raw) ?? SEPARATED_DATE.exec(raw) ?? JAPANESE_DATE.exec(raw);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || !Number.isInteger(day)) return undefined;
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;

  // Date.UTC treats years 0-99 as 1900-1999, so set the full year after
  // constructing a neutral date and compare every component explicitly.
  const date = new Date(Date.UTC(2000, 0, 1));
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return [year, month, day];
}

export function parseCaseDateInput(value: string): ParsedCaseDate | undefined {
  const parts = toDateParts(value);
  if (!parts) return undefined;
  const [year, month, day] = parts;
  const monthText = String(month).padStart(2, "0");
  const dayText = String(day).padStart(2, "0");
  return {
    iso: `${String(year).padStart(4, "0")}-${monthText}-${dayText}`,
    display: `${String(year).padStart(4, "0")}/${monthText}/${dayText}`,
  };
}

export function isValidCaseDateInput(value: string): boolean {
  const raw = value.trim();
  return raw === "" || Boolean(parseCaseDateInput(raw));
}

export function normalizeCaseDateValue(value: string): string {
  const raw = value.trim();
  return parseCaseDateInput(raw)?.iso ?? raw;
}

export function formatCaseDateForDisplay(value: string): string {
  const raw = value.trim();
  return parseCaseDateInput(raw)?.display ?? raw;
}
