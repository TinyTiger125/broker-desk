"use client";

import Link from "next/link";
import { ArchiveRecordButton } from "@/components/archive-record-button";
import { ListReportShell, StateSurface } from "@/components/layout-system";
import { ListReturnState } from "@/components/list-return-state";
import {
  Button,
  SectionHeader,
  SelectInput,
  StatusBadge,
  Surface,
  TextInput,
} from "@/components/ui-foundation";
import type { Locale } from "@/lib/locale";
import type { LifecycleFilter, LifecycleStatus } from "@/lib/record-lifecycle";

type ObjectType = "all" | "case" | "party" | "property";

export type OrganizeCenterBrowserItem = {
  id: string;
  type: Exclude<ObjectType, "all">;
  title: string;
  subtitle: string;
  relation: string;
  relationLabel: string;
  updatedLabel: string;
  href: string;
  lifecycleStatus: LifecycleStatus;
  visibilityLabel?: string;
  readOnly?: boolean;
  canArchive: boolean;
};

type OrganizeCenterObjectBrowserProps = {
  items: OrganizeCenterBrowserItem[];
  counts: Record<Exclude<ObjectType, "all">, number>;
  selectedType: ObjectType;
  query: string;
  copy: Record<string, string>;
  lifecycleFilter: LifecycleFilter;
  locale: Locale;
  page: number;
};

const LIST_PAGE_SIZE = 6;

function getTypeLabel(type: ObjectType, copy: Record<string, string>) {
  if (type === "case") return copy.case;
  if (type === "party") return copy.party;
  if (type === "property") return copy.property;
  return copy.all;
}

function getTypeIcon(type: OrganizeCenterBrowserItem["type"]) {
  if (type === "case") return "work";
  if (type === "party") return "person";
  if (type === "property") return "apartment";
  return "work";
}

function buildSearchText(item: OrganizeCenterBrowserItem) {
  return [item.title, item.subtitle, item.relation].join(" ").toLowerCase();
}

function filterItems(items: OrganizeCenterBrowserItem[], type: ObjectType, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  return items.filter((item) => {
    if (type !== "all" && item.type !== type) return false;
    if (normalizedQuery && !buildSearchText(item).includes(normalizedQuery)) return false;
    return true;
  });
}

