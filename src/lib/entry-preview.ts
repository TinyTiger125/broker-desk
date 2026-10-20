export type EntryPreviewCandidate = {
  id: string;
  key: string;
  sourceKey: string;
  label: string;
  value: string;
  fileName: string;
  pageNumber?: number;
  sourceText?: string;
  uncertainty?: string;
};

export type EntryPreviewState = {
  status: "ready" | "error";
  candidates: EntryPreviewCandidate[];
  readFileKeys: string[];
  readProofs?: Record<string, string>;
  message?: string;
};

// Multipart uploads preserve name and size, but not browser lastModified.
export function entryFileKey(file: Pick<File, "name" | "size">): string {
  return `${file.name}:${file.size}`;
}

export function parseEntryReadFileKeys(value: FormDataEntryValue | null): Set<string> {
  try {
    const parsed: unknown = JSON.parse(typeof value === "string" ? value : "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string").slice(0, 6) : []);
  } catch { return new Set(); }
}
