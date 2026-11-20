import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = fs.readFileSync(new URL("../src/lib/japanese-mobile-phone.ts", import.meta.url), "utf8");
const actions = fs.readFileSync(new URL("../src/app/actions.ts", import.meta.url), "utf8");
const clientForm = fs.readFileSync(new URL("../src/components/client-form.tsx", import.meta.url), "utf8");
const partyForm = fs.readFileSync(new URL("../src/components/party-profile-form.tsx", import.meta.url), "utf8");
const overview = fs.readFileSync(new URL("../src/components/case-overview.tsx", import.meta.url), "utf8");
const outputTemplates = fs.readFileSync(new URL("../src/app/settings/output-templates/page.tsx", import.meta.url), "utf8");
const clientsPage = fs.readFileSync(new URL("../src/app/clients/page.tsx", import.meta.url), "utf8");

for (const text of ["normalize(\"NFKC\")", "isJapaneseMobilePhone", "isJapaneseLandlinePhone", "sort((left, right) => right[0].length - left[0].length)"]) {
  assert.ok(source.includes(text), `phone helper must contain ${text}`);
}
assert.match(source, /\["060", "070", "080", "090"\]/);

const module = { exports: {} };
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
Function("module", "exports", output)(module, module.exports);
const {
  formatJapanesePhone,
  formatJapanesePhoneForDisplay,
  isJapaneseLandlinePhone,
  isJapaneseMobilePhone,
  isJapanesePhone,
  isUnchangedLegacyPhone,
  japanesePhoneParts,
  normalizeJapanesePhone,
} = module.exports;

assert.equal(normalizeJapanesePhone("０９０－１２３４－５６７８"), "09012345678");
assert.equal(formatJapanesePhone("０９０１２３４５６７８"), "090-1234-5678");
assert.equal(formatJapanesePhone("03 1234 5678"), "03-1234-5678");
assert.equal(formatJapanesePhone("0921234567"), "092-123-4567");
assert.equal(isJapaneseMobilePhone("090-1234-5678"), true);
assert.equal(isJapaneseMobilePhone("06012345678"), true);
assert.equal(isJapaneseLandlinePhone("03-1234-5678"), true);
assert.equal(isJapaneseLandlinePhone("092-123-4567"), true);
assert.equal(isJapanesePhone("03-1234-5678"), true);
assert.equal(isJapanesePhone("090-1234-5678"), true);
assert.equal(isUnchangedLegacyPhone("+1 212 555 0100", "+1 212 555 0100"), true, "unchanged legacy non-Japanese phone may survive an unrelated edit");
assert.equal(isUnchangedLegacyPhone("+1 212 555 0101", "+1 212 555 0100"), false, "changed legacy phone must not bypass Japanese validation");
assert.equal(isUnchangedLegacyPhone("090-1234-5678", "090-1234-5678"), false, "valid Japanese phone is handled by normal normalization");

// Regression guards for overlapping NTT area-code prefixes. Longest-prefix
// matching must win: 0422 must not be parsed as the shorter 042 family, and
// 09969 must not be parsed as the shorter 099 family.
assert.deepEqual(japanesePhoneParts("0422123456"), ["0422", "12", "3456"]);
assert.equal(formatJapanesePhone("0422123456"), "0422-12-3456");
assert.deepEqual(japanesePhoneParts("0996912345"), ["09969", "1", "2345"]);
assert.equal(formatJapanesePhone("0996912345"), "09969-1-2345");
assert.equal(formatJapanesePhoneForDisplay("0312345678"), "03-1234-5678", "valid stored Japanese phones must be formatted on reopen");
assert.equal(formatJapanesePhoneForDisplay("09012345678"), "090-1234-5678", "valid stored Japanese mobiles must be formatted on reopen");
assert.equal(formatJapanesePhoneForDisplay("+1 212 555 0100"), "+1 212 555 0100", "invalid legacy phone defaults must remain unchanged");

for (const invalid of ["13912345678", "0901234567", "090abc12345678", "0511234567", ""]) {
  assert.equal(isJapanesePhone(invalid), false, `${invalid || "empty"} must be rejected`);
}

for (const [file, expected] of [
  [actions, "isJapanesePhone"],
  [clientForm, "formatJapanesePhone"],
  [clientForm, "formatJapanesePhoneForDisplay"],
  [partyForm, "formatJapanesePhone"],
  [partyForm, "formatJapanesePhoneForDisplay"],
  [overview, "formatJapanesePhone"],
  [overview, "formatJapanesePhoneForDisplay"],
  [outputTemplates, "inputMode=\"tel\""],
  [outputTemplates, "formatJapanesePhoneForDisplay"],
  [clientsPage, "inputMode=\"tel\""],
]) {
  assert.ok(file.includes(expected), `editable contact surface must use ${expected}`);
}
assert.ok(clientForm.includes("export function JapanesePhoneInput"), "quick client registration must use a client-side phone formatter");
assert.ok(clientForm.includes("onInput"), "quick client registration formatter must handle typing and paste input");
assert.ok(clientForm.includes('phone: formatJapanesePhoneForDisplay(defaults.phone ?? "")'), "client phone defaults must format valid stored Japanese values on reopen");
assert.ok(clientForm.includes('employerPhone: formatJapanesePhoneForDisplay(defaults.employerPhone ?? "")'), "employer phone defaults must format valid stored Japanese values on reopen");
assert.ok(clientForm.includes('employerFax: formatJapanesePhoneForDisplay(defaults.employerFax ?? "")'), "employer FAX defaults must format valid stored Japanese values on reopen");
assert.match(clientsPage, /<JapanesePhoneInput[\s\S]*name="phone"/);
assert.match(clientsPage, /name="budgetMax" type="number" min="0" step="1" inputMode="numeric"/);
assert.ok(clientsPage.includes("text.man"), "quick client registration must display the 万円 unit");
assert.match(actions, /employerFax[\s\S]*isJapanesePhone/);
assert.ok(actions.includes("isUnchangedLegacyPhone"), "client edit validation must retain unchanged legacy contact data");
assert.ok(actions.includes("isJapanesePhone(normalizedPhone) ? normalizeJapanesePhone(normalizedPhone) : normalizedPhone"), "unchanged legacy contact values must not be reformatted as Japanese numbers");
assert.doesNotMatch(actions, /isJapaneseMobilePhone\(phone\)/, "party/client server validation must not remain mobile-only");

console.log("client phone contract: PASS (mobile, landline, longest-prefix regression)");
