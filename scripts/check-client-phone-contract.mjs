import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/lib/japanese-mobile-phone.ts", import.meta.url), "utf8");
const actions = fs.readFileSync(new URL("../src/app/actions.ts", import.meta.url), "utf8");
const partyForm = fs.readFileSync(new URL("../src/components/party-profile-form.tsx", import.meta.url), "utf8");
assert.match(source, /normalize\("NFKC"\)/);
assert.match(source, /\["060", "070", "080", "090"\]/);
assert.match(source, /\\d\{11\}/);

const normalizeJapaneseMobilePhone = (value) => value.normalize("NFKC").replace(/[()\-\s]/g, "");
const formatJapaneseMobilePhone = (value) => {
  const digits = normalizeJapaneseMobilePhone(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};
const isJapaneseMobilePhone = (value) => {
  const digits = normalizeJapaneseMobilePhone(value);
  return /^\d{11}$/.test(digits) && ["060", "070", "080", "090"].some((prefix) => digits.startsWith(prefix));
};

assert.equal(normalizeJapaneseMobilePhone("０９０－１２３４－５６７８"), "09012345678");
assert.equal(formatJapaneseMobilePhone("０９０１２３４５６７８"), "090-1234-5678");
assert.equal(formatJapaneseMobilePhone("090123456789"), "090-1234-56789");
assert.equal(isJapaneseMobilePhone("090-1234-5678"), true);
assert.equal(isJapaneseMobilePhone("06012345678"), true);
assert.equal(isJapaneseMobilePhone("13912345678"), false);
assert.equal(isJapaneseMobilePhone("0901234567"), false);
assert.equal(isJapaneseMobilePhone("090123456789"), false);
assert.equal(isJapaneseMobilePhone("090abc12345678"), false);
assert.equal(isJapaneseMobilePhone(""), false);
assert.match(actions, /function parsePartyProfileForm[\s\S]*isJapaneseMobilePhone\(phone\)/, "party creation must reject non-Japanese mobile numbers");
assert.match(actions, /function parsePartyUpdateForm[\s\S]*isJapaneseMobilePhone\(phone\)/, "party editing must reject non-Japanese mobile numbers");
assert.match(partyForm, /formatJapaneseMobilePhone\(event\.target\.value\)/, "party phone entry must use the shared 3-4-4 formatter");
console.log("client phone contract: PASS");
