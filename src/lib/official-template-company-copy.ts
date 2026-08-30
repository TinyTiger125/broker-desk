import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { getCaseFieldDefinition } from "@/lib/case-field-catalog";
import {
  applyFriendsGuaranteeLayoutOverrides,
  getFriendsOverlayFieldBox,
  getGuaranteePdfTemplateConfig,
  type FriendsGuaranteeTemplateLayoutSnapshot,
} from "@/lib/friends-guarantee-pdf";
import { GUARANTEE_COORDINATE_SYSTEM } from "@/lib/guarantee-slice1-coordinates.mjs";

export type CompanyMaskSeedField = {
  fieldId: string;
  type: "text" | "date" | "checkbox";
  sourceFieldKey: string;
  label: string;
  pageNumber: 1;
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSystem: typeof GUARANTEE_COORDINATE_SYSTEM;
};

export async function buildOfficialTemplateCompanyCopy(input: {
  templateId: string;
  layout: FriendsGuaranteeTemplateLayoutSnapshot;
}) {
  const config = getGuaranteePdfTemplateConfig(input.templateId);
  const imagePath = join(process.cwd(), "public", config.imageSrc.replace(/^\/+/, ""));
  const imageBytes = await readFile(imagePath);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([config.pageSize.width, config.pageSize.height]);
  const image = await pdf.embedPng(imageBytes);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: config.pageSize.width,
    height: config.pageSize.height,
  });
  const pdfBytes = Buffer.from(await pdf.save());

  const deleted = new Set(input.layout.deletedOverlayFieldKeys);
  const effectiveFields = applyFriendsGuaranteeLayoutOverrides(
    [...config.overlayFields, ...input.layout.customOverlayFields].filter(
      (field) => !deleted.has(field.fieldKey),
    ),
    input.layout.layoutOverrides,
  );
  const fields: CompanyMaskSeedField[] = [];
  for (const field of effectiveFields) {
    const sourceFieldKey = field.sourceFieldKey ?? field.fieldKey;
    const definition = getCaseFieldDefinition(sourceFieldKey);
    if (!definition) continue;
    const box = getFriendsOverlayFieldBox(field);
    if (
      ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
      box.x < 0 ||
      box.y < 0 ||
      box.width <= 0 ||
      box.height <= 0 ||
      box.x + box.width > config.pageSize.width ||
      box.y + box.height > config.pageSize.height
    ) continue;
    fields.push({
      fieldId: randomUUID(),
      type: definition.valueKind === "boolean" ? "checkbox" : definition.valueKind === "date" ? "date" : "text",
      sourceFieldKey,
      label: field.label || definition.label,
      pageNumber: 1,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      coordinateSystem: GUARANTEE_COORDINATE_SYSTEM,
    });
  }
  if (fields.length === 0) throw new Error("official_template_has_no_editable_fields");

  return {
    pdfBytes,
    sha256: createHash("sha256").update(pdfBytes).digest("hex"),
    pageWidth: config.pageSize.width,
    pageHeight: config.pageSize.height,
    fields,
  };
}
