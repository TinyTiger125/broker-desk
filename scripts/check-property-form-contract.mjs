import fs from "node:fs";

const root = new URL("..", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");
const actions = read("src/app/actions.ts");
const form = read("src/components/property-responsive-form.tsx");
const createPage = read("src/app/properties/new/page.tsx");
const editPage = read("src/app/properties/[id]/edit/page.tsx");
const postgres = read("src/lib/data.postgres.ts");
const propertiesPage = read("src/app/properties/page.tsx");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(actions.includes("export async function createPropertyQuickAction(\n  _previousState: PropertyFormActionState"), "create action must use structured action state");
assert(actions.includes("export async function updatePropertyProfileAction(\n  _previousState: PropertyFormActionState"), "update action must use structured action state");
assert(actions.includes('targetType: "property"'), "property creation audit must use property target type");
assert(actions.includes("values.listingPrice.trim() ? parseOptionalNumber(\"listingPrice\", 0) : 0"), "blank listing price must retain compatibility zero");
assert(actions.includes('(field === "listingPrice" && parsed === 0)'), "explicit listing price zero must be rejected");
assert(actions.includes("parsed.origin !== \"http://broker-desk.local\""), "returnTo must reject external origins");
assert(actions.includes('decodedPathname.split("/").some((segment) => segment === "." || segment === "..")'), "returnTo must reject path traversal");
assert(actions.includes('parsed.pathname === "/properties"'), "returnTo must validate the properties pathname");
assert(actions.includes('parsed.pathname === "/organize-center"'), "returnTo must validate the organize pathname");
assert(actions.includes('parsed.pathname === "/import-center"'), "returnTo must validate the import pathname");

assert(form.includes('role="alert"'), "form must expose an error summary");
assert(form.includes("summaryRef.current?.focus()"), "error summary must receive focus");
assert(form.includes('aria-invalid'), "fields must expose invalid state");
assert(form.includes('aria-describedby'), "fields must associate their errors");
assert(form.includes("target?.focus()"), "summary links must focus their field");
assert(form.includes("event.nativeEvent.keyCode === 229"), "IME Enter must not submit");
assert((form.match(/<button type="submit"/g) ?? []).length === 1, "form must have one submit button");
assert(!createPage.includes("FormDraftAssist"), "create page must not invoke FormDraftAssist");
assert(!editPage.includes("ObjectWorkbenchShell"), "edit page must not use the workbench shell");
assert(!editPage.includes("WorkbenchProgress"), "edit page must not expose progress UI");
assert(!editPage.includes("sticky"), "edit page must not use a sticky save bar");
assert(createPage.includes("returnTo"), "create page must preserve return context");
assert(editPage.includes("returnTo"), "edit page must preserve return context");

assert(postgres.includes("export async function getPropertyById"), "postgres must provide property lookup");
assert(postgres.includes("export async function updateProperty"), "postgres must provide property update");
assert(postgres.includes("WHERE id = $1 AND tenant_id = $2"), "postgres property writes must be tenant scoped");
assert(propertiesPage.includes("returnTo=${encodeURIComponent(returnTo)}"), "property links must carry list context");

console.log("TASK-031 property form contract checks passed");
