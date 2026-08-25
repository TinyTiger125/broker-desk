import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { pdf2img } from "@pdfme/converter";
import {
  deleteGeneratedOutputForTenant,
  addGuaranteeBlankFormVersion,
  addGuaranteeCompanyMaskVersion,
  addPrivateAttachment,
  deletePrivateAttachmentForTenant,
  claimGuaranteePreviewConfirmation,
  createGuaranteeBlankForm,
  deleteGuaranteeBlankFormVersionForTenant,
  deleteGuaranteeBlankFormForTenant,
  getGuaranteeBlankForm,
  createGuaranteeCompanyMask,
  getGuaranteeMaskMatch,
  createGuaranteePreviewConfirmation,
  getBrokerageCaseByIdForContext,
  getGuaranteeBlankFormVersion,
  getGuaranteeCompanyMask,
  getGuaranteeCompanyMaskVersion,
  getGuaranteeApplicationDraft,
  saveGuaranteeApplicationDraft,
  readPrivateAttachmentContentForTenant,
  releaseGuaranteePreviewConfirmation,
  finalizeGuaranteePreviewOutput,
  markGuaranteeCompanyMaskVersionTested,
  confirmGuaranteeCompanyMaskVersionTest,
  publishGuaranteeCompanyMaskVersionWithExactMatch,
  rollbackGuaranteeCompanyMaskVersion,
} from "@/lib/data";
import { getCaseFieldValue } from "@/lib/case-field-normalization";
import { getCaseFieldDefinition } from "@/lib/case-field-catalog";
import { assertGuaranteeSlice1Access } from "@/lib/guarantee-slice1-gate";
import { renderGuaranteePdf as renderPdf } from "@/lib/guarantee-slice1-renderer.mjs";
import { GUARANTEE_COORDINATE_SYSTEM, serializeMaskLayout } from "@/lib/guarantee-slice1-coordinates.mjs";
import { GUARANTEE_BLANK_FORM_MAX_BYTES, inspectGuaranteeBlankPdf, withGuaranteePdfTimeout } from "@/lib/guarantee-slice1-pdf.mjs";
import { resolveGuaranteeFieldValue } from "@/lib/guarantee-slice1-policy.mjs";
import { getTenantCapability, requireTenantSession, TenantSessionError } from "@/lib/tenant-session";
import { createRequestContext } from "@/lib/visibility-resolver";
import { assertCaseSourcesReadable, withW93SourceProvenance } from "@/lib/w93-access";

export const runtime = "nodejs";

function hash(value: string | Buffer | Uint8Array) { return createHash("sha256").update(value).digest("hex"); }
function jsonHash(value: unknown) { return hash(JSON.stringify(value, Object.keys((value as Record<string, unknown>) ?? {}).sort())); }

// Only these stable business outcomes are safe to expose to the browser. Any
// unexpected Error may contain database, storage, or library implementation
// details and must be collapsed to the generic 500 response below.
const GUARANTEE_PUBLIC_ERROR_CODES = new Set([
  "application_draft_context_required",
  "application_draft_save_context_required",
  "blank_form_declaration_required",
  "blank_form_dimensions_unsupported",
  "blank_form_file_too_large",
  "blank_form_not_ready",
  "blank_form_page_origin_unsupported",
  "blank_form_pdf_rejected",
  "blank_form_pdf_required",
  "blank_form_preview_unavailable",
  "blank_form_processing_timeout",
  "blank_form_required",
  "blank_form_rotation_unsupported",
  "blank_form_cropbox_unsupported",
  "blank_form_unavailable",
  "blank_form_encrypted_unsupported",
  "case_not_found",
  "generation_confirmation_claim_token_missing",
  "generation_in_progress_or_not_found",
  "guarantee_blank_form_not_found",
  "guarantee_checkbox_value_unknown",
  "guarantee_output_generate_permission_required",
  "guarantee_output_permission_required",
  "guarantee_pdf_font_unavailable",
  "guarantee_slice1_action_invalid",
  "guarantee_slice1_disabled",
  "guarantee_template_admin_required",
  "mask_blank_form_mismatch",
  "mask_coordinate_invalid",
  "mask_coordinate_out_of_bounds",
  "mask_draft_fields_required",
  "mask_draft_target_not_found",
  "mask_match_not_exact",
  "mask_publish_requires_confirmed_test",
  "mask_publish_requires_retest",
  "mask_rollback_context_required",
  "mask_rollback_failed",
  "mask_source_field_required",
  "mask_source_field_type_mismatch",
  "mask_source_field_unknown",
  "mask_test_blank_form_not_ready",
  "mask_test_case_not_accessible",
  "mask_test_confirmation_invalid",
  "mask_test_confirmation_required",
  "mask_test_context_required",
  "mask_test_failed",
  "mask_test_pdf_generation_failed",
  "mask_test_version_not_found",
  "mask_version_not_found",
  "mask_version_required",
  "permission_denied",
  "preview_confirmation_expired",
  "preview_confirmation_required",
  "preview_context_required",
  "preview_stale",
  "slice1_single_page_pdf_required",
  "tenant_forbidden",
  "tenant_not_found",
  "tenant_selection_required",
  "user_not_found",
]);

