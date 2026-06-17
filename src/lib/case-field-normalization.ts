import { CASE_FIELD_ALIASES } from "@/lib/case-field-catalog";

const ALIAS_TO_CANONICAL = Object.entries(CASE_FIELD_ALIASES).reduce<Record<string, string>>((acc, [canonical, aliases]) => {
  aliases.forEach((alias) => {
    if (!acc[alias]) acc[alias] = canonical;
  });
  return acc;
}, {});

export { CASE_FIELD_ALIASES };

export function canonicalizeCaseFieldKey(fieldKey: string): string {
  return ALIAS_TO_CANONICAL[fieldKey] ?? fieldKey;
}

export function getCaseFieldAliases(canonicalFieldKey: string): string[] {
  return [...(CASE_FIELD_ALIASES[canonicalFieldKey] ?? [canonicalFieldKey])];
}

export function getCaseFieldValue(confirmedData: Record<string, unknown>, canonicalFieldKey: string): string {
  for (const alias of getCaseFieldAliases(canonicalFieldKey)) {
    const value = confirmedData[alias];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

export function clearCaseFieldValueAliases(confirmedData: Record<string, unknown>, canonicalFieldKey: string) {
  getCaseFieldAliases(canonicalFieldKey).forEach((alias) => {
    delete confirmedData[alias];
  });
}
