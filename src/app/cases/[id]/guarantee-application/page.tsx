import { GuaranteeApplicationClient } from "./client";
import { isGuaranteeSlice1EnabledForTenant } from "@/lib/guarantee-slice1-gate";
import { getBrokerageCaseByIdForContext, getGuaranteeCompanyMask, getGuaranteeMaskMatch, listGuaranteeBlankForms, listGuaranteeCompanyMaskVersions, listGuaranteeOutputsByCase } from "@/lib/data";
import { getTenantCapability, requireTenantSession, TenantSessionError } from "@/lib/tenant-session";
import { capabilityHasTenantPermission } from "@/lib/tenant-permissions";
import { getCaseFieldValue } from "@/lib/case-field-normalization";
import { createRequestContext } from "@/lib/visibility-resolver";
import { areCaseSourcesReadable } from "@/lib/w93-access";
import { notFound } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function GuaranteeApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let enabled = false;
  let brokerageCase: Awaited<ReturnType<typeof getBrokerageCaseByIdForContext>>["brokerageCase"] = null;
  let publishedVersions: Array<{ id: string; versionNumber: number; blankFormVersionId: string; formName: string }> = [];
  let outputs: Awaited<ReturnType<typeof listGuaranteeOutputsByCase>> = [];
  let maskVersions: Awaited<ReturnType<typeof listGuaranteeCompanyMaskVersions>> = [];
  let canGenerate = false;
  let caseFacts: Array<{ label: string; value: string }> = [];
  let errorMessage = "";
  let inaccessible = false;
  try {
    const session = await requireTenantSession({ permission: "output.preview" });
    const context = createRequestContext(session);
    enabled = isGuaranteeSlice1EnabledForTenant(session.tenant.id);
    const caseVisibility = await getBrokerageCaseByIdForContext({ context, caseId: id });
    if (!caseVisibility.brokerageCase || caseVisibility.resolution.outcome !== "owner_write") {
      inaccessible = true;
    } else {
      brokerageCase = caseVisibility.brokerageCase;
      const sourceReadable = await areCaseSourcesReadable(context, brokerageCase);
      const caseData = brokerageCase.confirmedDataJson;
      caseFacts = [
        { label: "姓名", value: getCaseFieldValue(caseData, "applicant.name") || getCaseFieldValue(caseData, "tenant.name") },
        { label: "生年月日", value: getCaseFieldValue(caseData, "applicant.birthDate") },
        { label: "房源", value: getCaseFieldValue(caseData, "property.name") },
        { label: "工作单位", value: getCaseFieldValue(caseData, "applicant.employerName") },
        { label: "年收入", value: getCaseFieldValue(caseData, "applicant.annualIncome") },
        { label: "联系人", value: getCaseFieldValue(caseData, "emergencyContact.name") },
      ].filter((item) => item.value.trim());
      const [forms, versions, loadedOutputs] = await Promise.all([
        listGuaranteeBlankForms({ tenantId: session.tenant.id }),
        listGuaranteeCompanyMaskVersions({ tenantId: session.tenant.id }),
        listGuaranteeOutputsByCase({ tenantId: session.tenant.id, caseId: id }),
      ]);
      maskVersions = versions;
      outputs = loadedOutputs;
      publishedVersions = (await Promise.all(versions.filter((version) => version.status === "published").map(async (version) => {
        const form = forms.find((item) => item.id === version.blankFormId);
        if (!form || form.activeVersionId !== version.blankFormVersionId) return undefined;
        const companyMask = await getGuaranteeCompanyMask({ tenantId: session.tenant.id, id: version.maskId });
        if (!companyMask || companyMask.activeVersionId !== version.id) return undefined;
        const match = await getGuaranteeMaskMatch({ tenantId: session.tenant.id, blankFormVersionId: version.blankFormVersionId, maskVersionId: version.id });
        if (match?.status !== "exact") return undefined;
        return { id: version.id, versionNumber: version.versionNumber, blankFormVersionId: version.blankFormVersionId, formName: form.name };
      }))).filter((version): version is NonNullable<typeof version> => Boolean(version));
      canGenerate = sourceReadable && capabilityHasTenantPermission(getTenantCapability(session.membership), "output.generate_final");
    }
  } catch (error) {
    errorMessage = error instanceof TenantSessionError && error.code === "permission_denied" ? "当前身份没有申请书预览权限。" : "请在受控非生产工作区中登录后再访问。";
  }
  if (inaccessible) notFound();
  if (errorMessage) return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-semibold text-slate-950">生成申请书</h1><p className="mt-3 text-sm text-slate-600">{errorMessage}</p></main>;
  if (!brokerageCase) return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-semibold text-slate-950">生成申请书</h1><p className="mt-3 text-sm text-slate-600">案件不存在或当前身份无法访问</p></main>;
  return <GuaranteeApplicationClient enabled={enabled} caseId={id} caseTitle={brokerageCase.caseTitle} caseFacts={caseFacts} publishedVersions={publishedVersions} canGenerate={canGenerate} initialHistory={outputs.map((output) => ({ id: output.id, generatedAt: output.generatedAt.toISOString(), version: output.companyMaskVersionId ? (maskVersions.find((version) => version.id === output.companyMaskVersionId)?.versionNumber?.toString() ?? "") : "", fileReady: output.fileStatus === "ready" }))} />;
}
