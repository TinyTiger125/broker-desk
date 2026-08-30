import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const globals = read("src/app/globals.css");
const foundation = read("src/components/ui-foundation/ui-foundation.module.css");
const foundationComponent = read("src/components/ui-foundation/index.tsx");
const representativeAsyncButtons = [
  "src/app/templates/template-copy-button.tsx",
  "src/components/case-workbench-field-rules-settings.tsx",
  "src/components/case-workbench-field-form.tsx",
].map(read);
const specializedAsyncButtons = [
  "src/components/input-extraction-review.tsx",
  "src/components/official-template-save-button.tsx",
].map(read);

expect(globals.includes("@media (hover: hover) and (pointer: fine)"), "Global buttons must expose hover feedback only on fine pointers.");
expect(globals.includes("scale(0.98)"), "Global buttons must expose a pressed-state scale change.");
expect(globals.includes('button[aria-busy="true"]'), "Global buttons must expose a busy state.");
expect(globals.includes("@media (prefers-reduced-motion: reduce)"), "Global button motion must respect reduced-motion preferences.");
expect(foundation.includes("transform 150ms ease-out"), "Foundation buttons must use the shared motion timing.");
expect(foundationComponent.includes('aria-busy={loading || undefined}'), "Foundation buttons must announce loading state.");

for (const source of representativeAsyncButtons) {
  expect(source.includes("<Button"), "Representative async submit controls must use the foundation Button.");
  expect(source.includes("loading={pending}"), "Representative async submit controls must lock and announce pending state.");
  expect(source.includes('aria-live="polite"'), "Representative async submit controls must announce label feedback.");
}

for (const source of specializedAsyncButtons) {
  expect(source.includes("aria-busy={pending || undefined}"), "Specialized async submit controls must announce pending state.");
  expect(source.includes('aria-live="polite"'), "Specialized async submit controls must announce label feedback.");
}

if (failures.length > 0) {
  console.error("Button interaction contract failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Button interaction contract passed.");
