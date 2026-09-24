import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  if (request === "@clerk/nextjs/server") return { auth: async () => ({ userId: currentSubject }), currentUser: async () => null };
  if (request === "react") return { ...originalLoad.call(this, request, parent, ...rest), cache: (fn) => fn };
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
const access = require(resolve(root, "src/lib/w93-access.ts"));
const hub = require(resolve(root, "src/lib/hub.ts"));
const sessionProvenance = require(resolve(root, "src/lib/tenant-session-provenance.ts"));

memory.seedBusinessDataForQa();
const tenant = await memory.getTenantById("tenant_cherry");
const owner = await memory.getUserById("user_demo");
const colleague = await memory.getUserById("user_ops");
assert(tenant && owner && colleague && owner.externalAuthSubject && colleague.externalAuthSubject, "memory identities exist");
async function trustedSession(subject) {
  currentSubject = subject;
  const user = await memory.getUserByExternalAuthSubject(subject);
  assert(user, `memory user exists for ${subject}`);
  const membership = (await memory.listTenantMemberships(user.id)).find((item) => item.tenantId === tenant.id && item.status === "active");
  assert(membership, `active membership exists for ${subject}`);
  const session = { externalAuthSubject: subject, user, membership, tenant, serviceState: { state: "operational" } };
  sessionProvenance.registerTenantSessionProvenance(session);
  return session;
}
const ownerContext = resolver.createRequestContext(await trustedSession(owner.externalAuthSubject));
const colleagueContext = resolver.createRequestContext(await trustedSession(colleague.externalAuthSubject));

const privateProperty = await memory.addProperty({ tenantId: tenant.id, createdByUserId: owner.id, currentOwnerUserId: owner.id, name: "W93 private property", listingPrice: 1 });
const colleaguePrivateProperty = await memory.addProperty({ tenantId: tenant.id, createdByUserId: colleague.id, currentOwnerUserId: colleague.id, name: "W93 colleague private property", listingPrice: 1 });
const sharedProperty = await memory.addProperty({ tenantId: tenant.id, createdByUserId: owner.id, currentOwnerUserId: owner.id, name: "W93 shared property", listingPrice: 1 });
const privateParty = await memory.addClient({ tenantId: tenant.id, ownerUserId: owner.id, name: "W93 private party", phone: "000", budgetType: "total_price", purpose: "buy", loanPreApprovalStatus: "not_applied", stage: "lead", temperature: "cold", brokerageContractType: "none", amlCheckStatus: "not_required" });
const colleaguePrivateParty = await memory.addClient({ tenantId: tenant.id, ownerUserId: colleague.id, name: "W93 colleague private party", phone: "002", budgetType: "total_price", purpose: "buy", loanPreApprovalStatus: "not_applied", stage: "lead", temperature: "cold", brokerageContractType: "none", amlCheckStatus: "not_required" });
const sharedParty = await memory.addClient({ tenantId: tenant.id, ownerUserId: owner.id, name: "W93 shared party", phone: "001", budgetType: "total_price", purpose: "buy", loanPreApprovalStatus: "not_applied", stage: "lead", temperature: "cold", brokerageContractType: "none", amlCheckStatus: "not_required" });
const ownerCase = await memory.saveBrokerageCaseExtractionReview({ tenantId: tenant.id, userId: owner.id, caseType: "unit_sale", caseTitle: "W93 owner case", confirmedDataJson: {}, sourceImportJobIds: [], reviewItems: [] });
const sharedCase = await memory.saveBrokerageCaseExtractionReview({ tenantId: tenant.id, userId: owner.id, caseType: "unit_sale", caseTitle: "W93 shared case", confirmedDataJson: {}, sourceImportJobIds: [], reviewItems: [] });
await memory.setRecordVisibilityScope({ tenantId: tenant.id, objectType: "person", recordId: sharedParty.id, actorUserId: owner.id, visibilityScope: "company_read" });
await memory.setRecordVisibilityScope({ tenantId: tenant.id, objectType: "property", recordId: sharedProperty.id, actorUserId: owner.id, visibilityScope: "company_read" });
await memory.setRecordVisibilityScope({ tenantId: tenant.id, objectType: "case", recordId: sharedCase.id, actorUserId: owner.id, visibilityScope: "company_read" });

