export type RemoteDocumentReaderPage = {
  pageNumber: number;
  lines: string[];
};

export type RemoteDocumentReaderRequest = {
  document: {
    filename: string;
    contentBase64: string;
  };
};

export type RemoteDocumentReaderResponse = {
  pages: RemoteDocumentReaderPage[];
};

export type IdentityReaderUncertainty = "clear" | "unclear" | "conflict" | "not_found";

export type OpenAiIdentityReaderFieldKey =
  | "applicant.name"
  | "applicant.furigana"
  | "applicant.birthDate"
  | "applicant.gender"
  | "applicant.currentPostalCode"
  | "applicant.currentAddress"
  | "applicant.phone"
  | "applicant.lineId"
  | "applicant.email"
  | "applicant.nationality"
  | "applicant.residenceStatus"
  | "applicant.residencePeriod"
  | "applicant.residenceCardExpiry"
  | "applicant.residenceCardNumber"
  | "applicant.workRestriction"
  | "applicant.driverLicenseNumber"
  | "applicant.driverLicenseExpiry"
  | "applicant.driverLicenseConditions";

export type OpenAiIdentityReaderCandidate = {
  fieldKey: OpenAiIdentityReaderFieldKey;
  value: string;
  pageNumber: number;
  sourceText: string;
  uncertainty: IdentityReaderUncertainty;
  subjectKey: string;
  subjectLabel: string;
};

const OPENAI_IDENTITY_READER_FIELD_KEYS = new Set<OpenAiIdentityReaderFieldKey>([
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
]);

export type OpenAiIdentityReaderResponse = RemoteDocumentReaderResponse & {
  documentType: "identity_residence_card" | "identity_driver_license" | "identity_passport" | "identity_health_insurance_card" | "unknown_identity_scan";
  candidates: OpenAiIdentityReaderCandidate[];
};

export type RemoteDocumentReaderErrorCode =
  | "invalid_response"
  | "invalid_page"
  | "too_many_pages"
  | "empty_result"
  | "timeout"
  | "request_failed"
  | "http_error";

export class RemoteDocumentReaderError extends Error {
  readonly code: RemoteDocumentReaderErrorCode;
  readonly status?: number;

  constructor(code: RemoteDocumentReaderErrorCode, options?: { status?: number }) {
    super(`remote_document_reader_${code}`);
    this.name = "RemoteDocumentReaderError";
    this.code = code;
    this.status = options?.status;
  }
}

const MAX_REMOTE_READER_PAGES = 20;
const MAX_REMOTE_READER_LINES_PER_PAGE = 500;
const MAX_REMOTE_READER_LINE_LENGTH = 1_000;
const UNSUPPORTED_IDENTITY_MARKER = /個人番号カード|マイナンバーカード|個人番号|マイナンバー|通知カード|my\s*number/i;
function hasUnsupportedIdentityMarker(value: string) {
  return UNSUPPORTED_IDENTITY_MARKER.test(value.replace(/[\s\u3000]+/g, ""));
}

export function buildRemoteDocumentReaderRequest(buffer: Buffer, filename: string): RemoteDocumentReaderRequest {
  return {
    document: {
      filename,
      contentBase64: buffer.toString("base64"),
    },
  };
}

/**
 * The reader adapter owns the wire format. Field candidates are derived by
 * Broker Desk's document parser from these OCR lines; the remote service does
 * not write business fields directly.
 */
export function parseRemoteDocumentReaderResponse(value: unknown): RemoteDocumentReaderResponse {
  if (!value || typeof value !== "object" || !("pages" in value) || !Array.isArray(value.pages)) {
    throw new RemoteDocumentReaderError("invalid_response");
  }

  const pages = value.pages.slice(0, MAX_REMOTE_READER_PAGES).map((page, index) => {
    if (!page || typeof page !== "object" || !Array.isArray((page as { lines?: unknown }).lines)) {
      throw new RemoteDocumentReaderError("invalid_page");
    }
    const rawPageNumber = (page as { pageNumber?: unknown }).pageNumber;
    if (rawPageNumber !== undefined && (!Number.isInteger(rawPageNumber) || Number(rawPageNumber) < 1)) {
      throw new RemoteDocumentReaderError("invalid_page");
    }
    const rawLines = (page as { lines: unknown[] }).lines;
    if (!rawLines.every((line) => typeof line === "string")) {
      throw new RemoteDocumentReaderError("invalid_page");
    }
    const lines = rawLines.slice(0, MAX_REMOTE_READER_LINES_PER_PAGE).map((line) => line.slice(0, MAX_REMOTE_READER_LINE_LENGTH));
    return {
      pageNumber: rawPageNumber === undefined ? index + 1 : Number(rawPageNumber),
      lines,
    };
  });

  if (pages.length === 0 || !pages.some((page) => page.lines.some((line) => line.trim()))) {
    throw new RemoteDocumentReaderError("empty_result");
  }
  if (new Set(pages.map((page) => page.pageNumber)).size !== pages.length) {
    throw new RemoteDocumentReaderError("invalid_page");
  }
  return { pages };
}

