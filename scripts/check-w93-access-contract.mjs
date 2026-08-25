import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(`w93 access contract failed: ${message}`);
};

const relation = read("src/app/relationship-tree/page.tsx");
const access = read("src/lib/w93-access.ts");
const attachmentRoute = read("src/app/api/attachments/[attachmentId]/route.ts");
const outputRoute = read("src/app/api/outputs/[id]/download/route.ts");
const outputCenter = read("src/app/output-center/page.tsx");
const hub = read("src/lib/hub.ts");
const guaranteeDownload = read("src/app/api/guarantee-applications/[templateId]/download/route.ts");
const guaranteeSlice = read("src/app/api/guarantee-g1-slice1/route.ts");
const guaranteeOutput = read("src/app/api/guarantee-g1-slice1/output/[outputId]/route.ts");

assert(relation.includes("createRequestContext(session)"), "relationship tree creates trusted context");
assert(relation.includes("listBrokerageCasesForContext") && relation.includes('kind: "case"'), "relationship tree uses context-bound cases");
assert(relation.includes("caseEntries") && relation.includes("displayCaseTitle"), "relationship tree retains case visibility resolution for title redaction");
assert(relation.includes("listHubParties(locale, { requestContext })") && relation.includes("listHubProperties(locale, { requestContext })"), "relationship tree uses context-bound people and properties");
assert(!relation.includes("listHubAttachments") && !relation.includes("listHubContracts") && !relation.includes("listHubImportJobs"), "unsupported legacy nodes are not exposed");
assert(relation.includes("notFound()"), "hidden direct nodes use a uniform unavailable result");

assert(access.includes("getAttachmentByIdForTenant") && access.includes("resolveW93Parent"), "attachments require tenant lookup plus parent resolution");
assert(access.includes("getGeneratedOutputByIdForTenant") && access.includes("output.caseId"), "history output is bound to its case");
assert(access.includes("areCaseSourcesReadable") && access.includes("areGeneratedOutputSourcesReadable") && access.includes("listQuotationsForContext"), "generation and history checks every explicit source");
assert(access.includes("withW93SourceProvenance") && access.includes("__w93SourceIds"), "generated history persists immutable source provenance");
assert(access.includes("__primaryQuoteId") && access.includes("__quoteId") && access.includes("hasInvalidExplicitSources"), "malformed quote provenance fails closed");

assert(attachmentRoute.includes("createRequestContext(session)") && attachmentRoute.includes("getW93AttachmentForContext"), "attachment route checks parent visibility");
assert(!attachmentRoute.includes("getAttachmentById({"), "attachment route has no id-only legacy lookup");
assert(outputRoute.includes("getW93GeneratedOutputForContext") && outputRoute.includes("fileStatus !== \"ready\"") && outputRoute.includes("readPrivateAttachmentContentForTenant"), "ordinary output download uses immutable stored bytes and parent visibility");
assert(outputRoute.includes("isOutputDocType") && outputRoute.includes("fileAttachmentId") && outputRoute.includes("createHash"), "ordinary output download fails closed on unknown or invalid files");
assert(!outputRoute.includes("getQuotationById") && !outputRoute.includes("listQuoteFormData"), "ordinary output download does not recompose tenant-wide data");
assert(outputCenter.includes("listPropertiesForContext") && outputCenter.includes("listQuotationsForContext") && outputCenter.includes("requestContext"), "output center uses context-bound projections");
assert(!outputCenter.includes("listQuoteFormData") && !outputCenter.includes("listQuotations(100"), "output center has no tenant-wide source fallback");
assert(hub.includes("if (!context.requestContext) return []") && hub.includes("listGeneratedOutputsForTenant"), "output history fails closed without trusted context");
assert(guaranteeDownload.includes("getBrokerageCaseByIdForContext") && guaranteeDownload.includes("assertCaseSourcesReadable"), "guarantee generation checks case and sources");
assert(guaranteeSlice.includes("getBrokerageCaseByIdForContext") && guaranteeSlice.includes("requireWritableCase"), "slice1 actions use owner-write case resolver");
assert(guaranteeOutput.includes("getBrokerageCaseByIdForContext") && guaranteeOutput.includes("assertCaseSourcesReadable") && guaranteeOutput.includes("assertGeneratedOutputSourcesReadable"), "historical guarantee output checks current case and sources");
assert(guaranteeDownload.includes("getRequestId") && !guaranteeDownload.includes("message: error instanceof Error"), "guarantee errors do not expose internal details");

console.log("w93 access contract: PASS");
