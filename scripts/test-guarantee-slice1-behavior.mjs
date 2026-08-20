import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, extname, resolve } from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PDFDocument, degrees } from "pdf-lib";
import { renderGuaranteePdf, getGuaranteeFieldPlacement } from "../src/lib/guarantee-slice1-renderer.mjs";
import { pdfPointsToCanvasRect, resizePdfFieldFromBottomRight, serializeMaskLayout } from "../src/lib/guarantee-slice1-coordinates.mjs";
import { inspectGuaranteeBlankPdf, GUARANTEE_BLANK_FORM_MAX_BYTES } from "../src/lib/guarantee-slice1-pdf.mjs";
import { interpretGuaranteeBoolean, isGuaranteeSlice1TenantEnabled, resolveGuaranteeFieldValue } from "../src/lib/guarantee-slice1-policy.mjs";

// Load the real TypeScript memory adapter without adding a runtime dependency or
// touching the database. This is intentionally an adapter-level test, not a
// policy-state model or source-text scan.
const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;

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
process.env.GUARANTEE_G1_SLICE1_TENANT_ALLOWLIST = "tenant_cherry";

const repository = require(resolve(projectRoot, "src/lib/data.ts"));
const { DEFAULT_TENANT_ID } = require(resolve(projectRoot, "src/lib/tenant-constants.ts"));
const { assertGuaranteeSlice1Access } = require(resolve(projectRoot, "src/lib/guarantee-slice1-gate.ts"));

const tenantId = DEFAULT_TENANT_ID;
const adminId = "user_demo";
const memberId = "user_reviewer_slice1";
const caseId = "case_demo_asakusa_mori_rent";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const expectReject = async (operation, label) => {
  await assert.rejects(operation, label);
};

assert.doesNotThrow(() => assertGuaranteeSlice1Access({ tenantId, role: "tenant_owner", permission: "admin" }), "administrator permission is allowed");
assert.doesNotThrow(() => assertGuaranteeSlice1Access({ tenantId, role: "reviewer", permission: "generate" }), "ordinary output member permission is allowed");
assert.throws(() => assertGuaranteeSlice1Access({ tenantId, role: "reviewer", permission: "admin" }), /guarantee_template_admin_required/, "ordinary member cannot administer masks");
assert.throws(() => assertGuaranteeSlice1Access({ tenantId: "tenant_other", role: "tenant_owner", permission: "admin" }), /guarantee_slice1_disabled/, "non-allowlisted tenant is denied");
assert.equal(isGuaranteeSlice1TenantEnabled({ enabled: "true", deploymentEnvironment: "production", tenantId, allowlist: tenantId }), false, "formal production is always disabled");
assert.equal(isGuaranteeSlice1TenantEnabled({ enabled: "true", deploymentEnvironment: "preview", tenantId, allowlist: tenantId }), true, "preview allowlist is enabled");
assert.equal(isGuaranteeSlice1TenantEnabled({ enabled: "true", deploymentEnvironment: "staging", tenantId, allowlist: tenantId }), true, "staging allowlist is enabled");

assert.equal(interpretGuaranteeBoolean(true), true, "new boolean true is accepted");
assert.equal(interpretGuaranteeBoolean(false), false, "new boolean false is accepted");
assert.equal(interpretGuaranteeBoolean("確認済み"), true, "legacy confirmed value is accepted");
assert.equal(interpretGuaranteeBoolean("未確認"), false, "legacy unconfirmed value is accepted");
assert.equal(interpretGuaranteeBoolean("確認"), undefined, "ambiguous legacy phrase is unknown");
assert.equal(resolveGuaranteeFieldValue({ fieldType: "checkbox", sourceFieldKey: "company_option.friends_consent", fieldId: "consent", storageScope: "template_option", confirmedValue: "確認済み", supplement: { consent: "確認" } }), undefined, "unknown supplement does not become checked");

