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
    property: { ja: "物件情報", zh: "物件信息", ko: "매물 정보" },
    parties: { ja: "売主・買主", zh: "卖主・买主", ko: "매도인・매수인" },
    transaction: { ja: "取引条件", zh: "交易条件", ko: "거래 조건" },
    disclosure: { ja: "告知事項", zh: "告知事项", ko: "고지 사항" },
    needsReview: { ja: "不明・要確認", zh: "不明・需确认", ko: "불명・확인 필요" },
  };
  return labels[groupKey][locale];
}

function getStatusLabel(locale: Locale, status: LocalReviewStatus) {
  const labels: Record<LocalReviewStatus, Record<Locale, string>> = {
    suggested: { ja: "抽出候補", zh: "抽取候选", ko: "추출 후보" },
    accepted: { ja: "採用", zh: "采用", ko: "채택" },
    edited: { ja: "修正", zh: "已修正", ko: "수정" },
    unknown: { ja: "不明として保留", zh: "不明，暂缓", ko: "불명으로 보류" },
    rejected: { ja: "不採用", zh: "不采用", ko: "미채택" },
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
    return tr(locale, { ja: "ルール抽出", zh: "规则抽取", ko: "규칙 추출" });
  }
  if (method === "ocr") {
    return tr(locale, { ja: "OCR識別", zh: "OCR 识别", ko: "OCR 인식" });
  }
  return method;
}

function getSourceLabel(field: ExtractedInputField) {
  return field.sourceCell ?? field.sourceRange ?? "-";
}

function getFieldId(field: ExtractedInputField) {
  return `${field.fieldKey}:${field.sourceCell ?? field.sourceRange ?? field.sourceSheet}`;
}

