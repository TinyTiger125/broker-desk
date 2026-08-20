import { GuaranteeFormsClient } from "./client";
import { isGuaranteeSlice1EnabledForTenant } from "@/lib/guarantee-slice1-gate";
import { listGuaranteeBlankForms, listGuaranteeCompanyMaskVersions } from "@/lib/data";
import { getTenantCapability, requireTenantSession, TenantSessionError } from "@/lib/tenant-session";
import { capabilityHasTenantPermission } from "@/lib/tenant-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function GuaranteeFormsPage() {
  try {
    const session = await requireTenantSession();
    const enabled = isGuaranteeSlice1EnabledForTenant(session.tenant.id);
    const isAdmin = capabilityHasTenantPermission(getTenantCapability(session.membership), "template.edit_draft");
    if (!enabled) return <GuaranteeFormsClient enabled={false} isAdmin={isAdmin} forms={[]} />;
    const [forms, versions] = await Promise.all([
      listGuaranteeBlankForms({ tenantId: session.tenant.id }),
      listGuaranteeCompanyMaskVersions({ tenantId: session.tenant.id }),
    ]);
    const formRows = forms.map((form) => ({
      id: form.id,
      name: form.name,
      activeVersionId: form.activeVersionId,
      versions: versions.filter((version) => version.blankFormId === form.id).map((version) => ({ id: version.blankFormVersionId, versionNumber: version.versionNumber, status: version.status, maskVersionId: version.id, tested: Boolean(version.testConfirmedAt) })),
    }));
    return <GuaranteeFormsClient enabled={enabled} isAdmin={isAdmin} forms={isAdmin ? formRows : formRows.filter((form) => form.versions.some((version) => version.status === "published"))} />;
  } catch (error) {
    const message = error instanceof TenantSessionError && error.code === "permission_denied" ? "当前身份没有访问公司表格库的权限。" : "请在受控非生产工作区中登录后再访问公司表格库。";
    return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-3xl font-semibold text-slate-950">公司表格库</h1><p className="mt-3 text-sm text-slate-600">{message}</p></main>;
  }
}
