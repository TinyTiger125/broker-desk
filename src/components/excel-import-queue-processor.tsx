"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/locale";

type ExcelImportQueueProcessorProps = {
  jobId: string;
  locale: Locale;
  targetCaseId?: string;
};

const copy = {
  ja: {
    processing: "資料を読み取っています。",
    queued: "資料を受け付けました。読み取り完了後、この画面は自動で更新されます。",
    failed: "資料を読み取れませんでした。もう一度試してください。",
    request: "お問い合わせ時は受付番号をお伝えください。",
    retry: "もう一度読み取る",
  },
  zh: {
    processing: "正在提交资料读取任务。",
    queued: "资料已提交后台读取。完成后本页会自动更新，期间可以离开。",
    failed: "资料读取失败，请重新尝试。",
    request: "如需协助，请提供本次请求编号。",
    retry: "重新读取",
  },
  ko: {
    processing: "자료 읽기 작업을 제출하고 있습니다.",
    queued: "자료 읽기가 접수되었습니다. 완료되면 이 화면이 자동으로 갱신됩니다.",
    failed: "자료를 읽지 못했습니다. 다시 시도해 주세요.",
    request: "도움이 필요하면 이 요청 번호를 알려 주세요.",
    retry: "다시 읽기",
  },
} as const;

type ImportProcessStatus = "submitting" | "queued" | "failed";

type ImportProcessResponse = {
  ok?: boolean;
  status?: "queued" | "processing" | "mapped" | "completed" | "failed";
  errorSummary?: string | null;
  error?: string;
  requestId?: string;
};

/** Starts one import, then waits for the worker before opening the review screen. */
export function ExcelImportQueueProcessor({ jobId, locale, targetCaseId }: ExcelImportQueueProcessorProps) {
  const started = useRef(false);
  const [status, setStatus] = useState<ImportProcessStatus>("submitting");
  const [retryKey, setRetryKey] = useState(0);
  const [requestId, setRequestId] = useState<string | null>(null);

  const openReview = useCallback(() => {
    const target = targetCaseId ? `&targetCaseId=${encodeURIComponent(targetCaseId)}` : "";
    window.location.replace(`/import-center?xlsxJob=${encodeURIComponent(jobId)}&flash=input_extraction_ready${target}`);
  }, [jobId, targetCaseId]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;

    async function processJob() {
      try {
        const response = await fetch(`/api/input-files/${encodeURIComponent(jobId)}/process`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "x-requested-with": "broker-desk" },
        });
        const payload = (await response.json().catch(() => null)) as ImportProcessResponse | null;
        if (cancelled) return;
        if (!response.ok || !payload?.ok) {
          setRequestId(payload?.requestId ?? null);
          throw new Error("excel_import_process_failed");
        }
        if (payload.status === "queued" || payload.status === "processing") {
          setStatus("queued");
          return;
        }
        if (payload.status === "failed") {
          setRequestId(payload.requestId ?? null);
          throw new Error("excel_import_process_failed");
        }
        openReview();
      } catch {
        if (!cancelled) setStatus("failed");
      }
    }

    void processJob();
    return () => {
      cancelled = true;
    };
  }, [jobId, openReview, retryKey]);

  useEffect(() => {
    if (status !== "queued") return;
    let cancelled = false;

    async function pollJob() {
      try {
        const response = await fetch(`/api/input-files/${encodeURIComponent(jobId)}/process`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as ImportProcessResponse | null;
        if (cancelled) return;
        if (!response.ok || !payload?.ok) {
          setRequestId(payload?.requestId ?? null);
          throw new Error("excel_import_status_failed");
        }
        if (payload.status === "queued" || payload.status === "processing") return;
        if (payload.status === "mapped" || payload.status === "completed") {
          openReview();
          return;
        }
        setRequestId(payload.requestId ?? null);
        setStatus("failed");
      } catch {
        if (!cancelled) setStatus("failed");
      }
    }

    void pollJob();
    const interval = window.setInterval(() => void pollJob(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [jobId, openReview, status]);

  if (status === "failed") {
    return (
      <div role="alert" className="border-t border-rose-100 bg-rose-50/60 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-rose-800">{copy[locale].failed}</p>
            {requestId ? <p className="mt-1 text-xs text-rose-700">{copy[locale].request}: {requestId}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => {
              started.current = false;
              setRequestId(null);
              setStatus("submitting");
              setRetryKey((value) => value + 1);
            }}
            className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {copy[locale].retry}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className="border-t border-blue-100 bg-blue-50/60 px-5 py-4">
      <div className="flex items-center gap-3 text-sm font-medium text-blue-900">
        <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
        <span>{status === "queued" ? copy[locale].queued : copy[locale].processing}</span>
      </div>
    </div>
  );
}
