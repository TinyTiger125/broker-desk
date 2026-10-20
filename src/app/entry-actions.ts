"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClientFormAction, createPropertyQuickAction, type ClientFormActionState, type PropertyFormActionState } from "@/app/actions";
import { addAttachment, addPrivateAttachment, getObjectImportFeatureReadiness, linkAttachmentToObject } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";
import { createRequestContext } from "@/lib/visibility-resolver";
import { resolveObjectImportTarget } from "@/lib/object-import-target-service";
import { queueExcelImportSource } from "@/lib/excel-import-queue";
import { queueIdentityImportSources } from "@/lib/identity-import-queue";
import { validateEntryUploads } from "@/lib/entry-upload-validation";
import { entryFileKey } from "@/lib/entry-preview";
import { getAttachmentStorageMode, persistAttachmentToLocalPrivate } from "@/lib/attachment-storage";
import { inferObjectAttachmentCategory } from "@/lib/object-attachments";
import { verifyEntryPreviewProofs, persistEntryPreviewAudit, type EntryPreviewProofPayload } from "@/lib/entry-preview-proof";
import { assertProductionAttachmentStorageReady } from "@/lib/production-readiness";

async function prepareUploads(formData: FormData, kind: "customer" | "property") {
  const files = formData.getAll("uploadFile").filter((value): value is File => value instanceof File && value.size > 0);
  const session = await requireTenantSession({ permissions: files.length ? ["record.update", "source.upload"] : ["record.update"] });
  const locale = await getLocale();
  if (files.length) {
    try {
      assertProductionAttachmentStorageReady();
      if (!["local_private", "postgres_private"].includes(getAttachmentStorageMode())) throw new Error("entry_archive_unavailable");
    } catch {
      return { files, error: locale === "zh" ? "原件保存暂不可用，请稍后重试；尚未创建档案。" : locale === "ko" ? "원본 저장을 사용할 수 없습니다. 아직 기록을 만들지 않았습니다." : "原本を保存できません。記録はまだ作成されていません。" };
    }
  }
  let proofs: Map<string, EntryPreviewProofPayload>;
  try { proofs = await verifyEntryPreviewProofs({ formData, files, session, kind, context: "entry" }); }
  catch { return { files, error: locale === "zh" ? "预读凭证已失效或文件已变更。请重新读取资料；尚未创建档案。" : locale === "ko" ? "미리 읽기 확인이 만료되었거나 파일이 바뀌었습니다. 다시 읽어 주세요. 기록은 아직 생성되지 않았습니다." : "事前読取の確認が失効したかファイルが変更されました。再度読み取ってください。記録はまだ作成されていません。", proofs: new Map<string, EntryPreviewProofPayload>() }; }
  const readKeys = new Set(proofs.keys());
  const readiness = files.every((file) => readKeys.has(entryFileKey(file))) ? { ready: true } : await getObjectImportFeatureReadiness();
  if (!readiness.ready) return { files, error: locale === "zh" ? "资料读取暂不可用。请保留文件，稍后重试；尚未创建档案。" : locale === "ko" ? "자료 읽기를 사용할 수 없습니다. 아직 기록을 만들지 않았습니다." : "資料読取は現在利用できません。まだ記録は作成されていません。" };
  if (!(await validateEntryUploads(files))) return { files, error: locale === "zh" ? "请选择最多 6 份有效 PDF、PNG、JPEG，或单独一份 XLSX，并检查文件大小。尚未创建档案。" : locale === "ko" ? "유효한 PDF·PNG·JPEG 최대 6개 또는 XLSX 1개를 선택하고 크기를 확인해 주세요. 기록은 아직 생성되지 않았습니다." : "有効な PDF・PNG・JPEG を最大 6 件、または XLSX を単独で選択し、サイズを確認してください。記録はまだ作成されていません。" };
  return { files, error: undefined, proofs };
}

