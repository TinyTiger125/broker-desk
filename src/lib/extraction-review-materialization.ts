import type { ExtractionReviewStatus } from "@/lib/data.memory";

export type PersistedExtractionReviewItem = {
  importJobId: string;
  fieldKey: string;
  sourceSheet: string;
  sourceCell?: string;
  sourceRange?: string;
  reviewStatus: ExtractionReviewStatus;
  editedValue?: string;
  finalValue?: string;
};

export type ExtractionReviewFieldIdentity = {
  fieldKey: string;
  sourceSheet: string;
  sourceCell?: string;
  sourceRange?: string;
};

export function getExtractionReviewFieldId(field: ExtractionReviewFieldIdentity) {
  return `${field.fieldKey}:${field.sourceCell ?? field.sourceRange ?? field.sourceSheet}`;
}

export function buildPersistedExtractionReviewState(
  fields: readonly ExtractionReviewFieldIdentity[],
  persistedItems: readonly PersistedExtractionReviewItem[],
  importJobId: string,
) {
  const statusByFieldId: Record<string, ExtractionReviewStatus> = {};
  const editedValueByFieldId: Record<string, string> = {};
  const latestByFieldId = new Map<string, PersistedExtractionReviewItem>();

  persistedItems
    .filter((item) => item.importJobId === importJobId)
    .forEach((item) => {
      latestByFieldId.set(getExtractionReviewFieldId(item), item);
    });

  fields.forEach((field) => {
    const fieldId = getExtractionReviewFieldId(field);
    const persisted = latestByFieldId.get(fieldId);
    if (!persisted) return;
    statusByFieldId[fieldId] = persisted.reviewStatus;
    if (persisted.reviewStatus === "edited") {
      editedValueByFieldId[fieldId] = persisted.editedValue ?? persisted.finalValue ?? "";
    }
  });

  return { statusByFieldId, editedValueByFieldId };
}

export type MaterializedExtractionReviewValue = {
  editedValue?: string;
  finalValue?: string;
  shouldConfirm: boolean;
};

export function materializeExtractionReviewValue(input: {
  reviewStatus: ExtractionReviewStatus;
  editedValue?: string;
  baseValue: string;
}): MaterializedExtractionReviewValue {
  if (input.reviewStatus === "accepted") {
    const finalValue = input.baseValue.trim();
    return {
      finalValue: finalValue || undefined,
      shouldConfirm: Boolean(finalValue),
    };
  }

  if (input.reviewStatus === "edited") {
    const editedValue = input.editedValue?.trim() ?? "";
    return {
      editedValue,
      finalValue: editedValue || undefined,
      shouldConfirm: Boolean(editedValue),
    };
  }

  return {
    shouldConfirm: false,
  };
}
