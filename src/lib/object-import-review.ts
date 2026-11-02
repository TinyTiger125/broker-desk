import type { RequestContext } from "@/lib/visibility-resolver";
import type { ObjectImportCandidateRecord, ObjectImportTargetRecord } from "@/lib/object-import-repository";
import { buildObjectVersionFingerprint, normalizeObjectImportFieldKey } from "@/lib/object-import-contract";
import { getCaseContactValidationError } from "@/lib/case-contact-validation";
import { getCaseFieldDefinition } from "@/lib/case-field-catalog";
import { customerIdentityFieldKey, isCorporateCustomerRecord, isStandaloneCustomerTarget, isValidCustomerBirthDate } from "@/lib/customer-identity-field-catalog";

export type ObjectImportReviewInput = {
  context: RequestContext; targetId: string; fieldId: string;
  expectedVersion: string; expectedCandidateValue: string;
  decision: "confirm" | "reject"; value?: string; caseFieldKey?: string;
};
export type ObjectImportReviewResult =
  | { ok: true; caseId?: string; targetId: string; targetVersion: string }
  | { ok: false; reason: "not_writable" | "conflict" | "invalid_value" | "already_reviewed" | "unsupported_target" };

// Case facts written by the object-import worker must never replace an
// explicit human deletion. Keep this marker inside the existing JSON document
// so the rule is atomic with the ordinary case save and needs no parallel
// table/migration. It is deliberately scoped to reader-backed lease facts;
// other case metadata must not affect the worker's write boundary.
export const OBJECT_IMPORT_MANUAL_CLEARED_CASE_FIELDS_KEY = "__manualClearedObjectImportCaseFields";

function isObjectImportCaseFieldKey(key: string): boolean {
  return /^lease\./.test(key);
}

export function getObjectImportManualClearedCaseFields(confirmedDataJson: Record<string, unknown>): Set<string> {
  const value = confirmedDataJson[OBJECT_IMPORT_MANUAL_CLEARED_CASE_FIELDS_KEY];
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((item): item is string => typeof item === "string" && isObjectImportCaseFieldKey(item)));
}

export function recordObjectImportManualCaseClears(
  previousData: Record<string, unknown>,
  nextData: Record<string, unknown>,
): Record<string, unknown> {
  const cleared = getObjectImportManualClearedCaseFields(previousData);
  for (const key of new Set([...Object.keys(previousData), ...Object.keys(nextData)])) {
    if (!isObjectImportCaseFieldKey(key)) continue;
    const previousValue = typeof previousData[key] === "string" ? previousData[key].trim() : previousData[key];
    const nextValue = typeof nextData[key] === "string" ? nextData[key].trim() : nextData[key];
    if (previousValue && !nextValue) cleared.add(key);
    else if (nextValue) cleared.delete(key);
  }
  const result = { ...nextData };
  if (cleared.size > 0) result[OBJECT_IMPORT_MANUAL_CLEARED_CASE_FIELDS_KEY] = [...cleared].sort();
  else delete result[OBJECT_IMPORT_MANUAL_CLEARED_CASE_FIELDS_KEY];
  return result;
}

export function isObjectImportCaseFieldManuallyCleared(confirmedDataJson: Record<string, unknown>, key: string): boolean {
  return getObjectImportManualClearedCaseFields(confirmedDataJson).has(key);
}

type ObjectReviewKey =
  | "name" | "phone" | "email" | "lineId" | "furigana" | "birthDate" | "gender" | "currentPostalCode" | "currentAddress" | "area" | "address" | "roomNumber" | "postalCode" | "usage"
  | "sizeSqm" | "listingPrice" | "listingRent" | "listingCommonFee" | "managementFee" | "repairFee" | "notes";
type ReviewValue =
  | { ok: true; scope: "object"; key: ObjectReviewKey; value: string; recordValue: string | number }
  | { ok: true; scope: "case"; key: string; value: string; recordValue: string };