/** Once a record exists, every outcome stays on that record; retry never creates another. */
async function finishEntry(targetType: "party" | "property", targetId: string, files: File[], proofs: Map<string, EntryPreviewProofPayload>, formData: FormData, finalValues: Record<string, string>, creationAuditWarning = false): Promise<never> {
  const path = targetType === "party" ? `/clients/${encodeURIComponent(targetId)}/edit` : `/properties/${encodeURIComponent(targetId)}/edit`;
  const params = new URLSearchParams({ flash: targetType === "party" ? "client_created" : "property_created" });
  if (creationAuditWarning) params.set("createAuditWarning", "1");
  let auditFailed = false;
  if (files.length) {
    try {
      const session = await requireTenantSession({ permissions: ["record.update", "source.upload"] });
      assertProductionAttachmentStorageReady();
      const unreadFiles: File[] = [];
      for (const file of files) {
        if (!proofs.has(entryFileKey(file))) { unreadFiles.push(file); continue; }
        // Pre-read candidates already went through the visible form. Store the
        // original once; do not create another model job or another candidate set.
        const storageMode = getAttachmentStorageMode();
        const attachment = storageMode === "local_private"
          ? await addAttachment({ tenantId: session.tenant.id, userId: session.user.id, targetType, targetId, ...await persistAttachmentToLocalPrivate(file, session.tenant.id) })
          : storageMode === "postgres_private"
            ? await addPrivateAttachment({ tenantId: session.tenant.id, userId: session.user.id, targetType, targetId, fileName: file.name, fileType: file.type || "application/octet-stream", content: Buffer.from(await file.arrayBuffer()) })
            : null;
        if (!attachment) throw new Error("entry_archive_unavailable");
        await linkAttachmentToObject({ tenantId: session.tenant.id, attachmentId: attachment.id, targetType, targetId, category: inferObjectAttachmentCategory({ fileName: file.name }), createdByUserId: session.user.id });
        await persistEntryPreviewAudit({ session, targetType, targetId, attachmentId: attachment.id, proof: proofs.get(entryFileKey(file))!, formData, finalValues }).catch(() => { auditFailed = true; });
      }
      if (unreadFiles.length) {
      const resolved = await resolveObjectImportTarget({ context: createRequestContext(session), targetType, targetId });
      if (!resolved.ok) throw new Error("entry_target_rejected");
      const common = { tenantId: session.tenant.id, userId: session.user.id, targetObjectType: targetType, targetObjectId: targetId, targetVersion: resolved.targetVersion };
      const result = unreadFiles.length === 1 && unreadFiles[0].name.toLowerCase().endsWith(".xlsx")
        ? await queueExcelImportSource({ ...common, file: unreadFiles[0] })
        : await queueIdentityImportSources({ ...common, files: unreadFiles, uploadMode: "same_person" });
      if (!result.ok) {
        params.set("flash", result.error === "source_persistence_failed" ? "object_import_upload_save_failed" : "object_import_upload_failed");
      } else {
        const ids = "jobId" in result ? [result.jobId] : result.jobIds;
        params.set("flash", "input_extraction_queued");
        params.set("objectImportJob", ids[0]);
        params.set("objectImportJobs", ids.join(","));
      }
      }
    } catch {
      params.set("flash", "object_import_upload_failed");
    }
  }
  if (auditFailed) params.set("flash", "entry_preview_audit_failed");
  revalidatePath(path);
  redirect(`${path}?${params}`);
}

function submittedValues<T extends Record<string, string>>(previous: T, formData: FormData): T {
  return Object.fromEntries(Object.keys(previous).map((key) => [key, typeof formData.get(key) === "string" ? String(formData.get(key)) : previous[key]])) as T;
}

export async function createClientEntryAction(previous: ClientFormActionState, formData: FormData): Promise<ClientFormActionState> {
  const { files, error, proofs } = await prepareUploads(formData, "customer");
  if (error) return { status: "error", message: error, fieldErrors: {}, values: submittedValues(previous.values, formData) };
  formData.set("caseDraftReturn", "1");
  const result = await createClientFormAction(previous, formData);
  if (!result.createdRecord) return result;
  return finishEntry("party", result.createdRecord.id, files, proofs ?? new Map(), formData, result.values, result.auditWarning);
}

export async function createPropertyEntryAction(previous: PropertyFormActionState, formData: FormData): Promise<PropertyFormActionState> {
  const { files, error, proofs } = await prepareUploads(formData, "property");
  if (error) return { status: "error", message: error, fieldErrors: {}, values: submittedValues(previous.values, formData) };
  formData.set("caseDraftReturn", "1");
  const result = await createPropertyQuickAction(previous, formData);
  if (!result.createdRecord) return result;
  return finishEntry("property", result.createdRecord.id, files, proofs ?? new Map(), formData, result.values, result.auditWarning);
}
