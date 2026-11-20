import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const form = readFileSync("src/components/client-form.tsx", "utf8");
const action = readFileSync("src/app/actions.ts", "utf8");
const createPage = readFileSync("src/app/clients/new/page.tsx", "utf8");
const editPage = readFileSync("src/app/clients/[id]/edit/page.tsx", "utf8");
const detailPage = readFileSync("src/app/clients/[id]/page.tsx", "utf8");
const state = readFileSync("src/lib/client-form-state.ts", "utf8");
const money = readFileSync("src/lib/client-money.ts", "utf8");
const domain = readFileSync("src/lib/domain.ts", "utf8");
const options = readFileSync("src/lib/options.ts", "utf8");
const associationManager = readFileSync("src/components/case-association-manager.tsx", "utf8");
const importCenterReturnSource = readFileSync("src/lib/import-center-return.ts", "utf8");

function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

function forbidText(source, text, message) {
  if (source.includes(text)) throw new Error(message);
}

for (const heading of [
  'basic: "基本情報"',
  'profile: "本人資料"',
  'needs: "希望条件"',
  'management: "顧客管理"',
  'notes: "備考"',
]) requireText(form, heading, `client form must keep ${heading}`);

for (const label of ['氏名（ABC）', '種別', '勤務先FAX', '万円']) {
  requireText(form, label, `client form must expose the revised label ${label}`);
}

requireText(form, 'type="hidden" name={field} value={values[field]}', "legacy customer fields must be submitted as hidden compatibility values");
for (const field of ["preferredArea", "loanPreApprovalStatus", "annualIncomeAsOf", "annualIncomeSource", "brokerageContractType"]) {
  requireText(form, `"${field}"`, `legacy field ${field} must remain in the compatibility payload`);
}
requireText(form, "preserveClientIndividualFieldsOnCorporateValidation", "corporate validation must preserve omitted individual drafts");
requireText(form, "setValues((current) => preserveClientIndividualFieldsOnCorporateValidation", "validation must merge the preserved corporate draft back into the form");
requireText(form, "filled: number", "collapsible section headings must receive filled counts");
requireText(form, "total: number", "collapsible section headings must receive total counts");
requireText(form, "sectionCounts", "client form must compute section counts from live values");
requireText(form, "isClientFormFieldCounted(field, values[field], mode, touchedFields)", "section counts must exclude untouched new-form sentinels while counting live values");
requireText(form, "setTouchedFields", "section counts must recognize an explicit user selection of a sentinel option");
requireText(form, 'aria-expanded={expanded}', "section controls must expose their expanded state");
requireText(form, 'className={expanded ? "mt-3" : "hidden"}', "collapsed sections must keep their fields mounted");
requireText(form, 'role="alert"', "form must expose a focusable error summary");
requireText(form, "aria-describedby", "field errors must be associated with fields");
requireText(form, "onCompositionStart", "IME composition guard must exist");
requireText(form, "basic: Boolean(baseInitial.phone || baseInitial.lineId || baseInitial.email)", "basic client section must open only when basic fields contain values");
requireText(form, "profile: Boolean(baseInitial", "profile client section must open when existing values contain data");
requireText(form, "onInvalidCapture={handleInvalid}", "native invalid fields must reopen their containing section");
requireText(form, "openSectionForField(field)", "error links must reopen their containing section");
requireText(form, 'step={annualIncomeIsLegacyDecimal ? "any" : "1"}', "legacy annual income must remain browser-valid while unchanged");
requireText(form, 'step={budgetMinIsLegacyDecimal ? "any" : "1"}', "legacy minimum budget must remain browser-valid while unchanged");
requireText(form, 'step={budgetMaxIsLegacyDecimal ? "any" : "1"}', "legacy maximum budget must remain browser-valid while unchanged");
requireText(form, "legacyMoneyHint", "legacy non-integer yen amounts must explain the unchanged/edit rule");
for (const field of ["legacyAnnualIncomeYen", "legacyBudgetMinYen", "legacyBudgetMaxYen"]) forbidText(form, `name=\"${field}\"`, `client form must not submit an untrusted ${field} hidden baseline`);
requireText(form, "text.man", "money fields must display 万円");
requireText(form, "/api/postal-codes/lookup", "client postal input must use the official lookup route");
requireText(form, "onBlur={() => void lookupCurrentPostalCode()}", "client postal lookup must be explicit on blur");
requireText(form, "postalLookupNotFound", "client postal lookup must expose a clear not-found state");
requireText(form, "postalLookupUnavailable", "client postal lookup must expose an unavailable-index state");
requireText(form, "formatJapanesePhone", "client phone fields must use the shared mobile/landline formatter");
requireText(form, 'getPurposeOptions(locale, mode === "edit" ? values.purpose : undefined)', "purpose options must expose a selected legacy value only while editing that record");
requireText(form, 'name="purposeTouched"', "purpose edit intent must be explicit so an untouched legacy value cannot be overwritten by stale browser state");

