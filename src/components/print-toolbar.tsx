"use client";

import type { Locale } from "@/lib/locale";

type PrintToolbarProps = {
  locale?: Locale;
};

const printLabel = {
  ja: "印刷 / PDF保存",
  zh: "打印 / 保存 PDF",
  ko: "인쇄 / PDF 저장",
} as const;

export function PrintToolbar({ locale = "ja" }: PrintToolbarProps) {
  return (
    <div className="mb-4 flex items-center justify-end gap-2 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        {printLabel[locale]}
      </button>
    </div>
  );
}
