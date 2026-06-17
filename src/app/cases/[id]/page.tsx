import Link from "next/link";
import { notFound } from "next/navigation";
import { rollbackCaseMergeAction, saveCaseWorkbenchAction, saveGuaranteeApplicationDraftAction } from "@/app/actions";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { getBrokerageCaseById, getDefaultUser, getGuaranteeApplicationDraft, listCorrectionEvents, listExtractionReviewItems, listImportJobs } from "@/lib/data";
import type { CorrectionEvent, ExtractionReviewItem, ExtractionReviewStatus } from "@/lib/data";
import { getCaseFieldAliases, getCaseFieldValue } from "@/lib/case-field-normalization";
import { CASE_FIELD_CATALOG_GROUPS, getCaseFieldDefinition, type CaseFieldDefinition } from "@/lib/case-field-catalog";
import { getCaseMergeHistory, getLatestActiveCaseMerge } from "@/lib/case-merge";
import { formatDate } from "@/lib/format";
import {
  buildGuaranteeDraftReadiness,
  buildGuaranteeApplicationReadiness,
  getGuaranteeCompanyTemplate,
  getGuaranteeDraftFieldDefinitions,
  guaranteeCompanyTemplates,
  type FriendsGuaranteeDraftFieldDefinition,
  type GuaranteeReadinessField,
  type GuaranteeTemplateQualityStatus,
} from "@/lib/guarantee-application";
import { evaluateGuaranteeDownloadGate } from "@/lib/guarantee-download-gate";
import { getLocale, type Locale } from "@/lib/locale";

export const dynamic = "force-dynamic";

const WORKBENCH_FIELD_STATUS_KEY = "__workbenchFieldStatuses";

type CasePageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ flash?: string; filter?: string; queue?: string; guaranteeTemplate?: string; templateId?: string }>;
};

type WorkbenchTrustState =
  | "confirmed"
  | "edited"
  | "ai_suggested"
  | "needs_review"
  | "missing"
  | "conflict"
  | "rejected"
  | "unknown";

type WorkbenchFilter = "attention" | "required" | "all" | WorkbenchTrustState;
type WorkbenchReviewDecision = "confirmed" | "unknown" | "rejected";
type WorkbenchQueue = "blocking" | "trusted_candidates" | "low_confidence" | "no_source";

type WorkbenchFieldEvidence = {
  id: string;
  value: string;
  sourceLabel: string;
  reviewStatus: ExtractionReviewStatus;
  confidencePercent: number;
  method: string;
};

type WorkbenchField = {
  fieldKey: string;
  label: string;
  value: string;
  required: boolean;
  state: WorkbenchTrustState;
  sourceLabel: string;
  decision: WorkbenchReviewDecision;
  evidenceItems: WorkbenchFieldEvidence[];
};

type WorkbenchFieldInputKind = "text" | "textarea" | "tel" | "email" | "money" | "number" | "date" | "select";

type WorkbenchFieldInputSpec = {
  kind: WorkbenchFieldInputKind;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email";
  unit?: string;
  rows?: number;
  placeholder?: Record<Locale, string>;
  options?: string[];
};

const workbenchFilterStates: WorkbenchTrustState[] = ["needs_review", "missing", "conflict", "ai_suggested", "unknown", "edited", "confirmed"];

const workbenchQueues: WorkbenchQueue[] = ["blocking", "trusted_candidates", "low_confidence", "no_source"];

function isWorkbenchCatalogField(field: CaseFieldDefinition) {
  if (field.storageScope === "case_fact") return true;
  return field.fieldKey.startsWith("guarantee.");
}

const workbenchGroups = CASE_FIELD_CATALOG_GROUPS.map((group) => ({
  id: group.id,
  label: group.label,
  fields: group.fields
    .filter(isWorkbenchCatalogField)
    .map((field) => [field.fieldKey, field.label] as const),
})).filter((group) => group.fields.length > 0);

function tr(locale: Locale, messages: Record<Locale, string>) {
  return messages[locale];
}

function getTemplateQualityLabel(locale: Locale, status: GuaranteeTemplateQualityStatus) {
  const labels: Record<GuaranteeTemplateQualityStatus, Record<Locale, string>> = {
    verified: { ja: "出荷可", zh: "出厂可用", ko: "출고 가능" },
    needs_calibration: { ja: "要精校", zh: "需要精校", ko: "정밀 보정 필요" },
    source_quality_blocked: { ja: "原本差替え", zh: "源文件待换", ko: "원본 교체 필요" },
  };
  return labels[status][locale];
}

function getTemplateQualityClass(status: GuaranteeTemplateQualityStatus) {
  if (status === "verified") return "bg-emerald-100 text-emerald-800";
  if (status === "source_quality_blocked") return "bg-rose-100 text-rose-800";
  return "bg-amber-100 text-amber-800";
}

function getReviewStatusLabel(locale: Locale, status: ExtractionReviewStatus) {
  const labels: Record<ExtractionReviewStatus, Record<Locale, string>> = {
    suggested: { ja: "確認が必要", zh: "需要确认", ko: "확인 필요" },
    accepted: { ja: "確認済み", zh: "已确认", ko: "확인됨" },
    edited: { ja: "修正済み", zh: "已修正", ko: "수정됨" },
    unknown: { ja: "不明", zh: "不明", ko: "불명" },
    rejected: { ja: "不採用", zh: "不采用", ko: "미채택" },
  };
  return labels[status][locale];
}

function getTrustStateLabel(locale: Locale, state: WorkbenchTrustState) {
  const labels: Record<WorkbenchTrustState, Record<Locale, string>> = {
    confirmed: { ja: "確認済み", zh: "已确认", ko: "확인됨" },
    edited: { ja: "修正済み", zh: "已修正", ko: "수정됨" },
    ai_suggested: { ja: "AI候補", zh: "AI 候选", ko: "AI 후보" },
    needs_review: { ja: "確認が必要", zh: "需要确认", ko: "확인 필요" },
    missing: { ja: "未入力", zh: "未填写", ko: "미입력" },
    conflict: { ja: "不一致", zh: "不一致", ko: "불일치" },
    rejected: { ja: "不採用", zh: "不采用", ko: "미채택" },
    unknown: { ja: "不明", zh: "不明", ko: "불명" },
  };
  return labels[state][locale];
}

