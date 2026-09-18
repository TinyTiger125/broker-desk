import {
  AiResponseError,
  AiRuntimeUnavailableError,
  createAiResponse,
} from "@/lib/ai/responses-client";
import {
  parseOpenAiIdentityReaderResponse,
  RemoteDocumentReaderError,
  type OpenAiIdentityReaderResponse,
} from "@/lib/identity-reader-contract";

const OPENAI_IDENTITY_READER_TIMEOUT_MS = 60_000;

const IDENTITY_READER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    documentType: {
      type: "string",
      enum: ["identity_residence_card", "identity_driver_license", "unknown_identity_scan"],
    },
    pages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          pageNumber: { type: "integer", minimum: 1 },
          lines: { type: "array", items: { type: "string" } },
        },
        required: ["pageNumber", "lines"],
      },
    },
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          fieldKey: {
            type: "string",
            enum: [
              "applicant.name",
              "applicant.birthDate",
              "applicant.currentAddress",
              "applicant.nationality",
              "applicant.residenceStatus",
              "applicant.residencePeriod",
              "applicant.residenceCardExpiry",
              "applicant.residenceCardNumber",
              "applicant.workRestriction",
              "applicant.driverLicenseNumber",
              "applicant.driverLicenseExpiry",
              "applicant.driverLicenseConditions",
            ],
          },
          value: { type: "string" },
          pageNumber: { type: "integer", minimum: 1 },
          sourceText: { type: "string" },
          uncertainty: { type: "string", enum: ["clear", "unclear", "conflict", "not_found"] },
          subjectKey: { type: "string", minLength: 1, maxLength: 100 },
          subjectLabel: { type: "string", minLength: 1, maxLength: 100 },
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
  if (lower.endsWith(".gif")) return "image/gif";
  throw new RemoteDocumentReaderError("invalid_response");
}

export function buildOpenAiIdentityReaderInput(buffer: Buffer, filename: string) {
  const mimeType = mimeTypeForFilename(filename);
  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const content = [
    {
      type: "input_text",
      text: [
        "Read this Japanese identity document as an assistive extraction step.",
        "Return only the requested structured schema.",
        "Do not guess or complete unreadable text. Use an empty value and uncertainty=not_found when a field is not visible.",
        "Use uncertainty=unclear for partially legible text and conflict when the document contains competing values.",
        "fieldKey must use the canonical applicant.* keys from the schema; never emit short labels such as name, address, or date_of_birth.",
        "subjectKey is a stable opaque person-group ID reused across pages for the same person; never reuse it for a different person. subjectLabel must identify 申請人, 代理人, 緊急連絡先, or another visible role.",
        "sourceText must be a short exact quote from the supplied page for a visible candidate; for not_found, an empty sourceText is allowed.",
        "Only propose applicant fields; all values remain human-reviewable candidates and must never be treated as confirmed facts.",
      ].join(" "),
    },
    mimeType === "application/pdf"
      ? { type: "input_file", filename, file_data: dataUrl, detail: "high" }
      : { type: "input_image", image_url: dataUrl, detail: "high" },
  ];
  return [{ role: "user", content }];
}

export async function readIdentityDocumentWithOpenAi(input: {
  buffer: Buffer;
  filename: string;
  signal?: AbortSignal;
}): Promise<OpenAiIdentityReaderResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_IDENTITY_READER_TIMEOUT_MS);
  const signal = input.signal
    ? AbortSignal.any([input.signal, controller.signal])
    : controller.signal;
  try {
    const response = await createAiResponse<OpenAiIdentityReaderResponse>({
      taskId: "identity_document_extraction_assist",
      input: buildOpenAiIdentityReaderInput(input.buffer, input.filename),
      jsonSchema: { name: "identity_document_reader", schema: IDENTITY_READER_SCHEMA, strict: true },
      metadata: { brokerDeskReaderVersion: "openai_identity_v1" },
    }, { signal });
    return parseOpenAiIdentityReaderResponse(response.parsed);
  } catch (error) {
    if (error instanceof RemoteDocumentReaderError) throw error;
    if (error instanceof AiResponseError) throw new RemoteDocumentReaderError("http_error", { status: error.status });
    if (error instanceof AiRuntimeUnavailableError) throw new RemoteDocumentReaderError("request_failed");
    if (error instanceof DOMException && error.name === "AbortError") throw new RemoteDocumentReaderError("timeout");
    if (error instanceof SyntaxError) throw new RemoteDocumentReaderError("invalid_response");
    throw new RemoteDocumentReaderError("request_failed");
  } finally {
    clearTimeout(timeout);
  }
}