assert((await access.resolveW93Parent(ownerContext, "property", privateProperty.id)).canRead, "owner reads private property parent");
assert(!(await access.resolveW93Parent(colleagueContext, "property", privateProperty.id)).canRead, "colleague cannot read private property parent");
assert((await access.resolveW93Parent(colleagueContext, "property", sharedProperty.id)).canRead, "colleague reads company_read property parent");
assert((await access.resolveW93Parent(colleagueContext, "party", sharedParty.id)).canRead, "colleague reads company_read party parent");
assert(!(await access.resolveW93Parent(colleagueContext, "case", ownerCase.id)).canRead, "colleague cannot read private case parent");
assert((await access.resolveW93Parent(colleagueContext, "case", sharedCase.id)).canRead, "colleague reads company_read case parent");

const mixedSourceCase = await memory.saveBrokerageCaseExtractionReview({
  tenantId: tenant.id,
  userId: owner.id,
  caseType: "unit_sale",
  caseTitle: "W93 mixed source case",
  primaryPropertyId: privateProperty.id,
  confirmedDataJson: { __primaryPropertyId: colleaguePrivateProperty.id },
  sourceImportJobIds: [],
  reviewItems: [],
});
assert.equal(await access.areCaseSourcesReadable(ownerContext, mixedSourceCase), false, "every explicit property source must be readable");
const malformedSourceCase = await memory.saveBrokerageCaseExtractionReview({
  tenantId: tenant.id,
  userId: owner.id,
  caseType: "unit_sale",
  caseTitle: "W93 malformed source case",
  primaryPropertyId: privateProperty.id,
  confirmedDataJson: { __primaryPropertyId: "" },
  sourceImportJobIds: [],
  reviewItems: [],
});
assert.equal(await access.areCaseSourcesReadable(ownerContext, malformedSourceCase), false, "malformed explicit property source fails closed");

