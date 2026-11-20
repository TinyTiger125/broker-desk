import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const read = (path) => readFileSync(path, "utf8");
const task = read("docs/tasks/TASK-050.md");
const form = read("src/components/client-form.tsx");
const options = read("src/lib/options.ts");
const domain = read("src/lib/domain.ts");
const entryPreview = read("src/components/entry-preview.tsx");
const entryPicker = read("src/components/entry-file-picker.tsx");
const caseWorkbench = read("src/components/case-workbench-field-form.tsx");
const caseOverview = read("src/components/case-overview.tsx");
const propertyForm = read("src/components/property-responsive-form.tsx");
const outputTemplatesPage = read("src/app/settings/output-templates/page.tsx");
const editPage = read("src/app/clients/[id]/edit/page.tsx");
const newPage = read("src/app/clients/new/page.tsx");
const clientsPage = read("src/app/clients/page.tsx");
const backToParent = read("src/components/back-to-parent.tsx");
const entryActions = read("src/app/entry-actions.ts");
const casePage = read("src/app/cases/[id]/page.tsx");
const memory = read("src/lib/data.memory.ts");
const postgres = read("src/lib/data.postgres.ts");
const schema = read("docs/engineering/postgres_schema.sql");
const migration = read("db/migrations/20261120_001_client_employer_fax.sql");

function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

function forbidText(source, text, message) {
  if (source.includes(text)) throw new Error(message);
}

requireText(task, "BD-1119-IMPLEMENT-20261120", "task card must bind the implementation workId");
requireText(task, "src/data/japan-postal-code-index.ts", "task card must include the deployable official postal artifact");
requireText(task, "db/migrations/20261120_001_client_employer_fax.sql", "task card must include the unexecuted FAX migration artifact");
requireText(task, "【売買】", "task card must use the approved fullwidth transaction labels");
requireText(task, "【賃貸】", "task card must use the approved fullwidth rental labels");
requireText(task, "严格写集", "task card must make the bounded write set reviewable");
requireText(task, "case-association-manager.tsx", "task card must record the inline association callback compatibility surface");
requireText(task, "entry-file-picker.tsx", "task card must record the compact entry picker surface");
requireText(task, "settings/output-templates/page.tsx", "task card must record the editable issuer phone surface");
requireText(task, "back-to-parent.tsx", "task card must record the global direct-parent navigation surface");
requireText(task, "entry-actions.ts", "task card must record the entry redirect return-context surface");

for (const value of ["unspecified", "sale_residential", "sale_investment", "rent_residential", "rent_tenant", "rent_monthly"]) {
  requireText(domain, `"${value}"`, `purpose option ${value} must remain in the domain set`);
}
for (const label of ["未定", "【売買】居住用", "【売買】投資用", "【賃貸】住居", "【賃貸】テナント", "【賃貸】マンスリー", "【売買】購入総額", "【売買】月額ローン返済", "【賃貸】月額家賃"]) {
  requireText(options, label, `approved Japanese option label missing: ${label}`);
}
requireText(domain, 'export const BUDGET_TYPES = ["total_price", "monthly_payment", "monthly_rent"]', "budget type domain must contain exactly three current values");
requireText(options, "createOptions(PURPOSES", "purpose UI options must derive from the exact domain set");
requireText(options, "createOptions(BUDGET_TYPES", "budget UI options must derive from the exact domain set");

const resetEffect = entryPreview.slice(entryPreview.indexOf("  useEffect(() =>"), entryPreview.indexOf("  const read = () =>"));
requireText(entryPreview, "onClick={read}", "entry reading must have an explicit button trigger");
requireText(entryPreview, "animate-spin", "entry reading must expose a visible pending animation");
requireText(entryPreview, "compact?: boolean", "entry preview must support the compact combined layout");
requireText(entryPicker, "compact?: boolean", "entry picker must support the compact combined layout");
requireText(entryPreview, "先に資料を選択してください。", "entry reading must report missing files without a server call");
forbidText(resetEffect, "read()", "file selection reset effect must not trigger document reading");
requireText(form, "<EntryFilePicker", "customer form must keep the entry picker");
requireText(form, "<EntryPreview", "customer form must keep the entry preview");
requireText(form, "compact />", "customer entry controls must use the compact layout");
requireText(propertyForm, "compact />", "property entry controls must use the compact layout");
requireText(caseWorkbench, "formatJapanesePhone", "inline case workbench must format phone input on the client");
requireText(caseWorkbench, "normalizePhoneInput", "inline case workbench must normalize both input and change events");
requireText(caseOverview, "formatJapanesePhone(event.currentTarget.value)", "case overview phone fields must format on input");
requireText(outputTemplatesPage, 'name="phone" type="tel"', "issuer phone input must use telephone input semantics");

requireText(form, 'type="hidden" name={field} value={values[field]}', "removed customer fields must remain in the submitted compatibility payload");
for (const field of ["preferredArea", "loanPreApprovalStatus", "annualIncomeAsOf", "annualIncomeSource"]) requireText(form, `"${field}"`, `removed customer field ${field} must remain in the compatibility payload`);
forbidText(form, '<ClientFormSection section="legal"', "legal section must be removed from the customer UI");
requireText(form, "filled: number", "customer section counts must be visible in the component contract");
requireText(form, "total: number", "customer section totals must be visible in the component contract");

