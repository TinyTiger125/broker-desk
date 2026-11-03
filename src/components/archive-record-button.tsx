"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setRecordLifecycleAction, type RecordLifecycleActionFailure } from "@/app/actions";
import { clearListReturnIntent, rememberListReturnIntent, type ListReturnScope } from "@/components/list-return-state";
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
  returnStateScope: ListReturnScope;
  returnFocusKey: string;
  preserveExistingReturnState?: boolean;
};

const labels: Record<Locale, {
  archive: string;
  restore: string;
  archiving: string;
  restoring: string;
  confirmArchive: string;
  confirmRestore: string;
  failure: string;
  accessibleArchive: (recordLabel: string) => string;
  accessibleRestore: (recordLabel: string) => string;
  accessibleArchiving: (recordLabel: string) => string;
  accessibleRestoring: (recordLabel: string) => string;
  archiveHint: string;
  restoreHint: string;
}> = {
  ja: {
    archive: "保管",
    restore: "復元",
    archiving: "保管中…",
    restoring: "復元中…",
    confirmArchive: "「{recordLabel}」を保管しますか？",
    confirmRestore: "「{recordLabel}」を復元しますか？",
    failure: "操作を完了できませんでした。もう一度お試しください。",
    accessibleArchive: (recordLabel) => `${recordLabel}を保管`,
    accessibleRestore: (recordLabel) => `${recordLabel}を復元`,
    accessibleArchiving: (recordLabel) => `${recordLabel}を保管中`,
    accessibleRestoring: (recordLabel) => `${recordLabel}を復元中`,
    archiveHint: "記録は残したまま一時的に保管し、後で復元できます。",
    restoreHint: "保管中の記録を一覧へ戻します。",
  },
  zh: {
    archive: "归档",
    restore: "恢复",
    archiving: "归档中…",
    restoring: "恢复中…",
    confirmArchive: "要归档“{recordLabel}”吗？",
    confirmRestore: "要恢复“{recordLabel}”吗？",
    failure: "操作未完成，请重试。",
    accessibleArchive: (recordLabel) => `归档“${recordLabel}”`,
    accessibleRestore: (recordLabel) => `恢复“${recordLabel}”`,
    accessibleArchiving: (recordLabel) => `正在归档“${recordLabel}”`,
    accessibleRestoring: (recordLabel) => `正在恢复“${recordLabel}”`,
    archiveHint: "记录会保留在系统中，仅作保管，之后仍可恢复。",
    restoreHint: "将已归档记录恢复到当前列表。",
  },
  ko: {
    archive: "보관",
    restore: "복원",
    archiving: "보관 중…",
    restoring: "복원 중…",
    confirmArchive: "“{recordLabel}” 기록을 보관할까요?",
    confirmRestore: "“{recordLabel}” 기록을 복원할까요?",
    failure: "작업을 완료하지 못했습니다. 다시 시도해 주세요.",
    accessibleArchive: (recordLabel) => `${recordLabel} 보관`,
    accessibleRestore: (recordLabel) => `${recordLabel} 복원`,
    accessibleArchiving: (recordLabel) => `${recordLabel} 보관 중`,
    accessibleRestoring: (recordLabel) => `${recordLabel} 복원 중`,
    archiveHint: "기록을 남긴 채 보관하며 나중에 복원할 수 있습니다.",
    restoreHint: "보관된 기록을 현재 목록으로 되돌립니다.",
  },
};

export function ArchiveRecordButton({
  entityType,
  entityId,
  recordLabel,
  status,
  locale,
  returnTo,
  returnStateScope,
  returnFocusKey,
  preserveExistingReturnState = false,
}: ArchiveRecordButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [failureCode, setFailureCode] = useState<RecordLifecycleActionFailure["code"] | undefined>(undefined);
  const errorRef = useRef<HTMLDivElement>(null);
  const copy = labels[locale];
  const isArchived = status === "archived";

  useEffect(() => {
    if (failureCode) errorRef.current?.focus();
  }, [failureCode]);

  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
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
          setFailureCode(undefined);
          rememberListReturnIntent({
            listUrl: returnTo,
            scope: returnStateScope,
            triggerKey: returnFocusKey,
            preserveExisting: preserveExistingReturnState,
          });
          const formData = new FormData();
          formData.set("entityType", entityType);
          formData.set("entityId", entityId);
          formData.set("status", isArchived ? "active" : "archived");
          formData.set("returnTo", returnTo);
          startTransition(async () => {
            let result: Awaited<ReturnType<typeof setRecordLifecycleAction>>;
            try {
              result = await setRecordLifecycleAction(formData);
            } catch (error) {
              clearListReturnIntent({ listUrl: returnTo, scope: returnStateScope });
              throw error;
            }
            if (result?.status === "error") {
              clearListReturnIntent({ listUrl: returnTo, scope: returnStateScope });
              setFailureCode(result.code);
            }
          });
        }}
      >
        {isPending ? (isArchived ? copy.restoring : copy.archiving) : isArchived ? copy.restore : copy.archive}
      </Button>
      <p data-list-row-ignore className="max-w-64 text-[11px] leading-4 text-slate-500">{isArchived ? copy.restoreHint : copy.archiveHint}</p>
      {failureCode ? (
        <div
          ref={errorRef}
          role="alert"
          data-list-row-ignore
          aria-live="assertive"
          tabIndex={-1}
          className="max-w-80 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium leading-6 text-rose-800 break-words focus-visible:outline focus-visible:outline-[length:var(--bd-focus-ring-width)] focus-visible:outline-[color:var(--bd-focus-ring-color)] focus-visible:outline-offset-[length:var(--bd-focus-ring-offset)]"
        >
          {copy.failure}
        </div>
      ) : null}
    </div>
  );
}
