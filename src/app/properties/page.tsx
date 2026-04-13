import Link from "next/link";
import Image from "next/image";
import { createPropertyQuickAction } from "@/app/actions";
import { FormDraftAssist } from "@/components/form-draft-assist";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { formatCurrency } from "@/lib/format";
import { listHubProperties } from "@/lib/hub";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export const dynamic = "force-dynamic";

const propertyCovers = [
  "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=240&q=80",
  "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=240&q=80",
  "https://images.unsplash.com/photo-1545259741-2ea3ebf61fa3?auto=format&fit=crop&w=240&q=80",
  "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=240&q=80",
];

const propertiesCopy = {
  ja: {
    exportReport: "レポート出力",
    newProperty: "新規物件",
    totalPortfolioValue: "ポートフォリオ評価額",
    activeListings: "稼働中物件",
    total: "合計",
    forSale: "販売中",
    leased: "賃貸中",
    occupancyRate: "稼働率",
    pendingContracts: "保留契約",
    activeFlow: "進行中",
    statusAllAssets: "ステータス: 全物件",
    typeAny: "種別: すべて",
    priceRange: "価格帯",
    sortBy: "並び順:",
    lastModified: "最終更新",
    tablePropertyDetail: "物件詳細",
    tableStatus: "ステータス",
    tableValuePrice: "価格 / 評価",
    tablePartiesOwners: "関係者 / 所有者",
    tableUtilization: "稼働情報",
    managed: "管理中",
    archived: "保管",
    mgmt: "管理費",
    coreParty: "主要関係者",
    relatedParty: "関連関係者",
    occupancy: "稼働",
    showingAssets: "表示 1-10 / 全 {{count}} 件",
    portfolioComposition: "ポートフォリオ構成",
    viewDetailedBreakdown: "詳細内訳を見る",
    totalAssets: "総資産",
    commercial: "商業",
    residential: "居住",
    industrial: "産業",
    land: "土地",
    recentPartyEngagement: "最近の関係者動向",
    activity1: "東雲アセット株式会社 が購入申込を提出。",
    activity2: "みなとキャピタル合同会社 が管理契約を承認。",
    activity3: "中央テックソリューションズ を主要テナントとして追加。",
    ago2Hours: "2時間前",
    yesterday: "昨日",
    ago2Days: "2日前",
    viewPartyLedger: "関係者台帳を見る",
    quickNamePlaceholder: "新規物件名",
    emptyList: "該当する物件がありません。新規物件を作成してください。",
    batchExportTitle: "選択出力",
    batchExportDesc: "複数物件を選択してCSV出力できます。",
    batchExportBtn: "選択物件をCSV出力",
  },
  zh: {
    exportReport: "导出报表",
    newProperty: "新建物件",
    totalPortfolioValue: "资产组合价值",
    activeListings: "在管物件",
    total: "总计",
    forSale: "在售",
    leased: "已租",
    occupancyRate: "入住率",
    pendingContracts: "待处理合同",
    activeFlow: "处理中",
    statusAllAssets: "状态: 全部物件",
    typeAny: "类型: 全部",
    priceRange: "价格区间",
    sortBy: "排序:",
    lastModified: "最近更新",
    tablePropertyDetail: "物件详情",
    tableStatus: "状态",
    tableValuePrice: "价格 / 估值",
    tablePartiesOwners: "相关主体 / 业主",
    tableUtilization: "使用情况",
    managed: "管理中",
    archived: "归档",
    mgmt: "管理费",
    coreParty: "核心主体",
    relatedParty: "关联主体",
    occupancy: "入住率",
    showingAssets: "显示 1-10 / 共 {{count}} 条",
    portfolioComposition: "资产组合构成",
    viewDetailedBreakdown: "查看详细构成",
    totalAssets: "总资产",
    commercial: "商业",
    residential: "住宅",
    industrial: "工业",
    land: "土地",
    recentPartyEngagement: "近期主体互动",
    activity1: "东云资产株式会社 已提交报价。",
    activity2: "港湾资本合同会社 已批准管理协议。",
    activity3: "中央科技解决方案 已设为主租户。",
    ago2Hours: "2小时前",
    yesterday: "昨天",
    ago2Days: "2天前",
    viewPartyLedger: "查看主体台账",
    quickNamePlaceholder: "新物件名称",
    emptyList: "暂无符合条件的物件，请先创建新物件。",
    batchExportTitle: "批量导出",
    batchExportDesc: "可选择多个物件并导出CSV。",
    batchExportBtn: "导出选中物件CSV",
  },
  ko: {
    exportReport: "리포트 내보내기",
    newProperty: "신규 매물",
    totalPortfolioValue: "포트폴리오 가치",
    activeListings: "운영 매물",
    total: "합계",
    forSale: "매도",
    leased: "임대",
    occupancyRate: "점유율",
    pendingContracts: "보류 계약",
    activeFlow: "진행 중",
    statusAllAssets: "상태: 전체 매물",
    typeAny: "유형: 전체",
    priceRange: "가격대",
    sortBy: "정렬:",
    lastModified: "최근 수정",
    tablePropertyDetail: "매물 상세",
    tableStatus: "상태",
    tableValuePrice: "가격 / 가치",
    tablePartiesOwners: "관계자 / 소유주",
    tableUtilization: "활용도",
    managed: "관리중",
    archived: "보관",
    mgmt: "관리비",
    coreParty: "핵심 관계자",
    relatedParty: "연계 관계자",
    occupancy: "점유율",
    showingAssets: "1-10 / 전체 {{count}}건 표시",
    portfolioComposition: "포트폴리오 구성",
    viewDetailedBreakdown: "상세 내역 보기",
    totalAssets: "총 자산",
    commercial: "상업",
    residential: "주거",
    industrial: "산업",
    land: "토지",
    recentPartyEngagement: "최근 관계자 활동",
    activity1: "시노노메 자산 주식회사가 매수 제안을 제출했습니다.",
    activity2: "미나토 캐피탈 합동회사가 관리 계약을 승인했습니다.",
    activity3: "중앙 테크 솔루션즈를 주요 임차인으로 등록했습니다.",
    ago2Hours: "2시간 전",
    yesterday: "어제",
    ago2Days: "2일 전",
    viewPartyLedger: "관계자 원장 보기",
    quickNamePlaceholder: "신규 매물명",
    emptyList: "조건에 맞는 매물이 없습니다. 신규 매물을 등록해 주세요.",
    batchExportTitle: "선택 내보내기",
    batchExportDesc: "여러 매물을 선택해 CSV로 내보낼 수 있습니다.",
    batchExportBtn: "선택 매물 CSV 내보내기",
  },
} as const;

