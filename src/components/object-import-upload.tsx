"use client";

import { useFormStatus } from "react-dom";
import type { Locale } from "@/lib/locale";

const copy = {
  ja: { submit: "解析", processing: "読み取り中…", file: "資料ファイルを選択" },
  zh: { submit: "解析", processing: "正在读取…", file: "选择资料文件" },
  ko: { submit: "읽기", processing: "읽는 중…", file: "자료 파일 선택" },
} as const;

function UploadFormContents({ locale, caseId, targetType, targetId }: { locale: Locale; caseId: string; targetType: "party" | "property"; targetId: string }) {
  const { pending } = useFormStatus();
  const text = copy[locale];
  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <label className="inline-flex min-h-11 min-w-0 max-w-full items-center text-[11px] font-semibold text-slate-600">
        <span className="sr-only">{text.file}</span>
        <input name="uploadFile" type="file" required disabled={pending} className="block min-h-11 min-w-0 max-w-full text-xs text-slate-700 file:mr-2 file:rounded-md file:border-0 file:bg-slate-200 file:px-2.5 file:py-2 file:text-xs file:font-bold file:text-slate-800" />
      </label>
      <button type="submit" disabled={pending} aria-disabled={pending} className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-2.5 py-2 text-xs font-bold text-slate-800 disabled:cursor-wait disabled:opacity-60">
        {pending ? text.processing : text.submit}
      </button>
      {pending ? <span role="status" aria-live="polite" className="basis-full text-[11px] font-semibold text-blue-700 sm:basis-auto">{text.processing}</span> : null}
    </div>
  );
}

export function ObjectImportUpload({ action, caseId, targetType, targetId, locale = "ja" }: { action: (data: FormData) => Promise<void>; caseId: string; targetType: "party" | "property"; targetId: string; locale?: Locale }) {
  return (
    <form action={action}>
      <UploadFormContents locale={locale} caseId={caseId} targetType={targetType} targetId={targetId} />
    </form>
  );
}
