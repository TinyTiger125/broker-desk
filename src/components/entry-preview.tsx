"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { previewEntryDocumentsAction } from "@/app/entry-preview-actions";
import { entryFileKey, safeEntryPreviewCandidates, type EntryPreviewState } from "@/lib/entry-preview";
import type { Locale } from "@/lib/locale";

export type EntryPreviewKind = "customer" | "property";
export type EntryPreviewCandidate = EntryPreviewState["candidates"][number];

/** Generate once per mounted new-entry form; browser retries keep this value. */
export function createEntryIntentId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type EntryPreviewProps = {
  files: File[];
  kind: EntryPreviewKind;
  context?: "entry" | "case";
  locale: Locale;
  onConfirm: (candidate: EntryPreviewCandidate) => void;
  onReadFileKeys: (keys: string[]) => void;
  onReadComplete?: (state: EntryPreviewState) => void;
};

const copy = {
  ja: {
    title: "資料を読み取り、正式記録に保存する",
    description: "読み取り完了後、判読できて不一致のない既存項目は正式記録へ自動保存します。氏名など必須項目が不足する場合は、内容を保持して補完後に保存します。保存後も編集・再確認できます。",
    descriptionCase: "読み取り完了後、判読できて不一致のない既存項目は正式な案件記録へ自動保存します。案件名が不足する場合は、案件名を補完してから保存してください。保存後も編集・再確認できます。",
    descriptionProperty: "読み取り完了後、判読できて不一致のない既存項目は正式記録へ自動保存します。物件名が不足する場合は、現在の画面に候補と原本を保持します。物件名を補完して保存すると原本を正式記録へ保管します。保存後も編集・再確認できます。",
    read: "資料を読み取って保存",
    retry: "未読資料を再試行",
    readComplete: "読み取り完了",
    reading: "読み取り中…",
    noFiles: "先に資料を選択してください。",
    ready: "読み取り完了。判読できて不一致のない項目を正式記録へ反映しました。必須項目が不足する場合は補完後に保存します。",
    readyProperty: "読み取り完了。判読できて不一致のない項目を正式記録へ反映しました。物件名が不足する場合は補完後に保存します。",
    empty: "確認できる候補はありません。正式記録は作成していません。原本は手入力で保存すると正式記録に添付されます。",
    needsReview: "候補はありますが、自動保存できる確実な値がありません。正式記録は作成していないため、内容を確認してフォームへ手入力してください。",
    needsPropertyName: "明確な候補がありますが、物件名が不足しています。現在の画面に候補と原本を保持しています。物件名を補って保存すると原本が正式記録に保管されます。正式記録はまだ作成されていません。",
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
    title: "读取资料并保存正式记录",
    description: "识别完成后，清晰且无冲突的现有字段会自动写入正式记录；若缺少姓名等必填项，会保留已识别内容并提示补充后保存。保存后仍可编辑和复核。",
    descriptionCase: "识别完成后，清晰且无冲突的现有字段会自动写入正式案件记录；若缺少案件名，请补全后保存。保存后仍可编辑和复核。",
    descriptionProperty: "识别完成后，清晰且无冲突的现有字段会自动写入正式记录；若缺少物件名，候选和原件只保留在当前页面，补充物件名并保存后才会归档原件。保存后仍可编辑和复核。",
    read: "读取资料并保存",
    retry: "重试未读取资料",
    readComplete: "资料读取完成",
    reading: "读取中…",
    noFiles: "请先选择资料。",
    ready: "识别完成；清晰且无冲突的字段已写入正式记录。若必填项不足，请补充后保存。",
    readyProperty: "识别完成；清晰且无冲突的字段已写入正式记录。若物件名不足，请补充物件名后保存。",
    empty: "没有可确认的候选值。尚未创建正式记录；手动填写后保存时会归档原件。",
    needsReview: "发现候选，但没有可自动保存的确定值。尚未创建正式记录，请核对内容后手动填写。",
    needsPropertyName: "发现清晰候选，但缺少物件名。候选与原件目前仅保留在当前页面；请补充物件名后保存，保存后才会归档原件。尚未创建正式记录。",
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
    title: "자료를 읽고 정식 기록으로 저장",
    description: "읽기가 끝나면 명확하고 불일치가 없는 기존 항목은 정식 기록으로 자동 저장됩니다. 이름 등 필수 항목이 없으면 내용을 유지하고 보완 후 저장합니다. 저장 후에도 수정하고 다시 확인할 수 있습니다.",
    descriptionCase: "읽기가 끝나면 명확하고 불일치가 없는 기존 항목은 정식 안건 기록으로 자동 저장됩니다. 안건명이 없으면 안건명을 보완한 후 저장해 주세요. 저장 후에도 수정하고 다시 확인할 수 있습니다.",
    descriptionProperty: "읽기가 끝나면 명확하고 불일치가 없는 기존 항목은 정식 기록으로 자동 저장됩니다. 매물명이 없으면 후보와 원본은 현재 화면에만 유지되며, 매물명을 보완해 저장한 후 원본이 정식 기록에 보관됩니다. 저장 후에도 수정하고 다시 확인할 수 있습니다.",
    read: "자료를 읽고 저장",
    retry: "읽지 못한 자료 재시도",
    readComplete: "자료 읽기 완료",
    reading: "읽는 중…",
    noFiles: "먼저 자료를 선택해 주세요.",
    ready: "읽기 완료. 명확하고 일치하는 항목을 정식 기록에 반영했습니다. 필수 항목이 없으면 보완 후 저장해 주세요.",
    readyProperty: "읽기 완료. 명확하고 일치하는 항목을 정식 기록에 반영했습니다. 매물명이 없으면 매물명을 보완한 후 저장해 주세요.",
    empty: "확인할 후보가 없습니다. 정식 기록은 만들지 않았습니다. 직접 입력해 저장하면 원본이 첨부됩니다.",
    needsReview: "후보는 있지만 자동 저장할 만큼 확실한 값이 없습니다. 정식 기록은 만들지 않았으므로 확인 후 직접 입력해 주세요.",
    needsPropertyName: "명확한 후보가 있지만 매물명이 없습니다. 후보와 원본은 현재 화면에만 유지됩니다. 매물명을 보완해 저장하면 원본이 정식 기록에 보관되며, 아직 정식 기록은 만들어지지 않았습니다.",
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

export function hasPropertyNameCandidate(candidates: readonly Pick<EntryPreviewCandidate, "key" | "value">[]): boolean {
  return candidates.some((candidate) => candidate.key === "name" && candidate.value.trim().length > 0);
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

export function EntryPreview({ files, kind, context, locale, onConfirm, onReadFileKeys, onReadComplete }: EntryPreviewProps) {
  const text = copy[locale];
  const [preview, setPreview] = useState<{ files: File[]; kind: EntryPreviewKind; context?: "entry" | "case"; state: EntryPreviewState }>();
  const [decisions, setDecisions] = useState<{ files: File[]; kind: EntryPreviewKind; context?: "entry" | "case"; values: Record<string, "auto_saved" | "rejected"> }>();
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
    const unread = getUnreadEntryFiles(files, [...readFileKeys]);
    const filesToRead = unread.length === 0 && previous?.candidates.length === 0 ? files : unread;
    if (!filesToRead.length) return;
    const requestId = ++requestIdRef.current;
    const formData = buildEntryPreviewFormData(filesToRead, kind, context);
    pendingRef.current = true;
    startTransition(() => {
      void previewEntryDocumentsAction(formData).then((result) => {
        if (requestId !== requestIdRef.current) return;
        const merged = mergeEntryPreviewStates(previous, result);
        setPreview({ files, kind, context, state: merged });
        const safeCandidates = safeEntryPreviewCandidates(merged.candidates);
        setDecisions((current) => ({ files, kind, context, values: {
          ...(current?.files === files && current.kind === kind && current.context === context ? current.values : {}),
          ...Object.fromEntries(safeCandidates.map((candidate) => [candidate.id, "auto_saved" as const])),
        } }));
        onReadFileKeys(merged.readFileKeys);
        for (const candidate of safeCandidates) onConfirm(candidate);
        if (result.status === "ready" && merged.readFileKeys.length === files.length && safeCandidates.length > 0) onReadComplete?.(merged);
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
  useEffect(() => {
    if (files.length > 0) read();
    // A new file selection or target kind starts one read. Retry stays an explicit button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, kind, context]);
  const activeDecisions = decisions?.files === files && decisions.kind === kind && decisions.context === context ? decisions.values : {};
  const unreadFiles = getUnreadEntryFiles(files, activePreview?.readFileKeys ?? []);
  const allFilesRead = files.length > 0 && unreadFiles.length === 0 && Boolean(activePreview?.candidates.length);
  const safeCandidates = activePreview ? safeEntryPreviewCandidates(activePreview.candidates) : [];
  const safeCandidateCount = safeCandidates.length;
  const hasPropertyName = kind !== "property" || hasPropertyNameCandidate(safeCandidates);
  const description = context === "case" ? text.descriptionCase : kind === "property" ? text.descriptionProperty : text.description;
  const ready = kind === "property" ? text.readyProperty : text.ready;

  return (
    <section aria-labelledby="entry-preview-heading" className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
      <input type="hidden" name="entryReadProofs" value={JSON.stringify(activePreview?.readProofs ?? {})} />
      <input type="hidden" name="entryPreviewDecisions" value={JSON.stringify(activeDecisions)} />
      <div>
        <h2 id="entry-preview-heading" className="text-sm font-black text-slate-950">{text.title}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
      </div>
      <button type="button" onClick={read} disabled={pending || allFilesRead} className="min-h-11 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-800 disabled:cursor-wait disabled:opacity-60">
        {pending ? text.reading : allFilesRead ? text.readComplete : activePreview?.status === "error" && activePreview.readFileKeys.length > 0 ? text.retry : text.read}
      </button>
      {activePreview?.message ? <p role={activePreview.status === "error" ? "alert" : "status"} className={`text-xs font-bold ${activePreview.status === "error" ? "text-rose-700" : "text-amber-700"}`}>{activePreview.message}</p> : null}
      {activePreview && (activePreview.status === "ready" || activePreview.candidates.length > 0) ? (
        <div className="space-y-2" aria-live="polite">
          {safeCandidateCount > 0 && hasPropertyName ? <p className="text-xs font-semibold text-slate-700">{ready}</p> : safeCandidateCount > 0 && kind === "property" ? <p className="text-xs font-semibold text-amber-800">{text.needsPropertyName}</p> : activePreview.candidates.length > 0 ? <p className="text-xs font-semibold text-amber-800">{text.needsReview}</p> : null}
          {activePreview.status === "ready" && activePreview.candidates.length === 0 ? <p className="text-xs text-slate-600">{text.empty}</p> : activePreview.candidates.length > 0 ? (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-indigo-100 bg-white">
              {activePreview.candidates.map((candidate) => {
                return (
                  <li key={candidate.id} className="grid gap-0.5 px-3 py-2 text-xs sm:grid-cols-[minmax(8rem,0.25fr)_minmax(0,1fr)] sm:gap-x-3">
                    <span className="font-bold text-slate-950">{candidate.label}</span>
                    <span className="min-w-0 break-words text-slate-800">{candidate.value}</span>
                    <span className="text-[11px] text-slate-500 sm:col-start-2">{candidate.fileName}{candidate.pageNumber == null ? "" : ` · ${text.page} ${candidate.pageNumber}`}{candidate.uncertainty && candidate.uncertainty !== "clear" ? ` · ${text.uncertaintyReasons[candidate.uncertainty as keyof typeof text.uncertaintyReasons] ?? text.uncertainty}` : ""}</span>
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