function jsonError(error: unknown, requestId: string) {
  const candidate = error instanceof TenantSessionError ? error.code : error instanceof Error ? error.message : "";
  const code = GUARANTEE_PUBLIC_ERROR_CODES.has(candidate) ? candidate : "guarantee_slice1_failed";
  const status = code === "guarantee_slice1_failed"
    ? 500
    : error instanceof TenantSessionError && code === error.code
      ? error.status
      : code.includes("disabled") || code.includes("permission") || code.includes("required") || code.includes("forbidden")
        ? 403
        : 400;
  return NextResponse.json({ error: code, requestId }, { status });
}
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
async function renderBlankPagePreview(bytes: Buffer): Promise<Buffer> {
  try {
    const images = await withGuaranteePdfTimeout(pdf2img(bytes, { range: { start: 0, end: 0 }, scale: 1 }));
    const image = images[0];
    if (!image) throw new Error("blank_form_preview_unavailable");
    return Buffer.from(image);
  } catch (error) {
    if (error instanceof Error && error.message === "blank_form_processing_timeout") throw error;
    throw new Error("blank_form_preview_unavailable");
  }
}
function layoutDigest(layoutSnapshot: Record<string, unknown>) {
  const fields = Array.isArray(layoutSnapshot.fields) ? layoutSnapshot.fields : [];
  return serializeMaskLayout(fields);
}

async function renderGuaranteePdf(source: Buffer, mask: Awaited<ReturnType<typeof getGuaranteeCompanyMaskVersion>>, confirmedData: Record<string, unknown>, supplement: Record<string, unknown>): Promise<Buffer> {
  return renderPdf({
    source,
    mask,
    confirmedData,
    supplement,
    resolveCaseValue: (data: Record<string, unknown>, fieldKey: string) => getCaseFieldValue(data, fieldKey),
    resolveStorageScope: (fieldKey: string) => getCaseFieldDefinition(fieldKey)?.storageScope,
  });
}

function validateSupplementValues(mask: Awaited<ReturnType<typeof getGuaranteeCompanyMaskVersion>>, confirmedData: Record<string, unknown>, supplement: Record<string, unknown>) {
  const fields = Array.isArray(mask?.layoutSnapshot?.fields) ? mask.layoutSnapshot.fields : [];
  for (const rawField of fields) {
    const field = asRecord(rawField);
    if (String(field.type ?? "") !== "checkbox") continue;
    const sourceFieldKey = String(field.sourceFieldKey ?? "");
    const value = resolveGuaranteeFieldValue({
      fieldType: "checkbox",
      sourceFieldKey,
      fieldId: String(field.fieldId ?? ""),
      storageScope: getCaseFieldDefinition(sourceFieldKey)?.storageScope,
      confirmedValue: getCaseFieldValue(confirmedData, sourceFieldKey),
      confirmedData,
      supplement,
    });
    if (value === undefined) throw new Error("guarantee_checkbox_value_unknown");
  }
}

function normalizeApplicationSupplement(value: Record<string, unknown>) {
  const stringValue = (key: string) => typeof value[key] === "string" ? String(value[key]).trim() : "";
  return {
    "application.guarantee_company": stringValue("guaranteeCompany") || "friends_guarantee",
    "application.application_date": stringValue("applicationDate"),
    "company_option.friends_plan_type": stringValue("planType"),
    "company_option.friends_consent": value.consent === true,
    "company_option.friends_collection_agency": stringValue("collectionAgency"),
    "company_option.friends_single_rider": stringValue("singleRider"),
    "company_option.friends_notes": stringValue("notes"),
  } satisfies Record<string, unknown>;
}

