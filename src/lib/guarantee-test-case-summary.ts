import { getCaseFieldValue } from "@/lib/case-field-normalization";
import type { BrokerageCase } from "@/lib/data.memory";

export type GuaranteeTestCaseSummary = {
  id: string;
  title: string;
  customerDisplayName: string;
  managementNumber: string;
  textValue: string;
  dateValue: string;
};

function readOptionalValue(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

export function toGuaranteeTestCaseSummary(item: BrokerageCase): GuaranteeTestCaseSummary {
  const data = item.confirmedDataJson;
  const customerDisplayName = getCaseFieldValue(data, "applicant.name") || getCaseFieldValue(data, "tenant.name") || "未填写";
  const textValue = customerDisplayName;
  const dateValue = getCaseFieldValue(data, "applicant.birthDate") || getCaseFieldValue(data, "lease.moveInDate") || "未填写";
  const managementNumber = readOptionalValue(data, [
    "case.managementNumber",
    "case.managementNo",
    "managementNumber",
    "management_no",
    "caseNumber",
    "recordNumber",
  ]) || "未设置";
  return {
    id: item.id,
    title: item.caseTitle,
    customerDisplayName,
    managementNumber,
    textValue,
    dateValue,
  };
}
