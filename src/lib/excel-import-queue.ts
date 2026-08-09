import { createHash } from "node:crypto";
import { addAuditLog, addImportJob, addPrivateAttachment, getImportJobByIdempotencyKey, updateImportJobExecution } from "@/lib/data";
import { getAttachmentStorageMode, getPostgresPrivateAttachmentLimitBytes } from "@/lib/attachment-storage";
import { MAX_EXCEL_UPLOAD_BYTES, validateExcelZip } from "@/lib/excel-workbook";
import { isZipContainer } from "@/lib/upload-validation";

export type QueueExcelImportResult =
  | { ok: true; jobId: string; status: "queued" | "processing" | "failed" | "mapped" | "completed"; deduplicated: boolean }
  | { ok: false; error: "file_required" | "xlsx_required" | "file_too_large" | "invalid_xlsx" | "source_persistence_failed"; maxBytes?: number };

export function getExcelUploadLimitBytes() {
  const attachmentLimit = getAttachmentStorageMode() === "postgres_private"
    ? getPostgresPrivateAttachmentLimitBytes()
    : MAX_EXCEL_UPLOAD_BYTES;
  return Math.min(MAX_EXCEL_UPLOAD_BYTES, attachmentLimit);
}

/** Persist first, parse later. This keeps a browser timeout from losing a source file. */
export async function queueExcelImportSource(input: {
  tenantId: string;
  userId: string;
  file: File;
  targetCaseId?: string;
}): Promise<QueueExcelImportResult> {
  const maxBytes = getExcelUploadLimitBytes();
  if (input.file.size === 0) return { ok: false, error: "file_required" };
  if (input.file.size > maxBytes) return { ok: false, error: "file_too_large", maxBytes };
  if (!input.file.name.toLowerCase().endsWith(".xlsx")) return { ok: false, error: "xlsx_required" };

  const content = Buffer.from(await input.file.arrayBuffer());
  if (!isZipContainer(content)) return { ok: false, error: "invalid_xlsx" };
  try {
    await validateExcelZip(content);
  } catch {
    return { ok: false, error: "invalid_xlsx" };
  }

  const sourceFileHash = createHash("sha256").update(content).digest("hex");
  const targetKey = input.targetCaseId?.trim() || "unassigned";
  const idempotencyKey = `excel:${sourceFileHash}:${targetKey}`;
  const existing = await getImportJobByIdempotencyKey({ tenantId: input.tenantId, userId: input.userId, idempotencyKey });
  if (existing) return { ok: true, jobId: existing.id, status: existing.status, deduplicated: true };

  let job;
  try {
    job = await addImportJob({
      tenantId: input.tenantId,
      userId: input.userId,
      sourceType: "excel",
      targetEntity: "properties",
      title: input.file.name,
      status: "queued",
      idempotencyKey,
      notes: JSON.stringify({ targetCaseId: input.targetCaseId || undefined }),
    });
  } catch (error) {
    const concurrent = await getImportJobByIdempotencyKey({ tenantId: input.tenantId, userId: input.userId, idempotencyKey });
    if (!concurrent) throw error;
    return { ok: true, jobId: concurrent.id, status: concurrent.status, deduplicated: true };
  }

  try {
    await addPrivateAttachment({
      tenantId: input.tenantId,
      userId: input.userId,
      targetType: "import_job",
      targetId: job.id,
      fileName: input.file.name,
      fileType: input.file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content,
    });
    await addAuditLog({
      tenantId: input.tenantId,
      userId: input.userId,
      action: "input_file_received",
      targetType: "import_job",
      targetId: job.id,
      message: `Excel 资料已保存，等待读取: ${input.file.name}`,
      context: { sourceFileHash, bytes: input.file.size, targetCaseId: input.targetCaseId },
    });
    return { ok: true, jobId: job.id, status: "queued", deduplicated: false };
  } catch {
    await updateImportJobExecution({
      tenantId: input.tenantId,
      userId: input.userId,
      jobId: job.id,
      status: "failed",
      errorCode: "source_persistence_failed",
      errorSummary: "Excel 原始文件保存失败，请重新上传。",
    }).catch(() => undefined);
    return { ok: false, error: "source_persistence_failed" };
  }
}
