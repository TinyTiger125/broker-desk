import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve("src/components/quote-form.tsx");
const source = readFileSync(file, "utf8");

assert.match(source, /const handleNumberChange = \(field: keyof QuoteInput\)/, "quote form must centralize numeric input handling");
assert.match(source, /const value = Number\(event\.currentTarget\.value\) \|\| 0;/, "numeric value must be captured before the state updater");
assert.match(source, /setDraft\(\(prev\) => \(\{ \.\.\.prev, \[field\]: value \}\)\);/, "state updater must receive a plain captured number");

for (const field of [
  "listingPrice",
  "brokerageFee",
  "taxFee",
  "otherFee",
  "managementFee",
  "repairFee",
  "downPayment",
  "interestRate",
  "loanYears",
]) {
  assert.match(source, new RegExp(`onChange=\\{handleNumberChange\\(\\"${field}\\"\\)\\}`), `${field} must use the safe numeric handler`);
}

assert.doesNotMatch(source, /setDraft\(\(prev\) => \(\{[^\n]*Number\(event\.currentTarget\.value\)/, "state updater must not read event.currentTarget lazily");
console.log("quote form contract: PASS");
