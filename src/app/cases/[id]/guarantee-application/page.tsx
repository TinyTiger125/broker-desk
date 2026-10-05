import { GuaranteeApplicationClient } from "./client";
import { isGuaranteeSlice1EnabledForTenant } from "@/lib/guarantee-slice1-gate";
import { getBrokerageCaseByIdForContext, getGuaranteeCompanyMask, getGuaranteeMaskMatch, listGuaranteeBlankForms, listGuaranteeCompanyMaskVersions, listGuaranteeOutputsByCase } from "@/lib/data";
import { getTenantCapability, requireTenantSession, TenantSessionError } from "@/lib/tenant-session";
import { capabilityHasTenantPermission } from "@/lib/tenant-permissions";
import { getCaseFieldValue } from "@/lib/case-field-normalization";
import { createRequestContext } from "@/lib/visibility-resolver";
import { areCaseSourcesReadable } from "@/lib/w93-access";
import { getLocale, type Locale } from "@/lib/locale";
import { notFound } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_COPY: Record<Locale, {
  caseFacts: Record<string, string>;
  permissionDenied: string;
  loginRequired: string;
  pageTitle: string;
  unavailable: string;
}> = {
  ja: {
    caseFacts: { name: "氏名", birthDate: "生年月日", property: "物件", employer: "勤務先", income: "年収", contact: "緊急連絡先" },
    permissionDenied: "現在のアカウントには申込書を確認する権限がありません。",
    loginRequired: "申込機能を利用できません。ログイン状態、利用権限、環境設定を確認してください。",
    pageTitle: "保証会社申込書を作成",
    unavailable: "案件が見つからないか、現在のアカウントではアクセスできません。",
  },
  zh: {
    caseFacts: { name: "姓名", birthDate: "出生日期", property: "物件", employer: "工作单位", income: "年收入", contact: "联系人" },
    permissionDenied: "当前身份没有申请书预览权限。",
    loginRequired: "当前无法使用申请功能。请确认登录状态、访问权限或环境设置。",
    pageTitle: "生成申请书",
    unavailable: "案件不存在或当前身份无法访问。",
  },
  ko: {
    caseFacts: { name: "이름", birthDate: "생년월일", property: "매물", employer: "근무처", income: "연소득", contact: "긴급 연락처" },
    permissionDenied: "현재 계정에는 신청서를 확인할 권한이 없습니다.",
    loginRequired: "신청 기능을 사용할 수 없습니다. 로그인 상태, 이용 권한 또는 환경 설정을 확인해 주세요.",
    pageTitle: "보증회사 신청서 만들기",
    unavailable: "안건을 찾을 수 없거나 현재 계정으로 접근할 수 없습니다.",
  },
};

export default async function GuaranteeApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, locale] = await Promise.all([params, getLocale()]);
  const text = PAGE_COPY[locale];
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
        { label: text.caseFacts.name, value: getCaseFieldValue(caseData, "applicant.name") || getCaseFieldValue(caseData, "tenant.name") },
        { label: text.caseFacts.birthDate, value: getCaseFieldValue(caseData, "applicant.birthDate") },
        { label: text.caseFacts.property, value: getCaseFieldValue(caseData, "property.name") },
        { label: text.caseFacts.employer, value: getCaseFieldValue(caseData, "applicant.employerName") },
        { label: text.caseFacts.income, value: getCaseFieldValue(caseData, "applicant.annualIncome") },
        { label: text.caseFacts.contact, value: getCaseFieldValue(caseData, "emergencyContact.name") },
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
    errorMessage = error instanceof TenantSessionError && error.code === "permission_denied" ? text.permissionDenied : text.loginRequired;
  }
  if (inaccessible) notFound();
  if (errorMessage) return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-semibold text-slate-950">{text.pageTitle}</h1><p className="mt-3 text-sm text-slate-600">{errorMessage}</p></main>;
  if (!brokerageCase) return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-semibold text-slate-950">{text.pageTitle}</h1><p className="mt-3 text-sm text-slate-600">{text.unavailable}</p></main>;
  return <GuaranteeApplicationClient locale={locale} enabled={enabled} caseId={id} caseTitle={brokerageCase.caseTitle} caseFacts={caseFacts} publishedVersions={publishedVersions} canGenerate={canGenerate} initialHistory={outputs.map((output) => ({ id: output.id, generatedAt: output.generatedAt.toISOString(), version: output.companyMaskVersionId ? (maskVersions.find((version) => version.id === output.companyMaskVersionId)?.versionNumber?.toString() ?? "") : "", fileReady: output.fileStatus === "ready" }))} />;
}
