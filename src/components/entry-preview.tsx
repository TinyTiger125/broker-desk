"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { previewEntryDocumentsAction } from "@/app/entry-preview-actions";
import { entryFileKey, type EntryPreviewState } from "@/lib/entry-preview";
import type { Locale } from "@/lib/locale";

export type EntryPreviewKind = "customer" | "property";
export type EntryPreviewCandidate = EntryPreviewState["candidates"][number];

type EntryPreviewProps = {
  files: File[];
  kind: EntryPreviewKind;
  context?: "entry" | "case";
  locale: Locale;
  onConfirm: (candidate: EntryPreviewCandidate) => void;
  onReadFileKeys: (keys: string[]) => void;
};

const copy = {
  ja: {
    title: "資料を先に読み取る",
    description: "候補を確認してから、必要な項目だけフォームへ反映します。保存するまで顧客・物件は作成されません。",
    read: "候補を読み取る",
    retry: "未読資料を再試行",
    readComplete: "読み取り済み",
    reading: "読み取り中…",
    noFiles: "先に資料を選択してください。",
    ready: "読み取り結果を確認してください。",
    empty: "確認できる候補はありません。資料は保存時に添付できます。",
    confirm: "反映",
    confirmed: "反映済み",
    reject: "採用しない",
    rejected: "不採用",
    source: "出典",
    page: "ページ",
    uncertainty: "確認が必要",
    uncertaintyReasons: { unclear: "判読が不確か", conflict: "資料間で不一致", not_found: "資料に記載なし" },
    failed: "資料を読み取れませんでした。ファイルを確認して再試行してください。",
  },
  zh: {
    title: "先读取资料",
    description: "先核对候选值，只把需要的项目写入表单。保存前不会创建客户或物件。",
    read: "读取候选",
    retry: "重试未读取资料",
    readComplete: "资料已读取",
    reading: "读取中…",
    noFiles: "请先选择资料。",
    ready: "请核对读取结果。",
    empty: "没有可确认的候选值。资料仍可在保存时归档。",
    confirm: "反映",
    confirmed: "已反映",
    reject: "不采用",
    rejected: "已拒绝",
    source: "来源",
    page: "页",
    uncertainty: "需要确认",
    uncertaintyReasons: { unclear: "文字不清晰", conflict: "文件内容不一致", not_found: "资料未记载" },
    failed: "资料读取失败。请检查文件后重试。",
  },
  ko: {
    title: "자료 먼저 읽기",
    description: "후보를 확인한 뒤 필요한 항목만 양식에 반영합니다. 저장 전에는 고객이나 매물이 생성되지 않습니다.",
    read: "후보 읽기",
    retry: "읽지 못한 자료 재시도",
    readComplete: "자료 읽기 완료",
    reading: "읽는 중…",
    noFiles: "먼저 자료를 선택해 주세요.",
    ready: "읽기 결과를 확인해 주세요.",
    empty: "확인할 후보가 없습니다. 자료는 저장할 때 첨부할 수 있습니다.",
    confirm: "반영",
    confirmed: "반영됨",
    reject: "채택하지 않음",
    rejected: "거부됨",
    source: "출처",
    page: "페이지",
    uncertainty: "확인 필요",
    uncertaintyReasons: { unclear: "판독 불확실", conflict: "자료 간 불일치", not_found: "자료에 없음" },
    failed: "자료를 읽지 못했습니다. 파일을 확인한 뒤 다시 시도해 주세요.",
  },
} as const;

export function buildEntryPreviewFormData(files: readonly File[], kind: EntryPreviewKind, context?: "entry" | "case") {
  const formData = new FormData();
  formData.set("previewKind", kind);
  if (context) formData.set("previewContext", context);
  files.forEach((file) => formData.append("uploadFile", file));
  return formData;
}

export function applyEntryPreviewCandidate<T extends Record<string, string>>(current: T, candidate: Pick<EntryPreviewCandidate, "key" | "value">): T {
  return candidate.key in current ? { ...current, [candidate.key]: candidate.value } : current;
}

export function mergeEntryPreviewStates(previous: EntryPreviewState | undefined, incoming: EntryPreviewState): EntryPreviewState {
  const candidates = new Map<string, EntryPreviewCandidate>();
  for (const candidate of previous?.candidates ?? []) candidates.set(candidate.id, candidate);
  for (const candidate of incoming.candidates) candidates.set(candidate.id, candidate);
  const readProofs = { ...(previous?.readProofs ?? {}), ...(incoming.readProofs ?? {}) };
  return {
    ...incoming,
    candidates: [...candidates.values()],
    readFileKeys: [...new Set([...(previous?.readFileKeys ?? []), ...incoming.readFileKeys])],
    ...(Object.keys(readProofs).length > 0 ? { readProofs } : {}),
  };
}

export function getUnreadEntryFiles(files: readonly File[], readFileKeys: readonly string[]): File[] {
  const read = new Set(readFileKeys);
  return files.filter((file) => !read.has(entryFileKey(file)));
}

