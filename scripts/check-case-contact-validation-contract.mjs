import { readFileSync } from "node:fs";

const validation = readFileSync("src/lib/case-contact-validation.ts", "utf8");
const actions = readFileSync("src/app/actions.ts", "utf8");
const form = readFileSync("src/components/case-workbench-field-form.tsx", "utf8");
const overview = readFileSync("src/components/case-overview.tsx", "utf8");

function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

requireText(validation, "isJapanesePhone", "case phone validation must use the shared Japanese mobile/landline validator");
requireText(validation, "normalizeCasePhoneValue", "case contact validation must expose a shared phone formatter");
requireText(validation, "^[^\\s@]+@[^\\s@.]+(?:\\.[^\\s@.]+)+$", "email validation must require a domain");
requireText(validation, 'fieldKey.endsWith(".fax")', "fax fields must share phone validation");
requireText(validation, "if (!normalized) return null", "empty contact values must remain clearable");
requireText(actions, "getCaseContactValidationError", "server save action must validate contact fields");
requireText(actions, 'flash", "case_field_invalid"', "invalid contact values must return the existing invalid-field flash");
requireText(actions, "delete existingStatusMap[fieldKey]", "clearing a contact value must not leave a confirmed-empty status");
requireText(form, 'input[data-case-field-kind="tel"], input[data-case-field-kind="email"]', "client form must validate phone and email inputs before submit");
requireText(form, "getCaseContactValidationError(fieldKey, input.value, \"ja\")", "client validation must use the shared contact validator");
requireText(overview, "data-case-contact-validation-message", "contact inputs must expose localized validation copy");
requireText(overview, "formatJapanesePhone", "case overview phone inputs must format mobile and landline values");

console.log("Case contact validation contract passed");
