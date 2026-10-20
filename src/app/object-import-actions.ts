"use server";

import { getObjectImportFeatureReadiness, getObjectImportTarget, listObjectImportCandidates, listAttachments, readPrivateAttachmentContent, retryObjectImportTarget, reviewObjectImportCandidate } from "@/lib/data";
import { toObjectRecordFieldKey } from "@/lib/object-import-field-adapter";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/tenant-session";
import { createRequestContext } from "@/lib/visibility-resolver";
import { resolveObjectImportTarget } from "@/lib/object-import-target-service";
import { queueExcelImportSource } from "@/lib/excel-import-queue";
import { queueIdentityImportSources } from "@/lib/identity-import-queue";

function requestedObjectReturnPath(formData: FormData, target: { targetType: string; targetId: string }) {
  const fallback = target.targetType === "party" ? `/clients/${encodeURIComponent(target.targetId)}/edit` : `/properties/${encodeURIComponent(target.targetId)}/edit`;
  const requested = String(formData.get("returnTo") ?? "").trim();
  if (requested.startsWith("/import-center")) {
    try {
      const parsed = new URL(requested, "http://broker-desk.local");
      if (parsed.origin === "http://broker-desk.local" && parsed.pathname === "/import-center") {
        const allowedKeys = new Set(["object", "targetId", "targetPropertyId", "targetClientId", "objectImportJob", "flash"]);
        if ([...parsed.searchParams.keys()].every((key) => allowedKeys.has(key))) {
          return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
      }
    } catch {
      // Fall through to the object detail page when the caller supplies an
      // invalid return path. The action must never redirect off-site.
    }
  }
  const allowed = [
    fallback,
    target.targetType === "party" ? `/parties/${encodeURIComponent(target.targetId)}/edit` : `/properties/${encodeURIComponent(target.targetId)}/edit`,
  ];
  return allowed.includes(requested) ? requested : fallback;
}

function appendObjectImportQuery(path: string, values: Record<string, string>) {
  const parsed = new URL(path, "http://broker-desk.local");
  for (const [key, value] of Object.entries(values)) parsed.searchParams.set(key, value);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export async function uploadObjectImportAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "source.upload" });
  const readiness = await getObjectImportFeatureReadiness();
  if (!readiness.ready) throw new Error(`object_import_feature_unavailable:${readiness.reason}`);
  const caseId = String(formData.get("caseId") ?? "").trim();
  const targetType = String(formData.get("targetType") ?? "").trim();
  const targetId = String(formData.get("targetId") ?? "").trim();
  const files = formData.getAll("uploadFile").filter((value): value is File => value instanceof File && value.size > 0);
  if ((targetType !== "party" && targetType !== "property") || !targetId || files.length === 0) throw new Error("对象资料上传参数不完整。");
  const resolved = await resolveObjectImportTarget({ context: createRequestContext(session), caseId, targetType, targetId });
  if (!resolved.ok) throw new Error(`object_import_target_rejected:${resolved.reason}`);
  const redirectObjectUploadError = (flash: string): never => {
    if (caseId) {
      redirect(`/cases/${encodeURIComponent(caseId)}?flash=${encodeURIComponent(flash)}#case-review-desk`);
    }
    const targetPath = requestedObjectReturnPath(formData, { targetType, targetId });
    revalidatePath(targetPath);
    redirect(appendObjectImportQuery(targetPath, { flash }));
  };
  const result = await (async () => {
    try {
    return files.length === 1 && files[0].name.toLowerCase().endsWith(".xlsx")
    ? await queueExcelImportSource({ tenantId: session.tenant.id, userId: session.user.id, file: files[0], caseId, targetObjectType: targetType, targetObjectId: targetId, targetVersion: resolved.targetVersion })
    : await queueIdentityImportSources({ tenantId: session.tenant.id, userId: session.user.id, files, uploadMode: "same_person", caseId, targetObjectType: targetType, targetObjectId: targetId, targetVersion: resolved.targetVersion });
    } catch {
      return { ok: false as const, error: "source_persistence_failed" };
    }
  })();
  if (!result.ok) {
    const flash = result.error === "source_persistence_failed"
      ? "object_import_upload_save_failed"
      : result.error === "object_target_invalid"
        ? "object_import_target_invalid"
        : "object_import_upload_failed";
    return redirectObjectUploadError(flash);
  }
  const jobIds = "jobId" in result ? [result.jobId] : result.jobIds;
  const jobId = jobIds[0];
  if (!jobId) throw new Error("object_import_job_missing");
  if (caseId) {
    revalidatePath(`/cases/${caseId}`);
    redirect(`/cases/${encodeURIComponent(caseId)}?flash=input_extraction_queued&objectImportJob=${encodeURIComponent(jobId)}&objectImportJobs=${encodeURIComponent(jobIds.join(","))}#case-review-desk`);
  }
  const targetPath = requestedObjectReturnPath(formData, { targetType, targetId });
  revalidatePath(targetPath);
  redirect(appendObjectImportQuery(targetPath, {
    flash: "input_extraction_queued",
    objectImportJob: jobId,
    objectImportJobs: jobIds.join(","),
  }));
}

