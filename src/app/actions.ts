"use server";

import { randomUUID } from "crypto";
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
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { cookies } from "next/headers";
import {
  addAttachment,
  addGuaranteeBlankFormVersion,
  addGuaranteeCompanyMaskVersion,
  addPrivateAttachment,
  deletePrivateAttachmentForTenant,
  linkAttachmentToObject,
  addCorrectionEvents,
  addAuditLog,
  addClient,
  addProperty,
  addImportJob,
  addTask,
  createTenantAccount,
  createTenantAccountForUser,
  createGuaranteeBlankForm,
  createGuaranteeCompanyMask,
  acceptTenantInvitation,
  getDefaultUser,
  applyOutputTemplateVersion,
  addQuotation,
  createOutputTemplateVersion,
  publishGuaranteeTemplateLayoutVersion,
  installGuaranteeTemplateForTenant,
  getTenantMemberById,
  appendFollowUp,
  createComplianceTaskFromAlert,
  duplicateQuotation,
  getBrokerageCaseByImportJobId,
  getClientById,
  getClientDetail,
  getGuaranteeApplicationDraft,
  getOutputTemplateSettings,
  getQuotationById,
  listClients,
  listCaseWorkbenchFieldRules,
  listExtractionReviewItems,
  listImportJobs,
  listGuaranteeCompanyMaskVersions,
  listTenantMembers,
  mergeBrokerageCaseExtractionReview,
  rollbackBrokerageCaseMerge,
  rescheduleTask,
  resolveComplianceAlert,
  resolveClientVisibilityForContext,
  resolvePropertyVisibilityForContext,
  resolveCaseVisibilityForContext,
  saveBrokerageCaseExtractionReview,
  saveGuaranteeApplicationDraft,
  setRecordLifecycleWithAudit,
  setClientStageWithLog,
  setClientStage,
  updateImportJobMapping,
  updateAiExperienceDraftStatus,
  updateTenantMemberRole,
  updateTenantMemberStatus,
  updateTenantAccountLifecycle,
  updateTenantMemberInvitation,
  refreshTenantMemberInvitation,
  inviteTenantMember,
  updateCaseWorkbenchFieldRules,
  updateOutputTemplateSettings,
  updateProperty,
  updateTaskStatus,
  updateClient,
  updateBrokerageCaseConfirmedData,
  updateQuotationStatus,
  type ExtractionReviewItem,
  type ExtractionReviewStatus,
  type AiExperienceDraftStatus,
  type TenantAccountType,
  type TenantStatus,
  tenantRoleForCapabilityPreset,
  type TenantCapabilityPreset,
} from "@/lib/data";
import {
  getAttachmentStorageMode,
  getPostgresPrivateAttachmentLimitBytes,
  isValidStoragePath,
  persistAttachmentToLocalPrivate,
} from "@/lib/attachment-storage";
import {
  assertProductionAttachmentStorageReady,
  assertProductionDocumentReaderReady,
  assertProductionImportWorkerReady,
  isProductionRuntime,
} from "@/lib/production-readiness";
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
import { assertTenantPermission, requireTenantSession, type TenantSession } from "@/lib/tenant-session";
import { createRequestContext } from "@/lib/visibility-resolver";
import { ACTIVE_TENANT_COOKIE_NAME } from "@/lib/tenant-permissions";
import { requirePlatformOwnerSession } from "@/lib/platform-session";
import { isLifecycleStatus, type LifecycleStatus } from "@/lib/record-lifecycle";
import { FORBIDDEN_RECORD_INPUT_FIELDS } from "@/lib/record-input-guard";
import { deriveTenantServiceState, isTenantServiceOperational, validateTenantServicePeriod } from "@/lib/tenant-service";

async function rejectForbiddenRecordInput(
  formData: FormData,
  session: Awaited<ReturnType<typeof requireTenantSession>>,
  targetType: "case" | "client" | "property",
  targetId?: string,
) {
  const submittedFields = FORBIDDEN_RECORD_INPUT_FIELDS.filter((field) => formData.has(field));
  if (submittedFields.length === 0) return;

  await addAuditLog({
    tenantId: session.tenant.id,
    userId: session.user.id,
    action: "security_record_field_rejected",
    targetType,
    targetId,
    message: "请求包含不可由普通资料接口提交的归属字段。",
    context: { fields: submittedFields },
  });
  throw new Error("请求包含不可修改的资料归属字段。");
}

async function requireWritableCase(session: TenantSession, caseId: string) {
  const context = createRequestContext(session);
  const result = await resolveCaseVisibilityForContext({ context, caseId });
  if (!result.record || !result.resolution.canWrite) {
    throw new Error("案件が見つかりません。");
  }
  await assertCaseSourcesReadable(context, result.record);
  return result.record;
}
import type { InputFileExtractionResult } from "@/lib/input-file-extractor";
import { queueExcelImportSource } from "@/lib/excel-import-queue";
import { queueIdentityImportSources } from "@/lib/identity-import-queue";
import { createClerkInvitationForTenantMember } from "@/lib/clerk-invitations";
import { assertCaseSourcesReadable } from "@/lib/w93-access";
import { getVerifiedClerkAuthIdentity } from "@/lib/clerk-auth";
import { isClerkAuthEnabled } from "@/lib/auth-mode";
import { CASE_FIELD_KEYS, getCaseFieldDefinition, isKnownCaseFieldKey } from "@/lib/case-field-catalog";
import {
  CASE_WORKBENCH_FIELD_KEYS,
  buildCaseWorkbenchRuleMap,
  isCaseWorkbenchFieldKey,
  normalizeCaseFieldRequirement,
} from "@/lib/case-workbench-field-rules";
import { canonicalizeCaseFieldKey, clearCaseFieldValueAliases, getCaseFieldValue } from "@/lib/case-field-normalization";
import {
  parseCaseApplicabilitySettings,
  readCaseApplicabilitySettings,
  writeCaseApplicabilitySettings,
} from "@/lib/case-field-applicability";
import { getCaseWorkbenchProgressSnapshot } from "@/lib/case-workbench-progress";
import { applyJapanesePostalCodeAddressCompletions, isValidJapanesePostalCode } from "@/lib/japan-postal-code";
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
  setFriendsGuaranteeCaseDeletedOverlayFieldKeys,
  setFriendsGuaranteeCaseCustomOverlayFields,
  setFriendsGuaranteeCaseLayoutOverrideVersion,
  setGuaranteeConfirmedOverlayFieldKeys,
  sanitizeFriendsGuaranteeCustomOverlayFields,
  sanitizeFriendsGuaranteeDeletedOverlayFieldKeys,
  sanitizeFriendsGuaranteeLayoutOverrides,
} from "@/lib/friends-guarantee-pdf";
import { resolveGuaranteeTemplateLayout } from "@/lib/guarantee-template-layout-runtime";
import { buildOfficialTemplateCompanyCopy } from "@/lib/official-template-company-copy";
import { isGuaranteeSlice1EnabledForTenant } from "@/lib/guarantee-slice1-gate";
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
import { getDefaultOutputTemplateSettings } from "@/lib/output-doc";
import { type TenantRole } from "@/lib/tenant-permissions";
import {
  isObjectAttachmentCategory,
  isObjectAttachmentTargetType,
  linkImportJobAttachmentsToObject,
} from "@/lib/object-attachments";
import {
  getPrimaryPartyId,
  normalizeCaseAssociationDraft,
  validateCaseAssociationDraft,
  writeCaseAssociationData,
  type CaseAssociationDraft,
} from "@/lib/case-associations";
import {
  buildPartyProfileNotes,
  inferPurposeFromPartyRole,
  isPartyProfileRole,
  isPartyProfileType,
  mergePartyProfileMetadataNotes,
  normalizePartyReturnTo,
  type PartyProfileRole,
  type PartyProfileType,
} from "@/lib/party-profile";

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

function parseTenantCapabilityPreset(value: FormDataEntryValue | null): TenantCapabilityPreset {
  const preset = String(value ?? "").trim();
  if (preset === "company_owner" || preset === "company_form_admin" || preset === "ordinary_member") return preset;
  throw new Error("成员能力设置不正确。");
}

function parseTenantAccountType(value: FormDataEntryValue | null): TenantAccountType {
  const accountType = String(value ?? "").trim();
  if (accountType === "individual" || accountType === "company") return accountType;
  throw new Error("アカウント種別が不正です。");
}

function parseTenantLifecycleStatus(value: FormDataEntryValue | null): TenantStatus {
  const status = String(value ?? "").trim();
  if (status === "trial" || status === "active" || status === "pending_activation" || status === "suspended" || status === "cancelled") return status;
  throw new Error("テナント状態が不正です。");
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

export type PropertyFormValues = {
  name: string;
  area: string;
  address: string;
  sizeSqm: string;
  listingPrice: string;
  managementFee: string;
  repairFee: string;
  notes: string;
};

export type PropertyFormActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors: Partial<Record<keyof PropertyFormValues, string>>;
  values: PropertyFormValues;
  createdRecord?: { id: string; name: string };
};

export type CaseCreationActionState = {
  status: "idle" | "error";
  message?: string;
};

export type ClientFormValues = {
  clientId: string;
  name: string;
  phone: string;
  lineId: string;
  email: string;
  budgetMin: string;
  budgetMax: string;
  budgetType: string;
  preferredArea: string;
  firstChoiceArea: string;
  secondChoiceArea: string;
  purpose: string;
  loanPreApprovalStatus: string;
  desiredMoveInPeriod: string;
  stage: string;
  temperature: string;
  brokerageContractType: string;
  brokerageContractSignedAt: string;
  brokerageContractExpiresAt: string;
  importantMattersExplainedAt: string;
  contractDocumentDeliveredAt: string;
  personalInfoConsentAt: string;
  amlCheckStatus: string;
  nextFollowUpAt: string;
  notes: string;
};

export type ClientFormActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors: Partial<Record<keyof ClientFormValues, string>>;
  values: ClientFormValues;
  createdRecord?: { id: string; name: string };
};

export type PartyProfileFormValues = {
  partyId: string;
  name: string;
  phone: string;
  email: string;
  lineId: string;
  partyType: string;
  partyRole: string;
};

export type PartyProfileFormActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors: Partial<Record<keyof PartyProfileFormValues, string>>;
  values: PartyProfileFormValues;
};

function propertyFormValues(formData: FormData): PropertyFormValues {
  const read = (key: keyof PropertyFormValues) => String(formData.get(key) ?? "");
  return {
    name: read("name"),
    area: read("area"),
    address: read("address"),
    sizeSqm: read("sizeSqm"),
    listingPrice: read("listingPrice"),
    managementFee: read("managementFee"),
    repairFee: read("repairFee"),
    notes: read("notes"),
  };
}

function propertyValidationMessage(locale: Locale, field: keyof PropertyFormValues): string {
  const messages: Record<Locale, Partial<Record<keyof PropertyFormValues, string>>> = {
    ja: {
      name: "物件名を入力してください。",
      listingPrice: "価格は空欄または0より大きい数値で入力してください。",
      sizeSqm: "面積は空欄または0より大きい数値で入力してください。",
      managementFee: "管理費は空欄または0以上の数値で入力してください。",
      repairFee: "修繕積立金は空欄または0以上の数値で入力してください。",
    },
    zh: {
      name: "请输入物件名称。",
      listingPrice: "售价可留空，填写时必须是大于 0 的数字。",
      sizeSqm: "面积可留空，填写时必须是大于 0 的数字。",
      managementFee: "管理费可留空，填写时必须是 0 或更大的数字。",
      repairFee: "修缮费可留空，填写时必须是 0 或更大的数字。",
    },
    ko: {
      name: "매물명을 입력해 주세요.",
      listingPrice: "가격은 비워 두거나 0보다 큰 숫자를 입력해 주세요.",
      sizeSqm: "면적은 비워 두거나 0보다 큰 숫자를 입력해 주세요.",
      managementFee: "관리비는 비워 두거나 0 이상의 숫자를 입력해 주세요.",
      repairFee: "수선 적립금은 비워 두거나 0 이상의 숫자를 입력해 주세요.",
    },
  };
  return messages[locale][field] ?? "入力内容を確認してください。";
}

function parsePropertyForm(formData: FormData, locale: Locale) {
  const values = propertyFormValues(formData);
  const fieldErrors: PropertyFormActionState["fieldErrors"] = {};
  const name = values.name.trim();
  if (!name) fieldErrors.name = propertyValidationMessage(locale, "name");

  const parseOptionalNumber = (field: "listingPrice" | "sizeSqm" | "managementFee" | "repairFee", minimum: number) => {
    const raw = values[field].trim();
    if (!raw) return undefined;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < minimum || (field === "listingPrice" && parsed === 0)) {
      fieldErrors[field] = propertyValidationMessage(locale, field);
      return undefined;
    }
    return parsed;
  };

  const listingPrice = values.listingPrice.trim() ? parseOptionalNumber("listingPrice", 0) : 0;
  const sizeSqm = parseOptionalNumber("sizeSqm", Number.MIN_VALUE);
  const managementFee = parseOptionalNumber("managementFee", 0);
  const repairFee = parseOptionalNumber("repairFee", 0);
  return {
    values,
    fieldErrors,
    normalized: {
      name,
      area: values.area.trim() || undefined,
      address: values.address.trim() || undefined,
      sizeSqm,
      listingPrice: listingPrice ?? 0,
      managementFee,
      repairFee,
      notes: values.notes.trim() || undefined,
    },
  };
}

function propertyValidationState(
  values: PropertyFormValues,
  fieldErrors: PropertyFormActionState["fieldErrors"],
  locale: Locale,
  message?: string,
): PropertyFormActionState {
  const summary = message ?? (locale === "zh" ? "请修正以下字段后再保存。" : locale === "ko" ? "다음 항목을 확인한 후 저장해 주세요." : "入力内容を確認してから保存してください。");
  return { status: "error", message: summary, fieldErrors, values };
}

