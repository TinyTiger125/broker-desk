import { randomUUID } from "node:crypto";
import { pdf2img } from "@pdfme/converter";
import { GuaranteeSlice1Client } from "@/app/guarantee-g1-slice1/client";
import type { InitialAdminContext, MaskField } from "@/app/guarantee-g1-slice1/client";
import { isGuaranteeSlice1EnabledForTenant } from "@/lib/guarantee-slice1-gate";
import {
  getGuaranteeBlankForm,
  getGuaranteeBlankFormVersion,
  getGuaranteeCompanyMask,
  getGuaranteeCompanyMaskForBlankForm,
  getGuaranteeCompanyMaskVersion,
  listBrokerageCases,
  listGuaranteeCompanyMaskVersions,
  readPrivateAttachmentContentForTenant,
} from "@/lib/data";
import { getTenantCapability, requireTenantSession, TenantSessionError } from "@/lib/tenant-session";
import { capabilityHasTenantPermission } from "@/lib/tenant-permissions";
import { toGuaranteeTestCaseSummary } from "@/lib/guarantee-test-case-summary";
import { withGuaranteePdfTimeout } from "@/lib/guarantee-slice1-pdf.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadInitialAdminContext(tenantId: string, formId: string, maskVersionId: string | undefined, blankFormVersionId: string | undefined, maskId: string | undefined): Promise<InitialAdminContext> {
  const requestId = randomUUID();
  if (!maskVersionId) {
    if (!blankFormVersionId || !maskId) return { status: "failed", errorMessage: `表格恢复失败，请稍后重试。草稿已保留，当前没有可编辑内容，发布仍不可用。（请求编号：${requestId}）` };
    try {
      const [blankForm, blankVersion, mask] = await Promise.all([
        getGuaranteeBlankForm({ tenantId, id: formId }),
        getGuaranteeBlankFormVersion({ tenantId, id: blankFormVersionId }),
        getGuaranteeCompanyMask({ tenantId, id: maskId }),
      ]);
      if (!blankForm || !blankVersion || blankForm.activeVersionId !== blankVersion.id || blankVersion.status !== "ready" || blankVersion.blankFormId !== formId || !mask || mask.id !== maskId || mask.blankFormId !== formId) throw new Error("blank_form_not_found");
      const source = await readPrivateAttachmentContentForTenant({ tenantId, id: blankVersion.attachmentId });
      if (!source) throw new Error("blank_form_unavailable");
      const images = await withGuaranteePdfTimeout(pdf2img(source, { range: { start: 0, end: 0 }, scale: 1 }));
      const preview = images[0];
      if (!preview) throw new Error("blank_form_preview_unavailable");
      return {
        status: "loaded",
        blankFormId: blankForm.id,
        blankFormVersionId: blankVersion.id,
        maskId: mask.id,
        pageWidth: blankVersion.pageWidth,
        pageHeight: blankVersion.pageHeight,
        blankPagePngBase64: Buffer.from(preview).toString("base64"),
      };
    } catch {
      return { status: "failed", errorMessage: `表格恢复失败，请稍后重试。草稿已保留，当前没有可编辑内容，发布仍不可用。（请求编号：${requestId}）` };
    }
  }
  try {
    const maskVersion = await getGuaranteeCompanyMaskVersion({ tenantId, id: maskVersionId });
    if (!maskVersion || (maskVersion.status !== "draft" && maskVersion.status !== "published") || maskVersion.blankFormId !== formId) throw new Error("mask_version_not_found");
    const [blankForm, blankVersion, mask] = await Promise.all([
      getGuaranteeBlankForm({ tenantId, id: formId }),
      getGuaranteeBlankFormVersion({ tenantId, id: maskVersion.blankFormVersionId }),
      getGuaranteeCompanyMask({ tenantId, id: maskVersion.maskId }),
    ]);
    if (!blankForm || !blankVersion || blankVersion.status !== "ready" || blankVersion.blankFormId !== formId || !mask || mask.blankFormId !== formId) throw new Error("mask_version_not_found");
    if (maskVersion.maskId !== mask.id || maskVersion.blankFormVersionId !== blankVersion.id) throw new Error("mask_version_not_found");
    const source = await readPrivateAttachmentContentForTenant({ tenantId, id: blankVersion.attachmentId });
    if (!source) throw new Error("blank_form_unavailable");
    const images = await withGuaranteePdfTimeout(pdf2img(source, { range: { start: 0, end: 0 }, scale: 1 }));
    const preview = images[0];
    if (!preview) throw new Error("blank_form_preview_unavailable");
    const fields = Array.isArray(maskVersion.layoutSnapshot?.fields) ? maskVersion.layoutSnapshot.fields as MaskField[] : [];
    if (fields.length === 0) throw new Error("mask_version_not_found");
    return {
      status: "loaded",
      versionStatus: maskVersion.status,
      blankFormId: blankForm.id,
      blankFormVersionId: blankVersion.id,
      maskId: mask.id,
      maskVersionId: maskVersion.id,
      pageWidth: blankVersion.pageWidth,
      pageHeight: blankVersion.pageHeight,
      fields,
      blankPagePngBase64: Buffer.from(preview).toString("base64"),
    };
  } catch {
    return { status: "failed", errorMessage: `表格恢复失败，请稍后重试。草稿已保留，当前没有可编辑内容，发布仍不可用。（请求编号：${requestId}）` };
  }
}

