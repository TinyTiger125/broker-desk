import {
  createBlankBrokerageCaseAction,
  createClientFormAction,
  createPropertyQuickAction,
} from "@/app/actions";
import { CaseAssociationDraft } from "@/components/case-association-draft";
import { listClientsForContext, listPropertiesForContext } from "@/lib/data";
import { getLocale } from "@/lib/locale";
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
    rentalApplication: "賃貸申込",
    rentalMandate: "賃貸募集",
    saleMandate: "売却依頼",
    quotePreparation: "見積・提案",
    contractPreparation: "契約準備",
  },
  zh: {
    back: "返回整理信息",
    backEntry: "返回录入资料",
    rentalApplication: "租赁申请",
    rentalMandate: "出租委托",
    saleMandate: "出售委托",
    quotePreparation: "报价 / 提案",
    contractPreparation: "合同准备",
  },
  ko: {
    back: "정보 정리로 돌아가기",
    backEntry: "자료 입력으로 돌아가기",
    rentalApplication: "임대 신청",
    rentalMandate: "임대 모집",
    saleMandate: "매각 의뢰",
    quotePreparation: "견적 / 제안",
    contractPreparation: "계약 준비",
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
  const [visibleClients, visibleProperties] = await Promise.all([
    listClientsForContext({ context: requestContext, filter: { lifecycleStatus: "active" } }),
    listPropertiesForContext({ context: requestContext, lifecycleStatus: "active" }),
  ]);
  const candidates = visibleClients
    .filter((item) => item.resolution.canWrite)
    .map(({ client }) => ({ id: client.id, name: client.name, searchText: [client.phone, client.email].filter(Boolean).join(" ") }));
  const properties = visibleProperties
    .filter((item) => item.resolution.canWrite)
    .map(({ property }) => ({ id: property.id, name: property.name, address: property.address }));
  const fromEntry = params.from === "entry";
  const workflowOptions = [
    { value: "rental_application", label: text.rentalApplication },
    { value: "rental_mandate", label: text.rentalMandate },
    { value: "sale_mandate", label: text.saleMandate },
    { value: "quote_preparation", label: text.quotePreparation },
    { value: "contract_preparation", label: text.contractPreparation },
  ];

  return (
    <CaseAssociationDraft
      locale={locale}
      backHref={fromEntry ? "/import-center" : "/organize-center?type=case"}
      backLabel={fromEntry ? text.backEntry : text.back}
      candidates={candidates}
      properties={properties}
      workflowOptions={workflowOptions}
      createCaseAction={createBlankBrokerageCaseAction}
      createPersonAction={createClientFormAction}
      createPropertyAction={createPropertyQuickAction}
    />
  );
}
