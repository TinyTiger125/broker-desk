import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const clientForm = read("src/components/client-form.tsx");
const organizePage = read("src/app/organize-center/page.tsx");
const objectBrowser = read("src/components/organize-center-object-browser.tsx");

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

const titleLink = objectBrowser.match(/<Link\s+href=\{itemHref\}[\s\S]*?<\/Link>/)?.[0] ?? "";
assert(titleLink.includes("w-full") && titleLink.includes("cursor-pointer"), "title link fills the left cell and exposes a pointer target");
assert(titleLink.includes("{item.subtitle}"), "title link includes the surrounding title-cell content");
assert(!titleLink.includes("ArchiveRecordButton"), "archive action remains outside the title link");
assert(objectBrowser.includes("<ArchiveRecordButton"), "archive action remains rendered independently");
assert(objectBrowser.includes("getRelatedObjectUi"), "case relationship rows use a stable type-to-color mapping");
assert(objectBrowser.includes("relatedObjects?.length"), "case relationship rows render separately from generic relation text");
assert(objectBrowser.includes("bg-emerald-50 text-emerald-700") && objectBrowser.includes("bg-violet-50 text-violet-700"), "person/property relationship rows retain recent-entry colors");

console.log("feedback 2 forms/list contract: PASS");