function safePropertyReturnTo(value: FormDataEntryValue | null): string {
  const fallback = "/properties";
  const path = String(value ?? "").trim();
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\") || path.includes("\\")) return fallback;
  const rawPathname = path.split(/[?#]/, 1)[0];
  let decodedPathname = rawPathname;
  try {
    decodedPathname = decodeURIComponent(rawPathname);
  } catch {
    return fallback;
  }
  if (decodedPathname.split("/").some((segment) => segment === "." || segment === "..")) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(path, "http://broker-desk.local");
  } catch {
    return fallback;
  }
  if (parsed.origin !== "http://broker-desk.local") return fallback;
  const keys = [...new Set([...parsed.searchParams.keys()])];
  if (parsed.pathname === "/properties") {
    if (keys.some((key) => !["q", "lifecycle", "sort", "page"].includes(key))) return fallback;
    return `${parsed.pathname}${parsed.search}`;
  }
  if (parsed.pathname === "/organize-center") {
    if (keys.some((key) => !["type", "q", "lifecycle", "page"].includes(key)) || parsed.searchParams.get("type") !== "property") return fallback;
    return `${parsed.pathname}${parsed.search}`;
  }
  if (parsed.pathname === "/import-center") {
    const allowedImportKeys = ["flow", "targetCaseId", "job", "xlsxJob", "intake", "advanced", "flash", "panel"];
    if (keys.some((key) => !allowedImportKeys.includes(key))) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  return fallback;
}

export type RecordLifecycleActionFailure = {
  status: "error";
  code: "update_failed" | "not_found";
};

export async function setRecordLifecycleAction(formData: FormData): Promise<RecordLifecycleActionFailure> {
  const session = await requireTenantSession({ permission: "record.archive" });
  const entityType = String(formData.get("entityType") ?? "");
  const entityId = String(formData.get("entityId") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "");

  await rejectForbiddenRecordInput(
    formData,
    session,
    entityType === "party" ? "client" : entityType === "property" ? "property" : "case",
    entityId || undefined,
  );

  if (!(entityType === "case" || entityType === "party" || entityType === "property") || !entityId || !isLifecycleStatus(statusRaw)) {
    throw new Error("归档对象或状态无效。");
  }

  const status = statusRaw as LifecycleStatus;
  if (entityType === "case") {
    await requireWritableCase(session, entityId);
  } else if (entityType === "party") {
    await ensureClientOwnership(entityId, session);
  } else {
    await ensurePropertyOwnership(entityId, session);
  }

  let updated: Awaited<ReturnType<typeof setRecordLifecycleWithAudit>>;
  try {
    updated = await setRecordLifecycleWithAudit({
      tenantId: session.tenant.id,
      userId: session.user.id,
      entityType,
      entityId,
      status,
      archivedById: session.user.id,
    });
  } catch {
    return { status: "error", code: "update_failed" };
  }

  if (!updated) return { status: "error", code: "not_found" };

  revalidatePath("/organize-center");
  revalidatePath("/parties");
  revalidatePath("/properties");
  revalidatePath("/");
  redirect(withFlash(
    safeReturnTo(formData.get("returnTo"), "/organize-center"),
    status === "archived" ? "record_archived" : "record_restored",
  ));
}

async function ensureClientOwnership(clientId: string, session: TenantSession) {
  const context = createRequestContext(session);
  const resolved = await resolveClientVisibilityForContext({ context, clientId });
  if (!resolved.record || !resolved.resolution.canWrite) {
    throw new Error("顧客が見つかりません。");
  }
  return resolved.record;
}

async function ensurePropertyOwnership(propertyId: string, session: TenantSession) {
  const context = createRequestContext(session);
  const resolved = await resolvePropertyVisibilityForContext({ context, propertyId });
  if (!resolved.record || !resolved.resolution.canWrite) {
    throw new Error("物件が見つからないか、操作権限がありません。");
  }
  return resolved.record;
}

function clientFormValues(formData: FormData): ClientFormValues {
  const read = (key: keyof ClientFormValues) => String(formData.get(key) ?? "");
  return {
    clientId: read("clientId"),
    name: read("name"),
    phone: read("phone"),
    lineId: read("lineId"),
    email: read("email"),
    budgetMin: read("budgetMin"),
    budgetMax: read("budgetMax"),
    budgetType: read("budgetType"),
    preferredArea: read("preferredArea"),
    firstChoiceArea: read("firstChoiceArea"),
    secondChoiceArea: read("secondChoiceArea"),
    purpose: read("purpose"),
    loanPreApprovalStatus: read("loanPreApprovalStatus"),
    desiredMoveInPeriod: read("desiredMoveInPeriod"),
    stage: read("stage"),
    temperature: read("temperature"),
    brokerageContractType: read("brokerageContractType"),
    brokerageContractSignedAt: read("brokerageContractSignedAt"),
    brokerageContractExpiresAt: read("brokerageContractExpiresAt"),
    importantMattersExplainedAt: read("importantMattersExplainedAt"),
    contractDocumentDeliveredAt: read("contractDocumentDeliveredAt"),
    personalInfoConsentAt: read("personalInfoConsentAt"),
    amlCheckStatus: read("amlCheckStatus"),
    nextFollowUpAt: read("nextFollowUpAt"),
    notes: read("notes"),
  };
}

function clientValidationMessage(locale: Locale, field: keyof ClientFormValues): string {
  const messages: Record<Locale, Partial<Record<keyof ClientFormValues, string>>> = {
    ja: {
      name: "顧客名を入力してください。",
      phone: "電話番号を入力してください。",
      budgetMin: "予算下限は0より大きい数値で入力してください。",
      budgetMax: "予算上限は0より大きい数値で入力してください。",
      budgetType: "予算種別を選択してください。",
      purpose: "用途を選択してください。",
      temperature: "温度感を選択してください。",
      stage: "ステージを選択してください。",
      loanPreApprovalStatus: "ローン事前審査の状態を選択してください。",
      brokerageContractType: "媒介契約の状態を選択してください。",
      amlCheckStatus: "本人確認/AMLの状態を選択してください。",
      desiredMoveInPeriod: "希望時期を確認してください。",
      brokerageContractSignedAt: "媒介契約締結日を確認してください。",
      brokerageContractExpiresAt: "媒介契約満了日を確認してください。",
      importantMattersExplainedAt: "35条の日付を確認してください。",
      contractDocumentDeliveredAt: "37条の日付を確認してください。",
      personalInfoConsentAt: "個人情報同意確認日を確認してください。",
      nextFollowUpAt: "次回フォロー日を確認してください。",
    },
    zh: {
      name: "请输入客户姓名。",
      phone: "请输入电话号码。",
      budgetMin: "预算下限必须是大于 0 的数字。",
      budgetMax: "预算上限必须是大于 0 的数字。",
      budgetType: "请选择预算类型。",
      purpose: "请选择用途。",
      temperature: "请选择温度。",
      stage: "请选择阶段。",
      loanPreApprovalStatus: "请选择贷款预审状态。",
      brokerageContractType: "请选择媒介合同状态。",
      amlCheckStatus: "请选择实名/AML状态。",
      desiredMoveInPeriod: "请检查期望时间。",
      brokerageContractSignedAt: "请检查媒介合同签订日。",
      brokerageContractExpiresAt: "请检查媒介合同到期日。",
      importantMattersExplainedAt: "请检查35条日期。",
      contractDocumentDeliveredAt: "请检查37条日期。",
      personalInfoConsentAt: "请检查个人信息同意日期。",
      nextFollowUpAt: "请检查下次跟进日期。",
    },
    ko: {
      name: "고객명을 입력해 주세요.",
      phone: "전화번호를 입력해 주세요.",
      budgetMin: "예산 하한은 0보다 큰 숫자여야 합니다.",
      budgetMax: "예산 상한은 0보다 큰 숫자여야 합니다.",
      budgetType: "예산 유형을 선택해 주세요.",
      purpose: "용도를 선택해 주세요.",
      temperature: "온도를 선택해 주세요.",
      stage: "단계를 선택해 주세요.",
      loanPreApprovalStatus: "대출 사전심사 상태를 선택해 주세요.",
      brokerageContractType: "중개 계약 상태를 선택해 주세요.",
      amlCheckStatus: "본인확인/AML 상태를 선택해 주세요.",
      desiredMoveInPeriod: "희망 시기를 확인해 주세요.",
      brokerageContractSignedAt: "중개 계약 체결일을 확인해 주세요.",
      brokerageContractExpiresAt: "중개 계약 만료일을 확인해 주세요.",
      importantMattersExplainedAt: "35조 날짜를 확인해 주세요.",
      contractDocumentDeliveredAt: "37조 날짜를 확인해 주세요.",
      personalInfoConsentAt: "개인정보 동의 확인일을 확인해 주세요.",
      nextFollowUpAt: "다음 후속 날짜를 확인해 주세요.",
    },
  };
  return messages[locale][field] ?? (locale === "zh" ? "请检查此字段。" : locale === "ko" ? "이 입력을 확인해 주세요." : "この入力を確認してください。");
}

function parseClientDate(value: string, locale: Locale, field: keyof ClientFormValues, fieldErrors: ClientFormActionState["fieldErrors"]): Date | undefined {
  const raw = value.trim();
  if (!raw) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    fieldErrors[field] = clientValidationMessage(locale, field);
    return undefined;
  }
  const date = new Date(`${raw}T00:00:00`);
  const [year, month, day] = raw.split("-").map(Number);
  const invalidCalendarDate = Number.isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day;
  if (invalidCalendarDate) fieldErrors[field] = clientValidationMessage(locale, field);
  return invalidCalendarDate ? undefined : date;
}

function parseClientForm(formData: FormData, locale: Locale, mode: "create" | "edit", compatibilityDefaults = false) {
  const values = clientFormValues(formData);
  const fieldErrors: ClientFormActionState["fieldErrors"] = {};
  const name = values.name.trim();
  const phone = values.phone.trim();
  if (!name) fieldErrors.name = clientValidationMessage(locale, "name");
  if (!phone) fieldErrors.phone = clientValidationMessage(locale, "phone");

  const requiredEnum = <T extends string>(field: keyof ClientFormValues, raw: string, valid: (value: string) => value is T, fallback?: T) => {
    const value = raw.trim() || (compatibilityDefaults ? fallback ?? "" : "");
    if (!valid(value)) fieldErrors[field] = clientValidationMessage(locale, field);
    return value;
  };
  const stage = values.stage.trim() || (mode === "create" ? "lead" : "");
  const purpose = requiredEnum("purpose", values.purpose, isPurpose, compatibilityDefaults ? PURPOSES[0] : undefined);
  const temperature = requiredEnum("temperature", values.temperature, isTemperature, compatibilityDefaults ? TEMPERATURES[1] : undefined);
  const budgetType = requiredEnum("budgetType", values.budgetType, isBudgetType, compatibilityDefaults ? BUDGET_TYPES[0] : undefined);
  const loanPreApprovalStatus = requiredEnum("loanPreApprovalStatus", values.loanPreApprovalStatus, isLoanPreApprovalStatus, compatibilityDefaults ? LOAN_PREAPPROVAL_STATUSES[0] : undefined);
  const brokerageContractType = requiredEnum("brokerageContractType", values.brokerageContractType, isBrokerageContractType, compatibilityDefaults ? BROKERAGE_CONTRACT_TYPES[0] : undefined);
  const amlCheckStatus = requiredEnum("amlCheckStatus", values.amlCheckStatus, isAmlCheckStatus, compatibilityDefaults ? AML_CHECK_STATUSES[0] : undefined);
  if (!isClientStage(stage)) fieldErrors.stage = clientValidationMessage(locale, "stage");

  const parseBudget = (field: "budgetMin" | "budgetMax") => {
    const raw = values[field].trim();
    if (!raw) return undefined;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) fieldErrors[field] = clientValidationMessage(locale, field);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };
  const budgetMin = parseBudget("budgetMin");
  const budgetMax = parseBudget("budgetMax");
  if (budgetMin !== undefined && budgetMax !== undefined && budgetMin > budgetMax) {
    fieldErrors.budgetMin = clientValidationMessage(locale, "budgetMin");
    fieldErrors.budgetMax = clientValidationMessage(locale, "budgetMax");
  }

  const dates = {
    brokerageContractSignedAt: parseClientDate(values.brokerageContractSignedAt, locale, "brokerageContractSignedAt", fieldErrors),
    brokerageContractExpiresAt: parseClientDate(values.brokerageContractExpiresAt, locale, "brokerageContractExpiresAt", fieldErrors),
    importantMattersExplainedAt: parseClientDate(values.importantMattersExplainedAt, locale, "importantMattersExplainedAt", fieldErrors),
    contractDocumentDeliveredAt: parseClientDate(values.contractDocumentDeliveredAt, locale, "contractDocumentDeliveredAt", fieldErrors),
    personalInfoConsentAt: parseClientDate(values.personalInfoConsentAt, locale, "personalInfoConsentAt", fieldErrors),
    nextFollowUpAt: parseClientDate(values.nextFollowUpAt, locale, "nextFollowUpAt", fieldErrors),
  };

  return {
    values,
    fieldErrors,
    normalized: {
      name,
      phone,
      lineId: values.lineId.trim() || undefined,
      email: values.email.trim() || undefined,
      budgetMin,
      budgetMax,
      budgetType: budgetType as BudgetType,
      preferredArea: values.preferredArea.trim() || undefined,
      firstChoiceArea: values.firstChoiceArea.trim() || undefined,
      secondChoiceArea: values.secondChoiceArea.trim() || undefined,
      purpose: purpose as Purpose,
      loanPreApprovalStatus: loanPreApprovalStatus as LoanPreApprovalStatus,
      desiredMoveInPeriod: values.desiredMoveInPeriod.trim() || undefined,
      stage: stage as ClientStage,
      temperature: temperature as Temperature,
      brokerageContractType: brokerageContractType as BrokerageContractType,
      ...dates,
      amlCheckStatus: amlCheckStatus as AmlCheckStatus,
      notes: values.notes.trim() || undefined,
    },
  };
}

function clientValidationState(values: ClientFormValues, fieldErrors: ClientFormActionState["fieldErrors"], locale: Locale, message?: string): ClientFormActionState {
  return {
    status: "error",
    message: message ?? (locale === "zh" ? "请修正以下字段后再保存。" : locale === "ko" ? "다음 항목을 확인한 후 저장해 주세요." : "入力内容を確認してから保存してください。"),
    fieldErrors,
    values,
  };
}

const IMPORT_CENTER_RETURN_PATH = "/import-center";