export function validateObjectImportReview(input: Omit<ObjectImportReviewInput, "context">, target: ObjectImportTargetRecord, field: ObjectImportCandidateRecord, record: Record<string, unknown>): ReviewValue | Exclude<ObjectImportReviewResult, { ok: true }> {
  if (target.targetType !== "party" && target.targetType !== "property") return { ok: false, reason: "unsupported_target" };
  if (target.targetType === "party" && isCorporateCustomerRecord(record)) return { ok: false, reason: "not_writable" };
  if (!target.sourceAttachmentId || field.provenance.sourceAttachmentId !== target.sourceAttachmentId || typeof field.provenance.sourceFileHash !== "string" || !field.provenance.sourceFileHash) return { ok: false, reason: "not_writable" };
  if (field.finalSource === "human" || ["confirmed", "rejected", "not_found"].includes(field.status)) return { ok: false, reason: "already_reviewed" };
  if (target.status !== "needs_review" || target.targetVersion !== input.expectedVersion || buildObjectVersionFingerprint(record) !== input.expectedVersion || (field.candidateValue ?? "") !== input.expectedCandidateValue) return { ok: false, reason: "conflict" };
  if (input.decision !== "confirm" && input.decision !== "reject") return { ok: false, reason: "invalid_value" };
  // Property uploads write the existing shared property profile fields. Lease
  // keys remain case facts because they are contract-specific snapshots.
  const readerCaseField = target.targetType === "property" && /^lease\./.test(field.fieldKey)
    ? field.fieldKey
    : undefined;
  if (readerCaseField) {
    if (!target.caseId) return { ok: false, reason: "invalid_value" };
    const definition = getCaseFieldDefinition(readerCaseField);
    if (!definition || definition.storageScope !== "case_fact" || input.caseFieldKey !== readerCaseField) return { ok: false, reason: "invalid_value" };
    const value = (input.value ?? field.candidateValue ?? "").trim();
    if (input.decision === "confirm" && !value) return { ok: false, reason: "invalid_value" };
    return { ok: true, scope: "case", key: readerCaseField, value, recordValue: value };
  }
  let fieldKey: string;
  try {
    fieldKey = isStandaloneCustomerTarget(target)
      ? customerIdentityFieldKey(field.fieldKey) ?? (() => { throw new Error("customer_field_not_writable"); })()
      : normalizeObjectImportFieldKey(target.targetType, field.fieldKey);
  } catch { return { ok: false, reason: "invalid_value" }; }
  const value = (input.value ?? field.candidateValue ?? "").trim();
  const key = (fieldKey === "listing_price" ? "listingPrice" : fieldKey) as ObjectReviewKey;
  const numericKey = target.targetType === "property" && new Set(["sizeSqm", "listingPrice", "listingRent", "listingCommonFee", "managementFee", "repairFee"]).has(key);
  const numericValue = Number(value);
  const recordValue = numericKey ? numericValue : value;
  if (input.decision === "confirm") {
    if (!value) return { ok: false, reason: "invalid_value" };
    if (isStandaloneCustomerTarget(target)) {
      if (key === "birthDate" && !isValidCustomerBirthDate(value)) return { ok: false, reason: "invalid_value" };
      if (key === "gender" && !new Set(["male", "female", "other"]).has(value)) return { ok: false, reason: "invalid_value" };
      if (key === "currentPostalCode" && !/^\d{3}-?\d{4}$/.test(value)) return { ok: false, reason: "invalid_value" };
      if (key === "phone" && !/^(?=.*\d)[0-9+()\-\s]{6,30}$/.test(value)) return { ok: false, reason: "invalid_value" };
      if (key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { ok: false, reason: "invalid_value" };
    } else if (target.targetType === "party" && getCaseContactValidationError(`applicant.${key}`, value, "ja")) {
      return { ok: false, reason: "invalid_value" };
    }
    if (numericKey) {
      const validSize = key === "sizeSqm" && /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(numericValue) && numericValue > 0 && numericValue <= 1_000_000;
      const validMoney = key !== "sizeSqm" && /^\d+$/.test(value) && Number.isSafeInteger(numericValue) && (key === "listingPrice" ? numericValue > 0 : numericValue >= 0) && numericValue <= 2_147_483_647;
      if (!(validSize || validMoney)) return { ok: false, reason: "invalid_value" };
    }
  }
  return { ok: true, scope: "object", key, value, recordValue };
}

export function isSafeModelAutoSave(field: ObjectImportCandidateRecord): boolean {
  const candidateValue = field.candidateValue?.trim() ?? "";
  return field.status === "draft" && field.provenance.uncertainty === "clear"
    && (field.confidence ?? 0) >= 0.8 && Boolean(candidateValue)
    && !(field.fieldKey === "currentAddress" && /^(?:住所|住居地)?(?:未定|未確認|不明|なし|n\/a|-)$/i.test(candidateValue.replace(/\s+/g, "")))
    && field.finalSource !== "human";
}

export function isEmptyModelDestination(key: string, current: unknown): boolean {
  return current == null || current === "" || (key === "listingPrice" && current === 0);
}
