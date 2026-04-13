"use server";

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
  getClientById,
  getClientDetail,
  getDefaultUser,
  getOutputTemplateSettings,
  getQuotationById,
  listClients,
  listImportJobs,
  listOutputTemplateVersions,
  rescheduleTask,
  resolveComplianceAlert,
  setClientStageWithLog,
  setClientStage,
  updateImportJobMapping,
  updateOutputTemplateSettings,
  updateTaskStatus,
  updateClient,
  updateQuotationStatus,
} from "@/lib/data";
import {
  getAttachmentStorageMode,
  isValidStoragePath,
  persistAttachmentToLocalPublic,
} from "@/lib/attachment-storage";
import { type ComplianceAlertType } from "@/lib/compliance-alerts";
import { buildMappingFromLists, parseCommaList, suggestImportMapping, validateImportMapping } from "@/lib/import-mapping";
import { listHubContracts } from "@/lib/hub";
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

function safeReturnTo(value: FormDataEntryValue | null, fallback: string): string {
  const path = String(value ?? "").trim();
  if (!path.startsWith("/")) return fallback;
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
  const unknownPrefix = tr(locale, {
    ja: "未知項目",
    zh: "未知字段",
    ko: "알 수 없는 필드",
  });
  const unknownDelimiter = locale === "ko" ? ", " : "、";
  const message =
    validation.unknownTargets.length > 0
      ? `${validation.summary} (${unknownPrefix}: ${validation.unknownTargets.join(unknownDelimiter)})`
      : validation.summary;

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
  const autoPrefix = tr(locale, {
    ja: "自動候補",
    zh: "自动候选",
    ko: "자동 후보",
  });
  const unknownPrefix = tr(locale, {
    ja: "未知項目",
    zh: "未知字段",
    ko: "알 수 없는 필드",
  });
  const unknownDelimiter = locale === "ko" ? ", " : "、";
  const message =
    validation.unknownTargets.length > 0
      ? `${autoPrefix}: ${validation.summary} (${unknownPrefix}: ${validation.unknownTargets.join(unknownDelimiter)})`
      : `${autoPrefix}: ${validation.summary}`;

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
  const nextMessage = tr(locale, {
    ja: `検証対応済み: ${operationLabel}`,
    zh: `校验已处理：${operationLabel}`,
    ko: `검증 조치 완료: ${operationLabel}`,
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
  if (!quoteId) {
    throw new Error("提案IDは必須です。");
  }
  if (!isOutputDocType(typeRaw)) {
    throw new Error("帳票種別が不正です。");
  }

  const outputFormat = String(formData.get("outputFormat") ?? "pdf").trim().toLowerCase();
  const language = String(formData.get("language") ?? locale).trim().toLowerCase();
  const targetProperty = String(formData.get("targetProperty") ?? "").trim();
  const targetParty = String(formData.get("targetParty") ?? "").trim();
  const returnTo = safeReturnTo(
    formData.get("returnTo"),
    `/output-center?type=${encodeURIComponent(typeRaw)}&format=${encodeURIComponent(outputFormat)}&lang=${encodeURIComponent(language)}&quoteId=${encodeURIComponent(quoteId)}&historyType=all&historyLang=all&historyFormat=all`
  );
  const quote = await getQuotationById(quoteId);
  if (!quote) {
    throw new Error("提案データが見つかりません。");
  }
  const [templateSettings, templateVersions] = await Promise.all([
    getOutputTemplateSettings(user.id),
    listOutputTemplateVersions(user.id, 20),
  ]);
  const activeTemplateVersion = templateVersions.find((item) => item.isActive) ?? templateVersions[0];
  const issuedAt = new Date();
  const documentNumber = createDocumentNumber(quote.id, typeRaw, issuedAt);

  const safeLanguage: Locale = language === "zh" || language === "ko" || language === "ja" ? language : locale;
  const safeFormat = outputFormat === "docx" ? "docx" : "pdf";

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
    quoteId: quote.id,
    propertyId: targetProperty || undefined,
    partyId: targetParty || undefined,
    outputType: typeRaw,
    outputFormat: safeFormat,
    language: safeLanguage,
    title,
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
  if (!versionId) {
    throw new Error("適用対象バージョンが未指定です。");
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

// ─── Excel 物件一括取込 ────────────────────────────────────────────

type ExcelImportPayload = {
  headers: string[];
  autoMapping: Record<string, string>;
  rows: Record<string, unknown>[];
  originalFilename: string;
  totalRows: number;
};

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

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("シートが見つかりません。");

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (rawRows.length === 0) throw new Error("ファイルにデータがありません。");

  const headers = (rawRows[0] as unknown[]).map(String).filter((h) => h.trim() !== "");
  if (headers.length === 0) throw new Error("表頭行が空です。A1 から列名が入力されているか確認してください。");

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
    headers,
    autoMapping,
    rows: rowObjects,
    originalFilename: file.name,
    totalRows: rowObjects.length,
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

export async function executePropertyImportAction(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) throw new Error("担当ユーザーが見つかりません。");

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

  const sourceCols = formData.getAll("sourceCol") as string[];
  const targetFields = formData.getAll("targetField") as string[];
  const mapping: Record<string, string> = {};
  sourceCols.forEach((src, i) => {
    if (targetFields[i] && targetFields[i] !== "") mapping[src] = targetFields[i];
  });

  let successCount = 0;
  const skipped: { row: number; reason: string }[] = [];

  for (let i = 0; i < payload.rows.length; i++) {
    const row = payload.rows[i];
    const mapped: Record<string, unknown> = {};
    for (const [srcCol, targetField] of Object.entries(mapping)) {
      mapped[targetField] = row[srcCol];
    }

    const name = String(mapped["name"] ?? "").trim();
    if (!name) {
      skipped.push({ row: i + 2, reason: "name（物件名）が空です" });
      continue;
    }

    const listingPrice = parsePrice(mapped["listing_price"]);
    if (listingPrice <= 0) {
      skipped.push({ row: i + 2, reason: `listing_price を数値に変換できません: "${String(mapped["listing_price"] ?? "")}"` });
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
      skipped.push({ row: i + 2, reason: `エラー: ${e instanceof Error ? e.message : "不明"}` });
    }
  }

  await updateImportJobMapping({
    userId: user.id,
    jobId: job.id,
    mappingJson: mapping,
    validationMessage: JSON.stringify({ successCount, skipped }),
    status: "completed",
  });

  await addAuditLog({
    userId: user.id,
    action: "import_job_created",
    targetType: "task",
    targetId: job.id,
    message: `Excel 物件取込完了: ${successCount} 件登録、${skipped.length} 件スキップ`,
  });

  revalidatePath("/properties");
  revalidatePath("/import-center");
  redirect(withFlash(`/import-center?xlsxJob=${job.id}`, "excel_imported"));
}
