import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const componentPath = new URL("../src/components/home-module-preferences.tsx", import.meta.url);
const pagePath = new URL("../src/app/page.tsx", import.meta.url);
const component = await readFile(componentPath, "utf8");
const page = await readFile(pagePath, "utf8");

assert.match(component, /^"use client";/, "preferences must be a client component");
assert.match(component, /localStorage\.getItem\(storageKey\)/, "preferences load from the supplied storage key");
assert.match(component, /localStorage\.setItem\(storageKey, JSON\.stringify\(\{ order, hidden \}\)\)/, "preferences persist under the same key");
assert.match(component, /loadedStorageKey !== storageKey/, "a changed user or tenant key must block stale writes");
assert.match(component, /setOrder\(DEFAULT_ORDER\);\s*setHidden\(\[\]\)/, "restore defaults clears both order and hidden state");
assert.match(component, /visibleModules\.length > 0/, "all-hidden state must render a recoverable empty state");
assert.match(component, /work-card-pair/, "adjacent today and waiting cards must share the default two-column group");
assert.doesNotMatch(component, /appendChild|querySelector\(/, "module order must remain declarative React output");

for (const id of ["today", "waiting", "agenda", "weekly", "recent"]) {
  assert.match(page, new RegExp(`<HomeModule id="${id}">`), `home page must expose ${id} as an independent preference module`);
}
assert.match(page, /storageKey=\{`bd-home-preferences:\$\{session\.user\.id\}:\$\{session\.tenant\.id\}`\}/, "preferences must be isolated per user and tenant");
assert.match(page, /model\.truncated \|\| importJobs\.length > 8 \?/, "status warning must remain visible outside the preference child filter");

console.log("home-module-preferences: PASS");