async function loadCurrentPublishedMaskContext(tenantId: string, maskVersionId: string) {
  const mask = await getGuaranteeCompanyMaskVersion({ tenantId, id: maskVersionId });
  const blank = mask ? await getGuaranteeBlankFormVersion({ tenantId, id: mask.blankFormVersionId }) : undefined;
  const match = blank && mask ? await getGuaranteeMaskMatch({ tenantId, blankFormVersionId: blank.id, maskVersionId: mask.id }) : undefined;
  const blankForm = blank ? await getGuaranteeBlankForm({ tenantId, id: blank.blankFormId }) : undefined;
  const companyMask = mask ? await getGuaranteeCompanyMask({ tenantId, id: mask.maskId }) : undefined;
  if (!blank || !mask || !match || match.status !== "exact" || blank.status !== "ready" || mask.status !== "published" || mask.blankFormVersionId !== blank.id || mask.blankFormId !== blank.blankFormId || blankForm?.activeVersionId !== blank.id || companyMask?.activeVersionId !== mask.id) {
    throw new Error("mask_match_not_exact");
  }
  return { blank, mask };
}

async function requireSession(permission: "admin" | "member" | "generate") {
  const session = await requireTenantSession({ permission: permission === "admin" ? "template.edit_draft" : permission === "generate" ? "output.generate_final" : "output.preview" });
  assertGuaranteeSlice1Access({ tenantId: session.tenant.id, capability: getTenantCapability(session.membership), permission });
  return session;
}

async function requireWritableCase(session: Awaited<ReturnType<typeof requireSession>>, caseId: string) {
  const context = createRequestContext(session);
  const resolved = await getBrokerageCaseByIdForContext({ context, caseId });
  if (!resolved.brokerageCase || !resolved.resolution.canWrite) throw new Error("case_not_found");
  await assertCaseSourcesReadable(context, resolved.brokerageCase);
  return { context, brokerageCase: resolved.brokerageCase };
}

async function handleUpload(request: Request) {
  const session = await requireSession("admin");
  const form = await request.formData();
  const file = form.get("file");
  if (form.get("blankFormDeclaration") !== "on") throw new Error("blank_form_declaration_required");
  if (!(file instanceof File) || file.type !== "application/pdf") throw new Error("blank_form_pdf_required");
  if (file.size > GUARANTEE_BLANK_FORM_MAX_BYTES) throw new Error("blank_form_file_too_large");
  const bytes = Buffer.from(await file.arrayBuffer());
  let pdf: PDFDocument;
  try { pdf = await withGuaranteePdfTimeout(PDFDocument.load(bytes, { ignoreEncryption: false })); } catch (error) {
    if (error instanceof Error && error.message === "blank_form_processing_timeout") throw error;
    if (error instanceof Error && /encrypted|password|encryption/i.test(error.message)) throw new Error("blank_form_encrypted_unsupported");
    throw new Error("blank_form_pdf_rejected");
  }
  let inspected: ReturnType<typeof inspectGuaranteeBlankPdf>;
  try { inspected = inspectGuaranteeBlankPdf(pdf, bytes.length); } catch (error) { throw error; }
  const size = { width: inspected.width, height: inspected.height };
  const blankPagePreview = await renderBlankPagePreview(bytes);
  const tenantId = session.tenant.id;
  const requestedBlankFormId = String(form.get("blankFormId") ?? "").trim();
  const createdBlankForm = !requestedBlankFormId;
  const blankForm = requestedBlankFormId
    ? await getGuaranteeBlankForm({ tenantId, id: requestedBlankFormId })
    : await createGuaranteeBlankForm({ tenantId, userId: session.user.id, name: String(form.get("name") ?? file.name).trim() || file.name, recipientOrPurpose: String(form.get("recipientOrPurpose") ?? "").trim() || undefined });
  if (!blankForm) throw new Error("guarantee_blank_form_not_found");
  let attachmentId: string | undefined;
  let blankFormVersionId: string | undefined;
  try {
    const attachment = await addPrivateAttachment({ tenantId, userId: session.user.id, targetType: "guarantee_blank_form", targetId: blankForm.id, fileName: file.name || "blank-form.pdf", fileType: "application/pdf", content: bytes });
    attachmentId = attachment.id;
    const version = await addGuaranteeBlankFormVersion({ tenantId, blankFormId: blankForm.id, attachmentId: attachment.id, uploadedByUserId: session.user.id, sha256: hash(bytes), fileSizeBytes: bytes.length, pageCount: 1, pageWidth: size.width, pageHeight: size.height, status: "ready" });
    blankFormVersionId = version.id;
    const mask = await createGuaranteeCompanyMask({ tenantId, blankFormId: blankForm.id, userId: session.user.id });
    return NextResponse.json({ blankForm, blankFormVersion: version, maskId: mask.id, blankPdfBase64: bytes.toString("base64"), blankPagePngBase64: blankPagePreview.toString("base64") });
  } catch (error) {
    if (blankFormVersionId) await deleteGuaranteeBlankFormVersionForTenant({ tenantId, id: blankFormVersionId });
    if (attachmentId) await deletePrivateAttachmentForTenant({ tenantId, id: attachmentId });
    if (createdBlankForm) await deleteGuaranteeBlankFormForTenant({ tenantId, id: blankForm.id });
    throw error;
  }
}

