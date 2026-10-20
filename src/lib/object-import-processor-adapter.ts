import { createHash } from "node:crypto";
import { listAttachments, readPrivateAttachmentContent, createObjectImportTarget, getObjectImportTargetByJob, upsertObjectImportCandidate, updateObjectImportTarget } from "@/lib/data";
import type { ImportJob } from "@/lib/data";
import type { ObjectImportCandidateRecord, ObjectImportRepository } from "@/lib/object-import-repository";
import { parseObjectImportNotes, normalizeObjectImportFieldKey } from "@/lib/object-import-contract";
import { selectSingleObjectReaderCandidates } from "@/lib/object-reader-attribution";
import type { ObjectReaderResponse, ObjectReaderSourceLocation } from "@/lib/object-reader-contract";
import { customerIdentityFieldKey, isStandaloneCustomerTarget, normalizeCustomerIdentityValue } from "@/lib/customer-identity-field-catalog";
import type { InputFieldEvidenceAlternative, InputFieldUncertainty } from "@/lib/input-file-extractor";

export type ExtractedObjectField = {
  fieldKey: string; value: string; normalizedValue?: string; confidence: number;
  sourceSheet?: string; sourceCell?: string; sourceRange?: string; method?: string;
  sourceFileHash?: string; templateVersion?: string;
  sourcePageNumber?: number; sourceText?: string; uncertainty?: InputFieldUncertainty;
  subjectKey?: string; subjectLabel?: string; alternatives?: InputFieldEvidenceAlternative[];
};

export type ExtractedObjectReaderField = {
  fieldKey: string;
  value: string;
  rawValue?: string;
  pageNumber: number;
  sourceText: string;
  uncertainty: "clear" | "unclear" | "conflict" | "not_found";
  subjectKey: string;
  subjectLabel: string;
  sourceLocation?: ObjectReaderSourceLocation;
};

const PROPERTY_MONEY_FIELDS = new Set(["property.listingPrice", "property.listingRent", "property.listingCommonFee", "property.managementFee", "property.repairFee"]);

function normalizeJapaneseDigits(value: string) {
  return value
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - "０".charCodeAt(0) + "0".charCodeAt(0)))
    .replace(/[，,]/g, ",")
    .replace(/[．]/g, ".");
}

type ReaderCandidateUncertainty = ExtractedObjectReaderField["uncertainty"];
type NormalizedReaderCandidate = { value: string; uncertainty: ReaderCandidateUncertainty };

function normalizedNumber(token: string) {
  const value = Number(token.replaceAll(",", ""));
  return Number.isFinite(value) && Number.isSafeInteger(value) ? String(value) : null;
}

function normalizedDecimal(token: string) {
  const value = Number(token.replaceAll(",", ""));
  return Number.isFinite(value) && Number.isSafeInteger(value * 100_000_000) ? String(value) : null;
}

function normalizeMoneyCandidate(value: string): string | null {
  const text = normalizeJapaneseDigits(value).trim();
  if (/[~〜～\-−]/.test(text)) return null;
  const unitMatch = text.match(/^(?:(?:月額|金額|価格|売買代金|管理費|修繕積立金|賃料|家賃)\s*){0,2}(\d[\d,]*(?:\.\d+)?)\s*(億円?|万円?|円|JPY|yen)$/i);
  if (unitMatch) {
    const token = unitMatch[1];
    const base = Number(token.replaceAll(",", ""));
    const unit = unitMatch[2];
    const multiplier = unit.startsWith("億") ? 100_000_000 : unit.startsWith("万") ? 10_000 : 1;
    const amount = base * multiplier;
    return Number.isSafeInteger(amount) ? String(amount) : null;
  }
  if (/^\d[\d,]*(?:\.\d+)?$/.test(text)) return normalizedNumber(text);
  return null;
}