const inaccessibleQuote = await memory.addQuotation({
  tenantId: tenant.id,
  clientId: colleaguePrivateParty.id,
  propertyId: colleaguePrivateProperty.id,
  quoteTitle: "W93 colleague private quote",
  listingPrice: 1,
  brokerageFee: 1,
  taxFee: 1,
  managementFee: 1,
  repairFee: 1,
  otherFee: 1,
  downPayment: 1,
  interestRate: 1,
  loanYears: 1,
  summaryText: "private",
});
const quoteAttachment = await memory.addPrivateAttachment({ tenantId: tenant.id, userId: colleague.id, targetType: "quote", targetId: inaccessibleQuote.id, fileName: "quote.pdf", fileType: "application/pdf", content: Buffer.from("quote") });
assert.equal(await access.getW93AttachmentForContext(ownerContext, quoteAttachment.id), null, "non-owner cannot download private quote attachment");
assert(await access.getW93AttachmentForContext(colleagueContext, quoteAttachment.id), "quote owner can download private quote attachment");
assert(!(await hub.listHubAttachments("ja", 30, { userId: colleague.id, tenantId: tenant.id, requestContext: ownerContext })).some((item) => item.id === quoteAttachment.id), "non-owner quote attachment is absent from list metadata");
assert((await memory.listQuotationsForContext({ context: colleagueContext })).some((quote) => quote.id === inaccessibleQuote.id), "quote owner sees private quote in context-bound list");
assert(!(await memory.listQuotationsForContext({ context: ownerContext })).some((quote) => quote.id === inaccessibleQuote.id), "non-owner cannot see private quote in context-bound list");
assert(await memory.getQuotationByIdForContext({ context: colleagueContext, quoteId: inaccessibleQuote.id }), "quote owner sees private quote detail");
assert.equal(await memory.getQuotationByIdForContext({ context: ownerContext, quoteId: inaccessibleQuote.id }), null, "non-owner cannot open private quote detail");
await memory.setRecordVisibilityScope({ tenantId: tenant.id, objectType: "person", recordId: colleaguePrivateParty.id, actorUserId: colleague.id, visibilityScope: "company_read" });
await memory.setRecordVisibilityScope({ tenantId: tenant.id, objectType: "property", recordId: colleaguePrivateProperty.id, actorUserId: colleague.id, visibilityScope: "company_read" });
assert((await memory.listQuotationsForContext({ context: ownerContext })).some((quote) => quote.id === inaccessibleQuote.id), "company_read quote is visible to another active member");
assert((await memory.getQuotationByIdForContext({ context: ownerContext, quoteId: inaccessibleQuote.id }))?.id === inaccessibleQuote.id, "company_read quote detail is visible to another active member");
assert(await access.getW93AttachmentForContext(ownerContext, quoteAttachment.id), "company_read quote attachment remains downloadable");
await memory.setRecordVisibilityScope({ tenantId: tenant.id, objectType: "person", recordId: colleaguePrivateParty.id, actorUserId: colleague.id, visibilityScope: "private" });
await memory.setRecordVisibilityScope({ tenantId: tenant.id, objectType: "property", recordId: colleaguePrivateProperty.id, actorUserId: colleague.id, visibilityScope: "private" });
assert.equal(await access.getW93AttachmentForContext(ownerContext, quoteAttachment.id), null, "revoked quote attachment download is denied");
await memory.setPropertyLifecycleStatus({ tenantId: tenant.id, propertyId: inaccessibleQuote.propertyId, status: "archived", archivedById: colleague.id });
assert((await memory.listQuotationsForContext({ context: colleagueContext })).some((quote) => quote.id === inaccessibleQuote.id), "archived property quote remains in authorized quote list");
assert((await memory.getQuotationByIdForContext({ context: colleagueContext, quoteId: inaccessibleQuote.id }))?.id === inaccessibleQuote.id, "archived property quote detail remains readable");
await memory.setPropertyLifecycleStatus({ tenantId: tenant.id, propertyId: inaccessibleQuote.propertyId, status: "active", archivedById: colleague.id });
const unknownQuoteAttachment = await memory.addPrivateAttachment({ tenantId: tenant.id, userId: owner.id, targetType: "quote", targetId: "quote_missing", fileName: "unknown-quote.pdf", fileType: "application/pdf", content: Buffer.from("unknown") });
assert.equal(await access.getW93AttachmentForContext(ownerContext, unknownQuoteAttachment.id), null, "unknown quote attachment fails closed");
const foreignPerson = await memory.addClient({ tenantId: "tenant_visibility_other", ownerUserId: owner.id, name: "W93 foreign quote person", phone: "003", budgetType: "total_price", purpose: "buy", loanPreApprovalStatus: "not_applied", stage: "lead", temperature: "cold", brokerageContractType: "none", amlCheckStatus: "not_required" });
const foreignQuote = await memory.addQuotation({ tenantId: "tenant_visibility_other", clientId: foreignPerson.id, quoteTitle: "W93 foreign quote", listingPrice: 1, brokerageFee: 1, taxFee: 1, managementFee: 1, repairFee: 1, otherFee: 1, downPayment: 1, interestRate: 1, loanYears: 1, summaryText: "foreign" });
const foreignQuoteAttachment = await memory.addPrivateAttachment({ tenantId: "tenant_visibility_other", userId: owner.id, targetType: "quote", targetId: foreignQuote.id, fileName: "foreign-quote.pdf", fileType: "application/pdf", content: Buffer.from("foreign") });
assert.equal(await access.getW93AttachmentForContext(ownerContext, foreignQuoteAttachment.id), null, "cross-tenant quote attachment fails closed");
const malformedEmptyQuoteCase = await memory.saveBrokerageCaseExtractionReview({
  tenantId: tenant.id,
  userId: owner.id,
  caseType: "unit_sale",
  caseTitle: "W93 malformed empty quote case",
  confirmedDataJson: { __primaryQuoteId: "" },
  sourceImportJobIds: [],
  reviewItems: [],
});
assert.equal(await access.areCaseSourcesReadable(ownerContext, malformedEmptyQuoteCase), false, "empty explicit quote source fails closed");
assert.throws(() => access.withW93SourceProvenance(malformedEmptyQuoteCase), /case_source_provenance_invalid/, "malformed quote provenance cannot be persisted");
const malformedTypedQuoteCase = await memory.saveBrokerageCaseExtractionReview({
  tenantId: tenant.id,
  userId: owner.id,
  caseType: "unit_sale",
  caseTitle: "W93 malformed typed quote case",
  confirmedDataJson: { __quoteId: 42 },
  sourceImportJobIds: [],
  reviewItems: [],
});
assert.equal(await access.areCaseSourcesReadable(ownerContext, malformedTypedQuoteCase), false, "non-string explicit quote source fails closed");
const inaccessibleQuoteCase = await memory.saveBrokerageCaseExtractionReview({
  tenantId: tenant.id,
  userId: owner.id,
  caseType: "unit_sale",
  caseTitle: "W93 inaccessible quote case",
  confirmedDataJson: { __primaryQuoteId: inaccessibleQuote.id },
  sourceImportJobIds: [],
  reviewItems: [],
});
assert.equal(await access.areCaseSourcesReadable(ownerContext, inaccessibleQuoteCase), false, "inaccessible explicit quote source is rejected");