async function handleDraft(request: Request) {
  const session = await requireSession("admin");
  const body = asRecord(await request.json());
  const tenantId = session.tenant.id;
  const maskId = String(body.maskId ?? "");
  const blankFormVersionId = String(body.blankFormVersionId ?? "");
  const fields = Array.isArray(body.fields) ? body.fields : [];
  if (!maskId || !blankFormVersionId || fields.length === 0) throw new Error("mask_draft_fields_required");
  const blank = await getGuaranteeBlankFormVersion({ tenantId, id: blankFormVersionId });
  const companyMask = await getGuaranteeCompanyMask({ tenantId, id: maskId });
  if (!blank || blank.status !== "ready" || !companyMask) throw new Error("mask_draft_target_not_found");
  if (companyMask.blankFormId !== blank.blankFormId) throw new Error("mask_blank_form_mismatch");
  const safeFields = fields.map((item) => {
    const field = asRecord(item);
    const type = field.type === "date" || field.type === "checkbox" ? field.type : "text";
    const pageNumber = Number(field.pageNumber ?? 1); const x = Number(field.x); const y = Number(field.y); const width = Number(field.width); const height = Number(field.height);
    if (![pageNumber, x, y, width, height].every(Number.isFinite) || pageNumber !== 1 || x < 0 || y < 0 || width <= 0 || height <= 0) throw new Error("mask_coordinate_invalid");
    const sourceFieldKey = String(field.sourceFieldKey ?? "").trim();
    if (!sourceFieldKey) throw new Error("mask_source_field_required");
    const definition = getCaseFieldDefinition(sourceFieldKey);
    if (!definition) throw new Error("mask_source_field_unknown");
    if (type === "date" && definition.valueKind !== "date") throw new Error("mask_source_field_type_mismatch");
    if (type === "checkbox" && definition.valueKind !== "boolean") throw new Error("mask_source_field_type_mismatch");
    if (x + width > blank.pageWidth || y + height > blank.pageHeight) throw new Error("mask_coordinate_out_of_bounds");
    return { fieldId: String(field.fieldId ?? randomUUID()), type, sourceFieldKey, label: String(field.label ?? ""), pageNumber, x, y, width, height, coordinateSystem: GUARANTEE_COORDINATE_SYSTEM };
  });
  const maskVersion = await addGuaranteeCompanyMaskVersion({ tenantId, maskId, blankFormVersionId, userId: session.user.id, fieldCatalogVersion: "slice1-v1", layoutSnapshot: { coordinateSystem: GUARANTEE_COORDINATE_SYSTEM, fields: safeFields }, status: "draft" });
  return NextResponse.json({ maskVersion });
}

async function handleLoadAdminMask(request: Request) {
  const session = await requireSession("admin");
  const body = asRecord(await request.json());
  const maskVersionId = String(body.maskVersionId ?? "").trim();
  if (!maskVersionId) throw new Error("mask_version_required");
  const tenantId = session.tenant.id;
  const version = await getGuaranteeCompanyMaskVersion({ tenantId, id: maskVersionId });
  if (!version || (version.status !== "draft" && version.status !== "published")) throw new Error("mask_version_not_found");
  const blankVersion = await getGuaranteeBlankFormVersion({ tenantId, id: version.blankFormVersionId });
  const blankForm = await getGuaranteeBlankForm({ tenantId, id: version.blankFormId });
  const companyMask = await getGuaranteeCompanyMask({ tenantId, id: version.maskId });
  if (!blankVersion || !blankForm || !companyMask || blankVersion.status !== "ready" || blankVersion.blankFormId !== version.blankFormId) throw new Error("mask_draft_target_not_found");
  const source = await readPrivateAttachmentContentForTenant({ tenantId, id: blankVersion.attachmentId });
  if (!source) throw new Error("blank_form_unavailable");
  const blankPagePreview = await renderBlankPagePreview(source);
  return NextResponse.json({
    blankForm,
    blankFormVersion: blankVersion,
    maskId: companyMask.id,
    maskVersion: version,
    blankPdfBase64: source.toString("base64"),
    blankPagePngBase64: blankPagePreview.toString("base64"),
  });
}

