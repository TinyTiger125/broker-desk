import type { Locale } from "@/lib/locale";
import { ExcelImportQueueProcessor } from "@/components/excel-import-queue-processor";
import { ObjectImportUpload } from "@/components/object-import-upload";
import { ObjectImportFailureNotice, ObjectImportStatusBadge } from "@/components/object-import-status-badge";
import { ObjectAttachmentList } from "@/components/object-attachment-list";
import type { ObjectImportCandidateRecord, ObjectImportTargetRecord } from "@/lib/object-import-repository";
import type { ObjectAttachmentItem } from "@/lib/object-attachments";
import { customerIdentityFieldLabel } from "@/lib/customer-identity-field-catalog";

type ClientIdentityImportView = { target: ObjectImportTargetRecord; fields: ObjectImportCandidateRecord[] };

const copy = {
  ja: { title: "本人確認資料の読み取り", description: "既存の顧客プロフィール項目だけを候補として表示します。確認した項目だけ保存します。", upload: "資料ファイルを選択", confirm: "確認して保存", reject: "候補を棄却", source: "出典", candidate: "モデル候補", alternative: "別候補", confirmed: "確認して保存済み", rejected: "候補を棄却済み", notFound: "資料に記載なし", attributionBlocked: "本人を特定できないため候補を確認できません", retry: "再読み取り（1回）", refresh: "現在の顧客を再確認", review: "確認が必要です", openReview: "確認画面を開く", failed: "利用できる候補なし", sourceNumber: "資料", noTarget: "本人確認資料を選択すると、既存顧客項目の候補と出典がここに表示されます。", archive: "原資料・添付" },
  zh: { title: "读取身份证明资料", description: "只显示现有客户档案字段候选；确认后才保存。", upload: "选择资料文件", confirm: "确认并保存", reject: "拒绝候选", source: "来源", candidate: "模型候选", alternative: "其他候选", confirmed: "已确认保存", rejected: "已拒绝", notFound: "资料未记载", attributionBlocked: "无法确认候选属于本人", retry: "重新读取（限一次）", refresh: "重新核对当前客户", review: "需要确认", openReview: "打开确认内容", failed: "没有可用候选", sourceNumber: "资料", noTarget: "选择身份证明资料后，现有客户字段候选和来源会显示在这里。", archive: "原始资料与附件" },
  ko: { title: "본인 확인 자료 읽기", description: "기존 고객 프로필 필드의 후보만 표시하며 확인한 항목만 저장합니다.", upload: "자료 파일 선택", confirm: "확인 후 저장", reject: "후보 거부", source: "출처", candidate: "모델 후보", alternative: "대체 후보", confirmed: "확인 저장됨", rejected: "거부됨", notFound: "자료에 기재 없음", attributionBlocked: "본인에게 속한 후보인지 확인할 수 없습니다", retry: "다시 읽기 (1회)", refresh: "현재 고객 다시 확인", review: "확인이 필요합니다", openReview: "확인 화면 열기", failed: "사용 가능한 후보 없음", sourceNumber: "자료", noTarget: "본인 확인 자료를 선택하면 기존 고객 필드 후보와 출처가 여기에 표시됩니다.", archive: "원본 자료·첨부" },
} as const;

