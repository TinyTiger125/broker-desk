import { createHash } from "node:crypto";
import { listAttachments, readPrivateAttachmentContent, createObjectImportTarget, getObjectImportTargetByJob, upsertObjectImportCandidate, updateObjectImportTarget } from "@/lib/data";
import type { ImportJob } from "@/lib/data";
import type { ObjectImportCandidateRecord, ObjectImportRepository } from "@/lib/object-import-repository";
import { parseObjectImportNotes, normalizeObjectImportFieldKey } from "@/lib/object-import-contract";

export type ExtractedObjectField = {
  fieldKey: string; value: string; normalizedValue?: string; confidence: number;
  sourceSheet?: string; sourceCell?: string; sourceRange?: string; method?: string;
  sourceFileHash?: string; templateVersion?: string;
};

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
    // persisted job no longer describes the original target.
    if (
      existing.caseId !== metadata.caseId ||
      existing.targetType !== metadata.targetObjectType ||
      existing.targetId !== metadata.targetObjectId ||
      existing.targetVersion !== metadata.targetVersion ||
      existing.sourceAttachmentId !== source.id
    ) {
      throw new Error("object_import_metadata_mutated");
    }
    return existing;
  }
  const date = new Date();
  return createObjectImportTarget({
    ...scope, id: `object_${job.id}`, caseId: metadata.caseId, importJobId: job.id,
    targetType: metadata.targetObjectType, targetId: metadata.targetObjectId, targetVersion: metadata.targetVersion,
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
    provenance: { sourceAttachmentId: input.target.sourceAttachmentId, sourceSheet: field.sourceSheet, sourceCell: field.sourceCell, sourceRange: field.sourceRange, method: field.method, sourceFileHash: input.sourceFileHash, templateVersion: field.templateVersion },
    finalValue: field.normalizedValue ?? field.value, finalSource: "model_draft",
    status: field.confidence < 0.8 ? "low_confidence" : "draft",
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
    // A document may contain several people. Only applicant fields belong to this identity source.
    const prefix = field.fieldKey.includes(".") ? field.fieldKey.split(".")[0] : null;
    if (prefix && prefix !== (target.targetType === "party" ? "applicant" : "property")) return [];
    try { return [{ ...field, fieldKey: normalizeObjectImportFieldKey(target.targetType, field.fieldKey) }]; } catch { return []; }
  });
  if (new Set(selected.map((field) => field.fieldKey)).size !== selected.length) throw new Error("object_import_ambiguous_fields");
  await updateObjectImportTarget({ tenantId: input.tenantId, userId: input.userId, id: target.id, status: "processing", attemptCount: target.attemptCount + 1 });
  const candidates = await persistObjectExtraction({ target: { ...target, sourceAttachmentId: target.sourceAttachmentId }, sourceFileHash, fields: selected });
  await updateObjectImportTarget({ tenantId: input.tenantId, userId: input.userId, id: target.id, status: candidates.length ? candidates.every((field) => field.finalSource === "human") ? "completed" : "needs_review" : "failed", errorCode: candidates.length ? undefined : "object_import_no_supported_fields", errorSummary: candidates.length ? undefined : "No supported fields were extracted." });
  return candidates;
}

export async function markObjectImportJobFailed(input: { tenantId: string; userId: string; jobId: string }, errorCode: string, errorSummary: string) {
  const target = await getObjectImportTargetByJob({ ...input, importJobId: input.jobId });
  if (target) await updateObjectImportTarget({ tenantId: input.tenantId, userId: input.userId, id: target.id, status: "failed", errorCode, errorSummary });
}
