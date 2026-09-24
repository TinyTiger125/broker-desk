type MappingJob = {
  mappingJson?: Record<string, string>;
  notes?: string;
};

/** Extracted column order is authoritative; never substitute locale examples. */
export function getPropertyRowMappingPayload(notes?: string): {
  headers: string[];
  autoMapping: Record<string, string>;
} | null {
  if (!notes) return null;
  try {
    const value = JSON.parse(notes);
    if (value?.kind !== "property_row_import" || !Array.isArray(value.headers)
      || value.headers.length === 0 || !value.headers.every((item: unknown) => typeof item === "string" && item.trim().length > 0)
      || new Set(value.headers).size !== value.headers.length || !Array.isArray(value.rows)
      || !value.autoMapping || typeof value.autoMapping !== "object" || Array.isArray(value.autoMapping)
      || !Object.values(value.autoMapping).every((item) => typeof item === "string")) return null;
    return { headers: value.headers, autoMapping: value.autoMapping };
  } catch {
    return null;
  }
}

export function getImportMappingFormRows(job?: MappingJob) {
  if (!job) return [];
  let notesKind: unknown;
  if (job.notes) {
    try { notesKind = JSON.parse(job.notes)?.kind; } catch { /* Legacy notes may be plain text; only explicit saved rows remain usable. */ }
  }
  const saved = job.mappingJson ?? {};
  const hasSavedMapping = Object.keys(saved).length > 0;
  const payload = getPropertyRowMappingPayload(job.notes);
  if (payload) {
    const targets = hasSavedMapping ? saved : payload.autoMapping;
    return payload.headers.map((source) => ({
      source, target: Object.hasOwn(targets, source) ? targets[source] : "",
    }));
  }
  if (notesKind === "property_row_import") return [];
  // Legacy explicit mappings remain usable; missing/malformed extracted payload
  // with no saved mapping has no editable rows.
  return Object.entries(saved).map(([source, target]) => ({ source, target }));
}
