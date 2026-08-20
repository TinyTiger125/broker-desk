import { GuaranteeApplicationClient } from "./client";
import { isGuaranteeSlice1EnabledForTenant } from "@/lib/guarantee-slice1-gate";
import { getBrokerageCaseById, listGuaranteeCompanyMaskVersions, listGuaranteeOutputsByCase, getGuaranteeBlankForm } from "@/lib/data";
import { getTenantCapability, requireTenantSession, TenantSessionError } from "@/lib/tenant-session";
import { capabilityHasTenantPermission } from "@/lib/tenant-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function GuaranteeApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireTenantSession({ permission: "output.preview" });
    const enabled = isGuaranteeSlice1EnabledForTenant(session.tenant.id);
    const brokerageCase = await getBrokerageCaseById({ userId: session.user.id, tenantId: session.tenant.id, caseId: id });
    if (!brokerageCase) return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-semibold text-slate-950">案件不存在或当前身份无法访问</h1></main>;
    const [versions, outputs] = await Promise.all([
      listGuaranteeCompanyMaskVersions({ tenantId: session.tenant.id }),
      listGuaranteeOutputsByCase({ tenantId: session.tenant.id, caseId: id }),
    ]);
    const publishedVersions = await Promise.all(versions.filter((version) => version.status === "published").map(async (version) => {
      const form = await getGuaranteeBlankForm({ tenantId: session.tenant.id, id: version.blankFormId });
      return { id: version.id, versionNumber: version.versionNumber, blankFormVersionId: version.blankFormVersionId, formName: form?.name ?? "公司表格" };
    }));
    return <GuaranteeApplicationClient enabled={enabled} caseId={id} caseTitle={brokerageCase.caseTitle} publishedVersions={publishedVersions} canGenerate={capabilityHasTenantPermission(getTenantCapability(session.membership), "output.generate_final")} initialHistory={outputs.map((output) => ({ id: output.id, generatedAt: output.generatedAt.toISOString(), version: output.companyMaskVersionId ? (versions.find((version) => version.id === output.companyMaskVersionId)?.versionNumber?.toString() ?? "") : "", fileReady: output.fileStatus === "ready" }))} />;
  } catch (error) {
    const message = error instanceof TenantSessionError && error.code === "permission_denied" ? "当前身份没有申请书预览权限。" : "请在受控非生产工作区中登录后再访问。";
    return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-semibold text-slate-950">生成申请书</h1><p className="mt-3 text-sm text-slate-600">{message}</p></main>;
  }
}