async function handleLoadAdminBlankForm(request: Request) {
  const session = await requireSession("admin");
  const body = asRecord(await request.json());
  const blankFormId = String(body.blankFormId ?? "").trim();
  if (!blankFormId) throw new Error("blank_form_required");
  const requestedBlankFormVersionId = String(body.blankFormVersionId ?? "").trim();
  const requestedMaskId = String(body.maskId ?? "").trim();
  const tenantId = session.tenant.id;
  const blankForm = await getGuaranteeBlankForm({ tenantId, id: blankFormId });
  if (!blankForm?.activeVersionId) throw new Error("blank_form_not_ready");
  const blankVersion = await getGuaranteeBlankFormVersion({ tenantId, id: requestedBlankFormVersionId || blankForm.activeVersionId });
  if (!blankVersion || blankVersion.status !== "ready" || blankVersion.blankFormId !== blankForm.id || blankVersion.id !== blankForm.activeVersionId) throw new Error("blank_form_not_ready");
  const companyMask = requestedMaskId
    ? await getGuaranteeCompanyMask({ tenantId, id: requestedMaskId })
    : await createGuaranteeCompanyMask({ tenantId, blankFormId: blankForm.id, userId: session.user.id });
  if (!companyMask || companyMask.blankFormId !== blankForm.id) throw new Error("mask_draft_target_not_found");
  const source = await readPrivateAttachmentContentForTenant({ tenantId, id: blankVersion.attachmentId });
  if (!source) throw new Error("blank_form_unavailable");
  const blankPagePreview = await renderBlankPagePreview(source);
  return NextResponse.json({
    blankForm,
    blankFormVersion: blankVersion,
    maskId: companyMask.id,
    blankPdfBase64: source.toString("base64"),
    blankPagePngBase64: blankPagePreview.toString("base64"),
  });
}

async function handlePublish(request: Request) {
  const session = await requireSession("admin");
  const body = asRecord(await request.json());
  const maskVersionId = String(body.maskVersionId ?? "");
  const version = await getGuaranteeCompanyMaskVersion({ tenantId: session.tenant.id, id: maskVersionId });
  if (!version) throw new Error("mask_version_not_found");
  const expectedLayoutDigest = String(body.layoutDigest ?? "");
  if (!expectedLayoutDigest || expectedLayoutDigest !== version.testedLayoutDigest) throw new Error("mask_publish_requires_retest");
  const blank = await getGuaranteeBlankFormVersion({ tenantId: session.tenant.id, id: version.blankFormVersionId });
  const companyMask = await getGuaranteeCompanyMask({ tenantId: session.tenant.id, id: version.maskId });
  if (!blank || !companyMask || blank.status !== "ready" || companyMask.blankFormId !== blank.blankFormId || version.blankFormId !== blank.blankFormId) throw new Error("blank_form_not_ready");
  if (version.status === "published") {
    const existingMatch = await getGuaranteeMaskMatch({ tenantId: session.tenant.id, blankFormVersionId: blank.id, maskVersionId });
    if (!version.testConfirmedAt || existingMatch?.status !== "exact") throw new Error("mask_publish_requires_confirmed_test");
    return NextResponse.json({ maskVersion: version, match: existingMatch.status });
  }
  const published = await publishGuaranteeCompanyMaskVersionWithExactMatch({ tenantId: session.tenant.id, maskVersionId, userId: session.user.id, layoutDigest: expectedLayoutDigest });
  if (!published) throw new Error("mask_publish_requires_confirmed_test");
  return NextResponse.json({ maskVersion: published.version, match: published.match.status });
}

