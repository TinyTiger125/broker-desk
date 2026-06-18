import { NextResponse } from "next/server";
import { addAuditLog, addImportJob } from "@/lib/data";
import { extractIdentityDocumentFromBuffer } from "@/lib/identity-document-extractor";
import type { InputFileExtractionResult } from "@/lib/input-file-extractor";
import { TenantSessionError, requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

const MAX_IDENTITY_UPLOAD_BYTES = 25 * 1024 * 1024;
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
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_IDENTITY_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large", maxBytes: MAX_IDENTITY_UPLOAD_BYTES }, { status: 413 });
  }

  const formData = await request.formData();
  const file = formData.get("identityDocumentFile");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }
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

  const inputExtraction = await extractIdentityDocumentFromBuffer({
    buffer: Buffer.from(await file.arrayBuffer()),
    filename: file.name,
  });
  const payload: IdentityImportPayload = {
    kind: "input_file_extraction",
    headers: [],
    autoMapping: {},
    rows: [],
    originalFilename: file.name,
    totalRows: 0,
    inputExtraction,
  };

  const job = await addImportJob({
    tenantId,
    userId: user.id,
    sourceType: "scan",
    targetEntity: "parties",
    title: file.name,
    notes: JSON.stringify(payload),
    status: "mapped",
  });

  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "identity_document_extraction_created",
    targetType: "import_job",
    targetId: job.id,
    message: `本人確認資料の抽出 API: ${file.name} (${inputExtraction.documentType})`,
    context: {
      documentType: inputExtraction.documentType,
      fieldCount: inputExtraction.fields.length,
      extractionStatus: inputExtraction.extractionStatus,
    },
  });

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    reviewUrl: `/import-center?xlsxJob=${encodeURIComponent(job.id)}&flash=identity_extraction_ready`,
    extractionStatus: inputExtraction.extractionStatus,
    documentType: inputExtraction.documentType,
    documentTypeLabel: inputExtraction.documentTypeLabel,
    fieldCount: inputExtraction.fields.length,
    fingerprintConfidence: inputExtraction.fingerprintConfidence,
  });
}
