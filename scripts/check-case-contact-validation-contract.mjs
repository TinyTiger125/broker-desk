import { readFileSync } from "node:fs";

const validation = readFileSync("src/lib/case-contact-validation.ts", "utf8");
const actions = readFileSync("src/app/actions.ts", "utf8");
const form = readFileSync("src/components/case-workbench-field-form.tsx", "utf8");
const overview = readFileSync("src/components/case-overview.tsx", "utf8");

if (!validation.includes("digits.length >= 7 && digits.length <= 15")) throw new Error("phone validation must bound digit count");
if (!validation.includes("^[^\\s@]+@[^\\s@.]+(?:\\.[^\\s@.]+)+$")) throw new Error("email validation must require a domain");
if (!validation.includes("＋()（）\\-\\s")) throw new Error("phone validation must allow Japanese business punctuation");
if (!validation.includes('fieldKey.endsWith(".fax")')) throw new Error("fax fields must share phone validation");
if (!validation.includes('if (!normalized) return null')) throw new Error("empty contact values must remain clearable");
if (!actions.includes("getCaseContactValidationError")) throw new Error("server save action must validate contact fields");
if (!actions.includes('flash", "case_field_invalid"')) throw new Error("invalid contact values must return the existing invalid-field flash");
if (!actions.includes("delete existingStatusMap[fieldKey]")) throw new Error("clearing a contact value must not leave a confirmed-empty status");
if (!form.includes('input[data-case-field-kind="tel"]')) throw new Error("client form must validate phone inputs before submit");
if (!overview.includes("data-case-contact-validation-message")) throw new Error("contact inputs must expose localized validation copy");

console.log("Case contact validation contract passed");
