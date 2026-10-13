import { readFile } from "node:fs/promises";

const profile = await readFile("src/lib/party-profile.ts", "utf8");
const action = await readFile("src/app/actions.ts", "utf8");
const createPage = await readFile("src/app/parties/new/page.tsx", "utf8");
const editPage = await readFile("src/app/parties/[id]/edit/page.tsx", "utf8");
const form = await readFile("src/components/client-form.tsx", "utf8");
const attachmentDisclosure = await readFile("src/components/party-attachment-disclosure.tsx", "utf8");
const failures = [];

function requireText(source, text, description) {
  if (!source.includes(text)) failures.push(description);
}
function forbidText(source, text, description) {
  if (source.includes(text)) failures.push(description);
}

// New uses the shared client form; editing is the only place for the legacy party profile form.
requireText(createPage, "createClientFormAction", "new page must use the shared client create action");
requireText(createPage, "<ClientForm", "new page must render the shared client form");
forbidText(createPage, "PartyProfileForm", "new page must not render the legacy party profile form");

// Party editing reuses the complete client/profile form and has one primary submit.
requireText(editPage, "<ClientForm", "edit page must use the shared complete profile form");
forbidText(editPage, "PartyProfileForm", "edit page must not render the legacy incomplete party form");
requireText(editPage, '<PartyAttachmentDisclosure label={text.attachments} initialOpen={query.flash === "object_attachment_uploaded"}>', "party attachments must open after a successful upload");
requireText(editPage, "<ObjectAttachmentSection", "party attachments must remain available from the compact header entry");
requireText(attachmentDisclosure, "absolute left-0 top-full", "party attachment management must be positioned as a compact disclosure");
requireText(editPage, 'listClassName="max-h-[60vh] overflow-y-auto"', "party attachment lists must scroll within a bounded panel");
requireText(attachmentDisclosure, 'event.key !== "Escape"', "party attachment disclosure must close on Escape");
requireText(attachmentDisclosure, "summaryRef.current?.focus()", "party attachment disclosure must return focus to its trigger");
requireText(attachmentDisclosure, 'document.addEventListener("pointerdown"', "party attachment disclosure must close on outside pointer down");
requireText(form, "useActionState", "edit form must preserve structured action state");
if ((form.match(/<Button type="submit"/g) ?? []).length !== 1) failures.push("edit form must have exactly one submit button");
requireText(form, "role=\"alert\"", "edit form must expose a focusable error summary");
requireText(form, "summaryRef.current?.focus()", "error summary must receive focus after validation failure");
requireText(form, "aria-describedby", "field errors must be associated with inputs");
requireText(form, "onCompositionStart", "IME composition guard must exist as a code mechanism");
forbidText(form, "FormDraftAssist", "party form must not use draft assist");
forbidText(form, "relationHint", "party form must not edit relation hints");
forbidText(form, "name=\"note\"", "party form must not edit notes");
forbidText(form, 'label("partyRole"', "party edit form must not edit the party role");
forbidText(form, 'fieldProps("partyRole")', "party edit form must not submit the party role");
forbidText(form, 'name=\"partyRole\"', "party edit form must not submit the party role");
requireText(form, 'fieldProps("partyType")', "the shared profile form must expose optional party type");
requireText(form, "partyTypeUnset", "party type must support an explicit unset value");

// The update path must only materialize explicit type/role metadata and preserve client facts.
requireText(action, "mergePartyProfileNotes", "unified client updates must use the safe metadata merge");
requireText(action, "partyTypeSubmitted", "unified updates must distinguish optional party type from omitted legacy payloads");
requireText(action, "existingProfile.role", "role metadata must be preserved when editing the unified profile");
requireText(action, "existing.notes", "role-free updates must preserve existing notes");
requireText(action, "purpose: existing.purpose", "update must preserve customer purpose");
requireText(action, "preferredArea: existing.preferredArea", "update must preserve customer area");
forbidText(action.slice(action.indexOf("export async function updatePartyProfileAction")), "inferPurposeFromPartyRole", "party update must not infer customer purpose");
forbidText(action.slice(action.indexOf("export async function updatePartyProfileAction")), "relationHint", "party update must not accept relation hints");
requireText(profile, "Object.values(labelKeys[kind])", "metadata merge must recognize all localized type/role labels");
requireText(profile, "if (!seen.has(kind))", "duplicate metadata rows must collapse to one row");
requireText(profile, "if (replacement[kind]) result.push(replacement[kind]!)", "unset metadata must not add a replacement row");
requireText(profile, "result.unshift(...missing.map", "missing metadata must be inserted deterministically");
for (const label of ["関係者種別", "主体类型", "관계자 유형", "役割", "主体角色", "역할"]) requireText(profile, label, `localized metadata label ${label} must be recognized`);
for (const preserved of ["status", "備考", "备注", "메모"]) requireText(profile, preserved, `non-editable notes category ${preserved} must remain represented`);

// ReturnTo is a strict same-tenant navigation contract.
requireText(profile, "normalizePartyReturnTo", "party returnTo must have a shared normalizer");
requireText(profile, 'parsed.pathname === "/parties"', "returnTo must whitelist the parties list");
requireText(profile, 'parsed.pathname === "/organize-center"', "returnTo must whitelist the approved organize entry");
requireText(profile, '"q", "type", "lifecycle", "page"', "returnTo must only keep approved query keys");
forbidText(profile, "/import-center", "party returnTo must reject import-center");
forbidText(action.slice(action.indexOf("export async function updatePartyProfileAction")), "?focus=", "party update must not restore focus selection URLs");
requireText(action, 'redirect(withFlash(`/parties/${encodeURIComponent(clientId)}/edit?returnTo=', "update must stay on the edit page after save");
requireText(action, 'parsed.pathname === "/parties"', "party form returnTo must preserve the parties list");

if (failures.length > 0) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}

console.log("TASK-033 party form contract checks passed (shared client create route, role-free party edit, legacy metadata preservation, errors, and returnTo).");
