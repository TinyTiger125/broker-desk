"use server";

import { createHash, randomUUID } from "crypto";
import * as XLSX from "xlsx";
import {
  AML_CHECK_STATUSES,
  BROKERAGE_CONTRACT_TYPES,
  BUDGET_TYPES,
  FOLLOWUP_TYPES,
  LOAN_PREAPPROVAL_STATUSES,
  PURPOSES,
  TEMPERATURES,
  isAmlCheckStatus,
  isBrokerageContractType,
  isBudgetType,
  isClientStage,
  isLoanPreApprovalStatus,
  isPurpose,
  isQuoteStatus,
  isTemperature,
  type AmlCheckStatus,
  type BrokerageContractType,
  type BudgetType,
  type FollowUpType,
  type LoanPreApprovalStatus,
  type Purpose,
  type Temperature,
  type ClientStage,
} from "@/lib/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addAttachment,
  addCorrectionEvents,
  addAuditLog,
  addClient,
  addGeneratedOutput,
  addProperty,
  addImportJob,
  addTask,
  applyOutputTemplateVersion,
  addQuotation,
  createOutputTemplateVersion,
  appendFollowUp,
  createComplianceTaskFromAlert,
  duplicateQuotation,
  getBrokerageCaseById,
  getBrokerageCaseByImportJobId,
  getClientById,
  getClientDetail,
  getDefaultUser,
  getGuaranteeApplicationDraft,
  getOutputTemplateSettings,
  getQuotationById,
  listQuoteFormData,
  listClients,
  listExtractionReviewItems,
  listImportJobs,
  listOutputTemplateVersions,
  mergeBrokerageCaseExtractionReview,
  rollbackBrokerageCaseMerge,
  rescheduleTask,
  resolveComplianceAlert,
  saveBrokerageCaseExtractionReview,
  saveGuaranteeApplicationDraft,
  setClientStageWithLog,
  setClientStage,
  updateImportJobMapping,
  updateAiExperienceDraftStatus,
  updateOutputTemplateSettings,
  updateTaskStatus,
  updateClient,
  updateBrokerageCaseConfirmedData,
  updateQuotationStatus,
  type ExtractionReviewItem,
  type ExtractionReviewStatus,
  type AiExperienceDraftStatus,
} from "@/lib/data";
import {
  getAttachmentStorageMode,
  isValidStoragePath,
  persistAttachmentToLocalPublic,
} from "@/lib/attachment-storage";
import { type ComplianceAlertType } from "@/lib/compliance-alerts";
import {
  buildMappingFromLists,
  parseCommaList,
  stringifyImportValidationPayload,
  suggestImportMapping,
  validateImportMapping,
  type ImportValidationIssue,
  type ImportValidationIssueAction,
  type ImportValidationIssueCode,
  type ImportValidationIssueLevel,
} from "@/lib/import-mapping";
import { materializeExtractionReviewValue } from "@/lib/extraction-review-materialization";
import { extractInputFileFromWorkbook, type InputFileExtractionResult } from "@/lib/input-file-extractor";
import { extractIdentityDocumentFromBuffer } from "@/lib/identity-document-extractor";
import { CASE_FIELD_KEYS, isKnownCaseFieldKey } from "@/lib/case-field-catalog";
import { canonicalizeCaseFieldKey, clearCaseFieldValueAliases, getCaseFieldValue } from "@/lib/case-field-normalization";
import { applyJapanesePostalCodeAddressCompletions } from "@/lib/japan-postal-code";
import {
  buildExtractionReviewCorrectionEvents,
  buildGuaranteeDraftCorrectionEvents,
  buildPdfPreviewCorrectionEvents,
  buildWorkbenchCorrectionEvents,
} from "@/lib/correction-event-builder";
import {
  buildGuaranteeApplicationReadiness,
  buildGuaranteeDraftReadiness,
  findGuaranteeCompanyTemplate,
  getGuaranteeDraftFieldDefinitions,
} from "@/lib/guarantee-application";
import {
  FRIENDS_GUARANTEE_DELETED_OVERLAY_FIELDS_KEY,
  FRIENDS_GUARANTEE_LAYOUT_OVERRIDES_KEY,
  FRIENDS_GUARANTEE_LAYOUT_OVERRIDE_VERSIONS_KEY,
  FRIENDS_GUARANTEE_CUSTOM_FIELDS_KEY,
  GUARANTEE_CONFIRMED_OVERLAY_FIELDS_KEY,
  FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID,
  getFriendsGuaranteeCustomOverlayFields,
  getFriendsGuaranteeEffectiveLayoutOverrides,
  getGuaranteePdfTemplateConfig,
  hasFriendsGuaranteeLayoutOverrides,
  saveFriendsGuaranteeTemplateLayoutOverrides,
  saveFriendsGuaranteeTemplateDeletedOverlayFieldKeys,
  saveFriendsGuaranteeTemplateCustomOverlayFields,
  setFriendsGuaranteeCaseDeletedOverlayFieldKeys,
  setFriendsGuaranteeCaseCustomOverlayFields,
  setFriendsGuaranteeCaseLayoutOverrideVersion,
  setGuaranteeConfirmedOverlayFieldKeys,
  sanitizeFriendsGuaranteeCustomOverlayFields,
  sanitizeFriendsGuaranteeDeletedOverlayFieldKeys,
  sanitizeFriendsGuaranteeLayoutOverrides,
} from "@/lib/friends-guarantee-pdf";
import {
  CASE_MERGE_MIN_CONFIDENCE,
  createCaseMergeHistoryItem,
  evaluateCaseMergeCandidates,
  getCaseMergeHistory,
  getLatestActiveCaseMerge,
  markCaseMergeRolledBack,
  mergeConfirmedCaseData,
  setCaseMergeHistory,
} from "@/lib/case-merge";
import { listHubContracts } from "@/lib/hub";
import { draftAiExperiencesFromRecentCorrections } from "@/lib/ai-experience-job";
import { getLocale, type Locale } from "@/lib/locale";
import { createDocumentNumber, getDefaultOutputTemplateSettings, getOutputDocLabel, isOutputDocType } from "@/lib/output-doc";