async function handleTest(request: Request) {
  const session = await requireSession("admin");
  const body = asRecord(await request.json());
  const maskVersionId = String(body.maskVersionId ?? "");
  const caseId = String(body.caseId ?? "");
  if (!maskVersionId || !caseId) throw new Error("mask_test_context_required");
  const version = await getGuaranteeCompanyMaskVersion({ tenantId: session.tenant.id, id: maskVersionId });
  if (!version || version.status !== "draft") throw new Error("mask_test_version_not_found");
  const blank = version ? await getGuaranteeBlankFormVersion({ tenantId: session.tenant.id, id: version.blankFormVersionId }) : undefined;
  const { brokerageCase } = await requireWritableCase(session, caseId);
  if (!blank || blank.status !== "ready") throw new Error("mask_test_blank_form_not_ready");
  if (!brokerageCase) throw new Error("mask_test_case_not_accessible");
  const source = await readPrivateAttachmentContentForTenant({ tenantId: session.tenant.id, id: blank.attachmentId });
  if (!source) throw new Error("blank_form_unavailable");
  const supplement = asRecord(body.supplement);
  validateSupplementValues(version, brokerageCase.confirmedDataJson, supplement);
  let testBytes: Buffer;
  try {
    testBytes = await renderGuaranteePdf(source, version, brokerageCase.confirmedDataJson, supplement);
  } catch (error) {
    if (error instanceof Error && error.message === "guarantee_pdf_font_unavailable") throw error;
    throw new Error("mask_test_pdf_generation_failed");
  }
  const testPdfSha256 = hash(testBytes);
  const tested = await markGuaranteeCompanyMaskVersionTested({ tenantId: session.tenant.id, maskVersionId, userId: session.user.id, testPdfSha256, testedLayoutDigest: layoutDigest(version.layoutSnapshot) });
  if (!tested) throw new Error("mask_test_failed");
  return NextResponse.json({ maskVersion: tested, tested: true, testPdfSha256, layoutDigest: tested?.testedLayoutDigest, testPdfBase64: testBytes.toString("base64") });
}

async function handleConfirmTest(request: Request) {
  const session = await requireSession("admin");
  const body = asRecord(await request.json());
  const maskVersionId = String(body.maskVersionId ?? "");
  const testPdfSha256 = String(body.testPdfSha256 ?? "");
  if (!maskVersionId || !testPdfSha256) throw new Error("mask_test_confirmation_required");
  const confirmed = await confirmGuaranteeCompanyMaskVersionTest({ tenantId: session.tenant.id, maskVersionId, userId: session.user.id, testPdfSha256 });
  if (!confirmed) throw new Error("mask_test_confirmation_invalid");
  return NextResponse.json({ maskVersion: confirmed, testConfirmed: true });
}

async function handleRollback(request: Request) {
  const session = await requireSession("admin");
  const body = asRecord(await request.json());
  const maskId = String(body.maskId ?? "");
  const maskVersionId = String(body.maskVersionId ?? "");
  if (!maskId || !maskVersionId) throw new Error("mask_rollback_context_required");
  const version = await rollbackGuaranteeCompanyMaskVersion({ tenantId: session.tenant.id, maskId, maskVersionId, userId: session.user.id });
  if (!version) throw new Error("mask_rollback_failed");
  return NextResponse.json({ maskVersion: version, activeVersionId: version.id });
}

async function handlePreview(request: Request) {
  const session = await requireSession("member");
  const body = asRecord(await request.json()); const caseId = String(body.caseId ?? ""); const blankFormVersionId = String(body.blankFormVersionId ?? ""); const maskVersionId = String(body.maskVersionId ?? "");
  if (!caseId || !blankFormVersionId || !maskVersionId) throw new Error("preview_context_required");
  const { brokerageCase } = await requireWritableCase(session, caseId);
  if (!brokerageCase) throw new Error("case_not_found");
  const { blank, mask } = await loadCurrentPublishedMaskContext(session.tenant.id, maskVersionId);
  if (blank.id !== blankFormVersionId) throw new Error("mask_match_not_exact");
  const supplement = normalizeApplicationSupplement(asRecord(body.supplement));
  validateSupplementValues(mask, brokerageCase.confirmedDataJson, supplement);
  // This is the case-scoped application record for values that are not case
  // facts. It lets a member return to the same case and published mask without
  // re-entering the supplement; it never mutates confirmedDataJson.
  await saveGuaranteeApplicationDraft({
    tenantId: session.tenant.id,
    userId: session.user.id,
    caseId,
    templateId: mask.maskId,
    companyCode: "friends_guarantee",
    status: "draft",
    fieldValuesJson: supplement,
    fieldStatusesJson: {
      "application.guarantee_company": "confirmed",
      "application.application_date": "confirmed",
      "company_option.friends_plan_type": "confirmed",
      "company_option.friends_consent": "confirmed",
      "company_option.friends_collection_agency": "confirmed",
      "company_option.friends_single_rider": "confirmed",
      "company_option.friends_notes": "confirmed",
    },
  });
  const confirmation = await createGuaranteePreviewConfirmation({ tenantId: session.tenant.id, actorUserId: session.user.id, caseId, caseInputSnapshotHash: jsonHash(brokerageCase.confirmedDataJson), blankFormVersionId: blank.id, blankFormSha256: blank.sha256, companyMaskVersionId: mask.id, fieldCatalogVersion: mask.fieldCatalogVersion, supplementSnapshot: supplement, supplementHash: jsonHash(supplement), expiresAt: new Date(Date.now() + 15 * 60_000) });
  const source = await readPrivateAttachmentContentForTenant({ tenantId: session.tenant.id, id: blank.attachmentId });
  if (!source) throw new Error("blank_form_unavailable");
  const previewBytes = await renderGuaranteePdf(source, mask, brokerageCase.confirmedDataJson, supplement);
  return NextResponse.json({ confirmationId: confirmation.id, expiresAt: confirmation.expiresAt, maskVersionId: mask.id, previewPdfBase64: previewBytes.toString("base64") });
}

