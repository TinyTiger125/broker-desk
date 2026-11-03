import { createClientFormAction, createPropertyQuickAction } from "@/app/actions";
import { createCaseWithUploadAction } from "@/app/case-entry-actions";
import { CaseAssociationDraft } from "@/components/case-association-draft";
import { listBrokerageCasesForContext, listClientsForContext, listPropertiesForContext } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import { getCaseWorkflowTypeGroups } from "@/lib/options";
import { TenantSessionError, requireTenantSession } from "@/lib/tenant-session";
import { createRequestContext } from "@/lib/visibility-resolver";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type NewCasePageProps = {
  searchParams?: Promise<{ from?: string }>;
};

const copy = {
  ja: {
    back: "情報整理へ戻る",
    backEntry: "情報入力へ戻る",
  },
  zh: {
    back: "返回整理信息",
    backEntry: "返回录入资料",
  },
  ko: {
    back: "정보 정리로 돌아가기",
    backEntry: "자료 입력으로 돌아가기",
  },
} as const;

export default async function NewCasePage({ searchParams }: NewCasePageProps) {
  const [locale, params] = await Promise.all([
    getLocale(),
    searchParams ?? Promise.resolve({} as { from?: string }),
  ]);
  const returnTo = params.from === "entry" ? "/cases/new?from=entry" : "/cases/new";
  let session;
  try {
    session = await requireTenantSession({ permission: "case.create" });
  } catch (error) {
    if (error instanceof TenantSessionError && error.code === "tenant_selection_required") {
      redirect(`/workspace?reason=tenant_selection_required&returnTo=${encodeURIComponent(returnTo)}`);
    }
    if (error instanceof TenantSessionError && ["permission_denied", "tenant_forbidden", "tenant_not_found", "user_not_found"].includes(error.code)) {
      notFound();
    }
    throw error;
  }
  const text = copy[locale];
  const requestContext = createRequestContext(session);
  const [visibleClients, visibleProperties, visibleCases] = await Promise.all([
    listClientsForContext({ context: requestContext, filter: { lifecycleStatus: "active" } }),
    listPropertiesForContext({ context: requestContext, lifecycleStatus: "active" }),
    listBrokerageCasesForContext({ context: requestContext, limit: 100 }),
  ]);
  const candidates = visibleClients
    .filter((item) => item.resolution.canWrite)
    .map(({ client }) => ({ id: client.id, name: client.name, searchText: [client.phone, client.email].filter(Boolean).join(" ") }));
  const properties = visibleProperties
    .filter((item) => item.resolution.canWrite)
    .map(({ property }) => ({ id: property.id, name: property.name, address: property.address }));
  const fromEntry = params.from === "entry";
  const workflowGroups = getCaseWorkflowTypeGroups(locale);

  return (
    <CaseAssociationDraft
      locale={locale}
      backHref={fromEntry ? "/import-center" : "/organize-center?type=case"}
      backLabel={fromEntry ? text.backEntry : text.back}
      candidates={candidates}
      properties={properties}
      existingCases={visibleCases.flatMap(({ brokerageCase }) => brokerageCase ? [{ id: brokerageCase.id, title: brokerageCase.caseTitle }] : [])}
      workflowGroups={workflowGroups}
      createCaseAction={createCaseWithUploadAction}
      createPersonAction={createClientFormAction}
      createPropertyAction={createPropertyQuickAction}
    />
  );
}
