import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";

const layoutPath = "src/components/layout-system/index.tsx";
const layoutCssPath = "src/components/layout-system/layout-system.module.css";
const casePath = "src/components/case-association-draft.tsx";
const loadingPath = "src/app/cases/new/loading.tsx";
const notFoundPath = "src/app/not-found.tsx";
const clientFormPath = "src/components/client-form.tsx";
const propertyFormPath = "src/components/property-responsive-form.tsx";
const submissionLockPath = "src/components/form-submission-lock.ts";
const focusDialogGuardsPath = "src/components/focus-dialog-guards.ts";

const [layout, layoutCss, caseDraft, loading, notFound, clientForm, propertyForm, submissionLock, focusDialogGuards] = await Promise.all([
  readFile(layoutPath, "utf8"),
  readFile(layoutCssPath, "utf8"),
  readFile(casePath, "utf8"),
  readFile(loadingPath, "utf8"),
  readFile(notFoundPath, "utf8"),
  readFile(clientFormPath, "utf8"),
  readFile(propertyFormPath, "utf8"),
  readFile(submissionLockPath, "utf8"),
  readFile(focusDialogGuardsPath, "utf8"),
]);

const failures = [];
const requireText = (source, text, label) => {
  if (!source.includes(text)) failures.push(`${label}: missing ${text}`);
};

for (const component of ["PageFrame", "PageHeader", "ResponsiveFormShell", "FormSection", "ActionBar", "StateSurface"]) {
  requireText(layout, `export function ${component}`, "layout exports");
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

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("layout-system contract: PASS (composition exports, cases/new integration, drawer geometry, error focus, not-found locale)");