function parseNumber(value: FormDataEntryValue | null, fallback = 0): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDate(value: FormDataEntryValue | null): Date | undefined {
  if (!value || typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseCheckbox(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true" || value === "1";
}

function isComplianceAlertType(value: string): value is ComplianceAlertType {
  return (
    value === "brokerage_expired" ||
    value === "brokerage_expiring" ||
    value === "missing_35" ||
    value === "missing_37" ||
    value === "aml_pending" ||
    value === "missing_pii_consent"
  );
}

function isTaskStatus(value: string): value is "pending" | "done" | "canceled" {
  return value === "pending" || value === "done" || value === "canceled";
}

function isImportSourceType(value: string): value is "excel" | "pdf" | "scan" | "manual" {
  return value === "excel" || value === "pdf" || value === "scan" || value === "manual";
}

function isImportTargetEntity(value: string): value is "properties" | "parties" | "contracts" | "service_requests" {
  return value === "properties" || value === "parties" || value === "contracts" || value === "service_requests";
}

function isAttachmentTargetType(
  value: string
): value is "property" | "party" | "contract" | "service_request" | "import_job" | "quote" {
  return (
    value === "property" ||
    value === "party" ||
    value === "contract" ||
    value === "service_request" ||
    value === "import_job" ||
    value === "quote"
  );
}

function tr(locale: Locale, message: { ja: string; zh: string; ko: string }): string {
  if (locale === "zh") return message.zh;
  if (locale === "ko") return message.ko;
  return message.ja;
}

function withFlash(path: string, flash: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}flash=${encodeURIComponent(flash)}`;
}

function appendQuery(path: string, key: string, value: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

type ImportValidationSource = "mapping" | "auto_mapping" | "import_execution" | "manual_resolution" | "retry";

function createImportValidationIssue(input: {
  code: ImportValidationIssueCode;
  level: ImportValidationIssueLevel;
  action: ImportValidationIssueAction;
  message: string;
  count?: number;
}): ImportValidationIssue {
  return {
    code: input.code,
    level: input.level,
    action: input.action,
    message: input.message,
    count: input.count,
  };
}

function buildImportValidationMessage(input: {
  source: ImportValidationSource;
  summary: string;
  issues: ImportValidationIssue[];
  metrics?: {
    requiredCount?: number;
    coveredRequiredCount?: number;
    successCount?: number;
    skippedCount?: number;
  };
  details?: Record<string, unknown>;
}): string {
  return stringifyImportValidationPayload({
    version: 1,
    source: input.source,
    summary: input.summary,
    issues: input.issues,
    updatedAt: new Date().toISOString(),
    metrics: input.metrics,
    details: input.details,
  });
}

function safeReturnTo(value: FormDataEntryValue | null, fallback: string): string {
  const path = String(value ?? "").trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return fallback;
  return path;
}

async function ensureClientOwnership(clientId: string, userId: string) {
  const client = await getClientById(clientId);
  if (!client) {
    throw new Error("顧客が見つかりません。");
  }
  if (client.ownerUserId !== userId) {
    throw new Error("この顧客に対する操作権限がありません。");
  }
  return client;
}

export async function createClient(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const stageRaw = String(formData.get("stage") ?? "lead");
  const purposeRaw = String(formData.get("purpose") ?? PURPOSES[0]);
  const temperatureRaw = String(formData.get("temperature") ?? TEMPERATURES[1]);
  const budgetTypeRaw = String(formData.get("budgetType") ?? BUDGET_TYPES[0]);
  const loanPreApprovalStatusRaw = String(formData.get("loanPreApprovalStatus") ?? LOAN_PREAPPROVAL_STATUSES[0]);
  const brokerageContractTypeRaw = String(formData.get("brokerageContractType") ?? BROKERAGE_CONTRACT_TYPES[0]);
  const amlCheckStatusRaw = String(formData.get("amlCheckStatus") ?? AML_CHECK_STATUSES[0]);

  if (!name || !phone) {
    throw new Error("氏名と電話番号は必須です。");
  }
  if (!isClientStage(stageRaw)) {
    throw new Error("ステージの値が不正です。");
  }
  if (!isPurpose(purposeRaw)) {
    throw new Error("用途の値が不正です。");
  }
  if (!isTemperature(temperatureRaw)) {
    throw new Error("温度感の値が不正です。");
  }
  if (!isBudgetType(budgetTypeRaw)) {
    throw new Error("予算種別の値が不正です。");
  }
  if (!isLoanPreApprovalStatus(loanPreApprovalStatusRaw)) {
    throw new Error("ローン事前審査ステータスの値が不正です。");
  }
  if (!isBrokerageContractType(brokerageContractTypeRaw)) {
    throw new Error("媒介契約種別の値が不正です。");
  }
  if (!isAmlCheckStatus(amlCheckStatusRaw)) {
    throw new Error("AML確認ステータスの値が不正です。");
  }

  const client = await addClient({
    ownerUserId: user.id,
    name,
    phone,
    lineId: String(formData.get("lineId") ?? "").trim() || undefined,
    email: String(formData.get("email") ?? "").trim() || undefined,
    budgetMin: parseNumber(formData.get("budgetMin"), 0) || undefined,
    budgetMax: parseNumber(formData.get("budgetMax"), 0) || undefined,
    budgetType: budgetTypeRaw as BudgetType,
    preferredArea: String(formData.get("preferredArea") ?? "").trim() || undefined,
    firstChoiceArea: String(formData.get("firstChoiceArea") ?? "").trim() || undefined,
    secondChoiceArea: String(formData.get("secondChoiceArea") ?? "").trim() || undefined,
    purpose: purposeRaw as Purpose,
    loanPreApprovalStatus: loanPreApprovalStatusRaw as LoanPreApprovalStatus,
    desiredMoveInPeriod: String(formData.get("desiredMoveInPeriod") ?? "").trim() || undefined,
    stage: stageRaw,
    temperature: temperatureRaw as Temperature,
    brokerageContractType: brokerageContractTypeRaw as BrokerageContractType,
    brokerageContractSignedAt: parseDate(formData.get("brokerageContractSignedAt")),
    brokerageContractExpiresAt: parseDate(formData.get("brokerageContractExpiresAt")),
    importantMattersExplainedAt: parseDate(formData.get("importantMattersExplainedAt")),
    contractDocumentDeliveredAt: parseDate(formData.get("contractDocumentDeliveredAt")),
    personalInfoConsentAt: parseDate(formData.get("personalInfoConsentAt")),
    amlCheckStatus: amlCheckStatusRaw as AmlCheckStatus,
    nextFollowUpAt: parseDate(formData.get("nextFollowUpAt")),
    notes: String(formData.get("notes") ?? "").trim() || undefined,
  });

  revalidatePath("/clients");
  revalidatePath("/");
  revalidatePath("/board");
  await addAuditLog({
    userId: user.id,
    action: "client_created",
    targetType: "client",
    targetId: client.id,
    message: `顧客を新規登録しました: ${client.name}`,
  });

  const afterSave = String(formData.get("afterSave") ?? "detail");
  if (afterSave === "quote") {
    redirect(`/quotes/new?clientId=${client.id}`);
  }
  if (afterSave === "list") {
    redirect("/clients");
  }

  redirect(`/clients/${client.id}`);
}

export async function updateClientProfile(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) {
    throw new Error("顧客IDは必須です。");
  }
  await ensureClientOwnership(clientId, user.id);

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const stageRaw = String(formData.get("stage") ?? "lead");
  const purposeRaw = String(formData.get("purpose") ?? PURPOSES[0]);
  const temperatureRaw = String(formData.get("temperature") ?? TEMPERATURES[1]);
  const budgetTypeRaw = String(formData.get("budgetType") ?? BUDGET_TYPES[0]);
  const loanPreApprovalStatusRaw = String(formData.get("loanPreApprovalStatus") ?? LOAN_PREAPPROVAL_STATUSES[0]);
  const brokerageContractTypeRaw = String(formData.get("brokerageContractType") ?? BROKERAGE_CONTRACT_TYPES[0]);
  const amlCheckStatusRaw = String(formData.get("amlCheckStatus") ?? AML_CHECK_STATUSES[0]);

  if (!name || !phone) {
    throw new Error("氏名と電話番号は必須です。");
  }
  if (
    !isClientStage(stageRaw) ||
    !isPurpose(purposeRaw) ||
    !isTemperature(temperatureRaw) ||
    !isBudgetType(budgetTypeRaw) ||
    !isLoanPreApprovalStatus(loanPreApprovalStatusRaw) ||
    !isBrokerageContractType(brokerageContractTypeRaw) ||
    !isAmlCheckStatus(amlCheckStatusRaw)
  ) {
    throw new Error("顧客データの形式が不正です。");
  }

  await updateClient(clientId, {
    name,
    phone,
    lineId: String(formData.get("lineId") ?? "").trim() || undefined,
    email: String(formData.get("email") ?? "").trim() || undefined,
    budgetMin: parseNumber(formData.get("budgetMin"), 0) || undefined,
    budgetMax: parseNumber(formData.get("budgetMax"), 0) || undefined,
    budgetType: budgetTypeRaw,
    preferredArea: String(formData.get("preferredArea") ?? "").trim() || undefined,
    firstChoiceArea: String(formData.get("firstChoiceArea") ?? "").trim() || undefined,
    secondChoiceArea: String(formData.get("secondChoiceArea") ?? "").trim() || undefined,
    purpose: purposeRaw,
    loanPreApprovalStatus: loanPreApprovalStatusRaw,
    desiredMoveInPeriod: String(formData.get("desiredMoveInPeriod") ?? "").trim() || undefined,
    stage: stageRaw,
    temperature: temperatureRaw,
    brokerageContractType: brokerageContractTypeRaw,
    brokerageContractSignedAt: parseDate(formData.get("brokerageContractSignedAt")),
    brokerageContractExpiresAt: parseDate(formData.get("brokerageContractExpiresAt")),
    importantMattersExplainedAt: parseDate(formData.get("importantMattersExplainedAt")),
    contractDocumentDeliveredAt: parseDate(formData.get("contractDocumentDeliveredAt")),
    personalInfoConsentAt: parseDate(formData.get("personalInfoConsentAt")),
    amlCheckStatus: amlCheckStatusRaw,
    nextFollowUpAt: parseDate(formData.get("nextFollowUpAt")),
    notes: String(formData.get("notes") ?? "").trim() || undefined,
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  revalidatePath("/");
  revalidatePath("/board");
  await addAuditLog({
    userId: user.id,
    action: "client_updated",
    targetType: "client",
    targetId: clientId,
    message: `顧客情報を更新しました。`,
  });

  redirect(`/clients/${clientId}`);
}

export async function addFollowUp(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }

  const clientId = String(formData.get("clientId") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!clientId || !content) {
    throw new Error("顧客IDと内容は必須です。");
  }
  await ensureClientOwnership(clientId, user.id);

  const type =
    (String(formData.get("type") ?? FOLLOWUP_TYPES[5]) as FollowUpType) ??
    FOLLOWUP_TYPES[5];

  await appendFollowUp({
    clientId,
    createdById: user.id,
    type,
    content,
    nextAction: String(formData.get("nextAction") ?? "").trim() || undefined,
    nextFollowUpAt: parseDate(formData.get("nextFollowUpAt")),
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/");
  revalidatePath("/board");
  await addAuditLog({
    userId: user.id,
    action: "followup_added",
    targetType: "client",
    targetId: clientId,
    message: "フォロー履歴を追加しました。",
  });
}

export async function updateClientStage(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const locale = await getLocale();
  const clientId = String(formData.get("clientId") ?? "");
  const stage = String(formData.get("stage") ?? "lead");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!clientId) {
    throw new Error("顧客IDは必須です。");
  }
  if (!isClientStage(stage)) {
    throw new Error("ステージの値が不正です。");
  }
  await ensureClientOwnership(clientId, user.id);

  await setClientStageWithLog({
    clientId,
    stage,
    createdById: user.id,
    reason: reason || "顧客詳細画面でステージを手動更新",
    locale,
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  revalidatePath("/");
  revalidatePath("/board");
  await addAuditLog({
    userId: user.id,
    action: "client_stage_updated",
    targetType: "client",
    targetId: clientId,
    message: `ステージを更新しました: ${stage}`,
  });
}

export async function createComplianceTask(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const clientId = String(formData.get("clientId") ?? "").trim();
  const alertType = String(formData.get("alertType") ?? "").trim();
  const alertTitle = String(formData.get("alertTitle") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!clientId || !alertTitle || !reason) {
    throw new Error("タスク作成に必要な情報が不足しています。");
  }
  if (!isComplianceAlertType(alertType)) {
    throw new Error("法定アラート種別の値が不正です。");
  }
  await ensureClientOwnership(clientId, user.id);

  const task = await createComplianceTaskFromAlert({
    clientId,
    alertType,
    alertTitle,
    reason,
    dueAt: parseDate(formData.get("dueAt")),
    createdById: user.id,
  });

  if (!task) {
    throw new Error("顧客が見つからないため、タスクを作成できませんでした。");
  }

  revalidatePath("/");
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/board");
}

export async function resolveComplianceAlertAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const clientId = String(formData.get("clientId") ?? "").trim();
  const alertType = String(formData.get("alertType") ?? "").trim();
  const extendDays = parseNumber(formData.get("extendDays"), 90);

  if (!clientId) {
    throw new Error("顧客IDは必須です。");
  }
  if (!isComplianceAlertType(alertType)) {
    throw new Error("法定アラート種別の値が不正です。");
  }
  await ensureClientOwnership(clientId, user.id);

  const updated = await resolveComplianceAlert({
    clientId,
    alertType,
    resolvedById: user.id,
    resolvedAt: parseDate(formData.get("resolvedAt")),
    extendDays,
  });
  if (!updated) {
    throw new Error("法定対応の更新対象が見つかりません。");
  }

  revalidatePath("/");
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/board");
}

export async function changeTaskStatusAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const taskId = String(formData.get("taskId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const returnTo = safeReturnTo(formData.get("returnTo"), `/clients/${clientId}`);
  const previousStatusRaw = String(formData.get("previousStatus") ?? "").trim();

  if (!taskId || !clientId) {
    throw new Error("タスクIDと顧客IDは必須です。");
  }
  if (!isTaskStatus(status)) {
    throw new Error("タスク状態が不正です。");
  }
  const previousStatus = isTaskStatus(previousStatusRaw) ? previousStatusRaw : undefined;
  await ensureClientOwnership(clientId, user.id);

  const updated = await updateTaskStatus({
    taskId,
    status,
    updatedById: user.id,
  });
  if (!updated) {
    throw new Error("タスクが見つかりません。");
  }

  revalidatePath("/");
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/service-requests");
  let destination = withFlash(returnTo, "request_status_updated");
  if (previousStatus) {
    destination = appendQuery(destination, "undoTaskId", taskId);
    destination = appendQuery(destination, "undoStatus", previousStatus);
    destination = appendQuery(destination, "undoClientId", clientId);
  }
  redirect(destination);
}

export async function batchUpdateServiceRequestStatusAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const locale = await getLocale();
  const status = String(formData.get("status") ?? "").trim();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/service-requests");
  const taskIds = formData
    .getAll("taskIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!isTaskStatus(status)) {
    throw new Error("タスク状態が不正です。");
  }
  if (taskIds.length === 0) {
    throw new Error(
      tr(locale, {
        ja: "対象の対応依頼を選択してください。",
        zh: "请先选择要处理的服务请求。",
        ko: "처리할 서비스 요청을 먼저 선택해 주세요.",
      })
    );
  }

  const clients = await listClients(user.id, { sort: "follow_up" });
  const details = await Promise.all(clients.map((client) => getClientDetail(client.id)));
  const allowedTaskIds = new Set<string>();
  details.forEach((detail) => detail?.tasks.forEach((task) => allowedTaskIds.add(task.id)));
  const targetIds = taskIds.filter((id) => allowedTaskIds.has(id));
  if (targetIds.length === 0) {
    throw new Error(
      tr(locale, {
        ja: "更新可能な対応依頼が見つかりません。",
        zh: "未找到可更新的服务请求。",
        ko: "업데이트 가능한 서비스 요청이 없습니다.",
      })
    );
  }

  await Promise.all(targetIds.map((taskId) => updateTaskStatus({ taskId, status, updatedById: user.id })));

  await addAuditLog({
    userId: user.id,
    action: "service_request_batch_updated",
    targetType: "task",
    targetId: targetIds[0],
    message: tr(locale, {
      ja: `対応依頼を一括更新しました: ${targetIds.length}件`,
      zh: `已批量更新服务请求：${targetIds.length}条`,
      ko: `서비스 요청 일괄 업데이트: ${targetIds.length}건`,
    }),
  });

  revalidatePath("/");
  revalidatePath("/service-requests");
  revalidatePath("/clients");
  redirect(withFlash(returnTo, "request_batch_updated"));
}

export async function batchUpdateContractStatusAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const locale = await getLocale();
  const status = String(formData.get("status") ?? "").trim();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/contracts");
  const contractIds = formData
    .getAll("ids")
    .map((value) => String(value).trim())
    .filter(Boolean);

  const stageByStatus: Record<string, "quoted" | "won" | "negotiating"> = {
    active: "won",
    pending: "quoted",
    closed: "negotiating",
  };
  const targetStage = stageByStatus[status];
  if (!targetStage) {
    throw new Error("契約状態が不正です。");
  }
  if (contractIds.length === 0) {
    throw new Error(
      tr(locale, {
        ja: "対象契約を選択してください。",
        zh: "请选择要更新的合同。",
        ko: "업데이트할 계약을 선택해 주세요.",
      })
    );
  }

  const contracts = await listHubContracts(locale);
  const clients = await listClients(user.id, { sort: "follow_up" });
  const clientStageMap = new Map(clients.map((client) => [client.id, client.stage]));
  const uniqueClientIds = [
    ...new Set(
      contractIds
        .map((contractId) => contracts.find((item) => item.id === contractId)?.clientId)
        .filter(Boolean) as string[]
    ),
  ];
  if (uniqueClientIds.length === 0) {
    throw new Error(
      tr(locale, {
        ja: "更新対象の契約が見つかりません。",
        zh: "未找到可更新的合同。",
        ko: "업데이트할 계약을 찾을 수 없습니다.",
      })
    );
  }

  const undoPairs = uniqueClientIds
    .map((clientId) => {
      const previousStage = clientStageMap.get(clientId);
      if (!previousStage || !isClientStage(previousStage)) return null;
      return { clientId, previousStage };
    })
    .filter(Boolean) as Array<{ clientId: string; previousStage: string }>;

  await Promise.all(
    uniqueClientIds.map(async (clientId) => {
      const client = await ensureClientOwnership(clientId, user.id);
      await setClientStage(client.id, targetStage);
      await addAuditLog({
        userId: user.id,
        action: "contract_batch_status_updated",
        targetType: "client",
        targetId: client.id,
        message: tr(locale, {
          ja: `契約一括更新: ${client.name} -> ${targetStage}`,
          zh: `合同批量更新：${client.name} -> ${targetStage}`,
          ko: `계약 일괄 업데이트: ${client.name} -> ${targetStage}`,
        }),
      });
    })
  );

  revalidatePath("/");
  revalidatePath("/contracts");
  revalidatePath("/clients");
  let destination = withFlash(returnTo, "contract_batch_updated");
  if (undoPairs.length > 0) {
    destination = appendQuery(destination, "undoClientIds", undoPairs.map((pair) => pair.clientId).join(","));
    destination = appendQuery(destination, "undoStages", undoPairs.map((pair) => pair.previousStage).join(","));
  }
  redirect(destination);
}

export async function undoContractBatchStatusAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const locale = await getLocale();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/contracts");
  const clientIds = parseCommaList(String(formData.get("clientIds") ?? ""));
  const stagesRaw = parseCommaList(String(formData.get("stages") ?? ""));

  if (clientIds.length === 0 || stagesRaw.length === 0 || clientIds.length !== stagesRaw.length) {
    throw new Error(
      tr(locale, {
        ja: "取り消しに必要な情報が不足しています。",
        zh: "撤销所需参数不完整。",
        ko: "되돌리기에 필요한 정보가 부족합니다.",
      })
    );
  }

  const validPairs: Array<{ clientId: string; stage: ClientStage }> = [];
  clientIds.forEach((clientId, index) => {
    const stage = stagesRaw[index];
    if (!isClientStage(stage)) return;
    validPairs.push({ clientId, stage });
  });

  if (validPairs.length === 0) {
    throw new Error(
      tr(locale, {
        ja: "取り消し可能な更新履歴が見つかりません。",
        zh: "未找到可撤销的更新记录。",
        ko: "되돌릴 수 있는 변경 이력이 없습니다.",
      })
    );
  }

  await Promise.all(
    validPairs.map(async ({ clientId, stage }) => {
      const client = await ensureClientOwnership(clientId, user.id);
      await setClientStage(client.id, stage);
    })
  );

  await addAuditLog({
    userId: user.id,
    action: "contract_batch_status_undone",
    targetType: "client",
    targetId: validPairs[0].clientId,
    message: tr(locale, {
      ja: `契約一括更新を取り消しました: ${validPairs.length}件`,
      zh: `已撤销合同批量更新：${validPairs.length}条`,
      ko: `계약 일괄 업데이트를 되돌렸습니다: ${validPairs.length}건`,
    }),
  });

  revalidatePath("/");
  revalidatePath("/contracts");
  revalidatePath("/clients");
  redirect(withFlash(returnTo, "contract_batch_undone"));
}

export async function rescheduleTaskAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const taskId = String(formData.get("taskId") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const dueAt = parseDate(formData.get("dueAt"));
  const returnTo = safeReturnTo(formData.get("returnTo"), `/clients/${clientId}`);

  if (!taskId || !clientId || !dueAt) {
    throw new Error("タスクID・顧客ID・新しい期限は必須です。");
  }
  await ensureClientOwnership(clientId, user.id);

  const updated = await rescheduleTask({
    taskId,
    dueAt,
    updatedById: user.id,
  });
  if (!updated) {
    throw new Error("タスクが見つかりません。");
  }

  revalidatePath("/");
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/service-requests");
  redirect(withFlash(returnTo, "request_status_updated"));
}

export async function undoTaskStatusAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const taskId = String(formData.get("taskId") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "").trim();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/service-requests");
  if (!taskId || !clientId || !isTaskStatus(statusRaw)) {
    throw new Error("元に戻す情報が不足しています。");
  }
  await ensureClientOwnership(clientId, user.id);
  const updated = await updateTaskStatus({
    taskId,
    status: statusRaw,
    updatedById: user.id,
  });
  if (!updated) throw new Error("タスクが見つかりません。");
  revalidatePath("/");
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/service-requests");
  redirect(withFlash(returnTo, "request_status_undone"));
}

export async function createImportJobAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }

  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const targetEntity = String(formData.get("targetEntity") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!isImportSourceType(sourceType)) {
    throw new Error("取込元種別が不正です。");
  }
  if (!isImportTargetEntity(targetEntity)) {
    throw new Error("取込対象が不正です。");
  }

  const job = await addImportJob({
    userId: user.id,
    sourceType,
    targetEntity,
    title,
    notes: notes || undefined,
  });

  await addAuditLog({
    userId: user.id,
    action: "import_job_created",
    targetType: "task",
    targetId: job.id,
    message: `取込ジョブを作成しました: ${job.title}`,
  });

  revalidatePath("/");
  revalidatePath("/import-center");
  redirect(withFlash(`/import-center?job=${job.id}`, "import_job_created"));
}

export async function updateImportJobMappingAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const locale = await getLocale();

  const jobId = String(formData.get("jobId") ?? "").trim();
  const targetEntity = String(formData.get("targetEntity") ?? "").trim();
  const sourceColumnsText = (formData.getAll("sourceColumn") as string[]).filter(Boolean).join(",");
  const targetFieldsText = (formData.getAll("targetField") as string[]).filter(Boolean).join(",");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!jobId) {
    throw new Error("ジョブIDは必須です。");
  }
  if (!isImportTargetEntity(targetEntity)) {
    throw new Error("取込対象が不正です。");
  }

  const sourceColumns = parseCommaList(sourceColumnsText);
  const targetFields = parseCommaList(targetFieldsText);
  if (sourceColumns.length === 0 || targetFields.length === 0) {
    throw new Error("元列とマッピング先項目を入力してください。");
  }

  const mappingJson = buildMappingFromLists(sourceColumns, targetFields);
  if (Object.keys(mappingJson).length === 0) {
    throw new Error("有効なマッピングが作成できませんでした。");
  }

  const validation = validateImportMapping(targetEntity, mappingJson, locale);
  const status = validation.missingRequired.length === 0 ? "mapped" : "queued";
  const issues: ImportValidationIssue[] = [];
  if (validation.missingRequired.length > 0) {
    issues.push(
      createImportValidationIssue({
        code: "missing_required_mapping",
        level: "critical",
        action: "resolve_now",
        message:
          locale === "zh"
            ? `必填字段未完成映射（${validation.missingRequired.length} 项）`
            : locale === "ko"
              ? `필수 필드 매핑 누락 (${validation.missingRequired.length}개)`
              : `必須フィールドのマッピング不足（${validation.missingRequired.length}件）`,
        count: validation.missingRequired.length,
      })
    );
  }
  if (validation.unknownTargets.length > 0) {
    issues.push(
      createImportValidationIssue({
        code: "unknown_target_fields",
        level: "warning",
        action: "auto_fix",
        message:
          locale === "zh"
            ? `检测到未知目标字段（${validation.unknownTargets.length} 项）`
            : locale === "ko"
              ? `알 수 없는 대상 필드 감지 (${validation.unknownTargets.length}개)`
              : `未知ターゲット項目を検出（${validation.unknownTargets.length}件）`,
        count: validation.unknownTargets.length,
      })
    );
  }
  if (issues.length === 0) {
    issues.push(
      createImportValidationIssue({
        code: "mapping_ready",
        level: "info",
        action: "apply_mapping",
        message:
          locale === "zh"
            ? "映射已满足导入要求。"
            : locale === "ko"
              ? "매핑이 가져오기 요건을 충족했습니다."
              : "マッピングは取込要件を満たしています。",
      })
    );
  }
  const message = buildImportValidationMessage({
    source: "mapping",
    summary: validation.summary,
    issues,
    metrics: {
      coveredRequiredCount: validation.coveredRequiredCount,
      requiredCount: validation.requiredCount,
    },
  });

  const updated = await updateImportJobMapping({
    userId: user.id,
    jobId,
    mappingJson,
    validationMessage: message,
    notes: notes || undefined,
    status,
  });
  if (!updated) {
    throw new Error("取込ジョブが見つかりません。");
  }

  await addAuditLog({
    userId: user.id,
    action: "import_mapping_updated",
    targetType: "task",
    targetId: updated.id,
    message: `取込マッピングを更新しました: ${updated.title}`,
  });

  revalidatePath("/");
  revalidatePath("/import-center");
  redirect(withFlash(`/import-center?job=${updated.id}`, "import_mapping_saved"));
}

export async function autoMapImportJobAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const locale = await getLocale();

  const jobId = String(formData.get("jobId") ?? "").trim();
  const targetEntity = String(formData.get("targetEntity") ?? "").trim();
  const sourceColumnsText = String(formData.get("sourceColumns") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!jobId) {
    throw new Error("ジョブIDは必須です。");
  }
  if (!isImportTargetEntity(targetEntity)) {
    throw new Error("取込対象が不正です。");
  }

  const sourceColumns = parseCommaList(sourceColumnsText);
  if (sourceColumns.length === 0) {
    throw new Error("自動マッピング用の元列を入力してください。");
  }

  const mappingJson = suggestImportMapping(targetEntity, sourceColumns);
  if (Object.keys(mappingJson).length === 0) {
    throw new Error("候補が見つかりませんでした。列名を確認してください。");
  }

  const validation = validateImportMapping(targetEntity, mappingJson, locale);
  const status = validation.missingRequired.length === 0 ? "mapped" : "queued";
  const issues: ImportValidationIssue[] = [];
  if (validation.missingRequired.length > 0) {
    issues.push(
      createImportValidationIssue({
        code: "missing_required_mapping",
        level: "critical",
        action: "resolve_now",
        message:
          locale === "zh"
            ? `自动映射后仍缺少必填字段（${validation.missingRequired.length} 项）`
            : locale === "ko"
              ? `자동 매핑 후에도 필수 필드 누락 (${validation.missingRequired.length}개)`
              : `自動マッピング後も必須項目が不足（${validation.missingRequired.length}件）`,
        count: validation.missingRequired.length,
      })
    );
  }
  if (validation.unknownTargets.length > 0) {
    issues.push(
      createImportValidationIssue({
        code: "unknown_target_fields",
        level: "warning",
        action: "auto_fix",
        message:
          locale === "zh"
            ? `自动映射包含未知字段（${validation.unknownTargets.length} 项）`
            : locale === "ko"
              ? `자동 매핑에 알 수 없는 필드 포함 (${validation.unknownTargets.length}개)`
              : `自動マッピングに未知項目を含む（${validation.unknownTargets.length}件）`,
        count: validation.unknownTargets.length,
      })
    );
  }
  if (issues.length === 0) {
    issues.push(
      createImportValidationIssue({
        code: "mapping_ready",
        level: "info",
        action: "apply_mapping",
        message:
          locale === "zh"
            ? "自动映射已满足导入要求。"
            : locale === "ko"
              ? "자동 매핑이 가져오기 요건을 충족했습니다."
              : "自動マッピングは取込要件を満たしています。",
      })
    );
  }
  const autoSummaryPrefix = tr(locale, {
    ja: "自動候補",
    zh: "自动候选",
    ko: "자동 후보",
  });
  const message = buildImportValidationMessage({
    source: "auto_mapping",
    summary: `${autoSummaryPrefix}: ${validation.summary}`,
    issues,
    metrics: {
      coveredRequiredCount: validation.coveredRequiredCount,
      requiredCount: validation.requiredCount,
    },
  });

  const updated = await updateImportJobMapping({
    userId: user.id,
    jobId,
    mappingJson,
    validationMessage: message,
    notes: notes || undefined,
    status,
  });
  if (!updated) {
    throw new Error("取込ジョブが見つかりません。");
  }

  await addAuditLog({
    userId: user.id,
    action: "import_mapping_updated",
    targetType: "task",
    targetId: updated.id,
    message: `自動マッピング候補を適用しました: ${updated.title}`,
  });

  revalidatePath("/");
  revalidatePath("/import-center");
  redirect(withFlash(`/import-center?job=${updated.id}`, "import_mapping_autofilled"));
}

export async function resolveImportValidationAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const locale = await getLocale();

  const jobId = String(formData.get("jobId") ?? "").trim();
  const operation = String(formData.get("operation") ?? "").trim();
  if (!jobId) {
    throw new Error("ジョブIDは必須です。");
  }

  const jobs = await listImportJobs(user.id, 200);
  const job = jobs.find((item) => item.id === jobId);
  if (!job) {
    throw new Error("取込ジョブが見つかりません。");
  }

  const operationLabel = tr(locale, {
    ja: operation === "auto_fix" ? "自動補正" : operation === "apply_mapping" ? "マッピング適用" : "手動修正",
    zh: operation === "auto_fix" ? "自动修复" : operation === "apply_mapping" ? "应用映射" : "手动处理",
    ko: operation === "auto_fix" ? "자동 보정" : operation === "apply_mapping" ? "매핑 적용" : "수동 수정",
  });

  const nextStatus = operation === "apply_mapping" ? "mapped" : "queued";
  const nextMessage = buildImportValidationMessage({
    source: "manual_resolution",
    summary: tr(locale, {
      ja: `検証対応済み: ${operationLabel}`,
      zh: `校验已处理：${operationLabel}`,
      ko: `검증 조치 완료: ${operationLabel}`,
    }),
    issues: [
      createImportValidationIssue({
        code: "validation_resolved",
        level: "info",
        action: "apply_mapping",
        message: tr(locale, {
          ja: `${operationLabel} を実行しました。`,
          zh: `已执行：${operationLabel}`,
          ko: `${operationLabel} 작업을 실행했습니다.`,
        }),
      }),
    ],
  });
  const nextNotes = [job.notes, `${new Date().toISOString()} ${operationLabel}`].filter(Boolean).join("\n");

  await updateImportJobMapping({
    userId: user.id,
    jobId: job.id,
    mappingJson: job.mappingJson ?? {},
    validationMessage: nextMessage,
    notes: nextNotes,
    status: nextStatus,
  });

  await addAuditLog({
    userId: user.id,
    action: "import_validation_resolved",
    targetType: "task",
    targetId: job.id,
    message: `${operationLabel}: ${job.title}`,
  });

  revalidatePath("/");
  revalidatePath("/import-center");
  redirect(withFlash(`/import-center?job=${job.id}`, "import_validation_resolved"));
}

export async function retryImportJobAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const locale = await getLocale();

  const jobId = String(formData.get("jobId") ?? "").trim();
  if (!jobId) {
    throw new Error("ジョブIDは必須です。");
  }

  const jobs = await listImportJobs(user.id, 200);
  const job = jobs.find((item) => item.id === jobId);
  if (!job) {
    throw new Error("取込ジョブが見つかりません。");
  }

  const retryAt = new Date().toISOString();
  const retryMemo = tr(locale, {
    ja: `再試行予約: ${retryAt}`,
    zh: `重试时间：${retryAt}`,
    ko: `재시도 예약: ${retryAt}`,
  });
  const nextNotes = [job.notes, retryMemo].filter(Boolean).join("\n");
  const preservedValidation = buildImportValidationMessage({
    source: "retry",
    summary: tr(locale, {
      ja: "再試行キューへ戻しました",
      zh: "已退回重试队列",
      ko: "재시도 대기열로 되돌렸습니다",
    }),
    issues: [
      createImportValidationIssue({
        code: "retry_queued",
        level: "info",
        action: "retry",
        message: tr(locale, {
          ja: "前回の検証情報を保持したまま再試行します。",
          zh: "已保留上次校验信息并进入重试。",
          ko: "이전 검증 정보를 유지한 채 재시도합니다.",
        }),
      }),
    ],
  });

  const retried = await updateImportJobMapping({
    userId: user.id,
    jobId,
    mappingJson: job.mappingJson ?? {},
    validationMessage: preservedValidation,
    notes: nextNotes,
    status: "queued",
    allowRetry: true,
  });
  if (!retried) {
    throw new Error("取込ジョブの再試行に失敗しました。");
  }

  await addAuditLog({
    userId: user.id,
    action: "import_job_retried",
    targetType: "import_job",
    targetId: jobId,
    message: tr(locale, {
      ja: `取込ジョブを再試行キューへ戻しました: ${retried.title}`,
      zh: `已将导入任务退回重试队列：${retried.title}`,
      ko: `가져오기 작업을 재시도 대기열로 되돌렸습니다: ${retried.title}`,
    }),
    context: {
      previousStatus: job.status,
      nextStatus: "queued",
    },
  });

  revalidatePath("/");
  revalidatePath("/import-center");
  redirect(withFlash(`/import-center?job=${jobId}`, "import_job_retried"));
}

export async function registerAttachmentAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }

  const targetType = String(formData.get("targetType") ?? "").trim();
  const targetId = String(formData.get("targetId") ?? "").trim();
  const fileNameInput = String(formData.get("fileName") ?? "").trim();
  const fileTypeInput = String(formData.get("fileType") ?? "").trim();
  const fileSizeBytes = parseNumber(formData.get("fileSizeBytes"), 0);
  const externalStoragePathInput = String(formData.get("externalStoragePath") ?? "").trim();
  const upload = formData.get("uploadFile");

  if (!isAttachmentTargetType(targetType)) {
    throw new Error("添付対象種別が不正です。");
  }
  if (!targetId) {
    throw new Error("対象IDは必須です。");
  }

  let fileName = fileNameInput;
  let fileType = fileTypeInput || undefined;
  let size = fileSizeBytes > 0 ? fileSizeBytes : undefined;
  let storagePath: string | undefined;

  if (upload instanceof File && upload.size > 0) {
    fileName = upload.name || fileNameInput || "upload.bin";
    fileType = upload.type || fileType || undefined;
    size = upload.size;

    const mode = getAttachmentStorageMode();
    if (mode === "local_public") {
      const persisted = await persistAttachmentToLocalPublic(upload);
      fileName = persisted.fileName;
      fileType = persisted.fileType || fileType;
      size = persisted.fileSizeBytes;
      storagePath = persisted.storagePath;
    } else {
      throw new Error("現在の保存モードでは直接アップロードに対応していません。外部保存先URLを指定してください。");
    }
  } else if (externalStoragePathInput) {
    if (!isValidStoragePath(externalStoragePathInput)) {
      throw new Error("外部保存先URLは http(s) または / から始まるパスで入力してください。");
    }
    storagePath = externalStoragePathInput;
  }

  if (!fileName) {
    throw new Error("ファイル名またはアップロードファイルを指定してください。");
  }

  const attachment = await addAttachment({
    userId: user.id,
    targetType,
    targetId,
    fileName,
    fileType,
    fileSizeBytes: size,
    storagePath,
  });

  await addAuditLog({
    userId: user.id,
    action: "attachment_registered",
    targetType: "task",
    targetId: attachment.id,
    message: `添付を登録しました: ${attachment.fileName}`,
  });

  revalidatePath("/");
  revalidatePath("/import-center");
  revalidatePath("/properties");
  revalidatePath("/contracts");
  revalidatePath("/service-requests");
  redirect(withFlash("/import-center", "attachment_registered"));
}

export async function createPropertyQuickAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const locale = await getLocale();

  const defaultName = tr(locale, {
    ja: "新規物件",
    zh: "新物件",
    ko: "신규 매물",
  });

  const name = String(formData.get("name") ?? "").trim() || defaultName;
  const area = String(formData.get("area") ?? "").trim() || undefined;
  const address = String(formData.get("address") ?? "").trim() || undefined;
  const listingPrice = Math.max(0, parseNumber(formData.get("listingPrice"), 0));
  const sizeSqm = parseNumber(formData.get("sizeSqm"), 0) || undefined;
  const managementFee = parseNumber(formData.get("managementFee"), 0) || undefined;
  const repairFee = parseNumber(formData.get("repairFee"), 0) || undefined;

  const property = await addProperty({
    name,
    area,
    address,
    listingPrice,
    sizeSqm,
    managementFee,
    repairFee,
  });

  await addAuditLog({
    userId: user.id,
    action: "property_created",
    targetType: "compliance",
    targetId: property.id,
    message: tr(locale, {
      ja: `物件を登録しました: ${property.name}`,
      zh: `已新增物件：${property.name}`,
      ko: `매물을 등록했습니다: ${property.name}`,
    }),
  });

  revalidatePath("/properties");
  revalidatePath("/");
  revalidatePath("/output-center");
  redirect(withFlash("/properties", "property_created"));
}

export async function createPartyQuickAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const locale = await getLocale();

  const name =
    String(formData.get("name") ?? "").trim() ||
    tr(locale, {
      ja: "新規関係者",
      zh: "新主体",
      ko: "신규 관계자",
    });
  const phone = String(formData.get("phone") ?? "").trim() || "000-0000-0000";
  const preferredArea = String(formData.get("preferredArea") ?? "").trim() || undefined;
  const email = String(formData.get("email") ?? "").trim() || undefined;

  const client = await addClient({
    ownerUserId: user.id,
    name,
    phone,
    preferredArea,
    email,
    budgetType: "total_price",
    purpose: "self_use",
    loanPreApprovalStatus: "not_applied",
    stage: "lead",
    temperature: "medium",
    brokerageContractType: "none",
    amlCheckStatus: "not_required",
  });

  await addAuditLog({
    userId: user.id,
    action: "party_created",
    targetType: "client",
    targetId: client.id,
    message: tr(locale, {
      ja: `関係者を登録しました: ${client.name}`,
      zh: `已新增主体：${client.name}`,
      ko: `관계자를 등록했습니다: ${client.name}`,
    }),
  });

  revalidatePath("/parties");
  revalidatePath("/clients");
  revalidatePath("/");
  redirect(withFlash(`/parties?focus=${client.id}`, "party_created"));
}

export async function createServiceRequestQuickAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const locale = await getLocale();

  const requestedClientId = String(formData.get("clientId") ?? "").trim();
  let clientId = requestedClientId;
  if (!clientId) {
    const clients = await listClients(user.id, { sort: "follow_up" });
    clientId = clients[0]?.id ?? "";
  }
  if (!clientId) {
    throw new Error(
      tr(locale, {
        ja: "先に関係者（顧客）を1件以上登録してください。",
        zh: "请先至少创建一条主体（客户）记录。",
        ko: "먼저 관계자(고객) 데이터를 1건 이상 등록해 주세요.",
      })
    );
  }

  const title =
    String(formData.get("title") ?? "").trim() ||
    tr(locale, {
      ja: "新規対応依頼",
      zh: "新建服务请求",
      ko: "신규 서비스 요청",
    });
  const dueAt = parseDate(formData.get("dueAt"));
  const returnTo = safeReturnTo(formData.get("returnTo"), "/service-requests");

  const task = await addTask({
    clientId,
    title,
    dueAt,
    createdById: user.id,
    status: "pending",
  });

  await addAuditLog({
    userId: user.id,
    action: "service_request_created",
    targetType: "task",
    targetId: task.id,
    message: tr(locale, {
      ja: `対応依頼を登録しました: ${title}`,
      zh: `已新增服务请求：${title}`,
      ko: `서비스 요청을 등록했습니다: ${title}`,
    }),
  });

  revalidatePath("/service-requests");
  revalidatePath("/");
  revalidatePath(`/clients/${clientId}`);
  redirect(withFlash(returnTo, "request_created"));
}

export async function generateOutputDocumentAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const locale = await getLocale();

  const quoteId = String(formData.get("quoteId") ?? "").trim();
  const typeRaw = String(formData.get("type") ?? "").trim();
  if (!isOutputDocType(typeRaw)) {
    throw new Error("帳票種別が不正です。");
  }

  const outputFormat = String(formData.get("outputFormat") ?? "pdf").trim().toLowerCase();
  const language = String(formData.get("language") ?? locale).trim().toLowerCase();
  const targetProperty = String(formData.get("targetProperty") ?? "").trim();
  const targetParty = String(formData.get("targetParty") ?? "").trim();
  const safeLanguage: Locale = language === "zh" || language === "ko" || language === "ja" ? language : locale;
  const safeFormat = outputFormat === "docx" ? "docx" : "pdf";
  const returnTo = safeReturnTo(
    formData.get("returnTo"),
    `/output-center?type=${encodeURIComponent(typeRaw)}&format=${encodeURIComponent(safeFormat)}&lang=${encodeURIComponent(safeLanguage)}&quoteId=${encodeURIComponent(quoteId)}&targetProperty=${encodeURIComponent(targetProperty)}&targetParty=${encodeURIComponent(targetParty)}&historyType=all&historyLang=all&historyFormat=all`
  );
  const [templateSettings, templateVersions] = await Promise.all([
    getOutputTemplateSettings(user.id),
    listOutputTemplateVersions(user.id, 20),
  ]);
  const activeTemplateVersion = templateVersions.find((item) => item.isActive) ?? templateVersions[0];
  const issuedAt = new Date();

  if (typeRaw === "property_overview") {
    if (!targetProperty) {
      const withValidationFlash = withFlash(returnTo, "output_validation_failed");
      redirect(appendQuery(withValidationFlash, "issues", "missing_target_property"));
    }

    const { properties } = await listQuoteFormData();
    const property = properties.find((item) => item.id === targetProperty);
    if (!property) {
      throw new Error("対象物件が見つかりません。");
    }

    const documentNumber = createDocumentNumber(property.id, typeRaw, issuedAt);
    const title = `${getOutputDocLabel(safeLanguage, typeRaw)} - ${property.name}`;
    const generated = await addGeneratedOutput({
      userId: user.id,
      actorId: user.id,
      propertyId: property.id,
      partyId: targetParty || undefined,
      outputType: typeRaw,
      outputFormat: safeFormat,
      language: safeLanguage,
      title,
      documentNumber,
      templateVersionId: activeTemplateVersion?.id,
    });

    await addAuditLog({
      userId: user.id,
      action: "output_generated",
      targetType: "property",
      targetId: property.id,
      message: tr(locale, {
        ja: `物件概要PDFを生成しました: ${property.name} (${safeFormat}/${safeLanguage}) / doc=${documentNumber} / tpl=${activeTemplateVersion?.versionNumber ?? "n/a"} / class=${templateSettings.documentClassification}`,
        zh: `已生成物件概要PDF：${property.name} (${safeFormat}/${safeLanguage}) / doc=${documentNumber} / tpl=${activeTemplateVersion?.versionNumber ?? "n/a"} / class=${templateSettings.documentClassification}`,
        ko: `매물 개요 PDF를 생성했습니다: ${property.name} (${safeFormat}/${safeLanguage}) / doc=${documentNumber} / tpl=${activeTemplateVersion?.versionNumber ?? "n/a"} / class=${templateSettings.documentClassification}`,
      }),
    });

    revalidatePath("/");
    revalidatePath("/output-center");
    const withSuccessFlash = withFlash(returnTo, "output_generated");
    redirect(appendQuery(withSuccessFlash, "generatedOutputId", generated.id));
  }

  if (!quoteId) {
    throw new Error("提案IDは必須です。");
  }
  const quote = await getQuotationById(quoteId);
  if (!quote) {
    throw new Error("提案データが見つかりません。");
  }
  const documentNumber = createDocumentNumber(quote.id, typeRaw, issuedAt);

  const validationIssues: string[] = [];
  if (!quote.listingPrice || quote.listingPrice <= 0) validationIssues.push("missing_listing_price");
  if (!quote.summaryText.trim()) validationIssues.push("missing_summary");
  if (!targetProperty) validationIssues.push("missing_target_property");
  if (!targetParty) validationIssues.push("missing_target_party");
  if (typeRaw === "estimate_sheet") {
    const hasCost =
      quote.brokerageFee > 0 ||
      quote.taxFee > 0 ||
      quote.otherFee > 0 ||
      quote.managementFee > 0 ||
      quote.repairFee > 0;
    if (!hasCost) validationIssues.push("missing_estimate_breakdown");
  }
  if (typeRaw === "funding_plan") {
    if (!quote.downPayment || quote.downPayment <= 0) validationIssues.push("missing_down_payment");
    if (!quote.loanAmount || quote.loanAmount <= 0) validationIssues.push("missing_loan_amount");
    if (!quote.monthlyPaymentEstimate || quote.monthlyPaymentEstimate <= 0) validationIssues.push("missing_monthly_payment");
    if (!quote.interestRate || quote.interestRate <= 0) validationIssues.push("missing_interest_rate");
    if (!quote.loanYears || quote.loanYears <= 0) validationIssues.push("missing_loan_years");
  }
  if (validationIssues.length > 0) {
    await addAuditLog({
      userId: user.id,
      action: "output_validation_failed",
      targetType: "quote",
      targetId: quote.id,
      message: tr(locale, {
        ja: `出力前チェックで差し戻し: ${documentNumber} / issues=${validationIssues.join("|")} / tpl=${activeTemplateVersion?.versionNumber ?? "n/a"}`,
        zh: `输出前校验未通过: ${documentNumber} / issues=${validationIssues.join("|")} / tpl=${activeTemplateVersion?.versionNumber ?? "n/a"}`,
        ko: `출력 전 검증 실패: ${documentNumber} / issues=${validationIssues.join("|")} / tpl=${activeTemplateVersion?.versionNumber ?? "n/a"}`,
      }),
    });
    const withValidationFlash = withFlash(returnTo, "output_validation_failed");
    redirect(appendQuery(withValidationFlash, "issues", validationIssues.join(",")));
  }

  const partyLabel = quote.client?.name ?? quote.clientId;
  const title = `${getOutputDocLabel(safeLanguage, typeRaw)} - ${partyLabel}`;

  const generated = await addGeneratedOutput({
    userId: user.id,
    actorId: user.id,
    sourceQuoteId: quote.id,
    quoteId: quote.id,
    propertyId: targetProperty || undefined,
    partyId: targetParty || undefined,
    outputType: typeRaw,
    outputFormat: safeFormat,
    language: safeLanguage,
    title,
    documentNumber,
    templateVersionId: activeTemplateVersion?.id,
  });

  await addAuditLog({
    userId: user.id,
    action: "output_generated",
    targetType: "quote",
    targetId: quote.id,
    message: tr(locale, {
      ja: `帳票を生成しました: ${quote.quoteTitle} (${typeRaw}/${safeFormat}/${safeLanguage}) / doc=${documentNumber} / tpl=${activeTemplateVersion?.versionNumber ?? "n/a"} / class=${templateSettings.documentClassification}`,
      zh: `已生成文书：${quote.quoteTitle} (${typeRaw}/${safeFormat}/${safeLanguage}) / doc=${documentNumber} / tpl=${activeTemplateVersion?.versionNumber ?? "n/a"} / class=${templateSettings.documentClassification}`,
      ko: `문서를 생성했습니다: ${quote.quoteTitle} (${typeRaw}/${safeFormat}/${safeLanguage}) / doc=${documentNumber} / tpl=${activeTemplateVersion?.versionNumber ?? "n/a"} / class=${templateSettings.documentClassification}`,
    }),
  });

  revalidatePath("/");
  revalidatePath("/output-center");
  const withSuccessFlash = withFlash(returnTo, "output_generated");
  redirect(appendQuery(withSuccessFlash, "generatedOutputId", generated.id));
}

export async function createQuotation(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) {
    throw new Error("顧客IDは必須です。");
  }
  await ensureClientOwnership(clientId, user.id);

  const summaryMode = String(formData.get("summaryMode") ?? "short").trim();
  const generatedShortSummary = String(formData.get("generatedShortSummary") ?? "").trim();
  const generatedFormalSummary = String(formData.get("generatedFormalSummary") ?? "").trim();
  const fallbackSummary = String(formData.get("summaryText") ?? "").trim();
  const agentNote = String(formData.get("agentNote") ?? "").trim();
  const selectedSummary = summaryMode === "formal" ? generatedFormalSummary : generatedShortSummary;
  const finalSummary =
    selectedSummary || fallbackSummary || "未入力";
  const finalSummaryWithNote = agentNote
    ? `${finalSummary}\n\n担当者メモ：${agentNote}`
    : finalSummary;

  const quote = await addQuotation({
    clientId,
    propertyId: String(formData.get("propertyId") ?? "").trim() || undefined,
    quoteTitle: String(formData.get("quoteTitle") ?? "提案プラン").trim(),
    listingPrice: parseNumber(formData.get("listingPrice")),
    brokerageFee: parseNumber(formData.get("brokerageFee")),
    taxFee: parseNumber(formData.get("taxFee")),
    managementFee: parseNumber(formData.get("managementFee")),
    repairFee: parseNumber(formData.get("repairFee")),
    otherFee: parseNumber(formData.get("otherFee")),
    downPayment: parseNumber(formData.get("downPayment")),
    interestRate: parseNumber(formData.get("interestRate")),
    loanYears: parseNumber(formData.get("loanYears"), 35),
    summaryText: finalSummaryWithNote,
  });

  revalidatePath("/");
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/quotes");
  revalidatePath("/quotes/new");
  revalidatePath("/board");
  await addAuditLog({
    userId: user.id,
    action: "quote_created",
    targetType: "quote",
    targetId: quote.id,
    message: `提案を作成しました: ${quote.quoteTitle}`,
  });

  redirect(`/quotes/${quote.id}`);
}

export async function duplicateQuotationAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  if (!quoteId) {
    throw new Error("提案IDは必須です。");
  }
  const source = await getQuotationById(quoteId);
  if (!source || !source.client) {
    throw new Error("提案が見つかりません。");
  }
  await ensureClientOwnership(source.client.id, user.id);

  const duplicated = await duplicateQuotation(quoteId);
  if (!duplicated) {
    throw new Error("提案が見つかりません。");
  }

  revalidatePath("/");
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quoteId}`);
  await addAuditLog({
    userId: user.id,
    action: "quote_duplicated",
    targetType: "quote",
    targetId: duplicated.id,
    message: `提案を複製しました: ${duplicated.quoteTitle}`,
  });

  redirect(`/quotes/${duplicated.id}`);
}

