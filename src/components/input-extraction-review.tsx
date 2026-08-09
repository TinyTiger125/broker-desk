"use client";

import { useMemo, useState } from "react";
import { saveExtractionReviewAction } from "@/app/actions";
import type { CaseMergeCandidateSummary } from "@/lib/case-merge";
import { getCaseFieldDefinition } from "@/lib/case-field-catalog";
import type { ExtractedInputField, InputFileExtractionResult } from "@/lib/input-file-extractor";
import type { Locale } from "@/lib/locale";

type LocalReviewStatus = "suggested" | "accepted" | "edited" | "unknown" | "rejected";

type ReviewItem = ExtractedInputField & {
  groupKey: ExtractionGroupKey;
};

type ExtractionGroupKey = "property" | "parties" | "transaction" | "disclosure" | "needsReview";

const GROUP_ORDER: ExtractionGroupKey[] = ["property", "parties", "transaction", "disclosure", "needsReview"];

function tr(locale: Locale, values: Record<Locale, string>) {
  return values[locale];
}

function getGroupKey(field: ExtractedInputField): ExtractionGroupKey {
  const key = field.fieldKey.toLowerCase();
  if (key.startsWith("questionnaire.")) return "disclosure";
  if (
    key.includes("seller") ||
    key.includes("buyer") ||
    key.includes("owner") ||
    key.includes("broker") ||
    key.includes("agent")
  ) {
    return "parties";
  }
  if (
    key.includes("price") ||
    key.includes("deposit") ||
    key.includes("payment") ||
    key.includes("balance") ||
    key.includes("transaction")
  ) {
    return "transaction";
  }
  if (
    key.includes("property") ||
    key.includes("building") ||
    key.includes("unit") ||
    key.includes("area") ||
    key.includes("location") ||
    key.includes("address") ||
    key.includes("structure")
  ) {
    return "property";
  }
  return "needsReview";
}

function getGroupLabel(locale: Locale, groupKey: ExtractionGroupKey) {
  const labels: Record<ExtractionGroupKey, Record<Locale, string>> = {
    property: { ja: "物件", zh: "物件", ko: "매물" },
    parties: { ja: "関係者", zh: "客户 / 关系人", ko: "관계자" },
    transaction: { ja: "条件", zh: "条件", ko: "조건" },
    disclosure: { ja: "告知", zh: "告知", ko: "고지" },
    needsReview: { ja: "その他", zh: "其他", ko: "기타" },
  };
  return labels[groupKey][locale];
}

function getBusinessFieldLabel(locale: Locale, fieldKey: string) {
  const definition = getCaseFieldDefinition(fieldKey);
  if (definition?.label) return definition.label;
  return tr(locale, { ja: "確認項目", zh: "资料项目", ko: "확인 항목" });
}

function getStatusLabel(locale: Locale, status: LocalReviewStatus) {
  const labels: Record<LocalReviewStatus, Record<Locale, string>> = {
    suggested: { ja: "要確認", zh: "待核对", ko: "확인 필요" },
    accepted: { ja: "確認済み", zh: "已确认", ko: "확인됨" },
    edited: { ja: "修正済み", zh: "已修正", ko: "수정됨" },
    unknown: { ja: "保留", zh: "暂缓", ko: "보류" },
    rejected: { ja: "保存しない", zh: "不保存", ko: "저장 안 함" },
  };
  return labels[status][locale];
}

function getStatusClass(status: LocalReviewStatus) {
  if (status === "accepted") return "bg-emerald-100 text-emerald-800";
  if (status === "edited") return "bg-blue-100 text-blue-800";
  if (status === "unknown") return "bg-slate-200 text-slate-700";
  if (status === "rejected") return "bg-rose-100 text-rose-800";
  return "bg-amber-100 text-amber-800";
}

function getMethodLabel(locale: Locale, method: ExtractedInputField["method"]) {
  if (method === "rule") {
    return tr(locale, { ja: "表の読取", zh: "表格读取", ko: "표 읽기" });
  }
  if (method === "ocr") {
    return tr(locale, { ja: "画像の読取", zh: "图片读取", ko: "이미지 읽기" });
  }
  return method;
}

