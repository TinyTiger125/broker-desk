import Link from "next/link";
import { notFound } from "next/navigation";
import { changeQuotationStatus, duplicateQuotationAction } from "@/app/actions";
import { CopyTextButton } from "@/components/copy-text-button";
import { formatCurrency, formatDate } from "@/lib/format";
import { getClientDetail, getQuotationById } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import { getQuoteStatusLabel, getQuoteStatusOptions } from "@/lib/options";
import { generateQuoteSummaries } from "@/lib/quote";
import { getOutputDocDescription, getOutputDocLabel, type OutputDocType } from "@/lib/output-doc";

export const dynamic = "force-dynamic";

type QuoteDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ compare?: string }>;
};

const texts = {
  ja: {
    customer: "顧客",
    createdAt: "作成日",
    status: "ステータス",
    preview: "プレビュー",
    compareOn: "比較モード",
    compareOff: "比較モードを終了",
    duplicate: "複製して新バージョン作成",
    structure: "提案・試算構成",
    property: "物件",
    propertyUnlinked: "未連携物件",
    listingPrice: "物件価格",
    brokerageTax: "仲介手数料 / 税金",
    monthlyFees: "管理費 / 修繕積立金 / その他",
    downLoan: "頭金 / 借入額",
    rateYears: "金利 / 期間",
    yearSuffix: "年",
    shortSummary: "顧客向け要約（簡潔版）",
    formalSummary: "顧客向け要約（詳細版）",
    savedSummary: "保存済み要約",
    result: "結果サマリー",
    totalInitial: "初期費用合計",
    monthlyPayment: "月々返済額（試算）",
    monthlyTotal: "月次固定支出",
    updateStatus: "ステータス更新",
    update: "更新",
    outputs: "標準出力テンプレート",
    outputsDesc: "日本市場向けの定型フォーマットで印刷できます。",
    tuneTemplate: "テンプレートを調整",
    openTemplate: "テンプレートを開く",
    backClient: "顧客詳細へ",
    compareTitle: "同一顧客の提案比較",
    compareSub: "直近5件を表示",
    compareEmpty: "この顧客は提案が1件のみのため比較できません。",
    plan: "プラン",
  },
  zh: {
    customer: "客户",
    createdAt: "创建日",
    status: "状态",
    preview: "预览",
    compareOn: "对比模式",
    compareOff: "关闭对比模式",
    duplicate: "复制并创建新版本",
    structure: "提案试算结构",
    property: "物件",
    propertyUnlinked: "未关联物件",
    listingPrice: "物件价格",
    brokerageTax: "中介费 / 税费",
    monthlyFees: "管理费 / 修缮基金 / 其他",
    downLoan: "首付 / 贷款额",
    rateYears: "利率 / 期限",
    yearSuffix: "年",
    shortSummary: "客户摘要（简版）",
    formalSummary: "客户摘要（详版）",
    savedSummary: "已保存摘要",
    result: "结果摘要",
    totalInitial: "初期费用合计",
    monthlyPayment: "月供（试算）",
    monthlyTotal: "每月固定支出",
    updateStatus: "更新状态",
    update: "更新",
    outputs: "标准输出模板",
    outputsDesc: "可按日本市场标准格式打印输出。",
    tuneTemplate: "调整模板",
    openTemplate: "打开模板",
    backClient: "返回客户详情",
    compareTitle: "同一客户提案对比",
    compareSub: "显示最近5条",
    compareEmpty: "该客户只有1条提案，无法对比。",
    plan: "方案",
  },
  ko: {
    customer: "고객",
    createdAt: "작성일",
    status: "상태",
    preview: "미리보기",
    compareOn: "비교 모드",
    compareOff: "비교 모드 종료",
    duplicate: "복제하여 새 버전 생성",
    structure: "제안/시뮬레이션 구성",
    property: "매물",
    propertyUnlinked: "미연결 매물",
    listingPrice: "매물 가격",
    brokerageTax: "중개수수료 / 세금",
    monthlyFees: "관리비 / 수선적립금 / 기타",
    downLoan: "계약금 / 대출금",
    rateYears: "금리 / 기간",
    yearSuffix: "년",
    shortSummary: "고객 요약(간단형)",
    formalSummary: "고객 요약(상세형)",
    savedSummary: "저장된 요약",
    result: "결과 요약",
    totalInitial: "초기 비용 합계",
    monthlyPayment: "월 상환액(예상)",
    monthlyTotal: "월 고정지출",
    updateStatus: "상태 업데이트",
    update: "업데이트",
    outputs: "표준 출력 템플릿",
    outputsDesc: "일본 시장 표준 포맷으로 인쇄할 수 있습니다.",
    tuneTemplate: "템플릿 조정",
    openTemplate: "템플릿 열기",
    backClient: "고객 상세로",
    compareTitle: "동일 고객 제안 비교",
    compareSub: "최근 5건 표시",
    compareEmpty: "이 고객은 제안이 1건뿐이라 비교할 수 없습니다.",
    plan: "플랜",
  },
} as const;

