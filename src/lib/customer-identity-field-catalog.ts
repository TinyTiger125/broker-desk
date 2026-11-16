import { extractPartyProfileFromNotes } from "@/lib/party-profile";

/**
 * Customer identity intake is deliberately narrower than the complete Client
 * form. These are existing Client columns with a direct identity-document
 * meaning; document-only facts (document numbers, nationality, residence
 * status, expiry, issuer and insurance details) have no customer destination.
 */
export const CUSTOMER_IDENTITY_FIELDS = {
  name: { label: "氏名", column: "name", kind: "text" },
  nameLatin: { label: "氏名（ラテン文字）", column: "name_latin", kind: "text" },
  nameKanji: { label: "氏名（漢字）", column: "name_kanji", kind: "text" },
  nameKatakana: { label: "氏名（カタカナ）", column: "name_katakana", kind: "text" },
  furigana: { label: "氏名かな", column: "furigana", kind: "text" },
  birthDate: { label: "生年月日", column: "birth_date", kind: "date" },
  gender: { label: "性別", column: "gender", kind: "gender" },
  currentPostalCode: { label: "現住所郵便番号", column: "current_postal_code", kind: "postal_code" },
  currentAddress: { label: "現住所", column: "current_address", kind: "address" },
  phone: { label: "電話番号", column: "phone", kind: "phone" },
  lineId: { label: "LINE ID", column: "line_id", kind: "text" },
  email: { label: "メールアドレス", column: "email", kind: "email" },
} as const;

export type CustomerIdentityFieldKey = keyof typeof CUSTOMER_IDENTITY_FIELDS;
export const CUSTOMER_IDENTITY_FIELD_KEYS = new Set<CustomerIdentityFieldKey>(Object.keys(CUSTOMER_IDENTITY_FIELDS) as CustomerIdentityFieldKey[]);
export type CustomerGender = "male" | "female" | "other";

const CUSTOMER_NAME_FIELD_KEYS = new Set<CustomerIdentityFieldKey>(["name", "nameLatin", "nameKanji", "nameKatakana"]);

/**
 * A name representation is writable only when its printed script matches the
 * destination field. This is intentionally stricter than the model prompt:
 * provenance and script are checked again at the server boundary so a Latin
 * string can never be accepted as a Katakana value merely because the model
 * labelled it that way.
 */
export function isCustomerNameFieldKey(fieldKey: string): fieldKey is CustomerIdentityFieldKey {
  return CUSTOMER_NAME_FIELD_KEYS.has(fieldKey as CustomerIdentityFieldKey);
}

