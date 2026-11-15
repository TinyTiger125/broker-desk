import { ENTRY_UPLOAD_CHUNK_SIZE_BYTES } from "@/lib/entry-upload-staging-contract";
import type { EntryUploadStagedFileRef } from "@/lib/entry-upload-staging";

type StagingResponse = {
  ok: boolean;
  error?: string;
  staging?: EntryUploadStagedFileRef & {
    chunkCount?: number;
    chunkSizeBytes?: number;
    expiresAt?: string;
    status?: string;
  };
};

async function readResponse(response: Response, requiresStaging = true): Promise<StagingResponse> {
  const body = await response.json().catch(() => ({})) as StagingResponse;
  if (!response.ok || !body.ok || (requiresStaging && !body.staging)) throw new Error(body.error || "entry_upload_staging_unavailable");
  return body;
}

async function digest(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function remove(ids: readonly string[]) {
  await Promise.all(ids.map((id) => fetch(`/api/entry-staging?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined)));
}

/** Upload files as private 1 MiB chunks while preserving exact source bytes. */
export async function stageEntryUploadFiles(files: readonly File[]): Promise<EntryUploadStagedFileRef[]> {
  const created: string[] = [];
  try {
    const refs: EntryUploadStagedFileRef[] = [];
    for (const file of files) {
      const fileDigest = await digest(file);
      const chunkCount = Math.ceil(file.size / ENTRY_UPLOAD_CHUNK_SIZE_BYTES);
      const init = await readResponse(await fetch("/api/entry-staging", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "init", fileName: file.name, fileType: file.type, fileSizeBytes: file.size, sha256: fileDigest, chunkCount }),
      }));
      const staging = init.staging!;
      created.push(staging.id);
      const chunkSize = staging.chunkSizeBytes ?? ENTRY_UPLOAD_CHUNK_SIZE_BYTES;
      for (let index = 0; index < chunkCount; index += 1) {
        const chunk = file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize));
        const chunkDigest = await digest(chunk);
        await readResponse(await fetch(`/api/entry-staging?id=${encodeURIComponent(staging.id)}&index=${index}`, {
          method: "PUT",
          headers: { "content-type": "application/octet-stream", "x-entry-staging-sha256": chunkDigest },
          body: chunk,
        }), false);
      }
      const completed = await readResponse(await fetch("/api/entry-staging", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "complete", id: staging.id }),
      }));
      const final = completed.staging!;
      refs.push({ id: final.id, fileName: final.fileName, ...(final.fileType ? { fileType: final.fileType } : {}), fileSizeBytes: final.fileSizeBytes, sha256: final.sha256 });
    }
    return refs;
  } catch (error) {
    await remove(created);
    throw error;
  }
}

export function applyEntryStagedFilesToFormData(formData: FormData, refs: readonly EntryUploadStagedFileRef[]): void {
  if (!refs.length) return;
  formData.delete("uploadFile");
  formData.set("entryStagedFiles", JSON.stringify(refs));
}
