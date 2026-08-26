import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";

const layoutPath = "src/components/layout-system/index.tsx";
const layoutCssPath = "src/components/layout-system/layout-system.module.css";
const casePagePath = "src/app/cases/[id]/page.tsx";
const caseOverviewPath = "src/components/case-overview.tsx";
const casePath = "src/components/case-association-draft.tsx";
const loadingPath = "src/app/cases/new/loading.tsx";
const notFoundPath = "src/app/not-found.tsx";
const clientFormPath = "src/components/client-form.tsx";
const propertyFormPath = "src/components/property-responsive-form.tsx";
const submissionLockPath = "src/components/form-submission-lock.ts";
const focusDialogGuardsPath = "src/components/focus-dialog-guards.ts";
const organizePagePath = "src/app/organize-center/page.tsx";
const organizeBrowserPath = "src/components/organize-center-object-browser.tsx";

const [layout, layoutCss, casePage, caseOverview, caseDraft, loading, notFound, clientForm, propertyForm, submissionLock, focusDialogGuards, organizePage, organizeBrowser] = await Promise.all([
  readFile(layoutPath, "utf8"),
  readFile(layoutCssPath, "utf8"),
  readFile(casePagePath, "utf8"),
  readFile(caseOverviewPath, "utf8"),
  readFile(casePath, "utf8"),
  readFile(loadingPath, "utf8"),
  readFile(notFoundPath, "utf8"),
  readFile(clientFormPath, "utf8"),
  readFile(propertyFormPath, "utf8"),
  readFile(submissionLockPath, "utf8"),
  readFile(focusDialogGuardsPath, "utf8"),
  readFile(organizePagePath, "utf8"),
  readFile(organizeBrowserPath, "utf8"),
]);

const failures = [];
const requireText = (source, text, label) => {
  if (!source.includes(text)) failures.push(`${label}: missing ${text}`);
};

for (const component of ["PageFrame", "PageHeader", "ResponsiveFormShell", "FormSection", "ActionBar", "StateSurface"]) {
  requireText(layout, `export function ${component}`, "layout exports");
}
requireText(layout, "export function ListReportShell", "layout exports");
requireText(layout, 'Omit<HTMLAttributes<HTMLElement>, "children" | "results">', "ListReportShell native attribute collision guard");
for (const slot of ["scope", "filters", "summary", "results", "pagination", "state"]) {
  requireText(layout, `data-list-report-slot=\"${slot}\"`, "ListReportShell slots");
}
const listReportStart = layout.indexOf("export function ListReportShell");
const listReportEnd = layout.indexOf("export type ResponsiveFormShellProps", listReportStart);
const listReportSource = layout.slice(listReportStart, listReportEnd);
if (/\b(query|permission|archive|sessionStorage|focus)\b/i.test(listReportSource) || /\bdata\s*[=:]/i.test(listReportSource)) {
  failures.push("ListReportShell: must not own query, data, permission, archive, sessionStorage or focus concerns");
}
if (/PageHeader|ActionBar|new.?CTA|create/i.test(listReportSource)) {
  failures.push("ListReportShell: must remain a thin slot composition without page header, action bar or create CTA");
}

