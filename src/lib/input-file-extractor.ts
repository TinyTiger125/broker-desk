import * as XLSX from "xlsx";

export type InputDocumentType =
  | "important_matters_unit_sale"
  | "sale_contract_unit_general_seller"
  | "property_condition_notice_unit"
  | "identity_residence_card"
  | "identity_driver_license"
  | "identity_residence_card_or_driver_license"
  | "unknown_identity_scan"
  | "unknown_excel";

export type InputExtractionReviewStatus = "suggested";

export type ExtractedInputField = {
  fieldKey: string;
  label: string;
  value: string;
  normalizedValue: string;
  sourceSheet: string;
  sourceCell?: string;
  sourceRange?: string;
  method: "rule" | "ocr";
  confidence: number;
  reviewStatus: InputExtractionReviewStatus;
  sourceFileHash: string;
  templateVersion: string;
};

export type InputFileExtractionResult = {
  schemaVersion: "v1";
  documentType: InputDocumentType;
  documentTypeLabel: string;
  extractionStatus: "recognized" | "unknown";
  sourceFilename: string;
  sourceFileHash: string;
  templateVersion: string;
  fingerprintConfidence: number;
  detectedSheet?: string;
  detectedTitle?: string;
  fields: ExtractedInputField[];
};

const DOCUMENT_TYPE_LABEL: Record<InputDocumentType, string> = {
  important_matters_unit_sale: "重要事項説明書（区分所有建物の売買・交換用）",
  sale_contract_unit_general_seller: "区分所有建物用売買契約書（一般売主）",
  property_condition_notice_unit: "物件状況確認書（告知書／区分所有建物用）",
  identity_residence_card: "本人確認資料（在留カード）",
  identity_driver_license: "本人確認資料（運転免許証）",
  identity_residence_card_or_driver_license: "本人確認資料（在留カード・運転免許証）",
  unknown_identity_scan: "本人確認資料（未識別）",
  unknown_excel: "unknown",
};

type TemplateFingerprint = {
  documentType: Exclude<InputDocumentType, "unknown_excel">;
  templateVersion: string;
  expectedSheets: string[];
  requiredTitleSignals: Array<{
    sheetName: string;
    cell: string;
    includes: string;
  }>;
  knownHashPrefixes?: string[];
};

const TEMPLATE_FINGERPRINTS: TemplateFingerprint[] = [
  {
    documentType: "important_matters_unit_sale",
    templateVersion: "important_matters_unit_sale:v1:14_a-03",
    expectedSheets: ["(2)重要事項説明書(区分所有建物の売買・交換用)", "リスト"],
    requiredTitleSignals: [
      {
        sheetName: "(2)重要事項説明書(区分所有建物の売買・交換用)",
        cell: "B2",
        includes: "重要事項説明書[区分所有建物の売買・交換用]",
      },
      { sheetName: "(2)重要事項説明書(区分所有建物の売買・交換用)", cell: "B39", includes: "不動産の表示等" },
      { sheetName: "(2)重要事項説明書(区分所有建物の売買・交換用)", cell: "F486", includes: "取引条件に関する事項" },
    ],
    knownHashPrefixes: ["86755b212806"],
  },
  {
    documentType: "sale_contract_unit_general_seller",
    templateVersion: "sale_contract_unit_general_seller:v1:5_ippan_kubun",
    expectedSheets: ["(10)区分所有建物用売買契約書(一般売主)", "リスト"],
    requiredTitleSignals: [
      { sheetName: "(10)区分所有建物用売買契約書(一般売主)", cell: "B1", includes: "区 分 所 有 建 物 売 買 契 約 書" },
      { sheetName: "(10)区分所有建物用売買契約書(一般売主)", cell: "D8", includes: "売買の目的物の表示" },
      { sheetName: "(10)区分所有建物用売買契約書(一般売主)", cell: "D40", includes: "売買代金、手付金の額及び支払日" },
    ],
    knownHashPrefixes: ["1a3102bf1e3f"],
  },
  {
    documentType: "property_condition_notice_unit",
    templateVersion: "property_condition_notice_unit:v1:kokuchisyo_kubun_2205",
    expectedSheets: ["表紙", "記入にあたって", "告知書"],
    requiredTitleSignals: [
      { sheetName: "表紙", cell: "A1", includes: "物件状況確認書（告知書／区分所有建物用）" },
      { sheetName: "記入にあたって", cell: "B1", includes: "物件状況確認書（告知書／区分所有建物用）" },
      { sheetName: "告知書", cell: "A1", includes: "物件状況確認書（告知書／区分所有建物用）" },
      { sheetName: "告知書", cell: "A5", includes: "雨漏り" },
    ],
    knownHashPrefixes: ["fd32fc69ff67"],
  },
];

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeValue(value: string): string {
  return value.replace(/[　\s]+/g, " ").trim();
}

