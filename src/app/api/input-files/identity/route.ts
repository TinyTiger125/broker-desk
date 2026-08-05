import { NextResponse } from "next/server";
import { addAuditLog, addImportJob } from "@/lib/data";
import { extractIdentityDocumentsFromFiles } from "@/lib/identity-document-extractor";
import type { InputFileExtractionResult } from "@/lib/input-file-extractor";
import { isProductionRuntime } from "@/lib/production-readiness";
import { TenantSessionError, requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

const MAX_IDENTITY_UPLOAD_FILES = 6;
const MAX_IDENTITY_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_IDENTITY_UPLOAD_TOTAL_BYTES = 60 * 1024 * 1024;
const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

type IdentityImportPayload = {
  kind: "input_file_extraction";
  headers: string[];
  autoMapping: Record<string, string>;
  rows: Record<string, unknown>[];
  originalFilename: string;
  totalRows: number;
  inputExtraction: InputFileExtractionResult;
};

async function createIdentityJob(input: {
  tenantId: string;
  userId: string;
  title: string;
  inputExtraction: InputFileExtractionResult;
  fileCount: number;
}) {
  const payload: IdentityImportPayload = {
    kind: "input_file_extraction",
    headers: [],
    autoMapping: {},
    rows: [],
    originalFilename: input.title,
    totalRows: 0,
    inputExtraction: input.inputExtraction,
  };

  const job = await addImportJob({
    tenantId: input.tenantId,
    userId: input.userId,
    sourceType: "scan",
    targetEntity: "parties",
    title: input.title,
    notes: JSON.stringify(payload),
    status: "mapped",
  });

  await addAuditLog({
    tenantId: input.tenantId,
    userId: input.userId,
    action: "identity_document_extraction_created",
    targetType: "import_job",
    targetId: job.id,
    message: `本人確認資料の抽出 API: ${input.title} (${input.inputExtraction.documentType})`,
    context: {
      documentType: input.inputExtraction.documentType,
      fieldCount: input.inputExtraction.fields.length,
      extractionStatus: input.inputExtraction.extractionStatus,
      fileCount: input.fileCount,
    },
  });

  return job;
}

export async function POST(request: Request) {
  let session;
  try {
    session = await requireTenantSession({ permission: "source.upload" });
  } catch (error) {
    if (error instanceof TenantSessionError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    }
    throw error;
  }
  const user = session.user;
  const tenantId = session.tenant.id;

  if (isProductionRuntime()) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_IDENTITY_UPLOAD_TOTAL_BYTES + MAX_MULTIPART_OVERHEAD_BYTES) {
    return NextResponse.json({ ok: false, error: "files_too_large", maxBytes: MAX_IDENTITY_UPLOAD_TOTAL_BYTES }, { status: 413 });
  }

  const formData = await request.formData();
  const uploadMode = String(formData.get("identityUploadMode") ?? "same_person").trim();
  const files = formData
    .getAll("identityDocumentFile")
    .filter((file): file is File => file instanceof File && file.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }
  if (files.length > MAX_IDENTITY_UPLOAD_FILES) {
    return NextResponse.json({ ok: false, error: "too_many_files", maxFiles: MAX_IDENTITY_UPLOAD_FILES }, { status: 400 });
  }

  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.size;
    if (file.size > MAX_IDENTITY_UPLOAD_BYTES) {
      return NextResponse.json({ ok: false, error: "file_too_large", maxBytes: MAX_IDENTITY_UPLOAD_BYTES }, { status: 413 });
    }

    const lowerName = file.name.toLowerCase();
    const allowed =
      lowerName.endsWith(".pdf") ||
      lowerName.endsWith(".png") ||
      lowerName.endsWith(".jpg") ||
      lowerName.endsWith(".jpeg") ||
      file.type === "application/pdf" ||
      file.type.startsWith("image/");
    if (!allowed) {
      return NextResponse.json({ ok: false, error: "identity_pdf_or_image_required" }, { status: 400 });
    }
  }
  if (totalBytes > MAX_IDENTITY_UPLOAD_TOTAL_BYTES) {
    return NextResponse.json({ ok: false, error: "files_too_large", maxBytes: MAX_IDENTITY_UPLOAD_TOTAL_BYTES }, { status: 413 });
  }

  if (uploadMode === "separate_people" && files.length > 1) {
    const jobs = [];
    for (const file of files) {
      const inputExtraction = await extractIdentityDocumentsFromFiles([{
        buffer: Buffer.from(await file.arrayBuffer()),
        filename: file.name,
      }]);
      jobs.push(await createIdentityJob({
        tenantId,
        userId: user.id,
        title: file.name,
        inputExtraction,
        fileCount: 1,
      }));
    }

    return NextResponse.json({
      ok: true,
      jobId: jobs[0].id,
      jobIds: jobs.map((job) => job.id),
      reviewUrl: `/import-center?xlsxJob=${encodeURIComponent(jobs[0].id)}&flash=identity_extraction_ready`,
      fileCount: files.length,
      mode: "separate_people",
    });
  }

  const uploadFiles = await Promise.all(files.map(async (file) => ({
    buffer: Buffer.from(await file.arrayBuffer()),
    filename: file.name,
  })));
  const inputExtraction = await extractIdentityDocumentsFromFiles(uploadFiles);
  const title = files.length === 1 ? files[0].name : `本人確認資料 ${files.length}件`;
  const job = await createIdentityJob({
    tenantId,
    userId: user.id,
    title,
    inputExtraction,
    fileCount: files.length,
  });

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    reviewUrl: `/import-center?xlsxJob=${encodeURIComponent(job.id)}&flash=identity_extraction_ready`,
    extractionStatus: inputExtraction.extractionStatus,
    documentType: inputExtraction.documentType,
    documentTypeLabel: inputExtraction.documentTypeLabel,
    fieldCount: inputExtraction.fields.length,
    fileCount: files.length,
    fingerprintConfidence: inputExtraction.fingerprintConfidence,
  });
}
