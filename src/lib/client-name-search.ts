import type { Client } from "@/lib/data.memory";

/**
 * Search all persisted customer name representations without changing the
 * stored values. NFKC keeps full-width/half-width variants discoverable while
 * preserving Hanzi, Katakana, and Latin text as entered.
 */
export function normalizeClientNameSearch(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export function clientNameSearchValues(client: Pick<Client, "name" | "nameLatin" | "nameKanji" | "nameKatakana">): string[] {
  return [client.name, client.nameLatin, client.nameKanji, client.nameKatakana]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

export function matchesClientNameSearch(
  client: Pick<Client, "name" | "nameLatin" | "nameKanji" | "nameKatakana">,
  query: string,
): boolean {
  const normalizedQuery = normalizeClientNameSearch(query);
  if (!normalizedQuery) return true;
  return clientNameSearchValues(client).some((value) => normalizeClientNameSearch(value).includes(normalizedQuery));
}

export function sharesClientNameRepresentation(
  left: Pick<Client, "name" | "nameLatin" | "nameKanji" | "nameKatakana">,
  right: Pick<Client, "name" | "nameLatin" | "nameKanji" | "nameKatakana">,
): boolean {
  const rightNames = new Set(clientNameSearchValues(right).map(normalizeClientNameSearch));
  return clientNameSearchValues(left).some((value) => rightNames.has(normalizeClientNameSearch(value)));
}
