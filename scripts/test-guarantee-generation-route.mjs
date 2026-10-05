import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";
import { PDFDocument } from "pdf-lib";

// This test invokes the actual Next route handler with a test-only session
// provider and renderer wrapper. It deliberately does not add a production
// auth mode, trusted header, permission, or database bypass.
const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

function resolveCandidate(value) {
  if (!value || (!value.startsWith("/") && !value.startsWith("."))) return undefined;
  const absolute = value.startsWith("/") ? value : resolve(projectRoot, value);
  const candidates = [absolute, `${absolute}.ts`, `${absolute}.tsx`, `${absolute}.mjs`, `${absolute}.js`, resolve(absolute, "index.ts")];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

Module._resolveFilename = function resolveFilename(request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(projectRoot, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  const candidate = resolveCandidate(relative);
  return candidate ?? originalResolve.call(this, request, parent, ...rest);
};

function compileTypeScript(module, filename) {
  const source = readFileSync(filename, "utf8");
  const result = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
      jsx: typescript.JsxEmit.ReactJSX,
      esModuleInterop: true,
      moduleResolution: typescript.ModuleResolutionKind.NodeJs,
    },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
}

require.extensions[".ts"] = compileTypeScript;
require.extensions[".tsx"] = compileTypeScript;

process.env.BROKER_DESK_DEPLOYMENT_ENV = "preview";
process.env.GUARANTEE_G1_SLICE1_ENABLED = "true";
process.env.GUARANTEE_G1_SLICE1_TENANT_ALLOWLIST = "tenant_cherry,tenant_other";

const repository = require(resolve(projectRoot, "src/lib/data.memory.ts"));
const renderer = require(resolve(projectRoot, "src/lib/guarantee-slice1-renderer.mjs"));
const provenance = require(resolve(projectRoot, "src/lib/tenant-session-provenance.ts"));
const tenantSessionModule = require(resolve(projectRoot, "src/lib/tenant-session.ts"));
const { createRequestContext } = require(resolve(projectRoot, "src/lib/visibility-resolver.ts"));
const { serializeMaskLayout } = require(resolve(projectRoot, "src/lib/guarantee-slice1-coordinates.mjs"));

const authState = { session: null, unauthorized: false };
const providerState = { calls: 0, delayMs: 0, failNext: false };

class HarnessTenantSessionError extends Error {
  constructor(message, code, status = code === "user_not_found" ? 401 : code === "tenant_not_found" ? 404 : 403) {
    super(message);
    this.name = "TenantSessionError";
    this.code = code;
    this.status = status;
  }
}

const authOverride = {
  TenantSessionError: HarnessTenantSessionError,
  getTenantCapability: tenantSessionModule.getTenantCapability,
  requireTenantSession: async () => {
    if (authState.unauthorized || !authState.session) {
      throw new HarnessTenantSessionError("test authentication required", "permission_denied");
    }
    return authState.session;
  },
};

const rendererOverride = {
  ...renderer,
  renderGuaranteePdf: async (...args) => {
    providerState.calls += 1;
    if (providerState.delayMs > 0) await new Promise((resolvePromise) => setTimeout(resolvePromise, providerState.delayMs));
    if (providerState.failNext) {
      providerState.failNext = false;
      throw new Error("synthetic_provider_failure");
    }
    return renderer.renderGuaranteePdf(...args);
  },
};

const overrides = new Map([
  ["@/lib/data", repository],
  ["@/lib/tenant-session", authOverride],
  ["@/lib/guarantee-slice1-renderer.mjs", rendererOverride],
]);

Module._load = function load(request, parent, isMain) {
  if (overrides.has(request)) return overrides.get(request);
  return originalLoad.call(this, request, parent, isMain);
};

const route = require(resolve(projectRoot, "src/app/api/guarantee-g1-slice1/route.ts"));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonHash(value) {
  return sha256(JSON.stringify(value, Object.keys(value ?? {}).sort()));
}

function requestFor(body) {
  return new Request("http://test.local/api/guarantee-g1-slice1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function call(body) {
  const response = await route.POST(requestFor(body));
  return { status: response.status, body: await response.json() };
}

async function makeFixture() {
  const tenantId = "tenant_cherry";
  const ownerId = "user_demo";
  const caseRecord = await repository.saveBrokerageCaseExtractionReview({
    tenantId,
    userId: ownerId,
    caseType: "unit_sale",
    caseTitle: "route handler ownership fixture",
    status: "reviewed",
    confirmedDataJson: { "applicant.name": "森様" },
    sourceImportJobIds: [],
    reviewItems: [],
  });
  assert.ok(caseRecord, "memory fixture case must exist");
  const caseId = caseRecord.id;

  const document = await PDFDocument.create();
  document.addPage([300, 200]);
  const blankPdf = Buffer.from(await document.save());
  const attachment = await repository.addPrivateAttachment({
    tenantId,
    userId: ownerId,
    targetType: "guarantee_blank_form",
    targetId: "route-harness-blank",
    fileName: "route-harness.pdf",
    fileType: "application/pdf",
    content: blankPdf,
  });
  const blankForm = await repository.createGuaranteeBlankForm({ tenantId, userId: ownerId, name: "route harness blank" });
  const blankVersion = await repository.addGuaranteeBlankFormVersion({
    tenantId,
    blankFormId: blankForm.id,
    attachmentId: attachment.id,
    uploadedByUserId: ownerId,
    sha256: sha256(blankPdf),
    fileSizeBytes: blankPdf.length,
    pageCount: 1,
    pageWidth: 300,
    pageHeight: 200,
  });
  const companyMask = await repository.createGuaranteeCompanyMask({ tenantId, blankFormId: blankForm.id, userId: ownerId });
  const layoutSnapshot = {
    coordinateSystem: "pdf_points_bottom_left_v1",
    fields: [{ fieldId: "applicant_name", type: "text", sourceFieldKey: "applicant.name", x: 24, y: 140, width: 100, height: 18 }],
  };
  let maskVersion = await repository.addGuaranteeCompanyMaskVersion({
    tenantId,
    maskId: companyMask.id,
    blankFormVersionId: blankVersion.id,
    userId: ownerId,
    fieldCatalogVersion: "slice1-v1",
    layoutSnapshot,
    status: "draft",
  });
  const testPdf = await renderer.renderGuaranteePdf({
    source: blankPdf,
    mask: maskVersion,
    confirmedData: caseRecord.confirmedDataJson,
    supplement: {},
    resolveCaseValue: (data, fieldKey) => String(data[fieldKey] ?? ""),
    resolveStorageScope: () => "case_fact",
  });
  const layoutDigest = serializeMaskLayout(layoutSnapshot.fields);
  await repository.markGuaranteeCompanyMaskVersionTested({ tenantId, maskVersionId: maskVersion.id, userId: ownerId, testPdfSha256: sha256(testPdf), testedLayoutDigest: layoutDigest });
  await repository.confirmGuaranteeCompanyMaskVersionTest({ tenantId, maskVersionId: maskVersion.id, userId: ownerId, testPdfSha256: sha256(testPdf) });
  const published = await repository.publishGuaranteeCompanyMaskVersionWithExactMatch({ tenantId, maskVersionId: maskVersion.id, userId: ownerId, layoutDigest });
  assert.ok(published, "route fixture mask must publish with an exact match");
  maskVersion = published.version;

  const confirmation = async () => repository.createGuaranteePreviewConfirmation({
    tenantId,
    actorUserId: ownerId,
    caseId,
    caseInputSnapshotHash: jsonHash(caseRecord.confirmedDataJson),
    blankFormVersionId: blankVersion.id,
    blankFormSha256: blankVersion.sha256,
    companyMaskVersionId: maskVersion.id,
    fieldCatalogVersion: maskVersion.fieldCatalogVersion,
    supplementSnapshot: {},
    supplementHash: jsonHash({}),
    expiresAt: new Date(Date.now() + 60_000),
  });
  return { tenantId, ownerId, caseId, caseRecord, blankVersion, maskVersion, confirmation };
}

function createSession({ user, tenant, membership }) {
  const session = {
    externalAuthSubject: user.externalAuthSubject,
    user,
    tenant,
    membership,
    serviceState: { status: "active" },
  };
  provenance.registerTenantSessionProvenance(session);
  // Exercise the same trusted-context gate used by the route before any call.
  assert.equal(createRequestContext(session).tenantId, tenant.id);
  return session;
}

const tenant = await repository.getTenantById("tenant_cherry");
const owner = await repository.getUserById("user_demo");
const operator = await repository.getUserById("user_ops");
const memberships = await repository.listTenantMemberships("user_demo");
const operatorMemberships = await repository.listTenantMemberships("user_ops");
assert.ok(tenant && owner && operator, "route auth fixtures must exist");
const ownerMembership = memberships.find((membership) => membership.tenantId === tenant.id);
const operatorMembership = operatorMemberships.find((membership) => membership.tenantId === tenant.id);
assert.ok(ownerMembership && operatorMembership, "route membership fixtures must exist");

const ownerSession = createSession({ user: owner, tenant, membership: ownerMembership });
const operatorSession = createSession({ user: operator, tenant, membership: operatorMembership });
const otherTenant = { ...tenant, id: "tenant_other", slug: "other-tenant" };
const otherTenantMembership = { ...ownerMembership, id: "membership_other_owner", tenantId: otherTenant.id };
const otherTenantSession = createSession({ user: owner, tenant: otherTenant, membership: otherTenantMembership });
const fixture = await makeFixture();

authState.session = ownerSession;
authState.unauthorized = true;
const unauthorized = await call({ action: "generationStatus", confirmationId: "not-authorized" });
assert.equal(unauthorized.status, 403, "unauthorized route request must be rejected");
assert.equal(unauthorized.body.error, "permission_denied", "unauthorized route error must be stable");
authState.unauthorized = false;

const ownerConfirmation = await fixture.confirmation();
authState.session = operatorSession;
const crossActorStatus = await call({ action: "generationStatus", confirmationId: ownerConfirmation.id });
assert.equal(crossActorStatus.status, 404, "cross-actor status refresh must not reveal the confirmation");
assert.equal(crossActorStatus.body.error, "generation_confirmation_not_found", "cross-actor status error must be stable");
authState.session = otherTenantSession;
const crossTenantStatus = await call({ action: "generationStatus", confirmationId: ownerConfirmation.id });
assert.equal(crossTenantStatus.status, 404, "cross-tenant status refresh must not reveal the confirmation");
assert.equal(crossTenantStatus.body.error, "generation_confirmation_not_found", "cross-tenant status error must be stable");
authState.session = ownerSession;

providerState.delayMs = 40;
const [first, second] = await Promise.all([
  call({ action: "generate", confirmationId: ownerConfirmation.id }),
  call({ action: "generate", confirmationId: ownerConfirmation.id }),
]);
assert.equal(providerState.calls, 1, "two concurrent route requests must invoke the provider exactly once");
assert.equal([first, second].filter((result) => result.status === 200).length, 1, "one concurrent route request must complete");
assert.equal([first, second].filter((result) => result.status === 409 && result.body.error === "generation_in_progress").length, 1, "the overlapping route request must return 409 processing");
const outputAfterConcurrency = await repository.listGuaranteeOutputsByCase({ tenantId: fixture.tenantId, caseId: fixture.caseId });
assert.equal(outputAfterConcurrency.filter((output) => output.previewConfirmationId === ownerConfirmation.id).length, 1, "concurrent route requests must persist one output");
const completedStatus = await call({ action: "generationStatus", confirmationId: ownerConfirmation.id });
assert.equal(completedStatus.status, 200, "completed generation must be visible to the owner status refresh");
assert.equal(completedStatus.body.status, "completed", "status refresh must report completion");
assert.equal(completedStatus.body.outputId, first.status === 200 ? first.body.outputId : second.body.outputId, "status refresh must expose the completed output id");

const consumedReentry = await call({ action: "generate", confirmationId: ownerConfirmation.id });
assert.equal(consumedReentry.status, 200, "consumed confirmation re-entry must be idempotent");
assert.equal(consumedReentry.body.idempotent, true, "consumed confirmation re-entry must be marked idempotent");
assert.equal(providerState.calls, 1, "consumed re-entry must not invoke the provider again");
const outputAfterReentry = await repository.listGuaranteeOutputsByCase({ tenantId: fixture.tenantId, caseId: fixture.caseId });
assert.equal(outputAfterReentry.filter((output) => output.previewConfirmationId === ownerConfirmation.id).length, 1, "consumed re-entry must not create another output");

const failedConfirmation = await fixture.confirmation();
providerState.delayMs = 0;
providerState.failNext = true;
const failed = await call({ action: "generate", confirmationId: failedConfirmation.id });
assert.equal(failed.status, 500, "provider failure must be collapsed to the route 500 error");
assert.equal(failed.body.error, "guarantee_slice1_failed", "provider failure must not leak provider details");
const released = await repository.getGuaranteePreviewConfirmation({ tenantId: fixture.tenantId, id: failedConfirmation.id, actorUserId: fixture.ownerId });
assert.equal(released?.status, "issued", "failed route generation must release the persistent claim");
const retried = await call({ action: "generate", confirmationId: failedConfirmation.id });
assert.equal(retried.status, 200, "released failed generation must be retryable");
assert.equal(providerState.calls, 3, "failure plus retry must invoke the provider once per attempt");
const retryOutputs = await repository.listGuaranteeOutputsByCase({ tenantId: fixture.tenantId, caseId: fixture.caseId });
assert.equal(retryOutputs.filter((output) => output.previewConfirmationId === failedConfirmation.id).length, 1, "failed retry must persist one output");

console.log(`[PASS] actual guarantee route handler auth isolation and generation ownership: unauthorized=403, cross-actor=404, cross-tenant=404, providerCalls=${providerState.calls}, outputs=${outputAfterReentry.length + retryOutputs.filter((output) => output.previewConfirmationId === failedConfirmation.id).length}`);
