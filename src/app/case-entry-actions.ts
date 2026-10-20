"use server";

import { isRedirectError } from "next/dist/client/components/redirect-error";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addAttachment,
  addAuditLog,
  addPrivateAttachment,
  linkAttachmentToObject,
  resolveClientVisibilityForContext,
  resolvePropertyVisibilityForContext,
  saveBrokerageCaseExtractionReview,
} from "@/lib/data";
import { assertProductionAttachmentStorageReady } from "@/lib/production-readiness";
import { getAttachmentStorageMode, getPostgresPrivateAttachmentLimitBytes, persistAttachmentToLocalPrivate } from "@/lib/attachment-storage";
import { requireTenantSession, assertTenantPermission } from "@/lib/tenant-session";
import { createRequestContext } from "@/lib/visibility-resolver";
import {
  getPrimaryPartyId,
  normalizeCaseAssociationDraft,
  validateCaseAssociationDraft,
  writeCaseAssociationData,
  type CaseAssociationDraft,
} from "@/lib/case-associations";
import { queueExcelImportSource, getExcelUploadLimitBytes } from "@/lib/excel-import-queue";
import { queueIdentityImportSources, getIdentityDocumentUploadLimitBytes } from "@/lib/identity-import-queue";
import { resolveObjectImportTarget } from "@/lib/object-import-target-service";
import { linkImportJobAttachmentsToObject } from "@/lib/object-attachments";
import { detectIdentityDocumentKind, isZipContainer } from "@/lib/upload-validation";
import { validateExcelZip } from "@/lib/excel-workbook";
import { CASE_FIELD_KEY_SET, getCaseFieldDefinition } from "@/lib/case-field-catalog";
import { isValidCaseDateInput, normalizeCaseDateValue } from "@/lib/case-date";
import { getCaseContactValidationError } from "@/lib/case-contact-validation";
import { isValidJapanesePostalCode } from "@/lib/japanese-postal-code-validation";
import { persistEntryPreviewAudit, verifyEntryPreviewProofs, type EntryPreviewProofPayload } from "@/lib/entry-preview-proof";

export type CaseEntryActionState = {
  status: "idle" | "error";
  message?: string;
};

type UploadTarget = "case" | "party" | "property";

const ALLOWED_WORKFLOW_TYPES = new Set([
  "rental_application",
  "rental_mandate",
  "sale_mandate",
  "quote_preparation",
  "contract_preparation",
]);

const MAX_UPLOAD_FILES = 6;
const MAX_UPLOAD_TOTAL_BYTES = 60 * 1024 * 1024;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function parseFiles(formData: FormData): File[] {
  return formData.getAll("caseUploadFile").filter((value): value is File => value instanceof File && value.size > 0);
}

function fileReadKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function getPreviewProofForFile(proofs: ReadonlyMap<string, EntryPreviewProofPayload>, file: File) {
  return proofs.get(fileReadKey(file)) ?? proofs.get(`${file.name}:${file.size}`);
}

function parsePreviewDecisions(formData: FormData) {
  const raw = String(formData.get("entryPreviewDecisions") ?? "").trim();
  if (!raw) return {} as Record<string, "confirmed" | "rejected">;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {} as Record<string, "confirmed" | "rejected">;
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, value]) => value === "confirmed" || value === "rejected")) as Record<string, "confirmed" | "rejected">;
  } catch {
    return {} as Record<string, "confirmed" | "rejected">;
  }
}

function filterProofConfirmedValues(
  values: Record<string, string>,
  proofs: ReadonlyMap<string, EntryPreviewProofPayload>,
  formData: FormData,
): { values: Record<string, string>; error?: string } {
  if (Object.keys(values).length === 0) return { values };
  const decisions = parsePreviewDecisions(formData);
  const confirmed: Record<string, string> = {};
  const confirmedCandidates = new Map<string, Set<string>>();
  for (const proof of proofs.values()) {
    for (const candidate of proof.candidates ?? []) {
      if (decisions[candidate.id] !== "confirmed" || typeof candidate.value !== "string") continue;
      const sourceKey = String(candidate.sourceKey ?? candidate.key ?? "").trim();
      const definition = getCaseFieldDefinition(sourceKey);
      if (!CASE_FIELD_KEY_SET.has(sourceKey) || definition?.storageScope !== "case_fact") continue;
      const valuesForField = confirmedCandidates.get(sourceKey) ?? new Set<string>();
      valuesForField.add(candidate.value.trim());
      confirmedCandidates.set(sourceKey, valuesForField);
      if (values[sourceKey] === candidate.value || values[sourceKey]?.trim() === candidate.value.trim()) confirmed[sourceKey] = values[sourceKey];
    }
  }
  if ([...confirmedCandidates.values()].some((candidateValues) => candidateValues.size > 1)) return { values: {}, error: "案件读取结果存在冲突，请只确认一个候选后再保存。" };
  if (Object.keys(confirmed).length !== Object.keys(values).length) return { values: {}, error: "案件读取结果已变化，请重新确认候选后再保存。" };
  return { values: confirmed };
}