function normalizeAreaCandidate(value: string): { value: string; ambiguous: boolean } | null {
  const text = normalizeJapaneseDigits(value).trim();
  const colonMatches = [...text.matchAll(/(\d[\d,]*)\s*[:：]\s*(\d[\d,]*)\s*(?:㎡|m²|m2)?/gi)];
  if (colonMatches.length === 1 && [...text.matchAll(/\d[\d,]*/g)].length === 2) {
    const left = normalizedDecimal(colonMatches[0][1]);
    const right = normalizedDecimal(colonMatches[0][2]);
    return left && right ? { value: `${left}.${right.padStart(2, "0")}`, ambiguous: true } : null;
  }
  const areaMatches = [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(?:㎡|m²|m2|square\s+met(?:er|re)s?|sq\.?\s*m|sqm)/gi)];
  if (areaMatches.length === 1 && [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].length === 1) {
    const number = normalizedDecimal(areaMatches[0][1]);
    return number ? { value: number, ambiguous: false } : null;
  }
  if (/^\d[\d,]*(?:\.\d+)?$/.test(text)) {
    const number = normalizedDecimal(text);
    return number ? { value: number, ambiguous: false } : null;
  }
  return null;
}

/** Keep the model value in provenance while normalizing only existing numeric fields. */
export function normalizeObjectReaderCandidateValue(fieldKey: string, value: string, uncertainty: ReaderCandidateUncertainty): NormalizedReaderCandidate {
  if (!value || uncertainty === "not_found") return { value, uncertainty };
  if (fieldKey === "property.sizeSqm") {
    const area = normalizeAreaCandidate(value);
    return area ? { value: area.value, uncertainty: area.ambiguous && uncertainty === "clear" ? "unclear" : uncertainty } : { value, uncertainty: "unclear" };
  }
  if (PROPERTY_MONEY_FIELDS.has(fieldKey)) {
    const amount = normalizeMoneyCandidate(value);
    return amount ? { value: amount, uncertainty } : { value, uncertainty: "unclear" };
  }
  return { value, uncertainty };
}

/** Called only with the persisted, tenant-scoped import job; never browser metadata. */
export async function ensureObjectImportTask(job: ImportJob, scope: { tenantId: string; userId: string }) {
  const metadata = parseObjectImportNotes(job.notes);
  if (!metadata) return null;
  if (job.tenantId !== scope.tenantId || job.userId !== scope.userId) throw new Error("object_import_job_scope_mismatch");
  const sources = await listAttachments({ ...scope, targetType: "import_job", targetId: job.id, limit: 2 });
  if (sources.length !== 1) throw new Error("object_import_source_attachment_required");
  const source = sources[0];
  if (metadata.sourceAttachmentId && metadata.sourceAttachmentId !== source.id) throw new Error("object_import_source_attachment_mismatch");
  const content = await readPrivateAttachmentContent({ ...scope, id: source.id });
  if (!content?.length) throw new Error("object_import_source_attachment_unreadable");
  const existing = await getObjectImportTargetByJob({ ...scope, importJobId: job.id });
  if (existing) {
    // Object metadata is immutable once the upload target exists. Generic
    // import-center mapping actions may edit job notes, so fail closed if the
    // persisted job no longer describes the original target. A completed
    // target is different: human review updates its current object-version
    // fingerprint, while the job notes intentionally retain the upload-time
    // snapshot. That version drift is safe after completion because completed
    // targets are not reprocessed; identity, type, case, and source scope
    // remain immutable checks.
    if (
      existing.caseId !== metadata.caseId ||
      existing.targetType !== metadata.targetObjectType ||
      existing.targetId !== metadata.targetObjectId ||
      (existing.status !== "completed" && existing.targetVersion !== metadata.targetVersion) ||
      existing.sourceAttachmentId !== source.id ||
      (metadata.documentType && existing.documentType && existing.documentType !== metadata.documentType)
    ) {
      throw new Error("object_import_metadata_mutated");
    }
    return existing;
  }
  const date = new Date();
  return createObjectImportTarget({
    ...scope, id: `object_${job.id}`, caseId: metadata.caseId, importJobId: job.id,
    targetType: metadata.targetObjectType, targetId: metadata.targetObjectId, targetVersion: metadata.targetVersion,
    ...(metadata.documentType ? { documentType: metadata.documentType } : {}),
    sourceAttachmentId: source.id, status: "queued", idempotencyKey: job.idempotencyKey ?? `job:${job.id}`,
    attemptCount: 0, createdAt: date, updatedAt: date,
  });
}

