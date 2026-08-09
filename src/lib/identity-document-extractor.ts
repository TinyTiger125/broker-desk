import { createHash, randomUUID } from "crypto";
import { execFile } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { promisify } from "util";
import type { ExtractedInputField, InputDocumentType, InputFileExtractionResult } from "@/lib/input-file-extractor";
import {
  assertProductionDocumentReaderReady,
  isProductionRuntime,
  ProductionReadinessError,
} from "@/lib/production-readiness";

const execFileAsync = promisify(execFile);

type OcrPage = {
  pageNumber: number;
  lines: string[];
};

type OcrResult = {
  pages: OcrPage[];
};

const DOCUMENT_LABELS: Record<InputDocumentType, string> = {
  important_matters_unit_sale: "重要事項説明書（区分所有建物の売買・交換用）",
  sale_contract_unit_general_seller: "区分所有建物用売買契約書（一般売主）",
  property_condition_notice_unit: "物件状況確認書（告知書／区分所有建物用）",
  identity_residence_card: "本人確認資料（在留カード）",
  identity_driver_license: "本人確認資料（運転免許証）",
  identity_residence_card_or_driver_license: "本人確認資料（在留カード・運転免許証）",
  unknown_identity_scan: "本人確認資料（未識別）",
  unknown_excel: "unknown",
};

type FieldDraft = Omit<ExtractedInputField, "reviewStatus" | "sourceFileHash" | "templateVersion" | "method"> & {
  method?: ExtractedInputField["method"];
};

function clean(value: string) {
  return value
    .replace(/[ \t]+/g, " ")
    .replace(/[－ー—–]/g, "-")
    .replace(/\s+([年月日])/g, "$1")
    .trim();
}

function normalizeComparable(value: string) {
  return value.replace(/\s+/g, "").toUpperCase();
}

function normalizeJapaneseDate(value: string) {
  const normalized = clean(value);
  const western = normalized.match(/(\d{4})年0?(\d{1,2})月0?(\d{1,2})日/);
  if (western) return `${western[1]}年${Number(western[2])}月${Number(western[3])}日`;

  const era = normalized.match(/(昭和|平成|令和)\s*0?(\d{1,2})年\s*0?(\d{1,2})月\s*0?(\d{1,2})日/);
  if (!era) return normalized;
  const baseYear = era[1] === "昭和" ? 1925 : era[1] === "平成" ? 1988 : 2018;
  return `${baseYear + Number(era[2])}年${Number(era[3])}月${Number(era[4])}日`;
}

function dateFromLine(line: string) {
  const western = line.match(/(\d{4})年(?:（[^）]+）)?0?(\d{1,2})月0?(\d{1,2})日/);
  if (western) return `${western[1]}年${Number(western[2])}月${Number(western[3])}日`;
  const era = line.match(/(昭和|平成|令和)\s*0?(\d{1,2})年\s*0?(\d{1,2})月\s*0?(\d{1,2})日/);
  return era ? normalizeJapaneseDate(era[0]) : "";
}

function findLineAfter(lines: string[], marker: string) {
  const index = lines.findIndex((line) => line.includes(marker));
  if (index < 0) return "";
  return lines.slice(index + 1).find((line) => line && !line.includes("/") && !line.includes("DATE")) ?? "";
}

function uniqueFields(fields: FieldDraft[], sourceFileHash: string, templateVersion: string): ExtractedInputField[] {
  const byKey = new Map<string, FieldDraft>();
  for (const field of fields) {
    const existing = byKey.get(field.fieldKey);
    if (!existing) {
      byKey.set(field.fieldKey, field);
      continue;
    }
    const existingValue = clean(existing.normalizedValue || existing.value);
    const nextValue = clean(field.normalizedValue || field.value);
    if ((!existingValue && nextValue) || (nextValue && field.confidence > existing.confidence)) {
      byKey.set(field.fieldKey, field);
    }
  }

  return [...byKey.values()].map((field) => ({
    ...field,
    method: field.method ?? "ocr",
    reviewStatus: "suggested",
    sourceFileHash,
    templateVersion,
  }));
}

function addField(fields: FieldDraft[], input: {
  fieldKey: string;
  label: string;
  value?: string;
  page: OcrPage;
  source: string;
  confidence: number;
}) {
  fields.push({
    fieldKey: input.fieldKey,
    label: input.label,
    value: clean(input.value ?? ""),
    normalizedValue: clean(input.value ?? ""),
    sourceSheet: input.source,
    sourceRange: `page ${input.page.pageNumber}`,
    confidence: input.confidence,
  });
}

