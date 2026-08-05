import Link from "next/link";
import Image from "next/image";
import { createPropertyQuickAction } from "@/app/actions";
import { FormDraftAssist } from "@/components/form-draft-assist";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { formatCurrency } from "@/lib/format";
import { listHubProperties } from "@/lib/hub";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

const propertyCovers = [
  "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=240&q=80",
  "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=240&q=80",
  "https://images.unsplash.com/photo-1545259741-2ea3ebf61fa3?auto=format&fit=crop&w=240&q=80",
  "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=240&q=80",
];

const propertiesCopy = {
  ja: {
    exportReport: "台帳CSV出力",
    newProperty: "新規物件",
    totalPortfolioValue: "台帳価格合計",
    activeListings: "出力可能物件",
    total: "合計",
    forSale: "販売中",
    leased: "保管",
    occupancyRate: "資料充足度",
    pendingContracts: "添付資料",
    activeFlow: "登録済",
    statusAllAssets: "ステータス: 全物件",
    typeAny: "種別: すべて",
    priceRange: "価格帯",
    sortBy: "並び順:",
    lastModified: "最終更新",
    tablePropertyDetail: "物件詳細",
    tableStatus: "ステータス",
    tableValuePrice: "価格 / 費用",
    tablePartiesOwners: "関係者 / 主体",
    tableUtilization: "出力準備",
    managed: "有効",
    archived: "保管",
    mgmt: "管理費",
    coreParty: "主要関係者",
    relatedParty: "関連関係者",
    occupancy: "準備度",
    showingAssets: "表示 1-10 / 全 {{count}} 件",
    portfolioComposition: "台帳データ構成",
    viewDetailedBreakdown: "申込書出力へ進む",
    totalAssets: "物件",
    commercial: "価格あり",
    residential: "エリアあり",
    industrial: "費用あり",
    land: "備考あり",
    recentPartyEngagement: "次の出力準備",
    activity1: "Excel資料の読取後は価格・所在地・管理費を確認します。",
    activity2: "必要に応じて関係者台帳で売主・買主候補を補完します。",
    activity3: "申込書出力で保証会社を選択し、提出前に確認します。",
    ago2Hours: "2時間前",
    yesterday: "昨日",
    ago2Days: "2日前",
    viewPartyLedger: "関係者台帳を見る",
    quickNamePlaceholder: "新規物件名",
    emptyList: "該当する物件がありません。新規物件を作成してください。",
    batchExportTitle: "台帳データ確認",
    batchExportDesc: "Excel資料から保存した物件を選択してCSVで確認できます。",
    batchExportBtn: "選択物件をCSV出力",
    batchTools: "一括操作",
    batchHint: "選択した物件だけCSV出力します。",
    propertyProfile: "物件ファイル",
    requiredInfo: "必須情報",
    outputCheck: "出力前確認",
    relationTree: "関係を確認",
    missingItems: "不足",
    complete: "完了",
    insufficient: "資料不足",
    fieldName: "物件名",
    fieldArea: "所在地・エリア",
    fieldPrice: "価格",
    fieldManagementFee: "管理費",
    fieldRepairFee: "修繕積立金",
    openProfile: "物件を整理",
  },
  zh: {
    exportReport: "导出台账CSV",
    newProperty: "新建物件",
    totalPortfolioValue: "台账价格合计",
    activeListings: "可输出物件",
    total: "总计",
    forSale: "在售",
    leased: "归档",
    occupancyRate: "资料完整度",
    pendingContracts: "附件资料",
    activeFlow: "已登记",
    statusAllAssets: "状态: 全部物件",
    typeAny: "类型: 全部",
    priceRange: "价格区间",
    sortBy: "排序:",
    lastModified: "最近更新",
    tablePropertyDetail: "物件详情",
    tableStatus: "状态",
    tableValuePrice: "价格 / 费用",
    tablePartiesOwners: "相关主体",
    tableUtilization: "输出准备",
    managed: "有效",
    archived: "归档",
    mgmt: "管理费",
    coreParty: "核心主体",
    relatedParty: "关联主体",
    occupancy: "准备度",
    showingAssets: "显示 1-10 / 共 {{count}} 条",
    portfolioComposition: "台账数据构成",
    viewDetailedBreakdown: "进入 PDF 输出",
    totalAssets: "物件",
    commercial: "有价格",
    residential: "有区域",
    industrial: "有费用",
    land: "有备注",
    recentPartyEngagement: "下一步输出准备",
    activity1: "Excel 导入后先确认价格、地址和管理费。",
    activity2: "必要时在主体台账补齐卖方、买方候选。",
    activity3: "在 PDF 输出中心选择模板并确认预览。",
    ago2Hours: "2小时前",
    yesterday: "昨天",
    ago2Days: "2天前",
    viewPartyLedger: "查看主体台账",
    quickNamePlaceholder: "新物件名称",
    emptyList: "暂无符合条件的物件，请先创建新物件。",
    batchExportTitle: "台账数据确认",
    batchExportDesc: "选择 Excel 导入后的物件并导出 CSV 核对。",
    batchExportBtn: "导出选中物件CSV",
    batchTools: "批量工具",
    batchHint: "只对勾选的物件执行 CSV 导出。",
    propertyProfile: "物件档案",
    requiredInfo: "必填信息",
    outputCheck: "输出前检查",
    relationTree: "查看关系",
    missingItems: "缺少",
    complete: "已完成",
    insufficient: "资料不足",
    fieldName: "物件名",
    fieldArea: "所在地 / 区域",
    fieldPrice: "价格",
    fieldManagementFee: "管理费",
    fieldRepairFee: "修缮基金",
    openProfile: "整理物件",
  },
  ko: {
    exportReport: "대장 CSV 내보내기",
    newProperty: "신규 매물",
    totalPortfolioValue: "대장 가격 합계",
    activeListings: "출력 가능 매물",
    total: "합계",
    forSale: "매도",
    leased: "보관",
    occupancyRate: "자료 완성도",
    pendingContracts: "첨부 자료",
    activeFlow: "등록됨",
    statusAllAssets: "상태: 전체 매물",
    typeAny: "유형: 전체",
    priceRange: "가격대",
    sortBy: "정렬:",
    lastModified: "최근 수정",
    tablePropertyDetail: "매물 상세",
    tableStatus: "상태",
    tableValuePrice: "가격 / 비용",
    tablePartiesOwners: "관계자",
    tableUtilization: "출력 준비",
    managed: "유효",
    archived: "보관",
    mgmt: "관리비",
    coreParty: "핵심 관계자",
    relatedParty: "연계 관계자",
    occupancy: "준비도",
    showingAssets: "1-10 / 전체 {{count}}건 표시",
    portfolioComposition: "대장 데이터 구성",
    viewDetailedBreakdown: "PDF 출력으로 이동",
    totalAssets: "매물",
    commercial: "가격 있음",
    residential: "지역 있음",
    industrial: "비용 있음",
    land: "비고 있음",
    recentPartyEngagement: "다음 출력 준비",
    activity1: "Excel 자료를 읽은 뒤 가격, 소재지, 관리비를 확인합니다.",
    activity2: "필요 시 관계자 대장에서 매도인, 매수 후보를 보완합니다.",
    activity3: "PDF 출력 센터에서 템플릿을 선택하고 미리보기를 확인합니다.",
    ago2Hours: "2시간 전",
    yesterday: "어제",
    ago2Days: "2일 전",
    viewPartyLedger: "관계자 원장 보기",
    quickNamePlaceholder: "신규 매물명",
    emptyList: "조건에 맞는 매물이 없습니다. 신규 매물을 등록해 주세요.",
    batchExportTitle: "대장 데이터 확인",
    batchExportDesc: "Excel에서 가져온 매물을 선택해 CSV로 확인할 수 있습니다.",
    batchExportBtn: "선택 매물 CSV 내보내기",
    batchTools: "일괄 작업",
    batchHint: "선택한 매물만 CSV로 내보냅니다.",
    propertyProfile: "매물 파일",
    requiredInfo: "필수 정보",
    outputCheck: "출력 전 확인",
    relationTree: "관계 확인",
    missingItems: "부족",
    complete: "완료",
    insufficient: "자료 부족",
    fieldName: "매물명",
    fieldArea: "소재지 / 지역",
    fieldPrice: "가격",
    fieldManagementFee: "관리비",
    fieldRepairFee: "수선 적립금",
    openProfile: "매물 정리",
  },
} as const;

