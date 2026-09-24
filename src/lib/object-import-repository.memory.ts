import type { ObjectImportCandidateRecord, ObjectImportRepository, ObjectImportTargetRecord, ObjectImportScope } from "@/lib/object-import-repository";

export class MemoryObjectImportRepository implements ObjectImportRepository {
  constructor(private readonly targets: ObjectImportTargetRecord[] = [], private readonly candidates: ObjectImportCandidateRecord[] = []) {}
  async getTarget(input: ObjectImportScope & { id: string }) {
    const item = this.targets.find((item) => item.id === input.id && item.tenantId === input.tenantId && item.userId === input.userId);
    return item ? structuredClone(item) : null;
  }
  async listTargets(input: ObjectImportScope & { caseId: string }) {
    return structuredClone(this.targets.filter((item) => item.tenantId === input.tenantId && item.userId === input.userId && item.caseId === input.caseId));
  }
  async getTargetByJob(input: ObjectImportScope & { importJobId: string }) {
    const item = this.targets.find((item) => item.tenantId === input.tenantId && item.userId === input.userId && item.importJobId === input.importJobId);
    return item ? structuredClone(item) : null;
  }
  async listCandidates(input: ObjectImportScope & { targetId: string }) {
    if (!await this.getTarget({ ...input, id: input.targetId })) return [];
    return structuredClone(this.candidates.filter((item) => item.tenantId === input.tenantId && item.targetId === input.targetId));
  }
  async createTarget(input: ObjectImportTargetRecord) {
    const existing = this.targets.find((item) => item.tenantId === input.tenantId && item.idempotencyKey === input.idempotencyKey);
    if (existing) {
      if (existing.userId !== input.userId) throw new Error("object_import_target_scope_mismatch");
      return structuredClone(existing);
    }
    if (this.targets.some((item) => item.id === input.id)) throw new Error("object_import_target_id_conflict");
    this.targets.push(structuredClone(input));
    return structuredClone(input);
  }
  async updateTarget(input: Pick<ObjectImportTargetRecord, "tenantId" | "userId" | "id" | "status"> & Partial<Pick<ObjectImportTargetRecord, "attemptCount" | "errorCode" | "errorSummary">>) {
    const item = this.targets.find((target) => target.id === input.id && target.tenantId === input.tenantId && target.userId === input.userId);
    if (!item) return null;
    Object.assign(item, input, { updatedAt: new Date() });
    return structuredClone(item);
  }
  async upsertCandidate(input: ObjectImportCandidateRecord) {
    if (!this.targets.some((item) => item.id === input.targetId && item.tenantId === input.tenantId)) throw new Error("object_import_target_not_found");
    const existing = this.candidates.find((item) => item.tenantId === input.tenantId && item.targetId === input.targetId && item.fieldKey === input.fieldKey);
    if (existing) {
      existing.candidateValue = input.candidateValue;
      existing.confidence = input.confidence;
      existing.provenance = structuredClone(input.provenance);
      if (existing.finalSource !== "human") {
        existing.finalValue = input.finalValue;
        existing.finalSource = input.finalSource ?? "model_draft";
        existing.status = input.status;
      }
      return structuredClone(existing);
    }
    if (this.candidates.some((item) => item.id === input.id)) throw new Error("object_import_candidate_id_conflict");
    const created = { ...structuredClone(input), finalSource: input.finalSource ?? "model_draft" as const };
    this.candidates.push(created);
    return structuredClone(created);
  }
}
