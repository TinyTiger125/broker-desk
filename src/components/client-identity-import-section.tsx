import type { Locale } from "@/lib/locale";
import { ExcelImportQueueProcessor } from "@/components/excel-import-queue-processor";
import { ObjectImportUpload } from "@/components/object-import-upload";
import { ObjectImportFailureNotice, ObjectImportStatusBadge } from "@/components/object-import-status-badge";
import { ObjectAttachmentList } from "@/components/object-attachment-list";
import type { ObjectImportCandidateRecord, ObjectImportTargetRecord } from "@/lib/object-import-repository";
import type { ObjectAttachmentItem } from "@/lib/object-attachments";
import { customerIdentityFieldLabel, isCustomerGenderValue } from "@/lib/customer-identity-field-catalog";
import { isObjectImportBirthDateManualReviewRequired, isObjectImportManualBirthDateAttributable } from "@/lib/object-import-review";
import { HelpHint } from "@/components/help-hint";

type ClientIdentityImportView = { target: ObjectImportTargetRecord; fields: ObjectImportCandidateRecord[] };

const copy = {
  ja: { title: "本人確認資料の読み取り", description: "ここでは本人確認資料だけを読み取ります。明確な証拠のある安定した項目だけを空欄へ自動保存し、低信頼度・期限切れ・競合候補は候補として保持します。証明書記載の住所は現在住所とは限らないため、顧客の現住所へ自動保存せず、候補として原本と現状を別途確認してください。その他の原本は下の添付欄から追加してください。", add: "新しい資料を読み取る", upload: "資料ファイルを選択", confirm: "確認して保存", reject: "候補を棄却", source: "出典", candidate: "モデル候補", alternative: "別候補", confirmed: "確認して保存済み", rejected: "候補を棄却済み", notFound: "資料に記載なし", attributionBlocked: "本人を特定できないため候補を確認できません", genderManual: "性別候補は直接保存できません。顧客フォームで明示的に選択してください。", documentAddressReview: "証明書記載住所は現在住所とは限りません。顧客の現住所へは保存せず、原本と現状を別途確認してください。", expiredReview: "証明書は期限切れです。生年月日などの安定した印字事実も原本と照合してから手動で確認してください。自動保存はされません。", manualBirthDateReview: "原本と照合した生年月日を入力し、確認したことを明示して保存してください。モデル候補は証拠として使いません。", manualAttestation: "原本と照合しました", modelEvidence: "モデルが同じページに返した引用です。原本の独立証明ではありません。", retry: "再読み取り（1回）", refresh: "現在の顧客を再確認", review: "確認が必要です", openReview: "確認画面を開く", failed: "利用できる候補なし", sourceNumber: "資料", noTarget: "本人確認資料を選択すると、既存顧客項目の候補と出典がここに表示されます。", archive: "原資料・添付", autoSaved: "自動保存・要確認" },
  zh: { title: "读取身份证明资料", description: "这里只读取身份证明资料。只有证据明确且属于稳定事实的字段才会自动填入空白项；低置信、过期或冲突候选会保留为候选。证件上的地址不一定是当前住址，不会自动写入客户当前地址，请另行核对原件与现状。其他原件请在下方附件区添加。", add: "读取新资料", source: "来源", candidate: "模型候选", alternative: "其他候选", confirm: "确认并保存", reject: "拒绝候选", confirmed: "已确认保存", rejected: "已拒绝", notFound: "资料未记载", attributionBlocked: "无法确认候选属于本人", genderManual: "性别候选无法直接保存，请在客户表单中明确选择。", documentAddressReview: "证件地址不一定是当前住址。不会写入客户当前地址，请另行核对原件与现状。", expiredReview: "证件已过期。出生日期等稳定的印刷事实也需与原件核对后手动确认，不会自动保存。", manualBirthDateReview: "请先打开上方原始资料，对照后输入出生日期并明确确认后保存。模型候选不作为证据。", manualAttestation: "我已对照原件核对", modelEvidence: "这是模型返回的同页引用，不是对原件的独立证明。", retry: "重新读取（限一次）", refresh: "重新核对当前客户", review: "需要确认", openReview: "打开确认内容", failed: "没有可用候选", sourceNumber: "资料", noTarget: "选择身份证明资料后，现有客户字段候选和来源会显示在这里。", archive: "原始资料与附件", autoSaved: "已自动保存，待复核" },
  ko: { title: "본인 확인 자료 읽기", description: "여기서는 본인 확인 자료만 읽습니다. 증거가 명확한 안정적 사실만 빈칸에 자동 저장하며 낮은 신뢰도·만료·충돌 후보는 후보로 보관합니다. 증명서의 주소는 현재 주소가 아닐 수 있으므로 고객의 현재 주소로 자동 저장하지 않고 원본과 현재 상황을 별도로 확인해야 합니다. 그 밖의 원본은 아래 첨부 영역에서 추가해 주세요.", add: "새 자료 읽기", source: "출처", candidate: "모델 후보", alternative: "대체 후보", confirm: "확인 후 저장", reject: "후보 거부", confirmed: "확인 저장됨", rejected: "거부됨", notFound: "자료에 기재 없음", attributionBlocked: "본인에게 속한 후보인지 확인할 수 없습니다", genderManual: "성별 후보는 직접 저장할 수 없습니다. 고객 양식에서 명시적으로 선택해 주세요.", documentAddressReview: "증명서 주소가 현재 주소라는 뜻은 아닙니다. 고객의 현재 주소로 저장하지 말고 원본과 현재 상황을 별도로 확인하세요.", expiredReview: "증명서가 만료되었습니다. 생년월일 등 안정적인 인쇄 사실도 원본과 대조한 뒤 수동으로 확인해야 하며 자동 저장되지 않습니다.", manualBirthDateReview: "먼저 위의 원본 자료를 열어 대조한 뒤 생년월일을 입력하고 확인을 명시하여 저장하세요. 모델 후보는 증거로 사용하지 않습니다.", manualAttestation: "원본과 대조했습니다", modelEvidence: "모델이 같은 페이지에 반환한 인용이며 원본의 독립 증명이 아닙니다.", retry: "다시 읽기 (1회)", refresh: "현재 고객 다시 확인", review: "확인이 필요합니다", openReview: "확인 화면 열기", failed: "사용 가능한 후보 없음", sourceNumber: "자료", noTarget: "본인 확인 자료를 선택하면 기존 고객 필드 후보와 출처가 여기에 표시됩니다.", archive: "원본 자료·첨부", autoSaved: "자동 저장·확인 필요" },
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
  const content = (
    <>
      <div className="flex items-center gap-2"><h2 id="client-identity-import-heading" className="text-base font-black text-slate-950">{text.title}</h2><HelpHint id="client-identity-import-help" label={text.title} size="md">{text.description}</HelpHint></div>
      {uploadAction ? <div className="border-b border-slate-200 pb-3"><ObjectImportUpload action={uploadAction} targetType="party" targetId={clientId} locale={locale} returnTo={returnTo} accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" /></div> : null}
      {archiveItems ? <div className="border-b border-slate-200 pb-3"><h3 className="px-1 pb-2 text-sm font-black text-slate-950">{text.archive}</h3><ObjectAttachmentList locale={locale} items={archiveItems} /></div> : null}
      {!views.length ? <p role="status" className="text-xs font-semibold text-slate-500">{text.noTarget}</p> : null}
      {objectPage ? [...new Set(views.filter((view) => ["queued", "processing"].includes(view.target.status)).map((view) => view.target.importJobId))].map((jobId) => <ExcelImportQueueProcessor key={jobId} jobId={jobId} locale={locale} successHref={returnTo ?? `/clients/${encodeURIComponent(clientId)}/edit`} objectRecoveryHref={returnTo ?? `/clients/${encodeURIComponent(clientId)}/edit`} />) : null}
      {visibleViews.map((view, viewIndex) => {
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
            {emptyStandaloneCustomer ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{text.failed}。{text.retry}</p> : null}
            {detailFields.length > 0 ? <details className="mt-2 rounded-md border border-slate-200 bg-white">
              <summary className="cursor-pointer px-2.5 py-2 text-xs font-bold text-[#0046ad]">{text.openReview}</summary>
              <div className="border-t border-slate-100 px-2.5 pb-2">
              {detailFields.map((field) => {
              const sourceRange = typeof field.provenance.sourceRange === "string" ? field.provenance.sourceRange : "";
              const sourceText = typeof field.provenance.sourceText === "string" ? field.provenance.sourceText : "";
              const pageNumber = typeof field.provenance.pageNumber === "number" ? field.provenance.pageNumber : undefined;
              const invalidGenderCandidate = field.fieldKey === "gender" || field.fieldKey === "applicant.gender"
                ? !isCustomerGenderValue((field.candidateValue ?? "").trim())
                : false;
              const documentAddressCandidate = field.fieldKey === "currentAddress" || field.fieldKey === "applicant.currentAddress";
              const expiredCandidate = /identity_document_validity=expired/.test(sourceRange);
              const manualBirthDateAttributable = isObjectImportManualBirthDateAttributable(field);
              const manualBirthDateCandidate = isObjectImportBirthDateManualReviewRequired(field)
                && manualBirthDateAttributable;
              const manualBirthDateBlocked = isObjectImportBirthDateManualReviewRequired(field)
                && !manualBirthDateAttributable;
              const attributionBlocked = /model_attribution_blocked=([a-z_]+)/.exec(sourceRange)?.[1];
              const alternatives = Array.isArray(field.provenance.alternatives) ? field.provenance.alternatives as Array<{ value?: unknown; pageNumber?: unknown; sourceText?: unknown; uncertainty?: unknown }> : [];
              return (
                <div key={field.id} className="mt-2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs leading-5 text-slate-700">
                  <div className="flex flex-wrap items-center gap-1.5"><span className="font-bold">{customerIdentityFieldLabel(field.fieldKey)}</span>{field.finalSource === "human" && field.finalValue ? <span className="font-semibold text-slate-950">{field.finalValue}</span> : field.candidateValue ? <span>{field.candidateValue}</span> : null}{field.status === "confirmed" ? <span className="font-bold text-emerald-700">{text.confirmed}</span> : field.status === "rejected" ? <span className="font-bold text-slate-500">{text.rejected}</span> : field.provenance.autoSavedAt ? <span className="font-bold text-blue-700">{text.autoSaved}</span> : field.status === "not_found" ? <span className="font-bold text-slate-500">{text.notFound}</span> : field.status === "conflict" || field.status === "low_confidence" ? <span className="font-bold text-amber-700">{text.review}</span> : null}</div>
                  {field.finalSource === "human" && field.finalValue && field.candidateValue && field.finalValue !== field.candidateValue ? <p className="mt-1 text-[11px] text-slate-500">{text.candidate}: {field.candidateValue}</p> : null}
                  {attributionBlocked ? <p className="mt-1 text-[11px] font-semibold text-amber-700">{text.attributionBlocked}</p> : null}
                  {invalidGenderCandidate ? <p className="mt-1 text-[11px] font-semibold text-amber-700">{text.genderManual}</p> : null}
                  {documentAddressCandidate ? <p className="mt-1 text-[11px] font-semibold text-amber-700">{text.documentAddressReview}</p> : manualBirthDateCandidate ? <p className="mt-1 text-[11px] font-semibold text-amber-700">{text.manualBirthDateReview}</p> : manualBirthDateBlocked ? <p className="mt-1 text-[11px] font-semibold text-amber-700">{text.attributionBlocked}</p> : expiredCandidate ? <p className="mt-1 text-[11px] font-semibold text-amber-700">{text.expiredReview}</p> : null}
                  {sourceText.trim() ? <p className="mt-1 text-[11px] text-slate-600">{pageNumber ? `p.${pageNumber} ` : ""}{text.modelEvidence}: {sourceText}</p> : null}
                  {alternatives.length > 0 ? <div className="mt-1 space-y-0.5 text-[11px] text-rose-800">{alternatives.map((alternative, index) => { const alternativeSourceText = typeof alternative.sourceText === "string" ? alternative.sourceText.trim() : ""; return <p key={`${field.id}-alternative-${index}`}>{text.alternative}{index + 1}: {typeof alternative.value === "string" && alternative.value ? alternative.value : text.notFound}{alternativeSourceText ? `${typeof alternative.pageNumber === "number" ? ` (p.${alternative.pageNumber})` : ""} · ${alternativeSourceText}` : ""}</p>; })}</div> : null}
                  {reviewAction && field.candidateValue && !invalidGenderCandidate && !manualBirthDateBlocked && !["confirmed", "rejected", "failed", "not_found"].includes(field.status) ? <div className="mt-2 flex flex-wrap gap-2">{!documentAddressCandidate ? manualBirthDateCandidate ? <form action={reviewAction} className="flex flex-wrap items-end gap-2"><input type="hidden" name="importTargetId" value={view.target.id} /><input type="hidden" name="fieldId" value={field.id} /><input type="hidden" name="expectedVersion" value={view.target.targetVersion} /><input type="hidden" name="expectedCandidateValue" value={field.candidateValue} /><input type="hidden" name="decision" value="confirm" /><label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700"><span>{text.manualBirthDateReview}</span><input type="date" name="value" required className="rounded border border-slate-300 px-2 py-1" /></label><label className="flex items-center gap-1 text-[11px] font-semibold text-slate-700"><input type="checkbox" name="manualAttestation" value="1" required />{text.manualAttestation}</label>{returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}<button type="submit" className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-900">{text.confirm}</button></form> : <form action={reviewAction}><input type="hidden" name="importTargetId" value={view.target.id} /><input type="hidden" name="fieldId" value={field.id} /><input type="hidden" name="expectedVersion" value={view.target.targetVersion} /><input type="hidden" name="expectedCandidateValue" value={field.candidateValue} /><input type="hidden" name="decision" value="confirm" /><input type="hidden" name="value" value={field.candidateValue} />{returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}<button type="submit" className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-900">{text.confirm}</button></form> : null}<form action={reviewAction}><input type="hidden" name="importTargetId" value={view.target.id} /><input type="hidden" name="fieldId" value={field.id} /><input type="hidden" name="expectedVersion" value={view.target.targetVersion} /><input type="hidden" name="expectedCandidateValue" value={field.candidateValue} /><input type="hidden" name="decision" value="reject" />{returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}<button type="submit" className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700">{text.reject}</button></form></div> : null}
                  {manualBirthDateBlocked && reviewAction && field.candidateValue && !["confirmed", "rejected", "failed", "not_found"].includes(field.status) ? <form action={reviewAction} className="mt-2"><input type="hidden" name="importTargetId" value={view.target.id} /><input type="hidden" name="fieldId" value={field.id} /><input type="hidden" name="expectedVersion" value={view.target.targetVersion} /><input type="hidden" name="expectedCandidateValue" value={field.candidateValue} /><input type="hidden" name="decision" value="reject" />{returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}<button type="submit" className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700">{text.reject}</button></form> : null}
                </div>
              );
              })}
              </div>
            </details> : null}
          </div>
        );
      })}
    </>
  );
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="client-identity-import-heading">
      {objectPage ? <details className="group" data-object-import-details>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0"><span className="block text-sm font-black text-slate-950">{text.title}</span><span className="mt-0.5 block truncate text-xs font-semibold text-slate-600">{text.add}</span></span>
          <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[18px] text-slate-500 transition-transform group-open:rotate-90 motion-reduce:transition-none">chevron_right</span>
        </summary>
        <div className="space-y-3 pt-3">{content}</div>
      </details> : content}
    </section>
  );
}
