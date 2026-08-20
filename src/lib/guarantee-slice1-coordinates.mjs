export const GUARANTEE_COORDINATE_SYSTEM = "pdf_points_bottom_left_v1";

export function serializeMaskLayout(fields) {
  return JSON.stringify({
    coordinateSystem: GUARANTEE_COORDINATE_SYSTEM,
    fields: fields.map((field) => ({
      fieldId: String(field.fieldId ?? ""),
      type: String(field.type ?? "text"),
      sourceFieldKey: String(field.sourceFieldKey ?? ""),
      label: String(field.label ?? ""),
      pageNumber: Number(field.pageNumber ?? 1),
      x: Number(field.x),
      y: Number(field.y),
      width: Number(field.width),
      height: Number(field.height),
      coordinateSystem: GUARANTEE_COORDINATE_SYSTEM,
    })),
  });
}

export function pdfPointsToCanvasRect(field, pageWidth, pageHeight, canvasWidth, canvasHeight) {
  const scaleX = canvasWidth / pageWidth;
  const scaleY = canvasHeight / pageHeight;
  return {
    left: field.x * scaleX,
    top: (pageHeight - field.y - field.height) * scaleY,
    width: field.width * scaleX,
    height: field.height * scaleY,
  };
}

export function canvasDeltaToPdfDelta(deltaX, deltaY, canvasWidth, canvasHeight, pageWidth, pageHeight) {
  return {
    x: deltaX * pageWidth / canvasWidth,
    y: deltaY * pageHeight / canvasHeight,
  };
}

export function movePdfField(field, deltaX, deltaY, pageWidth, pageHeight) {
  return {
    ...field,
    x: Math.max(0, Math.min(pageWidth - field.width, field.x + deltaX)),
    y: Math.max(0, Math.min(pageHeight - field.height, field.y + deltaY)),
  };
}

/** Resize from the visual bottom-right handle while keeping the PDF top-left anchor fixed. */
export function resizePdfFieldFromBottomRight(field, deltaX, deltaY, pageWidth, pageHeight) {
  const width = Math.max(8, Math.min(pageWidth - field.x, field.width + deltaX));
  const height = Math.max(8, Math.min(pageHeight - field.y, field.height + deltaY));
  return {
    ...field,
    width,
    height,
    y: Math.max(0, Math.min(pageHeight - height, field.y - (height - field.height))),
  };
}
