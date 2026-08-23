import Link from "next/link";
import { GuaranteeFormsClient } from "./client";
import { isGuaranteeSlice1EnabledForTenant } from "@/lib/guarantee-slice1-gate";
import { getGuaranteeCompanyMask, getGuaranteeMaskMatch, listGuaranteeBlankForms, listGuaranteeCompanyMaskVersions, listPublishedGuaranteeCompanyMaskVersions } from "@/lib/data";
import { getTenantCapability, requireTenantSession, TenantSessionError } from "@/lib/tenant-session";
import { capabilityHasTenantPermission } from "@/lib/tenant-permissions";
import { getLocale } from "@/lib/locale";
import { getGuaranteeFormsMessages } from "@/lib/guarantee-forms-locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FormRow = {
  id: string;
  name: string;
  versions: Array<{ id: string; versionNumber: number; status: string; maskVersionId: string; tested: boolean }>;
};

export default async function GuaranteeFormsPage() {
  let enabled = false;
  let isAdmin = false;
  const locale = await getLocale();
  const messages = getGuaranteeFormsMessages(locale);
  let formRows: FormRow[] = [];
  let errorMessage: string | undefined;
  try {
    const session = await requireTenantSession();
    enabled = isGuaranteeSlice1EnabledForTenant(session.tenant.id);
    isAdmin = capabilityHasTenantPermission(getTenantCapability(session.membership), "template.edit_draft");
    if (enabled) {
      const [forms, versions] = await Promise.all([
        listGuaranteeBlankForms({ tenantId: session.tenant.id }),
        isAdmin
          ? listGuaranteeCompanyMaskVersions({ tenantId: session.tenant.id })
          : listPublishedGuaranteeCompanyMaskVersions({ tenantId: session.tenant.id }),
      ]);
      const visibleVersions = isAdmin ? versions : (await Promise.all(versions.map(async (version) => {
        if (version.status !== "published") return undefined;
        const blankForm = forms.find((form) => form.id === version.blankFormId);
        if (!blankForm || blankForm.activeVersionId !== version.blankFormVersionId) return undefined;
        const companyMask = await getGuaranteeCompanyMask({ tenantId: session.tenant.id, id: version.maskId });
        if (!companyMask || companyMask.activeVersionId !== version.id) return undefined;
        const match = await getGuaranteeMaskMatch({ tenantId: session.tenant.id, blankFormVersionId: version.blankFormVersionId, maskVersionId: version.id });
        return match?.status === "exact" ? version : undefined;
      }))).filter((version): version is (typeof versions)[number] => Boolean(version));
      formRows = forms.map((form) => ({
        id: form.id,
        name: form.name,
        versions: visibleVersions.filter((version) => version.blankFormId === form.id).map((version) => ({ id: version.blankFormVersionId, versionNumber: version.versionNumber, status: version.status, maskVersionId: version.id, tested: Boolean(version.testConfirmedAt) })),
      }));
      if (!isAdmin) formRows = formRows.filter((form) => form.versions.length > 0);
    }
  } catch (error) {
    errorMessage = error instanceof TenantSessionError && error.code === "permission_denied" ? messages.permissionDenied : messages.disabled;
  }
  if (errorMessage) return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-3xl font-semibold text-slate-950">{messages.title}</h1><p className="mt-3 text-sm text-slate-600">{errorMessage}</p><Link href="/" className="mt-5 inline-block text-sm text-blue-700 underline">{messages.returnHome}</Link></main>;
  return <GuaranteeFormsClient enabled={enabled} isAdmin={isAdmin} forms={formRows} locale={locale} />;
}
