import { isCustomerNameRepresentationValue } from "@/lib/customer-identity-field-catalog";

export type VisibleClientNameField = "nameLatin" | "nameKanji" | "nameKatakana";

/**
 * Map an already extracted name to a visible existing field only when the
 * value's printed script is unambiguous. This never transliterates or
 * fabricates a Katakana value; mixed/unknown text stays in legacy `name`.
 */
export function visibleClientNameFieldFromEvidence(key: string, value: string): VisibleClientNameField | null {
  if (key === "nameLatin" || key === "nameKanji" || key === "nameKatakana") return key;
  if (key !== "name") return null;
  const normalized = value.normalize("NFKC").trim();
  if (!normalized) return null;
  if (isCustomerNameRepresentationValue("nameLatin", normalized)) return "nameLatin";
  if (/^[\p{Script=Han}々〇〆ヶ\s・ー－-]+$/u.test(normalized)) return "nameKanji";
  if (/^[\p{Script=Katakana}ー－・\s-]+$/u.test(normalized)) return "nameKatakana";
  return null;
}
