import type { Locale } from "@/lib/locale";

export const CLIENT_FORM_TEMPLATE_KEYS = ["none", "self_use_intake", "investment_intake", "legal_check_start"] as const;

export type ClientFormTemplateKey = (typeof CLIENT_FORM_TEMPLATE_KEYS)[number];

export type ClientFormTemplateDefaults = {
  budgetMin?: number;
  budgetMax?: number;
  budgetType?: string;
  preferredArea?: string;
  firstChoiceArea?: string;
  secondChoiceArea?: string;
  purpose?: string;
  temperature?: string;
  stage?: string;
  loanPreApprovalStatus?: string;
  brokerageContractType?: string;
  amlCheckStatus?: string;
  desiredMoveInPeriod?: string;
  notes?: string;
  personalInfoConsentAt?: Date;
  nextFollowUpAt?: Date;
};

export type ClientFormAutofillDefaults = ClientFormTemplateDefaults;

export const CLIENT_FORM_AUTOFILL_FIELDS = [
  "budgetMin",
  "budgetMax",
  "budgetType",
  "preferredArea",
  "firstChoiceArea",
  "secondChoiceArea",
  "purpose",
  "temperature",
  "stage",
  "loanPreApprovalStatus",
  "brokerageContractType",
  "amlCheckStatus",
  "desiredMoveInPeriod",
  "notes",
  "personalInfoConsentAt",
  "nextFollowUpAt",
] as const;

export type ClientFormAutofillField = (typeof CLIENT_FORM_AUTOFILL_FIELDS)[number];

const templateLabelByLocale: Record<Locale, Record<ClientFormTemplateKey, string>> = {
  ja: {
    none: "通常入力",
    self_use_intake: "居住用ヒアリング",
    investment_intake: "投資用ヒアリング",
    legal_check_start: "法定対応開始",
  },
  zh: {
    none: "常规录入",
    self_use_intake: "自住访谈",
    investment_intake: "投资访谈",
    legal_check_start: "法定应对启动",
  },
  ko: {
    none: "일반 입력",
    self_use_intake: "실거주 상담",
    investment_intake: "투자 상담",
    legal_check_start: "법정 대응 시작",
  },
};

export const clientFormTemplateLabel: Record<ClientFormTemplateKey, string> = templateLabelByLocale.ja;

export function getClientFormTemplateLabel(locale: Locale): Record<ClientFormTemplateKey, string> {
  return templateLabelByLocale[locale] ?? templateLabelByLocale.ja;
}

export function isClientFormTemplateKey(value: string): value is ClientFormTemplateKey {
  return (CLIENT_FORM_TEMPLATE_KEYS as readonly string[]).includes(value);
}

export function isClientFormAutofillField(value: string): value is ClientFormAutofillField {
  return (CLIENT_FORM_AUTOFILL_FIELDS as readonly string[]).includes(value);
}

export function getClientFormTemplateDefaults(
  key: ClientFormTemplateKey,
  locale: Locale = "ja"
): ClientFormTemplateDefaults {
  const nextDay = new Date(Date.now() + 24 * 60 * 60 * 1000);

  if (key === "self_use_intake") {
    return {
      budgetType: "total_price",
      purpose: "self_use",
      temperature: "medium",
      stage: "lead",
      loanPreApprovalStatus: "not_applied",
      brokerageContractType: "none",
      amlCheckStatus: "not_required",
      desiredMoveInPeriod:
        locale === "zh" ? "3个月内" : locale === "ko" ? "3개월 이내" : "3か月以内",
      notes:
        locale === "zh"
          ? "自住模板：确认通勤动线、学区、户型优先级"
          : locale === "ko"
            ? "실거주 템플릿: 통근 동선/학군/평면 우선순위 확인"
            : "居住用テンプレート: 通勤導線・学区・間取り優先度を確認",
      nextFollowUpAt: nextDay,
    };
  }

  if (key === "investment_intake") {
    return {
      budgetType: "monthly_payment",
      purpose: "investment",
      temperature: "medium",
      stage: "contacted",
      loanPreApprovalStatus: "screening",
      brokerageContractType: "general",
      amlCheckStatus: "pending",
      desiredMoveInPeriod:
        locale === "zh" ? "确认运营开始时间" : locale === "ko" ? "운용 시작 시기 확인" : "運用開始時期を確認",
      notes:
        locale === "zh"
          ? "投资模板：确认收益目标、退出策略、融资条件"
          : locale === "ko"
            ? "투자 템플릿: 수익 목표/엑시트 전략/융자 조건 확인"
            : "投資用テンプレート: 利回り目標・出口戦略・融資条件を確認",
      nextFollowUpAt: nextDay,
    };
  }

  if (key === "legal_check_start") {
    return {
      budgetType: "total_price",
      temperature: "medium",
      stage: "contacted",
      loanPreApprovalStatus: "not_applied",
      brokerageContractType: "general",
      amlCheckStatus: "pending",
      personalInfoConsentAt: new Date(),
      notes:
        locale === "zh"
          ? "法务模板：开始跟踪媒介合同、35条说明、37条书面进度"
          : locale === "ko"
            ? "법정 대응 템플릿: 중개계약/35조 설명/37조 서면 진행 추적 시작"
            : "法定対応テンプレート: 媒介契約・35条説明・37条書面の進捗管理を開始",
      nextFollowUpAt: nextDay,
    };
  }

  return {
    budgetType: "total_price",
    purpose: "self_use",
    temperature: "medium",
    stage: "lead",
    loanPreApprovalStatus: "not_applied",
    brokerageContractType: "none",
    amlCheckStatus: "not_required",
  };
}