const sourceDocument = await PDFDocument.create();
sourceDocument.addPage([300, 200]);
const blankPdf = Buffer.from(await sourceDocument.save());
const loadedBlankPdf = await PDFDocument.load(blankPdf);
assert.doesNotThrow(() => inspectGuaranteeBlankPdf(loadedBlankPdf, blankPdf.length), "standard one-page PDF is accepted");
assert.throws(() => inspectGuaranteeBlankPdf(loadedBlankPdf, GUARANTEE_BLANK_FORM_MAX_BYTES + 1), /blank_form_file_too_large/, "20 MB upload limit is enforced");
const rotatedDocument = await PDFDocument.create();
const rotatedPage = rotatedDocument.addPage([300, 200]);
rotatedPage.setRotation(degrees(90));
const rotatedPdf = await PDFDocument.load(await rotatedDocument.save());
assert.throws(() => inspectGuaranteeBlankPdf(rotatedPdf, 1024), /blank_form_rotation_unsupported/, "rotated pages are rejected before calibration");
const croppedDocument = await PDFDocument.create();
const croppedPage = croppedDocument.addPage([300, 200]);
croppedPage.setCropBox(4, 0, 296, 200);
const croppedPdf = await PDFDocument.load(await croppedDocument.save());
assert.throws(() => inspectGuaranteeBlankPdf(croppedPdf, 1024), /blank_form_cropbox_unsupported/, "non-standard CropBox is rejected before calibration");
const oversizedDocument = await PDFDocument.create();
oversizedDocument.addPage([20_000, 200]);
const oversizedPdf = await PDFDocument.load(await oversizedDocument.save());
assert.throws(() => inspectGuaranteeBlankPdf(oversizedPdf, 1024), /blank_form_dimensions_unsupported/, "resource-risk page dimensions are rejected");
const blankAttachment = await repository.addPrivateAttachment({ tenantId, userId: adminId, targetType: "guarantee_blank_form", targetId: "slice1-blank", fileName: "slice1-blank.pdf", fileType: "application/pdf", content: blankPdf });
const blankForm = await repository.createGuaranteeBlankForm({ tenantId, userId: adminId, name: "TASK-038 一页测试表格" });
const blankVersion = await repository.addGuaranteeBlankFormVersion({ tenantId, blankFormId: blankForm.id, attachmentId: blankAttachment.id, uploadedByUserId: adminId, sha256: sha256(blankPdf), fileSizeBytes: blankPdf.length, pageCount: 1, pageWidth: 300, pageHeight: 200 });
const mask = await repository.createGuaranteeCompanyMask({ tenantId, blankFormId: blankForm.id, userId: adminId });
const layoutV1 = { coordinateSystem: "pdf_points_bottom_left_v1", fields: [
  { fieldId: "applicant_name", type: "text", sourceFieldKey: "applicant.name", x: 24, y: 140, width: 100, height: 18 },
  { fieldId: "applicant_birth_date", type: "date", sourceFieldKey: "applicant.birthDate", x: 24, y: 110, width: 100, height: 18 },
  { fieldId: "consent", type: "checkbox", sourceFieldKey: "company_option.friends_consent", x: 24, y: 90, width: 14, height: 14 },
] };
const confirmedData = { "applicant.name": "山田太郎", "applicant.birthDate": "2026-08-19" };
const resolveCaseValue = (data, key) => String(data[key] ?? "");
const resolveStorageScope = (key) => key.startsWith("company_option.") ? "template_option" : "case_fact";
const renderFixture = (consent) => renderGuaranteePdf({ source: blankPdf, mask: { layoutSnapshot: layoutV1 }, confirmedData, supplement: { consent }, resolveCaseValue, resolveStorageScope });