export function parseOpenAiIdentityReaderResponse(value: unknown): OpenAiIdentityReaderResponse {
  if (!value || typeof value !== "object") {
    throw new RemoteDocumentReaderError("invalid_response");
  }
  const raw = value as { documentType?: unknown; candidates?: unknown };
  const documentType = raw.documentType;
  if (documentType !== "identity_residence_card" && documentType !== "identity_driver_license" && documentType !== "identity_passport" && documentType !== "identity_health_insurance_card" && documentType !== "unknown_identity_scan") {
    throw new RemoteDocumentReaderError("invalid_response");
  }
  if (!Array.isArray(raw.candidates) || raw.candidates.length > 64) {
    throw new RemoteDocumentReaderError("invalid_response");
  }
  // Vision models can return structured candidates with exact source quotes
  // while leaving the auxiliary page transcription empty. The generic remote
  // OCR contract correctly rejects an empty transcript, but applying that
  // rule here discards otherwise valid identity evidence as
  // remote_document_reader_empty_result. Seed only empty pages from the
  // candidate quotes, then keep the normal page/count validation below.
  let parsedPages: RemoteDocumentReaderResponse;
  try {
    parsedPages = parseRemoteDocumentReaderResponse(value);
  } catch (error) {
    if (!(error instanceof RemoteDocumentReaderError) || error.code !== "empty_result") throw error;
    const rawPages = (value as { pages?: unknown }).pages;
    if (!Array.isArray(rawPages)) throw error;
    const candidateQuotes = new Map<number, string[]>();
    for (const candidate of raw.candidates) {
      if (!candidate || typeof candidate !== "object") continue;
      const item = candidate as Record<string, unknown>;
      const pageNumber = item.pageNumber;
      const sourceText = typeof item.sourceText === "string" ? item.sourceText.trim() : "";
      if (Number.isInteger(pageNumber) && Number(pageNumber) > 0 && sourceText) {
        candidateQuotes.set(Number(pageNumber), [...(candidateQuotes.get(Number(pageNumber)) ?? []), sourceText]);
      }
    }
    const seededPages = rawPages.map((page, index) => {
      if (!page || typeof page !== "object") return page;
      const item = page as Record<string, unknown>;
      const pageNumber = Number.isInteger(item.pageNumber) ? Number(item.pageNumber) : index + 1;
      const lines = Array.isArray(item.lines) ? item.lines.filter((line): line is string => typeof line === "string") : [];
      return lines.some((line) => line.trim())
        ? page
        : { ...item, lines: candidateQuotes.get(pageNumber) ?? [] };
    });
    parsedPages = parseRemoteDocumentReaderResponse({ pages: seededPages });
  }
  const pageNumbers = new Set(parsedPages.pages.map((page) => page.pageNumber));
  const candidates = raw.candidates.map((candidate) => {
    if (!candidate || typeof candidate !== "object") throw new RemoteDocumentReaderError("invalid_response");
    const item = candidate as Record<string, unknown>;
    const fieldKey = typeof item.fieldKey === "string" ? item.fieldKey.trim() : "";
    const value = typeof item.value === "string" ? item.value.slice(0, 1_000).trim() : "";
    const sourceText = typeof item.sourceText === "string" ? item.sourceText.slice(0, 1_000).trim() : "";
    const subjectKey = typeof item.subjectKey === "string" ? item.subjectKey.slice(0, 100).trim() : "";
    const subjectLabel = typeof item.subjectLabel === "string" ? item.subjectLabel.slice(0, 100).trim() : "";
    const pageNumber = item.pageNumber;
    const uncertainty = item.uncertainty;
    if (!OPENAI_IDENTITY_READER_FIELD_KEYS.has(fieldKey as OpenAiIdentityReaderFieldKey) || !Number.isInteger(pageNumber) || Number(pageNumber) < 1 || !pageNumbers.has(Number(pageNumber)) || !subjectKey || !subjectLabel) {
      throw new RemoteDocumentReaderError("invalid_response");
    }
    if (uncertainty !== "clear" && uncertainty !== "unclear" && uncertainty !== "conflict" && uncertainty !== "not_found") {
      throw new RemoteDocumentReaderError("invalid_response");
    }
    if (uncertainty !== "not_found" && !sourceText) {
      throw new RemoteDocumentReaderError("invalid_response");
    }
    return {
      fieldKey: fieldKey as OpenAiIdentityReaderFieldKey,
      value,
      pageNumber: Number(pageNumber),
      sourceText,
      uncertainty: uncertainty as IdentityReaderUncertainty,
      subjectKey,
      subjectLabel,
    };
  });
  // My Number cards are deliberately outside the supported customer identity
  // list. If OCR or the model labels one as a supported document, fail closed
  // from the visible Japanese marker rather than silently accepting its
  // candidate fields.
  const unsupportedIdentity = parsedPages.pages.some((page) => hasUnsupportedIdentityMarker(page.lines.join("")))
    || candidates.some((candidate) => hasUnsupportedIdentityMarker(candidate.sourceText));
  return { ...parsedPages, documentType: unsupportedIdentity ? "unknown_identity_scan" : documentType, candidates };
}
