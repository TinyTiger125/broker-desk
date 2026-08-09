import { createHash } from "node:crypto";
import {
  addAuditLog,
  addImportJob,
  addPrivateAttachment,
  getImportJobByIdempotencyKey,
  updateImportJobExecution,
} from "@/lib/data";
import { getAttachmentStorageMode, getPostgresPrivateAttachmentLimitBytes } from "@/lib/attachment-storage";
import { detectIdentityDocumentKind } from "@/lib/upload-validation";

export const MAX_IDENTITY_DOCUMENT_FILES = 6;
const MAX_IDENTITY_DOCUMENT_FILE_BYTES = 25 * 1024 * 1024;
const MAX_IDENTITY_DOCUMENT_TOTAL_BYTES = 60 * 1024 * 1024;

export type IdentityImportUploadMode = "same_person" | "separate_people";

export type QueueIdentityImportResult =
  | { ok: true; jobIds: string[]; deduplicated: boolean }
  | {
      ok: false;
      error: "file_required" | "too_many_files" | "file_too_large" | "files_too_large" | "invalid_identity_document" | "source_persistence_failed";
      maxBytes?: number;
      maxFiles?: number;
    };

export function getIdentityDocumentUploadLimitBytes() {
  const attachmentLimit = getAttachmentStorageMode() === "postgres_private"
    ? getPostgresPrivateAttachmentLimitBytes()
    : MAX_IDENTITY_DOCUMENT_FILE_BYTES;
  return Math.min(MAX_IDENTITY_DOCUMENT_FILE_BYTES, attachmentLimit);
}

function identityUploadTitle(files: Array<{ filename: string }>) {
  return files.length === 1 ? files[0].filename : `本人確認資料 ${files.length}件`;
}

/**
 * Saves each identity source before reading it. The processing step can be
 * retried without asking the user to upload the document again.
 */
export async function queueIdentityImportSources(input: {
  tenantId: string;
  userId: string;
  files: File[];
  uploadMode: IdentityImportUploadMode;
  targetCaseId?: string;
}): Promise<QueueIdentityImportResult> {
  const maxFileBytes = getIdentityDocumentUploadLimitBytes();
  if (input.files.length === 0) return { ok: false, error: "file_required" };
  if (input.files.length > MAX_IDENTITY_DOCUMENT_FILES) {
    return { ok: false, error: "too_many_files", maxFiles: MAX_IDENTITY_DOCUMENT_FILES };
  }

  let totalBytes = 0;
  const files: Array<{ buffer: Buffer; filename: string; fileType: string; size: number }> = [];
  for (const file of input.files) {
    totalBytes += file.size;
    if (file.size > maxFileBytes) return { ok: false, error: "file_too_large", maxBytes: maxFileBytes };
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!detectIdentityDocumentKind(buffer)) return { ok: false, error: "invalid_identity_document" };
    files.push({ buffer, filename: file.name, fileType: file.type || "application/octet-stream", size: file.size });
  }
  if (totalBytes > MAX_IDENTITY_DOCUMENT_TOTAL_BYTES) {
    return { ok: false, error: "files_too_large", maxBytes: MAX_IDENTITY_DOCUMENT_TOTAL_BYTES };
  }

  const groups = input.uploadMode === "separate_people" && files.length > 1
    ? files.map((file) => [file])
    : [files];
  const jobIds: string[] = [];
  let deduplicated = true;

  for (const group of groups) {
    const sourceHash = createHash("sha256").update(Buffer.concat(group.map((file) => file.buffer))).digest("hex");
    const targetKey = input.targetCaseId?.trim() || "unassigned";
    const idempotencyKey = `identity:${input.uploadMode}:${sourceHash}:${targetKey}`;
    const existing = await getImportJobByIdempotencyKey({
      tenantId: input.tenantId,
      userId: input.userId,
      idempotencyKey,
    });
    if (existing) {
      jobIds.push(existing.id);
      continue;
    }

    let job;
    try {
      job = await addImportJob({
        tenantId: input.tenantId,
        userId: input.userId,
        sourceType: "scan",
        targetEntity: "parties",
        title: identityUploadTitle(group),
        status: "queued",
        idempotencyKey,
        notes: JSON.stringify({ kind: "identity_import_source", targetCaseId: input.targetCaseId || undefined }),
      });
    } catch (error) {
      const concurrent = await getImportJobByIdempotencyKey({
        tenantId: input.tenantId,
        userId: input.userId,
        idempotencyKey,
      });
      if (!concurrent) throw error;
      jobIds.push(concurrent.id);
      continue;
    }

    try {
      for (const file of group) {
        await addPrivateAttachment({
          tenantId: input.tenantId,
          userId: input.userId,
          targetType: "import_job",
          targetId: job.id,
          fileName: file.filename,
          fileType: file.fileType,
          content: file.buffer,
        });
      }
      await addAuditLog({
        tenantId: input.tenantId,
        userId: input.userId,
        action: "identity_document_received",
        targetType: "import_job",
        targetId: job.id,
        message: `本人確認資料を保存し、読み取り待ちにしました: ${job.title}`,
        context: { sourceHash, fileCount: group.length, bytes: group.reduce((sum, file) => sum + file.size, 0), targetCaseId: input.targetCaseId },
      });
      jobIds.push(job.id);
      deduplicated = false;
    } catch {
      await updateImportJobExecution({
        tenantId: input.tenantId,
        userId: input.userId,
        jobId: job.id,
        status: "failed",
        errorCode: "source_persistence_failed",
        errorSummary: "本人资料原始文件保存失败，请重新上传。",
      }).catch(() => undefined);
      return { ok: false, error: "source_persistence_failed" };
    }
  }

  return { ok: true, jobIds, deduplicated };
}
