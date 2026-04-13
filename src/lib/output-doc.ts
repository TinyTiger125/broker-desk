import type { Locale } from "@/lib/locale";

export type OutputDocType = "proposal" | "estimate_sheet" | "funding_plan" | "assumption_memo";

export const outputDocLabel: Record<OutputDocType, string> = {
  proposal: "購入提案書",
  estimate_sheet: "費用見積明細書",
  funding_plan: "資金計画書（ローン試算）",
  assumption_memo: "試算前提条件説明書",
};

export const outputDocDescription: Record<OutputDocType, string> = {
  proposal: "顧客説明用の総合提案版",
  estimate_sheet: "費用内訳に特化した明細版",
  funding_plan: "返済条件と推移確認版",
  assumption_memo: "試算条件・免責事項の確認版",
};

const outputDocLabelByLocale: Record<Locale, Record<OutputDocType, string>> = {
  ja: outputDocLabel,
  zh: {
    proposal: "购买提案书",
    estimate_sheet: "费用估算明细书",
    funding_plan: "资金计划书（贷款试算）",
    assumption_memo: "试算前提条件说明书",
  },
  ko: {
    proposal: "구매 제안서",
    estimate_sheet: "비용 견적 명세서",
    funding_plan: "자금 계획서(대출 시뮬레이션)",
    assumption_memo: "시뮬레이션 전제조건 설명서",
  },
};

const outputDocDescriptionByLocale: Record<Locale, Record<OutputDocType, string>> = {
  ja: outputDocDescription,
  zh: {
    proposal: "面向客户说明的综合提案版",
    estimate_sheet: "专注费用构成的明细版",
    funding_plan: "还款条件与趋势确认版",
    assumption_memo: "试算条件与免责事项确认版",
  },
  ko: {
    proposal: "고객 설명용 종합 제안 버전",
    estimate_sheet: "비용 내역 중심의 명세 버전",
    funding_plan: "상환 조건/추이 확인 버전",
    assumption_memo: "시뮬레이션 조건/면책 확인 버전",
  },
};

export function getOutputDocLabel(locale: Locale, type: OutputDocType): string {
  return outputDocLabelByLocale[locale]?.[type] ?? outputDocLabel[type];
}

export function getOutputDocDescription(locale: Locale, type: OutputDocType): string {
  return outputDocDescriptionByLocale[locale]?.[type] ?? outputDocDescription[type];
}

export function isOutputDocType(value: string): value is OutputDocType {
  return value === "proposal" || value === "estimate_sheet" || value === "funding_plan" || value === "assumption_memo";
}

export type OutputTemplateSettings = {
  id: string;
  userId: string;
  companyName: string;
  department: string;
  representative: string;
  licenseNumber: string;
  postalAddress: string;
  phone: string;
  email: string;
  proposalTitle: string;
  estimateSheetTitle: string;
  fundingPlanTitle: string;
  assumptionMemoTitle: string;
  documentClassification: string;
  disclaimerLine1: string;
  disclaimerLine2: string;
  disclaimerLine3: string;
  showApprovalSection: boolean;
  showLegalStatusDigest: boolean;
  showOutstandingBalanceTable: boolean;
  updatedAt: Date;
};

export type OutputTemplateSettingsInput = {
  companyName: string;
  department: string;
  representative: string;
  licenseNumber: string;
  postalAddress: string;
  phone: string;
  email: string;
  proposalTitle: string;
  estimateSheetTitle: string;
  fundingPlanTitle: string;
  assumptionMemoTitle: string;
  documentClassification: string;
  disclaimerLine1: string;
  disclaimerLine2: string;
  disclaimerLine3: string;
  showApprovalSection: boolean;
  showLegalStatusDigest: boolean;
  showOutstandingBalanceTable: boolean;
};

function compactDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function createDocumentNumber(quoteId: string, docType: OutputDocType, issuedAt: Date): string {
  const token = quoteId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-6) || "DOC000";
  const type = docType.toUpperCase();
  return `BD-${type}-${compactDate(issuedAt)}-${token}`;
}

export type OutputCompanyProfile = {
  companyName: string;
  department: string;
  representative: string;
  licenseNumber: string;
  postalAddress: string;
  phone: string;
  email: string;
};

export function getOutputCompanyProfile(): OutputCompanyProfile {
  return {
    companyName: process.env.OUTPUT_COMPANY_NAME ?? "株式会社ブローカーデスク不動産",
    department: process.env.OUTPUT_DEPARTMENT ?? "売買仲介部",
    representative: process.env.OUTPUT_REPRESENTATIVE ?? "営業担当",
    licenseNumber: process.env.OUTPUT_LICENSE ?? "宅地建物取引業免許番号（未設定）",
    postalAddress: process.env.OUTPUT_ADDRESS ?? "東京都港区○○ 1-2-3",
    phone: process.env.OUTPUT_PHONE ?? "03-0000-0000",
    email: process.env.OUTPUT_EMAIL ?? "contact@brokerdesk.example",
  };
}

export function getDefaultOutputTemplateSettings(userId: string): OutputTemplateSettings {
  return {
    id: `output_tpl_${userId}`,
    userId,
    companyName: process.env.OUTPUT_COMPANY_NAME ?? "株式会社ブローカーデスク不動産",
    department: process.env.OUTPUT_DEPARTMENT ?? "売買仲介部",
    representative: process.env.OUTPUT_REPRESENTATIVE ?? "営業担当",
    licenseNumber: process.env.OUTPUT_LICENSE ?? "宅地建物取引業免許番号（未設定）",
    postalAddress: process.env.OUTPUT_ADDRESS ?? "東京都港区○○ 1-2-3",
    phone: process.env.OUTPUT_PHONE ?? "03-0000-0000",
    email: process.env.OUTPUT_EMAIL ?? "contact@brokerdesk.example",
    proposalTitle: "購入提案書",
    estimateSheetTitle: "費用見積明細書",
    fundingPlanTitle: "資金計画書（ローン試算）",
    assumptionMemoTitle: "試算前提条件説明書",
    documentClassification: "社外提出用（案）",
    disclaimerLine1: "本書は媒介業務における説明補助資料であり、契約条項を確定するものではありません。",
    disclaimerLine2: "最終条件は重要事項説明書・売買契約書・金融機関提示条件をご確認ください。",
    disclaimerLine3: "本書の再配布時は最新版番号（文書番号・版数）をご確認ください。",
    showApprovalSection: true,
    showLegalStatusDigest: true,
    showOutstandingBalanceTable: true,
    updatedAt: new Date(),
  };
}

export function getOutputTitle(settings: OutputTemplateSettings, type: OutputDocType): string {
  if (type === "proposal") return settings.proposalTitle;
  if (type === "estimate_sheet") return settings.estimateSheetTitle;
  if (type === "funding_plan") return settings.fundingPlanTitle;
  return settings.assumptionMemoTitle;
}