export async function persistObjectExtraction(input: { repository?: Pick<ObjectImportRepository, "upsertCandidate">; target: { id: string; tenantId: string; sourceAttachmentId: string }; sourceFileHash: string; fields: ExtractedObjectField[] }) {
  if (!input.target.sourceAttachmentId || !input.sourceFileHash) throw new Error("object_import_source_attachment_required");
  const candidates = input.fields.map((field): ObjectImportCandidateRecord => ({
    id: `candidate_${input.target.id}_${field.fieldKey}`,
    tenantId: input.target.tenantId, targetId: input.target.id, fieldKey: field.fieldKey,
    candidateValue: field.normalizedValue ?? field.value, confidence: field.confidence,
    provenance: {
      sourceAttachmentId: input.target.sourceAttachmentId,
      sourceSheet: field.sourceSheet,
      sourceCell: field.sourceCell,
      sourceRange: field.sourceRange,
      method: field.method,
      sourceFileHash: input.sourceFileHash,
      templateVersion: field.templateVersion,
      ...(field.sourcePageNumber !== undefined ? { pageNumber: field.sourcePageNumber } : {}),
      ...(field.sourceText ? { sourceText: field.sourceText } : {}),
      ...(field.uncertainty ? { uncertainty: field.uncertainty } : {}),
      ...(field.subjectKey ? { subjectKey: field.subjectKey } : {}),
      ...(field.subjectLabel ? { subjectLabel: field.subjectLabel } : {}),
      ...(field.alternatives?.length ? { alternatives: field.alternatives } : {}),
    },
    finalValue: field.normalizedValue || undefined, finalSource: field.normalizedValue ? "model_draft" : undefined,
    status: field.normalizedValue
      ? field.uncertainty === "conflict" ? "conflict" : field.uncertainty === "unclear" ? "low_confidence" : field.confidence < 0.8 ? "low_confidence" : "draft"
      : field.uncertainty === "conflict" ? "conflict" : field.uncertainty === "unclear" ? "low_confidence" : "not_found",
  }));
  const saved = [];
  for (const candidate of candidates) saved.push(await (input.repository?.upsertCandidate(candidate) ?? upsertObjectImportCandidate(candidate)));
  return saved;
}

export async function persistObjectImportJobExtraction(input: { job: ImportJob; tenantId: string; userId: string; fields: ExtractedObjectField[] }) {
  const target = await ensureObjectImportTask(input.job, input);
  if (!target) return null; // Existing non-object imports retain their original path.
  if (!target.sourceAttachmentId) throw new Error("object_import_source_attachment_required");
  const content = await readPrivateAttachmentContent({ tenantId: input.tenantId, userId: input.userId, id: target.sourceAttachmentId });
  if (!content?.length) throw new Error("object_import_source_attachment_unreadable");
  const sourceFileHash = createHash("sha256").update(content).digest("hex");
  const selected = input.fields.flatMap((field) => {
    // A customer-profile source uses the existing Client field catalog only;
    // case-bound party sources retain their applicant.* compatibility path.
    if (target.targetType === "party" && isStandaloneCustomerTarget(target)) {
      const customerKey = customerIdentityFieldKey(field.fieldKey);
      if (!customerKey) return [];
      const normalizedValue = normalizeCustomerIdentityValue(customerKey, field.normalizedValue ?? field.value);
      return [{ ...field, fieldKey: customerKey, value: normalizedValue, normalizedValue }];
    }
    // A document may contain several people. Only applicant fields belong to this identity source.
    const prefix = field.fieldKey.includes(".") ? field.fieldKey.split(".")[0] : null;
    if (prefix && prefix !== (target.targetType === "party" ? "applicant" : "property")) return [];
    try { return [{ ...field, fieldKey: normalizeObjectImportFieldKey(target.targetType, field.fieldKey) }]; } catch { return []; }
  });
  if (new Set(selected.map((field) => field.fieldKey)).size !== selected.length) throw new Error("object_import_ambiguous_fields");
  // The processor claims the attempt before invoking the provider. This
  // persistence helper may also be used to replay an already obtained result,
  // so it must not increment the execution budget a second time.
  await updateObjectImportTarget({ tenantId: input.tenantId, userId: input.userId, id: target.id, status: "processing" });
  const candidates = await persistObjectExtraction({ target: { ...target, sourceAttachmentId: target.sourceAttachmentId }, sourceFileHash, fields: selected });
  const terminal = candidates.length > 0 && candidates.every((field) => field.finalSource === "human" || ["not_found", "confirmed", "rejected"].includes(field.status));
  await updateObjectImportTarget({ tenantId: input.tenantId, userId: input.userId, id: target.id, status: candidates.length ? terminal ? "completed" : "needs_review" : "failed", errorCode: candidates.length ? undefined : "object_import_no_supported_fields", errorSummary: candidates.length ? undefined : "No supported fields were extracted." });
  return candidates;
}

