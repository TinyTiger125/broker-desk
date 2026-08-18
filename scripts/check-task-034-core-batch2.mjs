import { readFile } from "node:fs/promises";

const pages = {
  cases: await readFile("src/app/cases/new/page.tsx", "utf8"),
  board: await readFile("src/components/board-kanban.tsx", "utf8"),
  relationships: await readFile("src/app/relationship-tree/page.tsx", "utf8"),
};

const failures = [];
const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};
const forbidText = (source, text, message) => {
  if (source.includes(text)) failures.push(message);
};

requireText(pages.cases, "createBlankBrokerageCaseAction", "cases/new must keep the existing single create action");
requireText(pages.cases, 'name="primaryPartyId"', "cases/new must keep tenant-scoped party selection");
requireText(pages.cases, 'name="primaryPropertyId"', "cases/new must keep tenant-scoped property selection");
requireText(pages.cases, 'type="submit"', "cases/new must keep one form submit");
for (const forbidden of ["FormDraftAssist", "parties/new", "properties/new", "createParty", "createProperty"]) {
  forbidText(pages.cases, forbidden, `cases/new must not retain non-form entry ${forbidden}`);
}

requireText(pages.board, "fetch(`/api/clients/${clientId}/stage`", "board must keep the existing stage PATCH");
requireText(pages.board, "grid-cols-1", "board must have a narrow single-column layout");
requireText(pages.board, "sm:grid-cols-2", "board must remain readable at tablet width");
for (const forbidden of ["min-w-[1120px]", "overflow-x-auto"]) {
  forbidText(pages.board, forbidden, `board must not force a desktop-width canvas: ${forbidden}`);
}

requireText(pages.relationships, "primaryPropertyId", "relationship explorer must use explicit case property links");
requireText(pages.relationships, "__primaryPartyId", "relationship explorer must use explicit case party links");
requireText(pages.relationships, "sourceImportJobIds", "relationship explorer must preserve explicit source links");
requireText(pages.relationships, "targetType === rootType", "relationship explorer must use explicit attachment targets");
requireText(pages.relationships, "item.clientId === selectedParty.id", "relationship explorer must use direct party contract links");
for (const forbidden of ["includesLoose", "relatedPropertyHint", "listHubGeneratedOutputs", "output-center", "?focus=", "statusClass", "complete", "insufficient", "unconfirmed", "cases[0]", "parties[0]", "properties[0]"]) {
  forbidText(pages.relationships, forbidden, `relationship explorer must not use inferred or pseudo relationship state: ${forbidden}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}
console.log("TASK-034 batch 2 contract checks passed (case form, responsive board, explicit relationship explorer).");
