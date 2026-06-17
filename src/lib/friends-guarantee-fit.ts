import type { FriendsOverlayBox, FriendsOverlayField } from "@/lib/friends-guarantee-pdf";

export type FriendsOverlayTextFitStatus =
  | "empty"
  | "fits"
  | "shrinks"
  | "overflows"
  | "segment_overflows"
  | "date_parts";

export type FriendsOverlayTextFitResult = {
  status: FriendsOverlayTextFitStatus;
  estimatedWidth: number;
  printableWidth: number;
};

function normalizeSegmentValue(value: string, segment: NonNullable<FriendsOverlayField["segment"]>) {
  const normalized = value.replace(/[^\d]/g, "");
  if (segment.mode === "amount") return normalized.replace(/^0+(?=\d)/, "");
  return normalized;
}

function estimateTextUnits(value: string) {
  return [...value].reduce((total, char) => {
    if (/\s/.test(char)) return total + 0.35;
    if (/[0-9]/.test(char)) return total + 0.56;
    if (/[A-Za-z]/.test(char)) return total + 0.58;
    if (/[-()/.]/.test(char)) return total + 0.35;
    return total + 0.96;
  }, 0);
}

function getPrintableWidth(field: FriendsOverlayField, box: FriendsOverlayBox) {
  if (field.segment) return Math.max(1, box.width);
  return Math.max(1, box.width - 6);
}

export function getFriendsOverlayEstimatedTextFit(input: {
  field: FriendsOverlayField;
  value: string;
  box?: FriendsOverlayBox;
}): FriendsOverlayTextFitResult {
  const value = input.value.trim();
  const box = input.box ?? input.field.box;
  const printableWidth = box ? getPrintableWidth(input.field, box) : Math.max(1, input.field.maxWidth);
  if (!value) return { status: "empty", estimatedWidth: 0, printableWidth };

  if (input.field.dateParts) {
    return { status: "date_parts", estimatedWidth: 0, printableWidth };
  }

  if (input.field.segment) {
    const cells = Math.max(1, Math.floor(input.field.segment.cells));
    const normalized = normalizeSegmentValue(value, input.field.segment);
    return {
      status: normalized.length > cells ? "segment_overflows" : "fits",
      estimatedWidth: normalized.length,
      printableWidth: cells,
    };
  }

  const size = input.field.size;
  const minSize = input.field.minSize ?? Math.max(5, size * 0.8);
  const estimatedWidth = estimateTextUnits(value) * size;
  if (estimatedWidth <= printableWidth) {
    return { status: "fits", estimatedWidth, printableWidth };
  }

  const minEstimatedWidth = estimatedWidth * (minSize / size);
  if (minEstimatedWidth <= printableWidth) {
    return { status: "shrinks", estimatedWidth, printableWidth };
  }

  return { status: "overflows", estimatedWidth, printableWidth };
}