function addManualFallbackFields(fields: FieldDraft[], page: OcrPage) {
  const source = "本人確認資料 OCR";
  [
    ["applicant.name", "氏名"],
    ["applicant.birthDate", "生年月日"],
    ["applicant.gender", "性別"],
    ["applicant.currentAddress", "現住所"],
    ["applicant.nationality", "国籍"],
  ].forEach(([fieldKey, label]) => {
    if (fields.some((field) => field.fieldKey === fieldKey)) return;
    addField(fields, { fieldKey, label, value: "", page, source, confidence: 0.2 });
  });
}

function extractResidenceCardFields(page: OcrPage, fields: FieldDraft[]) {
  const lines = page.lines.map(clean).filter(Boolean);
  const source = "在留カード OCR";
  const joined = lines.join(" ");

  const nameLine = lines.find((line) => line.includes("氏名") && !line.includes("NAME"));
  const inlineName = nameLine?.match(/氏名\s+(.+)$/)?.[1];
  const name = inlineName || findLineAfter(lines, "氏名");
  if (name) addField(fields, { fieldKey: "applicant.name", label: "氏名", value: name, page, source, confidence: 0.84 });

  const birthDate = dateFromLine(joined.match(/(?:生年月日|DATE OF BIRTH).{0,40}/)?.[0] ?? joined);
  if (birthDate) addField(fields, { fieldKey: "applicant.birthDate", label: "生年月日", value: birthDate, page, source, confidence: 0.86 });

  const genderLine = lines.find((line) => line.includes("性別")) ?? joined;
  const gender = genderLine.includes("女") ? "女" : genderLine.includes("男") ? "男" : "";
  if (gender) addField(fields, { fieldKey: "applicant.gender", label: "性別", value: gender, page, source, confidence: 0.78 });

  const nationalityLine = lines.find((line) => line.includes("国籍") || line.includes("NATIONALITY")) ?? joined;
  const nationality = nationalityLine.includes("中国") || nationalityLine.toUpperCase().includes("CHINESE") ? "中国" : "";
  if (nationality) addField(fields, { fieldKey: "applicant.nationality", label: "国籍", value: nationality, page, source, confidence: 0.78 });

  const addressLine = lines.find((line) => line.includes("住居地") || line.includes("ADDRESS"));
  if (addressLine && !addressLine.includes("未定")) {
    addField(fields, {
      fieldKey: "applicant.currentAddress",
      label: "現住所",
      value: addressLine.replace(/^.*住居地/, ""),
      page,
      source,
      confidence: 0.62,
    });
  }

  const statusLine = lines.find((line) => line.includes("在留資格") && !line.includes("STATUS"));
  if (statusLine) {
    addField(fields, {
      fieldKey: "applicant.residenceStatus",
      label: "在留資格",
      value: statusLine.replace(/^.*在留資格\s*/, ""),
      page,
      source,
      confidence: 0.82,
    });
  }

  const periodLine = lines.find((line) => /\d+年（\d{4}年/.test(line));
  if (periodLine) {
    addField(fields, {
      fieldKey: "applicant.residencePeriod",
      label: "在留期間",
      value: periodLine,
      page,
      source,
      confidence: 0.8,
    });
  }

  const cardExpiryLine = lines.find((line) => line.includes("このカードは") && line.includes("有効")) ?? periodLine;
  const cardExpiry = cardExpiryLine ? dateFromLine(cardExpiryLine) : "";
  if (cardExpiry) {
    addField(fields, {
      fieldKey: "applicant.residenceCardExpiry",
      label: "在留カード有効期限",
      value: cardExpiry,
      page,
      source,
      confidence: 0.86,
    });
  }

  const numberLine = lines.find((line) => /[A-Z]{2}\d{6,}[A-Z]{2}/.test(line));
  const cardNumber = numberLine?.match(/[A-Z]{2}\d{6,}[A-Z]{2}/)?.[0];
  if (cardNumber) {
    addField(fields, {
      fieldKey: "applicant.residenceCardNumber",
      label: "在留カード番号",
      value: cardNumber,
      page,
      source,
      confidence: 0.84,
    });
  }

  const workRestriction = lines.find((line) => line.includes("就労活動") || line.includes("就労制限"));
  if (workRestriction) {
    addField(fields, {
      fieldKey: "applicant.workRestriction",
      label: "就労制限",
      value: workRestriction,
      page,
      source,
      confidence: 0.68,
    });
  }
}

