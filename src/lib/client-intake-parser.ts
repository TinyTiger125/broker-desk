import {
  isClientFormTemplateKey,
  type ClientFormAutofillDefaults,
  type ClientFormTemplateKey,
} from "@/lib/client-form-template";
import type { Locale } from "@/lib/locale";

export type IntakeExtractedItem = {
  field: keyof ClientFormAutofillDefaults;
  label: string;
  value: string;
  confidence: number;
  reason: string;
};

export type IntakeParseResult = {
  recommendedTemplate: ClientFormTemplateKey;
  defaults: ClientFormAutofillDefaults;
  extracted: IntakeExtractedItem[];
};

const TEMPLATE_KEYWORDS = {
  investment: /(投資|利回り|賃貸運用|収益|キャッシュフロー)/,
  selfUse: /(自宅|居住|住み替え|実需|マイホーム|通勤)/,
  legal: /(35条|37条|媒介契約|重要事項説明|契約書面|本人確認|AML|KYC|個人情報)/i,
};

const AREA_PATTERN = /([一-龥ぁ-んァ-ンA-Za-z]{1,10}(?:区|市|町|村))/g;

function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .replace(/[　]/g, " ")
    .trim();
}

function toAmount(valueText: string, unit?: string): number | null {
  const n = Number(valueText);
  if (!Number.isFinite(n)) return null;
  if (unit === "億") return Math.round(n * 100000000);
  if (unit === "万") return Math.round(n * 10000);
  return Math.round(n);
}

function inferTemplate(normalized: string): ClientFormTemplateKey {
  if (TEMPLATE_KEYWORDS.legal.test(normalized)) return "legal_check_start";
  if (TEMPLATE_KEYWORDS.investment.test(normalized)) return "investment_intake";
  if (TEMPLATE_KEYWORDS.selfUse.test(normalized)) return "self_use_intake";
  return "none";
}

function detectBudget(normalized: string): Pick<ClientFormAutofillDefaults, "budgetType" | "budgetMin" | "budgetMax"> {
  const monthly = /(月々|月額|毎月|返済額|月次)/.test(normalized);
  const rangeMatch = normalized.match(
    /([0-9]+(?:\.[0-9]+)?)\s*(億|万)?\s*円?\s*(?:〜|~|ー|-|から)\s*([0-9]+(?:\.[0-9]+)?)\s*(億|万)?\s*円?/
  );

  if (rangeMatch) {
    const first = toAmount(rangeMatch[1], rangeMatch[2]);
    const second = toAmount(rangeMatch[3], rangeMatch[4]);
    if (first && second) {
      const min = Math.min(first, second);
      const max = Math.max(first, second);
      return {
        budgetType: monthly ? "monthly_payment" : "total_price",
        budgetMin: min,
        budgetMax: max,
      };
    }
  }

  const monthlyMatch = normalized.match(/(?:月々|月額|毎月)[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)\s*(億|万)?\s*円?/);
  if (monthlyMatch) {
    const max = toAmount(monthlyMatch[1], monthlyMatch[2]);
    if (max) {
      return {
        budgetType: "monthly_payment",
        budgetMax: max,
      };
    }
  }

  const amountMatches = [...normalized.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*(億|万)\s*円?/g)];
  if (amountMatches.length > 0) {
    const values = amountMatches
      .map((m) => toAmount(m[1], m[2]))
      .filter((x): x is number => typeof x === "number");
    if (values.length >= 2) {
      return {
        budgetType: monthly ? "monthly_payment" : "total_price",
        budgetMin: Math.min(...values),
        budgetMax: Math.max(...values),
      };
    }
    if (values.length === 1) {
      return {
        budgetType: monthly ? "monthly_payment" : "total_price",
        budgetMax: values[0],
      };
    }
  }

  return {
    budgetType: monthly ? "monthly_payment" : "total_price",
  };
}

function detectAreas(normalized: string): Pick<ClientFormAutofillDefaults, "preferredArea" | "firstChoiceArea" | "secondChoiceArea"> {
  const candidates = [...normalized.matchAll(AREA_PATTERN)]
    .map((m) => m[1])
    .filter((x) => x.length >= 2 && x.length <= 12);
  const unique = [...new Set(candidates)];
  const first = unique[0];
  const second = unique[1];

  if (!first && !second) {
    return {};
  }

  const result: Pick<ClientFormAutofillDefaults, "preferredArea" | "firstChoiceArea" | "secondChoiceArea"> = {
    preferredArea: [first, second].filter(Boolean).join(" / "),
  };
  if (first) result.firstChoiceArea = first;
  if (second) result.secondChoiceArea = second;
  return result;
}

