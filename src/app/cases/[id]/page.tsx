import Link from "next/link";
import { notFound } from "next/navigation";
import {
  rollbackCaseMergeAction,
  saveCaseWorkbenchAction,
  uploadAndParseExcelAction,
  uploadAndParseIdentityDocumentAction,
} from "@/app/actions";
import { CaseWorkbenchFieldForm } from "@/components/case-workbench-field-form";
import { IdentityDocumentUploadForm } from "@/components/identity-document-upload-form";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { getBrokerageCaseById, listCaseWorkbenchFieldRules, listCorrectionEvents, listExtractionReviewItems, listImportJobs } from "@/lib/data";
import type { CorrectionEvent, ExtractionReviewItem, ExtractionReviewStatus } from "@/lib/data";
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
import { getCaseMergeHistory, getLatestActiveCaseMerge } from "@/lib/case-merge";
import { formatDate } from "@/lib/format";
import { getLocale, type Locale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

const WORKBENCH_FIELD_STATUS_KEY = "__workbenchFieldStatuses";

type CasePageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ flash?: string; node?: string }>;
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
  searchAliases: readonly string[];
  sourceLabel: string;
  decision: WorkbenchFieldDecision;
  evidenceItems: WorkbenchFieldEvidence[];
  requirement: CaseFieldRequirement;
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
    ai_suggested: { ja: "要確認", zh: "待确认", ko: "확인 대기" },
    needs_review: { ja: "確認が必要", zh: "需要确认", ko: "확인 필요" },
    missing: { ja: "未入力", zh: "未填写", ko: "미입력" },
    conflict: { ja: "不一致", zh: "不一致", ko: "불일치" },
    rejected: { ja: "不採用", zh: "不采用", ko: "미채택" },
    unknown: { ja: "不明", zh: "不明", ko: "불명" },
    not_applicable: { ja: "不適用", zh: "不适用", ko: "해당 없음" },
  };
  return labels[state][locale];
}