export async function changeQuotationStatus(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  const status = String(formData.get("status") ?? "draft");

  if (!quoteId) {
    throw new Error("提案IDは必須です。");
  }
  if (!isQuoteStatus(status)) {
    throw new Error("ステータスの値が不正です。");
  }
  const quote = await getQuotationById(quoteId);
  if (!quote || !quote.client) {
    throw new Error("提案が見つかりません。");
  }
  await ensureClientOwnership(quote.client.id, user.id);

  await updateQuotationStatus(quoteId, status);

  revalidatePath("/");
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quoteId}`);
  await addAuditLog({
    userId: user.id,
    action: "quote_status_updated",
    targetType: "quote",
    targetId: quoteId,
    message: `提案ステータスを更新しました: ${status}`,
  });
}

export async function updateOutputTemplateSettingsAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }

  const current = await getOutputTemplateSettings(user.id);
  const shouldResetToStandard = parseCheckbox(formData.get("resetToStandard"));
  const standard = getDefaultOutputTemplateSettings(user.id);
  const versionLabel = String(formData.get("versionLabel") ?? "").trim();
  const changeNote = String(formData.get("changeNote") ?? "").trim();
  const text = (name: string, fallback: string) => {
    const value = String(formData.get(name) ?? "").trim();
    return value || fallback;
  };

  const settings = await updateOutputTemplateSettings(user.id, {
    companyName: shouldResetToStandard ? standard.companyName : text("companyName", current.companyName),
    department: shouldResetToStandard ? standard.department : text("department", current.department),
    representative: shouldResetToStandard ? standard.representative : text("representative", current.representative),
    licenseNumber: shouldResetToStandard ? standard.licenseNumber : text("licenseNumber", current.licenseNumber),
    postalAddress: shouldResetToStandard ? standard.postalAddress : text("postalAddress", current.postalAddress),
    phone: shouldResetToStandard ? standard.phone : text("phone", current.phone),
    email: shouldResetToStandard ? standard.email : text("email", current.email),
    proposalTitle: shouldResetToStandard ? standard.proposalTitle : text("proposalTitle", current.proposalTitle),
    estimateSheetTitle: shouldResetToStandard
      ? standard.estimateSheetTitle
      : text("estimateSheetTitle", current.estimateSheetTitle),
    fundingPlanTitle: shouldResetToStandard ? standard.fundingPlanTitle : text("fundingPlanTitle", current.fundingPlanTitle),
    assumptionMemoTitle: shouldResetToStandard
      ? standard.assumptionMemoTitle
      : text("assumptionMemoTitle", current.assumptionMemoTitle),
    documentClassification: shouldResetToStandard
      ? standard.documentClassification
      : text("documentClassification", current.documentClassification),
    disclaimerLine1: shouldResetToStandard ? standard.disclaimerLine1 : text("disclaimerLine1", current.disclaimerLine1),
    disclaimerLine2: shouldResetToStandard ? standard.disclaimerLine2 : text("disclaimerLine2", current.disclaimerLine2),
    disclaimerLine3: shouldResetToStandard ? standard.disclaimerLine3 : text("disclaimerLine3", current.disclaimerLine3),
    showApprovalSection: shouldResetToStandard
      ? standard.showApprovalSection
      : parseCheckbox(formData.get("showApprovalSection")),
    showLegalStatusDigest: shouldResetToStandard
      ? standard.showLegalStatusDigest
      : parseCheckbox(formData.get("showLegalStatusDigest")),
    showOutstandingBalanceTable: shouldResetToStandard
      ? standard.showOutstandingBalanceTable
      : parseCheckbox(formData.get("showOutstandingBalanceTable")),
  });

  await createOutputTemplateVersion({
    userId: user.id,
    versionLabel: shouldResetToStandard ? "日本標準テンプレート再適用" : versionLabel || undefined,
    changeNote: changeNote || undefined,
    settingsSnapshot: {
      companyName: settings.companyName,
      department: settings.department,
      representative: settings.representative,
      licenseNumber: settings.licenseNumber,
      postalAddress: settings.postalAddress,
      phone: settings.phone,
      email: settings.email,
      proposalTitle: settings.proposalTitle,
      estimateSheetTitle: settings.estimateSheetTitle,
      fundingPlanTitle: settings.fundingPlanTitle,
      assumptionMemoTitle: settings.assumptionMemoTitle,
      documentClassification: settings.documentClassification,
      disclaimerLine1: settings.disclaimerLine1,
      disclaimerLine2: settings.disclaimerLine2,
      disclaimerLine3: settings.disclaimerLine3,
      showApprovalSection: settings.showApprovalSection,
      showLegalStatusDigest: settings.showLegalStatusDigest,
      showOutstandingBalanceTable: settings.showOutstandingBalanceTable,
    },
    activate: true,
  });

  revalidatePath("/");
  revalidatePath("/quotes");
  revalidatePath("/settings/output-templates");
  revalidatePath("/templates");
  revalidatePath("/quotes/[id]");
  revalidatePath("/quotes/[id]/print");

  await addAuditLog({
    userId: user.id,
    action: "output_template_updated",
    targetType: "quote",
    targetId: settings.id,
    message: "標準出力テンプレート設定を更新しました。",
  });
}

export async function applyOutputTemplateVersionAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }
  const versionId = String(formData.get("versionId") ?? "").trim();
  const confirmApply = parseCheckbox(formData.get("confirmApply"));
  if (!versionId) {
    throw new Error("適用対象バージョンが未指定です。");
  }
  if (!confirmApply) {
    throw new Error("版適用前の確認チェックが未完了です。");
  }

  const applied = await applyOutputTemplateVersion({
    userId: user.id,
    versionId,
  });
  if (!applied) {
    throw new Error("テンプレート版が見つかりません。");
  }

  revalidatePath("/");
  revalidatePath("/quotes");
  revalidatePath("/settings/output-templates");
  revalidatePath("/templates");
  revalidatePath("/quotes/[id]");
  revalidatePath("/quotes/[id]/print");

  await addAuditLog({
    userId: user.id,
    action: "output_template_version_applied",
    targetType: "quote",
    targetId: versionId,
    message: `テンプレート版を適用しました: ${versionId}`,
  });
}

function isAiExperienceDraftStatus(value: string): value is AiExperienceDraftStatus {
  return value === "draft" || value === "approved" || value === "rejected";
}

export async function draftAiExperiencesAction() {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }

  const result = await draftAiExperiencesFromRecentCorrections({
    userId: user.id,
    limit: 200,
    minEventsPerDraft: 2,
  });

  await addAuditLog({
    userId: user.id,
    action: "ai_experience_drafts_generated",
    targetType: "ai_experience",
    message: `AI経験草稿を生成しました: ${result.createdDrafts.length}件`,
    context: {
      createdDraftCount: result.createdDrafts.length,
      skippedDuplicateCount: result.skippedDuplicateCount,
      sourceEventCount: result.sourceEventCount,
      draftIds: result.createdDrafts.map((draft) => draft.id),
    },
  });

  revalidatePath("/settings/ai-experience");
  redirect(`/settings/ai-experience?flash=experience_drafted&created=${result.createdDrafts.length}`);
}

export async function reviewAiExperienceDraftAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }

  const draftId = String(formData.get("draftId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!draftId) throw new Error("AI経験草稿IDが不正です。");
  if (!isAiExperienceDraftStatus(status) || status === "draft") {
    throw new Error("AI経験草稿の審査ステータスが不正です。");
  }

  const updated = await updateAiExperienceDraftStatus({
    userId: user.id,
    draftId,
    status,
  });
  if (!updated) throw new Error("AI経験草稿が見つかりません。");

  await addAuditLog({
    userId: user.id,
    action: "ai_experience_draft_reviewed",
    targetType: "ai_experience",
    targetId: updated.id,
    message: `AI経験草稿を${status === "approved" ? "承認" : "却下"}しました: ${updated.title}`,
    context: {
      draftId: updated.id,
      status,
      eventIds: updated.eventIds,
      scopeCandidate: updated.scopeCandidate,
      fieldKey: updated.fieldKey,
      templateId: updated.templateId,
    },
  });

  revalidatePath("/settings/ai-experience");
  redirect(`/settings/ai-experience?flash=experience_reviewed&status=${status}`);
}

// ─── Excel 物件一括取込 ────────────────────────────────────────────

type ExcelImportPayload = {
  kind?: "property_row_import" | "input_file_extraction";
  headers: string[];
  autoMapping: Record<string, string>;
  rows: Record<string, unknown>[];
  originalFilename: string;
  totalRows: number;
  inputExtraction?: InputFileExtractionResult;
};

type ExtractionReviewDecision = {
  fieldId: string;
  reviewStatus: ExtractionReviewStatus;
  editedValue?: string;
};

const WORKBENCH_FIELD_STATUS_KEY = "__workbenchFieldStatuses";
const CASE_WORKBENCH_FIELD_KEYS = [
  "property.name",
  "property.roomNumber",
  "property.postalCode",
  "property.address",
  "lease.moveInDate",
  "lease.rent",
  "lease.commonFee",
  "lease.parkingFee",
  "lease.monthlyRentTotal",
  "lease.deposit",
  "lease.keyMoney",
  "lease.insuranceFee",
  "lease.keyExchangeFee",
  "applicant.name",
  "applicant.furigana",
  "applicant.gender",
  "applicant.spouse",
  "applicant.birthDate",
  "applicant.phone",
  "applicant.email",
  "applicant.currentPostalCode",
  "applicant.currentAddress",
  "applicant.nationality",
  "applicant.identityDocumentType",
  "applicant.residenceStatus",
  "applicant.residencePeriod",
  "applicant.residenceCardExpiry",
  "applicant.residenceCardNumber",
  "applicant.workRestriction",
  "applicant.driverLicenseNumber",
  "applicant.driverLicenseExpiry",
  "applicant.driverLicenseConditions",
  "applicant.residenceYears",
  "applicant.housingType",
  "applicant.currentRent",
  "applicant.employerName",
  "applicant.employerFurigana",
  "applicant.employerPhone",
  "applicant.employerPostalCode",
  "applicant.employerAddress",
  "applicant.occupation",
  "applicant.jobType",
  "applicant.employmentType",
  "applicant.annualIncome",
  "applicant.yearsEmployed",
  "applicant.payday",
  "applicant.moveReason",
  "guarantor.furigana",
  "guarantor.name",
  "guarantor.gender",
  "guarantor.spouse",
  "guarantor.relationship",
  "guarantor.birthDate",
  "guarantor.postalCode",
  "guarantor.address",
  "guarantor.driverLicenseNumber",
  "guarantor.residenceYears",
  "guarantor.housingType",
  "guarantor.phone",
  "guarantor.employerFurigana",
  "guarantor.employerName",
  "guarantor.employerAddress",
  "guarantor.occupation",
  "guarantor.jobType",
  "guarantor.employmentType",
  "guarantor.annualIncome",
  "guarantor.payday",
  "emergencyContact.name",
  "emergencyContact.furigana",
  "emergencyContact.gender",
  "emergencyContact.spouse",
  "emergencyContact.relationship",
  "emergencyContact.birthDate",
  "emergencyContact.phone",
  "emergencyContact.postalCode",
  "emergencyContact.address",
  "emergencyContact.driverLicenseNumber",
  "emergencyContact.residenceYears",
  "emergencyContact.housingType",
  "emergencyContact.employerName",
  "emergencyContact.employerFurigana",
  "emergencyContact.employerAddress",
  "emergencyContact.occupation",
  "emergencyContact.jobType",
  "emergencyContact.employmentType",
  "emergencyContact.annualIncome",
  "emergencyContact.payday",
  "coOccupants.0.furigana",
  "coOccupants.0.name",
  "coOccupants.0.relationship",
  "coOccupants.0.birthDate",
  "coOccupants.0.phone",
  "coOccupants.0.employerName",
  "coOccupants.1.furigana",
  "coOccupants.1.name",
  "coOccupants.1.relationship",
  "coOccupants.1.birthDate",
  "coOccupants.1.phone",
  "coOccupants.1.employerName",
  "coOccupants.2.furigana",
  "coOccupants.2.name",
  "coOccupants.2.relationship",
  "coOccupants.2.birthDate",
  "coOccupants.2.phone",
  "coOccupants.2.employerName",
  "broker.companyName",
  "broker.staffName",
  "broker.phone",
  "broker.address",
  "management.companyName",
  "management.phone",
  "management.address",
  "management.staffName",
  "guarantee.plan",
  "guarantee.initialFee",
  "guarantee.monthlyFee",
  "guarantee.renewalFee",
] as const;

function getCaseWorkbenchFieldKeysFromForm(formData: FormData): string[] {
  const requestedFields = String(formData.get("presentFieldKeysJson") ?? "").trim();
  if (!requestedFields) return [...CASE_WORKBENCH_FIELD_KEYS];

  try {
    const parsed = JSON.parse(requestedFields);
    if (!Array.isArray(parsed)) return [...CASE_WORKBENCH_FIELD_KEYS];
    const allowed = new Set<string>([...CASE_WORKBENCH_FIELD_KEYS, ...CASE_FIELD_KEYS]);
    const fieldKeys = parsed
      .map((value) => String(value).trim())
      .filter((value) => allowed.has(value));
    return fieldKeys.length > 0 ? [...new Set(fieldKeys)] : [...CASE_WORKBENCH_FIELD_KEYS];
  } catch {
    return [...CASE_WORKBENCH_FIELD_KEYS];
  }
}

function getCaseWorkbenchFieldDecision(formData: FormData, fieldKey: string): "confirmed" | "unknown" | "rejected" {
  const decision = String(formData.get(`status:${fieldKey}`) ?? "confirmed").trim();
  if (decision === "unknown" || decision === "rejected") return decision;
  return "confirmed";
}

function safeHashAnchor(value: FormDataEntryValue | null): string {
  const anchor = String(value ?? "").trim();
  return /^[a-zA-Z0-9_-]+$/.test(anchor) ? anchor : "";
}

function safeQueryToken(value: FormDataEntryValue | null): string {
  const token = String(value ?? "").trim();
  return /^[a-zA-Z0-9_-]+$/.test(token) ? token : "";
}

const GUARANTEE_APPLICATION_PREVIEW_CASE_FIELD_KEYS = [
  "property.name",
  "property.roomNumber",
  "property.postalCode",
  "property.address",
  "lease.moveInDate",
  "lease.rent",
  "lease.commonFee",
  "lease.parkingFee",
  "lease.monthlyRentTotal",
  "lease.deposit",
  "lease.keyMoney",
  "lease.insuranceFee",
  "lease.keyExchangeFee",
  "applicant.name",
  "applicant.furigana",
  "applicant.gender",
  "applicant.spouse",
  "applicant.birthDate",
  "applicant.phone",
  "applicant.currentPostalCode",
  "applicant.currentAddress",
  "applicant.nationality",
  "applicant.identityDocumentType",
  "applicant.residenceStatus",
  "applicant.residencePeriod",
  "applicant.residenceCardExpiry",
  "applicant.residenceCardNumber",
  "applicant.workRestriction",
  "applicant.driverLicenseNumber",
  "applicant.driverLicenseExpiry",
  "applicant.driverLicenseConditions",
  "applicant.residenceYears",
  "applicant.housingType",
  "applicant.currentRent",
  "applicant.employerFurigana",
  "applicant.employerName",
  "applicant.employerPhone",
  "applicant.employerPostalCode",
  "applicant.employerAddress",
  "applicant.occupation",
  "applicant.jobType",
  "applicant.employmentType",
  "applicant.annualIncome",
  "applicant.payday",
  "applicant.moveReason",
  "guarantor.furigana",
  "guarantor.name",
  "guarantor.gender",
  "guarantor.spouse",
  "guarantor.relationship",
  "guarantor.birthDate",
  "guarantor.postalCode",
  "guarantor.address",
  "guarantor.driverLicenseNumber",
  "guarantor.residenceYears",
  "guarantor.housingType",
  "guarantor.phone",
  "guarantor.employerFurigana",
  "guarantor.employerName",
  "guarantor.employerAddress",
  "guarantor.occupation",
  "guarantor.jobType",
  "guarantor.employmentType",
  "guarantor.annualIncome",
  "guarantor.payday",
  "emergencyContact.furigana",
  "emergencyContact.name",
  "emergencyContact.gender",
  "emergencyContact.spouse",
  "emergencyContact.relationship",
  "emergencyContact.birthDate",
  "emergencyContact.postalCode",
  "emergencyContact.address",
  "emergencyContact.driverLicenseNumber",
  "emergencyContact.residenceYears",
  "emergencyContact.housingType",
  "emergencyContact.phone",
  "emergencyContact.employerFurigana",
  "emergencyContact.employerName",
  "emergencyContact.employerAddress",
  "emergencyContact.occupation",
  "emergencyContact.jobType",
  "emergencyContact.employmentType",
  "emergencyContact.annualIncome",
  "emergencyContact.payday",
  "coOccupants.0.furigana",
  "coOccupants.0.name",
  "coOccupants.0.relationship",
  "coOccupants.0.birthDate",
  "coOccupants.0.phone",
  "coOccupants.0.employerName",
  "coOccupants.1.furigana",
  "coOccupants.1.name",
  "coOccupants.1.relationship",
  "coOccupants.1.birthDate",
  "coOccupants.1.phone",
  "coOccupants.1.employerName",
  "coOccupants.2.furigana",
  "coOccupants.2.name",
  "coOccupants.2.relationship",
  "coOccupants.2.birthDate",
  "coOccupants.2.phone",
  "coOccupants.2.employerName",
  "broker.companyName",
  "broker.address",
  "broker.phone",
  "broker.staffName",
  "management.companyName",
  "management.address",
  "management.phone",
  "management.staffName",
] as const;

const LEGACY_GUARANTEE_APPLICATION_PREVIEW_CASE_FIELD_KEYS = new Set<string>(GUARANTEE_APPLICATION_PREVIEW_CASE_FIELD_KEYS);

function getSubmittedGuaranteePreviewCaseFieldKeys(formData: FormData): string[] {
  const fieldKeys = new Set<string>();
  for (const key of formData.keys()) {
    if (!key.startsWith("field:")) continue;
    const fieldKey = key.slice("field:".length).trim();
    if (isKnownCaseFieldKey(fieldKey) || LEGACY_GUARANTEE_APPLICATION_PREVIEW_CASE_FIELD_KEYS.has(fieldKey)) fieldKeys.add(fieldKey);
  }
  return [...fieldKeys];
}

function isExtractionReviewStatus(value: string): value is ExtractionReviewStatus {
  return (
    value === "suggested" ||
    value === "accepted" ||
    value === "edited" ||
    value === "unknown" ||
    value === "rejected"
  );
}

function getExtractionFieldId(field: InputFileExtractionResult["fields"][number]) {
  return `${field.fieldKey}:${field.sourceCell ?? field.sourceRange ?? field.sourceSheet}`;
}

function buildCaseTitle(extraction: InputFileExtractionResult, fallbackTitle: string) {
  const propertyName = extraction.fields.find((field) => field.fieldKey === "property_name" || field.fieldKey === "property.name")?.normalizedValue;
  const applicantName = extraction.fields.find((field) => field.fieldKey === "applicant.name")?.normalizedValue;
  return [propertyName || applicantName, extraction.documentTypeLabel, extraction.sourceFilename || fallbackTitle]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" / ");
}

export async function saveCaseWorkbenchAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) throw new Error("担当ユーザーが見つかりません。");

  const caseId = String(formData.get("caseId") ?? "").trim();
  if (!caseId) throw new Error("案件IDが不正です。");
  const brokerageCase = await getBrokerageCaseById({ userId: user.id, caseId });
  if (!brokerageCase) throw new Error("案件が見つかりません。");
  const reviewItems = await listExtractionReviewItems({ userId: user.id, caseId });

  const nextConfirmedData: Record<string, unknown> = { ...brokerageCase.confirmedDataJson };
  const existingStatusMap =
    nextConfirmedData[WORKBENCH_FIELD_STATUS_KEY] && typeof nextConfirmedData[WORKBENCH_FIELD_STATUS_KEY] === "object"
      ? { ...(nextConfirmedData[WORKBENCH_FIELD_STATUS_KEY] as Record<string, string>) }
      : {};

  const fieldKeysToSave = getCaseWorkbenchFieldKeysFromForm(formData);
  const useCandidateFieldKey = String(formData.get("useCandidateField") ?? "").trim();
  const saveMode = String(formData.get("saveMode") ?? "").trim();
  const shouldBatchUseCandidates = saveMode === "confirm_visible_candidates" || saveMode === "confirm_trusted_candidates";
  fieldKeysToSave.forEach((fieldKey) => {
    const previousValue = getCaseFieldValue(brokerageCase.confirmedDataJson, fieldKey);
    let nextValue = String(formData.get(`field:${fieldKey}`) ?? "").trim();
    let decision = getCaseWorkbenchFieldDecision(formData, fieldKey);
    if (fieldKey === useCandidateFieldKey || shouldBatchUseCandidates) {
      const candidateValue = String(formData.get(`candidate:${fieldKey}`) ?? "").trim();
      if (candidateValue) {
        nextValue = candidateValue;
        decision = "confirmed";
      }
    }
    if (decision === "unknown" || decision === "rejected") {
      clearCaseFieldValueAliases(nextConfirmedData, fieldKey);
      existingStatusMap[fieldKey] = decision;
      return;
    }

    if (nextValue) {
      nextConfirmedData[fieldKey] = nextValue;
      if (nextValue !== previousValue) {
        existingStatusMap[fieldKey] = previousValue ? "edited" : "confirmed";
      } else if (existingStatusMap[fieldKey] === "unknown" || existingStatusMap[fieldKey] === "rejected" || !existingStatusMap[fieldKey]) {
        existingStatusMap[fieldKey] = "confirmed";
      }
    } else {
      clearCaseFieldValueAliases(nextConfirmedData, fieldKey);
      delete existingStatusMap[fieldKey];
    }
  });

  const postalCompletionResult = applyJapanesePostalCodeAddressCompletions({
    confirmedData: nextConfirmedData,
    statusMap: existingStatusMap,
  });

  nextConfirmedData[WORKBENCH_FIELD_STATUS_KEY] = existingStatusMap;
  const eventFieldKeys = [...new Set([...fieldKeysToSave, ...postalCompletionResult.completedFieldKeys])];
  const labelsByFieldKey = Object.fromEntries(eventFieldKeys.map((fieldKey) => [fieldKey, fieldKey]));
  const correctionEventDrafts = buildWorkbenchCorrectionEvents({
    caseId,
    trigger: "case_workbench_save",
    fieldKeys: eventFieldKeys,
    labelsByFieldKey,
    beforeData: brokerageCase.confirmedDataJson,
    afterData: nextConfirmedData,
    reviewItems,
  });

  const updatedCase = await updateBrokerageCaseConfirmedData({
    userId: user.id,
    caseId,
    confirmedDataJson: nextConfirmedData,
  });
  if (!updatedCase) throw new Error("案件の保存に失敗しました。");

  const correctionEvents = await addCorrectionEvents({
    userId: user.id,
    events: correctionEventDrafts,
  });

  await addAuditLog({
    userId: user.id,
    action: "case_workbench_saved",
    targetType: "import_job",
    targetId: caseId,
    message: `案件ワークベンチを保存しました: ${updatedCase.caseTitle}`,
    context: {
      caseId,
      confirmedFieldCount: Object.keys(nextConfirmedData).filter((key) => key !== WORKBENCH_FIELD_STATUS_KEY).length,
      postalCodeLookupCount: postalCompletionResult.lookupCount,
      postalCodeConflictCount: postalCompletionResult.conflictCount,
      correctionEventCount: correctionEvents.length,
      correctionEventIds: correctionEvents.map((event) => event.id),
    },
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/output-center");
  const returnAnchor = safeHashAnchor(formData.get("returnAnchor"));
  const guaranteeTemplate = safeQueryToken(formData.get("guaranteeTemplate"));
  const redirectParams = new URLSearchParams();
  if (guaranteeTemplate) redirectParams.set("guaranteeTemplate", guaranteeTemplate);
  redirectParams.set("flash", "case_workbench_saved");
  redirect(`/cases/${caseId}?${redirectParams.toString()}${returnAnchor ? `#${returnAnchor}` : ""}`);
}

export async function saveGuaranteeApplicationDraftAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) throw new Error("担当ユーザーが見つかりません。");

  const caseId = String(formData.get("caseId") ?? "").trim();
  if (!caseId) throw new Error("案件IDが不正です。");
  const templateId = String(formData.get("templateId") ?? FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID).trim() || FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID;
  const template = findGuaranteeCompanyTemplate(templateId);
  if (!template) throw new Error("保証会社テンプレートが見つかりません。");

  const brokerageCase = await getBrokerageCaseById({ userId: user.id, caseId });
  if (!brokerageCase) throw new Error("案件が見つかりません。");

  const draftDefinitions = getGuaranteeDraftFieldDefinitions(template.id);
  const fieldValuesJson: Record<string, unknown> = {};
  const fieldStatusesJson: Record<string, string> = {};
  draftDefinitions.forEach((definition) => {
    const value = String(formData.get(`draft:${definition.fieldKey}`) ?? "").trim();
    if (!value || value === "未確認" || value === "未定") return;
    fieldValuesJson[definition.fieldKey] = value;
    fieldStatusesJson[definition.fieldKey] = "confirmed";
  });

  const draftReadiness = buildGuaranteeDraftReadiness({
    id: "case-workbench",
    userId: user.id,
    caseId,
    templateId: template.id,
    companyCode: template.companyCode,
    status: "draft",
    fieldValuesJson,
    fieldStatusesJson,
    createdAt: new Date(),
    updatedAt: new Date(),
  }, template.id);

  const previousDraft = await getGuaranteeApplicationDraft({ userId: user.id, caseId, templateId: template.id });
  const draft = await saveGuaranteeApplicationDraft({
    userId: user.id,
    caseId,
    templateId: template.id,
    companyCode: template.companyCode,
    status: draftReadiness.status,
    fieldValuesJson,
    fieldStatusesJson,
    lastReviewedAt: new Date(),
  });
  const draftCorrectionEvents = await addCorrectionEvents({
    userId: user.id,
    events: buildGuaranteeDraftCorrectionEvents({
      caseId,
      templateId: template.id,
      fieldKeys: draftDefinitions.map((definition) => definition.fieldKey),
      labelsByFieldKey: Object.fromEntries(draftDefinitions.map((definition) => [definition.fieldKey, definition.label])),
      beforeData: previousDraft?.fieldValuesJson ?? {},
      afterData: fieldValuesJson,
    }),
  });

  await addAuditLog({
    userId: user.id,
    action: "guarantee_application_draft_saved",
    targetType: "import_job",
    targetId: caseId,
    message: `${template.companyDisplayName}会社別草稿を保存しました: ${brokerageCase.caseTitle}`,
    context: {
      caseId,
      draftId: draft.id,
      templateId: draft.templateId,
      companyCode: draft.companyCode,
      status: draft.status,
      savedFieldCount: Object.keys(fieldValuesJson).length,
      requiredMissingCount: draftReadiness.requiredMissingCount,
      correctionEventCount: draftCorrectionEvents.length,
      correctionEventIds: draftCorrectionEvents.map((event) => event.id),
    },
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/output-center");
  revalidatePath(`/guarantee-applications/${template.id}/preview`);
  redirect(
    `/cases/${encodeURIComponent(caseId)}?guaranteeTemplate=${encodeURIComponent(template.id)}&flash=guarantee_draft_saved#guarantee-template-drafts`,
  );
}