function getSourceLabel(field: ExtractedInputField) {
  return field.sourceCell ?? field.sourceRange ?? "-";
}

function getFieldId(field: ExtractedInputField) {
  return `${field.fieldKey}:${field.sourceCell ?? field.sourceRange ?? field.sourceSheet}`;
}

function getFieldValue(field: ExtractedInputField) {
  return field.normalizedValue || field.value;
}

function hasReadableValue(field: ExtractedInputField) {
  return getFieldValue(field).trim().length > 0;
}

function getFieldPriority(field: ExtractedInputField) {
  if (!hasReadableValue(field)) return 0;
  if (field.confidence < 0.65) return 1;
  return 2;
}

function isResolvedStatus(status: LocalReviewStatus) {
  return status === "accepted" || status === "edited" || status === "rejected";
}

function isConfirmedStatus(status: LocalReviewStatus) {
  return status === "accepted" || status === "edited";
}

export function InputExtractionReview({
  extraction,
  locale,
  importJobId,
  mergeCandidates = [],
  targetCaseId,
}: {
  extraction: InputFileExtractionResult;
  locale: Locale;
  importJobId: string;
  mergeCandidates?: CaseMergeCandidateSummary[];
  targetCaseId?: string;
}) {
  const items = useMemo<ReviewItem[]>(
    () =>
      extraction.fields
        .map((field) => ({
          ...field,
          groupKey: getGroupKey(field),
        }))
        .sort((a, b) => {
          const priorityDifference = getFieldPriority(a) - getFieldPriority(b);
          if (priorityDifference !== 0) return priorityDifference;
          if (a.fieldKey === b.fieldKey) return 0;
          return a.fieldKey < b.fieldKey ? -1 : 1;
        }),
    [extraction.fields],
  );
  const groupedItems = useMemo(
    () =>
      GROUP_ORDER.map((groupKey) => ({
        groupKey,
        label: getGroupLabel(locale, groupKey),
        items: items.filter((item) => item.groupKey === groupKey),
      })).filter((group) => group.items.length > 0),
    [items, locale],
  );
  const [reviewStatuses, setReviewStatuses] = useState<Record<string, LocalReviewStatus>>({});
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [selectedMergeCaseId, setSelectedMergeCaseId] = useState("");
  const [reviewMode, setReviewMode] = useState<"pending" | "all">("pending");
  const [settlingFieldIds, setSettlingFieldIds] = useState<Set<string>>(() => new Set());
  const [confirmationNotice, setConfirmationNotice] = useState<{ id: string; label: string } | null>(null);
  const extractionStats = useMemo(() => {
    const readable = items.filter(hasReadableValue).length;
    const empty = items.length - readable;
    const lowConfidence = items.filter((field) => hasReadableValue(field) && field.confidence < 0.65).length;
    return { readable, empty, lowConfidence };
  }, [items]);
  const reviewDecisionsJson = useMemo(
    () =>
      JSON.stringify(
        items.map((field) => {
          const id = getFieldId(field);
          const reviewStatus = reviewStatuses[id] ?? field.reviewStatus;
          return {
            fieldId: id,
            reviewStatus,
            editedValue: reviewStatus === "edited" ? editedValues[id] ?? field.normalizedValue ?? field.value : undefined,
          };
        }),
      ),
    [editedValues, items, reviewStatuses],
  );
  const reviewProgress = useMemo(() => {
    const resolved = items.filter((field) => {
      const status = reviewStatuses[getFieldId(field)] ?? field.reviewStatus;
      return isResolvedStatus(status);
    }).length;
    return {
      resolved,
      pending: items.length - resolved,
      percent: items.length > 0 ? Math.round((resolved / items.length) * 100) : 100,
    };
  }, [items, reviewStatuses]);
  const visibleGroups = useMemo(
    () =>
      groupedItems
        .map((group) => ({
          ...group,
          items:
            reviewMode === "all"
              ? group.items
              : group.items.filter((field) => {
                  const status = reviewStatuses[getFieldId(field)] ?? field.reviewStatus;
                  const id = getFieldId(field);
                  return !isResolvedStatus(status) || settlingFieldIds.has(id);
                }),
        }))
        .filter((group) => group.items.length > 0),
    [groupedItems, reviewMode, reviewStatuses, settlingFieldIds],
  );

  function setStatus(field: ExtractedInputField, status: LocalReviewStatus) {
    const id = getFieldId(field);
    setReviewStatuses((current) => ({ ...current, [id]: status }));
    if (status === "edited") {
      setEditedValues((current) => ({ ...current, [id]: current[id] ?? field.normalizedValue ?? field.value }));
    }
  }

  function acceptReadableFields() {
    setReviewStatuses((current) =>
      Object.fromEntries(
        items.map((field) => {
          const id = getFieldId(field);
          const status = current[id] ?? field.reviewStatus;
          return [id, isResolvedStatus(status) ? status : hasReadableValue(field) ? "accepted" : status];
        }),
      ),
    );
  }

  function confirmField(field: ExtractedInputField) {
    const id = getFieldId(field);
    const readValue = getFieldValue(field);
    const nextValue = editedValues[id] ?? readValue;
    if (!nextValue.trim()) {
      setReviewStatuses((current) => ({ ...current, [id]: "unknown" }));
      return;
    }
    setReviewStatuses((current) => ({
      ...current,
      [id]: nextValue === readValue ? "accepted" : "edited",
    }));
    setSettlingFieldIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
    setConfirmationNotice({ id, label: field.label });
    window.setTimeout(() => {
      setSettlingFieldIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }, 560);
    window.setTimeout(() => {
      setConfirmationNotice((current) => (current?.id === id ? null : current));
    }, 2200);
  }

  return (
    <form action={saveExtractionReviewAction} className="space-y-4">
      <input type="hidden" name="jobId" value={importJobId} />
      <input type="hidden" name="reviewDecisionsJson" value={reviewDecisionsJson} />
      <input type="hidden" name="mergeTargetCaseId" value={selectedMergeCaseId} />
      {targetCaseId ? <input type="hidden" name="targetCaseId" value={targetCaseId} /> : null}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-blue-700">
                {tr(locale, { ja: "読取完了", zh: "读取完成", ko: "읽기 완료" })}
              </p>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                {tr(locale, { ja: "値を確認できます", zh: "可核对读取值", ko: "판독값 확인 가능" })}
              </span>
            </div>
            <h3 className="mt-1 text-lg font-black text-slate-950">{extraction.documentTypeLabel}</h3>
            <p className="mt-1 truncate text-xs text-slate-500">{extraction.sourceFilename}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="rounded-lg bg-slate-100 px-3 py-2 text-slate-700">
              {tr(locale, { ja: "読取値", zh: "读取值", ko: "판독값" })} {extractionStats.readable}
            </span>
            <span className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">
              {tr(locale, { ja: "未読取", zh: "未读取", ko: "미판독" })} {extractionStats.empty}
            </span>
            {extractionStats.lowConfidence > 0 ? (
              <span className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                {tr(locale, { ja: "要確認", zh: "需仔细核对", ko: "주의 확인" })} {extractionStats.lowConfidence}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {targetCaseId ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <h4 className="text-sm font-bold text-emerald-950">
            {tr(locale, { ja: "この案件へ追加", zh: "追加到当前案件", ko: "현재 안건에 추가" })}
          </h4>
          <p className="mt-1 text-xs leading-5 text-emerald-900">
            {tr(locale, {
              ja: "保存すると、採用・修正した項目だけを開いている案件へ反映します。",
              zh: "保存后，只会把采用和修正后的项目写入当前案件。",
              ko: "저장하면 채택/수정한 항목만 현재 안건에 반영합니다.",
            })}
          </p>
        </section>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-slate-950">
                {tr(locale, { ja: "保存先", zh: "保存位置", ko: "저장 위치" })}
              </h4>
              <p className="mt-1 text-xs text-slate-600">
                {tr(locale, {
                  ja: "同じ案件と思われるものがある場合は、保存前にここで選択します。",
                  zh: "如果可能属于已有案件，保存前在这里选择。",
                  ko: "기존 안건 후보가 있으면 저장 전에 여기서 선택합니다.",
                })}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-700">
              {mergeCandidates.length > 0
                ? tr(locale, { ja: "既存案件の可能性あり", zh: "可能属于已有案件", ko: "기존 안건 가능성 있음" })
                : tr(locale, { ja: "新規保存", zh: "新建保存", ko: "신규 저장" })}
            </span>
          </div>

          <div className="mt-3 space-y-2">
            <label className={`block rounded-lg border p-3 ${selectedMergeCaseId ? "border-slate-200 bg-slate-50" : "border-indigo-200 bg-indigo-50"}`}>
              <span className="flex items-start gap-2">
                <input
                  type="radio"
                  name="mergeMode"
                  value="new"
                  checked={!selectedMergeCaseId}
                  onChange={() => setSelectedMergeCaseId("")}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-bold text-slate-900">
                    {tr(locale, { ja: "新しい案件として保存", zh: "保存为新案件", ko: "새 안건으로 저장" })}
                  </span>
                  <span className="mt-1 block text-xs text-slate-600">
                    {tr(locale, { ja: "既存案件に入れない資料はこちら。", zh: "不追加到已有案件时选择这里。", ko: "기존 안건에 넣지 않을 때 선택합니다." })}
                  </span>
                </span>
              </span>
            </label>

            {mergeCandidates.map((candidate) => (
              <label
                key={candidate.caseId}
                className={`block rounded-lg border p-3 ${
                  selectedMergeCaseId === candidate.caseId ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"
                }`}
              >
                <span className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="mergeMode"
                    value="merge"
                    checked={selectedMergeCaseId === candidate.caseId}
                    onChange={() => setSelectedMergeCaseId(candidate.caseId)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{candidate.caseTitle}</span>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        {tr(locale, { ja: "参考度", zh: "参考度", ko: "참고도" })} {candidate.confidenceScore}%
                      </span>
                    </span>
                    <span className="mt-1 block text-xs text-slate-600">
                      {candidate.matchReasons.join(" / ")}
                      {candidate.conflictFields.length > 0
                        ? ` / ${tr(locale, { ja: "相違", zh: "不同", ko: "차이" })}: ${candidate.conflictFields.length}`
                        : ""}
                    </span>
                    <span className="mt-1 block text-[11px] text-slate-500">
                      {tr(locale, { ja: "既存資料", zh: "已有资料", ko: "기존 자료" })}: {candidate.sourceCount}
                      {" / "}
                      {tr(locale, { ja: "一致した内容", zh: "相同内容", ko: "일치한 내용" })}: {candidate.matchedFieldCount}
                    </span>
                    {candidate.conflictDetails.length > 0 ? (
                      <span className="mt-2 block rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
                        <span className="block font-bold">
                          {tr(locale, { ja: "異なる内容", zh: "不同之处", ko: "다른 내용" })}
                        </span>
                        {candidate.conflictDetails.slice(0, 3).map((detail) => (
                          <span key={detail.fieldKey} className="mt-1 block">
                            {getBusinessFieldLabel(locale, detail.fieldKey)}: {detail.existingValue} / {detail.incomingValue}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {selectedMergeCaseId ? (
            <label className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <input type="checkbox" name="mergeConfirm" required className="mt-0.5" />
              <span>
                {tr(locale, {
                  ja: "照合理由と差分を確認しました。この資料を選択した既存案件へ追加し、合併履歴を残します。",
                  zh: "我已确认归属依据和差异；将这份资料追加到所选案件，并保留合并历史。",
                  ko: "대조 이유와 차이를 확인했습니다. 이 자료를 선택한 기존 안건에 추가하고 합병 이력을 남깁니다.",
                })}
              </span>
            </label>
          ) : null}
        </section>
      )}

      <section className="grid min-w-0 items-start gap-4 2xl:grid-cols-[minmax(17rem,21rem)_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-xl border border-slate-200 bg-white 2xl:sticky 2xl:top-20">
          <div className="border-b border-slate-100 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-indigo-700">
                  {tr(locale, { ja: "全体進捗", zh: "总体进度", ko: "전체 진행" })}
                </p>
                <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">
                  {reviewProgress.resolved}/{items.length}
                </p>
              </div>
              <span className="rounded-full bg-slate-950 px-3 py-1 text-sm font-black tabular-nums text-white">
                {reviewProgress.percent}%
              </span>
            </div>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={reviewProgress.percent}
            >
              <div
                className="h-full rounded-full bg-indigo-600 transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${reviewProgress.percent}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              {tr(locale, {
                ja: "右側で修正した値はすぐここに反映されます。",
                zh: "右侧修正后会立即反映在这里，无需按 Enter。",
                ko: "오른쪽에서 수정한 값이 즉시 여기에 반영됩니다. Enter는 필요 없습니다.",
              })}
            </p>
            <button
              type="button"
              onClick={acceptReadableFields}
              className="mt-3 w-full rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-100"
            >
              {tr(locale, { ja: "読取できた値を一括確定", zh: "批量确认已读取值", ko: "판독된 값 일괄 확정" })}
            </button>
          </div>
          <div className="max-h-[62vh] space-y-4 overflow-y-auto p-3">
            {groupedItems.map((group) => (
              <div key={`overview-${group.groupKey}`}>
                <div className="mb-1 flex items-center justify-between gap-2 px-1">
                  <p className="text-xs font-black text-slate-700">{group.label}</p>
                  <span className="text-[10px] font-bold tabular-nums text-slate-400">{group.items.length}</span>
                </div>
                <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-100">
                  {group.items.map((field) => {
                    const id = getFieldId(field);
                    const status = reviewStatuses[id] ?? field.reviewStatus;
                    const displayedValue = status === "rejected" ? "" : editedValues[id] ?? getFieldValue(field);
                    return (
                      <a
                        key={`overview-${id}`}
                        href={`#review-field-${encodeURIComponent(id)}`}
                        className={`block px-3 py-2 transition-colors hover:bg-slate-50 ${
                          isConfirmedStatus(status) ? "bg-emerald-50/70" : "bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-bold text-slate-700">{field.label}</p>
                            <p className={`mt-0.5 truncate text-xs font-semibold ${displayedValue ? "text-slate-950" : "text-rose-600"}`}>
                              {status === "rejected"
                                ? tr(locale, { ja: "保存しない", zh: "不采用", ko: "저장 안 함" })
                                : displayedValue || tr(locale, { ja: "未入力", zh: "未填写", ko: "미입력" })}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${getStatusClass(status)}`}>
                            {isConfirmedStatus(status) ? "✓ " : ""}
                            {getStatusLabel(locale, status)}
                          </span>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="space-y-4">
          {confirmationNotice ? (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900 shadow-sm"
            >
              <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">
                ✓
              </span>
              <span>
                {tr(locale, { ja: "「", zh: "「", ko: "「" })}
                {confirmationNotice.label}
                {tr(locale, {
                  ja: "」を確認しました。左側の一覧に反映しています。",
                  zh: "」已确认，左侧目录已更新。",
                  ko: "」을 확인했습니다. 왼쪽 목록을 업데이트했습니다.",
                })}
              </span>
            </div>
          ) : null}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-sm font-black text-slate-950">
                {tr(locale, { ja: "値を確認・修正", zh: "核对并修正读取值", ko: "판독값 확인 및 수정" })}
              </h4>
              <p className="mt-1 text-xs text-slate-500">
                {tr(locale, {
                  ja: "読めなかった値はここですぐ入力できます。",
                  zh: "读取失败的项会直接给出填写框，修正值实时显示在左侧。",
                  ko: "판독하지 못한 항목은 여기서 바로 입력하고 수정값은 왼쪽에 즉시 표시됩니다.",
                })}
              </p>
            </div>
            <div className="inline-flex w-fit rounded-lg border border-slate-200 bg-slate-50 p-1" aria-label={tr(locale, { ja: "表示範囲", zh: "显示范围", ko: "표시 범위" })}>
              <button
                type="button"
                onClick={() => setReviewMode("pending")}
                className={`rounded-md px-3 py-1.5 text-xs font-bold ${reviewMode === "pending" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
              >
                {tr(locale, { ja: "未確定", zh: "待处理", ko: "미확정" })} {reviewProgress.pending}
              </button>
              <button
                type="button"
                onClick={() => setReviewMode("all")}
                className={`rounded-md px-3 py-1.5 text-xs font-bold ${reviewMode === "all" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
              >
                {tr(locale, { ja: "すべて", zh: "全部", ko: "전체" })} {items.length}
              </button>
            </div>
          </div>

          {visibleGroups.length === 0 ? (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
              <span className="material-symbols-outlined text-3xl text-emerald-700">task_alt</span>
              <h4 className="mt-2 text-base font-black text-emerald-950">
                {tr(locale, { ja: "確認が完了しました", zh: "待处理项已全部确认", ko: "확인이 완료되었습니다" })}
              </h4>
              <button type="button" onClick={() => setReviewMode("all")} className="mt-3 text-xs font-bold text-emerald-800 underline underline-offset-4">
                {tr(locale, { ja: "すべての値を見直す", zh: "查看并修改全部值", ko: "전체 값 다시 보기" })}
              </button>
            </section>
          ) : null}

          {visibleGroups.map((group) => (
            <section key={group.groupKey} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <h4 className="text-sm font-black text-slate-900">{group.label}</h4>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600">{group.items.length}</span>
              </div>
              <div className="divide-y divide-slate-100">
                  {group.items.map((field) => {
                    const id = getFieldId(field);
                    const currentStatus = reviewStatuses[id] ?? field.reviewStatus;
                    const isConfirmed = isConfirmedStatus(currentStatus);
                    const isSettling = reviewMode === "pending" && settlingFieldIds.has(id);
                    const readValue = getFieldValue(field);
                  const currentValue = editedValues[id] ?? readValue;
                  const useTextarea = currentValue.length > 48 || currentValue.includes("\n") || field.fieldKey.toLowerCase().includes("address");
                  const updateValue = (value: string) => setEditedValues((current) => ({ ...current, [id]: value }));
                  const commitEditedValue = () => {
                    if (!Object.prototype.hasOwnProperty.call(editedValues, id) || currentValue === readValue) return;
                    setReviewStatuses((current) => ({ ...current, [id]: currentValue.trim() ? "edited" : "unknown" }));
                  };
                  return (
                    <article
                      id={`review-field-${encodeURIComponent(id)}`}
                      key={id}
                      className={`scroll-mt-24 overflow-hidden transition-all duration-500 ease-out ${
                        isSettling
                          ? "max-h-0 -translate-x-8 scale-[0.98] p-0 opacity-0"
                          : "max-h-[50rem] p-4 opacity-100"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-950">{field.label}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getStatusClass(currentStatus)}`}>
                              {isConfirmed ? "✓ " : ""}
                              {getStatusLabel(locale, currentStatus)}
                            </span>
                            {!hasReadableValue(field) ? (
                              <span className="text-[11px] font-bold text-rose-600">
                                {tr(locale, { ja: "読取できなかったため入力してください", zh: "未读取成功，请直接填写", ko: "판독하지 못했습니다. 직접 입력해 주세요" })}
                              </span>
                            ) : field.confidence < 0.65 ? (
                              <span className="text-[11px] font-bold text-amber-700">
                                {tr(locale, { ja: "読取値を仔細に確認", zh: "请仔细核对读取值", ko: "판독값을 주의해서 확인" })}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <details className="text-right text-[11px] text-slate-500">
                          <summary className="cursor-pointer font-bold text-slate-600">
                            {tr(locale, { ja: "確認元", zh: "查看来源", ko: "출처 보기" })}
                          </summary>
                          <p className="mt-1 max-w-xs truncate">{field.sourceSheet} {getSourceLabel(field)}</p>
                          <p>{getMethodLabel(locale, field.method)}</p>
                        </details>
                      </div>
                      <div
                        className={`mt-3 rounded-lg border p-3 ${
                          isConfirmed
                            ? "border-emerald-200 bg-emerald-50/50"
                            : hasReadableValue(field)
                              ? "border-slate-200 bg-slate-50"
                              : "border-rose-200 bg-rose-50/50"
                        }`}
                      >
                        <label className="block">
                          <span className="text-[11px] font-bold text-slate-600">
                            {tr(locale, { ja: "確定する値", zh: "确认使用的值", ko: "확정할 값" })}
                          </span>
                          {useTextarea ? (
                            <textarea
                              value={currentValue}
                              onChange={(event) => updateValue(event.target.value)}
                              onBlur={commitEditedValue}
                              rows={3}
                              placeholder={tr(locale, { ja: "読み取れなかった値を入力", zh: "请填写未读取的值", ko: "판독하지 못한 값 입력" })}
                              className="mt-1.5 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                            />
                          ) : (
                            <input
                              value={currentValue}
                              onChange={(event) => updateValue(event.target.value)}
                              onBlur={commitEditedValue}
                              placeholder={tr(locale, { ja: "読み取れなかった値を入力", zh: "请填写未读取的值", ko: "판독하지 못한 값 입력" })}
                              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                            />
                          )}
                        </label>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] text-slate-500">
                            {tr(locale, { ja: "入力中の値は左側にすぐ反映", zh: "输入中的值会实时显示在左侧", ko: "입력 중인 값이 왼쪽에 즉시 표시" })}
                          </p>
                          <div className="flex gap-2">
                            {isConfirmed ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-800">
                                <span aria-hidden="true">✓</span>
                                {tr(locale, { ja: "確認済み", zh: "已确认", ko: "확인됨" })}
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => setStatus(field, "rejected")}
                                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                                >
                                  {tr(locale, { ja: "保存しない", zh: "不采用", ko: "저장 안 함" })}
                                </button>
                                <button
                                  type="button"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => confirmField(field)}
                                  disabled={!currentValue.trim() || isSettling}
                                  className="rounded-md bg-indigo-700 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                                >
                                  {tr(locale, { ja: "この値を確定", zh: "确认此项", ko: "이 값 확정" })}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
      <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <div>
          <p className="text-xs font-bold text-slate-800">
            {reviewProgress.pending > 0
              ? tr(locale, { ja: `未確定 ${reviewProgress.pending} 項目`, zh: `还有 ${reviewProgress.pending} 项待处理`, ko: `미확정 ${reviewProgress.pending}항목` })
              : tr(locale, { ja: "すべて確定済み", zh: "所有项目已确认", ko: "모든 항목 확정 완료" })}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {tr(locale, {
              ja: "確定・修正した値だけ案件に反映します。",
              zh: "只会把已确认或已修正的值写入案件。",
              ko: "확정하거나 수정한 값만 안건에 반영합니다.",
            })}
          </p>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-800"
        >
          {targetCaseId || selectedMergeCaseId
            ? tr(locale, { ja: "確認結果を案件へ追加保存", zh: "将核对结果追加到案件", ko: "확인 결과를 안건에 추가 저장" })
            : tr(locale, { ja: "確認結果を案件として保存", zh: "保存核对结果为案件", ko: "확인 결과를 안건으로 저장" })}
        </button>
      </div>
    </form>
  );
}
