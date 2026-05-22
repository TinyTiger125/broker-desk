import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { addAuditLog, addImportJob, getDefaultUser } from "@/lib/data";
import { extractInputFileFromWorkbook, type InputFileExtractionResult } from "@/lib/input-file-extractor";

export const dynamic = "force-dynamic";

type ExcelImportPayload = {
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
  const file = formData.get("excelFile");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ ok: false, error: "xlsx_required" }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_xlsx" }, { status: 400 });
  }

  const sourceFileHash = createHash("sha256").update(Buffer.from(buffer)).digest("hex");
  const inputExtraction = extractInputFileFromWorkbook(workbook, file.name, sourceFileHash);
  const payload: ExcelImportPayload = {
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
    sourceType: "excel",
    targetEntity: inputExtraction.extractionStatus === "recognized" ? "contracts" : "properties",
    title: file.name,
    notes: JSON.stringify(payload),
    status: "mapped",
  });

  await addAuditLog({
    userId: user.id,
    action: inputExtraction.extractionStatus === "recognized" ? "input_file_extraction_created" : "input_file_extraction_unknown",
    targetType: "import_job",
    targetId: job.id,
    message: `Excel 業務ファイル抽出 API: ${file.name} (${inputExtraction.documentType})`,
    context: {
      documentType: inputExtraction.documentType,
      fieldCount: inputExtraction.fields.length,
    },
  });

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    reviewUrl: `/import-center?xlsxJob=${encodeURIComponent(job.id)}&flash=input_extraction_ready`,
    extractionStatus: inputExtraction.extractionStatus,
    documentType: inputExtraction.documentType,
    documentTypeLabel: inputExtraction.documentTypeLabel,
    fieldCount: inputExtraction.fields.length,
    fingerprintConfidence: inputExtraction.fingerprintConfidence,
  });
}