function getCellText(sheet: XLSX.WorkSheet, cell: string): string {
  const item = sheet[cell];
  return normalizeText(item?.w ?? item?.v ?? "");
}

function getRangeText(sheet: XLSX.WorkSheet, rangeAddress: string): string {
  const range = XLSX.utils.decode_range(rangeAddress);
  const values: string[] = [];
  for (let row = range.s.r; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const text = getCellText(sheet, XLSX.utils.encode_cell({ r: row, c: col }));
      if (text) values.push(text);
    }
  }
  return [...new Set(values)].join(" / ");
}

function evaluateFingerprint(workbook: XLSX.WorkBook, sourceFileHash: string, fingerprint: TemplateFingerprint) {
  const expectedSheetMatches = fingerprint.expectedSheets.filter((sheetName) => workbook.SheetNames.includes(sheetName));
  const titleSignalMatches = fingerprint.requiredTitleSignals.filter((signal) => {
    const sheet = workbook.Sheets[signal.sheetName];
    return sheet ? getCellText(sheet, signal.cell).includes(signal.includes) : false;
  });
  const hashMatched = Boolean(fingerprint.knownHashPrefixes?.some((prefix) => sourceFileHash.startsWith(prefix)));
  const sheetScore = expectedSheetMatches.length / Math.max(1, fingerprint.expectedSheets.length);
  const titleScore = titleSignalMatches.length / Math.max(1, fingerprint.requiredTitleSignals.length);
  const hashScore = hashMatched ? 1 : 0;
  const confidence = Math.min(1, sheetScore * 0.35 + titleScore * 0.5 + hashScore * 0.15);

  return {
    fingerprint,
    expectedSheetMatches,
    titleSignalMatches,
    hashMatched,
    confidence,
    passes: titleScore === 1 && sheetScore >= 0.8,
  };
}

function addCellField(
  fields: ExtractedInputField[],
  context: { sourceFileHash: string; templateVersion: string },
  sheetName: string,
  sheet: XLSX.WorkSheet,
  fieldKey: string,
  label: string,
  sourceCell: string,
  confidence = 0.86
) {
  const value = getCellText(sheet, sourceCell);
  fields.push({
    fieldKey,
    label,
    value,
    normalizedValue: normalizeValue(value),
    sourceSheet: sheetName,
    sourceCell,
    method: "rule",
    confidence,
    reviewStatus: "suggested",
    sourceFileHash: context.sourceFileHash,
    templateVersion: context.templateVersion,
  });
}

function addRangeField(
  fields: ExtractedInputField[],
  context: { sourceFileHash: string; templateVersion: string },
  sheetName: string,
  sheet: XLSX.WorkSheet,
  fieldKey: string,
  label: string,
  sourceRange: string,
  confidence = 0.82
) {
  const value = getRangeText(sheet, sourceRange);
  fields.push({
    fieldKey,
    label,
    value,
    normalizedValue: normalizeValue(value),
    sourceSheet: sheetName,
    sourceRange,
    method: "rule",
    confidence,
    reviewStatus: "suggested",
    sourceFileHash: context.sourceFileHash,
    templateVersion: context.templateVersion,
  });
}

function createResult(
  documentType: InputDocumentType,
  sourceFilename: string,
  sourceFileHash: string,
  templateVersion: string,
  fingerprintConfidence: number,
  detectedSheet: string | undefined,
  detectedTitle: string | undefined,
  fields: ExtractedInputField[]
): InputFileExtractionResult {
  return {
    schemaVersion: "v1",
    documentType,
    documentTypeLabel: DOCUMENT_TYPE_LABEL[documentType],
    extractionStatus: documentType === "unknown_excel" ? "unknown" : "recognized",
    sourceFilename,
    sourceFileHash,
    templateVersion,
    fingerprintConfidence,
    detectedSheet,
    detectedTitle,
    fields,
  };
}

