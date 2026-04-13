"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/lib/locale";

type SearchItem = {
  id: string;
  entity: "property" | "party" | "contract" | "service_request" | "output";
  title: string;
  subtitle?: string;
  href: string;
};

type GlobalSearchBoxProps = {
  locale: Locale;
  placeholder: string;
  labels: {
    loading: string;
    empty: string;
    entities: Record<SearchItem["entity"], string>;
  };
};

function groupByEntity(items: SearchItem[]) {
  const map = new Map<SearchItem["entity"], SearchItem[]>();
  for (const item of items) {
    const list = map.get(item.entity) ?? [];
    list.push(item);
    map.set(item.entity, list);
  }
  return map;
}

export function GlobalSearchBox({ locale, placeholder, labels }: GlobalSearchBoxProps) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    const keyword = q.trim();
    if (!keyword) {
      setItems([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/hub/search?q=${encodeURIComponent(keyword)}&locale=${locale}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error("search request failed");
        const data = (await res.json()) as { items?: SearchItem[] };
        setItems(data.items ?? []);
        setOpen(true);
      } catch {
        setItems([]);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [locale, q]);

  const grouped = useMemo(() => groupByEntity(items), [items]);

  return (
    <div ref={wrapRef} className="relative w-full max-w-md">
      <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
        search
      </span>
      <input
        name="q"
        value={q}
        onChange={(event) => setQ(event.target.value)}
        onFocus={() => setOpen(q.trim().length > 0)}
        placeholder={placeholder}
        className="w-full rounded-lg border-none bg-[#e7edf9] py-2 pl-10 pr-4 text-sm text-slate-700 outline-none ring-blue-500/20 focus:ring"
      />

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-[420px] overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          {loading ? <p className="px-3 py-2 text-xs text-slate-500">{labels.loading}</p> : null}
          {!loading && items.length === 0 ? <p className="px-3 py-2 text-xs text-slate-500">{labels.empty}</p> : null}
          {!loading
            ? (["property", "party", "contract", "service_request", "output"] as const).map((entity) => {
                const list = grouped.get(entity) ?? [];
                if (list.length === 0) return null;
                return (
                  <div key={entity} className="mb-2 last:mb-0">
                    <p className="px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                      {labels.entities[entity]}
                    </p>
                    <div className="space-y-1">
                      {list.map((item) => (
                        <Link
                          key={item.entity + item.id}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
                        >
                          <p className="font-semibold text-slate-900">{item.title}</p>
                          {item.subtitle ? <p className="truncate text-xs text-slate-500">{item.subtitle}</p> : null}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })
            : null}
        </div>
      ) : null}
    </div>
  );
}