function buildListHref(type: ObjectType, query: string, lifecycleFilter: LifecycleFilter, page = 1) {
  const params = new URLSearchParams();
  if (type !== "all") params.set("type", type);
  if (query.trim()) params.set("q", query.trim());
  if (lifecycleFilter !== "active") params.set("lifecycle", lifecycleFilter);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/organize-center?${search}` : "/organize-center";
}

export function OrganizeCenterObjectBrowser({
  items,
  counts,
  selectedType,
  query,
  copy,
  lifecycleFilter,
  locale,
  page,
}: OrganizeCenterObjectBrowserProps) {
  if (selectedType === "all") {
    const branchCards = ([
      { type: "case" as const, icon: "work", title: copy.case, description: copy.branchCaseDesc },
      { type: "party" as const, icon: "person", title: copy.party, description: copy.branchPartyDesc },
      { type: "property" as const, icon: "apartment", title: copy.property, description: copy.branchPropertyDesc },
    ]).map((card) => {
      return {
        ...card,
        total: counts[card.type],
      };
    });

    return (
      <Surface as="section" className="p-4 sm:p-5">
        <SectionHeader title={copy.objectCenter} />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {branchCards.map((card) => (
            <Link
              key={card.type}
              href={buildListHref(card.type, "", "active")}
              data-testid={`organize-branch-${card.type}`}
              className="group flex min-h-48 flex-col rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-[#3158d8] hover:bg-[#f6f8ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3158d8]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-[#002FA7]">
                  <span className="material-symbols-outlined text-[22px]" aria-hidden="true">{card.icon}</span>
                </span>
                <span className="rounded-full bg-slate-950 px-2 py-0.5 text-[11px] font-black tabular-nums text-white">
                  {card.total}
                </span>
              </div>
              <h2 className="mt-4 text-xl font-black text-slate-950">{card.title}</h2>
              <p className="mt-2 flex-1 text-sm font-semibold leading-6 text-slate-500">{card.description}</p>
              <div className="mt-5 flex items-end justify-between gap-3 border-t border-slate-100 pt-4">
                <span className="text-xs font-bold leading-5 text-slate-600">
                  {copy.continueCheck}
                </span>
                <span className="material-symbols-outlined shrink-0 text-[18px] text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#002FA7]" aria-hidden="true">
                  arrow_forward
                </span>
              </div>
            </Link>
          ))}
        </div>
      </Surface>
    );
  }

  const filteredItems = filterItems(items, selectedType, query);
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / LIST_PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const visibleItems = filteredItems.slice((safePage - 1) * LIST_PAGE_SIZE, safePage * LIST_PAGE_SIZE);
  const rangeStart = filteredItems.length === 0 ? 0 : (safePage - 1) * LIST_PAGE_SIZE + 1;
  const rangeEnd = Math.min(filteredItems.length, safePage * LIST_PAGE_SIZE);
  const listHref = buildListHref(selectedType, query, lifecycleFilter, safePage);
  const hasKeyword = query.trim().length > 0;

  return (
    <ListReturnState scope={"organize"} listUrl={listHref}>
      <section
        tabIndex={-1}
        data-list-return-fallback
        aria-label={`${getTypeLabel(selectedType, copy)} ${copy.objectCenter}`}
        className="rounded-lg focus-visible:outline focus-visible:outline-[length:var(--bd-focus-ring-width)] focus-visible:outline-[color:var(--bd-focus-ring-color)] focus-visible:outline-offset-[var(--bd-focus-ring-offset)]"
      >
        <ListReportShell
      className="organize-object-browser"
      scope={
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/organize-center" className="inline-flex min-h-[var(--bd-control-height-touch)] items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3158d8]">
              {copy.backToSelector}
            </Link>
            <div className="mt-4">
              <SectionHeader level="h2" title={getTypeLabel(selectedType, copy)} />
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
            <span className="material-symbols-outlined text-[16px] text-[#3158d8]" aria-hidden="true">{getTypeIcon(selectedType)}</span>
            {getTypeLabel(selectedType, copy)}
          </span>
        </div>
      }
      filters={
        <form action="/organize-center" method="get" className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(12rem,0.42fr)_auto_auto] md:items-end">
          <input type="hidden" name="type" value={selectedType} />
          <TextInput
            id="organize-center-query"
            name="q"
            label={copy.keyword}
            defaultValue={query}
            placeholder={copy.searchPlaceholder}
            className="min-w-0"
          />
          <SelectInput id="organize-center-lifecycle" name="lifecycle" label={copy.lifecycle} defaultValue={lifecycleFilter}>
            <option value="active">{copy.activeRecords}</option>
            <option value="archived">{copy.archivedRecords}</option>
            <option value="all">{copy.allRecords}</option>
          </SelectInput>
          <Button type="submit" tone="primary" controlSize="touch">{copy.filter}</Button>
          <Link href={buildListHref(selectedType, "", lifecycleFilter)} className="inline-flex min-h-[var(--bd-control-height-touch)] items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3158d8]">
            {copy.clear}
          </Link>
        </form>
      }
      summary={
        <p className="m-0 text-sm font-bold text-slate-700">
          {copy.pageStatus} {rangeStart}-{rangeEnd} / {filteredItems.length}
          <span className="ml-2 text-xs font-semibold text-slate-500">{copy.pageOf} {safePage} / {pageCount}</span>
        </p>
      }
      results={filteredItems.length > 0 ? (
        <div className="divide-y divide-slate-200">
          {visibleItems.map((item) => {
            const itemHref = item.type === "case"
              ? `${item.href}?returnTo=${encodeURIComponent(listHref)}`
              : item.href;
            return (
            <article key={`${item.type}:${item.id}`} className="grid gap-4 px-4 py-5 transition hover:bg-[#f9fbff] sm:px-5 md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.45fr)_auto]">
              <div className="min-w-0">
                <Link
                  href={itemHref}
                  data-list-return-trigger={`${item.type}:${item.id}`}
                  className="group inline-flex max-w-full items-start gap-2 rounded-md text-base font-black leading-6 text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3158d8] focus-visible:ring-offset-2"
                >
                  <span className="min-w-0 break-words">{item.title}</span>
                  <span className="material-symbols-outlined mt-1 shrink-0 text-[18px] text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#3158d8]" aria-hidden="true">arrow_forward</span>
                </Link>
                <p className="mt-1 break-words text-xs font-bold text-slate-500">{item.subtitle}</p>
                {item.visibilityLabel ? <p className="mt-2 inline-flex w-fit rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600">{item.visibilityLabel}</p> : null}
              </div>

              <div className="min-w-0 rounded-md bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-black text-slate-500">{item.relationLabel}</p>
                <p className="mt-1 break-words font-semibold leading-5 text-slate-800">{item.relation}</p>
              </div>

              <div className="min-w-0 rounded-md bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-black text-slate-500">{copy.lifecycle}</p>
                <StatusBadge tone={item.lifecycleStatus === "archived" ? "neutral" : "info"}>
                  {item.lifecycleStatus === "archived" ? copy.archivedRecords : copy.activeRecords}
                </StatusBadge>
              </div>

              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 md:col-span-2 xl:col-span-1 xl:flex-col xl:items-end xl:justify-start">
                <span className="text-xs font-bold tabular-nums text-slate-500">{copy.taskUpdated}: {item.updatedLabel}</span>
                {item.canArchive ? (
                  <ArchiveRecordButton
                    entityType={item.type}
                    entityId={item.id}
                    recordLabel={item.title}
                    status={item.lifecycleStatus}
                    locale={locale}
                    returnTo={listHref}
                    returnStateScope={"organize"}
                    returnFocusKey={`${item.type}:${item.id}`}
                  />
                ) : null}
              </div>
            </article>
            );
          })}
        </div>
      ) : null}
      pagination={
        pageCount > 1 ? (
          <nav aria-label={copy.pageStatus} className="flex items-center gap-2">
            {safePage > 1 ? (
              <Link href={buildListHref(selectedType, query, lifecycleFilter, safePage - 1)} data-testid="organize-page-previous" className="inline-flex min-h-[var(--bd-control-height-touch)] items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3158d8]">
                {copy.previousPage}
              </Link>
            ) : null}
            {safePage < pageCount ? (
              <Link href={buildListHref(selectedType, query, lifecycleFilter, safePage + 1)} data-testid="organize-page-next" className="inline-flex min-h-[var(--bd-control-height-touch)] items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3158d8]">
                {copy.nextPage}
              </Link>
            ) : null}
          </nav>
        ) : null
      }
      state={
        filteredItems.length === 0 ? (
          <StateSurface
            tone="empty"
            title={copy.noResults}
            description={hasKeyword ? copy.clearKeywordHint : undefined}
            action={hasKeyword ? <Link href={buildListHref(selectedType, "", lifecycleFilter)} className="inline-flex min-h-[var(--bd-control-height-touch)] items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3158d8]">{copy.clearFilters}</Link> : undefined}
          />
        ) : null
      }
        />
      </section>
    </ListReturnState>
  );
}