function countSubmittedCustomOverlayFieldItems(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.length : null;
  } catch {
    return null;
  }
}

export async function saveGuaranteeApplicationPreviewAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) throw new Error("担当ユーザーが見つかりません。");

  const caseId = String(formData.get("caseId") ?? "").trim();
  if (!caseId) throw new Error("案件IDが不正です。");
  const templateId = String(formData.get("templateId") ?? FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID).trim() || FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID;
  const template = findGuaranteeCompanyTemplate(templateId);
  if (!template) throw new Error("保証会社テンプレートが見つかりません。");

  const brokerageCase = await getBrokerageCaseById({ userId: user.id, caseId });
  if (!brokerageCase) throw new Error("案件が見つかりません。");
  const previousDraft = await getGuaranteeApplicationDraft({ userId: user.id, caseId, templateId: template.id });
  const previousLayoutOverrides = getFriendsGuaranteeEffectiveLayoutOverrides({
    templateId: template.id,
    confirmedDataJson: brokerageCase.confirmedDataJson,
  });
  const previousCustomOverlayFields = getFriendsGuaranteeCustomOverlayFields({
    templateId: template.id,
    confirmedDataJson: brokerageCase.confirmedDataJson,
  });

  const nextConfirmedData: Record<string, unknown> = { ...brokerageCase.confirmedDataJson };
  const existingStatusMap =
    nextConfirmedData[WORKBENCH_FIELD_STATUS_KEY] && typeof nextConfirmedData[WORKBENCH_FIELD_STATUS_KEY] === "object"
      ? { ...(nextConfirmedData[WORKBENCH_FIELD_STATUS_KEY] as Record<string, string>) }
      : {};

  const submittedPreviewCaseFieldKeys = getSubmittedGuaranteePreviewCaseFieldKeys(formData);
  submittedPreviewCaseFieldKeys.forEach((fieldKey) => {
    const previousValue = getCaseFieldValue(brokerageCase.confirmedDataJson, fieldKey);
    const nextValue = String(formData.get(`field:${fieldKey}`) ?? "").trim();
    if (nextValue) {
      nextConfirmedData[fieldKey] = nextValue;
      if (nextValue !== previousValue) {
        existingStatusMap[fieldKey] = previousValue ? "edited" : "confirmed";
      }
    } else {
      clearCaseFieldValueAliases(nextConfirmedData, fieldKey);
      delete existingStatusMap[fieldKey];
    }
  });
  const postalCompletionResult = applyJapanesePostalCodeAddressCompletions({
    confirmedData: nextConfirmedData,
    statusMap: existingStatusMap,
  });
  nextConfirmedData[WORKBENCH_FIELD_STATUS_KEY] = existingStatusMap;

  const layoutOverridesInput = formData.get("layoutOverrides");
  const layoutOverrides =
    typeof layoutOverridesInput === "string"
      ? sanitizeFriendsGuaranteeLayoutOverrides(layoutOverridesInput, template.id)
      : {};
  const deletedOverlayFieldsInput = formData.get("deletedOverlayFields");
  const deletedOverlayFieldKeys =
    typeof deletedOverlayFieldsInput === "string"
      ? sanitizeFriendsGuaranteeDeletedOverlayFieldKeys(deletedOverlayFieldsInput, template.id)
      : [];
  const layoutSaveScope = formData.get("layoutSaveScope") === "template" ? "template" : "case";
  const customFieldsInput = formData.get("customOverlayFields");
  const customFieldsSubmitted = typeof customFieldsInput === "string";
  const submittedCustomFieldCount = countSubmittedCustomOverlayFieldItems(customFieldsInput);
  const customOverlayFields = sanitizeFriendsGuaranteeCustomOverlayFields(customFieldsInput, template.id).map((field) => {
    const nextValue = String(formData.get(`field:${field.fieldKey}`) ?? field.value ?? "").trim();
    const override = layoutOverrides[field.fieldKey]?.box;
    return {
      ...field,
      value: field.sourceFieldKey ? "" : nextValue,
      box: override ?? field.box,
      maxWidth: Math.max(8, (override ?? field.box).width - 6),
    };
  });
  if (customFieldsSubmitted && submittedCustomFieldCount === null) {
    throw new Error("追加欄の保存データを読み取れませんでした。テンプレートは保存していません。");
  }
  if (
    customFieldsSubmitted &&
    typeof submittedCustomFieldCount === "number" &&
    customOverlayFields.length < submittedCustomFieldCount
  ) {
    throw new Error(
      `追加欄の一部が保存前の検証で失敗しました。テンプレートは保存していません。送信${submittedCustomFieldCount}件 / 保存可能${customOverlayFields.length}件。`,
    );
  }

  const nextCaseCustomOverlayFields = setFriendsGuaranteeCaseCustomOverlayFields({
    currentValue: nextConfirmedData[FRIENDS_GUARANTEE_CUSTOM_FIELDS_KEY],
    templateId: template.id,
    fields: layoutSaveScope === "template" ? [] : customOverlayFields,
  });
  if (Object.keys(nextCaseCustomOverlayFields).length > 0) {
    nextConfirmedData[FRIENDS_GUARANTEE_CUSTOM_FIELDS_KEY] = nextCaseCustomOverlayFields;
  } else {
    delete nextConfirmedData[FRIENDS_GUARANTEE_CUSTOM_FIELDS_KEY];
  }

  const pdfTemplateConfig = getGuaranteePdfTemplateConfig(template.id);
  const confirmedOverlayFieldKeys = new Set<string>();
  [...pdfTemplateConfig.overlayFields, ...customOverlayFields]
    .filter((field) => !deletedOverlayFieldKeys.includes(field.fieldKey))
    .forEach((field) => {
      const value = String(formData.get(`field:${field.fieldKey}`) ?? "").trim();
      if (!value) return;
      confirmedOverlayFieldKeys.add(field.fieldKey);
      if (field.sourceFieldKey) confirmedOverlayFieldKeys.add(field.sourceFieldKey);
    });
  const confirmedOverlayFieldsByTemplate = setGuaranteeConfirmedOverlayFieldKeys({
    currentValue: nextConfirmedData[GUARANTEE_CONFIRMED_OVERLAY_FIELDS_KEY],
    templateId: template.id,
    fieldKeys: confirmedOverlayFieldKeys,
  });
  if (Object.keys(confirmedOverlayFieldsByTemplate).length > 0) {
    nextConfirmedData[GUARANTEE_CONFIRMED_OVERLAY_FIELDS_KEY] = confirmedOverlayFieldsByTemplate;
  } else {
    delete nextConfirmedData[GUARANTEE_CONFIRMED_OVERLAY_FIELDS_KEY];
  }

  const layoutDirty = formData.get("layoutDirty") === "true";
  const layoutOverrideCount = Object.keys(layoutOverrides).length;
  if (typeof layoutOverridesInput === "string" && (layoutSaveScope === "template" || layoutDirty)) {
    if (layoutSaveScope === "template") {
      saveFriendsGuaranteeTemplateLayoutOverrides(layoutOverrides, template.id);
      saveFriendsGuaranteeTemplateDeletedOverlayFieldKeys(deletedOverlayFieldKeys, template.id);
      if (customFieldsSubmitted) {
        saveFriendsGuaranteeTemplateCustomOverlayFields(customOverlayFields, template.id);
      }
      delete nextConfirmedData[FRIENDS_GUARANTEE_LAYOUT_OVERRIDES_KEY];
      delete nextConfirmedData[FRIENDS_GUARANTEE_DELETED_OVERLAY_FIELDS_KEY];
      const nextLayoutVersions = setFriendsGuaranteeCaseLayoutOverrideVersion({
        currentValue: nextConfirmedData[FRIENDS_GUARANTEE_LAYOUT_OVERRIDE_VERSIONS_KEY],
        templateId: template.id,
        enabled: false,
      });
      if (Object.keys(nextLayoutVersions).length > 0) nextConfirmedData[FRIENDS_GUARANTEE_LAYOUT_OVERRIDE_VERSIONS_KEY] = nextLayoutVersions;
      else delete nextConfirmedData[FRIENDS_GUARANTEE_LAYOUT_OVERRIDE_VERSIONS_KEY];
    } else if (hasFriendsGuaranteeLayoutOverrides(layoutOverrides)) {
      nextConfirmedData[FRIENDS_GUARANTEE_LAYOUT_OVERRIDES_KEY] = layoutOverrides;
      const nextDeletedFields = setFriendsGuaranteeCaseDeletedOverlayFieldKeys({
        currentValue: nextConfirmedData[FRIENDS_GUARANTEE_DELETED_OVERLAY_FIELDS_KEY],
        templateId: template.id,
        fieldKeys: deletedOverlayFieldKeys,
      });
      if (Object.keys(nextDeletedFields).length > 0) nextConfirmedData[FRIENDS_GUARANTEE_DELETED_OVERLAY_FIELDS_KEY] = nextDeletedFields;
      else delete nextConfirmedData[FRIENDS_GUARANTEE_DELETED_OVERLAY_FIELDS_KEY];
      nextConfirmedData[FRIENDS_GUARANTEE_LAYOUT_OVERRIDE_VERSIONS_KEY] = setFriendsGuaranteeCaseLayoutOverrideVersion({
        currentValue: nextConfirmedData[FRIENDS_GUARANTEE_LAYOUT_OVERRIDE_VERSIONS_KEY],
        templateId: template.id,
        enabled: true,
      });
    } else if (deletedOverlayFieldKeys.length > 0) {
      delete nextConfirmedData[FRIENDS_GUARANTEE_LAYOUT_OVERRIDES_KEY];
      nextConfirmedData[FRIENDS_GUARANTEE_DELETED_OVERLAY_FIELDS_KEY] = setFriendsGuaranteeCaseDeletedOverlayFieldKeys({
        currentValue: nextConfirmedData[FRIENDS_GUARANTEE_DELETED_OVERLAY_FIELDS_KEY],
        templateId: template.id,
        fieldKeys: deletedOverlayFieldKeys,
      });
      nextConfirmedData[FRIENDS_GUARANTEE_LAYOUT_OVERRIDE_VERSIONS_KEY] = setFriendsGuaranteeCaseLayoutOverrideVersion({
        currentValue: nextConfirmedData[FRIENDS_GUARANTEE_LAYOUT_OVERRIDE_VERSIONS_KEY],
        templateId: template.id,
        enabled: true,
      });
    } else {
      delete nextConfirmedData[FRIENDS_GUARANTEE_LAYOUT_OVERRIDES_KEY];
      const nextDeletedFields = setFriendsGuaranteeCaseDeletedOverlayFieldKeys({
        currentValue: nextConfirmedData[FRIENDS_GUARANTEE_DELETED_OVERLAY_FIELDS_KEY],
        templateId: template.id,
        fieldKeys: [],
      });
      if (Object.keys(nextDeletedFields).length > 0) nextConfirmedData[FRIENDS_GUARANTEE_DELETED_OVERLAY_FIELDS_KEY] = nextDeletedFields;
      else delete nextConfirmedData[FRIENDS_GUARANTEE_DELETED_OVERLAY_FIELDS_KEY];
      const nextLayoutVersions = setFriendsGuaranteeCaseLayoutOverrideVersion({
        currentValue: nextConfirmedData[FRIENDS_GUARANTEE_LAYOUT_OVERRIDE_VERSIONS_KEY],
        templateId: template.id,
        enabled: false,
      });
      if (Object.keys(nextLayoutVersions).length > 0) nextConfirmedData[FRIENDS_GUARANTEE_LAYOUT_OVERRIDE_VERSIONS_KEY] = nextLayoutVersions;
      else delete nextConfirmedData[FRIENDS_GUARANTEE_LAYOUT_OVERRIDE_VERSIONS_KEY];
    }
  }

  await updateBrokerageCaseConfirmedData({
    userId: user.id,
    caseId,
    confirmedDataJson: nextConfirmedData,
  });

  const fieldValuesJson: Record<string, unknown> = {};
  const fieldStatusesJson: Record<string, string> = {};
  const draftDefinitions = getGuaranteeDraftFieldDefinitions(template.id);
  draftDefinitions.forEach((definition) => {
    const value = String(formData.get(`draft:${definition.fieldKey}`) ?? "").trim();
    if (!value || value === "未確認" || value === "未定") return;
    fieldValuesJson[definition.fieldKey] = value;
    fieldStatusesJson[definition.fieldKey] = "confirmed";
  });

  const draftReadiness = buildGuaranteeDraftReadiness({
    id: "preview",
    userId: user.id,
    caseId,
    templateId: template.id,
    companyCode: template.companyCode,
    status: "draft",
    fieldValuesJson,
    fieldStatusesJson,
    createdAt: new Date(),
    updatedAt: new Date(),
  }, template.id);
  const draft = await saveGuaranteeApplicationDraft({
    userId: user.id,
    caseId,
    templateId: template.id,
    companyCode: template.companyCode,
    status: draftReadiness.status,
    fieldValuesJson,
    fieldStatusesJson,
    lastReviewedAt: new Date(),
  });
  const readinessLabels = Object.fromEntries(
    buildGuaranteeApplicationReadiness({ brokerageCase, template, draft: previousDraft })
      .flatMap((group) => group.fields)
      .map((field) => [field.fieldKey, field.label]),
  );
  const overlayLabels = Object.fromEntries(
    [...pdfTemplateConfig.overlayFields, ...previousCustomOverlayFields, ...customOverlayFields].flatMap((field) => [
      [field.fieldKey, field.label],
      field.sourceFieldKey ? [field.sourceFieldKey, field.label] : [],
    ]).filter((entry): entry is [string, string] => entry.length === 2),
  );
  const draftLabels = Object.fromEntries(draftDefinitions.map((definition) => [definition.fieldKey, definition.label]));
  const previewCorrectionEvents = await addCorrectionEvents({
    userId: user.id,
    events: buildPdfPreviewCorrectionEvents({
      caseId,
      templateId: template.id,
      fieldKeys: [...submittedPreviewCaseFieldKeys, ...draftDefinitions.map((definition) => definition.fieldKey)],
      labelsByFieldKey: {
        ...readinessLabels,
        ...overlayLabels,
        ...draftLabels,
      },
      beforeData: {
        ...brokerageCase.confirmedDataJson,
        ...(previousDraft?.fieldValuesJson ?? {}),
      },
      afterData: {
        ...nextConfirmedData,
        ...fieldValuesJson,
      },
      layoutDirty,
      layoutSaveScope,
      previousLayoutOverrides,
      nextLayoutOverrides: layoutOverrides,
      previousCustomOverlayFields,
      nextCustomOverlayFields: customOverlayFields,
    }),
  });

  await addAuditLog({
    userId: user.id,
    action: "guarantee_application_preview_saved",
    targetType: "import_job",
    targetId: caseId,
    message: `${template.companyDisplayName}申込書プレビューを更新しました: ${brokerageCase.caseTitle}`,
    context: {
      caseId,
      draftId: draft.id,
      templateId: draft.templateId,
      completedDraftFieldCount: Object.keys(fieldValuesJson).length,
      editedPreviewFieldCount: submittedPreviewCaseFieldKeys.length,
      layoutOverrideCount,
      deletedOverlayFieldCount: deletedOverlayFieldKeys.length,
      layoutSaveScope,
      customOverlayFieldCount: customOverlayFields.length,
      postalCodeLookupCount: postalCompletionResult.lookupCount,
      postalCodeConflictCount: postalCompletionResult.conflictCount,
      correctionEventCount: previewCorrectionEvents.length,
      correctionEventIds: previewCorrectionEvents.map((event) => event.id),
    },
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/output-center");
  revalidatePath(`/guarantee-applications/${template.id}/preview`);
  redirect(
    `/guarantee-applications/${encodeURIComponent(template.id)}/preview?caseId=${encodeURIComponent(caseId)}&flash=${
      layoutSaveScope === "template" ? "template_layout_saved" : "preview_saved"
    }`,
  );
}

function parsePrice(val: unknown): number {
  if (typeof val === "number") return Math.round(val);
  if (typeof val === "string") {
    const cleaned = val.replace(/[¥,\s￥]/g, "");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : Math.round(n);
  }
  return 0;
}

export async function uploadAndParseExcelAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) throw new Error("担当ユーザーが見つかりません。");

  const file = formData.get("excelFile");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("ファイルが選択されていません。");
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new Error(".xlsx 形式のファイルのみ対応しています。.xls / .csv は対応外です。");
  }

  const buffer = await file.arrayBuffer();
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  } catch {
    throw new Error("ファイルの読み込みに失敗しました。正しい .xlsx ファイルか確認してください。");
  }

  const sourceFileHash = createHash("sha256").update(Buffer.from(buffer)).digest("hex");
  const inputExtraction = extractInputFileFromWorkbook(workbook, file.name, sourceFileHash);
  if (inputExtraction.extractionStatus === "recognized") {
    const payload: ExcelImportPayload = {
      kind: "input_file_extraction",
      headers: [],
      autoMapping: {},
      rows: [],
      originalFilename: file.name,
      totalRows: 0,
      inputExtraction,
    };

    const job = await addImportJob({
      userId: user.id,
      sourceType: "excel",
      targetEntity: "contracts",
      title: file.name,
      notes: JSON.stringify(payload),
      status: "mapped",
    });

    await addAuditLog({
      userId: user.id,
      action: "input_file_extraction_created",
      targetType: "import_job",
      targetId: job.id,
      message: `Excel 業務ファイル抽出プレビュー作成: ${file.name} (${inputExtraction.documentType})`,
      context: {
        documentType: inputExtraction.documentType,
        fieldCount: inputExtraction.fields.length,
      },
    });

    revalidatePath("/import-center");
    redirect(`/import-center?xlsxJob=${job.id}&flash=input_extraction_ready`);
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("シートが見つかりません。");

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (rawRows.length === 0) throw new Error("ファイルにデータがありません。");

  const headers = (rawRows[0] as unknown[]).map(String).filter((h) => h.trim() !== "");
  if (headers.length === 0) {
    const payload: ExcelImportPayload = {
      kind: "input_file_extraction",
      headers: [],
      autoMapping: {},
      rows: [],
      originalFilename: file.name,
      totalRows: 0,
      inputExtraction,
    };

    const job = await addImportJob({
      userId: user.id,
      sourceType: "excel",
      targetEntity: "properties",
      title: file.name,
      notes: JSON.stringify(payload),
      status: "mapped",
    });

    await addAuditLog({
      userId: user.id,
      action: "input_file_extraction_unknown",
      targetType: "import_job",
      targetId: job.id,
      message: `Excel 業務ファイル識別結果 unknown: ${file.name}`,
      context: { documentType: inputExtraction.documentType },
    });

    revalidatePath("/import-center");
    redirect(`/import-center?xlsxJob=${job.id}&flash=input_extraction_ready`);
  }

  const dataRows = (rawRows.slice(1) as unknown[][]).filter((row) =>
    row.some((cell) => String(cell).trim() !== ""),
  );
  const rowObjects: Record<string, unknown>[] = dataRows.map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? "";
    });
    return obj;
  });

  const autoMapping = suggestImportMapping("properties", headers);

  const payload: ExcelImportPayload = {
    kind: "property_row_import",
    headers,
    autoMapping,
    rows: rowObjects,
    originalFilename: file.name,
    totalRows: rowObjects.length,
    inputExtraction,
  };

  const job = await addImportJob({
    userId: user.id,
    sourceType: "excel",
    targetEntity: "properties",
    title: file.name,
    notes: JSON.stringify(payload),
  });

  await addAuditLog({
    userId: user.id,
    action: "import_job_created",
    targetType: "task",
    targetId: job.id,
    message: `Excel 物件取込ジョブ作成: ${file.name} (${rowObjects.length} 行)`,
  });

  revalidatePath("/import-center");
  redirect(`/import-center?xlsxJob=${job.id}`);
}

export async function uploadAndParseIdentityDocumentAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) throw new Error("担当ユーザーが見つかりません。");

  const file = formData.get("identityDocumentFile");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("本人確認資料ファイルが選択されていません。");
  }

  const lowerName = file.name.toLowerCase();
  const allowed =
    lowerName.endsWith(".pdf") ||
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    file.type === "application/pdf" ||
    file.type.startsWith("image/");
  if (!allowed) {
    throw new Error("在留カード・運転免許証のPDFまたは画像ファイルを選択してください。");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const inputExtraction = await extractIdentityDocumentFromBuffer({
    buffer,
    filename: file.name,
  });
  const payload: ExcelImportPayload = {
    kind: "input_file_extraction",
    headers: [],
    autoMapping: {},
    rows: [],
    originalFilename: file.name,
    totalRows: 0,
    inputExtraction,
  };

  const job = await addImportJob({
    userId: user.id,
    sourceType: "scan",
    targetEntity: "parties",
    title: file.name,
    notes: JSON.stringify(payload),
    status: "mapped",
  });

  await addAuditLog({
    userId: user.id,
    action: "identity_document_extraction_created",
    targetType: "import_job",
    targetId: job.id,
    message: `本人確認資料の抽出プレビュー作成: ${file.name} (${inputExtraction.documentType})`,
    context: {
      documentType: inputExtraction.documentType,
      fieldCount: inputExtraction.fields.length,
      extractionStatus: inputExtraction.extractionStatus,
    },
  });

  revalidatePath("/import-center");
  redirect(`/import-center?xlsxJob=${job.id}&flash=identity_extraction_ready`);
}

