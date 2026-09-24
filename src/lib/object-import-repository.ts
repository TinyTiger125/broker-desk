export type ObjectImportKind = "party" | "property";
export type ObjectImportStatus = "queued" | "processing" | "needs_review" | "completed" | "failed" | "conflict";

export type ObjectImportTargetRecord = {
  id: string; tenantId: string; userId: string; caseId: string; importJobId: string;
  targetType: ObjectImportKind; targetId: string; targetVersion: string;
  sourceAttachmentId?: string; status: ObjectImportStatus; idempotencyKey: string;
  attemptCount: number; errorCode?: string; errorSummary?: string;
  createdAt: Date; updatedAt: Date;
};

export type ObjectImportCandidateRecord = {
  id: string; tenantId: string; targetId: string; fieldKey: string;
  candidateValue?: string; confidence?: number; provenance: Record<string, unknown>;
  finalValue?: string; finalSource?: "model_draft" | "human";
  status: "draft" | "confirmed" | "rejected" | "low_confidence" | "conflict" | "failed";
  confirmedByUserId?: string; confirmedAt?: Date;
};

export type ObjectImportScope = { tenantId: string; userId: string };

export interface ObjectImportRepository {
  getTarget(input: ObjectImportScope & { id: string }): Promise<ObjectImportTargetRecord | null>;
  listTargets(input: ObjectImportScope & { caseId: string }): Promise<ObjectImportTargetRecord[]>;
  listCandidates(input: ObjectImportScope & { targetId: string }): Promise<ObjectImportCandidateRecord[]>;
  getTargetByJob(input: { tenantId: string; userId: string; importJobId: string }): Promise<ObjectImportTargetRecord | null>;
  createTarget(input: ObjectImportTargetRecord): Promise<ObjectImportTargetRecord>;
  updateTarget(input: Pick<ObjectImportTargetRecord, "tenantId" | "userId" | "id" | "status"> & Partial<Pick<ObjectImportTargetRecord, "attemptCount" | "errorCode" | "errorSummary">>): Promise<ObjectImportTargetRecord | null>;
  upsertCandidate(input: ObjectImportCandidateRecord): Promise<ObjectImportCandidateRecord>;
}
