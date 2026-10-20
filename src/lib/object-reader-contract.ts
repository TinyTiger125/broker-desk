export type ObjectReaderUncertainty = "clear" | "unclear" | "conflict" | "not_found";

/** A missing category is allowed; each uploaded source remains independently reviewable. */
export type PropertyDocumentType =
  | "registry"
  | "important_matters"
  | "sale_contract"
  | "seller_disclosure"
  | "property_lease_document"
  | "unknown_property_document";

export function inferPropertyDocumentType(filename: string): PropertyDocumentType {
  const value = filename.trim().toLocaleLowerCase();
  if (/謄本|登記|registry|title/.test(value)) return "registry";
  if (/重要事項|重要事項説明|important.?matters|disclosure.?statement/.test(value)) return "important_matters";
  if (/売買契約|sale.?contract|purchase.?agreement/.test(value)) return "sale_contract";
  if (/売主|告知|seller.?disclosure|seller.?notice/.test(value)) return "seller_disclosure";
  if (/賃貸|賃借|lease|rental/.test(value)) return "property_lease_document";
  return "unknown_property_document";
}

export type ObjectReaderProcessingMetadata = {
  provider: string;
  model?: string;
  taskId?: string;
  reasoningEffort?: string;
  usage?: Record<string, unknown>;
};

/**
 * These keys already exist in the case-field catalog. Lease terms stay in the
 * lease.* namespace so a reader cannot silently turn rent/deposit into a
 * shared property master fact.
 */
export type ObjectReaderFieldKey =
  | "property.furigana"
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
  | "lease.rentPaymentDay"
  // These are existing editable property-profile fields. They remain
  // ordinary candidates and require explicit review before a property write.
  | "property.area"
  | "property.sizeSqm"
  | "property.listingPrice"
  | "property.listingRent"
  | "property.listingCommonFee"
  | "property.managementFee"
  | "property.repairFee"
  | "property.notes";

export type ObjectReaderSourceLocation = {
  lineIndex?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

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
  sourceLocation?: ObjectReaderSourceLocation;
};

export type ObjectReaderResponse = {
  documentType: PropertyDocumentType;
  pages: Array<{ pageNumber: number; lines: string[] }>;
  candidates: ObjectReaderCandidate[];
  processingMetadata?: ObjectReaderProcessingMetadata;
};

const ALLOWED_FIELD_KEYS = new Set<ObjectReaderFieldKey>([
  "property.furigana",
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
  "property.area",
  "property.sizeSqm",
  "property.listingPrice",
  "property.listingRent",
  "property.listingCommonFee",
  "property.managementFee",
  "property.repairFee",
  "property.notes",
]);

// Supplied important-matters material is 22 pages. Keep a bounded ceiling
// above that source size so pages are never silently trimmed while still
// rejecting unbounded model responses.
export const OBJECT_READER_MAX_PAGES = 64;
const MAX_LINES_PER_PAGE = 500;
const MAX_LINE_LENGTH = 1_000;
const MAX_CANDIDATES = 128;

/** Complete the original page-number index without fabricating page text. */
export function normalizeObjectReaderPageIndex(value: unknown, pageCount: number): unknown {
  if (!value || typeof value !== "object" || !Array.isArray((value as { pages?: unknown }).pages)) return value;
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > OBJECT_READER_MAX_PAGES) return value;
  const raw = value as { pages: unknown[]; candidates?: unknown[] };
  const pageMap = new Map<number, unknown>();
  for (const page of raw.pages) {
    if (!page || typeof page !== "object") continue;
    const pageNumber = (page as { pageNumber?: unknown }).pageNumber;
    if (Number.isInteger(pageNumber) && Number(pageNumber) >= 1 && Number(pageNumber) <= pageCount) pageMap.set(Number(pageNumber), page);
  }
  const pages = Array.from({ length: pageCount }, (_, index) => pageMap.get(index + 1) ?? { pageNumber: index + 1, lines: [] });
  const candidates = Array.isArray(raw.candidates)
    ? raw.candidates.map((candidate) => {
      if (!candidate || typeof candidate !== "object") return candidate;
      const item = candidate as { uncertainty?: unknown; pageNumber?: unknown };
      if (item.uncertainty === "not_found" && (!Number.isInteger(item.pageNumber) || Number(item.pageNumber) < 1 || Number(item.pageNumber) > pageCount)) {
        return { ...candidate, pageNumber: 0 };
      }
      return candidate;
    })
    : raw.candidates;
  return { ...value, pages, candidates };
}