export function InputExtractionReview({
  extraction,
  locale,
  importJobId,
  mergeCandidates = [],
}: {
  extraction: InputFileExtractionResult;
  locale: Locale;
  importJobId: string;
  mergeCandidates?: CaseMergeCandidateSummary[];
}) {
  const items = useMemo<ReviewItem[]>(
    () =>
      extraction.fields.map((field) => ({
        ...field,
        groupKey: getGroupKey(field),
      })),
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

  function acceptAll() {
    setReviewStatuses(
      Object.fromEntries(
        items.map((field) => [getFieldId(field), "accepted" satisfies LocalReviewStatus]),
      ),
    );
  }

  return (
    <form action={saveExtractionReviewAction} className="space-y-4">
      <input type="hidden" name="jobId" value={importJobId} />
      <input type="hidden" name="reviewDecisionsJson" value={reviewDecisionsJson} />
      <input type="hidden" name="mergeTargetCaseId" value={selectedMergeCaseId} />
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {tr(locale, {
              ja: "ここに表示している内容は自動識別した抽出候補です。保存すると採用・修正した項目だけが軽量案件の確認済みデータになります。正式な物件・顧客・見積へは自動登録されません。",
              zh: "这里显示的是自动识别出的抽取候选。保存后，只有采用和修正的字段会进入轻量案件的已确认数据；不会自动写入正式物件、客户或报价。",
              ko: "여기에 표시된 내용은 자동 식별된 추출 후보입니다. 저장하면 채택/수정한 항목만 경량 안건의 확인 데이터가 됩니다. 정식 매물, 고객, 견적에는 자동 등록되지 않습니다.",
            })}
          </p>
          <button
            type="button"
            onClick={acceptAll}
            className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100"
          >
            {tr(locale, { ja: "全部採用", zh: "全部采用", ko: "전체 채택" })}
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-slate-950">
              {tr(locale, { ja: "案件への入れ方を確認", zh: "确认资料进入哪个案件", ko: "안건 반영 방식 확인" })}
            </h4>
            <p className="mt-1 text-xs text-slate-600">
              {tr(locale, {
                ja: "同一案件の可能性が高い場合だけ、既存案件への追加を選べます。選ばない場合は新しい案件として保存します。",
                zh: "只有系统判断为同一案件可信度较高时，才允许追加到既有案件；不选择则保存为新案件。",
                ko: "같은 안건일 가능성이 높은 경우에만 기존 안건에 추가할 수 있습니다. 선택하지 않으면 새 안건으로 저장됩니다.",
              })}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-700">
            {mergeCandidates.length > 0
              ? tr(locale, { ja: "合併候補あり", zh: "有可合并候选", ko: "합병 후보 있음" })
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
                  {tr(locale, {
                    ja: "同一案件か判断できない場合はこちらを選びます。",
                    zh: "无法判断是否同一案件时选择这个。",
                    ko: "같은 안건인지 판단하기 어려우면 이 옵션을 선택합니다.",
                  })}
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
                      {tr(locale, { ja: "照合確度", zh: "匹配可信度", ko: "대조 신뢰도" })} {candidate.confidenceScore}%
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-slate-600">
                    {candidate.matchReasons.join(" / ")}
                    {candidate.conflictFields.length > 0
                      ? ` / ${tr(locale, { ja: "差分", zh: "差异", ko: "차이" })}: ${candidate.conflictFields.length}`
                      : ""}
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    {tr(locale, { ja: "既存資料", zh: "已有资料", ko: "기존 자료" })}: {candidate.sourceCount}
                    {" / "}
                    {tr(locale, { ja: "一致項目", zh: "匹配字段", ko: "일치 항목" })}: {candidate.matchedFieldCount}
                  </span>
                  {candidate.conflictDetails.length > 0 ? (
                    <span className="mt-2 block rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
                      <span className="block font-bold">
                        {tr(locale, { ja: "確認する差分", zh: "需要确认的差异", ko: "확인할 차이" })}
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
                zh: "我已确认匹配理由和差异；将这份资料追加到所选案件，并保留合并历史。",
                ko: "대조 이유와 차이를 확인했습니다. 이 자료를 선택한 기존 안건에 추가하고 합병 이력을 남깁니다.",
              })}
            </span>
          </label>
        ) : null}
      </section>

      {groupedItems.map((group) => (
        <section key={group.groupKey} className="rounded-xl border border-indigo-100 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-50 bg-indigo-50/70 px-4 py-3">
            <h4 className="text-sm font-bold text-indigo-950">{group.label}</h4>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-indigo-700">
              {group.items.length} {tr(locale, { ja: "候補", zh: "项候选", ko: "후보" })}
            </span>
          </div>
          <div className="divide-y divide-indigo-50">
            {group.items.map((field) => {
              const id = getFieldId(field);
              const currentStatus = reviewStatuses[id] ?? field.reviewStatus;
              const displayValue = currentStatus === "edited" ? editedValues[id] ?? field.normalizedValue : field.value;
              return (
                <article key={id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(160px,220px)_1fr_minmax(220px,280px)]">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{field.label}</p>
                    <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${getStatusClass(currentStatus)}`}>
                      {getStatusLabel(locale, currentStatus)}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[11px] font-semibold text-slate-500">
                        {tr(locale, { ja: "候補値", zh: "候选值", ko: "후보 값" })}
                      </p>
                      {currentStatus === "edited" ? (
                        <input
                          value={displayValue}
                          onChange={(event) => setEditedValues((current) => ({ ...current, [id]: event.target.value }))}
                          className="mt-1 w-full rounded-md border border-blue-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                          {displayValue || (
                            <span className="text-slate-400">
                              {tr(locale, { ja: "空欄・確認待ち", zh: "空值，待核对", ko: "빈 값, 확인 필요" })}
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

                  <div className="space-y-2 text-xs">
                    <div className="rounded-lg bg-slate-50 p-3 text-slate-600">
                      <p className="font-semibold text-slate-800">{tr(locale, { ja: "確認元", zh: "来源证据", ko: "확인 출처" })}</p>
                      <p className="mt-1 truncate">{field.sourceSheet}</p>
                      <p className="font-mono text-[11px]">{getSourceLabel(field)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded bg-indigo-50 px-2 py-1 font-semibold text-indigo-800">
                        {getMethodLabel(locale, field.method)}
                      </span>
                      <span className="rounded bg-indigo-50 px-2 py-1 font-semibold tabular-nums text-indigo-800">
                        {tr(locale, { ja: "確度", zh: "置信度", ko: "신뢰도" })} {Math.round(field.confidence * 100)}%
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(["accepted", "edited", "unknown", "rejected"] as const).map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setStatus(field, status)}
                          className={
                            "rounded-md border px-2.5 py-1.5 text-[11px] font-bold transition " +
                            (currentStatus === status
                              ? "border-indigo-700 bg-indigo-700 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
                          }
                        >
                          {getStatusLabel(locale, status)}
                        </button>
                      ))}
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
            ja: "保存後、確認済みデータと全項目の確認状態・確認元を案件に残します。",
            zh: "保存后，会在案件中保留已确认数据以及每一项的核对状态和来源证据。",
            ko: "저장 후 확인 데이터와 각 항목의 상태 및 출처를 안건에 남깁니다.",
          })}
        </p>
        <button
          type="submit"
          className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-800"
        >
          {selectedMergeCaseId
            ? tr(locale, { ja: "確認結果を案件へ追加保存", zh: "将核对结果追加到案件", ko: "확인 결과를 안건에 추가 저장" })
            : tr(locale, { ja: "確認結果を案件として保存", zh: "保存核对结果为案件", ko: "확인 결과를 안건으로 저장" })}
        </button>
      </div>
    </form>
  );
}
