"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import type { Locale } from "@/lib/locale";
import { computeQuote, generateQuoteSummaries, getQuoteWarnings } from "@/lib/quote";

type ClientOption = {
  id: string;
  name: string;
};

type PropertyOption = {
  id: string;
  name: string;
  listingPrice: number;
  managementFee: number | null;
  repairFee: number | null;
};

type QuoteFormProps = {
  clients: ClientOption[];
  properties: PropertyOption[];
  action: (formData: FormData) => void;
  defaultClientId?: string;
  locale?: Locale;
};

const numberInputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring";

const texts = {
  ja: {
    inputTitle: "入力",
    client: "顧客",
    selectClient: "顧客を選択",
    quoteTitle: "提案タイトル",
    quoteTitlePlaceholder: "例：プランA",
    property: "物件",
    noProperty: "物件を連携しない",
    listingPrice: "物件価格",
    brokerageFee: "仲介手数料",
    taxFee: "税金",
    otherFee: "その他費用",
    managementFee: "管理費（月額）",
    repairFee: "修繕積立金（月額）",
    downPayment: "頭金",
    interestRate: "金利（%）",
    loanYears: "返済年数",
    summaryTitle: "顧客向け提案サマリー",
    short: "簡潔版",
    formal: "詳細版",
    copyShort: "簡潔版をコピー",
    copyFormal: "詳細版をコピー",
    agentNote: "担当者メモ（任意）",
    resultTitle: "試算結果",
    totalInitialCost: "初期費用合計",
    loanAmount: "借入額",
    monthlyPayment: "月々返済額（試算）",
    monthlyTotalCost: "月次固定支出",
    instant: "入力内容の変更は即時に反映されます。",
    warningTitle: "注意ポイント",
    noWarning: "現在、注意すべき項目はありません。",
    copySelected: "選択中サマリーをコピー",
    save: "提案を保存して顧客に紐づけ",
  },
  zh: {
    inputTitle: "输入",
    client: "客户",
    selectClient: "选择客户",
    quoteTitle: "提案标题",
    quoteTitlePlaceholder: "例：方案A",
    property: "物件",
    noProperty: "不关联物件",
    listingPrice: "物件价格",
    brokerageFee: "中介费",
    taxFee: "税费",
    otherFee: "其他费用",
    managementFee: "管理费（月）",
    repairFee: "修缮基金（月）",
    downPayment: "首付款",
    interestRate: "利率（%）",
    loanYears: "还款年限",
    summaryTitle: "面向客户的提案摘要",
    short: "简版",
    formal: "详版",
    copyShort: "复制简版",
    copyFormal: "复制详版",
    agentNote: "担当备注（可选）",
    resultTitle: "试算结果",
    totalInitialCost: "初期费用合计",
    loanAmount: "贷款额",
    monthlyPayment: "月供（试算）",
    monthlyTotalCost: "每月固定支出",
    instant: "输入变更会实时反映。",
    warningTitle: "提示",
    noWarning: "当前没有需要注意的项目。",
    copySelected: "复制当前摘要",
    save: "保存提案并关联客户",
  },
  ko: {
    inputTitle: "입력",
    client: "고객",
    selectClient: "고객 선택",
    quoteTitle: "제안 제목",
    quoteTitlePlaceholder: "예: 플랜 A",
    property: "매물",
    noProperty: "매물 미연결",
    listingPrice: "매물 가격",
    brokerageFee: "중개 수수료",
    taxFee: "세금",
    otherFee: "기타 비용",
    managementFee: "관리비(월)",
    repairFee: "수선적립금(월)",
    downPayment: "계약금",
    interestRate: "금리(%)",
    loanYears: "상환 연수",
    summaryTitle: "고객용 제안 요약",
    short: "간단형",
    formal: "상세형",
    copyShort: "간단형 복사",
    copyFormal: "상세형 복사",
    agentNote: "담당자 메모(선택)",
    resultTitle: "시뮬레이션 결과",
    totalInitialCost: "초기 비용 합계",
    loanAmount: "대출금",
    monthlyPayment: "월 상환액(예상)",
    monthlyTotalCost: "월 고정지출",
    instant: "입력 변경 사항은 즉시 반영됩니다.",
    warningTitle: "주의 포인트",
    noWarning: "현재 주의가 필요한 항목이 없습니다.",
    copySelected: "선택한 요약 복사",
    save: "제안 저장 후 고객에 연결",
  },
} as const;

