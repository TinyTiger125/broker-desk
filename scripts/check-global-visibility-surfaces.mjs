import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(`global-visibility contract failed: ${message}`);
};

const searchRoute = read("src/app/api/hub/search/route.ts");
const exportRoute = read("src/app/api/hub/export/route.ts");
const hub = read("src/lib/hub.ts");
const newCase = read("src/app/cases/new/page.tsx");
const newQuote = read("src/app/quotes/new/page.tsx");
const actions = read("src/app/actions.ts");
const outputCenter = read("src/app/output-center/page.tsx");
const importCenter = read("src/app/import-center/page.tsx");

assert(searchRoute.includes("createRequestContext(session)"), "search route creates a trusted RequestContext");
assert(searchRoute.includes("requestContext: createRequestContext(session)"), "search passes context instead of user and tenant parameters");
assert(!searchRoute.includes("userId: session.user.id") && !searchRoute.includes("tenantId: session.tenant.id"), "search route has no client-supplied identity context");
assert(hub.includes("listBrokerageCasesForContext") && hub.includes('entity: "case"'), "cases are part of the supported search surface");
assert(hub.includes("if (!context.requestContext) return []"), "search fails closed without a trusted context");
assert(hub.includes("return [...caseItems, ...propertyItems, ...partyItems]"), "search is limited to cases, properties, and parties");
assert(!hub.slice(hub.indexOf("export async function searchHubItems")).includes("listHubContracts"), "search does not include legacy contracts");
assert(!hub.slice(hub.indexOf("export async function searchHubItems")).includes("listHubGeneratedOutputs"), "search does not include legacy outputs");

assert(exportRoute.includes('const supportedScopes = ["cases", "properties", "parties", "audit_logs"]'), "export scope is explicit and narrow");
assert(exportRoute.includes("unsupported_scope"), "unsupported export scopes are rejected");
assert(exportRoute.includes("createRequestContext(session)"), "export creates a trusted RequestContext");
assert(exportRoute.includes("item.resolution.canWrite") && exportRoute.includes("item.canWrite"), "exports are owner-write only");
assert(!exportRoute.includes("listHubContracts") && !exportRoute.includes("listHubGeneratedOutputs"), "legacy export readers are not reachable from the V1 route");
assert(!exportRoute.includes("getDefaultUser") && !exportRoute.includes("userId: session.user.id"), "export has no default-user or caller identity fallback");
assert(exportRoute.includes('scope === "audit_logs" ? "audit.view" : "record.read"'), "audit export retains its independent audit.view gate");
assert(!outputCenter.includes("scope=outputs"), "unsupported output export has no active UI entry");
assert(!importCenter.includes("scope=import_jobs"), "unsupported import-job export has no active UI entry");

for (const file of [newCase, newQuote]) {
  assert(file.includes("createRequestContext(session)"), "candidate page creates trusted RequestContext");
  assert(file.includes("listClientsForContext") && file.includes("listPropertiesForContext"), "candidate page uses context-bound lists");
  assert(file.includes("resolution.canWrite"), "candidate page filters to owner-write records");
  assert(!file.includes("listQuoteFormData"), "candidate page does not use tenant-wide legacy options");
}
assert(actions.includes("const requestContext = createRequestContext(session)"), "case creation action creates trusted RequestContext");
assert(actions.includes("partyResults.some((result) => !result.record || !result.resolution.canWrite)") && actions.includes("!propertyResult?.record || !propertyResult.resolution.canWrite"), "case creation rechecks candidate ownership server-side");
assert(actions.includes("property.resolution.canWrite"), "quotation creation keeps server-side property owner-write check");

console.log("global-visibility surfaces contract: PASS");