const copyStart = form.indexOf("const copy =");
const copyEnd = form.indexOf("} as const;", copyStart);
const copySource = form.slice(copyStart, copyEnd);
for (const locale of ["ja", "zh", "ko"]) {
  const start = copySource.indexOf(`${locale}: {`);
  if (start < 0) throw new Error(`client form must define ${locale} locale copy`);
  const next = ["ja", "zh", "ko"]
    .filter((candidate) => candidate !== locale)
    .map((candidate) => copySource.indexOf(`${candidate}: {`, start + 1))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? copySource.length;
  const block = copySource.slice(start, next);
  for (const key of ["basic", "profile", "needs", "management", "notes", "name", "nameLatin", "nameKanji", "nameKatakana", "partyType", "employerFax", "budgetType", "purpose", "man", "save", "cancel"]) {
    if (!new RegExp(`\\b${key}:`).test(block)) throw new Error(`${locale} ClientForm copy must retain ${key}`);
  }
}
const exactCopy = {
  ja: { basic: "基本情報", profile: "本人資料", needs: "希望条件", management: "顧客管理", notes: "備考", name: "顧客名", nameLatin: "氏名（ABC）", partyType: "種別", employerFax: "勤務先FAX", phone: "電話番号", man: "万円", budgetType: "予算タイプ", purpose: "用途", save: "保存", cancel: "キャンセル" },
  zh: { basic: "基本信息", profile: "个人资料", needs: "需求条件", management: "客户管理", notes: "备注", name: "客户姓名", nameLatin: "姓名（拉丁字母）", partyType: "主体类型", employerFax: "工作单位传真", phone: "电话号码", man: "万日元", budgetType: "预算类型", purpose: "用途", save: "保存", cancel: "取消" },
  ko: { basic: "기본 정보", profile: "개인 자료", needs: "희망 조건", management: "고객 관리", notes: "메모", name: "고객명", nameLatin: "이름（라틴 문자）", partyType: "주체 유형", employerFax: "근무처 팩스", phone: "전화번호", man: "만 엔", budgetType: "예산 유형", purpose: "용도", save: "저장", cancel: "취소" },
};
for (const [locale, messages] of Object.entries(exactCopy)) {
  const start = copySource.indexOf(`${locale}: {`);
  const next = ["ja", "zh", "ko"].filter((candidate) => candidate !== locale).map((candidate) => copySource.indexOf(`${candidate}: {`, start + 1)).filter((index) => index >= 0).sort((left, right) => left - right)[0] ?? copySource.length;
  const block = copySource.slice(start, next);
  for (const [key, value] of Object.entries(messages)) requireText(block, `${key}: ${JSON.stringify(value)}`, `${locale} ClientForm copy mismatch: ${key}`);
}
forbidText(form, 'label("budgetType", "予算タイプ")', "ClientForm must not hardcode a single-language budget type label");
const renderedSource = `${form.slice(0, copyStart)}${form.slice(copyEnd + "} as const;".length)}`;
// The rendered source is intentionally checked for the known hardcoded label
// regression below. A broad quoted-string scan would misclassify the Japanese
// prefecture regex used to preserve manually entered addresses.
for (const forbiddenLabel of ["予算タイプ", "契約・法定情報", "ローン事前審査"]) {
  if (renderedSource.includes(`label(\"${forbiddenLabel}\"`)) throw new Error(`ClientForm hardcodes a removed/localized label: ${forbiddenLabel}`);
}
requireText(form, 'type="hidden" id="client-name" name="name" value={legacyNameValue}', "individual clients must retain the legacy name compatibility column");
requireText(form, '{isCorporate ? <div className="space-y-1">{label("name", profileNameLabel, true)}', "corporate clients must retain a visible company-name field");
requireText(form, '{isCorporate ? <div className="space-y-1">{label("furigana", profileFuriganaLabel)}', "corporate clients must retain the company phonetic field");
requireText(form, ': <input {...fieldProps("furigana")} type="hidden" aria-hidden="true" />', "individual clients must retain legacy furigana only as a hidden compatibility value");
for (const key of ["nameLatin", "nameKanji", "nameKatakana"]) requireText(form, `label("${key}", text.${key})`, `individual clients must expose ${key}`);
if ((form.match(/<(?:Button|button) type="submit"/g) ?? []).length !== 1) throw new Error("complete client form must have exactly one submit button");
forbidText(form, "afterSave", "complete client form must not expose the old second submit flow");

