import type {
  CorrectionEvent,
  CorrectionEventChangeType,
  CorrectionEventScopeCandidate,
  CorrectionEventTrigger,
  ExtractionReviewItem,
} from "@/lib/data.memory";
import { canonicalizeCaseFieldKey, getCaseFieldAliases, getCaseFieldValue } from "@/lib/case-field-normalization";

export type CorrectionEventDraft = Omit<CorrectionEvent, "id" | "userId" | "createdAt">;

type BuildWorkbenchCorrectionEventsInput = {
  caseId: string;
  trigger: CorrectionEventTrigger;
  fieldKeys: string[];
  labelsByFieldKey: Record<string, string>;
  beforeData: Record<string, unknown>;
  afterData: Record<string, unknown>;
  reviewItems: ExtractionReviewItem[];
  templateId?: string;
};

type ExtractionReviewLike = Omit<ExtractionReviewItem, "id" | "userId" | "caseId" | "createdAt"> &
  Partial<Pick<ExtractionReviewItem, "id" | "userId" | "caseId" | "createdAt">>;

type OverlayBoxLike = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type OverlayLayoutOverridesLike = Record<string, { box?: OverlayBoxLike; size?: number }>;

type CustomOverlayFieldLike = {
  fieldKey: string;
  label?: string;
  value?: string;
  box?: OverlayBoxLike;
  segment?: { cells: number; mode: string; align?: string; gap?: number };
};

type BuildExtractionReviewCorrectionEventsInput = {
  caseId: string;
  reviewItems: ExtractionReviewLike[];
};

type BuildGuaranteeDraftCorrectionEventsInput = {
  caseId: string;
  templateId: string;
  fieldKeys: readonly string[];
  labelsByFieldKey: Record<string, string>;
  beforeData: Record<string, unknown>;
  afterData: Record<string, unknown>;
};

type BuildPdfPreviewCorrectionEventsInput = {
  caseId: string;
  templateId: string;
  fieldKeys: readonly string[];
  labelsByFieldKey: Record<string, string>;
  beforeData: Record<string, unknown>;
  afterData: Record<string, unknown>;
  layoutDirty: boolean;
  layoutSaveScope: "case" | "template";
  previousLayoutOverrides: OverlayLayoutOverridesLike;
  nextLayoutOverrides: OverlayLayoutOverridesLike;
  previousCustomOverlayFields: CustomOverlayFieldLike[];
  nextCustomOverlayFields: CustomOverlayFieldLike[];
};

function compact(value: string) {
  return value.replace(/\s+/g, "").trim();
}

function readCandidateValue(item?: ExtractionReviewItem) {
  if (!item) return "";
  return String(item.finalValue ?? item.editedValue ?? item.normalizedValue ?? item.extractedValue ?? "").trim();
}

function sourceLocation(item?: ExtractionReviewItem) {
  if (!item) return undefined;
  const location = item.sourceCell ?? item.sourceRange;
  return [item.sourceSheet, location].filter(Boolean).join(" / ") || undefined;
}

function sourceLocationFromReview(item?: ExtractionReviewLike) {
  if (!item) return undefined;
  const location = item.sourceCell ?? item.sourceRange;
  return [item.sourceSheet, location].filter(Boolean).join(" / ") || undefined;
}

function scopeCandidateFor(item?: ExtractionReviewItem, templateId?: string): CorrectionEventScopeCandidate {
  if (templateId) return "output_template";
  if (item?.templateVersion) return "source_template";
  return "field_dictionary";
}

function scopeCandidateForReview(item?: ExtractionReviewLike): CorrectionEventScopeCandidate {
  if (item?.templateVersion) return "source_template";
  return "field_dictionary";
}

function classifyChange(input: {
  previousValue: string;
  nextValue: string;
  candidateValue: string;
  reviewItem?: ExtractionReviewItem;
}): CorrectionEventChangeType | null {
  const previous = input.previousValue.trim();
  const next = input.nextValue.trim();
  const candidate = input.candidateValue.trim();

  if (previous === next) return null;
  if (!next && previous) return "one_off_case_override";
  if (next && !candidate && !previous) return "source_absent_user_completed";
  if (next && candidate && compact(next) !== compact(candidate)) {
    if (input.reviewItem?.method === "rule" && previous) return "normalization_error";
    return "ai_extraction_error";
  }
  if (next && previous && next !== previous) return "user_or_team_preference";
  return null;
}

function latestReviewForField(reviewItems: ExtractionReviewItem[], fieldKey: string) {
  const aliases = new Set(getCaseFieldAliases(fieldKey));
  return reviewItems
    .filter((item) => aliases.has(item.fieldKey))
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .at(-1);
}

function valueFromReview(item: ExtractionReviewLike) {
  return String(item.finalValue ?? item.editedValue ?? item.normalizedValue ?? item.extractedValue ?? "").trim();
}

function candidateFromReview(item: ExtractionReviewLike) {
  return String(item.normalizedValue || item.extractedValue || "").trim();
}