const persistedProvenance = access.withW93SourceProvenance(ownerCase);
assert.deepEqual(persistedProvenance.__w93SourceIds, { partyIds: [], propertyIds: [], quoteIds: [] }, "generated history persists source provenance");
const generatedWithProvenance = await memory.addGeneratedOutput({ tenantId: tenant.id, userId: owner.id, actorId: owner.id, outputType: "guarantee_application", outputFormat: "pdf", language: "ja", title: "W93 output", documentNumber: "W93-1", caseId: ownerCase.id, inputDataSnapshot: persistedProvenance });
assert.equal(await access.areGeneratedOutputSourcesReadable(ownerContext, generatedWithProvenance), true, "new history with provenance remains readable");
const legacyBytes = Buffer.from("W93 legacy PDF bytes");
const legacyAttachment = await memory.addPrivateAttachment({ tenantId: tenant.id, userId: owner.id, targetType: "guarantee_generated_output", targetId: "legacy-output", fileName: "legacy.pdf", fileType: "application/pdf", content: legacyBytes });
const legacyWithoutProvenance = await memory.addGeneratedOutput({
  tenantId: tenant.id, userId: owner.id, actorId: owner.id, outputType: "guarantee_application", outputFormat: "pdf", language: "ja",
  title: "W93 legacy output", documentNumber: "W93-2", caseId: ownerCase.id, templateId: "company_mask",
  inputDataSnapshot: ownerCase.confirmedDataJson, sourceProvenanceVersion: "legacy-v1", fileAttachmentId: legacyAttachment.id,
  fileSha256: createHash("sha256").update(legacyBytes).digest("hex"), fileSizeBytes: legacyBytes.length, fileMimeType: "application/pdf",
  blankFormVersionId: "legacy-blank-v1", companyMaskVersionId: "legacy-mask-v1", fieldCatalogVersion: "legacy-fields-v1",
  previewConfirmationId: "legacy-confirmation", caseInputSnapshotHash: "legacy-case-snapshot",
});
assert.equal(await access.areGeneratedOutputSourcesReadable(ownerContext, legacyWithoutProvenance), true, "trusted legacy history remains readable for current owner");
assert.equal(await access.areGeneratedOutputSourcesReadable(colleagueContext, legacyWithoutProvenance), false, "trusted legacy history remains owner-only");
const newWithoutProvenance = await memory.addGeneratedOutput({
  tenantId: tenant.id, userId: owner.id, actorId: owner.id, outputType: "guarantee_application", outputFormat: "pdf", language: "ja",
  title: "W93 unproven new output", documentNumber: "W93-2-new", caseId: ownerCase.id, templateId: "company_mask",
  inputDataSnapshot: ownerCase.confirmedDataJson, fileAttachmentId: legacyAttachment.id,
  fileSha256: createHash("sha256").update(legacyBytes).digest("hex"), fileSizeBytes: legacyBytes.length, fileMimeType: "application/pdf",
  blankFormVersionId: "new-blank-v1", companyMaskVersionId: "new-mask-v1", fieldCatalogVersion: "new-fields-v1",
  previewConfirmationId: "new-confirmation", caseInputSnapshotHash: "new-case-snapshot",
});
assert.equal(await access.areGeneratedOutputSourcesReadable(ownerContext, newWithoutProvenance), false, "new output without provenance remains fail-closed");
const legacyMalformedQuote = await memory.addGeneratedOutput({ tenantId: tenant.id, userId: owner.id, actorId: owner.id, outputType: "guarantee_application", outputFormat: "pdf", language: "ja", title: "W93 malformed quote output", documentNumber: "W93-3", caseId: ownerCase.id, inputDataSnapshot: { __primaryQuoteId: "" } });
assert.equal(await access.areGeneratedOutputSourcesReadable(ownerContext, legacyMalformedQuote), false, "legacy malformed quote provenance fails closed");
const historicalPrivateQuote = await memory.addGeneratedOutput({
  tenantId: tenant.id,
  userId: owner.id,
  actorId: owner.id,
  outputType: "guarantee_application",
  outputFormat: "pdf",
  language: "ja",
  title: "W93 source changed output",
  documentNumber: "W93-4",
  caseId: ownerCase.id,
  inputDataSnapshot: { __w93SourceIds: { partyIds: [], propertyIds: [], quoteIds: [inaccessibleQuote.id] } },
});
assert.equal(await access.areGeneratedOutputSourcesReadable(ownerContext, historicalPrivateQuote), false, "history keeps generation-time inaccessible quote blocked after current case sources change");