/** Persist the guarded PDF/image object-reader result without routing it through identity fields. */
export async function persistObjectReaderJobExtraction(input: {
  job: ImportJob;
  tenantId: string;
  userId: string;
  response: ObjectReaderResponse;
}) {
  const target = await ensureObjectImportTask(input.job, input);
  if (!target) return null;
  if (target.targetType !== "property") throw new Error("object_reader_target_must_be_property");
  if (!target.sourceAttachmentId) throw new Error("object_import_source_attachment_required");
  const content = await readPrivateAttachmentContent({ tenantId: input.tenantId, userId: input.userId, id: target.sourceAttachmentId });
  if (!content?.length) throw new Error("object_import_source_attachment_unreadable");
  const sourceFileHash = createHash("sha256").update(content).digest("hex");
  const attribution = selectSingleObjectReaderCandidates(input.response.candidates);
  const allNotFound = input.response.candidates.length > 0 && input.response.candidates.every((field) => field.uncertainty === "not_found");
  if (attribution.status !== "single_object" && !allNotFound) {
    await updateObjectImportTarget({ tenantId: input.tenantId, userId: input.userId, id: target.id, status: "conflict", errorCode: "object_reader_ambiguous_subject", errorSummary: "资料中存在多个物件或无法确认物件归属。" });
    return { target: await getObjectImportTargetByJob({ ...input, importJobId: input.job.id }), candidates: [], attribution: attribution.status };
  }
  const fields: ExtractedObjectReaderField[] = (allNotFound ? input.response.candidates : attribution.candidates)
    .filter((field) => target.caseId || !field.fieldKey.startsWith("lease."));
  const extracted = fields.map((field) => {
    const normalized = normalizeObjectReaderCandidateValue(field.fieldKey, field.uncertainty === "not_found" ? "" : field.value, field.uncertainty);
    return {
    fieldKey: field.fieldKey,
    value: normalized.value,
    rawValue: field.value,
    normalizedValue: normalized.value,
    confidence: normalized.uncertainty === "clear" ? 0.95 : normalized.uncertainty === "unclear" ? 0.55 : normalized.uncertainty === "conflict" ? 0.2 : 0,
    sourceFileHash,
    method: "object_reader",
    pageNumber: field.pageNumber,
    sourceText: field.sourceText,
    uncertainty: normalized.uncertainty,
    subjectKey: field.subjectKey,
    subjectLabel: field.subjectLabel,
    sourceLocation: field.sourceLocation,
    };
  });
  await updateObjectImportTarget({
    tenantId: input.tenantId,
    userId: input.userId,
    id: target.id,
    status: "processing",
    errorCode: undefined,
    errorSummary: undefined,
    documentType: input.response.documentType,
    processingMetadata: input.response.processingMetadata,
  });
  const candidates = await persistObjectReaderExtraction({ target: { ...target, sourceAttachmentId: target.sourceAttachmentId }, sourceFileHash, fields: extracted });
  const hasReadableCandidate = extracted.some((field) => field.uncertainty !== "not_found" && field.value.trim());
  await updateObjectImportTarget({ tenantId: input.tenantId, userId: input.userId, id: target.id, status: candidates.length && hasReadableCandidate ? "needs_review" : "failed", errorCode: candidates.length && hasReadableCandidate ? undefined : "object_reader_no_readable_fields", errorSummary: candidates.length && hasReadableCandidate ? undefined : "No readable object fields were extracted." });
  return { target: await getObjectImportTargetByJob({ ...input, importJobId: input.job.id }), candidates, attribution: attribution.status };
}

