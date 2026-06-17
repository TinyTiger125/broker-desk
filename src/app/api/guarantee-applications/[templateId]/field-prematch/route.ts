import { NextResponse } from "next/server";
import {
  AiResponseError,
  AiRuntimeUnavailableError,
  createAiResponse,
} from "@/lib/ai";
import { findGuaranteeCompanyTemplate } from "@/lib/guarantee-application";

type FieldPrematchRouteProps = {
  params: Promise<{
    templateId: string;
  }>;
};

type PrematchBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PrematchField = {
  fieldKey: string;
  label: string;
  box: PrematchBox;
  segmentCells?: number;
  segmentMode?: "digits" | "amount";
};

type PrematchCandidate = {
  sourceFieldKey: string;
  label: string;
  box: PrematchBox;
  valueFormat?: string;
  valuePart?: string;
  align?: string;
  segmentCells?: number;
};

type PrematchBindingOption = {
  fieldKey: string;
  label: string;
  groupLabel?: string;
  valueKind?: string;
  storageScope?: string;
};

type PrematchSafety = {
  mode: "blank_custom_fields_only";
  totalCustomFieldCount: number;
  targetFieldCount: number;
  existingBindingCount: number;
  existingValueCount: number;
};

type PrematchRequest = {
  pageSize?: {
    width?: number;
    height?: number;
  };
  safety?: Partial<PrematchSafety>;
  fields?: PrematchField[];
  candidates?: PrematchCandidate[];
  bindingOptions?: PrematchBindingOption[];
};

type AiPrematchResponse = {
  matches: Array<{
    customFieldKey: string;
    sourceFieldKey: string;
    valueFormat: string | null;
    valuePart: string | null;
    align: "left" | "center" | "right" | null;
    confidence: number;
    reason: string;
  }>;
};

const VALUE_FORMATS = new Set([
  "dateYmd",
  "dateYmdShort",
  "dateMd",
  "dateMdWithoutDaySuffix",
  "dateDigitsYmd",
  "dateYear",
  "dateYearShort",
  "dateMonth",
  "dateDay",
  "phoneDigits",
  "phonePart1",
  "phonePart2",
  "phonePart3",
  "durationYears",
  "addressPrefecture",
  "addressMunicipality",
  "addressStreet",
  "addressRest",
]);

const VALUE_PARTS = new Set(["firstToken", "restTokens"]);
const ALIGNMENTS = new Set(["left", "center", "right"]);

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          customFieldKey: { type: "string" },
          sourceFieldKey: { type: "string" },
          valueFormat: { enum: [null, ...VALUE_FORMATS] },
          valuePart: { enum: [null, ...VALUE_PARTS] },
          align: { enum: [null, ...ALIGNMENTS] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          reason: { type: "string" },
        },
        required: ["customFieldKey", "sourceFieldKey", "valueFormat", "valuePart", "align", "confidence", "reason"],
      },
    },
  },
  required: ["matches"],
} as const;

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeBox(value: unknown): PrematchBox | undefined {
  if (!value || typeof value !== "object") return undefined;
  const box = value as Record<string, unknown>;
  if (!finiteNumber(box.x) || !finiteNumber(box.y) || !finiteNumber(box.width) || !finiteNumber(box.height)) return undefined;
  return {
    x: Math.round(Number(box.x) * 10) / 10,
    y: Math.round(Number(box.y) * 10) / 10,
    width: Math.round(Number(box.width) * 10) / 10,
    height: Math.round(Number(box.height) * 10) / 10,
  };
}

function sanitizeField(value: unknown): PrematchField | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const fieldKey = String(raw.fieldKey ?? "").trim();
  const label = String(raw.label ?? "").trim().slice(0, 80);
  const box = sanitizeBox(raw.box);
  if (!fieldKey.startsWith("custom.") || !box) return undefined;
  return {
    fieldKey,
    label: label || fieldKey,
    box,
    segmentCells: finiteNumber(raw.segmentCells) ? Math.max(1, Math.min(24, Math.floor(Number(raw.segmentCells)))) : undefined,
    segmentMode: raw.segmentMode === "amount" ? "amount" : raw.segmentMode === "digits" ? "digits" : undefined,
  };
}

