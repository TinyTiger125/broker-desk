import { existsSync, readFileSync } from "fs";
import { join } from "path";

const POSTAL_CODE_INDEX_PATH = join(process.cwd(), ".broker-desk", "japan-postal-code-index.json");
const POSTAL_CODE_LOOKUP_STATUS_KEY = "__postalCodeLookups";

export type JapanesePostalCodeAddress = {
  postalCode: string;
  prefecture: string;
  municipality: string;
  townArea: string;
};

export type JapanesePostalCodeLookup = {
  postalCode: string;
  prefecture: string;
  municipality: string;
  townArea: string;
  addressPrefix: string;
  candidates: JapanesePostalCodeAddress[];
  source: "local_index" | "fallback_seed";
};

type PostalCodeIndexFile = {
  generatedAt?: string;
  source?: string;
  entriesByPostalCode?: Record<string, JapanesePostalCodeAddress[]>;
};

type PostalCompletionResult = {
  completedFieldKeys: string[];
  lookupCount: number;
  conflictCount: number;
};

const FALLBACK_POSTAL_CODE_INDEX: Record<string, JapanesePostalCodeAddress[]> = {
  "1000005": [{ postalCode: "1000005", prefecture: "東京都", municipality: "千代田区", townArea: "丸の内" }],
  "1040053": [{ postalCode: "1040053", prefecture: "東京都", municipality: "中央区", townArea: "晴海" }],
  "1060032": [{ postalCode: "1060032", prefecture: "東京都", municipality: "港区", townArea: "六本木" }],
  "1350061": [{ postalCode: "1350061", prefecture: "東京都", municipality: "江東区", townArea: "豊洲" }],
  "1410032": [{ postalCode: "1410032", prefecture: "東京都", municipality: "品川区", townArea: "大崎" }],
  "1500002": [{ postalCode: "1500002", prefecture: "東京都", municipality: "渋谷区", townArea: "渋谷" }],
  "1540024": [{ postalCode: "1540024", prefecture: "東京都", municipality: "世田谷区", townArea: "三軒茶屋" }],
  "1600023": [{ postalCode: "1600023", prefecture: "東京都", municipality: "新宿区", townArea: "西新宿" }],
  "1700013": [{ postalCode: "1700013", prefecture: "東京都", municipality: "豊島区", townArea: "東池袋" }],
  "1710022": [{ postalCode: "1710022", prefecture: "東京都", municipality: "豊島区", townArea: "南池袋" }],
};

const POSTAL_TO_ADDRESS_FIELD_PAIRS = [
  ["property.postalCode", "property.address"],
  ["applicant.currentPostalCode", "applicant.currentAddress"],
  ["applicant.employerPostalCode", "applicant.employerAddress"],
  ["guarantor.postalCode", "guarantor.address"],
  ["emergencyContact.postalCode", "emergencyContact.address"],
] as const;

let cachedIndex: Record<string, JapanesePostalCodeAddress[]> | undefined;

export function normalizeJapanesePostalCode(value: string): string {
  return value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[^\d]/g, "")
    .slice(0, 7);
}

function loadPostalCodeIndex(): Record<string, JapanesePostalCodeAddress[]> {
  if (cachedIndex) return cachedIndex;
  if (existsSync(POSTAL_CODE_INDEX_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(POSTAL_CODE_INDEX_PATH, "utf8")) as PostalCodeIndexFile;
      if (parsed.entriesByPostalCode && typeof parsed.entriesByPostalCode === "object") {
        cachedIndex = parsed.entriesByPostalCode;
        return cachedIndex;
      }
    } catch {
      // Fall back to the minimal seed index; lookup must never break the workbench.
    }
  }
  cachedIndex = FALLBACK_POSTAL_CODE_INDEX;
  return cachedIndex;
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function lookupJapanesePostalCode(value: string): JapanesePostalCodeLookup | null {
  const postalCode = normalizeJapanesePostalCode(value);
  if (postalCode.length !== 7) return null;

  const index = loadPostalCodeIndex();
  const candidates = index[postalCode] ?? [];
  if (candidates.length === 0) return null;

  const prefectures = uniqueValues(candidates.map((candidate) => candidate.prefecture));
  const municipalities = uniqueValues(candidates.map((candidate) => candidate.municipality));
  const townAreas = uniqueValues(candidates.map((candidate) => candidate.townArea));
  const prefecture = prefectures.length === 1 ? prefectures[0] : "";
  const municipality = municipalities.length === 1 ? municipalities[0] : "";
  const townArea = townAreas.length === 1 ? townAreas[0] : "";
  return {
    postalCode,
    prefecture,
    municipality,
    townArea,
    addressPrefix: `${prefecture}${municipality}${townArea}`,
    candidates,
    source: index === FALLBACK_POSTAL_CODE_INDEX ? "fallback_seed" : "local_index",
  };
}

