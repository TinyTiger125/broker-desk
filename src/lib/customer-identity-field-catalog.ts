import { extractPartyProfileFromNotes } from "@/lib/party-profile";

/**
 * Customer identity intake is deliberately narrower than the complete Client
 * form. These are existing Client columns with a direct identity-document
 * meaning; document-only facts (document numbers, nationality, residence
 * status, expiry, issuer and insurance details) have no customer destination.
 */
export const CUSTOMER_IDENTITY_FIELDS = {
  name: { label: "氏名", column: "name", kind: "text" },
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

const APPLICANT_TO_CUSTOMER: Record<string, CustomerIdentityFieldKey> = {
  "applicant.name": "name",
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
    if (/^(男性|男|male|m)$/i.test(normalized)) return "male";
    if (/^(女性|女|female|f)$/i.test(normalized)) return "female";
    if (/^(その他|other)$/i.test(normalized)) return "other";
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
