export const GUARANTEE_BLANK_FORM_MAX_BYTES = 20 * 1024 * 1024;
export const GUARANTEE_BLANK_FORM_MAX_PAGE_POINTS = 14_400;
export const GUARANTEE_BLANK_FORM_MAX_PAGE_AREA = 20_000_000;

function sameNumber(left, right) {
  return Math.abs(Number(left) - Number(right)) < 0.01;
}

/**
 * The first slice deliberately accepts only a PDF whose visible page is the
 * same rectangle that pdf-lib will use when rendering the mask. Any rotation,
 * offset origin, or CropBox/MediaBox divergence is rejected instead of being
 * silently mapped to a possibly different canvas.
 */
export function inspectGuaranteeBlankPdf(pdf, fileSizeBytes) {
  if (Number(fileSizeBytes) > GUARANTEE_BLANK_FORM_MAX_BYTES) {
    throw new Error("blank_form_file_too_large");
  }
  if (pdf?.isEncrypted) throw new Error("blank_form_encrypted_unsupported");
  if (!pdf || typeof pdf.getPageCount !== "function" || pdf.getPageCount() !== 1) {
    throw new Error("slice1_single_page_pdf_required");
  }
  const page = pdf.getPage(0);
  const rotation = Number(page.getRotation?.().angle ?? 0);
  if (rotation !== 0) throw new Error("blank_form_rotation_unsupported");
  const media = page.getMediaBox();
  const crop = page.getCropBox();
  if (!sameNumber(media.x, 0) || !sameNumber(media.y, 0)) {
    throw new Error("blank_form_page_origin_unsupported");
  }
  if (!sameNumber(media.x, crop.x) || !sameNumber(media.y, crop.y)
    || !sameNumber(media.width, crop.width) || !sameNumber(media.height, crop.height)) {
    throw new Error("blank_form_cropbox_unsupported");
  }
  const width = Number(media.width);
  const height = Number(media.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
    || width > GUARANTEE_BLANK_FORM_MAX_PAGE_POINTS
    || height > GUARANTEE_BLANK_FORM_MAX_PAGE_POINTS
    || width * height > GUARANTEE_BLANK_FORM_MAX_PAGE_AREA) {
    throw new Error("blank_form_dimensions_unsupported");
  }
  return { page, width, height, rotation, mediaBox: media, cropBox: crop };
}

export async function withGuaranteePdfTimeout(promise, timeoutMs = 10_000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("blank_form_processing_timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
