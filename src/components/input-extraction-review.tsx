"use client";

import { useMemo, useState } from "react";
import { saveExtractionReviewAction } from "@/app/actions";
import type { CaseMergeCandidateSummary } from "@/lib/case-merge";
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

function getStatusLabel(locale: Locale, status: LocalReviewStatus) {
  const labels: Record<LocalReviewStatus, Record<Locale, string>> = {
    suggested: { ja: "要確認", zh: "待核对", ko: "확인 필요" },
    accepted: { ja: "採用済み", zh: "已采用", ko: "채택됨" },
    edited: { ja: "修正済み", zh: "已修正", ko: "수정됨" },
    unknown: { ja: "保留", zh: "暂缓", ko: "보류" },
    rejected: { ja: "保存しない", zh: "不保存", ko: "저장 안 함" },
  };
  return labels[status][locale];
}

function getDecisionButtonLabel(locale: Locale, status: Exclude<LocalReviewStatus, "suggested">) {
  const labels: Record<Exclude<LocalReviewStatus, "suggested">, Record<Locale, string>> = {
    accepted: { ja: "読取内容を保存", zh: "保存读取内容", ko: "읽은 내용 저장" },
    edited: { ja: "手入力を保存", zh: "保存手动内容", ko: "직접 입력 저장" },
    unknown: { ja: "後で確認", zh: "稍后确认", ko: "나중에 확인" },
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
        .sort((a, b) => getFieldPriority(a) - getFieldPriority(b) || a.label.localeCompare(b.label)),
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

  function setStatus(field: ExtractedInputField, status: LocalReviewStatus) {
    const id = getFieldId(field);
    setReviewStatuses((current) => ({ ...current, [id]: status }));
    if (status === "edited") {
      setEditedValues((current) => ({ ...current, [id]: current[id] ?? field.normalizedValue ?? field.value }));
    }
  }

  function acceptReadableFields() {
    setReviewStatuses(
      Object.fromEntries(
        items.map((field) => [
          getFieldId(field),
          hasReadableValue(field) ? ("accepted" satisfies LocalReviewStatus) : ("unknown" satisfies LocalReviewStatus),
        ]),
      ),
    );
  }

  return (
    <form action={saveExtractionReviewAction} className="space-y-4">
      <input type="hidden" name="jobId" value={importJobId} />
      <input type="hidden" name="reviewDecisionsJson" value={reviewDecisionsJson} />
      <input type="hidden" name="mergeTargetCaseId" value={selectedMergeCaseId} />
      {targetCaseId ? <input type="hidden" name="targetCaseId" value={targetCaseId} /> : null}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wider text-blue-700">
              {tr(locale, { ja: "読取結果", zh: "读取结果", ko: "읽기 결과" })}
            </p>
            <h3 className="mt-1 text-lg font-black text-slate-950">{extraction.documentTypeLabel}</h3>
            <p className="mt-1 truncate text-xs text-slate-500">{extraction.sourceFilename}</p>
          </div>
          <div className="grid min-w-[320px] grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <div className="border-r border-slate-200 p-3">
              <p className="text-[11px] font-bold text-slate-500">{tr(locale, { ja: "読取済み", zh: "已读取", ko: "읽음" })}</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{extractionStats.readable}</p>
            </div>
            <div className="border-r border-slate-200 p-3">
              <p className="text-[11px] font-bold text-slate-500">{tr(locale, { ja: "要補完", zh: "需补充", ko: "보완 필요" })}</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-rose-700">{extractionStats.empty}</p>
            </div>
            <div className="p-3">
              <p className="text-[11px] font-bold text-slate-500">{tr(locale, { ja: "再確認", zh: "需复核", ko: "재확인" })}</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-amber-700">{extractionStats.lowConfidence}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={acceptReadableFields}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            {tr(locale, { ja: "読取済みを採用", zh: "采用已读取项", ko: "읽은 항목 채택" })}
          </button>
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
                            {detail.fieldKey}: {detail.existingValue} / {detail.incomingValue}
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

      {groupedItems.map((group) => (
        <section key={group.groupKey} className="rounded-xl border border-indigo-100 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-50 bg-indigo-50/70 px-4 py-3">
            <h4 className="text-sm font-bold text-indigo-950">{group.label}</h4>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-indigo-700">
              {group.items.length} {tr(locale, { ja: "項目", zh: "项", ko: "항목" })}
            </span>
          </div>
          <div className="divide-y divide-indigo-50">
            {group.items.map((field) => {
              const id = getFieldId(field);
              const currentStatus = reviewStatuses[id] ?? field.reviewStatus;
              const readValue = getFieldValue(field);
              const manualValue = currentStatus === "edited" ? editedValues[id] ?? readValue : "";
              const useTextarea = readValue.length > 48 || readValue.includes("\n") || field.fieldKey.toLowerCase().includes("address");
              const updateManualValue = (value: string) => {
                setEditedValues((current) => ({ ...current, [id]: value }));
                setReviewStatuses((current) => ({ ...current, [id]: "edited" }));
              };
              return (
                <article key={id} className="grid gap-4 px-4 py-4 xl:grid-cols-[minmax(170px,220px)_minmax(260px,1fr)_minmax(280px,1fr)]">
                  <div className="space-y-3">
                    <p className="text-sm font-bold text-slate-900">{field.label}</p>
                    <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${getStatusClass(currentStatus)}`}>
                      {getStatusLabel(locale, currentStatus)}
                    </span>
                    <div className="space-y-1 text-[11px] text-slate-500">
                      <p>
                        {getMethodLabel(locale, field.method)}
                        {" / "}
                        {tr(locale, { ja: "読取目安", zh: "读取参考", ko: "읽기 참고" })} {Math.round(field.confidence * 100)}%
                      </p>
                      <p className="truncate">
                        {tr(locale, { ja: "確認元", zh: "来源", ko: "출처" })}: {field.sourceSheet} {getSourceLabel(field)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className={`rounded-lg border p-3 ${hasReadableValue(field) ? "border-slate-200 bg-slate-50" : "border-rose-200 bg-rose-50"}`}>
                      <p className="text-[11px] font-semibold text-slate-500">
                        {tr(locale, { ja: "読取内容", zh: "读取内容", ko: "읽은 내용" })}
                      </p>
                      {currentStatus === "edited" ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                          {readValue || (
                            <span className="text-slate-400">
                              {tr(locale, { ja: "読み取れませんでした", zh: "这项没有读到", ko: "읽지 못했습니다" })}
                            </span>
                          )}
                        </p>
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                          {readValue || (
                            <span className="text-slate-400">
                              {tr(locale, { ja: "読み取れませんでした", zh: "这项没有读到", ko: "읽지 못했습니다" })}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    {field.normalizedValue && field.normalizedValue !== field.value ? (
                      <p className="text-[11px] text-slate-500">
                        {tr(locale, { ja: "整えた表示", zh: "整理后的显示", ko: "정리된 표시" })}: {field.normalizedValue}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                    <div>
                      <p className="font-semibold text-slate-800">
                        {tr(locale, { ja: "保存する内容", zh: "要保存的内容", ko: "저장할 내용" })}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {tr(locale, {
                          ja: "必要な場合だけここで補足・修正します。",
                          zh: "需要补充或修正时，直接在这里填写。",
                          ko: "필요할 때 여기서 보완하거나 수정합니다.",
                        })}
                      </p>
                    </div>
                    {useTextarea ? (
                      <textarea
                        value={manualValue}
                        onChange={(event) => updateManualValue(event.target.value)}
                        rows={3}
                        placeholder={tr(locale, { ja: "手入力する内容", zh: "手动填写内容", ko: "직접 입력할 내용" })}
                        className="w-full resize-y rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    ) : (
                      <input
                        value={manualValue}
                        onChange={(event) => updateManualValue(event.target.value)}
                        placeholder={tr(locale, { ja: "手入力する内容", zh: "手动填写内容", ko: "직접 입력할 내용" })}
                        className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(["accepted", "edited", "unknown", "rejected"] as const).map((status) => {
                        const disabled = status === "accepted" && !hasReadableValue(field);
                        return (
                          <button
                            key={status}
                            type="button"
                            disabled={disabled}
                            onClick={() => setStatus(field, status)}
                            className={
                              "rounded-md border px-2.5 py-1.5 text-[11px] font-bold transition " +
                              (disabled
                                ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                                : currentStatus === status
                                  ? "border-indigo-700 bg-indigo-700 text-white"
                                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
                            }
                          >
                            {getDecisionButtonLabel(locale, status)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
      <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <p className="text-xs text-slate-600">
          {tr(locale, {
            ja: "保存すると、採用・修正した内容を案件に反映します。",
            zh: "保存后，采用和修正后的内容会写入案件。",
            ko: "저장하면 채택/수정한 내용이 안건에 반영됩니다.",
          })}
        </p>
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
