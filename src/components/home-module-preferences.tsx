"use client";

import { Children, isValidElement, useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";

export type HomeModuleId = "today" | "waiting" | "agenda" | "weekly" | "recent";

type HomeModuleProps = {
  id: HomeModuleId;
  children: ReactNode;
};

type HomeModulePreferencesProps = {
  layoutId: string;
  storageKey: string;
  labels: Record<HomeModuleId, string>;
  ui: {
    button: string;
    title: string;
    description: string;
    hide: string;
    show: string;
    moveUp: string;
    moveDown: string;
    restore: string;
    empty: string;
  };
  children: ReactNode;
};

const DEFAULT_ORDER: HomeModuleId[] = ["today", "waiting", "agenda", "weekly", "recent"];

function isWorkCard(id: HomeModuleId): id is "today" | "waiting" {
  return id === "today" || id === "waiting";
}

export function HomeModule({ id, children }: HomeModuleProps) {
  return <div data-home-module={id}>{children}</div>;
}

function normalizePreference(value: unknown): { order: HomeModuleId[]; hidden: HomeModuleId[] } {
  if (!value || typeof value !== "object") return { order: DEFAULT_ORDER, hidden: [] };
  const record = value as { order?: unknown; hidden?: unknown };
  const order = Array.isArray(record.order)
    ? [...new Set(record.order.filter((id): id is HomeModuleId => DEFAULT_ORDER.includes(id as HomeModuleId)))]
    : [];
  const normalizedOrder = [...order, ...DEFAULT_ORDER.filter((id) => !order.includes(id))];
  const hidden = Array.isArray(record.hidden)
    ? [...new Set(record.hidden.filter((id): id is HomeModuleId => DEFAULT_ORDER.includes(id as HomeModuleId)))]
    : [];
  return { order: normalizedOrder, hidden };
}

export function HomeModulePreferences({ layoutId, storageKey, labels, ui, children }: HomeModulePreferencesProps) {
  const [order, setOrder] = useState<HomeModuleId[]>(DEFAULT_ORDER);
  const [hidden, setHidden] = useState<HomeModuleId[]>([]);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const modules = useMemo(() => {
    const map = new Map<HomeModuleId, ReactElement<HomeModuleProps>>();
    Children.toArray(children).forEach((child) => {
      if (!isValidElement<HomeModuleProps>(child)) return;
      if (DEFAULT_ORDER.includes(child.props.id)) map.set(child.props.id, child);
    });
    return map;
  }, [children]);

  useEffect(() => {
    setOrder(DEFAULT_ORDER);
    setHidden([]);
    setLoadedStorageKey(null);
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const preference = normalizePreference(JSON.parse(raw));
        setOrder(preference.order);
        setHidden(preference.hidden);
      }
    } catch {
      // A blocked or malformed local preference leaves the safe defaults.
    } finally {
      setLoadedStorageKey(storageKey);
    }
  }, [storageKey]);

  useEffect(() => {
    if (loadedStorageKey !== storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ order, hidden }));
    } catch {
      // The page remains usable when storage is unavailable.
    }
  }, [hidden, loadedStorageKey, order, storageKey]);

  const toggle = (id: HomeModuleId) => {
    setHidden((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const move = (id: HomeModuleId, direction: -1 | 1) => {
    setOrder((current) => {
      const index = current.indexOf(id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const visibleIds = order.filter((id) => !hiddenSet.has(id) && modules.has(id));
  const visibleModules: ReactNode[] = [];
  for (let index = 0; index < visibleIds.length; index += 1) {
    const id = visibleIds[index];
    const homeModule = modules.get(id);
    if (!homeModule) continue;
    const nextId = visibleIds[index + 1];
    const nextModule = nextId ? modules.get(nextId) : undefined;
    if (isWorkCard(id) && nextModule && isWorkCard(nextId) && id !== nextId) {
      visibleModules.push(
        <div key={`work-card-pair-${id}-${nextId}`} className="grid min-w-0 items-stretch gap-4 xl:grid-cols-2">
          {homeModule}
          {nextModule}
        </div>,
      );
      index += 1;
      continue;
    }
    visibleModules.push(homeModule);
  }

  return (
    <>
      <details className="group relative z-10 mt-4 rounded-lg border border-slate-200 bg-white text-left shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-black text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#002FA7] [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[18px] text-[#002FA7] transition-transform group-open:rotate-90 motion-reduce:transition-none">chevron_right</span>
          <span className="inline-flex min-h-6 items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#002FA7]" aria-hidden="true">tune</span>
            {ui.button}
          </span>
        </summary>
        <div className="border-t border-slate-100 p-4" data-home-preferences-panel="true">
          <p className="text-xs font-semibold leading-5 text-slate-600">{ui.description}</p>
          <h2 className="sr-only">{ui.title}</h2>
          <ul className="mt-3 grid gap-2" aria-label={ui.title}>
            {order.map((id, index) => {
              const isHidden = hiddenSet.has(id);
              return (
                <li key={id} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{labels[id]}</span>
                  <button type="button" className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => move(id, -1)} disabled={index === 0} aria-label={`${labels[id]} ${ui.moveUp}`}>
                    ↑ <span className="sr-only">{ui.moveUp}</span>
                  </button>
                  <button type="button" className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => move(id, 1)} disabled={index === order.length - 1} aria-label={`${labels[id]} ${ui.moveDown}`}>
                    ↓ <span className="sr-only">{ui.moveDown}</span>
                  </button>
                  <button type="button" className="min-h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700" onClick={() => toggle(id)} aria-pressed={!isHidden}>
                    {isHidden ? ui.show : ui.hide}
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="mt-3 min-h-10 rounded-md border border-slate-300 bg-white px-3 text-xs font-black text-slate-800 hover:border-[#002FA7] hover:text-[#002FA7]" onClick={() => { setOrder(DEFAULT_ORDER); setHidden([]); }}>{ui.restore}</button>
        </div>
      </details>
      <div id={layoutId} className="space-y-6">
        {visibleModules.length > 0 ? visibleModules : <p className="rounded-md border border-slate-200 bg-white px-4 py-6 text-center text-sm font-semibold text-slate-600">{ui.empty}</p>}
      </div>
    </>
  );
}
