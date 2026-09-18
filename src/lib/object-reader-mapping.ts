import type { ExtractedInputField } from "@/lib/input-file-extractor";
import { selectSingleObjectReaderCandidates } from "@/lib/object-reader-attribution";
import type { ObjectReaderCandidate } from "@/lib/object-reader-contract";

const FIELD_LABELS: Record<string, string> = {
  "property.name": "物件名",
  "property.roomNumber": "部屋番号・号室",
  "property.postalCode": "物件郵便番号",
  "property.address": "物件所在地",
  "property.usage": "物件用途",
  "lease.contractType": "契約形態",
  "lease.contractStartDate": "契約期間開始日",
  "lease.contractEndDate": "契約期間終了日",
  "lease.moveInDate": "入居予定日",
  "lease.rent": "賃料・家賃",
  "lease.commonFee": "共益費・管理費",
  "lease.parkingFee": "駐車場代",
  "lease.waterTownFee": "水道料・町費",
  "lease.otherMonthlyFee": "その他月額費用",
  "lease.monthlyRentTotal": "月額賃料合計",
  "lease.deposit": "敷金・保証金",
  "lease.keyMoney": "礼金",
  "lease.insuranceFee": "保険料",
  "lease.keyExchangeFee": "鍵交換代",
  "lease.cancellationDeduction": "敷引・解約引",
  "lease.initialCostTotal": "初回費用合計",
  "lease.paymentMethod": "賃料支払方法",
  "lease.rentPaymentDay": "賃料支払日",
};

export type ObjectReaderMappingDecision = {
  fieldKey: ObjectReaderCandidate["fieldKey"];
  action: "suggest" | "preserve_existing";
  value?: string;
  uncertainty: ObjectReaderCandidate["uncertainty"];
  sourceRange: string;
};

export type ObjectReaderMappingResult = {
  status: "mapped" | "ambiguous_objects" | "no_object";
  decisions: ObjectReaderMappingDecision[];
  preservedFieldKeys: string[];
};

function hasValue(field?: ExtractedInputField) {
  return Boolean(field?.normalizedValue?.trim() || field?.value?.trim());
}

/**
 * Returns reviewable suggestions only. It never writes facts and never lets a
 * deterministic parser bypass attribution blocking.
 */
export function mapObjectReaderCandidates(input: {
  candidates: ObjectReaderCandidate[];
  existingFields?: ExtractedInputField[];
}): ObjectReaderMappingResult {
  const attribution = selectSingleObjectReaderCandidates(input.candidates);
  if (attribution.status !== "single_object") {
    return { status: attribution.status, decisions: [], preservedFieldKeys: [] };
  }
  const existing = new Map(input.existingFields?.map((field) => [field.fieldKey, field]) ?? []);
  const decisions: ObjectReaderMappingDecision[] = [];
  const preservedFieldKeys: string[] = [];
  for (const candidate of attribution.candidates) {
    if (!FIELD_LABELS[candidate.fieldKey] || candidate.uncertainty === "not_found" || !candidate.value) continue;
    const sourceRange = `page ${candidate.pageNumber}; evidence=${candidate.sourceText}; uncertainty=${candidate.uncertainty}`;
    const current = existing.get(candidate.fieldKey);
    if (hasValue(current)) {
      preservedFieldKeys.push(candidate.fieldKey);
      decisions.push({ fieldKey: candidate.fieldKey, action: "preserve_existing", uncertainty: candidate.uncertainty, sourceRange });
      continue;
    }
    decisions.push({ fieldKey: candidate.fieldKey, action: "suggest", value: candidate.value, uncertainty: candidate.uncertainty, sourceRange });
  }
  return { status: "mapped", decisions, preservedFieldKeys };
}

export { FIELD_LABELS as OBJECT_READER_FIELD_LABELS };