export function ClientIdentityImportSection({ locale, clientId, views = [], uploadAction, reviewAction, retryAction, refreshAction, observedVersion, returnTo, archiveItems, objectPage = false }: {
  locale: Locale;
  clientId: string;
  views?: ClientIdentityImportView[];
  uploadAction?: (formData: FormData) => Promise<void>;
  reviewAction?: (formData: FormData) => Promise<void>;
  retryAction?: (formData: FormData) => Promise<void>;
  refreshAction?: (formData: FormData) => Promise<void>;
  observedVersion?: string;
  returnTo?: string;
  archiveItems?: ObjectAttachmentItem[];
  objectPage?: boolean;
}) {
  const text = copy[locale];
  const visibleViews = views.filter((view) => view.target.status !== "completed" && (
    ["queued", "processing", "failed", "conflict"].includes(view.target.status)
      || view.fields.some((field) => !["confirmed", "rejected", "failed", "not_found"].includes(field.status))
  ));
  if (objectPage && visibleViews.length === 0 && !uploadAction && !archiveItems?.length) return null;
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="client-identity-import-heading">
      <div>
        <h2 id="client-identity-import-heading" className="text-base font-black text-slate-950">{text.title}</h2>
        <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{text.description}</p>
      </div>
      {uploadAction ? <div className="border-b border-slate-200 pb-3"><ObjectImportUpload action={uploadAction} targetType="party" targetId={clientId} locale={locale} returnTo={returnTo} /></div> : null}
      {archiveItems ? <div className="border-b border-slate-200 pb-3"><h3 className="px-1 pb-2 text-sm font-black text-slate-950">{text.archive}</h3><ObjectAttachmentList locale={locale} items={archiveItems} /></div> : null}
      {!views.length ? <p role="status" className="text-xs font-semibold text-slate-500">{text.noTarget}</p> : null}
      {objectPage ? [...new Set(views.filter((view) => ["queued", "processing"].includes(view.target.status)).map((view) => view.target.importJobId))].map((jobId) => <ExcelImportQueueProcessor key={jobId} jobId={jobId} locale={locale} successHref={returnTo ?? `/clients/${encodeURIComponent(clientId)}/edit`} objectRecoveryHref={returnTo ?? `/clients/${encodeURIComponent(clientId)}/edit`} />) : null}
      {visibleViews.map((view, viewIndex) => {
        const canReview = Boolean(reviewAction && view.target.status === "needs_review");
        const hasHumanDecision = view.fields.some((field) => field.finalSource === "human");
        const hasUsableCandidate = view.fields.some((field) => Boolean(field.candidateValue?.trim()) && !["not_found", "failed", "rejected"].includes(field.status));
        const emptyStandaloneCustomer = view.target.targetType === "party"
          && !view.target.caseId
          && view.target.status === "needs_review"
          && !hasHumanDecision
          && !hasUsableCandidate;
        const canRetry = Boolean(retryAction && view.target.attemptCount < 2 && (emptyStandaloneCustomer || ["failed", "conflict"].includes(view.target.status)));
        const refreshField = view.fields.find((field) => Boolean(field.candidateValue) && !["confirmed", "rejected", "failed", "not_found"].includes(field.status));
        const staleTarget = Boolean(refreshAction && observedVersion && refreshField && view.target.targetVersion !== observedVersion);
        const detailFields = view.fields.filter((field) => !["confirmed", "rejected", "failed", "not_found"].includes(field.status));
        return (
          <div key={view.target.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-client-identity-import-target={view.target.id}>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-600">
              <span>{text.sourceNumber} {viewIndex + 1}</span>
              <ObjectImportStatusBadge locale={locale} status={view.target.status} />
              {view.target.sourceAttachmentId ? <a href={`/api/attachments/${encodeURIComponent(view.target.sourceAttachmentId)}`} target="_blank" rel="noreferrer" className="text-[#0046ad] underline">{text.source}</a> : null}
              {canRetry && retryAction ? <form action={retryAction} className="ml-auto"><input type="hidden" name="importTargetId" value={view.target.id} />{returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}<button type="submit" className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-900">{text.retry}</button></form> : null}
              {staleTarget && refreshAction ? <form action={refreshAction} className="ml-auto"><input type="hidden" name="importTargetId" value={view.target.id} /><input type="hidden" name="fieldId" value={refreshField!.id} /><input type="hidden" name="expectedVersion" value={view.target.targetVersion} /><input type="hidden" name="observedVersion" value={observedVersion} /><input type="hidden" name="expectedCandidateValue" value={refreshField!.candidateValue ?? ""} /><input type="hidden" name="importJobId" value={view.target.importJobId} />{returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}<button type="submit" className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-900">{text.refresh}</button></form> : null}
            </div>
            <ObjectImportFailureNotice locale={locale} errorCode={view.target.errorCode} />
            {detailFields.length > 0 ? <details className="mt-2 rounded-md border border-slate-200 bg-white">
              <summary className="cursor-pointer px-2.5 py-2 text-xs font-bold text-[#0046ad]">{text.openReview}</summary>
              <div className="border-t border-slate-100 px-2.5 pb-2">
              {detailFields.map((field) => {
              const sourceRange = typeof field.provenance.sourceRange === "string" ? field.provenance.sourceRange : "";
              const sourceText = typeof field.provenance.sourceText === "string" ? field.provenance.sourceText : "";
              const pageNumber = typeof field.provenance.pageNumber === "number" ? field.provenance.pageNumber : undefined;
              const attributionBlocked = /model_attribution_blocked=([a-z_]+)/.exec(sourceRange)?.[1];
              const alternatives = Array.isArray(field.provenance.alternatives) ? field.provenance.alternatives as Array<{ value?: unknown; pageNumber?: unknown; sourceText?: unknown; uncertainty?: unknown }> : [];
              const fieldCanReview = canReview && Boolean(field.candidateValue) && !["confirmed", "rejected", "failed", "not_found"].includes(field.status);
              return (
                <div key={field.id} className="mt-2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs leading-5 text-slate-700">
                  <div className="flex flex-wrap items-center gap-1.5"><span className="font-bold">{customerIdentityFieldLabel(field.fieldKey)}</span>{field.finalSource === "human" && field.finalValue ? <span className="font-semibold text-slate-950">{field.finalValue}</span> : field.candidateValue ? <span>{field.candidateValue}</span> : null}{field.status === "confirmed" ? <span className="font-bold text-emerald-700">{text.confirmed}</span> : field.status === "rejected" ? <span className="font-bold text-slate-500">{text.rejected}</span> : field.status === "not_found" ? <span className="font-bold text-slate-500">{text.notFound}</span> : field.status === "conflict" || field.status === "low_confidence" ? <span className="font-bold text-amber-700">{text.review}</span> : null}</div>
                  {field.finalSource === "human" && field.finalValue && field.candidateValue && field.finalValue !== field.candidateValue ? <p className="mt-1 text-[11px] text-slate-500">{text.candidate}: {field.candidateValue}</p> : null}
                  {attributionBlocked ? <p className="mt-1 text-[11px] font-semibold text-amber-700">{text.attributionBlocked}</p> : null}
                  {sourceText.trim() ? <p className="mt-1 text-[11px] text-slate-600">{pageNumber ? `p.${pageNumber} ` : ""}{sourceText}</p> : null}
                  {alternatives.length > 0 ? <div className="mt-1 space-y-0.5 text-[11px] text-rose-800">{alternatives.map((alternative, index) => { const alternativeSourceText = typeof alternative.sourceText === "string" ? alternative.sourceText.trim() : ""; return <p key={`${field.id}-alternative-${index}`}>{text.alternative}{index + 1}: {typeof alternative.value === "string" && alternative.value ? alternative.value : text.notFound}{alternativeSourceText ? `${typeof alternative.pageNumber === "number" ? ` (p.${alternative.pageNumber})` : ""} · ${alternativeSourceText}` : ""}</p>; })}</div> : null}
                  {fieldCanReview && reviewAction ? <form action={reviewAction} className="mt-2 flex flex-wrap items-center gap-2"><input type="hidden" name="importTargetId" value={view.target.id} /><input type="hidden" name="fieldId" value={field.id} /><input type="hidden" name="expectedVersion" value={view.target.targetVersion} /><input type="hidden" name="expectedCandidateValue" value={field.candidateValue ?? ""} />{returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}<label className="sr-only" htmlFor={`client-identity-value-${field.id}`}>{customerIdentityFieldLabel(field.fieldKey)}</label><input id={`client-identity-value-${field.id}`} name="value" defaultValue={field.candidateValue ?? ""} className="min-h-9 min-w-40 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs" /><button type="submit" name="decision" value="confirm" className="min-h-9 rounded border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-900">{text.confirm}</button><button type="submit" name="decision" value="reject" className="min-h-9 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">{text.reject}</button></form> : null}
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
