"use client";

import { useActionState, useEffect, useRef } from "react";
import { deletePreimportUploadAction } from "@/app/import-center/actions";
import type { Locale } from "@/lib/locale";

const copy = {
  ja: {
    title: "未取込の原本を削除", confirm: "原本と読取記録を削除することを確認しました。",
    warning: "元に戻せません。物件登録を始めていない、このファイルだけを削除します。監査記録は残ります。",
    submit: "原本を削除", pending: "削除中…",
  },
  zh: {
    title: "删除尚未导入的原件", confirm: "我确认删除原件和读取记录。",
    warning: "此操作不可撤销。仅删除尚未开始物件导入的当前文件，审计记录保留。",
    submit: "删除原件", pending: "正在删除…",
  },
  ko: {
    title: "가져오기 전 원본 삭제", confirm: "원본과 읽기 기록 삭제를 확인했습니다.",
    warning: "되돌릴 수 없습니다. 매물 등록을 시작하지 않은 현재 파일만 삭제하며 감사 기록은 남습니다.",
    submit: "원본 삭제", pending: "삭제 중…",
  },
} satisfies Record<Locale, Record<"title" | "confirm" | "warning" | "submit" | "pending", string>>;

export function PreimportUploadDelete({ jobId, locale }: { jobId: string; locale: Locale }) {
  const [state, action, pending] = useActionState(deletePreimportUploadAction, { error: "", attempt: 0 });
  const errorRef = useRef<HTMLParagraphElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!state.error) return;
    // Native details may have been collapsed while the action was pending.
    // Reveal the target before focusing; retain the form and selected job.
    if (detailsRef.current) detailsRef.current.open = true;
    errorRef.current?.focus();
    errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [state]);
  const c = copy[locale];
  return (
    <details ref={detailsRef} className="border-t border-slate-200 p-5">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-red-700">{c.title}</summary>
      <form action={action} className="mt-3 grid gap-3" aria-busy={pending}>
        <input type="hidden" name="jobId" value={jobId} />
        <p className="text-sm text-slate-600">{c.warning}</p>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" name="confirm" value="delete-original" required disabled={pending} />
          {c.confirm}
        </label>
        {state.error ? <p role="alert" aria-live="assertive" aria-atomic="true" tabIndex={-1} ref={errorRef} className="text-sm text-red-700">{state.error}</p> : null}
        <button type="submit" disabled={pending} className="ui-button-stable min-h-11 min-w-11 justify-self-start rounded-lg border border-red-300 px-4 text-sm font-semibold text-red-700 disabled:opacity-50">
          {pending ? c.pending : c.submit}
        </button>
      </form>
    </details>
  );
}
