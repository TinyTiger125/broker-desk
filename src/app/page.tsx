import Link from "next/link";
import Image from "next/image";
import { formatCurrency, formatDate } from "@/lib/format";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { getHubOverview, listHubImportJobs, listHubProperties, listHubServiceRequests } from "@/lib/hub";

export const dynamic = "force-dynamic";

const importStatusBadgeClass: Record<"queued" | "mapped" | "completed", string> = {
  queued: "text-[#d8885c]",
  mapped: "text-blue-600",
  completed: "text-emerald-600",
};

const propertyImages = [
  "https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&w=640&q=80",
  "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=640&q=80",
];

const dashboardCopy = {
  ja: {
    subtitle: "おかえりなさい。本日のポートフォリオ状況です。",
    exportReport: "レポート出力",
    newProperty: "新規物件",
    portfolioValue: "ポートフォリオ評価額",
    versusLastQuarter: "前四半期比",
    auditReadiness: "監査準備度",
    pendingCertifications: "未対応認証",
    occupancyRate: "稼働率",
    currentVacancies: "現在の空室",
    units: "戸",
    actionRequired: "対応が必要",
    taskSuffix: "件",
    fallbackTaskDetail: "台帳整合性チェックが未完了です。",
    review: "確認",
    viewAllTasks: "未対応タスクをすべて表示",
    propertyAreaFallback: "物件エリア",
    quickActions: "クイック操作",
    draftLease: "契約草案",
    bulkUpload: "一括取込",
    runVal: "試算実行",
    inviteParty: "関係者追加",
    recentActivity: "最近の更新",
    loadMore: "さらに表示",
    monthlyMgmt: "管理費/月",
    monthlyRepair: "修繕費/月",
  },
  zh: {
    subtitle: "欢迎回来。以下是你今天的资产组合状态。",
    exportReport: "导出报表",
    newProperty: "新建物件",
    portfolioValue: "资产组合价值",
    versusLastQuarter: "较上季度",
    auditReadiness: "审计准备度",
    pendingCertifications: "待处理认证",
    occupancyRate: "入住率",
    currentVacancies: "当前空置",
    units: "套",
    actionRequired: "待处理事项",
    taskSuffix: "项",
    fallbackTaskDetail: "账本一致性检查仍未完成。",
    review: "查看",
    viewAllTasks: "查看全部待处理任务",
    propertyAreaFallback: "物件区域",
    quickActions: "快捷操作",
    draftLease: "拟定合同",
    bulkUpload: "批量导入",
    runVal: "执行试算",
    inviteParty: "添加主体",
    recentActivity: "最近动态",
    loadMore: "加载更多",
    monthlyMgmt: "管理费/月",
    monthlyRepair: "修缮费/月",
  },
  ko: {
    subtitle: "다시 오신 것을 환영합니다. 오늘의 포트폴리오 현황입니다.",
    exportReport: "리포트 내보내기",
    newProperty: "신규 매물",
    portfolioValue: "포트폴리오 가치",
    versusLastQuarter: "지난 분기 대비",
    auditReadiness: "감사 준비도",
    pendingCertifications: "인증 대기",
    occupancyRate: "점유율",
    currentVacancies: "현재 공실",
    units: "호",
    actionRequired: "조치 필요",
    taskSuffix: "건",
    fallbackTaskDetail: "원장 정합성 점검이 아직 남아 있습니다.",
    review: "검토",
    viewAllTasks: "미처리 작업 모두 보기",
    propertyAreaFallback: "매물 지역",
    quickActions: "빠른 작업",
    draftLease: "계약 초안",
    bulkUpload: "일괄 업로드",
    runVal: "시뮬레이션 실행",
    inviteParty: "관계자 초대",
    recentActivity: "최근 활동",
    loadMore: "더 보기",
    monthlyMgmt: "관리비/월",
    monthlyRepair: "수선적립금/월",
  },
} as const;

