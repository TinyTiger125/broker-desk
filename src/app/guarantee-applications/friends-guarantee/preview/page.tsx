import Link from "next/link";
import { notFound } from "next/navigation";
import { saveGuaranteeApplicationPreviewAction } from "@/app/actions";
import { FriendsGuaranteeCalibrationPreview } from "@/components/friends-guarantee-calibration-preview";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { CASE_FIELD_DEFINITIONS, type CatalogCaseFieldDefinition } from "@/lib/case-field-catalog";
import { getBrokerageCaseById, getGuaranteeApplicationDraft, listBrokerageCases } from "@/lib/data";
import { formatDate } from "@/lib/format";
import {
  buildGuaranteeDraftReadiness,
  buildGuaranteeApplicationReadiness,
  GUARANTEE_FIELD_COMPLETION_LABELS,
  getGuaranteeFieldCompletionMode,
  getGuaranteeFieldCompletionSummary,
  getGuaranteeDraftFieldDefinitions,
  findGuaranteeCompanyTemplate,
  type GuaranteeReadinessStatus,
} from "@/lib/guarantee-application";
import { getCaseFieldValue } from "@/lib/case-field-normalization";
import {
  FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID,
  getGuaranteeConfirmedOverlayFieldKeys,
  type FriendsOverlayField,
  getFriendsGuaranteeCustomOverlayFields,
  getFriendsGuaranteeEffectiveDeletedOverlayFieldKeys,
  getFriendsGuaranteeEffectiveLayoutOverrides,
  getFriendsOverlayFieldPrintMode,
  formatFriendsOverlayValue,
  isFriendsOverlayFieldManualOnly,
  isFriendsOverlayFieldNeverPrinted,
  getGuaranteePdfTemplateConfig,
} from "@/lib/friends-guarantee-pdf";
import { getFriendsOverlayEstimatedTextFit, type FriendsOverlayTextFitStatus } from "@/lib/friends-guarantee-fit";
import { evaluateGuaranteeDownloadGate } from "@/lib/guarantee-download-gate";
import { requireTenantSession } from "@/lib/tenant-session";

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

function isDraftSpecificField(fieldKey: string) {
  return fieldKey.startsWith("company_option.");
}

function formatPreviewFieldValue(field: FriendsOverlayField, value: string) {
  return formatFriendsOverlayValue(field, value);
}

function fitStatusLabel(status: FriendsOverlayTextFitStatus) {
  if (status === "overflows") return "長すぎ";
  if (status === "segment_overflows") return "桁数超過";
  if (status === "shrinks") return "縮小印字";
  return "";
}

const ADDITIONAL_TEMPLATE_BINDING_FIELDS = [
  ["property.postalCode", "物件郵便番号"],
  ["applicant.homePhone", "自宅電話"],
  ["applicant.mobilePhone", "携帯電話"],
  ["applicant.identityDocumentType", "確認資料種別"],
  ["applicant.nationality", "国籍"],
  ["applicant.residenceStatus", "在留資格"],
  ["applicant.residencePeriod", "在留期間"],
  ["applicant.residenceCardExpiry", "在留カード有効期限"],
  ["applicant.residenceCardNumber", "在留カード番号"],
  ["applicant.workRestriction", "就労制限"],
  ["applicant.driverLicenseNumber", "免許証番号"],
  ["applicant.driverLicenseExpiry", "免許証有効期限"],
  ["applicant.driverLicenseConditions", "免許条件"],
  ["guarantor.postalCode", "連帯保証人1 郵便番号"],
  ["guarantor.driverLicenseNumber", "連帯保証人1 免許証番号"],
  ["guarantor.homePhone", "連帯保証人1 自宅電話"],
  ["guarantor.mobilePhone", "連帯保証人1 携帯電話"],
  ["emergencyContact.driverLicenseNumber", "緊急連絡先 免許証番号"],
  ["emergencyContact.homePhone", "緊急連絡先 自宅電話"],
  ["emergencyContact.mobilePhone", "緊急連絡先 携帯電話"],
] as const;