export class ObjectReaderContractError extends Error {
  readonly code = "invalid_object_reader_response";
}

function parseProcessingMetadata(value: unknown): ObjectReaderProcessingMetadata | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ObjectReaderContractError("invalid processing metadata");
  const raw = value as Record<string, unknown>;
  if (typeof raw.provider !== "string" || !raw.provider.trim() || raw.provider.length > 100) {
    throw new ObjectReaderContractError("invalid processing provider");
  }
  const stringValue = (key: string) => raw[key] === undefined ? undefined : typeof raw[key] === "string" && raw[key].length <= 200 ? raw[key] : null;
  const model = stringValue("model");
  const taskId = stringValue("taskId");
  const reasoningEffort = stringValue("reasoningEffort");
  if (model === null || taskId === null || reasoningEffort === null) throw new ObjectReaderContractError("invalid processing metadata");
  const usage = raw.usage === undefined
    ? undefined
    : raw.usage && typeof raw.usage === "object" && !Array.isArray(raw.usage)
      ? raw.usage as Record<string, unknown>
      : null;
  if (usage === null) throw new ObjectReaderContractError("invalid processing usage");
  return {
    provider: raw.provider.trim(),
    ...(model ? { model } : {}),
    ...(taskId ? { taskId } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
    ...(usage ? { usage } : {}),
  };
}

function parsePages(value: unknown) {
  if (!value || typeof value !== "object" || !Array.isArray((value as { pages?: unknown }).pages)) {
    throw new ObjectReaderContractError("pages are required");
  }
  const rawPages = (value as { pages: unknown[] }).pages;
  if (rawPages.length > OBJECT_READER_MAX_PAGES) throw new ObjectReaderContractError("too many pages");
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
  const allowedDocumentTypes = new Set<PropertyDocumentType>([
    "registry", "important_matters", "sale_contract", "seller_disclosure",
    "property_lease_document", "unknown_property_document",
  ]);
  if (typeof raw.documentType !== "string" || !allowedDocumentTypes.has(raw.documentType as PropertyDocumentType)) {
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
    const rawLocation = item.sourceLocation;
    const sourceLocation = rawLocation && typeof rawLocation === "object" && !Array.isArray(rawLocation)
      ? Object.fromEntries(Object.entries(rawLocation as Record<string, unknown>).filter(([key, value]) =>
        ["lineIndex", "x", "y", "width", "height"].includes(key) && typeof value === "number" && Number.isFinite(value) && value >= 0 && (key !== "lineIndex" || Number.isInteger(value)),
      )) as ObjectReaderSourceLocation
      : undefined;
    const pageNumber = item.pageNumber;
    const uncertainty = item.uncertainty;
    if (!ALLOWED_FIELD_KEYS.has(fieldKey as ObjectReaderFieldKey) || !Number.isInteger(pageNumber) || (Number(pageNumber) < 1 && !(uncertainty === "not_found" && Number(pageNumber) === 0)) || !subjectKey || !subjectLabel || candidateValue.length > MAX_LINE_LENGTH || sourceText.length > MAX_LINE_LENGTH || subjectKey.length > 100 || subjectLabel.length > 100) {
      throw new ObjectReaderContractError("invalid candidate fields");
    }
    if (uncertainty !== "clear" && uncertainty !== "unclear" && uncertainty !== "conflict" && uncertainty !== "not_found") {
      throw new ObjectReaderContractError("invalid uncertainty");
    }
    const page = pages.find((item) => item.pageNumber === Number(pageNumber));
    if (uncertainty !== "not_found" && !page) throw new ObjectReaderContractError("candidate page is missing");
    if (uncertainty === "not_found" && (candidateValue || sourceText)) {
      throw new ObjectReaderContractError("not_found candidates must be empty");
    }
    if (uncertainty !== "not_found" && (!page || !candidateValue || !sourceText || !page.lines.some((line) => line.includes(sourceText)))) {
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
      ...(sourceLocation && Object.keys(sourceLocation).length ? { sourceLocation } : {}),
    };
  });
  const processingMetadata = parseProcessingMetadata((value as { processingMetadata?: unknown }).processingMetadata);
  return {
    documentType: raw.documentType as PropertyDocumentType,
    pages,
    candidates,
    ...(processingMetadata ? { processingMetadata } : {}),
  };
}
