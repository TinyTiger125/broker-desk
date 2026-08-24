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

const ownerSession = await trustedSession(owner.externalAuthSubject);
const colleagueSession = await trustedSession(colleague.externalAuthSubject);
const ownerMembership = ownerSession.membership;
const ownerContext = resolver.createRequestContext(ownerSession);
const colleagueContext = resolver.createRequestContext(colleagueSession);

await assert.rejects(
  async () => resolver.createRequestContext({ ...ownerSession, membership: { ...ownerMembership, status: "suspended" } }),
  resolver.RequestContextError,
  "suspended membership cannot create context",
);
await assert.rejects(
  async () => resolver.createRequestContext({ ...ownerSession, membership: { ...ownerMembership, tenantId: "tenant_other" } }),
  resolver.RequestContextError,
  "foreign tenant membership cannot create context",
);
await assert.rejects(
  async () => resolver.createRequestContext({ ...ownerSession, externalAuthSubject: null }),
  resolver.RequestContextError,
  "missing current authentication subject cannot create context",
);
await assert.rejects(
  async () => resolver.createRequestContext({ ...ownerSession, externalAuthSubject: colleague.externalAuthSubject, user: ownerSession.user }),
  resolver.RequestContextError,
  "assembled subject/user input cannot create context",
);

const commonInput = {
  name: "W9.2 resolver person",
  phone: "000-0000-0000",
  budgetType: "total_price",
  purpose: "buy",
  loanPreApprovalStatus: "not_applied",
  stage: "lead",
  temperature: "cold",
  brokerageContractType: "none",
  amlCheckStatus: "not_required",
};
const person = await memory.addClient({ tenantId: tenant.id, ownerUserId: owner.id, ...commonInput });
const ownerPersonList = await memory.listClientsForContext({ context: ownerContext, filter: { lifecycleStatus: "all" } });
assert(ownerPersonList.some((item) => item.client.id === person.id && item.resolution.outcome === "owner_write"), "owner person list includes private person");
const colleaguePrivatePersonList = await memory.listClientsForContext({ context: colleagueContext, filter: { lifecycleStatus: "all" } });
assert(!colleaguePrivatePersonList.some((item) => item.client.id === person.id), "private person is absent from colleague list and count");
const ownerPersonDetail = await memory.getClientDetailForContext({ context: ownerContext, clientId: person.id });
assert(ownerPersonDetail.detail && ownerPersonDetail.resolution.canWrite, "owner person detail is writable");
const colleaguePrivatePersonDetail = await memory.getClientDetailForContext({ context: colleagueContext, clientId: person.id });
assert.equal(colleaguePrivatePersonDetail.detail, null, "private person direct detail is uniform not-found");
const property = await memory.addProperty({ tenantId: tenant.id, createdByUserId: owner.id, currentOwnerUserId: owner.id, name: "W9.2 resolver property", listingPrice: 1 });
const brokerageCase = await memory.saveBrokerageCaseExtractionReview({
  tenantId: tenant.id,
  userId: owner.id,
  caseType: "unit_sale",
  caseTitle: "W9.2 resolver case",
  confirmedDataJson: {},
  sourceImportJobIds: [],
  reviewItems: [],
});

for (const [label, probe] of [
  ["person", () => memory.resolveClientVisibilityForContext({ context: ownerContext, clientId: person.id })],
  ["property", () => memory.resolvePropertyVisibilityForContext({ context: ownerContext, propertyId: property.id })],
  ["case", () => memory.resolveCaseVisibilityForContext({ context: ownerContext, caseId: brokerageCase.id })],
]) {
  const ownerResult = await probe();
  assert.equal(ownerResult.resolution.outcome, "owner_write", `${label} owner read/write`);
  assert(ownerResult.record, `${label} owner receives record`);
}

for (const [label, probe] of [
  ["person", () => memory.resolveClientVisibilityForContext({ context: colleagueContext, clientId: person.id })],
  ["property", () => memory.resolvePropertyVisibilityForContext({ context: colleagueContext, propertyId: property.id })],
  ["case", () => memory.resolveCaseVisibilityForContext({ context: colleagueContext, caseId: brokerageCase.id })],
]) {
  const privateResult = await probe();
  assert.equal(privateResult.resolution.outcome, "not_accessible", `${label} private colleague denied`);
  assert.equal(privateResult.record, null, `${label} private colleague gets no record`);
}

await memory.setRecordVisibilityScope({ tenantId: tenant.id, objectType: "person", recordId: person.id, actorUserId: owner.id, visibilityScope: "company_read" });
await memory.setRecordVisibilityScope({ tenantId: tenant.id, objectType: "property", recordId: property.id, actorUserId: owner.id, visibilityScope: "company_read" });
await memory.setRecordVisibilityScope({ tenantId: tenant.id, objectType: "case", recordId: brokerageCase.id, actorUserId: owner.id, visibilityScope: "company_read" });
for (const [label, probe] of [
  ["person", () => memory.resolveClientVisibilityForContext({ context: colleagueContext, clientId: person.id })],
  ["property", () => memory.resolvePropertyVisibilityForContext({ context: colleagueContext, propertyId: property.id })],
  ["case", () => memory.resolveCaseVisibilityForContext({ context: colleagueContext, caseId: brokerageCase.id })],
]) {
  const companyResult = await probe();
  assert.equal(companyResult.resolution.outcome, "company_read", `${label} company_read colleague read`);
  assert.equal(companyResult.resolution.canWrite, false, `${label} company_read colleague write denied`);
}
const colleaguePersonList = await memory.listClientsForContext({ context: colleagueContext, filter: { lifecycleStatus: "all" } });
assert(colleaguePersonList.some((item) => item.client.id === person.id && item.resolution.outcome === "company_read" && !item.resolution.canWrite), "company_read person is readable and read-only");
const colleaguePersonDetail = await memory.getClientDetailForContext({ context: colleagueContext, clientId: person.id });
assert(colleaguePersonDetail.detail && colleaguePersonDetail.resolution.outcome === "company_read", "company_read person direct detail is readable");

