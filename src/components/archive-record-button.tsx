"use client";

import { useTransition } from "react";
import { setRecordLifecycleAction } from "@/app/actions";
import { Button } from "@/components/ui-foundation";
import type { Locale } from "@/lib/locale";
import type { LifecycleStatus } from "@/lib/record-lifecycle";

type ArchiveRecordButtonProps = {
  entityType: "case" | "party" | "property";
  entityId: string;
  recordLabel: string;
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
  accessibleArchive: (recordLabel: string) => string;
  accessibleRestore: (recordLabel: string) => string;
  accessibleArchiving: (recordLabel: string) => string;
  accessibleRestoring: (recordLabel: string) => string;
}> = {
  ja: {
    archive: "保管",
    restore: "復元",
    archiving: "保管中…",
    restoring: "復元中…",
    confirmArchive: "「{recordLabel}」を保管しますか？",
    confirmRestore: "「{recordLabel}」を復元しますか？",
    accessibleArchive: (recordLabel) => `${recordLabel}を保管`,
    accessibleRestore: (recordLabel) => `${recordLabel}を復元`,
    accessibleArchiving: (recordLabel) => `${recordLabel}を保管中`,
    accessibleRestoring: (recordLabel) => `${recordLabel}を復元中`,
  },
  zh: {
    archive: "归档",
    restore: "恢复",
    archiving: "归档中…",
    restoring: "恢复中…",
    confirmArchive: "要归档“{recordLabel}”吗？",
    confirmRestore: "要恢复“{recordLabel}”吗？",
    accessibleArchive: (recordLabel) => `归档“${recordLabel}”`,
    accessibleRestore: (recordLabel) => `恢复“${recordLabel}”`,
    accessibleArchiving: (recordLabel) => `正在归档“${recordLabel}”`,
    accessibleRestoring: (recordLabel) => `正在恢复“${recordLabel}”`,
  },
  ko: {
    archive: "보관",
    restore: "복원",
    archiving: "보관 중…",
    restoring: "복원 중…",
    confirmArchive: "“{recordLabel}” 기록을 보관할까요?",
    confirmRestore: "“{recordLabel}” 기록을 복원할까요?",
    accessibleArchive: (recordLabel) => `${recordLabel} 보관`,
    accessibleRestore: (recordLabel) => `${recordLabel} 복원`,
    accessibleArchiving: (recordLabel) => `${recordLabel} 보관 중`,
    accessibleRestoring: (recordLabel) => `${recordLabel} 복원 중`,
  },
};

export function ArchiveRecordButton({ entityType, entityId, recordLabel, status, locale, returnTo }: ArchiveRecordButtonProps) {
  const [isPending, startTransition] = useTransition();
  const copy = labels[locale];
  const isArchived = status === "archived";

  return (
    <Button
      type="button"
      tone={isArchived ? "quiet" : "warning"}
      controlSize="touch"
      loading={isPending}
      aria-label={isPending
        ? isArchived ? copy.accessibleRestoring(recordLabel) : copy.accessibleArchiving(recordLabel)
        : isArchived ? copy.accessibleRestore(recordLabel) : copy.accessibleArchive(recordLabel)}
      onClick={(event) => {
        event.stopPropagation();
        const confirmMessage = (isArchived ? copy.confirmRestore : copy.confirmArchive).replace("{recordLabel}", recordLabel);
        if (!window.confirm(confirmMessage)) return;
        const formData = new FormData();
        formData.set("entityType", entityType);
        formData.set("entityId", entityId);
        formData.set("status", isArchived ? "active" : "archived");
        formData.set("returnTo", returnTo);
        startTransition(async () => {
          await setRecordLifecycleAction(formData);
        });
      }}
    >
      {isPending ? (isArchived ? copy.restoring : copy.archiving) : isArchived ? copy.restore : copy.archive}
    </Button>
  );
}