function safeClientReturnTo(value: FormDataEntryValue | null, fallback: string, currentClientId?: string, allowImportCenter = false): string {
  const path = String(value ?? "").trim();
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return fallback;
  const rawPathname = path.split(/[?#]/, 1)[0];
  let decodedPathname = rawPathname;
  try {
    decodedPathname = decodeURIComponent(rawPathname);
  } catch {
    return fallback;
  }
  if (decodedPathname.includes("\\") || decodedPathname.split("/").some((segment) => segment === "." || segment === "..")) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(path, "http://broker-desk.local");
  } catch {
    return fallback;
  }
  if (parsed.origin !== "http://broker-desk.local") return fallback;
  const keys = [...new Set([...parsed.searchParams.keys()])];
  if (parsed.pathname === "/clients") {
    if (keys.some((key) => !["q", "stage", "purpose", "temperature", "sort", "page"].includes(key))) return fallback;
    return `${parsed.pathname}${parsed.search}`;
  }
  if (parsed.pathname === "/organize-center") {
    if (parsed.searchParams.get("type") !== "client" || keys.some((key) => !["type", "q", "lifecycle", "page"].includes(key))) return fallback;
    return `${parsed.pathname}${parsed.search}`;
  }
  if (allowImportCenter && parsed.pathname === IMPORT_CENTER_RETURN_PATH && keys.length === 0 && !parsed.hash) return parsed.pathname;
  if (currentClientId && parsed.pathname === `/clients/${encodeURIComponent(currentClientId)}` && keys.length === 0) return parsed.pathname;
  return fallback;
}

function getClientCreateCompletion(input: {
  returnTo: string;
  clientId: string;
  clientName: string;
  values: ClientFormValues;
  caseDraftReturn: boolean;
}) {
  if (input.caseDraftReturn) {
    return {
      kind: "state" as const,
      state: {
        status: "idle" as const,
        fieldErrors: {},
        values: input.values,
        createdRecord: { id: input.clientId, name: input.clientName },
      },
    };
  }
  return {
    kind: "redirect" as const,
    href: input.returnTo === IMPORT_CENTER_RETURN_PATH
      ? `${IMPORT_CENTER_RETURN_PATH}?flash=client_created`
      : `/clients/${encodeURIComponent(input.clientId)}?flash=client_created`,
  };
}

async function persistClientForm(
  formData: FormData,
  mode: "create" | "edit",
  previousState?: ClientFormActionState,
  compatibilityDefaults = false,
) {
  const session = await requireTenantSession({ permission: "record.update" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const locale = await getLocale();
  const values = clientFormValues(formData);
  await rejectForbiddenRecordInput(formData, session, "client", values.clientId.trim() || undefined);
  const parsed = parseClientForm(formData, locale, mode, compatibilityDefaults);
  if (Object.keys(parsed.fieldErrors).length > 0) {
    if (previousState) return clientValidationState(parsed.values, parsed.fieldErrors, locale);
    throw new Error(Object.values(parsed.fieldErrors)[0] ?? "顧客データの形式が不正です。");
  }

  const clientId = values.clientId.trim();
  const fallback = mode === "create" || !clientId ? "/clients" : `/clients/${encodeURIComponent(clientId)}`;
  const returnTo = safeClientReturnTo(formData.get("returnTo"), fallback, mode === "edit" ? clientId : undefined, mode === "create");
  let client;
  if (mode === "create") {
    client = await addClient({ tenantId, ownerUserId: user.id, ...parsed.normalized });
  } else {
    if (!clientId) {
      if (previousState) return clientValidationState(parsed.values, { clientId: "顧客IDは必須です。" }, locale, "顧客IDを確認してください。");
      throw new Error("顧客IDは必須です。");
    }
    await ensureClientOwnership(clientId, session);
    client = await updateClient(clientId, { tenantId, ...parsed.normalized });
    if (!client) {
      if (previousState) return clientValidationState(parsed.values, {}, locale, "顧客が見つからないか、更新権限がありません。");
      throw new Error("顧客が見つからないか、更新権限がありません。");
    }
  }

  revalidatePath("/clients");
  revalidatePath(`/clients/${client.id}`);
  revalidatePath("/");
  revalidatePath("/board");
  await addAuditLog({
    tenantId,
    userId: user.id,
    action: mode === "create" ? "client_created" : "client_updated",
    targetType: "client",
    targetId: client.id,
    message: mode === "create" ? `顧客を新規登録しました: ${client.name}` : "顧客情報を更新しました。",
  });

  const createCompletion = mode === "create" ? getClientCreateCompletion({
    returnTo,
    clientId: client.id,
    clientName: client.name,
    values: parsed.values,
    caseDraftReturn: formData.get("caseDraftReturn") === "1",
  }) : undefined;
  if (createCompletion?.kind === "state") return createCompletion.state satisfies ClientFormActionState;

  if (compatibilityDefaults) {
    const afterSave = String(formData.get("afterSave") ?? "detail");
    if (afterSave === "quote") redirect(`/quotes/new?clientId=${client.id}`);
    if (afterSave === "list") redirect("/clients");
  }
  if (createCompletion?.kind === "redirect" && createCompletion.href.startsWith(`${IMPORT_CENTER_RETURN_PATH}?`)) redirect(createCompletion.href);
  if (mode === "create") redirect(`/clients/${client.id}?flash=client_created`);
  redirect(withFlash(`/clients/${client.id}/edit?returnTo=${encodeURIComponent(returnTo)}`, "client_updated"));
}

export async function createClientFormAction(_previousState: ClientFormActionState, formData: FormData): Promise<ClientFormActionState> {
  return persistClientForm(formData, "create", _previousState, false);
}

export async function updateClientProfileAction(_previousState: ClientFormActionState, formData: FormData): Promise<ClientFormActionState> {
  return persistClientForm(formData, "edit", _previousState, false);
}

/** Compatibility wrapper for the existing /clients quick-create form. */
export async function createClient(formData: FormData): Promise<void> {
  await persistClientForm(formData, "create", undefined, true);
}

/** Compatibility wrapper for older edit callers. The Responsive Form uses updateClientProfileAction. */
export async function updateClientProfile(formData: FormData): Promise<void> {
  await persistClientForm(formData, "edit", undefined, false);
}

export async function addFollowUp(formData: FormData) {
  const session = await requireTenantSession({ permission: "record.update" });
  const user = session.user;
  const tenantId = session.tenant.id;

  const clientId = String(formData.get("clientId") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!clientId || !content) {
    throw new Error("顧客IDと内容は必須です。");
  }
  await ensureClientOwnership(clientId, session);

  const type =
    (String(formData.get("type") ?? FOLLOWUP_TYPES[5]) as FollowUpType) ??
    FOLLOWUP_TYPES[5];

  await appendFollowUp({
    tenantId,
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
    tenantId,
    userId: user.id,
    action: "followup_added",
    targetType: "client",
    targetId: clientId,
    message: "フォロー履歴を追加しました。",
  });
}

export async function updateClientStage(formData: FormData) {
  const session = await requireTenantSession({ permission: "record.update" });
  const user = session.user;
  const tenantId = session.tenant.id;
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
  await ensureClientOwnership(clientId, session);

  await setClientStageWithLog({
    tenantId,
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
    tenantId,
    userId: user.id,
    action: "client_stage_updated",
    targetType: "client",
    targetId: clientId,
    message: `ステージを更新しました: ${stage}`,
  });
}

export async function createComplianceTask(formData: FormData) {
  const session = await requireTenantSession({ permission: "review_task.create" });
  const user = session.user;
  const tenantId = session.tenant.id;
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
  await ensureClientOwnership(clientId, session);

  const task = await createComplianceTaskFromAlert({
    tenantId,
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
  const session = await requireTenantSession({ permission: "record.update" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const clientId = String(formData.get("clientId") ?? "").trim();
  const alertType = String(formData.get("alertType") ?? "").trim();
  const extendDays = parseNumber(formData.get("extendDays"), 90);

  if (!clientId) {
    throw new Error("顧客IDは必須です。");
  }
  if (!isComplianceAlertType(alertType)) {
    throw new Error("法定アラート種別の値が不正です。");
  }
  await ensureClientOwnership(clientId, session);

  const updated = await resolveComplianceAlert({
    tenantId,
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
  const session = await requireTenantSession({ permission: "review_task.resolve" });
  const user = session.user;
  const tenantId = session.tenant.id;
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
  await ensureClientOwnership(clientId, session);

  const updated = await updateTaskStatus({
    tenantId,
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
  const session = await requireTenantSession({ permission: "review_task.resolve" });
  const user = session.user;
  const tenantId = session.tenant.id;
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
        ja: "対象の対応履歴を選択してください。",
        zh: "请先选择要处理的跟进记录。",
        ko: "처리할 후속 기록을 먼저 선택해 주세요.",
      })
    );
  }

  const clients = await listClients(user.id, { sort: "follow_up", tenantId });
  const details = await Promise.all(clients.map((client) => getClientDetail(client.id, tenantId)));
  const allowedTaskIds = new Set<string>();
  details.forEach((detail) => detail?.tasks.forEach((task) => allowedTaskIds.add(task.id)));
  const targetIds = taskIds.filter((id) => allowedTaskIds.has(id));
  if (targetIds.length === 0) {
    throw new Error(
      tr(locale, {
        ja: "更新可能な対応履歴が見つかりません。",
        zh: "未找到可更新的跟进记录。",
        ko: "업데이트 가능한 후속 기록이 없습니다.",
      })
    );
  }

  await Promise.all(targetIds.map((taskId) => updateTaskStatus({ tenantId, taskId, status, updatedById: user.id })));

  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "service_request_batch_updated",
    targetType: "task",
    targetId: targetIds[0],
    message: tr(locale, {
      ja: `対応履歴を一括更新しました: ${targetIds.length}件`,
      zh: `已批量更新跟进记录：${targetIds.length}条`,
      ko: `후속 기록 일괄 업데이트: ${targetIds.length}건`,
    }),
  });

  revalidatePath("/");
  revalidatePath("/service-requests");
  revalidatePath("/clients");
  redirect(withFlash(returnTo, "request_batch_updated"));
}

export async function batchUpdateContractStatusAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "record.update" });
  const user = session.user;
  const tenantId = session.tenant.id;
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

  const hubContext = { userId: user.id, tenantId };
  const contracts = await listHubContracts(locale, hubContext);
  const clients = await listClients(user.id, { sort: "follow_up", tenantId });
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
      const client = await ensureClientOwnership(clientId, session);
      await setClientStage(client.id, targetStage, tenantId);
      await addAuditLog({
        tenantId,
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
  const session = await requireTenantSession({ permission: "record.update" });
  const user = session.user;
  const tenantId = session.tenant.id;
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
      const client = await ensureClientOwnership(clientId, session);
      await setClientStage(client.id, stage, tenantId);
    })
  );

  await addAuditLog({
    tenantId,
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
  const session = await requireTenantSession({ permission: "review_task.resolve" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const taskId = String(formData.get("taskId") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const dueAt = parseDate(formData.get("dueAt"));
  const returnTo = safeReturnTo(formData.get("returnTo"), `/clients/${clientId}`);

  if (!taskId || !clientId || !dueAt) {
    throw new Error("タスクID・顧客ID・新しい期限は必須です。");
  }
  await ensureClientOwnership(clientId, session);

  const updated = await rescheduleTask({
    tenantId,
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
  const session = await requireTenantSession({ permission: "review_task.resolve" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const taskId = String(formData.get("taskId") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "").trim();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/service-requests");
  if (!taskId || !clientId || !isTaskStatus(statusRaw)) {
    throw new Error("元に戻す情報が不足しています。");
  }
  await ensureClientOwnership(clientId, session);
  const updated = await updateTaskStatus({
    tenantId,
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
  const session = await requireTenantSession({ permission: "source.upload" });
  const user = session.user;
  const tenantId = session.tenant.id;

  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const targetEntity = String(formData.get("targetEntity") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!isImportSourceType(sourceType)) {
    throw new Error("資料種別が不正です。");
  }
  if (!isImportTargetEntity(targetEntity)) {
    throw new Error("保存先が不正です。");
  }

  const job = await addImportJob({
    tenantId,
    userId: user.id,
    sourceType,
    targetEntity,
    title,
    notes: notes || undefined,
  });

  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "import_job_created",
    targetType: "task",
    targetId: job.id,
    message: `資料読取記録を作成しました: ${job.title}`,
  });

  revalidatePath("/");
  revalidatePath("/import-center");
  redirect(withFlash(`/import-center?job=${job.id}`, "import_job_created"));
}

export async function updateImportJobMappingAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "extract.override_result" });
  const user = session.user;
  const tenantId = session.tenant.id;
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
    throw new Error("保存先が不正です。");
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
            ? `必填项目还没有保存位置（${validation.missingRequired.length} 项）`
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
            ? `检测到无法识别的保存项目（${validation.unknownTargets.length} 项）`
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
            ? "保存位置已确认。"
            : locale === "ko"
              ? "저장 위치가 확인되었습니다."
              : "保存先の確認が完了しました。",
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
    tenantId,
    userId: user.id,
    jobId,
    mappingJson,
    validationMessage: message,
    notes: notes || undefined,
    status,
  });
  if (!updated) {
    throw new Error("資料読取記録が見つかりません。");
  }

  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "import_mapping_updated",
    targetType: "task",
    targetId: updated.id,
    message: `資料の保存先を更新しました: ${updated.title}`,
  });

  revalidatePath("/");
  revalidatePath("/import-center");
  redirect(withFlash(`/import-center?job=${updated.id}`, "import_mapping_saved"));
}

export async function autoMapImportJobAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "extract.override_result" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const locale = await getLocale();

  const jobId = String(formData.get("jobId") ?? "").trim();
  const targetEntity = String(formData.get("targetEntity") ?? "").trim();
  const sourceColumnsText = String(formData.get("sourceColumns") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!jobId) {
    throw new Error("ジョブIDは必須です。");
  }
  if (!isImportTargetEntity(targetEntity)) {
    throw new Error("保存先が不正です。");
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
            ? `自动整理后仍有必填项目没有保存位置（${validation.missingRequired.length} 项）`
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
            ? `自动整理包含无法识别的保存项目（${validation.unknownTargets.length} 项）`
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
            ? "保存位置建议已确认。"
            : locale === "ko"
              ? "저장 위치 제안이 확인되었습니다."
              : "保存先の提案を確認しました。",
      })
    );
  }
  const autoSummaryPrefix = tr(locale, {
    ja: "整理提案",
    zh: "整理建议",
    ko: "정리 제안",
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
    tenantId,
    userId: user.id,
    jobId,
    mappingJson,
    validationMessage: message,
    notes: notes || undefined,
    status,
  });
  if (!updated) {
    throw new Error("資料読取記録が見つかりません。");
  }

  await addAuditLog({
    tenantId,
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
  const session = await requireTenantSession({ permission: "extract.override_result" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const locale = await getLocale();

  const jobId = String(formData.get("jobId") ?? "").trim();
  const operation = String(formData.get("operation") ?? "").trim();
  if (!jobId) {
    throw new Error("ジョブIDは必須です。");
  }

  const jobs = await listImportJobs(user.id, 200, tenantId);
  const job = jobs.find((item) => item.id === jobId);
  if (!job) {
    throw new Error("資料読取記録が見つかりません。");
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
    tenantId,
    userId: user.id,
    jobId: job.id,
    mappingJson: job.mappingJson ?? {},
    validationMessage: nextMessage,
    notes: nextNotes,
    status: nextStatus,
  });

  await addAuditLog({
    tenantId,
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
  const session = await requireTenantSession({ permission: "extract.run" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const locale = await getLocale();

  const jobId = String(formData.get("jobId") ?? "").trim();
  if (!jobId) {
    throw new Error("ジョブIDは必須です。");
  }

  const jobs = await listImportJobs(user.id, 200, tenantId);
  const job = jobs.find((item) => item.id === jobId);
  if (!job) {
    throw new Error("資料読取記録が見つかりません。");
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
    tenantId,
    userId: user.id,
    jobId,
    mappingJson: job.mappingJson ?? {},
    validationMessage: preservedValidation,
    notes: nextNotes,
    status: "queued",
    allowRetry: true,
  });
  if (!retried) {
    throw new Error("資料読取記録の再処理に失敗しました。");
  }

  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "import_job_retried",
    targetType: "import_job",
    targetId: jobId,
    message: tr(locale, {
      ja: `資料読取記録を再処理へ戻しました: ${retried.title}`,
      zh: `已将资料读取记录退回待处理：${retried.title}`,
      ko: `자료 읽기 기록을 다시 처리하도록 되돌렸습니다: ${retried.title}`,
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
  const session = await requireTenantSession({ permission: "source.upload" });
  const user = session.user;
  const tenantId = session.tenant.id;

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
  let privateContent: Buffer | undefined;

  if (upload instanceof File && upload.size > 0) {
    fileName = upload.name || fileNameInput || "upload.bin";
    fileType = upload.type || fileType || undefined;
    size = upload.size;

    assertProductionAttachmentStorageReady();
    const mode = getAttachmentStorageMode();
    if (mode === "local_private") {
      const persisted = await persistAttachmentToLocalPrivate(upload, tenantId);
      fileName = persisted.fileName;
      fileType = persisted.fileType || fileType;
      size = persisted.fileSizeBytes;
      storagePath = persisted.storagePath;
    } else if (mode === "postgres_private") {
      if (upload.size > getPostgresPrivateAttachmentLimitBytes()) {
        throw new Error("公测环境中单个附件不能超过 10 MB。");
      }
      privateContent = Buffer.from(await upload.arrayBuffer());
    } else {
      throw new Error("この環境では直接アップロードを利用できません。保存先の設定を確認してください。");
    }
  } else if (externalStoragePathInput) {
    if (isProductionRuntime()) {
      throw new Error("本番環境では外部公開URLを資料の保存先として利用できません。");
    }
    if (!isValidStoragePath(externalStoragePathInput)) {
      throw new Error("保存先URLは http(s) で指定してください。");
    }
    storagePath = externalStoragePathInput;
  }

  if (!fileName) {
    throw new Error("ファイル名またはアップロードファイルを指定してください。");
  }

  const attachment = privateContent
    ? await addPrivateAttachment({
        tenantId,
        userId: user.id,
        targetType,
        targetId,
        fileName,
        fileType,
        content: privateContent,
      })
    : await addAttachment({
        tenantId,
        userId: user.id,
        targetType,
        targetId,
        fileName,
        fileType,
        fileSizeBytes: size,
        storagePath,
      });

  await addAuditLog({
    tenantId,
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

export async function uploadObjectAttachmentAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "source.upload" });
  assertTenantPermission(session, "record.update");
  const targetType = String(formData.get("targetType") ?? "").trim();
  const targetId = String(formData.get("targetId") ?? "").trim();
  const category = String(formData.get("category") ?? "other").trim();
  const upload = formData.get("attachmentFile");
  if (!isObjectAttachmentTargetType(targetType) || !targetId || !isObjectAttachmentCategory(category)) {
    throw new Error("添付先または分類が不正です。");
  }
  if (!(upload instanceof File) || upload.size <= 0) throw new Error("ファイルを選択してください。");
  if (!/^(application\/pdf|image\/(jpeg|png|webp|heic)|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)$/.test(upload.type)) {
    throw new Error("PDF、画像、Excel ファイルのみ登録できます。");
  }
  if (targetType === "case") await requireWritableCase(session, targetId);
  if (targetType === "party") await ensureClientOwnership(targetId, session);
  if (targetType === "property") await ensurePropertyOwnership(targetId, session);
  assertProductionAttachmentStorageReady();
  const storageMode = getAttachmentStorageMode();
  let attachment;
  if (storageMode === "local_private") {
    const persisted = await persistAttachmentToLocalPrivate(upload, session.tenant.id);
    attachment = await addAttachment({
      tenantId: session.tenant.id,
      userId: session.user.id,
      targetType,
      targetId,
      ...persisted,
    });
  } else if (storageMode === "postgres_private") {
    if (upload.size > getPostgresPrivateAttachmentLimitBytes()) {
      throw new Error("公测环境中单个附件不能超过 10 MB。");
    }
    attachment = await addPrivateAttachment({
      tenantId: session.tenant.id,
      userId: session.user.id,
      targetType,
      targetId,
      fileName: upload.name || "attachment.bin",
      fileType: upload.type,
      content: Buffer.from(await upload.arrayBuffer()),
    });
  } else {
    throw new Error("この環境では対象資料への直接添付を利用できません。");
  }
  try {
    await linkAttachmentToObject({
      tenantId: session.tenant.id,
      attachmentId: attachment.id,
      targetType,
      targetId,
      category,
      createdByUserId: session.user.id,
    });
  } catch (error) {
    await deletePrivateAttachmentForTenant({ tenantId: session.tenant.id, id: attachment.id });
    throw error;
  }
  await addAuditLog({
    tenantId: session.tenant.id,
    userId: session.user.id,
    action: "object_attachment_uploaded",
    targetType,
    targetId,
    message: `対象資料へ添付しました: ${attachment.fileName}`,
    context: { attachmentId: attachment.id, category },
  });
  const targetPath = targetType === "case" ? `/cases/${targetId}` : targetType === "party" ? `/parties/${targetId}/edit` : `/properties/${targetId}/edit`;
  revalidatePath(targetPath);
  redirect(`${targetPath}?flash=object_attachment_uploaded#object-attachments`);
}

export async function createPropertyQuickAction(
  _previousState: PropertyFormActionState,
  formData: FormData,
): Promise<PropertyFormActionState> {
  const session = await requireTenantSession({ permission: "record.update" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const locale = await getLocale();
  await rejectForbiddenRecordInput(formData, session, "property");

  const parsed = parsePropertyForm(formData, locale);
  if (Object.keys(parsed.fieldErrors).length > 0) {
    return propertyValidationState(parsed.values, parsed.fieldErrors, locale);
  }
  const returnTo = safePropertyReturnTo(formData.get("returnTo"));

  const property = await addProperty({
    tenantId,
    createdByUserId: user.id,
    currentOwnerUserId: user.id,
    ...parsed.normalized,
  });

  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "property_created",
    targetType: "property",
    targetId: property.id,
    message: tr(locale, {
      ja: `物件を登録しました: ${property.name}`,
      zh: `已新增物件：${property.name}`,
      ko: `매물을 등록했습니다: ${property.name}`,
    }),
  });

  revalidatePath("/properties");
  revalidatePath("/");

  if (formData.get("caseDraftReturn") === "1") {
    return {
      status: "idle",
      fieldErrors: {},
      values: parsed.values,
      createdRecord: { id: property.id, name: property.name },
    } satisfies PropertyFormActionState;
  }

  const destination = `/properties/${encodeURIComponent(property.id)}/edit?returnTo=${encodeURIComponent(returnTo)}`;
  redirect(withFlash(destination, "property_created"));
}

export async function updatePropertyProfileAction(
  _previousState: PropertyFormActionState,
  formData: FormData,
): Promise<PropertyFormActionState> {
  const session = await requireTenantSession({ permission: "record.update" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const locale = await getLocale();
  const propertyId = String(formData.get("propertyId") ?? "").trim();
  await rejectForbiddenRecordInput(formData, session, "property", propertyId || undefined);
  if (!propertyId) {
    return propertyValidationState(propertyFormValues(formData), {}, locale, tr(locale, {
      ja: "物件IDは必須です。",
      zh: "物件ID是必填项。",
      ko: "매물 ID는 필수입니다.",
    }));
  }

  await ensurePropertyOwnership(propertyId, session);

  const parsed = parsePropertyForm(formData, locale);
  if (Object.keys(parsed.fieldErrors).length > 0) {
    return propertyValidationState(parsed.values, parsed.fieldErrors, locale);
  }
  const returnTo = safePropertyReturnTo(formData.get("returnTo"));

  const updated = await updateProperty(propertyId, {
    tenantId,
    ...parsed.normalized,
  });
  if (!updated) {
    return propertyValidationState(parsed.values, {}, locale, tr(locale, {
      ja: "物件が見つからないか、更新権限がありません。",
      zh: "未找到物件，或没有更新权限。",
      ko: "매물을 찾을 수 없거나 업데이트 권한이 없습니다.",
    }));
  }

  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "property_updated",
    targetType: "property",
    targetId: propertyId,
    message: tr(locale, {
      ja: `物件を更新しました: ${parsed.normalized.name}`,
      zh: `已更新物件：${parsed.normalized.name}`,
      ko: `매물을 업데이트했습니다: ${parsed.normalized.name}`,
    }),
  });

  revalidatePath(`/properties/${propertyId}/edit`);
  revalidatePath("/properties");
  revalidatePath("/");
  redirect(withFlash(`/properties/${propertyId}/edit?returnTo=${encodeURIComponent(returnTo)}`, "property_updated"));
}

function parsePartyProfileForm(formData: FormData, locale: Locale, options?: { fallbackName?: string }) {
  const name = String(formData.get("name") ?? "").trim() || String(options?.fallbackName ?? "").trim();
  const partyTypeRaw = String(formData.get("partyType") ?? "individual").trim();
  const partyRoleRaw = String(formData.get("partyRole") ?? "applicant").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const lineId = String(formData.get("lineId") ?? "").trim();
  const relationHint = String(formData.get("relationHint") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!name) {
    throw new Error(
      tr(locale, {
        ja: "氏名または会社名は必須です。",
        zh: "姓名或公司名是必填项。",
        ko: "이름 또는 회사명은 필수입니다.",
      })
    );
  }
  if (!isPartyProfileType(partyTypeRaw) || !isPartyProfileRole(partyRoleRaw)) {
    throw new Error(
      tr(locale, {
        ja: "関係者データの形式が不正です。",
        zh: "主体数据格式不正确。",
        ko: "관계자 데이터 형식이 올바르지 않습니다.",
      })
    );
  }

  return {
    name,
    partyType: partyTypeRaw,
    partyRole: partyRoleRaw,
    phone,
    email: email || undefined,
    lineId: lineId || undefined,
    relationHint: relationHint || undefined,
    note,
    notes: buildPartyProfileNotes({
      type: partyTypeRaw,
      role: partyRoleRaw,
      status: "active",
      note,
      locale,
    }),
  };
}

export async function createPartyProfileAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "record.update" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const locale = await getLocale();
  await rejectForbiddenRecordInput(formData, session, "client");
  const today = formatCaseTitleDate(new Date());
  const defaultName = tr(locale, {
    ja: `新規関係者 ${today}`,
    zh: `新主体 ${today}`,
    ko: `새 관계자 ${today}`,
  });
  const payload = parsePartyProfileForm(formData, locale, { fallbackName: defaultName });

  const client = await addClient({
    tenantId,
    ownerUserId: user.id,
    name: payload.name,
    phone: payload.phone,
    lineId: payload.lineId,
    preferredArea: payload.relationHint,
    email: payload.email,
    budgetType: "total_price",
    purpose: inferPurposeFromPartyRole(payload.partyRole),
    loanPreApprovalStatus: "not_applied",
    stage: "lead",
    temperature: "medium",
    brokerageContractType: "none",
    amlCheckStatus: "not_required",
    notes: payload.notes,
  });

  await addAuditLog({
    tenantId,
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
  const afterSave = String(formData.get("afterSave") ?? "edit");
  redirect(withFlash(afterSave === "list" ? `/parties?focus=${client.id}` : `/parties/${client.id}/edit`, "party_created"));
}

function partyFormValues(formData: FormData): PartyProfileFormValues {
  const read = (key: keyof PartyProfileFormValues) => String(formData.get(key) ?? "");
  return {
    partyId: read("partyId"),
    name: read("name"),
    phone: read("phone"),
    email: read("email"),
    lineId: read("lineId"),
    partyType: read("partyType"),
    partyRole: read("partyRole"),
  };
}

function partyValidationMessage(locale: Locale, field: keyof PartyProfileFormValues): string {
  const messages: Record<Locale, Partial<Record<keyof PartyProfileFormValues, string>>> = {
    ja: {
      name: "氏名または会社名は必須です。",
      phone: "電話番号は必須です。",
      partyType: "関係者種別を選択するか、未設定のままにしてください。",
      partyRole: "役割を選択するか、未設定のままにしてください。",
    },
    zh: {
      name: "姓名或公司名是必填项。",
      phone: "电话号码是必填项。",
      partyType: "请选择主体类型，或保留为未设置。",
      partyRole: "请选择主体角色，或保留为未设置。",
    },
    ko: {
      name: "이름 또는 회사명은 필수입니다.",
      phone: "전화번호는 필수입니다.",
      partyType: "관계자 유형을 선택하거나 미설정으로 두세요.",
      partyRole: "역할을 선택하거나 미설정으로 두세요.",
    },
  };
  return messages[locale][field] ?? tr(locale, { ja: "入力内容を確認してください。", zh: "请检查输入内容。", ko: "입력 내용을 확인해 주세요." });
}

function partyValidationState(
  values: PartyProfileFormValues,
  fieldErrors: PartyProfileFormActionState["fieldErrors"],
  locale: Locale,
): PartyProfileFormActionState {
  return {
    status: "error",
    message: tr(locale, {
      ja: "入力内容を確認してから保存してください。",
      zh: "请修正以下字段后再保存。",
      ko: "다음 항목을 확인한 후 저장해 주세요.",
    }),
    fieldErrors,
    values,
  };
}

function parsePartyUpdateForm(formData: FormData, locale: Locale) {
  const values = partyFormValues(formData);
  const fieldErrors: PartyProfileFormActionState["fieldErrors"] = {};
  const name = values.name.trim();
  const phone = values.phone.trim();
  const partyTypeRaw = values.partyType.trim();
  const partyRoleRaw = values.partyRole.trim();
  if (!name) fieldErrors.name = partyValidationMessage(locale, "name");
  if (!phone) fieldErrors.phone = partyValidationMessage(locale, "phone");
  if (!formData.has("partyType")) fieldErrors.partyType = partyValidationMessage(locale, "partyType");
  if (!formData.has("partyRole")) fieldErrors.partyRole = partyValidationMessage(locale, "partyRole");
  if (partyTypeRaw && !isPartyProfileType(partyTypeRaw)) fieldErrors.partyType = partyValidationMessage(locale, "partyType");
  if (partyRoleRaw && !isPartyProfileRole(partyRoleRaw)) fieldErrors.partyRole = partyValidationMessage(locale, "partyRole");

  return {
    values,
    fieldErrors,
    normalized: {
      name,
      phone,
      email: values.email.trim() || undefined,
      lineId: values.lineId.trim() || undefined,
      partyType: partyTypeRaw ? (partyTypeRaw as PartyProfileType) : undefined,
      partyRole: partyRoleRaw ? (partyRoleRaw as PartyProfileRole) : undefined,
    },
  };
}

export async function updatePartyProfileAction(
  _previousState: PartyProfileFormActionState,
  formData: FormData,
): Promise<PartyProfileFormActionState> {
  const session = await requireTenantSession({ permission: "record.update" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const locale = await getLocale();
  const values = partyFormValues(formData);
  const clientId = values.partyId.trim();
  await rejectForbiddenRecordInput(formData, session, "client", clientId || undefined);
  if (!clientId) {
    return partyValidationState(values, { partyId: tr(locale, { ja: "関係者IDは必須です。", zh: "主体ID是必填项。", ko: "관계자 ID는 필수입니다." }) }, locale);
  }
  await ensureClientOwnership(clientId, session);
  const existing = await getClientById(clientId, tenantId);
  if (!existing) {
    return partyValidationState(values, {}, locale);
  }
  const payload = parsePartyUpdateForm(formData, locale);
  if (Object.keys(payload.fieldErrors).length > 0) {
    return partyValidationState(payload.values, payload.fieldErrors, locale);
  }
  const notes = mergePartyProfileMetadataNotes({
    existingNotes: existing.notes,
    type: payload.normalized.partyType,
    role: payload.normalized.partyRole,
    locale,
  });

  const updated = await updateClient(clientId, {
    tenantId,
    name: payload.normalized.name,
    phone: payload.normalized.phone,
    lineId: payload.normalized.lineId,
    email: payload.normalized.email,
    budgetMin: existing.budgetMin,
    budgetMax: existing.budgetMax,
    budgetType: existing.budgetType,
    preferredArea: existing.preferredArea,
    firstChoiceArea: existing.firstChoiceArea,
    secondChoiceArea: existing.secondChoiceArea,
    purpose: existing.purpose,
    loanPreApprovalStatus: existing.loanPreApprovalStatus,
    desiredMoveInPeriod: existing.desiredMoveInPeriod,
    stage: existing.stage,
    temperature: existing.temperature,
    brokerageContractType: existing.brokerageContractType,
    brokerageContractSignedAt: existing.brokerageContractSignedAt,
    brokerageContractExpiresAt: existing.brokerageContractExpiresAt,
    importantMattersExplainedAt: existing.importantMattersExplainedAt,
    contractDocumentDeliveredAt: existing.contractDocumentDeliveredAt,
    personalInfoConsentAt: existing.personalInfoConsentAt,
    amlCheckStatus: existing.amlCheckStatus,
    nextFollowUpAt: existing.nextFollowUpAt,
    notes,
  });
  if (!updated) return partyValidationState(payload.values, {}, locale);

  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "party_updated",
    targetType: "client",
    targetId: clientId,
    message: tr(locale, {
        ja: `関係者を更新しました: ${payload.normalized.name}`,
      zh: `已更新主体：${payload.normalized.name}`,
      ko: `관계자를 업데이트했습니다: ${payload.normalized.name}`,
    }),
  });

  revalidatePath(`/parties/${clientId}/edit`);
  revalidatePath("/parties");
  revalidatePath("/clients");
  revalidatePath("/");
  const returnTo = normalizePartyReturnTo(String(formData.get("returnTo") ?? ""));
  redirect(withFlash(`/parties/${encodeURIComponent(clientId)}/edit?returnTo=${encodeURIComponent(returnTo)}`, "party_updated"));
}

export async function createPartyQuickAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect("/parties/new");
  }
  redirect(`/parties/new?name=${encodeURIComponent(name)}&flash=${encodeURIComponent("continue_profile")}`);
}

export async function createServiceRequestQuickAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "review_task.create" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const locale = await getLocale();

  const requestedClientId = String(formData.get("clientId") ?? "").trim();
  let clientId = requestedClientId;
  if (!clientId) {
    const clients = await listClients(user.id, { sort: "follow_up", tenantId });
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
  await ensureClientOwnership(clientId, session);

  const title =
    String(formData.get("title") ?? "").trim() ||
    tr(locale, {
      ja: "新規対応履歴",
      zh: "新建跟进记录",
      ko: "새 후속 기록",
    });
  const dueAt = parseDate(formData.get("dueAt"));
  const returnTo = safeReturnTo(formData.get("returnTo"), "/service-requests");

  const task = await addTask({
    tenantId,
    clientId,
    title,
    dueAt,
    createdById: user.id,
    status: "pending",
  });

  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "service_request_created",
    targetType: "task",
    targetId: task.id,
    message: tr(locale, {
      ja: `対応履歴を登録しました: ${title}`,
      zh: `已新增跟进记录：${title}`,
      ko: `후속 기록을 등록했습니다: ${title}`,
    }),
  });

  revalidatePath("/service-requests");
  revalidatePath("/");
  revalidatePath(`/clients/${clientId}`);
  redirect(withFlash(returnTo, "request_created"));
}

export async function generateOutputDocumentAction(formData: FormData) {
  await requireTenantSession({ permission: "output.generate_final" });
  void formData;
  throw new Error("この出力形式は廃止されました。保証会社申込書を選択してください。");
  /*
   * Legacy proposal/property/estimate/funding generation was retired on 2026-07-26.
   * Keep the old implementation out of the compiled path until the historical output
   * schema is migrated and its compatibility types can be removed safely.
   *
  const session = await requireTenantSession({ permission: "output.generate_final" });
  const user = session.user;
  const tenantId = session.tenant.id;
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
    getOutputTemplateSettings(user.id, tenantId),
    listOutputTemplateVersions(user.id, 20, tenantId),
  ]);
  const activeTemplateVersion = templateVersions.find((item) => item.isActive) ?? templateVersions[0];
  const issuedAt = new Date();

  if (typeRaw === "property_overview") {
    if (!targetProperty) {
      const withValidationFlash = withFlash(returnTo, "output_validation_failed");
      redirect(appendQuery(withValidationFlash, "issues", "missing_target_property"));
    }

    const { properties } = await listQuoteFormData(tenantId);
    const property = properties.find((item) => item.id === targetProperty);
    if (!property) {
      throw new Error("対象物件が見つかりません。");
    }

    const documentNumber = createDocumentNumber(property.id, typeRaw, issuedAt);
    const title = `${getOutputDocLabel(safeLanguage, typeRaw)} - ${property.name}`;
    const generated = await addGeneratedOutput({
      tenantId,
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
      inputDataSnapshot: {
        property,
        targetParty: targetParty || undefined,
      },
      draftValueSnapshot: {},
      fieldMappingSnapshot: {
        outputType: typeRaw,
        templateSettings,
      },
      layoutSnapshot: {
        templateVersionId: activeTemplateVersion?.id,
        templateVersionNumber: activeTemplateVersion?.versionNumber,
        settingsSnapshot: activeTemplateVersion?.settingsSnapshot,
      },
    });

    await addAuditLog({
      tenantId,
      userId: user.id,
      action: "output_generated",
      targetType: "property",
      targetId: property.id,
      message: tr(locale, {
        ja: `物件概要PDFを出力しました: ${property.name} (${safeFormat}/${safeLanguage}) / doc=${documentNumber} / tpl=${activeTemplateVersion?.versionNumber ?? "n/a"} / class=${templateSettings.documentClassification}`,
        zh: `已输出物件概要PDF：${property.name} (${safeFormat}/${safeLanguage}) / doc=${documentNumber} / tpl=${activeTemplateVersion?.versionNumber ?? "n/a"} / class=${templateSettings.documentClassification}`,
        ko: `매물 개요 PDF를 출력했습니다: ${property.name} (${safeFormat}/${safeLanguage}) / doc=${documentNumber} / tpl=${activeTemplateVersion?.versionNumber ?? "n/a"} / class=${templateSettings.documentClassification}`,
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
  const quote = await getQuotationById(quoteId, tenantId);
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
      tenantId,
      userId: user.id,
      action: "output_validation_failed",
      targetType: "quote",
      targetId: quote.id,
      message: tr(locale, {
        ja: `生成チェックで不足項目が見つかりました: ${documentNumber}`,
        zh: `生成检查发现缺失项：${documentNumber}`,
        ko: `생성 점검에서 누락 항목이 발견되었습니다: ${documentNumber}`,
      }),
    });
    const withValidationFlash = withFlash(returnTo, "output_validation_failed");
    redirect(appendQuery(withValidationFlash, "issues", validationIssues.join(",")));
  }

  const partyLabel = quote.client?.name ?? quote.clientId;
  const title = `${getOutputDocLabel(safeLanguage, typeRaw)} - ${partyLabel}`;

  const generated = await addGeneratedOutput({
    tenantId,
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
    inputDataSnapshot: {
      quote: {
        id: quote.id,
        quoteTitle: quote.quoteTitle,
        listingPrice: quote.listingPrice,
        brokerageFee: quote.brokerageFee,
        taxFee: quote.taxFee,
        managementFee: quote.managementFee,
        repairFee: quote.repairFee,
        otherFee: quote.otherFee,
        downPayment: quote.downPayment,
        loanAmount: quote.loanAmount,
        interestRate: quote.interestRate,
        loanYears: quote.loanYears,
        monthlyPaymentEstimate: quote.monthlyPaymentEstimate,
        totalInitialCost: quote.totalInitialCost,
        monthlyTotalCost: quote.monthlyTotalCost,
        summaryText: quote.summaryText,
      },
      client: quote.client,
      property: quote.property,
      targetProperty: targetProperty || undefined,
      targetParty: targetParty || undefined,
    },
    draftValueSnapshot: {},
    fieldMappingSnapshot: {
      outputType: typeRaw,
      templateSettings,
    },
    layoutSnapshot: {
      templateVersionId: activeTemplateVersion?.id,
      templateVersionNumber: activeTemplateVersion?.versionNumber,
      settingsSnapshot: activeTemplateVersion?.settingsSnapshot,
    },
  });

  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "output_generated",
    targetType: "quote",
    targetId: quote.id,
    message: tr(locale, {
      ja: `帳票を出力しました: ${quote.quoteTitle} (${typeRaw}/${safeFormat}/${safeLanguage}) / doc=${documentNumber} / tpl=${activeTemplateVersion?.versionNumber ?? "n/a"} / class=${templateSettings.documentClassification}`,
      zh: `已输出文书：${quote.quoteTitle} (${typeRaw}/${safeFormat}/${safeLanguage}) / doc=${documentNumber} / tpl=${activeTemplateVersion?.versionNumber ?? "n/a"} / class=${templateSettings.documentClassification}`,
      ko: `문서를 출력했습니다: ${quote.quoteTitle} (${typeRaw}/${safeFormat}/${safeLanguage}) / doc=${documentNumber} / tpl=${activeTemplateVersion?.versionNumber ?? "n/a"} / class=${templateSettings.documentClassification}`,
    }),
  });

  revalidatePath("/");
  revalidatePath("/output-center");
  const withSuccessFlash = withFlash(returnTo, "output_generated");
  redirect(appendQuery(withSuccessFlash, "generatedOutputId", generated.id));
  */
}

export async function createQuotation(formData: FormData) {
  const session = await requireTenantSession({ permission: "record.update" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) {
    throw new Error("顧客IDは必須です。");
  }
  await ensureClientOwnership(clientId, session);
  const requestedPropertyId = String(formData.get("propertyId") ?? "").trim();
  if (requestedPropertyId) {
    const property = await resolvePropertyVisibilityForContext({ context: createRequestContext(session), propertyId: requestedPropertyId });
    if (!property.record || !property.resolution.canWrite) throw new Error("物件が見つからないか、関連付ける権限がありません。");
  }

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
    tenantId,
    clientId,
    propertyId: requestedPropertyId || undefined,
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
    tenantId,
    userId: user.id,
    action: "quote_created",
    targetType: "quote",
    targetId: quote.id,
    message: `提案を作成しました: ${quote.quoteTitle}`,
  });

  redirect(`/quotes/${quote.id}`);
}

export async function duplicateQuotationAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "record.update" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  if (!quoteId) {
    throw new Error("提案IDは必須です。");
  }
  const source = await getQuotationById(quoteId, tenantId);
  if (!source || !source.client) {
    throw new Error("提案が見つかりません。");
  }
  await ensureClientOwnership(source.client.id, session);
  if (source.propertyId) {
    const property = await resolvePropertyVisibilityForContext({ context: createRequestContext(session), propertyId: source.propertyId });
    if (!property.record || !property.resolution.canWrite) throw new Error("物件が見つからないか、関連付ける権限がありません。");
  }

  const duplicated = await duplicateQuotation(quoteId, tenantId);
  if (!duplicated) {
    throw new Error("提案が見つかりません。");
  }

  revalidatePath("/");
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quoteId}`);
  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "quote_duplicated",
    targetType: "quote",
    targetId: duplicated.id,
    message: `提案を複製しました: ${duplicated.quoteTitle}`,
  });

  redirect(`/quotes/${duplicated.id}`);
}

export async function changeQuotationStatus(formData: FormData) {
  const session = await requireTenantSession({ permission: "record.update" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  const status = String(formData.get("status") ?? "draft");

  if (!quoteId) {
    throw new Error("提案IDは必須です。");
  }
  if (!isQuoteStatus(status)) {
    throw new Error("ステータスの値が不正です。");
  }
  const quote = await getQuotationById(quoteId, tenantId);
  if (!quote || !quote.client) {
    throw new Error("提案が見つかりません。");
  }
  await ensureClientOwnership(quote.client.id, session);

  await updateQuotationStatus(quoteId, status, tenantId);

  revalidatePath("/");
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quoteId}`);
  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "quote_status_updated",
    targetType: "quote",
    targetId: quoteId,
    message: `提案ステータスを更新しました: ${status}`,
  });
}

