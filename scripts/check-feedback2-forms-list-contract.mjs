import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const clientForm = read("src/components/client-form.tsx");
const organizePage = read("src/app/organize-center/page.tsx");
const objectBrowser = read("src/components/organize-center-object-browser.tsx");
const archiveButton = read("src/components/archive-record-button.tsx");
const listReturnState = read("src/components/list-return-state.tsx");

const assert = (condition, message) => {
  if (!condition) throw new Error(`feedback 2 forms/list contract failed: ${message}`);
};

assert((clientForm.match(/<ClientFormSection section=/g) ?? []).length === 6, "client form keeps six peer sections");
assert(clientForm.includes("basic: true, profile: true, needs: true, management: true, legal: true, notes: true"), "client sections default to expanded");
assert(clientForm.includes("onInvalidCapture={handleInvalid}"), "native invalid fields open their section");
assert(clientForm.includes("openSectionForField(field)"), "error-summary field links reopen their section");
assert(clientForm.includes("aria-expanded={expanded}"), "client section controls expose their expanded state");
assert(clientForm.includes("className={expanded ? \"\" : \"hidden\"}"), "collapsed client section content remains mounted but hidden");

for (const [label, empty] of [
  ["希望エリア", "未入力"],
  ["意向区域", "未填写"],
  ["희망 지역", "미입력"],
]) {
  assert(organizePage.includes(`relationParty: "${label}"`), `person relation label is ${label}`);
  assert(organizePage.includes(`noRelation: "${empty}"`), `empty person relation label is ${empty}`);
}
assert(organizePage.includes("relation: item.relatedPropertyHint || copy.noRelation"), "person value still comes from the existing preferred-area projection");
for (const label of ["利用先", "使用位置", "사용 위치"]) assert(organizePage.includes(`relationProperty: "${label}"`), `property relation label remains ${label}`);
assert(organizePage.includes("relatedObjects: resolution.outcome === \"company_read\" ? undefined"), "case relationships use an explicit related-object projection");
assert(organizePage.includes('casePartyLabel: "人物"') && organizePage.includes('casePropertyLabel: "物件"'), "case relationship labels remain explicit in Chinese/Japanese UI copy");

assert(!/<Link\s+href=\{itemHref\}/.test(objectBrowser), "organize rows must not create a competing nested title link");
assert((objectBrowser.match(/data-list-return-trigger=\{`\$\{item\.type\}:\$\{item\.id\}`\}/g) ?? []).length === 1, "each row must expose one stable return/focus target");
assert(objectBrowser.includes('data-list-return-trigger={`${item.type}:${item.id}`}'), "the row itself must be the stable return/focus target");
assert(objectBrowser.includes("hover:bg-[#e8efff]") && objectBrowser.includes("focus-visible:bg-[#e8efff]"), "row hover and focus must visibly highlight the whole row");
assert(objectBrowser.includes("focus-visible:shadow-[inset_3px_0_0_#3158d8]"), "focused row must have a distinct focus marker");
assert(objectBrowser.includes("{item.subtitle}"), "row target includes the surrounding subtitle content");
assert(objectBrowser.includes("<ArchiveRecordButton"), "archive action remains rendered independently");
assert(archiveButton.includes("data-list-row-ignore"), "archive hint remains outside row navigation");
assert(archiveButton.includes("event.stopPropagation()"), "archive action must not activate row navigation");
assert(listReturnState.includes('if (event.target.closest("[data-list-row-ignore]")) return;'), "ignored row content must not write a return intent after row navigation is skipped");
assert(objectBrowser.includes("getRelatedObjectUi"), "case relationship rows use a stable type-to-color mapping");
assert(objectBrowser.includes("relatedObjects?.length"), "case relationship rows render separately from generic relation text");
assert(objectBrowser.includes("bg-emerald-50 text-emerald-700") && objectBrowser.includes("bg-violet-50 text-violet-700"), "person/property relationship rows retain recent-entry colors");

console.log("feedback 2 forms/list contract: PASS");