function extractImportantMatters(
  workbook: XLSX.WorkBook,
  sourceFilename: string,
  fingerprint: TemplateFingerprint,
  sourceFileHash: string,
  fingerprintConfidence: number
): InputFileExtractionResult {
  const sheetName = fingerprint.expectedSheets.find((name) => workbook.SheetNames.includes(name)) ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const fields: ExtractedInputField[] = [];
  const context = { sourceFileHash, templateVersion: fingerprint.templateVersion };
  if (!sheet) return createResult("unknown_excel", sourceFilename, sourceFileHash, "unknown", 0, undefined, undefined, fields);

  addCellField(fields, context, sheetName, sheet, "buyer_label", "買主／譲受人", "C6", 0.9);
  addCellField(fields, context, sheetName, sheet, "seller_label", "売主／譲渡人", "AI6", 0.9);
  addRangeField(fields, context, sheetName, sheet, "seller_address", "売主住所", "G35:BS35", 0.72);
  addRangeField(fields, context, sheetName, sheet, "seller_name", "売主氏名", "G36:AV36", 0.72);
  addRangeField(fields, context, sheetName, sheet, "property_name", "不動産名称", "G40:AU40", 0.82);
  addRangeField(fields, context, sheetName, sheet, "residential_address", "住居表示", "F41:BS42", 0.82);
  addRangeField(fields, context, sheetName, sheet, "building_location", "一棟の建物の所在", "G44:BS44", 0.78);
  addRangeField(fields, context, sheetName, sheet, "building_structure", "一棟の建物の構造", "G45:BS45", 0.78);
  addRangeField(fields, context, sheetName, sheet, "broker_a_company_name", "宅地建物取引業者A 商号又は名称", "G14:AE14", 0.76);
  addRangeField(fields, context, sheetName, sheet, "broker_b_company_name", "宅地建物取引業者B 商号又は名称", "AJ14:BS14", 0.76);
  addRangeField(fields, context, sheetName, sheet, "agent_a_name", "説明をする宅地建物取引士A 氏名", "G18:AE18", 0.76);
  addRangeField(fields, context, sheetName, sheet, "transaction_type", "取引態様", "F23:BS23", 0.7);

  return createResult(
    "important_matters_unit_sale",
    sourceFilename,
    sourceFileHash,
    fingerprint.templateVersion,
    fingerprintConfidence,
    sheetName,
    getCellText(sheet, "B2"),
    fields
  );
}

function extractSaleContract(
  workbook: XLSX.WorkBook,
  sourceFilename: string,
  fingerprint: TemplateFingerprint,
  sourceFileHash: string,
  fingerprintConfidence: number
): InputFileExtractionResult {
  const sheetName = fingerprint.expectedSheets.find((name) => workbook.SheetNames.includes(name)) ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const fields: ExtractedInputField[] = [];
  const context = { sourceFileHash, templateVersion: fingerprint.templateVersion };
  if (!sheet) return createResult("unknown_excel", sourceFilename, sourceFileHash, "unknown", 0, undefined, undefined, fields);

  addRangeField(fields, context, sheetName, sheet, "seller_header", "売主ヘッダー", "B5:S5", 0.86);
  addRangeField(fields, context, sheetName, sheet, "buyer_header", "買主ヘッダー", "T5:AL5", 0.86);
  addRangeField(fields, context, sheetName, sheet, "property_name", "建物名称", "E10:BE10", 0.82);
  addRangeField(fields, context, sheetName, sheet, "property_location", "所在", "E11:BE11", 0.82);
  addRangeField(fields, context, sheetName, sheet, "building_structure", "一棟の建物の構造", "E12:AN12", 0.8);
  addRangeField(fields, context, sheetName, sheet, "total_floor_area", "延床面積", "AP12:BE12", 0.78);
  addRangeField(fields, context, sheetName, sheet, "unit_structure", "専有部分の構造", "E16:AA16", 0.78);
  addRangeField(fields, context, sheetName, sheet, "unit_floor_area", "専有部分の床面積", "AP16:BE16", 0.78);
  addRangeField(fields, context, sheetName, sheet, "sale_price_total", "売買代金総額", "R41:BE41", 0.82);
  addRangeField(fields, context, sheetName, sheet, "sale.deposit", "手付金", "R43:BE43", 0.82);
  addRangeField(fields, context, sheetName, sheet, "intermediate_payment_1", "中間金 第1回", "N44:BE44", 0.78);
  addRangeField(fields, context, sheetName, sheet, "intermediate_payment_2", "中間金 第2回", "N45:BE45", 0.78);
  addRangeField(fields, context, sheetName, sheet, "remaining_balance", "残代金", "N46:BE46", 0.82);
  addCellField(fields, context, sheetName, sheet, "remaining_balance_formula_value", "残代金 算定値", "AE46", 0.72);

  return createResult(
    "sale_contract_unit_general_seller",
    sourceFilename,
    sourceFileHash,
    fingerprint.templateVersion,
    fingerprintConfidence,
    sheetName,
    getCellText(sheet, "B1"),
    fields
  );
}