function detectPurpose(normalized: string): Pick<ClientFormAutofillDefaults, "purpose"> {
  if (TEMPLATE_KEYWORDS.investment.test(normalized)) return { purpose: "investment" };
  if (TEMPLATE_KEYWORDS.selfUse.test(normalized)) return { purpose: "self_use" };
  return {};
}

function detectLoanStatus(normalized: string): Pick<ClientFormAutofillDefaults, "loanPreApprovalStatus"> {
  if (/(事前審査|ローン審査).*(承認|通過|OK|済)/.test(normalized)) {
    return { loanPreApprovalStatus: "approved" };
  }
  if (/(事前審査|ローン審査).*(否決|落ち|不可)/.test(normalized)) {
    return { loanPreApprovalStatus: "rejected" };
  }
  if (/(事前審査|ローン審査).*(審査中|申請中|申込)/.test(normalized)) {
    return { loanPreApprovalStatus: "screening" };
  }
  if (/(事前審査|ローン審査).*(未申込|未実施|これから|未)/.test(normalized)) {
    return { loanPreApprovalStatus: "not_applied" };
  }
  return {};
}

function detectStage(normalized: string): Pick<ClientFormAutofillDefaults, "stage"> {
  if (/(交渉|申込|買付|条件調整)/.test(normalized)) return { stage: "negotiating" };
  if (/(内見|見学|案内)/.test(normalized)) return { stage: "viewing" };
  if (/(提案|見積|試算)/.test(normalized)) return { stage: "quoted" };
  if (/(連絡済|返信|面談済|架電済)/.test(normalized)) return { stage: "contacted" };
  return {};
}

function detectTemperature(normalized: string): Pick<ClientFormAutofillDefaults, "temperature"> {
  if (/(急ぎ|至急|最優先|今週中|すぐ)/.test(normalized)) return { temperature: "high" };
  if (/(情報収集|様子見|ゆっくり|長期検討)/.test(normalized)) return { temperature: "low" };
  if (/(比較中|検討中|相談中)/.test(normalized)) return { temperature: "medium" };
  return {};
}

function detectBrokerage(normalized: string): Pick<ClientFormAutofillDefaults, "brokerageContractType"> {
  if (/専属専任/.test(normalized)) return { brokerageContractType: "exclusive_exclusive" };
  if (/専任媒介/.test(normalized)) return { brokerageContractType: "exclusive" };
  if (/一般媒介/.test(normalized)) return { brokerageContractType: "general" };
  if (/(媒介契約).*(未締結|未)/.test(normalized)) return { brokerageContractType: "none" };
  return {};
}

function detectAml(normalized: string): Pick<ClientFormAutofillDefaults, "amlCheckStatus"> {
  if (/(疑わしい取引|届出済)/.test(normalized)) return { amlCheckStatus: "reported" };
  if (/(本人確認|AML|KYC).*(済|完了)/i.test(normalized)) return { amlCheckStatus: "verified" };
  if (/(本人確認|AML|KYC).*(待ち|保留|未完了|要確認)/i.test(normalized)) return { amlCheckStatus: "pending" };
  return {};
}

function detectDesiredPeriod(normalized: string): Pick<ClientFormAutofillDefaults, "desiredMoveInPeriod"> {
  const match = normalized.match(/(今月中|来月中|年内|時期未定|[0-9]+\s*か月以内|[0-9]+\s*週間以内)/);
  if (match) return { desiredMoveInPeriod: match[1] };
  return {};
}

function detectConsentDate(normalized: string): Pick<ClientFormAutofillDefaults, "personalInfoConsentAt"> {
  if (/(個人情報).*(同意|承諾|説明済)/.test(normalized)) {
    return { personalInfoConsentAt: new Date() };
  }
  return {};
}

function detectNotes(normalized: string, locale: Locale): Pick<ClientFormAutofillDefaults, "notes"> {
  if (!normalized) return {};
  const short = normalized.length > 140 ? `${normalized.slice(0, 140)}...` : normalized;
  if (locale === "zh") return { notes: `自动提取备注: ${short}` };
  if (locale === "ko") return { notes: `자동 추출 메모: ${short}` };
  return { notes: `自動抽出メモ: ${short}` };
}