export async function saveExtractionReviewAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) throw new Error("担当ユーザーが見つかりません。");

  const jobId = String(formData.get("jobId") ?? "").trim();
  if (!jobId) throw new Error("ジョブIDが不正です。");

  const jobs = await listImportJobs(user.id, 200);
  const job = jobs.find((item) => item.id === jobId);
  if (!job?.notes) {
    throw new Error("抽出元ジョブが見つかりません。再度アップロードしてください。");
  }

  let payload: ExcelImportPayload;
  try {
    payload = JSON.parse(job.notes) as ExcelImportPayload;
  } catch {
    throw new Error("抽出元データの読み込みに失敗しました。再度アップロードしてください。");
  }

  if (payload.kind !== "input_file_extraction" || !payload.inputExtraction) {
    throw new Error("このジョブは業務ファイル抽出レビューとして保存できません。");
  }

  const rawDecisions = String(formData.get("reviewDecisionsJson") ?? "[]");
  let decisions: ExtractionReviewDecision[];
  try {
    const parsed = JSON.parse(rawDecisions) as ExtractionReviewDecision[];
    decisions = Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error("確認状態の読み込みに失敗しました。もう一度保存してください。");
  }

  const decisionByFieldId = new Map(
    decisions
      .filter((decision) => decision.fieldId && isExtractionReviewStatus(String(decision.reviewStatus)))
      .map((decision) => [decision.fieldId, decision]),
  );
  const confirmedDataJson: Record<string, unknown> = {};
  const reviewedAt = new Date();

  const reviewItems = payload.inputExtraction.fields.map((field) => {
    const decision = decisionByFieldId.get(getExtractionFieldId(field));
    const reviewStatus = decision?.reviewStatus ?? field.reviewStatus;
    const baseValue = field.normalizedValue || field.value;
    const materialized = materializeExtractionReviewValue({
      reviewStatus,
      editedValue: decision?.editedValue,
      baseValue,
    });
    if (materialized.shouldConfirm && materialized.finalValue) {
      confirmedDataJson[field.fieldKey] = materialized.finalValue;
      const canonicalFieldKey = canonicalizeCaseFieldKey(field.fieldKey);
      if (canonicalFieldKey !== field.fieldKey && !confirmedDataJson[canonicalFieldKey]) {
        confirmedDataJson[canonicalFieldKey] = materialized.finalValue;
      }
    }

    return {
      importJobId: job.id,
      fieldKey: field.fieldKey,
      label: field.label,
      extractedValue: field.value,
      normalizedValue: field.normalizedValue,
      editedValue: reviewStatus === "edited" ? materialized.editedValue : undefined,
      finalValue: materialized.finalValue,
      sourceSheet: field.sourceSheet,
      sourceCell: field.sourceCell,
      sourceRange: field.sourceRange,
      method: field.method,
      confidence: field.confidence,
      reviewStatus,
      sourceFileHash: field.sourceFileHash,
      templateVersion: field.templateVersion,
      reviewedById: user.id,
      reviewedAt,
    };
  });
  const postalCompletionResult = applyJapanesePostalCodeAddressCompletions({
    confirmedData: confirmedDataJson,
  });

  const mergeTargetCaseId = String(formData.get("mergeTargetCaseId") ?? "").trim();
  const mergeConfirmed = parseCheckbox(formData.get("mergeConfirm"));
  const existingCase = await getBrokerageCaseByImportJobId({
    userId: user.id,
    importJobId: job.id,
  });

  if (mergeTargetCaseId) {
    if (!mergeConfirmed) {
      throw new Error("案件に追加する前に、合併確認にチェックしてください。");
    }
    const targetCase = await getBrokerageCaseById({ userId: user.id, caseId: mergeTargetCaseId });
    if (!targetCase) throw new Error("合併先の案件が見つかりません。");
    if (targetCase.sourceImportJobIds.includes(job.id)) {
      throw new Error("この資料はすでに選択した案件に含まれています。");
    }

    const [candidate] = evaluateCaseMergeCandidates({
      incomingData: confirmedDataJson,
      cases: [targetCase],
      currentImportJobId: job.id,
    });
    if (!candidate || candidate.confidenceScore < CASE_MERGE_MIN_CONFIDENCE) {
      throw new Error("照合の確度が不足しているため、この案件へは合併できません。新規案件として保存してください。");
    }

    const mergedData = mergeConfirmedCaseData({
      existingData: targetCase.confirmedDataJson,
      incomingData: confirmedDataJson,
    });
    const historyItem = createCaseMergeHistoryItem({
      sourceImportJobId: job.id,
      sourceImportJobTitle: job.title,
      mergedById: user.id,
      confidenceScore: candidate.confidenceScore,
      matchReasons: candidate.matchReasons,
      conflictFields: mergedData.conflictFields,
      conflictDetails: mergedData.conflictDetails,
      addedFields: mergedData.addedFields,
      preservedFields: mergedData.preservedFields,
      beforeConfirmedDataJson: targetCase.confirmedDataJson,
      beforeSourceImportJobIds: targetCase.sourceImportJobIds,
      incomingConfirmedDataJson: confirmedDataJson,
    });
    const nextConfirmedDataJson = setCaseMergeHistory(mergedData.nextData, [
      ...getCaseMergeHistory(targetCase.confirmedDataJson),
      historyItem,
    ]);
    const brokerageCase = await mergeBrokerageCaseExtractionReview({
      userId: user.id,
      caseId: targetCase.id,
      confirmedDataJson: nextConfirmedDataJson,
      sourceImportJobIds: [...targetCase.sourceImportJobIds, job.id],
      replaceImportJobIds: [job.id],
      reviewItems,
    });
    if (!brokerageCase) throw new Error("案件の合併保存に失敗しました。");
    const correctionEvents = await addCorrectionEvents({
      userId: user.id,
      events: buildExtractionReviewCorrectionEvents({
        caseId: brokerageCase.id,
        reviewItems,
      }),
    });

    await addAuditLog({
      userId: user.id,
      action: "case_source_merged",
      targetType: "import_job",
      targetId: job.id,
      message: `抽出レビューを既存案件へ追加しました: ${brokerageCase.caseTitle}`,
      context: {
        caseId: brokerageCase.id,
        mergeId: historyItem.id,
        confidenceScore: candidate.confidenceScore,
        addedFieldCount: mergedData.addedFields.length,
        conflictFieldCount: mergedData.conflictFields.length,
        correctionEventCount: correctionEvents.length,
        correctionEventIds: correctionEvents.map((event) => event.id),
      },
    });

    revalidatePath("/import-center");
    revalidatePath("/cases");
    revalidatePath(`/cases/${brokerageCase.id}`);
    redirect(`/cases/${brokerageCase.id}?flash=case_source_merged`);
  }

  let brokerageCase;
  if (existingCase && existingCase.sourceImportJobIds.length > 1) {
    const mergedData = mergeConfirmedCaseData({
      existingData: existingCase.confirmedDataJson,
      incomingData: confirmedDataJson,
    });
    const nextConfirmedDataJson = setCaseMergeHistory(
      mergedData.nextData,
      getCaseMergeHistory(existingCase.confirmedDataJson),
    );
    brokerageCase = await mergeBrokerageCaseExtractionReview({
      userId: user.id,
      caseId: existingCase.id,
      confirmedDataJson: nextConfirmedDataJson,
      sourceImportJobIds: existingCase.sourceImportJobIds,
      replaceImportJobIds: [job.id],
      reviewItems,
    });
    if (!brokerageCase) throw new Error("案件の保存に失敗しました。");
  } else {
    brokerageCase = await saveBrokerageCaseExtractionReview({
      userId: user.id,
      caseId: existingCase?.id,
      caseType: "unit_sale",
      caseTitle: buildCaseTitle(payload.inputExtraction, job.title),
      status: "reviewed",
      confirmedDataJson,
      sourceImportJobIds: [job.id],
      reviewItems,
    });
  }
  const correctionEvents = await addCorrectionEvents({
    userId: user.id,
    events: buildExtractionReviewCorrectionEvents({
      caseId: brokerageCase.id,
      reviewItems,
    }),
  });

  await addAuditLog({
    userId: user.id,
    action: "extraction_review_saved",
    targetType: "import_job",
    targetId: job.id,
    message: `抽出レビューを案件へ保存しました: ${brokerageCase.caseTitle}`,
    context: {
      caseId: brokerageCase.id,
      confirmedFieldCount: Object.keys(confirmedDataJson).length,
      reviewItemCount: reviewItems.length,
      correctionEventCount: correctionEvents.length,
      correctionEventIds: correctionEvents.map((event) => event.id),
      postalCodeLookupCount: postalCompletionResult.lookupCount,
      postalCodeConflictCount: postalCompletionResult.conflictCount,
    },
  });

  revalidatePath("/import-center");
  revalidatePath("/cases");
  revalidatePath(`/cases/${brokerageCase.id}`);
  redirect(`/cases/${brokerageCase.id}?flash=extraction_review_saved`);
}