export function EntryPreview({ files, kind, context, locale, onConfirm, onReadFileKeys }: EntryPreviewProps) {
  const text = copy[locale];
  const [preview, setPreview] = useState<{ files: File[]; kind: EntryPreviewKind; context?: "entry" | "case"; state: EntryPreviewState }>();
  const [decisions, setDecisions] = useState<{ files: File[]; kind: EntryPreviewKind; context?: "entry" | "case"; values: Record<string, "confirmed" | "rejected"> }>();
  const [pending, startTransition] = useTransition();
  const requestIdRef = useRef(0);
  const pendingRef = useRef(false);

  useEffect(() => {
    requestIdRef.current += 1;
    pendingRef.current = false;
    onReadFileKeys([]);
  // The callback belongs to the parent form; file object identity, rather than callback identity, resets read keys.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, kind, context]);

  const read = () => {
    if (pending || pendingRef.current) return;
    if (!files.length) {
      setPreview({ files, kind, context, state: { status: "error", candidates: [], readFileKeys: [], message: text.noFiles } });
      onReadFileKeys([]);
      return;
    }
    const previous = preview?.files === files && preview.kind === kind && preview.context === context ? preview.state : undefined;
    const readFileKeys = new Set(previous?.readFileKeys ?? []);
    const filesToRead = getUnreadEntryFiles(files, [...readFileKeys]);
    if (!filesToRead.length) return;
    const requestId = ++requestIdRef.current;
    const formData = buildEntryPreviewFormData(filesToRead, kind, context);
    pendingRef.current = true;
    startTransition(() => {
      void previewEntryDocumentsAction(formData).then((result) => {
        if (requestId !== requestIdRef.current) return;
        const merged = mergeEntryPreviewStates(previous, result);
        setPreview({ files, kind, context, state: merged });
        setDecisions((current) => ({ files, kind, context, values: current?.files === files && current.kind === kind && current.context === context ? current.values : {} }));
        onReadFileKeys(merged.readFileKeys);
      }).catch(() => {
        if (requestId !== requestIdRef.current) return;
        const merged = mergeEntryPreviewStates(previous, { status: "error", candidates: [], readFileKeys: [], message: text.failed });
        setPreview({ files, kind, context, state: merged });
        onReadFileKeys(merged.readFileKeys);
      }).finally(() => {
        if (requestId === requestIdRef.current) pendingRef.current = false;
      });
    });
  };

  const activePreview = preview?.files === files && preview.kind === kind && preview.context === context ? preview.state : undefined;
  const activeDecisions = decisions?.files === files && decisions.kind === kind && decisions.context === context ? decisions.values : {};
  const unreadFiles = getUnreadEntryFiles(files, activePreview?.readFileKeys ?? []);
  const allFilesRead = files.length > 0 && unreadFiles.length === 0;
  const decisionFor = (candidate: EntryPreviewCandidate) => activeDecisions[candidate.id];
  const confirm = (candidate: EntryPreviewCandidate) => {
    if (decisionFor(candidate)) return;
    onConfirm(candidate);
    setDecisions((current) => ({ files, kind, context, values: { ...(current?.files === files && current.kind === kind && current.context === context ? current.values : {}), [candidate.id]: "confirmed" } }));
  };
  const reject = (candidate: EntryPreviewCandidate) => {
    if (decisionFor(candidate)) return;
    setDecisions((current) => ({ files, kind, context, values: { ...(current?.files === files && current.kind === kind && current.context === context ? current.values : {}), [candidate.id]: "rejected" } }));
  };

  return (
    <section aria-labelledby="entry-preview-heading" className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
      <input type="hidden" name="entryReadProofs" value={JSON.stringify(activePreview?.readProofs ?? {})} />
      <input type="hidden" name="entryPreviewDecisions" value={JSON.stringify(activeDecisions)} />
      <div>
        <h2 id="entry-preview-heading" className="text-sm font-black text-slate-950">{text.title}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-600">{text.description}</p>
      </div>
      <button type="button" onClick={read} disabled={pending || allFilesRead} className="min-h-11 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-800 disabled:cursor-wait disabled:opacity-60">
        {pending ? text.reading : allFilesRead ? text.readComplete : activePreview?.status === "error" && activePreview.readFileKeys.length > 0 ? text.retry : text.read}
      </button>
      {activePreview?.status === "error" ? <p role="alert" className="text-xs font-bold text-rose-700">{activePreview.message ?? text.failed}</p> : null}
      {activePreview && (activePreview.status === "ready" || activePreview.candidates.length > 0) ? (
        <div className="space-y-2" aria-live="polite">
          <p className="text-xs font-semibold text-slate-700">{text.ready}</p>
          {activePreview.status === "ready" && activePreview.candidates.length === 0 ? <p className="text-xs text-slate-600">{text.empty}</p> : activePreview.candidates.length > 0 ? (
            <ul className="space-y-2">
              {activePreview.candidates.map((candidate) => {
                const decision = decisionFor(candidate);
                return (
                  <li key={candidate.id} className="rounded-lg border border-indigo-100 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-bold text-slate-950">{candidate.label}</p>
                        <p className="break-words text-sm text-slate-800">{candidate.value}</p>
                        <p className="text-xs text-slate-500">{text.source}: {candidate.fileName}{candidate.pageNumber == null ? "" : ` · ${text.page} ${candidate.pageNumber}`}</p>
                        {candidate.sourceText ? <p className="text-xs leading-5 text-slate-600">{candidate.sourceText}</p> : null}
                        {candidate.uncertainty && candidate.uncertainty !== "clear" ? <p className="text-xs font-semibold text-amber-700">{text.uncertainty}: {text.uncertaintyReasons[candidate.uncertainty as keyof typeof text.uncertaintyReasons] ?? candidate.uncertainty}</p> : null}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={() => confirm(candidate)} disabled={Boolean(decision)} className="rounded-md bg-slate-950 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{decision === "confirmed" ? text.confirmed : text.confirm}</button>
                        <button type="button" onClick={() => reject(candidate)} disabled={Boolean(decision)} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-60">{decision === "rejected" ? text.rejected : text.reject}</button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