function parseReadFileKeys(formData: FormData) {
  const raw = String(formData.get("entryReadFileKeys") ?? "").trim();
  if (!raw) return new Set<string>();
  try {
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map((value) => String(value).trim()).filter(Boolean) : []);
  } catch {
    return new Set<string>();
  }
}

function parseCaseFieldValues(formData: FormData, fieldName: string): { values: Record<string, string>; error?: string } {
  const raw = String(formData.get(fieldName) ?? "").trim();
  if (!raw) return { values: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { values: {}, error: "案件预读字段格式不正确，请检查后重试。" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { values: {}, error: "案件预读字段格式不正确，请检查后重试。" };
  const values: Record<string, string> = {};
  for (const [fieldKey, rawValue] of Object.entries(parsed as Record<string, unknown>)) {
    const definition = getCaseFieldDefinition(fieldKey);
    if (!CASE_FIELD_KEY_SET.has(fieldKey) || definition?.storageScope !== "case_fact") continue;
    if (typeof rawValue !== "string") return { values: {}, error: "案件预读字段格式不正确，请检查后重试。" };
    const value = rawValue.trim();
    if (!value) continue;
    if (definition?.valueKind === "date" && !isValidCaseDateInput(value)) return { values: {}, error: "案件预读字段中的日期无效，请检查后重试。" };
    if (definition?.valueKind === "postal_code" && !isValidJapanesePostalCode(value)) return { values: {}, error: "案件预读字段中的邮编无效，请检查后重试。" };
    if (getCaseContactValidationError(fieldKey, value, "zh")) return { values: {}, error: "案件预读字段中的电话或邮箱无效，请检查后重试。" };
    values[fieldKey] = definition?.valueKind === "date" ? normalizeCaseDateValue(value) : value;
  }
  return { values };
}

function parseCasePreviewValues(formData: FormData) {
  return parseCaseFieldValues(formData, "casePreviewValuesJson");
}

function parseCaseManualValues(formData: FormData) {
  return parseCaseFieldValues(formData, "caseManualValuesJson");
}

async function validateFiles(files: File[]): Promise<string | undefined> {
  if (files.length === 0) return undefined;
  if (files.length > MAX_UPLOAD_FILES) return "资料一次最多选择6个文件。";
  let totalBytes = 0;
  const identityLimit = getIdentityDocumentUploadLimitBytes();
  const excelLimit = getExcelUploadLimitBytes();
  for (const file of files) {
    totalBytes += file.size;
    const isExcel = file.name.toLowerCase().endsWith(".xlsx");
    const maxBytes = isExcel ? excelLimit : identityLimit;
    if (file.size > maxBytes) return isExcel ? "Excel 文件超过允许大小。" : "单个资料文件超过允许大小。";
    const content = Buffer.from(await file.arrayBuffer());
    if (isExcel) {
      if (file.type && file.type !== XLSX_MIME) return "仅支持 PDF、PNG、JPEG 或有效的 XLSX 文件。";
      if (!isZipContainer(content)) return "Excel 文件内容无效。";
      try {
        await validateExcelZip(content);
      } catch {
        return "Excel 文件内容无效。";
      }
    } else if (!detectIdentityDocumentKind(content)) {
      return "资料内容不是有效的 PDF、PNG 或 JPEG 文件。";
    }
  }
  if (totalBytes > MAX_UPLOAD_TOTAL_BYTES) return "资料文件合计不能超过60MB。";
  return undefined;
}

function archiveTargetForUpload(formData: FormData): { target: UploadTarget; targetId?: string } {
  const target = String(formData.get("caseUploadTarget") ?? "case").trim();
  if (target === "party" || target === "property") {
    return { target, targetId: String(formData.get("caseUploadTargetId") ?? "").trim() || undefined };
  }
  return { target: "case" };
}

async function archiveCaseFile(input: { tenantId: string; userId: string; caseId: string; file: File }) {
  assertProductionAttachmentStorageReady();
  const storageMode = getAttachmentStorageMode();
  let attachment;
  if (storageMode === "local_private") {
    const persisted = await persistAttachmentToLocalPrivate(input.file, input.tenantId);
    attachment = await addAttachment({
      tenantId: input.tenantId,
      userId: input.userId,
      targetType: "case",
      targetId: input.caseId,
      ...persisted,
    });
  } else if (storageMode === "postgres_private") {
    if (input.file.size > getPostgresPrivateAttachmentLimitBytes()) {
      throw new Error("单个附件不能超过10MB。");
    }
    attachment = await addPrivateAttachment({
      tenantId: input.tenantId,
      userId: input.userId,
      targetType: "case",
      targetId: input.caseId,
      fileName: input.file.name || "attachment.bin",
      fileType: input.file.type || "application/octet-stream",
      content: Buffer.from(await input.file.arrayBuffer()),
    });
  } else {
    throw new Error("案件资料保存方式尚未配置。");
  }
  await linkAttachmentToObject({
    tenantId: input.tenantId,
    attachmentId: attachment.id,
    targetType: "case",
    targetId: input.caseId,
    category: "other",
    createdByUserId: input.userId,
  });
  await addAuditLog({
    tenantId: input.tenantId,
    userId: input.userId,
    action: "object_attachment_uploaded",
    targetType: "case",
    targetId: input.caseId,
    message: `案件原始资料已归档: ${attachment.fileName}`,
    context: { attachmentId: attachment.id, category: "other", source: "case_create_entry" },
  }).catch(() => undefined);
  return attachment.id;
}

export async function createCaseWithUploadAction(
  _previousState: CaseEntryActionState,
  formData: FormData,
): Promise<CaseEntryActionState> {
  const session = await requireTenantSession({ permission: "case.create" });
  const files = parseFiles(formData);
  const fileError = await validateFiles(files);
  if (fileError) return { status: "error", message: fileError };
  if (files.length > 0) assertTenantPermission(session, "source.upload");
  if (files.length > 0) {
    try {
      assertProductionAttachmentStorageReady();
    } catch {
      return { status: "error", message: "案件资料保存方式尚未配置。" };
    }
    const storageMode = getAttachmentStorageMode();
    if (storageMode !== "local_private" && storageMode !== "postgres_private") {
      return { status: "error", message: "案件资料保存方式尚未配置。" };
    }
  }

  const workflowType = String(formData.get("workflowType") ?? "").trim();
  const requestedTitle = String(formData.get("caseTitle") ?? "").trim();
  if (!ALLOWED_WORKFLOW_TYPES.has(workflowType)) return { status: "error", message: "案件类型不正确，请重新选择。" };
  const previewValuesResult = parseCasePreviewValues(formData);
  if (previewValuesResult.error) return { status: "error", message: previewValuesResult.error };
  let previewValues = previewValuesResult.values;
  const manualValuesResult = parseCaseManualValues(formData);
  if (manualValuesResult.error) return { status: "error", message: manualValuesResult.error };
  const manualValues = manualValuesResult.values;
  const readFileKeys = parseReadFileKeys(formData);

  let associationDraft: CaseAssociationDraft;
  let createdCaseId: string | undefined;
  let firstJobId: string | undefined;
  let previewProofs: ReadonlyMap<string, EntryPreviewProofPayload> = new Map();
  let previewAuditFailed = false;
  let recognitionLimited = false;
  let preservedFileCount = 0;
  let previewApplied = false;
  try {
    associationDraft = normalizeCaseAssociationDraft(JSON.parse(String(formData.get("associationDraftJson") ?? "{}")));
  } catch {
    return { status: "error", message: "案件关联草稿格式不正确，请重新选择资料。" };
  }
  const associationError = validateCaseAssociationDraft(associationDraft);
  if (associationError) return { status: "error", message: associationError };

  const uploadTarget = archiveTargetForUpload(formData);
  const primaryPartyId = getPrimaryPartyId(associationDraft);
  if (files.length > 0 && uploadTarget.target !== "case" && !uploadTarget.targetId) {
    return { status: "error", message: "请明确选择资料要解析到的主申请人或主要物件。" };
  }
  if (uploadTarget.target === "party" && uploadTarget.targetId !== primaryPartyId) {
    return { status: "error", message: "资料解析目标必须是本案件的主要申请人。" };
  }
  if (uploadTarget.target === "property" && associationDraft.primaryPropertyId !== uploadTarget.targetId) {
    return { status: "error", message: "资料解析目标不是本案件的主要物件。" };
  }

  try {
    const requestContext = createRequestContext(session);
    const previewKind = String(formData.get("previewKind") ?? "").trim();
    const previewProofPayload = String(formData.get("entryReadProofs") ?? "").trim();
    const previewDecisionPayload = String(formData.get("entryPreviewDecisions") ?? "").trim();
    if (files.length > 0 && (readFileKeys.size > 0 || previewProofPayload || previewDecisionPayload)) {
      try {
        previewProofs = await verifyEntryPreviewProofs({
          formData,
          files,
          session,
          kind: previewKind === "customer" || previewKind === "property" ? previewKind : undefined,
          context: "case",
        });
      } catch {
        return { status: "error", message: "案件资料读取校验失败，请重新读取资料后再保存。" };
      }
      const filteredPreviewValues = filterProofConfirmedValues(previewValues, previewProofs, formData);
      if (filteredPreviewValues.error) return { status: "error", message: filteredPreviewValues.error };
      previewValues = filteredPreviewValues.values;
      previewApplied = readFileKeys.size > 0 && Object.keys(previewValues).length > 0;
    }
    const partyResults = await Promise.all(
      associationDraft.parties.map((party) => resolveClientVisibilityForContext({ context: requestContext, clientId: party.partyId })),
    );
    if (partyResults.some((result) => !result.record || !result.resolution.canWrite)) {
      return { status: "error", message: "选择的人物不存在或当前用户无法使用。" };
    }
    const propertyResult = associationDraft.primaryPropertyId
      ? await resolvePropertyVisibilityForContext({ context: requestContext, propertyId: associationDraft.primaryPropertyId })
      : null;
    if (associationDraft.primaryPropertyId && (!propertyResult?.record || !propertyResult.resolution.canWrite)) {
      return { status: "error", message: "选择的物件不存在或当前用户无法使用。" };
    }

    const primaryParty = primaryPartyId
      ? partyResults[associationDraft.parties.findIndex((party) => party.partyId === primaryPartyId)]?.record
      : undefined;
    const property = propertyResult?.record;
    if (primaryPartyId && !primaryParty?.name?.trim()) return { status: "error", message: "主要申请人资料缺少姓名，无法保存关联。" };
    const confirmedDataJson = writeCaseAssociationData({}, associationDraft, {
      primaryPartyName: primaryParty?.name,
      propertyName: property?.name,
    });
    Object.assign(confirmedDataJson, manualValues, previewValues);
    confirmedDataJson.__workflowType = workflowType;
    const brokerageCase = await saveBrokerageCaseExtractionReview({
      tenantId: session.tenant.id,
      userId: session.user.id,
      caseType: "unit_sale",
      caseTitle: requestedTitle || [primaryParty?.name, property?.name].filter(Boolean).join(" / ") || "新建案件",
      primaryPropertyId: associationDraft.primaryPropertyId,
      status: "draft",
      confirmedDataJson,
      sourceImportJobIds: [],
      reviewItems: [],
    });
    createdCaseId = brokerageCase.id;

    for (const file of files) {
      const proof = getPreviewProofForFile(previewProofs, file);
      const archiveOnly = uploadTarget.target === "case" || Boolean(proof);
      if (archiveOnly) {
        const attachmentId = await archiveCaseFile({ tenantId: session.tenant.id, userId: session.user.id, caseId: brokerageCase.id, file });
        preservedFileCount += 1;
        if (proof) {
          try {
            await persistEntryPreviewAudit({ session, targetType: "case", targetId: brokerageCase.id, attachmentId, proof, formData, finalValues: { ...manualValues, ...previewValues } });
          } catch {
            previewAuditFailed = true;
          }
        }
        recognitionLimited = recognitionLimited || Boolean(proof);
        continue;
      }
      const objectTargetType = uploadTarget.target === "party" || uploadTarget.target === "property" ? uploadTarget.target : undefined;
      if (!objectTargetType) {
        await archiveCaseFile({ tenantId: session.tenant.id, userId: session.user.id, caseId: brokerageCase.id, file });
        preservedFileCount += 1;
        recognitionLimited = true;
        continue;
      }

      let resolved;
      try {
        resolved = await resolveObjectImportTarget({
          context: requestContext,
          caseId: brokerageCase.id,
          targetType: objectTargetType,
          targetId: uploadTarget.targetId!,
        });
      } catch {
        resolved = { ok: false as const };
      }
      if (!resolved.ok) {
        recognitionLimited = true;
        await archiveCaseFile({ tenantId: session.tenant.id, userId: session.user.id, caseId: brokerageCase.id, file });
        preservedFileCount += 1;
        continue;
      }

      let result;
      try {
        result = file.name.toLowerCase().endsWith(".xlsx")
          ? await queueExcelImportSource({
              tenantId: session.tenant.id,
              userId: session.user.id,
              file,
              caseId: brokerageCase.id,
              targetObjectType: objectTargetType,
              targetObjectId: uploadTarget.targetId,
              targetVersion: resolved.targetVersion,
            })
          : await queueIdentityImportSources({
              tenantId: session.tenant.id,
              userId: session.user.id,
              files: [file],
              uploadMode: "same_person",
              caseId: brokerageCase.id,
              targetObjectType: objectTargetType,
              targetObjectId: uploadTarget.targetId,
              targetVersion: resolved.targetVersion,
            });
      } catch {
        result = { ok: false as const, error: "source_persistence_failed" as const };
      }

      if ("error" in result) {
        // The queue rejected the source before it became a usable import. Keep
        // the original on the case so the user can retry without losing it.
        recognitionLimited = true;
        await archiveCaseFile({ tenantId: session.tenant.id, userId: session.user.id, caseId: brokerageCase.id, file });
        preservedFileCount += 1;
        continue;
      }

      const jobIds = "jobId" in result ? [result.jobId] : result.jobIds;
      if (jobIds.length === 0) {
        recognitionLimited = true;
        await archiveCaseFile({ tenantId: session.tenant.id, userId: session.user.id, caseId: brokerageCase.id, file });
        preservedFileCount += 1;
        continue;
      }
      if (!firstJobId) firstJobId = jobIds[0];
      // Queue persistence owns the original blob. Link that same attachment
      // into the case archive; archiving the browser File here would create a
      // second blob for the same source.
      for (const jobId of jobIds) {
        await linkImportJobAttachmentsToObject({
          tenantId: session.tenant.id,
          userId: session.user.id,
          importJobId: jobId,
          targetType: "case",
          targetId: brokerageCase.id,
        });
      }
      preservedFileCount += 1;
    }

    await addAuditLog({
      tenantId: session.tenant.id,
      userId: session.user.id,
      action: "case_created_blank",
      targetType: "case",
      targetId: brokerageCase.id,
      message: `案件を作成しました: ${brokerageCase.caseTitle}`,
      context: {
        source: "case_create_entry",
        primaryPartyId,
        primaryPropertyId: associationDraft.primaryPropertyId,
        associatedPartyIds: associationDraft.parties.map((party) => party.partyId),
        workflowType,
        preservedFileCount,
        recognitionTarget: uploadTarget.target,
      },
    }).catch(() => undefined);
    revalidatePath("/import-center");
    revalidatePath("/cases");
    revalidatePath("/organize-center");
    revalidatePath(`/cases/${brokerageCase.id}`);
    const params = new URLSearchParams();
    params.set("flash", previewAuditFailed ? "case_upload_preview_audit_failed" : previewApplied ? "case_upload_archived_preview" : recognitionLimited ? "case_upload_archived_limited" : firstJobId ? "input_extraction_queued" : preservedFileCount > 0 ? "case_upload_archived" : "blank_case_created");
    if (firstJobId) params.set("objectImportJob", firstJobId);
    redirect(`/cases/${encodeURIComponent(brokerageCase.id)}?${params.toString()}#case-review-desk`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (createdCaseId) {
      const flash = files.length === 0
        ? "blank_case_created"
        : preservedFileCount === 0
          ? "case_upload_archive_failed"
          : preservedFileCount < files.length
            ? "case_upload_archive_partial"
            : previewAuditFailed
              ? "case_upload_preview_audit_failed"
            : previewApplied
              ? "case_upload_archived_preview"
              : recognitionLimited
                ? "case_upload_archived_limited"
              : firstJobId
                ? "input_extraction_queued"
                : "case_upload_archived";
      const params = new URLSearchParams({ flash });
      if (firstJobId) params.set("objectImportJob", firstJobId);
      redirect(`/cases/${encodeURIComponent(createdCaseId)}?${params.toString()}#case-review-desk`);
    }
    return { status: "error", message: error instanceof Error ? error.message : "案件保存失败，请保留当前草稿后重试。" };
  }
}
