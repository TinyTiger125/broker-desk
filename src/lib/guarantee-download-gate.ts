import { getCaseFieldValue } from "@/lib/case-field-normalization";
import type { BrokerageCase, GuaranteeApplicationDraft } from "@/lib/data.memory";
import { getFriendsOverlayEstimatedTextFit, type FriendsOverlayTextFitStatus } from "@/lib/friends-guarantee-fit";
import {
  getFriendsGuaranteeEffectiveOverlayFields,
  getFriendsGuaranteeEffectiveLayoutOverrides,
  getFriendsOverlayFieldPrintMode,
  getGuaranteeConfirmedOverlayFieldKeys,
  hasConfirmedGuaranteeFieldValue,
  formatFriendsOverlayValue,
  type FriendsOverlayField,
} from "@/lib/friends-guarantee-pdf";
import {
  buildGuaranteeApplicationReadiness,
  type GuaranteeCompanyTemplate,
  type GuaranteeReadinessField,
} from "@/lib/guarantee-application";

export type GuaranteeDownloadBlockedReasonCode =
  | "required_fields_missing"
  | "draft_required_missing"
  | "template_not_verified"
  | "candidate_fields_unconfirmed"
  | "manual_fields_unplaced"
  | "print_fit_blocked";

export type GuaranteeDownloadFieldIssue = {
  fieldKey: string;
  label: string;
  value?: string;
  status?: string;
  actionUrl: string;
  destination: "workbench" | "draft" | "preview";
  fitStatus?: FriendsOverlayTextFitStatus;
};

export type GuaranteeDownloadBlockedReason = {
  code: GuaranteeDownloadBlockedReasonCode;
  label: string;
  message: string;
  count: number;
  actionUrl: string;
  fields: GuaranteeDownloadFieldIssue[];
};

export type GuaranteeDownloadGate = {
  canDownload: boolean;
  blockedReasons: GuaranteeDownloadBlockedReason[];
  missingFields: GuaranteeDownloadFieldIssue[];
  previewUrl: string;
  workbenchUrl: string;
  draftUrl: string;
};

function isDraftSpecificField(fieldKey: string) {
  return fieldKey.startsWith("company_option.");
}

function formatOverlayValue(field: FriendsOverlayField, value: string) {
  return formatFriendsOverlayValue(field, value);
}

