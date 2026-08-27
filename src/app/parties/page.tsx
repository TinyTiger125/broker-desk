import Link from "next/link";
import { redirect } from "next/navigation";
import { ArchiveRecordButton } from "@/components/archive-record-button";
import { ListReturnState } from "@/components/list-return-state";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { listHubParties, type HubPartyItem } from "@/lib/hub";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { normalizeLifecycleFilter, type LifecycleFilter } from "@/lib/record-lifecycle";
import { getTenantCapability, requireTenantSession } from "@/lib/tenant-session";
import { capabilityHasTenantPermission } from "@/lib/tenant-permissions";
import { createRequestContext } from "@/lib/visibility-resolver";

export const dynamic = "force-dynamic";

const PARTIES_PAGE_SIZE = 12;

type PartyTypeFilter = "all" | "corporate" | "individual";

type PartiesPageProps = {
  searchParams?: Promise<{
    q?: string;
    flash?: string;
    type?: string;
    lifecycle?: string;
    page?: string;
  }>;
};

type PartyFilters = {
  query: string;
  type: PartyTypeFilter;
  lifecycle: LifecycleFilter;
  page?: number;
};

function parsePage(value?: string): number {
  const raw = value?.trim() ?? "";
  if (!/^[1-9]\d*$/.test(raw)) return 1;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : 1;
}

function buildPartiesHref(filters: PartyFilters): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.lifecycle !== "active") params.set("lifecycle", filters.lifecycle);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const search = params.toString();
  return search ? `/parties?${search}` : "/parties";
}

const partiesCopy = {
  ja: {
    clear: "条件をクリア",
    contact: "連絡先",
    corporate: "法人",
    individual: "個人",
    lifecycle: "ライフサイクル",
    active: "有効",
    archived: "アーカイブ済み",
    all: "すべて",
    filter: "検索",
    noParties: "登録されている関係者はまだありません。",
    noResult: "条件に一致する関係者がいません。",
    noResultHint: "条件を変更するか、すべての条件をクリアしてください。",
    retry: "再試行",
    readError: "関係者を読み込めませんでした。",
    results: "関係者一覧",
    resultRange: (start: number, end: number, total: number) => `${start}–${end} / ${total}名`,
    page: (current: number, total: number) => `${current} / ${total}ページ`,
    previous: "前のページ",
    next: "次のページ",
    pageTitle: "関係者",
    name: "関係者名",
    role: "役割",
    type: "種別",
    status: "状態",
    actions: "操作",
    relationTree: "関係を確認",
    searchLabel: "キーワード",
    searchPlaceholder: "名前・電話・メール・役割で検索",
    created: "関係者を登録しました。",
    updated: "関係者を更新しました。",
    archivedFeedback: "関係者をアーカイブしました。",
    restoredFeedback: "関係者を復元しました。",
    backToWorkbench: "ワークベンチに戻る",
    readOnly: "会社メンバーに公開／読み取り専用",
    ownerReadOnly: "現在のアカウントは閲覧のみです。",
  },
  zh: {
    clear: "清除条件",
    contact: "联系方式",
    corporate: "法人",
    individual: "个人",
    lifecycle: "生命周期",
    active: "有效",
    archived: "已归档",
    all: "全部",
    filter: "查找",
    noParties: "当前还没有已登记的主体。",
    noResult: "没有符合条件的主体。",
    noResultHint: "请调整条件或清除全部筛选。",
    retry: "重试",
    readError: "无法读取主体列表。",
    results: "主体列表",
    resultRange: (start: number, end: number, total: number) => `${start}–${end} / 共 ${total} 位`,
    page: (current: number, total: number) => `第 ${current} / ${total} 页`,
    previous: "上一页",
    next: "下一页",
    pageTitle: "相关主体",
    name: "主体名称",
    role: "角色",
    type: "类型",
    status: "状态",
    actions: "操作",
    relationTree: "查看关系图",
    searchLabel: "关键词",
    searchPlaceholder: "按姓名、电话、邮箱或角色搜索",
    created: "主体已创建。",
    updated: "主体已更新。",
    archivedFeedback: "主体已归档。",
    restoredFeedback: "主体已恢复。",
    backToWorkbench: "返回工作台",
    readOnly: "公司成员可见／只读",
    ownerReadOnly: "当前账号仅可查看。",
  },
  ko: {
    clear: "조건 지우기",
    contact: "연락처",
    corporate: "법인",
    individual: "개인",
    lifecycle: "라이프사이클",
    active: "유효",
    archived: "보관됨",
    all: "전체",
    filter: "검색",
    noParties: "아직 등록된 관계자가 없습니다.",
    noResult: "조건에 맞는 관계자가 없습니다.",
    noResultHint: "조건을 변경하거나 모든 필터를 지워 주세요.",
    retry: "다시 시도",
    readError: "관계자 목록을 읽을 수 없습니다.",
    results: "관계자 목록",
    resultRange: (start: number, end: number, total: number) => `${start}–${end} / ${total}명`,
    page: (current: number, total: number) => `${current} / ${total}페이지`,
    previous: "이전 페이지",
    next: "다음 페이지",
    pageTitle: "관계자",
    name: "관계자명",
    role: "역할",
    type: "유형",
    status: "상태",
    actions: "작업",
    relationTree: "관계 확인",
    searchLabel: "키워드",
    searchPlaceholder: "이름, 전화, 이메일 또는 역할 검색",
    created: "관계자를 등록했습니다.",
    updated: "관계자를 업데이트했습니다.",
    archivedFeedback: "관계자를 보관했습니다.",
    restoredFeedback: "관계자를 복원했습니다.",
    backToWorkbench: "워크벤치로 돌아가기",
    readOnly: "회사 구성원 공개 / 읽기 전용",
    ownerReadOnly: "현재 계정은 보기 전용입니다.",
  },
} as const;

