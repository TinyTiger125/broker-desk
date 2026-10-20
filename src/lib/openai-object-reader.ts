import { AiResponseError, AiRuntimeUnavailableError, createAiResponse } from "@/lib/ai/responses-client";
import { PDFDocument } from "pdf-lib";
import {
  ObjectReaderContractError,
  normalizeObjectReaderPageIndex,
  parseObjectReaderResponse,
  OBJECT_READER_MAX_PAGES,
  type PropertyDocumentType,
  type ObjectReaderResponse,
} from "@/lib/object-reader-contract";

const OBJECT_READER_TIMEOUT_MS = 60_000;
const OBJECT_READER_MAX_OUTPUT_TOKENS = 12_000;
const OBJECT_READER_FIELD_KEYS = [
  "property.furigana", "property.name", "property.roomNumber", "property.postalCode", "property.address", "property.usage",
  "lease.contractType", "lease.contractStartDate", "lease.contractEndDate", "lease.moveInDate", "lease.rent",
  "lease.commonFee", "lease.parkingFee", "lease.waterTownFee", "lease.otherMonthlyFee", "lease.monthlyRentTotal",
  "lease.deposit", "lease.keyMoney", "lease.insuranceFee", "lease.keyExchangeFee", "lease.cancellationDeduction",
  "lease.initialCostTotal", "lease.paymentMethod", "lease.rentPaymentDay",
  "property.area", "property.sizeSqm", "property.listingPrice", "property.listingRent", "property.listingCommonFee",
  "property.managementFee", "property.repairFee", "property.notes",
] as const;

export const OBJECT_READER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    documentType: { type: "string", enum: ["registry", "important_matters", "sale_contract", "seller_disclosure", "property_lease_document", "unknown_property_document"] },
    pages: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: { pageNumber: { type: "integer", minimum: 1 }, lines: { type: "array", items: { type: "string" } } },
        required: ["pageNumber", "lines"],
      },
    },
    candidates: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          fieldKey: { type: "string", enum: OBJECT_READER_FIELD_KEYS },
          value: { type: "string" }, pageNumber: { type: "integer", minimum: 0 }, sourceText: { type: "string" },
          uncertainty: { type: "string", enum: ["clear", "unclear", "conflict", "not_found"] },
          subjectKey: { type: "string", minLength: 1, maxLength: 100 }, subjectLabel: { type: "string", minLength: 1, maxLength: 100 },
          sourceLocation: {
            type: ["object", "null"], additionalProperties: false,
            properties: {
              lineIndex: { type: ["integer", "null"], minimum: 0 }, x: { type: ["number", "null"], minimum: 0 }, y: { type: ["number", "null"], minimum: 0 },
              width: { type: ["number", "null"], minimum: 0 }, height: { type: ["number", "null"], minimum: 0 },
            },
            required: ["lineIndex", "x", "y", "width", "height"],
          },
        },
        required: ["fieldKey", "value", "pageNumber", "sourceText", "uncertainty", "subjectKey", "subjectLabel", "sourceLocation"],
      },
    },
  },
  required: ["documentType", "pages", "candidates"],
} satisfies Record<string, unknown>;

function mimeTypeForFilename(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  throw new ObjectReaderContractError("unsupported object document mime type");
}

async function completePdfPageIndex(value: unknown, buffer: Buffer): Promise<unknown> {
  if (!value || typeof value !== "object" || !Array.isArray((value as { pages?: unknown }).pages)) return value;
  let pageCount: number;
  try {
    pageCount = (await PDFDocument.load(buffer, { ignoreEncryption: true })).getPageCount();
  } catch {
    return value;
  }
  return Number.isInteger(pageCount) && pageCount >= 1 && pageCount <= 64
    ? normalizeObjectReaderPageIndex(value, pageCount)
    : value;
}