function extractDriverLicenseFields(page: OcrPage, fields: FieldDraft[]) {
  const lines = page.lines.map(clean).filter(Boolean);
  const source = "運転免許証 OCR";
  const joined = lines.join(" ");

  const nameIndex = lines.findIndex((line) => line === "氏名" || line.startsWith("氏名 "));
  if (nameIndex >= 0) {
    const inlineName = lines[nameIndex].replace(/^氏名\s*/, "").trim();
    const nameParts = inlineName
      ? [inlineName]
      : lines.slice(nameIndex + 1).filter((line) => !line.includes("生") && !line.includes("住所")).slice(0, 2);
    const name = nameParts.join(" ");
    if (name) addField(fields, { fieldKey: "applicant.name", label: "氏名", value: name, page, source, confidence: 0.68 });
  }

  const birthLine = lines.find((line) => /(昭和|平成|令和)\d+年\d+月\d+日生/.test(line) || line.includes("生"));
  const birthDate = birthLine ? dateFromLine(birthLine) : "";
  if (birthDate) addField(fields, { fieldKey: "applicant.birthDate", label: "生年月日", value: birthDate, page, source, confidence: 0.82 });

  const address = findLineAfter(lines, "住所");
  if (address) addField(fields, { fieldKey: "applicant.currentAddress", label: "現住所", value: address, page, source, confidence: 0.82 });

  const licenseNumber = joined.match(/\b\d{12}\b/)?.[0];
  if (licenseNumber) {
    addField(fields, {
      fieldKey: "applicant.driverLicenseNumber",
      label: "免許証番号",
      value: licenseNumber,
      page,
      source,
      confidence: 0.86,
    });
  }

  const expiryLine = lines.find((line) => line.includes("まで有効"));
  const expiry = expiryLine ? dateFromLine(expiryLine) : "";
  if (expiry) {
    addField(fields, {
      fieldKey: "applicant.driverLicenseExpiry",
      label: "免許証有効期限",
      value: expiry,
      page,
      source,
      confidence: 0.84,
    });
  }

  const conditionIndex = lines.findIndex((line) => line.includes("条件"));
  if (conditionIndex >= 0) {
    const conditions = lines
      .slice(conditionIndex + 1, conditionIndex + 4)
      .filter((line) => !line.includes("番号") && !/^\d/.test(line))
      .join(" / ");
    if (conditions) {
      addField(fields, {
        fieldKey: "applicant.driverLicenseConditions",
        label: "免許条件",
        value: conditions,
        page,
        source,
        confidence: 0.58,
      });
    }
  }
}

function isResidenceCardPage(page: OcrPage) {
  const text = normalizeComparable(page.lines.join(" "));
  return text.includes("在留カード") || text.includes("RESIDENCECARD") || text.includes("在留資格");
}

function isDriverLicensePage(page: OcrPage) {
  const text = normalizeComparable(page.lines.join(" "));
  return text.includes("公安委員会") && (text.includes("免許") || text.includes("番号"));
}

function detectDocumentType(hasResidenceCard: boolean, hasDriverLicense: boolean): InputDocumentType {
  if (hasResidenceCard && hasDriverLicense) return "identity_residence_card_or_driver_license";
  if (hasResidenceCard) return "identity_residence_card";
  if (hasDriverLicense) return "identity_driver_license";
  return "unknown_identity_scan";
}

const REMOTE_READER_TIMEOUT_MS = 60_000;
const MAX_REMOTE_READER_PAGES = 20;
const MAX_REMOTE_READER_LINES_PER_PAGE = 500;
const MAX_REMOTE_READER_LINE_LENGTH = 1_000;

function parseRemoteOcrResult(value: unknown): OcrResult {
  if (!value || typeof value !== "object" || !("pages" in value) || !Array.isArray(value.pages)) {
    throw new Error("remote_document_reader_invalid_response");
  }

  const pages = value.pages.slice(0, MAX_REMOTE_READER_PAGES).map((page, index) => {
    if (!page || typeof page !== "object" || !Array.isArray((page as { lines?: unknown }).lines)) {
      throw new Error("remote_document_reader_invalid_page");
    }
    const pageNumber = Number((page as { pageNumber?: unknown }).pageNumber);
    const lines = (page as { lines: unknown[] }).lines
      .slice(0, MAX_REMOTE_READER_LINES_PER_PAGE)
      .map((line) => String(line).slice(0, MAX_REMOTE_READER_LINE_LENGTH));
    return {
      pageNumber: Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : index + 1,
      lines,
    };
  });

  return { pages };
}