function getTrustStateClass(state: WorkbenchTrustState) {
  if (state === "confirmed") return "bg-emerald-100 text-emerald-800";
  if (state === "edited") return "bg-blue-100 text-blue-800";
  if (state === "ai_suggested" || state === "needs_review") return "bg-amber-100 text-amber-800";
  if (state === "missing" || state === "conflict") return "bg-rose-100 text-rose-800";
  if (state === "rejected") return "bg-slate-200 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

function getWorkbenchDecisionLabel(locale: Locale, decision: WorkbenchReviewDecision) {
  const labels: Record<WorkbenchReviewDecision, Record<Locale, string>> = {
    confirmed: { ja: "入力値を使う", zh: "使用填写值", ko: "입력값 사용" },
    unknown: { ja: "不明として残す", zh: "标为不明", ko: "불명으로 남김" },
    rejected: { ja: "候補を使わない", zh: "不采用候选", ko: "후보 미사용" },
  };
  return labels[decision][locale];
}

function getWorkbenchFieldInputSpec(fieldKey: string): WorkbenchFieldInputSpec {
  if (fieldKey === "property.usage") {
    return { kind: "select", options: ["住居用", "住居学生用", "住居火災保険", "トランクルーム", "倉庫", "駐車場", "事務所", "店舗", "その他"] };
  }
  if (fieldKey === "lease.contractType") {
    return { kind: "select", options: ["普通借家", "定期借家", "その他"] };
  }
  if (fieldKey === "lease.paymentMethod") {
    return { kind: "select", options: ["口座振替", "振込", "集金代行", "カード", "その他"] };
  }
  if (fieldKey.endsWith(".gender")) {
    return { kind: "select", options: ["男", "女", "その他"] };
  }
  if (fieldKey.endsWith(".spouse")) {
    return { kind: "select", options: ["有", "無"] };
  }
  if (fieldKey.endsWith(".housingType")) {
    return { kind: "select", options: ["自宅", "賃貸", "社宅", "家族所有", "その他"] };
  }
  if (fieldKey.endsWith(".employmentType")) {
    return { kind: "select", options: ["正社員", "契約社員", "派遣", "アルバイト", "パート", "自営業", "会社役員", "学生", "無職", "その他"] };
  }
  if (fieldKey.endsWith(".identityDocumentType")) {
    return { kind: "select", options: ["在留カード", "運転免許証"] };
  }
  if (fieldKey.endsWith(".workRestriction")) {
    return { kind: "select", options: ["無", "有"] };
  }
  if (fieldKey.endsWith(".relationship")) {
    return { kind: "select", options: ["父", "母", "配偶者", "子", "兄弟姉妹", "親族", "友人", "知人", "勤務先", "その他"] };
  }
  const fieldDefinition = getCaseFieldDefinition(fieldKey);
  if (fieldDefinition?.valueKind === "date") {
    return {
      kind: "date",
      inputMode: "numeric",
      placeholder: { ja: "1990年1月1日", zh: "1990年1月1日", ko: "1990년1월1일" },
    };
  }
  if (fieldDefinition?.valueKind === "phone") {
    return { kind: "tel", inputMode: "tel", placeholder: { ja: "090-1234-5678", zh: "090-1234-5678", ko: "090-1234-5678" } };
  }
  if (fieldDefinition?.valueKind === "email") {
    return { kind: "email", inputMode: "email", placeholder: { ja: "name@example.com", zh: "name@example.com", ko: "name@example.com" } };
  }
  if (fieldDefinition?.valueKind === "postal_code") {
    return { kind: "text", inputMode: "numeric", placeholder: { ja: "1540024", zh: "1540024", ko: "1540024" } };
  }
  if (fieldDefinition?.valueKind === "money_yen") {
    return { kind: "money", inputMode: "numeric", unit: "円" };
  }
  if (fieldDefinition?.valueKind === "money_man_yen") {
    return { kind: "money", inputMode: "numeric", unit: "万円" };
  }
  if (fieldDefinition?.valueKind === "duration_years") {
    return { kind: "number", inputMode: "numeric", unit: "年" };
  }
  if (fieldDefinition?.valueKind === "number") {
    return { kind: "number", inputMode: "numeric" };
  }
  if (fieldDefinition?.valueKind === "textarea") {
    return { kind: "textarea", rows: 2 };
  }
  if (fieldDefinition?.valueKind === "boolean") {
    return { kind: "select", options: ["確認済み", "未確認"] };
  }
  if (fieldKey.endsWith(".birthDate") || fieldKey.endsWith("Expiry") || fieldKey === "lease.moveInDate") {
    return {
      kind: "date",
      inputMode: "numeric",
      placeholder: { ja: "1990年1月1日", zh: "1990年1月1日", ko: "1990년1월1일" },
    };
  }
  if (fieldKey.endsWith(".phone") || fieldKey.includes("Phone") || fieldKey.includes("phone")) {
    return { kind: "tel", inputMode: "tel", placeholder: { ja: "090-1234-5678", zh: "090-1234-5678", ko: "090-1234-5678" } };
  }
  if (fieldKey.endsWith(".email")) {
    return { kind: "email", inputMode: "email", placeholder: { ja: "name@example.com", zh: "name@example.com", ko: "name@example.com" } };
  }
  if (
    fieldKey.startsWith("lease.") ||
    fieldKey.endsWith(".currentRent") ||
    fieldKey.endsWith(".initialFee") ||
    fieldKey.endsWith(".monthlyFee") ||
    fieldKey.endsWith(".renewalFee")
  ) {
    return { kind: "money", inputMode: "numeric", unit: "円" };
  }
  if (fieldKey.endsWith(".annualIncome")) {
    return { kind: "money", inputMode: "numeric", unit: "万円" };
  }
  if (fieldKey.endsWith(".payday")) {
    return { kind: "number", inputMode: "numeric", unit: "日", placeholder: { ja: "25", zh: "25", ko: "25" } };
  }
  if (fieldKey.endsWith(".residenceYears") || fieldKey.endsWith(".yearsEmployed") || fieldKey.endsWith(".residencePeriod")) {
    return { kind: "number", inputMode: "numeric", unit: "年" };
  }
  if (fieldKey.endsWith(".address") || fieldKey.endsWith(".currentAddress") || fieldKey.endsWith(".employerAddress") || fieldKey === "property.address") {
    return { kind: "textarea", rows: 2 };
  }
  if (fieldKey.endsWith(".moveReason") || fieldKey.endsWith(".driverLicenseConditions")) {
    return { kind: "textarea", rows: 2 };
  }
  return { kind: "text" };
}

function getReviewStatusClass(status: ExtractionReviewStatus) {
  if (status === "accepted") return "bg-emerald-100 text-emerald-800";
  if (status === "edited") return "bg-blue-100 text-blue-800";
  if (status === "unknown") return "bg-slate-200 text-slate-700";
  if (status === "rejected") return "bg-rose-100 text-rose-800";
  return "bg-amber-100 text-amber-800";
}

function isWorkbenchFilter(value: string | undefined): value is WorkbenchFilter {
  return Boolean(
    value &&
      (value === "attention" ||
        value === "required" ||
        value === "all" ||
        workbenchFilterStates.includes(value as WorkbenchTrustState)),
  );
}

function isWorkbenchQueue(value: string | undefined): value is WorkbenchQueue {
  return Boolean(value && workbenchQueues.includes(value as WorkbenchQueue));
}

function fieldNeedsAttention(field: WorkbenchField) {
  if (field.state === "conflict" || field.state === "needs_review" || field.state === "ai_suggested" || field.state === "unknown") {
    return true;
  }
  return field.required && field.state === "missing";
}

function matchesWorkbenchFilter(field: WorkbenchField, filter: WorkbenchFilter) {
  if (filter === "all") return true;
  if (filter === "required") return field.required;
  if (filter === "attention") return fieldNeedsAttention(field);
  return field.state === filter;
}

function isBlockingCurrentApplicationField(field: WorkbenchField) {
  return field.required && (!field.value || field.state === "needs_review" || field.state === "conflict" || field.state === "unknown" || field.state === "rejected");
}

function isTrustedCandidateField(field: WorkbenchField) {
  const evidence = getPrimaryEvidence(field);
  return Boolean(
    evidence?.value &&
      evidence.confidencePercent >= 85 &&
      (field.state === "ai_suggested" || field.state === "needs_review" || field.state === "unknown" || field.state === "rejected" || !field.value),
  );
}

function isLowConfidenceField(field: WorkbenchField) {
  const evidence = getPrimaryEvidence(field);
  return Boolean(evidence && evidence.confidencePercent < 70 && (fieldNeedsAttention(field) || field.required));
}

function isNoSourceRequiredField(field: WorkbenchField) {
  return field.required && !field.value && field.evidenceItems.length === 0;
}

function matchesWorkbenchQueue(field: WorkbenchField, queue: WorkbenchQueue) {
  if (queue === "blocking") return isBlockingCurrentApplicationField(field);
  if (queue === "trusted_candidates") return isTrustedCandidateField(field);
  if (queue === "low_confidence") return isLowConfidenceField(field);
  return isNoSourceRequiredField(field);
}

function getWorkbenchPriorityRank(field: WorkbenchField) {
  if (isBlockingCurrentApplicationField(field)) return 0;
  if (isTrustedCandidateField(field)) return 1;
  if (isLowConfidenceField(field)) return 2;
  if (isNoSourceRequiredField(field)) return 3;
  if (fieldNeedsAttention(field)) return 4;
  return 5;
}

function sortWorkbenchPriorityFields<T extends WorkbenchField>(fields: T[]) {
  return fields.slice().sort((a, b) => {
    const rankDiff = getWorkbenchPriorityRank(a) - getWorkbenchPriorityRank(b);
    if (rankDiff !== 0) return rankDiff;
    if (a.required !== b.required) return a.required ? -1 : 1;
    const aConfidence = getPrimaryEvidence(a)?.confidencePercent ?? -1;
    const bConfidence = getPrimaryEvidence(b)?.confidencePercent ?? -1;
    return bConfidence - aConfidence;
  });
}

function getWorkbenchQueueLabel(locale: Locale, queue: WorkbenchQueue) {
  const labels: Record<WorkbenchQueue, Record<Locale, string>> = {
    blocking: { ja: "申込書で止まる", zh: "阻塞当前申请书", ko: "신청서 차단" },
    trusted_candidates: { ja: "高信頼候補", zh: "高可信候选", ko: "고신뢰 후보" },
    low_confidence: { ja: "低信頼", zh: "低可信", ko: "저신뢰" },
    no_source: { ja: "候補なし", zh: "无候选来源", ko: "후보 없음" },
  };
  return labels[queue][locale];
}

function getWorkbenchQueueDescription(locale: Locale, queue: WorkbenchQueue) {
  const descriptions: Record<WorkbenchQueue, Record<Locale, string>> = {
    blocking: {
      ja: "この保証会社の申込書を出す前に必ず埋める項目です。",
      zh: "当前保证会社申请书输出前必须处理的字段。",
      ko: "이 보증회사 신청서 출력 전에 반드시 처리할 항목입니다.",
    },
    trusted_candidates: {
      ja: "出典と信頼度が強く、まとめて確認しやすい候補です。",
      zh: "来源和可信度较强，适合批量确认。",
      ko: "출처와 신뢰도가 높아 일괄 확인하기 좋은 후보입니다.",
    },
    low_confidence: {
      ja: "原資料の位置を見てから採用する項目です。",
      zh: "需要先看原资料位置再采用。",
      ko: "원자료 위치를 확인한 뒤 채택할 항목입니다.",
    },
    no_source: {
      ja: "入力資料から候補が見つからず、手入力が必要です。",
      zh: "输入资料未找到候选，需要手动填写。",
      ko: "입력 자료에서 후보를 찾지 못해 수동 입력이 필요합니다.",
    },
  };
  return descriptions[queue][locale];
}

function getCorrectionEventLabel(locale: Locale, changeType: CorrectionEvent["changeType"]) {
  const labels: Record<CorrectionEvent["changeType"], Record<Locale, string>> = {
    ai_extraction_error: { ja: "AI読取修正", zh: "AI 识别修正", ko: "AI 판독 수정" },
    normalization_error: { ja: "表記整形修正", zh: "格式修正", ko: "표기 정리 수정" },
    source_absent_user_completed: { ja: "手入力補完", zh: "人工补填", ko: "수동 보완" },
    missing_detected_by_user: { ja: "見落とし補完", zh: "漏识别补填", ko: "누락 보완" },
    conflict_resolved_by_user: { ja: "不一致解決", zh: "冲突解决", ko: "불일치 해결" },
    template_output_position_error: { ja: "PDF位置修正", zh: "PDF 位置修正", ko: "PDF 위치 수정" },
    template_output_format_error: { ja: "PDF表記修正", zh: "PDF 格式修正", ko: "PDF 표기 수정" },
    user_or_team_preference: { ja: "社内表記", zh: "团队习惯", ko: "팀 표기" },
    one_off_case_override: { ja: "案件個別修正", zh: "案件个别修正", ko: "안건 개별 수정" },
  };
  return labels[changeType][locale];
}

function getCorrectionEventClass(changeType: CorrectionEvent["changeType"]) {
  if (changeType === "ai_extraction_error" || changeType === "missing_detected_by_user") return "bg-amber-100 text-amber-800";
  if (changeType.startsWith("template_output")) return "bg-indigo-100 text-indigo-800";
  if (changeType === "source_absent_user_completed") return "bg-emerald-100 text-emerald-800";
  return "bg-slate-100 text-slate-700";
}

function getPriorityFieldHint(locale: Locale, fieldKey: string) {
  if (fieldKey.startsWith("applicant.residence") || fieldKey.startsWith("applicant.driverLicense") || fieldKey === "applicant.identityDocumentType") {
    return tr(locale, {
      ja: "在留カードまたは運転免許証から確認できます。",
      zh: "可从在留卡或驾照资料确认。",
      ko: "재류카드 또는 운전면허증에서 확인할 수 있습니다.",
    });
  }
  if (fieldKey.startsWith("applicant.employer") || fieldKey === "applicant.annualIncome" || fieldKey === "applicant.employmentType") {
    return tr(locale, {
      ja: "審査で見られやすい勤務先情報です。",
      zh: "这是审查中容易被要求的勤務先信息。",
      ko: "심사에서 확인될 가능성이 높은 근무처 정보입니다.",
    });
  }
  if (fieldKey.startsWith("emergencyContact.") || fieldKey.startsWith("guarantor.")) {
    return tr(locale, {
      ja: "保証会社の必須欄になりやすい連絡先です。",
      zh: "这是保证会社经常要求的联系人信息。",
      ko: "보증회사가 자주 요구하는 연락처 정보입니다.",
    });
  }
  if (fieldKey.startsWith("property.") || fieldKey.startsWith("lease.")) {
    return tr(locale, {
      ja: "すべての申込書で使い回す物件・賃料情報です。",
      zh: "这是所有申请书都会复用的物件/租金信息。",
      ko: "모든 신청서에서 재사용되는 매물/임대료 정보입니다.",
    });
  }
  return tr(locale, {
    ja: "出力前に確認しておく項目です。",
    zh: "输出前需要确认的项目。",
    ko: "출력 전에 확인할 항목입니다.",
  });
}

function getSource(item: ExtractionReviewItem) {
  return item.sourceCell ?? item.sourceRange ?? "-";
}

function readText(data: Record<string, unknown>, key: string) {
  return getCaseFieldValue(data, key);
}

function readDraftText(data: Record<string, unknown> | undefined, key: string) {
  const value = data?.[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "確認済み" : "";
  return "";
}

function readStatusMap(data: Record<string, unknown>) {
  const value = data[WORKBENCH_FIELD_STATUS_KEY];
  return value && typeof value === "object" ? (value as Record<string, string>) : {};
}

function workbenchAnchorForGuaranteeField(fieldKey: string) {
  if (fieldKey.startsWith("company_option.")) return "guarantee-template-drafts";
  if (fieldKey.startsWith("property.") || fieldKey.startsWith("lease.")) return "workbench-property_lease";
  if (
    fieldKey.startsWith("applicant.employer") ||
    fieldKey === "applicant.occupation" ||
    fieldKey === "applicant.employmentType" ||
    fieldKey === "applicant.annualIncome" ||
    fieldKey === "applicant.yearsEmployed"
  ) {
    return "workbench-employment_income";
  }
  if (
    fieldKey === "applicant.identityDocumentType" ||
    fieldKey === "applicant.nationality" ||
    fieldKey.startsWith("applicant.residence") ||
    fieldKey.startsWith("applicant.driverLicense") ||
    fieldKey === "applicant.workRestriction"
  ) {
    return "workbench-identity_document";
  }
  if (fieldKey.startsWith("applicant.")) return "workbench-applicant";
  if (fieldKey.startsWith("guarantor.")) return "workbench-guarantor";
  if (fieldKey.startsWith("emergencyContact.")) return "workbench-emergency_contact";
  if (fieldKey.startsWith("coOccupants.")) return "workbench-co_occupants";
  if (fieldKey.startsWith("broker.") || fieldKey.startsWith("management.") || fieldKey.startsWith("landlord.")) return "workbench-broker_management";
  if (fieldKey.startsWith("guarantee.")) return "workbench-guarantee_options";
  return "workbench-unresolved";
}

function buildWorkbenchField(input: {
  fieldKey: string;
  label: string;
  requiredKeys: Set<string>;
  confirmedData: Record<string, unknown>;
  statusMap: Record<string, string>;
  reviewByFieldKey: Map<string, ExtractionReviewItem[]>;
}): WorkbenchField {
  const value = readText(input.confirmedData, input.fieldKey);
  const reviewItems = getCaseFieldAliases(input.fieldKey)
    .flatMap((alias) => input.reviewByFieldKey.get(alias) ?? [])
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const latestReview = reviewItems[reviewItems.length - 1];
  const manualState = input.statusMap[input.fieldKey] as WorkbenchTrustState | undefined;
  let state: WorkbenchTrustState = value ? "confirmed" : input.requiredKeys.has(input.fieldKey) ? "missing" : "missing";
  if (manualState === "edited" || manualState === "unknown" || manualState === "rejected" || manualState === "needs_review") state = manualState;
  else if (manualState === "confirmed") state = "confirmed";
  else if (latestReview?.reviewStatus === "suggested") state = value ? "ai_suggested" : "needs_review";
  else if (latestReview?.reviewStatus === "rejected") state = "rejected";
  else if (latestReview?.reviewStatus === "unknown") state = "unknown";
  else if (value && latestReview?.reviewStatus === "edited") state = "edited";

  const evidenceItems = reviewItems
    .slice()
    .reverse()
    .map((item) => ({
      id: item.id,
      value: item.finalValue ?? item.editedValue ?? item.normalizedValue ?? item.extractedValue ?? "",
      sourceLabel: `${item.sourceSheet} / ${getSource(item)}`,
      reviewStatus: item.reviewStatus,
      confidencePercent: Math.round(item.confidence * 100),
      method: item.method,
    }));

  return {
    fieldKey: input.fieldKey,
    label: input.label,
    value,
    required: input.requiredKeys.has(input.fieldKey),
    state,
    sourceLabel: latestReview ? `${latestReview.sourceSheet} / ${getSource(latestReview)}` : "手入力・案件データ",
    decision: state === "unknown" ? "unknown" : state === "rejected" ? "rejected" : "confirmed",
    evidenceItems,
  };
}

function WorkbenchDecisionSelect({ locale, field }: { locale: Locale; field: WorkbenchField }) {
  return (
    <select
      name={`status:${field.fieldKey}`}
      defaultValue={field.decision}
      className="mt-2 w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
    >
      {(["confirmed", "unknown", "rejected"] as WorkbenchReviewDecision[]).map((decision) => (
        <option key={decision} value={decision}>
          {getWorkbenchDecisionLabel(locale, decision)}
        </option>
      ))}
    </select>
  );
}

function getPrimaryEvidence(field: WorkbenchField) {
  return field.evidenceItems[0];
}

function getEvidenceConfidenceClass(confidencePercent: number) {
  if (confidencePercent >= 85) return "bg-emerald-100 text-emerald-800";
  if (confidencePercent >= 70) return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-800";
}

function getEvidenceGuidance(locale: Locale, field: WorkbenchField) {
  const evidence = getPrimaryEvidence(field);
  if (!evidence) {
    if (field.required && !field.value) {
      return tr(locale, {
        ja: "入力資料から候補を見つけていません。手入力または追加資料で補完してください。",
        zh: "输入资料里没有找到候选值，需要手动填写或补充资料。",
        ko: "입력 자료에서 후보를 찾지 못했습니다. 수동 입력하거나 추가 자료로 보완하세요.",
      });
    }
    return tr(locale, {
      ja: "案件データまたは手入力値です。出力前に必要であれば確認してください。",
      zh: "这是案件数据或手填值，输出前按需要确认。",
      ko: "안건 데이터 또는 수동 입력값입니다. 출력 전 필요하면 확인하세요.",
    });
  }
  if (field.state === "ai_suggested" || field.state === "needs_review") {
    return tr(locale, {
      ja: "候補値があります。出典と一致していれば採用、違っていれば入力欄で修正します。",
      zh: "有候选值。与来源一致就采用，不一致就在输入栏修正。",
      ko: "후보값이 있습니다. 출처와 맞으면 채택하고, 다르면 입력란에서 수정합니다.",
    });
  }
  if (evidence.confidencePercent >= 85) {
    return tr(locale, {
      ja: "高信頼の出典があります。必要なら出典だけ確認して進められます。",
      zh: "有较高可信来源，必要时只需核对来源即可继续。",
      ko: "신뢰도 높은 출처가 있습니다. 필요하면 출처만 확인하고 진행할 수 있습니다.",
    });
  }
  if (evidence.confidencePercent < 70) {
    return tr(locale, {
      ja: "信頼度が低いため、原資料の位置を確認してから使ってください。",
      zh: "可信度偏低，使用前应先确认原资料位置。",
      ko: "신뢰도가 낮으므로 원자료 위치를 확인한 뒤 사용하세요.",
    });
  }
  return tr(locale, {
    ja: "中程度の候補です。出典と表記を確認してから進めます。",
    zh: "这是中等可信候选，确认来源和表记后再继续。",
    ko: "중간 신뢰 후보입니다. 출처와 표기를 확인한 뒤 진행하세요.",
  });
}

function WorkbenchEvidenceSummary({ locale, field }: { locale: Locale; field: WorkbenchField }) {
  const evidence = getPrimaryEvidence(field);
  const canUseCandidate = Boolean(evidence?.value);
  if (!evidence) {
    return (
      <div className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2">
        <p className="text-[11px] font-bold text-slate-500">
          {tr(locale, { ja: "判断", zh: "判断", ko: "판단" })}
        </p>
        <p className="mt-1 text-xs font-semibold leading-5 text-slate-700">{getEvidenceGuidance(locale, field)}</p>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-indigo-100 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-indigo-700">
          {tr(locale, { ja: "候補判断", zh: "候选判断", ko: "후보 판단" })}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getEvidenceConfidenceClass(evidence.confidencePercent)}`}>
            {evidence.confidencePercent}%
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">{evidence.method}</span>
        </div>
      </div>
      <p className="mt-1 break-words text-xs font-black text-slate-950">
        {tr(locale, { ja: "候補", zh: "候选", ko: "후보" })}: {evidence.value || "-"}
      </p>
      <p className="mt-1 font-mono text-[10px] text-slate-500">{evidence.sourceLabel}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-slate-700">{getEvidenceGuidance(locale, field)}</p>
      <input type="hidden" name={`candidate:${field.fieldKey}`} value={evidence.value} />
      {canUseCandidate ? (
        <button
          type="submit"
          name="useCandidateField"
          value={field.fieldKey}
          className="mt-2 inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100"
        >
          <span className="material-symbols-outlined text-[14px]">check_circle</span>
          {evidence.value === field.value
            ? tr(locale, { ja: "この値で確認保存", zh: "按此值确认保存", ko: "이 값으로 확인 저장" })
            : tr(locale, { ja: "候補を採用して保存", zh: "采用候选并保存", ko: "후보 채택 후 저장" })}
        </button>
      ) : null}
    </div>
  );
}

function WorkbenchFieldControl({ locale, field, tone = "default" }: { locale: Locale; field: WorkbenchField; tone?: "default" | "attention" }) {
  const spec = getWorkbenchFieldInputSpec(field.fieldKey);
  const placeholder = spec.placeholder ? tr(locale, spec.placeholder) : undefined;
  const baseClass =
    tone === "attention"
      ? "mt-3 w-full rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-slate-950 focus:ring-2 focus:ring-rose-100"
      : "mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100";
  const inputClass = spec.unit ? `${baseClass} pr-12` : baseClass;
  const currentOptionExists = spec.options?.some((option) => option === field.value);

  if (spec.kind === "select") {
    return (
      <select name={`field:${field.fieldKey}`} defaultValue={field.value} aria-label={field.label} className={baseClass}>
        <option value="">-</option>
        {field.value && spec.options && !currentOptionExists ? <option value={field.value}>{field.value}</option> : null}
        {spec.options?.map((option) => (
          <option key={`${field.fieldKey}-${option}`} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (spec.kind === "textarea") {
    return (
      <textarea
        name={`field:${field.fieldKey}`}
        aria-label={field.label}
        defaultValue={field.value}
        rows={spec.rows ?? 2}
        placeholder={placeholder}
        className={`${baseClass} min-h-20 resize-y leading-6`}
      />
    );
  }

  const type = spec.kind === "email" ? "email" : spec.kind === "tel" ? "tel" : "text";
  return (
    <span className="relative block">
      <input
        name={`field:${field.fieldKey}`}
        type={type}
        aria-label={field.label}
        inputMode={spec.inputMode}
        defaultValue={field.value}
        placeholder={placeholder}
        className={inputClass}
      />
      {spec.unit ? (
        <span className="pointer-events-none absolute bottom-2.5 right-3 text-xs font-bold text-slate-500">{spec.unit}</span>
      ) : null}
    </span>
  );
}

function GuaranteeDraftFieldControl({
  definition,
  value,
}: {
  definition: FriendsGuaranteeDraftFieldDefinition;
  value: string;
}) {
  const baseClass = "mt-2 w-full rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
  const currentOptionExists = definition.options?.some((option) => option === value);

  if (definition.inputType === "select") {
    return (
      <select name={`draft:${definition.fieldKey}`} defaultValue={value} aria-label={definition.label} className={baseClass}>
        <option value="">未入力</option>
        {value && definition.options && !currentOptionExists ? <option value={value}>{value}</option> : null}
        {definition.options?.map((option) => (
          <option key={`${definition.fieldKey}-${option}`} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (definition.inputType === "textarea") {
    return (
      <textarea
        name={`draft:${definition.fieldKey}`}
        aria-label={definition.label}
        defaultValue={value}
        rows={3}
        className={`${baseClass} min-h-24 resize-y leading-6`}
      />
    );
  }

  return (
    <input
      name={`draft:${definition.fieldKey}`}
      type="text"
      aria-label={definition.label}
      defaultValue={value}
      className={baseClass}
    />
  );
}

function WorkbenchEvidenceDetails({ locale, field }: { locale: Locale; field: WorkbenchField }) {
  if (field.evidenceItems.length === 0) {
    return <span className="mt-1 block text-[11px] text-slate-500">{field.sourceLabel}</span>;
  }

  return (
    <details className="mt-2 rounded-md border border-slate-200 bg-white">
      <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-bold text-slate-600">
        {tr(locale, { ja: "出典を見る", zh: "查看来源", ko: "출처 보기" })}
      </summary>
      <div className="space-y-2 border-t border-slate-100 p-2">
        {field.evidenceItems.map((item) => (
          <div key={item.id} className="rounded bg-slate-50 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getReviewStatusClass(item.reviewStatus)}`}>
                {getReviewStatusLabel(locale, item.reviewStatus)}
              </span>
              <span className="text-[10px] font-semibold tabular-nums text-slate-500">
                {item.confidencePercent}% / {item.method}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-xs font-semibold text-slate-800">{item.value || "-"}</p>
            <p className="mt-1 font-mono text-[10px] text-slate-500">{item.sourceLabel}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

export default async function CasePage({ params, searchParams }: CasePageProps) {
  const locale = await getLocale();
  const user = await getDefaultUser();
  if (!user) notFound();

  const [{ id }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { flash?: string; filter?: string; queue?: string; guaranteeTemplate?: string; templateId?: string }),
  ]);
  const activeGuaranteeTemplates = guaranteeCompanyTemplates.filter((template) => template.outputStatus === "active");
  const requestedGuaranteeTemplateId = String(query?.guaranteeTemplate ?? query?.templateId ?? "").trim();
  const selectedGuaranteeTemplate =
    activeGuaranteeTemplates.find((template) => template.id === requestedGuaranteeTemplateId) ??
    activeGuaranteeTemplates.find((template) => template.id === "friends_guarantee_individual_v1") ??
    activeGuaranteeTemplates[0] ??
    getGuaranteeCompanyTemplate(requestedGuaranteeTemplateId);
  const [brokerageCase, reviewItems, correctionEvents, importJobs, ...guaranteeDrafts] = await Promise.all([
    getBrokerageCaseById({ userId: user.id, caseId: id }),
    listExtractionReviewItems({ userId: user.id, caseId: id }),
    listCorrectionEvents({ userId: user.id, caseId: id, limit: 12 }),
    listImportJobs(user.id, 200),
    ...activeGuaranteeTemplates.map((template) =>
      getGuaranteeApplicationDraft({ userId: user.id, caseId: id, templateId: template.id }),
    ),
  ]);
  if (!brokerageCase) notFound();

  const importJobMap = new Map(importJobs.map((job) => [job.id, job]));
  const sourceFiles = brokerageCase.sourceImportJobIds
    .map((jobId) => importJobMap.get(jobId)?.title ?? jobId)
    .filter(Boolean);
  const mergeHistory = getCaseMergeHistory(brokerageCase.confirmedDataJson);
  const latestActiveMerge = getLatestActiveCaseMerge(brokerageCase.confirmedDataJson);
  const reviewByFieldKey = reviewItems.reduce<Map<string, ExtractionReviewItem[]>>((acc, item) => {
    const list = acc.get(item.fieldKey) ?? [];
    list.push(item);
    acc.set(item.fieldKey, list);
    return acc;
  }, new Map());
  const statusMap = readStatusMap(brokerageCase.confirmedDataJson);
  const guaranteeTemplateSummaries = activeGuaranteeTemplates.map((template, index) => {
    const draft = guaranteeDrafts[index] ?? null;
    const readinessGroups = buildGuaranteeApplicationReadiness({ brokerageCase, template, draft });
    const draftReadiness = buildGuaranteeDraftReadiness(draft, template.id);
    const downloadGate = evaluateGuaranteeDownloadGate({ brokerageCase, template, draft });
    return {
      template,
      draft,
      draftReadiness,
      downloadGate,
      unresolvedFields: readinessGroups.find((group) => group.id === "unresolved")?.fields ?? [],
    };
  });
  const selectedTemplateSummary =
    guaranteeTemplateSummaries.find((summary) => summary.template.id === selectedGuaranteeTemplate.id) ??
    guaranteeTemplateSummaries[0];
  const selectedDraft = selectedTemplateSummary?.draft ?? null;
  const selectedDraftReadiness = selectedTemplateSummary?.draftReadiness ?? buildGuaranteeDraftReadiness(selectedDraft, selectedGuaranteeTemplate.id);
  const selectedDraftDefinitions = getGuaranteeDraftFieldDefinitions(selectedGuaranteeTemplate.id);
  const selectedDraftFieldValues = selectedDraft?.fieldValuesJson ?? {};
  const selectedDraftRequiredFields = selectedDraftReadiness.fields.filter((field) => field.required);
  const selectedDraftCompletedRequiredCount = selectedDraftRequiredFields.filter((field) => field.status === "available").length;
  const requiredKeys = new Set(selectedGuaranteeTemplate.requiredFieldKeys);
  const unresolvedFields = selectedTemplateSummary?.unresolvedFields ?? [];
  const blockedTemplateCount = guaranteeTemplateSummaries.filter(
    (summary) => summary.unresolvedFields.length > 0 || summary.draftReadiness.requiredMissingCount > 0,
  ).length;
  const selectedTemplateBlocked = Boolean(
    (selectedTemplateSummary?.unresolvedFields.length ?? 0) > 0 ||
      (selectedTemplateSummary?.draftReadiness.requiredMissingCount ?? 0) > 0,
  );
  const selectedDraftBlocked = selectedDraftReadiness.requiredMissingCount > 0;
  const qualityBlockedTemplateCount = guaranteeTemplateSummaries.filter((summary) => summary.template.qualityStatus !== "verified").length;
  const outputReadyTemplateCount = guaranteeTemplateSummaries.filter((summary) => summary.downloadGate.canDownload).length;
  const workbenchFieldGroups = workbenchGroups.map((group) => ({
    ...group,
    fields: group.fields.map(([fieldKey, label]) =>
      buildWorkbenchField({
        fieldKey,
        label,
        requiredKeys,
        confirmedData: brokerageCase.confirmedDataJson,
        statusMap,
        reviewByFieldKey,
      }),
    ),
  }));
  const workbenchLabelByFieldKey = Object.fromEntries(
    workbenchFieldGroups.flatMap((group) => group.fields.map((field) => [field.fieldKey, `${group.label} / ${field.label}`])),
  );
  const allWorkbenchFields = workbenchFieldGroups.flatMap((group) =>
    group.fields.map((field) => ({ ...field, groupId: group.id, label: `${group.label} / ${field.label}` })),
  );
  const attentionFields = sortWorkbenchPriorityFields(allWorkbenchFields.filter(fieldNeedsAttention));
  const selectedWorkbenchFilter: WorkbenchFilter = isWorkbenchFilter(query?.filter)
    ? query.filter
    : attentionFields.length > 0
      ? "attention"
      : "all";
  const selectedWorkbenchQueue = isWorkbenchQueue(query?.queue) ? query.queue : undefined;
  const queueCounts = Object.fromEntries(
    workbenchQueues.map((queue) => [queue, allWorkbenchFields.filter((field) => matchesWorkbenchQueue(field, queue)).length]),
  ) as Record<WorkbenchQueue, number>;
  const displayedWorkbenchFieldGroups = workbenchFieldGroups
    .map((group) => ({
      ...group,
      fields: group.fields.filter((field) =>
        selectedWorkbenchQueue ? matchesWorkbenchQueue(field, selectedWorkbenchQueue) : matchesWorkbenchFilter(field, selectedWorkbenchFilter),
      ),
    }))
    .filter((group) => group.fields.length > 0);
  const displayedFieldKeysJson = JSON.stringify(displayedWorkbenchFieldGroups.flatMap((group) => group.fields.map((field) => field.fieldKey)));
  const displayedConfirmableCandidateCount = displayedWorkbenchFieldGroups
    .flatMap((group) => group.fields)
    .filter((field) => Boolean(getPrimaryEvidence(field)?.value)).length;
  const requiredWorkbenchFields = workbenchFieldGroups.flatMap((group) => group.fields.filter((field) => field.required));
  const completedRequiredCount = requiredWorkbenchFields.filter((field) => Boolean(field.value)).length;
  const requiredProgress = requiredWorkbenchFields.length > 0
    ? Math.round((completedRequiredCount / requiredWorkbenchFields.length) * 100)
    : 100;
  const priorityFields = attentionFields.slice(0, 8);
  const priorityFieldKeysJson = JSON.stringify(priorityFields.map((field) => field.fieldKey));
  const priorityConfirmableCandidateCount = priorityFields.filter((field) => Boolean(getPrimaryEvidence(field)?.value)).length;
  const suggestedReviewCount = reviewItems.filter((item) => item.reviewStatus === "suggested" || item.reviewStatus === "unknown").length;
  const identityWorkbenchGroup = workbenchFieldGroups.find((group) => group.id === "identity_document");
  const identityFilledCount = identityWorkbenchGroup?.fields.filter((field) => Boolean(field.value)).length ?? 0;
  const identityNeedsUpload = identityFilledCount === 0;
  const nextActionLabel =
    priorityFields.length > 0
      ? tr(locale, { ja: "先に不足項目を補完", zh: "先补齐缺失项", ko: "먼저 부족 항목 보완" })
      : selectedTemplateBlocked
        ? tr(locale, { ja: "会社別項目を確認", zh: "确认会社别项目", ko: "회사별 항목 확인" })
        : tr(locale, { ja: "申込書プレビューへ", zh: "进入申请书预览", ko: "신청서 미리보기로" });
  const outputHref = `/output-center?caseId=${encodeURIComponent(brokerageCase.id)}&guaranteeTemplate=${encodeURIComponent(selectedGuaranteeTemplate.id)}`;
  const selectedPreviewHref = `/guarantee-applications/${encodeURIComponent(selectedGuaranteeTemplate.id)}/preview?caseId=${encodeURIComponent(brokerageCase.id)}`;
  const canGoToOutput = !selectedTemplateBlocked;
  const blockingAnchor = priorityFields.length > 0 ? "#workbench-unresolved" : "#guarantee-template-drafts";
  const caseWorkbenchHref = (options?: { filter?: WorkbenchFilter; queue?: WorkbenchQueue; guaranteeTemplateId?: string; hash?: string }) => {
    const params = new URLSearchParams();
    params.set("guaranteeTemplate", options?.guaranteeTemplateId ?? selectedGuaranteeTemplate.id);
    if (options?.filter) params.set("filter", options.filter);
    if (options?.queue) params.set("queue", options.queue);
    return `/cases/${brokerageCase.id}?${params.toString()}${options?.hash ? `#${options.hash}` : ""}`;
  };
  const flashMessage =
    query?.flash === "extraction_review_saved"
      ? tr(locale, {
          ja: "確認結果を案件に保存しました。ここで出力前の整理・補完ができます。",
          zh: "核对结果已保存到案件。可在此整理和补全输出前数据。",
          ko: "확인 결과를 안건에 저장했습니다. 여기에서 출력 전 정리와 보완을 할 수 있습니다.",
        })
        : query?.flash === "case_workbench_saved"
        ? tr(locale, {
            ja: "情報整理を保存しました。保証申込書の出力はこの確認済みデータを使います。",
            zh: "信息整理已保存。保证申请书输出会使用这些已确认数据。",
            ko: "정보 정리를 저장했습니다. 보증 신청서 출력은 이 확인 데이터를 사용합니다.",
          })
          : query?.flash === "guarantee_draft_saved"
            ? tr(locale, {
                ja: "会社別追加項目を保存しました。この内容は選択中の保証会社申込書だけに使います。",
                zh: "会社别追加项目已保存。该内容只用于当前选中的保证会社申请书。",
                ko: "회사별 추가 항목을 저장했습니다. 이 내용은 선택한 보증회사 신청서에만 사용됩니다.",
              })
          : query?.flash === "case_source_merged"
            ? tr(locale, {
                ja: "資料を既存案件へ追加しました。合併履歴から確認・分離できます。",
                zh: "资料已追加到既有案件。可在合并历史中确认或拆分回退。",
                ko: "자료를 기존 안건에 추가했습니다. 합병 이력에서 확인하거나 분리할 수 있습니다.",
              })
            : query?.flash === "case_merge_rolled_back"
              ? tr(locale, {
                  ja: "最新の合併を分離して戻しました。分離した資料は別案件として残っています。",
                  zh: "已将最新合并拆分回退；拆出的资料已作为独立案件保留。",
                  ko: "최신 합병을 분리해 되돌렸습니다. 분리한 자료는 별도 안건으로 남아 있습니다.",
                })
              : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            {tr(locale, { ja: "情報を整理する", zh: "整理信息", ko: "정보 정리" })}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{brokerageCase.caseTitle}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {tr(locale, { ja: "入力資料から作った案件データを補い、確認済みの情報だけを申込書に使います。", zh: "补齐从输入资料整理出的案件数据，只有已确认信息才会进入申请书。", ko: "입력 자료로 만든 안건 데이터를 보완하고 확인된 정보만 신청서에 사용합니다." })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={canGoToOutput ? outputHref : blockingAnchor} className={`rounded-lg px-3 py-2 text-xs font-bold text-white ${canGoToOutput ? "bg-emerald-700 hover:bg-emerald-800" : "bg-slate-950 hover:bg-slate-800"}`}>
            {canGoToOutput
              ? tr(locale, { ja: "保証申込書へ", zh: "前往保证申请书", ko: "보증 신청서로" })
              : tr(locale, { ja: "不足項目だけ補う", zh: "只补缺失项", ko: "부족 항목만 보완" })}
          </Link>
          <Link href="/import-center" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
            {tr(locale, { ja: "資料を入れる", zh: "上传资料", ko: "자료를 넣기" })}
          </Link>
        </div>
      </div>
      <PageFlashBanner message={flashMessage} />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div id="workbench-unresolved" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-indigo-700">
                  {tr(locale, { ja: "いま優先する申込書", zh: "当前优先申请书", ko: "현재 우선 신청서" })}
                </p>
                <h2 className="mt-1 text-xl font-black text-slate-950">{nextActionLabel}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-bold text-white">
                    {selectedGuaranteeTemplate.companyDisplayName}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {selectedGuaranteeTemplate.templateDisplayName}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {tr(locale, {
                    ja: "まず、この申込書を出す時に足りない項目だけを先に表示します。共通データは他社の申込書にも再利用します。",
                    zh: "先只显示这张申请书会卡住的项目。共通数据之后也会复用到其他会社申请书。",
                    ko: "먼저 이 신청서 출력 때 부족한 항목만 표시합니다. 공통 데이터는 다른 회사 신청서에도 재사용됩니다.",
                  })}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeGuaranteeTemplates.map((template) => {
                    const selected = template.id === selectedGuaranteeTemplate.id;
                    return (
                      <Link
                        key={`target-${template.id}`}
                        href={caseWorkbenchHref({ guaranteeTemplateId: template.id })}
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          selected ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {template.companyDisplayName}
                      </Link>
                    );
                  })}
                </div>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${priorityFields.length > 0 ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>
                {priorityFields.length > 0
                  ? `${priorityFields.length} ${tr(locale, { ja: "件を先に確認", zh: "项优先确认", ko: "건 우선 확인" })}`
                  : tr(locale, { ja: "対象申込書の必須は完了", zh: "当前申请书必填已完成", ko: "대상 신청서 필수 완료" })}
              </span>
            </div>
          </div>

          {priorityFields.length > 0 ? (
            <form action={saveCaseWorkbenchAction} className="space-y-4 p-5">
              <input type="hidden" name="caseId" value={brokerageCase.id} />
              <input type="hidden" name="guaranteeTemplate" value={selectedGuaranteeTemplate.id} />
              <input type="hidden" name="presentFieldKeysJson" value={priorityFieldKeysJson} />
              <input type="hidden" name="returnAnchor" value="workbench-unresolved" />
              <div className="grid gap-3 md:grid-cols-2">
                {priorityFields.map((field) => (
                  <article key={`priority-${field.fieldKey}`} className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block text-sm font-black text-slate-950">{field.label}</span>
                        <span className="mt-1 block text-[11px] font-semibold leading-5 text-slate-600">
                          {getPriorityFieldHint(locale, field.fieldKey)}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${getTrustStateClass(field.state)}`}>
                        {getTrustStateLabel(locale, field.state)}
                      </span>
                    </span>
                    <WorkbenchEvidenceSummary locale={locale} field={field} />
                    <WorkbenchFieldControl locale={locale} field={field} tone="attention" />
                    <WorkbenchDecisionSelect locale={locale} field={field} />
                    <WorkbenchEvidenceDetails locale={locale} field={field} />
                  </article>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-xs font-semibold text-slate-600">
                  {tr(locale, {
                    ja: "この保存は表示中の不足項目だけを更新します。ほかの案件データは保持されます。",
                    zh: "这次保存只更新上方显示的缺失项，不会清空其他案件数据。",
                    ko: "이 저장은 표시된 부족 항목만 업데이트합니다. 다른 안건 데이터는 유지됩니다.",
                  })}
                </p>
                <div className="flex flex-wrap gap-2">
                  {priorityConfirmableCandidateCount > 0 ? (
                    <button type="submit" name="saveMode" value="confirm_visible_candidates" className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-50">
                      {tr(locale, { ja: "表示中の候補をまとめて確認", zh: "批量确认当前候选", ko: "표시 중인 후보 일괄 확인" })}
                    </button>
                  ) : null}
                  <button type="submit" className="rounded-lg bg-slate-950 px-5 py-2 text-sm font-bold text-white hover:bg-slate-800">
                    {tr(locale, { ja: "不足項目だけ保存", zh: "只保存这些缺失项", ko: "부족 항목만 저장" })}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="grid gap-3 p-5 md:grid-cols-2">
              {selectedDraftBlocked ? (
                <Link href="#guarantee-template-drafts" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900 hover:bg-emerald-100">
                  {tr(locale, { ja: "会社別項目を補う", zh: "补齐会社别项目", ko: "회사별 항목 보완" })}
                </Link>
              ) : (
                <Link href={outputHref} className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900 hover:bg-emerald-100">
                  {tr(locale, { ja: "保証会社申込書を選ぶ", zh: "选择保证会社申请书", ko: "보증회사 신청서 선택" })}
                </Link>
              )}
              <Link href={selectedPreviewHref} className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-900 hover:bg-white">
                {selectedDraftBlocked
                  ? tr(locale, { ja: "位置は後でプレビュー確認", zh: "位置稍后在预览确认", ko: "위치는 나중에 미리보기 확인" })
                  : tr(locale, { ja: "プレビュー上で印字位置を確認", zh: "在预览中确认印字位置", ko: "미리보기에서 인쇄 위치 확인" })}
              </Link>
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-500">{tr(locale, { ja: "この申込書で必要", zh: "这张申请书所需", ko: "이 신청서에 필요" })}</p>
                <p className="mt-1 text-3xl font-black tabular-nums text-slate-950">{requiredProgress}%</p>
              </div>
              <p className="text-xs font-bold tabular-nums text-slate-500">
                {completedRequiredCount}/{requiredWorkbenchFields.length}
              </p>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-slate-950" style={{ width: `${requiredProgress}%` }} />
            </div>
          </div>

          <div className={`rounded-xl border p-4 ${identityNeedsUpload ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
            <p className={`text-xs font-bold ${identityNeedsUpload ? "text-amber-800" : "text-emerald-800"}`}>
              {tr(locale, { ja: "本人確認資料", zh: "本人确认资料", ko: "본인 확인 자료" })}
            </p>
            <p className="mt-1 text-sm font-black text-slate-950">
              {identityNeedsUpload
                ? tr(locale, { ja: "在留カード/免許証から補完", zh: "用在留卡/驾照补全", ko: "재류카드/면허증으로 보완" })
                : tr(locale, { ja: `${identityFilledCount}項目を取得済み`, zh: `已取得 ${identityFilledCount} 项`, ko: `${identityFilledCount}개 항목 확보` })}
            </p>
            <Link href="/import-center" className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50">
              <span className="material-symbols-outlined text-[16px]">badge</span>
              {tr(locale, { ja: "本人資料を入れる", zh: "上传本人资料", ko: "본인 자료 넣기" })}
            </Link>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold text-slate-500">{tr(locale, { ja: "出力ブロック", zh: "输出阻塞", ko: "출력 차단" })}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-rose-50 p-3">
                <p className="text-[11px] font-bold text-rose-700">{tr(locale, { ja: "テンプレート", zh: "模板", ko: "템플릿" })}</p>
                <p className="mt-1 text-xl font-black text-rose-900">{blockedTemplateCount}</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3">
                <p className="text-[11px] font-bold text-amber-700">{tr(locale, { ja: "候補/不明", zh: "候选/不明", ko: "후보/불명" })}</p>
                <p className="mt-1 text-xl font-black text-amber-900">{suggestedReviewCount}</p>
              </div>
              <div className="rounded-lg bg-orange-50 p-3">
                <p className="text-[11px] font-bold text-orange-700">{tr(locale, { ja: "版式精校", zh: "版式精校", ko: "서식 보정" })}</p>
                <p className="mt-1 text-xl font-black text-orange-900">{qualityBlockedTemplateCount}</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">
              {tr(locale, {
                ja: "未確認の候補は出力に使いません。必要なものだけ確認済みにします。",
                zh: "未确认候选不会用于输出，只把必要内容确认入库。",
                ko: "미확인 후보는 출력에 사용하지 않습니다. 필요한 항목만 확인합니다.",
              })}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold text-slate-500">{tr(locale, { ja: "保存日時", zh: "保存时间", ko: "저장 시간" })}</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{formatDate(brokerageCase.updatedAt, locale)}</p>
          </div>
        </aside>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-950">{tr(locale, { ja: "不足項目への近道", zh: "缺失项快捷入口", ko: "부족 항목 바로가기" })}</h2>
            <p className="mt-1 text-xs text-slate-600">
              {tr(locale, {
                ja: "押すと該当する入力欄へ移動します。会社別項目は下の申込書欄で補います。",
                zh: "点击后会直接跳到对应输入栏。会社别项目在下方申请书栏补齐。",
                ko: "누르면 해당 입력란으로 이동합니다. 회사별 항목은 아래 신청서란에서 보완합니다.",
              })}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
            {unresolvedFields.length} {tr(locale, { ja: "件", zh: "项", ko: "건" })}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {unresolvedFields.length > 0 ? (
            unresolvedFields.map((field: GuaranteeReadinessField) => (
              <a key={`missing-${field.fieldKey}`} href={`#${workbenchAnchorForGuaranteeField(field.fieldKey)}`} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100">
                {field.label}
              </a>
            ))
          ) : (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              {tr(locale, { ja: "必須項目は入力済みです", zh: "必填项已填写", ko: "필수 항목이 입력되었습니다" })}
            </span>
          )}
        </div>
      </section>

      <section id="guarantee-template-drafts" className="scroll-mt-24 rounded-xl border border-emerald-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-emerald-950">
              {tr(locale, { ja: "保証会社別 追加項目", zh: "保证会社别追加项目", ko: "보증회사별 추가 항목" })}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {tr(locale, {
                ja: "案件共通データとは別に、この保証会社だけで使う追加項目を保存します。",
                zh: "这里独立保存当前保证会社专用的追加项目，不污染案件共通数据。",
                ko: "안건 공통 데이터와 별도로 이 보증회사에서만 쓰는 추가 항목을 저장합니다.",
              })}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${outputReadyTemplateCount === activeGuaranteeTemplates.length ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {outputReadyTemplateCount === activeGuaranteeTemplates.length
              ? tr(locale, {
                  ja: `${activeGuaranteeTemplates.length}社出力可`,
                  zh: `${activeGuaranteeTemplates.length}家公司可输出`,
                  ko: `${activeGuaranteeTemplates.length}개 회사 출력 가능`,
                })
              : tr(locale, {
                  ja: `${outputReadyTemplateCount}/${activeGuaranteeTemplates.length}社が直出力可`,
                  zh: `${outputReadyTemplateCount}/${activeGuaranteeTemplates.length} 家可直接输出`,
                  ko: `${outputReadyTemplateCount}/${activeGuaranteeTemplates.length}개 회사 직접 출력 가능`,
                })}
          </span>
        </div>
        <form action={saveGuaranteeApplicationDraftAction} className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <input type="hidden" name="caseId" value={brokerageCase.id} />
          <input type="hidden" name="templateId" value={selectedGuaranteeTemplate.id} />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black text-emerald-800">{tr(locale, { ja: "会社別追加項目", zh: "会社别追加项目", ko: "회사별 추가 항목" })}</p>
              <h3 className="mt-1 text-base font-black text-slate-950">
                {selectedGuaranteeTemplate.companyDisplayName} / {selectedGuaranteeTemplate.templateDisplayName}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {tr(locale, {
                  ja: "プラン・支払方法・同意確認など、保証会社ごとに意味が違う欄だけをここで扱います。",
                  zh: "方案、支付方式、同意确认等每家保证会社含义不同的字段，只在这里处理。",
                  ko: "플랜, 지불 방법, 동의 확인처럼 보증회사마다 의미가 다른 항목만 여기서 다룹니다.",
                })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${selectedDraftBlocked ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>
                {selectedDraftBlocked
                  ? tr(locale, {
                      ja: `必須 ${selectedDraftReadiness.requiredMissingCount}件不足`,
                      zh: `必填缺 ${selectedDraftReadiness.requiredMissingCount} 项`,
                      ko: `필수 ${selectedDraftReadiness.requiredMissingCount}건 부족`,
                    })
                  : tr(locale, { ja: "会社別必須は完了", zh: "会社别必填已完成", ko: "회사별 필수 완료" })}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700">
                {selectedDraftCompletedRequiredCount}/{selectedDraftRequiredFields.length || selectedDraftDefinitions.length}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700">
                {tr(locale, { ja: "項目保存", zh: "项目保存", ko: "항목 저장" })} {formatDate(selectedDraft?.lastReviewedAt ?? selectedDraft?.updatedAt, locale)}
              </span>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {selectedDraftDefinitions.map((definition) => {
              const value = readDraftText(selectedDraftFieldValues, definition.fieldKey);
              const ready = Boolean(value);
              return (
                <label key={definition.fieldKey} className={`block rounded-lg border bg-white p-3 ${definition.required && !ready ? "border-rose-200" : "border-emerald-100"}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {definition.label}
                      {definition.required ? <span className="ml-1 text-rose-600">*</span> : null}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${ready ? "bg-emerald-100 text-emerald-800" : definition.required ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-600"}`}>
                      {ready
                        ? tr(locale, { ja: "入力済み", zh: "已填写", ko: "입력됨" })
                        : definition.required
                          ? tr(locale, { ja: "会社別必須", zh: "会社别必填", ko: "회사별 필수" })
                          : tr(locale, { ja: "任意", zh: "可选", ko: "선택" })}
                    </span>
                  </span>
                  <GuaranteeDraftFieldControl definition={definition} value={value} />
                  <span className="mt-1 block text-[11px] font-semibold leading-5 text-slate-500">
                    {tr(locale, {
                      ja: "案件共通データではなく、この保証会社の追加項目だけに保存されます。",
                      zh: "不会写入案件共通数据，只保存到当前保证会社追加项目。",
                      ko: "안건 공통 데이터가 아니라 이 보증회사 추가 항목에만 저장됩니다.",
                    })}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold leading-5 text-emerald-900">
              {tr(locale, {
                ja: "保存後、プレビューではこの追加項目と案件共通データを合成して印字位置を確認します。",
                zh: "保存后，预览会把这些追加项目和案件共通数据合成，再做印字位置确认。",
                ko: "저장 후 미리보기에서는 이 추가 항목과 안건 공통 데이터를 합성해 인쇄 위치를 확인합니다.",
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href={selectedPreviewHref} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">
                {tr(locale, { ja: "プレビューへ", zh: "进入预览", ko: "미리보기로" })}
              </Link>
              <button type="submit" className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-800">
                {tr(locale, { ja: "会社別項目を保存", zh: "保存会社别项目", ko: "회사별 항목 저장" })}
              </button>
            </div>
          </div>
        </form>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {guaranteeTemplateSummaries.map((summary) => {
            const previewHref = `/guarantee-applications/${encodeURIComponent(summary.template.id)}/preview?caseId=${encodeURIComponent(brokerageCase.id)}`;
            const downloadHref = `/api/guarantee-applications/${encodeURIComponent(summary.template.id)}/download?caseId=${encodeURIComponent(brokerageCase.id)}`;
            const missingCount = summary.unresolvedFields.length;
            const draftMissingCount = summary.draftReadiness.requiredMissingCount;
            const dataReady = missingCount === 0 && draftMissingCount === 0;
            const directOutputReady = summary.downloadGate.canDownload;
            const cardClass = directOutputReady
              ? "border-emerald-200 bg-emerald-50"
              : dataReady
                ? "border-amber-200 bg-amber-50"
                : "border-rose-200 bg-rose-50";

            return (
              <article key={summary.template.id} className={`rounded-lg border p-3 ${cardClass}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black text-slate-950">{summary.template.companyDisplayName}</h3>
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{summary.template.templateDisplayName}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${directOutputReady ? "bg-emerald-100 text-emerald-800" : dataReady ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"}`}>
                    {directOutputReady
                      ? tr(locale, { ja: "直出力可", zh: "可直接输出", ko: "직접 출력 가능" })
                      : dataReady
                        ? tr(locale, { ja: "先に精校", zh: "先精校", ko: "먼저 보정" })
                        : tr(locale, { ja: "要確認", zh: "需确认", ko: "확인 필요" })}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getTemplateQualityClass(summary.template.qualityStatus)}`}>
                    {getTemplateQualityLabel(locale, summary.template.qualityStatus)}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {summary.template.qualityStatus === "verified"
                      ? tr(locale, { ja: "入力位置保存済み", zh: "填写位置已保存", ko: "입력 위치 저장됨" })
                      : tr(locale, { ja: "入力位置要確認", zh: "填写位置需确认", ko: "입력 위치 확인 필요" })}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {tr(locale, { ja: "追加項目", zh: "追加项目", ko: "추가 항목" })}: {formatDate(summary.draft?.lastReviewedAt ?? summary.draft?.updatedAt, locale)}
                  </span>
                </div>
                {summary.template.qualityStatus !== "verified" ? (
                  <p className="mt-2 text-[11px] leading-5 text-amber-900">
                    {tr(locale, {
                      ja: "データ入力は進められますが、PDFはプレビュー上で位置確認・微調整してから保存してください。",
                      zh: "可以继续补数据，但 PDF 必须先进预览做位置确认和微调，不能直接当成成品下载。",
                      ko: "데이터 입력은 계속할 수 있지만 PDF는 미리보기에서 위치 확인과 조정을 거친 뒤 저장해야 합니다.",
                    })}
                  </p>
                ) : null}
                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-md bg-white px-2 py-2">
                    <p className="text-[10px] font-bold text-slate-500">{tr(locale, { ja: "共通不足", zh: "共通缺失", ko: "공통 부족" })}</p>
                    <p className="mt-1 text-lg font-black text-slate-950">{missingCount}</p>
                  </div>
                  <div className="rounded-md bg-white px-2 py-2">
                    <p className="text-[10px] font-bold text-slate-500">{tr(locale, { ja: "会社別不足", zh: "会社别缺失", ko: "회사별 부족" })}</p>
                    <p className="mt-1 text-lg font-black text-slate-950">{draftMissingCount}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={previewHref} className="inline-flex items-center gap-1 rounded-md bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">
                    <span className="material-symbols-outlined text-[14px]">edit_note</span>
                    {tr(locale, { ja: "申込書を確認", zh: "确认申请书", ko: "신청서 확인" })}
                  </Link>
                  {directOutputReady ? (
                    <Link href={downloadHref} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50">
                      <span className="material-symbols-outlined text-[14px]">download</span>
                      PDF
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <details className="rounded-xl border border-indigo-100 bg-white p-4">
        <summary className="cursor-pointer text-sm font-bold text-indigo-950">
          {tr(locale, { ja: "状態ラベルを表示", zh: "显示状态说明", ko: "상태 설명 표시" })}
        </summary>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["confirmed", "edited", "ai_suggested", "needs_review", "missing", "conflict", "rejected", "unknown"] as WorkbenchTrustState[]).map((state) => (
            <span key={state} className={`rounded-full px-3 py-1 text-xs font-bold ${getTrustStateClass(state)}`}>
              {getTrustStateLabel(locale, state)}
            </span>
          ))}
        </div>
      </details>

      <form action={saveCaseWorkbenchAction} className="space-y-4">
        <input type="hidden" name="caseId" value={brokerageCase.id} />
        <input type="hidden" name="guaranteeTemplate" value={selectedGuaranteeTemplate.id} />
        <input type="hidden" name="presentFieldKeysJson" value={displayedFieldKeysJson} />
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-950">{tr(locale, { ja: "編集する項目", zh: "要编辑的项目", ko: "편집할 항목" })}</h2>
              <p className="mt-1 text-xs text-slate-600">
                {tr(locale, {
                  ja: "通常は要対応だけ見れば進められます。保存時は表示中の項目だけを更新します。",
                  zh: "通常只看需处理项目就能推进。保存时只更新当前显示的项目。",
                  ko: "보통 대응 필요 항목만 보면 진행할 수 있습니다. 저장 시 표시 중인 항목만 업데이트합니다.",
                })}
              </p>
            </div>
            {selectedWorkbenchFilter !== "all" || selectedWorkbenchQueue ? (
              <Link href={caseWorkbenchHref({ filter: "all" })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                {tr(locale, { ja: "全項目に戻す", zh: "返回全部项目", ko: "전체 항목으로" })}
              </Link>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={caseWorkbenchHref()} className={`rounded-full px-3 py-1 text-xs font-bold ${!selectedWorkbenchQueue && selectedWorkbenchFilter === "attention" ? "bg-slate-950 text-white" : "bg-amber-100 text-amber-800 hover:opacity-80"}`}>
              {tr(locale, { ja: "要対応", zh: "需处理", ko: "대응 필요" })} {workbenchFieldGroups.flatMap((group) => group.fields).filter(fieldNeedsAttention).length}
            </Link>
            <Link href={caseWorkbenchHref({ filter: "required" })} className={`rounded-full px-3 py-1 text-xs font-bold ${!selectedWorkbenchQueue && selectedWorkbenchFilter === "required" ? "bg-slate-950 text-white" : "bg-indigo-100 text-indigo-800 hover:opacity-80"}`}>
              {tr(locale, { ja: "出力に必要", zh: "输出所需", ko: "출력 필요" })} {requiredWorkbenchFields.length}
            </Link>
            <Link href={caseWorkbenchHref({ filter: "all" })} className={`rounded-full px-3 py-1 text-xs font-bold ${!selectedWorkbenchQueue && selectedWorkbenchFilter === "all" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              {tr(locale, { ja: "全項目", zh: "全部", ko: "전체" })}
            </Link>
          </div>
          <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-xs font-bold text-slate-700">
              {tr(locale, { ja: "さらに絞り込む", zh: "更多筛选", ko: "더 좁혀 보기" })}
            </summary>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              {workbenchQueues.map((queue) => {
                const selected = selectedWorkbenchQueue === queue;
                const count = queueCounts[queue];
                return (
                  <Link
                    key={queue}
                    href={caseWorkbenchHref({ queue })}
                    className={`rounded-lg border px-3 py-2 ${
                      selected ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black">{getWorkbenchQueueLabel(locale, queue)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${selected ? "bg-white text-slate-950" : "bg-slate-100 text-slate-700"}`}>
                        {count}
                      </span>
                    </span>
                    <span className={`mt-1 block text-[11px] leading-4 ${selected ? "text-slate-200" : "text-slate-500"}`}>
                      {getWorkbenchQueueDescription(locale, queue)}
                    </span>
                  </Link>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {workbenchFilterStates.map((state) => {
                const count = workbenchFieldGroups.flatMap((group) => group.fields).filter((field) => field.state === state).length;
                return (
                  <Link key={state} href={caseWorkbenchHref({ filter: state })} className={`rounded-full px-3 py-1 text-xs font-bold ${!selectedWorkbenchQueue && selectedWorkbenchFilter === state ? "bg-slate-950 text-white" : `${getTrustStateClass(state)} hover:opacity-80`}`}>
                    {getTrustStateLabel(locale, state)} {count}
                  </Link>
                );
              })}
            </div>
          </details>
        </section>
        <div className="flex flex-wrap justify-end gap-2">
          {displayedConfirmableCandidateCount > 0 ? (
            <button type="submit" name="saveMode" value={selectedWorkbenchQueue === "trusted_candidates" ? "confirm_trusted_candidates" : "confirm_visible_candidates"} className="rounded-lg border border-emerald-200 bg-white px-5 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-50">
              {selectedWorkbenchQueue === "trusted_candidates"
                ? tr(locale, { ja: "高信頼候補をまとめて確認", zh: "批量确认高可信候选", ko: "고신뢰 후보 일괄 확인" })
                : tr(locale, { ja: "表示中の候補をまとめて確認", zh: "批量确认当前候选", ko: "표시 중인 후보 일괄 확인" })}
            </button>
          ) : null}
          <button type="submit" className="rounded-lg bg-slate-950 px-5 py-2 text-sm font-bold text-white hover:bg-slate-800">
            {tr(locale, { ja: "情報整理を保存", zh: "保存信息整理", ko: "정보 정리 저장" })}
          </button>
        </div>
        {displayedWorkbenchFieldGroups.length > 0 ? displayedWorkbenchFieldGroups.map((group) => (
          <section key={group.id} id={`workbench-${group.id}`} className="scroll-mt-24 rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-950">{group.label}</h2>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {group.fields.map((field) => (
                <article key={field.fieldKey} className={`rounded-lg border p-3 ${field.required && !field.value ? "border-rose-200 bg-rose-50" : "border-slate-100 bg-slate-50"}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {field.label}
                      {field.required ? <span className="ml-1 text-rose-600">*</span> : null}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${getTrustStateClass(field.state)}`}>
                      {getTrustStateLabel(locale, field.state)}
                    </span>
                  </span>
                  <WorkbenchEvidenceSummary locale={locale} field={field} />
                  <WorkbenchFieldControl locale={locale} field={field} />
                  <WorkbenchDecisionSelect locale={locale} field={field} />
                  <WorkbenchEvidenceDetails locale={locale} field={field} />
                </article>
              ))}
            </div>
          </section>
        )) : (
          <section className="rounded-xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-600">
            {tr(locale, { ja: "この状態の項目はありません。", zh: "没有这个状态的项目。", ko: "이 상태의 항목이 없습니다." })}
          </section>
        )}
      </form>

      {mergeHistory.length > 0 ? (
        <section className="rounded-xl border border-emerald-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-emerald-950">
                {tr(locale, { ja: "資料合併履歴", zh: "资料合并历史", ko: "자료 합병 이력" })}
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                {tr(locale, {
                  ja: "既存案件へ追加した資料、照合理由、差分、分離可否を残します。",
                  zh: "保留追加到既有案件的资料、匹配理由、差异和可拆分状态。",
                  ko: "기존 안건에 추가한 자료, 대조 이유, 차이, 분리 가능 상태를 남깁니다.",
                })}
              </p>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
              {mergeHistory.filter((item) => item.status === "active").length} active
            </span>
          </div>
          <div className="mt-3 space-y-3">
            {mergeHistory
              .slice()
              .reverse()
              .map((item) => {
                const canRollback = latestActiveMerge?.id === item.id;
                return (
                  <article key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{item.sourceImportJobTitle}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          {formatDate(new Date(item.mergedAt), locale)} / {tr(locale, { ja: "照合確度", zh: "匹配可信度", ko: "대조 신뢰도" })} {item.confidenceScore}%
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                        {item.status === "active"
                          ? tr(locale, { ja: "合併中", zh: "已合并", ko: "합병 중" })
                          : tr(locale, { ja: "分離済み", zh: "已拆分", ko: "분리됨" })}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
                      {item.matchReasons.map((reason) => (
                        <span key={reason} className="rounded bg-white px-2 py-1 font-semibold text-slate-700">
                          {reason}
                        </span>
                      ))}
                      <span className="rounded bg-white px-2 py-1 font-semibold text-slate-700">
                        {tr(locale, { ja: "追加", zh: "新增", ko: "추가" })}: {item.addedFields.length}
                      </span>
                      <span className="rounded bg-white px-2 py-1 font-semibold text-slate-700">
                        {tr(locale, { ja: "差分", zh: "差异", ko: "차이" })}: {item.conflictFields.length}
                      </span>
                    </div>
                    {item.conflictDetails?.length > 0 ? (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
                        <p className="font-bold">{tr(locale, { ja: "差分内容", zh: "差异内容", ko: "차이 내용" })}</p>
                        {item.conflictDetails.map((detail) => (
                          <p key={detail.fieldKey} className="mt-1">
                            {detail.fieldKey}: {detail.existingValue} / {detail.incomingValue}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {canRollback ? (
                      <form action={rollbackCaseMergeAction} className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <input type="hidden" name="caseId" value={brokerageCase.id} />
                        <input type="hidden" name="mergeId" value={item.id} />
                        <label className="flex items-start gap-2 text-xs text-amber-900">
                          <input type="checkbox" name="rollbackConfirm" required className="mt-0.5" />
                          <span>
                            {tr(locale, {
                              ja: "この資料を別案件へ分離し、現在の案件を合併前の状態へ戻すことを確認します。",
                              zh: "确认将这份资料拆成独立案件，并把当前案件恢复到合并前状态。",
                              ko: "이 자료를 별도 안건으로 분리하고 현재 안건을 합병 전 상태로 되돌리는 것을 확인합니다.",
                            })}
                          </span>
                        </label>
                        <button type="submit" className="mt-2 rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white hover:bg-amber-800">
                          {tr(locale, { ja: "この合併を分離して戻す", zh: "拆分并回退这次合并", ko: "이 합병을 분리해 되돌리기" })}
                        </button>
                      </form>
                    ) : null}
                  </article>
                );
              })}
          </div>
        </section>
      ) : null}

      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-bold text-slate-900">
          {tr(locale, { ja: "入力ファイル・出典を表示", zh: "显示输入文件与来源", ko: "입력 파일과 출처 표시" })}
        </summary>

      <section className="mt-4 rounded-xl border border-indigo-100 bg-white p-4">
        <h2 className="text-sm font-bold text-indigo-950">{tr(locale, { ja: "入力ファイル・出典", zh: "输入文件 / 来源", ko: "입력 파일 / 출처" })}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {sourceFiles.length > 0 ? (
            sourceFiles.map((fileName) => (
              <span key={fileName} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
                {fileName}
              </span>
            ))
          ) : (
            <span className="text-sm text-slate-500">-</span>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-950">
            {tr(locale, { ja: "AI改善用の修正履歴", zh: "用于 AI 改善的修正履历", ko: "AI 개선용 수정 이력" })}
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            {tr(locale, {
              ja: "通常の保存操作から作成した裏側の学習・監査イベントです。前台の操作は増やしません。",
              zh: "这是从普通保存动作生成的后台学习/审计事件，不增加前台操作负担。",
              ko: "일반 저장 동작에서 만든 백스테이지 학습/감사 이벤트입니다. 전면 작업은 늘리지 않습니다.",
            })}
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {correctionEvents.length > 0 ? (
            correctionEvents.map((event) => (
              <article key={event.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[180px_1fr_220px]">
                <div>
                  <p className="text-sm font-bold text-slate-900">{workbenchLabelByFieldKey[event.fieldKey] ?? event.fieldLabel}</p>
                  <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${getCorrectionEventClass(event.changeType)}`}>
                    {getCorrectionEventLabel(locale, event.changeType)}
                  </span>
                </div>
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-[11px] font-bold text-slate-500">{tr(locale, { ja: "候補/変更前", zh: "候选/修改前", ko: "후보/변경 전" })}</p>
                    <p className="mt-1 whitespace-pre-wrap text-slate-800">{event.aiValue || "-"}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-2">
                    <p className="text-[11px] font-bold text-emerald-700">{tr(locale, { ja: "確認後", zh: "确认后", ko: "확인 후" })}</p>
                    <p className="mt-1 whitespace-pre-wrap text-slate-900">{event.confirmedValue || "-"}</p>
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-800">{event.trigger}</p>
                  <p className="mt-1 font-mono text-[11px]">{event.sourceLocation ?? "-"}</p>
                  <p className="mt-1">{event.scopeCandidate}</p>
                </div>
              </article>
            ))
          ) : (
            <p className="px-4 py-4 text-sm text-slate-500">
              {tr(locale, { ja: "修正履歴はまだありません。保存時に必要な差分だけ記録します。", zh: "暂无修正履历。保存时只记录必要差异。", ko: "수정 이력이 아직 없습니다. 저장 시 필요한 차이만 기록합니다." })}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-950">{tr(locale, { ja: "確認状態と根拠", zh: "核对状态与来源证据", ko: "검토 상태와 출처 증거" })}</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {reviewItems.length > 0 ? (
            reviewItems.map((item) => (
              <article key={item.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[180px_1fr_220px]">
                <div>
                  <p className="text-sm font-bold text-slate-900">{item.label}</p>
                  <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${getReviewStatusClass(item.reviewStatus)}`}>
                    {getReviewStatusLabel(locale, item.reviewStatus)}
                  </span>
                </div>
                <div className="text-sm text-slate-700">
                  <p className="whitespace-pre-wrap">{item.finalValue ?? item.editedValue ?? item.normalizedValue ?? item.extractedValue ?? "-"}</p>
                  {item.reviewStatus === "unknown" || item.reviewStatus === "rejected" || item.reviewStatus === "suggested" ? (
                    <p className="mt-1 text-xs text-slate-500">{tr(locale, { ja: "出力に使う確認済みデータとしては扱いません。", zh: "不会作为输出使用的已确认数据。", ko: "출력에 사용하는 확인 데이터로 취급하지 않습니다." })}</p>
                  ) : null}
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-800">{item.sourceSheet}</p>
                  <p className="font-mono text-[11px]">{getSource(item)}</p>
                  <p className="mt-1 tabular-nums">{Math.round(item.confidence * 100)}% / {item.method}</p>
                </div>
              </article>
            ))
          ) : (
            <p className="px-4 py-4 text-sm text-slate-500">{tr(locale, { ja: "保存済みの出典レビューはまだありません。", zh: "暂无已保存的来源核对记录。", ko: "저장된 출처 검토 기록이 아직 없습니다." })}</p>
          )}
        </div>
      </section>
      </details>
    </div>
  );
}
