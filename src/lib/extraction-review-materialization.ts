import type { ExtractionReviewStatus } from "@/lib/data.memory";

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
