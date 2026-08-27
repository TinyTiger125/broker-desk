import { ListReportShell, PageFrame, PageHeader, StateSurface } from "@/components/layout-system";
import { getLocale } from "@/lib/locale";

const loadingCopy = {
  ja: {
    pageTitle: "関係者",
    description: "関係者を検索し、連絡先・役割・状態を確認します。",
    results: "関係者一覧",
    loadingTitle: "関係者を読み込んでいます",
    loadingDescription: "検索条件と関係者一覧を準備しています。",
  },
  zh: {
    pageTitle: "相关主体",
    description: "搜索相关主体，查看联系方式、角色和状态。",
    results: "主体列表",
    loadingTitle: "正在加载相关主体",
    loadingDescription: "正在准备搜索条件和主体列表。",
  },
  ko: {
    pageTitle: "관계자",
    description: "관계자를 검색하고 연락처, 역할, 상태를 확인합니다.",
    results: "관계자 목록",
    loadingTitle: "관계자를 불러오는 중입니다",
    loadingDescription: "검색 조건과 관계자 목록을 준비하고 있습니다.",
  },
} as const;

export default async function PartiesLoading() {
  const locale = await getLocale();
  const copy = loadingCopy[locale];

  return (
    <PageFrame className="space-y-6 pb-12">
      <PageHeader title={copy.pageTitle} description={copy.description} />
      <ListReportShell
        aria-busy="true"
        aria-label={copy.pageTitle}
        scope={<h2 className="m-0 text-lg font-bold text-slate-900">{copy.results}</h2>}
        filters={(
          <div className="space-y-3">
            <div className="h-5 w-24 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
            <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto_auto_auto]">
              {[0, 1, 2, 3].map((item) => <div key={item} className="min-h-11 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />)}
            </div>
          </div>
        )}
        results={(
          <div aria-hidden="true" className="divide-y divide-slate-200/80">
            {[0, 1, 2].map((item) => (
              <div key={item} className="grid gap-3 px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
                <div className="min-h-11 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
                <div className="min-h-11 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
                <div className="min-h-11 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
                <div className="min-h-11 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
                <div className="min-h-11 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
                <div className="min-h-11 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
              </div>
            ))}
          </div>
        )}
        state={<StateSurface tone="loading" title={copy.loadingTitle} description={copy.loadingDescription} />}
      />
    </PageFrame>
  );
}
