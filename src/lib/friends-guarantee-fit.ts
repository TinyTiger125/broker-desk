import type { FriendsOverlayBox, FriendsOverlayField } from "@/lib/friends-guarantee-pdf";

export type FriendsOverlayTextFitStatus =
  | "empty"
  | "fits"
  | "wrapped"
  | "shrinks"
  | "overflows"
  | "segment_overflows"
  | "date_parts";

export type FriendsOverlayTextFitResult = {
  status: FriendsOverlayTextFitStatus;
  estimatedWidth: number;
  printableWidth: number;
  lineCount?: number;
  resolvedSize?: number;
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

export const FRIENDS_OVERLAY_TEXT_LINE_HEIGHT = 1.15;

export function isFriendsAddressOverlayField(field: FriendsOverlayField) {
  if (field.segment || field.dateParts) return false;
  const identity = `${field.fieldKey} ${field.sourceFieldKey ?? ""} ${field.label}`;
  return /(address|住所|所在地)/i.test(identity) && !/(postalcode|postal_code|郵便番号)/i.test(identity);
}

export function getFriendsOverlayMaxLines(field: FriendsOverlayField, box: FriendsOverlayBox, size: number) {
  if (!isFriendsAddressOverlayField(field)) return 1;
  return Math.max(1, Math.floor((box.height - 2) / Math.max(1, size * FRIENDS_OVERLAY_TEXT_LINE_HEIGHT)));
}

function getEffectiveAddressBox(field: FriendsOverlayField, box?: FriendsOverlayBox) {
  if (box) return box;
  if (field.box) return field.box;
  return {
    x: field.x,
    y: field.y - 4,
    width: field.maxWidth + 12,
    height: Math.max(18, field.size * 2.4),
  };
}

function estimateWrappedLineCount(value: string, size: number, maxWidth: number) {
  let lineCount = 1;
  let lineWidth = 0;
  for (const char of value) {
    if (char === "\n") {
      lineCount += 1;
      lineWidth = 0;
      continue;
    }
    const charWidth = estimateTextUnits(char) * size;
    if (lineWidth > 0 && lineWidth + charWidth > maxWidth) {
      lineCount += 1;
      lineWidth = charWidth;
    } else {
      lineWidth += charWidth;
    }
  }
  return lineCount;
}

export function getFriendsOverlayEstimatedTextFit(input: {
  field: FriendsOverlayField;
  value: string;
  box?: FriendsOverlayBox;
}): FriendsOverlayTextFitResult {
  const value = input.value.trim();
  const box = isFriendsAddressOverlayField(input.field)
    ? getEffectiveAddressBox(input.field, input.box)
    : input.box ?? input.field.box;
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
  if (isFriendsAddressOverlayField(input.field) && box) {
    const lineCount = estimateWrappedLineCount(value, size, printableWidth);
    if (lineCount <= getFriendsOverlayMaxLines(input.field, box, size)) {
      return {
        status: lineCount > 1 ? "wrapped" : "fits",
        estimatedWidth,
        printableWidth,
        lineCount,
        resolvedSize: size,
      };
    }
    const minLineCount = estimateWrappedLineCount(value, minSize, printableWidth);
    if (minLineCount <= getFriendsOverlayMaxLines(input.field, box, minSize)) {
      return {
        status: "wrapped",
        estimatedWidth,
        printableWidth,
        lineCount: minLineCount,
        resolvedSize: minSize,
      };
    }
    return { status: "overflows", estimatedWidth, printableWidth, lineCount: minLineCount, resolvedSize: minSize };
  }

  if (estimatedWidth <= printableWidth) {
    return { status: "fits", estimatedWidth, printableWidth };
  }

  const minEstimatedWidth = estimatedWidth * (minSize / size);
  if (minEstimatedWidth <= printableWidth) {
    return { status: "shrinks", estimatedWidth, printableWidth };
  }

  return { status: "overflows", estimatedWidth, printableWidth };
}