const ownerAttachment = await memory.addPrivateAttachment({ tenantId: tenant.id, userId: owner.id, targetType: "property", targetId: privateProperty.id, fileName: "w93.txt", content: Buffer.from("private") });
assert(await access.getW93AttachmentForContext(ownerContext, ownerAttachment.id), "owner attachment is readable");
assert.equal(await access.getW93AttachmentForContext(colleagueContext, ownerAttachment.id), null, "colleague attachment is hidden with its parent");
assert((await hub.listHubAttachments("ja", 30, { userId: owner.id, tenantId: tenant.id, requestContext: ownerContext })).some((item) => item.id === ownerAttachment.id), "owner attachment list includes readable parent");
assert(!(await hub.listHubAttachments("ja", 30, { userId: owner.id, tenantId: tenant.id, requestContext: colleagueContext })).some((item) => item.id === ownerAttachment.id), "attachment list hides unreadable parent metadata");
const seededContractAttachment = await access.getW93AttachmentForContext(ownerContext, "att_contract_yamada");
assert.equal(seededContractAttachment, null, "legacy contract with unresolved property fails closed");
const contractQuote = await memory.addQuotation({
  tenantId: tenant.id,
  clientId: privateParty.id,
  propertyId: privateProperty.id,
  quoteTitle: "W93 contract quote",
  listingPrice: 1,
  brokerageFee: 1,
  taxFee: 1,
  managementFee: 1,
  repairFee: 1,
  otherFee: 1,
  downPayment: 1,
  interestRate: 1,
  loanYears: 1,
  summaryText: "contract",
});
const contractAttachment = await memory.addPrivateAttachment({ tenantId: tenant.id, userId: owner.id, targetType: "contract", targetId: contractQuote.id, fileName: "contract.pdf", fileType: "application/pdf", content: Buffer.from("contract") });
assert(await access.getW93AttachmentForContext(ownerContext, contractAttachment.id), "contract owner can retrieve contract with readable person and property");
assert.equal(await access.getW93AttachmentForContext(colleagueContext, contractAttachment.id), null, "non-owner cannot retrieve private contract");
await memory.setRecordVisibilityScope({ tenantId: tenant.id, objectType: "person", recordId: privateParty.id, actorUserId: owner.id, visibilityScope: "company_read" });
assert.equal(await access.getW93AttachmentForContext(colleagueContext, contractAttachment.id), null, "company-read person cannot expose contract when property is private");
await memory.setRecordVisibilityScope({ tenantId: tenant.id, objectType: "property", recordId: privateProperty.id, actorUserId: owner.id, visibilityScope: "company_read" });
assert(await access.getW93AttachmentForContext(colleagueContext, contractAttachment.id), "contract follows readable person and property intersection");
await memory.setRecordVisibilityScope({ tenantId: tenant.id, objectType: "person", recordId: privateParty.id, actorUserId: owner.id, visibilityScope: "private" });
assert.equal(await access.getW93AttachmentForContext(colleagueContext, contractAttachment.id), null, "private person revokes contract despite shared property");
await memory.setRecordVisibilityScope({ tenantId: tenant.id, objectType: "property", recordId: privateProperty.id, actorUserId: owner.id, visibilityScope: "private" });
const importedAttachment = await memory.addPrivateAttachment({ tenantId: tenant.id, userId: owner.id, targetType: "import_job", targetId: "w93-import-job", fileName: "residence-card.pdf", fileType: "application/pdf", content: Buffer.from("linked source") });
assert(await access.getW93AttachmentForContext(ownerContext, importedAttachment.id), "owner can retrieve an unlinked personal import source");
assert.equal(await access.getW93AttachmentForContext(colleagueContext, importedAttachment.id), null, "another member cannot retrieve an unlinked personal import source");
assert((await hub.listHubAttachments("ja", 30, { userId: owner.id, tenantId: tenant.id, requestContext: ownerContext })).some((item) => item.id === importedAttachment.id), "owner attachment list includes unlinked personal import source");
const foreignImportAttachment = await memory.addPrivateAttachment({ tenantId: "tenant_visibility_other", userId: owner.id, targetType: "import_job", targetId: "foreign-import-job", fileName: "foreign-source.pdf", fileType: "application/pdf", content: Buffer.from("foreign source") });
assert.equal(await access.getW93AttachmentForContext(ownerContext, foreignImportAttachment.id), null, "cross-tenant unlinked import source fails closed");
const unreadableLinkedImport = await memory.addPrivateAttachment({ tenantId: tenant.id, userId: owner.id, targetType: "import_job", targetId: "unreadable-linked-import", fileName: "unreadable-linked.pdf", fileType: "application/pdf", content: Buffer.from("unreadable linked") });
await memory.linkAttachmentToObject({ tenantId: tenant.id, attachmentId: unreadableLinkedImport.id, targetType: "property", targetId: colleaguePrivateProperty.id, category: "identity", createdByUserId: owner.id });
assert.equal(await access.getW93AttachmentForContext(ownerContext, unreadableLinkedImport.id), null, "uploader cannot fallback through an unreadable attachment link");
assert(!(await hub.listHubAttachments("ja", 30, { userId: owner.id, tenantId: tenant.id, requestContext: ownerContext })).some((item) => item.id === unreadableLinkedImport.id), "attachment list follows W93 denial for unreadable linked import source");
const importedCase = await memory.saveBrokerageCaseExtractionReview({
  tenantId: tenant.id,
  userId: owner.id,
  caseType: "unit_sale",
  caseTitle: "W93 import source case",
  confirmedDataJson: {},
  sourceImportJobIds: [],
  reviewItems: [],
});
await memory.createObjectImportTarget({
  id: "w93-object-import-target",
  tenantId: tenant.id,
  userId: owner.id,
  caseId: importedCase.id,
  importJobId: "w93-import-job",
  targetType: "property",
  targetId: privateProperty.id,
  targetVersion: "v1",
  sourceAttachmentId: importedAttachment.id,
  status: "queued",
  idempotencyKey: "w93-object-import",
  attemptCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
});
assert(await access.getW93AttachmentForContext(ownerContext, importedAttachment.id), "a source attachment follows its readable import-job case parent");
assert.equal(await access.getW93AttachmentForContext(colleagueContext, importedAttachment.id), null, "an import-job source remains hidden when its case is not readable");
assert((await hub.listHubAttachments("ja", 30, { userId: owner.id, tenantId: tenant.id, requestContext: ownerContext })).some((item) => item.id === importedAttachment.id), "owner attachment list includes linked import source");
assert(!(await hub.listHubAttachments("ja", 30, { userId: owner.id, tenantId: tenant.id, requestContext: colleagueContext })).some((item) => item.id === importedAttachment.id), "attachment list hides import source with unreadable case parent");
const firstLink = await memory.linkAttachmentToObject({ tenantId: tenant.id, attachmentId: importedAttachment.id, targetType: "property", targetId: sharedProperty.id, category: "identity", sourceImportJobId: "w93-import-job", createdByUserId: owner.id });
const duplicateLink = await memory.linkAttachmentToObject({ tenantId: tenant.id, attachmentId: importedAttachment.id, targetType: "property", targetId: sharedProperty.id, category: "identity", sourceImportJobId: "w93-import-job", createdByUserId: owner.id });
assert.equal(duplicateLink.id, firstLink.id, "repeated object links are idempotent");
assert.equal((await memory.listAttachmentLinks({ tenantId: tenant.id, attachmentId: importedAttachment.id })).length, 1, "idempotent linking creates one association");
assert(await access.getW93AttachmentForContext(colleagueContext, importedAttachment.id), "a linked source follows its readable object parent");
assert((await hub.listHubAttachments("ja", 30, { userId: owner.id, tenantId: tenant.id, requestContext: colleagueContext })).some((item) => item.id === importedAttachment.id), "attachment list follows a readable linked object parent");
assert.equal((await access.listW93GeneratedOutputsForContext(colleagueContext)).length, 0, "history outputs without visible cases are excluded");

console.log("w93 access behavior: PASS");
