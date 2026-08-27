import Link from "next/link";
import { redirect } from "next/navigation";
import { ArchiveRecordButton } from "@/components/archive-record-button";
import { ListReturnState } from "@/components/list-return-state";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { formatCurrency } from "@/lib/format";
import { listHubProperties, type HubPropertyItem } from "@/lib/hub";
import { getLocale } from "@/lib/locale";
import { normalizeLifecycleFilter, type LifecycleFilter } from "@/lib/record-lifecycle";
import { getTenantCapability, requireTenantSession } from "@/lib/tenant-session";
import { capabilityHasTenantPermission } from "@/lib/tenant-permissions";
import { createRequestContext } from "@/lib/visibility-resolver";

export const dynamic = "force-dynamic";

const PROPERTIES_PAGE_SIZE = 12;
type PropertySort = "default" | "price";

type PropertiesPageProps = {
  searchParams?: Promise<{
    q?: string;
    lifecycle?: string;
    sort?: string;
    page?: string;
    flash?: string;
  }>;
};

type PropertyFilters = {
  query: string;
  lifecycle: LifecycleFilter;
  sort: PropertySort;
  page?: number;
};

const propertiesCopy = {
  ja: {
    pageTitle: "物件",
    description: "物件を検索し、維持管理ページへ進みます。",
    addProperty: "新規物件",
    searchLabel: "物件を検索",
    queryPlaceholder: "物件名またはエリア",
    lifecycle: "ライフサイクル",
    active: "有効",
    archived: "アーカイブ済み",
    all: "すべて",
    sort: "並び順",
    defaultSort: "標準",
    priceHigh: "価格の高い順",
    search: "検索",
    clear: "条件をクリア",
    results: "物件一覧",
    resultRange: (start: number, end: number, total: number) => `${start}–${end} / ${total}件`,
    name: "物件名",
    area: "エリア",
    listingPrice: "販売価格",
    managementFee: "管理費",
    repairFee: "修繕費",
    status: "状態",
    actions: "操作",
    notSet: "未設定",
    noProperties: "登録されている物件はまだありません。",
    noResult: "条件に一致する物件がありません。",
    noResultHint: "条件を変更するか、すべての条件をクリアしてください。",
    readError: "物件一覧を読み込めませんでした。",
    retry: "再試行",
    previous: "前のページ",
    next: "次のページ",
    page: (current: number, total: number) => `${current} / ${total}ページ`,
    created: "物件を登録しました。",
    updated: "物件を更新しました。",
    archivedFeedback: "物件をアーカイブしました。",
    restoredFeedback: "物件を復元しました。",
    companyRead: "会社メンバーに公開／読み取り専用",
    ownerReadOnly: "現在のアカウントは閲覧のみです。",
  },
  zh: {
    pageTitle: "物件",
    description: "查找物件并进入维护页面。",
    addProperty: "新增物件",
    searchLabel: "查找物件",
    queryPlaceholder: "按物件名称或区域搜索",
    lifecycle: "生命周期",
    active: "有效",
    archived: "已归档",
    all: "全部",
    sort: "排序",
    defaultSort: "默认顺序",
    priceHigh: "价格从高到低",
    search: "搜索",
    clear: "清除条件",
    results: "物件列表",
    resultRange: (start: number, end: number, total: number) => `${start}–${end} / 共 ${total} 条`,
    name: "物件名称",
    area: "区域",
    listingPrice: "售价",
    managementFee: "管理费",
    repairFee: "修缮费",
    status: "生命周期",
    actions: "操作",
    notSet: "未设置",
    noProperties: "当前还没有已登记的物件。",
    noResult: "没有符合条件的物件。",
    noResultHint: "请调整条件或清除全部筛选。",
    readError: "无法读取物件列表。",
    retry: "重试",
    previous: "上一页",
    next: "下一页",
    page: (current: number, total: number) => `第 ${current} / ${total} 页`,
    created: "物件已创建。",
    updated: "物件已更新。",
    archivedFeedback: "物件已归档。",
    restoredFeedback: "物件已恢复。",
    companyRead: "公司成员可见／只读",
    ownerReadOnly: "当前账号仅可查看。",
  },
  ko: {
    pageTitle: "매물",
    description: "매물을 찾아 관리 페이지로 이동합니다.",
    addProperty: "매물 추가",
    searchLabel: "매물 검색",
    queryPlaceholder: "매물명 또는 지역 검색",
    lifecycle: "라이프사이클",
    active: "유효",
    archived: "보관됨",
    all: "전체",
    sort: "정렬",
    defaultSort: "기본 순서",
    priceHigh: "가격 높은 순",
    search: "검색",
    clear: "조건 지우기",
    results: "매물 목록",
    resultRange: (start: number, end: number, total: number) => `${start}–${end} / ${total}건`,
    name: "매물명",
    area: "지역",
    listingPrice: "판매 가격",
    managementFee: "관리비",
    repairFee: "수선비",
    status: "상태",
    actions: "작업",
    notSet: "미설정",
    noProperties: "아직 등록된 매물이 없습니다.",
    noResult: "조건에 맞는 매물이 없습니다.",
    noResultHint: "조건을 변경하거나 모든 조건을 지워 주세요.",
    readError: "매물 목록을 읽을 수 없습니다.",
    retry: "다시 시도",
    previous: "이전 페이지",
    next: "다음 페이지",
    page: (current: number, total: number) => `${current} / ${total}페이지`,
    created: "매물을 등록했습니다.",
    updated: "매물을 업데이트했습니다.",
    archivedFeedback: "매물을 보관했습니다.",
    restoredFeedback: "매물을 복원했습니다.",
    companyRead: "회사 구성원 공개 / 읽기 전용",
    ownerReadOnly: "현재 계정은 보기 전용입니다.",
  },
} as const;