assertSectionCount();
function assertSectionCount() {
  const visibleSections = form.match(/<ClientFormSection section=/g) ?? [];
  if (visibleSections.length !== 5) throw new Error(`client form must render five visible groups after legal-section removal; found ${visibleSections.length}`);
  forbidText(form, '<ClientFormSection section="legal"', "contract/legal group must not be rendered");
  forbidText(form, 'label("preferredArea"', "preferred area must not remain a visible customer-form control");
  forbidText(form, 'label("loanPreApprovalStatus"', "loan preapproval must not remain a visible customer-form control");
  forbidText(form, 'label("annualIncomeAsOf"', "annual-income date must not remain a visible customer-form control");
  forbidText(form, 'label("annualIncomeSource"', "annual-income source must not remain a visible customer-form control");
}

requireText(state, '"employerFax"', "client individual compatibility state must include employerFax");
requireText(state, "CLIENT_FORM_DEFAULT_SENTINELS", "new client count contract must define default sentinel options");
requireText(state, "isClientFormFieldCounted", "new client count contract must expose a testable filled-field predicate");
requireText(action, "employerFax: read(\"employerFax\")", "server parser must read employerFax");
requireText(action, "normalizedEmployerFax", "server parser must normalize employerFax");
requireText(action, "isJapanesePhone", "server parser must validate mobile and landline phones");
requireText(action, "isUnchangedLegacyPhone", "edit parser must preserve an unchanged legacy non-Japanese phone from the authoritative record");
requireText(action, "authoritativePhones?.phone", "client phone preservation must use the authoritative edit record");
requireText(action, "existingClientForEdit.phone", "edit action must pass the tenant-owned phone to the parser");
requireText(action, "normalizeJapanesePhone", "server parser must normalize phone values");
requireText(action, '"client.currentPostalCode": normalizedCurrentPostalCode', "client save path must pass current postal code through the official completion helper");
requireText(action, '"client.currentAddress": values.currentAddress.trim()', "client save path must preserve manual current-address details");
requireText(action, "parseClientMoneyInput", "server money validation must use the shared legacy-preserving parser");
requireText(action, "authoritativeMoney?.annualIncome", "annual income legacy preservation must use the authoritative edit record");
requireText(action, "authoritativeMoney?.budgetMin", "minimum budget legacy preservation must use the authoritative edit record");
requireText(action, "authoritativeMoney?.budgetMax", "maximum budget legacy preservation must use the authoritative edit record");
requireText(action, "existingClientForEdit", "edit parsing must load the tenant-owned client before money parsing");
for (const field of ["legacyAnnualIncomeYen", "legacyBudgetMinYen", "legacyBudgetMaxYen"]) forbidText(action, `formData.get(\"${field}\")`, `server must not trust forged ${field} hidden input`);
requireText(money, "parsed * 10_000", "shared money parser must convert new integer 万円 to existing yen storage");
requireText(money, "const isIntegerInput = /^\\d+$/.test(raw)", "shared money parser must reject decimal/exponential text");
requireText(associationManager, "parseClientMoneyInput", "inline association callback must preserve client money units");
requireText(action, "budgetMin > budgetMax", "server budget bounds must be validated");
requireText(action, "resolveEditablePurpose", "purpose edits must use the shared authoritative legacy-preservation resolver");
requireText(action, "authoritativePurpose", "purpose preservation must receive the tenant-owned edit value");
requireText(action, 'formData.get("purposeTouched") === "1"', "purpose replacement must require explicit form interaction");
requireText(action, "existingClientForEdit?.purpose", "edit parsing must pass the authoritative purpose to the resolver");
requireText(action, "const savedFormValues: ClientFormValues", "inline client edits must return the resolved saved purpose");
requireText(action, "updatedRecord: { id: client.id, name: client.name, values: savedFormValues }", "inline client edits must refresh the workbench from resolved values");
requireText(action, 'values.budgetType, isBudgetType', "budget type must be validated against the exact option set");
requireText(action, 'phone: normalizedPhone ? isJapanesePhone(normalizedPhone) ? normalizeJapanesePhone(normalizedPhone) : normalizedPhone : ""', "phone must remain optional while normalizing supplied values");
requireText(action, 'redirect(`/clients/${client.id}?flash=client_created`)', "create must redirect with the creation feedback code");