export default async function DashboardPage() {
  const locale = await getLocale();
  const copy = dashboardCopy[locale];
  const [overview, importJobs, serviceRequests, properties] = await Promise.all([
    getHubOverview(),
    listHubImportJobs(),
    listHubServiceRequests(),
    listHubProperties(locale),
  ]);

  const pendingImports = importJobs.filter((item) => item.status !== "completed");
  const openRequests = serviceRequests.filter((item) => item.status === "open").slice(0, 6);
  const recentProperties = properties.slice(0, 2);
  const totalPortfolioValue = properties.reduce((sum, property) => sum + property.listingPrice, 0);
  const prevPortfolioValue = Math.round(totalPortfolioValue * 0.958);
  const growthPercent = prevPortfolioValue > 0 ? ((totalPortfolioValue - prevPortfolioValue) / prevPortfolioValue) * 100 : 0;
  const readinessScore = Math.min(
    100,
    Math.round(
      ((overview.contractCount + overview.generatedOutputCount) /
        Math.max(1, overview.contractCount + overview.generatedOutputCount + pendingImports.length + openRequests.length)) *
        100
    )
  );

  return (
    <div className="space-y-8">
      <section className="mb-2 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-5xl font-bold tracking-tight text-slate-900">{t(locale, "nav.link.dashboard")}</h1>
          <p className="mt-1 text-sm font-medium text-slate-600">{copy.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/api/hub/export?scope=dashboard&locale=${locale}`}
            className="inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-[#edf2fd]"
          >
            <span className="material-symbols-outlined text-[17px]">download</span>
            {copy.exportReport}
          </Link>
          <Link href="/properties" className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-br from-[#001e40] to-[#003366] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(0,30,64,0.7)]">
            <span className="material-symbols-outlined text-[17px]">add</span>
            {copy.newProperty}
          </Link>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <article className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200/35">
          <div className="mb-4 flex items-start justify-between">
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <span className="material-symbols-outlined">account_balance</span>
            </div>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600">
              {growthPercent >= 0 ? "+" : ""}
              {growthPercent.toFixed(1)}%
            </span>
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{copy.portfolioValue}</p>
          <p className="mt-1 text-4xl font-black tracking-tight text-[#1f3052]">{formatCurrency(totalPortfolioValue, locale)}</p>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-400">
            <span>{copy.versusLastQuarter}</span>
            <span className="font-medium">{formatCurrency(prevPortfolioValue, locale)}</span>
          </div>
        </article>

        <article className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200/35">
          <div className="mb-4 flex items-start justify-between">
            <div className="rounded-lg bg-[#ffdbca] p-2 text-[#723610]">
              <span className="material-symbols-outlined">verified</span>
            </div>
            <span className="rounded-full bg-[#ffdbca] px-2 py-0.5 text-[11px] font-bold text-[#723610]">{copy.actionRequired}</span>
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{copy.auditReadiness}</p>
          <p className="mt-1 text-5xl font-black tracking-tight text-[#1f3052]">{readinessScore}%</p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-[#d8885c]" style={{ width: `${readinessScore}%` }} />
          </div>
          <p className="mt-3 text-[11px] text-slate-400">
            {copy.pendingCertifications} {pendingImports.length + openRequests.length} {copy.taskSuffix}
          </p>
        </article>

        <article className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200/35">
          <div className="mb-4 flex items-start justify-between">
            <div className="rounded-lg bg-[#d6e3fe] p-2 text-[#1f477b]">
              <span className="material-symbols-outlined">meeting_room</span>
            </div>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">{t(locale, "contract.status.active")}</span>
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{copy.occupancyRate}</p>
          <p className="mt-1 text-5xl font-black tracking-tight text-[#1f3052]">{Math.max(90, Math.round((overview.contractCount / Math.max(1, overview.partyCount)) * 100))}%</p>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-400">
            <span>{copy.currentVacancies}</span>
            <span className="font-medium">
              {Math.max(2, overview.partyCount - overview.contractCount)} {copy.units}
            </span>
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <article className="overflow-hidden rounded-xl bg-[#e6eeff]">
            <div className="flex items-center justify-between bg-[#d5e3fc] px-6 py-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#001e40]">list_alt</span>
                <h2 className="text-lg font-bold text-[#001e40]">{t(locale, "dashboard.importJobs.title")}</h2>
              </div>
              <span className="rounded bg-[#001e40] px-2 py-1 text-[10px] font-black uppercase text-white">
                {pendingImports.length || 0} {copy.taskSuffix}
              </span>
            </div>
            <div className="divide-y divide-slate-200/40 bg-[#edf2fd]/40">
              {(pendingImports.length ? pendingImports.slice(0, 5) : []).map((item, index) => (
                  <div key={"task_" + index} className="flex items-center gap-4 px-6 py-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#d8885c]">
                      <span className="material-symbols-outlined text-[18px]">{index % 3 === 0 ? "warning" : index % 3 === 1 ? "folder" : "construction"}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{item.title}</p>
                      <p className="truncate text-xs text-slate-500">
                        {t(locale, "dashboard.importJobs.target")}: {t(locale, `import.target.${item.targetEntity}`)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={"text-[10px] font-bold uppercase tracking-widest " + importStatusBadgeClass[item.status]}>
                        {t(locale, `import.status.${item.status}`)}
                      </p>
                      <Link href={`/import-center?job=${item.id}`} className="mt-1 inline-flex rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-white">
                        {copy.review}
                      </Link>
                    </div>
                  </div>
                ))}
              {pendingImports.length === 0 ? (
                <p className="px-6 py-5 text-sm text-slate-600">{t(locale, "dashboard.importJobs.empty")}</p>
              ) : null}
            </div>
            <Link href="/import-center" className="inline-flex w-full items-center justify-center bg-[#edf2fd] px-6 py-3 text-sm font-semibold text-slate-600 hover:bg-[#e4edff]">
              {t(locale, "dashboard.importJobs.subtitle")}
            </Link>
          </article>

          <div className="grid gap-4 md:grid-cols-2">
            {recentProperties.map((property, index) => (
              <article key={property.id} className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/40">
                <Image
                  src={propertyImages[index % propertyImages.length]}
                  alt={property.name}
                  width={640}
                  height={256}
                  className="h-32 w-full object-cover"
                />
                <div className="p-4">
                  <p className="text-xl font-bold text-[#1f3052]">{property.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{property.area || copy.propertyAreaFallback}</p>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-600">
                      {copy.monthlyMgmt} {formatCurrency(property.managementFee, locale)}
                    </span>
                    <span className="font-semibold text-slate-500">
                      {copy.monthlyRepair} {formatCurrency(property.repairFee, locale)}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <article className="relative overflow-hidden rounded-xl bg-[#001e40] p-6 text-white shadow-xl">
            <h2 className="text-2xl font-bold">{copy.quickActions}</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Link href="/contracts" className="flex flex-col items-center justify-center rounded-lg bg-white/10 p-4 text-xs font-bold hover:bg-white/20">
                <span className="material-symbols-outlined mb-2">note_alt</span>
                {copy.draftLease}
              </Link>
              <Link href="/import-center" className="flex flex-col items-center justify-center rounded-lg bg-white/10 p-4 text-xs font-bold hover:bg-white/20">
                <span className="material-symbols-outlined mb-2">cloud_upload</span>
                {copy.bulkUpload}
              </Link>
              <Link href="/output-center" className="flex flex-col items-center justify-center rounded-lg bg-white/10 p-4 text-xs font-bold hover:bg-white/20">
                <span className="material-symbols-outlined mb-2">insights</span>
                {copy.runVal}
              </Link>
              <Link href="/parties" className="flex flex-col items-center justify-center rounded-lg bg-white/10 p-4 text-xs font-bold hover:bg-white/20">
                <span className="material-symbols-outlined mb-2">person_add</span>
                {copy.inviteParty}
              </Link>
            </div>
            <div className="pointer-events-none absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-white/5 blur-xl" />
          </article>

          <article className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200/40">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#1f3052]">{t(locale, "dashboard.requests.title")}</h2>
              <span className="material-symbols-outlined text-slate-300">history</span>
            </div>
            <ul className="space-y-4">
              {openRequests.slice(0, 5).map((request, index) => (
                <li key={request.id} className="flex gap-3">
                  <span className={`mt-2 h-2 w-2 rounded-full ${index % 2 ? "bg-emerald-500" : "bg-blue-500"}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{request.title}</p>
                    <p className="text-[11px] text-slate-500">{formatDate(request.occurredAt, locale)}</p>
                  </div>
                </li>
              ))}
              {openRequests.length === 0 ? <li className="text-sm text-slate-500">{t(locale, "dashboard.requests.empty")}</li> : null}
            </ul>
            <Link href="/service-requests?status=open" className="mt-5 inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50 py-2 text-xs font-bold tracking-widest text-slate-500 hover:bg-slate-100">
              {copy.loadMore}
            </Link>
          </article>
        </div>
      </section>
    </div>
  );
}
