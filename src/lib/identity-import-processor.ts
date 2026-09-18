import { persistObjectImportJobExtraction, persistObjectReaderJobExtraction, markObjectImportJobFailed, ensureObjectImportTask } from "@/lib/object-import-processor-adapter";
import { parseObjectImportNotes, type ObjectImportMetadata } from "@/lib/object-import-contract";
import {
  addAuditLog,
  listAttachments,
  listImportJobs,
  readPrivateAttachmentContent,
  updateImportJobExecution,
  updateImportJobMapping,
} from "@/lib/data";
import { isLocalPrivateStoragePath, isPostgresPrivateStoragePath } from "@/lib/attachment-storage";
import { extractIdentityDocumentsFromFiles } from "@/lib/identity-document-extractor";
import type { InputFileExtractionResult } from "@/lib/input-file-extractor";
import { ProductionReadinessError } from "@/lib/production-readiness";
import { RemoteDocumentReaderError } from "@/lib/identity-reader-contract";
import { readObjectDocumentWithOpenAi } from "@/lib/openai-object-reader";
import type { ObjectReaderResponse } from "@/lib/object-reader-contract";

type IdentityImportPayload = {
  kind: "input_file_extraction";
  headers: string[];
  autoMapping: Record<string, string>;
  rows: Record<string, unknown>[];
  originalFilename: string;
  totalRows: number;
  inputExtraction?: InputFileExtractionResult;
  targetCaseId?: string;
  objectImport?: ObjectImportMetadata;
  objectReader?: ObjectReaderResponse;
};

export type IdentityImportProcessResult =
  | { ok: true; status: "mapped"; fieldCount: number; documentType: string; documentTypeLabel: string; fingerprintConfidence: number }
  | { ok: false; status: "failed"; error: "import_job_not_found" | "source_attachment_missing" | "identity_extraction_failed" };