type PropertiesPageProps = {
  searchParams?: Promise<{ status?: string; sort?: string; page?: string; flash?: string; focus?: string }>;
};

export default async function PropertiesPage({ searchParams }: PropertiesPageProps) {
  const locale = await getLocale();
  const params = searchParams ? await searchParams : undefined;
  const statusFilter = params?.status === "active" || params?.status === "archived" ? params.status : "all";
  const focusId = String(params?.focus ?? "").trim();
  const sort = params?.sort === "price" ? "price" : "updated";
  const page = Math.max(1, Number(params?.page ?? "1") || 1);
  const copy = propertiesCopy[locale];
  const properties = await listHubProperties(locale);
  const filtered = statusFilter === "all" ? properties : properties.filter((property) => property.status === statusFilter);
  const sortedProperties =
    sort === "price"
      ? [...filtered].sort((a, b) => b.listingPrice - a.listingPrice)
      : [...filtered].sort((a, b) => b.id.localeCompare(a.id));
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(sortedProperties.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedProperties = sortedProperties.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeCount = properties.filter((property) => property.status === "active").length;
  const archivedCount = properties.length - activeCount;
  const totalPortfolioValue = properties.reduce((sum, property) => sum + property.listingPrice, 0);
  const previousPortfolioValue = Math.round(totalPortfolioValue * 0.96);
  const portfolioChangePercent =
    previousPortfolioValue > 0 ? ((totalPortfolioValue - previousPortfolioValue) / previousPortfolioValue) * 100 : 0;
  const averageOccupancy = properties.length > 0 ? Math.max(72, Math.round((activeCount / properties.length) * 100)) : 0;
  const totalAttachments = properties.reduce((sum, property) => sum + property.attachmentCount, 0);
  const flashMap = {
    property_created: {
      ja: "物件を登録しました。",
      zh: "物件已创建。",
      ko: "매물을 등록했습니다.",
    },
  } as const;
  const flashKey = String(params?.flash ?? "").trim() as keyof typeof flashMap;
  const flashMessage = flashMap[flashKey]?.[locale];

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">{t(locale, "properties.title")}</h1>
          <p className="mt-1 text-sm font-medium text-slate-600">{t(locale, "properties.desc")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/api/hub/export?scope=properties&locale=${locale}`}
            className="inline-flex items-center gap-2 rounded-lg bg-[#e9effc] px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-[#dfe8fa]"
          >
            <span className="material-symbols-outlined text-[18px]">file_download</span>
            {copy.exportReport}
          </Link>
          <form id="property-quick-create-form" action={createPropertyQuickAction} className="flex items-center gap-2">
            <input
              name="name"
              placeholder={copy.quickNamePlaceholder}
              className="w-44 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#d5e3fc]"
            />
            <button className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#001e40] to-[#003366] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_-10px_rgba(0,30,64,0.8)] transition hover:opacity-95">
              <span className="material-symbols-outlined text-[18px]">add</span>
              {copy.newProperty}
            </button>
          </form>
          <FormDraftAssist
            formId="property-quick-create-form"
            storageKey="draft:properties:quick-create"
            fieldNames={["name"]}
            reuseKey="properties:quick-create"
            locale={locale}
          />
        </div>
      </section>
      <PageFlashBanner message={flashMessage} />

      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200/35">
        <h2 className="text-base font-bold text-slate-900">{copy.batchExportTitle}</h2>
        <p className="mt-1 text-xs text-slate-500">{copy.batchExportDesc}</p>
        <form action="/api/hub/export" method="get" className="mt-3 space-y-3">
          <input type="hidden" name="scope" value="properties" />
          <input type="hidden" name="locale" value={locale} />
          <div className="max-h-40 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="space-y-2">
              {sortedProperties.slice(0, 40).map((property) => (
                <label key={`export-property-${property.id}`} className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-sm">
                  <input type="checkbox" name="ids" value={property.id} className="h-4 w-4 rounded border-slate-300" />
                  <span className="min-w-0 flex-1 truncate text-slate-800">{property.name}</span>
                  <span className="text-xs tabular-nums text-slate-500">{formatCurrency(property.listingPrice, locale)}</span>
                </label>
              ))}
            </div>
          </div>
          <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            {copy.batchExportBtn}
          </button>
        </form>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <article className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200/30">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{copy.totalPortfolioValue}</p>
            <span className="material-symbols-outlined text-[18px] text-blue-400">account_balance</span>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-bold text-slate-900">{formatCurrency(totalPortfolioValue, locale)}</p>
            <span className={"pb-1 text-xs font-bold " + (portfolioChangePercent >= 0 ? "text-emerald-600" : "text-red-500")}>
              {portfolioChangePercent >= 0 ? "+" : ""}
              {portfolioChangePercent.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-3/4 bg-blue-600" />
          </div>
        </article>

        <article className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200/30">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{copy.activeListings}</p>
            <span className="material-symbols-outlined text-[18px] text-[#d8885c]">sell</span>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-bold text-slate-900">{activeCount}</p>
            <span className="pb-1 text-xs font-semibold text-slate-400">{copy.total}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded bg-[#edf2fd] px-2 py-0.5 text-[10px] font-bold text-slate-700">
              {copy.forSale} {Math.max(0, activeCount - archivedCount)}
            </span>
            <span className="rounded bg-[#edf2fd] px-2 py-0.5 text-[10px] font-bold text-slate-700">
              {copy.leased} {archivedCount}
            </span>
          </div>
        </article>

        <article className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200/30">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{copy.occupancyRate}</p>
            <span className="material-symbols-outlined text-[18px] text-slate-500">analytics</span>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-bold text-slate-900">{averageOccupancy}%</p>
            <span className="pb-1 text-xs font-bold text-slate-500">
              {copy.archived} {archivedCount}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-[#d8885c]" style={{ width: `${averageOccupancy}%` }} />
          </div>
        </article>

        <article className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200/30">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{copy.pendingContracts}</p>
            <span className="material-symbols-outlined text-[18px] text-slate-500">description</span>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-bold text-slate-900">{totalAttachments}</p>
            <span className="pb-1 text-xs font-bold text-blue-600">{copy.activeFlow}</span>
          </div>
          <div className="flex -space-x-2">
            <span className="h-6 w-6 rounded-full border-2 border-white bg-slate-200" />
            <span className="h-6 w-6 rounded-full border-2 border-white bg-slate-300" />
            <span className="h-6 w-6 rounded-full border-2 border-white bg-slate-400" />
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-slate-900 px-1 text-[10px] font-bold text-white">
              +{Math.max(1, totalAttachments)}
            </span>
          </div>
        </article>
      </section>

      <section className="rounded-xl bg-[#edf2fd] p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/properties?status=${statusFilter === "active" ? "all" : "active"}&sort=${sort}`} className="inline-flex min-w-[190px] items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm">
            <span className="material-symbols-outlined text-[16px] text-slate-400">filter_list</span>
            {copy.statusAllAssets}
            <span className="material-symbols-outlined ml-auto text-[16px] text-slate-400">expand_more</span>
          </Link>
          <Link href={`/properties?status=all&sort=${sort}`} className="inline-flex min-w-[160px] items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm">
            <span className="material-symbols-outlined text-[16px] text-slate-400">category</span>
            {copy.typeAny}
            <span className="material-symbols-outlined ml-auto text-[16px] text-slate-400">expand_more</span>
          </Link>
          <Link href={`/properties?status=${statusFilter}&sort=price`} className="inline-flex min-w-[145px] items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm">
            <span className="material-symbols-outlined text-[16px] text-slate-400">payments</span>
            {copy.priceRange}
          </Link>
          <div className="ml-auto flex items-center gap-2 pr-2">
            <span className="text-xs font-bold uppercase text-slate-500">{copy.sortBy}</span>
            <Link href={`/properties?status=${statusFilter}&sort=${sort === "updated" ? "price" : "updated"}`} className="inline-flex items-center gap-1 text-sm font-bold text-slate-800">
              {copy.lastModified}
              <span className="material-symbols-outlined text-[16px] text-slate-500">expand_more</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl bg-[#e6eeff] shadow-sm ring-1 ring-slate-200/30">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse">
            <thead>
              <tr className="bg-[#edf2fd]/80">
                <th className="px-6 py-4 text-left text-[11px] font-black uppercase tracking-widest text-slate-500">{copy.tablePropertyDetail}</th>
                <th className="px-6 py-4 text-left text-[11px] font-black uppercase tracking-widest text-slate-500">{copy.tableStatus}</th>
                <th className="px-6 py-4 text-right text-[11px] font-black uppercase tracking-widest text-slate-500">{copy.tableValuePrice}</th>
                <th className="px-6 py-4 text-left text-[11px] font-black uppercase tracking-widest text-slate-500">{copy.tablePartiesOwners}</th>
                <th className="px-6 py-4 text-left text-[11px] font-black uppercase tracking-widest text-slate-500">{copy.tableUtilization}</th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/40 bg-white">
              {pagedProperties.map((property, index) => (
                <tr
                  key={property.id}
                  className={
                    "transition-colors hover:bg-[#f5f8ff] " +
                    (focusId === property.id ? "ring-2 ring-[#001e40]/15" : "")
                  }
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <Image
                        src={propertyCovers[index % propertyCovers.length]}
                        alt={property.name}
                        width={48}
                        height={48}
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                      <div>
                        <p className="text-sm font-bold text-slate-900">{property.name}</p>
                        <p className="text-[11px] font-medium text-slate-500">{property.area || t(locale, "common.notSet")}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={
                        "rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider " +
                        (property.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")
                      }
                    >
                      {property.status === "active" ? copy.managed : copy.archived}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className="text-sm font-bold tabular-nums text-slate-900">{formatCurrency(property.listingPrice, locale)}</p>
                    <p className="text-[10px] text-slate-400 tabular-nums">
                      {copy.mgmt} {formatCurrency(property.managementFee, locale)}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-100 text-[8px] font-bold text-blue-800">C</span>
                        <span className="text-[11px] font-semibold text-slate-700">{copy.coreParty}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-100 text-[8px] font-bold text-orange-800">L</span>
                        <span className="text-[11px] text-slate-500">{copy.relatedParty}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1.5">
                      <div className="flex w-24 justify-between text-[10px] font-bold">
                        <span className="uppercase text-slate-500">{copy.occupancy}</span>
                        <span className="text-slate-900">{Math.max(70, 96 - index * 3)}%</span>
                      </div>
                      <div className="h-1 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full bg-emerald-500" style={{ width: `${Math.max(70, 96 - index * 3)}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/quotes/new?propertyId=${property.id}`} className="inline-flex rounded p-2 text-slate-400 transition-colors hover:text-slate-700">
                      <span className="material-symbols-outlined">more_vert</span>
                    </Link>
                  </td>
                </tr>
              ))}
              {pagedProperties.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <p className="text-sm text-slate-500">{copy.emptyList}</p>
                    <Link href="/properties" className="mt-3 inline-flex rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      {copy.newProperty}
                    </Link>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200/40 bg-slate-50 px-6 py-4">
          <span className="text-xs font-bold uppercase tabular-nums text-slate-500">
            {copy.showingAssets.replace("{{count}}", String(sortedProperties.length))}
          </span>
          <div className="flex items-center gap-2">
            {currentPage > 1 ? (
              <Link href={`/properties?status=${statusFilter}&sort=${sort}&page=${currentPage - 1}`} className="rounded-md bg-white px-3 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                {currentPage - 1}
              </Link>
            ) : (
              <span className="rounded-md bg-white px-3 py-1.5 text-xs font-bold text-slate-400 ring-1 ring-slate-200">1</span>
            )}
            <span className="rounded-md bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700">{currentPage}</span>
            {currentPage < totalPages ? (
              <Link href={`/properties?status=${statusFilter}&sort=${sort}&page=${currentPage + 1}`} className="rounded-md bg-white px-3 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                {currentPage + 1}
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <article className="xl:col-span-2 rounded-xl bg-[#edf2fd] p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">{copy.portfolioComposition}</h2>
            <Link href="/output-center" className="text-xs font-bold uppercase text-blue-700">
              {copy.viewDetailedBreakdown}
            </Link>
          </div>
          <div className="flex flex-col items-center gap-8 md:flex-row">
            <div className="relative flex h-44 w-44 items-center justify-center rounded-full bg-white">
              <div className="h-32 w-32 rounded-full border-[14px] border-[#001e40] border-r-[#d8885c] border-b-[#edf2fd]" />
              <div className="absolute text-center">
                <p className="text-3xl font-black text-slate-900">{properties.length}</p>
                <p className="text-[10px] font-bold uppercase text-slate-400">{copy.totalAssets}</p>
              </div>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-3">
              <div className="rounded-lg bg-white p-3">
                <p className="text-[10px] font-bold uppercase text-slate-400">{copy.commercial}</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{Math.max(1, Math.ceil(properties.length * 0.54))}</p>
              </div>
              <div className="rounded-lg bg-white p-3">
                <p className="text-[10px] font-bold uppercase text-slate-400">{copy.residential}</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{Math.max(1, Math.ceil(properties.length * 0.31))}</p>
              </div>
              <div className="rounded-lg bg-white p-3">
                <p className="text-[10px] font-bold uppercase text-slate-400">{copy.industrial}</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{Math.max(1, Math.ceil(properties.length * 0.12))}</p>
              </div>
              <div className="rounded-lg bg-white p-3">
                <p className="text-[10px] font-bold uppercase text-slate-400">{copy.land}</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{Math.max(1, Math.ceil(properties.length * 0.03))}</p>
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-xl bg-[#edf2fd] p-6">
          <h2 className="text-lg font-bold text-slate-900">{copy.recentPartyEngagement}</h2>
          <ul className="mt-4 space-y-4">
            <li className="flex gap-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" />
              <div>
                <p className="text-sm font-semibold text-slate-800">{copy.activity1}</p>
                <p className="text-[11px] uppercase text-slate-400">{copy.ago2Hours}</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />
              <div>
                <p className="text-sm font-semibold text-slate-800">{copy.activity2}</p>
                <p className="text-[11px] uppercase text-slate-400">{copy.yesterday}</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-amber-500" />
              <div>
                <p className="text-sm font-semibold text-slate-800">{copy.activity3}</p>
                <p className="text-[11px] uppercase text-slate-400">{copy.ago2Days}</p>
              </div>
            </li>
          </ul>
          <Link
            href="/parties"
            className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            {copy.viewPartyLedger}
          </Link>
        </article>
      </section>
    </div>
  );
}
