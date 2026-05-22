import { NextResponse } from "next/server";
import { addAuditLog, addImportJob, getDefaultUser } from "@/lib/data";
import { extractIdentityDocumentFromBuffer } from "@/lib/identity-document-extractor";
import type { InputFileExtractionResult } from "@/lib/input-file-extractor";

export const dynamic = "force-dynamic";

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
  const user = await getDefaultUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("identityDocumentFile");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
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
    userId: user.id,
    sourceType: "scan",
    targetEntity: "parties",
    title: file.name,
    notes: JSON.stringify(payload),
    status: "mapped",
  });

  await addAuditLog({
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