async function handleSaveApplicationDraft(request: Request) {
  const session = await requireSession("member");
  const body = asRecord(await request.json());
  const caseId = String(body.caseId ?? "").trim();
  const maskVersionId = String(body.maskVersionId ?? "").trim();
  if (!caseId || !maskVersionId) throw new Error("application_draft_save_context_required");
  const { brokerageCase } = await requireWritableCase(session, caseId);
  if (!brokerageCase) throw new Error("case_not_found");
  const { mask } = await loadCurrentPublishedMaskContext(session.tenant.id, maskVersionId);
  const supplement = normalizeApplicationSupplement(asRecord(body.supplement));
  validateSupplementValues(mask, brokerageCase.confirmedDataJson, supplement);
  const draft = await saveGuaranteeApplicationDraft({
    tenantId: session.tenant.id,
    userId: session.user.id,
    caseId,
    templateId: mask.maskId,
    companyCode: "friends_guarantee",
    status: "draft",
    fieldValuesJson: supplement,
    fieldStatusesJson: {
      "application.guarantee_company": "confirmed",
      "application.application_date": "confirmed",
      "company_option.friends_plan_type": "confirmed",
      "company_option.friends_consent": "confirmed",
      "company_option.friends_collection_agency": "confirmed",
      "company_option.friends_single_rider": "confirmed",
      "company_option.friends_notes": "confirmed",
    },
  });
  return NextResponse.json({ caseId, maskVersionId, persisted: true, updatedAt: draft.updatedAt });
}

async function handleLoadApplicationDraft(request: Request) {
  const session = await requireSession("member");
  const body = asRecord(await request.json());
  const caseId = String(body.caseId ?? "").trim();
  const maskVersionId = String(body.maskVersionId ?? "").trim();
  if (!caseId || !maskVersionId) throw new Error("application_draft_context_required");
  const { brokerageCase } = await requireWritableCase(session, caseId);
  if (!brokerageCase) throw new Error("case_not_found");
  // Application supplements are owned by the published company mask (the
  // logical reusable form), not by an individual immutable version. This lets
  // the same published form be reused for multiple cases and keeps a draft
  // recoverable after a new mask version is published.
  const maskVersion = await getGuaranteeCompanyMaskVersion({ tenantId: session.tenant.id, id: maskVersionId });
  if (!maskVersion) throw new Error("mask_version_not_found");
  await loadCurrentPublishedMaskContext(session.tenant.id, maskVersionId);
  const draft = await getGuaranteeApplicationDraft({ tenantId: session.tenant.id, userId: session.user.id, caseId, templateId: maskVersion.maskId });
  return NextResponse.json({
    caseId,
    maskVersionId,
    supplement: draft?.fieldValuesJson ?? {},
    status: draft?.status ?? "draft",
    persisted: Boolean(draft),
  });
}