// The editor, coordinate conversion test, and renderer all use PDF points with
// a bottom-left origin. The resize delta grows downward on screen by lowering
// the PDF y origin while keeping the top edge anchored.
assert.deepEqual(pdfPointsToCanvasRect({ x: 100, y: 200, width: 50, height: 20 }, 600, 800, 300, 400), { left: 50, top: 290, width: 25, height: 10 }, "screen rectangle maps from PDF points");
assert.deepEqual(resizePdfFieldFromBottomRight({ x: 100, y: 200, width: 50, height: 20 }, 10, 15, 600, 800), { x: 100, y: 185, width: 60, height: 35 }, "bottom-right resize has the correct vertical direction");
assert.deepEqual(getGuaranteeFieldPlacement(layoutV1.fields[0]), { x: 24, y: 140, width: 100, height: 18, textBaselineY: 148, checkboxStart: { x: 24, y: 148.1 }, checkboxMid: { x: 59, y: 140 }, checkboxEnd: { x: 124, y: 158 } }, "renderer placement uses the saved PDF coordinate");

const testV1Bytes = await renderFixture(true);
const testUncheckedBytes = await renderFixture(false);
assert.ok(testV1Bytes.length > 1000, "test produces an actual PDF");
assert.notEqual(testV1Bytes.toString("base64"), testUncheckedBytes.toString("base64"), "checked and unchecked PDFs differ");
const renderedPdf = await PDFDocument.load(testV1Bytes);
assert.deepEqual(renderedPdf.getPage(0).getSize(), { width: 300, height: 200 }, "render keeps source page dimensions");
const contentStreams = renderedPdf.getPage(0).node.Contents();
let content = "";
for (let index = 0; index < contentStreams.size(); index += 1) {
  const stream = renderedPdf.getPage(0).node.context.lookup(contentStreams.get(index));
  content += inflateSync(Buffer.from(stream.getContents())).toString("utf8");
}
assert.match(content, /1 0 0 1 24 148 Tm/, "Japanese text is drawn at the expected field baseline");
assert.match(content, /1 0 0 1 24 118 Tm/, "date text is drawn at the expected field baseline");
assert.match(content, /24 96\.3 m[\s\S]*28\.9 90 l[\s\S]*38 104 l/, "checked checkbox strokes are drawn near the expected box");

const layoutDigestV1 = serializeMaskLayout(layoutV1.fields);
let draft = await repository.addGuaranteeCompanyMaskVersion({ tenantId, maskId: mask.id, blankFormVersionId: blankVersion.id, userId: adminId, fieldCatalogVersion: "slice1-v1", layoutSnapshot: layoutV1, status: "draft" });
await repository.markGuaranteeCompanyMaskVersionTested({ tenantId, maskVersionId: draft.id, userId: adminId, testPdfSha256: sha256(testV1Bytes), testedLayoutDigest: layoutDigestV1 });
await repository.confirmGuaranteeCompanyMaskVersionTest({ tenantId, maskVersionId: draft.id, userId: adminId, testPdfSha256: sha256(testV1Bytes) });
draft = await repository.addGuaranteeCompanyMaskVersion({ tenantId, maskId: mask.id, blankFormVersionId: blankVersion.id, userId: adminId, fieldCatalogVersion: "slice1-v1", layoutSnapshot: { ...layoutV1, fields: layoutV1.fields.map((field) => field.fieldId === "consent" ? { ...field, x: 30 } : field) }, status: "draft" });
assert.equal(draft.testedAt, undefined, "editing a draft clears the prior test");
assert.equal(draft.testConfirmedAt, undefined, "editing a draft clears the prior confirmation");
const editedLayoutDigest = serializeMaskLayout(draft.layoutSnapshot.fields);
assert.notEqual(editedLayoutDigest, layoutDigestV1, "edited layout has a new digest");
await repository.markGuaranteeCompanyMaskVersionTested({ tenantId, maskVersionId: draft.id, userId: adminId, testPdfSha256: sha256(testV1Bytes), testedLayoutDigest: editedLayoutDigest });
await repository.confirmGuaranteeCompanyMaskVersionTest({ tenantId, maskVersionId: draft.id, userId: adminId, testPdfSha256: sha256(testV1Bytes) });
const publishedV1 = await repository.publishGuaranteeCompanyMaskVersionWithExactMatch({ tenantId, maskVersionId: draft.id, userId: adminId, layoutDigest: editedLayoutDigest });
assert.equal(publishedV1.match.status, "exact", "only a confirmed, matching tested layout becomes exact");
const v1Version = publishedV1.version;

