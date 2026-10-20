#!/usr/bin/env node
/*
 * Local-only PostgreSQL regression and four-source integration evidence.
 *
 * The script deliberately uses the application queue and worker for the four
 * supplied PDFs. It never inserts model candidates for that integration run.
 * The two 14-field confirmation matrices below are separate deterministic
 * persistence regressions, so a provider response cannot hide a SQL mapping
 * defect. Set BROKER_DESK_RUN_REAL_PDF_TEST=1 to permit the four provider
 * calls; the default runs only the local restricted-role confirmation matrix.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const runRealPdf = process.env.BROKER_DESK_RUN_REAL_PDF_TEST === "1";

process.env.DATA_DRIVER = "postgres";
process.env.BROKER_DESK_AUTH_MODE = "trusted_header";
process.env.BROKER_DESK_TEST_REQUEST_SCOPE = "1";
process.env.NODE_ENV = "development";
if (!process.env.DATABASE_DEVELOPMENT_URL?.trim()) throw new Error("DATABASE_DEVELOPMENT_URL must explicitly name the isolated local PostgreSQL test database.");
process.env.DATABASE_URL ??= process.env.DATABASE_DEVELOPMENT_URL;

if (runRealPdf && !process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY must be injected by the private local runner for the four-file provider run.");

const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;
const resolveCandidate = (value) => [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
Module._resolveFilename = function(request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
require.extensions[".ts"] = (mod, filename) => mod._compile(typescript.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, jsx: typescript.JsxEmit.ReactJSX, esModuleInterop: true },
  fileName: filename,
}).outputText, filename);
require.extensions[".tsx"] = require.extensions[".ts"];
const originalLoad = Module._load;
Module._load = function(request, parent, ...rest) {
  if (request === "server-only") return {};
  if (request === "next/headers") return {
    headers: async () => new Headers({
      "x-brokerdesk-auth-secret": "local-intake-test-secret",
      "x-brokerdesk-auth-subject": "demo:user_demo",
      "x-brokerdesk-auth-email": "demo@brokerdesk.local",
      "x-brokerdesk-auth-name": "Local Intake Owner",
    }),
  };
  return originalLoad.call(this, request, parent, ...rest);
};

const data = require(resolve(root, "src/lib/data.ts"));
const { queueIdentityImportSources } = require(resolve(root, "src/lib/identity-import-queue.ts"));
const { processIdentityImportJob } = require(resolve(root, "src/lib/identity-import-processor.ts"));
const { buildObjectVersionFingerprint, serializeObjectImportNotes } = require(resolve(root, "src/lib/object-import-contract.ts"));
const { createRequestContext } = require(resolve(root, "src/lib/visibility-resolver.ts"));
const { registerTenantSessionProvenance } = require(resolve(root, "src/lib/tenant-session-provenance.ts"));

const externalAuthSubject = "demo:user_demo";
const tenantId = "tenant_cherry";
const userId = "user_demo";
const outputPath = "/private/tmp/brokerdesk-intake-pg-evidence-20261019.json";
const result = { workId: "BD-MODEL-INTAKE-20261018-02", databaseRole: process.env.BROKER_DESK_DATABASE_ROLE?.trim() || "role supplied by DATABASE_DEVELOPMENT_URL", provider: "openai_responses", realPdfRun: runRealPdf };

const user = await data.getUserByExternalAuthSubject(externalAuthSubject);
assert(user && user.id === userId);
const tenant = await data.getTenantById(tenantId);
assert(tenant);
const membership = (await data.listTenantMemberships(userId)).find((item) => item.tenantId === tenantId && item.status === "active");
assert(membership);
const session = { externalAuthSubject, user, tenant, membership, serviceState: {} };
registerTenantSessionProvenance(session);
const context = createRequestContext(session);

const propertyKeys = ["name", "furigana", "area", "address", "roomNumber", "postalCode", "usage", "sizeSqm", "listingPrice", "listingRent", "listingCommonFee", "managementFee", "repairFee", "notes"];
const values = {
  name: "Standalone confirmed name", furigana: "スタンドアロン確認", area: "福岡市中央区", address: "福岡市中央区1-1", roomNumber: "101", postalCode: "8100001", usage: "居住用", sizeSqm: "42.5", listingPrice: "12345678", listingRent: "120000", listingCommonFee: "5000", managementFee: "2210", repairFee: "3540", notes: "standalone confirmed note",
};

async function runRealIntegration() {
  const sourceDir = process.env.BROKER_DESK_SOURCE_DIR?.trim();
  const existingJobIds = (process.env.BROKER_DESK_EXISTING_JOB_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  let integrationProperty;
  let jobIds;
  let uploadMode;
  if (existingJobIds.length > 0) {
    const propertyId = process.env.BROKER_DESK_REAL_PROPERTY_ID?.trim();
    if (!propertyId) throw new Error("BROKER_DESK_REAL_PROPERTY_ID is required with BROKER_DESK_EXISTING_JOB_IDS.");
    integrationProperty = await data.getPropertyById(propertyId, tenantId);
    if (!integrationProperty) throw new Error("BROKER_DESK_REAL_PROPERTY_ID is not visible to the local runtime identity.");
    jobIds = existingJobIds;
    uploadMode = "existing_application_upload";
  } else {
    if (!sourceDir) throw new Error("BROKER_DESK_SOURCE_DIR is required for the four-file provider run; keep source paths outside Git.");
    const sourceNames = ["謄本(1).PDF", "重要事項説明書(1).pdf", "売買契約書(1).pdf", "売主様告知書(1).pdf"];
    const sourceFiles = sourceNames.map((filename) => {
      const path = resolve(sourceDir, filename);
      const buffer = readFileSync(path);
      return { path, filename, buffer, file: new File([buffer], filename, { type: "application/pdf" }) };
    });
    integrationProperty = await data.addProperty({
      tenantId, createdByUserId: userId, currentOwnerUserId: userId,
      name: `四資料実走 ${Date.now()}`, area: "福岡市", address: "福岡市中央区（local）", listingPrice: 1,
    });
    const initialIntegrationVersion = buildObjectVersionFingerprint(integrationProperty);
    const queued = await queueIdentityImportSources({
      tenantId, userId, files: sourceFiles.map((item) => item.file), uploadMode: "same_person",
      targetObjectType: "property", targetObjectId: integrationProperty.id, targetVersion: initialIntegrationVersion,
    });
    assert.equal(queued.ok, true);
    jobIds = queued.jobIds;
    uploadMode = "application_queue_upload";
  }
  assert.equal(jobIds.length, 4, "the bounded integration run must process exactly four jobs");
  const processed = [];
  for (const jobId of jobIds) processed.push({ jobId, result: await processIdentityImportJob({ tenantId, userId, jobId }) });
  const integrationTargets = (await data.listObjectImportTargets({ tenantId, userId, targetType: "property", targetId: integrationProperty.id }))
    .filter((target) => jobIds.includes(target.importJobId));
  assert.equal(integrationTargets.length, 4);
  const integrationSummaries = [];
  for (const target of integrationTargets) {
    const fields = await data.listObjectImportCandidates({ tenantId, userId, targetId: target.id });
    integrationSummaries.push({
      jobId: target.importJobId,
      targetId: target.id,
      documentType: target.documentType,
      status: target.status,
      attemptCount: target.attemptCount,
      processingMetadata: target.processingMetadata,
      candidateCount: fields.length,
      actionableCount: fields.filter((field) => !["not_found", "confirmed", "rejected"].includes(field.status)).length,
      notFoundCount: fields.filter((field) => field.status === "not_found").length,
      sourceFileHash: fields[0]?.provenance?.sourceFileHash,
    });
  }
  return { propertyId: integrationProperty.id, jobIds, uploadMode, processed, targets: integrationSummaries };
}

async function createSyntheticReviewTarget(property, caseId, prefix) {
  const job = await data.addImportJob({ tenantId, userId, sourceType: "scan", title: `${prefix} source`, targetEntity: "parties", status: "mapped", notes: serializeObjectImportNotes({ ...(caseId ? { caseId } : {}), targetObjectType: "property", targetObjectId: property.id, targetVersion: buildObjectVersionFingerprint(property), documentType: "unknown_property_document" }) });
  const content = Buffer.from(`${prefix}-evidence`);
  const attachment = await data.addPrivateAttachment({ tenantId, userId, targetType: "import_job", targetId: job.id, fileName: `${prefix}.pdf`, fileType: "application/pdf", content });
  const target = await data.createObjectImportTarget({ id: `object_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, tenantId, userId, ...(caseId ? { caseId } : {}), importJobId: job.id, targetType: "property", targetId: property.id, targetVersion: buildObjectVersionFingerprint(property), documentType: "unknown_property_document", processingMetadata: { provider: "test-only-deterministic", model: "none" }, sourceAttachmentId: attachment.id, status: "needs_review", idempotencyKey: `local:${prefix}:${Date.now()}`, attemptCount: 1, createdAt: new Date(), updatedAt: new Date() });
  const sourceFileHash = createHash("sha256").update(content).digest("hex");
  const fields = [];
  for (const key of propertyKeys) {
    const fieldKey = `property.${key}`;
    fields.push(await data.upsertObjectImportCandidate({ id: `candidate_${target.id}_${key}`, tenantId, targetId: target.id, fieldKey, candidateValue: values[key], confidence: 0.99, provenance: { sourceAttachmentId: attachment.id, sourceFileHash, pageNumber: 1, sourceText: `${key}: ${values[key]}`, method: "local-regression" }, finalValue: values[key], finalSource: "model_draft", status: "draft" }));
  }
  return { target, fields };
}

async function confirmStandaloneMatrix() {
  const property = await data.addProperty({ tenantId, createdByUserId: userId, currentOwnerUserId: userId, name: "Standalone baseline", listingPrice: 1 });
  const { target, fields } = await createSyntheticReviewTarget(property, undefined, "standalone_matrix");
  let version = target.targetVersion;
  for (const field of fields) {
    const reviewed = await data.reviewObjectImportCandidate({ context, targetId: target.id, fieldId: field.id, expectedVersion: version, expectedCandidateValue: field.candidateValue, decision: "confirm", value: values[field.fieldKey.replace(/^property\./, "")] });
    assert.equal(reviewed.ok, true, `${field.fieldKey} standalone review`);
    version = reviewed.targetVersion;
  }
  const saved = await data.getPropertyById(property.id, tenantId);
  assert(saved);
  for (const key of propertyKeys) assert.equal(String(saved[key] ?? ""), String(values[key]), `standalone persisted ${key}`);
  assert.equal((await data.getObjectImportTarget({ tenantId, userId, id: target.id })).status, "completed");
  return { propertyId: property.id, targetId: target.id, finalStatus: "completed", persisted: propertyKeys };
}

async function confirmCaseMatrix() {
  const property = await data.addProperty({ tenantId, createdByUserId: userId, currentOwnerUserId: userId, name: "Case baseline", listingPrice: 1 });
  const { writeCaseAssociationData } = require(resolve(root, "src/lib/case-associations.ts"));
  const brokerageCase = await data.saveBrokerageCaseExtractionReview({ tenantId, userId, caseType: "unit_sale", caseTitle: "Case matrix", confirmedDataJson: writeCaseAssociationData({}, { parties: [], primaryPropertyId: property.id }, { propertyName: property.name }), sourceImportJobIds: [], reviewItems: [] });
  const { target, fields } = await createSyntheticReviewTarget(property, brokerageCase.id, "case_matrix");
  let version = target.targetVersion;
  let caseSnapshot = brokerageCase.confirmedDataJson;
  for (const field of fields) {
    const reviewed = await data.saveCaseWorkbenchWithObjectReview({ context, caseId: brokerageCase.id, confirmedDataJson: caseSnapshot, objectReview: { context, targetId: target.id, fieldId: field.id, expectedVersion: version, expectedCandidateValue: field.candidateValue, decision: "confirm", value: values[field.fieldKey.replace(/^property\./, "")] } });
    assert.equal(reviewed.ok, true, `${field.fieldKey} case review`);
    version = reviewed.objectReview.targetVersion;
    caseSnapshot = reviewed.brokerageCase.confirmedDataJson;
  }
  const saved = await data.getPropertyById(property.id, tenantId);
  assert(saved);
  for (const key of propertyKeys) assert.equal(String(saved[key] ?? ""), String(values[key]), `case persisted ${key}`);
  assert.equal((await data.getObjectImportTarget({ tenantId, userId, id: target.id })).status, "completed");
  return { propertyId: property.id, caseId: brokerageCase.id, targetId: target.id, finalStatus: "completed", persisted: propertyKeys };
}

async function confirmNotFoundTerminal() {
  const property = await data.addProperty({ tenantId, createdByUserId: userId, currentOwnerUserId: userId, name: "Missing evidence baseline", listingPrice: 1 });
  const { target, fields } = await createSyntheticReviewTarget(property, undefined, "not_found_matrix");
  const missing = fields[0];
  // Replace one actionable candidate with an explicit absence record. It has
  // no value and no final source, but it must not keep the target in review.
  await data.upsertObjectImportCandidate({ ...missing, candidateValue: undefined, finalValue: undefined, finalSource: undefined, provenance: { ...missing.provenance, uncertainty: "not_found", pageNumber: 0, sourceText: "" }, status: "not_found" });
  const refreshedFields = await data.listObjectImportCandidates({ tenantId, userId, targetId: target.id });
  let version = target.targetVersion;
  for (const field of refreshedFields.filter((item) => item.status !== "not_found")) {
    const reviewed = await data.reviewObjectImportCandidate({ context, targetId: target.id, fieldId: field.id, expectedVersion: version, expectedCandidateValue: field.candidateValue, decision: "confirm", value: values[field.fieldKey.replace(/^property\./, "")] });
    assert.equal(reviewed.ok, true, `${field.fieldKey} not_found terminal review`);
    version = reviewed.targetVersion;
  }
  const reloaded = await data.getObjectImportTarget({ tenantId, userId, id: target.id });
  const missingReloaded = (await data.listObjectImportCandidates({ tenantId, userId, targetId: target.id })).find((item) => item.fieldKey === missing.fieldKey);
  assert.equal(reloaded.status, "completed");
  assert.equal(missingReloaded.status, "not_found");
  assert.equal(missingReloaded.finalValue, undefined);
  return { targetId: target.id, finalStatus: reloaded.status, missingFieldStatus: missingReloaded.status };
}

result.postgresConfirmation = { standalone: await confirmStandaloneMatrix(), caseWorkbench: await confirmCaseMatrix(), notFound: await confirmNotFoundTerminal() };
if (runRealPdf) result.integration = await runRealIntegration();
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, databaseRole: result.databaseRole, realPdfRun: result.realPdfRun, integrationPropertyId: result.integration?.propertyId, targetCount: result.integration?.targets.length ?? 0, postgresConfirmation: result.postgresConfirmation }, null, 2));
