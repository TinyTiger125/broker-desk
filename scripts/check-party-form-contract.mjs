import { readFile } from "node:fs/promises";

const profile = await readFile("src/lib/party-profile.ts", "utf8");
const action = await readFile("src/app/actions.ts", "utf8");
const createPage = await readFile("src/app/parties/new/page.tsx", "utf8");
const editPage = await readFile("src/app/parties/[id]/edit/page.tsx", "utf8");
const form = await readFile("src/components/party-profile-form.tsx", "utf8");
const failures = [];

function requireText(source, text, description) {
  if (!source.includes(text)) failures.push(description);
}
function forbidText(source, text, description) {
  if (source.includes(text)) failures.push(description);
}

// New is an honest system state: no form and no create action call.
forbidText(createPage, "createPartyProfileAction", "new page must not reference the party create action");
forbidText(createPage, "PartyProfileForm", "new page must not render a party form");
forbidText(createPage, "<form", "new page must contain zero form submissions");
forbidText(createPage, "searchParams", "new page must not turn name/from/flash query values into facts");
requireText(createPage, "独立した関係者の作成は現在利用できません", "new page must explain the data-model boundary");

// Edit is the only form and has one primary submit.
requireText(editPage, "PartyProfileForm", "edit page must use the shared responsive form");
requireText(form, "useActionState", "edit form must preserve structured action state");
if ((form.match(/<button type="submit"/g) ?? []).length !== 1) failures.push("edit form must have exactly one submit button");
requireText(form, "role=\"alert\"", "edit form must expose a focusable error summary");
requireText(form, "summaryRef.current?.focus()", "error summary must receive focus after validation failure");
requireText(form, "aria-describedby", "field errors must be associated with inputs");
requireText(form, "onCompositionStart", "IME composition guard must exist as a code mechanism");
forbidText(form, "FormDraftAssist", "party form must not use draft assist");
forbidText(form, "relationHint", "party form must not edit relation hints");
forbidText(form, "name=\"note\"", "party form must not edit notes");
requireText(form, "text.shared", "edit form must explain shared customer facts");
requireText(form, 'option value="">{text.unset}</option>', "missing metadata must remain unset");

// The update path must only materialize explicit type/role metadata and preserve client facts.
requireText(action, "mergePartyProfileMetadataNotes", "update must use the safe metadata merge");
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

if (failures.length > 0) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}

console.log("TASK-033 party form contract checks passed (system state, safe metadata merge, protected client facts, errors, and returnTo).");
