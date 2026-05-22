import Link from "next/link";
import { existsSync, readFileSync } from "fs";
import { saveGuaranteeApplicationPreviewAction } from "@/app/actions";
import { FriendsGuaranteeCalibrationPreview } from "@/components/friends-guarantee-calibration-preview";
import { PdfmeOfficialTemplateDesigner } from "@/components/pdfme-official-template-designer";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { getBrokerageCaseById, getDefaultUser, getGuaranteeApplicationDraft, listBrokerageCases } from "@/lib/data";
import {
  buildGuaranteeDraftReadiness,
  buildGuaranteeApplicationReadiness,
  getGuaranteeDraftFieldDefinitions,
  getGuaranteeCompanyTemplate,
  type GuaranteeReadinessStatus,
} from "@/lib/guarantee-application";
import { getCaseFieldValue } from "@/lib/case-field-normalization";
import {
  FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID,
  FRIENDS_GUARANTEE_LAYOUT_OVERRIDES_KEY,
  getFriendsGuaranteeCustomOverlayFields,
  getFriendsGuaranteeTemplateLayoutOverrides,
  getGuaranteePdfTemplateConfig,
  sanitizeFriendsGuaranteeLayoutOverrides,
} from "@/lib/friends-guarantee-pdf";

export const dynamic = "force-dynamic";

type GuaranteeApplicationPreviewPageProps = {
  searchParams?: Promise<{
    caseId?: string;
    engine?: string;
    flash?: string;
    templateId?: string;
  }>;
};

function statusClass(status: GuaranteeReadinessStatus) {
  if (status === "available") return "bg-emerald-100 text-emerald-800";
  if (status === "needs_confirmation") return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-800";
}

function statusLabel(status: GuaranteeReadinessStatus) {
  if (status === "available") return "入力済み";
  if (status === "needs_confirmation") return "要確認";
  return "未入力";
}