const TEMPLATE_BINDING_VALUE_FALLBACKS: Record<string, string[]> = {
  "applicant.mobilePhone": ["applicant.phone"],
  "guarantor.mobilePhone": ["guarantor.phone"],
  "emergencyContact.mobilePhone": ["emergencyContact.phone"],
};

type PreviewBindingOption = {
  fieldKey: string;
  label: string;
  value: string;
  groupId?: string;
  groupLabel?: string;
  valueKind?: CatalogCaseFieldDefinition["valueKind"];
  storageScope?: CatalogCaseFieldDefinition["storageScope"];
};

export default async function GuaranteeApplicationPreviewPage({ searchParams }: GuaranteeApplicationPreviewPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const session = await requireTenantSession({ permission: "output.preview" });
  const user = session.user;
  const tenantId = session.tenant.id;

  const cases = await listBrokerageCases(user.id, 50, tenantId);
  const requestedCaseId = String(params?.caseId ?? "").trim();
  const requestedTemplateId = String(params?.templateId ?? FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID).trim() || FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID;
  const template = findGuaranteeCompanyTemplate(requestedTemplateId);
  if (!template) notFound();
  const templateConfig = getGuaranteePdfTemplateConfig(template.id);
  const selectedCase =
    (requestedCaseId ? await getBrokerageCaseById({ userId: user.id, tenantId, caseId: requestedCaseId }) : null) ??
    cases.find((item) => item.id === "case_fixture_friends_guarantee_pdf") ??
    cases.find((item) => item.status === "reviewed") ??
    cases[0] ??
    null;
  const draft = selectedCase
    ? await getGuaranteeApplicationDraft({
        userId: user.id,
        tenantId,
        caseId: selectedCase.id,
        templateId: template.id,
      })
    : null;
  const draftValues = draft?.fieldValuesJson ?? {};
  const draftDefinitions = getGuaranteeDraftFieldDefinitions(template.id);
  const draftReadiness = buildGuaranteeDraftReadiness(draft, template.id);
  const draftMissingCount = draftReadiness.requiredMissingCount;
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
  const deletedOverlayFieldKeys = selectedCase
    ? getFriendsGuaranteeEffectiveDeletedOverlayFieldKeys({ templateId: template.id, confirmedDataJson: selectedCase.confirmedDataJson })
    : new Set<string>();
  const overlayFields = [...templateConfig.overlayFields, ...customFields].filter(
    (field) => !isFriendsOverlayFieldNeverPrinted(field) && !deletedOverlayFieldKeys.has(field.fieldKey),
  );
  const getSourceValue = (fieldKey: string) => {
    const value = selectedCase
      ? getCaseFieldValue(selectedCase.confirmedDataJson, fieldKey) || getDraftValue(draftValues, fieldKey)
      : getDraftValue(draftValues, fieldKey);
    if (value) return value;
    for (const fallbackKey of TEMPLATE_BINDING_VALUE_FALLBACKS[fieldKey] ?? []) {
      const fallbackValue = selectedCase
        ? getCaseFieldValue(selectedCase.confirmedDataJson, fallbackKey) || getDraftValue(draftValues, fallbackKey)
        : getDraftValue(draftValues, fallbackKey);
      if (fallbackValue) return fallbackValue;
    }
    return "";
  };
  const catalogDefinitionByKey = new Map(CASE_FIELD_DEFINITIONS.map((definition) => [definition.fieldKey, definition]));
  const bindingOptionsByKey = new Map<string, PreviewBindingOption>();
  const addBindingOption = (fieldKey: string, label: string) => {
    if (!fieldKey || fieldKey.startsWith("custom.") || bindingOptionsByKey.has(fieldKey)) return;
    const catalogDefinition = catalogDefinitionByKey.get(fieldKey);
    bindingOptionsByKey.set(fieldKey, {
      fieldKey,
      label: catalogDefinition?.label ?? label,
      value: getSourceValue(fieldKey),
      groupId: catalogDefinition?.groupId,
      groupLabel: catalogDefinition?.groupLabel,
      valueKind: catalogDefinition?.valueKind,
      storageScope: catalogDefinition?.storageScope,
    });
  };
  readinessGroups.forEach((group) => group.fields.forEach((field) => addBindingOption(field.fieldKey, field.label)));
  draftDefinitions.forEach((definition) => addBindingOption(definition.fieldKey, definition.label));
  CASE_FIELD_DEFINITIONS.forEach((definition) => addBindingOption(definition.fieldKey, definition.label));
  ADDITIONAL_TEMPLATE_BINDING_FIELDS.forEach(([fieldKey, label]) => addBindingOption(fieldKey, label));
  templateConfig.overlayFields.forEach((field) => addBindingOption(field.sourceFieldKey ?? field.fieldKey, field.label));
  const bindingOptions = [...bindingOptionsByKey.values()];
  const getCustomFieldRawValue = (field: FriendsOverlayField) => {
    if (!field.custom) return getSourceValue(field.sourceFieldKey ?? field.fieldKey);
    const customField = customFields.find((item) => item.fieldKey === field.fieldKey);
    if (customField?.sourceFieldKey) return getSourceValue(customField.sourceFieldKey);
    return customField?.value ?? "";
  };
  const filledCount =
    overlayFields.filter((field) => {
      if (!selectedCase) return false;
      if (field.custom) return Boolean(getCustomFieldRawValue(field));
      return Boolean(getCustomFieldRawValue(field));
    }).length +
    draftReadiness.readyCount;
  const totalEditableCount = overlayFields.length + draftDefinitions.length;
  const downloadHref = selectedCase
    ? `/api/guarantee-applications/${encodeURIComponent(template.id)}/download?caseId=${encodeURIComponent(selectedCase.id)}`
    : "#";
  const caseWorkbenchHref = selectedCase
    ? `/cases/${encodeURIComponent(selectedCase.id)}?guaranteeTemplate=${encodeURIComponent(template.id)}`
    : "#";
  const caseDraftHref = selectedCase ? `${caseWorkbenchHref}#guarantee-template-drafts` : "#";
  const layoutOverrides = getFriendsGuaranteeEffectiveLayoutOverrides({
    templateId: template.id,
    confirmedDataJson: selectedCase?.confirmedDataJson,
  });
  const previewFieldValues = Object.fromEntries(
    overlayFields.map((field) => {
      const value = getCustomFieldRawValue(field);
      return [field.fieldKey, formatPreviewFieldValue(field, value)];
    }),
  );
  const confirmedOverlayFieldKeys = getGuaranteeConfirmedOverlayFieldKeys({
    confirmedDataJson: selectedCase?.confirmedDataJson,
    templateId: template.id,
  });
  const completionSummary = getGuaranteeFieldCompletionSummary({
    template,
    fieldKeys: overlayFields.map((field) => field.sourceFieldKey ?? field.fieldKey),
  });
  const printFitByFieldKey = new Map(
    overlayFields.map((field) => {
      const value = previewFieldValues[field.fieldKey] ?? "";
      const box = layoutOverrides[field.fieldKey]?.box ?? field.box;
      return [field.fieldKey, getFriendsOverlayEstimatedTextFit({ field, value, box })];
    }),
  );
  const printBlockingIssues = overlayFields.filter((field) => {
    const status = printFitByFieldKey.get(field.fieldKey)?.status;
    return status === "overflows" || status === "segment_overflows";
  });
  const printAttentionIssues = overlayFields.filter((field) => printFitByFieldKey.get(field.fieldKey)?.status === "shrinks");
  const manualAdjustedCount = Object.keys(layoutOverrides).length;
  const addedFieldCount = customFields.length;
  const manualPlacementCount = overlayFields.filter((field) => isFriendsOverlayFieldManualOnly(field) && !layoutOverrides[field.fieldKey]).length;
  const candidateConfirmationCount = overlayFields.filter((field) => {
    if (getFriendsOverlayFieldPrintMode(field) !== "candidate") return false;
    if (layoutOverrides[field.fieldKey]) return false;
    if (confirmedOverlayFieldKeys.has(field.fieldKey)) return false;
    if (field.sourceFieldKey && confirmedOverlayFieldKeys.has(field.sourceFieldKey)) return false;
    return Boolean(previewFieldValues[field.fieldKey]);
  }).length;
  const templateNeedsCalibration = template.qualityStatus !== "verified";
  const downloadGate = selectedCase ? evaluateGuaranteeDownloadGate({ brokerageCase: selectedCase, draft, template }) : null;
  const canDownloadPreview = Boolean(downloadGate?.canDownload);
  const guidedPreviewHref = selectedCase
    ? `/guarantee-applications/${encodeURIComponent(template.id)}/preview?caseId=${encodeURIComponent(selectedCase.id)}`
    : `/guarantee-applications/${encodeURIComponent(template.id)}/preview`;

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
            <p className="mt-1 text-sm text-slate-600">安全項目は自動入力し、残りは申込書上で確認・修正してから印字します。</p>
            {templateNeedsCalibration ? (
              <p className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                版式精校中：このテンプレートは保存後のPDF確認を前提に扱います
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-black">
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">
                {GUARANTEE_FIELD_COMPLETION_LABELS.certified_auto} {completionSummary.certified_auto}
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">
                {GUARANTEE_FIELD_COMPLETION_LABELS.assisted_candidate} {completionSummary.assisted_candidate}
              </span>
              <span className="rounded-full bg-slate-200 px-2 py-1 text-slate-700">
                {GUARANTEE_FIELD_COMPLETION_LABELS.manual_electronic} {completionSummary.manual_electronic}
              </span>
            </div>
            <div className="mt-3 inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
              <Link
                href={guidedPreviewHref}
                className="rounded-md bg-slate-950 px-3 py-1.5 text-xs font-black text-white"
              >
                公式底版精校
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedCase ? (
              <Link href={caseWorkbenchHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
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
                {draftMissingCount > 0
                  ? "会社別草稿を補ってからダウンロード"
                  : requiredMissingCount > 0
                  ? "未入力を補ってからダウンロード"
                  : printBlockingIssues.length > 0
                    ? "印字リスクを直してからダウンロード"
                    : templateNeedsCalibration
                      ? "精校中テンプレートは直ダウンロード不可"
                      : candidateConfirmationCount > 0
                        ? "候補を保存してからダウンロード"
                        : manualPlacementCount > 0
                          ? "位置を保存してからダウンロード"
                          : "出力前チェックを完了してください"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="min-h-[calc(100vh-132px)] rounded-xl border border-slate-200 bg-white shadow-sm">
          {selectedCase ? (
            <FriendsGuaranteeCalibrationPreview
              key={`${selectedCase.id}:${template.id}:${JSON.stringify(layoutOverrides)}:${[...deletedOverlayFieldKeys].join(",")}`}
              fields={overlayFields}
              prematchReferenceFields={templateConfig.overlayFields.filter((field) => !isFriendsOverlayFieldNeverPrinted(field))}
              fieldValues={previewFieldValues}
              formId="guarantee-application-preview-form"
              imageAlt={`${template.companyDisplayName}申込書テンプレート`}
              imageHeight={templateConfig.imageHeight}
              imageSrc={templateConfig.imageSrc}
              imageWidth={templateConfig.imageWidth}
              templateId={template.id}
              bindingOptions={bindingOptions}
              initialDeletedFieldKeys={[...deletedOverlayFieldKeys]}
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
              <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${downloadGate?.canDownload ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                {downloadGate?.canDownload ? "ダウンロード可" : `要確認 ${downloadGate?.blockedReasons.length ?? requiredMissingCount}`}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link href={caseDraftHref} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-100">
                会社別草稿 {draftReadiness.readyCount}/{draftReadiness.fields.length}
              </Link>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                草稿保存 {formatDate(draft?.lastReviewedAt ?? draft?.updatedAt, "ja")}
              </div>
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
              <div className={requiredMissingCount > 0 || printBlockingIssues.length > 0 ? "rounded-lg bg-rose-50 p-3" : manualPlacementCount > 0 || candidateConfirmationCount > 0 || printAttentionIssues.length > 0 ? "rounded-lg bg-amber-50 p-3" : "rounded-lg bg-emerald-50 p-3"}>
                <p className={`text-[11px] font-bold ${requiredMissingCount > 0 || printBlockingIssues.length > 0 ? "text-rose-700" : manualPlacementCount > 0 || candidateConfirmationCount > 0 || printAttentionIssues.length > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                  {requiredMissingCount > 0 ? "未入力" : printBlockingIssues.length > 0 ? "印字不可" : manualPlacementCount > 0 || candidateConfirmationCount > 0 || printAttentionIssues.length > 0 ? "要確認" : "完了"}
                </p>
                <p className={`mt-1 text-2xl font-black tabular-nums ${requiredMissingCount > 0 || printBlockingIssues.length > 0 ? "text-rose-900" : manualPlacementCount > 0 || candidateConfirmationCount > 0 || printAttentionIssues.length > 0 ? "text-amber-900" : "text-emerald-900"}`}>
                  {requiredMissingCount > 0 ? requiredMissingCount : printBlockingIssues.length > 0 ? printBlockingIssues.length : manualPlacementCount + candidateConfirmationCount + printAttentionIssues.length}
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
                  {draftMissingCount > 0 ? (
                    <Link href={caseDraftHref} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-rose-700 px-3 py-2 text-xs font-black text-white hover:bg-rose-800">
                      <span className="material-symbols-outlined text-[14px]">edit_note</span>
                      会社別草稿をワークベンチで補う
                    </Link>
                  ) : null}
                  <div className="mt-3 grid gap-2">
                    {unresolvedRequiredFields.map((field) => (
                      <a
                        key={`missing-${field.fieldKey}`}
                        href={isDraftSpecificField(field.fieldKey) ? caseDraftHref : `#${previewFieldId(field.fieldKey)}`}
                        className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-50"
                      >
                        {field.label}
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}

              {printBlockingIssues.length > 0 || printAttentionIssues.length > 0 ? (
                <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-black text-amber-950">印字前に確認する項目</p>
                  <p className="mt-1 text-xs font-semibold text-amber-800">長すぎる文字や分格の桁数超過は、左の申込書上で短縮・分割・幅調整してください。</p>
                  <div className="mt-3 grid gap-2">
                    {[...printBlockingIssues, ...printAttentionIssues].map((field) => {
                      const fit = printFitByFieldKey.get(field.fieldKey);
                      return (
                        <a key={`fit-${field.fieldKey}`} href={`#${previewFieldId(field.fieldKey)}`} className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-50">
                          <span>{field.label}</span>
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px]">{fitStatusLabel(fit?.status ?? "fits")}</span>
                        </a>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-black text-slate-950">申込書上の入力欄</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">ここは確認用の索引です。修正は左の申込書上で直接行います。</p>
                <div className="mt-3 grid gap-2">
                  {overlayFields.map((field) => {
                    const rawValue = getCustomFieldRawValue(field);
                    const value = formatPreviewFieldValue(field, rawValue);
                    const required = requiredFieldKeys.has(field.fieldKey);
                    const manualPlacementRequired = isFriendsOverlayFieldManualOnly(field) && !layoutOverrides[field.fieldKey];
                    const fieldCompletionMode = getGuaranteeFieldCompletionMode(template, field.sourceFieldKey ?? field.fieldKey);
                    const candidateNeedsConfirmation =
                      getFriendsOverlayFieldPrintMode(field) === "candidate" &&
                      Boolean(value) &&
                      !layoutOverrides[field.fieldKey] &&
                      !confirmedOverlayFieldKeys.has(field.fieldKey) &&
                      !(field.sourceFieldKey && confirmedOverlayFieldKeys.has(field.sourceFieldKey));
                    const fitStatus = printFitByFieldKey.get(field.fieldKey)?.status ?? "fits";
                    const hasBlockingFitIssue = fitStatus === "overflows" || fitStatus === "segment_overflows";
                    const hasFitWarning = hasBlockingFitIssue || fitStatus === "shrinks";
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
                          {manualPlacementRequired && field.calibrationNote ? (
                            <span className="mt-0.5 block truncate font-semibold text-amber-700">{field.calibrationNote}</span>
                          ) : null}
                          {candidateNeedsConfirmation ? (
                            <span className="mt-0.5 block truncate font-semibold text-amber-700">保存するとPDFに印字されます</span>
                          ) : null}
                          {hasFitWarning ? (
                            <span className={`mt-0.5 block truncate font-semibold ${hasBlockingFitIssue ? "text-rose-700" : "text-amber-700"}`}>
                              {fitStatusLabel(fitStatus)}
                            </span>
                          ) : null}
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${hasBlockingFitIssue ? "bg-rose-100 text-rose-800" : manualPlacementRequired || candidateNeedsConfirmation || fitStatus === "shrinks" ? "bg-amber-100 text-amber-800" : fieldCompletionMode === "certified_auto" && value ? "bg-emerald-100 text-emerald-800" : required ? statusClass(status) : value ? "bg-slate-200 text-slate-700" : "bg-slate-200 text-slate-600"}`}>
                          {hasBlockingFitIssue ? fitStatusLabel(fitStatus) : manualPlacementRequired ? "要配置" : candidateNeedsConfirmation ? "要保存" : fitStatus === "shrinks" ? "縮小" : fieldCompletionMode === "certified_auto" && value ? "自動" : required ? statusLabel(status) : value ? "候補" : "任意"}
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
                  <div className={requiredMissingCount > 0 || printBlockingIssues.length > 0 ? "rounded-lg bg-rose-50 p-3" : manualPlacementCount > 0 || candidateConfirmationCount > 0 || printAttentionIssues.length > 0 ? "rounded-lg bg-amber-50 p-3" : "rounded-lg bg-emerald-50 p-3"}>
                    <p className={`text-[11px] font-bold ${requiredMissingCount > 0 || printBlockingIssues.length > 0 ? "text-rose-700" : manualPlacementCount > 0 || candidateConfirmationCount > 0 || printAttentionIssues.length > 0 ? "text-amber-700" : "text-emerald-700"}`}>PDF</p>
                    <p className={`mt-1 text-sm font-black ${requiredMissingCount > 0 || printBlockingIssues.length > 0 ? "text-rose-900" : manualPlacementCount > 0 || candidateConfirmationCount > 0 || printAttentionIssues.length > 0 ? "text-amber-900" : "text-emerald-900"}`}>
                      {requiredMissingCount > 0 ? "未完了" : printBlockingIssues.length > 0 ? "印字不可" : manualPlacementCount > 0 || candidateConfirmationCount > 0 || printAttentionIssues.length > 0 ? "要確認" : "出力可"}
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-black text-slate-950">{template.companyDisplayName}の確認項目</h3>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                  ここで直した内容も会社別草稿として保存されます。まとめて補う場合はワークベンチの会社別草稿を使います。
                </p>
                <Link href={caseDraftHref} className="mt-3 inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100">
                  <span className="material-symbols-outlined text-[14px]">edit_note</span>
                  ワークベンチの会社別草稿へ
                </Link>
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
                <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-black !text-white shadow-sm hover:bg-slate-800 [&_.material-symbols-outlined]:!text-white">
                  <span className="material-symbols-outlined text-[18px] !text-white">refresh</span>
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
