import {
  AiResponseError,
  AiTemporaryFileError,
  AiRuntimeUnavailableError,
  createAiResponse,
  withTemporaryOpenAiFile,
} from "@/lib/ai/responses-client";
import { PDFDocument } from "pdf-lib";
import { CUSTOMER_IDENTITY_FIELDS } from "@/lib/customer-identity-field-catalog";
import {
  parseOpenAiIdentityReaderResponse,
  RemoteDocumentReaderError,
  type OpenAiIdentityReaderResponse,
} from "@/lib/identity-reader-contract";

const OPENAI_IDENTITY_READER_TIMEOUT_MS = 60_000;
const OPENAI_IDENTITY_READER_FILE_TIMEOUT_MS = 120_000;
/** Keep small PDFs inline; larger PDFs use an ephemeral Files API reference. */
export const OPENAI_IDENTITY_READER_INLINE_FILE_MAX_BYTES = 1 * 1024 * 1024;
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
export type IdentityReaderCustomerMode = "direct" | "queued";

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

export function buildOpenAiIdentityReaderInput(buffer: Buffer, filename: string, options: { scope?: IdentityReaderScope; fileId?: string; customerMode?: IdentityReaderCustomerMode } = {}) {
  const mimeType = mimeTypeForFilename(filename);
  const dataUrl = options.fileId && mimeType === "application/pdf"
    ? undefined
    : `data:${mimeType};base64,${buffer.toString("base64")}`;
  const customerOnly = options.scope === "customer";
  const customerMode = options.customerMode ?? "queued";
  const fieldInstruction = customerOnly
    ? `This is a standalone customer profile. Emit only ${IDENTITY_CUSTOMER_FIELD_KEYS.join(", ")}. For applicant.nameLatin, applicant.nameKanji, and applicant.nameKatakana, emit a value only when that exact script and representation is visibly printed for the single document holder. Never transliterate, translate, infer Katakana or furigana, or copy applicant.name into a representation field. Keep applicant.name as the legacy exact printed name only. Do not emit nationality, document numbers, issuer, residence status, residence period, expiry, work restrictions, driver conditions, or any other document-only fact. The document holder may be labelled 本人, 申請人, 被保険者, cardholder, or insured person; accept only the single holder subject. Reject 世帯主, 保険者, 代理人, 代表者, insurer, agent, and other non-holder roles.`
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
        "A Japanese My Number card (個人番号カード / マイナンバーカード) is outside the supported list; classify it as unknown_identity_scan and emit no customer candidates.",
        "For a customer preview, an address or contact value alone is never sufficient evidence of identity. For a queued standalone customer source, the holder's printed name and birth date are independent identity anchors: if either is absent or unreadable, keep other candidates review-only and never imply that another file may complete this source. Gender is not an identity anchor. For a direct customer preview, a clear page-evidenced printed holder name is sufficient to create a pending customer record; birth date and gender may be absent or unreadable and must remain not_found rather than causing an otherwise supported document to become unknown_identity_scan. A direct preview still must not return an address-only candidate or accept a non-holder name.",
        "For applicant.currentAddress, sourceText must be a short exact excerpt from one printed line containing an address marker such as 住所, 住居地, 現住所, Address, Residence, Street, or City and the complete candidate value; never reconstruct an address by joining separate lines. Read every digit and block such as 丁目, 番地, 番, and 号 only when visibly unambiguous. If a digit or block is tiny, blurred, or ambiguous, keep the candidate uncertainty=unclear or return value=\"\" with uncertainty=not_found; never choose a digit from address conventions. Current-address candidates are always review-only and must never be automatically saved.",
        fieldInstruction,
        customerOnly && customerMode === "direct"
          ? "This request is a direct customer preview: preserve a supported document classification when the holder name is clear even if no birth date or gender is visible."
          : customerOnly
            ? "This request is a queued standalone customer source: preserve the strict holder-name-plus-birth-date identity-anchor rule above."
            : "",
        "For applicant.currentAddress, require an address explicitly belonging to the document holder. Never use a passport issuing authority, insurer address, employer address, or insurance holder address as the customer's current address. Treat a residence-card value such as 未定 as not an actual address: do not emit it as a clear address candidate; use an empty value with uncertainty=not_found or uncertainty=unclear instead, so a later dated address cannot be silently replaced. For phone, LINE and email, emit a candidate only when the contact is explicitly printed for the document holder; otherwise return not_found.",
        "subjectKey is a stable opaque person-group ID reused across pages for the same person; never reuse it for a different person. subjectLabel must identify the visible role, including 申請人, 本人, 被保険者, 代理人, 世帯主, 保険者, or another visible role; do not relabel a non-holder as the document holder.",
        "sourceText must be a short exact quote from the supplied page for a visible candidate; for not_found, an empty sourceText is allowed.",
        "Only propose applicant fields; all values remain human-reviewable candidates and must never be treated as confirmed facts.",
      ].join(" "),
    },
    mimeType === "application/pdf"
      ? options.fileId
        ? { type: "input_file", file_id: options.fileId, detail: "high" }
        : { type: "input_file", filename, file_data: dataUrl, detail: "high" }
      : { type: "input_image", image_url: dataUrl, detail: "high" },
  ];
  return [{ role: "user", content }];
}

