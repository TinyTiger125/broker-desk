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

export type EntryDraftSuggestion = { key: string; value: string };

/** Fill only blank existing controls; a draft suggestion never replaces a value already present. */
export function fillEmptyEntryDraftSuggestions<T extends Record<string, string>>(current: T, suggestions: readonly EntryDraftSuggestion[]): T {
  const next = { ...current };
  for (const suggestion of suggestions) {
    const key = suggestion.key as keyof T;
    const value = suggestion.value.trim();
    if (!(key in next) || !value || String(next[key] ?? "").trim()) continue;
    next[key] = value as T[keyof T];
  }
  return next;
}

function isNonActualCurrentAddress(candidate: Pick<EntryPreviewCandidate, "key" | "value">) {
  if (candidate.key !== "currentAddress" && candidate.key !== "applicant.currentAddress") return false;
  const normalized = candidate.value.trim().replace(/\s+/g, "");
  return /^(?:住所|住居地)?(?:未定|未確認|不明|なし|n\/a|-)$/i.test(normalized);
}

/** Only unambiguous values may enter a formal record without prior review. */
export function safeEntryPreviewCandidates(candidates: readonly EntryPreviewCandidate[]): EntryPreviewCandidate[] {
  const byKey = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    if (!candidate.value.trim()) continue;
    const values = byKey.get(candidate.key) ?? new Set<string>();
    values.add(candidate.value.trim());
    byKey.set(candidate.key, values);
  }
  return candidates.filter((candidate) => candidate.uncertainty === "clear"
    && Boolean(candidate.value.trim())
    && !isNonActualCurrentAddress(candidate)
    && byKey.get(candidate.key)?.size === 1);
}

export function fillAutoSavedEntryForm(formData: FormData, preview: EntryPreviewState): number {
  const selected = safeEntryPreviewCandidates(preview.candidates);
  const decisions: Record<string, "auto_saved"> = {};
  let applied = 0;
  for (const candidate of selected) {
    if (String(formData.get(candidate.key) ?? "").trim()) continue;
    formData.set(candidate.key, candidate.value);
    decisions[candidate.id] = "auto_saved";
    applied += 1;
  }
  formData.set("entryReadProofs", JSON.stringify(preview.readProofs ?? {}));
  formData.set("entryReadFileKeys", JSON.stringify(preview.readFileKeys));
  formData.set("entryPreviewDecisions", JSON.stringify(decisions));
  formData.set("entryAutoSave", "1");
  return applied;
}

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
