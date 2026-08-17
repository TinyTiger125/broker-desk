import { readFile } from "node:fs/promises";

const page = await readFile("src/app/parties/page.tsx", "utf8");
const hub = await readFile("src/lib/hub.ts", "utf8");
const failures = [];

function requireText(text, description) {
  if (!page.includes(text)) failures.push(description);
}

function requireHubText(text, description) {
  if (!hub.includes(text)) failures.push(description);
}

function forbidText(text, description) {
  if (page.includes(text)) failures.push(description);
}

// Explicit profile metadata is the only source used by the List Report.
requireText("party.explicitPartyType === \"corporate\"", "corporate type must use explicit metadata");
requireText("party.explicitPartyType === \"individual\"", "individual type must use explicit metadata");
requireText(": notSet", "missing explicit type or role must render the unset label");
requireText("party.explicitRoles.some", "search must use explicit role metadata");
requireHubText("explicitPartyType: profile.type", "hub must expose the explicit party type source");
requireHubText("explicitRoles: profile.role", "hub must expose explicit role metadata");
requireHubText("partyTypeSource", "hub must mark compatibility values separately from explicit values");
requireHubText("rolesSource", "hub must mark compatibility roles separately from explicit values");

// The page must not expose legacy inference, relation counts, second-detail
// state, CSV controls, or output/case actions.
forbidText("party.purpose", "purpose must not drive party list role display");
forbidText("party.stage", "stage must not drive party list role display");
forbidText("focus=", "the List Report must not generate focus URLs");
forbidText("relation=", "the List Report must not generate relation filter URLs");
forbidText("completion", "completion status must not be rendered");
forbidText("contractCount", "contract counts must not be rendered");
forbidText("relatedPropertyHint", "preferred area must not be rendered as a party relation");
forbidText("output-center", "output-center must not be a party list action");
forbidText("/quotes/", "quotation/case actions must not be party list actions");
forbidText("/contracts", "contract actions must not be party list actions");
forbidText("type=\"checkbox\"", "CSV selection checkboxes must be removed");
forbidText("/api/hub/export", "CSV export form must be removed from the page");
forbidText("batchTools", "batch tools must be removed from the page");

// URL and feedback contract.
requireText('name="q"', "search must be submitted as q");
requireText('name="type"', "type must be submitted as type");
requireText('name="lifecycle"', "lifecycle must be submitted as lifecycle");
requireText("page:", "page must be represented in the list URL builder");
requireText("PageFlashBanner message={flashMessage}", "flash must only render as transient feedback");
forbidText('urlParams.set("flash"', "flash must not become a filter URL");

// Main/secondary action hierarchy.
requireText("/parties/${encodeURIComponent(party.id)}/edit", "party name must enter the existing edit page");
requireText("/relationship-tree?type=party&id=", "relationship tree must remain a row-level secondary action");
requireText("<ArchiveRecordButton", "archive/restore must remain available as a secondary lifecycle action");
forbidText("selected", "the page must not maintain a selected detail object");
forbidText("progress", "the page must not render a completion progress indicator");

if (failures.length > 0) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}

console.log("TASK-029 List Report contract checks passed (explicit fields, URL, actions, CSV boundary).");
