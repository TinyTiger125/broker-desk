import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { addAuditLog } from "@/lib/data";
import { entryFileKey, type EntryPreviewCandidate } from "@/lib/entry-preview";
import type { TenantSession } from "@/lib/tenant-session";

type PreviewSession = Pick<TenantSession, "tenant" | "user">;
export type EntryPreviewProofPayload = {
  tenantId: string;
  userId: string;
  fileKey: string;
  digest: string;
  kind: "customer" | "property";
  context: "entry" | "case";
  expiresAt: number;
  candidates: EntryPreviewCandidate[];
};

/**
 * Derive the payload fingerprint used to prove that a retry carries the same
 * request body.  This is deliberately not the idempotency key: a user may
 * intentionally create two records from the same files and values, while a
 * retry of one intent must keep its original id.
 */
export async function buildEntryRequestPayloadDigest(input: {
  targetType: "party" | "property" | "case";
  files: File[];
  proofs: ReadonlyMap<string, EntryPreviewProofPayload>;
  formData?: FormData;
}): Promise<string> {
  const digests: string[] = [];
  for (const file of input.files) {
    const proof = input.proofs.get(entryFileKey(file));
    digests.push(proof?.digest ?? createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex"));
  }
  const volatileFields = new Set([
    "uploadFile", "caseUploadFile", "entryReadProofs", "entryReadFileKeys",
    "entryPreviewDecisions", "entryIntentId", "entryRequestKey", "entryPayloadDigest", "entryClaimToken", "caseDraftReturn", "returnTo",
    "submitReturnTo", "afterSave",
  ]);
  const formValues = input.formData
    ? [...input.formData.entries()]
      .filter(([field, value]) => !volatileFields.has(field) && typeof value === "string")
      .map(([field, value]) => [field, String(value)] as const)
      .sort(([aField, aValue], [bField, bValue]) => aField.localeCompare(bField) || aValue.localeCompare(bValue))
      .map(([field, value]) => `${field}=${value}`)
      .join("&")
    : "";
  return createHash("sha256").update(`${input.targetType}|${[...digests].sort().join("|")}|${formValues}`).digest("hex");
}

export function readEntryIntentId(formData: FormData): string {
  const value = String(formData.get("entryIntentId") ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("entry_intent_id_invalid");
  }
  return value.toLowerCase();
}

// Temporary previews intentionally expire with this runtime. A restart cannot
// turn an unverified browser claim into permission to skip document reading.
const runtime = globalThis as typeof globalThis & { __brokerDeskEntryProofKey?: Buffer };
const key = runtime.__brokerDeskEntryProofKey ??= randomBytes(32);
const signature = (payload: string) => createHmac("sha256", key).update(payload).digest();

export function signEntryPreviewProof(input: Omit<EntryPreviewProofPayload, "expiresAt">, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...input, expiresAt: now + 2 * 60 * 60 * 1000 })).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}

export function readEntryPreviewDecisions(formData: FormData): Record<string, "confirmed" | "rejected" | "auto_saved"> {
  try {
    const parsed: unknown = JSON.parse(String(formData.get("entryPreviewDecisions") ?? "{}"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value === "confirmed" || value === "rejected" || value === "auto_saved"));
  } catch { return {}; }
}

export async function verifyEntryPreviewProofs(input: { formData: FormData; files: File[]; session: PreviewSession; kind?: "customer" | "property"; context: "entry" | "case" }): Promise<Map<string, EntryPreviewProofPayload>> {
  const result = new Map<string, EntryPreviewProofPayload>();
  let raw: unknown;
  try { raw = JSON.parse(String(input.formData.get("entryReadProofs") ?? "{}")); } catch { throw new Error("entry_preview_proof_invalid"); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("entry_preview_proof_invalid");
  for (const [fileKey, token] of Object.entries(raw)) {
    if (typeof token !== "string" || token.length > 200_000) throw new Error("entry_preview_proof_invalid");
    const [encoded, supplied, extra] = token.split(".");
    if (!encoded || !supplied || extra) throw new Error("entry_preview_proof_invalid");
    const expected = signature(encoded);
    const actual = Buffer.from(supplied, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) throw new Error("entry_preview_proof_invalid");
    let payload: EntryPreviewProofPayload;
    try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { throw new Error("entry_preview_proof_invalid"); }
    if (payload.tenantId !== input.session.tenant.id || payload.userId !== input.session.user.id || payload.context !== input.context || (input.kind && payload.kind !== input.kind) || payload.fileKey !== fileKey || payload.expiresAt <= Date.now() || !Array.isArray(payload.candidates)) throw new Error("entry_preview_proof_invalid");
    const matching = input.files.filter((file) => entryFileKey(file) === fileKey);
    if (matching.length !== 1 || createHash("sha256").update(Buffer.from(await matching[0].arrayBuffer())).digest("hex") !== payload.digest) throw new Error("entry_preview_proof_invalid");
    result.set(fileKey, payload);
  }
  // A browser cannot replace a signed proof with a bare filename claim.
  let claimed: unknown;
  try { claimed = JSON.parse(String(input.formData.get("entryReadFileKeys") ?? "[]")); } catch { throw new Error("entry_preview_proof_invalid"); }
  if (!Array.isArray(claimed) || claimed.some((fileKey) => typeof fileKey !== "string" || !result.has(fileKey))) throw new Error("entry_preview_proof_invalid");
  return result;
}

export async function persistEntryPreviewAudit(input: { session: PreviewSession; targetType: "party" | "property" | "case"; targetId: string; attachmentId: string; proof: EntryPreviewProofPayload; formData: FormData; finalValues?: Record<string, unknown> }) {
  const decisions = readEntryPreviewDecisions(input.formData);
  await addAuditLog({
    tenantId: input.session.tenant.id, userId: input.session.user.id,
    action: "entry_preview_reviewed", targetType: input.targetType, targetId: input.targetId,
    message: "資料の候補確認と原本の保存を記録しました。",
    context: {
      attachmentId: input.attachmentId, fileDigest: input.proof.digest,
      ...(input.formData.get("entryRequestKey") ? { entryRequestKey: String(input.formData.get("entryRequestKey")) } : {}),
      ...(input.formData.get("entryPayloadDigest") ? { entryPayloadDigest: String(input.formData.get("entryPayloadDigest")) } : {}),
      source: "unified_entry_preview", kind: input.proof.kind,
      review: input.proof.candidates.map((candidate) => ({
        fieldKey: candidate.key, sourceKey: candidate.sourceKey,
        candidateValue: candidate.value, decision: decisions[candidate.id] ?? "undecided",
        savedValue: input.finalValues?.[candidate.key],
        pageNumber: candidate.pageNumber, sourceText: candidate.sourceText?.slice(0, 1000),
        uncertainty: candidate.uncertainty,
      })),
    },
  });
}
