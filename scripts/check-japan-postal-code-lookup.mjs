import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const root = process.cwd();
const source = readFileSync(join(root, "src/lib/japan-postal-code.ts"), "utf8");
const artifact = readFileSync(join(root, "src/data/japan-postal-code-index.ts"), "utf8");
const syncScript = readFileSync(join(root, "scripts/sync-japan-postal-codes.mjs"), "utf8");
const route = readFileSync(join(root, "src/app/api/postal-codes/lookup/route.ts"), "utf8");
const clientForm = readFileSync(join(root, "src/components/client-form.tsx"), "utf8");
const propertyForm = readFileSync(join(root, "src/components/property-responsive-form.tsx"), "utf8");
const caseForm = readFileSync(join(root, "src/components/case-workbench-field-form.tsx"), "utf8");
const actions = readFileSync(join(root, "src/app/actions.ts"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const officialSource = "https://www.post.japanpost.jp/service/search/zipcode/download/utf/zip/utf_ken_all.zip";
assert(artifact.includes(officialSource), "generated artifact must record the official Japan Post source URL");
assert(syncScript.includes(officialSource), "sync script must use the official Japan Post source URL");
assert(/Generated at: \d{4}-\d{2}-\d{2}T/.test(artifact), "generated artifact must record a generation timestamp");
const count = Number(artifact.match(/Postal-code entries: (\d+)/)?.[1] ?? 0);
assert(count >= 100_000, `generated artifact must contain nationwide-scale data, found ${count}`);
assert(artifact.includes("JAPAN_POSTAL_CODE_INDEX_GZIP_BASE64"), "artifact must carry compressed deployable lookup data");
assert(artifact.includes('format: "gzip+base64"'), "artifact must record its compressed encoding");
assert(source.includes("JAPAN_POSTAL_CODE_INDEX_GZIP_BASE64"), "lookup module must consume the compressed deployable artifact");
assert(source.includes("gunzipSync") && source.includes("Buffer.from"), "lookup module must inflate the compressed artifact server-side");
const payloadMatch = artifact.match(/export const JAPAN_POSTAL_CODE_INDEX_GZIP_BASE64 = \[\n([\s\S]*?)\n\]\.join\(""\);/);
assert(payloadMatch, "artifact must expose a bounded base64 chunk list");
const payloadBase64 = [...payloadMatch[1].matchAll(/"([A-Za-z0-9+/=]+)"/g)].map((match) => match[1]).join("");
let inflatedPayload;
try {
  inflatedPayload = gunzipSync(Buffer.from(payloadBase64, "base64")).toString("utf8");
} catch (error) {
  throw new Error(`compressed postal artifact must decompress: ${error instanceof Error ? error.message : String(error)}`);
}
const inflatedIndex = JSON.parse(inflatedPayload);
assert(Object.keys(inflatedIndex).length === count, "compressed artifact entry count must match its metadata");
assert(inflatedIndex["1000001"]?.[0]?.prefecture === "東京都", "compressed artifact must retain a known official entry");
assert(source.includes("JAPAN_POSTAL_CODE_INDEX_METADATA"), "lookup module must consume artifact metadata");
assert(source.includes("keys.length === JAPAN_POSTAL_CODE_INDEX_METADATA.postalCodeCount"), "lookup module must reject a truncated index artifact");
assert(source.includes("Array.isArray(index[postalCode])"), "lookup module must reject malformed postal-code entries");
assert(!source.includes('"1540024"'), "lookup module must not rely on a Tokyo-only fallback seed");
assert(!source.includes("FALLBACK_POSTAL"), "lookup module must not silently fall back to a local seed");
assert(source.includes('source: "japan_post_official"'), "lookup result must identify the official source");

for (const pair of [
  '["client.currentPostalCode", "client.currentAddress"]',
  '["property.postalCode", "property.address"]',
  '["applicant.currentPostalCode", "applicant.currentAddress"]',
  '["applicant.employerPostalCode", "applicant.employerAddress"]',
  '["guarantor.postalCode", "guarantor.address"]',
  '["emergencyContact.postalCode", "emergencyContact.address"]',
]) assert(source.includes(pair), `postal completion must cover ${pair}`);

assert(route.includes('error: "postal_code_index_unavailable"'), "API must expose an explicit unavailable-index error");
assert(route.includes("status: 503"), "API must return 503 when the deployable index is missing or corrupt");
assert(route.includes('error: "postal_code_not_found"'), "API must distinguish a valid but unknown postal code");
assert(clientForm.includes("/api/postal-codes/lookup"), "client form must request postal lookup on blur");
assert(propertyForm.includes("/api/postal-codes/lookup"), "property form must request postal lookup on blur");
assert(caseForm.includes("isValidJapanesePostalCode") && caseForm.includes('data-case-validation="japanese-postal-code"'), "case workbench must validate editable postal fields");
assert(actions.includes("applyJapanesePostalCodeAddressCompletions"), "server save paths must apply shared postal completion");
assert(actions.includes('"property.postalCode": values.postalCode.trim()'), "property save path must pass postal code through the official completion helper");
assert(actions.includes('"client.currentPostalCode": normalizedCurrentPostalCode'), "client save path must pass postal code through the official completion helper");
assert(source.includes("startsWith(fullPrefix)") && source.includes("startsWith(administrativePrefix)"), "manual address details must be preserved when already prefixed");
assert(source.includes('statusMap[addressFieldKey] = "needs_review"'), "conflicting manual addresses must be marked for review");

console.log(`[PASS] Japan postal code lookup contract (${count} official entries, deployable artifact, explicit failure)`);
