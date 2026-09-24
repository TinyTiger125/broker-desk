import { buildObjectVersionFingerprint } from "@/lib/object-import-contract";
import { resolveClientVisibilityForContext, resolveCaseVisibilityForContext, resolvePropertyVisibilityForContext } from "@/lib/data";
import { readCaseAssociationDraft } from "@/lib/case-associations";
import type { RequestContext } from "@/lib/visibility-resolver";

export type ObjectImportTargetType = "party" | "property";
export type ObjectImportTargetResolution =
  | { ok: true; caseId: string; targetType: ObjectImportTargetType; targetId: string; targetVersion: string; record: Record<string, unknown> }
  | { ok: false; reason: "case_not_writable" | "not_associated" | "object_not_writable" };

export async function resolveObjectImportTarget(input: { context: RequestContext; caseId: string; targetType: ObjectImportTargetType; targetId: string }): Promise<ObjectImportTargetResolution> {
  const caseResult = await resolveCaseVisibilityForContext({ context: input.context, caseId: input.caseId });
  if (!caseResult.record || !caseResult.resolution.canWrite) return { ok: false, reason: "case_not_writable" };
  const association = readCaseAssociationDraft(caseResult.record.confirmedDataJson);
  const associated = input.targetType === "party" ? association.parties.some((party) => party.partyId === input.targetId) : association.primaryPropertyId === input.targetId;
  if (!associated) return { ok: false, reason: "not_associated" };
  const result = input.targetType === "party"
    ? await resolveClientVisibilityForContext({ context: input.context, clientId: input.targetId })
    : await resolvePropertyVisibilityForContext({ context: input.context, propertyId: input.targetId });
  if (!result.record || !result.resolution.canWrite) return { ok: false, reason: "object_not_writable" };
  const record = result.record as unknown as Record<string, unknown>;
  const targetVersion = buildObjectVersionFingerprint(record);
  return { ok: true, caseId: input.caseId, targetType: input.targetType, targetId: input.targetId, targetVersion, record };
}
