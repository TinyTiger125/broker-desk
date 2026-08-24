import Link from "next/link";
import { notFound } from "next/navigation";
import { rollbackCaseMergeAction, saveCaseWorkbenchAction } from "@/app/actions";
import { ArchiveRecordButton } from "@/components/archive-record-button";
import { CaseWorkbenchFieldForm } from "@/components/case-workbench-field-form";
import { CaseEditPanel, CaseEvidenceSummary, CaseFieldInput, CaseFieldState, CaseFieldValue, CaseIdentityHeader, CaseOverview, type CaseOverviewOutputBlocker, type CaseOverviewSection } from "@/components/case-overview";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { getBrokerageCaseByIdForContext, getGuaranteeApplicationDraft, listCaseWorkbenchFieldRules, listExtractionReviewItems, listTenantGuaranteeTemplateInstalls, resolveClientVisibilityForContext, resolvePropertyVisibilityForContext } from "@/lib/data";
import type { ExtractionReviewItem, ExtractionReviewStatus } from "@/lib/data";
import { getCaseFieldAliases, getCaseFieldValue } from "@/lib/case-field-normalization";
import {
  CASE_FIELD_CATALOG_GROUPS,
  CASE_INFORMATION_TREE,
  getCaseFieldDefinition,
  getCaseFieldInformation,
  type CaseFieldDefinition,
  type CaseFieldAppliesWhen,
  type CaseFieldImportance,
  type CaseInformationTreeNode,
} from "@/lib/case-field-catalog";
import { buildCaseWorkbenchRuleMap, resolveCaseWorkbenchFieldRequirement, type CaseFieldRequirement } from "@/lib/case-workbench-field-rules";
import {
  isCaseFieldApplicable,
  resolveCaseApplicabilityConditions,
  type CaseApplicabilityConditionKey,
  type ResolvedCaseApplicabilityCondition,
} from "@/lib/case-field-applicability";
import { getCaseWorkbenchProgressSnapshot } from "@/lib/case-workbench-progress";
import { getCaseMergeHistory, getLatestActiveCaseMerge } from "@/lib/case-merge";
import { findGuaranteeCompanyTemplate } from "@/lib/guarantee-application";
import { evaluateGuaranteeDownloadGate } from "@/lib/guarantee-download-gate";
import { FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID } from "@/lib/friends-guarantee-pdf";
import { localizeCaseOverviewFieldLabel, localizeCaseOverviewTreeLabel } from "@/lib/case-overview-localization";
import { formatDate } from "@/lib/format";
import { getLocale, type Locale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";
import { createRequestContext } from "@/lib/visibility-resolver";

export const dynamic = "force-dynamic";

const WORKBENCH_FIELD_STATUS_KEY = "__workbenchFieldStatuses";

type CasePageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ flash?: string; node?: string; field?: string; view?: string; scrollTop?: string }>;
};

type WorkbenchTrustState =
  | "confirmed"
  | "edited"
  | "ai_suggested"
  | "needs_review"
  | "missing"
  | "conflict"
  | "rejected"
  | "unknown"
  | "not_applicable";

type WorkbenchReviewDecision = "confirmed" | "unknown" | "rejected";
type WorkbenchFieldDecision = WorkbenchReviewDecision | "not_applicable";

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
  treeNodeId: string;
  treePath: readonly string[];
  importance: CaseFieldImportance;
  appliesWhen: CaseFieldAppliesWhen;
  applicable: boolean;
  searchAliases: readonly string[];
  sourceLabel: string;
  decision: WorkbenchFieldDecision;
  evidenceItems: WorkbenchFieldEvidence[];
  requirement: CaseFieldRequirement;
  inputSpec: WorkbenchFieldInputSpec;
};

type WorkbenchFieldInputKind = "text" | "textarea" | "tel" | "email" | "money" | "number" | "date" | "select";

type WorkbenchFieldInputSpec = {
  kind: WorkbenchFieldInputKind;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email";
  unit?: string;
  rows?: number;
  placeholder?: Record<Locale, string>;
  options?: string[];
  validation?: "japanese_postal_code";
};