function getTrustStateClass(state: WorkbenchTrustState) {
  if (state === "confirmed") return "bg-emerald-100 text-emerald-800";
  if (state === "edited") return "bg-blue-100 text-blue-800";
  if (state === "ai_suggested" || state === "needs_review") return "bg-amber-100 text-amber-800";
  if (state === "missing" || state === "conflict") return "bg-rose-100 text-rose-800";
  if (state === "rejected") return "bg-slate-200 text-slate-700";
  if (state === "not_applicable") return "bg-zinc-100 text-zinc-700";
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

function fieldNeedsAttention(field: WorkbenchField) {
  if (field.state === "not_applicable") return false;
  if (field.state === "conflict" || field.state === "needs_review" || field.state === "ai_suggested" || field.state === "unknown") {
    return true;
  }
  return field.required && field.state === "missing";
}

function fieldShouldShowInEditor(field: WorkbenchField) {
  return field.state === "missing" || field.state === "conflict" || field.state === "needs_review" || field.state === "ai_suggested" || field.state === "unknown";
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

function getWorkbenchGroupEditRank(fields: WorkbenchField[]) {
  if (fields.length === 0) return 99;
  return Math.min(...fields.map(getWorkbenchEditRank));
}

function getDossierMapFieldRank(field: WorkbenchField) {
  if (fieldShouldShowInEditor(field)) return field.required ? 0 : 1;
  if (field.state === "confirmed" || field.state === "edited") return 2;
  if (field.state === "not_applicable") return 3;
  if (field.state === "rejected") return 4;
  return 5;
}

function sortDossierMapFields<T extends WorkbenchField>(fields: T[]) {
  return fields.slice().sort((a, b) => {
    const rankDiff = getDossierMapFieldRank(a) - getDossierMapFieldRank(b);
    if (rankDiff !== 0) return rankDiff;
    const stateRankDiff = getWorkbenchStateRank(a) - getWorkbenchStateRank(b);
    if (stateRankDiff !== 0) return stateRankDiff;
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

function getCorrectionEventLabel(locale: Locale, changeType: CorrectionEvent["changeType"]) {
  const labels: Record<CorrectionEvent["changeType"], Record<Locale, string>> = {
    ai_extraction_error: { ja: "読取修正", zh: "资料读取修正", ko: "판독 수정" },
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

function getCorrectionTriggerLabel(locale: Locale, trigger: CorrectionEvent["trigger"]) {
  const labels: Record<CorrectionEvent["trigger"], Record<Locale, string>> = {
    extraction_review_save: { ja: "資料確認", zh: "资料核对", ko: "자료 확인" },
    case_workbench_save: { ja: "情報整理", zh: "信息整理", ko: "정보 정리" },
    guarantee_draft_save: { ja: "申込書補完", zh: "申请书补充", ko: "신청서 보완" },
    pdf_preview_save: { ja: "版面調整", zh: "版面调整", ko: "서식 조정" },
  };
  return labels[trigger][locale];
}

function getCorrectionScopeLabel(locale: Locale, scope: CorrectionEvent["scopeCandidate"]) {
  const labels: Record<CorrectionEvent["scopeCandidate"], Record<Locale, string>> = {
    case_only: { ja: "この案件のみ", zh: "仅当前案件", ko: "현재 안건만" },
    user_or_team: { ja: "社内ルール候補", zh: "团队规则参考", ko: "팀 규칙 참고" },
    source_template: { ja: "資料読取ルール候補", zh: "资料读取规则参考", ko: "자료 판독 규칙 참고" },
    output_template: { ja: "出力テンプレート候補", zh: "输出模板参考", ko: "출력 템플릿 참고" },
    field_dictionary: { ja: "項目名ルール候補", zh: "项目名称规则参考", ko: "항목명 규칙 참고" },
    global_rule_candidate: { ja: "共通ルール候補", zh: "通用规则参考", ko: "공통 규칙 참고" },
    regression_case: { ja: "後続確認用", zh: "后续复核参考", ko: "후속 확인 참고" },
  };
  return labels[scope][locale];
}

function getCorrectionEventClass(changeType: CorrectionEvent["changeType"]) {
  if (changeType === "ai_extraction_error" || changeType === "missing_detected_by_user") return "bg-amber-100 text-amber-800";
  if (changeType.startsWith("template_output")) return "bg-indigo-100 text-indigo-800";
  if (changeType === "source_absent_user_completed") return "bg-emerald-100 text-emerald-800";
  return "bg-slate-100 text-slate-700";
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
    searchAliases: information.searchAliases,
    sourceLabel: latestReview ? `${latestReview.sourceSheet} / ${getSource(latestReview)}` : "案件データ",
    decision: state === "unknown" ? "unknown" : state === "rejected" ? "rejected" : state === "not_applicable" ? "not_applicable" : "confirmed",
    evidenceItems,
    requirement,
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

function getDossierMapPreviewValue(locale: Locale, field: WorkbenchField) {
  if (field.value) return field.value;
  const evidence = getPrimaryEvidence(field);
  if (evidence?.value) return evidence.value;
  return tr(locale, { ja: "未入力", zh: "未填写", ko: "미입력" });
}

function getDossierMapPreviewClass(field: WorkbenchField) {
  if (field.value) return "text-slate-950";
  if (getPrimaryEvidence(field)?.value) return "text-indigo-800";
  if (field.required) return "text-rose-700";
  return "text-slate-500";
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
  const openFields = fields.filter(fieldShouldShowInEditor);
  return {
    total: fields.length,
    attention: fields.filter(fieldNeedsAttention).length,
    open: openFields.length,
    requiredOpen: openFields.filter((field) => field.required).length,
    optionalOpen: openFields.filter((field) => !field.required).length,
    missing: fields.filter((field) => field.state === "missing").length,
    candidates: fields.filter((field) => field.state === "ai_suggested" || field.state === "needs_review").length,
    conflicts: fields.filter((field) => field.state === "conflict").length,
    confirmed: fields.filter((field) => field.state === "confirmed" || field.state === "edited").length,
    completed: fields.filter((field) => field.state === "confirmed" || field.state === "edited" || field.state === "not_applicable" || field.state === "rejected").length,
    notApplicable: fields.filter((field) => field.state === "not_applicable").length,
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

function WorkbenchEvidenceDetails({ locale, field }: { locale: Locale; field: WorkbenchField }) {
  if (field.evidenceItems.length === 0) {
    return null;
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
                {getEvidenceConfidenceLabel(locale, item.confidencePercent)}
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
  const session = await requireTenantSession({ permission: "case.read_assigned" });
  const user = session.user;
  const tenantId = session.tenant.id;

  const [{ id }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { flash?: string; node?: string }),
  ]);
  const [brokerageCase, reviewItems, correctionEvents, importJobs, fieldRules] = await Promise.all([
    getBrokerageCaseById({ userId: user.id, tenantId, caseId: id }),
    listExtractionReviewItems({ userId: user.id, tenantId, caseId: id }),
    listCorrectionEvents({ userId: user.id, tenantId, caseId: id, limit: 12 }),
    listImportJobs(user.id, 200, tenantId),
    listCaseWorkbenchFieldRules(user.id, tenantId),
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
  const fieldRuleMap = buildCaseWorkbenchRuleMap(fieldRules);
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
      }),
    ),
  }));
  const workbenchLabelByFieldKey = Object.fromEntries(
    workbenchFieldGroups.flatMap((group) => group.fields.map((field) => [field.fieldKey, `${group.label} / ${field.label}`])),
  );
  const allWorkbenchFields = workbenchFieldGroups.flatMap((group) =>
    group.fields.map((field) => ({ ...field, groupId: group.id, label: `${group.label} / ${field.label}` })),
  );
  const selectedTreeNode = getActiveTreeNode(query?.node);
  const treeFilteredFieldKeys = new Set(
    allWorkbenchFields
      .filter((field) => !selectedTreeNode || fieldMatchesTreeNode(field, selectedTreeNode))
      .map((field) => field.fieldKey),
  );
  const selectedTreeFields = sortWorkbenchEditFields(allWorkbenchFields.filter((field) => treeFilteredFieldKeys.has(field.fieldKey) && fieldShouldShowInEditor(field)));
  const displayedWorkbenchFieldGroups = selectedTreeNode
    ? selectedTreeFields.length > 0
      ? [
          {
            id: selectedTreeNode.id,
            label: selectedTreeNode.label,
            fields: selectedTreeFields,
          },
        ]
      : []
    : workbenchFieldGroups
        .map((group) => ({
          ...group,
          fields: sortWorkbenchEditFields(group.fields.filter((field) => treeFilteredFieldKeys.has(field.fieldKey) && fieldShouldShowInEditor(field))),
        }))
        .filter((group) => group.fields.length > 0)
        .sort((a, b) => {
          const rankDiff = getWorkbenchGroupEditRank(a.fields) - getWorkbenchGroupEditRank(b.fields);
          if (rankDiff !== 0) return rankDiff;
          return a.label.localeCompare(b.label);
        });
  const coreDossierFields = allWorkbenchFields.filter((field) => field.importance !== "output_specific");
  const dossierStatus = getTreeNodeStatus(coreDossierFields);
  const dossierTreeNodes = CASE_INFORMATION_TREE.filter((node) => node.id !== "output_draft" && node.id !== "source_evidence");
  const selectedDossierMapNode =
    selectedTreeNode ??
    dossierTreeNodes
      .flatMap((node) => [node, ...(node.children ?? [])])
      .find((node) => getTreeNodeStatus(allWorkbenchFields.filter((field) => fieldMatchesTreeNode(field, node))).open > 0) ??
    dossierTreeNodes[0];
  const selectedDossierMapFields = selectedDossierMapNode
    ? sortDossierMapFields(allWorkbenchFields.filter((field) => fieldMatchesTreeNode(field, selectedDossierMapNode)))
    : [];
  const outputHref = `/output-center?caseId=${encodeURIComponent(brokerageCase.id)}`;
  const caseWorkbenchHref = (options?: { node?: string; hash?: string }) => {
    const params = new URLSearchParams();
    if (options?.node) params.set("node", options.node);
    const queryString = params.toString();
    return `/cases/${brokerageCase.id}${queryString ? `?${queryString}` : ""}${options?.hash ? `#${options.hash}` : ""}`;
  };
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            {tr(locale, { ja: "情報を整理する", zh: "整理信息", ko: "정보 정리" })}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{brokerageCase.caseTitle}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {tr(locale, { ja: "案件で使う情報を確認し、出典と修正履歴を残します。", zh: "核对案件资料，保留来源和修正记录。", ko: "안건에 사용할 정보를 확인하고 출처와 수정 이력을 남깁니다." })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="#case-main-editor" className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">
            {tr(locale, { ja: "案件資料を編集", zh: "编辑案件资料", ko: "안건 자료 편집" })}
          </Link>
          <Link href="#case-source-intake" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
            {tr(locale, { ja: "資料を追加", zh: "补充资料", ko: "자료 추가" })}
          </Link>
          <Link href={outputHref} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100">
            {tr(locale, { ja: "書類を出力", zh: "输出文件", ko: "서류 출력" })}
          </Link>
        </div>
      </div>
      <PageFlashBanner message={flashMessage} tone={flashTone} />

      <section id="case-source-intake" className="scroll-mt-24 rounded-lg border border-slate-200 bg-white p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-950">
              {tr(locale, { ja: "この案件に資料を追加", zh: "给当前案件追加资料", ko: "현재 안건에 자료 추가" })}
            </h2>
            <p className="mt-0.5 max-w-3xl text-xs leading-5 text-slate-500">
              {tr(locale, {
                ja: "読み取り後、確認画面で採用した項目だけをこの案件へ反映します。",
                zh: "读取后，只会把核对画面中采用的项目写入当前案件。",
                ko: "판독 후 확인 화면에서 채택한 항목만 현재 안건에 반영합니다.",
              })}
            </p>
          </div>
          <Link href="/import-center" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
            {tr(locale, { ja: "資料読取を開く", zh: "打开资料读取", ko: "자료 읽기 열기" })}
          </Link>
        </div>

        <div className="mt-2 grid gap-2 xl:grid-cols-2">
          <div className="grid gap-2 rounded-md border border-emerald-100 bg-emerald-50/30 p-2 lg:grid-cols-[170px_minmax(0,1fr)] lg:items-center">
            <div>
              <h3 className="text-sm font-black text-emerald-950">
                {tr(locale, { ja: "本人資料", zh: "本人资料", ko: "본인 자료" })}
              </h3>
              <p className="mt-0.5 text-xs leading-5 text-emerald-900">
                {tr(locale, {
                  ja: "在留カード、運転免許証、本人確認資料。",
                  zh: "在留卡、驾照、本人确认资料。",
                  ko: "재류카드, 운전면허증, 본인 확인 자료.",
                })}
              </p>
            </div>
            <IdentityDocumentUploadForm
              action={uploadAndParseIdentityDocumentAction}
              locale={locale}
              targetCaseId={brokerageCase.id}
              uploadContext="case"
              density="compact"
            />
          </div>

          <div className="grid gap-2 rounded-md border border-blue-100 bg-blue-50/30 p-2 lg:grid-cols-[170px_minmax(0,1fr)] lg:items-center">
            <div>
              <h3 className="text-sm font-black text-blue-950">
                {tr(locale, { ja: "Excel資料・台帳", zh: "Excel资料 / 台账", ko: "Excel 자료 / 대장" })}
              </h3>
              <p className="mt-0.5 text-xs leading-5 text-blue-900">
                {tr(locale, {
                  ja: "物件台帳、記入済み資料、補足一覧の .xlsx。",
                  zh: "物件台账、已填写资料、补充清单的 .xlsx。",
                  ko: "매물 대장, 작성된 자료, 보완 목록 .xlsx.",
                })}
              </p>
            </div>
            <form action={uploadAndParseExcelAction} noValidate className="grid gap-2 rounded-md border border-blue-100 bg-blue-50 p-2 md:grid-cols-[minmax(220px,1fr)_120px] md:items-end">
              <input type="hidden" name="targetCaseId" value={brokerageCase.id} />
              <input type="hidden" name="uploadContext" value="case" />
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-blue-900">
                  {tr(locale, { ja: ".xlsx ファイル", zh: ".xlsx 文件", ko: ".xlsx 파일" })}
                </span>
                <input
                  name="excelFile"
                  type="file"
                  accept=".xlsx"
                  className="h-9 w-full rounded-md border border-blue-200 bg-white px-2 py-1 text-xs"
                />
              </label>
              <button type="submit" className="h-9 w-full rounded-md bg-blue-700 px-3 text-xs font-bold text-white hover:bg-blue-800">
                {tr(locale, { ja: "読み取る", zh: "读取资料", ko: "자료 읽기" })}
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="grid gap-0 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 p-4 lg:sticky lg:top-14 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-indigo-700">
                  {tr(locale, { ja: "案件資料ツリー", zh: "案件资料树", ko: "안건 자료 트리" })}
                </p>
                <h2 className="mt-1 text-base font-black text-slate-950">
                  {tr(locale, { ja: "資料の地図", zh: "资料地图", ko: "자료 지도" })}
                </h2>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-700">
                {dossierStatus.completed}/{dossierStatus.total}
              </span>
            </div>
            <nav className="mt-4 space-y-2">
              {dossierTreeNodes.map((node) => {
                const nodeFields = allWorkbenchFields.filter((field) => fieldMatchesTreeNode(field, node));
                const status = getTreeNodeStatus(nodeFields);
                const selected = selectedDossierMapNode?.id === node.id || node.children?.some((child) => child.id === selectedDossierMapNode?.id);
                const progress = status.total > 0 ? Math.round((status.completed / status.total) * 100) : 0;
                return (
                  <div key={node.id} className={`overflow-hidden rounded-lg border ${selected ? "border-slate-950 bg-slate-950" : "border-slate-200 bg-white"}`}>
                    <Link
                      href={caseWorkbenchHref({ node: node.id, hash: "case-main-editor" })}
                      className={`block px-3 py-2 ${
                        selected ? "text-white" : "text-slate-900 hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black">{node.label}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${selected ? "bg-white/15 text-white" : status.open > 0 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
                          {status.open > 0
                            ? tr(locale, { ja: "未整理あり", zh: "有待整理", ko: "정리 필요" })
                            : tr(locale, { ja: "整理済み", zh: "已整理", ko: "정리됨" })}
                        </span>
                      </span>
                      <span className={`mt-2 block h-1.5 overflow-hidden rounded-full ${selected ? "bg-white/15" : "bg-slate-100"}`}>
                        <span className={`block h-full rounded-full ${selected ? "bg-white" : "bg-indigo-700"}`} style={{ width: `${progress}%` }} />
                      </span>
                    </Link>
                    {node.children ? (
                      <div className={`${selected ? "border-t border-white/10 bg-white" : "border-t border-slate-100 bg-white"}`}>
                        {node.children.map((child) => {
                          const childFields = allWorkbenchFields.filter((field) => fieldMatchesTreeNode(field, child));
                          if (childFields.length === 0) return null;
                          const childStatus = getTreeNodeStatus(childFields);
                          const childSelected = selectedDossierMapNode?.id === child.id;
                          const childProgress = childStatus.total > 0 ? Math.round((childStatus.completed / childStatus.total) * 100) : 0;
                          return (
                            <Link
                              key={child.id}
                              href={caseWorkbenchHref({ node: child.id, hash: "case-main-editor" })}
                              className={`block border-t border-slate-100 px-3 py-2 ${
                                childSelected ? "bg-indigo-50 text-indigo-950" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                              }`}
                            >
                              <span className="flex items-center justify-between gap-2">
                                <span className="truncate text-[11px] font-bold">{child.label}</span>
                                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${childStatus.open > 0 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
                                  {childStatus.open > 0
                                    ? tr(locale, { ja: "未整理", zh: "待整理", ko: "정리 필요" })
                                    : tr(locale, { ja: "済", zh: "完成", ko: "완료" })}
                                </span>
                              </span>
                              <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-slate-100">
                                <span className="block h-full rounded-full bg-indigo-600" style={{ width: `${childProgress}%` }} />
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-bold text-slate-500">
                  {tr(locale, { ja: "現在の分類", zh: "当前分类", ko: "현재 분류" })}
                </p>
                <h3 className="mt-0.5 text-sm font-black text-slate-950">{selectedDossierMapNode?.label}</h3>
              </div>
              <div className="max-h-[480px] overflow-y-auto">
                <table className="w-full table-fixed border-collapse text-left">
                  <thead className="sticky top-0 z-10 bg-white text-[10px] font-black text-slate-500">
                    <tr className="border-b border-slate-100">
                      <th className="w-[34%] px-3 py-2">{tr(locale, { ja: "項目", zh: "项目", ko: "항목" })}</th>
                      <th className="px-2 py-2">{tr(locale, { ja: "内容", zh: "内容", ko: "내용" })}</th>
                      <th className="w-[58px] px-2 py-2 text-right">{tr(locale, { ja: "状態", zh: "状态", ko: "상태" })}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedDossierMapFields.map((field) => {
                      const fieldHref = fieldShouldShowInEditor(field)
                        ? caseWorkbenchHref({ node: field.treeNodeId, hash: getWorkbenchFieldAnchor(field.fieldKey) })
                        : undefined;
                      const valueText = getDossierMapPreviewValue(locale, field);
                      const valueClass = getDossierMapPreviewClass(field);
                      return (
                        <tr key={field.fieldKey} className={fieldNeedsAttention(field) ? "bg-amber-50/45" : "bg-white"}>
                          <td className="px-3 py-2 align-top">
                            {fieldHref ? (
                              <Link href={fieldHref} className="line-clamp-2 text-[11px] font-black leading-4 text-slate-950 hover:text-indigo-700">
                                {field.label}
                              </Link>
                            ) : (
                              <span className="line-clamp-2 text-[11px] font-black leading-4 text-slate-800">{field.label}</span>
                            )}
                          </td>
                          <td className="px-2 py-2 align-top">
                            {fieldHref ? (
                              <Link href={fieldHref} className={`block truncate text-[11px] font-bold leading-4 hover:text-indigo-700 ${valueClass}`}>
                                {valueText}
                              </Link>
                            ) : (
                              <span className={`block truncate text-[11px] font-bold leading-4 ${valueClass}`}>{valueText}</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right align-top">
                            <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-black ${getTrustStateClass(field.state)}`}>
                              {getTrustStateLabel(locale, field.state)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </aside>

          <div className="space-y-4 p-4">
            <div id="case-main-editor" className="scroll-mt-24 space-y-3">
              {displayedWorkbenchFieldGroups.length > 0 ? displayedWorkbenchFieldGroups.map((group) => (
                <section key={group.id} id={`workbench-${group.id}`} className="scroll-mt-24 rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <h2 className="text-sm font-bold text-slate-950">{group.label}</h2>
                  </div>
                  <div className="grid gap-5 p-5 xl:grid-cols-2">
                    {group.fields.map((field) => (
                      <div key={field.fieldKey} id={getWorkbenchFieldAnchor(field.fieldKey)} className="scroll-mt-28">
                        <CaseWorkbenchFieldForm
                          action={saveCaseWorkbenchAction}
                          caseId={brokerageCase.id}
                          fieldKey={field.fieldKey}
                          returnNode={selectedTreeNode?.id}
                          saveLabel={tr(locale, { ja: "この項目を保存", zh: "保存此项", ko: "이 항목 저장" })}
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
                          <WorkbenchEvidenceDetails locale={locale} field={field} />
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

      <details className="rounded-xl border border-indigo-100 bg-white p-4">
        <summary className="cursor-pointer text-sm font-bold text-indigo-950">
          {tr(locale, { ja: "状態ラベルを表示", zh: "显示状态说明", ko: "상태 설명 표시" })}
        </summary>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["confirmed", "edited", "ai_suggested", "needs_review", "missing", "conflict", "not_applicable", "rejected", "unknown"] as WorkbenchTrustState[]).map((state) => (
            <span key={state} className={`rounded-full px-3 py-1 text-xs font-bold ${getTrustStateClass(state)}`}>
              {getTrustStateLabel(locale, state)}
            </span>
          ))}
        </div>
      </details>

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

      <details className="order-8 rounded-xl border border-slate-200 bg-white p-4">
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
            {tr(locale, { ja: "入力ルールの改善記録", zh: "填写规则改进记录", ko: "작성 규칙 개선 기록" })}
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            {tr(locale, {
              ja: "保存時に残した修正記録です。後続の入力ルール確認に使います。",
              zh: "这里记录保存时产生的修正内容，用于后续填写规则审核。",
              ko: "저장 시 남긴 수정 기록입니다. 이후 작성 규칙 검토에 사용합니다.",
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
                    <p className="text-[11px] font-bold text-slate-500">{tr(locale, { ja: "変更前", zh: "修改前", ko: "변경 전" })}</p>
                    <p className="mt-1 whitespace-pre-wrap text-slate-800">{event.aiValue || "-"}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-2">
                    <p className="text-[11px] font-bold text-emerald-700">{tr(locale, { ja: "確認後", zh: "确认后", ko: "확인 후" })}</p>
                    <p className="mt-1 whitespace-pre-wrap text-slate-900">{event.confirmedValue || "-"}</p>
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-800">{getCorrectionTriggerLabel(locale, event.trigger)}</p>
                  <p className="mt-1 text-[11px] font-semibold">{event.sourceLocation ? `${tr(locale, { ja: "資料位置", zh: "资料位置", ko: "자료 위치" })}: ${event.sourceLocation}` : "-"}</p>
                  <p className="mt-1">{getCorrectionScopeLabel(locale, event.scopeCandidate)}</p>
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
                    <p className="mt-1 text-xs text-slate-500">{tr(locale, { ja: "案件の確認済みデータには含めません。", zh: "不会计入案件的已确认数据。", ko: "안건 확인 데이터에는 포함하지 않습니다." })}</p>
                  ) : null}
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-800">{item.sourceSheet}</p>
                  <p className="font-mono text-[11px]">{getSource(item)}</p>
                  <p className="mt-1 tabular-nums">{getEvidenceConfidenceLabel(locale, Math.round(item.confidence * 100))}</p>
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