function getFieldMeta(
  field: keyof ClientFormAutofillDefaults,
  locale: Locale
): { confidence: number; reason: string } {
  const jaMeta: Record<keyof ClientFormAutofillDefaults, { confidence: number; reason: string }> = {
    budgetMin: { confidence: 0.93, reason: "メモ内の予算レンジ表現を金額換算しました。" },
    budgetMax: { confidence: 0.93, reason: "メモ内の予算レンジ表現を金額換算しました。" },
    budgetType: { confidence: 0.88, reason: "「月々/毎月」等の語彙から予算種別を推定しました。" },
    preferredArea: { confidence: 0.84, reason: "区/市/町/村の地名パターンを抽出しました。" },
    firstChoiceArea: { confidence: 0.84, reason: "地名の出現順から第1希望エリアとして推定しました。" },
    secondChoiceArea: { confidence: 0.8, reason: "地名の出現順から第2希望エリアとして推定しました。" },
    purpose: { confidence: 0.89, reason: "投資/居住関連キーワードから用途を推定しました。" },
    temperature: { confidence: 0.72, reason: "緊急度キーワードから温度感を推定しました。" },
    stage: { confidence: 0.74, reason: "内見/交渉/提案等の行動語彙からステージを推定しました。" },
    loanPreApprovalStatus: { confidence: 0.9, reason: "事前審査関連キーワードから審査状態を推定しました。" },
    brokerageContractType: { confidence: 0.91, reason: "媒介契約種別キーワードを検出しました。" },
    amlCheckStatus: { confidence: 0.86, reason: "本人確認・AML関連キーワードを検出しました。" },
    desiredMoveInPeriod: { confidence: 0.76, reason: "時期表現（来月中/年内等）を抽出しました。" },
    notes: { confidence: 0.95, reason: "入力メモを要約して補助メモとして設定しました。" },
    personalInfoConsentAt: { confidence: 0.78, reason: "個人情報同意に関する語彙を検出し、本日付を仮設定しました。" },
    nextFollowUpAt: { confidence: 0.6, reason: "次回フォロー日の直接抽出は未実装のため低信頼です。" },
  };
  const zhMeta: Record<keyof ClientFormAutofillDefaults, { confidence: number; reason: string }> = {
    budgetMin: { confidence: 0.93, reason: "已将备忘中的预算区间换算为金额。" },
    budgetMax: { confidence: 0.93, reason: "已将备忘中的预算区间换算为金额。" },
    budgetType: { confidence: 0.88, reason: "根据“月供/每月”等词汇推断预算类型。" },
    preferredArea: { confidence: 0.84, reason: "已提取区/市/町/村等地名模式。" },
    firstChoiceArea: { confidence: 0.84, reason: "根据地名出现顺序推断第一意向区域。" },
    secondChoiceArea: { confidence: 0.8, reason: "根据地名出现顺序推断第二意向区域。" },
    purpose: { confidence: 0.89, reason: "根据投资/自住关键词推断用途。" },
    temperature: { confidence: 0.72, reason: "根据紧急度关键词推断客户温度。" },
    stage: { confidence: 0.74, reason: "根据带看/谈判/提案等行为词推断阶段。" },
    loanPreApprovalStatus: { confidence: 0.9, reason: "根据预审关键词推断审查状态。" },
    brokerageContractType: { confidence: 0.91, reason: "检测到媒介合同类型关键词。" },
    amlCheckStatus: { confidence: 0.86, reason: "检测到实名/AML相关关键词。" },
    desiredMoveInPeriod: { confidence: 0.76, reason: "已提取时点表达（如来月中/年内）。" },
    notes: { confidence: 0.95, reason: "已将输入备忘摘要为辅助备注。" },
    personalInfoConsentAt: { confidence: 0.78, reason: "检测到个人信息同意词汇，暂设为当天。" },
    nextFollowUpAt: { confidence: 0.6, reason: "尚未实现下次跟进日期的直接抽取，可信度较低。" },
  };
  const koMeta: Record<keyof ClientFormAutofillDefaults, { confidence: number; reason: string }> = {
    budgetMin: { confidence: 0.93, reason: "메모의 예산 범위 표현을 금액으로 환산했습니다." },
    budgetMax: { confidence: 0.93, reason: "메모의 예산 범위 표현을 금액으로 환산했습니다." },
    budgetType: { confidence: 0.88, reason: "‘월별/매월’ 어휘를 기준으로 예산 유형을 추정했습니다." },
    preferredArea: { confidence: 0.84, reason: "구/시/정 패턴의 지명을 추출했습니다." },
    firstChoiceArea: { confidence: 0.84, reason: "지명 출현 순서로 1순위 희망 지역을 추정했습니다." },
    secondChoiceArea: { confidence: 0.8, reason: "지명 출현 순서로 2순위 희망 지역을 추정했습니다." },
    purpose: { confidence: 0.89, reason: "투자/거주 키워드로 용도를 추정했습니다." },
    temperature: { confidence: 0.72, reason: "긴급도 키워드로 고객 온도를 추정했습니다." },
    stage: { confidence: 0.74, reason: "현장 확인/협의/제안 행동 어휘로 단계를 추정했습니다." },
    loanPreApprovalStatus: { confidence: 0.9, reason: "사전심사 키워드로 심사 상태를 추정했습니다." },
    brokerageContractType: { confidence: 0.91, reason: "중개 계약 유형 키워드를 감지했습니다." },
    amlCheckStatus: { confidence: 0.86, reason: "본인확인/AML 관련 키워드를 감지했습니다." },
    desiredMoveInPeriod: { confidence: 0.76, reason: "시기 표현(예: 다음 달 내/연내)을 추출했습니다." },
    notes: { confidence: 0.95, reason: "입력 메모를 요약하여 보조 메모로 설정했습니다." },
    personalInfoConsentAt: { confidence: 0.78, reason: "개인정보 동의 관련 어휘를 감지해 오늘 날짜를 임시 설정했습니다." },
    nextFollowUpAt: { confidence: 0.6, reason: "다음 팔로업 날짜 직접 추출은 미구현으로 신뢰도가 낮습니다." },
  };

  const meta = locale === "zh" ? zhMeta : locale === "ko" ? koMeta : jaMeta;

  return meta[field];
}

