#!/usr/bin/env node
/*
 * Local-only customer identity persistence and authorization regression.
 *
 * This test deliberately uses the real PostgreSQL repository and the
 * restricted runtime role. It creates one synthetic individual and one
 * synthetic corporate record, then removes both and their import rows in a
 * finally block. No provider call or parent acceptance record is touched.
 *
 * Required environment:
 *   DATABASE_DEVELOPMENT_URL=postgresql://... (isolated local owner connection)
 *   BROKER_DESK_CUSTOMER_PG_EVIDENCE=/private/tmp/...json
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ownerUrl = process.env.DATABASE_DEVELOPMENT_URL?.trim();
const evidencePath = process.env.BROKER_DESK_CUSTOMER_PG_EVIDENCE?.trim();
const trustedHeaderSecret = process.env.BROKER_DESK_AUTH_TRUSTED_HEADER_SECRET?.trim();
if (!ownerUrl) throw new Error("DATABASE_DEVELOPMENT_URL must explicitly name the isolated local PostgreSQL database.");
if (!evidencePath) throw new Error("BROKER_DESK_CUSTOMER_PG_EVIDENCE must explicitly name a private evidence file.");
if (!trustedHeaderSecret) throw new Error("BROKER_DESK_AUTH_TRUSTED_HEADER_SECRET must be injected by the private local runner.");
// The product runs in Japan and SQL DATE values must remain calendar dates
// through mapClient, UPDATE ... RETURNING, and target fingerprinting.
process.env.TZ = "Asia/Tokyo";
const runtimeUrl = `${ownerUrl}${ownerUrl.includes("?") ? "&" : "?"}options=-c%20role%3Dbrokerdesk_runtime`;

process.env.DATA_DRIVER = "postgres";
process.env.BROKER_DESK_AUTH_MODE = "trusted_header";
process.env.BROKER_DESK_TEST_REQUEST_SCOPE = "1";
process.env.NODE_ENV = "development";
process.env.DATABASE_DEVELOPMENT_URL = runtimeUrl;
delete process.env.DATABASE_URL;

const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;
const resolveCandidate = (value) => [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`]
  .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
Module._resolveFilename = function(request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
require.extensions[".ts"] = (mod, filename) => mod._compile(typescript.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: {
    module: typescript.ModuleKind.CommonJS,
    target: typescript.ScriptTarget.ES2022,
    jsx: typescript.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
  fileName: filename,
}).outputText, filename);
require.extensions[".tsx"] = require.extensions[".ts"];
const originalLoad = Module._load;
Module._load = function(request, parent, ...rest) {
  if (request === "server-only") return {};
  if (request === "next/headers") return {
    headers: async () => new Headers({
      "x-brokerdesk-auth-secret": trustedHeaderSecret,
      "x-brokerdesk-auth-subject": "demo:user_demo",
      "x-brokerdesk-auth-email": "demo@brokerdesk.local",
      "x-brokerdesk-auth-name": "Local Intake Owner",
    }),
  };
  return originalLoad.call(this, request, parent, ...rest);
};

const data = require(resolve(root, "src/lib/data.ts"));
const { buildObjectVersionFingerprint, serializeObjectImportNotes } = require(resolve(root, "src/lib/object-import-contract.ts"));
const { createRequestContext } = require(resolve(root, "src/lib/visibility-resolver.ts"));
const { registerTenantSessionProvenance } = require(resolve(root, "src/lib/tenant-session-provenance.ts"));

const tenantId = "tenant_cherry";
const userId = "user_demo";
const externalAuthSubject = "demo:user_demo";
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const prefix = `customer_pg_${suffix}`;
const evidence = {
  workId: "BD-CUSTOMER-IDENTITY-20261019-01",
  provider: "none (repository regression; no model call)",
  database: "brokerdesk_intake_20261019 (local isolated fixture supplied via DATABASE_DEVELOPMENT_URL)",
  runtimeRole: "brokerdesk_runtime",
  source: "scripts/test-customer-identity-postgres-confirmation.mjs",
  synthetic: { prefix, clientId: null, corporateClientId: null, targetId: null, corporateTargetId: null },
  checks: {},
  cleanup: false,
};

const user = await data.getUserByExternalAuthSubject(externalAuthSubject);
assert(user && user.id === userId);
const tenant = await data.getTenantById(tenantId);
assert(tenant);
const membership = (await data.listTenantMemberships(userId)).find((item) => item.tenantId === tenantId && item.status === "active");
assert(membership);
const session = { externalAuthSubject, user, tenant, membership, serviceState: {} };
registerTenantSessionProvenance(session);
const context = createRequestContext(session);

const customerValues = {
  name: "YAMADA SHIKEN",
  furigana: "ヤマダ シケン",
  birthDate: "1990-04-12",
  gender: "male",
  currentPostalCode: "150-1500",
  currentAddress: "福岡県福岡市中央区1-1",
};
const existingContact = { phone: "090-0000-0000", email: "keep@example.test" };
const customerFields = ["name", "furigana", "birthDate", "gender", "currentPostalCode", "currentAddress", "phone", "lineId", "email"];

async function createPartyTarget(label, notes = "関係者種別：個人", options = {}) {
  const content = Buffer.from(`%PDF-${prefix}-${label}`);
  const clientRecord = await data.addClient({
    tenantId,
    ownerUserId: userId,
    name: label === "corporate" ? "Corporate Regression" : "Original customer",
    phone: existingContact.phone,
    email: existingContact.email,
    budgetType: "total_price",
    purpose: "buy",
    loanPreApprovalStatus: "not_applied",
    stage: "lead",
    temperature: "cold",
    brokerageContractType: "none",
    amlCheckStatus: "not_required",
    notes,
  });
  const visible = await data.resolveClientVisibilityForContext({ context, clientId: clientRecord.id });
  assert(visible.record, `${label} must be visible through the runtime context`);
  const version = buildObjectVersionFingerprint(visible.record);
  const job = await data.addImportJob({
    tenantId,
    userId,
    sourceType: "scan",
    title: `${prefix} ${label}`,
    targetEntity: "parties",
    status: "mapped",
    idempotencyKey: `${prefix}:${label}:job`,
    notes: serializeObjectImportNotes({ targetObjectType: "party", targetObjectId: clientRecord.id, targetVersion: version, documentType: "identity_passport" }),
  });
  const attachment = await data.addPrivateAttachment({
    tenantId,
    userId,
    targetType: "import_job",
    targetId: job.id,
    fileName: `${prefix}-${label}.pdf`,
    fileType: "application/pdf",
    content,
  });
  const target = await data.createObjectImportTarget({
    id: `${prefix}_target_${label}`,
    tenantId,
    userId,
    importJobId: job.id,
    targetType: "party",
    targetId: clientRecord.id,
    targetVersion: version,
    documentType: "identity_passport",
    processingMetadata: { provider: "test-only", model: "none", source: "restricted-repository-regression" },
    sourceAttachmentId: attachment.id,
    status: "needs_review",
    idempotencyKey: `${prefix}:${label}:target`,
    attemptCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const sourceFileHash = createHash("sha256").update(content).digest("hex");
  const completeContacts = options.completeIdentity === true
    ? { phone: "090-1111-2222", lineId: "identity-line", email: "identity@example.test" }
    : {};
  const fields = [];
  for (const fieldKey of customerFields) {
    const candidateValue = customerValues[fieldKey] ?? completeContacts[fieldKey] ?? undefined;
    const notFound = candidateValue === undefined;
    fields.push(await data.upsertObjectImportCandidate({
      id: `${prefix}_${label}_${fieldKey}`,
      tenantId,
      targetId: target.id,
      fieldKey,
      candidateValue: notFound ? undefined : candidateValue,
      confidence: notFound ? 0 : 0.98,
      provenance: {
        sourceAttachmentId: attachment.id,
        sourceFileHash,
        pageNumber: notFound ? 0 : 1,
        sourceText: notFound ? "" : `${fieldKey}: ${candidateValue}`,
        method: "ai",
        uncertainty: notFound ? "not_found" : "clear",
        subjectKey: "person-1",
        subjectLabel: "本人",
      },
      finalValue: undefined,
      finalSource: undefined,
      status: notFound ? "not_found" : "draft",
    }));
  }
  if (label === "corporate") {
    evidence.synthetic.corporateClientId = clientRecord.id;
    evidence.synthetic.corporateTargetId = target.id;
  } else if (options.completeIdentity === true) {
    evidence.synthetic.completeClientId = clientRecord.id;
    evidence.synthetic.completeTargetId = target.id;
  } else {
    evidence.synthetic.clientId = clientRecord.id;
    evidence.synthetic.targetId = target.id;
  }
  return { client: clientRecord, job, attachment, target, fields };
}

function cloneContext(changes) {
  // A copied context is intentionally not trusted by the resolver. This
  // demonstrates fail-closed rejection for forged tenant/user identities.
  return { ...context, ...changes };
}

const created = [];
try {
  const primary = await createPartyTarget("primary");
  const complete = await createPartyTarget("complete", "関係者種別：個人", { completeIdentity: true });
  const corporate = await createPartyTarget("corporate", "関係者種別：法人/会社");
  created.push(primary, complete, corporate);

  const runtimeTarget = await data.getObjectImportTarget({ tenantId, userId, id: primary.target.id });
  assert(runtimeTarget);
  let version = runtimeTarget.targetVersion;
  const nameField = primary.fields.find((field) => field.fieldKey === "name");
  assert(nameField);

  const unknownField = await data.upsertObjectImportCandidate({
    id: `${prefix}_primary_unknown`,
    tenantId,
    targetId: primary.target.id,
    fieldKey: "applicant.nationality",
    candidateValue: "日本",
    confidence: 0.99,
    provenance: { sourceAttachmentId: primary.attachment.id, sourceFileHash: createHash("sha256").update(Buffer.from(`%PDF-${prefix}-primary`)).digest("hex"), pageNumber: 1, sourceText: "国籍 日本", method: "ai" },
    finalValue: undefined,
    finalSource: undefined,
    status: "draft",
  });
  const unknownResult = await data.reviewObjectImportCandidate({ context, targetId: primary.target.id, fieldId: unknownField.id, expectedVersion: version, expectedCandidateValue: "日本", decision: "confirm", value: "日本" });
  assert.deepEqual(unknownResult, { ok: false, reason: "invalid_value" }, `unknown field review result: ${JSON.stringify(unknownResult)}`);
  evidence.checks.unknownFieldRejected = unknownResult.reason;
  // Keep the synthetic target terminal after the rejection without using the
  // product API to manufacture a success: this is cleanup of a test-only row.
  await data.upsertObjectImportCandidate({ ...unknownField, candidateValue: undefined, provenance: { ...unknownField.provenance, uncertainty: "not_found", pageNumber: 0, sourceText: "" }, status: "not_found" });

  const confirmed = [];
  const initialNameReview = await data.reviewObjectImportCandidate({ context, targetId: primary.target.id, fieldId: nameField.id, expectedVersion: version, expectedCandidateValue: nameField.candidateValue, decision: "confirm", value: nameField.candidateValue });
  assert.equal(initialNameReview.ok, true, "name should persist through repository before stale check");
  version = initialNameReview.targetVersion;
  confirmed.push(nameField.fieldKey);
  const staleField = primary.fields.find((field) => field.fieldKey === "furigana");
  assert(staleField);
  const staleResult = await data.reviewObjectImportCandidate({ context, targetId: primary.target.id, fieldId: staleField.id, expectedVersion: runtimeTarget.targetVersion, expectedCandidateValue: staleField.candidateValue ?? "", decision: "confirm", value: staleField.candidateValue });
  assert.deepEqual(staleResult, { ok: false, reason: "conflict" });
  evidence.checks.staleVersionRejected = staleResult.reason;

  for (const field of primary.fields.filter((item) => !["phone", "lineId", "email", "name"].includes(item.fieldKey))) {
    const before = await data.getObjectImportTarget({ tenantId, userId, id: primary.target.id });
    assert(before);
    const reviewed = await data.reviewObjectImportCandidate({ context, targetId: primary.target.id, fieldId: field.id, expectedVersion: before.targetVersion, expectedCandidateValue: field.candidateValue, decision: "confirm", value: field.candidateValue });
    assert.equal(reviewed.ok, true, `${field.fieldKey} should persist through repository`);
    version = reviewed.targetVersion;
    const fresh = await data.resolveClientVisibilityForContext({ context, clientId: primary.client.id });
    assert(fresh.record);
    assert.equal(reviewed.targetVersion, buildObjectVersionFingerprint(fresh.record), `${field.fieldKey} target version must match fresh customer fingerprint`);
    confirmed.push(field.fieldKey);
  }
  const duplicateResult = await data.reviewObjectImportCandidate({ context, targetId: primary.target.id, fieldId: nameField.id, expectedVersion: version, expectedCandidateValue: nameField.candidateValue, decision: "confirm", value: nameField.candidateValue });
  assert.deepEqual(duplicateResult, { ok: false, reason: "already_reviewed" });
  evidence.checks.duplicateRejected = duplicateResult.reason;

  const forgedTenantResult = await data.reviewObjectImportCandidate({ context: cloneContext({ tenantId: "tenant_other" }), targetId: primary.target.id, fieldId: staleField.id, expectedVersion: version, expectedCandidateValue: staleField.candidateValue ?? "", decision: "confirm", value: "attacker@example.test" });
  assert.deepEqual(forgedTenantResult, { ok: false, reason: "not_writable" });
  evidence.checks.otherTenantRejected = forgedTenantResult.reason;
  const forgedUserResult = await data.reviewObjectImportCandidate({ context: cloneContext({ userId: "user_other" }), targetId: primary.target.id, fieldId: staleField.id, expectedVersion: version, expectedCandidateValue: staleField.candidateValue ?? "", decision: "confirm", value: "attacker@example.test" });
  assert.deepEqual(forgedUserResult, { ok: false, reason: "not_writable" });
  evidence.checks.otherUserRejected = forgedUserResult.reason;

  for (const field of primary.fields.filter((item) => ["phone", "lineId", "email"].includes(item.fieldKey))) {
    const reloaded = (await data.listObjectImportCandidates({ tenantId, userId, targetId: primary.target.id })).find((item) => item.fieldKey === field.fieldKey);
    assert.equal(reloaded?.status, "not_found", `${field.fieldKey} must remain not_found`);
  }
  const saved = await data.getClientById(primary.client.id, tenantId);
  assert(saved);
  assert.equal(saved.name, customerValues.name);
  assert.equal(saved.furigana, customerValues.furigana);
  assert.equal(saved.birthDate?.toISOString().slice(0, 10), customerValues.birthDate);
  assert.equal(saved.gender, customerValues.gender);
  assert.equal(saved.currentPostalCode, customerValues.currentPostalCode);
  assert.equal(saved.currentAddress, customerValues.currentAddress);
  assert.equal(saved.phone, existingContact.phone);
  assert.equal(saved.email, existingContact.email);
  assert.equal(saved.lineId, undefined);
  const finalTarget = await data.getObjectImportTarget({ tenantId, userId, id: primary.target.id });
  assert.equal(finalTarget?.status, "completed");
  evidence.checks.confirmedFields = confirmed;
  evidence.checks.notFoundFields = ["phone", "lineId", "email"];
  evidence.checks.savedAndReopened = true;
  evidence.checks.targetCompleted = true;

  let completeVersion = complete.target.targetVersion;
  const completeConfirmed = [];
  for (const field of complete.fields) {
    const before = await data.getObjectImportTarget({ tenantId, userId, id: complete.target.id });
    assert(before);
    const reviewed = await data.reviewObjectImportCandidate({ context, targetId: complete.target.id, fieldId: field.id, expectedVersion: before.targetVersion, expectedCandidateValue: field.candidateValue, decision: "confirm", value: field.candidateValue });
    assert.equal(reviewed.ok, true, `complete ${field.fieldKey} should persist through repository`);
    completeVersion = reviewed.targetVersion;
    const fresh = await data.resolveClientVisibilityForContext({ context, clientId: complete.client.id });
    assert(fresh.record);
    assert.equal(reviewed.targetVersion, buildObjectVersionFingerprint(fresh.record), `complete ${field.fieldKey} target version`);
    completeConfirmed.push(field.fieldKey);
  }
  const completeSaved = await data.getClientById(complete.client.id, tenantId);
  assert(completeSaved);
  assert.equal(completeSaved.name, customerValues.name);
  assert.equal(completeSaved.furigana, customerValues.furigana);
  assert.equal(completeSaved.birthDate?.toISOString().slice(0, 10), customerValues.birthDate);
  assert.equal(completeSaved.gender, customerValues.gender);
  assert.equal(completeSaved.currentPostalCode, customerValues.currentPostalCode);
  assert.equal(completeSaved.currentAddress, customerValues.currentAddress);
  assert.equal(completeSaved.phone, "090-1111-2222");
  assert.equal(completeSaved.lineId, "identity-line");
  assert.equal(completeSaved.email, "identity@example.test");
  assert.equal((await data.getObjectImportTarget({ tenantId, userId, id: complete.target.id })).status, "completed");
  evidence.checks.allNineFieldsConfirmed = completeConfirmed;
  evidence.checks.allNineSavedAndReopened = true;

  const corporateField = (await data.listObjectImportCandidates({ tenantId, userId, targetId: corporate.target.id })).find((field) => field.fieldKey === "name");
  assert(corporateField);
  const corporateTarget = await data.getObjectImportTarget({ tenantId, userId, id: corporate.target.id });
  assert(corporateTarget);
  const corporateResult = await data.reviewObjectImportCandidate({ context, targetId: corporate.target.id, fieldId: corporateField.id, expectedVersion: corporateTarget.targetVersion, expectedCandidateValue: corporateField.candidateValue, decision: "confirm", value: corporateField.candidateValue });
  assert.deepEqual(corporateResult, { ok: false, reason: "not_writable" });
  evidence.checks.corporateRejected = corporateResult.reason;
} finally {
  // Cleanup uses the same tenant-scoped owner connection through the app
  // repository for object rows and direct SQL only for test-owned rows below.
  // The direct cleanup is intentionally bounded to generated IDs.
  const pg = require("pg");
  const client = new pg.Client(ownerUrl);
  try {
    await client.connect();
    const targetIds = created.map((item) => item.target.id);
    const jobIds = created.map((item) => item.job.id);
    const attachmentIds = created.map((item) => item.attachment.id);
    const clientIds = created.map((item) => item.client.id);
    if (targetIds.length) await client.query("DELETE FROM object_import_fields WHERE object_import_target_id = ANY($1::text[])", [targetIds]);
    if (targetIds.length) await client.query("DELETE FROM object_import_targets WHERE id = ANY($1::text[])", [targetIds]);
    if (jobIds.length) await client.query("DELETE FROM audit_logs WHERE context_json->>'importTargetId' = ANY($1::text[])", [targetIds]);
    if (attachmentIds.length) await client.query("DELETE FROM private_attachment_blobs WHERE attachment_id = ANY($1::text[])", [attachmentIds]);
    if (attachmentIds.length) await client.query("DELETE FROM attachments WHERE id = ANY($1::text[])", [attachmentIds]);
    if (jobIds.length) await client.query("DELETE FROM import_jobs WHERE id = ANY($1::text[])", [jobIds]);
    if (clientIds.length) await client.query("DELETE FROM clients WHERE id = ANY($1::text[])", [clientIds]);
    evidence.cleanup = true;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const probe = new (require("pg").Client)(runtimeUrl);
await probe.connect();
try {
  const row = (await probe.query("SELECT current_user, session_user, (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS rolsuper, (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS rolbypassrls")).rows[0];
  evidence.runtimeIdentity = { currentUser: row.current_user, sessionUser: row.session_user, rolsuper: row.rolsuper, rolbypassrls: row.rolbypassrls };
} finally {
  await probe.end();
}
assert.equal(evidence.cleanup, true);
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ evidencePath, cleanup: evidence.cleanup, checks: evidence.checks, runtimeIdentity: evidence.runtimeIdentity }, null, 2));
