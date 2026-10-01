import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const button = read("src/components/ui-foundation/index.tsx");
const css = read("src/app/globals.css");
const pendingForms = [
  "src/components/client-form.tsx",
  "src/components/party-profile-form.tsx",
  "src/components/property-responsive-form.tsx",
  "src/components/preimport-upload-delete.tsx",
  "src/components/invitation-submit-button.tsx",
];

for (const token of ["loading?: boolean", "disabled={disabled || loading}", "aria-busy={loading || undefined}"]) {
  if (!button.includes(token)) throw new Error(`shared Button missing ${token}`);
}
for (const file of pendingForms) {
  if (!read(file).includes("<Button")) throw new Error(`${file} must use shared Button feedback`);
}
for (const token of ["button:not(:disabled):active", "button:focus-visible", "prefers-reduced-motion: reduce"]) {
  if (!css.includes(token)) throw new Error(`global button feedback missing ${token}`);
}
console.log("Action feedback contract: PASS");