export default async function QuoteDetailPage({ params, searchParams }: QuoteDetailPageProps) {
  const locale = await getLocale();
  const text = texts[locale];
  const quoteStatusLabel = getQuoteStatusLabel(locale);
  const quoteStatusOptions = getQuoteStatusOptions(locale);

  const { id } = await params;
  const query = (await searchParams) ?? {};
  const quote = await getQuotationById(id);

  if (!quote || !quote.client) {
    notFound();
  }
  const summaries = generateQuoteSummaries(
    {
      listingPrice: quote.listingPrice,
      brokerageFee: quote.brokerageFee,
      taxFee: quote.taxFee,
      managementFee: quote.managementFee,
      repairFee: quote.repairFee,
      otherFee: quote.otherFee,
      downPayment: quote.downPayment,
      interestRate: quote.interestRate,
      loanYears: quote.loanYears,
      loanAmount: quote.loanAmount,
      totalInitialCost: quote.totalInitialCost,
      monthlyPaymentEstimate: quote.monthlyPaymentEstimate,
      monthlyTotalCost: quote.monthlyTotalCost,
    },
    locale
  );
  const compareMode = query.compare === "1";
  const clientDetail = await getClientDetail(quote.client.id);
  const clientQuotes = (clientDetail?.quotations ?? []).slice(0, 5);
  const outputTypes: OutputDocType[] = ["proposal", "estimate_sheet", "funding_plan", "assumption_memo"];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{quote.quoteTitle}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {text.customer} {quote.client.name} · {text.createdAt} {formatDate(quote.createdAt, locale)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-slate-100 px-3 py-1 text-sm text-slate-700">
            {text.status}：{quoteStatusLabel[quote.status]}
          </span>
          <Link href={`/quotes/${quote.id}/print`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
            {text.preview}
          </Link>
          <Link
            href={compareMode ? `/quotes/${quote.id}` : `/quotes/${quote.id}?compare=1`}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            {compareMode ? text.compareOff : text.compareOn}
          </Link>
          <CopyTextButton text={quote.summaryText} locale={locale} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100" />
          <form action={duplicateQuotationAction}>
            <input type="hidden" name="quoteId" value={quote.id} />
            <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
              {text.duplicate}
            </button>
          </form>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">{text.structure}</h2>
          <dl className="mt-3 grid grid-cols-[180px_1fr] gap-y-2 text-sm">
            <dt className="text-slate-500">{text.property}</dt>
            <dd>{quote.property?.name ?? text.propertyUnlinked}</dd>
            <dt className="text-slate-500">{text.listingPrice}</dt>
            <dd>{formatCurrency(quote.listingPrice, locale)}</dd>
            <dt className="text-slate-500">{text.brokerageTax}</dt>
            <dd>
              {formatCurrency(quote.brokerageFee, locale)} / {formatCurrency(quote.taxFee, locale)}
            </dd>
            <dt className="text-slate-500">{text.monthlyFees}</dt>
            <dd>
              {formatCurrency(quote.managementFee, locale)} / {formatCurrency(quote.repairFee, locale)} / {formatCurrency(quote.otherFee, locale)}
            </dd>
            <dt className="text-slate-500">{text.downLoan}</dt>
            <dd>
              {formatCurrency(quote.downPayment, locale)} / {formatCurrency(quote.loanAmount, locale)}
            </dd>
            <dt className="text-slate-500">{text.rateYears}</dt>
            <dd>
              {quote.interestRate}% / {quote.loanYears} {text.yearSuffix}
            </dd>
          </dl>

          <div className="mt-5 rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-slate-600">{text.shortSummary}</p>
            <p className="mt-2 text-sm text-slate-800">{summaries.shortSummary}</p>
            <p className="mt-3 text-sm text-slate-600">{text.formalSummary}</p>
            <p className="mt-2 text-sm text-slate-800">{summaries.formalSummary}</p>
            <p className="mt-3 text-sm text-slate-600">{text.savedSummary}</p>
            <p className="mt-2 text-sm text-slate-800">{quote.summaryText}</p>
          </div>
        </article>

        <aside className="space-y-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{text.result}</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li className="flex justify-between">
                <span>{text.totalInitial}</span>
                <strong>{formatCurrency(quote.totalInitialCost, locale)}</strong>
              </li>
              <li className="flex justify-between">
                <span>{text.monthlyPayment}</span>
                <strong>{formatCurrency(quote.monthlyPaymentEstimate, locale)}</strong>
              </li>
              <li className="flex justify-between">
                <span>{text.monthlyTotal}</span>
                <strong>{formatCurrency(quote.monthlyTotalCost, locale)}</strong>
              </li>
            </ul>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{text.updateStatus}</h2>
            <form action={changeQuotationStatus} className="mt-3 flex gap-2">
              <input type="hidden" name="quoteId" value={quote.id} />
              <select name="status" defaultValue={quote.status} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {quoteStatusOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                {text.update}
              </button>
            </form>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{text.outputs}</h2>
            <p className="mt-1 text-xs text-slate-500">{text.outputsDesc}</p>
            <Link href="/settings/output-templates" className="mt-2 inline-flex text-xs font-medium text-blue-700 hover:underline">
              {text.tuneTemplate}
            </Link>
            <ul className="mt-3 space-y-2 text-sm">
              {outputTypes.map((type) => (
                <li key={type} className="rounded-lg border border-slate-200 p-2">
                  <p className="font-medium text-slate-900">{getOutputDocLabel(locale, type)}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{getOutputDocDescription(locale, type)}</p>
                  <Link href={`/quotes/${quote.id}/print?type=${type}`} className="mt-1 inline-flex text-xs font-medium text-blue-700 hover:underline">
                    {text.openTemplate}
                  </Link>
                </li>
              ))}
            </ul>
          </article>

          <Link href={`/clients/${quote.client.id}`} className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
            {text.backClient}
          </Link>
        </aside>
      </section>

      {compareMode ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">{text.compareTitle}</h2>
            <p className="text-xs text-slate-500">{text.compareSub}</p>
          </div>
          {clientQuotes.length <= 1 ? (
            <p className="mt-3 text-sm text-slate-500">{text.compareEmpty}</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="px-2 py-2">{text.plan}</th>
                    <th className="px-2 py-2">{text.totalInitial}</th>
                    <th className="px-2 py-2">{text.downLoan.split(" /")[0]}</th>
                    <th className="px-2 py-2">{text.monthlyPayment}</th>
                    <th className="px-2 py-2">{text.monthlyTotal}</th>
                    <th className="px-2 py-2">{text.rateYears}</th>
                    <th className="px-2 py-2">{text.createdAt}</th>
                  </tr>
                </thead>
                <tbody>
                  {clientQuotes.map((item) => (
                    <tr key={item.id} className={`border-b border-slate-100 ${item.id === quote.id ? "bg-blue-50/70" : ""}`}>
                      <td className="px-2 py-2 font-medium text-slate-900">{item.quoteTitle}</td>
                      <td className="px-2 py-2">{formatCurrency(item.totalInitialCost, locale)}</td>
                      <td className="px-2 py-2">{formatCurrency(item.downPayment, locale)}</td>
                      <td className="px-2 py-2">{formatCurrency(item.monthlyPaymentEstimate, locale)}</td>
                      <td className="px-2 py-2">{formatCurrency(item.monthlyTotalCost, locale)}</td>
                      <td className="px-2 py-2">
                        {item.interestRate}% / {item.loanYears} {text.yearSuffix}
                      </td>
                      <td className="px-2 py-2 text-slate-500">{formatDate(item.createdAt, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
