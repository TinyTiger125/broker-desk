"use server";

import { createHash, randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClientFormAction, createPropertyQuickAction, type ClientFormActionState, type PropertyFormActionState } from "@/app/actions";
import { addAttachment, addAuditLog, addPrivateAttachment, claimEntryRequest, completeEntryRequest, getObjectImportFeatureReadiness, linkAttachmentToObject, listAuditLogs, releaseEntryRequest, resolveClientVisibilityForContext, resolvePropertyVisibilityForContext } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";
import { createRequestContext } from "@/lib/visibility-resolver";
import { resolveObjectImportTarget } from "@/lib/object-import-target-service";
import { queueExcelImportSource } from "@/lib/excel-import-queue";
import { queueIdentityImportSources } from "@/lib/identity-import-queue";
import { validateEntryUploads } from "@/lib/entry-upload-validation";
import { entryFileKey, safeEntryPreviewCandidates } from "@/lib/entry-preview";
import { getAttachmentStorageMode, persistAttachmentToLocalPrivate } from "@/lib/attachment-storage";
import { inferObjectAttachmentCategory } from "@/lib/object-attachments";
import { buildEntryRequestPayloadDigest, readEntryIntentId, verifyEntryPreviewProofs, persistEntryPreviewAudit, type EntryPreviewProofPayload } from "@/lib/entry-preview-proof";
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
async function finishEntry(targetType: "party" | "property", targetId: string, files: File[], proofs: Map<string, EntryPreviewProofPayload>, formData: FormData, finalValues: Record<string, string>, creationAuditWarning = false, reusedEntry = false): Promise<never> {
  const path = targetType === "party" ? `/clients/${encodeURIComponent(targetId)}/edit` : `/properties/${encodeURIComponent(targetId)}/edit`;
  const params = new URLSearchParams({ flash: reusedEntry ? "entry_reused" : targetType === "party" ? "client_created" : "property_created" });
  if (creationAuditWarning) params.set("createAuditWarning", "1");
  let auditFailed = false;
  let archiveFailed = false;
  let archivedFileCount = 0;
  if (files.length) {
    try {
      const session = await requireTenantSession({ permissions: ["record.update", "source.upload"] });
      assertProductionAttachmentStorageReady();
      const entryRequestKey = String(formData.get("entryRequestKey") ?? "");
      const priorAuditLogs = entryRequestKey
        ? await listAuditLogs(session.user.id, { tenantId: session.tenant.id, action: "entry_preview_reviewed", limit: 500 })
        : [];
      const priorOriginalArchiveLogs = entryRequestKey
        ? await listAuditLogs(session.user.id, { tenantId: session.tenant.id, action: "entry_original_archived", limit: 500 })
        : [];
      // The digest is the stable file identity for one entry intent. Including
      // the browser index here would make a retry with reordered files create a
      // second copy of the same original.
      const archivedDigests = new Set([...priorAuditLogs, ...priorOriginalArchiveLogs]
        .filter((log) => log.targetType === targetType && log.targetId === targetId && log.context?.entryRequestKey === entryRequestKey)
        .map((log) => typeof log.context?.fileDigest === "string" ? log.context.fileDigest : ""));
      const fileDigests = await Promise.all(files.map(async (file) => {
        const proof = proofs.get(entryFileKey(file));
        if (proof?.digest) return proof.digest;
        return createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
      }));
      const unreadFiles: Array<{ file: File; digest: string }> = [];
      let recoveredOriginalCount = 0;

      const archiveOriginal = async (file: File, digest: string) => {
        const dedupeKey = entryRequestKey ? `${entryRequestKey}:${digest}` : undefined;
        const storageMode = getAttachmentStorageMode();
        const attachment = storageMode === "local_private"
          ? await addAttachment({ tenantId: session.tenant.id, userId: session.user.id, targetType, targetId, ...await persistAttachmentToLocalPrivate(file, session.tenant.id, dedupeKey), dedupeKey })
          : storageMode === "postgres_private"
            ? await addPrivateAttachment({ tenantId: session.tenant.id, userId: session.user.id, targetType, targetId, fileName: file.name, fileType: file.type || "application/octet-stream", content: Buffer.from(await file.arrayBuffer()), dedupeKey })
            : null;
        if (!attachment) throw new Error("entry_archive_unavailable");
        await linkAttachmentToObject({ tenantId: session.tenant.id, attachmentId: attachment.id, targetType, targetId, category: inferObjectAttachmentCategory({ fileName: file.name, documentType: targetType === "party" ? "identity_document" : undefined }), createdByUserId: session.user.id });
        archivedFileCount += 1;
        // Keep the fallback marker separate from the preview audit. It is the
        // durable recovery link that lets a same-intent retry skip the model
        // queue without losing the original or creating another target copy.
        await addAuditLog({
          tenantId: session.tenant.id,
          userId: session.user.id,
          action: "entry_original_archived",
          targetType,
          targetId,
          message: "原件已保留在正式记录中；资料读取失败，等待人工复核。",
          context: {
            ...(entryRequestKey ? { entryRequestKey } : {}),
            fileDigest: digest,
            attachmentId: attachment.id,
            source: "unified_entry_fallback",
          },
        }).catch(() => { auditFailed = true; });
      };

      for (const [fileIndex, file] of files.entries()) {
        const digest = fileDigests[fileIndex];
        if (archivedDigests.has(digest)) {
          recoveredOriginalCount += 1;
          continue;
        }
        if (!proofs.has(entryFileKey(file))) { unreadFiles.push({ file, digest }); continue; }
        const proof = proofs.get(entryFileKey(file))!;
        // Pre-read candidates already went through the visible form. Store the
        // original once; do not create another model job or another candidate set.
        const storageMode = getAttachmentStorageMode();
        const attachment = storageMode === "local_private"
          ? await addAttachment({ tenantId: session.tenant.id, userId: session.user.id, targetType, targetId, ...await persistAttachmentToLocalPrivate(file, session.tenant.id, entryRequestKey ? `${entryRequestKey}:${proof.digest}` : undefined), dedupeKey: entryRequestKey ? `${entryRequestKey}:${proof.digest}` : undefined })
          : storageMode === "postgres_private"
            ? await addPrivateAttachment({ tenantId: session.tenant.id, userId: session.user.id, targetType, targetId, fileName: file.name, fileType: file.type || "application/octet-stream", content: Buffer.from(await file.arrayBuffer()), dedupeKey: entryRequestKey ? `${entryRequestKey}:${proof.digest}` : undefined })
            : null;
        if (!attachment) throw new Error("entry_archive_unavailable");
        await linkAttachmentToObject({ tenantId: session.tenant.id, attachmentId: attachment.id, targetType, targetId, category: inferObjectAttachmentCategory({ fileName: file.name, documentType: targetType === "party" ? "identity_document" : undefined }), createdByUserId: session.user.id });
        archivedFileCount += 1;
        await persistEntryPreviewAudit({ session, targetType, targetId, attachmentId: attachment.id, proof, formData, finalValues }).catch(() => { auditFailed = true; });
      }
      if (unreadFiles.length) {
        const resolved = await resolveObjectImportTarget({ context: createRequestContext(session), targetType, targetId });
        let result: { ok: true; jobId?: string; jobIds?: string[] } | { ok: false; error?: string };
        if (!resolved.ok) {
          result = { ok: false, error: "object_target_invalid" };
        } else {
          const common = { tenantId: session.tenant.id, userId: session.user.id, targetObjectType: targetType, targetObjectId: targetId, targetVersion: resolved.targetVersion };
          try {
            result = unreadFiles.length === 1 && unreadFiles[0].file.name.toLowerCase().endsWith(".xlsx")
              ? await queueExcelImportSource({ ...common, file: unreadFiles[0].file })
              : await queueIdentityImportSources({ ...common, files: unreadFiles.map(({ file }) => file), uploadMode: "same_person" });
          } catch {
            result = { ok: false, error: "source_persistence_failed" };
          }
        }
        if (!result.ok) {
          // The import job may have failed before its source attachment became
          // durable. Preserve every unread original on the formal target as a
          // same-intent fallback. The final flash distinguishes all originals
          // saved, partial archive, and no originals saved; model reading still
          // needs human review in every fallback case.
          let fallbackFailed = false;
          let fallbackArchivedCount = 0;
          for (const unread of unreadFiles) {
            try {
              await archiveOriginal(unread.file, unread.digest);
              fallbackArchivedCount += 1;
            } catch {
              fallbackFailed = true;
            }
          }
          archiveFailed = true;
          if (fallbackFailed && archivedFileCount === 0) params.set("flash", "entry_archive_failed");
          else if (!fallbackFailed && fallbackArchivedCount === unreadFiles.length) params.set("flash", "entry_archive_saved_with_reading_failure");
          else params.set("flash", "entry_archive_partial");
        } else {
          archivedFileCount += unreadFiles.length;
          const ids = "jobId" in result && result.jobId ? [result.jobId] : (result.jobIds ?? []);
          params.set("flash", "input_extraction_queued");
          params.set("objectImportJob", ids[0] ?? "");
          params.set("objectImportJobs", ids.join(","));
        }
      } else if (recoveredOriginalCount > 0) {
        // This is a retry after a previous queue failure. The original markers
        // are the durable recovery proof; do not enqueue the same intent again.
        archiveFailed = true;
        params.set("flash", "entry_archive_saved_with_reading_failure");
      }
    } catch {
      // The formal record is intentionally retained, but a failure while
      // archiving its original must never look like a complete success. The
      // edit page exposes the same-record upload control for recovery.
      archiveFailed = true;
      params.set("flash", archivedFileCount > 0 && archivedFileCount < files.length ? "entry_archive_partial" : "entry_archive_failed");
    }
  }
  if (auditFailed && !archiveFailed) params.set("flash", "entry_preview_audit_failed");
  revalidatePath(path);
  redirect(`${path}?${params}`);
}