type PropertiesPageProps = {
  searchParams?: Promise<{ status?: string; sort?: string; page?: string; flash?: string; focus?: string }>;
};

export default async function PropertiesPage({ searchParams }: PropertiesPageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.read" }),
  ]);
  const params = searchParams ? await searchParams : undefined;
  const statusFilter = params?.status === "active" || params?.status === "archived" ? params.status : "all";
  const focusId = String(params?.focus ?? "").trim();
  const sort = params?.sort === "price" ? "price" : "updated";
  const page = Math.max(1, Number(params?.page ?? "1") || 1);
  const copy = propertiesCopy[locale];
  const properties = await listHubProperties(locale, { userId: session.user.id, tenantId: session.tenant.id });
  const filtered = statusFilter === "all" ? properties : properties.filter((property) => property.status === statusFilter);
  const sortedProperties =
    sort === "price"
      ? [...filtered].sort((a, b) => b.listingPrice - a.listingPrice)
      : [...filtered].sort((a, b) => b.id.localeCompare(a.id));
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(sortedProperties.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedProperties = sortedProperties.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedProperty = sortedProperties.find((property) => property.id === focusId) ?? pagedProperties[0] ?? properties[0];
  const selectedRequiredFields = selectedProperty
    ? [
        { label: copy.fieldName, value: selectedProperty.name },
        { label: copy.fieldArea, value: selectedProperty.area },
        { label: copy.fieldPrice, value: selectedProperty.listingPrice > 0 ? formatCurrency(selectedProperty.listingPrice, locale) : "" },
        { label: copy.fieldManagementFee, value: selectedProperty.managementFee > 0 ? formatCurrency(selectedProperty.managementFee, locale) : "" },
        { label: copy.fieldRepairFee, value: selectedProperty.repairFee > 0 ? formatCurrency(selectedProperty.repairFee, locale) : "" },
      ]
    : [];
  const selectedMissingFields = selectedRequiredFields.filter((field) => !field.value);
  const selectedCompletion = selectedRequiredFields.length > 0
    ? Math.round(((selectedRequiredFields.length - selectedMissingFields.length) / selectedRequiredFields.length) * 100)
    : 0;
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

      <section className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-4">
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
          <details className="relative ml-auto">
            <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm">
              <span className="material-symbols-outlined text-[16px] text-slate-400" aria-hidden="true">checklist</span>
              {copy.batchTools}
            </summary>
            <div className="absolute right-0 z-10 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
              <p className="text-xs leading-5 text-slate-500">{copy.batchHint}</p>
              <button
                type="submit"
                form="property-export-form"
                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                {copy.batchExportBtn}
              </button>
            </div>
          </details>
          <div className="flex items-center gap-2 pr-2">
            <span className="text-xs font-bold uppercase text-slate-500">{copy.sortBy}</span>
            <Link href={`/properties?status=${statusFilter}&sort=${sort === "updated" ? "price" : "updated"}`} className="inline-flex items-center gap-1 text-sm font-bold text-slate-800">
              {copy.lastModified}
              <span className="material-symbols-outlined text-[16px] text-slate-500">expand_more</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
      <div className="overflow-hidden rounded-xl bg-[#e6eeff] shadow-sm ring-1 ring-slate-200/30">
        <form id="property-export-form" action="/api/hub/export" method="get">
          <input type="hidden" name="scope" value="properties" />
          <input type="hidden" name="locale" value={locale} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse">
            <thead>
              <tr className="bg-[#edf2fd]/80">
                <th className="w-12 px-4 py-4" />
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
                  <td className="px-4 py-4 align-middle">
                    <label className="inline-flex">
                      <span className="sr-only">{copy.batchTools}</span>
                      <input type="checkbox" name="ids" value={property.id} className="h-4 w-4 rounded border-slate-300" />
                    </label>
                  </td>
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
                    <Link
                      href={`/properties/${encodeURIComponent(property.id)}/edit`}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-[#002FA7] transition-colors hover:bg-blue-50"
                    >
                      {copy.openProfile}
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </Link>
                  </td>
                </tr>
              ))}
              {pagedProperties.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
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
        </form>
      </div>

      <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {selectedProperty ? (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-black text-[#002FA7]">{copy.propertyProfile}</p>
              <h2 className="mt-2 text-2xl font-black leading-8 text-slate-950">{selectedProperty.name}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">{selectedProperty.area || t(locale, "common.notSet")}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xs font-black text-slate-500">{copy.requiredInfo}</h3>
                  <p className="mt-1 text-xl font-black text-slate-950">
                    {selectedRequiredFields.length - selectedMissingFields.length}/{selectedRequiredFields.length}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                  selectedMissingFields.length > 0 ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                }`}>
                  {selectedMissingFields.length > 0 ? `${copy.missingItems} ${selectedMissingFields.length}` : copy.complete}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-[#002FA7]" style={{ width: `${selectedCompletion}%` }} />
              </div>
              <div className="mt-3 divide-y divide-slate-200 rounded-lg bg-white">
                {selectedRequiredFields.map((field) => {
                  const filled = Boolean(field.value);
                  return (
                    <div key={field.label} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                      <span className="font-bold text-slate-500">{field.label}</span>
                      <span className={`max-w-[55%] truncate text-right font-black ${
                        filled ? "text-slate-950" : "text-rose-600"
                      }`}>
                        {field.value || copy.insufficient}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border-l-4 border-[#002FA7] bg-blue-50 p-4">
              <p className="text-xs font-black text-[#002FA7]">{copy.outputCheck}</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-900">
                {selectedMissingFields.length > 0
                  ? copy.insufficient
                  : locale === "zh"
                    ? "基础信息已齐，可以关联案件继续使用。"
                    : locale === "ko"
                      ? "기본 정보가 준비되어 안건에 연결해 계속 사용할 수 있습니다."
                      : "基本情報が揃っています。案件に紐づけて利用できます。"}
              </p>
            </div>

            <div className="grid gap-2">
              <Link
                href={`/relationship-tree?type=property&id=${encodeURIComponent(selectedProperty.id)}`}
                className="inline-flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-[#002FA7] hover:bg-blue-100"
              >
                {copy.relationTree}
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">account_tree</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
            {copy.emptyList}
          </div>
        )}
      </aside>
      </section>

      <section className="grid gap-6 2xl:grid-cols-3">
        <article className="rounded-xl bg-[#edf2fd] p-6 2xl:col-span-2">
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
