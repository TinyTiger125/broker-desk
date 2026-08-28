import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
let currentSubject = "";

Module._load = function (request, parent, ...rest) {
  if (request === "@clerk/nextjs/server") {
    return { auth: async () => ({ userId: currentSubject }), currentUser: async () => null };
  }
  return originalLoad.call(this, request, parent, ...rest);
};
function resolveCandidate(value) {
  if (!value || (!value.startsWith("/") && !value.startsWith("."))) return undefined;
  const candidates = [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}
Module._resolveFilename = function (request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
function compileTypeScript(module, filename) {
  const result = typescript.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
}
require.extensions[".ts"] = compileTypeScript;
require.extensions[".tsx"] = compileTypeScript;

process.env.BROKER_DESK_DEPLOYMENT_ENV = "preview";
process.env.BROKER_DESK_AUTH_MODE = "clerk";
const memory = require(resolve(root, "src/lib/data.memory.ts"));
const resolver = require(resolve(root, "src/lib/visibility-resolver.ts"));
const hub = require(resolve(root, "src/lib/hub.ts"));
const tenantSessionPath = resolve(root, "src/lib/tenant-session.ts");
const clerkAuthPath = resolve(root, "src/lib/clerk-auth.ts");

const tenant = await memory.getTenantById("tenant_cherry");
const owner = await memory.getUserById("user_demo");
const colleague = await memory.getUserById("user_ops");
assert(tenant && owner && colleague && owner.externalAuthSubject && colleague.externalAuthSubject, "fixture identities exist");

async function trustedSession(subject) {
  currentSubject = subject;
  delete require.cache[tenantSessionPath];
  delete require.cache[clerkAuthPath];
  const tenantSession = require(tenantSessionPath);
  return tenantSession.requireTenantSession({ requestedTenantId: tenant.id });
}

const ownerContext = resolver.createRequestContext(await trustedSession(owner.externalAuthSubject));
const colleagueContext = resolver.createRequestContext(await trustedSession(colleague.externalAuthSubject));
assert.deepEqual(await hub.searchHubItems("ja", "Global visibility", 10, {}), [], "search without a trusted context fails closed");

const privatePerson = await memory.addClient({
  tenantId: tenant.id,
  ownerUserId: owner.id,
  name: "Global visibility private person",
  phone: "000-0000-0010",
  budgetType: "total_price",
  purpose: "buy",
  loanPreApprovalStatus: "not_applied",
  stage: "lead",
  temperature: "cold",
  brokerageContractType: "none",
  amlCheckStatus: "not_required",
});
const sharedPerson = await memory.addClient({
  tenantId: tenant.id,
  ownerUserId: owner.id,
  name: "Global visibility shared person",
  phone: "000-0000-0011",
  budgetType: "total_price",
  purpose: "buy",
  loanPreApprovalStatus: "not_applied",
  stage: "lead",
  temperature: "cold",
  brokerageContractType: "none",
  amlCheckStatus: "not_required",
});
const privateProperty = await memory.addProperty({
  tenantId: tenant.id,
  createdByUserId: owner.id,
  currentOwnerUserId: owner.id,
  name: "Global visibility private property",
  listingPrice: 1,
});
const sharedProperty = await memory.addProperty({
  tenantId: tenant.id,
  createdByUserId: owner.id,
  currentOwnerUserId: owner.id,
  name: "Global visibility shared property",
  listingPrice: 1,
});
const privateCase = await memory.saveBrokerageCaseExtractionReview({
  tenantId: tenant.id,
  userId: owner.id,
  caseType: "unit_sale",
  caseTitle: "Global visibility private case",
  confirmedDataJson: {},
  sourceImportJobIds: [],
  reviewItems: [],
});
const sharedCase = await memory.saveBrokerageCaseExtractionReview({
  tenantId: tenant.id,
  userId: owner.id,
  caseType: "unit_sale",
  caseTitle: "Global visibility shared case",
  confirmedDataJson: {},
  sourceImportJobIds: [],
  reviewItems: [],
});
await memory.setRecordVisibilityScope({ tenantId: tenant.id, objectType: "person", recordId: sharedPerson.id, actorUserId: owner.id, visibilityScope: "company_read" });
await memory.setRecordVisibilityScope({ tenantId: tenant.id, objectType: "property", recordId: sharedProperty.id, actorUserId: owner.id, visibilityScope: "company_read" });
await memory.setRecordVisibilityScope({ tenantId: tenant.id, objectType: "case", recordId: sharedCase.id, actorUserId: owner.id, visibilityScope: "company_read" });
const pendingProperty = await memory.addProperty({ tenantId: tenant.id, name: "Global visibility pending property", listingPrice: 1 });
const localizedLabelPerson = await memory.addClient({
  tenantId: tenant.id,
  ownerUserId: owner.id,
  name: "運用担当 佐伯 Performance",
  phone: "000-0000-0012",
  budgetType: "total_price",
  purpose: "buy",
  loanPreApprovalStatus: "not_applied",
  stage: "lead",
  temperature: "cold",
  brokerageContractType: "none",
  amlCheckStatus: "not_required",
});
const literalSearchPerson = await memory.addClient({
  tenantId: tenant.id,
  ownerUserId: owner.id,
  name: "Literal %_! token",
  phone: "000-0000-0013",
  budgetType: "total_price",
  purpose: "buy",
  loanPreApprovalStatus: "not_applied",
  stage: "lead",
  temperature: "cold",
  brokerageContractType: "none",
  amlCheckStatus: "not_required",
});
const limitVisibilitySharedPerson = await memory.addClient({
  tenantId: tenant.id,
  ownerUserId: owner.id,
  name: "Limit visibility shared",
  phone: "000-0000-0014",
  budgetType: "total_price",
  purpose: "buy",
  loanPreApprovalStatus: "not_applied",
  stage: "lead",
  temperature: "cold",
  brokerageContractType: "none",
  amlCheckStatus: "not_required",
});
await memory.setRecordVisibilityScope({ tenantId: tenant.id, objectType: "person", recordId: limitVisibilitySharedPerson.id, actorUserId: owner.id, visibilityScope: "company_read" });
for (let index = 0; index < 4; index += 1) {
  await memory.addClient({
    tenantId: tenant.id,
    ownerUserId: owner.id,
    name: `Limit visibility private ${index}`,
    phone: `000-0000-002${index}`,
    budgetType: "total_price",
    purpose: "buy",
    loanPreApprovalStatus: "not_applied",
    stage: "lead",
    temperature: "cold",
    brokerageContractType: "none",
    amlCheckStatus: "not_required",
  });
}

const ownerSearch = await hub.searchHubItems("ja", "Global visibility", 10, { requestContext: ownerContext, lifecycleStatus: "all" });
const colleagueSearch = await hub.searchHubItems("ja", "Global visibility", 10, { requestContext: colleagueContext, lifecycleStatus: "all" });
const colleagueCaseSearch = await hub.searchHubItems("ja", "案件", 10, { requestContext: colleagueContext, lifecycleStatus: "all" });
const colleagueSecretTitleSearch = await hub.searchHubItems("ja", "Global visibility shared case", 10, { requestContext: colleagueContext, lifecycleStatus: "all" });
const boundedOwnerSearch = await hub.searchHubItems("ja", "Global visibility", 1, { requestContext: ownerContext, lifecycleStatus: "all" });
const zhStoredLabelSearch = await hub.searchHubItems("zh", "運用担当", 10, { requestContext: ownerContext, lifecycleStatus: "all" });
const literalSearch = await hub.searchHubItems("ja", "%_!", 10, { requestContext: ownerContext, lifecycleStatus: "all" });
const boundedColleagueSearch = await hub.searchHubItems("ja", "Limit visibility", 1, { requestContext: colleagueContext, lifecycleStatus: "all" });
assert(ownerSearch.some((item) => item.id === privatePerson.id && item.entity === "party"), "owner search includes private person");
assert(ownerSearch.some((item) => item.id === privateProperty.id && item.entity === "property"), "owner search includes private property");
assert(ownerSearch.some((item) => item.id === privateCase.id && item.entity === "case"), "owner search includes private case");
assert(!colleagueSearch.some((item) => item.id === privatePerson.id || item.id === privateProperty.id || item.id === privateCase.id), "colleague search excludes private records");
assert(colleagueSearch.some((item) => item.id === sharedPerson.id && item.entity === "party"), "colleague search includes company_read person");
assert(colleagueSearch.some((item) => item.id === sharedProperty.id && item.entity === "property"), "colleague search includes company_read property");
assert(colleagueCaseSearch.some((item) => item.id === sharedCase.id && item.entity === "case"), "colleague search includes company_read case");
assert(colleagueCaseSearch.find((item) => item.id === sharedCase.id)?.title === "案件", "company_read case title is redacted in search");
assert(!colleagueSecretTitleSearch.some((item) => item.id === sharedCase.id || item.title.includes("Global visibility shared case")), "company_read secret title is not searchable or returned");
assert(!ownerSearch.some((item) => item.id === pendingProperty.id), "pending property is absent from search");
for (const entity of ["case", "property", "party"]) {
  assert(boundedOwnerSearch.filter((item) => item.entity === entity).length <= 1, `search bounds ${entity} results before returning`);
}
assert(zhStoredLabelSearch.some((item) => item.id === localizedLabelPerson.id && item.title === "運用担当 佐伯 Performance"), "search and displayed title use the same stored value in zh");
assert(literalSearch.some((item) => item.id === literalSearchPerson.id), "search treats percent underscore and escape marker as literal text");
assert(boundedColleagueSearch.some((item) => item.id === limitVisibilitySharedPerson.id), "visibility is resolved before the per-entity limit");

const ownerProperties = await hub.listHubProperties("ja", { requestContext: ownerContext, lifecycleStatus: "all" });
const colleagueProperties = await hub.listHubProperties("ja", { requestContext: colleagueContext, lifecycleStatus: "all" });
const ownerParties = await hub.listHubParties("ja", { requestContext: ownerContext, lifecycleStatus: "all" });
const colleagueParties = await hub.listHubParties("ja", { requestContext: colleagueContext, lifecycleStatus: "all" });
assert(ownerProperties.some((item) => item.id === privateProperty.id && item.canWrite), "owner property export candidate is writable");
assert(colleagueProperties.some((item) => item.id === sharedProperty.id && !item.canWrite), "company_read property is readable but not exportable");
assert(ownerParties.some((item) => item.id === privatePerson.id && item.canWrite), "owner person export candidate is writable");
assert(colleagueParties.some((item) => item.id === sharedPerson.id && !item.canWrite), "company_read person is readable but not exportable");

const ownerCaseList = await memory.listBrokerageCasesForContext({ context: ownerContext, lifecycleStatus: "all" });
const colleagueCaseList = await memory.listBrokerageCasesForContext({ context: colleagueContext, lifecycleStatus: "all" });
assert(ownerCaseList.some((item) => item.brokerageCase?.id === privateCase.id && item.resolution.canWrite), "owner case export candidate is writable");
assert(colleagueCaseList.some((item) => item.brokerageCase?.id === sharedCase.id && !item.resolution.canWrite), "company_read case is readable but not exportable");

const ownerWriteCandidates = await memory.listClientsForContext({ context: colleagueContext, filter: { lifecycleStatus: "all" } });
assert(!ownerWriteCandidates.some((item) => item.client.id === sharedPerson.id && item.resolution.canWrite), "candidate selector cannot promote company_read person");
assert(!(await memory.listPropertiesForContext({ context: colleagueContext, lifecycleStatus: "all" })).some((item) => item.property.id === sharedProperty.id && item.resolution.canWrite), "candidate selector cannot promote company_read property");

console.log("global-visibility surfaces behavior: PASS");