function submittedValues<T extends Record<string, string>>(previous: T, formData: FormData): T {
  return Object.fromEntries(Object.keys(previous).map((key) => [key, typeof formData.get(key) === "string" ? String(formData.get(key)) : previous[key]])) as T;
}

function validAutoSave(formData: FormData, proofs: Map<string, EntryPreviewProofPayload>): boolean {
  if (formData.get("entryAutoSave") !== "1") return true;
  if (proofs.size === 0) return false;
  let decisions: Record<string, unknown>;
  try { decisions = JSON.parse(String(formData.get("entryPreviewDecisions") ?? "{}")) as Record<string, unknown>; }
  catch { return false; }
  const safe = safeEntryPreviewCandidates([...proofs.values()].flatMap((proof) => proof.candidates));
  const byId = new Map(safe.map((candidate) => [candidate.id, candidate]));
  let applied = 0;
  for (const [id, decision] of Object.entries(decisions)) {
    if (decision !== "auto_saved") return false;
    const candidate = byId.get(id);
    if (!candidate || String(formData.get(candidate.key) ?? "") !== candidate.value) return false;
    applied += 1;
  }
  return applied > 0;
}

export async function createClientEntryAction(previous: ClientFormActionState, formData: FormData): Promise<ClientFormActionState> {
  const { files, error, proofs } = await prepareUploads(formData, "customer");
  if (error) return { status: "error", message: error, fieldErrors: {}, values: submittedValues(previous.values, formData) };
  if (!validAutoSave(formData, proofs ?? new Map())) return { status: "error", message: "自动保存的识别结果已失效，请重新读取资料。", fieldErrors: {}, values: submittedValues(previous.values, formData) };
  if (formData.get("entryAutoSave") === "1") {
    if (!String(formData.get("purpose") ?? "").trim()) formData.set("purpose", "unspecified");
    if (!String(formData.get("temperature") ?? "").trim()) formData.set("temperature", "unspecified");
  }
  let requestKey: string | undefined;
  let payloadDigest: string | undefined;
  let claimToken: string | undefined;
  let requestClaimed = false;
  let recordCreated = false;
  let entryTargetId: string | undefined;
  if (files.length > 0 || formData.has("entryIntentId")) {
    try {
      requestKey = readEntryIntentId(formData);
      payloadDigest = await buildEntryRequestPayloadDigest({ targetType: "party", files, proofs: proofs ?? new Map(), formData });
    } catch {
      return { status: "error", message: "新建请求标识已失效，请重新打开新建页面后重试。", fieldErrors: {}, values: submittedValues(previous.values, formData) };
    }
    formData.set("entryRequestKey", requestKey);
    formData.set("entryPayloadDigest", payloadDigest);
    const session = await requireTenantSession({ permission: "record.update" });
    const reservedTargetId = `client_${randomUUID().replaceAll("-", "")}`;
    const claim = await claimEntryRequest({ tenantId: session.tenant.id, userId: session.user.id, targetType: "client", requestKey, payloadDigest, targetId: reservedTargetId });
    if (claim.state === "existing" && claim.targetId) return finishEntry("party", claim.targetId, files, proofs ?? new Map(), formData, {}, false, true);
    if (claim.state === "in_progress") return { status: "error", message: "保存请求正在处理，请稍后重试；刷新后会回到同一记录。", fieldErrors: {}, values: submittedValues(previous.values, formData) };
    if (claim.state === "manual_review") return { status: "error", message: "保存请求长时间未完成，已暂停自动重试。请联系管理员核对后再继续，避免重复建档。", fieldErrors: {}, values: submittedValues(previous.values, formData) };
    if (claim.state === "payload_mismatch") return { status: "error", message: "保存请求内容与原请求不一致，请重新打开新建页面后重试。", fieldErrors: {}, values: submittedValues(previous.values, formData) };
    claimToken = claim.claimToken;
    if (claim.state === "claimed" && !claimToken) return { status: "error", message: "保存请求状态无法确认，请稍后重试。", fieldErrors: {}, values: submittedValues(previous.values, formData) };
    // The formal insert rechecks this server-issued token inside the same
    // database transaction. It is never a browser-authored field and is
    // excluded from the request fingerprint as volatile claim state.
    formData.set("entryClaimToken", claimToken ?? "");
    // If the process died after the formal row was written but before the
    // claim completion, the creation audit is the same-request recovery path.
    // It is keyed by the full request fingerprint, so unrelated manual values
    // cannot be silently merged.
    const priorCreates = await listAuditLogs(session.user.id, { tenantId: session.tenant.id, action: "client_created", limit: 500 });
    const replay = priorCreates.find((log) => log.targetType === "client" && log.context?.entryRequestKey === requestKey && log.targetId);
    if (replay?.targetId) {
      await completeEntryRequest({ tenantId: session.tenant.id, userId: session.user.id, targetType: "client", requestKey, claimToken: claimToken!, targetId: replay.targetId });
      return finishEntry("party", replay.targetId, files, proofs ?? new Map(), formData, {}, false, true);
    }
    requestClaimed = true;
    entryTargetId = claim.targetId ?? reservedTargetId;
    const existingTarget = await resolveClientVisibilityForContext({ context: createRequestContext(session), clientId: entryTargetId });
    if (existingTarget.record && existingTarget.resolution.canWrite) {
      if (!await completeEntryRequest({ tenantId: session.tenant.id, userId: session.user.id, targetType: "client", requestKey, claimToken: claimToken!, targetId: entryTargetId })) return { status: "error", message: "保存请求状态无法确认，请稍后重试。", fieldErrors: {}, values: submittedValues(previous.values, formData) };
      return finishEntry("party", entryTargetId, files, proofs ?? new Map(), formData, {}, false, true);
    }
    formData.set("entryTargetId", entryTargetId);
  }
  formData.set("caseDraftReturn", "1");
  try {
    const result = await createClientFormAction(previous, formData);
    if (!result.createdRecord) {
      if (requestClaimed && requestKey && claimToken) {
        const session = await requireTenantSession({ permission: "record.update" });
        await releaseEntryRequest({ tenantId: session.tenant.id, userId: session.user.id, targetType: "client", requestKey, claimToken });
      }
      return result;
    }
    recordCreated = true;
    if (entryTargetId && result.createdRecord.id !== entryTargetId) throw new Error("entry_target_binding_failed");
    if (requestClaimed && requestKey && claimToken) {
      const session = await requireTenantSession({ permission: "record.update" });
      if (!await completeEntryRequest({ tenantId: session.tenant.id, userId: session.user.id, targetType: "client", requestKey, claimToken, targetId: result.createdRecord.id })) throw new Error("entry_request_completion_failed");
    }
    return finishEntry("party", result.createdRecord.id, files, proofs ?? new Map(), formData, result.values, result.auditWarning);
  } catch (error) {
    if (!recordCreated && requestClaimed && requestKey && claimToken) {
      const session = await requireTenantSession({ permission: "record.update" }).catch(() => null);
      if (session) await releaseEntryRequest({ tenantId: session.tenant.id, userId: session.user.id, targetType: "client", requestKey, claimToken }).catch(() => undefined);
    }
    throw error;
  }
}