async function persistObjectReaderExtraction(input: {
  target: { id: string; tenantId: string; sourceAttachmentId: string };
  sourceFileHash: string;
  fields: Array<ExtractedObjectReaderField & { normalizedValue: string; confidence: number; method: string }>;
  repository?: Pick<ObjectImportRepository, "upsertCandidate">;
}) {
  const grouped = new Map<string, typeof input.fields>();
  for (const field of input.fields) grouped.set(field.fieldKey, [...(grouped.get(field.fieldKey) ?? []), field]);
  const candidates = [...grouped.entries()].map(([fieldKey, fields]): ObjectImportCandidateRecord => {
    const first = fields[0];
    const alternatives = fields.map((field) => ({
      value: field.normalizedValue || undefined,
      rawValue: field.rawValue,
      pageNumber: field.pageNumber,
      sourceText: field.sourceText,
      uncertainty: field.uncertainty,
      sourceLocation: field.sourceLocation,
    }));
    const distinctValues = new Set(fields.map((field) => field.normalizedValue.trim()).filter(Boolean));
    const hasConflict = distinctValues.size > 1 || fields.some((field) => field.uncertainty === "conflict");
    const status = hasConflict
      ? "conflict"
      : fields.some((field) => field.uncertainty === "unclear")
        ? "low_confidence"
        : fields.every((field) => field.uncertainty === "not_found")
          ? "not_found"
          : "draft";
    return {
    id: `candidate_${input.target.id}_${fieldKey}`,
    tenantId: input.target.tenantId,
    targetId: input.target.id,
    fieldKey,
    candidateValue: first.normalizedValue || undefined,
    confidence: hasConflict ? Math.min(...fields.map((field) => field.confidence)) : first.confidence,
    provenance: {
      sourceAttachmentId: input.target.sourceAttachmentId,
      sourceFileHash: input.sourceFileHash,
      method: first.method,
      pageNumber: first.pageNumber,
      sourceText: first.sourceText,
      ...(first.rawValue && first.rawValue !== first.value ? { rawCandidateValue: first.rawValue } : {}),
      uncertainty: hasConflict ? "conflict" : first.uncertainty,
      subjectKey: first.subjectKey,
      subjectLabel: first.subjectLabel,
      ...(first.sourceLocation ? { sourceLocation: first.sourceLocation } : {}),
      ...(fields.length > 1 ? { alternatives } : {}),
    },
    finalValue: first.normalizedValue || undefined,
    // Absence is terminal evidence, not a failed model attempt and not a
    // human confirmation. Keep final_source NULL so the review record says
    // exactly what happened without inventing a value.
    ...(status === "not_found" ? {} : { finalSource: "model_draft" as const }),
    status,
    };
  });
  const saved = [];
  for (const candidate of candidates) saved.push(await (input.repository?.upsertCandidate(candidate) ?? upsertObjectImportCandidate(candidate)));
  return saved;
}

export async function markObjectImportJobFailed(input: { tenantId: string; userId: string; jobId: string }, errorCode: string, errorSummary: string) {
  const target = await getObjectImportTargetByJob({ ...input, importJobId: input.jobId });
  if (target) await updateObjectImportTarget({ tenantId: input.tenantId, userId: input.userId, id: target.id, status: "failed", errorCode, errorSummary });
}