const objectShellStart = layout.indexOf("export type ObjectPageShellProps");
const objectShellEnd = layout.indexOf("export type PageHeaderProps", objectShellStart);
const objectShellSource = layout.slice(objectShellStart, objectShellEnd);
for (const slot of ["header", "feedback", "state", "navigation", "children", "footer"]) {
  requireText(objectShellSource, slot === "header" || slot === "children" ? `${slot}: ReactNode` : `${slot}?: ReactNode`, "ObjectPageShell structural slots");
  requireText(objectShellSource, `data-object-page-slot="${slot}"`, "ObjectPageShell semantic slots");
}
requireText(objectShellSource, "<div {...props}", "ObjectPageShell stable div root");
requireText(layoutCss, ".objectPageSlot {\n  display: contents;", "ObjectPageShell non-box slot wrapper");
for (const slot of ["feedback", "state", "navigation", "footer"]) {
  requireText(objectShellSource, `{${slot} ? <div`, `ObjectPageShell empty ${slot} slot omission`);
}
if (/\.objectPageShell[^{]*\{[^}]*\b(position|overflow|contain|transform)\s*:/s.test(layoutCss) || /\.objectPageSlot[^{]*\{[^}]*\b(position|overflow|contain|transform)\s*:/s.test(layoutCss)) {
  failures.push("ObjectPageShell: shell and slot wrappers must not establish sticky clipping or containing-block behavior");
}
if (objectShellSource.includes("associations") || objectShellSource.includes("output")) {
  failures.push("ObjectPageShell: must not expose domain-named association or output slots");
}
if (/from ["']@\//.test(objectShellSource) || /\b(use[A-Z]|query|permission|case|saveAction|eligib|data\s*[=:])\b/i.test(objectShellSource)) {
  failures.push("ObjectPageShell: must remain a pure structural composition without app state or domain concerns");
}
const objectShellSlotOrder = ["header", "feedback", "state", "navigation", "children", "footer"].map((slot) => objectShellSource.indexOf(`data-object-page-slot=\"${slot}\"`));
if (objectShellSlotOrder.some((position) => position < 0) || objectShellSlotOrder.some((position, index) => index > 0 && position <= objectShellSlotOrder[index - 1])) {
  failures.push("ObjectPageShell: structural slot order must be header, feedback, state, navigation, children, footer");
}
if ((casePage.match(/<ObjectPageShell\b/g) ?? []).length !== 1 || (casePage.match(/<CaseIdentityHeader\b/g) ?? []).length !== 1) {
  failures.push("case detail page: quick branch must have exactly one ObjectPageShell and one identity header");
}
if ((caseOverview.match(/<ObjectPageShell\b/g) ?? []).length !== 1 || (caseOverview.match(/<CaseIdentityHeader\b/g) ?? []).length !== 1) {
  failures.push("CaseOverview: read-only/overview branches must share exactly one shell and one identity header");
}
const caseOverviewHeaderPosition = caseOverview.indexOf("<CaseIdentityHeader");
const caseOverviewAssociationPosition = caseOverview.indexOf("{associationPanel}");
if (caseOverviewHeaderPosition < 0 || caseOverviewAssociationPosition < 0 || caseOverviewAssociationPosition <= caseOverviewHeaderPosition) {
  failures.push("CaseOverview: association panel must follow its unique identity header");
}
requireText(caseOverview, "!compactHeader ?", "identity header compact visibility");
requireText(caseOverview, "showViewSwitch ? <CaseViewSwitch", "read-only view switch visibility");
requireText(caseOverview, "<CaseStatusSummary", "read-only status summary retention");
requireText(caseOverview, "feedback={", "CaseOverview feedback slot");
requireText(caseOverview, "state={attentionQueue}", "CaseOverview state slot");
requireText(caseOverview, "{associationPanel}", "CaseOverview association panel child");
if (caseOverview.includes("navigation={")) failures.push("CaseOverview: navigation must be assembled in children after associationPanel");
const caseOverviewNavPosition = caseOverview.indexOf("<nav data-case-anchor-nav");
const caseOverviewFieldsPosition = caseOverview.indexOf("<main className=\"space-y-4\">");
if (caseOverviewAssociationPosition < 0 || caseOverviewNavPosition < 0 || caseOverviewFieldsPosition < 0 || !(caseOverviewAssociationPosition < caseOverviewNavPosition && caseOverviewNavPosition < caseOverviewFieldsPosition)) {
  failures.push("CaseOverview: children order must be associationPanel, section navigation, then fields");
}
const readOnlyBranchStart = casePage.indexOf("if (!canWriteCase)");
const overviewBranchStart = casePage.indexOf("if (activeView === \"overview\")");
const quickBranchStart = casePage.indexOf("return (\n    <div className=\"flex min-w-0 flex-col gap-6\">");
const readOnlyBranch = casePage.slice(readOnlyBranchStart, overviewBranchStart);
const overviewBranch = casePage.slice(overviewBranchStart, quickBranchStart);
if (/^\s*\{associationPanel\}/m.test(readOnlyBranch) || /^\s*\{associationPanel\}/m.test(overviewBranch)) {
  failures.push("case detail page: read-only/overview branches must not render associationPanel outside CaseOverview");
}
requireText(readOnlyBranch, "showViewSwitch={canWriteCase}", "read-only switch decision from page permission result");
requireText(overviewBranch, "showViewSwitch={canWriteCase}", "overview switch decision from page permission result");
requireText(readOnlyBranch, "associationPanel={associationPanel}", "read-only association panel handoff");
requireText(overviewBranch, "associationPanel={associationPanel}", "overview association panel handoff");
if ((casePage.slice(quickBranchStart).match(/\{associationPanel\}/g) ?? []).length !== 1) {
  failures.push("case detail page: quick branch must render associationPanel exactly once inside its shell");
}
for (const fragment of [
  "readOnly={!canWriteCase}",
  "candidates={associationCandidates}",
  "properties={associationProperties}",
  "saveAction={canWriteCase ? saveCaseAssociationsAction : undefined}",
  "createPersonAction={canWriteCase ? createClientFormAction : undefined}",
  "createPropertyAction={canWriteCase ? createPropertyQuickAction : undefined}",
  "const activeView = query?.view === \"quick\" || query?.view === \"overview\"",
  "downloadGate && downloadGate.blockedReasons.length > 0",
  "flashTone =",
  "scrollTop?: string",
]) {
  requireText(casePage, fragment, "case detail data, gate and return-context preservation");
}
for (const fragment of [
  "!hasOutputTemplate || !downloadHref",
  "if (hasBlockingOutput)",
  "setConfirmOpen(true)",
  "window.location.hash",
  "initialScrollTop",
  "scrollToId",
  "lastTriggerIdRef",
  "showViewSwitch={showViewSwitch}",
  "{outputState}",
]) {
  requireText(caseOverview, fragment, "CaseOverview output and return-context preservation");
}

const casesCompositionFragments = [
  "<PageFrame className=\"space-y-5\">",
  "<PageHeader title={text.title}",
  "<ResponsiveFormShell action={caseFormAction}>",
  "<FormSection className=\"space-y-3\">",
  "<ActionBar mobileFixed>",
  "<StateSurface tone=\"empty\">",
];
for (const fragment of casesCompositionFragments) requireText(caseDraft, fragment, "cases/new composition");
requireText(caseDraft, "layoutStyles.pageActionCancel", "CSS Module page cancel binding");
if (/className=\"pageActionCancel/.test(caseDraft)) failures.push("cases/new: pageActionCancel is not CSS Module bound");

for (const element of ["<div", "<header", "<form", "<section"]) requireText(layout, element, "layout element boundary");
if (layout.match(/from ["']@\//) || layout.match(/use(ActionState|Effect|Ref|State)/)) {
  failures.push("layout-system: composition layer imports application modules or owns state");
}

requireText(layoutCss, ".actionBar[data-mobile-fixed=\"true\"]", "mobile action bar");
requireText(layoutCss, "--bd-action-bar-height: calc(var(--bd-space-3) + var(--bd-control-height-touch) + var(--bd-space-3)", "action bar height token");
requireText(layoutCss, "padding-bottom: calc(var(--bd-space-4) + var(--bd-action-bar-height))", "mobile form safe space");
requireText(layoutCss, "padding-bottom: var(--bd-space-5)", "desktop form safe space");
requireText(layoutCss, ".pageActionCancel", "mobile action bar secondary action separation");
requireText(layoutCss, ".dialogOverlay", "dialog overlay layer");
requireText(layoutCss, "z-index: var(--bd-z-modal)", "dialog z-index token");
requireText(layoutCss, ".dialogFooter", "dialog footer safe area");
requireText(layoutCss, "env(safe-area-inset-bottom)", "dialog safe area");
requireText(layoutCss, ".stateSurfaceLoading::before", "loading state visual");
requireText(layout, "aria-busy={tone === \"loading\" || undefined}", "loading state semantics");
requireText(caseDraft, "data-case-association-case-error", "case error focus target");
requireText(caseDraft, "scrollIntoView", "case error visibility");
requireText(caseDraft, "const error = errorRef.current", "case error uses scoped ref");
requireText(caseDraft, "}, [caseState, locale, text.caseSaveError]);", "case error reacts to each action result");
requireText(caseDraft, "document.body.style.overflow = \"hidden\"", "dialog background scroll lock");
requireText(caseDraft, "form=\"case-association-person-create\"", "person create dialog footer");
requireText(caseDraft, "form=\"case-association-property-create\"", "property create dialog footer");
requireText(caseDraft, "formId=\"case-association-person-create\" hideActions", "person create form footer contract");
requireText(caseDraft, "formId=\"case-association-property-create\" hideActions", "property create form footer contract");
requireText(caseDraft, "disabled={personCreatePending}", "person create pending guard");
requireText(caseDraft, "disabled={propertyCreatePending}", "property create pending guard");
requireText(caseDraft, "onPendingChange={updatePersonCreatePending}", "person pending bridge");
requireText(caseDraft, "onPendingChange={updatePropertyCreatePending}", "property pending bridge");
requireText(caseDraft, "closeDisabled={drawerView === \"create\" && personCreatePending}", "person create close lock");
requireText(caseDraft, "closeDisabled={drawerView === \"create\" && propertyCreatePending}", "property create close lock");
requireText(caseDraft, "closeDisabledRef={personCreatePendingRef}", "person live dialog close lock ref");
requireText(caseDraft, "closeDisabledRef={propertyCreatePendingRef}", "property live dialog close lock ref");
requireText(caseDraft, "handleFocusDialogEscape(event, closeDisabledRef ?? fallbackCloseDisabledRef, onCloseRef.current)", "escape reads synchronous dialog close lock");
requireText(caseDraft, "requestFocusDialogClose(activeCloseDisabledRef, onCloseRef.current)", "header close reads synchronous dialog close lock");
requireText(caseDraft, "onSubmitStart={startPersonCreate}", "person submit start lock");
requireText(caseDraft, "onSubmitStart={startPropertyCreate}", "property submit start lock");
requireText(caseDraft, "text.draftSessionOnly", "page-session draft boundary");
requireText(caseDraft, "disabled={personCreatePending}", "person create cancel lock");
requireText(caseDraft, "disabled={propertyCreatePending}", "property create cancel lock");
requireText(caseDraft, "const draftPeopleCount", "current session draft summary");
requireText(caseDraft, "text.guaranteeRequirementsMissing", "draft output eligibility summary");
requireText(caseDraft, "text.draftPrimaryApplicant", "draft applicant summary");
requireText(caseDraft, "text.draftPrimaryProperty", "draft property summary");
for (const control of ["min-h-11", "text-base sm:text-sm", "scrollIntoView"]) requireText(caseDraft, control, "cases/new responsive interaction contract");
if (/owner_write|company_read|private/i.test(caseDraft)) failures.push("cases/new: internal permission terminology is present");
requireText(caseDraft, "input:not([type='hidden'])", "dialog visible focus order");
if ((caseDraft.match(/footer=\{drawerView === \"create\"/g) ?? []).length < 2) {
  failures.push("FocusDialog: both create and select views must expose a persistent footer");
}

for (const [source, label] of [[clientForm, "ClientForm"], [propertyForm, "PropertyResponsiveForm"]]) {
  for (const fragment of ["formId?: string", "hideActions?: boolean", "onPendingChange?: (pending: boolean) => void", "onSubmitStart?: () => void", "id={formId}", "onPendingChange?.(pending)", "submissionLockRef", "handleFormSubmit", "endSubmission", "onSubmit={handleSubmit}"]) {
    requireText(source, fragment, `${label} pending bridge`);
  }
  requireText(source, "hideActions ? null", `${label} footer ownership`);
}

for (const fragment of ["beginSubmission", "endSubmission", "handleFormSubmit", "event.preventDefault()", "if (lock.current) return false"]) {
  requireText(submissionLock, fragment, "synchronous form submission lock");
}
for (const fragment of ["event.key !== \"Escape\"", "event.preventDefault()", "closeDisabledRef.current", "requestFocusDialogClose(closeDisabledRef, onClose)"]) {
  requireText(focusDialogGuards, fragment, "synchronous dialog close guard");
}
const overlayStart = caseDraft.indexOf("className={layoutStyles.dialogOverlay}");
const surfaceStart = caseDraft.indexOf("className={layoutStyles.dialogSurface}", overlayStart);
if (overlayStart >= 0 && surfaceStart > overlayStart && caseDraft.slice(overlayStart, surfaceStart).includes("onClick")) {
  failures.push("FocusDialog: backdrop must not close the dialog during submission");
}

const bodyStart = caseDraft.indexOf("className={layoutStyles.dialogBody}");
const footerStart = caseDraft.indexOf("className={layoutStyles.dialogFooter}", bodyStart);
if (bodyStart < 0 || footerStart < 0 || footerStart < bodyStart) {
  failures.push("FocusDialog: footer is not declared after the scrollable body");
}

requireText(notFound, "getLocale", "not-found locale source");
for (const locale of ["ja", "zh", "ko"]) requireText(notFound, `${locale}:`, "not-found locale map");
for (const fragment of ["<PageFrame", "<PageHeader", "<ResponsiveFormShell", "<FormSection", "<StateSurface tone=\"loading\"", "<ActionBar mobileFixed", "getLocale", "ja:", "zh:", "ko:"]) {
  requireText(loading, fragment, "cases/new loading boundary");
}
if (loading.includes("backHref=") || loading.includes("/organize-center?type=case")) failures.push("cases/new loading: loading boundary must not assume a source return path");
if (/owner_write|company_read|private/i.test(loading)) failures.push("cases/new loading: internal permission terminology is present");
for (const fragment of ["TenantSessionError", "tenant_selection_required", "permission_denied", "tenant_forbidden", "tenant_not_found", "user_not_found", "returnTo", "notFound()", "redirect(`/workspace?reason=tenant_selection_required"]) {
  requireText(readFileSync("src/app/cases/new/page.tsx", "utf8"), fragment, "cases/new route access boundary");
}
requireText(layoutCss, "var(--bd-shadow-action-bar)", "semantic action bar shadow token");
requireText(layoutCss, "var(--bd-overlay-scrim)", "semantic dialog overlay token");
requireText(layoutCss, "var(--bd-surface-overlay)", "semantic action bar surface token");
requireText(layoutCss, "@media (prefers-reduced-motion: no-preference)", "loading reduced motion boundary");

for (const fragment of ["<PageFrame className=\"bd-page bd-organize-page", "<PageHeader className=\"bd-page-header\"", "tone=\"loading\"", "tone=\"error\"", "tone=\"permission\""]) {
  requireText(organizePage, fragment, "organize-center composition");
}
requireText(organizeBrowser, "<ListReportShell", "organize-center list-report composition");
for (const slot of ["scope={", "filters={", "summary={", "results=", "pagination=", "state={"]) {
  requireText(organizeBrowser, slot, "organize-center list-report slots");
}
for (const fragment of [
  "const LIST_PAGE_SIZE = 6;",
  "const FOCUS_STORAGE_PREFIX = \"organize-center:focus:\"",
  "const RETURN_STATE_STORAGE_PREFIX = \"organize-center:return-state:\"",
  "data-organize-object-link={item.id}",
  "if (lifecycleFilter !== \"active\") params.set(\"lifecycle\", lifecycleFilter)",
  "href={buildListHref(selectedType, \"\", lifecycleFilter)}",
]) {
  requireText(organizeBrowser, fragment, "organize-center behavior contract");
}
for (const copy of [
  'clear: "キーワードをクリア"',
  'clearFilters: "キーワードをクリア"',
  'clear: "清除关键词"',
  'clearFilters: "清除关键词"',
  'clear: "키워드 지우기"',
  'clearFilters: "키워드 지우기"',
  'clearKeywordHint: "キーワードだけを解除し、記録の状態はそのままにして再検索できます。"',
  'clearKeywordHint: "可以只清除关键词，记录状态筛选保持不变。"',
  'clearKeywordHint: "키워드만 지우고 기록 상태 필터는 그대로 둔 채 다시 확인할 수 있습니다."',
  'noKeyword: "キーワード未設定"',
  'noKeyword: "未设置关键词"',
  'noKeyword: "검색어 미설정"',
]) {
  requireText(organizePage, copy, "organize-center localized keyword clear copy");
}
requireText(organizeBrowser, "const hasKeyword = query.trim().length > 0;", "organize-center keyword-empty condition");
requireText(organizeBrowser, "description={hasKeyword ? copy.clearKeywordHint : undefined}", "organize-center conditional keyword hint");
requireText(organizeBrowser, "action={hasKeyword ? <Link", "organize-center conditional clear action");
requireText(organizePage, "function OrganizeCenterLoading({ copy, params }", "organize-center loading params");
requireText(organizePage, "<ListReportShell", "organize-center loading list-report shell");
requireText(organizePage, "const selectedType = isObjectType(params.type) ? params.type : \"all\";", "organize-center loading selected type");
requireText(organizePage, "const query = String(params.q ?? \"\").trim();", "organize-center loading query");
requireText(organizePage, "const lifecycleFilter = normalizeLifecycleFilter(params.lifecycle);", "organize-center loading lifecycle");
requireText(organizePage, "fallback={<OrganizeCenterLoading copy={copy} params={params} />}", "organize-center loading fallback context");
if (organizeBrowser.includes("const isEmptyData")) failures.push("organize-center: must not infer absolute empty data from the active lifecycle result");
if (organizeBrowser.includes('title={copy.noResults}\n            description={copy.noResults}')) failures.push("organize-center: filtered-empty state must not repeat the same title and description");
if (organizeBrowser.includes("copy.emptyData")) failures.push("organize-center: object selector must not claim an absolute empty state from the fetched collection");
if (organizeBrowser.includes("description={copy.description}")) failures.push("organize-center: page description must not be duplicated inside the object browser");
if (/min-h-9/.test(organizeBrowser)) failures.push("organize-center: narrow-screen key controls must not use 36px minimum height");
if (organizePage.includes("animate-pulse")) failures.push("organize-center: loading skeleton must not force motion without a reduced-motion boundary");

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("layout-system contract: PASS (composition exports, cases/new integration, organize-center ListReportShell and filtered-empty checks, drawer geometry, error focus, not-found locale)");