function sanitizeCandidate(value: unknown): PrematchCandidate | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const sourceFieldKey = String(raw.sourceFieldKey ?? "").trim();
  const label = String(raw.label ?? "").trim().slice(0, 100);
  const box = sanitizeBox(raw.box);
  if (!sourceFieldKey || sourceFieldKey.startsWith("custom.") || !box) return undefined;
  return {
    sourceFieldKey,
    label: label || sourceFieldKey,
    box,
    valueFormat: typeof raw.valueFormat === "string" && VALUE_FORMATS.has(raw.valueFormat) ? raw.valueFormat : undefined,
    valuePart: typeof raw.valuePart === "string" && VALUE_PARTS.has(raw.valuePart) ? raw.valuePart : undefined,
    align: typeof raw.align === "string" && ALIGNMENTS.has(raw.align) ? raw.align : undefined,
    segmentCells: finiteNumber(raw.segmentCells) ? Math.max(1, Math.min(24, Math.floor(Number(raw.segmentCells)))) : undefined,
  };
}

function sanitizeBindingOption(value: unknown): PrematchBindingOption | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const fieldKey = String(raw.fieldKey ?? "").trim();
  if (!fieldKey || fieldKey.startsWith("custom.")) return undefined;
  return {
    fieldKey,
    label: String(raw.label ?? fieldKey).trim().slice(0, 100) || fieldKey,
    groupLabel: typeof raw.groupLabel === "string" ? raw.groupLabel.slice(0, 80) : undefined,
    valueKind: typeof raw.valueKind === "string" ? raw.valueKind.slice(0, 40) : undefined,
    storageScope: typeof raw.storageScope === "string" ? raw.storageScope.slice(0, 40) : undefined,
  };
}

function nonNegativeInteger(value: unknown) {
  return finiteNumber(value) ? Math.max(0, Math.floor(Number(value))) : 0;
}

function sanitizeSafety(value: unknown): PrematchSafety | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.mode !== "blank_custom_fields_only") return undefined;
  return {
    mode: "blank_custom_fields_only",
    totalCustomFieldCount: nonNegativeInteger(raw.totalCustomFieldCount),
    targetFieldCount: nonNegativeInteger(raw.targetFieldCount),
    existingBindingCount: nonNegativeInteger(raw.existingBindingCount),
    existingValueCount: nonNegativeInteger(raw.existingValueCount),
  };
}

function buildPrompt(input: {
  templateId: string;
  companyDisplayName: string;
  pageSize: { width: number; height: number };
  fields: PrematchField[];
  candidates: PrematchCandidate[];
  bindingOptions: PrematchBindingOption[];
}) {
  return [
    "You are an internal PDF template-authoring assistant for Japanese real-estate guarantee application forms.",
    "Your task is to propose field bindings for manually drawn overlay boxes.",
    "",
    "Hard rules:",
    "- Return only JSON matching the schema.",
    "- Use only sourceFieldKey values present in bindingOptions.",
    "- Use only customFieldKey values present in fields.",
    "- Do not suggest checkboxes, radio buttons, signatures, legal consent, or handwritten-only fields.",
    "- Do not invent business facts or values. This is template binding only.",
    "- Prefer no match over a weak match. Use confidence below 0.55 only for uncertain suggestions that should not be applied.",
    "- For date sub-boxes, use valueFormat dateYear/dateMonth/dateDay when the box is year/month/day.",
    "- For phone sub-boxes, use valueFormat phonePart1/phonePart2/phonePart3.",
    "- For Japanese postal code split boxes, use the same postal sourceFieldKey with valuePart firstToken for the first 3 digits and restTokens for the last 4 digits.",
    "- For name or furigana split boxes, use valuePart firstToken/restTokens only when the form clearly separates family/given parts.",
    "- For address fragments, use addressPrefecture/addressMunicipality/addressStreet/addressRest only when the target cell is visibly a fragment; otherwise use the full address source.",
    "- Preserve candidate valueFormat/valuePart/align when a nearby candidate clearly corresponds to the custom box.",
    "",
    "Coordinate system: x/y/width/height are in PDF page units, y increases upward. Boxes with close centers and similar sizes are stronger evidence.",
    "Use table order, section labels, group labels, field kinds, segment cell counts, and nearby known template candidates together.",
    "",
    JSON.stringify(input),
  ].join("\n");
}