const privateReferencedProperty = await memory.addProperty({
  tenantId: tenant.id,
  createdByUserId: colleague.id,
  currentOwnerUserId: colleague.id,
  name: "W9.2 private referenced property",
  listingPrice: 1,
});
await memory.addQuotation({
  tenantId: tenant.id,
  clientId: person.id,
  propertyId: privateReferencedProperty.id,
  quoteTitle: "W9.2 hidden quotation",
  listingPrice: 1,
  brokerageFee: 0,
  taxFee: 0,
  managementFee: 0,
  repairFee: 0,
  otherFee: 0,
  downPayment: 0,
  interestRate: 0,
  loanYears: 1,
  summaryText: "must not leak",
});
const ownerDetailWithHiddenPropertyQuote = await memory.getClientDetailForContext({ context: ownerContext, clientId: person.id });
assert(
  ownerDetailWithHiddenPropertyQuote.detail && !ownerDetailWithHiddenPropertyQuote.detail.quotations.some((quote) => quote.id && quote.propertyId === privateReferencedProperty.id),
  "unreadable referenced property removes the entire quotation projection",
);
const ownerPersonListAfterHiddenQuote = await memory.listClientsForContext({ context: ownerContext, filter: { lifecycleStatus: "all" } });
assert.equal(ownerPersonListAfterHiddenQuote.find((item) => item.client.id === person.id)?._count.quotations, 0, "person list count excludes unreadable referenced quotations");

const pendingProperty = await memory.addProperty({ tenantId: tenant.id, name: "W9.2 pending property", listingPrice: 1 });
const pendingResult = await memory.resolvePropertyVisibilityForContext({ context: ownerContext, propertyId: pendingProperty.id });
assert.equal(pendingResult.resolution.outcome, "not_accessible", "pending is hidden even from owner/admin");

const forgedTenantContext = Object.freeze({ ...ownerContext, tenantId: "tenant_other" });
assert.equal(
  (await memory.resolveClientVisibilityForContext({ context: forgedTenantContext, clientId: person.id })).resolution.outcome,
  "not_accessible",
  "tenant switching invalidates the old context",
);
const untrustedQueryContext = JSON.parse(JSON.stringify(ownerContext));
assert.equal(
  resolver.resolveRecordVisibility(untrustedQueryContext, person).outcome,
  "not_accessible",
  "plain query/body context cannot impersonate a trusted context",
);
const spreadOverrideContext = Object.freeze({ ...ownerContext, userId: colleague.id, tenantId: "tenant_other" });
assert.equal(
  resolver.resolveRecordVisibility(spreadOverrideContext, person).outcome,
  "not_accessible",
  "spread query/body overrides cannot forge or mutate a trusted context",
);
const missing = await memory.resolveClientVisibilityForContext({ context: ownerContext, clientId: "missing-record" });
assert.equal(missing.resolution.outcome, "not_accessible", "missing record has same external decision");
assert.equal(missing.record, null, "missing record has no data");

const legacyOnlyRecord = {
  tenantId: tenant.id,
  userId: colleague.id,
  ownerUserId: colleague.id,
  currentOwnerUserId: owner.id,
  visibilityScope: "private",
  ownerResolutionStatus: "resolved",
};
assert.equal(resolver.resolveRecordVisibility(ownerContext, legacyOnlyRecord).outcome, "owner_write", "legacy fields do not override current owner");
assert.equal(resolver.resolveRecordVisibility(colleagueContext, legacyOnlyRecord).outcome, "not_accessible", "legacy owner is not an auth fallback");

const ownerCaseList = await memory.listBrokerageCasesForContext({ context: ownerContext, lifecycleStatus: "all" });
assert(ownerCaseList.some((item) => item.brokerageCase?.id === brokerageCase.id && item.resolution.outcome === "owner_write"), "owner case list includes private case");
const colleagueCaseList = await memory.listBrokerageCasesForContext({ context: colleagueContext, lifecycleStatus: "all" });
assert(colleagueCaseList.some((item) => item.brokerageCase?.id === brokerageCase.id && item.resolution.outcome === "company_read"), "company_read case list includes readable case");
const colleagueCaseLookup = await memory.getBrokerageCaseByIdForContext({ context: colleagueContext, caseId: brokerageCase.id });
assert.equal(colleagueCaseLookup.resolution.outcome, "company_read", "company_read case direct URL is readable");
assert.equal(
  await memory.updateBrokerageCaseConfirmedData({ tenantId: tenant.id, userId: colleague.id, caseId: brokerageCase.id, confirmedDataJson: { forged: true } }),
  null,
  "company_read member cannot write a case through the repository",
);
assert(
  await memory.updateBrokerageCaseConfirmedData({ tenantId: tenant.id, userId: owner.id, caseId: brokerageCase.id, confirmedDataJson: { ownerWrite: true } }),
  "owner can write a company_read case through the repository",
);

console.log("visibility-resolver behavior: PASS");
