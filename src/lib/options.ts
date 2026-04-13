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

type Option<T extends string> = { value: T; label: string };

function getLocaleMap<T extends string>(map: Record<Locale, Record<T, string>>, locale: Locale): Record<T, string> {
  return map[locale] ?? map.ja;
}

function createOptions<T extends string>(values: readonly T[], labels: Record<T, string>): Option<T>[] {
  return values.map((value) => ({ value, label: labels[value] }));
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
    self_use: "居住用",
    investment: "投資用",
  },
  zh: {
    self_use: "自住",
    investment: "投资",
  },
  ko: {
    self_use: "실거주",
    investment: "투자",
  },
};

const temperatureLabelByLocale: Record<Locale, Record<Temperature, string>> = {
  ja: {
    high: "高",
    medium: "中",
    low: "低",
  },
  zh: {
    high: "高",
    medium: "中",
    low: "低",
  },
  ko: {
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
