import Link from "next/link";
import { listBrokerageCases } from "@/lib/data";
import { getCaseFieldValue } from "@/lib/case-field-normalization";
import { formatDate } from "@/lib/format";
import {
  listHubAttachments,
  listHubContracts,
  listHubGeneratedOutputs,
  listHubImportJobs,
  listHubParties,
  listHubProperties,
} from "@/lib/hub";
import { getLocale, type Locale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

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
  icon: string;
  status?: "unconfirmed" | "inconsistent" | "insufficient" | "complete";
};

const copyByLocale = {
  ja: {
    title: "関係ツリー",
    desc: "選択した対象を中心に、案件・関係者・物件・資料・出力文書のつながりを確認します。",
    root: "中心",
    case: "案件",
    party: "関係者",
    property: "物件",
    source: "資料",
    output: "出力文書",
    contract: "契約・提案",
    backToOrganize: "整理情報へ戻る",
    open: "開く",
    empty: "関連する項目はまだありません。",
    unconfirmed: "未確認",
    inconsistent: "不一致",
    insufficient: "資料不足",
    complete: "完了",
    noSelection: "対象が見つかりません。整理情報から対象を選択してください。",
    relationHint: "関係は現在の保存済み情報から表示しています。足りない情報は整理画面で補完してください。",
  },
  zh: {
    title: "关系树",
    desc: "以当前对象为中心，查看案件、主体、物件、资料和输出文书之间的关系。",
    root: "当前对象",
    case: "案件",
    party: "主体",
    property: "物件",
    source: "资料",
    output: "输出文书",
    contract: "合同 / 提案",
    backToOrganize: "返回整理信息",
    open: "打开",
    empty: "目前还没有可显示的关联内容。",
    unconfirmed: "未确认",
    inconsistent: "不一致",
    insufficient: "资料不足",
    complete: "已完成",
    noSelection: "没有找到对象，请从整理信息页重新选择。",
    relationHint: "关系来自当前已保存的信息；缺少的关系请回到整理页继续补齐。",
  },
  ko: {
    title: "관계 트리",
    desc: "선택한 대상을 중심으로 안건, 관계자, 매물, 자료, 출력 문서의 연결을 확인합니다.",
    root: "현재 대상",
    case: "안건",
    party: "관계자",
    property: "매물",
    source: "자료",
    output: "출력 문서",
    contract: "계약 / 제안",
    backToOrganize: "정보 정리로 돌아가기",
    open: "열기",
    empty: "아직 연결된 항목이 없습니다.",
    unconfirmed: "미확인",
    inconsistent: "불일치",
    insufficient: "자료 부족",
    complete: "완료",
    noSelection: "대상을 찾을 수 없습니다. 정보 정리 화면에서 다시 선택해 주세요.",
    relationHint: "관계는 현재 저장된 정보 기준입니다. 부족한 정보는 정리 화면에서 보완해 주세요.",
  },
} satisfies Record<Locale, Record<string, string>>;

function isTreeType(value: string | undefined): value is TreeType {
  return value === "case" || value === "party" || value === "property";
}