async function assertNotLastActiveTenantOwner(input: {
  tenantId: string;
  changingMembershipId: string;
  nextRole?: TenantRole;
  nextCapability?: TenantCapabilityPreset;
  nextStatus?: "active" | "invited" | "suspended" | "removed";
}) {
  const members = await listTenantMembers(input.tenantId);
  const activeOwners = members.filter(
    (member) => member.status === "active" && member.role === "tenant_owner" && member.capability === "company_owner",
  );
  const target = members.find((member) => member.id === input.changingMembershipId);
  if (
    !target ||
    target.role !== "tenant_owner" ||
    target.capability !== "company_owner" ||
    target.status !== "active"
  ) return;
  const nextCapability = input.nextCapability ?? target.capability;
  const wouldRemainActiveOwner =
    (input.nextStatus ?? target.status) === "active" &&
    (input.nextRole ?? target.role) === "tenant_owner" &&
    nextCapability === "company_owner";
  if (!wouldRemainActiveOwner && activeOwners.length <= 1) {
    throw new Error("最后一名有效公司负责人不能降级或停用。");
  }
}

async function sendTenantMemberInvitation(input: {
  tenantId: string;
  membershipId: string;
  actorId: string;
  recordSkippedAsFailure: boolean;
}) {
  const prepared = await refreshTenantMemberInvitation({
    tenantId: input.tenantId,
    membershipId: input.membershipId,
    invitedByUserId: input.actorId,
  });
  if (!prepared) throw new Error("招待対象メンバーが見つかりません。");
  const member = prepared.member;

  const result = await createClerkInvitationForTenantMember(prepared).catch((error) => ({
    ok: false as const,
    skipped: false,
    reason: error instanceof Error ? error.message : String(error),
  }));
  if (result.ok) {
    try {
      const updated = await updateTenantMemberInvitation({
        tenantId: input.tenantId,
        membershipId: input.membershipId,
        memberContext: member,
        invitationProvider: "clerk",
        invitationStatus: "pending",
        providerInvitationId: result.providerInvitationId,
        invitationUrl: result.invitationUrl,
        sentAt: result.sentAt,
        actorUserId: input.actorId,
      });
      if (!updated) return { member, sent: false, skipped: false, uncertain: true };
      return { member: updated, sent: true, skipped: false, uncertain: false };
    } catch {
      // Clerk succeeded, but the atomic delivery+audit finalization did not.
      // Do not encourage a blind resend of an invitation that may exist.
      return { member, sent: false, skipped: false, uncertain: true };
    }
  }

  if (input.recordSkippedAsFailure || !result.skipped) {
    try {
      const updated = await updateTenantMemberInvitation({
        tenantId: input.tenantId,
        membershipId: input.membershipId,
        memberContext: member,
        invitationProvider: "clerk",
        invitationStatus: "failed",
        invitationError: result.reason,
        actorUserId: input.actorId,
      });
      if (!updated) return { member, sent: false, skipped: false, uncertain: true };
      return { member: updated, sent: false, skipped: result.skipped, uncertain: false };
    } catch {
      return { member, sent: false, skipped: false, uncertain: true };
    }
  }

  // Local/non-Clerk environments still expose the explicit acceptance path.
  // The invitation is pending, not active; a real Clerk delivery can replace
  // this provider record when configured.
  const pending = await updateTenantMemberInvitation({
    tenantId: input.tenantId,
    membershipId: input.membershipId,
    memberContext: member,
    invitationProvider: "manual",
    invitationStatus: "pending",
    invitationError: result.reason,
    sentAt: new Date(),
    actorUserId: input.actorId,
  });
  if (!pending) return { member, sent: false, skipped: false, uncertain: true };
  return { member: pending, sent: false, skipped: true, uncertain: false };
}

