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

type ObjectReviewKey =
  | "name" | "phone" | "email" | "lineId" | "furigana" | "birthDate" | "gender" | "currentPostalCode" | "currentAddress" | "area" | "address" | "roomNumber" | "postalCode" | "usage"
  | "sizeSqm" | "listingPrice" | "listingRent" | "listingCommonFee" | "managementFee" | "repairFee" | "notes";
type ReviewValue =
  | { ok: true; scope: "object"; key: ObjectReviewKey; value: string; recordValue: string | number }
  | { ok: true; scope: "case"; key: string; value: string; recordValue: string };
export function validateObjectImportReview(input: ObjectImportReviewInput, target: ObjectImportTargetRecord, field: ObjectImportCandidateRecord, record: Record<string, unknown>): ReviewValue | Exclude<ObjectImportReviewResult, { ok: true }> {
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
      if (key === "phone" && !/^[0-9+()\-\s]{6,30}$/.test(value)) return { ok: false, reason: "invalid_value" };
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
