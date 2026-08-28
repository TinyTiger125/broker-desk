import Link from "next/link";
import { listBrokerageCasesForContext } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { listHubImportJobs } from "@/lib/hub";
import { buildHomeResumableWork } from "@/lib/home-resumable-work";
import { getLocale, type Locale } from "@/lib/locale";
import { getHomeTenantSelectionRecoveryPath } from "@/lib/tenant-recovery";
import { requireTenantSession, TenantSessionError } from "@/lib/tenant-session";
import { redirect } from "next/navigation";
import { createRequestContext } from "@/lib/visibility-resolver";
import { localizeDemoBrokerageCase } from "@/lib/demo-localization";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams?: Promise<{ q?: string }>;
};

const copyByLocale: Record<Locale, {
  title: string;
  subtitle: string;
  tenant: string;
  searchPlaceholder: string;
  search: string;
  clear: string;
  intakeTitle: string;
  intakeDesc: string;
  organizeTitle: string;
  organizeDesc: string;
  resumableTitle: string;
  resumableDesc: string;
  noResumable: string;
  open: string;
  continueItem: string;
}> = {
  ja: {
    title: "ホーム",
    subtitle: "今日の作業を選び、詳細は各ページで進めます。",
    tenant: "ワークスペース",
    searchPlaceholder: "案件、資料を検索",
    search: "検索",
    clear: "クリア",
    intakeTitle: "資料を読み込む",
    intakeDesc: "画像、PDF、Excelなどの資料を読み取り、現在の案件整理へ進みます。",
    organizeTitle: "情報を整理する",
    organizeDesc: "確認が必要な項目だけを開き、対象と内容を整理します。",
    resumableTitle: "最近の未完了項目",
    resumableDesc: "保存済みで再開できる案件と資料を、更新順に表示します。",
    noResumable: "再開できる未完了項目はありません。",
    open: "開く",
    continueItem: "続ける",
  },
  zh: {
    title: "工作台",
    subtitle: "选择今天要开始的工作，具体处理在对应页面完成。",
    tenant: "当前工作区",
    searchPlaceholder: "搜索案件、资料",
    search: "搜索",
    clear: "清除",
    intakeTitle: "录入资料",
    intakeDesc: "读取图片、PDF、Excel 等资料，并进入当前案件整理流程。",
    organizeTitle: "整理信息",
    organizeDesc: "只打开需要处理的项目，确认归属并整理信息。",
    resumableTitle: "最近未完成项目",
    resumableDesc: "按更新时间显示已保存且可以继续的案件和资料。",
    noResumable: "当前没有可以继续的未完成项目。",
    open: "打开",
    continueItem: "继续",
  },
  ko: {
    title: "홈",
    subtitle: "오늘 시작할 작업을 고르고, 상세 처리는 각 페이지에서 진행합니다.",
    tenant: "현재 워크스페이스",
    searchPlaceholder: "안건, 자료 검색",
    search: "검색",
    clear: "지우기",
    intakeTitle: "자료 입력",
    intakeDesc: "이미지, PDF, Excel 자료를 읽고 현재 안건 정리로 이동합니다.",
    organizeTitle: "정보 정리",
    organizeDesc: "처리가 필요한 항목만 열어 대상과 내용을 정리합니다.",
    resumableTitle: "최근 미완료 항목",
    resumableDesc: "저장되어 다시 시작할 수 있는 안건과 자료를 업데이트 순으로 표시합니다.",
    noResumable: "계속할 수 있는 미완료 항목이 없습니다.",
    open: "열기",
    continueItem: "계속",
  },
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const [params, locale] = await Promise.all([
    searchParams ? searchParams : Promise.resolve(undefined),
    getLocale(),
  ]);
  let session;
  try {
    session = await requireTenantSession({ permission: "tenant.read" });
  } catch (error) {
    if (error instanceof TenantSessionError) {
      const recoveryPath = getHomeTenantSelectionRecoveryPath(error.code);
      if (recoveryPath) redirect(recoveryPath);
    }
    throw error;
  }
  const copy = copyByLocale[locale];
  const searchQuery = params?.q?.trim() ?? "";
  const requestContext = createRequestContext(session);
  const [visibleCases, importJobs] = await Promise.all([
    listBrokerageCasesForContext({ context: requestContext, limit: 50 }),
    listHubImportJobs({ userId: session.user.id, tenantId: session.tenant.id }, locale),
  ]);
  const cases = visibleCases.flatMap((entry) => {
    if (!entry.brokerageCase) return [];
    const item = localizeDemoBrokerageCase(locale, entry.brokerageCase);
    return [{ id: item.id, title: item.caseTitle, status: item.status, updatedAt: item.updatedAt, sourceImportJobIds: item.sourceImportJobIds }];
  });
  const resumableItems = buildHomeResumableWork({ locale, query: searchQuery, cases, importJobs });

  return (
    <main className="bd-page bd-home-page space-y-6">
      <header className="bd-page-header px-6 py-6 sm:px-8">
        <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] 2xl:items-end">
          <div className="min-w-0">
            <p className="text-xs font-black text-[#002FA7]">{copy.tenant}: {session.tenant.name}</p>
            <h1 className="mt-2 text-3xl font-black leading-tight tracking-normal text-slate-950 sm:text-4xl">{copy.title}</h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">{copy.subtitle}</p>
          </div>
          <form action="/" className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="sr-only" htmlFor="home-search">{copy.search}</label>
            <input id="home-search" name="q" defaultValue={searchQuery} placeholder={copy.searchPlaceholder} className="h-11 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-[#002FA7] focus:ring-2 focus:ring-blue-100" />
            <button className="h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 hover:border-[#002FA7] hover:text-[#002FA7]" type="submit">{copy.search}</button>
            {searchQuery ? <Link href="/" className="flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 sm:col-span-2">{copy.clear}</Link> : null}
          </form>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2" aria-label={copy.title}>
        <Link href="/import-center" className="bd-action-card bd-action-card-primary group">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-white/10"><span aria-hidden="true" className="material-symbols-outlined text-[22px]">upload_file</span></span>
          <h2 className="mt-5 text-2xl font-black leading-tight">{copy.intakeTitle}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-white/75">{copy.intakeDesc}</p>
          <span className="mt-5 inline-flex text-sm font-black">{copy.open} <span aria-hidden="true" className="material-symbols-outlined ml-1 text-[18px]">arrow_forward</span></span>
        </Link>
        <Link href="/organize-center" className="bd-action-card border-amber-200 bg-[#fffaf0] text-slate-950 hover:border-amber-400 hover:bg-[#fff6df] group">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-white text-amber-700"><span aria-hidden="true" className="material-symbols-outlined text-[22px]">fact_check</span></span>
          <h2 className="mt-5 text-2xl font-black leading-tight">{copy.organizeTitle}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{copy.organizeDesc}</p>
          <span className="mt-5 inline-flex text-sm font-black text-amber-800">{copy.open} <span aria-hidden="true" className="material-symbols-outlined ml-1 text-[18px]">arrow_forward</span></span>
        </Link>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">{copy.resumableTitle}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">{copy.resumableDesc}</p>
          </div>
        </div>
        {resumableItems.length > 0 ? (
          <ul className="mt-4 divide-y divide-slate-100">
            {resumableItems.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{item.reason} · {formatDate(item.updatedAt, locale)}</p>
                </div>
                <Link href={item.href} className="inline-flex min-h-11 shrink-0 items-center text-sm font-black text-[#002FA7] hover:underline">{copy.continueItem}</Link>
              </li>
            ))}
          </ul>
        ) : <p className="mt-4 rounded-md bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">{copy.noResumable}</p>}
      </section>
    </main>
  );
}
