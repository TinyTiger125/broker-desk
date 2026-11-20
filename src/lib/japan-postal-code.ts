import { isValidJapanesePostalCode, normalizeJapanesePostalCode } from "@/lib/japanese-postal-code-validation";
import { gunzipSync } from "node:zlib";
import {
  JAPAN_POSTAL_CODE_INDEX_GZIP_BASE64,
  JAPAN_POSTAL_CODE_INDEX_METADATA,
} from "@/data/japan-postal-code-index";

export { isValidJapanesePostalCode, normalizeJapanesePostalCode } from "@/lib/japanese-postal-code-validation";

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
  candidates: readonly JapanesePostalCodeAddress[];
  source: "japan_post_official";
};

export type JapanesePostalCodeIndexStatus = "ready" | "unavailable";

let parsedPostalCodeIndex: Record<string, JapanesePostalCodeAddress[]> | null | undefined;
let postalCodeIndexUsable: boolean | undefined;

function loadPostalCodeIndex(): Record<string, JapanesePostalCodeAddress[]> | null {
  if (parsedPostalCodeIndex !== undefined) return parsedPostalCodeIndex;
  try {
    const compressed = Buffer.from(JAPAN_POSTAL_CODE_INDEX_GZIP_BASE64, "base64");
    const parsed = JSON.parse(gunzipSync(compressed).toString("utf8")) as unknown;
    parsedPostalCodeIndex = parsed && typeof parsed === "object" ? (parsed as Record<string, JapanesePostalCodeAddress[]>) : null;
  } catch {
    parsedPostalCodeIndex = null;
  }
  return parsedPostalCodeIndex;
}

type PostalCompletionResult = {
  completedFieldKeys: string[];
  lookupCount: number;
  conflictCount: number;
};

const POSTAL_TO_ADDRESS_FIELD_PAIRS = [
  ["client.currentPostalCode", "client.currentAddress"],
  ["property.postalCode", "property.address"],
  ["applicant.currentPostalCode", "applicant.currentAddress"],
  ["applicant.employerPostalCode", "applicant.employerAddress"],
  ["guarantor.postalCode", "guarantor.address"],
  ["emergencyContact.postalCode", "emergencyContact.address"],
] as const;

function isUsablePostalCodeIndex(): boolean {
  if (postalCodeIndexUsable !== undefined) return postalCodeIndexUsable;
  const index = loadPostalCodeIndex();
  const keys = index ? Object.keys(index) : [];
  postalCodeIndexUsable = Boolean(
    JAPAN_POSTAL_CODE_INDEX_METADATA.source.includes("post.japanpost.jp") &&
      JAPAN_POSTAL_CODE_INDEX_METADATA.format === "gzip+base64" &&
      JAPAN_POSTAL_CODE_INDEX_METADATA.postalCodeCount > 0 &&
      keys.length === JAPAN_POSTAL_CODE_INDEX_METADATA.postalCodeCount &&
      index &&
      typeof index === "object" &&
      keys.every((postalCode) => {
        if (!/^\d{7}$/.test(postalCode) || !Array.isArray(index[postalCode]) || index[postalCode].length === 0) return false;
        return index[postalCode].every((entry) => Boolean(
          entry &&
          typeof entry.postalCode === "string" &&
          typeof entry.prefecture === "string" &&
          typeof entry.municipality === "string" &&
          typeof entry.townArea === "string",
        ));
      }),
  );
  return postalCodeIndexUsable;
}

export function getJapanesePostalCodeIndexStatus(): {
  status: JapanesePostalCodeIndexStatus;
  source: string;
  generatedAt: string;
  postalCodeCount: number;
} {
  return {
    status: isUsablePostalCodeIndex() ? "ready" : "unavailable",
    source: JAPAN_POSTAL_CODE_INDEX_METADATA.source,
    generatedAt: JAPAN_POSTAL_CODE_INDEX_METADATA.generatedAt,
    postalCodeCount: JAPAN_POSTAL_CODE_INDEX_METADATA.postalCodeCount,
  };
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function lookupJapanesePostalCode(value: string): JapanesePostalCodeLookup | null {
  const postalCode = normalizeJapanesePostalCode(value);
  if (postalCode.length !== 7) return null;

  const index = loadPostalCodeIndex();
  if (!index || !isUsablePostalCodeIndex()) return null;
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
    source: "japan_post_official",
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
    if (!postalCode || !isValidJapanesePostalCode(postalCode)) continue;
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
