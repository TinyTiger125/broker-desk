import { createHash } from "node:crypto";
import {
  addAuditLog,
  listAttachments,
  listImportJobs,
  readPrivateAttachmentContent,
  updateImportJobExecution,
  updateImportJobMapping,
} from "@/lib/data";
import {
  countWorkbookCells,
  getWorkbookSheetNames,
  MAX_EXCEL_CELLS,
  MAX_EXCEL_SHEETS,
  readExcelWorkbook,
  validateExcelZip,
} from "@/lib/excel-workbook";
import { extractInputFileFromWorkbook, type InputFileExtractionResult } from "@/lib/input-file-extractor";
import { suggestImportMapping } from "@/lib/import-mapping";
import { isLocalPrivateStoragePath, isPostgresPrivateStoragePath } from "@/lib/attachment-storage";

export type ExcelImportPayload = {
  kind: "property_row_import" | "input_file_extraction";
  headers: string[];
  autoMapping: Record<string, string>;
  rows: Record<string, unknown>[];
  originalFilename: string;
  totalRows: number;
  inputExtraction?: InputFileExtractionResult;
  targetCaseId?: string;
};

export type ExcelImportProcessResult =
  | { ok: true; status: "mapped"; fieldCount: number; documentType: string; documentTypeLabel: string; fingerprintConfidence: number }
  | { ok: false; status: "failed"; error: "import_job_not_found" | "source_attachment_missing" | "excel_extraction_failed" };

/**
 * Processes a persisted Excel source file. The caller is still scoped to the
 * original tenant member, so repository RLS checks remain in effect.
 */
