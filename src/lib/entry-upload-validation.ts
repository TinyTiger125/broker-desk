import { getExcelUploadLimitBytes } from "@/lib/excel-import-queue";
import { getIdentityDocumentUploadLimitBytes, MAX_IDENTITY_DOCUMENT_FILES } from "@/lib/identity-import-queue";
import { validateExcelZip } from "@/lib/excel-workbook";
import { detectIdentityDocumentKind, isZipContainer } from "@/lib/upload-validation";

/** Validate all sources before a new, user-confirmed record is created. */
export async function validateEntryUploads(files: File[]): Promise<boolean> {
  if (files.length > MAX_IDENTITY_DOCUMENT_FILES) return false;
  if (files.reduce((total, file) => total + file.size, 0) > 60 * 1024 * 1024) return false;
  for (const file of files) {
    const excel = file.name.toLowerCase().endsWith(".xlsx");
    if (file.size <= 0 || file.size > (excel ? getExcelUploadLimitBytes() : getIdentityDocumentUploadLimitBytes())) return false;
    const content = Buffer.from(await file.arrayBuffer());
    if (excel) {
      if (files.length !== 1 || !isZipContainer(content)) return false;
      try { await validateExcelZip(content); } catch { return false; }
    } else if (!detectIdentityDocumentKind(content)) return false;
  }
  return true;
}