export async function readIdentityDocumentWithOpenAi(input: {
  buffer: Buffer;
  filename: string;
  scope?: IdentityReaderScope;
  customerMode?: IdentityReaderCustomerMode;
  signal?: AbortSignal;
}): Promise<OpenAiIdentityReaderResponse> {
  const scope = input.scope ?? "case";
  const isPdf = mimeTypeForFilename(input.filename) === "application/pdf";
  const useTemporaryFile = isPdf && input.buffer.byteLength > OPENAI_IDENTITY_READER_INLINE_FILE_MAX_BYTES;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), useTemporaryFile ? OPENAI_IDENTITY_READER_FILE_TIMEOUT_MS : OPENAI_IDENTITY_READER_TIMEOUT_MS);
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
    const request = (fileId?: string) => createAiResponse<OpenAiIdentityReaderResponse>({
      taskId: "identity_document_extraction_assist",
      input: buildOpenAiIdentityReaderInput(input.buffer, input.filename, { scope, customerMode: input.customerMode, fileId }),
      jsonSchema: { name: "identity_document_reader", schema: scope === "customer" ? buildIdentityReaderSchema(IDENTITY_CUSTOMER_FIELD_KEYS) : IDENTITY_READER_SCHEMA, strict: true },
      maxOutputTokens: IDENTITY_READER_MAX_OUTPUT_TOKENS,
      metadata: {
        brokerDeskReaderVersion: scope === "customer" ? "openai_identity_customer_v1" : "openai_identity_v1",
        brokerDeskReaderScope: scope,
        brokerDeskInputTransport: useTemporaryFile ? "files_api_ephemeral" : "inline_data_url",
      },
    }, { signal });
    const response = useTemporaryFile
      ? await withTemporaryOpenAiFile({ buffer: input.buffer, filename: input.filename, mimeType: "application/pdf" }, request, { signal })
      : await request();
    const parsed = parseOpenAiIdentityReaderResponse(response.parsed);
    if (parsed.pages.some((page) => page.pageNumber > actualPageCount)
      || parsed.candidates.some((candidate) => candidate.pageNumber > actualPageCount)) {
      throw new RemoteDocumentReaderError("invalid_response");
    }
    return parsed;
  } catch (error) {
    if (error instanceof RemoteDocumentReaderError) throw error;
    if (error instanceof AiTemporaryFileError) {
      throw new RemoteDocumentReaderError(error.operation === "upload" ? "file_upload_failed" : "file_cleanup_failed", { status: error.status });
    }
    if (error instanceof AiResponseError) throw new RemoteDocumentReaderError("http_error", { status: error.status });
    if (error instanceof AiRuntimeUnavailableError) throw new RemoteDocumentReaderError("request_failed");
    if (error instanceof DOMException && error.name === "AbortError") throw new RemoteDocumentReaderError("timeout");
    if (error instanceof SyntaxError) throw new RemoteDocumentReaderError("invalid_response");
    throw new RemoteDocumentReaderError("request_failed");
  } finally {
    clearTimeout(timeout);
  }
}
