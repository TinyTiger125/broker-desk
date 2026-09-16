import assert from "node:assert/strict";

function resolveSubmittedValue(formData, fieldKey) {
  const raw = String(formData.get(`field:${fieldKey}`) ?? "").trim();
  if (raw) return raw;
  return String(formData.get("fieldValueSnapshot") ?? "").trim();
}

const nonEmpty = new FormData();
nonEmpty.set("field:applicant.mobilePhone", "0300000006");
nonEmpty.set("fieldValueSnapshot", "0300000006");
assert.equal(resolveSubmittedValue(nonEmpty, "applicant.mobilePhone"), "0300000006");

const remounted = new FormData();
remounted.set("field:applicant.mobilePhone", "");
remounted.set("fieldValueSnapshot", "0300000006");
assert.equal(resolveSubmittedValue(remounted, "applicant.mobilePhone"), "0300000006");

const explicitClear = new FormData();
explicitClear.set("field:applicant.mobilePhone", "");
explicitClear.set("fieldValueSnapshot", "");
assert.equal(resolveSubmittedValue(explicitClear, "applicant.mobilePhone"), "");

console.log("inline field payload behavior: PASS (visible value, remount snapshot, and explicit clear)");