function readText(data: Record<string, unknown>, fieldKey: string): string {
  const value = data[fieldKey];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function hasJapanesePrefecture(value: string): boolean {
  return /^(東京都|北海道|京都府|大阪府|.{2,3}県)/.test(value.trim());
}

function completeAddressWithLookup(address: string, lookup: JapanesePostalCodeLookup): { value: string; partial: boolean; conflict: boolean } {
  const normalizedAddress = address.replace(/^〒?\s*\d{3}-?\d{4}\s*/, "").trim();
  if (!lookup.prefecture || !lookup.municipality) return { value: normalizedAddress, partial: true, conflict: false };

  const administrativePrefix = `${lookup.prefecture}${lookup.municipality}`;
  const fullPrefix = lookup.addressPrefix || administrativePrefix;
  if (!normalizedAddress) return { value: fullPrefix, partial: true, conflict: false };
  if (normalizedAddress.startsWith(fullPrefix) || normalizedAddress.startsWith(administrativePrefix)) {
    return { value: normalizedAddress, partial: false, conflict: false };
  }
  if (normalizedAddress.startsWith(lookup.municipality)) {
    return { value: `${lookup.prefecture}${normalizedAddress}`, partial: false, conflict: false };
  }
  if (lookup.townArea && normalizedAddress.startsWith(lookup.townArea)) {
    return { value: `${administrativePrefix}${normalizedAddress}`, partial: false, conflict: false };
  }
  if (hasJapanesePrefecture(normalizedAddress)) {
    return { value: normalizedAddress, partial: false, conflict: true };
  }
  return { value: `${fullPrefix}${normalizedAddress}`, partial: false, conflict: false };
}

export function applyJapanesePostalCodeAddressCompletions(input: {
  confirmedData: Record<string, unknown>;
  statusMap?: Record<string, string>;
}): PostalCompletionResult {
  const completedFieldKeys = new Set<string>();
  const lookups: Record<string, unknown> =
    input.confirmedData[POSTAL_CODE_LOOKUP_STATUS_KEY] && typeof input.confirmedData[POSTAL_CODE_LOOKUP_STATUS_KEY] === "object"
      ? { ...(input.confirmedData[POSTAL_CODE_LOOKUP_STATUS_KEY] as Record<string, unknown>) }
      : {};
  let lookupCount = 0;
  let conflictCount = 0;

  for (const [postalFieldKey, addressFieldKey] of POSTAL_TO_ADDRESS_FIELD_PAIRS) {
    const postalCode = normalizeJapanesePostalCode(readText(input.confirmedData, postalFieldKey));
    if (!postalCode) continue;
    if (postalCode !== readText(input.confirmedData, postalFieldKey)) {
      input.confirmedData[postalFieldKey] = postalCode;
      completedFieldKeys.add(postalFieldKey);
    }

    const lookup = lookupJapanesePostalCode(postalCode);
    if (!lookup) continue;
    lookupCount += 1;
    lookups[postalFieldKey] = {
      postalCode: lookup.postalCode,
      prefecture: lookup.prefecture,
      municipality: lookup.municipality,
      townArea: lookup.townArea,
      addressPrefix: lookup.addressPrefix,
      source: lookup.source,
      candidateCount: lookup.candidates.length,
    };

    const currentAddress = readText(input.confirmedData, addressFieldKey);
    const completed = completeAddressWithLookup(currentAddress, lookup);
    if (completed.conflict) {
      conflictCount += 1;
      if (input.statusMap) input.statusMap[addressFieldKey] = "needs_review";
      continue;
    }
    if (completed.value && completed.value !== currentAddress) {
      input.confirmedData[addressFieldKey] = completed.value;
      completedFieldKeys.add(addressFieldKey);
      if (input.statusMap) input.statusMap[addressFieldKey] = completed.partial ? "needs_review" : "confirmed";
    }
  }

  if (Object.keys(lookups).length > 0) input.confirmedData[POSTAL_CODE_LOOKUP_STATUS_KEY] = lookups;
  return {
    completedFieldKeys: [...completedFieldKeys],
    lookupCount,
    conflictCount,
  };
}