export function isCustomerNameRepresentationValue(fieldKey: string, value: string): boolean {
  const normalized = value.normalize("NFKC").trim();
  if (fieldKey === "name") return normalized.length > 0;
  if (fieldKey === "nameLatin") return /\p{Script=Latin}/u.test(normalized) && /^[\p{Script=Latin}\p{Number}\s.'’\-‐‑‒–—－]+$/u.test(normalized);
  if (fieldKey === "nameKanji") return /^[\p{Script=Han}々〇〆ヶ\s・ー－-]+$/u.test(normalized);
  if (fieldKey === "nameKatakana") return /^[\p{Script=Katakana}ー－・\s-]+$/u.test(normalized);
  return true;
}

/** Compare a candidate with the short exact quote supplied by the reader. */
export function hasExactPrintedIdentityEvidence(value: string, sourceText: string | undefined): boolean {
  if (!value.trim() || !sourceText?.trim()) return false;
  const normalize = (input: string) => input.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
  return normalize(sourceText).includes(normalize(value));
}

const CUSTOMER_GENDER_TOKENS: Record<CustomerGender, Set<string>> = {
  male: new Set(["男性", "男", "male", "m", "man", "masculine"]),
  female: new Set(["女性", "女", "female", "f", "woman", "feminine"]),
  other: new Set(["その他", "其他", "other"]),
};

/**
 * Normalize only an unambiguous gender expression.  OCR often returns both
 * the Japanese and Latin mark (for example `男 M`); accepting all tokens only
 * when they agree keeps that representation usable without guessing through
 * a contradictory value such as `男 / 女`.
 */
export function normalizeCustomerGenderValue(value: string): CustomerGender | null {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/(?:性別|性别|gender|sex)/g, " ")
    .replace(/[()\[\]{}（）［］【】/:：,，、;；|｜\/／]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  const categories = new Set<CustomerGender>();
  const unknownTokens: string[] = [];
  for (const token of normalized.split(" ")) {
    let matched: CustomerGender | undefined;
    for (const category of ["male", "female", "other"] as const) {
      if (CUSTOMER_GENDER_TOKENS[category].has(token)) {
        matched = category;
        break;
      }
    }
    if (matched) categories.add(matched);
    else unknownTokens.push(token);
  }
  return categories.size === 1 && unknownTokens.length === 0 ? [...categories][0] : null;
}

export function isCustomerGenderValue(value: string): value is CustomerGender {
  return value === "male" || value === "female" || value === "other";
}

const APPLICANT_TO_CUSTOMER: Record<string, CustomerIdentityFieldKey> = {
  "applicant.name": "name",
  "applicant.nameLatin": "nameLatin",
  "applicant.nameKanji": "nameKanji",
  "applicant.nameKatakana": "nameKatakana",
  "applicant.furigana": "furigana",
  "applicant.birthDate": "birthDate",
  "applicant.gender": "gender",
  "applicant.currentPostalCode": "currentPostalCode",
  "applicant.currentAddress": "currentAddress",
  "applicant.phone": "phone",
  "applicant.lineId": "lineId",
  "applicant.email": "email",
};

export function customerIdentityFieldKey(fieldKey: string): CustomerIdentityFieldKey | null {
  if (CUSTOMER_IDENTITY_FIELD_KEYS.has(fieldKey as CustomerIdentityFieldKey)) return fieldKey as CustomerIdentityFieldKey;
  return APPLICANT_TO_CUSTOMER[fieldKey] ?? null;
}

export function customerIdentityFieldLabel(fieldKey: string): string {
  const key = customerIdentityFieldKey(fieldKey);
  return key ? CUSTOMER_IDENTITY_FIELDS[key].label : fieldKey;
}

export function normalizeCustomerIdentityValue(fieldKey: CustomerIdentityFieldKey, value: string): string {
  const normalized = value.trim()
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - "０".charCodeAt(0) + "0".charCodeAt(0)))
    .replace(/[／]/g, "/")
    .replace(/[－ー−]/g, "-");
  if (fieldKey === "gender") {
    return normalizeCustomerGenderValue(normalized) ?? normalized;
  }
  if (fieldKey === "birthDate") {
    const western = normalized.match(/^(\d{4})\s*(?:年|[-/.])\s*(\d{1,2})\s*(?:月|[-/.])\s*(\d{1,2})日?$/);
    if (western) return `${western[1]}-${western[2].padStart(2, "0")}-${western[3].padStart(2, "0")}`;
    const era = normalized.match(/^(昭和|平成|令和)\s*(元|\d{1,2})年\s*(\d{1,2})月\s*(\d{1,2})日?$/);
    if (era) {
      const baseYear = era[1] === "昭和" ? 1925 : era[1] === "平成" ? 1988 : 2018;
      const eraYear = era[2] === "元" ? 1 : Number(era[2]);
      return `${baseYear + eraYear}-${String(Number(era[3])).padStart(2, "0")}-${String(Number(era[4])).padStart(2, "0")}`;
    }
    const months: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const named = normalized.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$/)
      ?? normalized.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
    if (named) {
      const dayFirst = /^\d/.test(named[1]);
      const day = dayFirst ? Number(named[1]) : Number(named[2]);
      const monthName = (dayFirst ? named[2] : named[1]).slice(0, 3).toLowerCase();
      const year = Number(named[3]);
      const month = months[monthName];
      if (month) return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  if (fieldKey === "currentPostalCode") {
    const digits = normalized.replace(/[^0-9]/g, "");
    if (digits.length === 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return normalized;
}

/** Calendar-aware validation for the canonical Client birth_date column. */
export function isValidCustomerBirthDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function isStandaloneCustomerTarget(target: { targetType: string; caseId?: string }): boolean {
  return target.targetType === "party" && !target.caseId;
}

/** The four identity documents in this flow describe an individual, never a company record. */
export function isCorporateCustomerRecord(record: { notes?: unknown }): boolean {
  return extractPartyProfileFromNotes(typeof record.notes === "string" ? record.notes : undefined).type === "corporate";
}
