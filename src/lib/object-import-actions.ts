import { createObjectImportTarget } from "@/lib/data";
import { resolveObjectImportTarget } from "@/lib/object-import-target-service";
import type { ObjectImportRepository } from "@/lib/object-import-repository";
import { persistObjectImportJobExtraction } from "@/lib/object-import-processor-adapter";

export async function createObjectImportTask(input: { context: Parameters<typeof resolveObjectImportTarget>[0]["context"]; repository?: ObjectImportRepository; caseId: string; targetType: "party" | "property"; targetId: string; task: Parameters<ObjectImportRepository["createTarget"]>[0] }) {
  const resolved = await resolveObjectImportTarget({ context: input.context, caseId: input.caseId, targetType: input.targetType, targetId: input.targetId });
  if (!resolved.ok) return resolved;
  return { ok: true as const, target: await (input.repository?.createTarget.bind(input.repository) ?? createObjectImportTarget)({ ...input.task, tenantId: input.context.tenantId, userId: input.context.userId, caseId: input.caseId, targetType: input.targetType, targetId: input.targetId, targetVersion: resolved.targetVersion }) };
}

export async function saveObjectImportCandidates(input: Parameters<typeof persistObjectImportJobExtraction>[0]) {
  return persistObjectImportJobExtraction(input);
}
