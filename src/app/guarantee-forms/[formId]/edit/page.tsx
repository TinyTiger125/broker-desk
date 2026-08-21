import { GuaranteeSlice1Client } from "@/app/guarantee-g1-slice1/client";
import { isGuaranteeSlice1EnabledForTenant } from "@/lib/guarantee-slice1-gate";
import { getGuaranteeBlankForm, listBrokerageCases, listGuaranteeCompanyMaskVersions } from "@/lib/data";
import { getTenantCapability, requireTenantSession, TenantSessionError } from "@/lib/tenant-session";
import { capabilityHasTenantPermission } from "@/lib/tenant-permissions";
import { toGuaranteeTestCaseSummary } from "@/lib/guarantee-test-case-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function GuaranteeFormEditPage({ params, searchParams }: { params: Promise<{ formId: string }>; searchParams?: Promise<{ blankFormVersionId?: string; maskId?: string }> }) {
  const { formId } = await params;
  const requestedContext = (await searchParams) ?? {};
  const initialBlankFormVersionId = String(requestedContext.blankFormVersionId ?? "").trim() || undefined;
  const initialMaskId = String(requestedContext.maskId ?? "").trim() || undefined;
  try {
    const session = await requireTenantSession({ permission: "template.edit_draft" });
    const enabled = isGuaranteeSlice1EnabledForTenant(session.tenant.id);
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
    const shouldLoadExplicitUpload = Boolean(initialBlankFormVersionId && initialMaskId && !requestedVersion);
    return <GuaranteeSlice1Client enabled={enabled} isAdmin={capabilityHasTenantPermission(getTenantCapability(session.membership), "template.edit_draft")} cases={testCases.map(toGuaranteeTestCaseSummary)} publishedVersions={[]} initialMaskVersionId={selectedVersion?.id} initialBlankFormId={shouldLoadExplicitUpload || !selectedVersion ? form.id : undefined} initialBlankFormVersionId={shouldLoadExplicitUpload ? initialBlankFormVersionId : undefined} initialMaskId={shouldLoadExplicitUpload ? initialMaskId : undefined} adminOnly showUpload={false} heading={`编辑公司表格：${form.name}`} />;
  } catch (error) {
    const message = error instanceof TenantSessionError && error.code === "permission_denied" ? "只有公司表格管理员可以编辑蒙板。" : "请在受控非生产工作区中登录后再访问。";
    return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-semibold text-slate-950">公司表格编辑</h1><p className="mt-3 text-sm text-slate-600">{message}</p><a href="/guarantee-forms" className="mt-4 inline-block text-sm text-blue-700 underline">返回公司表格库</a></main>;
  }
}
