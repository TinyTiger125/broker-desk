"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/locale";

type LanguageSwitcherProps = {
  locale: Locale;
  labels: Record<Locale, string>;
  label: string;
};

export function LanguageSwitcher({ locale, labels, label }: LanguageSwitcherProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="inline-flex min-w-[9rem] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
      <span className="whitespace-nowrap">{label}</span>
      <select
        value={locale}
        disabled={pending}
        className="min-w-[4.5rem] bg-transparent outline-none"
        onChange={(event) => {
          const nextLocale = event.target.value as Locale;
          startTransition(async () => {
            await fetch("/api/locale", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ locale: nextLocale }),
            });
            router.refresh();
          });
        }}
      >
        {Object.entries(labels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
