import {
  AiResponseError,
  AiRuntimeUnavailableError,
  createAiResponse,
} from "@/lib/ai/responses-client";
import { PDFDocument } from "pdf-lib";
import { CUSTOMER_IDENTITY_FIELDS } from "@/lib/customer-identity-field-catalog";
import {
  parseOpenAiIdentityReaderResponse,
  RemoteDocumentReaderError,
  type OpenAiIdentityReaderResponse,
} from "@/lib/identity-reader-contract";

const OPENAI_IDENTITY_READER_TIMEOUT_MS = 60_000;
export const IDENTITY_READER_MAX_PAGES = 20;
const IDENTITY_READER_MAX_OUTPUT_TOKENS = 6_000;

const IDENTITY_CASE_FIELD_KEYS = [
  "applicant.name",
  "applicant.furigana",
  "applicant.birthDate",
  "applicant.gender",
  "applicant.currentPostalCode",
  "applicant.currentAddress",
  "applicant.phone",
  "applicant.lineId",
  "applicant.email",
  "applicant.nationality",
  "applicant.residenceStatus",
  "applicant.residencePeriod",
  "applicant.residenceCardExpiry",
  "applicant.residenceCardNumber",
  "applicant.workRestriction",
  "applicant.driverLicenseNumber",
  "applicant.driverLicenseExpiry",
  "applicant.driverLicenseConditions",
] as const;

/** Derived from the existing Client form catalog; document-only facts stay evidence. */
export const IDENTITY_CUSTOMER_FIELD_KEYS = Object.keys(CUSTOMER_IDENTITY_FIELDS)
  .map((key) => `applicant.${key}`) as Array<`applicant.${keyof typeof CUSTOMER_IDENTITY_FIELDS}`>;

export type IdentityReaderScope = "case" | "customer";

export function buildIdentityReaderSchema(fieldKeys: readonly string[]) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      documentType: {
        type: "string",
        enum: ["identity_residence_card", "identity_driver_license", "identity_passport", "identity_health_insurance_card", "unknown_identity_scan"],
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
            fieldKey: { type: "string", enum: [...fieldKeys] },
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
}

const IDENTITY_READER_SCHEMA = buildIdentityReaderSchema(IDENTITY_CASE_FIELD_KEYS);

function mimeTypeForFilename(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  throw new RemoteDocumentReaderError("invalid_response");
}

export function buildOpenAiIdentityReaderInput(buffer: Buffer, filename: string, options: { scope?: IdentityReaderScope } = {}) {
  const mimeType = mimeTypeForFilename(filename);
  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const customerOnly = options.scope === "customer";
  const fieldInstruction = customerOnly
    ? `This is a standalone customer profile. Emit only ${IDENTITY_CUSTOMER_FIELD_KEYS.join(", ")}. Do not emit nationality, document numbers, issuer, residence status, residence period, expiry, work restrictions, driver conditions, or any other document-only fact. The document holder may be labelled 本人, 申請人, 被保険者, cardholder, or insured person; accept only the single holder subject. Reject 世帯主, 保険者, 代理人, 代表者, insurer, agent, and other non-holder roles.`
    : "This is an existing case context. Use the canonical applicant.* keys from the case schema and preserve the existing case-field destinations; do not invent new business fields.";
  const content = [
    {
      type: "input_text",
      text: [
        "Read this Japanese identity document as an assistive extraction step.",
        "Return only the requested structured schema.",
        "Do not guess or complete unreadable text. Use an empty value and uncertainty=not_found when a field is not visible.",
        "Use uncertainty=unclear for partially legible text and conflict when the document contains competing values.",
        "Classify the document as identity_passport, identity_residence_card, identity_driver_license, identity_health_insurance_card, or unknown_identity_scan.",
        fieldInstruction,
        "For applicant.currentAddress, require an address explicitly belonging to the document holder. Never use a passport issuing authority, insurer address, employer address, or insurance holder address as the customer's current address. For phone, LINE and email, emit a candidate only when the contact is explicitly printed for the document holder; otherwise return not_found.",
        "subjectKey is a stable opaque person-group ID reused across pages for the same person; never reuse it for a different person. subjectLabel must identify the visible role, including 申請人, 本人, 被保険者, 代理人, 世帯主, 保険者, or another visible role; do not relabel a non-holder as the document holder.",
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
  scope?: IdentityReaderScope;
  signal?: AbortSignal;
}): Promise<OpenAiIdentityReaderResponse> {
  const scope = input.scope ?? "case";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_IDENTITY_READER_TIMEOUT_MS);
  const signal = input.signal
    ? AbortSignal.any([input.signal, controller.signal])
    : controller.signal;
  try {
    let actualPageCount = 1;
    if (mimeTypeForFilename(input.filename) === "application/pdf") {
      let pageCount: number;
      try {
        pageCount = (await PDFDocument.load(input.buffer, { ignoreEncryption: true })).getPageCount();
      } catch {
        throw new RemoteDocumentReaderError("invalid_response");
      }
      if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > IDENTITY_READER_MAX_PAGES) {
        throw new RemoteDocumentReaderError("too_many_pages");
      }
      actualPageCount = pageCount;
    }
    const response = await createAiResponse<OpenAiIdentityReaderResponse>({
      taskId: "identity_document_extraction_assist",
      input: buildOpenAiIdentityReaderInput(input.buffer, input.filename, { scope }),
      jsonSchema: { name: "identity_document_reader", schema: scope === "customer" ? buildIdentityReaderSchema(IDENTITY_CUSTOMER_FIELD_KEYS) : IDENTITY_READER_SCHEMA, strict: true },
      maxOutputTokens: IDENTITY_READER_MAX_OUTPUT_TOKENS,
      metadata: { brokerDeskReaderVersion: scope === "customer" ? "openai_identity_customer_v1" : "openai_identity_v1", brokerDeskReaderScope: scope },
    }, { signal });
    const parsed = parseOpenAiIdentityReaderResponse(response.parsed);
    if (parsed.pages.some((page) => page.pageNumber > actualPageCount)
      || parsed.candidates.some((candidate) => candidate.pageNumber > actualPageCount)) {
      throw new RemoteDocumentReaderError("invalid_response");
    }
    return parsed;
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
