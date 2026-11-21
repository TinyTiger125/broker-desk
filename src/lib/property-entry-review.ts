import type { EntryPreviewCandidate } from "@/lib/entry-preview";
import { isValidJapanesePostalCode } from "@/lib/japanese-postal-code-validation";

export const PROPERTY_REVIEW_FIELDS = new Set([
  "name", "furigana", "area", "postalCode", "address", "roomNumber", "usage",
  "listingPrice", "listingRent", "listingCommonFee", "managementFee", "repairFee", "sizeSqm", "notes",
]);

export function groupPropertyReviewCandidates(candidates: readonly EntryPreviewCandidate[]) {
  const rows = new Map<string, EntryPreviewCandidate[]>();
  for (const candidate of candidates) {
    if (!PROPERTY_REVIEW_FIELDS.has(candidate.key) || !candidate.value.trim() || candidate.uncertainty === "not_found") continue;
    const row = rows.get(candidate.key) ?? [];
    row.push(candidate);
    rows.set(candidate.key, row);
  }
  return [...rows].map(([key, options]) => ({ key, label: options[0].label, options }));
}

export function validatePropertyReviewValue(key: string, value: string): boolean {
  if (!PROPERTY_REVIEW_FIELDS.has(key) || !value.trim()) return false;
  if (key === "postalCode") return isValidJapanesePostalCode(value);
  if (["listingPrice", "listingRent", "listingCommonFee", "managementFee", "repairFee", "sizeSqm"].includes(key)) {
    if (!/^\d+(?:\.\d+)?$/.test(value.trim())) return false;
    const amount = Number(value);
    if (key === "sizeSqm") return Number.isFinite(amount) && amount > 0 && amount <= 1_000_000;
    return Number.isSafeInteger(amount) && amount <= 2_147_483_647 && (key === "listingPrice" ? amount > 0 : amount >= 0);
  }
  return true;
}