function normalizeType(value?: string): PartyTypeFilter {
  return value === "corporate" || value === "individual" ? value : "all";
}

function contactSummary(party: HubPartyItem, notSet: string): string {
  const values = [party.phone, party.email].filter(Boolean);
  return values.length > 0 ? values.join(" / ") : notSet;
}

export default async function PartiesPage({ searchParams }: PartiesPageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.read" }),
  ]);
  const copy = partiesCopy[locale];
  const capability = getTenantCapability(session.membership);
  const capabilityCanWrite = session.membership.status === "active"
    && capabilityHasTenantPermission(capability, "record.update");
  const capabilityCanArchive = session.membership.status === "active"
    && capabilityHasTenantPermission(capability, "record.archive");
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const type = normalizeType(params.type);
  const lifecycle = normalizeLifecycleFilter(params.lifecycle);
  const requestedPage = parsePage(params.page);
  const filters = { query, type, lifecycle } satisfies Omit<PartyFilters, "page">;
  const context = {
    userId: session.user.id,
    tenantId: session.tenant.id,
    lifecycleStatus: "all" as const,
    requestContext: createRequestContext(session),
    canUpdateRecords: capabilityCanWrite,
    canArchiveRecords: capabilityCanArchive,
  };

  let parties: HubPartyItem[] = [];
  let readError = false;
  try {
    parties = await listHubParties(locale, context);
  } catch {
    readError = true;
  }

  const lifecycleFiltered = lifecycle === "all"
    ? parties
    : parties.filter((party) => party.status === lifecycle);
  const searched = query
    ? lifecycleFiltered.filter((party) => {
        const normalized = query.toLowerCase();
        return (
          party.name.toLowerCase().includes(normalized) ||
          party.phone.toLowerCase().includes(normalized) ||
          (party.email?.toLowerCase().includes(normalized) ?? false) ||
          party.explicitRoles.some((role) => role.toLowerCase().includes(normalized))
        );
      })
    : lifecycleFiltered;
  const filtered = searched.filter((party) => {
    const matchesType = type === "all" || party.explicitPartyType === type;
    return matchesType;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PARTIES_PAGE_SIZE));
  const safePage = Math.min(requestedPage, pageCount);
  if (!readError && params.page !== undefined && (params.page !== String(safePage) || safePage === 1)) {
    redirect(buildPartiesHref({ ...filters, page: safePage }));
  }
  const visibleParties = filtered.slice((safePage - 1) * PARTIES_PAGE_SIZE, safePage * PARTIES_PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * PARTIES_PAGE_SIZE + 1;
  const rangeEnd = Math.min(filtered.length, safePage * PARTIES_PAGE_SIZE);
  const returnTo = buildPartiesHref({ ...filters, page: safePage });
  const clearHref = buildPartiesHref({ query: "", type: "all", lifecycle: "active" });
  const flashMap = {
    party_created: copy.created,
    party_updated: copy.updated,
    record_archived: copy.archivedFeedback,
    record_restored: copy.restoredFeedback,
  } as const;
  const flashMessage = flashMap[String(params.flash ?? "").trim() as keyof typeof flashMap];
  const notSet = t(locale, "common.notSet");

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{copy.results}</p>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">{copy.pageTitle}</h1>
        </div>
      </header>

      <PageFlashBanner message={flashMessage} />

      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200/35" aria-labelledby="parties-filter-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="parties-filter-heading" className="text-lg font-bold text-slate-900">{copy.searchLabel}</h2>
          <Link href={clearHref} className="text-sm font-bold text-slate-700 hover:text-[#002fa7]">{copy.clear}</Link>
        </div>
        <form action="/parties" method="get" className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto_auto_auto]">
          <label className="sr-only" htmlFor="party-query">{copy.searchLabel}</label>
          <input
            id="party-query"
            name="q"
            defaultValue={query}
            placeholder={copy.searchPlaceholder}
            className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-[#0046ad] focus:ring-2 focus:ring-blue-100"
          />
          <label className="bd-inline-select-frame flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
            <span className="sr-only">{copy.type}</span>
            <select name="type" defaultValue={type} className="min-w-28 bg-transparent outline-none">
              <option value="all">{copy.type}: {copy.all}</option>
              <option value="individual">{copy.individual}</option>
              <option value="corporate">{copy.corporate}</option>
            </select>
          </label>
          <label className="bd-inline-select-frame flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
            <span className="sr-only">{copy.lifecycle}</span>
            <select name="lifecycle" defaultValue={lifecycle} className="min-w-32 bg-transparent outline-none">
              <option value="active">{copy.lifecycle}: {copy.active}</option>
              <option value="archived">{copy.archived}</option>
              <option value="all">{copy.all}</option>
            </select>
          </label>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#001e40] px-4 text-sm font-bold text-white">
            <span className="material-symbols-outlined text-[17px]" aria-hidden="true">search</span>
            {copy.filter}
          </button>
        </form>
      </section>

      <ListReturnState scope="parties" listUrl={returnTo}>
      <section tabIndex={-1} data-list-return-fallback className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/40" aria-labelledby="parties-results-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
          <div>
            <h2 id="parties-results-heading" className="text-lg font-bold text-slate-900">{copy.results}</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">{copy.resultRange(rangeStart, rangeEnd, filtered.length)}</p>
          </div>
          {pageCount > 1 && !readError ? (
            <nav aria-label={copy.results} className="flex items-center gap-2 text-sm font-bold">
              {safePage > 1 ? <Link href={buildPartiesHref({ ...filters, page: safePage - 1 })} className="rounded-md border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50">{copy.previous}</Link> : null}
              <span className="px-2 text-slate-500">{copy.page(safePage, pageCount)}</span>
              {safePage < pageCount ? <Link href={buildPartiesHref({ ...filters, page: safePage + 1 })} className="rounded-md border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50">{copy.next}</Link> : null}
            </nav>
          ) : null}
        </div>

        {!readError && filtered.length > 0 ? (
          <div className="hidden gap-4 border-b border-slate-200/80 bg-slate-50/70 px-5 py-2 text-xs font-bold uppercase tracking-wide text-slate-500 lg:grid lg:grid-cols-[minmax(12rem,1.3fr)_minmax(7rem,0.7fr)_minmax(9rem,1fr)_minmax(6rem,0.6fr)_auto] lg:items-center" aria-hidden="true">
            <span>{copy.name}</span>
            <span>{copy.type}</span>
            <span>{copy.role}</span>
            <span>{copy.status}</span>
            <span className="text-right">{copy.actions}</span>
          </div>
        ) : null}

        {readError ? (
          <div className="space-y-3 px-5 py-12 text-center">
            <p className="text-sm font-semibold text-rose-700">{copy.readError}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href={returnTo} className="rounded-lg bg-[#001e40] px-4 py-2 text-sm font-bold text-white">{copy.retry}</Link>
              <Link href="/organize-center" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">{copy.backToWorkbench}</Link>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="space-y-3 px-5 py-12 text-center">
            <p className="text-sm font-semibold text-slate-700">{parties.length === 0 ? copy.noParties : copy.noResult}</p>
            {parties.length === 0 ? (
              null
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-slate-500">{copy.noResultHint}</p>
                <Link href={clearHref} className="inline-flex rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">{copy.clear}</Link>
              </div>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-200/80" aria-label={copy.results}>
            {visibleParties.map((party) => {
              const canWrite = party.canWrite && capabilityCanWrite;
              const canArchive = party.canArchive;
              const readOnlyMessage = party.readOnlyReason === "company_read"
                ? copy.readOnly
                : party.readOnlyReason === "owner_read_only" || !canWrite
                  ? copy.ownerReadOnly
                  : undefined;
              const typeLabel = party.explicitPartyType === "corporate"
                ? copy.corporate
                : party.explicitPartyType === "individual"
                  ? copy.individual
                  : notSet;
              const roleLabel = party.explicitRoles.join(" / ") || notSet;
              const statusLabel = party.status === "archived" ? copy.archived : copy.active;
              return (
                <li key={party.id} className="grid gap-4 px-5 py-4 transition hover:bg-slate-50 lg:grid-cols-[minmax(12rem,1.3fr)_minmax(7rem,0.7fr)_minmax(9rem,1fr)_minmax(6rem,0.6fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <Link
                      href={`/parties/${encodeURIComponent(party.id)}/edit?returnTo=${encodeURIComponent(returnTo)}`}
                      data-list-return-trigger={`party:${party.id}`}
                      className="block truncate text-sm font-bold text-slate-900 underline-offset-4 hover:text-[#002fa7] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]"
                    >
                      {party.name}
                    </Link>
                    <p className="mt-1 truncate text-xs font-medium text-slate-500">{contactSummary(party, notSet)}</p>
                    {readOnlyMessage ? <p className="mt-1 text-xs font-bold text-slate-600">{readOnlyMessage}</p> : null}
                  </div>
                  <div className="text-sm text-slate-700"><span className="mr-2 text-xs font-bold text-slate-400 lg:hidden">{copy.type}</span>{typeLabel}</div>
                  <div className="text-sm text-slate-700"><span className="mr-2 text-xs font-bold text-slate-400 lg:hidden">{copy.role}</span>{roleLabel}</div>
                  <div className={party.status === "archived" ? "text-sm font-semibold text-slate-500" : "text-sm text-slate-700"}><span className="mr-2 text-xs font-bold text-slate-400 lg:hidden">{copy.status}</span>{statusLabel}</div>
                  <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                    {canWrite ? <Link
                      href={`/relationship-tree?type=party&id=${encodeURIComponent(party.id)}`}
                      className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]"
                    >{copy.relationTree}</Link> : null}
                    {canArchive ? <ArchiveRecordButton
                      entityType="party"
                      entityId={party.id}
                      recordLabel={party.name}
                      status={party.status}
                      locale={locale}
                      returnTo={returnTo}
                      returnStateScope={"parties"}
                      returnFocusKey={`party:${party.id}`}
                    /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </ListReturnState>
    </div>
  );
}