export type CreateTenantActionState = {
  status: "idle" | "error";
  message?: string;
  resetRequestKey?: boolean;
};

async function createTenantForCurrentUserCore(formData: FormData) {
  const user = await getDefaultUser();
  if (!user) throw new Error("登录身份尚未准备好，请重新登录后再试。");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("公司名称是必填项。");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();
  if (!idempotencyKey) throw new Error("创建请求已失效，请刷新后重试。");

  const result = await createTenantAccountForUser({
    userId: user.id,
    name,
    accountType: "company",
    idempotencyKey,
  });
  return { user, result };
}

async function persistTenantCreationSideEffects({ user, result }: Awaited<ReturnType<typeof createTenantForCurrentUserCore>>) {
  const store = await cookies();
  store.set(ACTIVE_TENANT_COOKIE_NAME, result.tenant.id, { httpOnly: true, sameSite: "lax", path: "/" });
  await addAuditLog({
    tenantId: result.tenant.id,
    userId: user.id,
    action: "tenant_account_created_by_owner",
    targetType: "tenant",
    targetId: result.tenant.id,
    message: `经营主体已创建: ${result.tenant.name}`,
    context: { membershipId: result.membership.id, role: result.membership.role },
  });
  revalidatePath("/workspace");
  revalidatePath("/");
}

/** Create a company for the currently authenticated user and enter it atomically. */
export async function createTenantForCurrentUserAction(formData: FormData) {
  await persistTenantCreationSideEffects(await createTenantForCurrentUserCore(formData));
  redirect("/");
}

function createTenantActionError(error: unknown): CreateTenantActionState {
  const message = error instanceof Error ? error.message : "";
  if (message === "公司名称是必填项。" || message === "tenant name is required") {
    return { status: "error", message: "公司名称是必填项。" };
  }
  if (message.includes("请求已失效") || message === "tenant idempotency key is required") {
    return { status: "error", message: "创建请求已失效，请刷新后重试。" };
  }
  if (message.includes("idempotency key was reused with different request data")) {
    return { status: "error", message: "创建内容已变化，请重新开始本次创建。", resetRequestKey: true };
  }
  return { status: "error", message: "创建公司失败，请稍后重试。" };
}

export async function createTenantForCurrentUserFormAction(
  _previousState: CreateTenantActionState,
  formData: FormData,
): Promise<CreateTenantActionState> {
  let creation: Awaited<ReturnType<typeof createTenantForCurrentUserCore>>;
  try {
    creation = await createTenantForCurrentUserCore(formData);
  } catch (error) {
    return createTenantActionError(error);
  }
  try {
    await persistTenantCreationSideEffects(creation);
  } catch {
    return { status: "error", message: "公司已创建，但进入工作区失败，请重试。" };
  }
  redirect("/");
}

export type TenantInvitationActionMessageToken =
  | "email_verification_required"
  | "invitation_identity_not_bound"
  | "invitation_email_mismatch"
  | "invitation_payload_invalid"
  | "invitation_unavailable"
  | "accepted_workspace_switch_failed"
  | "invitation_accept_failed";

export type TenantInvitationActionState = {
  status: "idle" | "error";
  message?: TenantInvitationActionMessageToken;
};

/** Explicitly accept one pending invitation after the Clerk identity has been bound by email. */
export async function acceptTenantInvitationAction(
  _previousState: TenantInvitationActionState,
  formData: FormData,
): Promise<TenantInvitationActionState> {
  let tenantId = "";
  let membershipId = "";
  let invitationAccepted = false;
  try {
    const identity = await getVerifiedClerkAuthIdentity();
    if (isClerkAuthEnabled() && !identity?.email) {
      return { status: "error", message: "email_verification_required" };
    }
    const user = await getDefaultUser();
    if (!user) {
      return { status: "error", message: "invitation_identity_not_bound" };
    }
    if (identity?.email && identity.email.toLowerCase() !== user.email.toLowerCase()) {
      return { status: "error", message: "invitation_email_mismatch" };
    }
    tenantId = String(formData.get("tenantId") ?? "").trim();
    membershipId = String(formData.get("membershipId") ?? "").trim();
    const invitationToken = String(formData.get("invitationToken") ?? "").trim();
    if (!tenantId || !membershipId || !invitationToken) {
      return { status: "error", message: "invitation_payload_invalid" };
    }

    const member = await acceptTenantInvitation({ userId: user.id, tenantId, membershipId, invitationToken });
    if (!member) {
      return { status: "error", message: "invitation_unavailable" };
    }
    invitationAccepted = true;
    const store = await cookies();
    store.set(ACTIVE_TENANT_COOKIE_NAME, tenantId, { httpOnly: true, sameSite: "lax", path: "/" });
    revalidatePath("/workspace");
    revalidatePath("/workspace/invitations");
  } catch {
    if (invitationAccepted) {
      return { status: "error", message: "accepted_workspace_switch_failed" };
    }
    return { status: "error", message: "invitation_accept_failed" };
  }
  redirect("/");
}

export async function createTenantAccountAction(formData: FormData) {
  const session = await requirePlatformOwnerSession();
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const accountType = parseTenantAccountType(formData.get("accountType"));
  const status = parseTenantLifecycleStatus(formData.get("status"));
  const purchasedSeatCount = parseNumber(formData.get("purchasedSeatCount"), 1);
  const serviceDates = validateTenantServicePeriod({
    serviceStartAt: String(formData.get("serviceStartAt") ?? "").trim() || undefined,
    serviceEndAt: String(formData.get("serviceEndAt") ?? "").trim() || undefined,
  });
  const ownerName = String(formData.get("ownerName") ?? "").trim();
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim();

  if (!name) throw new Error("テナント名は必須です。");
  if (!ownerEmail) throw new Error("初期オーナーのメールアドレスは必須です。");
  if (!Number.isInteger(purchasedSeatCount) || purchasedSeatCount < 1) {
    throw new Error("購入席数は 1 以上の整数で指定してください。");
  }

  const account = await createTenantAccount({
    name,
    slug: slug || undefined,
    accountType,
    status,
    purchasedSeatCount,
    ...serviceDates,
    actorUserId: session.user.id,
    ownerName,
    ownerEmail,
  });
  const ownerMembership = account.ownerMembers[0];
  let invitationFailed = false;
  let deliveryUncertain = false;
  if (ownerMembership && isTenantServiceOperational(deriveTenantServiceState(account))) {
    try {
      const delivery = await sendTenantMemberInvitation({
        tenantId: account.id,
        membershipId: ownerMembership.id,
        actorId: session.user.id,
        recordSkippedAsFailure: false,
      });
      invitationFailed = !delivery.sent && !delivery.skipped;
      deliveryUncertain = delivery.uncertain;
    } catch {
      invitationFailed = true;
    }
  }
  revalidatePath("/platform/accounts");
  redirect(`/platform/accounts?flash=${deliveryUncertain ? "invitation_delivery_uncertain" : invitationFailed ? "tenant_created_invitation_failed" : "tenant_created"}`);
}

export async function updateTenantAccountLifecycleAction(formData: FormData) {
  const session = await requirePlatformOwnerSession();
  const tenantId = String(formData.get("tenantId") ?? "").trim();
  const status = parseTenantLifecycleStatus(formData.get("status"));
  const purchasedSeatCount = parseNumber(formData.get("purchasedSeatCount"), 1);
  const serviceDates = validateTenantServicePeriod({
    serviceStartAt: String(formData.get("serviceStartAt") ?? "").trim() || undefined,
    serviceEndAt: String(formData.get("serviceEndAt") ?? "").trim() || undefined,
  });
  if (!tenantId) throw new Error("テナントIDが不正です。");
  if (!Number.isInteger(purchasedSeatCount) || purchasedSeatCount < 1) {
    throw new Error("購入席数は 1 以上の整数で指定してください。");
  }

  const account = await updateTenantAccountLifecycle({
    tenantId,
    status,
    purchasedSeatCount,
    ...serviceDates,
    actorUserId: session.user.id,
  });
  if (!account) throw new Error("テナントが見つかりません。");

  revalidatePath("/platform/accounts");
  redirect("/platform/accounts?flash=tenant_updated");
}

export async function sendPlatformTenantMemberInvitationAction(formData: FormData) {
  const session = await requirePlatformOwnerSession();
  const tenantId = String(formData.get("tenantId") ?? "").trim();
  const membershipId = String(formData.get("membershipId") ?? "").trim();
  if (!tenantId || !membershipId) throw new Error("招待対象が不正です。");
  const invitation = await sendTenantMemberInvitation({
    tenantId,
    membershipId,
    actorId: session.user.id,
    recordSkippedAsFailure: true,
  });
  revalidatePath("/platform/accounts");
  redirect(`/platform/accounts?flash=${invitation.uncertain ? "invitation_delivery_uncertain" : invitation.sent ? "invitation_sent" : "invitation_failed"}`);
}

export async function sendTenantMemberInvitationAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "member.invite" });
  const membershipId = String(formData.get("membershipId") ?? "").trim();
  if (!membershipId) throw new Error("招待対象が不正です。");
  const invitation = await sendTenantMemberInvitation({
    tenantId: session.tenant.id,
    membershipId,
    actorId: session.user.id,
    recordSkippedAsFailure: true,
  });
  revalidatePath("/settings/members");
  redirect(`/settings/members?flash=${invitation.uncertain ? "invitation_delivery_uncertain" : invitation.sent ? "invitation_sent" : "invitation_failed"}`);
}

export async function inviteTenantMemberAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "member.invite" });
  const tenantId = session.tenant.id;
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const capabilityPreset = parseTenantCapabilityPreset(formData.get("capabilityPreset"));
  const role = tenantRoleForCapabilityPreset(capabilityPreset);
  if (!email) throw new Error("メールアドレスは必須です。");

  const member = await inviteTenantMember({
    tenantId,
    name,
    email,
    role,
    status: "invited",
    capability: capabilityPreset,
    invitedByUserId: session.user.id,
  });
  const invitation = await sendTenantMemberInvitation({
    tenantId,
    membershipId: member.id,
    actorId: session.user.id,
    recordSkippedAsFailure: false,
  });
  if (invitation.uncertain) redirect("/settings/members?flash=invitation_delivery_uncertain");
  await addAuditLog({
    tenantId,
    userId: session.user.id,
    action: "member_invited",
    targetType: "member",
    targetId: member.id,
    message: `テナントメンバーを追加しました: ${member.user.email} / ${member.role}`,
    context: {
      memberUserId: member.userId,
      role: member.role,
      capabilityPreset,
      status: member.status,
    },
  });
  revalidatePath("/settings/members");
  redirect(`/settings/members?flash=${invitation.sent ? "member_invited" : invitation.skipped ? "member_invited_pending" : "member_invitation_failed"}`);
}

export async function updateTenantMemberRoleAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "member.update_role" });
  const tenantId = session.tenant.id;
  const membershipId = String(formData.get("membershipId") ?? "").trim();
  const capabilityPreset = parseTenantCapabilityPreset(formData.get("capabilityPreset"));
  const role = tenantRoleForCapabilityPreset(capabilityPreset);
  if (!membershipId) throw new Error("メンバーIDが不正です。");

  const isSelfOwnerDemotion =
    membershipId === session.membership.id &&
    session.membership.status === "active" &&
    session.membership.role === "tenant_owner" &&
    role !== "tenant_owner";
  if (isSelfOwnerDemotion && formData.get("confirmSelfDemotion") !== "true") {
    throw new Error("自分の会社責任者権限を変更する場合は、確認にチェックしてください。");
  }

  try {
    await assertNotLastActiveTenantOwner({
      tenantId,
      changingMembershipId: membershipId,
      nextRole: role,
      nextCapability: capabilityPreset,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "最后一名有效公司负责人不能降级或停用。") {
      redirect("/settings/members?flash=last_owner_protected");
    }
    throw error;
  }
  const member = await updateTenantMemberRole({ tenantId, membershipId, role, capability: capabilityPreset, actorUserId: session.user.id });
  if (!member) throw new Error("メンバーが見つかりません。");
  await addAuditLog({
    tenantId,
    userId: session.user.id,
    action: "member_role_updated",
    targetType: "member",
    targetId: member.id,
    message: `テナントメンバーのロールを更新しました: ${member.user.email} / ${member.role}`,
    context: {
      memberUserId: member.userId,
      role: member.role,
      capabilityPreset,
      status: member.status,
    },
  });
  revalidatePath("/settings/members");
  redirect("/settings/members?flash=member_role_updated");
}

