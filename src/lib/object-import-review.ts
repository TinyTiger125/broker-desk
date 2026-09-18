import type { RequestContext } from "@/lib/visibility-resolver";
import type { ObjectImportCandidateRecord, ObjectImportTargetRecord } from "@/lib/object-import-repository";
import { buildObjectVersionFingerprint, normalizeObjectImportFieldKey } from "@/lib/object-import-contract";
import { getCaseContactValidationError } from "@/lib/case-contact-validation";
import { getCaseFieldDefinition } from "@/lib/case-field-catalog";

export type ObjectImportReviewInput = {
  context: RequestContext; targetId: string; fieldId: string;
  expectedVersion: string; expectedCandidateValue: string;
  decision: "confirm" | "reject"; value?: string; caseFieldKey?: string;
};
export type ObjectImportReviewResult =
  | { ok: true; caseId: string; targetVersion: string }
  | { ok: false; reason: "not_writable" | "conflict" | "invalid_value" | "already_reviewed" | "unsupported_target" };

type ObjectReviewKey = "name" | "phone" | "email" | "area" | "address" | "listingPrice";
type ReviewValue =
  | { ok: true; scope: "object"; key: ObjectReviewKey; value: string; recordValue: string | number }
  | { ok: true; scope: "case"; key: string; value: string; recordValue: string };
export function validateObjectImportReview(input: ObjectImportReviewInput, target: ObjectImportTargetRecord, field: ObjectImportCandidateRecord, record: Record<string, unknown>): ReviewValue | Exclude<ObjectImportReviewResult, { ok: true }> {
  if (target.targetType !== "party" && target.targetType !== "property") return { ok: false, reason: "unsupported_target" };
  if (!target.sourceAttachmentId || field.provenance.sourceAttachmentId !== target.sourceAttachmentId || typeof field.provenance.sourceFileHash !== "string" || !field.provenance.sourceFileHash) return { ok: false, reason: "not_writable" };
  if (field.finalSource === "human" || field.status === "confirmed" || field.status === "rejected") return { ok: false, reason: "already_reviewed" };
  if (target.status !== "needs_review" || target.targetVersion !== input.expectedVersion || buildObjectVersionFingerprint(record) !== input.expectedVersion || (field.candidateValue ?? "") !== input.expectedCandidateValue) return { ok: false, reason: "conflict" };
  if (input.decision !== "confirm" && input.decision !== "reject") return { ok: false, reason: "invalid_value" };
  const readerCaseField = target.targetType === "property" && /^(property\.(roomNumber|postalCode|usage)|lease\.)/.test(field.fieldKey)
    ? field.fieldKey
    : undefined;
  if (readerCaseField) {
    const definition = getCaseFieldDefinition(readerCaseField);
    if (!definition || definition.storageScope !== "case_fact" || input.caseFieldKey !== readerCaseField) return { ok: false, reason: "invalid_value" };
    const value = (input.value ?? field.candidateValue ?? "").trim();
    if (input.decision === "confirm" && !value) return { ok: false, reason: "invalid_value" };
    return { ok: true, scope: "case", key: readerCaseField, value, recordValue: value };
  }
  let fieldKey: string;
  try { fieldKey = normalizeObjectImportFieldKey(target.targetType, field.fieldKey); } catch { return { ok: false, reason: "invalid_value" }; }
  const value = (input.value ?? field.candidateValue ?? "").trim();
  const key = (fieldKey === "listing_price" ? "listingPrice" : fieldKey) as ObjectReviewKey;
  const recordValue = key === "listingPrice" ? Number(value) : value;
  if (input.decision === "confirm") {
    if (!value || (target.targetType === "party" && getCaseContactValidationError(`applicant.${key}`, value, "ja"))) return { ok: false, reason: "invalid_value" };
    if (key === "listingPrice" && (!/^\d+$/.test(value) || !Number.isSafeInteger(recordValue) || Number(recordValue) <= 0 || Number(recordValue) > 2147483647)) return { ok: false, reason: "invalid_value" };
    const existingObjectValue = typeof record[key] === "string" || typeof record[key] === "number" ? String(record[key]).trim() : "";
    if (field.provenance.method === "object_reader" && existingObjectValue && existingObjectValue !== value) return { ok: false, reason: "conflict" };
  }
  return { ok: true, scope: "object", key, value, recordValue };
}
