import type { RequestContext } from "@/lib/visibility-resolver";
import type { ObjectImportCandidateRecord, ObjectImportTargetRecord } from "@/lib/object-import-repository";
import { buildObjectVersionFingerprint, normalizeObjectImportFieldKey } from "@/lib/object-import-contract";
import { getCaseContactValidationError } from "@/lib/case-contact-validation";
import { getCaseFieldDefinition } from "@/lib/case-field-catalog";
import { customerIdentityFieldKey, hasExactPrintedIdentityEvidence, isCorporateCustomerRecord, isCustomerNameFieldKey, isCustomerNameRepresentationValue, isStandaloneCustomerTarget, isValidCustomerBirthDate } from "@/lib/customer-identity-field-catalog";

export type ObjectImportReviewInput = {
  context: RequestContext; targetId: string; fieldId: string;
  expectedVersion: string; expectedCandidateValue: string;
  decision: "confirm" | "reject"; value?: string; caseFieldKey?: string; manualAttestation?: boolean;
};
export type ObjectImportReviewResult =
  | { ok: true; caseId?: string; targetId: string; targetVersion: string }
  | { ok: false; reason: "not_writable" | "conflict" | "invalid_value" | "already_reviewed" | "unsupported_target" };

const TERMINAL_OBJECT_IMPORT_CANDIDATE_STATUSES = new Set(["confirmed", "rejected", "failed", "not_found"]);

/** Only an actionable target with unresolved candidate rows is a review badge. */
export function hasPendingObjectImportReview(targetStatus: string, candidateStatuses: readonly string[]): boolean {
  if (targetStatus === "conflict") return true;
  if (targetStatus !== "needs_review") return false;
  return candidateStatuses.some((status) => !TERMINAL_OBJECT_IMPORT_CANDIDATE_STATUSES.has(status));
}

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
  | "name" | "nameLatin" | "nameKanji" | "nameKatakana" | "phone" | "email" | "lineId" | "furigana" | "birthDate" | "gender" | "currentPostalCode" | "currentAddress" | "area" | "address" | "roomNumber" | "postalCode" | "usage"
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
      // A residence-card address is evidence about the document, not proof of
      // the customer's current address. Keep it visible for comparison, but
      // require a separate current-address workflow before any write.
      if (key === "currentAddress") return { ok: false, reason: "invalid_value" };
      const manualBirthDate = key === "birthDate" && input.manualAttestation === true;
      const manualBirthDateAttributable = manualBirthDate && isObjectImportManualBirthDateAttributable(field);
      const identityReviewReasons = getObjectImportIdentityReviewReasonCodes(field);
      if (identityReviewReasons.some((reason) => ["expired_document", "unclear_document_validity", "attribution_blocked", "conflicting_candidates", "missing_subject", "non_holder_subject"].includes(reason))
        && !manualBirthDateAttributable) {
        return { ok: false, reason: "invalid_value" };
      }
      // The worker persists this server-computed consistency result with every
      // candidate. Old records without it fail closed rather than treating a
      // quoted value as proof. Birth date is the sole stable fact that may be
      // entered manually after an explicit human attestation against the
      // original; the model quote remains untrusted and is never used as proof.
      const birthDateNeedsManualReview = isObjectImportBirthDateManualReviewRequired(field);
      if (manualBirthDate && !isObjectImportManualBirthDateAttributable(field)) return { ok: false, reason: "invalid_value" };
      if (birthDateNeedsManualReview && !manualBirthDate) return { ok: false, reason: "invalid_value" };
      if (field.provenance.pageEvidenceVerified !== true && !manualBirthDate) return { ok: false, reason: "invalid_value" };
      if (key === "birthDate" && !isValidCustomerBirthDate(value)) return { ok: false, reason: "invalid_value" };
      if (key === "gender" && !new Set(["male", "female", "other"]).has(value)) return { ok: false, reason: "invalid_value" };
      if (isCustomerNameFieldKey(key)
        && (field.provenance.pageEvidenceVerified !== true
          || !isCustomerNameRepresentationValue(key, value)
          || !hasExactPrintedIdentityEvidence(value, typeof field.provenance.sourceText === "string" ? field.provenance.sourceText : undefined))) {
        return { ok: false, reason: "invalid_value" };
      }
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

const NEGATIVE_IDENTITY_SUBJECT_LABEL = /世帯主|(?<!被)保険者|代理人|代表者|保証人|連帯保証人|緊急連絡先|扶養者|household[ _-]?head|insurer|agent|representative|guarantor|sponsor|emergency[ _-]?contact|dependent|policyholder/i;
const HOLDER_IDENTITY_SUBJECT_LABEL = /申請人|主要申請人|本人|被保険者|カード名義人|名義人|所持者|保持者|持ち主|primary[ _-]?applicant|applicant|document[ _-]?holder|cardholder|insured[ _-]?person|insured|holder/i;

export type ObjectImportIdentityReviewReason =
  | "expired_document"
  | "unclear_document_validity"
  | "attribution_blocked"
  | "conflicting_candidates"
  | "missing_subject"
  | "non_holder_subject"
  | "missing_page_evidence";

