import { formatCurrency } from "@/lib/format";
import type { Locale } from "@/lib/locale";

export type QuoteInput = {
  listingPrice: number;
  brokerageFee: number;
  taxFee: number;
  managementFee: number;
  repairFee: number;
  otherFee: number;
  downPayment: number;
  interestRate: number;
  loanYears: number;
};

export type QuoteComputed = {
  loanAmount: number;
  totalInitialCost: number;
  monthlyPaymentEstimate: number;
  monthlyTotalCost: number;
};

export type QuoteSummaryVariants = {
  shortSummary: string;
  formalSummary: string;
};

export type QuoteWarning = {
  code: "low_down_payment" | "high_monthly_payment" | "missing_fee" | "high_initial_cost";
  message: string;
};

export function computeQuote(input: QuoteInput): QuoteComputed {
  const principal = Math.max(0, input.listingPrice - input.downPayment);
  const monthlyRate = input.interestRate / 100 / 12;
  const totalMonths = Math.max(1, input.loanYears * 12);

  const monthlyPaymentEstimate =
    monthlyRate === 0
      ? principal / totalMonths
      : (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -totalMonths));

  const totalInitialCost =
    input.downPayment +
    input.brokerageFee +
    input.taxFee +
    input.managementFee +
    input.repairFee +
    input.otherFee;

  const monthlyTotalCost = monthlyPaymentEstimate + input.managementFee + input.repairFee;

  return {
    loanAmount: Math.round(principal),
    totalInitialCost: Math.round(totalInitialCost),
    monthlyPaymentEstimate: Math.round(monthlyPaymentEstimate),
    monthlyTotalCost: Math.round(monthlyTotalCost),
  };
}

export function generateQuoteSummaries(input: QuoteInput & QuoteComputed, locale: Locale = "ja"): QuoteSummaryVariants {
  const monthlyFee = Math.round(input.managementFee + input.repairFee);

  if (locale === "zh") {
    return {
      shortSummary:
        `初期费用约 ${formatCurrency(input.totalInitialCost, locale)}，` +
        `贷款额约 ${formatCurrency(input.loanAmount, locale)}，` +
        `月供约 ${formatCurrency(input.monthlyPaymentEstimate, locale)}，` +
        `每月固定支出约 ${formatCurrency(input.monthlyTotalCost, locale)}。`,
      formalSummary:
        `本方案初期费用总额约 ${formatCurrency(input.totalInitialCost, locale)}，` +
        `预计首付款为 ${formatCurrency(input.downPayment, locale)}。` +
        `在 ${input.loanYears} 年、利率 ${input.interestRate}% 的条件下，` +
        `月供约为 ${formatCurrency(input.monthlyPaymentEstimate, locale)}。` +
        `管理费与修缮基金月合计约 ${formatCurrency(monthlyFee, locale)}，` +
        `每月固定支出合计约 ${formatCurrency(input.monthlyTotalCost, locale)}。`,
    };
  }

  if (locale === "ko") {
    return {
      shortSummary:
        `초기 비용은 약 ${formatCurrency(input.totalInitialCost, locale)}, ` +
        `대출금은 약 ${formatCurrency(input.loanAmount, locale)}, ` +
        `월 상환액은 약 ${formatCurrency(input.monthlyPaymentEstimate, locale)}, ` +
        `월 고정지출은 약 ${formatCurrency(input.monthlyTotalCost, locale)}입니다.`,
      formalSummary:
        `본 플랜의 초기 비용 총액은 약 ${formatCurrency(input.totalInitialCost, locale)}, ` +
        `자기자금(계약금)은 ${formatCurrency(input.downPayment, locale)}를 가정합니다. ` +
        `${input.loanYears}년 · 금리 ${input.interestRate}% 조건에서 ` +
        `월 상환액은 약 ${formatCurrency(input.monthlyPaymentEstimate, locale)}입니다. ` +
        `관리비와 수선적립금은 월 ${formatCurrency(monthlyFee, locale)} 수준이며, ` +
        `월 고정지출 합계는 약 ${formatCurrency(input.monthlyTotalCost, locale)}입니다.`,
    };
  }

  return {
    shortSummary:
      `初期費用は約 ${formatCurrency(input.totalInitialCost, locale)}、` +
      `借入額は約 ${formatCurrency(input.loanAmount, locale)}、` +
      `月々返済は約 ${formatCurrency(input.monthlyPaymentEstimate, locale)}、` +
      `月次固定支出は約 ${formatCurrency(input.monthlyTotalCost, locale)} です。`,
    formalSummary:
      `本プランの初期費用総額は約 ${formatCurrency(input.totalInitialCost, locale)}、` +
      `頭金は ${formatCurrency(input.downPayment, locale)} を想定しています。` +
      `${input.loanYears}年・金利 ${input.interestRate}% の条件では、` +
      `月々返済額は約 ${formatCurrency(input.monthlyPaymentEstimate, locale)} です。` +
      `管理費と修繕積立金は月額で約 ${formatCurrency(monthlyFee, locale)} となり、` +
      `月次固定支出は合計で約 ${formatCurrency(input.monthlyTotalCost, locale)} です。`,
  };
}