function parsePage(value?: string): number {
  const raw = value?.trim() ?? "";
  if (!/^[1-9]\d*$/.test(raw)) return 1;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : 1;
}

function normalizeSort(value?: string): PropertySort {
  return value === "price" ? "price" : "default";
}

function buildPropertiesHref(filters: PropertyFilters): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.lifecycle !== "active") params.set("lifecycle", filters.lifecycle);
  if (filters.sort !== "default") params.set("sort", filters.sort);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const search = params.toString();
  return search ? `/properties?${search}` : "/properties";
}

function formatListingPrice(property: HubPropertyItem, notSet: string, locale: Parameters<typeof formatCurrency>[1]): string {
  return property.listingPrice > 0 ? formatCurrency(property.listingPrice, locale) : notSet;
}

function formatFee(value: number | null, notSet: string, locale: Parameters<typeof formatCurrency>[1]): string {
  return value === null ? notSet : formatCurrency(value, locale);
}

export default async function PropertiesPage({ searchParams }: PropertiesPageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.read" }),
  ]);
  const copy = propertiesCopy[locale];
  const context = createRequestContext(session);
  const capability = getTenantCapability(session.membership);
  const canUpdateRecords = session.membership.status === "active" && capabilityHasTenantPermission(capability, "record.update");
  const canArchiveRecords = session.membership.status === "active" && capabilityHasTenantPermission(capability, "record.archive");
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const lifecycle = normalizeLifecycleFilter(params.lifecycle);
  const sort = normalizeSort(params.sort);
  const requestedPage = parsePage(params.page);
  const filters = { query, lifecycle, sort } satisfies Omit<PropertyFilters, "page">;

  let properties: HubPropertyItem[] = [];
  let readError = false;
  try {
    properties = await listHubProperties(locale, {
      requestContext: context,
      lifecycleStatus: "all",
      canUpdateRecords,
      canArchiveRecords,
    });
  } catch {
    readError = true;
  }

  const lifecycleFiltered = lifecycle === "all"
    ? properties
    : properties.filter((property) => property.status === lifecycle);
  const searched = query
    ? lifecycleFiltered.filter((property) => {
        const normalized = query.toLocaleLowerCase();
        return (
          property.name.toLocaleLowerCase().includes(normalized) ||
          property.area.toLocaleLowerCase().includes(normalized)
        );
      })
    : lifecycleFiltered;
  const sorted = [...searched];
  if (sort === "price") {
    sorted.sort((a, b) => {
      const aValid = a.listingPrice > 0;
      const bValid = b.listingPrice > 0;
      if (aValid !== bValid) return aValid ? -1 : 1;
      return b.listingPrice - a.listingPrice;
    });
  }

  const pageCount = Math.max(1, Math.ceil(sorted.length / PROPERTIES_PAGE_SIZE));
  const safePage = Math.min(requestedPage, pageCount);
  if (!readError && params.page !== undefined && (params.page !== String(safePage) || safePage === 1)) {
    redirect(buildPropertiesHref({ ...filters, page: safePage }));
  }
  const visibleProperties = sorted.slice((safePage - 1) * PROPERTIES_PAGE_SIZE, safePage * PROPERTIES_PAGE_SIZE);
  const rangeStart = sorted.length === 0 ? 0 : (safePage - 1) * PROPERTIES_PAGE_SIZE + 1;
  const rangeEnd = Math.min(sorted.length, safePage * PROPERTIES_PAGE_SIZE);
  const returnTo = buildPropertiesHref({ ...filters, page: safePage });
  const createHref = `/properties/new?returnTo=${encodeURIComponent(returnTo)}`;
  const clearHref = buildPropertiesHref({ query: "", lifecycle: "active", sort: "default" });
  const flashMap = {
    property_created: copy.created,
    property_updated: copy.updated,
    record_archived: copy.archivedFeedback,
    record_restored: copy.restoredFeedback,
  } as const;
  const flashMessage = flashMap[String(params.flash ?? "").trim() as keyof typeof flashMap];

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">{copy.pageTitle}</h1>
          <p className="text-sm font-medium text-slate-600">{copy.description}</p>
        </div>
        {canUpdateRecords ? (
          <Link
            href={createHref}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gradient-to-br from-[#001e40] to-[#003366] px-4 text-sm font-semibold text-white shadow-[0_8px_20px_-10px_rgba(0,30,64,0.8)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]"
          >
            <span className="material-symbols-outlined text-[17px]" aria-hidden="true">add</span>
            {copy.addProperty}
          </Link>
        ) : null}
      </header>

      <PageFlashBanner message={flashMessage} />

      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200/35" aria-labelledby="properties-filter-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="properties-filter-heading" className="text-lg font-bold text-slate-900">{copy.searchLabel}</h2>
          <Link href={clearHref} className="text-sm font-bold text-slate-700 hover:text-[#002fa7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">{copy.clear}</Link>
        </div>
        <form action="/properties" method="get" className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto_auto_auto]">
          <label className="sr-only" htmlFor="property-query">{copy.searchLabel}</label>
          <input
            id="property-query"
            name="q"
            defaultValue={query}
            placeholder={copy.queryPlaceholder}
            className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-[#0046ad] focus:ring-2 focus:ring-blue-100"
          />
          <label className="bd-inline-select-frame flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
            <span className="sr-only">{copy.lifecycle}</span>
            <select name="lifecycle" defaultValue={lifecycle} className="min-w-32 bg-transparent outline-none">
              <option value="active">{copy.lifecycle}: {copy.active}</option>
              <option value="archived">{copy.archived}</option>
              <option value="all">{copy.lifecycle}: {copy.all}</option>
            </select>
          </label>
          <label className="bd-inline-select-frame flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
            <span className="sr-only">{copy.sort}</span>
            <select name="sort" defaultValue={sort} className="min-w-36 bg-transparent outline-none">
              <option value="default">{copy.sort}: {copy.defaultSort}</option>
              <option value="price">{copy.priceHigh}</option>
            </select>
          </label>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#001e40] px-4 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">
            <span className="material-symbols-outlined text-[17px]" aria-hidden="true">search</span>
            {copy.search}
          </button>
        </form>
      </section>

      <ListReturnState scope="properties" listUrl={returnTo}>
      <section tabIndex={-1} data-list-return-fallback className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/40" aria-labelledby="properties-results-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
          <div>
            <h2 id="properties-results-heading" className="text-lg font-bold text-slate-900">{copy.results}</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">{copy.resultRange(rangeStart, rangeEnd, sorted.length)}</p>
          </div>
          {pageCount > 1 && !readError ? (
            <nav aria-label={copy.results} className="flex items-center gap-2 text-sm font-bold">
              {safePage > 1 ? <Link href={buildPropertiesHref({ ...filters, page: safePage - 1 })} className="rounded-md border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">{copy.previous}</Link> : null}
              <span className="px-2 text-slate-500">{copy.page(safePage, pageCount)}</span>
              {safePage < pageCount ? <Link href={buildPropertiesHref({ ...filters, page: safePage + 1 })} className="rounded-md border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">{copy.next}</Link> : null}
            </nav>
          ) : null}
        </div>

        {readError ? (
          <div className="space-y-3 px-5 py-12 text-center">
            <p className="text-sm font-semibold text-rose-700">{copy.readError}</p>
            <Link href={returnTo} className="inline-flex rounded-lg bg-[#001e40] px-4 py-2 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">{copy.retry}</Link>
          </div>
        ) : sorted.length === 0 ? (
          <div className="space-y-3 px-5 py-12 text-center">
            <p className="text-sm font-semibold text-slate-700">{properties.length === 0 ? copy.noProperties : copy.noResult}</p>
            {properties.length === 0 ? null : (
              <div className="space-y-2">
                <p className="text-sm text-slate-500">{copy.noResultHint}</p>
                <Link href={clearHref} className="inline-flex rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">{copy.clear}</Link>
              </div>
            )}
          </div>
        ) : (
          <div role="table" aria-label={copy.results}>
            <div role="rowgroup">
              <div role="row" className="hidden gap-4 border-b border-slate-200/80 bg-slate-50/70 px-5 py-2 text-xs font-bold uppercase tracking-wide text-slate-500 lg:grid lg:grid-cols-[minmax(12rem,1.3fr)_minmax(8rem,.8fr)_minmax(8rem,.8fr)_minmax(8rem,.8fr)_minmax(8rem,.8fr)_minmax(6rem,.6fr)_auto] lg:items-center">
                <span role="columnheader">{copy.name}</span>
                <span role="columnheader">{copy.area}</span>
                <span role="columnheader">{copy.listingPrice}</span>
                <span role="columnheader">{copy.managementFee}</span>
                <span role="columnheader">{copy.repairFee}</span>
                <span role="columnheader">{copy.status}</span>
                <span role="columnheader" className="text-right">{copy.actions}</span>
              </div>
            </div>
            <div role="rowgroup" className="divide-y divide-slate-200/80">
              {visibleProperties.map((property) => {
                const statusLabel = property.status === "archived" ? copy.archived : copy.active;
                return (
                  <div key={property.id} role="row" className="grid gap-4 px-5 py-4 transition hover:bg-slate-50 lg:grid-cols-[minmax(12rem,1.3fr)_minmax(8rem,.8fr)_minmax(8rem,.8fr)_minmax(8rem,.8fr)_minmax(8rem,.8fr)_minmax(6rem,.6fr)_auto] lg:items-center">
                    <div role="cell" className="min-w-0">
                      <Link
                        href={`/properties/${encodeURIComponent(property.id)}/edit?returnTo=${encodeURIComponent(returnTo)}`}
                        data-list-return-trigger={`property:${property.id}`}
                        className="block truncate text-sm font-bold text-slate-900 underline-offset-4 hover:text-[#002fa7] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]"
                      >
                        {property.name}
                      </Link>
                      {property.readOnly ? (
                        <p className="mt-1 text-xs font-semibold text-sky-800">
                          {property.readOnlyReason === "company_read" ? copy.companyRead : copy.ownerReadOnly}
                        </p>
                      ) : null}
                    </div>
                    <div role="cell" className="text-sm text-slate-700"><span className="mr-2 text-xs font-bold text-slate-400 lg:hidden">{copy.area}</span>{property.area || copy.notSet}</div>
                    <div role="cell" className="text-sm tabular-nums text-slate-900"><span className="mr-2 text-xs font-bold text-slate-400 lg:hidden">{copy.listingPrice}</span>{formatListingPrice(property, copy.notSet, locale)}</div>
                    <div role="cell" className="text-sm tabular-nums text-slate-700"><span className="mr-2 text-xs font-bold text-slate-400 lg:hidden">{copy.managementFee}</span>{formatFee(property.managementFeeValue, copy.notSet, locale)}</div>
                    <div role="cell" className="text-sm tabular-nums text-slate-700"><span className="mr-2 text-xs font-bold text-slate-400 lg:hidden">{copy.repairFee}</span>{formatFee(property.repairFeeValue, copy.notSet, locale)}</div>
                    <div role="cell" className={property.status === "archived" ? "text-sm font-semibold text-slate-500" : "text-sm text-slate-700"}><span className="mr-2 text-xs font-bold text-slate-400 lg:hidden">{copy.status}</span>{statusLabel}</div>
                    <div role="cell" className="flex items-center justify-start gap-2 lg:justify-end">
                      {property.canArchive ? (
                        <ArchiveRecordButton
                          entityType="property"
                          entityId={property.id}
                          recordLabel={property.name}
                          status={property.status}
                          locale={locale}
                          returnTo={returnTo}
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
      </ListReturnState>
    </div>
  );
}
