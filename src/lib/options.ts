import {
  AML_CHECK_STATUSES,
  BROKERAGE_CONTRACT_TYPES,
  BUDGET_TYPES,
  CLIENT_STAGES,
  FOLLOWUP_TYPES,
  LOAN_PREAPPROVAL_STATUSES,
  PURPOSES,
  QUOTE_STATUSES,
  TEMPERATURES,
  type AmlCheckStatus,
  type BrokerageContractType,
  type BudgetType,
  type ClientStage,
  type FollowUpType,
  type LoanPreApprovalStatus,
  type Purpose,
  type QuoteStatus,
  type Temperature,
} from "@/lib/domain";
import type { Locale } from "@/lib/locale";

export type Option<T extends string> = { value: T; label: string };

function getLocaleMap<T extends string>(map: Record<Locale, Record<T, string>>, locale: Locale): Record<T, string> {
  return map[locale] ?? map.ja;
}

function createOptions<T extends string>(values: readonly T[], labels: Record<T, string>): Option<T>[] {
  return values.map((value) => ({ value, label: labels[value] }));
}

/**
 * Case workflow types are classification metadata stored in
 * `confirmedDataJson.__workflowType`. They deliberately do not change the
 * legacy `brokerage_cases.case_type` column or select a specialized workflow.
 */
export const CASE_WORKFLOW_TYPE_VALUES = [
  "rental_new_application",
  "rental_listing_ad",
  "rental_lease_contract",
  "sale_listing_request",
  "sale_purchase_offer",
  "sale_contract",
  "management_new_contract",
  "management_periodic_report",
  "management_ad_hoc_report",
  "general_estimate",
  "general_proposal",
  // Legacy values remain accepted so existing links, saved drafts and old
  // records continue to round-trip without a data migration.
  "rental_application",
  "rental_mandate",
  "sale_mandate",
  "quote_preparation",
  "contract_preparation",
] as const;

export type CaseWorkflowType = (typeof CASE_WORKFLOW_TYPE_VALUES)[number];
export const CASE_LEGACY_WORKFLOW_TYPE_VALUES = [
  "rental_application",
  "rental_mandate",
  "sale_mandate",
  "quote_preparation",
  "contract_preparation",
] as const;

export type CaseWorkflowTypeGroupId = "rental" | "sale" | "management" | "general";
export type CaseWorkflowTypeFamily = CaseWorkflowTypeGroupId | "legacy";

export const CASE_WORKFLOW_TYPE_GROUPS = [
  { id: "rental", values: ["rental_new_application", "rental_listing_ad", "rental_lease_contract"] },
  { id: "sale", values: ["sale_listing_request", "sale_purchase_offer", "sale_contract"] },
  { id: "management", values: ["management_new_contract", "management_periodic_report", "management_ad_hoc_report"] },
  { id: "general", values: ["general_estimate", "general_proposal"] },
] as const satisfies ReadonlyArray<{ id: CaseWorkflowTypeGroupId; values: ReadonlyArray<CaseWorkflowType> }>;

const caseWorkflowTypeLabelByLocale: Record<Locale, Record<CaseWorkflowType, string>> = {
  ja: {
    rental_new_application: "新規賃貸申込",
    rental_listing_ad: "賃貸募集広告",
    rental_lease_contract: "新規賃貸借契約",
    sale_listing_request: "売却依頼",
    sale_purchase_offer: "売買買付",
    sale_contract: "売買契約",
    management_new_contract: "新規管理契約",
    management_periodic_report: "定期管理報告",
    management_ad_hoc_report: "臨時管理報告",
    general_estimate: "見積もり",
    general_proposal: "提案",
    rental_application: "賃貸申込",
    rental_mandate: "賃貸募集",
    sale_mandate: "売却依頼",
    quote_preparation: "見積・提案",
    contract_preparation: "契約準備",
  },
  zh: {
    rental_new_application: "新租赁申请",
    rental_listing_ad: "租赁招租广告",
    rental_lease_contract: "新租赁合同",
    sale_listing_request: "出售委托",
    sale_purchase_offer: "买卖买付",
    sale_contract: "买卖合同",
    management_new_contract: "新管理合同",
    management_periodic_report: "定期管理报告",
    management_ad_hoc_report: "临时管理报告",
    general_estimate: "报价",
    general_proposal: "提案",
    rental_application: "租赁申请",
    rental_mandate: "出租委托",
    sale_mandate: "出售委托",
    quote_preparation: "报价 / 提案",
    contract_preparation: "合同准备",
  },
  ko: {
    rental_new_application: "신규 임대 신청",
    rental_listing_ad: "임대 모집 광고",
    rental_lease_contract: "신규 임대차 계약",
    sale_listing_request: "매도 의뢰",
    sale_purchase_offer: "매매 매수의향",
    sale_contract: "매매 계약",
    management_new_contract: "신규 관리 계약",
    management_periodic_report: "정기 관리 보고",
    management_ad_hoc_report: "임시 관리 보고",
    general_estimate: "견적",
    general_proposal: "제안",
    rental_application: "임대 신청",
    rental_mandate: "임대 모집",
    sale_mandate: "매각 의뢰",
    quote_preparation: "견적 / 제안",
    contract_preparation: "계약 준비",
  },
};