requireText(editPage, "const returnTo = normalizeReturnTo(query.returnTo, client.id, query.flash)", "edit page must use one validated return parent");
requireText(editPage, "query.flash", "client-created edit redirects must choose the list as their direct parent when no context is supplied");
requireText(editPage, 'Link href={returnTo}', "edit header back link must use the validated parent");
requireText(newPage, "normalizeReturnTo", "new client page must validate returnTo");
requireText(newPage, 'normalizeImportCenterObjectReturnTo(path, "person", true)', "new client page must preserve an approved import-center parent");
requireText(clientsPage, 'name="phone" inputMode="tel" autoComplete="tel"', "quick client registration must expose a telephone input");
requireText(clientsPage, "<JapanesePhoneInput", "quick client registration must format phone input while typing or pasting");
requireText(clientsPage, 'name="budgetMax" type="number" min="0" step="1" inputMode="numeric"', "quick client registration must accept integer budget 万円");
requireText(clientsPage, "text.man", "quick client registration must display the budget 万円 unit");
requireText(casePage, "有効な日本の携帯電話または市外局番付きの固定電話", "case route error copy must match the shared Japanese phone rule");
requireText(backToParent, "normalizeClientEditReturnTo", "global navigation must share client-edit return-context validation");
requireText(backToParent, 'searchParams.get("returnTo")', "global navigation must consume the validated edit return context");
requireText(backToParent, 'searchParams.get("flash")', "global navigation must recognize the client-created direct-parent fallback");
requireText(entryActions, "normalizeEntryReturnTo", "entry completion must validate and preserve the direct parent");
requireText(entryActions, 'params.set("returnTo", parentReturnTo)', "entry completion must carry the direct parent into the edit URL");

const normalizeReturnToStart = editPage.indexOf("function normalizeReturnTo");
const normalizeReturnToEnd = editPage.indexOf("\n\nexport default", normalizeReturnToStart);
if (normalizeReturnToStart < 0 || normalizeReturnToEnd < 0) throw new Error("edit page direct-parent normalizer must remain isolated for regression testing");
const editReturnModule = { exports: {} };
Function("module", "exports", "normalizeImportCenterObjectReturnTo", ts.transpileModule(
  `${editPage.slice(normalizeReturnToStart, normalizeReturnToEnd)}\nmodule.exports = normalizeReturnTo;`,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText)(editReturnModule, editReturnModule.exports, (value, object, allowBare) => {
  if (value === "/import-center" && allowBare) return value;
  return value === `/import-center?advanced=1&object=${object}` ? value : null;
});
const normalizeEditReturnTo = editReturnModule.exports;
assert.equal(normalizeEditReturnTo(undefined, "client-1", "client_created"), "/clients", "post-create edit without returnTo must return to the client menu");
assert.equal(normalizeEditReturnTo("/clients?stage=lead", "client-1", "client_created"), "/clients?stage=lead", "post-create edit must keep the originating client menu filter");
assert.equal(normalizeEditReturnTo(undefined, "client-1"), "/clients/client-1", "ordinary edit without context must keep the client detail parent");

const backSourceStart = backToParent.indexOf("const labels =");
const backSourceEnd = backToParent.indexOf("\nexport function BackToParent", backSourceStart);
if (backSourceStart < 0 || backSourceEnd < 0) throw new Error("global direct-parent resolver must remain isolated for regression testing");
const backModule = { exports: {} };
Function("module", "exports", "normalizeImportCenterObjectReturnTo", ts.transpileModule(
  `${backToParent.slice(backSourceStart, backSourceEnd)}\nmodule.exports = { resolveParent };`,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText)(backModule, backModule.exports, (value, object, allowBare) => {
  if (value === "/import-center" && allowBare) return value;
  return value === `/import-center?advanced=1&object=${object}` ? value : null;
});
const globalParent = backModule.exports.resolveParent;
assert.equal(globalParent("/clients/client-1/edit", new URLSearchParams("flash=client_created")).href, "/clients", "global parent link must match the post-create edit parent");
assert.equal(globalParent("/clients/client-1/edit", new URLSearchParams("returnTo=%2Fclients%3Fstage%3Dlead&flash=client_created")).href, "/clients?stage=lead", "global parent link must match the originating filtered client menu");

const entrySourceStart = entryActions.indexOf("const ENTRY_RETURN_ORIGIN =");
const entrySourceEnd = entryActions.indexOf("\nasync function prepareUploads", entrySourceStart);
if (entrySourceStart < 0 || entrySourceEnd < 0) throw new Error("entry return normalizer must remain isolated for regression testing");
const entryModule = { exports: {} };
Function("module", "exports", "normalizeImportCenterObjectReturnTo", ts.transpileModule(
  `${entryActions.slice(entrySourceStart, entrySourceEnd)}\nmodule.exports = normalizeEntryReturnTo;`,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText)(entryModule, entryModule.exports, (value, object, allowBare) => {
  if (value === "/import-center" && allowBare) return value;
  return value === `/import-center?advanced=1&object=${object}` ? value : null;
});
const normalizeEntryReturnTo = entryModule.exports;
assert.equal(normalizeEntryReturnTo("/clients?stage=lead", "party"), "/clients?stage=lead", "entry completion must preserve the originating client menu");
assert.equal(normalizeEntryReturnTo("https://attacker.invalid/clients", "party"), null, "entry completion must reject external return targets");

for (const source of [memory, postgres]) requireText(source, "employerFax", "client persistence path must carry employerFax");
requireText(postgres, "employer_fax", "PostgreSQL persistence must map employer_fax");
requireText(schema, "employer_fax TEXT", "schema artifact must declare employer_fax");
requireText(migration, "ADD COLUMN IF NOT EXISTS employer_fax TEXT", "migration artifact must add employer_fax");
requireText(migration, "Unexecuted candidate", "migration artifact must be explicitly unexecuted");
forbidText(migration, "node scripts/run-postgres-migrations", "implementation must not execute the migration from its artifact");

console.log("TASK-050 report1119 contract passed (bounded UI, option sets, explicit reading, return paths, and FAX persistence artifact)");
