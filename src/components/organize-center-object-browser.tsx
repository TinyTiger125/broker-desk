"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArchiveRecordButton } from "@/components/archive-record-button";
import type { Locale } from "@/lib/locale";
import type { LifecycleFilter, LifecycleStatus } from "@/lib/record-lifecycle";

type ObjectType = "all" | "case" | "party" | "property" | "inbox";
type ObjectStatus = "all" | "unconfirmed" | "inconsistent" | "insufficient" | "complete";

export type OrganizeCenterBrowserItem = {
  id: string;
  type: Exclude<ObjectType, "all">;
  status: Exclude<ObjectStatus, "all">;
  title: string;
  subtitle: string;
  relation: string;
  relationLabel: string;
  statusNote: string;
  updatedLabel: string;
  href: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  lifecycleStatus: LifecycleStatus;
};

type OrganizeCenterObjectBrowserProps = {
  items: OrganizeCenterBrowserItem[];
  selectedType: ObjectType;
  query: string;
  copy: Record<string, string>;
  lifecycleFilter: LifecycleFilter;
  locale: Locale;
};

const LIST_PAGE_SIZE = 6;

function getTypeLabel(type: ObjectType, copy: Record<string, string>) {
  if (type === "case") return copy.case;
  if (type === "party") return copy.party;
  if (type === "property") return copy.property;
  if (type === "inbox") return copy.inbox;
  return copy.all;
}

function getStatusLabel(status: ObjectStatus, copy: Record<string, string>) {
  if (status === "unconfirmed") return copy.unconfirmed;
  if (status === "inconsistent") return copy.inconsistent;
  if (status === "insufficient") return copy.insufficient;
  if (status === "complete") return copy.complete;
  return copy.all;
}

function getStatusClass(status: OrganizeCenterBrowserItem["status"]) {
  if (status === "complete") return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100";
  if (status === "unconfirmed") return "bg-amber-50 text-amber-800 ring-1 ring-amber-100";
  if (status === "inconsistent") return "bg-orange-50 text-orange-700 ring-1 ring-orange-100";
  return "bg-rose-50 text-rose-700 ring-1 ring-rose-100";
}

function getTypeIcon(type: OrganizeCenterBrowserItem["type"]) {
  if (type === "case") return "work";
  if (type === "party") return "person";
  if (type === "property") return "apartment";
  return "upload_file";
}

function buildSearchText(item: OrganizeCenterBrowserItem) {
  return [item.title, item.subtitle, item.relation, item.statusNote].join(" ").toLowerCase();
}

function filterItems(items: OrganizeCenterBrowserItem[], type: ObjectType, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  return items.filter((item) => {
    if (type !== "all" && item.type !== type) return false;
    if (normalizedQuery && !buildSearchText(item).includes(normalizedQuery)) return false;
    return true;
  });
}

function buildBrowserHref(type: ObjectType, query: string, lifecycleFilter: LifecycleFilter) {
  const params = new URLSearchParams();
  if (type !== "all") params.set("type", type);
  if (lifecycleFilter !== "active") params.set("lifecycle", lifecycleFilter);
  if (query.trim()) params.set("q", query.trim());
  const search = params.toString();
  return search ? `/organize-center?${search}` : "/organize-center";
}

