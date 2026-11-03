export const CLIENT_INDIVIDUAL_FORM_FIELDS = [
  "birthDate",
  "gender",
  "employerName",
  "employerAddress",
  "employerPhone",
  "annualIncome",
  "annualIncomeAsOf",
  "annualIncomeSource",
] as const;

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
