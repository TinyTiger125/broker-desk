import type { BrokerageCase } from "@/lib/data.memory";
import { canonicalizeCaseFieldKey, getCaseFieldValue } from "@/lib/case-field-normalization";
import type { InputFileExtractionResult } from "@/lib/input-file-extractor";

export const CASE_MERGE_HISTORY_KEY = "__caseMergeHistory";
export const CASE_MERGE_MIN_CONFIDENCE = 70;

export type CaseMergeHistoryItem = {
  id: string;
  status: "active" | "rolled_back";
  sourceImportJobId: string;
  sourceImportJobTitle: string;
  mergedAt: string;
  mergedById: string;
  confidenceScore: number;
  matchReasons: string[];
  conflictFields: string[];
  conflictDetails: CaseMergeConflictDetail[];
  addedFields: string[];
  preservedFields: string[];
  beforeConfirmedDataJson: Record<string, unknown>;
  beforeSourceImportJobIds: string[];
  incomingConfirmedDataJson: Record<string, unknown>;
  rolledBackAt?: string;
  splitCaseId?: string;
};

export type CaseMergeConflictDetail = {
  fieldKey: string;
  existingValue: string;
  incomingValue: string;
};

export type CaseMergeCandidateSummary = {
  caseId: string;
  caseTitle: string;
  confidenceScore: number;
  matchReasons: string[];
  conflictFields: string[];
  conflictDetails: CaseMergeConflictDetail[];
  matchedFieldCount: number;
  sourceCount: number;
};

function normalizeComparable(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[　・,，、。.\-ー丁目番号室/／]/g, "");
}

function sameMeaning(left: unknown, right: unknown) {
  const a = normalizeComparable(left);
  const b = normalizeComparable(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function cloneJsonObject(input: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
}

function isMetadataKey(key: string) {
  return key.startsWith("__");
}

export function getCaseMergeHistory(data: Record<string, unknown>): CaseMergeHistoryItem[] {
  const raw = data[CASE_MERGE_HISTORY_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is CaseMergeHistoryItem => {
    return Boolean(item && typeof item === "object" && "id" in item && "sourceImportJobId" in item);
  });
}

export function setCaseMergeHistory(
  data: Record<string, unknown>,
  history: CaseMergeHistoryItem[],
): Record<string, unknown> {
  return {
    ...data,
    [CASE_MERGE_HISTORY_KEY]: history,
  };
}

export function getLatestActiveCaseMerge(data: Record<string, unknown>) {
  return getCaseMergeHistory(data)
    .filter((item) => item.status === "active")
    .sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt))[0];
}

export function buildRawExtractionCaseData(extraction: InputFileExtractionResult): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of extraction.fields) {
    const value = String(field.normalizedValue || field.value || "").trim();
    if (!value) continue;
    data[field.fieldKey] = value;
    const canonicalFieldKey = canonicalizeCaseFieldKey(field.fieldKey);
    if (canonicalFieldKey !== field.fieldKey && !data[canonicalFieldKey]) {
      data[canonicalFieldKey] = value;
    }
  }
  return data;
}

export function evaluateCaseMergeCandidates(input: {
  incomingData: Record<string, unknown>;
  cases: BrokerageCase[];
  currentImportJobId?: string;
}): CaseMergeCandidateSummary[] {
  return input.cases
    .filter((caseItem) => !input.currentImportJobId || !caseItem.sourceImportJobIds.includes(input.currentImportJobId))
    .map((caseItem) => {
      const reasons: string[] = [];
      let score = 0;
      let matchedFieldCount = 0;

      const propertyName = getCaseFieldValue(caseItem.confirmedDataJson, "property.name");
      const incomingPropertyName = getCaseFieldValue(input.incomingData, "property.name");
      if (sameMeaning(propertyName, incomingPropertyName)) {
        score += 45;
        matchedFieldCount += 1;
        reasons.push("物件名が一致");
      }

      const propertyAddress = getCaseFieldValue(caseItem.confirmedDataJson, "property.address");
      const incomingPropertyAddress = getCaseFieldValue(input.incomingData, "property.address");
      if (sameMeaning(propertyAddress, incomingPropertyAddress)) {
        score += 35;
        matchedFieldCount += 1;
        reasons.push("所在地が一致");
      }

      const applicantName = getCaseFieldValue(caseItem.confirmedDataJson, "applicant.name");
      const incomingApplicantName = getCaseFieldValue(input.incomingData, "applicant.name");
      if (sameMeaning(applicantName, incomingApplicantName)) {
        score += 25;
        matchedFieldCount += 1;
        reasons.push("申込者・買主名が一致");
      }

      const applicantBirthDate = getCaseFieldValue(caseItem.confirmedDataJson, "applicant.birthDate");
      const incomingApplicantBirthDate = getCaseFieldValue(input.incomingData, "applicant.birthDate");
      if (sameMeaning(applicantBirthDate, incomingApplicantBirthDate)) {
        score += 30;
        matchedFieldCount += 1;
        reasons.push("申込者の生年月日が一致");
      }

      const applicantAddress = getCaseFieldValue(caseItem.confirmedDataJson, "applicant.currentAddress");
      const incomingApplicantAddress = getCaseFieldValue(input.incomingData, "applicant.currentAddress");
      if (sameMeaning(applicantAddress, incomingApplicantAddress)) {
        score += 20;
        matchedFieldCount += 1;
        reasons.push("申込者住所が一致");
      }

      const sourceCount = caseItem.sourceImportJobIds.length;
      if (matchedFieldCount >= 2) {
        score += 5;
        reasons.push("複数資料の同一案件候補");
      }

      const conflictDetails = listMergeConflictDetails(caseItem.confirmedDataJson, input.incomingData);
      if (conflictDetails.length > 0) {
        score = Math.max(0, score - Math.min(20, conflictDetails.length * 4));
      }

      return {
        caseId: caseItem.id,
        caseTitle: caseItem.caseTitle,
        confidenceScore: Math.min(100, score),
        matchReasons: reasons,
        conflictFields: conflictDetails.map((detail) => detail.fieldKey),
        conflictDetails,
        matchedFieldCount,
        sourceCount,
      };
    })
    .filter((candidate) => candidate.confidenceScore >= CASE_MERGE_MIN_CONFIDENCE)
    .sort((a, b) => b.confidenceScore - a.confidenceScore);
}