function syncBrowserUrl(type: ObjectType, query: string, lifecycleFilter: LifecycleFilter) {
  const url = new URL(window.location.href);
  if (type === "all") {
    url.searchParams.delete("type");
  } else {
    url.searchParams.set("type", type);
  }
  if (lifecycleFilter === "active") {
    url.searchParams.delete("lifecycle");
  } else {
    url.searchParams.set("lifecycle", lifecycleFilter);
  }
  if (query.trim()) {
    url.searchParams.set("q", query.trim());
  } else {
    url.searchParams.delete("q");
  }
  url.searchParams.delete("focus");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function restoreScrollPosition(left: number, top: number) {
  window.requestAnimationFrame(() => {
    window.scrollTo(left, top);
    window.requestAnimationFrame(() => window.scrollTo(left, top));
  });
}

export function OrganizeCenterObjectBrowser({ items, selectedType, query, copy, lifecycleFilter, locale }: OrganizeCenterObjectBrowserProps) {
  const router = useRouter();
  const activeType = selectedType;
  const [activeQuery, setActiveQuery] = useState(query);
  const [searchInput, setSearchInput] = useState(query);

  const filteredItems = useMemo(
    () => filterItems(items, activeType, activeQuery),
    [items, activeType, activeQuery],
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(filteredItems[0]?.id ?? "");
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / LIST_PAGE_SIZE));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const visibleItems = useMemo(
    () => filteredItems.slice(safePageIndex * LIST_PAGE_SIZE, safePageIndex * LIST_PAGE_SIZE + LIST_PAGE_SIZE),
    [filteredItems, safePageIndex],
  );
  const selectedItem = useMemo(
    () => visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0],
    [visibleItems, selectedId],
  );
  const rangeStart = filteredItems.length === 0 ? 0 : safePageIndex * LIST_PAGE_SIZE + 1;
  const rangeEnd = Math.min(filteredItems.length, (safePageIndex + 1) * LIST_PAGE_SIZE);

  const countByType = useMemo(() => {
    const counts = new Map<ObjectType, number>([
      ["all", items.length],
      ["case", 0],
      ["party", 0],
      ["property", 0],
      ["inbox", 0],
    ]);
    for (const item of items) {
      counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const branchCards = useMemo(
    () => [
      {
        type: "case" as const,
        icon: "work",
        title: copy.case,
        description: copy.branchCaseDesc,
        total: countByType.get("case") ?? 0,
        attention: items.filter((item) => item.type === "case" && item.status !== "complete").length,
      },
      {
        type: "party" as const,
        icon: "person",
        title: copy.party,
        description: copy.branchPartyDesc,
        total: countByType.get("party") ?? 0,
        attention: items.filter((item) => item.type === "party" && item.status !== "complete").length,
      },
      {
        type: "property" as const,
        icon: "apartment",
        title: copy.property,
        description: copy.branchPropertyDesc,
        total: countByType.get("property") ?? 0,
        attention: items.filter((item) => item.type === "property" && item.status !== "complete").length,
      },
      {
        type: "inbox" as const,
        icon: "upload_file",
        title: copy.inbox,
        description: copy.branchInboxDesc,
        total: countByType.get("inbox") ?? 0,
        attention: countByType.get("inbox") ?? 0,
      },
    ],
    [copy, countByType, items],
  );

  function applySearch(nextQuery: string) {
    const scrollLeft = window.scrollX;
    const scrollTop = window.scrollY;
    const nextItems = filterItems(items, activeType, nextQuery);
    const nextFocusId = nextItems[0]?.id ?? "";
    setActiveQuery(nextQuery.trim());
    setSearchInput(nextQuery);
    setPageIndex(0);
    setSelectedId(nextFocusId);
    syncBrowserUrl(activeType, nextQuery, lifecycleFilter);
    restoreScrollPosition(scrollLeft, scrollTop);
  }

  function selectPage(nextPageIndex: number) {
    const scrollLeft = window.scrollX;
    const scrollTop = window.scrollY;
    const boundedPageIndex = Math.min(Math.max(nextPageIndex, 0), pageCount - 1);
    const nextItems = filteredItems.slice(boundedPageIndex * LIST_PAGE_SIZE, boundedPageIndex * LIST_PAGE_SIZE + LIST_PAGE_SIZE);
    const nextFocusId = nextItems[0]?.id ?? "";
    setPageIndex(boundedPageIndex);
    setSelectedId(nextFocusId);
    restoreScrollPosition(scrollLeft, scrollTop);
  }

  function selectItem(id: string) {
    setSelectedId(id);
  }

  function openItem(item: OrganizeCenterBrowserItem) {
    router.push(item.href);
  }

  if (activeType === "all") {
    return (
      <div className="grid gap-3 p-4 lg:grid-cols-2 2xl:grid-cols-4">
        {branchCards.map((card) => (
          <Link
            key={card.type}
            href={buildBrowserHref(card.type, activeQuery, lifecycleFilter)}
            data-testid={`organize-branch-${card.type}`}
            className="group min-h-44 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-[#002FA7]">
                <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
                  {card.icon}
                </span>
              </span>
              <span className="rounded-full bg-slate-950 px-2 py-0.5 text-[11px] font-black tabular-nums text-white">
                {card.total}
              </span>
            </div>
            <h3 className="mt-4 text-xl font-black text-slate-950">{card.title}</h3>
            <p className="mt-2 line-clamp-3 text-sm font-semibold leading-6 text-slate-500">{card.description}</p>
            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${card.attention > 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                {card.attention > 0 ? `${card.attention} ${copy.insufficient}` : copy.complete}
              </span>
              <span className="material-symbols-outlined text-[18px] text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#002FA7]" aria-hidden="true">
                arrow_forward
              </span>
            </div>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="organize-object-browser">
      <div className="border-b border-slate-200 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {([
            ["active", copy.activeRecords],
            ["archived", copy.archivedRecords],
            ["all", copy.allRecords],
          ] as const).map(([filter, label]) => (
            <Link
              key={filter}
              href={buildBrowserHref(activeType, activeQuery, filter)}
              className={
                "rounded-full px-3 py-1.5 text-xs font-black transition " +
                (lifecycleFilter === filter
                  ? "bg-slate-950 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200")
              }
            >
              {label}
            </Link>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            applySearch(searchInput);
          }}
        >
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={copy.searchPlaceholder}
            className="h-11 min-w-0 flex-1 rounded border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-[#002FA7] focus:ring-2 focus:ring-blue-100"
          />
          <button type="submit" className="h-11 rounded bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800">
            {copy.filter}
          </button>
        </form>
      </div>

      {filteredItems.length > 0 ? (
        <div className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
              {copy.pageStatus} {rangeStart}-{rangeEnd} / {filteredItems.length}
            </span>
            {pageCount > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="organize-page-previous"
                  onClick={() => selectPage(safePageIndex - 1)}
                  disabled={safePageIndex === 0}
                  className="inline-flex h-8 items-center rounded border border-slate-300 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {copy.previousPage}
                </button>
                <button
                  type="button"
                  data-testid="organize-page-next"
                  onClick={() => selectPage(safePageIndex + 1)}
                  disabled={safePageIndex >= pageCount - 1}
                  className="inline-flex h-8 items-center rounded border border-slate-300 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {copy.nextPage}
                </button>
              </div>
            ) : null}
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="divide-y divide-slate-100">
              {visibleItems.map((item) => {
                const active = selectedItem?.id === item.id;
                return (
                  <div
                    key={`${item.type}:${item.id}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={active}
                    onClick={() => selectItem(item.id)}
                    onDoubleClick={() => openItem(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openItem(item);
                      }
                    }}
                    className={
                      "block w-full px-4 py-4 text-left text-sm transition hover:bg-blue-50/40 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#002FA7] " +
                      (active ? "bg-blue-50/60 ring-1 ring-inset ring-[#002FA7]" : "bg-white")
                    }
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ${getStatusClass(item.status)}`}>
                        {getStatusLabel(item.status, copy)}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-700">
                        <span className="material-symbols-outlined text-[14px] text-[#002FA7]" aria-hidden="true">
                          {getTypeIcon(item.type)}
                        </span>
                        {getTypeLabel(item.type, copy)}
                      </span>
                      <span className="text-[11px] font-bold tabular-nums text-slate-500">
                        {copy.taskUpdated}: {item.updatedLabel}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-3 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.25fr)] 2xl:items-start">
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 text-base font-black leading-6 text-slate-950">{item.title}</h3>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{item.subtitle}</p>
                      </div>
                      <div className="min-w-0 rounded-md bg-slate-50 px-3 py-2">
                        <p className="text-[11px] font-black text-slate-500">{item.relationLabel}</p>
                        <p className="mt-1 line-clamp-2 font-semibold leading-5 text-slate-800">{item.relation}</p>
                      </div>
                      <div className="min-w-0 rounded-md bg-slate-50 px-3 py-2">
                        <p className="text-[11px] font-black text-slate-500">{copy.statusNote}</p>
                        <p className="mt-1 line-clamp-2 font-semibold leading-5 text-slate-800">{item.statusNote}</p>
                      </div>
                      </div>
                    {item.type !== "inbox" ? (
                      <div className="mt-3 flex justify-end">
                        <ArchiveRecordButton
                          entityType={item.type === "party" ? "party" : item.type}
                          entityId={item.id}
                          status={item.lifecycleStatus}
                          locale={locale}
                          returnTo={buildBrowserHref(activeType, activeQuery, lifecycleFilter)}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6">
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-semibold text-slate-600">
            {copy.empty}
          </div>
        </div>
      )}
    </div>
  );
}