// A published company mask is reusable: supplements are persisted per case
// under the logical mask, while the case facts remain the source of truth.
const caseA = await repository.getBrokerageCaseById({ tenantId, userId: adminId, caseId });
const caseBId = "case_demo_kachidoki_rent";
const caseB = await repository.getBrokerageCaseById({ tenantId, userId: adminId, caseId: caseBId });
assert.ok(caseA && caseB && caseA.id !== caseB.id, "two existing cases are available for the reusable-mask flow");
await repository.saveGuaranteeApplicationDraft({ tenantId, userId: memberId, caseId, templateId: mask.id, companyCode: "friends_guarantee", status: "draft", fieldValuesJson: { "company_option.friends_consent": true } });
await repository.saveGuaranteeApplicationDraft({ tenantId, userId: memberId, caseId: caseBId, templateId: mask.id, companyCode: "friends_guarantee", status: "draft", fieldValuesJson: { "company_option.friends_consent": false } });
const restoredA = await repository.getGuaranteeApplicationDraft({ tenantId, userId: memberId, caseId, templateId: mask.id });
const restoredB = await repository.getGuaranteeApplicationDraft({ tenantId, userId: memberId, caseId: caseBId, templateId: mask.id });
assert.equal(restoredA?.fieldValuesJson["company_option.friends_consent"], true, "case A supplement is persisted under the reusable company mask");
assert.equal(restoredB?.fieldValuesJson["company_option.friends_consent"], false, "case B supplement is persisted independently");
const caseABytes = await renderGuaranteePdf({ source: blankPdf, mask: { layoutSnapshot: layoutV1 }, confirmedData: caseA.confirmedDataJson, supplement: { consent: true }, resolveCaseValue, resolveStorageScope });
const caseBBytes = await renderGuaranteePdf({ source: blankPdf, mask: { layoutSnapshot: layoutV1 }, confirmedData: caseB.confirmedDataJson, supplement: { consent: false }, resolveCaseValue, resolveStorageScope });
assert.notEqual(sha256(caseABytes), sha256(caseBBytes), "the same published mask renders each case's own facts");