export function parseClientIntakeMemo(rawMemo: string, locale: Locale = "ja"): IntakeParseResult {
  const normalized = normalizeText(rawMemo);
  if (!normalized) {
    return {
      recommendedTemplate: "none",
      defaults: {},
      extracted: [],
    };
  }

  const recommendedTemplateCandidate = inferTemplate(normalized);
  const recommendedTemplate = isClientFormTemplateKey(recommendedTemplateCandidate)
    ? recommendedTemplateCandidate
    : "none";

  const defaults: ClientFormAutofillDefaults = {
    ...detectBudget(normalized),
    ...detectAreas(normalized),
    ...detectPurpose(normalized),
    ...detectLoanStatus(normalized),
    ...detectStage(normalized),
    ...detectTemperature(normalized),
    ...detectBrokerage(normalized),
    ...detectAml(normalized),
    ...detectDesiredPeriod(normalized),
    ...detectConsentDate(normalized),
    ...detectNotes(normalized, locale),
  };

  const labelMapByLocale: Record<Locale, Record<keyof ClientFormAutofillDefaults, string>> = {
    ja: {
      budgetMin: "予算下限",
      budgetMax: "予算上限",
      budgetType: "予算種別",
      preferredArea: "希望エリア",
      firstChoiceArea: "第1希望エリア",
      secondChoiceArea: "第2希望エリア",
      purpose: "用途",
      temperature: "温度感",
      stage: "ステージ",
      loanPreApprovalStatus: "ローン事前審査",
      brokerageContractType: "媒介契約",
      amlCheckStatus: "本人確認/AML",
      desiredMoveInPeriod: "入居/運用希望時期",
      notes: "メモ",
      personalInfoConsentAt: "個人情報同意確認日",
      nextFollowUpAt: "次回フォロー",
    },
    zh: {
      budgetMin: "预算下限",
      budgetMax: "预算上限",
      budgetType: "预算类型",
      preferredArea: "意向区域",
      firstChoiceArea: "第一意向区域",
      secondChoiceArea: "第二意向区域",
      purpose: "用途",
      temperature: "温度",
      stage: "阶段",
      loanPreApprovalStatus: "贷款预审",
      brokerageContractType: "媒介合同",
      amlCheckStatus: "实名/AML",
      desiredMoveInPeriod: "入住/运营期望时间",
      notes: "备注",
      personalInfoConsentAt: "个人信息同意确认日",
      nextFollowUpAt: "下次跟进",
    },
    ko: {
      budgetMin: "예산 하한",
      budgetMax: "예산 상한",
      budgetType: "예산 유형",
      preferredArea: "희망 지역",
      firstChoiceArea: "1순위 희망 지역",
      secondChoiceArea: "2순위 희망 지역",
      purpose: "용도",
      temperature: "온도",
      stage: "단계",
      loanPreApprovalStatus: "대출 사전심사",
      brokerageContractType: "중개 계약",
      amlCheckStatus: "본인확인/AML",
      desiredMoveInPeriod: "입주/운용 희망 시기",
      notes: "메모",
      personalInfoConsentAt: "개인정보 동의 확인일",
      nextFollowUpAt: "다음 팔로업",
    },
  };
  const labelMap = labelMapByLocale[locale] ?? labelMapByLocale.ja;

  const extracted: IntakeExtractedItem[] = Object.entries(defaults)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([field, value]) => ({
      field: field as keyof ClientFormAutofillDefaults,
      label: labelMap[field as keyof ClientFormAutofillDefaults] ?? field,
      value: value instanceof Date ? value.toISOString().slice(0, 10) : String(value),
      confidence: getFieldMeta(field as keyof ClientFormAutofillDefaults, locale).confidence,
      reason: getFieldMeta(field as keyof ClientFormAutofillDefaults, locale).reason,
    }));

  return {
    recommendedTemplate,
    defaults,
    extracted,
  };
}