export async function updateTenantMemberStatusAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "member.remove" });
  const tenantId = session.tenant.id;
  const membershipId = String(formData.get("membershipId") ?? "").trim();
  const rawStatus = String(formData.get("status") ?? "").trim();
  const status = rawStatus === "active" || rawStatus === "suspended" || rawStatus === "removed" ? rawStatus : undefined;
  if (!membershipId || !status) throw new Error("メンバー状態が不正です。");
  if (status === "active" || status === "suspended") {
    const target = await getTenantMemberById({ tenantId, membershipId });
    if (target?.status === "removed" && status === "suspended") {
      throw new Error("已移除成员必须重新邀请，不能直接转为停用成员。");
    }
    if (target?.status === "invited") {
      throw new Error("邀请成员必须使用邀请凭证明确接受，不能直接启用或停用。");
    }
    if (status === "active" && target?.status === "removed") {
      throw new Error("邀请成员必须使用邀请凭证明确接受；已移除成员必须重新邀请。");
    }
    if (((target?.status === "active" && status === "suspended")
        || (target?.status === "suspended" && status === "active"))
        && target.invitationStatus !== "accepted") {
      throw new Error("只有已接受邀请的成员可以停用或重新启用。");
    }
  }
  if (membershipId === session.membership.id && status !== "active") {
    throw new Error("現在の自分自身のメンバー権限は停止できません。");
  }

  try {
    await assertNotLastActiveTenantOwner({ tenantId, changingMembershipId: membershipId, nextStatus: status });
  } catch (error) {
    if (error instanceof Error && error.message === "最后一名有效公司负责人不能降级或停用。") {
      redirect("/settings/members?flash=last_owner_protected");
    }
    throw error;
  }
  const member = await updateTenantMemberStatus({ tenantId, membershipId, status, actorUserId: session.user.id });
  if (!member) throw new Error("メンバーが見つかりません。");
  await addAuditLog({
    tenantId,
    userId: session.user.id,
    action: status === "active" ? "member_reactivated" : status === "removed" ? "member_removed" : "member_suspended",
    targetType: "member",
    targetId: member.id,
    message: `テナントメンバー状態を更新しました: ${member.user.email} / ${member.status}`,
    context: {
      memberUserId: member.userId,
      role: member.role,
      status: member.status,
    },
  });
  revalidatePath("/settings/members");
  redirect(`/settings/members?flash=${status === "active" ? "member_reactivated" : status === "removed" ? "member_removed" : "member_suspended"}`);
}

export async function revokeTenantMemberInvitationAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "member.remove" });
  const membershipId = String(formData.get("membershipId") ?? "").trim();
  if (!membershipId) throw new Error("邀请对象不正确。");
  const member = await getTenantMemberById({ tenantId: session.tenant.id, membershipId });
  if (!member || member.status !== "invited") throw new Error("待处理的邀请不存在。");
  await updateTenantMemberInvitation({
    tenantId: session.tenant.id,
    membershipId,
    memberContext: member,
    invitationProvider: member.invitationProvider,
    invitationStatus: "revoked",
    invitationError: "revoked_by_company_owner",
    actorUserId: session.user.id,
  });
  await updateTenantMemberStatus({ tenantId: session.tenant.id, membershipId, status: "removed", actorUserId: session.user.id });
  await addAuditLog({
    tenantId: session.tenant.id,
    userId: session.user.id,
    action: "member_invitation_revoked",
    targetType: "member",
    targetId: membershipId,
    message: `成员邀请已撤销: ${member.user.email}`,
  });
  revalidatePath("/settings/members");
  redirect("/settings/members?flash=invitation_revoked");
}

export async function updateOutputTemplateSettingsAction(formData: FormData) {
  const session = await requireTenantSession({ permissions: ["template.edit_draft", "template.publish"] });
  const user = session.user;
  const tenantId = session.tenant.id;

  const current = await getOutputTemplateSettings(user.id, tenantId);
  const shouldResetToStandard = parseCheckbox(formData.get("resetToStandard"));
  const standard = getDefaultOutputTemplateSettings(user.id, tenantId);
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
    proposalTitle: current.proposalTitle,
    estimateSheetTitle: current.estimateSheetTitle,
    fundingPlanTitle: current.fundingPlanTitle,
    assumptionMemoTitle: current.assumptionMemoTitle,
    documentClassification: current.documentClassification,
    disclaimerLine1: current.disclaimerLine1,
    disclaimerLine2: current.disclaimerLine2,
    disclaimerLine3: current.disclaimerLine3,
    showApprovalSection: current.showApprovalSection,
    showLegalStatusDigest: current.showLegalStatusDigest,
    showOutstandingBalanceTable: current.showOutstandingBalanceTable,
  }, tenantId);

  await createOutputTemplateVersion({
    tenantId,
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
    tenantId,
    userId: user.id,
    action: "output_template_updated",
    targetType: "quote",
    targetId: settings.id,
    message: "標準出力テンプレート設定を更新しました。",
  });
}

export async function updateCaseWorkbenchFieldRulesAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "tenant.update_settings" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const submittedFieldKeys = String(formData.get("fieldKeysJson") ?? "").trim();
  let fieldKeys = CASE_WORKBENCH_FIELD_KEYS;

  if (submittedFieldKeys) {
    try {
      const parsed = JSON.parse(submittedFieldKeys);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((item): item is string => typeof item === "string" && isCaseWorkbenchFieldKey(item));
        if (filtered.length > 0) fieldKeys = filtered;
      }
    } catch {
      fieldKeys = CASE_WORKBENCH_FIELD_KEYS;
    }
  }

  const rules = fieldKeys.map((fieldKey) => ({
    fieldKey,
    requirement: normalizeCaseFieldRequirement(formData.get(`requirement:${fieldKey}`)) ?? "optional",
  }));

  const updated = await updateCaseWorkbenchFieldRules(user.id, rules, tenantId);

  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "case_workbench_field_rules_updated",
    targetType: "case",
    message: "情報整理の項目ルールを更新しました。",
    context: {
      ruleCount: updated.length,
      requiredCount: updated.filter((rule) => rule.requirement === "required").length,
    },
  });

  revalidatePath("/settings/case-workbench-fields");
  revalidatePath("/organize-center");
  revalidatePath("/cases/[id]", "page");
  redirect("/settings/case-workbench-fields?flash=rules_saved");
}

export async function applyOutputTemplateVersionAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "template.rollback" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const versionId = String(formData.get("versionId") ?? "").trim();
  const confirmApply = parseCheckbox(formData.get("confirmApply"));
  if (!versionId) {
    throw new Error("適用対象バージョンが未指定です。");
  }
  if (!confirmApply) {
    throw new Error("版適用前の確認チェックが未完了です。");
  }

  const applied = await applyOutputTemplateVersion({
    tenantId,
    userId: user.id,
    versionId,
  });
  if (!applied) {
    throw new Error("テンプレート記録が見つかりません。");
  }

  revalidatePath("/");
  revalidatePath("/quotes");
  revalidatePath("/settings/output-templates");
  revalidatePath("/templates");
  revalidatePath("/quotes/[id]");
  revalidatePath("/quotes/[id]/print");

  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "output_template_version_applied",
    targetType: "quote",
    targetId: versionId,
    message: `テンプレート記録を適用しました: ${versionId}`,
  });
}

function isAiExperienceDraftStatus(value: string): value is AiExperienceDraftStatus {
  return value === "draft" || value === "approved" || value === "rejected";
}

export async function draftAiExperiencesAction() {
  const session = await requireTenantSession({ permission: "ai.experience_review" });
  const user = session.user;
  const tenantId = session.tenant.id;

  const result = await draftAiExperiencesFromRecentCorrections({
    userId: user.id,
    tenantId,
    limit: 200,
    minEventsPerDraft: 2,
  });

  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "ai_experience_drafts_generated",
    targetType: "ai_experience",
    message: `入力ルール提案を作成しました: ${result.createdDrafts.length}件`,
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
  const session = await requireTenantSession({ permission: "ai.experience_review" });
  const user = session.user;
  const tenantId = session.tenant.id;

  const draftId = String(formData.get("draftId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!draftId) throw new Error("入力ルール提案IDが不正です。");
  if (!isAiExperienceDraftStatus(status) || status === "draft") {
    throw new Error("入力ルール提案の審査ステータスが不正です。");
  }

  const updated = await updateAiExperienceDraftStatus({
    userId: user.id,
    tenantId,
    draftId,
    status,
  });
  if (!updated) throw new Error("入力ルール提案が見つかりません。");

  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "ai_experience_draft_reviewed",
    targetType: "ai_experience",
    targetId: updated.id,
    message: `入力ルール提案を${status === "approved" ? "承認" : "却下"}しました: ${updated.title}`,
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

// ─── Excel 物件一括保存 ────────────────────────────────────────────

type ExcelImportPayload = {
  kind?: "property_row_import" | "input_file_extraction";
  headers: string[];
  autoMapping: Record<string, string>;
  rows: Record<string, unknown>[];
  originalFilename: string;
  totalRows: number;
  inputExtraction?: InputFileExtractionResult;
  targetCaseId?: string;
};

type ExtractionReviewDecision = {
  fieldId: string;
  reviewStatus: ExtractionReviewStatus;
  editedValue?: string;
};

const WORKBENCH_FIELD_STATUS_KEY = "__workbenchFieldStatuses";

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

function getCaseWorkbenchFieldDecision(formData: FormData, fieldKey: string): "confirmed" | "unknown" | "not_applicable" | "rejected" {
  const decision = String(formData.get(`status:${fieldKey}`) ?? "confirmed").trim();
  if (decision === "unknown" || decision === "not_applicable" || decision === "rejected") return decision;
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

function safeWorkbenchFieldToken(value: FormDataEntryValue | null): string {
  const token = String(value ?? "").trim();
  return isCaseWorkbenchFieldKey(token) || isKnownCaseFieldKey(token) ? token : "";
}

function safeScrollTop(value: FormDataEntryValue | null): string {
  const token = String(value ?? "").trim();
  return /^\d+$/.test(token) ? token : "";
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

function formatCaseTitleDate(date: Date) {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

export async function createBlankBrokerageCaseAction(
  _previousState: CaseCreationActionState,
  formData: FormData,
): Promise<CaseCreationActionState> {
  try {
  const session = await requireTenantSession({ permission: "case.create" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const locale = await getLocale();
  await rejectForbiddenRecordInput(formData, session, "case");
  const requestedTitle = String(formData.get("caseTitle") ?? "").trim();
  const workflowType = String(formData.get("workflowType") ?? "").trim();
  let associationDraft: CaseAssociationDraft;
  try {
    const rawDraft = String(formData.get("associationDraftJson") ?? "").trim();
    associationDraft = rawDraft
      ? normalizeCaseAssociationDraft(JSON.parse(rawDraft))
      : normalizeCaseAssociationDraft({
          parties: String(formData.get("primaryPartyId") ?? "").trim()
            ? [{ partyId: String(formData.get("primaryPartyId") ?? "").trim(), roles: ["主要申请人"] }]
            : [],
          primaryPropertyId: String(formData.get("primaryPropertyId") ?? "").trim() || undefined,
        });
  } catch {
    throw new Error("案件草稿格式不正确，请重新选择资料。");
  }
  const associationError = validateCaseAssociationDraft(associationDraft);
  if (associationError) throw new Error(associationError);
  const requestContext = createRequestContext(session);
  const partyResults = await Promise.all(
    associationDraft.parties.map((party) => resolveClientVisibilityForContext({ context: requestContext, clientId: party.partyId })),
  );
  if (partyResults.some((result) => !result.record || !result.resolution.canWrite)) {
    throw new Error("选择的人物不存在或当前用户无法使用。");
  }
  const propertyResult = associationDraft.primaryPropertyId
    ? await resolvePropertyVisibilityForContext({ context: requestContext, propertyId: associationDraft.primaryPropertyId })
    : null;
  if (associationDraft.primaryPropertyId && (!propertyResult?.record || !propertyResult.resolution.canWrite)) {
    throw new Error("选择的物件不存在或当前用户无法使用。");
  }
  const primaryPartyId = getPrimaryPartyId(associationDraft);
  const primaryParty = primaryPartyId
    ? partyResults[associationDraft.parties.findIndex((party) => party.partyId === primaryPartyId)]?.record
    : undefined;
  const primaryProperty = propertyResult?.record;
  const today = formatCaseTitleDate(new Date());
  const defaultTitle = tr(locale, {
    ja: `新規案件 ${today}`,
    zh: `新开案件 ${today}`,
    ko: `새 안건 ${today}`,
  });
  const relationshipTitle = [primaryParty?.name, primaryProperty?.name].filter(Boolean).join(" / ");
  const initialConfirmedData = writeCaseAssociationData(
    {},
    associationDraft,
    { primaryPartyName: primaryParty?.name, propertyName: primaryProperty?.name },
  );
  if (workflowType) {
    initialConfirmedData.__workflowType = workflowType;
  }

  const brokerageCase = await saveBrokerageCaseExtractionReview({
    tenantId,
    userId: user.id,
    caseType: "unit_sale",
    caseTitle: requestedTitle || relationshipTitle || defaultTitle,
    primaryPropertyId: associationDraft.primaryPropertyId,
    status: "draft",
    confirmedDataJson: initialConfirmedData,
    sourceImportJobIds: [],
    reviewItems: [],
  });

  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "case_created_blank",
    targetType: "case",
    targetId: brokerageCase.id,
    message: tr(locale, {
      ja: `空の案件を作成しました: ${brokerageCase.caseTitle}`,
      zh: `已创建空案件：${brokerageCase.caseTitle}`,
      ko: `빈 안건을 만들었습니다: ${brokerageCase.caseTitle}`,
    }),
    context: {
      source: "case_create_flow",
      primaryPartyId,
      primaryPropertyId: associationDraft.primaryPropertyId,
      associatedPartyIds: associationDraft.parties.map((party) => party.partyId),
      workflowType,
    },
  });

  revalidatePath("/import-center");
  revalidatePath("/organize-center");
  revalidatePath(`/cases/${brokerageCase.id}`);
    redirect(`/cases/${encodeURIComponent(brokerageCase.id)}?flash=blank_case_created`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      status: "error",
      message: error instanceof Error ? error.message : "案件保存失败，请保留当前草稿后重试。",
    };
  }
}

export async function saveCaseAssociationsAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "record.update" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const caseId = String(formData.get("caseId") ?? "").trim();
  await rejectForbiddenRecordInput(formData, session, "case", caseId || undefined);
  if (!caseId) throw new Error("案件IDが不正です。");

  let associationDraft: CaseAssociationDraft;
  try {
    associationDraft = normalizeCaseAssociationDraft(JSON.parse(String(formData.get("associationDraftJson") ?? "{}")));
  } catch {
    throw new Error("案件资料草稿格式不正确，请重新操作。");
  }
  const associationError = validateCaseAssociationDraft(associationDraft);
  if (associationError) throw new Error(associationError);

  const brokerageCase = await requireWritableCase(session, caseId);
  const requestContext = createRequestContext(session);
  const partyResults = await Promise.all(
    associationDraft.parties.map((party) => resolveClientVisibilityForContext({ context: requestContext, clientId: party.partyId })),
  );
  if (partyResults.some((result) => !result.record || !result.resolution.canWrite)) {
    throw new Error("选择的人物不存在或当前用户无法使用。");
  }
  const propertyResult = associationDraft.primaryPropertyId
    ? await resolvePropertyVisibilityForContext({ context: requestContext, propertyId: associationDraft.primaryPropertyId })
    : null;
  if (associationDraft.primaryPropertyId && (!propertyResult?.record || !propertyResult.resolution.canWrite)) {
    throw new Error("选择的物件不存在或当前用户无法使用。");
  }

  const primaryPartyId = getPrimaryPartyId(associationDraft);
  const primaryParty = primaryPartyId
    ? partyResults[associationDraft.parties.findIndex((party) => party.partyId === primaryPartyId)]?.record
    : undefined;
  const nextConfirmedData = writeCaseAssociationData(
    brokerageCase.confirmedDataJson,
    associationDraft,
    { primaryPartyName: primaryParty?.name, propertyName: propertyResult?.record?.name },
  );
  const updatedCase = await updateBrokerageCaseConfirmedData({
    userId: user.id,
    tenantId,
    caseId,
    confirmedDataJson: nextConfirmedData,
    primaryPropertyId: associationDraft.primaryPropertyId ?? null,
  });
  if (!updatedCase) throw new Error("案件が見つからないか、保存できませんでした。");

  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "case_associations_updated",
    targetType: "case",
    targetId: caseId,
    message: "案件资料关联已更新。",
    context: {
      associatedPartyIds: associationDraft.parties.map((party) => party.partyId),
      primaryPropertyId: associationDraft.primaryPropertyId,
    },
  });
  revalidatePath(`/cases/${encodeURIComponent(caseId)}`);
  revalidatePath("/organize-center");
  redirect(`/cases/${encodeURIComponent(caseId)}?flash=case_associations_updated`);
}

export async function saveCaseWorkbenchAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "record.update" });
  const user = session.user;
  const tenantId = session.tenant.id;

  const caseId = String(formData.get("caseId") ?? "").trim();
  await rejectForbiddenRecordInput(formData, session, "case", caseId || undefined);
  if (!caseId) throw new Error("案件IDが不正です。");
  const brokerageCase = await requireWritableCase(session, caseId);
  const [reviewItems, fieldRules] = await Promise.all([
    listExtractionReviewItems({ userId: user.id, tenantId, caseId }),
    listCaseWorkbenchFieldRules(user.id, tenantId),
  ]);
  const ruleMap = buildCaseWorkbenchRuleMap(fieldRules);
  const progressBefore = getCaseWorkbenchProgressSnapshot({
    confirmedData: brokerageCase.confirmedDataJson,
    reviewItems,
    ruleMap,
  });

  const nextConfirmedData: Record<string, unknown> = { ...brokerageCase.confirmedDataJson };
  const existingStatusMap =
    nextConfirmedData[WORKBENCH_FIELD_STATUS_KEY] && typeof nextConfirmedData[WORKBENCH_FIELD_STATUS_KEY] === "object"
      ? { ...(nextConfirmedData[WORKBENCH_FIELD_STATUS_KEY] as Record<string, string>) }
      : {};

  const fieldKeysToSave = getCaseWorkbenchFieldKeysFromForm(formData);
  const useCandidateFieldKey = String(formData.get("useCandidateField") ?? "").trim();
  const saveMode = String(formData.get("saveMode") ?? "").trim();
  const shouldBatchUseCandidates = saveMode === "confirm_visible_candidates" || saveMode === "confirm_trusted_candidates";
  const returnAnchor = safeHashAnchor(formData.get("returnAnchor"));
  const returnView = safeQueryToken(formData.get("returnView"));
  const returnScrollTop = safeScrollTop(formData.get("returnScrollTop"));
  const invalidPostalFieldKey = fieldKeysToSave.find((fieldKey) => {
    if (getCaseFieldDefinition(fieldKey)?.valueKind !== "postal_code") return false;
    const rawValue = String(formData.get(`field:${fieldKey}`) ?? "").trim();
    const candidateValue = String(formData.get(`candidate:${fieldKey}`) ?? "").trim();
    const nextValue = (fieldKey === useCandidateFieldKey || shouldBatchUseCandidates) && candidateValue ? candidateValue : rawValue;
    return Boolean(nextValue) && !isValidJapanesePostalCode(nextValue);
  });
  if (invalidPostalFieldKey) {
    const invalidParams = new URLSearchParams();
    if (returnView) invalidParams.set("view", returnView);
    invalidParams.set("flash", "case_field_invalid");
    invalidParams.set("field", invalidPostalFieldKey);
    if (returnScrollTop) invalidParams.set("scrollTop", returnScrollTop);
    redirect(`/cases/${caseId}?${invalidParams.toString()}${returnAnchor ? `#${returnAnchor}` : ""}`);
  }
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
    if (decision === "unknown" || decision === "not_applicable" || decision === "rejected") {
      clearCaseFieldValueAliases(nextConfirmedData, fieldKey);
      existingStatusMap[fieldKey] = decision;
      return;
    }

    if (nextValue) {
      nextConfirmedData[fieldKey] = nextValue;
      if (nextValue !== previousValue) {
        existingStatusMap[fieldKey] = previousValue ? "edited" : "confirmed";
      } else if (existingStatusMap[fieldKey] !== "confirmed" && existingStatusMap[fieldKey] !== "edited") {
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
  const progressAfter = getCaseWorkbenchProgressSnapshot({
    confirmedData: nextConfirmedData,
    reviewItems,
    ruleMap,
  });
  const progressGain = Math.max(0, progressBefore.open - progressAfter.open);
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
    tenantId,
    caseId,
    confirmedDataJson: nextConfirmedData,
  });
  if (!updatedCase) throw new Error("案件の保存に失敗しました。");

  const correctionEvents = await addCorrectionEvents({
    userId: user.id,
    tenantId,
    events: correctionEventDrafts,
  });

  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "case_workbench_saved",
    targetType: "import_job",
    targetId: caseId,
    message: `案件ワークベンチを保存しました: ${updatedCase.caseTitle}`,
    context: {
      caseId,
      confirmedFieldCount: Object.keys(nextConfirmedData).filter((key) => !key.startsWith("__")).length,
      progressCompletedBefore: progressBefore.completed,
      progressCompletedAfter: progressAfter.completed,
      progressOpenBefore: progressBefore.open,
      progressOpenAfter: progressAfter.open,
      progressGain,
      postalCodeLookupCount: postalCompletionResult.lookupCount,
      postalCodeConflictCount: postalCompletionResult.conflictCount,
      correctionEventCount: correctionEvents.length,
      correctionEventIds: correctionEvents.map((event) => event.id),
    },
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/output-center");
  const guaranteeTemplate = safeQueryToken(formData.get("guaranteeTemplate"));
  const returnNode = safeQueryToken(formData.get("returnNode"));
  const returnField = safeWorkbenchFieldToken(formData.get("returnField"));
  const redirectParams = new URLSearchParams();
  if (guaranteeTemplate) redirectParams.set("guaranteeTemplate", guaranteeTemplate);
  if (returnNode) redirectParams.set("node", returnNode);
  if (returnField) redirectParams.set("field", returnField);
  if (returnView) redirectParams.set("view", returnView);
  if (returnScrollTop) redirectParams.set("scrollTop", returnScrollTop);
  redirectParams.set("flash", "case_workbench_saved");
  if (progressGain > 0) {
    redirectParams.set("progressFrom", String(progressBefore.percent));
    redirectParams.set("progressGain", String(progressGain));
  }
  redirect(`/cases/${caseId}?${redirectParams.toString()}${returnAnchor ? `#${returnAnchor}` : ""}`);
}

export async function saveCaseApplicabilityAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "record.update" });
  const user = session.user;
  const tenantId = session.tenant.id;

  const caseId = String(formData.get("caseId") ?? "").trim();
  await rejectForbiddenRecordInput(formData, session, "case", caseId || undefined);
  if (!caseId) throw new Error("案件IDが不正です。");
  const brokerageCase = await requireWritableCase(session, caseId);

  const [reviewItems, fieldRules] = await Promise.all([
    listExtractionReviewItems({ userId: user.id, tenantId, caseId }),
    listCaseWorkbenchFieldRules(user.id, tenantId),
  ]);
  const ruleMap = buildCaseWorkbenchRuleMap(fieldRules);
  const progressBefore = getCaseWorkbenchProgressSnapshot({
    confirmedData: brokerageCase.confirmedDataJson,
    reviewItems,
    ruleMap,
  });
  const parsedSettings = parseCaseApplicabilitySettings(formData);
  const nextSettings = {
    ...readCaseApplicabilitySettings(brokerageCase.confirmedDataJson),
    ...parsedSettings,
  };
  const nextConfirmedData = writeCaseApplicabilitySettings(brokerageCase.confirmedDataJson, nextSettings);
  const progressAfter = getCaseWorkbenchProgressSnapshot({
    confirmedData: nextConfirmedData,
    reviewItems,
    ruleMap,
  });
  const progressGain = Math.max(0, progressBefore.open - progressAfter.open);

  const updatedCase = await updateBrokerageCaseConfirmedData({
    userId: user.id,
    tenantId,
    caseId,
    confirmedDataJson: nextConfirmedData,
  });
  if (!updatedCase) throw new Error("案件条件の保存に失敗しました。");

  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "case_applicability_saved",
    targetType: "case",
    targetId: caseId,
    message: `案件条件を保存しました: ${updatedCase.caseTitle}`,
    context: {
      caseId,
      settings: nextSettings,
      progressCompletedBefore: progressBefore.completed,
      progressCompletedAfter: progressAfter.completed,
      progressOpenBefore: progressBefore.open,
      progressOpenAfter: progressAfter.open,
      progressGain,
    },
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/organize-center");
  const returnNode = safeQueryToken(formData.get("returnNode"));
  const redirectParams = new URLSearchParams();
  if (returnNode) redirectParams.set("node", returnNode);
  redirectParams.set("flash", "case_applicability_saved");
  if (progressGain > 0) {
    redirectParams.set("progressFrom", String(progressBefore.percent));
    redirectParams.set("progressGain", String(progressGain));
  }
  redirect(`/cases/${caseId}?${redirectParams.toString()}#case-applicability-settings`);
}

export async function saveGuaranteeApplicationDraftAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "output.update_draft" });
  const user = session.user;
  const tenantId = session.tenant.id;

  const caseId = String(formData.get("caseId") ?? "").trim();
  if (!caseId) throw new Error("案件IDが不正です。");
  const templateId = String(formData.get("templateId") ?? FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID).trim() || FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID;
  const template = findGuaranteeCompanyTemplate(templateId);
  if (!template) throw new Error("保証会社テンプレートが見つかりません。");

  const brokerageCase = await requireWritableCase(session, caseId);

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
    tenantId,
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

  const previousDraft = await getGuaranteeApplicationDraft({ userId: user.id, tenantId, caseId, templateId: template.id });
  const draft = await saveGuaranteeApplicationDraft({
    userId: user.id,
    tenantId,
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
    tenantId,
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
    tenantId,
    userId: user.id,
    action: "guarantee_application_draft_saved",
    targetType: "import_job",
    targetId: caseId,
    message: `${template.companyDisplayName}申込書追加情報を保存しました: ${brokerageCase.caseTitle}`,
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
    `/guarantee-applications/${encodeURIComponent(template.id)}/preview?caseId=${encodeURIComponent(caseId)}&flash=guarantee_draft_saved#company-draft-fields`,
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

type GuaranteePreviewSaveMode = "case" | "template";

export async function saveGuaranteeApplicationPreviewAction(formData: FormData) {
  return saveGuaranteeApplicationPreviewWithScope(formData, "case");
}

export async function saveGuaranteeApplicationTemplateCalibrationAction(formData: FormData) {
  return saveGuaranteeApplicationPreviewWithScope(formData, "template");
}

export async function installGuaranteeTemplateForTenantAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "template.copy_official" });
  const templateId = String(formData.get("templateId") ?? "").trim();
  const template = findGuaranteeCompanyTemplate(templateId);
  if (!template || template.outputStatus !== "active") {
    throw new Error("利用可能な公式テンプレートが見つかりません。");
  }

  // Deliberately resolve without tenant scope. Installing always snapshots the
  // current official release, never an existing tenant copy.
  const source = await resolveGuaranteeTemplateLayout(template.id);
  const isInMemoryDevelopment =
    !isProductionRuntime() &&
    !(process.env.DATA_DRIVER?.toLowerCase() === "postgres" && process.env.DATABASE_URL);
  if (source.source !== "published" && !isInMemoryDevelopment) {
    throw new Error("公式テンプレートの公開版が未設定です。公開版を作成してから追加してください。");
  }
  const installed = await installGuaranteeTemplateForTenant({
    tenantId: session.tenant.id,
    templateId: template.id,
    sourceLayoutVersionId: source.versionId,
    sourceVersionNumber: source.versionNumber,
    sourceAssetFingerprint: source.snapshot.assetFingerprint ?? "",
    displayName: `${template.companyDisplayName} ${template.templateDisplayName}`,
    layoutSnapshot: source.snapshot,
    installedByUserId: session.user.id,
  });

  await addAuditLog({
    tenantId: session.tenant.id,
    userId: session.user.id,
    action: "guarantee_template_installed",
    targetType: "template",
    targetId: installed.id,
    message: `${template.companyDisplayName}の公式テンプレート v${source.versionNumber} をワークスペースへ追加しました。`,
    context: {
      templateId: template.id,
      sourceLayoutVersionId: source.versionId,
      sourceVersionNumber: source.versionNumber,
      tenantRevisionNumber: installed.revisionNumber,
    },
  });

  revalidatePath("/templates");
  revalidatePath("/output-center");
  revalidatePath(`/guarantee-applications/${template.id}/preview`);
  redirect(`/templates?template=${encodeURIComponent(template.id)}&flash=template_installed`);
}

export async function copyOfficialGuaranteeTemplateToCompanyAction(formData: FormData) {
  const session = await requireTenantSession({ permissions: ["template.copy_official", "template.edit_draft"] });
  if (!isGuaranteeSlice1EnabledForTenant(session.tenant.id)) {
    throw new Error("会社テンプレート編集はこのワークスペースで有効になっていません。");
  }
  const templateId = String(formData.get("templateId") ?? "").trim();
  const template = findGuaranteeCompanyTemplate(templateId);
  if (!template || template.outputStatus !== "active") {
    throw new Error("利用可能な公式テンプレートが見つかりません。");
  }

  const source = await resolveGuaranteeTemplateLayout(template.id);
  if (source.source !== "published" && isProductionRuntime()) {
    throw new Error("公式テンプレートの公開版が未設定です。");
  }
  const sourcePlatformMaskId = `official:${template.id}:${source.versionId}`;
  const existing = (await listGuaranteeCompanyMaskVersions({ tenantId: session.tenant.id }))
    .find((version) => version.sourcePlatformMaskId === sourcePlatformMaskId);
  if (existing) {
    redirect(`/guarantee-forms/${encodeURIComponent(existing.blankFormId)}/edit?blankFormVersionId=${encodeURIComponent(existing.blankFormVersionId)}&maskId=${encodeURIComponent(existing.maskId)}&flash=official_template_copy_reused`);
  }

  const companyCopy = await buildOfficialTemplateCompanyCopy({
    templateId: template.id,
    layout: source.snapshot,
  });
  const blankForm = await createGuaranteeBlankForm({
    tenantId: session.tenant.id,
    userId: session.user.id,
    name: `${template.companyDisplayName} ${template.templateDisplayName}（公司副本）`,
    recipientOrPurpose: `官方模板 ${template.id} v${source.versionNumber} 的公司编辑副本`,
  });
  const attachment = await addPrivateAttachment({
    tenantId: session.tenant.id,
    userId: session.user.id,
    targetType: "guarantee_blank_form",
    targetId: blankForm.id,
    fileName: `${template.id}-company-copy.pdf`,
    fileType: "application/pdf",
    content: companyCopy.pdfBytes,
  });
  const blankVersion = await addGuaranteeBlankFormVersion({
    tenantId: session.tenant.id,
    blankFormId: blankForm.id,
    attachmentId: attachment.id,
    uploadedByUserId: session.user.id,
    sha256: companyCopy.sha256,
    fileSizeBytes: companyCopy.pdfBytes.length,
    pageCount: 1,
    pageWidth: companyCopy.pageWidth,
    pageHeight: companyCopy.pageHeight,
    status: "ready",
  });
  const mask = await createGuaranteeCompanyMask({
    tenantId: session.tenant.id,
    blankFormId: blankForm.id,
    userId: session.user.id,
  });
  const maskVersion = await addGuaranteeCompanyMaskVersion({
    tenantId: session.tenant.id,
    maskId: mask.id,
    blankFormVersionId: blankVersion.id,
    userId: session.user.id,
    fieldCatalogVersion: "official-company-copy-v1",
    layoutSnapshot: {
      coordinateSystem: "pdf_points_bottom_left_v1",
      fields: companyCopy.fields,
      provenance: {
        sourceType: "official_template",
        templateId: template.id,
        sourceVersionId: source.versionId,
        sourceVersionNumber: source.versionNumber,
      },
    },
    status: "draft",
    sourcePlatformMaskId,
  });

  await addAuditLog({
    tenantId: session.tenant.id,
    userId: session.user.id,
    action: "official_template_copied_to_company",
    targetType: "template",
    targetId: maskVersion.id,
    message: `${template.companyDisplayName}の公式テンプレート v${source.versionNumber} を会社テンプレート草稿へコピーしました。`,
    context: {
      templateId: template.id,
      sourceVersionId: source.versionId,
      sourceVersionNumber: source.versionNumber,
      blankFormId: blankForm.id,
      maskId: mask.id,
      maskVersionId: maskVersion.id,
      copiedFieldCount: companyCopy.fields.length,
    },
  });

  revalidatePath("/templates");
  revalidatePath("/guarantee-forms");
  redirect(`/guarantee-forms/${encodeURIComponent(blankForm.id)}/edit?blankFormVersionId=${encodeURIComponent(blankVersion.id)}&maskId=${encodeURIComponent(mask.id)}&flash=official_template_copied`);
}

