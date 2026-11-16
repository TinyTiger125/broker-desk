import { normalizeCustomerGenderValue } from "@/lib/customer-identity-field-catalog";

export type EntryPreviewCandidate = {
  id: string;
  key: string;
  sourceKey: string;
  label: string;
  value: string;
  /** Original model/OCR value when `value` is a canonical form value. */
  rawValue?: string;
  fileName: string;
  /** Stable per-upload file key used to prevent cross-file identity mixing. */
  fileKey?: string;
  pageNumber?: number;
  sourceText?: string;
  uncertainty?: string;
  /** Candidate is evidence-only until a person reviews the batch identity. */
  reviewOnly?: boolean;
};

export type EntryPreviewState = {
  status: "ready" | "error";
  candidates: EntryPreviewCandidate[];
  readFileKeys: string[];
  readProofs?: Record<string, string>;
  errorCode?: string;
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

const CROSS_FILE_IDENTITY_ANCHOR_KEYS = new Set(["name", "nameLatin", "nameKanji", "nameKatakana", "birthDate"]);

function crossFileIdentityAnchor(candidate: EntryPreviewCandidate): string | undefined {
  if (!candidate.fileKey || !CROSS_FILE_IDENTITY_ANCHOR_KEYS.has(candidate.key) || !candidate.value.trim()) return undefined;
  return `${candidate.key}:${candidate.value.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase()}`;
}

/** Multiple uploaded files may merge only when every file has one shared identity anchor. */
export function requiresCrossFileIdentityReview(candidates: readonly EntryPreviewCandidate[]): boolean {
  const fileKeys = [...new Set(candidates.map((candidate) => candidate.fileKey).filter((key): key is string => Boolean(key)))];
  if (fileKeys.length <= 1) return false;
  const anchorsByFile = fileKeys.map((fileKey) => new Set(candidates
    .filter((candidate) => candidate.fileKey === fileKey && candidate.uncertainty !== "not_found")
    .map(crossFileIdentityAnchor)
    .filter((anchor): anchor is string => Boolean(anchor))));
  if (anchorsByFile.some((anchors) => anchors.size === 0)) return true;
  return ![...anchorsByFile[0]].some((anchor) => anchorsByFile.every((anchors) => anchors.has(anchor)));
}

/** Only unambiguous values may enter a formal record without prior review. */
export function safeEntryPreviewCandidates(candidates: readonly EntryPreviewCandidate[]): EntryPreviewCandidate[] {
  if (requiresCrossFileIdentityReview(candidates)) return [];
  const byKey = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    if (!candidate.value.trim()) continue;
    const values = byKey.get(candidate.key) ?? new Set<string>();
    values.add(candidate.value.trim());
    byKey.set(candidate.key, values);
  }
  return candidates.filter((candidate) => candidate.uncertainty === "clear"
    && !candidate.reviewOnly
    && Boolean(candidate.value.trim())
    && !isNonActualCurrentAddress(candidate)
    && (candidate.key !== "gender"
      || normalizeCustomerGenderValue(candidate.rawValue ?? candidate.value) === candidate.value)
    && byKey.get(candidate.key)?.size === 1);
}

/** Candidates that may be chosen explicitly; conflicts require that choice. */
export function selectableEntryPreviewCandidates(candidates: readonly EntryPreviewCandidate[]): EntryPreviewCandidate[] {
  if (requiresCrossFileIdentityReview(candidates)) return [];
  return candidates.filter((candidate) => {
    if (candidate.reviewOnly) return false;
    if (!candidate.value.trim() || isNonActualCurrentAddress(candidate)) return false;
    if (candidate.key === "gender" && normalizeCustomerGenderValue(candidate.rawValue ?? candidate.value) !== candidate.value) return false;
    if (candidate.uncertainty === "clear") return true;
    return candidate.uncertainty === "conflict"
      && candidates.some((other) => other.id !== candidate.id && other.key === candidate.key && other.value.trim() !== candidate.value.trim());
  });
}

const CLIENT_NAME_PREVIEW_KEYS = new Set(["name", "nameLatin", "nameKanji", "nameKatakana"]);

/** A name conflict must stay in the preview until a person chooses an alternative. */
export function hasClientNameEntryPreviewConflict(candidates: readonly EntryPreviewCandidate[]): boolean {
  return candidates.some((candidate) => CLIENT_NAME_PREVIEW_KEYS.has(candidate.key) && candidate.uncertainty === "conflict");
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
  // The individual customer form keeps `name` as a hidden compatibility
  // column while exposing three exact-script fields. A model may legitimately
  // return only one of those representations; derive the compatibility value
  // from the same accepted printed evidence without transliteration.
  if (!String(formData.get("name") ?? "").trim()) {
    const nameRepresentation = ["nameKanji", "nameLatin", "nameKatakana"]
      .map((key) => selected.find((candidate) => candidate.key === key))
      .find(Boolean);
    if (nameRepresentation) formData.set("name", nameRepresentation.value);
  }
  formData.set("entryReadProofs", JSON.stringify(preview.readProofs ?? {}));
  formData.set("entryReadFileKeys", JSON.stringify(preview.readFileKeys));
  formData.set("entryPreviewDecisions", JSON.stringify(decisions));
  formData.set("entryAutoSave", "1");
  return applied;
}

/** Fill exactly one clear candidate after an explicit user selection. */
export function fillSelectedEntryCandidateForm(formData: FormData, preview: EntryPreviewState, candidate: EntryPreviewCandidate): boolean {
  const selected = selectableEntryPreviewCandidates(preview.candidates).find((item) => item.id === candidate.id);
  if (!selected || selected.key !== candidate.key || selected.value !== candidate.value) return false;
  const existing = String(formData.get(selected.key) ?? "").trim();
  if (existing && existing !== selected.value) return false;
  formData.set(selected.key, selected.value);
  formData.set("entryReadProofs", JSON.stringify(preview.readProofs ?? {}));
  formData.set("entryReadFileKeys", JSON.stringify(preview.readFileKeys));
  formData.set("entryPreviewDecisions", JSON.stringify({ [selected.id]: "confirmed" }));
  formData.set("entryAutoSave", "1");
  return true;
}

// Multipart uploads preserve name and size, but not browser lastModified.
export function entryFileKey(file: Pick<File, "name" | "size">): string {
  // Staging persists the server-normalized name. Keep browser-side identity
  // keys byte-for-byte equivalent for NFD/NFC and surrounding whitespace so a
  // large file can never fall back to multipart Server Action input.
  return `${file.name.normalize("NFC").trim()}:${file.size}`;
}

export function parseEntryReadFileKeys(value: FormDataEntryValue | null): Set<string> {
  try {
    const parsed: unknown = JSON.parse(typeof value === "string" ? value : "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string").slice(0, 6) : []);
  } catch { return new Set(); }
}
