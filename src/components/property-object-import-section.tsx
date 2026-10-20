import Link from "next/link";
import type { Locale } from "@/lib/locale";
import { ExcelImportQueueProcessor } from "@/components/excel-import-queue-processor";
import { ObjectImportUpload } from "@/components/object-import-upload";
import { ObjectImportFailureNotice, ObjectImportStatusBadge } from "@/components/object-import-status-badge";
import { ObjectAttachmentList } from "@/components/object-attachment-list";
import type { ObjectImportCandidateRecord, ObjectImportTargetRecord } from "@/lib/object-import-repository";
import type { ObjectAttachmentItem } from "@/lib/object-attachments";
import { OBJECT_READER_FIELD_LABELS } from "@/lib/object-reader-mapping";

type PropertyObjectImportView = {
  target: ObjectImportTargetRecord;
  fields: ObjectImportCandidateRecord[];
};

type PropertyObjectImportSectionProps = {
  locale: Locale;
  caseId?: string;
  propertyId: string;
  caseTitle?: string;
  views?: PropertyObjectImportView[];
  uploadAction?: (formData: FormData) => Promise<void>;
  reviewAction?: (formData: FormData) => Promise<void>;
  refreshAction?: (formData: FormData) => Promise<void>;
  retryAction?: (formData: FormData) => Promise<void>;
  observedVersion?: string;
  returnTo?: string;
  unavailable?: boolean;
  archiveItems?: ObjectAttachmentItem[];
  objectPage?: boolean;
};

const copy = {
  ja: {
    title: "物件資料の読み取り",
    description: "既存の物件プロフィール項目だけを候補として表示し、確認した項目だけ保存します。",
    noCase: "この物件から資料を選択すると、既存の物件プロフィール項目を確認できます。",
    noTarget: "物件資料を選択すると、既存項目の候補と出典がここに表示されます。",
    unavailable: "資料解析は現在利用できません。既存の物件プロフィールは引き続き編集できます。",
    openCase: "案件の確認画面を開く",
    review: "確認が必要です",
    alternative: "候補",
    confirm: "確認して保存",
    reject: "候補を棄却",
    source: "出典",
    file: "資料ファイルを選択",
    refresh: "現在の物件を再確認",
    confirmed: "確認して保存済み",
    rejected: "候補を棄却済み",
    failed: "利用できる候補なし",
    notFound: "資料に記載なし",
    modelCandidate: "モデル候補",
    retry: "再読み取り（1回）",
    openReview: "確認画面を開く",
    archive: "原資料・添付",
  },
  zh: {
    title: "读取物件资料",
    description: "只显示现有物件档案字段的候选值，确认后才保存。",
    noCase: "可直接从此物件选择资料，核对现有物件档案字段。",
    noTarget: "选择物件资料后，现有字段候选值和来源会显示在这里。",
    unavailable: "资料解析暂不可用；现有物件档案仍可继续编辑。",
    openCase: "打开案件确认页",
    review: "需要确认",
    alternative: "候选",
    confirm: "确认并保存",
    reject: "拒绝候选",
    source: "来源",
    file: "选择资料文件",
    refresh: "重新核对当前物件",
    confirmed: "已确认保存",
    rejected: "已拒绝",
    failed: "没有可用候选",
    notFound: "资料未记载",
    modelCandidate: "模型候选",
    retry: "重新读取（限一次）",
    openReview: "打开确认内容",
    archive: "原始资料与附件",
  },
  ko: {
    title: "매물 자료 읽기",
    description: "기존 매물 프로필 필드의 후보만 표시하며 확인한 항목만 저장합니다.",
    noCase: "이 매물에서 자료를 선택하면 기존 매물 프로필 필드를 확인할 수 있습니다.",
    noTarget: "매물 자료를 선택하면 기존 필드 후보와 출처가 여기에 표시됩니다.",
    unavailable: "자료 분석을 사용할 수 없습니다. 기존 매물 프로필은 계속 편집할 수 있습니다.",
    openCase: "안건 확인 화면 열기",
    review: "확인이 필요합니다",
    alternative: "후보",
    confirm: "확인 후 저장",
    reject: "후보 거부",
    source: "출처",
    file: "자료 파일 선택",
    refresh: "현재 매물 다시 확인",
    confirmed: "확인 저장됨",
    rejected: "거부됨",
    failed: "사용 가능한 후보 없음",
    notFound: "자료에 기재 없음",
    modelCandidate: "모델 후보",
    retry: "다시 읽기 (1회)",
    openReview: "확인 화면 열기",
    archive: "원본 자료·첨부",
  },
} as const;

