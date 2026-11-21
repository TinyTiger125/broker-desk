"use client";

import { useState } from "react";
import type { EntryPreviewCandidate } from "@/lib/entry-preview";
import { groupPropertyReviewCandidates, validatePropertyReviewValue } from "@/lib/property-entry-review";
import { formatJapanesePostalCode } from "@/lib/japanese-postal-code-validation";
import type { Locale } from "@/lib/locale";

type ReviewProps = {
  candidates: readonly EntryPreviewCandidate[];
  appliedCandidateIds: readonly string[];
  locale: Locale;
  onApply: (key: string, value: string, source?: EntryPreviewCandidate) => boolean;
};

const words = {
  ja: { title: "読み取り候補・確認して入力", pending: "未確認", multiple: "複数候補・要確認", choose: "候補を選択", manual: "自分で入力", edit: "読み取り値を修正できます", apply: "確認して入力", invalid: "値を確認してください。入力していません。", save: "確認した値は下のフォームに入ります。正式記録への保存は「保存」を押してください。" },
  zh: { title: "识别候选·确认填入", pending: "待确认", multiple: "多个候选·待复核", choose: "请选择候选", manual: "自行输入", edit: "可在这里修改识别值", apply: "确认填入", invalid: "请检查输入值；尚未填入。", save: "勾选后先填入下方表单；点击“保存”才会保存正式记录。" },
  ko: { title: "인식 후보·확인 후 입력", pending: "확인 대기", multiple: "여러 후보·확인 필요", choose: "후보 선택", manual: "직접 입력", edit: "인식 값을 수정할 수 있습니다", apply: "확인 후 입력", invalid: "값을 확인해 주세요. 아직 입력하지 않았습니다.", save: "확인한 값은 아래 양식에 들어갑니다. 정식 기록은 '저장'을 눌러야 저장됩니다." },
} as const;

export function PropertyEntryCandidateReview({ candidates, appliedCandidateIds, locale, onApply }: ReviewProps) {
  const text = words[locale];
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [errorKey, setErrorKey] = useState("");
  const rows = groupPropertyReviewCandidates(candidates.filter((candidate) => !appliedCandidateIds.includes(candidate.id)));
  if (rows.length === 0) return <p role="status" className="text-xs text-slate-600">{text.pending} 0</p>;

  return (
    <section className="rounded-lg border border-indigo-200 bg-white" aria-label={text.title}>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-bold text-slate-950">
        <span>{text.title}</span>
        <span className="shrink-0 text-indigo-800">{text.pending} {rows.length} <span aria-hidden="true">{expanded ? "⌃" : "⌄"}</span></span>
      </button>
      {expanded ? <div className="border-t border-indigo-100 p-2">
        <p className="mb-2 text-xs text-slate-600">{text.save}</p>
        <ul className="max-h-[24rem] space-y-1 overflow-y-auto" aria-label={text.title}>
          {rows.map((row) => {
            const multiple = row.options.length > 1;
            const choice = selected[row.key] ?? (multiple ? "" : row.options[0].id);
            const source = row.options.find((option) => option.id === choice);
            const value = edited[row.key] ?? (row.key === "postalCode" ? formatJapanesePostalCode(source?.value ?? "") : source?.value ?? "");
            const sourceLabel = source ? `${source.fileName}${source.pageNumber == null ? "" : ` · ${source.pageNumber} ${locale === "zh" ? "页" : locale === "ko" ? "쪽" : "ページ"}`}` : "";
            return <li key={row.key} className={`grid gap-1 rounded-md border p-2 text-xs sm:grid-cols-[minmax(7rem,0.3fr)_minmax(0,1fr)_2.5rem] sm:items-center ${multiple ? "border-amber-300 bg-amber-50/60" : "border-slate-200"}`}>
              <span className="font-bold text-slate-950">{row.label}{multiple ? <span className="mt-0.5 block text-[10px] font-semibold text-amber-900">{text.multiple}</span> : null}</span>
              <span className="min-w-0 space-y-1">
                {multiple ? <select aria-label={`${row.label} ${text.choose}`} value={choice} onChange={(event) => { setSelected((current) => ({ ...current, [row.key]: event.target.value })); setEdited((current) => { const next = { ...current }; delete next[row.key]; return next; }); setErrorKey(""); }} className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900">
                  <option value="">{text.choose}</option>
                  {row.options.map((option) => <option key={option.id} value={option.id}>{row.key === "postalCode" ? formatJapanesePostalCode(option.value) : option.value} · {option.fileName}{option.pageNumber == null ? "" : ` · ${option.pageNumber}`}</option>)}
                  <option value="manual">{text.manual}</option>
                </select> : null}
                {choice ? <input type="text" aria-label={`${row.label} ${text.edit}`} placeholder={text.edit} value={value} onChange={(event) => { setEdited((current) => ({ ...current, [row.key]: row.key === "postalCode" ? formatJapanesePostalCode(event.target.value) : event.target.value })); setErrorKey(""); }} className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900" /> : null}
                {sourceLabel ? <span className="block truncate text-[10px] text-slate-500" title={sourceLabel}>{sourceLabel}</span> : null}
                {errorKey === row.key ? <span role="alert" className="block text-[10px] font-bold text-rose-700">{text.invalid}</span> : null}
              </span>
              <button type="button" aria-label={`${row.label} ${text.apply}`} title={text.apply} disabled={!choice} onClick={() => {
                if (!validatePropertyReviewValue(row.key, value) || !onApply(row.key, value.trim(), source)) { setErrorKey(row.key); return; }
                // A later file can add new candidates for the same field.
                // Its review must start from the new options, not this choice.
                setSelected((current) => { const next = { ...current }; delete next[row.key]; return next; });
                setEdited((current) => { const next = { ...current }; delete next[row.key]; return next; });
                setErrorKey("");
              }} className="flex h-9 w-9 items-center justify-center justify-self-start rounded-md border border-indigo-500 bg-white text-lg font-bold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40 sm:justify-self-end">✓</button>
            </li>;
          })}
        </ul>
      </div> : null}
    </section>
  );
}