async function runRemoteOcr(buffer: Buffer, filename: string): Promise<OcrResult> {
  assertProductionDocumentReaderReady();
  const endpoint = process.env.DOCUMENT_READING_ENDPOINT?.trim();
  const token = process.env.DOCUMENT_READING_API_TOKEN?.trim();
  if (!endpoint || !token) {
    throw new ProductionReadinessError("production_document_reader_required");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_READER_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
        "x-broker-desk-reader-version": "v1",
      },
      body: JSON.stringify({
        document: {
          filename,
          contentBase64: buffer.toString("base64"),
        },
      }),
    });
    if (!response.ok) throw new Error(`remote_document_reader_http_${response.status}`);
    return parseRemoteOcrResult(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

async function runOcr(buffer: Buffer, filename: string): Promise<OcrResult> {
  // The local Swift helper is development-only. Production must use a remote,
  // auditable reader rather than silently running a machine-specific fallback.
  if (isProductionRuntime()) {
    return runRemoteOcr(buffer, filename);
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "broker-desk-id-"));
  const safeName = filename.replace(/[^\w.\-()]/g, "_") || `${randomUUID()}.pdf`;
  const inputPath = path.join(tempDir, safeName);
  try {
    await writeFile(inputPath, buffer);
    const scriptPath = path.join(process.cwd(), "scripts", "identity-document-ocr.swift");
    const { stdout } = await execFileAsync("swift", [scriptPath, inputPath], {
      timeout: 60000,
      maxBuffer: 1024 * 1024 * 8,
    });
    return JSON.parse(stdout || "{\"pages\":[]}") as OcrResult;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function extractIdentityDocumentFromBuffer(input: {
  buffer: Buffer;
  filename: string;
}): Promise<InputFileExtractionResult> {
  const sourceFileHash = createHash("sha256").update(input.buffer).digest("hex");
  let ocr: OcrResult = { pages: [] };
  try {
    ocr = await runOcr(input.buffer, input.filename);
  } catch (error) {
    if (isProductionRuntime() || error instanceof ProductionReadinessError) {
      throw error;
    }
    ocr = { pages: [] };
  }

  const pages = ocr.pages.filter((page) => Array.isArray(page.lines));
  const residencePages = pages.filter(isResidenceCardPage);
  const driverLicensePages = pages.filter(isDriverLicensePage);
  const documentType = detectDocumentType(residencePages.length > 0, driverLicensePages.length > 0);
  const templateVersion = `identity_document:${documentType}:vision_ocr_v1`;
  const fields: FieldDraft[] = [];

  residencePages.forEach((page) => extractResidenceCardFields(page, fields));
  driverLicensePages.forEach((page) => extractDriverLicenseFields(page, fields));
  const firstEvidencePage = residencePages[0] ?? driverLicensePages[0] ?? pages[0] ?? { pageNumber: 1, lines: [] };
  if (documentType !== "unknown_identity_scan") {
    const label = documentType === "identity_residence_card_or_driver_license"
      ? "在留カード / 運転免許証"
      : documentType === "identity_residence_card"
        ? "在留カード"
        : "運転免許証";
    addField(fields, {
      fieldKey: "applicant.identityDocumentType",
      label: "本人確認資料種別",
      value: label,
      page: firstEvidencePage,
      source: "本人確認資料 OCR",
      confidence: 0.92,
    });
  }
  addManualFallbackFields(fields, firstEvidencePage);

  const extractedFields = uniqueFields(fields, sourceFileHash, templateVersion);
  return {
    schemaVersion: "v1",
    documentType,
    documentTypeLabel: DOCUMENT_LABELS[documentType],
    extractionStatus: documentType === "unknown_identity_scan" ? "unknown" : "recognized",
    sourceFilename: input.filename,
    sourceFileHash,
    templateVersion,
    fingerprintConfidence: documentType === "unknown_identity_scan" ? 0.25 : 0.82,
    detectedSheet: extractedFields[0]?.sourceSheet ?? "本人確認資料 OCR",
    detectedTitle: DOCUMENT_LABELS[documentType],
    fields: extractedFields,
  };
}

function hasResidenceCardDocument(type: InputDocumentType) {
  return type === "identity_residence_card" || type === "identity_residence_card_or_driver_license";
}

function hasDriverLicenseDocument(type: InputDocumentType) {
  return type === "identity_driver_license" || type === "identity_residence_card_or_driver_license";
}

function mergeIdentityDocumentType(results: InputFileExtractionResult[]): InputDocumentType {
  const hasResidenceCard = results.some((result) => hasResidenceCardDocument(result.documentType));
  const hasDriverLicense = results.some((result) => hasDriverLicenseDocument(result.documentType));
  return detectDocumentType(hasResidenceCard, hasDriverLicense);
}

function getIdentityDocumentValue(type: InputDocumentType) {
  if (type === "identity_residence_card_or_driver_license") return "在留カード / 運転免許証";
  if (type === "identity_residence_card") return "在留カード";
  if (type === "identity_driver_license") return "運転免許証";
  return "";
}

const IDENTITY_MERGE_CONFLICT_FIELDS = new Set(["applicant.name", "applicant.birthDate", "applicant.gender"]);
const IDENTITY_MERGE_CONFLICT_LABELS: Record<string, string> = {
  "applicant.name": "氏名",
  "applicant.birthDate": "生年月日",
  "applicant.gender": "性別",
};

function assertNoIdentityMergeConflicts(results: InputFileExtractionResult[]) {
  const valuesByFieldKey = new Map<string, Set<string>>();
  for (const field of results.flatMap((result) => result.fields)) {
    if (!IDENTITY_MERGE_CONFLICT_FIELDS.has(field.fieldKey)) continue;
    const value = normalizeComparable(field.normalizedValue || field.value);
    if (!value) continue;
    valuesByFieldKey.set(field.fieldKey, (valuesByFieldKey.get(field.fieldKey) ?? new Set()).add(value));
  }

  const conflictField = [...valuesByFieldKey.entries()].find(([, values]) => values.size > 1)?.[0];
  if (conflictField) {
    const label = IDENTITY_MERGE_CONFLICT_LABELS[conflictField] ?? "主要項目";
    throw new Error(`本人確認資料の${label}が一致しません。同一人物の資料だけをまとめてアップロードしてください。`);
  }
}

function mergeIdentityFields(results: InputFileExtractionResult[], documentType: InputDocumentType, sourceFileHash: string, templateVersion: string) {
  const byKey = new Map<string, ExtractedInputField>();
  for (const field of results.flatMap((result) => result.fields)) {
    const existing = byKey.get(field.fieldKey);
    if (!existing) {
      byKey.set(field.fieldKey, field);
      continue;
    }
    const existingValue = clean(existing.normalizedValue || existing.value);
    const nextValue = clean(field.normalizedValue || field.value);
    if ((!existingValue && nextValue) || (nextValue && field.confidence > existing.confidence)) {
      byKey.set(field.fieldKey, field);
    }
  }

  const identityDocumentValue = getIdentityDocumentValue(documentType);
  if (identityDocumentValue) {
    const sourceField = byKey.get("applicant.identityDocumentType");
    byKey.set("applicant.identityDocumentType", {
      fieldKey: "applicant.identityDocumentType",
      label: sourceField?.label ?? "本人確認資料種別",
      value: identityDocumentValue,
      normalizedValue: identityDocumentValue,
      sourceSheet: sourceField?.sourceSheet ?? "本人確認資料 OCR",
      sourceCell: sourceField?.sourceCell,
      sourceRange: sourceField?.sourceRange,
      method: "ocr",
      confidence: Math.max(sourceField?.confidence ?? 0, 0.92),
      reviewStatus: "suggested",
      sourceFileHash,
      templateVersion,
    });
  }

  return [...byKey.values()];
}

export async function extractIdentityDocumentsFromFiles(inputs: Array<{
  buffer: Buffer;
  filename: string;
}>): Promise<InputFileExtractionResult> {
  if (inputs.length === 1) {
    return extractIdentityDocumentFromBuffer(inputs[0]);
  }

  const results: InputFileExtractionResult[] = [];
  for (const input of inputs) {
    results.push(await extractIdentityDocumentFromBuffer(input));
  }
  assertNoIdentityMergeConflicts(results);

  const sourceFileHash = createHash("sha256");
  for (const result of results) {
    sourceFileHash.update(result.sourceFileHash);
  }
  const mergedSourceFileHash = sourceFileHash.digest("hex");
  const documentType = mergeIdentityDocumentType(results);
  const templateVersion = `identity_document:${documentType}:multi_file_vision_ocr_v1`;
  const fields = mergeIdentityFields(results, documentType, mergedSourceFileHash, templateVersion);
  const sourceFilename = inputs.map((input) => input.filename).join(", ");

  return {
    schemaVersion: "v1",
    documentType,
    documentTypeLabel: DOCUMENT_LABELS[documentType],
    extractionStatus: documentType === "unknown_identity_scan" ? "unknown" : "recognized",
    sourceFilename,
    sourceFileHash: mergedSourceFileHash,
    templateVersion,
    fingerprintConfidence: documentType === "unknown_identity_scan" ? 0.25 : 0.82,
    detectedSheet: fields[0]?.sourceSheet ?? "本人確認資料 OCR",
    detectedTitle: DOCUMENT_LABELS[documentType],
    fields,
  };
}