function addQuestionnaireFields(
  fields: ExtractedInputField[],
  context: { sourceFileHash: string; templateVersion: string },
  sheetName: string,
  sheet: XLSX.WorkSheet,
  itemKey: string,
  itemLabel: string,
  ranges: {
    status: string;
    details?: string;
    repair?: string;
    date?: string;
    documents?: string;
  }
) {
  addRangeField(fields, context, sheetName, sheet, `questionnaire.${itemKey}.status`, `${itemLabel}：状況`, ranges.status, 0.84);
  if (ranges.details) {
    addRangeField(fields, context, sheetName, sheet, `questionnaire.${itemKey}.details`, `${itemLabel}：詳細`, ranges.details, 0.8);
  }
  if (ranges.repair) {
    addRangeField(fields, context, sheetName, sheet, `questionnaire.${itemKey}.repair`, `${itemLabel}：修繕履歴`, ranges.repair, 0.78);
  }
  if (ranges.date) {
    addRangeField(fields, context, sheetName, sheet, `questionnaire.${itemKey}.date`, `${itemLabel}：時期`, ranges.date, 0.76);
  }
  if (ranges.documents) {
    addRangeField(fields, context, sheetName, sheet, `questionnaire.${itemKey}.documents`, `${itemLabel}：関連書類`, ranges.documents, 0.76);
  }
}

function extractConditionNotice(
  workbook: XLSX.WorkBook,
  sourceFilename: string,
  fingerprint: TemplateFingerprint,
  sourceFileHash: string,
  fingerprintConfidence: number
): InputFileExtractionResult {
  const sheetName = fingerprint.expectedSheets.find((name) => name === "告知書" && workbook.SheetNames.includes(name)) ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const fields: ExtractedInputField[] = [];
  const context = { sourceFileHash, templateVersion: fingerprint.templateVersion };
  if (!sheet) return createResult("unknown_excel", sourceFilename, sourceFileHash, "unknown", 0, undefined, undefined, fields);

  addRangeField(fields, context, sheetName, sheet, "property_name", "物件名", "M1:W1", 0.84);
  addQuestionnaireFields(fields, context, sheetName, sheet, "rain_leak", "雨漏り", {
    status: "H5:H8",
    details: "O6:W8",
    repair: "H7:P7",
    date: "Q7:S7",
  });
  addQuestionnaireFields(fields, context, sheetName, sheet, "termite", "白蟻被害", {
    status: "H9:H13",
    details: "O11:W13",
    repair: "H10:W12",
    date: "Q10:S12",
  });
  addQuestionnaireFields(fields, context, sheetName, sheet, "building_defect", "建物の不具合", {
    status: "H14:M14",
    details: "G15:W16",
  });
  addQuestionnaireFields(fields, context, sheetName, sheet, "water_supply_drainage", "給排水施設の故障・漏水", {
    status: "H17:M17",
    details: "G18:W19",
  });
  addQuestionnaireFields(fields, context, sheetName, sheet, "renovation_repair", "改築・修繕・リフォーム・用途変更", {
    status: "H20:W20",
    details: "G21:W22",
    date: "S20:U20",
    documents: "G23:W24",
  });
  addQuestionnaireFields(fields, context, sheetName, sheet, "fire_damage", "火災（ボヤ等含む）の被害", {
    status: "H25:J25",
    details: "G26:W27",
    date: "K25:Q25",
  });

  return createResult(
    "property_condition_notice_unit",
    sourceFilename,
    sourceFileHash,
    fingerprint.templateVersion,
    fingerprintConfidence,
    sheetName,
    getCellText(sheet, "A1"),
    fields
  );
}

export function extractInputFileFromWorkbook(
  workbook: XLSX.WorkBook,
  sourceFilename: string,
  sourceFileHash = ""
): InputFileExtractionResult {
  const matches = TEMPLATE_FINGERPRINTS.map((fingerprint) => evaluateFingerprint(workbook, sourceFileHash, fingerprint)).sort(
    (a, b) => b.confidence - a.confidence
  );
  const bestMatch = matches[0];
  if (!bestMatch?.passes) {
    return createResult("unknown_excel", sourceFilename, sourceFileHash, "unknown", bestMatch?.confidence ?? 0, workbook.SheetNames[0], undefined, []);
  }

  if (bestMatch.fingerprint.documentType === "important_matters_unit_sale") {
    return extractImportantMatters(workbook, sourceFilename, bestMatch.fingerprint, sourceFileHash, bestMatch.confidence);
  }
  if (bestMatch.fingerprint.documentType === "sale_contract_unit_general_seller") {
    return extractSaleContract(workbook, sourceFilename, bestMatch.fingerprint, sourceFileHash, bestMatch.confidence);
  }
  return extractConditionNotice(workbook, sourceFilename, bestMatch.fingerprint, sourceFileHash, bestMatch.confidence);
}