function buildReviewEvidence(item: ExtractionReviewLike) {
  return {
    reviewItemId: item.id,
    reviewStatus: item.reviewStatus,
    extractedValue: item.extractedValue,
    normalizedValue: item.normalizedValue,
    finalValue: item.finalValue,
    sourceFileHash: item.sourceFileHash,
    templateVersion: item.templateVersion,
  };
}

function serializeBox(box: OverlayBoxLike) {
  return `${Number(box.x).toFixed(2)},${Number(box.y).toFixed(2)},${Number(box.width).toFixed(2)},${Number(box.height).toFixed(2)}`;
}

function boxesEqual(a?: OverlayBoxLike, b?: OverlayBoxLike) {
  if (!a || !b) return false;
  return serializeBox(a) === serializeBox(b);
}

function customFieldKey(field: CustomOverlayFieldLike) {
  return field.fieldKey;
}

function customFieldSignature(field: CustomOverlayFieldLike) {
  return JSON.stringify({
    label: field.label ?? "",
    value: String(field.value ?? ""),
    box: field.box ? serializeBox(field.box) : "",
    segment: field.segment ?? null,
  });
}

export function buildWorkbenchCorrectionEvents(input: BuildWorkbenchCorrectionEventsInput): CorrectionEventDraft[] {
  const drafts: CorrectionEventDraft[] = [];
  const seen = new Set<string>();

  for (const fieldKey of input.fieldKeys) {
    if (seen.has(fieldKey)) continue;
    seen.add(fieldKey);

    const previousValue = getCaseFieldValue(input.beforeData, fieldKey);
    const nextValue = getCaseFieldValue(input.afterData, fieldKey);
    const reviewItem = latestReviewForField(input.reviewItems, fieldKey);
    const candidateValue = readCandidateValue(reviewItem) || previousValue;
    const changeType = classifyChange({ previousValue, nextValue, candidateValue, reviewItem });
    if (!changeType) continue;

    drafts.push({
      caseId: input.caseId,
      trigger: input.trigger,
      fieldKey,
      fieldLabel: input.labelsByFieldKey[fieldKey] ?? fieldKey,
      aiValue: candidateValue || undefined,
      confirmedValue: nextValue || undefined,
      changeType,
      sourceImportJobId: reviewItem?.importJobId,
      sourceLocation: sourceLocation(reviewItem),
      extractionMethod: reviewItem?.method,
      confidenceBefore: reviewItem?.confidence,
      templateId: input.templateId,
      scopeCandidate: scopeCandidateFor(reviewItem, input.templateId),
      sourceEvidenceJson: reviewItem
        ? {
            reviewItemId: reviewItem.id,
            reviewStatus: reviewItem.reviewStatus,
            extractedValue: reviewItem.extractedValue,
            normalizedValue: reviewItem.normalizedValue,
            finalValue: reviewItem.finalValue,
            sourceFileHash: reviewItem.sourceFileHash,
            templateVersion: reviewItem.templateVersion,
          }
        : undefined,
    });
  }

  return drafts;
}

export function buildExtractionReviewCorrectionEvents(input: BuildExtractionReviewCorrectionEventsInput): CorrectionEventDraft[] {
  return input.reviewItems.flatMap((item) => {
    const candidateValue = candidateFromReview(item);
    const confirmedValue = valueFromReview(item);

    if (item.reviewStatus === "accepted" || item.reviewStatus === "suggested") return [];

    let changeType: CorrectionEventChangeType | null = null;
    if (item.reviewStatus === "edited") {
      if (candidateValue && confirmedValue && compact(candidateValue) !== compact(confirmedValue)) {
        changeType = item.method === "rule" ? "normalization_error" : "ai_extraction_error";
      } else if (!candidateValue && confirmedValue) {
        changeType = "missing_detected_by_user";
      }
    } else if (item.reviewStatus === "unknown" || item.reviewStatus === "rejected") {
      if (candidateValue) changeType = "one_off_case_override";
    }

    if (!changeType) return [];

    return [{
      caseId: input.caseId,
      trigger: "extraction_review_save",
      fieldKey: canonicalizeCaseFieldKey(item.fieldKey),
      fieldLabel: item.label,
      aiValue: candidateValue || undefined,
      confirmedValue: confirmedValue || undefined,
      changeType,
      sourceImportJobId: item.importJobId,
      sourceLocation: sourceLocationFromReview(item),
      extractionMethod: item.method,
      confidenceBefore: item.confidence,
      scopeCandidate: scopeCandidateForReview(item),
      sourceEvidenceJson: buildReviewEvidence(item),
    }];
  });
}

