export const CLIENT_INDIVIDUAL_FORM_FIELDS = [
  "nameLatin",
  "nameKanji",
  "nameKatakana",
  "birthDate",
  "gender",
  "employerName",
  "employerAddress",
  "employerPhone",
  "employerFax",
  "annualIncome",
  "annualIncomeAsOf",
  "annualIncomeSource",
] as const;

export const CLIENT_FORM_DEFAULT_SENTINELS: Readonly<Record<string, string>> = {
  budgetType: "total_price",
  purpose: "unspecified",
  stage: "lead",
  temperature: "unspecified",
};

/** Count only meaningful values on a new form; edits retain stored sentinel selections. */
export function isClientFormFieldCounted(field: string, value: unknown, mode: "create" | "edit", touched: ReadonlySet<string>): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  if (mode === "edit" || touched.has(field)) return true;
  return CLIENT_FORM_DEFAULT_SENTINELS[field] !== raw;
}

/**
 * A corporate submission intentionally omits the hidden individual controls.
 * If validation fails, merge the submitted error state over the live form
 * while retaining those omitted fields so switching back cannot erase a draft.
 */
export function preserveClientIndividualFieldsOnCorporateValidation<T extends Record<string, string>>(current: T, submitted: T): T {
  if (String(submitted.partyType ?? "").trim() !== "corporate") return submitted;
  const next = { ...submitted };
  for (const field of CLIENT_INDIVIDUAL_FORM_FIELDS) {
    if (field in current) next[field as keyof T] = current[field as keyof T];
  }
  return next;
}
