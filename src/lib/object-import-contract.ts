import { createHash } from "node:crypto";

export const OBJECT_IMPORT_TARGET_TYPES = ["party", "property"] as const;
export type ObjectImportTargetType = (typeof OBJECT_IMPORT_TARGET_TYPES)[number];
export type ObjectImportStatus = "queued" | "processing" | "needs_review" | "completed" | "failed" | "conflict";
export type ObjectImportFeatureReadiness =
  | { ready: true }
  | { ready: false; reason: "migration_required" | "schema_incomplete" };

export function resolveObjectImportFeatureReadiness(input: {
  migrationApplied: boolean;
  targetsTablePresent: boolean;
  fieldsTablePresent: boolean;
}): ObjectImportFeatureReadiness {
  if (!input.migrationApplied) return { ready: false, reason: "migration_required" };
  if (!input.targetsTablePresent || !input.fieldsTablePresent) return { ready: false, reason: "schema_incomplete" };
  return { ready: true };
}

export function isObjectImportStatusTransitionAllowed(from: ObjectImportStatus, to: ObjectImportStatus) {
  return from === to || (from === "queued" && to === "processing") || (from === "processing" && ["needs_review", "completed", "failed", "conflict"].includes(to)) || (from === "failed" && to === "queued");
}
export type ObjectImportFieldStatus = "draft" | "confirmed" | "rejected" | "low_confidence" | "conflict" | "failed";

export type ObjectImportMetadata = {
  caseId: string;
  targetObjectType: ObjectImportTargetType;
  targetObjectId: string;
  targetVersion: string;
  sourceAttachmentId?: string;
};

export type ObjectImportFieldCandidate = {
  fieldKey: string;
  modelValue?: string;
  modelConfidence?: number;
  modelSource: Record<string, unknown>;
  finalValue?: string;
  finalSource?: "model_draft" | "human";
  status: ObjectImportFieldStatus;
};
export const OBJECT_IMPORT_WRITABLE_FIELDS = {
  party: new Set(["name", "phone", "email"]),
  property: new Set(["name", "area", "address", "listing_price"]),
} as const;
export function normalizeObjectImportFieldKey(targetType: ObjectImportTargetType, fieldKey: string): string {
  const key = fieldKey.includes(".") ? fieldKey.split(".").at(-1) ?? "" : fieldKey;
  if (!OBJECT_IMPORT_WRITABLE_FIELDS[targetType].has(key as never)) throw new Error("object_import_field_not_writable");
  return key;
}
export function toObjectRecordFieldKey(targetType: ObjectImportTargetType, fieldKey: string): string {
  const key = normalizeObjectImportFieldKey(targetType, fieldKey);
  return targetType === "property" && key === "listing_price" ? "listingPrice" : key;
}

export function assertObjectImportMetadata(value: Partial<ObjectImportMetadata>): ObjectImportMetadata {
  if (value.targetObjectType !== "party" && value.targetObjectType !== "property") {
    throw new Error("object_import_target_type_invalid");
  }
  const targetObjectId = value.targetObjectId?.trim();
  const targetVersion = value.targetVersion?.trim();
  if (!targetObjectId || !targetVersion) throw new Error("object_import_target_required");
  const caseId = value.caseId?.trim();
  if (!caseId) throw new Error("object_import_case_required");
  return { caseId, targetObjectType: value.targetObjectType, targetObjectId, targetVersion, sourceAttachmentId: value.sourceAttachmentId?.trim() || undefined };
}

export function buildObjectImportIdempotencyKey(input: {
  tenantId: string;
  target: ObjectImportMetadata;
  sourceHash: string;
}): string {
  const target = assertObjectImportMetadata(input.target);
  return `object:${input.tenantId}:${target.caseId}:${target.targetObjectType}:${target.targetObjectId}:${input.sourceHash}:${target.targetVersion}`;
}

export function buildObjectImportSourceHash(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

export function buildObjectVersionFingerprint(record: Record<string, unknown>): string {
  const stable = Object.fromEntries(Object.entries(record).filter(([key]) => !["createdAt", "updatedAt"].includes(key)).sort(([a], [b]) => a.localeCompare(b)));
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export function serializeObjectImportNotes(metadata: ObjectImportMetadata): string {
  return JSON.stringify({ objectImport: assertObjectImportMetadata(metadata) });
}

export function parseObjectImportNotes(notes?: string): ObjectImportMetadata | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as { objectImport?: Partial<ObjectImportMetadata> };
    return parsed.objectImport ? assertObjectImportMetadata(parsed.objectImport) : null;
  } catch {
    return null;
  }
}

/** Model output is always a draft. Human confirmed values are never overwritten. */
export function resolveObjectImportFieldValue(input: {
  existingFinalValue?: string;
  existingFinalSource?: "model_draft" | "human";
  modelValue?: string;
  modelConfidence?: number;
  objectVersionAtStart: string;
  currentObjectVersion: string;
}): { finalValue?: string; status: ObjectImportFieldStatus } {
  if (input.existingFinalSource === "human") return { finalValue: input.existingFinalValue, status: "confirmed" };
  if (input.objectVersionAtStart !== input.currentObjectVersion) return { finalValue: input.existingFinalValue, status: "conflict" };
  if (!input.modelValue?.trim()) return { finalValue: input.existingFinalValue, status: "failed" };
  if (typeof input.modelConfidence === "number" && input.modelConfidence < 0.8) return { finalValue: input.existingFinalValue, status: "low_confidence" };
  return { finalValue: input.modelValue, status: "draft" };
}