const caseWorkflowTypeGroupLabelByLocale: Record<Locale, Record<CaseWorkflowTypeGroupId, string>> = {
  ja: { rental: "賃貸", sale: "売買", management: "管理", general: "一般" },
  zh: { rental: "租赁", sale: "买卖", management: "管理", general: "通用" },
  ko: { rental: "임대", sale: "매매", management: "관리", general: "일반" },
};

const caseWorkflowTypeFamily: Record<CaseWorkflowType, CaseWorkflowTypeFamily> = {
  rental_new_application: "rental",
  rental_listing_ad: "rental",
  rental_lease_contract: "rental",
  sale_listing_request: "sale",
  sale_purchase_offer: "sale",
  sale_contract: "sale",
  management_new_contract: "management",
  management_periodic_report: "management",
  management_ad_hoc_report: "management",
  general_estimate: "general",
  general_proposal: "general",
  rental_application: "legacy",
  rental_mandate: "legacy",
  sale_mandate: "legacy",
  quote_preparation: "legacy",
  contract_preparation: "legacy",
};

export function isCaseWorkflowType(value: unknown): value is CaseWorkflowType {
  return typeof value === "string" && (CASE_WORKFLOW_TYPE_VALUES as readonly string[]).includes(value);
}

export function getCaseWorkflowTypeLabel(locale: Locale, value: unknown): string {
  if (isCaseWorkflowType(value)) return caseWorkflowTypeLabelByLocale[locale]?.[value] ?? caseWorkflowTypeLabelByLocale.ja[value];
  return locale === "zh" ? "未分类" : locale === "ko" ? "미분류" : "未分類";
}

export function getCaseWorkflowTypeFamily(value: unknown): CaseWorkflowTypeFamily | undefined {
  return isCaseWorkflowType(value) ? caseWorkflowTypeFamily[value] : undefined;
}

export function getCaseWorkflowTypeGroups(locale: Locale): Array<{ id: CaseWorkflowTypeGroupId; label: string; options: Option<CaseWorkflowType>[] }> {
  const labels = caseWorkflowTypeLabelByLocale[locale] ?? caseWorkflowTypeLabelByLocale.ja;
  const groupLabels = caseWorkflowTypeGroupLabelByLocale[locale] ?? caseWorkflowTypeGroupLabelByLocale.ja;
  return CASE_WORKFLOW_TYPE_GROUPS.map((group) => ({
    id: group.id,
    label: groupLabels[group.id],
    options: group.values.map((value) => ({ value, label: labels[value] })),
  }));
}

const stageLabelByLocale: Record<Locale, Record<ClientStage, string>> = {
  ja: {
    lead: "新規受付",
    contacted: "初回接触済み",
    quoted: "提案送付済み",
    viewing: "内見済み",
    negotiating: "申込・条件調整",
    won: "成約",
    lost: "見送り",
  },
  zh: {
    lead: "新线索",
    contacted: "已接触",
    quoted: "已提案",
    viewing: "已带看",
    negotiating: "谈判中",
    won: "成交",
    lost: "流失",
  },
  ko: {
    lead: "신규 리드",
    contacted: "초기 접촉 완료",
    quoted: "제안 발송 완료",
    viewing: "현장 확인 완료",
    negotiating: "협의 진행",
    won: "계약 성사",
    lost: "종료",
  },
};

const purposeLabelByLocale: Record<Locale, Record<Purpose, string>> = {
  ja: {
    unspecified: "未確認",
    self_use: "居住用",
    investment: "投資用",
  },
  zh: {
    unspecified: "待确认",
    self_use: "自住",
    investment: "投资",
  },
  ko: {
    unspecified: "미확인",
    self_use: "실거주",
    investment: "투자",
  },
};

const temperatureLabelByLocale: Record<Locale, Record<Temperature, string>> = {
  ja: {
    unspecified: "未確認",
    high: "高",
    medium: "中",
    low: "低",
  },
  zh: {
    unspecified: "待确认",
    high: "高",
    medium: "中",
    low: "低",
  },
  ko: {
    unspecified: "미확인",
    high: "높음",
    medium: "보통",
    low: "낮음",
  },
};

