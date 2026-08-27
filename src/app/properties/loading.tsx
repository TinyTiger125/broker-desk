import { ListReportShell, PageFrame, PageHeader, StateSurface } from "@/components/layout-system";
import { getLocale } from "@/lib/locale";

const loadingCopy = {
  ja: { pageTitle: "物件", description: "物件を検索し、維持管理ページへ進みます。", searchLabel: "物件を検索", results: "物件一覧", loadingTitle: "物件一覧を読み込んでいます", loadingDescription: "検索条件と物件一覧を準備しています。" },
  zh: { pageTitle: "物件", description: "查找物件并进入维护页面。", searchLabel: "查找物件", results: "物件列表", loadingTitle: "正在读取物件列表", loadingDescription: "正在准备搜索条件和物件列表。" },
  ko: { pageTitle: "매물", description: "매물을 찾아 관리 페이지로 이동합니다.", searchLabel: "매물 검색", results: "매물 목록", loadingTitle: "매물 목록을 불러오는 중입니다", loadingDescription: "검색 조건과 매물 목록을 준비하고 있습니다." },
} as const;

export default async function PropertiesLoading() {
  const locale = await getLocale();
  const copy = loadingCopy[locale];
  return (
    <PageFrame className="space-y-6 pb-12">
      <PageHeader title={copy.pageTitle} description={copy.description} />
      <ListReportShell
        aria-busy="true"
        aria-labelledby="properties-loading-results-heading"
        scope={<h2 id="properties-loading-results-heading" className="m-0 text-lg font-bold text-slate-900">{copy.results}</h2>}
        filters={(
          <section aria-labelledby="properties-loading-filter-heading">
            <h2 id="properties-loading-filter-heading" className="mb-3 text-lg font-bold text-slate-900">{copy.searchLabel}</h2>
            <div aria-hidden="true" className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto_auto_auto]">
              {[0, 1, 2, 3].map((item) => <div key={item} className="min-h-11 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />)}
            </div>
          </section>
        )}
        state={<StateSurface tone="loading" title={copy.loadingTitle} description={copy.loadingDescription} />}
      />
    </PageFrame>
  );
}
