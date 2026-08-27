"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/locale";

type LanguageSwitcherProps = {
  locale: Locale;
  labels: Record<Locale, string>;
  label: string;
};

export function LanguageSwitcher({ locale, labels, label }: LanguageSwitcherProps) {
  const router = useRouter();
  const [refreshPending, startTransition] = useTransition();
  const [selectedLocale, setSelectedLocale] = useState<Locale>(locale);
  const [switching, setSwitching] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = switching || refreshPending;

  useEffect(() => {
    setSelectedLocale(locale);
    setFailed(false);
    setSwitching(false);
  }, [locale]);

  return (
    <label
      className={`bd-inline-select-frame inline-flex min-w-[9rem] items-center gap-2 rounded-lg border px-2 py-1 text-xs ${
        failed ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-700"
      }`}
      title={failed ? "Language switch failed. Please try again." : undefined}
    >
      <span className="whitespace-nowrap">{label}</span>
      <select
        value={selectedLocale}
        disabled={pending}
        aria-busy={pending}
        className="min-w-[4.5rem] bg-transparent outline-none disabled:opacity-70"
        onChange={(event) => {
          const nextLocale = event.target.value as Locale;
          setSelectedLocale(nextLocale);
          setFailed(false);
          setSwitching(true);
          void (async () => {
            try {
              const response = await fetch("/api/locale", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ locale: nextLocale }),
                cache: "no-store",
              });
              if (!response.ok) throw new Error("locale_switch_failed");
              startTransition(() => {
                router.refresh();
              });
            } catch {
              setSelectedLocale(locale);
              setFailed(true);
            } finally {
              setSwitching(false);
            }
          })();
        }}
      >
        {Object.entries(labels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {pending ? <span className="material-symbols-outlined text-[14px]">progress_activity</span> : null}
    </label>
  );
}