export function buildGuaranteeDraftCorrectionEvents(input: BuildGuaranteeDraftCorrectionEventsInput): CorrectionEventDraft[] {
  const drafts: CorrectionEventDraft[] = [];
  const seen = new Set<string>();

  input.fieldKeys.forEach((fieldKey) => {
    if (seen.has(fieldKey)) return;
    seen.add(fieldKey);

    const previousValue = getCaseFieldValue(input.beforeData, fieldKey);
    const nextValue = getCaseFieldValue(input.afterData, fieldKey);
    if (previousValue === nextValue) return;

    const changeType: CorrectionEventChangeType =
      nextValue && !previousValue
        ? "source_absent_user_completed"
        : nextValue && previousValue
          ? "user_or_team_preference"
          : "one_off_case_override";

    drafts.push({
      caseId: input.caseId,
      trigger: "guarantee_draft_save",
      fieldKey,
      fieldLabel: input.labelsByFieldKey[fieldKey] ?? fieldKey,
      aiValue: previousValue || undefined,
      confirmedValue: nextValue || undefined,
      changeType,
      templateId: input.templateId,
      scopeCandidate: changeType === "one_off_case_override" ? "case_only" : "output_template",
      sourceEvidenceJson: {
        source: "company_specific_draft",
        previousValue,
        nextValue,
      },
    });
  });

  return drafts;
}

export function buildPdfPreviewCorrectionEvents(input: BuildPdfPreviewCorrectionEventsInput): CorrectionEventDraft[] {
  const drafts: CorrectionEventDraft[] = [];
  const seen = new Set<string>();

  input.fieldKeys.forEach((fieldKey) => {
    if (seen.has(fieldKey)) return;
    seen.add(fieldKey);
    const previousValue = getCaseFieldValue(input.beforeData, fieldKey);
    const nextValue = getCaseFieldValue(input.afterData, fieldKey);
    if (previousValue === nextValue) return;

    drafts.push({
      caseId: input.caseId,
      trigger: "pdf_preview_save",
      fieldKey,
      fieldLabel: input.labelsByFieldKey[fieldKey] ?? fieldKey,
      aiValue: previousValue || undefined,
      confirmedValue: nextValue || undefined,
      changeType: nextValue ? "template_output_format_error" : "one_off_case_override",
      templateId: input.templateId,
      scopeCandidate: "output_template",
      sourceEvidenceJson: {
        previousValue,
        nextValue,
        source: "editable_pdf_preview",
      },
    });
  });

  if (input.layoutDirty) {
    Object.entries(input.nextLayoutOverrides).forEach(([fieldKey, override]) => {
      const previous = input.previousLayoutOverrides[fieldKey]?.box;
      if (override.box && (!previous || !boxesEqual(previous, override.box))) {
        drafts.push({
          caseId: input.caseId,
          trigger: "pdf_preview_save",
          fieldKey: `layout.${fieldKey}`,
          fieldLabel: input.labelsByFieldKey[fieldKey] ? `${input.labelsByFieldKey[fieldKey]} 位置` : `${fieldKey} 位置`,
          aiValue: previous ? serializeBox(previous) : undefined,
          confirmedValue: serializeBox(override.box),
          changeType: "template_output_position_error",
          templateId: input.templateId,
          scopeCandidate: input.layoutSaveScope === "template" ? "output_template" : "case_only",
          sourceEvidenceJson: {
            fieldKey,
            layoutSaveScope: input.layoutSaveScope,
            previousBox: previous,
            nextBox: override.box,
          },
        });
      }

      const previousSize = input.previousLayoutOverrides[fieldKey]?.size;
      if (override.size !== undefined && previousSize !== override.size) {
        drafts.push({
          caseId: input.caseId,
          trigger: "pdf_preview_save",
          fieldKey: `layout.${fieldKey}.size`,
          fieldLabel: input.labelsByFieldKey[fieldKey] ? `${input.labelsByFieldKey[fieldKey]} 字号` : `${fieldKey} 字号`,
          aiValue: previousSize === undefined ? undefined : String(previousSize),
          confirmedValue: String(override.size),
          changeType: "template_output_format_error",
          templateId: input.templateId,
          scopeCandidate: input.layoutSaveScope === "template" ? "output_template" : "case_only",
          sourceEvidenceJson: {
            fieldKey,
            layoutSaveScope: input.layoutSaveScope,
            previousSize,
            nextSize: override.size,
          },
        });
      }
    });
  }

  const previousCustomFieldsByKey = new Map(input.previousCustomOverlayFields.map((field) => [customFieldKey(field), field]));
  input.nextCustomOverlayFields.forEach((field) => {
    const previous = previousCustomFieldsByKey.get(customFieldKey(field));
    if (previous && customFieldSignature(previous) === customFieldSignature(field)) return;
    drafts.push({
      caseId: input.caseId,
      trigger: "pdf_preview_save",
      fieldKey: `custom_overlay.${field.fieldKey}`,
      fieldLabel: field.label ? `${field.label} 追加欄` : `${field.fieldKey} 追加欄`,
      aiValue: previous ? customFieldSignature(previous) : undefined,
      confirmedValue: customFieldSignature(field),
      changeType: field.box ? "template_output_position_error" : "template_output_format_error",
      templateId: input.templateId,
      scopeCandidate: input.layoutSaveScope === "template" ? "output_template" : "case_only",
      sourceEvidenceJson: {
        layoutSaveScope: input.layoutSaveScope,
        previousCustomField: previous,
        nextCustomField: field,
      },
    });
  });

  return drafts;
}