function getDraftValue(draftValues: Record<string, unknown>, fieldKey: string) {
  const value = draftValues[fieldKey];
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function previewFieldId(fieldKey: string) {
  return `field-${fieldKey.replaceAll(".", "-")}`;
}

export default async function GuaranteeApplicationPreviewPage({ searchParams }: GuaranteeApplicationPreviewPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const user = await getDefaultUser();
  if (!user) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="rounded-xl border border-rose-200 bg-white p-5 text-sm font-bold text-rose-700">担当ユーザーが見つかりません。</div>
      </main>
    );
  }

  const cases = await listBrokerageCases(user.id, 50);
  const requestedCaseId = String(params?.caseId ?? "").trim();
  const requestedTemplateId = String(params?.templateId ?? FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID).trim() || FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID;
  const template = getGuaranteeCompanyTemplate(requestedTemplateId);
  const templateConfig = getGuaranteePdfTemplateConfig(template.id);
  const previewEngine = params?.engine === "pdfme" ? "pdfme" : "guided";
  const selectedCase =
    (requestedCaseId ? await getBrokerageCaseById({ userId: user.id, caseId: requestedCaseId }) : null) ??
    cases.find((item) => item.id === "case_fixture_friends_guarantee_pdf") ??
    cases.find((item) => item.status === "reviewed") ??
    cases[0] ??
    null;
  const draft = selectedCase
    ? await getGuaranteeApplicationDraft({
        userId: user.id,
        caseId: selectedCase.id,
        templateId: template.id,
      })
    : null;
  const draftValues = draft?.fieldValuesJson ?? {};
  const draftDefinitions = getGuaranteeDraftFieldDefinitions(template.id);
  const draftReadiness = buildGuaranteeDraftReadiness(draft, template.id);
  const readinessGroups = buildGuaranteeApplicationReadiness({
    brokerageCase: selectedCase ?? undefined,
    template,
    draft,
  });
  const requiredFieldKeys = new Set(template.requiredFieldKeys);
  const unresolvedRequiredFields = readinessGroups.find((group) => group.id === "unresolved")?.fields ?? [];
  const requiredMissingCount = unresolvedRequiredFields.length;
  const customFields = selectedCase
    ? getFriendsGuaranteeCustomOverlayFields({ templateId: template.id, confirmedDataJson: selectedCase.confirmedDataJson })
    : [];
  const overlayFields = [...templateConfig.overlayFields, ...customFields];
  const filledCount =
    overlayFields.filter((field) => {
      if (!selectedCase) return false;
      if (field.custom) return customFields.some((customField) => customField.fieldKey === field.fieldKey && customField.value);
      return getCaseFieldValue(selectedCase.confirmedDataJson, field.fieldKey);
    }).length +
    draftReadiness.readyCount;
  const totalEditableCount = overlayFields.length + draftDefinitions.length;
  const downloadHref = selectedCase
    ? `/api/guarantee-applications/${encodeURIComponent(template.id)}/download?caseId=${encodeURIComponent(selectedCase.id)}`
    : "#";
  const layoutOverrides = sanitizeFriendsGuaranteeLayoutOverrides(
    {
      ...getFriendsGuaranteeTemplateLayoutOverrides(template.id),
      ...sanitizeFriendsGuaranteeLayoutOverrides(selectedCase?.confirmedDataJson?.[FRIENDS_GUARANTEE_LAYOUT_OVERRIDES_KEY]),
    },
  );
  const previewFieldValues = Object.fromEntries(
    overlayFields.map((field) => [
      field.fieldKey,
      field.custom
        ? customFields.find((customField) => customField.fieldKey === field.fieldKey)?.value ?? ""
        : selectedCase ? getCaseFieldValue(selectedCase.confirmedDataJson, field.fieldKey) : "",
    ]),
  );
  const manualAdjustedCount = Object.keys(layoutOverrides).length;
  const addedFieldCount = customFields.length;
  const manualPlacementCount = overlayFields.filter((field) => field.print === false && !layoutOverrides[field.fieldKey]).length;
  const templateNeedsCalibration = template.qualityStatus !== "verified";
  const canDownloadPreview =
    Boolean(selectedCase) &&
    requiredMissingCount === 0 &&
    (template.allowDirectDownload || manualAdjustedCount > 0 || addedFieldCount > 0);
  const basePdfDataUri = existsSync(templateConfig.pdfPath)
    ? `data:application/pdf;base64,${readFileSync(templateConfig.pdfPath).toString("base64")}`
    : "";
  const guidedPreviewHref = selectedCase
    ? `/guarantee-applications/${encodeURIComponent(template.id)}/preview?caseId=${encodeURIComponent(selectedCase.id)}`
    : `/guarantee-applications/${encodeURIComponent(template.id)}/preview`;
  const officialPdfPreviewHref = selectedCase
    ? `/guarantee-applications/${encodeURIComponent(template.id)}/preview?caseId=${encodeURIComponent(selectedCase.id)}&engine=pdfme`
    : `/guarantee-applications/${encodeURIComponent(template.id)}/preview?engine=pdfme`;

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <Link href="/output-center" className="hover:text-slate-900">PDF出力</Link>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span>{template.companyDisplayName}プレビュー</span>
            </div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{template.companyDisplayName}申込書の上で直接なおす</h1>
            <p className="mt-1 text-sm text-slate-600">赤い枠は未入力です。印字位置を見ながら、その場で追加・修正・削除できます。</p>
            {templateNeedsCalibration ? (
              <p className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                版式精校中：このテンプレートは保存後のPDF確認を前提に扱います
              </p>
            ) : null}
            <div className="mt-3 inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
              <Link
                href={guidedPreviewHref}
                className={`rounded-md px-3 py-1.5 text-xs font-black ${previewEngine === "guided" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                通常入力
              </Link>
              <Link
                href={officialPdfPreviewHref}
                className={`rounded-md px-3 py-1.5 text-xs font-black ${previewEngine === "pdfme" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                公式PDF精校
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedCase ? (
              <Link href={`/cases/${selectedCase.id}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                <span className="material-symbols-outlined text-[18px]">edit_note</span>
                案件全体を編集
              </Link>
            ) : null}
            {canDownloadPreview ? (
              <Link href={downloadHref} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
                <span className="material-symbols-outlined text-[18px]">download</span>
                確認済みPDFをダウンロード
              </Link>
            ) : (
              <button disabled className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-slate-300 px-4 py-2 text-sm font-bold text-white">
                <span className="material-symbols-outlined text-[18px]">lock</span>
                {requiredMissingCount > 0 ? "未入力を補ってからダウンロード" : "位置を保存してからダウンロード"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="min-h-[calc(100vh-132px)] rounded-xl border border-slate-200 bg-white shadow-sm">
          {selectedCase && previewEngine === "pdfme" && basePdfDataUri ? (
            <PdfmeOfficialTemplateDesigner
              basePdfDataUri={basePdfDataUri}
              fields={overlayFields}
              fieldValues={previewFieldValues}
              formId="guarantee-application-preview-form"
              initialLayoutOverrides={layoutOverrides}
              pageSize={templateConfig.pageSize}
              requiredFieldKeys={[...requiredFieldKeys]}
              templateName={template.companyDisplayName}
            />
          ) : selectedCase && previewEngine === "pdfme" ? (
            <div className="flex h-[calc(100vh-164px)] items-center justify-center rounded-lg border border-dashed border-rose-300 bg-rose-50 p-6 text-sm font-bold text-rose-700">
              公式PDF原本が見つかりません: {templateConfig.pdfPath}
            </div>
          ) : selectedCase ? (
            <FriendsGuaranteeCalibrationPreview
              fields={overlayFields}
              fieldValues={previewFieldValues}
              formId="guarantee-application-preview-form"
              imageAlt={`${template.companyDisplayName}申込書テンプレート`}
              imageHeight={templateConfig.imageHeight}
              imageSrc={templateConfig.imageSrc}
              imageWidth={templateConfig.imageWidth}
              initialLayoutOverrides={layoutOverrides}
              pageSize={templateConfig.pageSize}
              requiredFieldKeys={[...requiredFieldKeys]}
            />
          ) : (
            <div className="flex h-[calc(100vh-164px)] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm font-bold text-slate-500">
              プレビューできる案件がありません。
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <PageFlashBanner
            message={
              params?.flash === "template_layout_saved"
                ? "テンプレート位置を保存しました。次の案件にもこの位置が反映されます。"
                : params?.flash === "preview_saved"
                  ? "プレビュー用の入力内容を保存しました。左のPDFを確認してください。"
                  : undefined
            }
          />

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-500">対象案件</p>
                <h2 className="mt-1 text-base font-black text-slate-950">{selectedCase?.caseTitle ?? "未選択"}</h2>
                <p className="mt-1 text-xs font-bold text-slate-500">{template.companyLegalName}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${requiredMissingCount === 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                {requiredMissingCount === 0 ? "ダウンロード可" : `不足 ${requiredMissingCount}`}
              </span>
            </div>
            {templateNeedsCalibration ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                この会社の申込書はまだ出荷基準ではありません。データが全部入っていても、長い住所・分割マス・電話番号・金額欄の位置をプレビューで確認し、必要ならドラッグ調整か追加欄で補正してください。
              </div>
            ) : null}
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-[11px] font-bold text-slate-500">入力済み</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{filledCount}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-[11px] font-bold text-slate-500">全項目</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{totalEditableCount}</p>
              </div>
              <div className={requiredMissingCount > 0 ? "rounded-lg bg-rose-50 p-3" : manualPlacementCount > 0 ? "rounded-lg bg-amber-50 p-3" : "rounded-lg bg-emerald-50 p-3"}>
                <p className={`text-[11px] font-bold ${requiredMissingCount > 0 ? "text-rose-700" : manualPlacementCount > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                  {requiredMissingCount > 0 ? "未入力" : manualPlacementCount > 0 ? "要配置" : "完了"}
                </p>
                <p className={`mt-1 text-2xl font-black tabular-nums ${requiredMissingCount > 0 ? "text-rose-900" : manualPlacementCount > 0 ? "text-amber-900" : "text-emerald-900"}`}>
                  {requiredMissingCount > 0 ? requiredMissingCount : manualPlacementCount}
                </p>
              </div>
            </div>
          </section>

          {selectedCase ? (
            <form id="guarantee-application-preview-form" action={saveGuaranteeApplicationPreviewAction} className="space-y-4">
              <input type="hidden" name="caseId" value={selectedCase.id} />
              <input type="hidden" name="templateId" value={template.id} />

              {requiredMissingCount > 0 ? (
                <section className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <p className="text-sm font-black text-rose-950">先に確認する項目</p>
                  <div className="mt-3 grid gap-2">
                    {unresolvedRequiredFields.map((field) => (
                      <a key={`missing-${field.fieldKey}`} href={`#${previewFieldId(field.fieldKey)}`} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-50">
                        {field.label}
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-black text-slate-950">申込書上の入力欄</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">ここは確認用の索引です。修正は左の申込書上で直接行います。</p>
                <div className="mt-3 grid gap-2">
                  {overlayFields.map((field) => {
                    const value = field.custom
                      ? customFields.find((customField) => customField.fieldKey === field.fieldKey)?.value ?? ""
                      : getCaseFieldValue(selectedCase.confirmedDataJson, field.fieldKey);
                    const required = requiredFieldKeys.has(field.fieldKey);
                    const manualPlacementRequired = field.print === false && !layoutOverrides[field.fieldKey];
                    const status: GuaranteeReadinessStatus = value ? "available" : required ? "missing" : "missing";
                    return (
                      <a
                        key={`index-${field.fieldKey}`}
                        href={`#${previewFieldId(field.fieldKey)}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs hover:border-slate-300 hover:bg-white"
                      >
                        <span className="min-w-0">
                          <span className="block font-black text-slate-900">{field.label}</span>
                          <span className="mt-0.5 block truncate font-semibold text-slate-500">{value || "左の赤枠に入力"}</span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${manualPlacementRequired ? "bg-amber-100 text-amber-800" : required ? statusClass(status) : value ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
                          {manualPlacementRequired ? "要配置" : required ? statusLabel(status) : value ? "入力済み" : "任意"}
                        </span>
                      </a>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-black text-slate-950">出力前チェック</h3>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[11px] font-bold text-slate-500">手動位置</p>
                    <p className="mt-1 text-xl font-black tabular-nums text-slate-950">{manualAdjustedCount}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[11px] font-bold text-slate-500">追加欄</p>
                    <p className="mt-1 text-xl font-black tabular-nums text-slate-950">{addedFieldCount}</p>
                  </div>
                  <div className={requiredMissingCount > 0 ? "rounded-lg bg-rose-50 p-3" : manualPlacementCount > 0 ? "rounded-lg bg-amber-50 p-3" : "rounded-lg bg-emerald-50 p-3"}>
                    <p className={`text-[11px] font-bold ${requiredMissingCount > 0 ? "text-rose-700" : manualPlacementCount > 0 ? "text-amber-700" : "text-emerald-700"}`}>PDF</p>
                    <p className={`mt-1 text-sm font-black ${requiredMissingCount > 0 ? "text-rose-900" : manualPlacementCount > 0 ? "text-amber-900" : "text-emerald-900"}`}>
                      {requiredMissingCount > 0 ? "未完了" : manualPlacementCount > 0 ? "要確認" : "出力可"}
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-black text-slate-950">{template.companyDisplayName}の確認項目</h3>
                <div className="mt-3 grid gap-3">
                  {draftDefinitions.map((definition) => {
                    const value = getDraftValue(draftValues, definition.fieldKey);
                    const missing = definition.required && !value;
                    return (
                      <label key={definition.fieldKey} id={`field-${definition.fieldKey.replaceAll(".", "-")}`} className="block scroll-mt-24 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-slate-900">{definition.label}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${missing ? "bg-rose-100 text-rose-800" : value ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
                            {missing ? "未入力" : value ? "入力済み" : "任意"}
                          </span>
                        </div>
                        {definition.inputType === "textarea" ? (
                          <textarea
                            name={`draft:${definition.fieldKey}`}
                            defaultValue={value}
                            rows={3}
                            className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-slate-950"
                          />
                        ) : definition.inputType === "select" ? (
                          <select
                            name={`draft:${definition.fieldKey}`}
                            defaultValue={value}
                            className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-slate-950"
                          >
                            <option value="">未入力</option>
                            {definition.options?.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            name={`draft:${definition.fieldKey}`}
                            defaultValue={value}
                            className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-slate-950"
                          />
                        )}
                      </label>
                    );
                  })}
                </div>
              </section>

              <div className="sticky bottom-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
                <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800">
                  <span className="material-symbols-outlined text-[18px]">refresh</span>
                  保存してPDFを更新
                </button>
              </div>
            </form>
          ) : (
            <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-600">
              先に入力ファイルから案件を作成してください。
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
