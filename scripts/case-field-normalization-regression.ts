import { clearCaseFieldValueAliases, getCaseFieldValue } from "../src/lib/case-field-normalization";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const confirmedData: Record<string, unknown> = {
  property_name: "抽出キー物件レジデンス",
  room_number: "202",
  broker_a_company_name: "抽出仲介株式会社",
};

assert(
  getCaseFieldValue(confirmedData, "property.name") === "抽出キー物件レジデンス",
  "raw property_name alias should be readable before clearing",
);

confirmedData["property.name"] = "修正後物件名";
assert(getCaseFieldValue(confirmedData, "property.name") === "修正後物件名", "non-empty edit should prefer canonical value");

clearCaseFieldValueAliases(confirmedData, "property.name");
assert(getCaseFieldValue(confirmedData, "property.name") === "", "cleared canonical field must not revive raw property_name alias");
assert(!("property_name" in confirmedData), "raw property_name alias should be removed from confirmed data");
assert(!("property.name" in confirmedData), "canonical property.name should be removed from confirmed data");
assert(getCaseFieldValue(confirmedData, "property.roomNumber") === "202", "clearing property.name should not clear room number");
assert(
  getCaseFieldValue(confirmedData, "broker.companyName") === "抽出仲介株式会社",
  "clearing property.name should not clear unrelated broker alias",
);

clearCaseFieldValueAliases(confirmedData, "broker.companyName");
assert(getCaseFieldValue(confirmedData, "broker.companyName") === "", "cleared broker field must not revive broker_a_company_name alias");

console.log("[PASS] case field alias clearing regression");