function toReviewInput(item: ExtractionReviewItem): Omit<ExtractionReviewItem, "id" | "userId" | "caseId" | "createdAt"> {
  return {
    importJobId: item.importJobId,
    fieldKey: item.fieldKey,
    label: item.label,
    extractedValue: item.extractedValue,
    normalizedValue: item.normalizedValue,
    editedValue: item.editedValue,
    finalValue: item.finalValue,
    sourceSheet: item.sourceSheet,
    sourceCell: item.sourceCell,
    sourceRange: item.sourceRange,
    method: item.method,
    confidence: item.confidence,
    reviewStatus: item.reviewStatus,
    sourceFileHash: item.sourceFileHash,
    templateVersion: item.templateVersion,
    reviewedById: item.reviewedById,
    reviewedAt: item.reviewedAt,
  };
}

export async function rollbackCaseMergeAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) throw new Error("担当ユーザーが見つかりません。");

  const caseId = String(formData.get("caseId") ?? "").trim();
  const mergeId = String(formData.get("mergeId") ?? "").trim();
  if (!caseId || !mergeId) throw new Error("分離対象の案件が不正です。");
  if (!parseCheckbox(formData.get("rollbackConfirm"))) {
    throw new Error("分離して戻す前に確認チェックを入れてください。");
  }

  const brokerageCase = await getBrokerageCaseById({ userId: user.id, caseId });
  if (!brokerageCase) throw new Error("案件が見つかりません。");

  const latestMerge = getLatestActiveCaseMerge(brokerageCase.confirmedDataJson);
  if (!latestMerge || latestMerge.id !== mergeId) {
    throw new Error("安全のため、分離できるのは最新の有効な合併だけです。");
  }

  const splitCaseId = `case_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const restoredConfirmedDataJson = markCaseMergeRolledBack({
    baseData: setCaseMergeHistory(
      latestMerge.beforeConfirmedDataJson,
      getCaseMergeHistory(brokerageCase.confirmedDataJson),
    ),
    mergeId: latestMerge.id,
    splitCaseId,
  });
  const reviewItems = await listExtractionReviewItems({ userId: user.id, caseId: brokerageCase.id });
  const splitReviewItems = reviewItems
    .filter((item) => item.importJobId === latestMerge.sourceImportJobId)
    .map(toReviewInput);

  const result = await rollbackBrokerageCaseMerge({
    userId: user.id,
    caseId: brokerageCase.id,
    restoredConfirmedDataJson,
    restoredSourceImportJobIds: latestMerge.beforeSourceImportJobIds,
    splitCaseId,
    splitCaseTitle: `${latestMerge.sourceImportJobTitle} / 分離案件`,
    splitConfirmedDataJson: latestMerge.incomingConfirmedDataJson,
    splitSourceImportJobIds: [latestMerge.sourceImportJobId],
    splitReviewItems,
    removeImportJobIds: [latestMerge.sourceImportJobId],
  });
  if (!result) throw new Error("案件の分離に失敗しました。");

  await addAuditLog({
    userId: user.id,
    action: "case_merge_rolled_back",
    targetType: "import_job",
    targetId: latestMerge.sourceImportJobId,
    message: `案件合併を分離して戻しました: ${result.restoredCase.caseTitle}`,
    context: {
      caseId: result.restoredCase.id,
      splitCaseId: result.splitCase.id,
      mergeId: latestMerge.id,
    },
  });

  revalidatePath("/import-center");
  revalidatePath(`/cases/${result.restoredCase.id}`);
  revalidatePath(`/cases/${result.splitCase.id}`);
  redirect(`/cases/${result.restoredCase.id}?flash=case_merge_rolled_back`);
}

export async function executePropertyImportAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) throw new Error("担当ユーザーが見つかりません。");
  const locale = await getLocale();

  const jobId = String(formData.get("jobId") ?? "").trim();
  if (!jobId) throw new Error("ジョブIDが不正です。");

  const jobs = await listImportJobs(user.id, 200);
  const job = jobs.find((j) => j.id === jobId);
  if (!job?.notes) throw new Error("取込ジョブが見つかりません。再度アップロードしてください。");

  let payload: ExcelImportPayload;
  try {
    payload = JSON.parse(job.notes) as ExcelImportPayload;
  } catch {
    throw new Error("取込データの読み込みに失敗しました。再度アップロードしてください。");
  }
  if (payload.kind === "input_file_extraction") {
    throw new Error("このジョブは業務ファイル抽出プレビューです。物件台帳への一括取込は実行できません。");
  }

  const sourceCols = formData.getAll("sourceCol") as string[];
  const targetFields = formData.getAll("targetField") as string[];
  const mapping: Record<string, string> = {};
  sourceCols.forEach((src, i) => {
    if (targetFields[i] && targetFields[i] !== "") mapping[src] = targetFields[i];
  });

  await updateImportJobMapping({
    userId: user.id,
    jobId: job.id,
    mappingJson: mapping,
    validationMessage: tr(locale, {
      ja: "マッピング適用済み。取込処理を開始します。",
      zh: "映射已应用，开始执行导入。",
      ko: "매핑을 적용했고 가져오기를 시작합니다.",
    }),
    status: "mapped",
  });

  let successCount = 0;
  const skipped: { row: number; code: "import_row_missing_name" | "import_row_invalid_listing_price" | "import_row_unknown_error"; reason: string }[] = [];

  for (let i = 0; i < payload.rows.length; i++) {
    const row = payload.rows[i];
    const mapped: Record<string, unknown> = {};
    for (const [srcCol, targetField] of Object.entries(mapping)) {
      mapped[targetField] = row[srcCol];
    }

    const name = String(mapped["name"] ?? "").trim();
    if (!name) {
      skipped.push({ row: i + 2, code: "import_row_missing_name", reason: "name（物件名）が空です" });
      continue;
    }

    const listingPrice = parsePrice(mapped["listing_price"]);
    if (listingPrice <= 0) {
      skipped.push({
        row: i + 2,
        code: "import_row_invalid_listing_price",
        reason: `listing_price を数値に変換できません: "${String(mapped["listing_price"] ?? "")}"`,
      });
      continue;
    }

    const managementFeeRaw = parsePrice(mapped["management_fee"]);
    const repairFeeRaw = parsePrice(mapped["repair_fee"]);

    try {
      await addProperty({
        name,
        area: String(mapped["area"] ?? "").trim() || undefined,
        address: String(mapped["address"] ?? "").trim() || undefined,
        listingPrice,
        managementFee: managementFeeRaw > 0 ? managementFeeRaw : undefined,
        repairFee: repairFeeRaw > 0 ? repairFeeRaw : undefined,
        notes: String(mapped["notes"] ?? "").trim() || undefined,
      });
      successCount++;
    } catch (e) {
      skipped.push({
        row: i + 2,
        code: "import_row_unknown_error",
        reason: `エラー: ${e instanceof Error ? e.message : "不明"}`,
      });
    }
  }

  const nextStatus = successCount > 0 ? "completed" : "mapped";
  const skippedByCode = skipped.reduce<Record<string, number>>((acc, item) => {
    acc[item.code] = (acc[item.code] ?? 0) + 1;
    return acc;
  }, {});
  const executionIssues: ImportValidationIssue[] = [];
  if (successCount === 0) {
    executionIssues.push(
      createImportValidationIssue({
        code: "import_zero_success",
        level: "critical",
        action: "retry",
        message:
          locale === "zh"
            ? "导入成功数为 0，请修复映射或源数据后重试。"
            : locale === "ko"
              ? "가져오기 성공 건수가 0건입니다. 매핑 또는 원본 데이터를 수정 후 재시도하세요."
              : "取込成功件数が 0 件です。マッピングまたは元データを修正して再試行してください。",
      })
    );
  }
  if ((skippedByCode.import_row_missing_name ?? 0) > 0) {
    executionIssues.push(
      createImportValidationIssue({
        code: "import_row_missing_name",
        level: "warning",
        action: "resolve_now",
        message:
          locale === "zh"
            ? "存在物件名为空的行。"
            : locale === "ko"
              ? "매물명이 비어 있는 행이 있습니다."
              : "物件名が空の行があります。",
        count: skippedByCode.import_row_missing_name,
      })
    );
  }
  if ((skippedByCode.import_row_invalid_listing_price ?? 0) > 0) {
    executionIssues.push(
      createImportValidationIssue({
        code: "import_row_invalid_listing_price",
        level: "warning",
        action: "auto_fix",
        message:
          locale === "zh"
            ? "存在价格字段无法转换为数字的行。"
            : locale === "ko"
              ? "가격 필드를 숫자로 변환할 수 없는 행이 있습니다."
              : "価格フィールドを数値化できない行があります。",
        count: skippedByCode.import_row_invalid_listing_price,
      })
    );
  }
  if ((skippedByCode.import_row_unknown_error ?? 0) > 0) {
    executionIssues.push(
      createImportValidationIssue({
        code: "import_row_unknown_error",
        level: "warning",
        action: "resolve_now",
        message:
          locale === "zh"
            ? "部分行导入失败，请查看错误详情。"
            : locale === "ko"
              ? "일부 행 가져오기에 실패했습니다. 상세 오류를 확인해 주세요."
              : "一部行の取込に失敗しました。詳細エラーを確認してください。",
        count: skippedByCode.import_row_unknown_error,
      })
    );
  }
  if (successCount > 0 && skipped.length > 0) {
    executionIssues.push(
      createImportValidationIssue({
        code: "import_partial_completed",
        level: "info",
        action: "apply_mapping",
        message:
          locale === "zh"
            ? "导入已完成，但有部分行被跳过。"
            : locale === "ko"
              ? "가져오기는 완료되었지만 일부 행이 건너뛰어졌습니다."
              : "取込は完了しましたが、一部行はスキップされました。",
      })
    );
  }
  if (successCount > 0 && skipped.length === 0) {
    executionIssues.push(
      createImportValidationIssue({
        code: "import_completed",
        level: "info",
        action: "apply_mapping",
        message:
          locale === "zh"
            ? "导入已完成，全部记录通过。"
            : locale === "ko"
              ? "가져오기가 완료되었고 모든 레코드가 정상 반영되었습니다."
              : "取込が完了し、全レコードが正常反映されました。",
      })
    );
  }
  const validationMessage = buildImportValidationMessage({
    source: "import_execution",
    summary:
      locale === "zh"
        ? `导入完成：成功 ${successCount} 条，跳过 ${skipped.length} 条`
        : locale === "ko"
          ? `가져오기 완료: 성공 ${successCount}건, 건너뜀 ${skipped.length}건`
          : `取込完了: 成功 ${successCount} 件、スキップ ${skipped.length} 件`,
    issues: executionIssues,
    metrics: {
      successCount,
      skippedCount: skipped.length,
    },
    details: {
      skippedRows: skipped,
    },
  });
  await updateImportJobMapping({
    userId: user.id,
    jobId: job.id,
    mappingJson: mapping,
    validationMessage,
    notes:
      successCount > 0
        ? undefined
        : tr(locale, {
            ja: "取込件数が0件のため、再試行が必要です。",
            zh: "成功导入为0，请修复后重试。",
            ko: "가져오기 성공 건수가 0건이므로 수정 후 재시도해야 합니다.",
          }),
    status: nextStatus,
  });

  await addAuditLog({
    userId: user.id,
    action: successCount > 0 ? "import_job_completed" : "import_job_requires_retry",
    targetType: "import_job",
    targetId: job.id,
    message: `Excel 物件取込: ${successCount} 件登録、${skipped.length} 件スキップ`,
    context: {
      successCount,
      skippedCount: skipped.length,
      status: nextStatus,
    },
  });

  revalidatePath("/properties");
  revalidatePath("/import-center");
  redirect(withFlash(`/import-center?xlsxJob=${job.id}`, "excel_imported"));
}