export async function createPropertyEntryAction(previous: PropertyFormActionState, formData: FormData): Promise<PropertyFormActionState> {
  const { files, error, proofs } = await prepareUploads(formData, "property");
  if (error) return { status: "error", message: error, fieldErrors: {}, values: submittedValues(previous.values, formData) };
  if (!validAutoSave(formData, proofs ?? new Map())) return { status: "error", message: "自动保存的识别结果已失效，请重新读取资料。", fieldErrors: {}, values: submittedValues(previous.values, formData) };
  let requestKey: string | undefined;
  let payloadDigest: string | undefined;
  let claimToken: string | undefined;
  let requestClaimed = false;
  let recordCreated = false;
  let entryTargetId: string | undefined;
  if (files.length > 0 || formData.has("entryIntentId")) {
    try {
      requestKey = readEntryIntentId(formData);
      payloadDigest = await buildEntryRequestPayloadDigest({ targetType: "property", files, proofs: proofs ?? new Map(), formData });
    } catch {
      return { status: "error", message: "新建请求标识已失效，请重新打开新建页面后重试。", fieldErrors: {}, values: submittedValues(previous.values, formData) };
    }
    formData.set("entryRequestKey", requestKey);
    formData.set("entryPayloadDigest", payloadDigest);
    const session = await requireTenantSession({ permission: "record.update" });
    const reservedTargetId = `prop_${randomUUID().replaceAll("-", "")}`;
    const claim = await claimEntryRequest({ tenantId: session.tenant.id, userId: session.user.id, targetType: "property", requestKey, payloadDigest, targetId: reservedTargetId });
    if (claim.state === "existing" && claim.targetId) return finishEntry("property", claim.targetId, files, proofs ?? new Map(), formData, {}, false, true);
    if (claim.state === "in_progress") return { status: "error", message: "保存请求正在处理，请稍后重试；刷新后会回到同一记录。", fieldErrors: {}, values: submittedValues(previous.values, formData) };
    if (claim.state === "manual_review") return { status: "error", message: "保存请求长时间未完成，已暂停自动重试。请联系管理员核对后再继续，避免重复建档。", fieldErrors: {}, values: submittedValues(previous.values, formData) };
    if (claim.state === "payload_mismatch") return { status: "error", message: "保存请求内容与原请求不一致，请重新打开新建页面后重试。", fieldErrors: {}, values: submittedValues(previous.values, formData) };
    claimToken = claim.claimToken;
    if (claim.state === "claimed" && !claimToken) return { status: "error", message: "保存请求状态无法确认，请稍后重试。", fieldErrors: {}, values: submittedValues(previous.values, formData) };
    formData.set("entryClaimToken", claimToken ?? "");
    const priorCreates = await listAuditLogs(session.user.id, { tenantId: session.tenant.id, action: "property_created", limit: 500 });
    const replay = priorCreates.find((log) => log.targetType === "property" && log.context?.entryRequestKey === requestKey && log.targetId);
    if (replay?.targetId) {
      await completeEntryRequest({ tenantId: session.tenant.id, userId: session.user.id, targetType: "property", requestKey, claimToken: claimToken!, targetId: replay.targetId });
      return finishEntry("property", replay.targetId, files, proofs ?? new Map(), formData, {}, false, true);
    }
    requestClaimed = true;
    entryTargetId = claim.targetId ?? reservedTargetId;
    const existingTarget = await resolvePropertyVisibilityForContext({ context: createRequestContext(session), propertyId: entryTargetId });
    if (existingTarget.record && existingTarget.resolution.canWrite) {
      if (!await completeEntryRequest({ tenantId: session.tenant.id, userId: session.user.id, targetType: "property", requestKey, claimToken: claimToken!, targetId: entryTargetId })) return { status: "error", message: "保存请求状态无法确认，请稍后重试。", fieldErrors: {}, values: submittedValues(previous.values, formData) };
      return finishEntry("property", entryTargetId, files, proofs ?? new Map(), formData, {}, false, true);
    }
    formData.set("entryTargetId", entryTargetId);
  }
  formData.set("caseDraftReturn", "1");
  try {
    const result = await createPropertyQuickAction(previous, formData);
    if (!result.createdRecord) {
      if (requestClaimed && requestKey && claimToken) {
        const session = await requireTenantSession({ permission: "record.update" });
        await releaseEntryRequest({ tenantId: session.tenant.id, userId: session.user.id, targetType: "property", requestKey, claimToken });
      }
      return result;
    }
    recordCreated = true;
    if (entryTargetId && result.createdRecord.id !== entryTargetId) throw new Error("entry_target_binding_failed");
    if (requestClaimed && requestKey && claimToken) {
      const session = await requireTenantSession({ permission: "record.update" });
      if (!await completeEntryRequest({ tenantId: session.tenant.id, userId: session.user.id, targetType: "property", requestKey, claimToken, targetId: result.createdRecord.id })) throw new Error("entry_request_completion_failed");
    }
    return finishEntry("property", result.createdRecord.id, files, proofs ?? new Map(), formData, result.values, result.auditWarning);
  } catch (error) {
    if (!recordCreated && requestClaimed && requestKey && claimToken) {
      const session = await requireTenantSession({ permission: "record.update" }).catch(() => null);
      if (session) await releaseEntryRequest({ tenantId: session.tenant.id, userId: session.user.id, targetType: "property", requestKey, claimToken }).catch(() => undefined);
    }
    throw error;
  }
}