async function handleGenerate(request: Request) {
  const session = await requireSession("generate"); const body = asRecord(await request.json()); const confirmationId = String(body.confirmationId ?? "");
  if (!confirmationId) throw new Error("preview_confirmation_required");
  const claimed = await claimGuaranteePreviewConfirmation({ tenantId: session.tenant.id, id: confirmationId, actorUserId: session.user.id });
  if (!claimed) throw new Error("generation_in_progress_or_not_found");
  if (claimed.status === "consumed" && claimed.generatedOutputId) return NextResponse.json({ outputId: claimed.generatedOutputId, idempotent: true });
  if (claimed.status !== "processing") throw new Error("preview_confirmation_expired");
  let attachmentId: string | undefined;
  let outputId: string | undefined;
  try {
    const { brokerageCase } = await requireWritableCase(session, claimed.caseId);
    if (jsonHash(brokerageCase.confirmedDataJson) !== claimed.caseInputSnapshotHash) throw new Error("preview_stale");
    const blank = await getGuaranteeBlankFormVersion({ tenantId: session.tenant.id, id: claimed.blankFormVersionId }); const mask = await getGuaranteeCompanyMaskVersion({ tenantId: session.tenant.id, id: claimed.companyMaskVersionId });
    const match = blank && mask ? await getGuaranteeMaskMatch({ tenantId: session.tenant.id, blankFormVersionId: blank.id, maskVersionId: mask.id }) : undefined;
    const blankForm = blank ? await getGuaranteeBlankForm({ tenantId: session.tenant.id, id: blank.blankFormId }) : undefined;
    const companyMask = mask ? await getGuaranteeCompanyMask({ tenantId: session.tenant.id, id: mask.maskId }) : undefined;
    if (!blank || !mask || !match || match.status !== "exact" || blank.status !== "ready" || mask.status !== "published" || mask.blankFormVersionId !== blank.id || blank.sha256 !== claimed.blankFormSha256 || mask.fieldCatalogVersion !== claimed.fieldCatalogVersion || blankForm?.activeVersionId !== blank.id || companyMask?.activeVersionId !== mask.id) throw new Error("preview_stale");
    const source = await readPrivateAttachmentContentForTenant({ tenantId: session.tenant.id, id: blank.attachmentId }); if (!source) throw new Error("blank_form_unavailable");
    validateSupplementValues(mask, brokerageCase.confirmedDataJson, claimed.supplementSnapshot);
    const bytes = await renderGuaranteePdf(source, mask, brokerageCase.confirmedDataJson, claimed.supplementSnapshot); const attachment = await addPrivateAttachment({ tenantId: session.tenant.id, userId: session.user.id, targetType: "guarantee_generated_output", targetId: confirmationId, fileName: `guarantee-${claimed.caseId}-${mask.versionNumber}.pdf`, fileType: "application/pdf", content: bytes });
    attachmentId = attachment.id;
    if (!claimed.processingToken) throw new Error("generation_confirmation_claim_token_missing");
    const finalized = await finalizeGuaranteePreviewOutput({ confirmationId, processingToken: claimed.processingToken, output: { tenantId: session.tenant.id, userId: session.user.id, actorId: session.user.id, outputType: "guarantee_application", outputFormat: "pdf", language: "ja", title: `保証会社申込書 - ${brokerageCase.caseTitle}`, documentNumber: `BD-GA-${Date.now()}-${claimed.caseId}`, caseId: claimed.caseId, templateId: "company_mask", inputDataSnapshot: withW93SourceProvenance(brokerageCase), draftValueSnapshot: claimed.supplementSnapshot, layoutSnapshot: mask.layoutSnapshot, fileAttachmentId: attachment.id, fileSha256: hash(bytes), fileSizeBytes: bytes.length, fileMimeType: "application/pdf", blankFormVersionId: blank.id, blankFormSha256: blank.sha256, companyMaskVersionId: mask.id, fieldCatalogVersion: mask.fieldCatalogVersion, caseInputSnapshotHash: claimed.caseInputSnapshotHash } });
    const output = finalized.output;
    outputId = output.id;
    return NextResponse.json({ outputId: output.id, fileSha256: output.fileSha256, fileSizeBytes: output.fileSizeBytes, maskVersion: mask.versionNumber });
  } catch (error) {
    if (outputId) await deleteGeneratedOutputForTenant({ tenantId: session.tenant.id, id: outputId });
    if (attachmentId) await deletePrivateAttachmentForTenant({ tenantId: session.tenant.id, id: attachmentId });
    if (claimed.processingToken) await releaseGuaranteePreviewConfirmation({ tenantId: session.tenant.id, id: confirmationId, actorUserId: session.user.id, processingToken: claimed.processingToken });
    throw error;
  }
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const action = request.headers.get("content-type")?.includes("multipart/form-data") ? "upload" : String((asRecord(await request.clone().json())).action ?? "");
    if (action === "upload") return await handleUpload(request);
    if (action === "draft") return await handleDraft(request);
    if (action === "loadAdminMask") return await handleLoadAdminMask(request);
    if (action === "loadAdminBlankForm") return await handleLoadAdminBlankForm(request);
    if (action === "publish") return await handlePublish(request);
    if (action === "test") return await handleTest(request);
    if (action === "confirmTest") return await handleConfirmTest(request);
    if (action === "rollback") return await handleRollback(request);
    if (action === "preview") return await handlePreview(request);
    if (action === "loadApplicationDraft") return await handleLoadApplicationDraft(request);
    if (action === "saveApplicationDraft") return await handleSaveApplicationDraft(request);
    if (action === "generate") return await handleGenerate(request);
    throw new Error("guarantee_slice1_action_invalid");
  } catch (error) { return jsonError(error, requestId); }
}