function readDraftValue(draft: GuaranteeApplicationDraft | null | undefined, fieldKey: string) {
  const value = draft?.fieldValuesJson?.[fieldKey];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function readOverlaySourceValue(input: {
  brokerageCase: BrokerageCase;
  draft?: GuaranteeApplicationDraft | null;
  field: FriendsOverlayField;
}) {
  const { brokerageCase, draft, field } = input;
  const sourceFieldKey = field.sourceFieldKey ?? field.fieldKey;
  if (field.custom && !field.sourceFieldKey) {
    return String("value" in field ? field.value ?? "" : "").trim();
  }
  return isDraftSpecificField(sourceFieldKey)
    ? readDraftValue(draft, sourceFieldKey) || getCaseFieldValue(brokerageCase.confirmedDataJson, sourceFieldKey)
    : getCaseFieldValue(brokerageCase.confirmedDataJson, sourceFieldKey);
}

function issueFromReadinessField(input: {
  field: GuaranteeReadinessField;
  actionUrl: string;
  destination: GuaranteeDownloadFieldIssue["destination"];
}): GuaranteeDownloadFieldIssue {
  return {
    fieldKey: input.field.fieldKey,
    label: input.field.label,
    value: input.field.value,
    status: input.field.status,
    actionUrl: input.actionUrl,
    destination: input.destination,
  };
}

function makeReason(input: {
  code: GuaranteeDownloadBlockedReasonCode;
  label: string;
  message: string;
  actionUrl: string;
  fields: GuaranteeDownloadFieldIssue[];
}): GuaranteeDownloadBlockedReason | null {
  if (input.fields.length === 0) return null;
  return {
    code: input.code,
    label: input.label,
    message: input.message,
    count: input.fields.length,
    actionUrl: input.actionUrl,
    fields: input.fields,
  };
}

export function buildGuaranteeDownloadUrls(input: { caseId: string; templateId: string }) {
  const encodedCaseId = encodeURIComponent(input.caseId);
  const encodedTemplateId = encodeURIComponent(input.templateId);
  const workbenchUrl = `/cases/${encodedCaseId}?guaranteeTemplate=${encodedTemplateId}#case-main-editor`;
  const draftUrl = `/guarantee-applications/${encodedTemplateId}/preview?caseId=${encodedCaseId}#company-draft-fields`;
  const previewUrl = `/guarantee-applications/${encodedTemplateId}/preview?caseId=${encodedCaseId}`;
  return { workbenchUrl, draftUrl, previewUrl };
}

export function evaluateGuaranteeDownloadGate(input: {
  brokerageCase: BrokerageCase;
  draft?: GuaranteeApplicationDraft | null;
  template: GuaranteeCompanyTemplate;
}): GuaranteeDownloadGate {
  const { brokerageCase, draft, template } = input;
  const { workbenchUrl, draftUrl, previewUrl } = buildGuaranteeDownloadUrls({
    caseId: brokerageCase.id,
    templateId: template.id,
  });
  const readinessGroups = buildGuaranteeApplicationReadiness({ brokerageCase, template, draft });
  const unresolvedFields = readinessGroups.find((group) => group.id === "unresolved")?.fields ?? [];
  const requiredMissingFields = unresolvedFields.filter((field) => field.required);
  const draftRequiredFields = requiredMissingFields
    .filter((field) => isDraftSpecificField(field.fieldKey))
    .map((field) => issueFromReadinessField({ field, actionUrl: draftUrl, destination: "draft" }));
  const caseRequiredFields = requiredMissingFields
    .filter((field) => !isDraftSpecificField(field.fieldKey))
    .map((field) => issueFromReadinessField({ field, actionUrl: workbenchUrl, destination: "workbench" }));

  const layoutOverrides = getFriendsGuaranteeEffectiveLayoutOverrides({
    templateId: template.id,
    confirmedDataJson: brokerageCase.confirmedDataJson,
  });
  const overlayFields = getFriendsGuaranteeEffectiveOverlayFields({
    templateId: template.id,
    confirmedDataJson: brokerageCase.confirmedDataJson,
  });
  const requiredFieldKeys = new Set(template.requiredFieldKeys);
  const layoutOverrideKeys = new Set(Object.keys(layoutOverrides));
  const confirmedOverlayFieldKeys = getGuaranteeConfirmedOverlayFieldKeys({
    confirmedDataJson: brokerageCase.confirmedDataJson,
    templateId: template.id,
  });

  const valueByFieldKey = new Map<string, string>();
  overlayFields.forEach((field) => {
    const rawValue = readOverlaySourceValue({ brokerageCase, draft, field });
    valueByFieldKey.set(field.fieldKey, formatOverlayValue(field, rawValue));
  });

  const candidateFieldsUnconfirmed: GuaranteeDownloadFieldIssue[] = [];
  const manualFieldsUnplaced: GuaranteeDownloadFieldIssue[] = [];
  const printFitBlocked: GuaranteeDownloadFieldIssue[] = [];

  overlayFields.forEach((field) => {
    const value = valueByFieldKey.get(field.fieldKey) ?? "";
    if (!value) return;
    const printMode = getFriendsOverlayFieldPrintMode(field);
    const sourceFieldKey = field.sourceFieldKey ?? field.fieldKey;
    const hasLayoutOverride = layoutOverrideKeys.has(field.fieldKey);
    const hasConfirmedOverlay =
      confirmedOverlayFieldKeys.has(field.fieldKey) ||
      (field.sourceFieldKey ? confirmedOverlayFieldKeys.has(field.sourceFieldKey) : false);
    const hasConfirmedCaseValue = hasConfirmedGuaranteeFieldValue(
      brokerageCase.confirmedDataJson,
      field,
    );

    if (printMode === "candidate" && !hasConfirmedCaseValue && !hasConfirmedOverlay) {
      candidateFieldsUnconfirmed.push({
        fieldKey: sourceFieldKey,
        label: field.label,
        value,
        actionUrl: previewUrl,
        destination: "preview",
      });
      return;
    }

    if (printMode === "manual" && requiredFieldKeys.has(sourceFieldKey) && !hasLayoutOverride) {
      manualFieldsUnplaced.push({
        fieldKey: sourceFieldKey,
        label: field.label,
        value,
        actionUrl: previewUrl,
        destination: "preview",
      });
      return;
    }

    const fit = getFriendsOverlayEstimatedTextFit({
      field,
      value,
      box: layoutOverrides[field.fieldKey]?.box ?? field.box,
    });
    if (fit.status === "overflows" || fit.status === "segment_overflows") {
      printFitBlocked.push({
        fieldKey: sourceFieldKey,
        label: field.label,
        value,
        fitStatus: fit.status,
        actionUrl: previewUrl,
        destination: "preview",
      });
    }
  });

  const templateNotVerified: GuaranteeDownloadFieldIssue[] =
    template.allowDirectDownload && template.qualityStatus === "verified"
      ? []
      : [{
          fieldKey: template.id,
          label: template.companyDisplayName,
          status: template.qualityStatus,
          actionUrl: previewUrl,
          destination: "preview",
        }];

  const blockedReasons = [
    makeReason({
      code: "required_fields_missing",
      label: "共通必須項目が未入力",
      message: "案件ワークベンチで共通の必須項目を補ってください。",
      actionUrl: workbenchUrl,
      fields: caseRequiredFields,
    }),
    makeReason({
      code: "draft_required_missing",
      label: "会社別草稿が未入力",
      message: "保証会社ごとの確認項目を補ってください。",
      actionUrl: draftUrl,
      fields: draftRequiredFields,
    }),
    makeReason({
      code: "template_not_verified",
      label: "テンプレートが出荷基準外",
      message: "この申込書はまだ直接ダウンロード対象ではありません。プレビューで確認してください。",
      actionUrl: previewUrl,
      fields: templateNotVerified,
    }),
    makeReason({
      code: "candidate_fields_unconfirmed",
      label: "PDF印字候補が未確認",
      message: "候補入力は申込書プレビューで保存してからPDFに印字します。",
      actionUrl: previewUrl,
      fields: candidateFieldsUnconfirmed,
    }),
    makeReason({
      code: "manual_fields_unplaced",
      label: "電子手入力欄の位置未保存",
      message: "電子手入力欄は申込書上で位置を確認して保存してください。",
      actionUrl: previewUrl,
      fields: manualFieldsUnplaced,
    }),
    makeReason({
      code: "print_fit_blocked",
      label: "印字枠に収まらない項目",
      message: "長い文字列や分割マスの桁数超過をプレビューで調整してください。",
      actionUrl: previewUrl,
      fields: printFitBlocked,
    }),
  ].filter((reason): reason is GuaranteeDownloadBlockedReason => Boolean(reason));

  return {
    canDownload: blockedReasons.length === 0,
    blockedReasons,
    missingFields: [...caseRequiredFields, ...draftRequiredFields],
    previewUrl,
    workbenchUrl,
    draftUrl,
  };
}