export function getQuoteWarnings(input: QuoteInput, computed: QuoteComputed, locale: Locale = "ja"): QuoteWarning[] {
  const warnings: QuoteWarning[] = [];
  const safeListingPrice = Math.max(1, input.listingPrice);
  const downPaymentRatio = input.downPayment / safeListingPrice;
  const monthlyCostRatio = computed.monthlyTotalCost / safeListingPrice;
  const initialCostRatio = computed.totalInitialCost / safeListingPrice;

  if (downPaymentRatio > 0 && downPaymentRatio < 0.1) {
    warnings.push({
      code: "low_down_payment",
      message:
        locale === "zh"
          ? "首付款比例低于10%，可能增加资金压力与审批风险。"
          : locale === "ko"
            ? "계약금 비율이 10% 미만입니다. 자금 부담 및 심사 리스크가 커질 수 있습니다."
            : "頭金比率が10%未満です。資金負担や審査リスクが高まる可能性があります。",
    });
  }

  if (monthlyCostRatio > 0.006) {
    warnings.push({
      code: "high_monthly_payment",
      message:
        locale === "zh"
          ? "月度支出相对房价偏高，建议提高首付或调整还款期。"
          : locale === "ko"
            ? "월 지출이 매매가 대비 높은 편입니다. 계약금 증액 또는 상환기간 조정을 권장합니다."
            : "月次支出が物件価格に対して高めです。頭金増額または返済期間の見直しを推奨します。",
    });
  }

  if (input.brokerageFee <= 0 || input.taxFee <= 0 || input.managementFee <= 0 || input.repairFee <= 0) {
    warnings.push({
      code: "missing_fee",
      message:
        locale === "zh"
          ? "中介费、税金、管理费、修缮基金存在未填写项，试算可能偏乐观。"
          : locale === "ko"
            ? "중개수수료/세금/관리비/수선적립금에 미입력 항목이 있어 시뮬레이션이 낙관적으로 계산될 수 있습니다."
            : "仲介手数料・税金・管理費・修繕積立金に未入力項目があります。試算が楽観的になる可能性があります。",
    });
  }

  if (initialCostRatio > 0.45) {
    warnings.push({
      code: "high_initial_cost",
      message:
        locale === "zh"
          ? "初期费用超过房价45%，建议重新确认一次性费用和首付分配。"
          : locale === "ko"
            ? "초기 비용이 매매가의 45%를 초과합니다. 일시비용과 계약금 배분을 재확인하세요."
            : "初期費用が物件価格の45%を超えています。一時費用と頭金配分の再確認を推奨します。",
    });
  }

  return warnings;
}
