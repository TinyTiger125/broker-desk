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
    failed: "資料の処理を完了できませんでした。",
    request: "お問い合わせ時は受付番号をお伝えください。",
    retry: "安全に再試行",
    retryable: "一時的な処理失敗です。資料を再送せず、このジョブを再試行できます。",
    unsupported: "このファイルまたは入力元は現在の読取対象外です。対応する資料を選び直してください。",
    needsFix: "内容または項目設定の確認が必要です。修正してから続行してください。",
    unavailable: "読取サービスが一時的に利用できません。ジョブを残したまま、時間をおいて再試行してください。",
    auth: "権限またはログイン状態を確認してください。安全な入口へ戻って再度お試しください。",
    notFound: "この読取記録は見つかりません。読込入口から新しい資料を選んでください。",
    unknown: "原因を特定できない処理エラーです。受付番号を添えて確認してください。",
  },
  zh: {
    processing: "正在提交资料读取任务。",
    queued: "资料已提交后台读取。完成后本页会自动更新，期间可以离开。",
    failed: "资料处理未能完成。",
    request: "如需协助，请提供本次请求编号。",
    retry: "安全重试",
    retryable: "这是暂时的处理失败。可以重试这条任务，不会重新上传资料。",
    unsupported: "此文件或来源暂不支持，请更换资料。",
    needsFix: "需要修正资料内容或字段映射后再继续。",
    unavailable: "读取服务暂时不可用。任务和 request ID 已保留，请稍后重试。",
    auth: "请检查权限或登录状态，返回安全入口后再试。",
    notFound: "找不到这条读取记录，请返回资料入口重新选择。",
    unknown: "无法可靠判断失败原因。请保留 request ID 后联系支持。",
  },
  ko: {
    processing: "자료 읽기 작업을 제출하고 있습니다.",
    queued: "자료 읽기가 접수되었습니다. 완료되면 이 화면이 자동으로 갱신됩니다.",
    failed: "자료 처리를 완료하지 못했습니다.",
    request: "도움이 필요하면 이 요청 번호를 알려 주세요.",
    retry: "안전하게 재시도",
    retryable: "일시적인 처리 실패입니다. 자료를 다시 업로드하지 않고 이 작업을 재시도할 수 있습니다.",
    unsupported: "이 파일 또는 출처는 지원되지 않습니다. 다른 자료를 선택해 주세요.",
    needsFix: "내용 또는 필드 매핑을 수정한 뒤 계속해 주세요.",
    unavailable: "읽기 서비스를 잠시 사용할 수 없습니다. 작업과 request ID를 보존한 채 나중에 재시도해 주세요.",
    auth: "권한 또는 로그인 상태를 확인한 뒤 안전한 입구에서 다시 시도해 주세요.",
    notFound: "읽기 기록을 찾을 수 없습니다. 자료 입구에서 새 자료를 선택해 주세요.",
    unknown: "실패 원인을 안정적으로 판단할 수 없습니다. request ID를 남겨 지원팀에 문의해 주세요.",
  },
} as const;

type ImportProcessStatus = "submitting" | "queued" | "failed";
type ImportErrorKind = "retryable" | "unsupported" | "needsFix" | "unavailable" | "auth" | "notFound" | "unknown";

type ImportProcessResponse = {
  ok?: boolean;
  status?: "queued" | "processing" | "mapped" | "completed" | "failed";
  errorCode?: string | null;
  errorSummary?: string | null;
  error?: string;
  requestId?: string;
};

function classifyImportError(errorCode: string | null | undefined, httpStatus?: number): ImportErrorKind {
  const code = String(errorCode ?? "").toLowerCase();
  if (httpStatus === 404 || code === "import_job_not_found") return "notFound";
  if (httpStatus === 401 || httpStatus === 403 || /unauthor|forbidden|session|tenant|permission/.test(code)) return "auth";
  if (httpStatus === 503 || /unavailable/.test(code)) return "unavailable";
  if (code === "unsupported_import_source" || /unsupported|invalid.*(file|source)|file_type/.test(code)) return "unsupported";
  if (/mapping|validation|format|content|parse|xlsx_(sheet|cell)_limit/.test(code)) return "needsFix";
  return "unknown";
}