async function saveGuaranteeApplicationPreviewWithScope(
  formData: FormData,
  saveMode: GuaranteePreviewSaveMode,
) {
  const session = await requireTenantSession({ permission: "output.update_draft" });
  if (saveMode === "template") {
    await requirePlatformOwnerSession();
    assertTenantPermission(session, "template.edit_draft");
    assertTenantPermission(session, "template.publish");
  }
  const user = session.user;
  const tenantId = session.tenant.id;

  const caseId = String(formData.get("caseId") ?? "").trim();
  if (!caseId && saveMode !== "template") throw new Error("案件IDが不正です。");
  const templateId = String(formData.get("templateId") ?? FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID).trim() || FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID;
  const template = findGuaranteeCompanyTemplate(templateId);
  if (!template) throw new Error("保証会社テンプレートが見つかりません。");
  const getTemplateEditorRedirectHref = (flash: "template_layout_unchanged" | "template_layout_saved") => {
    const redirectParams = new URLSearchParams({ flash });
    if (caseId) redirectParams.set("caseId", caseId);
    return `/platform/templates/${encodeURIComponent(template.id)}?${redirectParams.toString()}`;
  };

  const brokerageCase = caseId ? await requireWritableCase(session, caseId) : null;
  const previousDraft = brokerageCase
    ? await getGuaranteeApplicationDraft({ userId: user.id, tenantId, caseId, templateId: template.id })
    : null;
  const previousLayoutOverrides = brokerageCase
    ? getFriendsGuaranteeEffectiveLayoutOverrides({
        templateId: template.id,
        confirmedDataJson: brokerageCase.confirmedDataJson,
      })
    : {};
  const previousCustomOverlayFields = brokerageCase
    ? getFriendsGuaranteeCustomOverlayFields({
        templateId: template.id,
        confirmedDataJson: brokerageCase.confirmedDataJson,
      })
    : [];

  const nextConfirmedData: Record<string, unknown> = brokerageCase ? { ...brokerageCase.confirmedDataJson } : {};
  const existingStatusMap =
    nextConfirmedData[WORKBENCH_FIELD_STATUS_KEY] && typeof nextConfirmedData[WORKBENCH_FIELD_STATUS_KEY] === "object"
      ? { ...(nextConfirmedData[WORKBENCH_FIELD_STATUS_KEY] as Record<string, string>) }
      : {};

  const submittedPreviewCaseFieldKeys = brokerageCase ? getSubmittedGuaranteePreviewCaseFieldKeys(formData) : [];
  if (brokerageCase) {
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
  }
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
  // The server action chooses the scope. Hidden form fields must never grant template authority.
  const layoutSaveScope = saveMode;
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

  if (layoutSaveScope === "template") {
    const layoutDirty = formData.get("layoutDirty") === "true";
    if (!layoutDirty) {
      redirect(getTemplateEditorRedirectHref("template_layout_unchanged"));
    }
    if (typeof layoutOverridesInput === "string") {
      const baselineSnapshot = (await resolveGuaranteeTemplateLayout(template.id)).snapshot;
      const published = await publishGuaranteeTemplateLayoutVersion({
        templateId: template.id,
        baselineVersion: baselineSnapshot.baselineVersion,
        assetFingerprint: baselineSnapshot.assetFingerprint ?? "",
        layoutSnapshot: {
          templateId: template.id,
          baselineVersion: baselineSnapshot.baselineVersion,
          assetFingerprint: baselineSnapshot.assetFingerprint,
          layoutOverrides,
          deletedOverlayFieldKeys,
          customOverlayFields: customFieldsSubmitted ? customOverlayFields : baselineSnapshot.customOverlayFields,
        },
        publishedByUserId: user.id,
        changeNote: `公式配置を更新 (${Object.keys(layoutOverrides).length}枠)`,
      });

      await addAuditLog({
        tenantId,
        userId: user.id,
        action: "guarantee_template_layout_published",
        targetType: "official_template",
        targetId: published.id,
        message: `${template.companyDisplayName}の公式テンプレート配置 v${published.versionNumber} を公開しました。`,
        context: {
          templateId: template.id,
          versionNumber: published.versionNumber,
          assetFingerprint: published.assetFingerprint,
        },
      });
    }

    await addAuditLog({
      tenantId,
      userId: user.id,
      action: "guarantee_template_layout_saved",
      targetType: "official_template",
      targetId: template.id,
      message: `${template.companyDisplayName}の公式テンプレート配置を公開しました。`,
      context: {
        templateId: template.id,
        layoutOverrideCount: Object.keys(layoutOverrides).length,
        deletedOverlayFieldCount: deletedOverlayFieldKeys.length,
        customOverlayFieldCount: customOverlayFields.length,
        layoutDirty,
      },
    });

    revalidatePath(`/platform/templates/${template.id}`);
    revalidatePath("/platform/templates");
    revalidatePath(`/guarantee-applications/${template.id}/preview`);
    redirect(getTemplateEditorRedirectHref("template_layout_saved"));
  }

  if (!brokerageCase || !caseId) throw new Error("案件IDが不正です。");

  const nextCaseCustomOverlayFields = setFriendsGuaranteeCaseCustomOverlayFields({
    currentValue: nextConfirmedData[FRIENDS_GUARANTEE_CUSTOM_FIELDS_KEY],
    templateId: template.id,
    fields: customOverlayFields,
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
  if (typeof layoutOverridesInput === "string" && layoutDirty) {
    if (hasFriendsGuaranteeLayoutOverrides(layoutOverrides)) {
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
    tenantId,
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
    tenantId,
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
    tenantId,
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
    tenantId,
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
    tenantId,
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
  revalidatePath(`/platform/templates/${template.id}`);
  redirect(`/guarantee-applications/${encodeURIComponent(template.id)}/preview?caseId=${encodeURIComponent(caseId)}&flash=preview_saved`);
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
  assertProductionImportWorkerReady();
  const session = await requireTenantSession({ permission: "source.upload" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const targetCaseId = String(formData.get("targetCaseId") ?? "").trim();
  const uploadContext = String(formData.get("uploadContext") ?? "").trim();
  if (targetCaseId) {
    await requireWritableCase(session, targetCaseId);
  }
  const targetCaseQuery = targetCaseId ? `&targetCaseId=${encodeURIComponent(targetCaseId)}` : "";
  const redirectExcelUploadError = (flash: string): never => {
    if (targetCaseId && uploadContext === "case") {
      redirect(`/cases/${encodeURIComponent(targetCaseId)}?flash=${encodeURIComponent(flash)}#case-review-desk`);
    }
    redirect(`/import-center?flash=${encodeURIComponent(flash)}${targetCaseQuery}`);
  };

  const fileEntry = formData.get("excelFile");
  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    redirectExcelUploadError("excel_upload_missing");
  }
  const file = fileEntry as File;
  const result = await queueExcelImportSource({ tenantId, userId: user.id, file, targetCaseId: targetCaseId || undefined });
  if ("error" in result) {
    const flash = result.error === "xlsx_required" ? "excel_upload_type"
      : result.error === "file_too_large" ? "excel_upload_too_large"
      : result.error === "file_required" ? "excel_upload_missing"
      : "excel_upload_read_failed";
    redirectExcelUploadError(flash);
  } else {
    revalidatePath("/import-center");
    redirect(`/import-center?xlsxJob=${result.jobId}&flash=input_extraction_queued${targetCaseQuery}`);
  }
}

export async function uploadAndParseIdentityDocumentAction(formData: FormData) {
  assertProductionImportWorkerReady();
  assertProductionDocumentReaderReady();
  const session = await requireTenantSession({ permission: "source.upload" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const uploadMode = String(formData.get("identityUploadMode") ?? "same_person").trim();
  const targetCaseId = String(formData.get("targetCaseId") ?? "").trim();
  const uploadContext = String(formData.get("uploadContext") ?? "").trim();
  if (targetCaseId) {
    await requireWritableCase(session, targetCaseId);
  }
  const targetCaseQuery = targetCaseId ? `&targetCaseId=${encodeURIComponent(targetCaseId)}` : "";
  const redirectIdentityUploadError = (flash: string): never => {
    if (targetCaseId && uploadContext === "case") {
      redirect(`/cases/${encodeURIComponent(targetCaseId)}?flash=${encodeURIComponent(flash)}#case-review-desk`);
    }
    redirect(`/import-center?flash=${encodeURIComponent(flash)}${targetCaseQuery}`);
  };

  const files = formData
    .getAll("identityDocumentFile")
    .filter((file): file is File => file instanceof File && file.size > 0);
  const result = await queueIdentityImportSources({
    tenantId,
    userId: user.id,
    files,
    uploadMode: uploadMode === "separate_people" ? "separate_people" : "same_person",
    targetCaseId: targetCaseId || undefined,
  });
  if ("error" in result) {
    const flash = result.error === "file_required" ? "identity_upload_missing"
      : result.error === "too_many_files" ? "identity_upload_too_many"
      : result.error === "file_too_large" ? "identity_upload_too_large"
      : result.error === "files_too_large" ? "identity_upload_total_too_large"
      : result.error === "invalid_identity_document" ? "identity_upload_type"
      : "identity_upload_save_failed";
    redirectIdentityUploadError(flash);
  } else {
    revalidatePath("/import-center");
    redirect(`/import-center?xlsxJob=${result.jobIds[0]}&flash=input_extraction_queued${targetCaseQuery}`);
  }
}

export async function saveExtractionReviewAction(formData: FormData) {
  const session = await requireTenantSession({ permission: "extract.accept_result" });
  const user = session.user;
  const tenantId = session.tenant.id;
  await rejectForbiddenRecordInput(formData, session, "case", String(formData.get("targetCaseId") ?? "").trim() || undefined);

  const jobId = String(formData.get("jobId") ?? "").trim();
  if (!jobId) throw new Error("ジョブIDが不正です。");

  const jobs = await listImportJobs(user.id, 200, tenantId);
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

  const targetCaseId = String(formData.get("targetCaseId") ?? payload.targetCaseId ?? "").trim();
  if (targetCaseId) {
    const targetCase = await requireWritableCase(session, targetCaseId);

    const mergedData = mergeConfirmedCaseData({
      existingData: targetCase.confirmedDataJson,
      incomingData: confirmedDataJson,
    });
    const existingHistory = getCaseMergeHistory(targetCase.confirmedDataJson);
    const sourceAlreadyLinked = targetCase.sourceImportJobIds.includes(job.id);
    const historyItem = sourceAlreadyLinked
      ? null
      : createCaseMergeHistoryItem({
          sourceImportJobId: job.id,
          sourceImportJobTitle: job.title,
          mergedById: user.id,
          confidenceScore: 100,
          matchReasons: ["案件ページから追加"],
          conflictFields: mergedData.conflictFields,
          conflictDetails: mergedData.conflictDetails,
          addedFields: mergedData.addedFields,
          preservedFields: mergedData.preservedFields,
          beforeConfirmedDataJson: targetCase.confirmedDataJson,
          beforeSourceImportJobIds: targetCase.sourceImportJobIds,
          incomingConfirmedDataJson: confirmedDataJson,
        });
    const nextConfirmedDataJson = setCaseMergeHistory(
      mergedData.nextData,
      historyItem ? [...existingHistory, historyItem] : existingHistory,
    );
    const brokerageCase = await mergeBrokerageCaseExtractionReview({
      tenantId,
      userId: user.id,
      caseId: targetCase.id,
      confirmedDataJson: nextConfirmedDataJson,
      sourceImportJobIds: sourceAlreadyLinked ? targetCase.sourceImportJobIds : [...targetCase.sourceImportJobIds, job.id],
      replaceImportJobIds: [job.id],
      reviewItems,
    });
    if (!brokerageCase) throw new Error("案件への追加保存に失敗しました。");
    await linkImportJobAttachmentsToObject({
      tenantId, userId: user.id, importJobId: job.id, targetType: "case", targetId: brokerageCase.id,
      documentType: payload.inputExtraction.documentType,
    });

    const correctionEvents = await addCorrectionEvents({
      userId: user.id,
      tenantId,
      events: buildExtractionReviewCorrectionEvents({
        caseId: brokerageCase.id,
        reviewItems,
      }),
    });

    await addAuditLog({
      tenantId,
      userId: user.id,
      action: "case_source_merged",
      targetType: "import_job",
      targetId: job.id,
      message: `抽出レビューを案件へ追加保存しました: ${brokerageCase.caseTitle}`,
      context: {
        caseId: brokerageCase.id,
        mergeId: historyItem?.id,
        addedFieldCount: mergedData.addedFields.length,
        conflictFieldCount: mergedData.conflictFields.length,
        correctionEventCount: correctionEvents.length,
        correctionEventIds: correctionEvents.map((event) => event.id),
        postalCodeLookupCount: postalCompletionResult.lookupCount,
        postalCodeConflictCount: postalCompletionResult.conflictCount,
      },
    });

    revalidatePath("/import-center");
    revalidatePath("/cases");
    revalidatePath(`/cases/${brokerageCase.id}`);
    redirect(`/cases/${brokerageCase.id}?flash=case_source_merged`);
  }

  const mergeTargetCaseId = String(formData.get("mergeTargetCaseId") ?? "").trim();
  const mergeConfirmed = parseCheckbox(formData.get("mergeConfirm"));
  const existingCase = await getBrokerageCaseByImportJobId({
    userId: user.id,
    tenantId,
    importJobId: job.id,
  });
  if (existingCase) {
    await requireWritableCase(session, existingCase.id);
  }

  if (mergeTargetCaseId) {
    if (!mergeConfirmed) {
      throw new Error("案件に追加する前に、合併確認にチェックしてください。");
    }
    const targetCase = await requireWritableCase(session, mergeTargetCaseId);
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
      tenantId,
      userId: user.id,
      caseId: targetCase.id,
      confirmedDataJson: nextConfirmedDataJson,
      sourceImportJobIds: [...targetCase.sourceImportJobIds, job.id],
      replaceImportJobIds: [job.id],
      reviewItems,
    });
    if (!brokerageCase) throw new Error("案件の合併保存に失敗しました。");
    await linkImportJobAttachmentsToObject({
      tenantId, userId: user.id, importJobId: job.id, targetType: "case", targetId: brokerageCase.id,
      documentType: payload.inputExtraction.documentType,
    });
    const correctionEvents = await addCorrectionEvents({
      userId: user.id,
      tenantId,
      events: buildExtractionReviewCorrectionEvents({
        caseId: brokerageCase.id,
        reviewItems,
      }),
    });

    await addAuditLog({
      tenantId,
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
      tenantId,
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
      tenantId,
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
  await linkImportJobAttachmentsToObject({
    tenantId, userId: user.id, importJobId: job.id, targetType: "case", targetId: brokerageCase.id,
    documentType: payload.inputExtraction.documentType,
  });
  const correctionEvents = await addCorrectionEvents({
    userId: user.id,
    tenantId,
    events: buildExtractionReviewCorrectionEvents({
      caseId: brokerageCase.id,
      reviewItems,
    }),
  });

  await addAuditLog({
    tenantId,
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
  const session = await requireTenantSession({ permission: "record.update" });
  const user = session.user;
  const tenantId = session.tenant.id;

  const caseId = String(formData.get("caseId") ?? "").trim();
  await rejectForbiddenRecordInput(formData, session, "case", caseId || undefined);
  const mergeId = String(formData.get("mergeId") ?? "").trim();
  if (!caseId || !mergeId) throw new Error("分離対象の案件が不正です。");
  if (!parseCheckbox(formData.get("rollbackConfirm"))) {
    throw new Error("分離して戻す前に確認チェックを入れてください。");
  }

  const brokerageCase = await requireWritableCase(session, caseId);

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
  const reviewItems = await listExtractionReviewItems({ userId: user.id, tenantId, caseId: brokerageCase.id });
  const splitReviewItems = reviewItems
    .filter((item) => item.importJobId === latestMerge.sourceImportJobId)
    .map(toReviewInput);

  const result = await rollbackBrokerageCaseMerge({
    tenantId,
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
    tenantId,
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
  const session = await requireTenantSession({ permission: "extract.run" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const locale = await getLocale();
  await rejectForbiddenRecordInput(formData, session, "property");

  const jobId = String(formData.get("jobId") ?? "").trim();
  if (!jobId) throw new Error("ジョブIDが不正です。");

  const jobs = await listImportJobs(user.id, 200, tenantId);
  const job = jobs.find((j) => j.id === jobId);
  if (!job?.notes) throw new Error("資料読取記録が見つかりません。再度アップロードしてください。");

  let payload: ExcelImportPayload;
  try {
    payload = JSON.parse(job.notes) as ExcelImportPayload;
  } catch {
    throw new Error("資料データの読み込みに失敗しました。再度アップロードしてください。");
  }
  if (payload.kind === "input_file_extraction") {
    throw new Error("この資料は内容確認用です。物件台帳への一括保存は実行できません。");
  }

  const sourceCols = formData.getAll("sourceCol") as string[];
  const targetFields = formData.getAll("targetField") as string[];
  const mapping: Record<string, string> = {};
  sourceCols.forEach((src, i) => {
    if (targetFields[i] && targetFields[i] !== "") mapping[src] = targetFields[i];
  });

  await updateImportJobMapping({
    tenantId,
    userId: user.id,
    jobId: job.id,
    mappingJson: mapping,
    validationMessage: tr(locale, {
      ja: "保存先を適用しました。保存処理を開始します。",
      zh: "保存位置已应用，开始保存。",
      ko: "저장 위치를 적용했고 저장을 시작합니다.",
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
        tenantId,
        createdByUserId: user.id,
        currentOwnerUserId: user.id,
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
            ? "保存成功数为 0，请修正保存位置或源数据后重试。"
            : locale === "ko"
              ? "저장 성공 건수가 0건입니다. 저장 위치 또는 원본 데이터를 수정 후 다시 시도하세요."
              : "保存成功件数が 0 件です。保存先または元データを修正して再試行してください。",
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
            ? "存在价格内容无法转换为数字的行。"
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
            ? "部分行保存失败，请查看错误详情。"
            : locale === "ko"
              ? "일부 행 저장에 실패했습니다. 상세 오류를 확인해 주세요."
              : "一部行の保存に失敗しました。詳細エラーを確認してください。",
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
            ? "保存已完成，但有部分行被跳过。"
            : locale === "ko"
              ? "저장은 완료되었지만 일부 행이 건너뛰어졌습니다."
              : "保存は完了しましたが、一部行はスキップされました。",
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
            ? "保存已完成，全部记录通过。"
            : locale === "ko"
              ? "저장이 완료되었고 모든 레코드가 정상 반영되었습니다."
              : "保存が完了し、全レコードが正常反映されました。",
      })
    );
  }
  const validationMessage = buildImportValidationMessage({
    source: "import_execution",
    summary:
      locale === "zh"
        ? `保存完成：成功 ${successCount} 条，跳过 ${skipped.length} 条`
        : locale === "ko"
          ? `저장 완료: 성공 ${successCount}건, 건너뜀 ${skipped.length}건`
          : `保存完了: 成功 ${successCount} 件、スキップ ${skipped.length} 件`,
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
    tenantId,
    userId: user.id,
    jobId: job.id,
    mappingJson: mapping,
    validationMessage,
    notes:
      successCount > 0
        ? undefined
        : tr(locale, {
            ja: "保存件数が0件のため、再試行が必要です。",
            zh: "成功保存为0，请修复后重试。",
            ko: "저장 성공 건수가 0건이므로 수정 후 다시 시도해야 합니다.",
          }),
    status: nextStatus,
  });

  await addAuditLog({
    tenantId,
    userId: user.id,
    action: successCount > 0 ? "import_job_completed" : "import_job_requires_retry",
    targetType: "import_job",
    targetId: job.id,
    message: `Excel 物件保存: ${successCount} 件登録、${skipped.length} 件スキップ`,
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
