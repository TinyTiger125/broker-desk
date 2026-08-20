import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { resolveGuaranteeFieldValue } from "./guarantee-slice1-policy.mjs";
import { inspectGuaranteeBlankPdf } from "./guarantee-slice1-pdf.mjs";

const BUNDLED_JAPANESE_FONT = join(process.cwd(), "public/fonts/NotoSansJP[wght].ttf");

// All renderer placement is expressed in the same PDF points / bottom-left
// coordinate system persisted by the mask editor. Keeping this calculation in
// one function makes the editor and final renderer test the same geometry.
export function getGuaranteeFieldPlacement(field) {
  const x = Number(field.x);
  const y = Number(field.y);
  const width = Number(field.width);
  const height = Number(field.height);
  if (![x, y, width, height].every(Number.isFinite)) return undefined;
  return {
    x,
    y,
    width,
    height,
    textBaselineY: y + Math.max(1, height - 10),
    checkboxStart: { x, y: y + height * 0.45 },
    checkboxMid: { x: x + width * 0.35, y },
    checkboxEnd: { x: x + width, y: y + height },
  };
}

export async function renderGuaranteePdf({ source, mask, confirmedData, supplement, resolveCaseValue, resolveStorageScope }) {
  if (!mask) throw new Error("mask_version_not_found");
  if (!existsSync(BUNDLED_JAPANESE_FONT)) throw new Error("guarantee_pdf_font_unavailable");
  const pdf = await PDFDocument.load(source);
  const { page } = inspectGuaranteeBlankPdf(pdf, source.length);
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(readFileSync(BUNDLED_JAPANESE_FONT), { subset: false });
  const fields = Array.isArray(mask.layoutSnapshot?.fields) ? mask.layoutSnapshot.fields : [];
  for (const field of fields) {
    const sourceFieldKey = String(field.sourceFieldKey ?? "");
    const value = resolveGuaranteeFieldValue({
      fieldType: String(field.type ?? "text"),
      sourceFieldKey,
      fieldId: String(field.fieldId ?? ""),
      storageScope: resolveStorageScope(sourceFieldKey),
      confirmedValue: resolveCaseValue(confirmedData, sourceFieldKey),
      confirmedData,
      supplement,
    });
    const placement = getGuaranteeFieldPlacement(field);
    if (!value || !placement) continue;
    if (field.type === "checkbox") {
      page.drawLine({ start: placement.checkboxStart, end: placement.checkboxMid, thickness: 1.2, color: rgb(0, 0, 0) });
      page.drawLine({ start: placement.checkboxMid, end: placement.checkboxEnd, thickness: 1.2, color: rgb(0, 0, 0) });
    } else {
      page.drawText(String(value).slice(0, 120), { x: placement.x, y: placement.textBaselineY, size: Math.min(12, Math.max(6, placement.height * 0.55)), font, color: rgb(0, 0, 0) });
    }
  }
  return Buffer.from(await pdf.save());
}
