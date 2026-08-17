import { readFile } from "node:fs/promises";

const page = await readFile("src/app/properties/page.tsx", "utf8");
const hub = await readFile("src/lib/hub.ts", "utf8");
const memory = await readFile("src/lib/data.memory.ts", "utf8");
const postgres = await readFile("src/lib/data.postgres.ts", "utf8");
const failures = [];

function requireText(source, text, description) {
  if (!source.includes(text)) failures.push(description);
}

function forbidText(source, text, description) {
  if (source.includes(text)) failures.push(description);
}

// The list adapter must carry the saved area value through both repositories.
requireText(memory, "area: item.area ?? null", "memory listQuoteFormData must return the saved area value");
requireText(postgres, "SELECT id, name, area, listing_price", "PostgreSQL properties list must select area");
requireText(postgres, "area: row.area != null ? String(row.area) : null", "PostgreSQL list mapping must preserve an empty area");
requireText(hub, "const propertyArea = typeof property.area === \"string\"", "hub must read area from the adapter");
forbidText(hub, 'property.name.includes("区")', "area must not be inferred from a property name");

// The page is a single List Report and must not expose the retired dashboard.
requireText(page, 'pageTitle: "物件"', "page identity must be an independent property title");
requireText(page, 'name="q"', "property search must use q");
requireText(page, 'name="lifecycle"', "lifecycle must be a URL filter");
requireText(page, 'name="sort"', "sort must be a URL filter");
requireText(page, 'lifecycleStatus: "all"', "the page must read all lifecycle records before filtering");
requireText(page, "const lifecycleFiltered = lifecycle === \"all\"", "lifecycle filtering must happen after the all-record read");
requireText(page, "properties.length === 0 ? copy.noProperties : copy.noResult", "empty copy must distinguish all-record empty from filtered empty");
requireText(page, "buildPropertiesHref", "page links must preserve filter and page context");
requireText(page, 'href="/properties/new"', "new property must be the only primary create route");
requireText(page, "/properties/${encodeURIComponent(property.id)}/edit", "property name must enter the existing edit page");
requireText(page, "<ArchiveRecordButton", "archive and restore must remain row-level risk actions");
requireText(page, 'role="table"', "results must expose a complete table role");
requireText(page, 'role="rowgroup"', "results must expose table rowgroups");
requireText(page, 'role="row"', "results must expose table rows");
requireText(page, 'role="columnheader"', "desktop results must expose column headers");
requireText(page, 'role="cell"', "results must expose table cells");
requireText(page, "<span role=\"columnheader\">{copy.area}</span>", "desktop results must label the area column");
requireText(page, "property.managementFeeValue", "the page must preserve a null fee as distinct from zero");
requireText(page, "property.repairFeeValue", "the page must preserve a null repair fee as distinct from zero");
requireText(page, "property.listingPrice > 0 ?", "non-positive listing prices must render as unset");
requireText(page, "value === null ? notSet", "null fees must render as unset while zero remains a value");
requireText(page, "property.status === \"archived\"", "lifecycle labels must use the saved active/archived states");
requireText(page, "lg:hidden", "mobile rows must retain inline field labels");

for (const [text, description] of [
  ["createPropertyQuickAction", "quick create must not be called from the List Report"],
  ["FormDraftAssist", "quick-create draft assistance must not be on the List Report"],
  ["propertyCovers", "random cover images must be removed"],
  ["/api/hub/export", "CSV export must be removed from the page"],
  ["type=\"checkbox\"", "CSV selection checkboxes must be removed"],
  ["output-center", "output links must stay outside the property list"],
  ["relationship-tree", "relationship actions must stay outside the property list"],
  ["focusId", "the page must not maintain a selected focus object"],
  ["selectedProperty", "the page must not render a second selected detail"],
  ["completion", "completion algorithms must be removed"],
  ["portfolio", "portfolio KPI/dashboard language must be removed"],
  ["min-w-[1080px]", "the page must not force a horizontal desktop table"],
  ["<ul className=\"divide-y divide-slate-200/80\"", "the results must not retain an incomplete list/table hybrid"],
]) {
  forbidText(page, text, description);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}

console.log("TASK-030 List Report contract checks passed (area chain, null values, lifecycle, structure, and boundaries).");
