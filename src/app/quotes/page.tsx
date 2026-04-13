import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import { listQuotations } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import { getQuoteStatusLabel } from "@/lib/options";

export const dynamic = "force-dynamic";

const texts = {
  ja: {
    title: "提案一覧",
    desc: "顧客ごとに提案バージョンを管理し、再利用と比較を高速化します。",
    create: "+ 新規提案",
    colTitle: "タイトル",
    colClient: "顧客",
    colProperty: "物件",
    colInitial: "初期費用",
    colMonthly: "月次支出",
    colStatus: "ステータス",
    colCreatedAt: "作成日",
    colAction: "アクション",
    unlinked: "未連携",
    detail: "詳細",
    empty: "提案はまだありません。",
  },
  zh: {
    title: "提案列表",
    desc: "按客户管理提案版本，快速复用与对比。",
    create: "+ 新建提案",
    colTitle: "标题",
    colClient: "客户",
    colProperty: "物件",
    colInitial: "初期费用",
    colMonthly: "月度支出",
    colStatus: "状态",
    colCreatedAt: "创建日",
    colAction: "操作",
    unlinked: "未关联",
    detail: "详情",
    empty: "暂无提案。",
  },
  ko: {
    title: "제안 목록",
    desc: "고객별 제안 버전을 관리하고 재사용/비교를 빠르게 수행합니다.",
    create: "+ 새 제안",
    colTitle: "제목",
    colClient: "고객",
    colProperty: "매물",
    colInitial: "초기 비용",
    colMonthly: "월 지출",
    colStatus: "상태",
    colCreatedAt: "작성일",
    colAction: "작업",
    unlinked: "미연결",
    detail: "상세",
    empty: "아직 제안이 없습니다.",
  },
} as const;

export default async function QuoteListPage() {
  const locale = await getLocale();
  const text = texts[locale];
  const quoteStatusLabel = getQuoteStatusLabel(locale);
  const quotes = await listQuotations();

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{text.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{text.desc}</p>
        </div>
        <Link href="/quotes/new" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
          {text.create}
        </Link>
      </header>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-2 py-2 font-medium">{text.colTitle}</th>
              <th className="px-2 py-2 font-medium">{text.colClient}</th>
              <th className="px-2 py-2 font-medium">{text.colProperty}</th>
              <th className="px-2 py-2 font-medium">{text.colInitial}</th>
              <th className="px-2 py-2 font-medium">{text.colMonthly}</th>
              <th className="px-2 py-2 font-medium">{text.colStatus}</th>
              <th className="px-2 py-2 font-medium">{text.colCreatedAt}</th>
              <th className="px-2 py-2 font-medium">{text.colAction}</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((quote) => (
              <tr key={quote.id} className="border-b border-slate-100 text-slate-700">
                <td className="px-2 py-3 font-medium text-slate-900">{quote.quoteTitle}</td>
                <td className="px-2 py-3">{quote.client.name}</td>
                <td className="px-2 py-3">{quote.property?.name ?? text.unlinked}</td>
                <td className="px-2 py-3">{formatCurrency(quote.totalInitialCost, locale)}</td>
                <td className="px-2 py-3">{formatCurrency(quote.monthlyTotalCost, locale)}</td>
                <td className="px-2 py-3">
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    {quoteStatusLabel[quote.status]}
                  </span>
                </td>
                <td className="px-2 py-3 text-slate-500">{formatDate(quote.createdAt, locale)}</td>
                <td className="px-2 py-3">
                  <Link href={`/quotes/${quote.id}`} className="text-sm text-blue-700 hover:underline">
                    {text.detail}
                  </Link>
                </td>
              </tr>
            ))}
            {quotes.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-2 py-8 text-center text-slate-500">
                  {text.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