/** Stable, UI-facing reason codes derived only from persisted review evidence. */
export function getObjectImportIdentityReviewReasonCodes(
  field: Pick<ObjectImportCandidateRecord, "fieldKey" | "provenance">,
): ObjectImportIdentityReviewReason[] {
  if (!customerIdentityFieldKey(field.fieldKey)) return [];
  const sourceRange = typeof field.provenance.sourceRange === "string" ? field.provenance.sourceRange : "";
  const reasons: ObjectImportIdentityReviewReason[] = [];
  if (/identity_document_validity=expired/.test(sourceRange)) reasons.push("expired_document");
  if (/identity_document_validity=unclear/.test(sourceRange)) reasons.push("unclear_document_validity");
  if (/model_attribution_blocked=/.test(sourceRange)) reasons.push("attribution_blocked");
  if (field.provenance.uncertainty === "conflict") reasons.push("conflicting_candidates");
  if (customerIdentityFieldKey(field.fieldKey) === "birthDate" && isObjectImportBirthDateManualReviewRequired(field)) {
    const subjectKey = typeof field.provenance.subjectKey === "string" ? field.provenance.subjectKey.trim() : "";
    const subjectLabel = typeof field.provenance.subjectLabel === "string" ? field.provenance.subjectLabel.trim() : "";
    if (!subjectKey || !subjectLabel) reasons.push("missing_subject");
    else if (NEGATIVE_IDENTITY_SUBJECT_LABEL.test(subjectLabel) || !HOLDER_IDENTITY_SUBJECT_LABEL.test(subjectLabel)) reasons.push("non_holder_subject");
  }
  if (field.provenance.pageEvidenceVerified !== true) reasons.push("missing_page_evidence");
  return [...new Set(reasons)];
}

export function isObjectImportBirthDateManualReviewRequired(field: Pick<ObjectImportCandidateRecord, "fieldKey" | "provenance">): boolean {
  if (customerIdentityFieldKey(field.fieldKey) !== "birthDate") return false;
  const sourceRange = typeof field.provenance.sourceRange === "string" ? field.provenance.sourceRange : "";
  return field.provenance.pageEvidenceVerified !== true
    || /identity_document_validity=(?:expired|unclear)/.test(sourceRange);
}

/**
 * Manual DOB entry is allowed only when the stored candidate is attributable
 * to the document holder. The sourceRange marker is produced by the server's
 * attribution pass; subject metadata and alternative subject keys provide a
 * fail-closed check for older or partially populated records.
 */
export function isObjectImportManualBirthDateAttributable(field: Pick<ObjectImportCandidateRecord, "fieldKey" | "provenance">): boolean {
  if (customerIdentityFieldKey(field.fieldKey) !== "birthDate") return false;
  const sourceRange = typeof field.provenance.sourceRange === "string" ? field.provenance.sourceRange : "";
  if (sourceRange.includes("model_attribution_blocked=") || field.provenance.uncertainty === "conflict") return false;
  const subjectKey = typeof field.provenance.subjectKey === "string" ? field.provenance.subjectKey.trim() : "";
  const subjectLabel = typeof field.provenance.subjectLabel === "string" ? field.provenance.subjectLabel.trim() : "";
  if (!subjectKey || !subjectLabel || NEGATIVE_IDENTITY_SUBJECT_LABEL.test(subjectLabel) || !HOLDER_IDENTITY_SUBJECT_LABEL.test(subjectLabel)) return false;
  const alternatives = Array.isArray(field.provenance.alternatives) ? field.provenance.alternatives : [];
  return alternatives.every((alternative) => {
    if (!alternative || typeof alternative !== "object") return false;
    const alternativeSubjectKey = typeof alternative.subjectKey === "string" ? alternative.subjectKey.trim() : "";
    const alternativeSubjectLabel = typeof alternative.subjectLabel === "string" ? alternative.subjectLabel.trim() : "";
    return (!alternativeSubjectKey || alternativeSubjectKey === subjectKey)
      && (!alternativeSubjectLabel || !NEGATIVE_IDENTITY_SUBJECT_LABEL.test(alternativeSubjectLabel));
  });
}

export function isSafeModelAutoSave(field: ObjectImportCandidateRecord): boolean {
  const candidateValue = field.candidateValue?.trim() ?? "";
  return field.status === "draft" && field.provenance.uncertainty === "clear"
    && (field.confidence ?? 0) >= 0.8 && Boolean(candidateValue)
    && field.fieldKey !== "currentAddress" && field.fieldKey !== "applicant.currentAddress"
    && !(field.fieldKey === "currentAddress" && /^(?:住所|住居地)?(?:未定|未確認|不明|なし|n\/a|-)$/i.test(candidateValue.replace(/\s+/g, "")))
    && field.finalSource !== "human";
}

export function isEmptyModelDestination(key: string, current: unknown): boolean {
  return current == null || current === "" || (key === "listingPrice" && current === 0);
}
