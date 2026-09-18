export type ObjectReaderUncertainty = "clear" | "unclear" | "conflict" | "not_found";

/**
 * These keys already exist in the case-field catalog. Lease terms stay in the
 * lease.* namespace so a reader cannot silently turn rent/deposit into a
 * shared property master fact.
 */
export type ObjectReaderFieldKey =
  | "property.name"
  | "property.roomNumber"
  | "property.postalCode"
  | "property.address"
  | "property.usage"
  | "lease.contractType"
  | "lease.contractStartDate"
  | "lease.contractEndDate"
  | "lease.moveInDate"
  | "lease.rent"
  | "lease.commonFee"
  | "lease.parkingFee"
  | "lease.waterTownFee"
  | "lease.otherMonthlyFee"
  | "lease.monthlyRentTotal"
  | "lease.deposit"
  | "lease.keyMoney"
  | "lease.insuranceFee"
  | "lease.keyExchangeFee"
  | "lease.cancellationDeduction"
  | "lease.initialCostTotal"
  | "lease.paymentMethod"
  | "lease.rentPaymentDay";

export type ObjectReaderCandidate = {
  fieldKey: ObjectReaderFieldKey;
  value: string;
  pageNumber: number;
  sourceText: string;
  uncertainty: ObjectReaderUncertainty;
  /** Stable object-group id reused for the object's pages and lease terms. */
  subjectKey: string;
  /** Visible object role, for example 物件 or 物件1. */
  subjectLabel: string;
};

export type ObjectReaderResponse = {
  documentType: "property_lease_document" | "unknown_property_document";
  pages: Array<{ pageNumber: number; lines: string[] }>;
  candidates: ObjectReaderCandidate[];
};

const ALLOWED_FIELD_KEYS = new Set<ObjectReaderFieldKey>([
  "property.name",
  "property.roomNumber",
  "property.postalCode",
  "property.address",
  "property.usage",
  "lease.contractType",
  "lease.contractStartDate",
  "lease.contractEndDate",
  "lease.moveInDate",
  "lease.rent",
  "lease.commonFee",
  "lease.parkingFee",
  "lease.waterTownFee",
  "lease.otherMonthlyFee",
  "lease.monthlyRentTotal",
  "lease.deposit",
  "lease.keyMoney",
  "lease.insuranceFee",
  "lease.keyExchangeFee",
  "lease.cancellationDeduction",
  "lease.initialCostTotal",
  "lease.paymentMethod",
  "lease.rentPaymentDay",
]);

const MAX_PAGES = 20;
const MAX_LINES_PER_PAGE = 500;
const MAX_LINE_LENGTH = 1_000;
const MAX_CANDIDATES = 128;

export class ObjectReaderContractError extends Error {
  readonly code = "invalid_object_reader_response";
}

function parsePages(value: unknown) {
  if (!value || typeof value !== "object" || !Array.isArray((value as { pages?: unknown }).pages)) {
    throw new ObjectReaderContractError("pages are required");
  }
  const rawPages = (value as { pages: unknown[] }).pages;
  if (rawPages.length > MAX_PAGES) throw new ObjectReaderContractError("too many pages");
  const pages = rawPages.map((page) => {
    if (!page || typeof page !== "object" || !Array.isArray((page as { lines?: unknown }).lines)) {
      throw new ObjectReaderContractError("invalid page");
    }
    const rawPageNumber = (page as { pageNumber?: unknown }).pageNumber;
    if (!Number.isInteger(rawPageNumber) || Number(rawPageNumber) < 1) {
      throw new ObjectReaderContractError("invalid page number");
    }
    const rawLines = (page as { lines: unknown[] }).lines;
    if (!rawLines.every((line) => typeof line === "string")) throw new ObjectReaderContractError("invalid page lines");
    if (rawLines.length > MAX_LINES_PER_PAGE || rawLines.some((line) => line.length > MAX_LINE_LENGTH)) {
      throw new ObjectReaderContractError("page limits exceeded");
    }
    return {
      pageNumber: Number(rawPageNumber),
      lines: rawLines,
    };
  });
  if (!pages.length || !pages.some((page) => page.lines.some((line) => line.trim()))) {
    throw new ObjectReaderContractError("empty pages");
  }
  return pages;
}

export function parseObjectReaderResponse(value: unknown): ObjectReaderResponse {
  if (!value || typeof value !== "object") throw new ObjectReaderContractError("response must be an object");
  const pages = parsePages(value);
  const raw = value as { documentType?: unknown; candidates?: unknown };
  if (raw.documentType !== "property_lease_document" && raw.documentType !== "unknown_property_document") {
    throw new ObjectReaderContractError("invalid document type");
  }
  if (!Array.isArray(raw.candidates) || raw.candidates.length > MAX_CANDIDATES) {
    throw new ObjectReaderContractError("invalid candidates");
  }
  const candidates = raw.candidates.map((candidate) => {
    if (!candidate || typeof candidate !== "object") throw new ObjectReaderContractError("invalid candidate");
    const item = candidate as Record<string, unknown>;
    const fieldKey = typeof item.fieldKey === "string" ? item.fieldKey.trim() : "";
    const candidateValue = typeof item.value === "string" ? item.value.trim() : "";
    const sourceText = typeof item.sourceText === "string" ? item.sourceText.trim() : "";
    const subjectKey = typeof item.subjectKey === "string" ? item.subjectKey.trim() : "";
    const subjectLabel = typeof item.subjectLabel === "string" ? item.subjectLabel.trim() : "";
    const pageNumber = item.pageNumber;
    const uncertainty = item.uncertainty;
    if (!ALLOWED_FIELD_KEYS.has(fieldKey as ObjectReaderFieldKey) || !Number.isInteger(pageNumber) || Number(pageNumber) < 1 || !subjectKey || !subjectLabel || candidateValue.length > MAX_LINE_LENGTH || sourceText.length > MAX_LINE_LENGTH || subjectKey.length > 100 || subjectLabel.length > 100) {
      throw new ObjectReaderContractError("invalid candidate fields");
    }
    if (uncertainty !== "clear" && uncertainty !== "unclear" && uncertainty !== "conflict" && uncertainty !== "not_found") {
      throw new ObjectReaderContractError("invalid uncertainty");
    }
    const page = pages.find((item) => item.pageNumber === Number(pageNumber));
    if (!page) throw new ObjectReaderContractError("candidate page is missing");
    if (uncertainty !== "not_found" && (!sourceText || !page.lines.some((line) => line.includes(sourceText)))) {
      throw new ObjectReaderContractError("visible candidates need page evidence");
    }
    return {
      fieldKey: fieldKey as ObjectReaderFieldKey,
      value: candidateValue,
      pageNumber: Number(pageNumber),
      sourceText,
      uncertainty: uncertainty as ObjectReaderUncertainty,
      subjectKey,
      subjectLabel,
    };
  });
  return {
    documentType: raw.documentType,
    pages,
    candidates,
  };
}
