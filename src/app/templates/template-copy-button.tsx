"use client";

import { useFormStatus } from "react-dom";

export function TemplateCopyButton({ idleLabel, pendingLabel }: { idleLabel: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      aria-live="polite"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-800 hover:bg-slate-50 disabled:cursor-wait disabled:border-blue-300 disabled:bg-blue-50 disabled:text-blue-800"
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{pending ? "progress_activity" : "content_copy"}</span>
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