export function buildOpenAiObjectReaderInput(buffer: Buffer, filename: string, documentType: PropertyDocumentType = "unknown_property_document") {
  const mimeType = mimeTypeForFilename(filename);
  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const instructions = [
    `Read this Japanese property document as an assistive extraction step. The uploaded source category is ${documentType}.`,
    "Return only the requested structured schema and never write business facts.",
    "Use only the existing property-profile and case-field keys in the schema. Do not invent document-derived fields, and do not put unmapped clauses into property.notes.",
    "Keep property profile fields (name, furigana, region, address, room, postal code, usage, size, listing price and existing fee fields) separate from existing lease terms.",
    "Use one stable subjectKey for the same visible object across pages; when multiple objects appear, use different keys.",
    "When the source presents one unique unit together with the building or land that contains and contextualizes that unit, use one shared subjectKey for that unit and its containing building/land context; preserve each fact's original source wording and do not merge genuinely independent units.",
    "Never map a whole-building total area or a parcel area to the unit's property.sizeSqm. Only map property.sizeSqm from the unique unit or exclusive-area basis; keep other area bases as source evidence without inventing a field. If the source clearly describes two or more independent units or objects, keep separate subjectKeys and leave attribution ambiguous so automatic mapping is blocked.",
    "subjectLabel must identify the visible object as 物件, 物件1, property, or building; lease terms for that object must reuse its subjectKey.",
    "Do not guess. For an absent field, emit value=\"\", sourceText=\"\", uncertainty=not_found. Never emit clear or unclear with an empty value.",
    "Use pageNumber=0 for not_found candidates because they have no source page; use a real original page number (1 or greater) for every visible candidate.",
    "The pages array is the only evidence index. For every clear, unclear, or conflict candidate, copy sourceText character-for-character from one line in the cited page's lines array; do not paraphrase, normalize whitespace, synthesize labels, or cite a line that is not present. If you cannot copy an exact line excerpt, emit not_found.",
    "Only propose property.listingPrice when the source clearly identifies a property price; it is still a review candidate and must not be treated as proof of a contract price or payment. For property.sizeSqm, preserve the source basis in source evidence and mark candidates unclear or conflict when the basis is not explicit; never silently choose between area bases.",
    "Facts without a matching existing key remain in the original source document. Do not create registry, transaction, disclosure, structure, parcel, date, or area-basis fields.",
    "When the source visibly gives a page region, include sourceLocation; otherwise set sourceLocation to null. Preserve conflicts as separate candidates with uncertainty=conflict rather than choosing one silently.",
    "All results remain human-reviewable suggestions and must not overwrite existing saved case facts.",
  ].join(" ");
  return [{
    role: "user",
    content: [
      { type: "input_text", text: instructions },
      mimeType === "application/pdf"
        ? { type: "input_file", filename, file_data: dataUrl, detail: "high" }
        : { type: "input_image", image_url: dataUrl, detail: "high" },
    ],
  }];
}

export async function readObjectDocumentWithOpenAi(input: { buffer: Buffer; filename: string; documentType?: PropertyDocumentType; signal?: AbortSignal }): Promise<ObjectReaderResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OBJECT_READER_TIMEOUT_MS);
  const signal = input.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal;
  try {
    // Reject an oversized PDF before the paid provider call. The response
    // parser remains defensive, but it must never be the first page bound.
    if (mimeTypeForFilename(input.filename) === "application/pdf") {
      let pageCount: number;
      try {
        pageCount = (await PDFDocument.load(input.buffer, { ignoreEncryption: true })).getPageCount();
      } catch {
        throw new ObjectReaderContractError("invalid_pdf");
      }
      if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > OBJECT_READER_MAX_PAGES) {
        throw new ObjectReaderContractError("too many pages");
      }
    }
    const response = await createAiResponse<ObjectReaderResponse>({
      taskId: "property_lease_document_extraction_assist",
      input: buildOpenAiObjectReaderInput(input.buffer, input.filename, input.documentType),
      jsonSchema: { name: "property_lease_reader", schema: OBJECT_READER_SCHEMA, strict: true },
      maxOutputTokens: OBJECT_READER_MAX_OUTPUT_TOKENS,
      metadata: { brokerDeskReaderVersion: "openai_object_v1" },
    }, { signal });
    const parsed = parseObjectReaderResponse(await completePdfPageIndex(response.parsed, input.buffer));
    const raw = response.raw && typeof response.raw === "object" ? response.raw as Record<string, unknown> : {};
    const usage = raw.usage && typeof raw.usage === "object" ? raw.usage as Record<string, unknown> : undefined;
    return {
      ...parsed,
      processingMetadata: {
        provider: "openai_responses",
        model: response.model,
        taskId: response.taskId,
        reasoningEffort: response.reasoningEffort,
        ...(usage ? { usage } : {}),
      },
    };
  } catch (error) {
    if (error instanceof ObjectReaderContractError) throw error;
    if (error instanceof AiResponseError) throw new ObjectReaderContractError(`openai_http_${error.status}`);
    if (error instanceof AiRuntimeUnavailableError) throw new ObjectReaderContractError("ai_runtime_unavailable");
    if (error instanceof DOMException && error.name === "AbortError") throw new ObjectReaderContractError("timeout");
    throw new ObjectReaderContractError("request_failed");
  } finally {
    clearTimeout(timer);
  }
}
