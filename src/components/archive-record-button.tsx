"use client";

import { useTransition } from "react";
import { setRecordLifecycleAction } from "@/app/actions";
import type { Locale } from "@/lib/locale";
import type { LifecycleStatus } from "@/lib/record-lifecycle";

type ArchiveRecordButtonProps = {
  entityType: "case" | "party" | "property";
  entityId: string;
  status: LifecycleStatus;
  locale: Locale;
  returnTo: string;
};

const labels: Record<Locale, {
  archive: string;
  restore: string;
  archiving: string;
  restoring: string;
  confirmArchive: string;
  confirmRestore: string;
}> = {
  ja: {
    archive: "保管",
    restore: "復元",
    archiving: "保管中…",
    restoring: "復元中…",
    confirmArchive: "この記録を保管しますか？",
    confirmRestore: "この記録を復元しますか？",
  },
  zh: {
    archive: "归档",
    restore: "恢复",
    archiving: "归档中…",
    restoring: "恢复中…",
    confirmArchive: "要归档这条记录吗？",
    confirmRestore: "要恢复这条记录吗？",
  },
  ko: {
    archive: "보관",
    restore: "복원",
    archiving: "보관 중…",
    restoring: "복원 중…",
    confirmArchive: "이 기록을 보관할까요?",
    confirmRestore: "이 기록을 복원할까요?",
  },
};

export function ArchiveRecordButton({ entityType, entityId, status, locale, returnTo }: ArchiveRecordButtonProps) {
  const [isPending, startTransition] = useTransition();
  const copy = labels[locale];
  const isArchived = status === "archived";

  return (
    <button
      type="button"
      disabled={isPending}
      className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
      onClick={(event) => {
        event.stopPropagation();
        if (!window.confirm(isArchived ? copy.confirmRestore : copy.confirmArchive)) return;
        const formData = new FormData();
        formData.set("entityType", entityType);
        formData.set("entityId", entityId);
        formData.set("status", isArchived ? "active" : "archived");
        formData.set("returnTo", returnTo);
        startTransition(() => {
          void setRecordLifecycleAction(formData);
        });
      }}
    >
      {isPending ? (isArchived ? copy.restoring : copy.archiving) : isArchived ? copy.restore : copy.archive}
    </button>
  );
}
