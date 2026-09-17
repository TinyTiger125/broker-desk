"use server";

import { getObjectImportFeatureReadiness, reviewObjectImportCandidate } from "@/lib/data";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/tenant-session";
import { createRequestContext } from "@/lib/visibility-resolver";
import { resolveObjectImportTarget } from "@/lib/object-import-target-service";
import { queueExcelImportSource } from "@/lib/excel-import-queue";
import { queueIdentityImportSources } from "@/lib/identity-import-queue";

export async function uploadObjectImportAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "source.upload" });
  const readiness = await getObjectImportFeatureReadiness();
  if (!readiness.ready) throw new Error(`object_import_feature_unavailable:${readiness.reason}`);
  const caseId = String(formData.get("caseId") ?? "").trim();
  const targetType = String(formData.get("targetType") ?? "").trim();
  const targetId = String(formData.get("targetId") ?? "").trim();
  const file = formData.get("uploadFile");
  if (!caseId || (targetType !== "party" && targetType !== "property") || !targetId || !(file instanceof File) || file.size === 0) throw new Error("对象资料上传参数不完整。");
  const resolved = await resolveObjectImportTarget({ context: createRequestContext(session), caseId, targetType, targetId });
  if (!resolved.ok) throw new Error(`object_import_target_rejected:${resolved.reason}`);
  const result = file.name.toLowerCase().endsWith(".xlsx")
    ? await queueExcelImportSource({ tenantId: session.tenant.id, userId: session.user.id, file, caseId, targetObjectType: targetType, targetObjectId: targetId, targetVersion: resolved.targetVersion })
    : await queueIdentityImportSources({ tenantId: session.tenant.id, userId: session.user.id, files: [file], uploadMode: "same_person", caseId, targetObjectType: targetType, targetObjectId: targetId, targetVersion: resolved.targetVersion });
  if (!result.ok) throw new Error(`object_import_upload_failed:${result.error}`);
  revalidatePath(`/cases/${caseId}`);
  redirect(`/cases/${encodeURIComponent(caseId)}?flash=input_extraction_queued#case-review-desk`);
}

export async function reviewObjectImportAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "extract.accept_result" });
  const decision = String(formData.get("decision") ?? "");
  if (decision !== "confirm" && decision !== "reject") throw new Error("object_import_decision_invalid");
  const result = await reviewObjectImportCandidate({
    context: createRequestContext(session), targetId: String(formData.get("importTargetId") ?? ""),
    fieldId: String(formData.get("fieldId") ?? ""), expectedVersion: String(formData.get("expectedVersion") ?? ""),
    expectedCandidateValue: String(formData.get("expectedCandidateValue") ?? ""), decision,
    value: formData.has("value") ? String(formData.get("value")) : undefined,
  });
  if (!result.ok) throw new Error(`object_import_review_${result.reason}`);
  revalidatePath(`/cases/${result.caseId}`);
  revalidatePath("/parties");
  revalidatePath("/properties");
  redirect(`/cases/${encodeURIComponent(result.caseId)}?flash=object_import_reviewed#case-review-desk`);
}