function isWorkbenchCatalogField(field: CaseFieldDefinition) {
  return field.storageScope === "case_fact";
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

function getReviewQueueLabel(locale: Locale, count: number) {
  return tr(locale, {
    ja: `要対応 ${count}件`,
    zh: `待处理 ${count} 项`,
    ko: `처리 필요 ${count}건`,
  });
}

function getBusinessFieldLabel(locale: Locale, fieldKey: string) {
  const definition = getCaseFieldDefinition(fieldKey);
  if (definition?.label) return definition.label;
  return tr(locale, { ja: "確認項目", zh: "资料项目", ko: "확인 항목" });
}

function getOutputBlockerLabel(locale: Locale, code: string) {
  const labels: Record<string, Record<Locale, string>> = {
    required_fields_missing: { ja: "必須情報が未入力", zh: "必填信息未填写", ko: "필수 정보가 비어 있음" },
    draft_required_missing: { ja: "申込書の追加情報が未入力", zh: "申请书追加信息未填写", ko: "신청서 추가 정보가 비어 있음" },
    template_not_verified: { ja: "テンプレートの確認が必要", zh: "模板仍需确认", ko: "템플릿 확인 필요" },
    candidate_fields_unconfirmed: { ja: "候補入力の確認が必要", zh: "候选输入仍需处理", ko: "후보 입력 확인 필요" },
    manual_fields_unplaced: { ja: "印字位置の確認が必要", zh: "打印位置仍需确认", ko: "인쇄 위치 확인 필요" },
    print_fit_blocked: { ja: "文字が印字枠に収まらない", zh: "文字超出打印区域", ko: "문자가 인쇄 영역을 넘음" },
  };
  return labels[code]?.[locale] ?? tr(locale, { ja: "出力前に対応が必要", zh: "输出前需要处理", ko: "출력 전에 처리 필요" });
}

function getOutputBlockerMessage(locale: Locale, code: string) {
  const messages: Record<string, Record<Locale, string>> = {
    required_fields_missing: { ja: "案件の必須情報を補ってください。", zh: "请补齐案件必填信息。", ko: "안건의 필수 정보를 보완해 주세요." },
    draft_required_missing: { ja: "申込書の追加情報を補ってください。", zh: "请补齐申请书追加信息。", ko: "신청서 추가 정보를 보완해 주세요." },
    template_not_verified: { ja: "テンプレートを確認してから出力してください。", zh: "请先确认模板，再进行输出。", ko: "템플릿을 확인한 뒤 출력해 주세요." },
    candidate_fields_unconfirmed: { ja: "候補入力を申込書プレビューで確認してください。", zh: "请在申请书预览中处理候选输入。", ko: "신청서 미리보기에서 후보 입력을 확인해 주세요." },
    manual_fields_unplaced: { ja: "申込書上の入力位置を確認してください。", zh: "请确认申请书上的输入位置。", ko: "신청서 입력 위치를 확인해 주세요." },
    print_fit_blocked: { ja: "長い文字列や桁数超過をプレビューで調整してください。", zh: "请在预览中调整过长文字或超出位数。", ko: "미리보기에서 긴 문자열이나 자릿수 초과를 조정해 주세요." },
  };
  return messages[code]?.[locale] ?? tr(locale, { ja: "対応してからダウンロードしてください。", zh: "请处理后再下载。", ko: "처리한 뒤 다운로드해 주세요." });
}

function getTrustStateLabel(locale: Locale, state: WorkbenchTrustState) {
  const labels: Record<WorkbenchTrustState, Record<Locale, string>> = {
    confirmed: { ja: "確認済み", zh: "已确认", ko: "확인됨" },
    edited: { ja: "確認済み", zh: "已确认", ko: "확인됨" },
    ai_suggested: { ja: "要確認", zh: "待核对", ko: "확인 필요" },
    needs_review: { ja: "要確認", zh: "待核对", ko: "확인 필요" },
    missing: { ja: "未入力", zh: "待补充", ko: "미입력" },
    conflict: { ja: "要確認", zh: "待核对", ko: "확인 필요" },
    rejected: { ja: "要確認", zh: "待核对", ko: "확인 필요" },
    unknown: { ja: "要確認", zh: "待核对", ko: "확인 필요" },
    not_applicable: { ja: "確認済み", zh: "已确认", ko: "확인됨" },
  };
  return labels[state][locale];
}

function getTrustStateClass(state: WorkbenchTrustState) {
  if (state === "confirmed" || state === "edited" || state === "not_applicable") return "bg-emerald-100 text-emerald-800";
  if (state === "ai_suggested" || state === "needs_review" || state === "conflict" || state === "unknown" || state === "rejected") return "bg-amber-100 text-amber-800";
  if (state === "missing") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-700";
}

function getWorkbenchDecisionLabel(locale: Locale, decision: WorkbenchFieldDecision) {
  const labels: Record<WorkbenchFieldDecision, Record<Locale, string>> = {
    confirmed: { ja: "確認済みにする", zh: "确认无误", ko: "확인 완료" },
    unknown: { ja: "確認できない", zh: "暂时无法确认", ko: "확인 불가" },
    rejected: { ja: "使わない", zh: "不采用", ko: "사용 안 함" },
    not_applicable: { ja: "該当なし", zh: "不适用", ko: "해당 없음" },
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
    return { kind: "text", inputMode: "numeric", placeholder: { ja: "1540024", zh: "1540024", ko: "1540024" }, validation: "japanese_postal_code" };
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

function fieldNeedsAttention(field: WorkbenchField) {
  if (!field.applicable) return false;
  if (field.state === "not_applicable") return false;
  if (field.state === "conflict" || field.state === "needs_review" || field.state === "ai_suggested" || field.state === "unknown") {
    return true;
  }
  return field.state === "missing";
}

function fieldShouldShowInEditor(field: WorkbenchField) {
  if (!field.applicable) return false;
  if (field.state === "conflict" || field.state === "needs_review" || field.state === "ai_suggested" || field.state === "unknown") return true;
  if (field.state === "rejected") return field.required;
  if (field.state === "missing") return true;
  return false;
}

function fieldShouldShowInSectionReview(field: WorkbenchField) {
  return field.applicable;
}

function getWorkbenchStateRank(field: WorkbenchField) {
  if (field.state === "conflict") return 0;
  if (field.state === "needs_review" || field.state === "ai_suggested" || field.state === "unknown") return 1;
  if (field.state === "missing") return 2;
  return 9;
}

function getWorkbenchEditRank(field: WorkbenchField) {
  if (!fieldShouldShowInEditor(field)) return 9;
  return field.required ? 0 : 1;
}

function sortWorkbenchEditFields<T extends WorkbenchField>(fields: T[]) {
  return fields.slice().sort((a, b) => {
    const rankDiff = getWorkbenchEditRank(a) - getWorkbenchEditRank(b);
    if (rankDiff !== 0) return rankDiff;
    const stateRankDiff = getWorkbenchStateRank(a) - getWorkbenchStateRank(b);
    if (stateRankDiff !== 0) return stateRankDiff;
    const aConfidence = getPrimaryEvidence(a)?.confidencePercent ?? -1;
    const bConfidence = getPrimaryEvidence(b)?.confidencePercent ?? -1;
    if (aConfidence !== bConfidence) return bConfidence - aConfidence;
    return a.label.localeCompare(b.label);
  });
}

function getWorkbenchFieldAnchor(fieldKey: string) {
  return `case-field-${fieldKey.replaceAll(".", "-")}`;
}

function getImportanceLabel(locale: Locale, importance: CaseFieldImportance) {
  const labels: Record<CaseFieldImportance, Record<Locale, string>> = {
    core: { ja: "通常必要", zh: "通常需要", ko: "보통 필요" },
    conditional: { ja: "該当時のみ", zh: "符合时填写", ko: "해당 시" },
    low_frequency: { ja: "必要時のみ", zh: "需要时填写", ko: "필요 시" },
    output_specific: { ja: "書類別", zh: "文件别项目", ko: "문서별" },
  };
  return labels[importance][locale];
}

function getImportanceClass(importance: CaseFieldImportance) {
  if (importance === "core") return "bg-slate-950 text-white";
  if (importance === "conditional") return "bg-indigo-100 text-indigo-800";
  if (importance === "low_frequency") return "bg-slate-100 text-slate-700";
  return "bg-emerald-100 text-emerald-800";
}

function getSource(item: ExtractionReviewItem) {
  return item.sourceCell ?? item.sourceRange ?? "-";
}

function readText(data: Record<string, unknown>, key: string) {
  return getCaseFieldValue(data, key);
}

function readStatusMap(data: Record<string, unknown>) {
  const value = data[WORKBENCH_FIELD_STATUS_KEY];
  return value && typeof value === "object" ? (value as Record<string, string>) : {};
}

function buildWorkbenchField(input: {
  fieldKey: string;
  label: string;
  confirmedData: Record<string, unknown>;
  statusMap: Record<string, string>;
  reviewByFieldKey: Map<string, ExtractionReviewItem[]>;
  ruleMap: ReadonlyMap<string, CaseFieldRequirement>;
  conditions: Record<CaseApplicabilityConditionKey, ResolvedCaseApplicabilityCondition>;
}): WorkbenchField {
  const value = readText(input.confirmedData, input.fieldKey);
  const catalogDefinition = getCaseFieldDefinition(input.fieldKey);
  const information = getCaseFieldInformation(
    catalogDefinition ?? {
      fieldKey: input.fieldKey,
      label: input.label,
      valueKind: "text",
      storageScope: "case_fact",
    },
  );
  const reviewItems = getCaseFieldAliases(input.fieldKey)
    .flatMap((alias) => input.reviewByFieldKey.get(alias) ?? [])
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const latestReview = reviewItems[reviewItems.length - 1];
  const manualState = input.statusMap[input.fieldKey] as WorkbenchTrustState | undefined;
  const requirement = resolveCaseWorkbenchFieldRequirement(input.fieldKey, information.importance, input.ruleMap);
  const required = requirement === "required";
  const applicable = isCaseFieldApplicable({
    appliesWhen: information.appliesWhen,
    confirmedData: input.confirmedData,
    conditions: input.conditions,
    manualState,
  });
  let state: WorkbenchTrustState = value ? "confirmed" : "missing";
  if (manualState === "edited" || manualState === "unknown" || manualState === "rejected" || manualState === "needs_review" || manualState === "not_applicable") state = manualState;
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
    required,
    state,
    treeNodeId: information.treeNodeId,
    treePath: information.treePath,
    importance: information.importance,
    appliesWhen: information.appliesWhen,
    applicable,
    searchAliases: information.searchAliases,
    sourceLabel: latestReview ? `${latestReview.sourceSheet} / ${getSource(latestReview)}` : "案件データ",
    decision: state === "unknown" ? "unknown" : state === "rejected" ? "rejected" : state === "not_applicable" ? "not_applicable" : "confirmed",
    evidenceItems,
    requirement,
    inputSpec: getWorkbenchFieldInputSpec(input.fieldKey),
  };
}

function WorkbenchDecisionSelect({ locale, field, flush = false }: { locale: Locale; field: WorkbenchField; flush?: boolean }) {
  return (
    <select
      name={`status:${field.fieldKey}`}
      defaultValue={field.decision}
      className={`${flush ? "" : "mt-3"} h-12 w-full rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100`}
    >
      {(["confirmed", "unknown", "not_applicable", "rejected"] as WorkbenchFieldDecision[]).map((decision) => (
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

function getEvidenceConfidenceLabel(locale: Locale, confidencePercent: number) {
  if (confidencePercent >= 85) {
    return tr(locale, { ja: "読み取り良好", zh: "读取清楚", ko: "판독 양호" });
  }
  if (confidencePercent >= 70) {
    return tr(locale, { ja: "要確認", zh: "需要核对", ko: "확인 필요" });
  }
  return tr(locale, { ja: "原本確認", zh: "看原件确认", ko: "원본 확인" });
}

function getAppliesWhenLabel(locale: Locale, appliesWhen: CaseFieldAppliesWhen) {
  const labels: Record<CaseFieldAppliesWhen, Record<Locale, string>> = {
    always: { ja: "常に使う", zh: "固定需要", ko: "항상 사용" },
    lease_case: { ja: "賃貸案件", zh: "租赁案件", ko: "임대 안건" },
    identity_document_available: { ja: "本人資料がある時", zh: "有本人资料时", ko: "본인 자료가 있을 때" },
    employment_required: { ja: "勤務・収入確認時", zh: "需要勤務/收入确认时", ko: "근무/수입 확인 시" },
    guarantor_required: { ja: "保証人あり", zh: "有保证人时", ko: "보증인 있음" },
    emergency_contact_required: { ja: "緊急連絡先あり", zh: "有紧急联系人时", ko: "긴급연락처 있음" },
    co_occupant_exists: { ja: "同居人あり", zh: "有同住人时", ko: "동거인 있음" },
    brokerage_or_management_known: { ja: "業者情報あり", zh: "有业者信息时", ko: "업자 정보 있음" },
    output_template_selected: { ja: "出力選択時", zh: "选择输出文件时", ko: "출력 선택 시" },
  };
  return labels[appliesWhen][locale];
}

function getFieldSourceLabel(locale: Locale, field: WorkbenchField) {
  const evidence = getPrimaryEvidence(field);
  if (evidence) {
    return evidence.confidencePercent >= 85
      ? tr(locale, { ja: "資料から読取", zh: "资料读取", ko: "자료 판독" })
      : tr(locale, { ja: "要確認", zh: "需核对", ko: "확인 필요" });
  }
  if (field.value) {
    return tr(locale, { ja: "登録済み", zh: "已登记", ko: "등록됨" });
  }
  return tr(locale, { ja: "未入力", zh: "未填写", ko: "미입력" });
}

function getFieldSourceClass(field: WorkbenchField) {
  const evidence = getPrimaryEvidence(field);
  if (evidence?.confidencePercent && evidence.confidencePercent >= 85) return "bg-emerald-50 text-emerald-700";
  if (evidence) return "bg-amber-50 text-amber-700";
  if (field.value) return "bg-slate-100 text-slate-700";
  return "bg-rose-50 text-rose-700";
}

function getShortWorkbenchFieldLabel(field: WorkbenchField) {
  const pieces = field.label.split(" / ");
  return pieces[pieces.length - 1] || field.label;
}

function getWorkbenchFieldDisplayValue(field: WorkbenchField) {
  const evidence = getPrimaryEvidence(field);
  return field.value || evidence?.value || "-";
}

function getWorkbenchFieldIssueLabel(locale: Locale, field: WorkbenchField) {
  if (field.state === "conflict") return tr(locale, { ja: "資料が一致しません", zh: "资料不同", ko: "자료 불일치" });
  if (field.state === "missing") return field.required ? tr(locale, { ja: "未入力", zh: "待补充", ko: "미입력" }) : tr(locale, { ja: "未入力", zh: "未填写", ko: "미입력" });
  if (field.state === "ai_suggested" || field.state === "needs_review" || field.state === "unknown") {
    return tr(locale, { ja: "確認してください", zh: "需要核对", ko: "확인 필요" });
  }
  if (field.state === "rejected") return tr(locale, { ja: "使わない", zh: "不采用", ko: "사용 안 함" });
  return tr(locale, { ja: "確認済み", zh: "已确认", ko: "확인됨" });
}

function getWorkbenchFieldActionLabel(locale: Locale, field: WorkbenchField) {
  if (fieldNeedsAttention(field)) {
    return field.value || getPrimaryEvidence(field)?.value
      ? tr(locale, { ja: "確認", zh: "确认", ko: "확인" })
      : tr(locale, { ja: "入力", zh: "填写", ko: "입력" });
  }
  return tr(locale, { ja: "見る", zh: "查看", ko: "보기" });
}

function WorkbenchFieldGuidance({ locale, field }: { locale: Locale; field: WorkbenchField }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
        {getAppliesWhenLabel(locale, field.appliesWhen)}
      </span>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${field.required ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>
        {field.required ? tr(locale, { ja: "必須", zh: "必填", ko: "필수" }) : tr(locale, { ja: "任意", zh: "选填", ko: "선택" })}
      </span>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getFieldSourceClass(field)}`}>
        {getFieldSourceLabel(locale, field)}
      </span>
    </div>
  );
}

function collectTreeNodeIds(node: CaseInformationTreeNode): string[] {
  return [node.id, ...(node.children ?? []).flatMap((child) => collectTreeNodeIds(child))];
}

function flattenTreeNodes(nodes: readonly CaseInformationTreeNode[]): CaseInformationTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenTreeNodes(node.children ?? [])]);
}

const caseInformationTreeNodeIds = new Set(flattenTreeNodes(CASE_INFORMATION_TREE).map((node) => node.id));

function isTreeNodeSelected(value: string | undefined): value is string {
  return Boolean(value && caseInformationTreeNodeIds.has(value));
}

function fieldMatchesTreeNode(field: WorkbenchField, node: CaseInformationTreeNode) {
  return collectTreeNodeIds(node).includes(field.treeNodeId);
}

function getTreeNodeStatus(fields: WorkbenchField[]) {
  const applicableFields = fields.filter((field) => field.applicable);
  const progressFields = applicableFields.filter((field) => field.required);
  const openFields = applicableFields.filter(fieldShouldShowInEditor);
  const reviewCompleted = applicableFields.filter((field) => field.state === "confirmed" || field.state === "edited").length;
  const reviewOpen = applicableFields.filter(
    (field) => field.state !== "confirmed" && field.state !== "edited" && field.state !== "not_applicable",
  ).length;
  return {
    total: progressFields.length,
    attention: applicableFields.filter(fieldNeedsAttention).length,
    open: openFields.length,
    requiredOpen: openFields.filter((field) => field.required).length,
    optionalOpen: openFields.filter((field) => !field.required).length,
    missing: applicableFields.filter((field) => field.state === "missing").length,
    candidates: applicableFields.filter((field) => field.state === "ai_suggested" || field.state === "needs_review").length,
    conflicts: applicableFields.filter((field) => field.state === "conflict").length,
    confirmed: applicableFields.filter((field) => field.state === "confirmed" || field.state === "edited").length,
    completed: progressFields.filter((field) => field.state === "confirmed" || field.state === "edited").length,
    reviewTotal: applicableFields.length,
    reviewCompleted,
    reviewOpen,
    notApplicable: fields.filter((field) => !field.applicable || field.state === "not_applicable").length,
  };
}

function getActiveTreeNode(nodeId: string | undefined) {
  if (!isTreeNodeSelected(nodeId)) return undefined;
  return flattenTreeNodes(CASE_INFORMATION_TREE).find((node) => node.id === nodeId);
}

function WorkbenchEvidenceSummary({ locale, field }: { locale: Locale; field: WorkbenchField }) {
  const evidence = getPrimaryEvidence(field);
  const canUseCandidate = Boolean(evidence?.value);
  if (!evidence) {
    return null;
  }

  return (
    <div className="mt-2 rounded-md border border-indigo-100 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-indigo-700">
          {tr(locale, { ja: "読取結果", zh: "资料读取结果", ko: "자료 판독 결과" })}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getEvidenceConfidenceClass(evidence.confidencePercent)}`}>
            {getEvidenceConfidenceLabel(locale, evidence.confidencePercent)}
          </span>
        </div>
      </div>
      <p className="mt-1 break-words text-xs font-black text-slate-950">
        {tr(locale, { ja: "読取内容", zh: "读取内容", ko: "판독 내용" })}: {evidence.value || "-"}
      </p>
      <p className="mt-1 text-[10px] font-semibold text-slate-500">
        {tr(locale, { ja: "資料位置", zh: "资料位置", ko: "자료 위치" })}: {evidence.sourceLabel}
      </p>
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
            : tr(locale, { ja: "読取内容で保存", zh: "按读取内容保存", ko: "판독 내용으로 저장" })}
        </button>
      ) : null}
    </div>
  );
}

function WorkbenchFieldControl({ locale, field, tone = "default", flush = false }: { locale: Locale; field: WorkbenchField; tone?: "default" | "attention"; flush?: boolean }) {
  const spec = getWorkbenchFieldInputSpec(field.fieldKey);
  const placeholder = spec.placeholder ? tr(locale, spec.placeholder) : undefined;
  const spacingClass = flush ? "" : "mt-4";
  const baseClass =
    tone === "attention"
      ? `${spacingClass} h-12 w-full rounded-md border border-rose-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none focus:border-slate-950 focus:ring-2 focus:ring-rose-100`
      : `${spacingClass} h-12 w-full rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100`;
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
        className={`${baseClass} h-auto min-h-24 resize-y py-3 leading-6`}
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
        data-case-validation={spec.validation?.replaceAll("_", "-")}
        data-validation-message={spec.validation === "japanese_postal_code" ? locale === "zh" ? "日本邮政编码必须为7位数字。" : locale === "ko" ? "일본 우편번호는 7자리로 입력해 주세요." : "日本の郵便番号は7桁で入力してください。" : undefined}
        defaultValue={field.value}
        placeholder={placeholder}
        className={inputClass}
      />
      {spec.unit ? (
        <span className="pointer-events-none absolute bottom-3 right-3 text-xs font-bold text-slate-500">{spec.unit}</span>
      ) : null}
    </span>
  );
}

export default async function CasePage({ params, searchParams }: CasePageProps) {
  const locale = await getLocale();
  const session = await requireTenantSession({ permission: "case.read_assigned" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const requestContext = createRequestContext(session);

  const [{ id }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { flash?: string; node?: string; field?: string; view?: string; scrollTop?: string }),
  ]);
  const caseVisibility = await getBrokerageCaseByIdForContext({ context: requestContext, caseId: id });
  let brokerageCase = caseVisibility.brokerageCase;
  if (!brokerageCase) notFound();
  const canWriteCase = caseVisibility.resolution.outcome === "owner_write";
  const [reviewItems, fieldRules, installedGuaranteeTemplates] = canWriteCase
    ? await Promise.all([
        listExtractionReviewItems({ userId: user.id, tenantId, caseId: id }),
        listCaseWorkbenchFieldRules(user.id, tenantId),
        listTenantGuaranteeTemplateInstalls({ tenantId }),
      ])
    : [[], [], []] as const;
  const caseVisibilityLabel = caseVisibility.resolution.outcome === "company_read"
    ? tr(locale, { ja: "会社メンバーに公開／読み取り専用", zh: "公司成员可见／只读", ko: "회사 멤버 공개／읽기 전용" })
    : undefined;

  if (!canWriteCase) {
    const primaryPartyId = typeof brokerageCase.confirmedDataJson.__primaryPartyId === "string" ? brokerageCase.confirmedDataJson.__primaryPartyId : undefined;
    const primaryPropertyId = brokerageCase.primaryPropertyId || (typeof brokerageCase.confirmedDataJson.__primaryPropertyId === "string" ? brokerageCase.confirmedDataJson.__primaryPropertyId : undefined);
    const [partyVisibility, propertyVisibility] = await Promise.all([
      primaryPartyId ? resolveClientVisibilityForContext({ context: requestContext, clientId: primaryPartyId }) : Promise.resolve(null),
      primaryPropertyId ? resolvePropertyVisibilityForContext({ context: requestContext, propertyId: primaryPropertyId }) : Promise.resolve(null),
    ]);
    const nextConfirmedData = { ...brokerageCase.confirmedDataJson };
    if (!partyVisibility?.record) {
      Object.keys(nextConfirmedData).filter((key) => key === "tenant.name" || key.startsWith("applicant.") || key.startsWith("emergencyContact.") || key.startsWith("coOccupants.") || key.startsWith("guarantor.")).forEach((key) => delete nextConfirmedData[key]);
    }
    if (!propertyVisibility?.record) {
      Object.keys(nextConfirmedData).filter((key) => key.startsWith("property.")).forEach((key) => delete nextConfirmedData[key]);
    }
    delete nextConfirmedData.__primaryPartyId;
    delete nextConfirmedData.__primaryPropertyId;
    brokerageCase = {
      ...brokerageCase,
      caseTitle: tr(locale, { ja: "案件", zh: "案件", ko: "안건" }),
      confirmedDataJson: nextConfirmedData,
    };
  }

  const installedTemplateIds = new Set(installedGuaranteeTemplates.map((install) => install.templateId));
  const outputTemplateId = installedTemplateIds.has(FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID)
    ? FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID
    : installedGuaranteeTemplates[0]?.templateId;
  const outputTemplate = canWriteCase ? findGuaranteeCompanyTemplate(outputTemplateId) : undefined;
  const outputDraft = outputTemplate
    ? await getGuaranteeApplicationDraft({ userId: user.id, tenantId, caseId: brokerageCase.id, templateId: outputTemplate.id })
    : null;
  const downloadGate = outputTemplate
    ? evaluateGuaranteeDownloadGate({ brokerageCase, template: outputTemplate, draft: outputDraft })
    : null;

  const mergeHistory = getCaseMergeHistory(brokerageCase.confirmedDataJson);
  const latestActiveMerge = getLatestActiveCaseMerge(brokerageCase.confirmedDataJson);
  const reviewByFieldKey = reviewItems.reduce<Map<string, ExtractionReviewItem[]>>((acc, item) => {
    const list = acc.get(item.fieldKey) ?? [];
    list.push(item);
    acc.set(item.fieldKey, list);
    return acc;
  }, new Map());
  const statusMap = readStatusMap(brokerageCase.confirmedDataJson);
  const fieldRuleMap = buildCaseWorkbenchRuleMap(fieldRules);
  const evidenceFieldKeys = new Set(reviewItems.map((item) => item.fieldKey));
  const caseApplicabilityConditions = resolveCaseApplicabilityConditions({
    confirmedData: brokerageCase.confirmedDataJson,
    evidenceFieldKeys,
  });
  const caseProgressSnapshot = getCaseWorkbenchProgressSnapshot({
    confirmedData: brokerageCase.confirmedDataJson,
    reviewItems,
    ruleMap: fieldRuleMap,
  });
  const workbenchFieldGroups = workbenchGroups.map((group) => ({
    ...group,
    fields: group.fields.map(([fieldKey, label]) =>
      buildWorkbenchField({
        fieldKey,
        label,
        confirmedData: brokerageCase.confirmedDataJson,
        statusMap,
        reviewByFieldKey,
        ruleMap: fieldRuleMap,
        conditions: caseApplicabilityConditions,
      }),
    ),
  }));
  const allWorkbenchFields = workbenchFieldGroups.flatMap((group) =>
    group.fields.map((field) => ({ ...field, groupId: group.id, label: `${group.label} / ${field.label}` })),
  );
  const applicableWorkbenchFields = allWorkbenchFields.filter((field) => field.applicable);
  const dossierTreeNodes = CASE_INFORMATION_TREE.filter((node) => node.id !== "output_draft" && node.id !== "source_evidence") as readonly CaseInformationTreeNode[];
  const dossierTopNodes = dossierTreeNodes.filter((node) => applicableWorkbenchFields.some((field) => fieldMatchesTreeNode(field, node)));
  const requestedTreeNode = getActiveTreeNode(query?.node);
  const requestedTopTreeNode =
    requestedTreeNode && dossierTopNodes.some((node) => node.id === requestedTreeNode.id)
      ? requestedTreeNode
      : requestedTreeNode
        ? dossierTopNodes.find((node) => collectTreeNodeIds(node).includes(requestedTreeNode.id))
        : undefined;
  const defaultTopTreeNode =
    dossierTopNodes.find((node) => getTreeNodeStatus(applicableWorkbenchFields.filter((field) => fieldMatchesTreeNode(field, node))).open > 0) ??
    dossierTopNodes[0];
  const selectedTopTreeNode = requestedTopTreeNode ?? defaultTopTreeNode;
  const selectedChildTreeNodes =
    selectedTopTreeNode?.children?.filter((node) => applicableWorkbenchFields.some((field) => fieldMatchesTreeNode(field, node))) ?? [];
  const requestedChapterNode =
    requestedTreeNode && selectedChildTreeNodes.some((node) => node.id === requestedTreeNode.id) ? requestedTreeNode : undefined;
  const defaultChapterNode =
    selectedChildTreeNodes.find((node) => getTreeNodeStatus(applicableWorkbenchFields.filter((field) => fieldMatchesTreeNode(field, node))).open > 0) ??
    selectedChildTreeNodes[0] ??
    selectedTopTreeNode;
  const selectedChapterNode = requestedChapterNode ?? defaultChapterNode;
  const selectedChapterFields = sortWorkbenchEditFields(
    selectedChapterNode
      ? applicableWorkbenchFields.filter((field) => fieldMatchesTreeNode(field, selectedChapterNode) && fieldShouldShowInSectionReview(field))
      : [],
  );
  const selectedChapterStatus = selectedChapterNode
    ? getTreeNodeStatus(applicableWorkbenchFields.filter((field) => fieldMatchesTreeNode(field, selectedChapterNode)))
    : getTreeNodeStatus([]);
  const selectedWorkbenchField =
    selectedChapterFields.find((field) => field.fieldKey === query?.field) ??
    selectedChapterFields.find(fieldNeedsAttention) ??
    selectedChapterFields[0];
  const selectedWorkbenchFieldEvidence = selectedWorkbenchField ? getPrimaryEvidence(selectedWorkbenchField) : undefined;
  const selectedTreeNode = selectedChapterNode;
  const selectedTreeStatus = selectedChapterStatus;
  const selectedTopTreeStatus = selectedTopTreeNode
    ? getTreeNodeStatus(applicableWorkbenchFields.filter((field) => fieldMatchesTreeNode(field, selectedTopTreeNode)))
    : getTreeNodeStatus([]);
  const displayedWorkbenchFieldGroups =
    selectedChapterNode && selectedChapterFields.length > 0
      ? [
          {
            id: selectedChapterNode.id,
            label: selectedChapterNode.label,
            fields: selectedChapterFields,
          },
        ]
      : [];
  const dossierProgressPercent = caseProgressSnapshot.reviewPercent;
  const outputHref = `/output-center?caseId=${encodeURIComponent(brokerageCase.id)}`;
  const supplementHref = `/import-center?targetCaseId=${encodeURIComponent(brokerageCase.id)}`;
  const overviewSections: CaseOverviewSection[] = dossierTopNodes.map((node) => {
    const childNodes = (node.children ?? []).filter((child) => applicableWorkbenchFields.some((field) => fieldMatchesTreeNode(field, child)));
    const effectiveChildren = childNodes.length > 0 ? childNodes : [node];
    return {
      id: `case-section-${node.id}`,
      label: localizeCaseOverviewTreeLabel(locale, node.label),
      children: effectiveChildren.map((child) => ({
        id: `${node.id}-${child.id}`,
        label: localizeCaseOverviewTreeLabel(locale, child.label),
        fields: applicableWorkbenchFields
          .filter((field) => fieldMatchesTreeNode(field, child))
          .map((field) => ({
            fieldKey: field.fieldKey,
            label: localizeCaseOverviewFieldLabel(locale, getShortWorkbenchFieldLabel(field)),
            value: field.value,
            displayValue: getWorkbenchFieldDisplayValue(field),
            required: field.required,
            state: field.state,
            importance: field.importance,
            applicable: field.applicable,
            issueLabel: fieldNeedsAttention(field) ? getWorkbenchFieldIssueLabel(locale, field) : undefined,
            treePath: field.treePath.map((path) => localizeCaseOverviewTreeLabel(locale, path)),
            sourceLabel: field.sourceLabel,
            evidenceItems: field.evidenceItems,
            inputSpec: field.inputSpec,
          })),
      })),
    };
  }).filter((section) => section.children.some((child) => child.fields.length > 0));
  const overviewIssueCount = applicableWorkbenchFields.filter(fieldNeedsAttention).length;
  const outputBlockers: CaseOverviewOutputBlocker[] = downloadGate?.blockedReasons.map((reason) => ({
    code: reason.code,
    count: reason.count,
    label: getOutputBlockerLabel(locale, reason.code),
    message: getOutputBlockerMessage(locale, reason.code),
    fields: reason.fields.map((field) => ({
      fieldKey: field.fieldKey,
      label: getBusinessFieldLabel(locale, field.fieldKey),
      actionUrl: field.actionUrl,
    })),
  })) ?? [];
  const overviewHasOutputTemplate = Boolean(outputTemplate);
  const overviewPreviewHref = outputTemplate
    ? `/guarantee-applications/${encodeURIComponent(outputTemplate.id)}/preview?caseId=${encodeURIComponent(brokerageCase.id)}`
    : outputHref;
  const overviewDownloadHref = outputTemplate
    ? `/api/guarantee-applications/${encodeURIComponent(outputTemplate.id)}/download?caseId=${encodeURIComponent(brokerageCase.id)}`
    : null;
  const caseWorkbenchHref = (options?: { node?: string; field?: string; hash?: string }) => {
    const params = new URLSearchParams();
    if (options?.node) params.set("node", options.node);
    if (options?.field) params.set("field", options.field);
    const queryString = params.toString();
    return `/cases/${brokerageCase.id}${queryString ? `?${queryString}` : ""}${options?.hash ? `#${options.hash}` : ""}`;
  };
  const applicantSummary = readText(brokerageCase.confirmedDataJson, "applicant.name") || readText(brokerageCase.confirmedDataJson, "tenant.name") || "-";
  const propertySummary =
    [readText(brokerageCase.confirmedDataJson, "property.name"), readText(brokerageCase.confirmedDataJson, "property.roomNumber")]
      .filter(Boolean)
      .join(" ") || "-";
  const guaranteeCompanySummary =
    readText(brokerageCase.confirmedDataJson, "guaranteeCompany.name") ||
    readText(brokerageCase.confirmedDataJson, "guarantee.companyName") ||
    tr(locale, { ja: "未選択", zh: "未选择", ko: "미선택" });
  const currentHandlerSummary =
    canWriteCase
      ? readText(brokerageCase.confirmedDataJson, "__assigneeName") || tr(locale, { ja: "現在の担当者", zh: "当前负责人", ko: "현재 담당자" })
      : tr(locale, { ja: "担当者", zh: "当前负责人", ko: "현재 담당자" });
  const flashMessage =
    query?.flash === "extraction_review_saved"
      ? tr(locale, {
          ja: "確認結果を案件に保存しました。必要な項目を続けて整理できます。",
          zh: "核对结果已保存到案件。可以继续整理需要的项目。",
          ko: "확인 결과를 안건에 저장했습니다. 필요한 항목을 계속 정리할 수 있습니다.",
        })
      : query?.flash === "blank_case_created"
        ? tr(locale, {
            ja: "空の案件を作成しました。必要な項目から入力できます。",
            zh: "空案件已创建。可以从需要的项目开始填写。",
            ko: "빈 안건을 만들었습니다. 필요한 항목부터 입력할 수 있습니다.",
          })
        : query?.flash === "case_workbench_saved"
        ? tr(locale, {
            ja: "情報整理を保存しました。",
            zh: "信息整理已保存。",
            ko: "정보 정리를 저장했습니다.",
          })
        : query?.flash === "case_field_invalid"
          ? tr(locale, {
              ja: "郵便番号は7桁で入力してください。変更は保存されていません。",
              zh: "日本邮政编码必须为7位数字，修改未保存。",
              ko: "일본 우편번호는 7자리여야 하며 변경 사항은 저장되지 않았습니다.",
            })
          : query?.flash === "case_applicability_saved"
            ? tr(locale, {
                ja: "保存しました。",
                zh: "设置已保存。",
                ko: "저장했습니다.",
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
              : query?.flash === "excel_upload_missing"
                ? tr(locale, {
                    ja: "Excel ファイルを選択してください。",
                    zh: "请选择 Excel 文件。",
                    ko: "Excel 파일을 선택해 주세요.",
                  })
                : query?.flash === "excel_upload_type"
                  ? tr(locale, {
                      ja: ".xlsx ファイルを選択してください。",
                      zh: "请选择 .xlsx 文件。",
                      ko: ".xlsx 파일을 선택해 주세요.",
                    })
                  : query?.flash === "excel_upload_read_failed"
                    ? tr(locale, {
                        ja: "Excel ファイルを読み取れませんでした。ファイル形式を確認してください。",
                        zh: "无法读取 Excel 文件，请确认文件格式。",
                        ko: "Excel 파일을 읽을 수 없습니다. 파일 형식을 확인해 주세요.",
                      })
	                : query?.flash === "excel_upload_empty"
	                  ? tr(locale, {
	                      ja: "Excel 内に読み取れるデータがありません。",
	                      zh: "Excel 内没有可读取的数据。",
	                      ko: "Excel 안에 읽을 수 있는 데이터가 없습니다.",
	                    })
	                  : query?.flash === "identity_upload_missing"
	                    ? tr(locale, {
	                        ja: "本人資料ファイルを選択してください。",
	                        zh: "请选择本人资料文件。",
	                        ko: "본인 자료 파일을 선택해 주세요.",
	                      })
	                    : query?.flash === "identity_upload_too_many"
	                      ? tr(locale, {
	                          ja: "本人資料は一度に6件まで選択できます。",
	                          zh: "本人资料一次最多选择6个文件。",
	                          ko: "본인 자료는 한 번에 6개까지 선택할 수 있습니다.",
	                        })
	                      : query?.flash === "identity_upload_too_large"
	                        ? tr(locale, {
	                            ja: "1ファイル25MB以下にしてください。",
	                            zh: "单个文件请控制在25MB以内。",
	                            ko: "파일 1개는 25MB 이하로 선택해 주세요.",
	                          })
	                        : query?.flash === "identity_upload_total_too_large"
	                          ? tr(locale, {
	                              ja: "ファイル合計を60MB以下にしてください。",
	                              zh: "文件合计请控制在60MB以内。",
	                              ko: "전체 파일 합계는 60MB 이하로 선택해 주세요.",
	                            })
	                          : query?.flash === "identity_upload_type"
	                            ? tr(locale, {
	                                ja: "PDF または画像ファイルを選択してください。",
	                                zh: "请选择 PDF 或图片文件。",
	                                ko: "PDF 또는 이미지 파일을 선택해 주세요.",
	                              })
	              : undefined;
  const flashTone =
    query?.flash?.startsWith("excel_upload_") || query?.flash?.startsWith("identity_upload_") ? "error" : undefined;
  const activeView = query?.view === "quick" || query?.view === "overview"
    ? query.view
    : downloadGate && downloadGate.blockedReasons.length > 0
      ? "quick"
      : "overview";
  const parsedScrollTop = query?.scrollTop ? Number(query.scrollTop) : Number.NaN;
  const initialScrollTop = Number.isSafeInteger(parsedScrollTop) && parsedScrollTop >= 0 ? parsedScrollTop : undefined;
  const initialFieldKey = query?.field && allWorkbenchFields.some((field) => field.fieldKey === query.field) ? query.field : undefined;

  if (!canWriteCase) {
    return (
      <CaseOverview
        caseId={brokerageCase.id}
        caseTitle={brokerageCase.caseTitle}
        applicantSummary={applicantSummary}
        propertySummary={propertySummary}
        guaranteeCompanySummary={guaranteeCompanySummary}
        currentHandlerSummary={currentHandlerSummary}
        sections={overviewSections}
        locale={locale}
        issueCount={overviewIssueCount}
        outputHref=""
        previewHref=""
        downloadHref={null}
        dataVersion={brokerageCase.updatedAt.toISOString()}
        outputBlockers={[]}
        hasOutputTemplate={false}
        saveAction={saveCaseWorkbenchAction}
        readOnly
        visibilityLabel={caseVisibilityLabel}
        flash={<PageFlashBanner message={flashMessage} tone={flashTone} />}
      />
    );
  }

  if (activeView === "overview") {
    return (
      <CaseOverview
        caseId={brokerageCase.id}
        caseTitle={brokerageCase.caseTitle}
        applicantSummary={applicantSummary}
        propertySummary={propertySummary}
        guaranteeCompanySummary={guaranteeCompanySummary}
        currentHandlerSummary={currentHandlerSummary}
        sections={overviewSections}
        locale={locale}
        issueCount={overviewIssueCount}
        outputHref={outputHref}
        previewHref={overviewPreviewHref}
        downloadHref={overviewDownloadHref}
        dataVersion={brokerageCase.updatedAt.toISOString()}
        outputBlockers={outputBlockers}
        hasOutputTemplate={overviewHasOutputTemplate}
        saveAction={saveCaseWorkbenchAction}
        flash={<PageFlashBanner message={flashMessage} tone={flashTone} />}
        initialFieldKey={initialFieldKey}
        initialScrollTop={initialScrollTop}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CaseIdentityHeader
        caseId={brokerageCase.id}
        caseTitle={brokerageCase.caseTitle}
        applicantSummary={applicantSummary}
        propertySummary={propertySummary}
        guaranteeCompanySummary={guaranteeCompanySummary}
        currentHandlerSummary={currentHandlerSummary}
        locale={locale}
        activeView="quick"
        issueCount={overviewIssueCount}
        actions={
          <>
            <span className="hidden sm:inline-flex">
              <Link href={supplementHref} className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
                {tr(locale, { ja: "資料を追加", zh: "补充资料", ko: "자료 추가" })}
              </Link>
            </span>
            <span className="hidden sm:inline-flex">
              <Link href={`/relationship-tree?type=case&id=${encodeURIComponent(brokerageCase.id)}`} className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-[#002FA7] hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus:ring-blue-300">
                {tr(locale, { ja: "関係を確認", zh: "查看关系", ko: "관계 확인" })}
              </Link>
            </span>
            <Link href={outputHref} className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
              {tr(locale, { ja: "文書出力", zh: "输出文件", ko: "서류 출력" })}
            </Link>
            <a href={`/cases/${encodeURIComponent(brokerageCase.id)}/guarantee-application`} className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-900 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
              {tr(locale, { ja: "申込書を生成", zh: "生成申请书", ko: "신청서 생성" })}
            </a>
            <span className="hidden sm:inline-flex">
              <ArchiveRecordButton
                entityType="case"
                entityId={brokerageCase.id}
                status={brokerageCase.lifecycleStatus ?? "active"}
                locale={locale}
                returnTo="/organize-center?type=case"
              />
            </span>
          </>
        }
      />
      <PageFlashBanner message={flashMessage} tone={flashTone} />

      {selectedWorkbenchField ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 sm:hidden" aria-label={tr(locale, { ja: "次の対応項目", zh: "下一项任务", ko: "다음 처리 항목" })}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black text-amber-900">{tr(locale, { ja: "次の対応項目", zh: "下一项任务", ko: "다음 처리 항목" })}</p>
              <CaseFieldValue label={getShortWorkbenchFieldLabel(selectedWorkbenchField)} value={getWorkbenchFieldDisplayValue(selectedWorkbenchField)} />
              <CaseFieldState issueLabel={fieldNeedsAttention(selectedWorkbenchField) ? getWorkbenchFieldIssueLabel(locale, selectedWorkbenchField) : undefined} />
            </div>
            <Link href={caseWorkbenchHref({ node: selectedChapterNode?.id, field: selectedWorkbenchField.fieldKey })} scroll={false} className="shrink-0 rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
              {getWorkbenchFieldActionLabel(locale, selectedWorkbenchField)}
            </Link>
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="grid min-w-0 divide-y divide-slate-200 md:grid-cols-2 md:divide-x 2xl:grid-cols-[1.2fr_1.2fr_1.2fr_1fr_0.7fr_0.7fr_0.9fr] 2xl:divide-y-0">
          {[
            {
              icon: "person",
              label: tr(locale, { ja: "申込人", zh: "申请人", ko: "신청인" }),
              value: applicantSummary,
            },
            {
              icon: "apartment",
              label: tr(locale, { ja: "物件", zh: "物件", ko: "물건" }),
              value: propertySummary,
            },
            {
              icon: "verified_user",
              label: tr(locale, { ja: "保証会社", zh: "保证公司", ko: "보증 회사" }),
              value: guaranteeCompanySummary,
            },
            {
              icon: "assignment_ind",
              label: tr(locale, { ja: "担当", zh: "负责人", ko: "담당" }),
              value: currentHandlerSummary,
            },
          ].map((item) => (
            <div key={item.label} className="flex min-w-0 items-center gap-3 p-4">
              <span className="material-symbols-outlined h-10 w-10 shrink-0 rounded-lg bg-slate-50 p-0 text-[20px] text-slate-700" aria-hidden="true">
                {item.icon}
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-500">{item.label}</p>
                <p className="mt-1 truncate text-sm font-black text-slate-950">{item.value}</p>
              </div>
            </div>
          ))}
          <div className="p-4">
            <p className="text-[11px] font-bold text-slate-500">{tr(locale, { ja: "要確認", zh: "待核对", ko: "확인 필요" })}</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-rose-600">{caseProgressSnapshot.reviewOpen}</p>
          </div>
          <div className="p-4">
            <p className="text-[11px] font-bold text-slate-500">{tr(locale, { ja: "確認済み", zh: "已确认", ko: "확인됨" })}</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-emerald-700">{caseProgressSnapshot.reviewCompleted}</p>
          </div>
          <div className="p-4">
            <p className="text-[11px] font-bold text-slate-500">{tr(locale, { ja: "全体", zh: "总进度", ko: "전체" })}</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{dossierProgressPercent}%</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-700" style={{ width: `${dossierProgressPercent}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section id="case-review-desk" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white">
        <div className="grid min-w-0 2xl:grid-cols-[minmax(17rem,20rem)_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 2xl:sticky 2xl:top-20 2xl:max-h-[calc(100vh-6rem)] 2xl:overflow-y-auto 2xl:border-b-0 2xl:border-r">
            <div className="border-b border-slate-100 p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-blue-700">{tr(locale, { ja: "確認範囲", zh: "核对范围", ko: "확인 범위" })}</p>
                  <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{dossierProgressPercent}%</p>
                </div>
                <div className="text-right text-[11px] font-black text-slate-500">
                  <p>
                    {getReviewQueueLabel(locale, caseProgressSnapshot.reviewOpen)}
                  </p>
                  <p className="mt-1">
                    {tr(locale, { ja: "確認済み", zh: "已确认", ko: "확인됨" })} <span className="text-emerald-700">{caseProgressSnapshot.reviewCompleted}</span>
                  </p>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-700" style={{ width: `${dossierProgressPercent}%` }} />
              </div>
            </div>

            <nav className="p-4">
              <div className="space-y-1.5">
                {dossierTopNodes.map((node) => {
                  const nodeFields = applicableWorkbenchFields.filter((field) => fieldMatchesTreeNode(field, node));
                  const status = getTreeNodeStatus(nodeFields);
                  const selected = selectedTopTreeNode?.id === node.id;
                  const progress = status.reviewTotal > 0 ? Math.round((status.reviewCompleted / status.reviewTotal) * 100) : 100;
                  return (
                    <Link
                      key={node.id}
                      href={caseWorkbenchHref({ node: node.id })}
                      scroll={false}
                      className={`block rounded-lg border px-3 py-2.5 transition ${
                        selected ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950 hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-black">{node.label}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${selected ? status.reviewOpen > 0 ? "bg-rose-400/25 text-rose-100 ring-1 ring-rose-300/50" : "bg-white/15 text-white" : status.reviewOpen > 0 ? "bg-rose-100 text-rose-800 ring-1 ring-rose-200" : "bg-emerald-50 text-emerald-800"}`}>
                          {status.reviewOpen > 0
                            ? getReviewQueueLabel(locale, status.reviewOpen)
                            : tr(locale, { ja: "確認済み", zh: "已确认", ko: "확인됨" })}
                        </span>
                      </span>
                      <span className="mt-2 flex items-center gap-2">
                        <span className={`h-1.5 flex-1 overflow-hidden rounded-full ${selected ? "bg-white/15" : "bg-slate-100"}`}>
                          <span className={`block h-full rounded-full ${selected ? "bg-white" : "bg-blue-700"}`} style={{ width: `${progress}%` }} />
                        </span>
                        <span className={`text-[11px] font-black tabular-nums ${selected ? "text-white" : "text-slate-500"}`}>
                          {status.reviewCompleted}/{status.reviewTotal}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>

              {selectedChildTreeNodes.length > 0 ? (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <p className="text-[11px] font-black text-slate-500">{selectedTopTreeNode?.label}</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{selectedChildTreeNodes.length}</span>
                  </div>
                  <div className="mt-2 max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
                    {selectedChildTreeNodes.map((node) => {
                      const nodeFields = applicableWorkbenchFields.filter((field) => fieldMatchesTreeNode(field, node));
                      const status = getTreeNodeStatus(nodeFields);
                      const selected = selectedChapterNode?.id === node.id;
                      const progress = status.reviewTotal > 0 ? Math.round((status.reviewCompleted / status.reviewTotal) * 100) : 100;
                      return (
                        <Link
                          key={node.id}
                          href={caseWorkbenchHref({ node: node.id })}
                          scroll={false}
                          className={`block rounded-md border px-3 py-2 transition ${
                            selected ? "border-blue-700 bg-blue-50" : "border-transparent bg-white hover:bg-slate-50"
                          }`}
                        >
                          <span className="flex items-center justify-between gap-3">
                            <span className="truncate text-xs font-black text-slate-950">{node.label}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${status.reviewOpen > 0 ? "bg-rose-100 text-rose-800 ring-1 ring-rose-200" : "bg-emerald-50 text-emerald-800"}`}>
                              {status.reviewOpen > 0
                                ? getReviewQueueLabel(locale, status.reviewOpen)
                                : tr(locale, { ja: "確認済み", zh: "已确认", ko: "확인됨" })}
                            </span>
                          </span>
                          <span className="mt-1.5 flex items-center gap-2">
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                              <span className="block h-full rounded-full bg-blue-700" style={{ width: `${progress}%` }} />
                            </span>
                            <span className="text-[11px] font-black tabular-nums text-slate-500">
                              {status.reviewCompleted}/{status.reviewTotal}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </nav>
          </aside>

          <div className="min-w-0">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-blue-700">{selectedTopTreeNode?.label ?? tr(locale, { ja: "確認項目", zh: "核对项目", ko: "확인 항목" })}</p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">{selectedChapterNode?.label ?? "-"}</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                  <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-800 ring-1 ring-rose-200">
                    {getReviewQueueLabel(locale, selectedChapterStatus.reviewOpen)}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
                    {tr(locale, { ja: "確認済み", zh: "已确认", ko: "확인됨" })} {selectedChapterStatus.reviewCompleted}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid min-w-0 2xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
              <div className="min-w-0 border-b border-slate-200 2xl:border-b-0 2xl:border-r">
                <div className="min-w-0">
                    <div className="grid grid-cols-[4rem_minmax(0,1fr)_minmax(0,1.15fr)_auto] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-3 text-[11px] font-black text-slate-500 sm:grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1.15fr)_auto] sm:gap-3 sm:px-5">
                      <span>{tr(locale, { ja: "状態", zh: "状态", ko: "상태" })}</span>
                      <span>{tr(locale, { ja: "項目", zh: "项目", ko: "항목" })}</span>
                      <span>{tr(locale, { ja: "現在値", zh: "当前值", ko: "현재값" })}</span>
                      <span>{tr(locale, { ja: "操作", zh: "操作", ko: "작업" })}</span>
                    </div>
                    <div className="divide-y divide-slate-100 2xl:max-h-[calc(100vh-23rem)] 2xl:overflow-y-auto">
                      {selectedChapterFields.map((field) => {
                        const selected = selectedWorkbenchField?.fieldKey === field.fieldKey;
                        return (
                          <Link
                            key={field.fieldKey}
                            href={caseWorkbenchHref({ node: selectedChapterNode?.id, field: field.fieldKey })}
                            scroll={false}
                            className={`grid grid-cols-[4rem_minmax(0,1fr)_minmax(0,1.15fr)_auto] gap-2 px-3 py-4 transition sm:grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1.15fr)_auto] sm:gap-3 sm:px-5 ${
                              selected ? "bg-blue-50 ring-1 ring-inset ring-blue-700" : "hover:bg-slate-50"
                            }`}
                          >
                            <span>
                              <CaseFieldState
                                issueLabel={fieldNeedsAttention(field) ? getWorkbenchFieldIssueLabel(locale, field) : undefined}
                              />
                            </span>
                            <span className="min-w-0">
                              <span className="block break-words text-sm font-black text-slate-950">
                                {getShortWorkbenchFieldLabel(field)}
                                {field.required ? <span className="ml-1 text-slate-400" aria-label={tr(locale, { ja: "必須", zh: "必填", ko: "필수" })}>*</span> : null}
                              </span>
                              <span className="mt-1 block break-words text-[11px] font-semibold text-slate-500">{field.treePath.join(" / ")}</span>
                            </span>
                            <span className="min-w-0">
                              <CaseFieldValue value={getWorkbenchFieldDisplayValue(field)} />
                            </span>
                            <span className="self-center text-right text-xs font-black text-blue-700">{getWorkbenchFieldActionLabel(locale, field)}</span>
                          </Link>
                        );
                      })}
                      {selectedChapterFields.length === 0 ? (
                        <div className="px-5 py-10 text-center text-sm font-semibold text-slate-500">
                          {tr(locale, { ja: "表示する項目はありません。", zh: "没有可核对项目。", ko: "표시할 항목이 없습니다." })}
                        </div>
                      ) : null}
                    </div>
                </div>
              </div>

              <aside id="case-field-editor" className="scroll-mt-24 bg-white p-4 2xl:sticky 2xl:top-20 2xl:max-h-[calc(100vh-6rem)] 2xl:self-start 2xl:overflow-y-auto">
                {selectedWorkbenchField ? (
                  <CaseEditPanel title={getShortWorkbenchFieldLabel(selectedWorkbenchField)} context={selectedChapterNode?.label ?? tr(locale, { ja: "項目確認", zh: "项目核对", ko: "항목 확인" })} issueLabel={fieldNeedsAttention(selectedWorkbenchField) ? getWorkbenchFieldIssueLabel(locale, selectedWorkbenchField) : undefined}>
                    <CaseWorkbenchFieldForm
                      action={saveCaseWorkbenchAction}
                      caseId={brokerageCase.id}
                      fieldKey={selectedWorkbenchField.fieldKey}
                      returnNode={selectedChapterNode?.id}
                      returnField={selectedWorkbenchField.fieldKey}
                      returnAnchor="case-field-editor"
                      showSaveWhenPristine
                      saveLabel={tr(locale, { ja: "確認して保存", zh: "确认并保存", ko: "확인하고 저장" })}
                      savingLabel={tr(locale, { ja: "保存中", zh: "保存中", ko: "저장 중" })}
                      className="mt-4 space-y-4"
                    >
                    {selectedWorkbenchFieldEvidence ? (
                      <input type="hidden" name={`candidate:${selectedWorkbenchField.fieldKey}`} value={selectedWorkbenchFieldEvidence.value} />
                    ) : null}
                    <div className="space-y-3">
                      <CaseEvidenceSummary
                        locale={locale}
                        title={tr(locale, { ja: "資料内容", zh: "资料内容", ko: "자료 내용" })}
                        evidenceItems={selectedWorkbenchField.evidenceItems}
                        currentValue={selectedWorkbenchField.value}
                        candidateFieldKey={selectedWorkbenchField.fieldKey}
                      />

                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-[11px] font-bold text-slate-500">{tr(locale, { ja: "確認内容", zh: "确认内容", ko: "확인 내용" })}</p>
                        <div className="mt-2">
                          <CaseFieldInput
                            name={`field:${selectedWorkbenchField.fieldKey}`}
                            value={selectedWorkbenchField.value}
                            label={selectedWorkbenchField.label}
                            inputSpec={selectedWorkbenchField.inputSpec}
                            locale={locale}
                            tone={fieldNeedsAttention(selectedWorkbenchField) ? "attention" : "default"}
                          />
                        </div>
                        <div className="mt-2">
                          <WorkbenchDecisionSelect locale={locale} field={selectedWorkbenchField} flush />
                        </div>
                      </div>
                    </div>
                    </CaseWorkbenchFieldForm>
                  </CaseEditPanel>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
                    {tr(locale, { ja: "項目を選択してください。", zh: "请选择一个项目。", ko: "항목을 선택해 주세요." })}
                  </div>
                )}
              </aside>
            </div>
          </div>
        </div>
      </section>

      <section className="hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid gap-0 2xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 p-4 2xl:sticky 2xl:top-14 2xl:max-h-[calc(100vh-4rem)] 2xl:overflow-y-auto 2xl:border-b-0 2xl:border-r">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-indigo-700">
                    {tr(locale, { ja: "確認状況", zh: "核对进度", ko: "확인 상태" })}
                  </p>
                  <h2 className="mt-1 text-base font-black text-slate-950">
                    {tr(locale, { ja: "案件資料", zh: "案件资料", ko: "안건 자료" })}
                  </h2>
                </div>
                <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-black tabular-nums text-white">
                  {dossierProgressPercent}%
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-md bg-white p-3">
                  <p className="text-[11px] font-bold text-slate-500">{tr(locale, { ja: "確認済み", zh: "已确认", ko: "확인됨" })}</p>
                  <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{caseProgressSnapshot.reviewCompleted}</p>
                </div>
                <div className="rounded-md bg-white p-3">
                  <p className="text-[11px] font-bold text-slate-500">{tr(locale, { ja: "要確認", zh: "待核对", ko: "확인 필요" })}</p>
                  <p className="mt-1 text-2xl font-black tabular-nums text-rose-600">{caseProgressSnapshot.reviewOpen}</p>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-indigo-700" style={{ width: `${dossierProgressPercent}%` }} />
              </div>
            </div>
            <nav className="mt-4 space-y-2">
              {dossierTreeNodes.map((node) => {
                const nodeFields = applicableWorkbenchFields.filter((field) => fieldMatchesTreeNode(field, node));
                if (nodeFields.length === 0) return null;
                const status = getTreeNodeStatus(nodeFields);
                const selected = selectedTopTreeNode?.id === node.id;
                const progress = status.reviewTotal > 0 ? Math.round((status.reviewCompleted / status.reviewTotal) * 100) : 100;
                return (
                  <Link
                    key={node.id}
                    href={caseWorkbenchHref({ node: node.id })}
                    scroll={false}
                    className={`block rounded-lg border px-3 py-3 ${
                      selected ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-black">{node.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${selected ? status.reviewOpen > 0 ? "bg-rose-400/25 text-rose-100 ring-1 ring-rose-300/50" : "bg-white/15 text-white" : status.reviewOpen > 0 ? "bg-rose-100 text-rose-800 ring-1 ring-rose-200" : "bg-emerald-50 text-emerald-800"}`}>
                        {status.reviewOpen > 0
                          ? getReviewQueueLabel(locale, status.reviewOpen)
                          : tr(locale, { ja: "確認済み", zh: "已确认", ko: "확인됨" })}
                      </span>
                    </span>
                    <span className="mt-3 flex items-center gap-2">
                      <span className={`block h-1.5 flex-1 overflow-hidden rounded-full ${selected ? "bg-white/15" : "bg-slate-100"}`}>
                        <span className={`block h-full rounded-full ${selected ? "bg-white" : "bg-indigo-700"}`} style={{ width: `${progress}%` }} />
                      </span>
                      <span className={`text-[11px] font-black tabular-nums ${selected ? "text-white" : "text-slate-500"}`}>
                        {status.reviewCompleted}/{status.reviewTotal}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </nav>
          </aside>

          <div className="space-y-4 p-4">
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-indigo-700">
                    {tr(locale, { ja: "現在の分類", zh: "当前分类", ko: "현재 분류" })}
                  </p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">{selectedTopTreeNode?.label}</h2>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${selectedTopTreeStatus.reviewOpen > 0 ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200" : "bg-emerald-50 text-emerald-800"}`}>
                  {selectedTopTreeStatus.reviewOpen > 0
                    ? getReviewQueueLabel(locale, selectedTopTreeStatus.reviewOpen)
                    : tr(locale, { ja: "確認済み", zh: "已确认", ko: "확인됨" })}
                </span>
              </div>
              {selectedChildTreeNodes.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={caseWorkbenchHref({ node: selectedTopTreeNode?.id })}
                    scroll={false}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      selectedTreeNode?.id === selectedTopTreeNode?.id ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {tr(locale, { ja: "すべて", zh: "全部", ko: "전체" })}
                  </Link>
                  {selectedChildTreeNodes.map((child) => {
                    const childStatus = getTreeNodeStatus(applicableWorkbenchFields.filter((field) => fieldMatchesTreeNode(field, child)));
                    const childSelected = selectedTreeNode?.id === child.id;
                    return (
                      <Link
                        key={child.id}
                        href={caseWorkbenchHref({ node: child.id })}
                        scroll={false}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                          childSelected ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {child.label}
                        {childStatus.open > 0 ? <span className="ml-1 tabular-nums">{childStatus.open}</span> : null}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </section>
            <div id="case-main-editor" className="scroll-mt-24 space-y-3">
              {displayedWorkbenchFieldGroups.length > 0 ? displayedWorkbenchFieldGroups.map((group) => (
                <section key={group.id} id={`workbench-${group.id}`} className="scroll-mt-24 rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-sm font-bold text-slate-950">{group.label}</h2>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${selectedTreeStatus.open > 0 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
                        {selectedTreeStatus.completed}/{selectedTreeStatus.total}
                      </span>
                    </div>
                  </div>
                  <div className="grid gap-4 p-5">
                    {group.fields.map((field) => (
                      <div key={field.fieldKey} id={getWorkbenchFieldAnchor(field.fieldKey)} className="scroll-mt-28">
                        <CaseWorkbenchFieldForm
                          action={saveCaseWorkbenchAction}
                          caseId={brokerageCase.id}
                          fieldKey={field.fieldKey}
                          returnNode={selectedTreeNode?.id}
                          saveLabel={tr(locale, { ja: "保存", zh: "保存", ko: "저장" })}
                          savingLabel={tr(locale, { ja: "保存中", zh: "保存中", ko: "저장 중" })}
                          className={`motion-safe:animate-[caseCardSettle_220ms_ease-out] rounded-lg border p-5 ${
                            fieldNeedsAttention(field) ? "border-amber-200 bg-amber-50/45" : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <span className="min-w-0">
                                <span className="block text-base font-black leading-6 text-slate-950">
                                  {field.label}
                                  {field.required ? <span className="ml-1 text-slate-400">*</span> : null}
                                </span>
                                <span className="mt-2 flex flex-wrap gap-1.5">
                                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                    {field.treePath.join(" / ")}
                                  </span>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getImportanceClass(field.importance)}`}>
                                    {getImportanceLabel(locale, field.importance)}
                                  </span>
                                </span>
                              </span>
                              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${getTrustStateClass(field.state)}`}>
                                {getTrustStateLabel(locale, field.state)}
                              </span>
                            </div>
                            <WorkbenchFieldGuidance locale={locale} field={field} />
                            <WorkbenchEvidenceSummary locale={locale} field={field} />
                          </div>
                          <div className="mt-4 rounded-md border border-slate-100 bg-slate-50/70 p-4">
                            <WorkbenchFieldControl locale={locale} field={field} flush />
                            <div className="mt-3">
                              <WorkbenchDecisionSelect locale={locale} field={field} flush />
                            </div>
                          </div>
                        </CaseWorkbenchFieldForm>
                      </div>
                    ))}
                  </div>
                </section>
              )) : (
                <section className="rounded-lg border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-600">
                  {tr(locale, { ja: "この分類に未処理の項目はありません。", zh: "当前分类没有待填写项目。", ko: "이 분류에 남은 항목이 없습니다." })}
                </section>
              )}
            </div>
          </div>
        </div>
      </section>

      {mergeHistory.length > 0 ? (
        <section className="order-7 rounded-xl border border-emerald-200 bg-white p-4">
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
              {tr(locale, { ja: "合併中", zh: "已合并", ko: "합병 중" })} {mergeHistory.filter((item) => item.status === "active").length}
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
                          {formatDate(new Date(item.mergedAt), locale)} / {tr(locale, { ja: "割当参考", zh: "归属参考", ko: "귀속 참고" })} {item.confidenceScore}%
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
                            {getBusinessFieldLabel(locale, detail.fieldKey)}: {detail.existingValue} / {detail.incomingValue}
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

    </div>
  );
}
