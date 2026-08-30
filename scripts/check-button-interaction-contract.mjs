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
expect(globals.includes('data-bd-button-surface="editor"'), "Business button appearance must explicitly preserve specialist editor controls.");
expect(globals.includes("font-size: var(--bd-text-sm)"), "Business buttons must use the shared 14px text token.");
expect(globals.includes("font-weight: var(--bd-weight-medium)"), "Business buttons must use the shared 600 weight token.");
expect(globals.includes("border-radius: var(--bd-radius-md)"), "Business buttons must use the shared 8px radius token.");
expect(globals.includes("min-height: var(--bd-control-height-regular)"), "Business buttons must provide the regular 40px control size.");
expect(globals.includes("min-height: var(--bd-control-height-touch)"), "Business buttons must preserve the 44px touch size.");
expect(foundation.includes("transform 150ms ease-out"), "Foundation buttons must use the shared motion timing.");
expect(foundationComponent.includes('aria-busy={loading || undefined}'), "Foundation buttons must announce loading state.");
expect(read("src/components/official-template-save-button.tsx").includes('data-bd-button-appearance="status"'), "Stateful save feedback must retain its status colors.");

for (const editorSource of [
  "src/components/pdfme-official-template-designer.tsx",
  "src/components/friends-guarantee-calibration-preview.tsx",
  "src/app/guarantee-g1-slice1/client.tsx",
].map(read)) {
  expect(editorSource.includes('data-bd-button-surface="editor"'), "Specialist editor controls must opt out of business button geometry.");
}

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