export function PropertyObjectImportSection({ locale, caseId, propertyId, caseTitle, views = [], uploadAction, reviewAction, refreshAction, retryAction, observedVersion, returnTo, unavailable = false, archiveItems, objectPage = false }: PropertyObjectImportSectionProps) {
  const text = copy[locale];
  const visibleViews = views.filter((view) => view.target.status !== "completed" && (
    ["queued", "processing", "failed", "conflict"].includes(view.target.status)
      || view.fields.some((field) => !["confirmed", "rejected", "failed", "not_found"].includes(field.status))
  ));
  if (objectPage && visibleViews.length === 0 && !uploadAction && !archiveItems?.length) return null;
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="property-object-import-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="property-object-import-heading" className="text-base font-black text-slate-950">{text.title}</h2>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{text.description}</p>
        </div>
        {caseId ? <Link href={`/cases/${encodeURIComponent(caseId)}#case-review-desk`} className="inline-flex min-h-10 items-center rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-[#0046ad]">{text.openCase}{caseTitle ? ` · ${caseTitle}` : ""}</Link> : null}
      </div>
      {unavailable ? <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">{text.unavailable}</p> : null}
      {!caseId && !uploadAction && !views.length && !unavailable ? <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">{text.noCase}</p> : null}
      {uploadAction ? <div className="border-b border-slate-200 pb-3"><ObjectImportUpload action={uploadAction} caseId={caseId} targetType="property" targetId={propertyId} returnTo={returnTo} locale={locale} /></div> : null}
      {archiveItems ? <div className="border-b border-slate-200 pb-3"><h3 className="px-1 pb-2 text-sm font-black text-slate-950">{text.archive}</h3><ObjectAttachmentList locale={locale} items={archiveItems} /></div> : null}
      {!views.length && !unavailable && !uploadAction ? <p className="text-xs font-semibold text-slate-500">{text.noTarget}</p> : null}
      {objectPage ? [...new Set(views.filter((view) => ["queued", "processing"].includes(view.target.status)).map((view) => view.target.importJobId))].map((jobId) => <ExcelImportQueueProcessor key={jobId} jobId={jobId} locale={locale} successHref={returnTo ?? `/properties/${encodeURIComponent(propertyId)}/edit`} objectRecoveryHref={returnTo ?? `/properties/${encodeURIComponent(propertyId)}/edit`} />) : null}
      {visibleViews.map((view) => {
        const canReview = Boolean(reviewAction && view.target.status === "needs_review");
        const canRetry = Boolean(retryAction && (view.target.status === "failed" || view.target.status === "conflict") && view.target.attemptCount < 2);
        const refreshField = view.fields.find((field) => Boolean(field.candidateValue) && !["confirmed", "rejected", "failed", "not_found"].includes(field.status));
        const staleTarget = Boolean(refreshAction && observedVersion && view.target.targetVersion !== observedVersion && refreshField);
        const detailFields = view.fields.filter((field) => !["confirmed", "rejected", "failed", "not_found"].includes(field.status));
        return (
        <div key={view.target.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-property-object-import-target={`${view.target.targetType}:${view.target.targetId}`}>
          <div className="flex min-h-7 flex-wrap items-center gap-2 text-[11px] font-bold leading-5 text-slate-600">
            <ObjectImportStatusBadge locale={locale} status={view.target.status} />
            {view.target.documentType ? <span>{view.target.documentType}</span> : null}
            {view.target.sourceAttachmentId ? <a href={`/api/attachments/${encodeURIComponent(view.target.sourceAttachmentId)}`} target="_blank" rel="noreferrer" className="text-[#0046ad] underline">{text.source}</a> : null}
            {canRetry && retryAction ? <form action={retryAction} className="ml-auto"><input type="hidden" name="importTargetId" value={view.target.id} />{returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}<button type="submit" className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-900">{text.retry}</button></form> : null}
            {staleTarget && refreshAction ? <form action={refreshAction} className="ml-auto"><input type="hidden" name="importTargetId" value={view.target.id} /><input type="hidden" name="fieldId" value={refreshField!.id} /><input type="hidden" name="expectedVersion" value={view.target.targetVersion} /><input type="hidden" name="observedVersion" value={observedVersion} /><input type="hidden" name="expectedCandidateValue" value={refreshField!.candidateValue ?? ""} /><input type="hidden" name="importJobId" value={view.target.importJobId} />{returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}<button type="submit" className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-900">{text.refresh}</button></form> : null}
          </div>
          <ObjectImportFailureNotice locale={locale} errorCode={view.target.errorCode} />
          {detailFields.length > 0 ? <details className="mt-2 rounded-md border border-slate-200 bg-white">
            <summary className="cursor-pointer px-2.5 py-2 text-xs font-bold text-[#0046ad]">{text.openReview}</summary>
            <div className="border-t border-slate-100 px-2.5 pb-2">
            {detailFields.map((field) => {
            const sourceText = typeof field.provenance.sourceText === "string" ? field.provenance.sourceText : "";
            const pageNumber = typeof field.provenance.pageNumber === "number" ? field.provenance.pageNumber : undefined;
            const alternatives = Array.isArray(field.provenance.alternatives) ? field.provenance.alternatives as Array<{ value?: unknown; pageNumber?: unknown; sourceText?: unknown }> : [];
            const fieldCanReview = canReview && Boolean(field.candidateValue) && !["confirmed", "rejected", "failed", "not_found"].includes(field.status);
            return (
              <div key={field.id} className={`mt-2 rounded-md border px-2.5 py-2 text-xs leading-5 ${field.status === "conflict" ? "border-rose-200 bg-rose-50 text-rose-900" : field.status === "low_confidence" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700"}`}>
                <div className="flex flex-wrap items-center gap-1.5"><span className="font-bold">{OBJECT_READER_FIELD_LABELS[field.fieldKey] ?? field.fieldKey}</span>{field.finalSource === "human" && field.finalValue ? <span className="break-words [overflow-wrap:anywhere] font-semibold text-slate-950">{field.finalValue}</span> : field.candidateValue ? <span className="break-words [overflow-wrap:anywhere]">{field.candidateValue}</span> : null}{field.status === "confirmed" ? <span className="font-bold text-emerald-700">{text.confirmed}</span> : field.status === "rejected" ? <span className="font-bold text-slate-500">{text.rejected}</span> : field.status === "failed" ? <span className="font-bold text-rose-700">{text.failed}</span> : field.status === "not_found" ? <span className="font-bold text-slate-500">{text.notFound}</span> : null}{field.status === "conflict" || field.status === "low_confidence" ? <span className="font-bold">{text.review}</span> : null}</div>
                {field.finalSource === "human" && field.finalValue && field.candidateValue && field.finalValue !== field.candidateValue ? <p className="mt-1 text-[11px] text-slate-500">{text.modelCandidate}：{field.candidateValue}</p> : null}
                {pageNumber || sourceText ? <p className="mt-1 text-[11px] text-slate-600">{pageNumber ? `p.${pageNumber}` : ""}{pageNumber && sourceText ? " · " : ""}{sourceText}</p> : null}
                {alternatives.length > 1 ? <div className="mt-1 space-y-0.5 text-[11px] text-rose-800">{alternatives.map((alternative, index) => <p key={`${field.id}-alternative-${index}`}>{text.alternative}{index + 1}: {typeof alternative.value === "string" ? alternative.value : "—"}{typeof alternative.pageNumber === "number" ? ` (p.${alternative.pageNumber})` : ""}{typeof alternative.sourceText === "string" && alternative.sourceText ? ` · ${alternative.sourceText}` : ""}</p>)}</div> : null}
                {fieldCanReview && reviewAction ? <form action={reviewAction} className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="importTargetId" value={view.target.id} />
                  <input type="hidden" name="fieldId" value={field.id} />
                  <input type="hidden" name="expectedVersion" value={view.target.targetVersion} />
                  <input type="hidden" name="expectedCandidateValue" value={field.candidateValue ?? ""} />
                  {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
                  {field.fieldKey.startsWith("lease.") ? <input type="hidden" name="caseFieldKey" value={field.fieldKey} /> : null}
                  <label className="sr-only" htmlFor={`property-import-value-${field.id}`}>{OBJECT_READER_FIELD_LABELS[field.fieldKey] ?? field.fieldKey}</label>
                  <input id={`property-import-value-${field.id}`} name="value" defaultValue={field.candidateValue ?? ""} className="min-h-9 min-w-40 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs" />
                  <button type="submit" name="decision" value="confirm" className="min-h-9 rounded border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-900">{text.confirm}</button>
                  <button type="submit" name="decision" value="reject" className="min-h-9 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">{text.reject}</button>
                </form> : null}
              </div>
            );
            })}
            </div>
          </details> : null}
        </div>
        );
      })}
    </section>
  );
}