export async function processExcelImportJob(input: {
  tenantId: string;
  userId: string;
  jobId: string;
}): Promise<ExcelImportProcessResult> {
  const jobs = await listImportJobs(input.userId, 500, input.tenantId);
  const job = jobs.find((item) => item.id === input.jobId && item.sourceType === "excel");
  if (!job) return { ok: false, status: "failed", error: "import_job_not_found" };

  if (job.status === "mapped" || job.status === "completed") {
    const payload = parsePayload(job.notes);
    return {
      ok: true,
      status: "mapped",
      fieldCount: payload?.inputExtraction?.fields.length ?? 0,
      documentType: payload?.inputExtraction?.documentType ?? "property_ledger",
      documentTypeLabel: payload?.inputExtraction?.documentTypeLabel ?? "物件台账",
      fingerprintConfidence: payload?.inputExtraction?.fingerprintConfidence ?? 0,
    };
  }

  const attachments = await listAttachments({
    tenantId: input.tenantId,
    userId: input.userId,
    targetType: "import_job",
    targetId: input.jobId,
    limit: 10,
  });
  const source = attachments.find((attachment) =>
    isLocalPrivateStoragePath(attachment.storagePath) || isPostgresPrivateStoragePath(attachment.storagePath),
  );
  if (!source) {
    await markFailed(input, "source_attachment_missing", "找不到已保存的原始 Excel 文件，请重新上传。");
    return { ok: false, status: "failed", error: "source_attachment_missing" };
  }

  const content = await readPrivateAttachmentContent({
    tenantId: input.tenantId,
    userId: input.userId,
    id: source.id,
  });
  if (!content) {
    await markFailed(input, "source_attachment_missing", "原始 Excel 文件不可读取，请重新上传。");
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
    await validateExcelZip(content);
    const workbook = await readExcelWorkbook(content);
    const sheetNames = getWorkbookSheetNames(workbook);
    if (sheetNames.length === 0 || sheetNames.length > MAX_EXCEL_SHEETS) {
      throw new ExcelImportValidationError("xlsx_sheet_limit", `Excel 工作表数量超过上限（${MAX_EXCEL_SHEETS}）。`);
    }
    if (countWorkbookCells(workbook) > MAX_EXCEL_CELLS) {
      throw new ExcelImportValidationError("xlsx_cell_limit", `Excel 单元格数量超过上限（${MAX_EXCEL_CELLS.toLocaleString("en-US")}）。`);
    }

    const sourceFileHash = createHash("sha256").update(content).digest("hex");
    const inputExtraction = extractInputFileFromWorkbook(workbook, source.fileName, sourceFileHash);
    const queuedMetadata = parseQueuedMetadata(job.notes);
    const firstSheet = workbook.worksheets[0];
    const rawRows = firstSheet?.data ?? [];
    const headers = rawRows[0]?.map((cell) => String(cell ?? "").trim()).filter(Boolean) ?? [];
    const rows = rawRows.slice(1)
      .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
      .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
    const payload: ExcelImportPayload = inputExtraction.extractionStatus === "recognized" || headers.length === 0
      ? {
          kind: "input_file_extraction",
          headers: [],
          autoMapping: {},
          rows: [],
          originalFilename: source.fileName,
          totalRows: 0,
          inputExtraction,
          targetCaseId: queuedMetadata.targetCaseId,
        }
      : {
          kind: "property_row_import",
          headers,
          autoMapping: suggestImportMapping("properties", headers),
          rows,
          originalFilename: source.fileName,
          totalRows: rows.length,
          inputExtraction,
          targetCaseId: queuedMetadata.targetCaseId,
        };
    const mappedJob = await updateImportJobMapping({
      tenantId: input.tenantId,
      userId: input.userId,
      jobId: input.jobId,
      mappingJson: {},
      notes: JSON.stringify(payload),
      status: "mapped",
    });
    if (!mappedJob) throw new Error("import_job_not_found_after_processing");

    await addAuditLog({
      tenantId: input.tenantId,
      userId: input.userId,
      action: payload.kind === "property_row_import" ? "import_job_created" : inputExtraction.extractionStatus === "recognized" ? "input_file_extraction_created" : "input_file_extraction_unknown",
      targetType: "import_job",
      targetId: input.jobId,
      message: `Excel 资料读取完成: ${source.fileName} (${payload.kind})`,
      context: { documentType: inputExtraction.documentType, fieldCount: inputExtraction.fields.length, rowCount: rows.length, sourceFileHash },
    });
    return {
      ok: true,
      status: "mapped",
      fieldCount: inputExtraction.fields.length,
      documentType: inputExtraction.documentType,
      documentTypeLabel: inputExtraction.documentTypeLabel,
      fingerprintConfidence: inputExtraction.fingerprintConfidence,
    };
  } catch (error) {
    const validationError = error instanceof ExcelImportValidationError ? error : null;
    await markFailed(
      input,
      validationError?.code ?? "excel_extraction_failed",
      validationError?.message ?? "文件已接收，但内容无法读取。请检查是否为有效的 Excel 文件。",
    );
    return { ok: false, status: "failed", error: "excel_extraction_failed" };
  }
}

function parsePayload(value: string | undefined): ExcelImportPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ExcelImportPayload>;
    return (parsed.kind === "input_file_extraction" || parsed.kind === "property_row_import") ? (parsed as ExcelImportPayload) : null;
  } catch {
    return null;
  }
}

function parseQueuedMetadata(value: string | undefined): { targetCaseId?: string } {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as { targetCaseId?: unknown };
    return typeof parsed.targetCaseId === "string" && parsed.targetCaseId.trim() ? { targetCaseId: parsed.targetCaseId.trim() } : {};
  } catch {
    return {};
  }
}

class ExcelImportValidationError extends Error {
  constructor(readonly code: "xlsx_sheet_limit" | "xlsx_cell_limit", message: string) {
    super(message);
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
  await addAuditLog({
    tenantId: input.tenantId,
    userId: input.userId,
    action: "input_file_extraction_failed",
    targetType: "import_job",
    targetId: input.jobId,
    message: "Excel 资料读取失败",
    context: { errorCode },
  });
}
