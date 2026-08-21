import { GuaranteeSlice1Client } from "./client";
import { isGuaranteeSlice1EnabledForTenant } from "@/lib/guarantee-slice1-gate";
import { getTenantCapability, requireTenantSession, TenantSessionError } from "@/lib/tenant-session";
import { capabilityHasTenantPermission } from "@/lib/tenant-permissions";
import { listBrokerageCases, listPublishedGuaranteeCompanyMaskVersions } from "@/lib/data";
import { toGuaranteeTestCaseSummary } from "@/lib/guarantee-test-case-summary";

export const runtime = "nodejs";

export default async function GuaranteeSlice1Page() {
  let enabled = false;
  let isAdmin = false;
  let message = "";
  let cases: Array<ReturnType<typeof toGuaranteeTestCaseSummary>> = [];
  let publishedVersions: Array<{ id: string; versionNumber: number; blankFormVersionId: string; maskId: string }> = [];
  try {
    const session = await requireTenantSession();
    enabled = isGuaranteeSlice1EnabledForTenant(session.tenant.id);
    isAdmin = capabilityHasTenantPermission(getTenantCapability(session.membership), "template.edit_draft");
    if (enabled) {
      const [caseRows, versionRows] = await Promise.all([
        listBrokerageCases(session.user.id, 50, session.tenant.id),
        listPublishedGuaranteeCompanyMaskVersions({ tenantId: session.tenant.id }),
      ]);
      cases = caseRows.map(toGuaranteeTestCaseSummary);
      publishedVersions = versionRows.map((item) => ({ id: item.id, versionNumber: item.versionNumber, blankFormVersionId: item.blankFormVersionId, maskId: item.maskId }));
    }
  } catch (error) {
    message = error instanceof TenantSessionError && error.code === "permission_denied"
      ? "この切片を利用する権限がありません。"
      : "有効な開発用ワークスペースでサインインしてください。";
  }
  if (message) return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-semibold text-slate-950">保証会社申込書（試験切片）</h1><p className="mt-3 text-sm text-slate-600">{message}</p></main>;
  return <GuaranteeSlice1Client enabled={enabled} isAdmin={isAdmin} cases={cases} publishedVersions={publishedVersions} />;
}
