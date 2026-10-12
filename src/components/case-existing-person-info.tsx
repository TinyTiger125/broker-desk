"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/lib/locale";
import {
  CASE_PERSON_PREFILL_FIELDS,
  type CasePersonPrefillCandidate,
  type CasePersonPrefillFieldKey,
} from "@/lib/case-person-prefill";

type SaveAction = (formData: FormData) => void | Promise<void>;

type CaseExistingPersonInfoProps = {
  caseId: string;
  locale: Locale;
  candidates: CasePersonPrefillCandidate[];
  currentValues: Partial<Record<CasePersonPrefillFieldKey, string>>;
  action: SaveAction;
  disabled?: boolean;
};

const labels: Record<Locale, Record<CasePersonPrefillFieldKey, string>> = {
  ja: {
    "applicant.name": "氏名",
    "applicant.phone": "代表電話番号",
    "applicant.email": "メール",
  },
  zh: {
    "applicant.name": "姓名",
    "applicant.phone": "代表电话",
    "applicant.email": "邮箱",
  },
  ko: {
    "applicant.name": "이름",
    "applicant.phone": "대표 전화번호",
    "applicant.email": "이메일",
  },
};

function text(locale: Locale, messages: Record<Locale, string>) {
  return messages[locale];
}

export function CaseExistingPersonInfo({ caseId, locale, candidates, currentValues, action, disabled = false }: CaseExistingPersonInfoProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [overwriteFieldKeys, setOverwriteFieldKeys] = useState<CasePersonPrefillFieldKey[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const controlsDisabled = disabled || submitting;
  const selected = candidates.find((candidate) => candidate.id === selectedId);
  const sourceValues = useMemo(() => ({
    "applicant.name": selected?.name?.trim() ?? "",
    "applicant.phone": selected?.phone?.trim() ?? "",
    "applicant.email": selected?.email?.trim() ?? "",
  }), [selected]);
  const conflicts = selected
    ? CASE_PERSON_PREFILL_FIELDS.filter(({ fieldKey }) => Boolean(sourceValues[fieldKey]) && Boolean(currentValues[fieldKey]?.trim()))
    : [];

  const toggleOverwrite = (fieldKey: CasePersonPrefillFieldKey, checked: boolean) => {
    setOverwriteFieldKeys((current) => checked
      ? [...new Set([...current, fieldKey])]
      : current.filter((item) => item !== fieldKey));
  };

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (submitting) return;
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || submitting) return;
      event.preventDefault();
      setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, submitting]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="case-existing-person-info"
        disabled={candidates.length === 0 || disabled}
        onClick={() => setOpen((current) => !current)}
        className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-black text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {text(locale, { ja: "既存情報を読み込む", zh: "读取已有信息", ko: "기존 정보 읽기" })}
      </button>
      {disabled ? <span className="sr-only">{text(locale, { ja: "未保存の変更を先に保存してください。", zh: "请先保存未保存的修改。", ko: "저장하지 않은 변경 사항을 먼저 저장해 주세요." })}</span> : null}
      {open ? (
        <div id="case-existing-person-info" className="absolute right-0 top-full z-30 mt-2 w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-blue-200 bg-blue-50/95 p-3 shadow-xl" role="region" aria-busy={submitting} aria-label={text(locale, { ja: "既存情報の読み込み", zh: "读取已有信息", ko: "기존 정보 읽기" })}>
          {disabled ? <p role="status" className="mb-2 text-xs font-black text-amber-800">{text(locale, { ja: "未保存の変更を先に保存してください。", zh: "请先保存未保存的修改。", ko: "저장하지 않은 변경 사항을 먼저 저장해 주세요." })}</p> : null}
          {submitting ? <p role="status" aria-live="polite" className="mb-2 text-xs font-black text-blue-800">{text(locale, { ja: "読み込み中…", zh: "读取中…", ko: "읽는 중…" })}</p> : null}
          {candidates.length === 0 ? (
            <p className="text-xs font-semibold text-slate-600">{text(locale, { ja: "現在のテナントで利用できる人物資料がありません。", zh: "当前租户没有可用的人物资料。", ko: "현재 테넌트에서 사용할 수 있는 인물 자료가 없습니다." })}</p>
          ) : (
            <form
              action={action}
              className="space-y-3"
              onSubmit={(event) => {
                if (submitting) {
                  event.preventDefault();
                  return;
                }
                setSubmitting(true);
              }}
            >
              <input type="hidden" name="caseId" value={caseId} />
              <input type="hidden" name="targetGroup" value="applicant" />
              <label className="block text-xs font-black text-slate-700">
                <span>{text(locale, { ja: "読み込む人物", zh: "选择人物", ko: "읽을 인물" })}</span>
                <select
                  name="clientId"
                  value={selectedId}
                  required
                  disabled={controlsDisabled}
                  onChange={(event) => {
                    setSelectedId(event.target.value);
                    setOverwriteFieldKeys([]);
                  }}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                >
                  <option value="">{text(locale, { ja: "選択してください", zh: "请选择", ko: "선택해 주세요" })}</option>
                  {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name || candidate.id}</option>)}
                </select>
              </label>
              {selected ? (
                <>
                  <div className="space-y-1 rounded-md border border-slate-200 bg-white p-2 text-xs">
                    <p className="font-black text-slate-700">{text(locale, { ja: "入力候補", zh: "可带入字段", ko: "입력 후보" })}</p>
                    {CASE_PERSON_PREFILL_FIELDS.map(({ fieldKey }) => (
                      <div key={fieldKey} className="grid grid-cols-[minmax(7rem,auto)_minmax(0,1fr)] gap-2">
                        <span className="font-semibold text-slate-500">{labels[locale][fieldKey]}</span>
                        <span className="break-words font-bold text-slate-900">{sourceValues[fieldKey] || "-"}</span>
                      </div>
                    ))}
                  </div>
                  {conflicts.length > 0 ? (
                    <fieldset className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-2">
                      <legend className="px-1 text-amber-900" style={{ fontSize: "0.75rem", fontWeight: 900, lineHeight: "1rem" }}>{text(locale, { ja: "置き換える項目を選択", zh: "选择要替换的内容", ko: "바꿀 항목 선택" })}</legend>
                      <p className="text-[11px] font-semibold text-amber-900">{text(locale, { ja: "チェックした項目だけ置き換えます。未チェックの既存値は残ります。", zh: "只有勾选的字段会覆盖；未勾选的现有值会保留。", ko: "선택한 항목만 덮어씁니다. 선택하지 않은 기존 값은 유지됩니다." })}</p>
                      {conflicts.map(({ fieldKey }) => (
                        <label key={fieldKey} className="flex items-center gap-2 text-xs font-bold text-slate-800">
                          <input
                            type="checkbox"
                            name="overwriteFieldKey"
                            value={fieldKey}
                            checked={overwriteFieldKeys.includes(fieldKey)}
                            disabled={controlsDisabled}
                            onChange={(event) => toggleOverwrite(fieldKey, event.target.checked)}
                          />
                          <span>{labels[locale][fieldKey]}：{currentValues[fieldKey]}</span>
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <p className="text-xs font-semibold text-emerald-800">{text(locale, { ja: "空欄に入力できる項目があります。既存値は変更しません。", zh: "将只补充空白字段，不会修改现有值。", ko: "빈 항목만 채우며 기존 값은 변경하지 않습니다." })}</p>
                  )}
                  <button type="submit" disabled={controlsDisabled} className="w-full rounded-md bg-slate-950 px-3 py-2 text-xs font-black text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">
                    {submitting
                      ? text(locale, { ja: "読み込み中…", zh: "读取中…", ko: "읽는 중…" })
                      : overwriteFieldKeys.length > 0
                      ? text(locale, { ja: "選択した衝突を置き換えて読み込む", zh: "覆盖勾选冲突并读取", ko: "선택한 충돌을 덮어쓰고 읽기" })
                      : text(locale, { ja: "空欄だけ読み込む", zh: "只读取空白字段", ko: "빈 항목만 읽기" })}
                  </button>
                </>
              ) : null}
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
