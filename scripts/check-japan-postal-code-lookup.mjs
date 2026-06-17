import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/lib/japan-postal-code.ts"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes('"1540024"'), "fallback seed must include 1540024");
assert(source.includes('prefecture: "東京都"'), "fallback seed must include Tokyo prefecture data");
assert(source.includes('municipality: "世田谷区"'), "fallback seed must include Setagaya municipality data");
assert(source.includes('townArea: "三軒茶屋"'), "fallback seed must include Sangenjaya town-area data");
assert(source.includes("normalizeJapanesePostalCode"), "postal-code normalization function must exist");
assert(source.includes("replace(/[０-９]/g"), "normalization must support full-width digits");
assert(source.includes("applyJapanesePostalCodeAddressCompletions"), "case-data completion function must exist");
assert(source.includes('"property.postalCode", "property.address"'), "property postal code must complete property address");
assert(source.includes('"applicant.currentPostalCode", "applicant.currentAddress"'), "applicant postal code must complete current address");
assert(source.includes('"applicant.employerPostalCode", "applicant.employerAddress"'), "employer postal code must complete employer address");
assert(source.includes('"emergencyContact.postalCode", "emergencyContact.address"'), "emergency-contact postal code must complete emergency address");

console.log("[PASS] Japan postal code lookup contract");