export default async function GuaranteeFormEditPage({ params, searchParams }: { params: Promise<{ formId: string }>; searchParams?: Promise<{ blankFormVersionId?: string; maskId?: string }> }) {
  const { formId } = await params;
  const requestedContext = (await searchParams) ?? {};
  const initialBlankFormVersionId = String(requestedContext.blankFormVersionId ?? "").trim() || undefined;
  const initialMaskId = String(requestedContext.maskId ?? "").trim() || undefined;
  try {
    const session = await requireTenantSession({ permission: "template.edit_draft" });
    const enabled = isGuaranteeSlice1EnabledForTenant(session.tenant.id);
    if (!enabled) return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-semibold text-slate-950">公司表格编辑</h1><p className="mt-3 text-sm text-slate-600">该受控功能当前未启用，既有申请书路径不受影响。</p><a href="/guarantee-forms" className="mt-4 inline-block text-sm text-blue-700 underline">返回公司表格库</a></main>;
    const testCases = await listBrokerageCases(session.user.id, 50, session.tenant.id);
    const form = await getGuaranteeBlankForm({ tenantId: session.tenant.id, id: formId });
    if (!form) return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-semibold text-slate-950">公司表格不存在</h1><a href="/guarantee-forms" className="mt-4 inline-block text-sm text-blue-700 underline">返回公司表格库</a></main>;
    const versions = await listGuaranteeCompanyMaskVersions({ tenantId: session.tenant.id });
    const formVersions = versions.filter((version) => version.blankFormId === form.id);
    const requestedVersion = initialBlankFormVersionId && initialMaskId
      ? formVersions
        .filter((version) => version.blankFormVersionId === initialBlankFormVersionId && version.maskId === initialMaskId && (version.status === "draft" || version.status === "published"))
        .sort((a, b) => (a.status === "draft" ? -1 : 1) - (b.status === "draft" ? -1 : 1) || b.versionNumber - a.versionNumber)[0]
      : undefined;
    // A saved draft is the administrator's resumable work. Prefer it over
    // the active publication so reopening the library never discards edits.
    const current = formVersions.filter((version) => version.status === "draft").sort((a, b) => b.versionNumber - a.versionNumber)[0]
      ?? formVersions.find((version) => version.blankFormVersionId === form.activeVersionId && version.status === "published")
      ?? formVersions.filter((version) => version.status === "published").sort((a, b) => b.versionNumber - a.versionNumber)[0];
    // An uploaded URL context wins only when no matching saved version exists.
    // Once draft/published data exists for that exact pair, load that version
    // so refresh/reopen does not reset the editor to default fields.
    const selectedVersion = requestedVersion ?? current;
    const fallbackMask = selectedVersion || initialMaskId || !form.activeVersionId
      ? undefined
      : await getGuaranteeCompanyMaskForBlankForm({ tenantId: session.tenant.id, blankFormId: form.id });
    const recoveryBlankFormVersionId = selectedVersion?.blankFormVersionId ?? initialBlankFormVersionId ?? form.activeVersionId;
    const recoveryMaskId = selectedVersion?.maskId ?? initialMaskId ?? fallbackMask?.id;
    // A brand-new upload has a ready blank-form version and a logical mask,
    // but no mask version yet. Leave that first-load context to the protected
    // client action so the upload response can be restored without an SSR
    // conversion failure being mistaken for a missing draft.
    const initialAdminContext = selectedVersion
      ? await loadInitialAdminContext(session.tenant.id, form.id, selectedVersion.id, recoveryBlankFormVersionId, recoveryMaskId)
      : undefined;
    const clientBlankFormId = selectedVersion || (recoveryBlankFormVersionId && recoveryMaskId) ? form.id : undefined;
    return <GuaranteeSlice1Client enabled={enabled} isAdmin={capabilityHasTenantPermission(getTenantCapability(session.membership), "template.edit_draft")} cases={testCases.map(toGuaranteeTestCaseSummary)} publishedVersions={[]} initialMaskVersionId={selectedVersion?.id} initialBlankFormId={clientBlankFormId} initialBlankFormVersionId={recoveryBlankFormVersionId} initialMaskId={recoveryMaskId} initialAdminContext={initialAdminContext} adminOnly showUpload={false} heading={`编辑公司表格：${form.name}`} />;
  } catch (error) {
    const message = error instanceof TenantSessionError && error.code === "permission_denied" ? "只有公司表格管理员可以编辑蒙板。" : "请在受控非生产工作区中登录后再访问。";
    return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-semibold text-slate-950">公司表格编辑</h1><p className="mt-3 text-sm text-slate-600">{message}</p><a href="/guarantee-forms" className="mt-4 inline-block text-sm text-blue-700 underline">返回公司表格库</a></main>;
  }
}
