import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

const preview = await source("src/components/entry-preview.tsx");
assert.match(preview, /onLocateCandidate\?: \(candidate: EntryPreviewCandidate\) => void/);
assert.match(preview, /onClick=\{\(\) => onLocateCandidate\(candidate\)\}/);
assert.match(preview, /read: "读取"/);

for (const path of [
  "src/components/client-form.tsx",
  "src/components/property-responsive-form.tsx",
  "src/components/case-association-draft.tsx",
]) {
  const text = await source(path);
  assert.match(text, /onLocateCandidate=\{locateEntryCandidate\}/, `${path} must expose candidate field location`);
}
const caseDraft = await source("src/components/case-association-draft.tsx");
assert.match(caseDraft, /id=\{`case-\$\{field\.fieldKey\}`\}/);
assert.match(caseDraft, /target\?\.closest\("details"\)\?\.setAttribute\("open", ""\)/);
assert.match(caseDraft, /existingCaseHint:/);
assert.doesNotMatch(caseDraft, /识别完成后/);
const propertyImport = await source("src/components/property-object-import-section.tsx");
assert.doesNotMatch(propertyImport, /资料解析|자료 분석|資料解析/);

for (const path of [
  "src/app/clients/page.tsx",
  "src/app/properties/page.tsx",
  "src/app/parties/page.tsx",
]) {
  const text = await source(path);
  assert.match(text, /data-list-row-link=/, `${path} must expose whole-row navigation`);
  assert.match(text, /tabIndex=\{0\}/, `${path} row must be focusable`);
}
for (const path of ["src/app/properties/page.tsx", "src/app/parties/page.tsx"]) {
  const text = await source(path);
  assert.match(text, /data-list-row-return-trigger=/, `${path} must preserve row return intent identity`);
}
const listReturn = await source("src/components/list-return-state.tsx");
assert.match(listReturn, /data-list-row-link/);
assert.match(listReturn, /root\.addEventListener\("keydown", activateRowByKeyboard\)/);
assert.match(listReturn, /event\.key !== "Enter" && event\.key !== " "/);
const clientsReturn = await source("src/app/clients/clients-list-return-state.tsx");
assert.match(clientsReturn, /data-list-row-link/);
assert.match(clientsReturn, /keydown/);

const identity = await source("src/components/client-identity-import-section.tsx");
assert.match(identity, /add: "读取新资料"/);
assert.match(identity, /这里只读取身份证明资料/);
assert.match(identity, /accept="application\/pdf,image\/png,image\/jpeg,\.pdf,\.png,\.jpg,\.jpeg"/);
const upload = await source("src/components/object-import-upload.tsx");
assert.match(upload, /accept = "application\/pdf,image\/png,image\/jpeg,\.pdf,\.png,\.jpg,\.jpeg,\.xlsx"/);
const archive = await source("src/components/archive-record-button.tsx");
assert.match(archive, /archiveHint:/);
assert.match(archive, /tone=\{isArchived \? "quiet" : "warning"\}/);
assert.match(archive, /後で復元できます|之后仍可恢复|나중에 복원할 수 있습니다/);

for (const path of [
  "src/app/organize-center/page.tsx",
  "src/app/properties/page.tsx",
  "src/app/parties/page.tsx",
]) {
  const text = await source(path);
  assert.match(text, /activeRecords:|active: "(未保管|未归档|使用中|사용 중)/, `${path} must define explicit active lifecycle copy`);
}

const newCase = await source("src/app/case-entry-actions.ts");
for (const value of ["rental_application", "rental_mandate", "sale_mandate", "quote_preparation", "contract_preparation"]) {
  assert.match(newCase, new RegExp(`"${value}"`), `${value} remains supported`);
}

console.log("feedback remediation UI contract: PASS");
