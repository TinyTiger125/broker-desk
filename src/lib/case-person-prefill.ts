export const CASE_PERSON_PREFILL_FIELDS = [
  { clientKey: "name", fieldKey: "applicant.name" },
  { clientKey: "phone", fieldKey: "applicant.phone" },
  { clientKey: "email", fieldKey: "applicant.email" },
] as const;

export type CasePersonPrefillFieldKey = (typeof CASE_PERSON_PREFILL_FIELDS)[number]["fieldKey"];

export type CasePersonPrefillCandidate = {
  id: string;
  name: string;
  phone: string;
  email?: string;
};

export function isCasePersonPrefillFieldKey(value: string): value is CasePersonPrefillFieldKey {
  return CASE_PERSON_PREFILL_FIELDS.some((field) => field.fieldKey === value);
}

export function buildApplicantPrefillValues(input: {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
}): Record<CasePersonPrefillFieldKey, string> {
  return {
    "applicant.name": typeof input.name === "string" ? input.name.trim() : "",
    "applicant.phone": typeof input.phone === "string" ? input.phone.trim() : "",
    "applicant.email": typeof input.email === "string" ? input.email.trim() : "",
  };
}