function includesLoose(a?: string, b?: string) {
  const left = a?.trim().toLowerCase();
  const right = b?.trim().toLowerCase();
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function statusLabel(status: RelationNode["status"], copy: Record<string, string>) {
  if (status === "complete") return copy.complete;
  if (status === "inconsistent") return copy.inconsistent;
  if (status === "insufficient") return copy.insufficient;
  if (status === "unconfirmed") return copy.unconfirmed;
  return "";
}

function statusClass(status: RelationNode["status"]) {
  if (status === "complete") return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100";
  if (status === "inconsistent") return "bg-orange-50 text-orange-700 ring-1 ring-orange-100";
  if (status === "unconfirmed") return "bg-amber-50 text-amber-800 ring-1 ring-amber-100";
  return "bg-rose-50 text-rose-700 ring-1 ring-rose-100";
}

function nodeCard(node: RelationNode, copy: Record<string, string>) {
  const content = (
    <>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#002FA7]">
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">{node.icon}</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-sm font-black leading-5 text-slate-950">{node.title}</p>
            {node.status ? (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${statusClass(node.status)}`}>
                {statusLabel(node.status, copy)}
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{node.subtitle}</p>
        </div>
      </div>
      {node.href ? (
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-black text-[#002FA7]">
          {copy.open}
          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">arrow_forward</span>
        </span>
      ) : null}
    </>
  );

  if (node.href) {
    return (
      <Link key={node.id} href={node.href} className="block rounded-lg border border-slate-200 bg-white p-3 hover:border-blue-300 hover:bg-blue-50/40">
        {content}
      </Link>
    );
  }

  return (
    <div key={node.id} className="rounded-lg border border-slate-200 bg-white p-3">
      {content}
    </div>
  );
}

export default async function RelationshipTreePage({ searchParams }: RelationshipTreePageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.read" }),
  ]);
  const copy = copyByLocale[locale];
  const params = searchParams ? await searchParams : undefined;
  const requestedType = isTreeType(params?.type) ? params.type : "case";
  const requestedId = String(params?.id ?? "").trim();
  const context = { userId: session.user.id, tenantId: session.tenant.id };

  const [cases, parties, properties, contracts, attachments, outputs, importJobs] = await Promise.all([
    listBrokerageCases(session.user.id, 100, session.tenant.id),
    listHubParties(locale, context),
    listHubProperties(locale, context),
    listHubContracts(locale, context),
    listHubAttachments(locale, 200, context),
    listHubGeneratedOutputs(locale, context),
    listHubImportJobs(context, locale),
  ]);

  const selectedCase = requestedType === "case" ? cases.find((item) => item.id === requestedId) ?? cases[0] : undefined;
  const selectedParty = requestedType === "party" ? parties.find((item) => item.id === requestedId) ?? parties[0] : undefined;
  const selectedProperty = requestedType === "property" ? properties.find((item) => item.id === requestedId) ?? properties[0] : undefined;

  const caseApplicant = selectedCase ? getCaseFieldValue(selectedCase.confirmedDataJson, "applicant.name") : "";
  const caseProperty = selectedCase ? getCaseFieldValue(selectedCase.confirmedDataJson, "property.name") : "";
  const caseFieldCount = selectedCase ? Object.keys(selectedCase.confirmedDataJson ?? {}).filter((key) => !key.startsWith("__")).length : 0;

  const root: RelationNode | undefined = selectedCase
    ? {
        id: selectedCase.id,
        title: selectedCase.caseTitle,
        subtitle: [caseApplicant, caseProperty].filter(Boolean).join(" / ") || copy.case,
        href: `/cases/${encodeURIComponent(selectedCase.id)}`,
        icon: "work",
        status: selectedCase.status === "reviewed" && caseFieldCount > 0 ? "complete" : "insufficient",
      }
    : selectedParty
      ? {
          id: selectedParty.id,
          title: selectedParty.name,
          subtitle: selectedParty.roles.join(" / ") || copy.party,
          href: `/parties?focus=${encodeURIComponent(selectedParty.id)}`,
          icon: "person",
          status: selectedParty.phone || selectedParty.email ? "complete" : "insufficient",
        }
      : selectedProperty
        ? {
            id: selectedProperty.id,
            title: selectedProperty.name,
            subtitle: selectedProperty.area || copy.property,
            href: `/properties?focus=${encodeURIComponent(selectedProperty.id)}`,
            icon: "apartment",
            status: selectedProperty.listingPrice > 0 || selectedProperty.managementFee > 0 || selectedProperty.repairFee > 0 ? "complete" : "insufficient",
          }
        : undefined;

  const relatedCaseNodes: RelationNode[] = selectedParty
    ? contracts
        .filter((contract) => contract.clientId === selectedParty.id)
        .map((contract) => ({
          id: contract.id,
          title: contract.contractNumber,
          subtitle: [contract.relatedProperty, contract.relatedParty].filter(Boolean).join(" / ") || copy.contract,
          href: `/contracts?focus=${encodeURIComponent(contract.id)}`,
          icon: "request_quote",
          status: contract.status === "draft" ? "unconfirmed" : "complete",
        }))
    : selectedProperty
      ? contracts
          .filter((contract) => includesLoose(contract.relatedProperty, selectedProperty.name) || includesLoose(contract.relatedProperty, selectedProperty.area))
          .map((contract) => ({
            id: contract.id,
            title: contract.contractNumber,
            subtitle: [contract.relatedProperty, contract.relatedParty].filter(Boolean).join(" / ") || copy.contract,
            href: `/contracts?focus=${encodeURIComponent(contract.id)}`,
            icon: "request_quote",
            status: contract.status === "draft" ? "unconfirmed" : "complete",
          }))
      : [];

  const relatedPartyNodes: RelationNode[] = selectedCase
    ? parties
        .filter((party) => includesLoose(party.name, caseApplicant) || includesLoose(party.relatedPropertyHint, caseProperty))
        .map((party) => ({
          id: party.id,
          title: party.name,
          subtitle: party.roles.join(" / ") || copy.party,
          href: `/parties?focus=${encodeURIComponent(party.id)}`,
          icon: "person",
          status: party.phone || party.email ? "complete" : "insufficient",
        }))
    : selectedProperty
      ? parties
          .filter((party) => includesLoose(party.relatedPropertyHint, selectedProperty.name) || includesLoose(party.relatedPropertyHint, selectedProperty.area))
          .map((party) => ({
            id: party.id,
            title: party.name,
            subtitle: party.roles.join(" / ") || copy.party,
            href: `/parties?focus=${encodeURIComponent(party.id)}`,
            icon: "person",
            status: party.phone || party.email ? "complete" : "insufficient",
          }))
      : [];

  const relatedPropertyNodes: RelationNode[] = selectedCase
    ? properties
        .filter((property) => selectedCase.primaryPropertyId === property.id || includesLoose(property.name, caseProperty) || includesLoose(property.area, caseProperty))
        .map((property) => ({
          id: property.id,
          title: property.name,
          subtitle: property.area || copy.property,
          href: `/properties?focus=${encodeURIComponent(property.id)}`,
          icon: "apartment",
          status: property.listingPrice > 0 || property.managementFee > 0 || property.repairFee > 0 ? "complete" : "insufficient",
        }))
    : selectedParty
      ? properties
          .filter((property) => includesLoose(property.name, selectedParty.relatedPropertyHint) || includesLoose(property.area, selectedParty.relatedPropertyHint))
          .map((property) => ({
            id: property.id,
            title: property.name,
            subtitle: property.area || copy.property,
            href: `/properties?focus=${encodeURIComponent(property.id)}`,
            icon: "apartment",
            status: property.listingPrice > 0 || property.managementFee > 0 || property.repairFee > 0 ? "complete" : "insufficient",
          }))
      : [];

  const targetType = requestedType === "party" ? "party" : requestedType === "property" ? "property" : undefined;
  const relatedSourceNodes: RelationNode[] = [
    ...(selectedCase
      ? importJobs
          .filter((job) => selectedCase.sourceImportJobIds.includes(job.id))
          .map((job) => ({
            id: job.id,
            title: job.title,
            subtitle: `${job.sourceType.toUpperCase()} · ${formatDate(job.createdAt, locale)}`,
            href: `/import-center?job=${encodeURIComponent(job.id)}`,
            icon: "upload_file",
            status: job.status === "completed" ? "complete" : "unconfirmed",
          } satisfies RelationNode))
      : []),
    ...(targetType && root
      ? attachments
          .filter((item) => item.targetType === targetType && item.targetId === root.id)
          .map((item) => ({
            id: item.id,
            title: item.fileName,
            subtitle: `${item.targetLabel} · ${formatDate(item.uploadedAt, locale)}`,
            href: "/import-center",
            icon: "description",
            status: "complete",
          } satisfies RelationNode))
      : []),
  ];

  const relatedOutputNodes: RelationNode[] = outputs
    .filter((item) => {
      if (selectedParty) return item.partyId === selectedParty.id || includesLoose(item.relatedParty, selectedParty.name);
      if (selectedProperty) return item.propertyId === selectedProperty.id || includesLoose(item.relatedProperty, selectedProperty.name) || includesLoose(item.relatedProperty, selectedProperty.area);
      if (selectedCase) return includesLoose(item.relatedParty, caseApplicant) || includesLoose(item.relatedProperty, caseProperty);
      return false;
    })
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: `${item.outputFormat.toUpperCase()} · ${formatDate(item.generatedAt, locale)}`,
      href: `/output-center?generatedOutputId=${encodeURIComponent(item.id)}`,
      icon: "picture_as_pdf",
      status: "complete",
    }));

  const groups = [
    { id: "cases", label: selectedCase ? copy.contract : copy.case, nodes: relatedCaseNodes },
    { id: "parties", label: copy.party, nodes: relatedPartyNodes },
    { id: "properties", label: copy.property, nodes: relatedPropertyNodes },
    { id: "sources", label: copy.source, nodes: relatedSourceNodes },
    { id: "outputs", label: copy.output, nodes: relatedOutputNodes },
  ].filter((group) => group.nodes.length > 0 || group.id !== "cases" || requestedType !== "case");

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950">{copy.title}</h1>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">{copy.desc}</p>
        </div>
        <Link href="/organize-center" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 hover:bg-slate-50">
          {copy.backToOrganize}
        </Link>
      </header>

      {root ? (
        <section className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(17rem,20rem)_minmax(0,1fr)]">
          <aside className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-black text-[#002FA7]">{copy.root}</p>
            <div className="mt-4 rounded-xl border border-[#002FA7] bg-blue-50 p-4">
              {nodeCard(root, copy)}
            </div>
            <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">
              {copy.relationHint}
            </p>
          </aside>

          <div className="min-w-0 space-y-4">
            {groups.map((group) => (
              <section key={group.id} className="rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <h2 className="text-base font-black text-slate-950">{group.label}</h2>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{group.nodes.length}</span>
                </div>
                <div className="relative p-4">
                  {group.nodes.length > 0 ? (
                    <div className="space-y-3 border-l-2 border-blue-100 pl-4">
                      {group.nodes.map((node) => (
                        <div key={node.id} className="relative">
                          <span className="absolute -left-[1.35rem] top-5 h-2.5 w-2.5 rounded-full bg-[#002FA7]" />
                          {nodeCard(node, copy)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
                      {copy.empty}
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-sm font-semibold text-slate-600">
          {copy.noSelection}
        </section>
      )}
    </div>
  );
}