export function listMergeConflictFields(
  existingData: Record<string, unknown>,
  incomingData: Record<string, unknown>,
) {
  return listMergeConflictDetails(existingData, incomingData).map((detail) => detail.fieldKey);
}

export function listMergeConflictDetails(
  existingData: Record<string, unknown>,
  incomingData: Record<string, unknown>,
): CaseMergeConflictDetail[] {
  const seen = new Set<string>();
  return Object.entries(incomingData)
    .map(([key, value]) => {
      if (isMetadataKey(key)) return false;
      const canonicalKey = canonicalizeCaseFieldKey(key);
      if (seen.has(canonicalKey)) return false;
      seen.add(canonicalKey);
      const existingValue = getCaseFieldValue(existingData, canonicalKey);
      if (!existingValue || !value || sameMeaning(existingValue, value)) return false;
      return {
        fieldKey: canonicalKey,
        existingValue: String(existingValue),
        incomingValue: String(value),
      };
    })
    .filter((item): item is CaseMergeConflictDetail => Boolean(item));
}

export function mergeConfirmedCaseData(input: {
  existingData: Record<string, unknown>;
  incomingData: Record<string, unknown>;
}) {
  const nextData = cloneJsonObject(input.existingData);
  const addedFields: string[] = [];
  const preservedFields: string[] = [];
  const conflictDetails: CaseMergeConflictDetail[] = [];
  const incomingByCanonicalKey: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input.incomingData)) {
    if (isMetadataKey(key) || value === undefined || value === null || String(value).trim() === "") continue;
    const canonicalKey = canonicalizeCaseFieldKey(key);
    if (!incomingByCanonicalKey[canonicalKey]) incomingByCanonicalKey[canonicalKey] = value;
  }

  for (const [key, value] of Object.entries(incomingByCanonicalKey)) {
    const existingValue = getCaseFieldValue(nextData, key);
    if (!existingValue) {
      nextData[key] = value;
      addedFields.push(key);
    } else if (sameMeaning(existingValue, value)) {
      preservedFields.push(key);
    } else {
      conflictDetails.push({
        fieldKey: key,
        existingValue: String(existingValue),
        incomingValue: String(value),
      });
    }
  }

  return {
    nextData,
    addedFields,
    preservedFields,
    conflictFields: conflictDetails.map((detail) => detail.fieldKey),
    conflictDetails,
  };
}

export function createCaseMergeHistoryItem(input: {
  sourceImportJobId: string;
  sourceImportJobTitle: string;
  mergedById: string;
  confidenceScore: number;
  matchReasons: string[];
  conflictFields: string[];
  conflictDetails: CaseMergeConflictDetail[];
  addedFields: string[];
  preservedFields: string[];
  beforeConfirmedDataJson: Record<string, unknown>;
  beforeSourceImportJobIds: string[];
  incomingConfirmedDataJson: Record<string, unknown>;
}): CaseMergeHistoryItem {
  return {
    id: `merge_${Math.random().toString(36).slice(2, 10)}`,
    status: "active",
    sourceImportJobId: input.sourceImportJobId,
    sourceImportJobTitle: input.sourceImportJobTitle,
    mergedAt: new Date().toISOString(),
    mergedById: input.mergedById,
    confidenceScore: input.confidenceScore,
    matchReasons: input.matchReasons,
    conflictFields: input.conflictFields,
    conflictDetails: input.conflictDetails,
    addedFields: input.addedFields,
    preservedFields: input.preservedFields,
    beforeConfirmedDataJson: cloneJsonObject(input.beforeConfirmedDataJson),
    beforeSourceImportJobIds: [...input.beforeSourceImportJobIds],
    incomingConfirmedDataJson: cloneJsonObject(input.incomingConfirmedDataJson),
  };
}

export function markCaseMergeRolledBack(input: {
  baseData: Record<string, unknown>;
  mergeId: string;
  splitCaseId: string;
}) {
  const history = getCaseMergeHistory(input.baseData).map((item) =>
    item.id === input.mergeId
      ? {
          ...item,
          status: "rolled_back" as const,
          rolledBackAt: new Date().toISOString(),
          splitCaseId: input.splitCaseId,
        }
      : item,
  );
  return setCaseMergeHistory(input.baseData, history);
}