export async function reviewObjectImportAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "extract.accept_result" });
  const decision = String(formData.get("decision") ?? "");
  if (decision !== "confirm" && decision !== "reject") throw new Error("object_import_decision_invalid");
  const result = await reviewObjectImportCandidate({
    context: createRequestContext(session), targetId: String(formData.get("importTargetId") ?? ""),
    fieldId: String(formData.get("fieldId") ?? ""), expectedVersion: String(formData.get("expectedVersion") ?? ""),
    expectedCandidateValue: String(formData.get("expectedCandidateValue") ?? ""), decision,
    caseFieldKey: String(formData.get("caseFieldKey") ?? "").trim() || undefined,
    value: formData.has("value") ? String(formData.get("value")) : undefined,
  });
  if (!result.ok) {
    if (result.reason === "conflict" || result.reason === "already_reviewed" || result.reason === "invalid_value") {
      const target = await getObjectImportTarget({ tenantId: session.tenant.id, userId: session.user.id, id: String(formData.get("importTargetId") ?? "") });
      if (target) {
        const params = new URLSearchParams();
        params.set("flash", result.reason === "already_reviewed"
          ? "object_import_review_already_reviewed"
          : result.reason === "invalid_value"
            ? "object_import_review_invalid_value"
            : "object_import_review_conflict");
        params.set("objectImportJob", target.importJobId);
        const fieldKey = String(formData.get("caseFieldKey") ?? "").trim();
        if (fieldKey) params.set("field", fieldKey);
        if (target.caseId) redirect(`/cases/${encodeURIComponent(target.caseId)}?${params.toString()}#case-review-desk`);
        redirect(appendObjectImportQuery(requestedObjectReturnPath(formData, target), Object.fromEntries(params.entries())));
      }
    }
    throw new Error(`object_import_review_${result.reason}`);
  }
  if (result.caseId) revalidatePath(`/cases/${result.caseId}`);
  const reviewedTarget = result.caseId ? null : await getObjectImportTarget({ tenantId: session.tenant.id, userId: session.user.id, id: String(formData.get("importTargetId") ?? "") });
  if (reviewedTarget?.targetType === "party") revalidatePath(`/clients/${encodeURIComponent(result.targetId)}/edit`);
  else revalidatePath(`/properties/${encodeURIComponent(result.targetId)}/edit`);
  revalidatePath("/parties");
  revalidatePath("/properties");
  const reviewedField = reviewedTarget && decision === "confirm"
    ? (await listObjectImportCandidates({ tenantId: session.tenant.id, userId: session.user.id, targetId: reviewedTarget.id })).find((field) => field.id === String(formData.get("fieldId") ?? "") && field.status === "confirmed")
    : undefined;
  const reviewQuery: Record<string, string> = { flash: "object_import_reviewed" };
  if (reviewedField && reviewedTarget && (reviewedTarget.targetType === "party" || reviewedTarget.targetType === "property")) {
    reviewQuery.entryApplied = toObjectRecordFieldKey(reviewedTarget.targetType, reviewedField.fieldKey);
  }
  redirect(result.caseId
    ? `/cases/${encodeURIComponent(result.caseId)}?flash=object_import_reviewed#case-review-desk`
    : appendObjectImportQuery(requestedObjectReturnPath(formData, reviewedTarget ?? { targetType: "property", targetId: result.targetId }), reviewQuery));
}

/** Requeue only an owned failed/ambiguous property source for one bounded retry. */
export async function retryObjectImportAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "extract.run" });
  const targetId = String(formData.get("importTargetId") ?? "").trim();
  if (!targetId) throw new Error("object_import_target_required");
  const target = await getObjectImportTarget({ tenantId: session.tenant.id, userId: session.user.id, id: targetId });
  if (!target || !target.sourceAttachmentId || (target.targetType !== "property" && target.targetType !== "party") || (target.targetType === "party" && target.caseId)) throw new Error("object_import_retry_not_found");
  const resolved = await resolveObjectImportTarget({ context: createRequestContext(session), caseId: target.caseId, targetType: target.targetType, targetId: target.targetId });
  if (!resolved.ok) throw new Error(`object_import_retry_target_rejected:${resolved.reason}`);
  const sources = await listAttachments({ tenantId: session.tenant.id, userId: session.user.id, targetType: "import_job", targetId: target.importJobId, limit: 10 });
  const source = sources.find((item) => item.id === target.sourceAttachmentId);
  if (!source || !(await readPrivateAttachmentContent({ tenantId: session.tenant.id, userId: session.user.id, id: source.id }))?.length) throw new Error("object_import_retry_source_unavailable");
  const result = await retryObjectImportTarget({ tenantId: session.tenant.id, userId: session.user.id, targetId: target.id, targetVersion: resolved.targetVersion });
  const params = new URLSearchParams();
  params.set("objectImportJob", target.importJobId);
  params.set("flash", result.ok ? "object_import_retry_queued" : "object_import_retry_rejected");
  if (target.caseId) revalidatePath(`/cases/${encodeURIComponent(target.caseId)}`);
  const path = requestedObjectReturnPath(formData, target);
  revalidatePath(path);
  redirect(appendObjectImportQuery(path, Object.fromEntries(params.entries())));
}