const confirmation = await repository.createGuaranteePreviewConfirmation({ tenantId, actorUserId: memberId, caseId, caseInputSnapshotHash: "case-hash-v1", blankFormVersionId: blankVersion.id, blankFormSha256: blankVersion.sha256, companyMaskVersionId: v1Version.id, fieldCatalogVersion: "slice1-v1", supplementSnapshot: { consent: true }, supplementHash: "supp-v1", expiresAt: new Date(Date.now() + 60_000) });
const claims = await Promise.all([
  repository.claimGuaranteePreviewConfirmation({ tenantId, id: confirmation.id, actorUserId: memberId }),
  repository.claimGuaranteePreviewConfirmation({ tenantId, id: confirmation.id, actorUserId: memberId }),
]);
const claimed = claims.find(Boolean);
assert.ok(claimed?.processingToken, "one concurrent confirmation request obtains the processing lease");
assert.equal(claims.filter(Boolean).length, 1, "concurrent confirmation claim has one winner");
const v1OutputAttachment = await repository.addPrivateAttachment({ tenantId, userId: memberId, targetType: "guarantee_generated_output", targetId: confirmation.id, fileName: "slice1-v1.pdf", fileType: "application/pdf", content: testV1Bytes });
const finalized = await repository.finalizeGuaranteePreviewOutput({ confirmationId: confirmation.id, processingToken: claimed.processingToken, output: { tenantId, userId: memberId, actorId: memberId, outputType: "guarantee_application", outputFormat: "pdf", language: "ja", title: "TASK-038 v1", documentNumber: "TASK-038-V1", caseId, draftValueSnapshot: { consent: true }, layoutSnapshot: layoutV1, fileAttachmentId: v1OutputAttachment.id, fileSha256: sha256(testV1Bytes), fileSizeBytes: testV1Bytes.length, fileMimeType: "application/pdf", blankFormVersionId: blankVersion.id, blankFormSha256: blankVersion.sha256, companyMaskVersionId: v1Version.id, fieldCatalogVersion: "slice1-v1", caseInputSnapshotHash: "case-hash-v1" } });
const v1Output = await repository.getGuaranteeOutputByCase({ tenantId, caseId, id: finalized.output.id });
const v1BytesBeforeV2 = await repository.readPrivateAttachmentContentForTenant({ tenantId, id: v1Output.fileAttachmentId });
assert.equal(sha256(v1BytesBeforeV2), sha256(testV1Bytes), "history reads the saved v1 PDF bytes");
const retryClaim = await repository.claimGuaranteePreviewConfirmation({ tenantId, id: confirmation.id, actorUserId: memberId });
assert.equal(retryClaim.generatedOutputId, finalized.output.id, "consumed confirmation retry returns the same output");
const outputsForConfirmation = (await repository.listGeneratedOutputs({ tenantId, userId: memberId })).filter((item) => item.previewConfirmationId === confirmation.id);
assert.equal(outputsForConfirmation.length, 1, "concurrent/retried confirmation creates one output and therefore one stored PDF attachment");

const confirmationCaseB = await repository.createGuaranteePreviewConfirmation({ tenantId, actorUserId: memberId, caseId: caseBId, caseInputSnapshotHash: "case-hash-b-v1", blankFormVersionId: blankVersion.id, blankFormSha256: blankVersion.sha256, companyMaskVersionId: v1Version.id, fieldCatalogVersion: "slice1-v1", supplementSnapshot: { consent: false }, supplementHash: "supp-b-v1", expiresAt: new Date(Date.now() + 60_000) });
const claimedCaseB = await repository.claimGuaranteePreviewConfirmation({ tenantId, id: confirmationCaseB.id, actorUserId: memberId });
assert.ok(claimedCaseB?.processingToken, "case B can reuse the published mask without uploading or editing it again");
const caseBAttachment = await repository.addPrivateAttachment({ tenantId, userId: memberId, targetType: "guarantee_generated_output", targetId: confirmationCaseB.id, fileName: "slice1-case-b.pdf", fileType: "application/pdf", content: caseBBytes });
const finalizedCaseB = await repository.finalizeGuaranteePreviewOutput({ confirmationId: confirmationCaseB.id, processingToken: claimedCaseB.processingToken, output: { tenantId, userId: memberId, actorId: memberId, outputType: "guarantee_application", outputFormat: "pdf", language: "ja", title: "TASK-038 case B", documentNumber: "TASK-038-B", caseId: caseBId, draftValueSnapshot: { consent: false }, layoutSnapshot: layoutV1, fileAttachmentId: caseBAttachment.id, fileSha256: sha256(caseBBytes), fileSizeBytes: caseBBytes.length, fileMimeType: "application/pdf", blankFormVersionId: blankVersion.id, blankFormSha256: blankVersion.sha256, companyMaskVersionId: v1Version.id, fieldCatalogVersion: "slice1-v1", caseInputSnapshotHash: "case-hash-b-v1" } });
assert.equal(finalizedCaseB.output.companyMaskVersionId, v1Version.id, "case B output keeps the same published mask version");
assert.notEqual(finalizedCaseB.output.caseId, finalized.output.caseId, "case A and case B outputs remain separate records");

