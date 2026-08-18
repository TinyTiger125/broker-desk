import Link from "next/link";
import { listBrokerageCases } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { listHubImportJobs, type HubImportJobItem } from "@/lib/hub";
import { getLocale, type Locale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";
import { localizeDemoBrokerageCase } from "@/lib/demo-localization";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams?: Promise<{ q?: string }>;
};

type WorkItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  date?: Date;
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
  pendingTitle: string;
  pendingDesc: string;
  noPending: string;
  open: string;
  cases: string;
  sourceFiles: string;
  status: string;
  created: string;
  goToOrganize: string;
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
    pendingTitle: "対応が必要な項目",
    pendingDesc: "保存されている処理状態から、次に開く項目だけを表示します。",
    noPending: "今すぐ対応が必要な項目はありません。",
    open: "開く",
    cases: "案件",
    sourceFiles: "資料",
    status: "状態",
    created: "作成",
    goToOrganize: "情報整理を開く",
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
    pendingTitle: "需要处理的项目",
    pendingDesc: "依据已保存的处理状态，显示下一步可直接打开的项目。",
    noPending: "当前没有需要立即处理的项目。",
    open: "打开",
    cases: "案件",
    sourceFiles: "资料",
    status: "状态",
    created: "创建",
    goToOrganize: "进入整理信息",
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
    pendingTitle: "처리가 필요한 항목",
    pendingDesc: "저장된 처리 상태를 기준으로 바로 열 수 있는 항목만 표시합니다.",
    noPending: "지금 바로 처리할 항목이 없습니다.",
    open: "열기",
    cases: "안건",
    sourceFiles: "자료",
    status: "상태",
    created: "생성",
    goToOrganize: "정보 정리 열기",
  },
};

function sourceStatusLabel(locale: Locale, item: HubImportJobItem) {
  if (item.status === "queued") return locale === "zh" ? "排队中" : locale === "ko" ? "대기 중" : "待機中";
  if (item.status === "processing") return locale === "zh" ? "处理中" : locale === "ko" ? "처리 중" : "処理中";
  if (item.status === "failed") return locale === "zh" ? "处理失败" : locale === "ko" ? "처리 실패" : "処理失敗";
  return item.status;
}

function caseStatusLabel(locale: Locale, status: string) {
  if (status === "reviewed") return locale === "zh" ? "已检查" : locale === "ko" ? "검토 완료" : "確認済み";
  if (status === "draft") return locale === "zh" ? "草稿" : locale === "ko" ? "초안" : "下書き";
  return status;
}

function getImportPayloadKind(item: HubImportJobItem) {
  if (!item.notes) return undefined;
  try {
    const firstLine = item.notes.trim().split(/\r?\n/, 1)[0] || item.notes;
    const payload = JSON.parse(firstLine) as { kind?: string };
    return payload.kind;
  } catch {
    return undefined;
  }
}

function sourceJobHref(item: HubImportJobItem, cases: Array<{ id: string; sourceImportJobIds: string[] }>) {
  const id = encodeURIComponent(item.id);
  const kind = getImportPayloadKind(item);
  const isInputFileExtraction = kind === "input_file_extraction" || kind === "identity_import_source";
  const isBatchMapping = item.sourceType === "excel" && !isInputFileExtraction && item.status !== "queued" && item.status !== "processing";
  if (kind === "property_row_import" || isInputFileExtraction) return `/import-center?xlsxJob=${id}#source-upload`;
  if (item.sourceType === "excel" && (item.status === "queued" || item.status === "processing" || item.status === "failed")) {
    return `/import-center?xlsxJob=${id}#source-upload`;
  }
  if (isBatchMapping) return `/import-center?job=${id}&advanced=1#job-mapping`;
  const linkedCase = cases.find((itemCase) => itemCase.sourceImportJobIds.includes(item.id));
  if (linkedCase) return `/cases/${encodeURIComponent(linkedCase.id)}#case-main-editor`;
  return `/import-center?job=${id}#source-review-summary`;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const [params, locale, session] = await Promise.all([
    searchParams ? searchParams : Promise.resolve(undefined),
    getLocale(),
    requireTenantSession({ permission: "tenant.read" }),
  ]);
  const copy = copyByLocale[locale];
  const searchQuery = params?.q?.trim() ?? "";
  const context = { userId: session.user.id, tenantId: session.tenant.id };
  const [rawCases, importJobs] = await Promise.all([
    listBrokerageCases(session.user.id, 50, session.tenant.id),
    listHubImportJobs(context, locale),
  ]);
  const cases = rawCases.map((item) => localizeDemoBrokerageCase(locale, item));
  const pendingCases: WorkItem[] = cases
    .filter((item) => item.status !== "reviewed")
    .map((item) => ({
      id: `case:${item.id}`,
      title: item.caseTitle,
      detail: `${copy.cases} · ${copy.status}: ${caseStatusLabel(locale, item.status)}`,
      href: `/cases/${item.id}`,
      date: item.updatedAt,
    }));
  const pendingSources: WorkItem[] = importJobs
    .filter((item) => item.status !== "completed")
    .map((item) => ({
      id: `source:${item.id}`,
      title: item.title,
      detail: `${copy.sourceFiles} · ${copy.status}: ${sourceStatusLabel(locale, item)}`,
      href: sourceJobHref(item, cases),
      date: item.createdAt,
    }));
  const pendingItems = [...pendingCases, ...pendingSources]
    .filter((item) => !searchQuery || `${item.title} ${item.detail}`.toLocaleLowerCase().includes(searchQuery.toLocaleLowerCase()))
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    .slice(0, 8);

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
            <h2 className="text-lg font-black text-slate-950">{copy.pendingTitle}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">{copy.pendingDesc}</p>
          </div>
          <Link href="/organize-center" className="text-sm font-black text-[#002FA7] hover:underline">{copy.goToOrganize}</Link>
        </div>
        {pendingItems.length > 0 ? (
          <ul className="mt-4 divide-y divide-slate-100">
            {pendingItems.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{item.detail}{item.date ? ` · ${formatDate(item.date, locale)}` : ""}</p>
                </div>
                <Link href={item.href} className="shrink-0 text-sm font-black text-[#002FA7] hover:underline">{copy.open}</Link>
              </li>
            ))}
          </ul>
        ) : <p className="mt-4 rounded-md bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">{copy.noPending}</p>}
      </section>
    </main>
  );
}