const budgetTypeLabelByLocale: Record<Locale, Record<BudgetType, string>> = {
  ja: {
    total_price: "総額予算",
    monthly_payment: "月額返済予算",
  },
  zh: {
    total_price: "总价预算",
    monthly_payment: "月供预算",
  },
  ko: {
    total_price: "총액 예산",
    monthly_payment: "월 상환 예산",
  },
};

const loanPreApprovalLabelByLocale: Record<Locale, Record<LoanPreApprovalStatus, string>> = {
  ja: {
    not_applied: "未申込",
    screening: "審査中",
    approved: "承認",
    rejected: "否決",
  },
  zh: {
    not_applied: "未申请",
    screening: "审核中",
    approved: "已通过",
    rejected: "被拒",
  },
  ko: {
    not_applied: "미신청",
    screening: "심사 중",
    approved: "승인",
    rejected: "거절",
  },
};

const brokerageContractTypeLabelByLocale: Record<Locale, Record<BrokerageContractType, string>> = {
  ja: {
    none: "未締結",
    general: "一般媒介",
    exclusive: "専任媒介",
    exclusive_exclusive: "専属専任媒介",
  },
  zh: {
    none: "未签约",
    general: "一般媒介",
    exclusive: "专任媒介",
    exclusive_exclusive: "专属专任媒介",
  },
  ko: {
    none: "미체결",
    general: "일반 중개",
    exclusive: "전속 중개",
    exclusive_exclusive: "전속전임 중개",
  },
};

const amlCheckStatusLabelByLocale: Record<Locale, Record<AmlCheckStatus, string>> = {
  ja: {
    not_required: "対象外",
    pending: "確認待ち",
    verified: "確認済み",
    reported: "疑わしい取引届出済み",
  },
  zh: {
    not_required: "不适用",
    pending: "待确认",
    verified: "已确认",
    reported: "可疑交易已申报",
  },
  ko: {
    not_required: "대상 아님",
    pending: "확인 대기",
    verified: "확인 완료",
    reported: "의심 거래 신고 완료",
  },
};

const followTypeLabelByLocale: Record<Locale, Record<FollowUpType, string>> = {
  ja: {
    call: "電話",
    line: "LINE",
    email: "メール",
    viewing: "内見",
    meeting: "面談",
    note: "メモ",
  },
  zh: {
    call: "电话",
    line: "LINE",
    email: "邮件",
    viewing: "带看",
    meeting: "面谈",
    note: "备注",
  },
  ko: {
    call: "전화",
    line: "LINE",
    email: "이메일",
    viewing: "현장 확인",
    meeting: "미팅",
    note: "메모",
  },
};

const quoteStatusLabelByLocale: Record<Locale, Record<QuoteStatus, string>> = {
  ja: {
    draft: "作成中",
    sent: "送付済み",
    revised: "再提案",
  },
  zh: {
    draft: "草稿",
    sent: "已发送",
    revised: "已修订",
  },
  ko: {
    draft: "작성 중",
    sent: "발송 완료",
    revised: "재제안",
  },
};

const clientSortOptionsByLocale: Record<Locale, ReadonlyArray<{ value: ClientListSortValue; label: string }>> = {
  ja: [
    { value: "follow_up", label: "フォロー期日順" },
    { value: "recent_contact", label: "最終連絡が新しい順" },
    { value: "recent_created", label: "登録が新しい順" },
  ],
  zh: [
    { value: "follow_up", label: "按跟进到期" },
    { value: "recent_contact", label: "按最近联系" },
    { value: "recent_created", label: "按最近新增" },
  ],
  ko: [
    { value: "follow_up", label: "후속 일정순" },
    { value: "recent_contact", label: "최근 연락순" },
    { value: "recent_created", label: "최근 등록순" },
  ],
};

export type ClientListSortValue = "follow_up" | "recent_contact" | "recent_created";

export function getStageLabel(locale: Locale): Record<ClientStage, string> {
  return getLocaleMap(stageLabelByLocale, locale);
}

export function getStageOptions(locale: Locale): Option<ClientStage>[] {
  return createOptions(CLIENT_STAGES, getStageLabel(locale));
}

export function getPurposeLabel(locale: Locale): Record<Purpose, string> {
  return getLocaleMap(purposeLabelByLocale, locale);
}

export function getPurposeOptions(locale: Locale): Option<Purpose>[] {
  return createOptions(PURPOSES, getPurposeLabel(locale));
}

export function getTemperatureLabel(locale: Locale): Record<Temperature, string> {
  return getLocaleMap(temperatureLabelByLocale, locale);
}