const layoutV2 = { ...layoutV1, fields: layoutV1.fields.map((field) => field.fieldId === "applicant_name" ? { ...field, x: 40 } : field) };
let draftV2 = await repository.addGuaranteeCompanyMaskVersion({ tenantId, maskId: mask.id, blankFormVersionId: blankVersion.id, userId: adminId, fieldCatalogVersion: "slice1-v1", layoutSnapshot: layoutV2, status: "draft" });
const v2Bytes = await renderGuaranteePdf({ source: blankPdf, mask: { layoutSnapshot: layoutV2 }, confirmedData, supplement: { consent: true }, resolveCaseValue, resolveStorageScope });
const digestV2 = serializeMaskLayout(layoutV2.fields);
await repository.markGuaranteeCompanyMaskVersionTested({ tenantId, maskVersionId: draftV2.id, userId: adminId, testPdfSha256: sha256(v2Bytes), testedLayoutDigest: digestV2 });
await repository.confirmGuaranteeCompanyMaskVersionTest({ tenantId, maskVersionId: draftV2.id, userId: adminId, testPdfSha256: sha256(v2Bytes) });
const publishedV2 = await repository.publishGuaranteeCompanyMaskVersionWithExactMatch({ tenantId, maskVersionId: draftV2.id, userId: adminId, layoutDigest: digestV2 });
assert.equal(publishedV2.version.versionNumber, v1Version.versionNumber + 1, "v2 is a new immutable version");
const v1OutputAfterV2 = await repository.getGuaranteeOutputByCase({ tenantId, caseId, id: finalized.output.id });
const v1BytesAfterV2 = await repository.readPrivateAttachmentContentForTenant({ tenantId, id: v1OutputAfterV2.fileAttachmentId });
assert.equal(sha256(v1BytesAfterV2), sha256(v1BytesBeforeV2), "v1 bytes remain unchanged after v2 publish");
assert.equal(v1OutputAfterV2.companyMaskVersionId, v1Version.id, "history keeps the v1 mask version reference");
assert.equal(v1OutputAfterV2.previewConfirmationId, confirmation.id, "history keeps the v1 confirmation reference");
assert.equal(v1OutputAfterV2.fileAttachmentId, v1Output.fileAttachmentId, "history keeps the v1 attachment reference");

const draftFailure = await repository.addGuaranteeCompanyMaskVersion({ tenantId, maskId: mask.id, blankFormVersionId: blankVersion.id, userId: adminId, fieldCatalogVersion: "slice1-v1", layoutSnapshot: layoutV2, status: "draft" });
await repository.markGuaranteeCompanyMaskVersionTested({ tenantId, maskVersionId: draftFailure.id, userId: adminId, testPdfSha256: sha256(v2Bytes), testedLayoutDigest: digestV2 });
await repository.confirmGuaranteeCompanyMaskVersionTest({ tenantId, maskVersionId: draftFailure.id, userId: adminId, testPdfSha256: sha256(v2Bytes) });
await expectReject(repository.publishGuaranteeCompanyMaskVersionWithExactMatch({ tenantId, maskVersionId: draftFailure.id, userId: adminId, layoutDigest: digestV2, failureInjection: "before_match" }), "injected match failure is surfaced");
const maskAfterFailure = await repository.getGuaranteeCompanyMask({ tenantId, id: mask.id });
const failedVersion = await repository.getGuaranteeCompanyMaskVersion({ tenantId, id: draftFailure.id });
const failedMatch = await repository.getGuaranteeMaskMatch({ tenantId, blankFormVersionId: blankVersion.id, maskVersionId: draftFailure.id });
assert.equal(maskAfterFailure.activeVersionId, publishedV2.version.id, "failed publish leaves the previous active version");
assert.equal(failedVersion.status, "draft", "failed publish leaves the candidate draft unpublished");
assert.equal(failedMatch, undefined, "failed publish does not create an exact match");

console.log("[PASS] TASK-038 real memory-adapter behavior, coordinates, strict booleans, PDF geometry, rollback, idempotency, and v1 immutability checks");
