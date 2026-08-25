import Link from "next/link";
import { listBrokerageCasesForContext, type BrokerageCase } from "@/lib/data";
import { listHubParties, listHubProperties } from "@/lib/hub";
import { getLocale, type Locale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";
import { createRequestContext } from "@/lib/visibility-resolver";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type RelationshipTreePageProps = {
  searchParams?: Promise<{ type?: string; id?: string }>;
};

type TreeType = "case" | "party" | "property";

type RelationNode = {
  id: string;
  title: string;
  subtitle: string;
  href?: string;
  kind: "case" | "party" | "property";
};

const copyByLocale = {
  ja: {
    title: "関係エクスプローラー",
    desc: "保存済みの明示的な関係だけを確認します。推測されたつながりは表示しません。",
    root: "選択した対象",
    connections: "明示的な関係",
    case: "案件",
    party: "関係者",
    property: "物件",
    back: "整理情報へ戻る",
    open: "開く",
    empty: "保存済みの明示的な関係はありません。",
    noSelection: "対象を選択すると、確認できる明示的な関係を表示します。",
    noObject: "対象が見つかりません。",
  },
  zh: {
    title: "关系探索",
    desc: "只显示已保存且可明确追溯的关系，不把推测当作事实。",
    root: "当前对象",
    connections: "明确关系",
    case: "案件",
    party: "主体",
    property: "物件",
    back: "返回整理信息",
    open: "打开",
    empty: "没有可确认的已保存关系。",
    noSelection: "选择对象后，这里会显示可以确认的明确关系。",
    noObject: "没有找到对象。",
  },
  ko: {
    title: "관계 탐색기",
    desc: "저장되어 있고 추적 가능한 명시적 관계만 표시합니다. 추정 관계는 사실로 표시하지 않습니다.",
    root: "선택한 대상",
    connections: "명시적 관계",
    case: "안건",
    party: "관계자",
    property: "매물",
    back: "정보 정리로 돌아가기",
    open: "열기",
    empty: "확인할 수 있는 저장된 관계가 없습니다.",
    noSelection: "대상을 선택하면 확인 가능한 명시적 관계가 표시됩니다.",
    noObject: "대상을 찾을 수 없습니다.",
  },
} satisfies Record<Locale, Record<string, string>>;

function isTreeType(value: string | undefined): value is TreeType {
  return value === "case" || value === "party" || value === "property";
}

function getPrimaryPartyId(confirmedDataJson: Record<string, unknown>): string | undefined {
  const value = confirmedDataJson.__primaryPartyId;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nodeLink(node: RelationNode, copy: Record<string, string>) {
  const content = (
    <div className="flex min-w-0 items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-slate-950">{node.title}</p>
        <p className="mt-1 truncate text-xs text-slate-500">{node.subtitle}</p>
      </div>
      {node.href ? <span className="shrink-0 text-xs font-bold text-[#002FA7]">{copy.open}</span> : null}
    </div>
  );

  if (!node.href) return <li key={`${node.kind}-${node.id}`} className="border-b border-slate-100 last:border-0">{content}</li>;
  return (
    <li key={`${node.kind}-${node.id}`} className="border-b border-slate-100 last:border-0">
      <Link href={node.href} className="block rounded-md px-2 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-[#002FA7]">
        {content}
      </Link>
    </li>
  );
}

export default async function RelationshipTreePage({ searchParams }: RelationshipTreePageProps) {
  const [locale, session] = await Promise.all([getLocale(), requireTenantSession({ permission: "record.read" })]);
  const copy = copyByLocale[locale];
  const params = searchParams ? await searchParams : undefined;
  if (params?.type && !isTreeType(params.type)) notFound();
  const requestedType = isTreeType(params?.type) ? params.type : undefined;
  const requestedId = String(params?.id ?? "").trim();
  const requestContext = createRequestContext(session);

  const [visibleCases, parties, properties] = await Promise.all([
    listBrokerageCasesForContext({ context: requestContext, limit: 100 }),
    listHubParties(locale, { requestContext }),
    listHubProperties(locale, { requestContext }),
  ]);
  const caseEntries = new Map(visibleCases.flatMap((entry) => entry.brokerageCase ? [[entry.brokerageCase.id, entry]] as const : []));
  const cases = visibleCases.flatMap((entry) => (entry.brokerageCase ? [entry.brokerageCase] : []));
  const displayCaseTitle = (item: BrokerageCase) => caseEntries.get(item.id)?.resolution.canWrite ? item.caseTitle : copy.case;

  const selectedCase = requestedType === "case" ? cases.find((item) => item.id === requestedId) : undefined;
  const selectedParty = requestedType === "party" ? parties.find((item) => item.id === requestedId) : undefined;
  const selectedProperty = requestedType === "property" ? properties.find((item) => item.id === requestedId) : undefined;
  const root: RelationNode | undefined = selectedCase
    ? { id: selectedCase.id, title: displayCaseTitle(selectedCase), subtitle: copy.case, href: `/cases/${encodeURIComponent(selectedCase.id)}`, kind: "case" }
    : selectedParty
      ? { id: selectedParty.id, title: selectedParty.name, subtitle: copy.party, href: `/parties/${encodeURIComponent(selectedParty.id)}/edit`, kind: "party" }
      : selectedProperty
        ? { id: selectedProperty.id, title: selectedProperty.name, subtitle: selectedProperty.area || copy.property, href: `/properties/${encodeURIComponent(selectedProperty.id)}/edit`, kind: "property" }
        : undefined;

  const relatedNodes: RelationNode[] = [];
  if (selectedCase) {
    if (selectedCase.primaryPropertyId) {
      const property = properties.find((item) => item.id === selectedCase.primaryPropertyId);
      if (property) relatedNodes.push({ id: property.id, title: property.name, subtitle: copy.property, href: `/properties/${encodeURIComponent(property.id)}/edit`, kind: "property" });
    }
    const primaryPartyId = getPrimaryPartyId(selectedCase.confirmedDataJson);
    if (primaryPartyId) {
      const party = parties.find((item) => item.id === primaryPartyId);
      if (party) relatedNodes.push({ id: party.id, title: party.name, subtitle: copy.party, href: `/parties/${encodeURIComponent(party.id)}/edit`, kind: "party" });
    }
  } else if (selectedParty) {
    for (const item of cases) {
      if (getPrimaryPartyId(item.confirmedDataJson) === selectedParty.id) {
        relatedNodes.push({ id: item.id, title: displayCaseTitle(item), subtitle: copy.case, href: `/cases/${encodeURIComponent(item.id)}`, kind: "case" });
      }
    }
  } else if (selectedProperty) {
    for (const item of cases) {
      if (item.primaryPropertyId === selectedProperty.id) {
        relatedNodes.push({ id: item.id, title: displayCaseTitle(item), subtitle: copy.case, href: `/cases/${encodeURIComponent(item.id)}`, kind: "case" });
      }
    }
  }

  if (requestedType && requestedId && !root) notFound();

  const groups = root
    ? [{ label: copy.connections, nodes: relatedNodes }]
    : [];

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950">{copy.title}</h1>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">{copy.desc}</p>
        </div>
        <Link href="/organize-center" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 hover:bg-slate-50">
          {copy.back}
        </Link>
      </header>

      {!requestedType || !requestedId ? (
        <section className="border-l-4 border-slate-300 bg-slate-50 p-5 text-sm font-semibold text-slate-600">{copy.noSelection}</section>
      ) : !root ? (
        <section className="border-l-4 border-amber-300 bg-amber-50 p-5 text-sm font-semibold text-amber-800">{copy.noObject}</section>
      ) : (
        <section className="grid min-w-0 gap-5 lg:grid-cols-[minmax(17rem,20rem)_minmax(0,1fr)]">
          <aside className="min-w-0 border-b border-slate-200 pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5">
            <p className="text-xs font-black text-[#002FA7]">{copy.root}</p>
            <div className="mt-3 border-l-4 border-[#002FA7] bg-blue-50 px-4 py-3">
              <p className="truncate text-base font-black text-slate-950">{root.title}</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">{root.subtitle}</p>
            </div>
          </aside>
          <div className="min-w-0">
            {groups.map((group) => (
              <section key={group.label}>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h2 className="text-base font-black text-slate-950">{group.label}</h2>
                  <span className="text-xs font-semibold text-slate-500">{group.nodes.length}</span>
                </div>
                {group.nodes.length > 0 ? (
                  <ul className="mt-1">{group.nodes.map((node) => nodeLink(node, copy))}</ul>
                ) : (
                  <p className="mt-4 border-l-4 border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">{copy.empty}</p>
                )}
              </section>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