export async function processIdentityImportJob(input: {
  tenantId: string;
  userId: string;
  jobId: string;
}): Promise<IdentityImportProcessResult> {
  const jobs = await listImportJobs(input.userId, 500, input.tenantId);
  const job = jobs.find((item) => item.id === input.jobId && item.sourceType === "scan");
  if (!job) return { ok: false, status: "failed", error: "import_job_not_found" };

  if (job.status === "mapped" || job.status === "completed") {
    const payload = parsePayload(job.notes);
    return {
      ok: true,
      status: "mapped",
      fieldCount: payload?.inputExtraction?.fields.length ?? payload?.objectReader?.candidates.length ?? 0,
      documentType: payload?.inputExtraction?.documentType ?? payload?.objectReader?.documentType ?? "identity_document",
      documentTypeLabel: payload?.inputExtraction?.documentTypeLabel ?? (payload?.objectReader ? "物件・賃貸資料" : "本人確認資料"),
      fingerprintConfidence: payload?.inputExtraction?.fingerprintConfidence ?? (payload?.objectReader ? 1 : 0),
    };
  }

  const objectTarget = await ensureObjectImportTask(job, input);
  if (objectTarget && ["needs_review", "completed", "conflict"].includes(objectTarget.status)) {
    const payload = parsePayload(job.notes);
    return {
      ok: true,
      status: "mapped",
      fieldCount: payload?.inputExtraction?.fields.length ?? payload?.objectReader?.candidates.length ?? 0,
      documentType: payload?.inputExtraction?.documentType ?? payload?.objectReader?.documentType ?? "unknown_property_document",
      documentTypeLabel: payload?.inputExtraction?.documentTypeLabel ?? (payload?.objectReader ? "物件・賃貸資料" : "本人確認資料"),
      fingerprintConfidence: payload?.inputExtraction?.fingerprintConfidence ?? (payload?.objectReader ? 1 : 0),
    };
  }
  const attachments = await listAttachments({
    tenantId: input.tenantId,
    userId: input.userId,
    targetType: "import_job",
    targetId: input.jobId,
    limit: 10,
  });
  const sourceFiles = await Promise.all(attachments
    .filter((attachment) => (!objectTarget || attachment.id === objectTarget.sourceAttachmentId) && (isLocalPrivateStoragePath(attachment.storagePath) || isPostgresPrivateStoragePath(attachment.storagePath)))
    .map(async (attachment) => {
      const content = await readPrivateAttachmentContent({
        tenantId: input.tenantId,
        userId: input.userId,
        id: attachment.id,
      });
      return content ? { buffer: content, filename: attachment.fileName } : null;
    }));
  const readableSources = sourceFiles.filter((source): source is { buffer: Buffer; filename: string } => Boolean(source));
  if (readableSources.length === 0) {
    await markFailed(input, "source_attachment_missing", "找不到已保存的本人资料原始文件，请重新上传。");
    return { ok: false, status: "failed", error: "source_attachment_missing" };
  }

  try {
    if (job.status !== "processing") {
      await updateImportJobExecution({
        tenantId: input.tenantId,
        userId: input.userId,
        jobId: input.jobId,
        status: "processing",
        allowRetry: job.status === "failed",
      });
    }
    const objectImport = parseObjectImportNotes(job.notes);
    const objectReader = objectImport?.targetObjectType === "property"
      ? await readObjectDocumentWithOpenAi({ buffer: readableSources[0].buffer, filename: readableSources[0].filename })
      : undefined;
    const inputExtraction = objectReader ? undefined : await extractIdentityDocumentsFromFiles(readableSources);
    const payload: IdentityImportPayload = {
      kind: "input_file_extraction",
      headers: [],
      autoMapping: {},
      rows: [],
      originalFilename: job.title,
      totalRows: 0,
      inputExtraction,
      targetCaseId: parseQueuedMetadata(job.notes).targetCaseId,
    };
    if (objectImport) {
      payload.objectImport = objectImport;
      if (objectReader) {
        payload.objectReader = objectReader;
        await persistObjectReaderJobExtraction({ job, ...input, response: objectReader });
      } else if (inputExtraction) {
        await persistObjectImportJobExtraction({ job, ...input, fields: inputExtraction.fields });
      }
    }
    const mappedJob = await updateImportJobMapping({
      tenantId: input.tenantId,
      userId: input.userId,
      jobId: input.jobId,
      mappingJson: {},
      notes: JSON.stringify(payload),
      status: "mapped",
    });
    if (!mappedJob) throw new Error("identity_import_job_not_found_after_processing");
    await addAuditLog({
      tenantId: input.tenantId,
      userId: input.userId,
      action: "identity_document_extraction_created",
      targetType: "import_job",
      targetId: input.jobId,
      message: `本人確認資料の読み取り完了: ${job.title}`,
      context: {
        documentType: objectReader?.documentType ?? inputExtraction?.documentType,
        fieldCount: objectReader?.candidates.length ?? inputExtraction?.fields.length ?? 0,
        extractionStatus: inputExtraction?.extractionStatus ?? "recognized",
        fileCount: readableSources.length,
      },
    });
    return {
      ok: true,
      status: "mapped",
      fieldCount: objectReader?.candidates.length ?? inputExtraction?.fields.length ?? 0,
      documentType: objectReader?.documentType ?? inputExtraction?.documentType ?? "unknown_property_document",
      documentTypeLabel: objectReader ? "物件・賃貸资料" : inputExtraction?.documentTypeLabel ?? "本人確認資料",
      fingerprintConfidence: inputExtraction?.fingerprintConfidence ?? 1,
    };
  } catch (error) {
    if (error instanceof ProductionReadinessError) {
      await markFailed(input, error.code, "资料读取服务尚未就绪，请联系管理员。");
      throw error;
    }
    if (error instanceof RemoteDocumentReaderError) {
      await markFailed(input, `remote_document_reader_${error.code}`, "远程资料读取失败，请稍后重试或改为手动录入。");
      return { ok: false, status: "failed", error: "identity_extraction_failed" };
    }
    await markFailed(
      input,
      "identity_extraction_failed",
      "文件已接收，但无法识别其中的身份资料。请确认图片或 PDF 清晰可读。",
    );
    return { ok: false, status: "failed", error: "identity_extraction_failed" };
  }
}

function parsePayload(value: string | undefined): IdentityImportPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<IdentityImportPayload>;
    return parsed.kind === "input_file_extraction" && (parsed.inputExtraction || parsed.objectReader)
      ? (parsed as IdentityImportPayload)
      : null;
  } catch {
    return null;
  }
}

function parseQueuedMetadata(value: string | undefined): { targetCaseId?: string } {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as { targetCaseId?: unknown };
    return typeof parsed.targetCaseId === "string" && parsed.targetCaseId.trim()
      ? { targetCaseId: parsed.targetCaseId.trim() }
      : {};
  } catch {
    return {};
  }
}

async function markFailed(
  input: { tenantId: string; userId: string; jobId: string },
  errorCode: string,
  errorSummary: string,
) {
  await updateImportJobExecution({
    tenantId: input.tenantId,
    userId: input.userId,
    jobId: input.jobId,
    status: "failed",
    errorCode,
    errorSummary,
  });
  await markObjectImportJobFailed(input, errorCode, errorSummary);
  await addAuditLog({
    tenantId: input.tenantId,
    userId: input.userId,
    action: "identity_document_extraction_failed",
    targetType: "import_job",
    targetId: input.jobId,
    message: "本人確認資料の読み取りに失敗しました",
    context: { errorCode },
  });
}