export function getTemperatureOptions(locale: Locale): Option<Temperature>[] {
  return createOptions(TEMPERATURES, getTemperatureLabel(locale));
}

export function getBudgetTypeLabel(locale: Locale): Record<BudgetType, string> {
  return getLocaleMap(budgetTypeLabelByLocale, locale);
}

export function getBudgetTypeOptions(locale: Locale): Option<BudgetType>[] {
  return createOptions(BUDGET_TYPES, getBudgetTypeLabel(locale));
}

export function getLoanPreApprovalLabel(locale: Locale): Record<LoanPreApprovalStatus, string> {
  return getLocaleMap(loanPreApprovalLabelByLocale, locale);
}

export function getLoanPreApprovalOptions(locale: Locale): Option<LoanPreApprovalStatus>[] {
  return createOptions(LOAN_PREAPPROVAL_STATUSES, getLoanPreApprovalLabel(locale));
}

export function getBrokerageContractTypeLabel(locale: Locale): Record<BrokerageContractType, string> {
  return getLocaleMap(brokerageContractTypeLabelByLocale, locale);
}

export function getBrokerageContractTypeOptions(locale: Locale): Option<BrokerageContractType>[] {
  return createOptions(BROKERAGE_CONTRACT_TYPES, getBrokerageContractTypeLabel(locale));
}

export function getAmlCheckStatusLabel(locale: Locale): Record<AmlCheckStatus, string> {
  return getLocaleMap(amlCheckStatusLabelByLocale, locale);
}

export function getAmlCheckStatusOptions(locale: Locale): Option<AmlCheckStatus>[] {
  return createOptions(AML_CHECK_STATUSES, getAmlCheckStatusLabel(locale));
}

export function getFollowTypeLabel(locale: Locale): Record<FollowUpType, string> {
  return getLocaleMap(followTypeLabelByLocale, locale);
}

export function getFollowTypeOptions(locale: Locale): Option<FollowUpType>[] {
  return createOptions(FOLLOWUP_TYPES, getFollowTypeLabel(locale));
}

export function getQuoteStatusLabel(locale: Locale): Record<QuoteStatus, string> {
  return getLocaleMap(quoteStatusLabelByLocale, locale);
}

export function getQuoteStatusOptions(locale: Locale): Option<QuoteStatus>[] {
  return createOptions(QUOTE_STATUSES, getQuoteStatusLabel(locale));
}

export function getClientSortOptions(locale: Locale): ReadonlyArray<{ value: ClientListSortValue; label: string }> {
  return clientSortOptionsByLocale[locale] ?? clientSortOptionsByLocale.ja;
}

export const stageLabel: Record<ClientStage, string> = stageLabelByLocale.ja;
export const stageOptions: Array<Option<ClientStage>> = getStageOptions("ja");
export const purposeLabel: Record<Purpose, string> = purposeLabelByLocale.ja;
export const purposeOptions: Array<Option<Purpose>> = getPurposeOptions("ja");
export const temperatureLabel: Record<Temperature, string> = temperatureLabelByLocale.ja;
export const temperatureOptions: Array<Option<Temperature>> = getTemperatureOptions("ja");
export const budgetTypeLabel: Record<BudgetType, string> = budgetTypeLabelByLocale.ja;
export const budgetTypeOptions: Array<Option<BudgetType>> = getBudgetTypeOptions("ja");
export const loanPreApprovalLabel: Record<LoanPreApprovalStatus, string> = loanPreApprovalLabelByLocale.ja;
export const loanPreApprovalOptions: Array<Option<LoanPreApprovalStatus>> = getLoanPreApprovalOptions("ja");
export const brokerageContractTypeLabel: Record<BrokerageContractType, string> = brokerageContractTypeLabelByLocale.ja;
export const brokerageContractTypeOptions: Array<Option<BrokerageContractType>> = getBrokerageContractTypeOptions("ja");
export const amlCheckStatusLabel: Record<AmlCheckStatus, string> = amlCheckStatusLabelByLocale.ja;
export const amlCheckStatusOptions: Array<Option<AmlCheckStatus>> = getAmlCheckStatusOptions("ja");
export const followTypeLabel: Record<FollowUpType, string> = followTypeLabelByLocale.ja;
export const followTypeOptions: Array<Option<FollowUpType>> = getFollowTypeOptions("ja");
export const quoteStatusLabel: Record<QuoteStatus, string> = quoteStatusLabelByLocale.ja;
export const quoteStatusOptions: Array<Option<QuoteStatus>> = getQuoteStatusOptions("ja");
export const clientSortOptions = clientSortOptionsByLocale.ja;