/** Starts one import, then waits for the worker before opening the review screen. */
export function ExcelImportQueueProcessor({ jobId, locale, targetCaseId }: ExcelImportQueueProcessorProps) {
  const started = useRef(false);
  const [status, setStatus] = useState<ImportProcessStatus>("submitting");
  const [retryKey, setRetryKey] = useState(0);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ImportErrorKind>("unknown");
  const [errorSummary, setErrorSummary] = useState<string | null>(null);

  const openReview = useCallback(() => {
    const target = targetCaseId ? `&targetCaseId=${encodeURIComponent(targetCaseId)}` : "";
    window.location.replace(`/import-center?xlsxJob=${encodeURIComponent(jobId)}&flash=input_extraction_ready${target}`);
  }, [jobId, targetCaseId]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;

    async function processJob() {
      let classifiedError = false;
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
          setErrorKind(classifyImportError(payload?.errorCode ?? payload?.error, response.status));
          setErrorSummary(payload?.errorSummary ?? null);
          classifiedError = true;
          throw new Error("excel_import_process_failed");
        }
        if (payload.status === "queued" || payload.status === "processing") {
          setStatus("queued");
          return;
        }
        if (payload.status === "failed") {
          setRequestId(payload.requestId ?? null);
          setErrorKind(classifyImportError(payload.errorCode ?? payload.error));
          setErrorSummary(payload.errorSummary ?? null);
          classifiedError = true;
          throw new Error("excel_import_process_failed");
        }
        openReview();
      } catch {
        if (!cancelled) {
          if (!classifiedError) setErrorKind("retryable");
          setStatus("failed");
        }
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
      let classifiedError = false;
      try {
        const response = await fetch(`/api/input-files/${encodeURIComponent(jobId)}/process`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as ImportProcessResponse | null;
        if (cancelled) return;
        if (!response.ok || !payload?.ok) {
          setRequestId(payload?.requestId ?? null);
          setErrorKind(classifyImportError(payload?.errorCode ?? payload?.error, response.status));
          setErrorSummary(payload?.errorSummary ?? null);
          classifiedError = true;
          throw new Error("excel_import_status_failed");
        }
        if (payload.status === "queued" || payload.status === "processing") return;
        if (payload.status === "mapped" || payload.status === "completed") {
          openReview();
          return;
        }
        setRequestId(payload.requestId ?? null);
        setErrorKind(classifyImportError(payload.errorCode ?? payload.error));
        setErrorSummary(payload.errorSummary ?? null);
        setStatus("failed");
      } catch {
        if (!cancelled) {
          if (!classifiedError) setErrorKind("retryable");
          setStatus("failed");
        }
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
    const canRetry = errorKind === "retryable" || errorKind === "unavailable";
    const recoveryHref = "/import-center#source-upload";
    const recoveryLabel =
      errorKind === "needsFix"
        ? locale === "zh"
          ? "返回资料入口修正后继续"
          : locale === "ko"
            ? "자료 입구로 돌아가 수정 후 계속"
            : "資料入口に戻って修正する"
        : locale === "zh"
          ? "返回资料入口"
          : locale === "ko"
            ? "자료 입구로 돌아가기"
            : "資料入口へ戻る";
    return (
      <div role="alert" className="border-t border-rose-100 bg-rose-50/60 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-rose-800">{copy[locale].failed}</p>
            <p className="mt-1 text-xs leading-5 text-rose-800">{copy[locale][errorKind]}</p>
            {errorSummary ? <p className="mt-1 text-xs text-rose-700">{errorSummary}</p> : null}
            {requestId ? <p className="mt-1 text-xs text-rose-700">{copy[locale].request}: {requestId}</p> : null}
          </div>
          {canRetry ? (
            <button
              type="button"
              onClick={() => {
                started.current = false;
                setRequestId(null);
                setErrorKind("unknown");
                setErrorSummary(null);
                setStatus("submitting");
                setRetryKey((value) => value + 1);
              }}
              className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {copy[locale].retry}
            </button>
          ) : (
            <a href={recoveryHref} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              {recoveryLabel}
            </a>
          )}
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
