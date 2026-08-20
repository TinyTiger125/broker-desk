import { GuaranteeSlice1Client } from "@/app/guarantee-g1-slice1/client";
import { isGuaranteeSlice1EnabledForTenant } from "@/lib/guarantee-slice1-gate";
import { getGuaranteeBlankForm, listGuaranteeCompanyMaskVersions } from "@/lib/data";
import { getTenantCapability, requireTenantSession, TenantSessionError } from "@/lib/tenant-session";
import { capabilityHasTenantPermission } from "@/lib/tenant-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function GuaranteeFormEditPage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  try {
    const session = await requireTenantSession({ permission: "template.edit_draft" });
    const enabled = isGuaranteeSlice1EnabledForTenant(session.tenant.id);
    const form = await getGuaranteeBlankForm({ tenantId: session.tenant.id, id: formId });
    if (!form) return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-semibold text-slate-950">公司表格不存在</h1><a href="/guarantee-forms" className="mt-4 inline-block text-sm text-blue-700 underline">返回公司表格库</a></main>;
    const versions = await listGuaranteeCompanyMaskVersions({ tenantId: session.tenant.id });
    const formVersions = versions.filter((version) => version.blankFormId === form.id);
    // A saved draft is the administrator's resumable work. Prefer it over
    // the active publication so reopening the library never discards edits.
    const current = formVersions.filter((version) => version.status === "draft").sort((a, b) => b.versionNumber - a.versionNumber)[0]
      ?? formVersions.find((version) => version.blankFormVersionId === form.activeVersionId && version.status === "published")
      ?? formVersions.filter((version) => version.status === "published").sort((a, b) => b.versionNumber - a.versionNumber)[0];
    return <GuaranteeSlice1Client enabled={enabled} isAdmin={capabilityHasTenantPermission(getTenantCapability(session.membership), "template.edit_draft")} cases={[]} publishedVersions={[]} initialMaskVersionId={current?.id} initialBlankFormId={current ? undefined : form.id} adminOnly showUpload={false} heading={`编辑公司表格：${form.name}`} />;
  } catch (error) {
    const message = error instanceof TenantSessionError && error.code === "permission_denied" ? "只有公司表格管理员可以编辑蒙板。" : "请在受控非生产工作区中登录后再访问。";
    return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-semibold text-slate-950">公司表格编辑</h1><p className="mt-3 text-sm text-slate-600">{message}</p><a href="/guarantee-forms" className="mt-4 inline-block text-sm text-blue-700 underline">返回公司表格库</a></main>;
  }
}
