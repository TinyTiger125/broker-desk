import {
  cleanupExpiredEntryUploadStaging,
  consumeEntryUploadStaging,
  discardEntryUploadStaging,
  readEntryUploadStaging,
} from "@/lib/data";
import type { EntryUploadStagingRecord } from "@/lib/entry-upload-staging-contract";

export type EntryUploadStagedFileRef = {
  id: string;
  fileName: string;
  fileType?: string;
  fileSizeBytes: number;
  sha256: string;
};

const REF_PATTERN = /^[A-Za-z0-9_-]{8,160}$/;
const SHA_PATTERN = /^[a-f0-9]{64}$/;

export function parseEntryUploadStagedRefs(value: FormDataEntryValue | null): EntryUploadStagedFileRef[] {
  if (typeof value !== "string" || !value.trim()) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error("entry_upload_staging_invalid_reference"); }
  if (!Array.isArray(parsed) || parsed.length > 6) throw new Error("entry_upload_staging_invalid_reference");
  const refs = parsed.map((item): EntryUploadStagedFileRef => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("entry_upload_staging_invalid_reference");
    const value = item as Record<string, unknown>;
    const id = typeof value.id === "string" ? value.id.trim() : "";
    const fileName = typeof value.fileName === "string" ? value.fileName.normalize("NFC").trim() : "";
    const fileType = typeof value.fileType === "string" ? value.fileType.trim() : undefined;
    const fileSizeBytes = Number(value.fileSizeBytes);
    const sha256 = typeof value.sha256 === "string" ? value.sha256.trim().toLowerCase() : "";
    if (!REF_PATTERN.test(id) || !fileName || fileName === "." || fileName === ".." || fileName.length > 255 || /[\\/\u0000-\u001f\u007f]/u.test(fileName)
      || !Number.isSafeInteger(fileSizeBytes) || fileSizeBytes <= 0 || !SHA_PATTERN.test(sha256)) {
      throw new Error("entry_upload_staging_invalid_reference");
    }
    return { id, fileName, ...(fileType ? { fileType } : {}), fileSizeBytes, sha256 };
  });
  if (new Set(refs.map((ref) => `${ref.fileName}:${ref.fileSizeBytes}`)).size !== refs.length) throw new Error("entry_upload_staging_duplicate_reference");
  return refs;
}

export async function readEntryUploadStagedFiles(input: {
  refs: EntryUploadStagedFileRef[];
  tenantId: string;
  userId: string;
  requestKey?: string;
}): Promise<{ files: File[]; records: EntryUploadStagingRecord[] }> {
  const files: File[] = [];
  const records: EntryUploadStagingRecord[] = [];
  for (const ref of input.refs) {
    const staged = await readEntryUploadStaging({ tenantId: input.tenantId, userId: input.userId, id: ref.id, requestKey: input.requestKey });
    if (!staged || staged.record.fileName !== ref.fileName || staged.record.fileSizeBytes !== ref.fileSizeBytes || staged.record.sha256 !== ref.sha256) throw new Error("entry_upload_staging_reference_mismatch");
    files.push(new File([Uint8Array.from(staged.content)], staged.record.fileName, { type: staged.record.fileType || ref.fileType || "application/octet-stream" }));
    records.push(staged.record);
  }
  return { files, records };
}

export async function consumeEntryUploadStagedFiles(input: { records: EntryUploadStagingRecord[]; tenantId: string; userId: string; requestKey: string }): Promise<void> {
  for (const record of input.records) {
    if (!await consumeEntryUploadStaging({ tenantId: input.tenantId, userId: input.userId, id: record.id, requestKey: input.requestKey })) throw new Error("entry_upload_staging_consume_failed");
  }
}

export async function discardEntryUploadStagedFiles(input: { records: EntryUploadStagingRecord[]; tenantId: string; userId: string }): Promise<void> {
  await Promise.all(input.records.map((record) => discardEntryUploadStaging({ tenantId: input.tenantId, userId: input.userId, id: record.id })));
}

export async function cleanupEntryUploadStagingForUser(input: { tenantId: string; userId: string }): Promise<number> {
  return cleanupExpiredEntryUploadStaging(input);
}