export function QuoteForm({ clients, properties, action, defaultClientId, locale = "ja" }: QuoteFormProps) {
  const text = texts[locale];

  const [draft, setDraft] = useState({
    listingPrice: 0,
    brokerageFee: 0,
    taxFee: 0,
    managementFee: 0,
    repairFee: 0,
    otherFee: 0,
    downPayment: 0,
    interestRate: 1.5,
    loanYears: 35,
  });

  const computed = useMemo(() => computeQuote(draft), [draft]);
  const summaries = useMemo(() => generateQuoteSummaries({ ...draft, ...computed }, locale), [draft, computed, locale]);
  const warnings = useMemo(() => getQuoteWarnings(draft, computed, locale), [draft, computed, locale]);
  const [summaryMode, setSummaryMode] = useState<"short" | "formal">("short");

  return (
    <form action={action} className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{text.inputTitle}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            {text.client}
            <select name="clientId" defaultValue={defaultClientId ?? ""} className={numberInputClass} required>
              <option value="">{text.selectClient}</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {text.quoteTitle}
            <input name="quoteTitle" className={numberInputClass} placeholder={text.quoteTitlePlaceholder} required />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            {text.property}
            <select
              name="propertyId"
              className={numberInputClass}
              onChange={(event) => {
                const found = properties.find((item) => item.id === event.currentTarget.value);
                if (!found) return;
                setDraft((prev) => ({
                  ...prev,
                  listingPrice: found.listingPrice,
                  managementFee: found.managementFee ?? 0,
                  repairFee: found.repairFee ?? 0,
                }));
              }}
            >
              <option value="">{text.noProperty}</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {text.listingPrice}
            <input
              name="listingPrice"
              type="number"
              className={numberInputClass}
              value={draft.listingPrice}
              onChange={(event) => setDraft((prev) => ({ ...prev, listingPrice: Number(event.currentTarget.value) || 0 }))}
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            {text.brokerageFee}
            <input
              name="brokerageFee"
              type="number"
              className={numberInputClass}
              value={draft.brokerageFee}
              onChange={(event) => setDraft((prev) => ({ ...prev, brokerageFee: Number(event.currentTarget.value) || 0 }))}
            />
          </label>
          <label className="text-sm">
            {text.taxFee}
            <input
              name="taxFee"
              type="number"
              className={numberInputClass}
              value={draft.taxFee}
              onChange={(event) => setDraft((prev) => ({ ...prev, taxFee: Number(event.currentTarget.value) || 0 }))}
            />
          </label>
          <label className="text-sm">
            {text.otherFee}
            <input
              name="otherFee"
              type="number"
              className={numberInputClass}
              value={draft.otherFee}
              onChange={(event) => setDraft((prev) => ({ ...prev, otherFee: Number(event.currentTarget.value) || 0 }))}
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            {text.managementFee}
            <input
              name="managementFee"
              type="number"
              className={numberInputClass}
              value={draft.managementFee}
              onChange={(event) => setDraft((prev) => ({ ...prev, managementFee: Number(event.currentTarget.value) || 0 }))}
            />
          </label>
          <label className="text-sm">
            {text.repairFee}
            <input
              name="repairFee"
              type="number"
              className={numberInputClass}
              value={draft.repairFee}
              onChange={(event) => setDraft((prev) => ({ ...prev, repairFee: Number(event.currentTarget.value) || 0 }))}
            />
          </label>
          <label className="text-sm">
            {text.downPayment}
            <input
              name="downPayment"
              type="number"
              className={numberInputClass}
              value={draft.downPayment}
              onChange={(event) => setDraft((prev) => ({ ...prev, downPayment: Number(event.currentTarget.value) || 0 }))}
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            {text.interestRate}
            <input
              name="interestRate"
              type="number"
              step="0.01"
              className={numberInputClass}
              value={draft.interestRate}
              onChange={(event) => setDraft((prev) => ({ ...prev, interestRate: Number(event.currentTarget.value) || 0 }))}
            />
          </label>
          <label className="text-sm">
            {text.loanYears}
            <input
              name="loanYears"
              type="number"
              className={numberInputClass}
              value={draft.loanYears}
              onChange={(event) => setDraft((prev) => ({ ...prev, loanYears: Number(event.currentTarget.value) || 0 }))}
            />
          </label>
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-900">{text.summaryTitle}</p>
          <div className="flex flex-wrap gap-2 text-sm">
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                name="summaryModeView"
                checked={summaryMode === "short"}
                onChange={() => setSummaryMode("short")}
              />
              {text.short}
            </label>
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                name="summaryModeView"
                checked={summaryMode === "formal"}
                onChange={() => setSummaryMode("formal")}
              />
              {text.formal}
            </label>
          </div>

          <div className="space-y-2 rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{text.short}</p>
            <p className="text-sm text-slate-800">{summaries.shortSummary}</p>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(summaries.shortSummary);
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
            >
              {text.copyShort}
            </button>
          </div>

          <div className="space-y-2 rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{text.formal}</p>
            <p className="text-sm text-slate-800">{summaries.formalSummary}</p>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(summaries.formalSummary);
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
            >
              {text.copyFormal}
            </button>
          </div>
        </div>

        <textarea name="agentNote" rows={3} placeholder={text.agentNote} className={numberInputClass} />

        <input type="hidden" name="summaryMode" value={summaryMode} />
        <input type="hidden" name="generatedShortSummary" value={summaries.shortSummary} />
        <input type="hidden" name="generatedFormalSummary" value={summaries.formalSummary} />
        <input type="hidden" name="summaryText" value={summaryMode === "formal" ? summaries.formalSummary : summaries.shortSummary} />
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{text.resultTitle}</h2>
        <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          <p className="flex justify-between">
            <span>{text.totalInitialCost}</span>
            <strong>{formatCurrency(computed.totalInitialCost, locale)}</strong>
          </p>
          <p className="flex justify-between">
            <span>{text.loanAmount}</span>
            <strong>{formatCurrency(computed.loanAmount, locale)}</strong>
          </p>
          <p className="flex justify-between">
            <span>{text.monthlyPayment}</span>
            <strong>{formatCurrency(computed.monthlyPaymentEstimate, locale)}</strong>
          </p>
          <p className="flex justify-between">
            <span>{text.monthlyTotalCost}</span>
            <strong>{formatCurrency(computed.monthlyTotalCost, locale)}</strong>
          </p>
        </div>

        <p className="text-xs text-slate-500">{text.instant}</p>
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-800">{text.warningTitle}</p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-amber-700">
            {warnings.length === 0 ? <li>{text.noWarning}</li> : null}
            {warnings.map((warning) => (
              <li key={warning.code}>{warning.message}</li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={async () => {
            const selectedText = summaryMode === "formal" ? summaries.formalSummary : summaries.shortSummary;
            await navigator.clipboard.writeText(selectedText);
          }}
          className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
        >
          {text.copySelected}
        </button>

        <button type="submit" className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700">
          {text.save}
        </button>
      </section>
    </form>
  );
}