requireText(createPage, 'normalizeImportCenterObjectReturnTo(path, "person", true)', "new entry page must preserve the validated import-center parent");
requireText(createPage, 'stage: "lead"', "new client defaults must seed only the lead stage");
forbidText(createPage, "client-form-template", "new page must not import template helpers");
forbidText(createPage, "client-intake-parser", "new page must not import memo parser");
forbidText(createPage, "confidence", "new page must not show confidence UI");
requireText(editPage, "normalizeReturnTo", "edit page must validate returnTo before rendering");
requireText(editPage, "const returnTo = normalizeReturnTo(query.returnTo, client.id, query.flash)", "edit page must derive one validated direct-parent return path");
requireText(editPage, "updateClientProfileAction", "edit page must use the structured update action");
requireText(detailPage, "client_created", "client detail must map the creation feedback code");
for (const message of ["顧客を作成しました。", "客户已创建。", "고객을 생성했습니다."]) requireText(detailPage, message, "client detail must include localized creation feedback");

// Keep the shared import-center helper in this contract so returnTo changes
// cannot silently diverge between the form page and server action.
requireText(importCenterReturnSource, "normalizeImportCenterObjectReturnTo", "import-center returnTo normalization must remain shared");

const actionStart = action.indexOf("function safeClientReturnTo");
const actionEnd = action.indexOf("async function persistClientForm", actionStart);
const returnToSource = action.slice(actionStart, actionEnd);
requireText(returnToSource, 'parsed.pathname === "/clients"', "actions must whitelist the client list return path");
requireText(returnToSource, 'parsed.pathname === "/organize-center"', "actions must whitelist the approved organize entry");
requireText(returnToSource, "normalizeImportCenterObjectReturnTo(path, \"person\", true)", "actions must delegate import-center returns to the shared safe helper");
const actionTree = ts.createSourceFile("actions.ts", action, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const safeDeclaration = actionTree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "safeClientReturnTo");
if (!safeDeclaration || actionStart < 0 || actionEnd < 0) throw new Error("actions must keep safeClientReturnTo before persistence");
const helperModule = { exports: {} };
Function("module", "exports", ts.transpileModule(importCenterReturnSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(helperModule, helperModule.exports);
const safeModule = { exports: {} };
Function("module", "IMPORT_CENTER_RETURN_PATH", "normalizeImportCenterObjectReturnTo", ts.transpileModule(
  `${safeDeclaration.getText(actionTree)}\nmodule.exports = safeClientReturnTo;`,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText)(safeModule, "/import-center", helperModule.exports.normalizeImportCenterObjectReturnTo);
const safeClientReturnTo = safeModule.exports;
const personReturnTo = "/import-center?advanced=1&object=person";
if (helperModule.exports.normalizeImportCenterObjectReturnTo("/import-center?object=person", "person", true) !== personReturnTo) {
  throw new Error("legacy person import-center returnTo must canonicalize to advanced object selection");
}
const clientReturnTo = new URL(`/clients/new?returnTo=${encodeURIComponent(personReturnTo)}`, "http://broker-desk.local").searchParams.get("returnTo");
if (clientReturnTo !== personReturnTo || safeClientReturnTo(clientReturnTo, "/clients", undefined, true) !== personReturnTo) {
  throw new Error("person import-center returnTo must survive the new-client creation chain");
}
if (safeClientReturnTo("/import-center", "/clients", undefined, true) !== "/import-center") throw new Error("bare import-center returnTo must remain valid");
for (const [candidate, expected] of [
  ["/clients?stage=lead", "/clients?stage=lead"],
  ["/organize-center?type=client", "/organize-center?type=client"],
  ["/import-center", "/import-center"],
  ["https://attacker.invalid/import-center", "/clients"],
  ["/import-center?job=forged", "/clients"],
  ["/import-center?object=person&targetId=../../forged", "/clients"],
  ["/import-center?object=person#source-upload", "/clients"],
]) {
  if (safeClientReturnTo(candidate, "/clients", undefined, true) !== expected) throw new Error(`unsafe or valid returnTo mismatch: ${candidate}`);
}

requireText(action, "export async function createClient(formData: FormData)", "quick-create compatibility wrapper must remain");
requireText(action, "await persistClientForm(formData, \"create\", undefined, true)", "quick create must reuse the shared persistence core");
requireText(action, "parseClientMoneyInput(values[field], authoritativeYen == null ? \"\" : String(authoritativeYen), false)", "budget zero and negative values must be rejected server-side");
requireText(action, "budgetMin > budgetMax", "budget bounds must be validated server-side");
requireText(action, 'values.temperature.trim() ? requiredEnum("temperature"', "temperature may be absent and must use the incomplete sentinel");

const domainModule = { exports: {} };
Function("module", "exports", ts.transpileModule(domain, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(domainModule, domainModule.exports);
const optionsModule = { exports: {} };
Function("module", "exports", "require", ts.transpileModule(options, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(optionsModule, optionsModule.exports, (moduleName) => {
  if (moduleName === "@/lib/domain") return domainModule.exports;
  throw new Error(`unexpected options dependency: ${moduleName}`);
});
const { PURPOSES, resolveEditablePurpose } = domainModule.exports;
const { getPurposeOptions } = optionsModule.exports;
const currentPurposeValues = getPurposeOptions("ja").map((option) => option.value);
if (JSON.stringify(currentPurposeValues) !== JSON.stringify(PURPOSES)) throw new Error("new/create purpose select must expose exactly the six current options");
const legacyPurposeOptions = getPurposeOptions("ja", "self_use");
if (legacyPurposeOptions[0]?.value !== "self_use" || !legacyPurposeOptions[0]?.label.includes("旧値") || legacyPurposeOptions.length !== PURPOSES.length + 1) {
  throw new Error("legacy self_use must remain inspectable without a sale/rent classification");
}
const preservedLegacyPurpose = resolveEditablePurpose("unspecified", "edit", "self_use", false);
if (preservedLegacyPurpose.value !== "self_use" || !preservedLegacyPurpose.preservedLegacy || preservedLegacyPurpose.error) throw new Error("unchanged legacy purpose must survive an unrelated edit");
const explicitlyUnchangedLegacyPurpose = resolveEditablePurpose("self_use", "edit", "self_use", true);
if (explicitlyUnchangedLegacyPurpose.value !== "self_use" || !explicitlyUnchangedLegacyPurpose.preservedLegacy || explicitlyUnchangedLegacyPurpose.error) throw new Error("explicitly retaining the legacy purpose must remain lossless");
const changedLegacyPurpose = resolveEditablePurpose("sale_residential", "edit", "self_use", true);
if (changedLegacyPurpose.value !== "sale_residential" || changedLegacyPurpose.preservedLegacy || changedLegacyPurpose.error) throw new Error("explicit new purpose selection must replace the legacy value");
const forgedLegacyPurpose = resolveEditablePurpose("self_use", "edit", "sale_residential", true);
if (!forgedLegacyPurpose.error) throw new Error("a forged legacy purpose must not replace the authoritative current purpose");
const forgedBlankPurpose = resolveEditablePurpose("", "edit", "self_use", true);
if (!forgedBlankPurpose.error || forgedBlankPurpose.value !== "self_use") throw new Error("an explicitly touched blank purpose must not erase the authoritative legacy value");
const forgedCreatePurpose = resolveEditablePurpose("investment", "create", undefined, true);
if (!forgedCreatePurpose.error) throw new Error("new records must reject legacy purpose values");
requireText(action, "年收入必须是整数的万日元单位。", "Chinese annual-income validation must say 万日元");
requireText(action, "预算下限必须是大于 0 的整数（万日元）。", "Chinese budget validation must say 万日元");
requireText(action, "예산 하한은 0보다 큰 정수(만 엔)여야 합니다.", "Korean budget validation must say 만 엔");
requireText(action, "예산 상한은 0보다 큰 정수(만 엔)여야 합니다.", "Korean budget validation must say 만 엔");

const moneyModule = { exports: {} };
Function("module", "exports", ts.transpileModule(money, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(moneyModule, moneyModule.exports);
const { formatLegacyYenAsManYen, parseClientMoneyInput } = moneyModule.exports;
for (const [value, expected] of [[650, "0.065"], [10000, "1"], [85000, "8.5"]]) {
  if (formatLegacyYenAsManYen(value) !== expected) throw new Error(`legacy yen display mismatch for ${value}`);
}
const preserved85000 = parseClientMoneyInput("8.5", "85000", false);
if (preserved85000.value !== 85000 || preserved85000.error !== false || preserved85000.preservedLegacy !== true) throw new Error("old 85,000 yen must round-trip unchanged as 8.5 万円");
const changedTo43 = parseClientMoneyInput("43", "85000", false);
if (changedTo43.value !== 430000 || changedTo43.error !== false || changedTo43.preservedLegacy !== false) throw new Error("editing old 85,000 yen to 43 万円 must save 430,000 yen");
const reopened43 = parseClientMoneyInput("43", "430000", false);
if (reopened43.value !== 430000 || reopened43.error !== false) throw new Error("43 万円 must survive save and reopen");
if (!parseClientMoneyInput("43.5", "430000", false).error) throw new Error("edited decimal 万円 must be rejected");
if (!parseClientMoneyInput("8.5", "", false).error) throw new Error("forged hidden legacy baseline must not authorize a decimal on create");

const stateModule = { exports: {} };
Function("module", "exports", ts.transpileModule(state, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(stateModule, stateModule.exports);
const { isClientFormFieldCounted } = stateModule.exports;
const untouched = new Set();
for (const [field, sentinel] of [["budgetType", "total_price"], ["purpose", "unspecified"], ["stage", "lead"], ["temperature", "unspecified"]]) {
  if (isClientFormFieldCounted(field, sentinel, "create", untouched)) throw new Error(`untouched new-form sentinel ${field} must not count as filled`);
  if (!isClientFormFieldCounted(field, sentinel, "create", new Set([field]))) throw new Error(`explicitly selected sentinel ${field} must count as filled`);
  if (!isClientFormFieldCounted(field, sentinel, "edit", untouched)) throw new Error(`stored edit sentinel ${field} must count as filled`);
}
if (!isClientFormFieldCounted("nameKanji", "山田", "create", untouched)) throw new Error("new non-sentinel value must count as filled");

console.log("TASK-050 client form contract passed (legacy preservation, revised groups, phone/postal/money boundaries)");
