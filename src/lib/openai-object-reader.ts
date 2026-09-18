import { AiResponseError, AiRuntimeUnavailableError, createAiResponse } from "@/lib/ai/responses-client";
import {
  ObjectReaderContractError,
  parseObjectReaderResponse,
  type ObjectReaderResponse,
} from "@/lib/object-reader-contract";

const OBJECT_READER_TIMEOUT_MS = 60_000;
const OBJECT_READER_FIELD_KEYS = [
  "property.name", "property.roomNumber", "property.postalCode", "property.address", "property.usage",
  "lease.contractType", "lease.contractStartDate", "lease.contractEndDate", "lease.moveInDate", "lease.rent",
  "lease.commonFee", "lease.parkingFee", "lease.waterTownFee", "lease.otherMonthlyFee", "lease.monthlyRentTotal",
  "lease.deposit", "lease.keyMoney", "lease.insuranceFee", "lease.keyExchangeFee", "lease.cancellationDeduction",
  "lease.initialCostTotal", "lease.paymentMethod", "lease.rentPaymentDay",
] as const;

const OBJECT_READER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    documentType: { type: "string", enum: ["property_lease_document", "unknown_property_document"] },
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
          value: { type: "string" }, pageNumber: { type: "integer", minimum: 1 }, sourceText: { type: "string" },
          uncertainty: { type: "string", enum: ["clear", "unclear", "conflict", "not_found"] },
          subjectKey: { type: "string", minLength: 1, maxLength: 100 }, subjectLabel: { type: "string", minLength: 1, maxLength: 100 },
        },
        required: ["fieldKey", "value", "pageNumber", "sourceText", "uncertainty", "subjectKey", "subjectLabel"],
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

export function buildOpenAiObjectReaderInput(buffer: Buffer, filename: string) {
  const mimeType = mimeTypeForFilename(filename);
  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const instructions = [
    "Read this Japanese property or lease document as an assistive extraction step.",
    "Return only the requested structured schema and never write business facts.",
    "Use only the canonical property.* and lease.* keys in the schema; do not invent fields such as property.furigana.",
    "Keep property identity (name, room, postal code, address, usage) separate from lease terms (rent, fees, deposit, key money and dates).",
    "Use one stable subjectKey for the same visible object across pages; when multiple objects appear, use different keys.",
    "subjectLabel must identify the visible object as 物件, 物件1, property, or building; lease terms for that object must reuse its subjectKey.",
    "Do not guess. Use an empty value and uncertainty=not_found when a field is not visible; visible candidates need a short exact sourceText quote.",
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

export async function readObjectDocumentWithOpenAi(input: { buffer: Buffer; filename: string; signal?: AbortSignal }): Promise<ObjectReaderResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OBJECT_READER_TIMEOUT_MS);
  const signal = input.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal;
  try {
    const response = await createAiResponse<ObjectReaderResponse>({
      taskId: "property_lease_document_extraction_assist",
      input: buildOpenAiObjectReaderInput(input.buffer, input.filename),
      jsonSchema: { name: "property_lease_reader", schema: OBJECT_READER_SCHEMA, strict: true },
      metadata: { brokerDeskReaderVersion: "openai_object_v1" },
    }, { signal });
    return parseObjectReaderResponse(response.parsed);
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
