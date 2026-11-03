import { customerIdentityFieldKey, isValidCustomerBirthDate, normalizeCustomerIdentityValue, type CustomerIdentityFieldKey } from "@/lib/customer-identity-field-catalog";
import type { ObjectImportCandidateRecord, ObjectImportTargetRecord } from "@/lib/object-import-repository";

export type ClientIdentityImportViewLike = {
  target: Pick<ObjectImportTargetRecord, "status">;
  fields: readonly ObjectImportCandidateRecord[];
};

export type ClientIdentityDraftSuggestion = {
  key: CustomerIdentityFieldKey;
  value: string;
};

function validDraftValue(field: CustomerIdentityFieldKey, value: string): boolean {
  if (!value) return false;
  if (field === "birthDate") return isValidCustomerBirthDate(value);
  if (field === "gender") return new Set(["male", "female", "other"]).has(value);
  if (field === "currentPostalCode") return /^\d{3}-?\d{4}$/.test(value);
  if (field === "phone") return /^(?=.*\d)[0-9+()\-\s]{6,30}$/.test(value);
  if (field === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  return true;
}

function hasDifferentAlternative(field: ObjectImportCandidateRecord, fieldKey: CustomerIdentityFieldKey, value: string): boolean {
  const alternatives = Array.isArray(field.provenance.alternatives) ? field.provenance.alternatives : [];
  return alternatives.some((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const alternative = (item as { value?: unknown }).value;
    return typeof alternative === "string"
      && alternative.trim()
      && normalizeCustomerIdentityValue(fieldKey, alternative) !== value;
  });
}

/**
 * Select only low-confidence, non-conflicting values that map to existing
 * customer fields. Different source values for one field are withheld rather
 * than silently choosing one. The caller still decides whether a blank form
 * control may display the suggestion.
 */
export function collectClientIdentityDraftSuggestions(views: readonly ClientIdentityImportViewLike[]): ClientIdentityDraftSuggestion[] {
  const candidates: ClientIdentityDraftSuggestion[] = [];
  for (const view of views) {
    if (view.target.status !== "needs_review") continue;
    for (const field of view.fields) {
      if (field.status !== "low_confidence" || field.finalSource === "human") continue;
      const fieldKey = customerIdentityFieldKey(field.fieldKey);
      if (!fieldKey) continue;
      const value = normalizeCustomerIdentityValue(fieldKey, field.candidateValue ?? "");
      if (!validDraftValue(fieldKey, value)) continue;
      if (["conflict", "not_found"].includes(String(field.provenance.uncertainty)) || hasDifferentAlternative(field, fieldKey, value)) continue;
      const sourceRange = typeof field.provenance.sourceRange === "string" ? field.provenance.sourceRange : "";
      if (sourceRange.includes("model_attribution_blocked=")) continue;
      candidates.push({ key: fieldKey, value });
    }
  }

  const valuesByField = new Map<CustomerIdentityFieldKey, Set<string>>();
  for (const candidate of candidates) {
    const values = valuesByField.get(candidate.key) ?? new Set<string>();
    values.add(candidate.value);
    valuesByField.set(candidate.key, values);
  }
  const seen = new Set<CustomerIdentityFieldKey>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.key)) return false;
    seen.add(candidate.key);
    return valuesByField.get(candidate.key)?.size === 1;
  });
}
