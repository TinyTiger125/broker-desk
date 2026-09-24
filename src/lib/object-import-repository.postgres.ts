import type { Pool } from "pg";
import type { ObjectImportCandidateRecord, ObjectImportRepository, ObjectImportTargetRecord, ObjectImportScope } from "@/lib/object-import-repository";

type Row = Record<string, unknown>;
const optionalString = (value: unknown) => value == null ? undefined : String(value);
export function mapObjectImportTarget(row: Row): ObjectImportTargetRecord {
  return {
    id: String(row.id), tenantId: String(row.tenant_id), userId: String(row.user_id),
    caseId: String(row.case_id), importJobId: String(row.import_job_id),
    targetType: row.target_type as ObjectImportTargetRecord["targetType"], targetId: String(row.target_id), targetVersion: String(row.target_version),
    sourceAttachmentId: optionalString(row.source_attachment_id), status: row.status as ObjectImportTargetRecord["status"],
    idempotencyKey: String(row.idempotency_key), attemptCount: Number(row.attempt_count),
    errorCode: optionalString(row.error_code), errorSummary: optionalString(row.error_summary),
    createdAt: new Date(row.created_at as string | Date), updatedAt: new Date(row.updated_at as string | Date),
  };
}
export function mapObjectImportCandidate(row: Row): ObjectImportCandidateRecord {
  return {
    id: String(row.id), tenantId: String(row.tenant_id), targetId: String(row.object_import_target_id), fieldKey: String(row.field_key),
    candidateValue: optionalString(row.model_value), confidence: row.model_confidence == null ? undefined : Number(row.model_confidence),
    provenance: (typeof row.model_source === "string" ? JSON.parse(row.model_source) : row.model_source ?? {}) as Record<string, unknown>,
    finalValue: optionalString(row.final_value), finalSource: row.final_source as ObjectImportCandidateRecord["finalSource"],
    status: row.status as ObjectImportCandidateRecord["status"], confirmedByUserId: optionalString(row.confirmed_by_user_id),
    confirmedAt: row.confirmed_at == null ? undefined : new Date(row.confirmed_at as string | Date),
  };
}

export class PostgresObjectImportRepository implements ObjectImportRepository {
  constructor(private readonly pool: Pick<Pool, "query">) {}
  async getTarget(input: ObjectImportScope & { id: string }) {
    const result = await this.pool.query("SELECT * FROM object_import_targets WHERE tenant_id=$1 AND user_id=$2 AND id=$3 LIMIT 1", [input.tenantId, input.userId, input.id]);
    return result.rows[0] ? mapObjectImportTarget(result.rows[0]) : null;
  }
  async listTargets(input: ObjectImportScope & { caseId: string }) {
    const result = await this.pool.query("SELECT * FROM object_import_targets WHERE tenant_id=$1 AND user_id=$2 AND case_id=$3 ORDER BY created_at,id", [input.tenantId, input.userId, input.caseId]);
    return result.rows.map(mapObjectImportTarget);
  }
  async getTargetByJob(input: ObjectImportScope & { importJobId: string }) {
    const result = await this.pool.query("SELECT * FROM object_import_targets WHERE tenant_id=$1 AND user_id=$2 AND import_job_id=$3 LIMIT 1", [input.tenantId, input.userId, input.importJobId]);
    return result.rows[0] ? mapObjectImportTarget(result.rows[0]) : null;
  }
  async listCandidates(input: ObjectImportScope & { targetId: string }) {
    const result = await this.pool.query("SELECT f.* FROM object_import_fields f JOIN object_import_targets t ON t.id=f.object_import_target_id AND t.tenant_id=f.tenant_id WHERE f.tenant_id=$1 AND t.user_id=$2 AND t.id=$3 ORDER BY f.field_key", [input.tenantId, input.userId, input.targetId]);
    return result.rows.map(mapObjectImportCandidate);
  }
  async createTarget(input: ObjectImportTargetRecord) {
    const result = await this.pool.query("INSERT INTO object_import_targets (id,tenant_id,user_id,case_id,import_job_id,target_type,target_id,target_version,source_attachment_id,status,idempotency_key,attempt_count,error_code,error_summary,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (tenant_id,idempotency_key) DO UPDATE SET updated_at=object_import_targets.updated_at WHERE object_import_targets.user_id=EXCLUDED.user_id RETURNING *", [input.id,input.tenantId,input.userId,input.caseId,input.importJobId,input.targetType,input.targetId,input.targetVersion,input.sourceAttachmentId ?? null,input.status,input.idempotencyKey,input.attemptCount,input.errorCode ?? null,input.errorSummary ?? null,input.createdAt,input.updatedAt]);
    if (!result.rows[0]) throw new Error("object_import_target_scope_mismatch");
    return mapObjectImportTarget(result.rows[0]);
  }
  async updateTarget(input: Pick<ObjectImportTargetRecord, "tenantId" | "userId" | "id" | "status"> & Partial<Pick<ObjectImportTargetRecord, "attemptCount" | "errorCode" | "errorSummary">>) {
    const result = await this.pool.query("UPDATE object_import_targets SET status=$1,attempt_count=COALESCE($2,attempt_count),error_code=CASE WHEN $8 THEN $3 ELSE error_code END,error_summary=CASE WHEN $9 THEN $4 ELSE error_summary END,updated_at=NOW() WHERE id=$5 AND tenant_id=$6 AND user_id=$7 RETURNING *", [input.status,input.attemptCount ?? null,input.errorCode ?? null,input.errorSummary ?? null,input.id,input.tenantId,input.userId,"errorCode" in input,"errorSummary" in input]);
    return result.rows[0] ? mapObjectImportTarget(result.rows[0]) : null;
  }
  async upsertCandidate(input: ObjectImportCandidateRecord) {
    const result = await this.pool.query(`INSERT INTO object_import_fields (id,tenant_id,object_import_target_id,field_key,model_value,model_confidence,model_source,final_value,final_source,status,confirmed_by_user_id,confirmed_at)
      SELECT $1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12
      WHERE EXISTS (SELECT 1 FROM object_import_targets WHERE id=$3 AND tenant_id=$2)
      ON CONFLICT (object_import_target_id,field_key) DO UPDATE SET model_value=EXCLUDED.model_value,model_confidence=EXCLUDED.model_confidence,model_source=EXCLUDED.model_source,
      final_value=CASE WHEN object_import_fields.final_source='human' THEN object_import_fields.final_value ELSE EXCLUDED.final_value END,
      final_source=CASE WHEN object_import_fields.final_source='human' THEN object_import_fields.final_source ELSE EXCLUDED.final_source END,
      status=CASE WHEN object_import_fields.final_source='human' THEN object_import_fields.status ELSE EXCLUDED.status END
      WHERE object_import_fields.tenant_id=EXCLUDED.tenant_id RETURNING *`, [input.id,input.tenantId,input.targetId,input.fieldKey,input.candidateValue ?? null,input.confidence ?? null,JSON.stringify(input.provenance),input.finalValue ?? null,input.finalSource ?? "model_draft",input.status,input.confirmedByUserId ?? null,input.confirmedAt ?? null]);
    if (!result.rows[0]) throw new Error("object_import_target_not_found");
    return mapObjectImportCandidate(result.rows[0]);
  }
}
