import { customerIdentityFieldKey, isValidCustomerBirthDate, normalizeCustomerIdentityValue, type CustomerIdentityFieldKey } from "@/lib/customer-identity-field-catalog";
import type { ObjectImportCandidateRecord, ObjectImportTargetRecord } from "@/lib/object-import-repository";

export type ClientIdentityImportViewLike = {
  target: Pick<ObjectImportTargetRecord, "status" | "targetVersion">;
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

function isNonActualCurrentAddress(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, "");
  return /^(?:住所|住居地)?(?:未定|未确认|不明|なし|n\/a|-)$/i.test(normalized);
}

function alternativeValues(field: ObjectImportCandidateRecord, fieldKey: CustomerIdentityFieldKey): string[] {
  const alternatives = Array.isArray(field.provenance.alternatives) ? field.provenance.alternatives : [];
  return alternatives.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const alternative = (item as { value?: unknown }).value;
    if (typeof alternative !== "string" || !alternative.trim()) return [];
    return [normalizeCustomerIdentityValue(fieldKey, alternative)];
  }).filter((value): value is string => typeof value === "string" && Boolean(value));
}

/**
 * Select only low-confidence, non-conflicting values that map to existing
 * customer fields. Different source values for one field are withheld rather
 * than silently choosing one. The caller still decides whether a blank form
 * control may display the suggestion.
 */
export function collectClientIdentityDraftSuggestions(views: readonly ClientIdentityImportViewLike[], expectedProfileVersion: string): ClientIdentityDraftSuggestion[] {
  if (!expectedProfileVersion.trim()) return [];
  const candidates: ClientIdentityDraftSuggestion[] = [];
  const valuesByField = new Map<CustomerIdentityFieldKey, Set<string>>();
  const blockedFields = new Set<CustomerIdentityFieldKey>();

  const addValue = (key: CustomerIdentityFieldKey, value: string) => {
    if (!validDraftValue(key, value) || (key === "currentAddress" && isNonActualCurrentAddress(value))) return;
    const values = valuesByField.get(key) ?? new Set<string>();
    values.add(value);
    valuesByField.set(key, values);
  };

  for (const view of views) {
    // The target version is the upload-time profile fingerprint. A changed
    // profile must never project an old candidate back into the edit form.
    if (view.target.targetVersion !== expectedProfileVersion) continue;
    for (const field of view.fields) {
      const fieldKey = customerIdentityFieldKey(field.fieldKey);
      if (!fieldKey) continue;
      const value = normalizeCustomerIdentityValue(fieldKey, field.candidateValue ?? "");
      const alternatives = alternativeValues(field, fieldKey);
      const hasDifferentAlternative = alternatives.some((alternative) => alternative !== value);
      if (hasDifferentAlternative || field.provenance.uncertainty === "conflict") blockedFields.add(fieldKey);
      if (value && !validDraftValue(fieldKey, value) && !(fieldKey === "currentAddress" && isNonActualCurrentAddress(value))) blockedFields.add(fieldKey);
      if (!["failed", "not_found"].includes(field.status) && value) addValue(fieldKey, value);
      for (const alternative of alternatives) addValue(fieldKey, alternative);

      if (view.target.status !== "needs_review" || field.status !== "low_confidence" || field.finalSource === "human") continue;
      if (!validDraftValue(fieldKey, value) || (fieldKey === "currentAddress" && isNonActualCurrentAddress(value))) continue;
      if (["conflict", "not_found"].includes(String(field.provenance.uncertainty)) || hasDifferentAlternative) continue;
      const sourceRange = typeof field.provenance.sourceRange === "string" ? field.provenance.sourceRange : "";
      if (sourceRange.includes("model_attribution_blocked=")) continue;
      candidates.push({ key: fieldKey, value });
    }
  }

  const seen = new Set<CustomerIdentityFieldKey>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.key)) return false;
    seen.add(candidate.key);
    return !blockedFields.has(candidate.key) && valuesByField.get(candidate.key)?.size === 1;
  });
}
