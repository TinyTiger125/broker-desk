export const ENTRY_UPLOAD_CHUNK_SIZE_BYTES = 1024 * 1024;
export const ENTRY_UPLOAD_STAGING_TTL_MS = 30 * 60 * 1000;
export const ENTRY_UPLOAD_STAGING_MAX_ACTIVE_FILES = 6;
export const ENTRY_UPLOAD_STAGING_MAX_ACTIVE_BYTES = 60 * 1024 * 1024;
// Keep this at the existing identity-upload ceiling. The final validation
// still applies the active attachment-storage ceiling (10 MiB for the
// postgres-private production backend), so staging never silently widens the
// durable archive limit.
export const ENTRY_UPLOAD_STAGING_MAX_FILE_BYTES = 25 * 1024 * 1024;

export type EntryUploadStagingStatus = "open" | "ready" | "consumed";

export type EntryUploadStagingRecord = {
  id: string;
  tenantId: string;
  userId: string;
  fileName: string;
  fileType?: string;
  fileSizeBytes: number;
  sha256: string;
  chunkSizeBytes: number;
  chunkCount: number;
  status: EntryUploadStagingStatus;
  consumedRequestKey?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type EntryUploadStagingChunk = {
  stagingId: string;
  chunkIndex: number;
  content: Buffer;
  sha256: string;
  byteSize: number;
};

export type CreateEntryUploadStagingInput = {
  tenantId?: string;
  userId: string;
  fileName: string;
  fileType?: string;
  fileSizeBytes: number;
  sha256: string;
  chunkCount: number;
};

export type EntryUploadStagingScope = {
  tenantId?: string;
  userId: string;
  id: string;
};

export type PutEntryUploadStagingChunkInput = EntryUploadStagingScope & {
  chunkIndex: number;
  content: Buffer;
  sha256: string;
};

export type EntryUploadStagingReadInput = EntryUploadStagingScope & {
  requestKey?: string;
};
