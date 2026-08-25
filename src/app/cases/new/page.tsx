import Link from "next/link";
import { createBlankBrokerageCaseAction } from "@/app/actions";
import { listClientsForContext, listPropertiesForContext } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";
import { createRequestContext } from "@/lib/visibility-resolver";

export const dynamic = "force-dynamic";

type NewCasePageProps = {
  searchParams?: Promise<{ from?: string }>;
};

const copy = {
  ja: {
    title: "案件を作成",
    desc: "案件の基本情報を入力し、必要な既存の関係者・物件を選択します。",
    back: "情報整理へ戻る",
    backEntry: "情報入力へ戻る",
    basic: "案件情報",
    relation: "関連付け",
    caseTitle: "案件名",
    workflowType: "案件種別",
    party: "関係者",
    property: "物件",
    none: "未選択",
    rentalApplication: "賃貸申込",
    rentalMandate: "賃貸募集",
    saleMandate: "売却依頼",
    quotePreparation: "見積・提案",
    contractPreparation: "契約準備",
    save: "案件を作成",
  },
  zh: {
    title: "新建案件",
    desc: "填写案件基本信息，并按需选择已存在的主体和物件。",
    back: "返回整理信息",
    backEntry: "返回录入资料",
    basic: "案件信息",
    relation: "关联对象",
    caseTitle: "案件名",
    workflowType: "案件类型",
    party: "主体",
    property: "物件",
    none: "未选择",
    rentalApplication: "租赁申请",
    rentalMandate: "出租委托",
    saleMandate: "出售委托",
    quotePreparation: "报价 / 提案",
    contractPreparation: "合同准备",
    save: "创建案件",
  },
  ko: {
    title: "안건 생성",
    desc: "안건 기본 정보를 입력하고 필요한 기존 관계자와 매물을 선택합니다.",
    back: "정보 정리로 돌아가기",
    backEntry: "자료 입력으로 돌아가기",
    basic: "안건 정보",
    relation: "연결 대상",
    caseTitle: "안건명",
    workflowType: "안건 유형",
    party: "관계자",
    property: "매물",
    none: "선택 안 함",
    rentalApplication: "임대 신청",
    rentalMandate: "임대 모집",
    saleMandate: "매각 의뢰",
    quotePreparation: "견적 / 제안",
    contractPreparation: "계약 준비",
    save: "안건 생성",
  },
} as const;

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#d5e3fc]";

export default async function NewCasePage({ searchParams }: NewCasePageProps) {
  const [locale, session, params] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "case.create" }),
    searchParams ?? Promise.resolve({} as { from?: string }),
  ]);
  const text = copy[locale];
  const requestContext = createRequestContext(session);
  const [visibleClients, visibleProperties] = await Promise.all([
    listClientsForContext({ context: requestContext, filter: { lifecycleStatus: "active" } }),
    listPropertiesForContext({ context: requestContext, lifecycleStatus: "active" }),
  ]);
  const clients = visibleClients.filter((item) => item.resolution.canWrite).map((item) => item.client);
  const properties = visibleProperties.filter((item) => item.resolution.canWrite).map((item) => item.property);
  const fromEntry = params.from === "entry";
  const backHref = fromEntry ? "/import-center" : "/organize-center?type=case";
  const backLabel = fromEntry ? text.backEntry : text.back;
  const formId = "case-create-form";
  const workflowOptions = [
    { value: "rental_application", label: text.rentalApplication },
    { value: "rental_mandate", label: text.rentalMandate },
    { value: "sale_mandate", label: text.saleMandate },
    { value: "quote_preparation", label: text.quotePreparation },
    { value: "contract_preparation", label: text.contractPreparation },
  ];

  return (
    <div className="space-y-5 pb-16">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950">{text.title}</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">{text.desc}</p>
        </div>
        <Link href={backHref} className="rounded border border-slate-300 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">
          {backLabel}
        </Link>
      </header>

      <form id={formId} action={createBlankBrokerageCaseAction} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5">
        <section className="space-y-3">
          <h2 className="text-base font-black text-slate-950">{text.basic}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-black text-slate-600">{text.workflowType}</span>
              <select name="workflowType" defaultValue="rental_application" className={inputClass}>
                {workflowOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black text-slate-600">{text.caseTitle}</span>
              <input name="caseTitle" className={inputClass} />
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-black text-slate-950">{text.relation}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-black text-slate-600">{text.party}</span>
              <select name="primaryPartyId" defaultValue="" className={inputClass}>
                <option value="">{text.none}</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black text-slate-600">{text.property}</span>
              <select name="primaryPropertyId" defaultValue="" className={inputClass}>
                <option value="">{text.none}</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <div className="border-t border-slate-200 pt-4">
          <button type="submit" className="rounded bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">
            {text.save}
          </button>
        </div>
      </form>
    </div>
  );
}