function sanitizeAiMatches(input: {
  parsed?: AiPrematchResponse;
  fields: PrematchField[];
  bindingOptions: PrematchBindingOption[];
}) {
  const fields = new Set(input.fields.map((field) => field.fieldKey));
  const sourceFields = new Set(input.bindingOptions.map((option) => option.fieldKey));
  const seen = new Set<string>();
  const matches = Array.isArray(input.parsed?.matches) ? input.parsed.matches : [];

  return matches.flatMap((match) => {
    if (!fields.has(match.customFieldKey) || !sourceFields.has(match.sourceFieldKey)) return [];
    if (seen.has(match.customFieldKey)) return [];
    seen.add(match.customFieldKey);
    const confidence = Math.max(0, Math.min(1, Number(match.confidence)));
    if (!Number.isFinite(confidence) || confidence < 0.55) return [];
    return [{
      customFieldKey: match.customFieldKey,
      sourceFieldKey: match.sourceFieldKey,
      valueFormat: match.valueFormat && VALUE_FORMATS.has(match.valueFormat) ? match.valueFormat : null,
      valuePart: match.valuePart && VALUE_PARTS.has(match.valuePart) ? match.valuePart : null,
      align: match.align && ALIGNMENTS.has(match.align) ? match.align : null,
      confidence,
      reason: String(match.reason ?? "").slice(0, 200),
    }];
  });
}

export async function POST(request: Request, { params }: FieldPrematchRouteProps) {
  const routeParams = await params;
  const template = findGuaranteeCompanyTemplate(routeParams.templateId);
  if (!template) {
    return NextResponse.json({ ok: false, error: "template_not_found" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as PrematchRequest;

  const fields = (body.fields ?? []).map(sanitizeField).filter((field): field is PrematchField => Boolean(field)).slice(0, 220);
  const candidates = (body.candidates ?? []).map(sanitizeCandidate).filter((candidate): candidate is PrematchCandidate => Boolean(candidate)).slice(0, 800);
  const bindingOptions = (body.bindingOptions ?? [])
    .map(sanitizeBindingOption)
    .filter((option): option is PrematchBindingOption => Boolean(option))
    .slice(0, 260);
  const safety = sanitizeSafety(body.safety);
  const pageSize = {
    width: finiteNumber(body.pageSize?.width) ? Number(body.pageSize?.width) : 1,
    height: finiteNumber(body.pageSize?.height) ? Number(body.pageSize?.height) : 1,
  };

  if (!safety) {
    return NextResponse.json(
      { ok: false, error: "prematch_safety_required", message: "AI prematching requires blank-template safety metadata." },
      { status: 409 },
    );
  }
  if (safety.existingBindingCount > 0 || safety.existingValueCount > 0 || safety.targetFieldCount !== fields.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "prematch_not_blank",
        message: "AI prematching is allowed only when all custom boxes are unbound and empty.",
        safety,
        receivedFieldCount: fields.length,
      },
      { status: 409 },
    );
  }

  if (fields.length === 0) {
    return NextResponse.json({ ok: true, source: "ai", matches: [], message: "no_unbound_fields" });
  }
  if (bindingOptions.length === 0 || candidates.length === 0) {
    return NextResponse.json({ ok: true, source: "ai", matches: [], message: "missing_candidates" });
  }

  try {
    const result = await createAiResponse<AiPrematchResponse>({
      taskId: "template_field_prematch",
      input: buildPrompt({
        templateId: template.id,
        companyDisplayName: template.companyDisplayName,
        pageSize,
        fields,
        candidates,
        bindingOptions,
      }),
      jsonSchema: {
        name: "GuaranteeTemplateFieldPrematch",
        schema: responseSchema,
      },
      metadata: {
        templateId: template.id,
      },
    });

    return NextResponse.json({
      ok: true,
      source: "ai",
      model: result.model,
      matches: sanitizeAiMatches({ parsed: result.parsed, fields, bindingOptions }),
    });
  } catch (error) {
    if (error instanceof AiRuntimeUnavailableError) {
      return NextResponse.json({ ok: false, error: error.code, reason: error.reason }, { status: 503 });
    }
    if (error instanceof AiResponseError) {
      return NextResponse.json({ ok: false, error: error.code, status: error.status, message: error.message }, { status: 502 });
    }
    return NextResponse.json(
      { ok: false, error: "field_prematch_failed", message: error instanceof Error ? error.message : "unknown_error" },
      { status: 500 },
    );
  }
}
