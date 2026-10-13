import { readFile } from "node:fs/promises";

const read = (file) => readFile(file, "utf8");
const [properties, partyForm, partyEdit, actions, caseManager, caseDraft] = await Promise.all([
  read("src/app/properties/page.tsx"),
  read("src/components/party-profile-form.tsx"),
  read("src/app/parties/[id]/edit/page.tsx"),
  read("src/app/actions.ts"),
  read("src/components/case-association-manager.tsx"),
  read("src/components/case-association-draft.tsx"),
]);

const failures = [];
const requireText = (source, text, description) => {
  if (!source.includes(text)) failures.push(description);
};
const forbidText = (source, text, description) => {
  if (source.includes(text)) failures.push(description);
};

// FB16: the live table keeps the action track readable and scrollable inside the shell.
requireText(properties, 'className="overflow-x-auto"', "properties results need an overflow container");
requireText(properties, 'className="w-full min-w-0"', "properties table must use the available desktop width");
if ((properties.match(/minmax\(7rem,auto\)/g) ?? []).length !== 2) failures.push("properties header and rows must reserve the same action track");
if ((properties.match(/minmax\(10rem,1\.4fr\)_minmax\(5\.5rem,\.8fr\)_minmax\(7rem,1fr\)_minmax\(6rem,\.8fr\)_minmax\(6rem,\.8fr\)_minmax\(5\.5rem,\.6fr\)_minmax\(7rem,auto\)/g) ?? []).length !== 2) failures.push("properties header and rows must share the compact desktop geometry");
requireText(properties, 'min-w-28 whitespace-nowrap text-right', "properties action header must stay on one line");
requireText(properties, 'min-w-28 items-center justify-start gap-2 whitespace-nowrap', "properties action cells must keep the archive label readable");
requireText(properties, "<ArchiveRecordButton", "properties must retain the existing archive action");

// FB17: person editing owns contact facts; case association owns case-specific roles.
for (const token of ['label("partyRole"', 'fieldProps("partyRole")', 'name="partyRole"']) {
  forbidText(partyForm, token, `party edit form must not expose ${token}`);
}
requireText(partyForm, 'label("partyType"', "party edit form must retain the independent party type");
requireText(partyForm, 'fieldProps("partyType")', "party edit form must submit the independent party type");
const editableDefaults = partyEdit.split("<ClientForm", 1)[0] + partyEdit.slice(partyEdit.indexOf("<ClientForm"));
forbidText(editableDefaults, "partyRole: meta.role", "editable party defaults must not carry the case role");
requireText(partyEdit, "partyMeta={{ type: meta.type }}", "shared party/client form must retain the independent party type");
requireText(partyEdit, "partyMeta={{ type: meta.type }}", "read-only party view must retain the independent type value");
forbidText(partyEdit, "partyRole: meta.role", "read-only party view must not present case-specific role metadata as a global profile field");

const updateAction = actions.slice(actions.indexOf("export async function updatePartyProfileAction"));
requireText(actions, 'const metadataSubmitted = formData.has("partyType") || formData.has("partyRole")', "update parser must detect legacy metadata payloads");
requireText(updateAction, "extractPartyProfileFromNotes(existing.notes)", "legacy metadata updates must fall back to stored values");
requireText(updateAction, ": existing.notes", "role-free saves must preserve existing notes");
requireText(updateAction, "mergePartyProfileMetadataNotes", "legacy metadata updates must use the safe metadata merge");
requireText(updateAction, 'formData.has("partyType") ? payload.normalized.partyType : existingMeta.type', "an explicit empty party type must clear instead of falling back");
requireText(updateAction, 'formData.has("partyRole") ? payload.normalized.partyRole : existingMeta.role', "an explicit empty party role must clear instead of falling back");

for (const [source, label] of [[caseManager, "case association manager"], [caseDraft, "case association draft"]]) {
  requireText(source, "CASE_PERSON_ROLES", `${label} must expose the case role set`);
  requireText(source, "selectedRoles", `${label} must support multiple selected roles`);
  requireText(source, "roles", `${label} must persist roles with the association`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}

console.log("FB16/17 feedback contract checks passed (property action layout, role-free party edit, legacy preservation, and case-role ownership).");
