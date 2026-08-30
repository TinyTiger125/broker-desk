"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

type SaveFeedback = "idle" | "saved" | "unchanged";

type OfficialTemplateSaveButtonProps = {
  initialFeedback?: Exclude<SaveFeedback, "idle">;
};

const feedbackDurationMs = 3200;

export function OfficialTemplateSaveButton({ initialFeedback }: OfficialTemplateSaveButtonProps) {
  const { pending } = useFormStatus();
  const [feedback, setFeedback] = useState<SaveFeedback>(initialFeedback ?? "idle");

  useEffect(() => {
    if (feedback === "idle") return;
    const timeoutId = window.setTimeout(() => setFeedback("idle"), feedbackDurationMs);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  const state = pending ? "saving" : feedback;
  const isSaved = state === "saved";
  const isUnchanged = state === "unchanged";
  const label = pending
    ? "保存中…"
    : isSaved
      ? "保存しました"
      : isUnchanged
        ? "保存する変更はありません"
        : "公式テンプレートを保存";
  const icon = pending ? "progress_activity" : isSaved ? "check_circle" : isUnchanged ? "info" : "save";

  return (
    <>
      <button
        type="submit"
        disabled={pending || isSaved}
        aria-busy={pending || undefined}
        onClick={(event) => {
          const layoutDirty = event.currentTarget.form?.elements.namedItem("layoutDirty");
          if (!(layoutDirty instanceof HTMLInputElement) || layoutDirty.value !== "true") {
            event.preventDefault();
            setFeedback("unchanged");
            return;
          }
          setFeedback("idle");
        }}
        className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-black text-white shadow-sm transition-all duration-150 active:scale-[0.98] disabled:cursor-wait [&_.material-symbols-outlined]:text-white ${
          pending
            ? "bg-blue-600 shadow-blue-200"
            : isSaved
              ? "bg-emerald-600 shadow-emerald-200"
              : isUnchanged
                ? "bg-slate-600 shadow-slate-200"
                : "bg-violet-800 hover:bg-violet-700"
        }`}
      >
        <span className={`material-symbols-outlined text-[18px] ${pending ? "animate-spin" : ""}`} aria-hidden="true">
          {icon}
        </span>
        {label}
      </button>
      <p className="sr-only" aria-live="polite">
        {state === "idle" ? "" : label}
      </p>
    </>
  );
}
