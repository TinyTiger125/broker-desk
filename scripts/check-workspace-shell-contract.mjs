import { readFile } from "node:fs/promises";

const pagePath = "src/app/workspace/page.tsx";
const selectorPath = "src/app/workspace/workspace-selector.tsx";
const [page, selector] = await Promise.all([
  readFile(pagePath, "utf8"),
  readFile(selectorPath, "utf8"),
]);

const failures = [];
const requireText = (source, text, label) => {
  if (!source.includes(text)) failures.push(`${label}: missing ${text}`);
};

for (const component of ["PageFrame", "PageHeader", "StateSurface"]) {
  requireText(page, `<${component}`, `workspace page ${component}`);
}
requireText(page, "broker-desk-auth-route", "workspace auth route boundary");
requireText(page, "safeWorkspaceReturnTo", "workspace returnTo validation");
requireText(page, "const returnTo = safeWorkspaceReturnTo(params.returnTo)", "workspace returnTo use");
requireText(page, "selectionRequiredTitle", "tenant selection warning");
requireText(page, "sessionLookupFailed", "workspace read failure state");
requireText(page, "pendingActivation", "pending activation state");
requireText(page, "pendingInvitations", "pending invitation state");
requireText(page, "text.createCompany", "empty state create action");
requireText(page, "text.viewInvitations", "empty state invitation action");
if (page.includes("<AppNav") || page.includes("<MainNavLinks")) {
  failures.push("workspace page: must not render a second global navigation shell");
}
if ((page.match(/<PageFrame\b/g) ?? []).length !== 1 || (page.match(/<PageHeader\b/g) ?? []).length !== 1) {
  failures.push("workspace page: exactly one page frame and page header");
}
if ((page.match(/<StateSurface\b/g) ?? []).length !== 2) {
  failures.push("workspace page: error and empty states must use StateSurface exactly once each");
}

requireText(selector, 'type="button"', "workspace selector native keyboard button");
requireText(selector, "onClick={() => void chooseWorkspace(item.tenantId)}", "workspace selector button activation");
requireText(selector, "if (pendingRef.current) return;", "workspace selector synchronous duplicate guard");
if (selector.indexOf("if (pendingRef.current) return;") > selector.indexOf("pendingRef.current = true")) {
  failures.push("workspace selector: duplicate guard must precede pending assignment");
}
requireText(selector, "disabled={pendingTenantId !== null}", "workspace selector pending disable");
requireText(selector, "pendingRef.current = true", "workspace selector synchronous pending lock");
requireText(selector, "method: \"POST\"", "workspace selection POST");
requireText(selector, "body: JSON.stringify({ tenantId })", "workspace selection payload");
requireText(selector, "window.location.replace(returnTo)", "workspace selection return navigation");
requireText(selector, "pendingRef.current = false", "workspace selection failure unlock");
requireText(selector, "setPendingTenantId(null)", "workspace selection failure recovery");
requireText(selector, "failedTenantIdRef", "workspace selection failure focus target");
requireText(selector, "optionRefs.current.get(failedTenantIdRef.current)?.focus()", "workspace selection failure focus restoration");
requireText(selector, "aria-busy={pendingTenantId !== null || undefined}", "workspace selection pending semantics");
requireText(selector, "break-words text-base", "workspace name natural wrapping");
requireText(selector, "min-h-11 min-w-20 shrink-0", "workspace status touch-sized rail");
if (selector.includes("document.querySelector") || selector.includes("window.querySelector")) {
  failures.push("workspace selector: focus recovery must use scoped refs, not global DOM queries");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Workspace shell contract passed");
