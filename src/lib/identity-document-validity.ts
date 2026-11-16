import type { InputDocumentType, ExtractedInputField } from "@/lib/input-file-extractor";

export type IdentityDocumentValidityStatus = "valid" | "expired" | "unclear" | "not_available";

export type IdentityDocumentValidity = {
  status: IdentityDocumentValidityStatus;
  expiryDate?: string;
  sourceText?: string;
};

type Page = { pageNumber: number; lines: string[] };

const EXPIRY_MARKER = /有効期限|有効期間|満了日|DATE\s+OF\s+EXPIRY|EXPIRY\s+DATE|EXPIRATION\s+DATE|VALID\s+UNTIL|VALID\s+THROUGH|EXPIR(?:Y|ATION)/iu;
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10,
  october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function isoDate(year: number, month: number, day: number): string | undefined {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDate(value: string): string | undefined {
  const normalized = value.normalize("NFKC").replace(/[／．。]/g, (char) => char === "／" ? "/" : ".").trim();
  const westernJapanese = normalized.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (westernJapanese) return isoDate(Number(westernJapanese[1]), Number(westernJapanese[2]), Number(westernJapanese[3]));
  const westernNumeric = normalized.match(/\b(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\b/);
  if (westernNumeric) return isoDate(Number(westernNumeric[1]), Number(westernNumeric[2]), Number(westernNumeric[3]));
  const named = normalized.match(/\b(\d{1,2})\s+([A-Za-z]{3,12})\.?\s+(\d{4})\b/) ?? normalized.match(/\b([A-Za-z]{3,12})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (named) {
    const dayFirst = /^\d/.test(named[1]);
    const day = Number(dayFirst ? named[1] : named[2]);
    const month = MONTHS[(dayFirst ? named[2] : named[1]).toLowerCase()];
    return month ? isoDate(Number(named[3]), month, day) : undefined;
  }
  return undefined;
}

function todayIso(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Inspect only explicit expiry labels. Absence of a label is not proof that a
 * document is expired, so it remains `not_available` and does not fabricate a
 * date. A labelled but unreadable date fails closed as `unclear`.
 */
export function assessIdentityDocumentValidity(input: {
  documentType: InputDocumentType | string;
  pages: readonly Page[];
  now?: Date;
}): IdentityDocumentValidity {
  if (!input.documentType.startsWith("identity_")) return { status: "not_available" };
  const lines = input.pages.flatMap((page) => page.lines.map((line) => line.trim()).filter(Boolean));
  for (let index = 0; index < lines.length; index += 1) {
    if (!EXPIRY_MARKER.test(lines[index])) continue;
    const evidence = [lines[index], lines[index + 1] ?? ""].filter(Boolean).join(" ");
    const expiryDate = parseDate(evidence);
    if (!expiryDate) return { status: "unclear", sourceText: evidence.slice(0, 1000) };
    return {
      status: expiryDate < todayIso(input.now ?? new Date()) ? "expired" : "valid",
      expiryDate,
      sourceText: evidence.slice(0, 1000),
    };
  }
  return { status: "not_available" };
}

/** Keep the exact candidate and source evidence, but prevent an unverified or expired document from auto-saving. */
export function markIdentityFieldsForValidityReview(fields: readonly ExtractedInputField[], validity: IdentityDocumentValidity): ExtractedInputField[] {
  if (validity.status !== "expired" && validity.status !== "unclear") return [...fields];
  const marker = `identity_document_validity=${validity.status}`;
  return fields.map((field) => {
    if (!field.fieldKey.startsWith("applicant.") || !field.value.trim()) return field;
    const sourceRange = [field.sourceRange, marker].filter(Boolean).join("; ");
    return {
      ...field,
      uncertainty: field.uncertainty === "conflict" ? "conflict" : "unclear",
      sourceRange,
    };
  });
}
