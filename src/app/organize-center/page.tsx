import Link from "next/link";
import { listBrokerageCases } from "@/lib/data";
import { getCaseFieldValue } from "@/lib/case-field-normalization";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  listHubImportJobs,
  listHubParties,
  listHubProperties,
  type HubImportJobItem,
} from "@/lib/hub";
import { getLocale, type Locale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

type OrganizeCenterPageProps = {
  searchParams?: Promise<{ type?: string; status?: string; q?: string; focus?: string }>;
};

type ObjectType = "all" | "case" | "party" | "property" | "inbox";
type ObjectStatus = "all" | "needs_input" | "ready" | "unassigned";

type WorkObject = {
  id: string;
  type: Exclude<ObjectType, "all">;
  status: Exclude<ObjectStatus, "all">;
  title: string;
  subtitle: string;
  relation: string;
  updatedAt?: Date;
  metricLabel: string;
  metricValue: string;
  href: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

const copyByLocale = {
  ja: {
    title: "情報を整理",
    desc: "案件、関係者、物件、未整理資料を同じ場所で探して整理します。",
    objectCenter: "対象を選ぶ",
    objectCenterDesc: "先に対象を決めると、資料の追加先と整理画面がぶれません。",
    createParty: "関係者を追加",
    createProperty: "物件を追加",
    createCase: "案件を作成",
    upload: "資料を追加",
    moreCreate: "他の作成",
    searchPlaceholder: "名前、物件、案件、資料名で検索",
    filter: "絞り込む",
    all: "すべて",
    case: "案件",
    party: "関係者",
    property: "物件",
    inbox: "未整理資料",
    needsInput: "補完が必要",
    ready: "整理済み",
    unassigned: "未紐付け",
    tableName: "対象",
    tableType: "種別",
    tableRelation: "関連",
    tableMetric: "情報量",
    tableUpdated: "更新",
    tableAction: "操作",
    detailTitle: "選択中の対象",
    noSelection: "対象を選択してください。",
    empty: "条件に一致する対象がありません。",
    open: "開く",
    continueWork: "整理を続ける",
    addMaterial: "資料を追加",
    output: "出力へ",
    editParty: "関係者を編集",
    openProperty: "物件を見る",
    processMaterial: "資料を確認",
    savedFields: "保存項目",
    role: "役割",
    price: "価格",
    source: "資料種別",
    corporate: "法人",
    individual: "個人",
    noRelation: "未紐付け",
    noDate: "-",
    personUnset: "関係者未設定",
    propertyUnset: "物件未設定",
    propertyRelationHint: "関係者や案件に紐付けて使います",
  },
  zh: {
    title: "整理信息",
    desc: "在同一个入口查找和整理案件、主体、物件、待归属资料。",
    objectCenter: "选择整理对象",
    objectCenterDesc: "先确定资料归属，再进入对应的整理页面，避免把联系人、物件和案件混在一起。",
    createParty: "新建主体",
    createProperty: "新建物件",
    createCase: "新建案件",
    upload: "导入资料",
    moreCreate: "其他新建",
    searchPlaceholder: "搜索姓名、物件、案件、资料名",
    filter: "筛选",
    all: "全部",
    case: "案件",
    party: "主体",
    property: "物件",
    inbox: "待归属资料",
    needsInput: "待补全",
    ready: "已整理",
    unassigned: "未归属",
    tableName: "对象",
    tableType: "类型",
    tableRelation: "关联",
    tableMetric: "信息量",
    tableUpdated: "更新",
    tableAction: "操作",
    detailTitle: "当前对象",
    noSelection: "请选择一个对象。",
    empty: "没有符合条件的对象。",
    open: "打开",
    continueWork: "继续整理",
    addMaterial: "补充资料",
    output: "去输出",
    editParty: "编辑主体",
    openProperty: "查看物件",
    processMaterial: "处理资料",
    savedFields: "保存项",
    role: "角色",
    price: "价格",
    source: "资料类型",
    corporate: "法人",
    individual: "个人",
    noRelation: "未关联",
    noDate: "-",
    personUnset: "主体未设置",
    propertyUnset: "物件未设置",
    propertyRelationHint: "可关联主体或案件后继续使用",
  },
  ko: {
    title: "정보 정리",
    desc: "안건, 관계자, 매물, 미분류 자료를 한 곳에서 찾고 정리합니다.",
    objectCenter: "정리 대상 선택",
    objectCenterDesc: "먼저 대상을 정하면 자료 추가 위치와 정리 화면이 흔들리지 않습니다.",
    createParty: "관계자 추가",
    createProperty: "매물 추가",
    createCase: "안건 생성",
    upload: "자료 추가",
    moreCreate: "다른 생성",
    searchPlaceholder: "이름, 매물, 안건, 자료명 검색",
    filter: "필터",
    all: "전체",
    case: "안건",
    party: "관계자",
    property: "매물",
    inbox: "미분류 자료",
    needsInput: "보완 필요",
    ready: "정리됨",
    unassigned: "미연결",
    tableName: "대상",
    tableType: "유형",
    tableRelation: "연결",
    tableMetric: "정보량",
    tableUpdated: "업데이트",
    tableAction: "작업",
    detailTitle: "선택 대상",
    noSelection: "대상을 선택해 주세요.",
    empty: "조건에 맞는 대상이 없습니다.",
    open: "열기",
    continueWork: "정리 계속",
    addMaterial: "자료 추가",
    output: "출력으로",
    editParty: "관계자 편집",
    openProperty: "매물 보기",
    processMaterial: "자료 확인",
    savedFields: "저장 항목",
    role: "역할",
    price: "가격",
    source: "자료 유형",
    corporate: "법인",
    individual: "개인",
    noRelation: "미연결",
    noDate: "-",
    personUnset: "관계자 미설정",
    propertyUnset: "매물 미설정",
    propertyRelationHint: "관계자 또는 안건에 연결해 사용합니다",
  },
} satisfies Record<Locale, Record<string, string>>;

function isObjectType(value: string | undefined): value is ObjectType {
  return value === "all" || value === "case" || value === "party" || value === "property" || value === "inbox";
}

function isObjectStatus(value: string | undefined): value is ObjectStatus {
  return value === "all" || value === "needs_input" || value === "ready" || value === "unassigned";
}

function getTypeLabel(type: ObjectType, copy: Record<string, string>) {
  if (type === "case") return copy.case;
  if (type === "party") return copy.party;
  if (type === "property") return copy.property;
  if (type === "inbox") return copy.inbox;
  return copy.all;
}

function getStatusLabel(status: ObjectStatus, copy: Record<string, string>) {
  if (status === "needs_input") return copy.needsInput;
  if (status === "ready") return copy.ready;
  if (status === "unassigned") return copy.unassigned;
  return copy.all;
}

function getStatusClass(status: WorkObject["status"]) {
  if (status === "ready") return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100";
  if (status === "unassigned") return "bg-amber-50 text-amber-800 ring-1 ring-amber-100";
  return "bg-rose-50 text-rose-700 ring-1 ring-rose-100";
}

function getSourceTypeLabel(locale: Locale, sourceType: HubImportJobItem["sourceType"]) {
  const labels: Record<HubImportJobItem["sourceType"], Record<Locale, string>> = {
    excel: { ja: "Excel", zh: "Excel", ko: "Excel" },
    pdf: { ja: "PDF", zh: "PDF", ko: "PDF" },
    scan: { ja: "画像", zh: "图片", ko: "이미지" },
    manual: { ja: "手入力", zh: "手动", ko: "수동" },
  };
  return labels[sourceType][locale];
}

function countCaseFields(data: Record<string, unknown>) {
  return Object.keys(data).filter((key) => !key.startsWith("__")).length;
}

function hrefWithFilters(type: ObjectType, status: ObjectStatus, query: string, focus?: string) {
  const params = new URLSearchParams();
  if (type !== "all") params.set("type", type);
  if (status !== "all") params.set("status", status);
  if (query) params.set("q", query);
  if (focus) params.set("focus", focus);
  const queryString = params.toString();
  return `/organize-center${queryString ? `?${queryString}` : ""}`;
}

function buildSearchText(item: WorkObject) {
  return [item.title, item.subtitle, item.relation, item.metricValue].join(" ").toLowerCase();
}

function getCreateActions(copy: Record<string, string>) {
  return [
    { type: "party" as const, href: "/parties/new", label: copy.createParty, icon: "person_add" },
    { type: "property" as const, href: "/properties/new", label: copy.createProperty, icon: "domain_add" },
    { type: "case" as const, href: "/cases/new", label: copy.createCase, icon: "add_business" },
  ];
}

export default async function OrganizeCenterPage({ searchParams }: OrganizeCenterPageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.read" }),
  ]);
  const copy = copyByLocale[locale];
  const params = searchParams ? await searchParams : undefined;
  const selectedType = isObjectType(params?.type) ? params.type : "all";
  const selectedStatus = isObjectStatus(params?.status) ? params.status : "all";
  const query = String(params?.q ?? "").trim();
  const focusId = String(params?.focus ?? "").trim();
  const context = { userId: session.user.id, tenantId: session.tenant.id };

  const [cases, parties, properties, importJobs] = await Promise.all([
    listBrokerageCases(session.user.id, 100, session.tenant.id),
    listHubParties(locale, context),
    listHubProperties(locale, context),
    listHubImportJobs(context),
  ]);

  const assignedImportJobIds = new Set(cases.flatMap((item) => item.sourceImportJobIds));
  const caseItems: WorkObject[] = cases.map((item) => {
    const savedFieldCount = countCaseFields(item.confirmedDataJson ?? {});
    const applicantName = getCaseFieldValue(item.confirmedDataJson, "applicant.name");
    const propertyName = getCaseFieldValue(item.confirmedDataJson, "property.name");
    const status: WorkObject["status"] = item.status === "reviewed" && savedFieldCount > 0 ? "ready" : "needs_input";
    return {
      id: item.id,
      type: "case",
      status,
      title: item.caseTitle,
      subtitle: getStatusLabel(status, copy),
      relation: `${applicantName || copy.personUnset} / ${propertyName || copy.propertyUnset}`,
      updatedAt: item.updatedAt,
      metricLabel: copy.savedFields,
      metricValue: String(savedFieldCount),
      href: `/cases/${encodeURIComponent(item.id)}`,
      secondaryHref: `/output-center?caseId=${encodeURIComponent(item.id)}`,
      secondaryLabel: copy.output,
    };
  });

  const partyItems: WorkObject[] = parties.map((item) => {
    const hasContact = Boolean(item.phone || item.email);
    const status: WorkObject["status"] = hasContact ? "ready" : "needs_input";
    return {
      id: item.id,
      type: "party",
      status,
      title: item.name,
      subtitle: item.partyType === "corporate" ? copy.corporate : copy.individual,
      relation: item.relatedPropertyHint || copy.noRelation,
      metricLabel: copy.role,
      metricValue: item.roles.join(" / ") || copy.noRelation,
      href: `/parties/${encodeURIComponent(item.id)}/edit`,
      secondaryHref: `/parties?focus=${encodeURIComponent(item.id)}`,
      secondaryLabel: copy.open,
    };
  });

  const propertyItems: WorkObject[] = properties.map((item) => {
    const status: WorkObject["status"] = item.listingPrice > 0 || item.managementFee > 0 || item.repairFee > 0 ? "ready" : "needs_input";
    return {
      id: item.id,
      type: "property",
      status,
      title: item.name,
      subtitle: item.area,
      relation: copy.propertyRelationHint,
      metricLabel: copy.price,
      metricValue: item.listingPrice > 0 ? formatCurrency(item.listingPrice, locale) : copy.noRelation,
      href: `/properties?focus=${encodeURIComponent(item.id)}`,
      secondaryHref: "/output-center",
      secondaryLabel: copy.output,
    };
  });

  const inboxItems: WorkObject[] = importJobs
    .filter((item) => !assignedImportJobIds.has(item.id))
    .map((item) => ({
      id: item.id,
      type: "inbox",
      status: "unassigned",
      title: item.title,
      subtitle: item.validationMessage || getStatusLabel("unassigned", copy),
      relation: copy.noRelation,
      updatedAt: item.createdAt,
      metricLabel: copy.source,
      metricValue: getSourceTypeLabel(locale, item.sourceType),
      href: `/import-center?job=${encodeURIComponent(item.id)}`,
      secondaryHref: "/import-center",
      secondaryLabel: copy.processMaterial,
    }));

  const allItems = [...caseItems, ...partyItems, ...propertyItems, ...inboxItems].sort((a, b) => {
    const aTime = a.updatedAt?.getTime() ?? 0;
    const bTime = b.updatedAt?.getTime() ?? 0;
    if (aTime !== bTime) return bTime - aTime;
    return a.title.localeCompare(b.title);
  });

  const normalizedQuery = query.toLowerCase();
  const filteredItems = allItems.filter((item) => {
    if (selectedType !== "all" && item.type !== selectedType) return false;
    if (selectedStatus !== "all" && item.status !== selectedStatus) return false;
    if (normalizedQuery && !buildSearchText(item).includes(normalizedQuery)) return false;
    return true;
  });
  const selectedItem = filteredItems.find((item) => item.id === focusId) ?? filteredItems[0];
  const typeFilters: ObjectType[] = ["all", "case", "party", "property", "inbox"];
  const statusFilters: ObjectStatus[] = ["all", "needs_input", "ready", "unassigned"];
  const countByType = new Map<ObjectType, number>([
    ["all", allItems.length],
    ["case", caseItems.length],
    ["party", partyItems.length],
    ["property", propertyItems.length],
    ["inbox", inboxItems.length],
  ]);
  const createActions = getCreateActions(copy);
  const primaryCreateType = selectedType === "party" || selectedType === "property" || selectedType === "case" ? selectedType : "case";
  const primaryCreateAction = selectedType === "inbox"
    ? { type: "inbox" as const, href: "/import-center", label: copy.upload, icon: "upload_file" }
    : createActions.find((action) => action.type === primaryCreateType) ?? createActions[2];
  const secondaryAction = selectedType === "inbox"
    ? createActions.find((action) => action.type === "case")
    : { type: "inbox" as const, href: "/import-center", label: copy.upload, icon: "upload_file" };
  const moreCreateActions = createActions.filter((action) => action.type !== primaryCreateAction.type && action.type !== secondaryAction?.type);

  return (
    <div className="space-y-6">
      <header className="border-b border-slate-200 pb-5">
        <h1 className="text-3xl font-black tracking-tight text-slate-950">{copy.title}</h1>
        <p className="mt-2 text-sm font-semibold text-slate-600">{copy.desc}</p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-950">{copy.objectCenter}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">{copy.objectCenterDesc}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={primaryCreateAction.href} className="inline-flex items-center gap-1 rounded border border-slate-950 bg-slate-950 px-3 py-2 text-sm font-black text-white hover:bg-slate-800">
              <span className="material-symbols-outlined text-[16px]">{primaryCreateAction.icon}</span>
              {primaryCreateAction.label}
            </Link>
            {secondaryAction ? (
              <Link href={secondaryAction.href} className="inline-flex items-center gap-1 rounded bg-[#002FA7] px-3 py-2 text-sm font-black text-white hover:bg-[#00247c]">
                <span className="material-symbols-outlined text-[16px]">{secondaryAction.icon}</span>
                {secondaryAction.label}
              </Link>
            ) : null}
            {moreCreateActions.length > 0 ? (
              <details className="relative">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-800 hover:bg-slate-50">
                  <span className="material-symbols-outlined text-[16px]">more_horiz</span>
                  {copy.moreCreate}
                </summary>
                <div className="absolute right-0 z-10 mt-2 w-44 overflow-hidden rounded border border-slate-200 bg-white shadow-lg">
                  {moreCreateActions.map((action) => (
                    <Link key={action.type} href={action.href} className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm font-black text-slate-700 last:border-b-0 hover:bg-slate-50">
                      <span className="material-symbols-outlined text-[16px]">{action.icon}</span>
                      {action.label}
                    </Link>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        </div>

        <div className="grid gap-0 xl:grid-cols-[240px_minmax(0,1fr)_360px]">
          <aside className="border-b border-slate-200 p-4 xl:border-b-0 xl:border-r">
            <div className="space-y-2">
              {typeFilters.map((type) => {
                const active = selectedType === type;
                return (
                  <Link
                    key={type}
                    href={hrefWithFilters(type, selectedStatus, query)}
                    className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-black ${
                      active ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-50 hover:text-slate-950"
                    }`}
                  >
                    <span>{getTypeLabel(type, copy)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] tabular-nums ${active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700"}`}>
                      {countByType.get(type) ?? 0}
                    </span>
                  </Link>
                );
              })}
            </div>
            <div className="mt-5 border-t border-slate-200 pt-4">
              <p className="text-xs font-black text-slate-500">{copy.filter}</p>
              <div className="mt-2 flex flex-wrap gap-2 xl:flex-col">
                {statusFilters.map((status) => (
                  <Link
                    key={status}
                    href={hrefWithFilters(selectedType, status, query)}
                    className={`rounded-full px-3 py-1 text-xs font-black ${
                      selectedStatus === status ? "bg-[#002FA7] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {getStatusLabel(status, copy)}
                  </Link>
                ))}
              </div>
            </div>
          </aside>

          <section className="min-w-0 border-b border-slate-200 xl:border-b-0 xl:border-r">
            <div className="border-b border-slate-200 p-4">
              <form className="flex gap-2">
                {selectedType !== "all" ? <input type="hidden" name="type" value={selectedType} /> : null}
                {selectedStatus !== "all" ? <input type="hidden" name="status" value={selectedStatus} /> : null}
                <input
                  name="q"
                  defaultValue={query}
                  placeholder={copy.searchPlaceholder}
                  className="h-11 min-w-0 flex-1 rounded border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-[#002FA7] focus:ring-2 focus:ring-blue-100"
                />
                <button type="submit" className="h-11 rounded bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800">
                  {copy.filter}
                </button>
              </form>
            </div>

            {filteredItems.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <thead className="bg-slate-50 text-xs font-black text-slate-500">
                    <tr>
                      <th className="border-b border-slate-200 px-4 py-3">{copy.tableName}</th>
                      <th className="border-b border-slate-200 px-4 py-3">{copy.tableType}</th>
                      <th className="border-b border-slate-200 px-4 py-3">{copy.tableRelation}</th>
                      <th className="border-b border-slate-200 px-4 py-3">{copy.tableMetric}</th>
                      <th className="border-b border-slate-200 px-4 py-3">{copy.tableUpdated}</th>
                      <th className="border-b border-slate-200 px-4 py-3 text-right">{copy.tableAction}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredItems.map((item) => {
                      const active = selectedItem?.id === item.id;
                      return (
                        <tr key={`${item.type}:${item.id}`} className={active ? "bg-blue-50/60" : "bg-white hover:bg-slate-50"}>
                          <td className="px-4 py-3">
                            <Link href={hrefWithFilters(selectedType, selectedStatus, query, item.id)} className="block">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ${getStatusClass(item.status)}`}>
                                {getStatusLabel(item.status, copy)}
                              </span>
                              <span className="mt-2 block max-w-[260px] truncate font-black text-slate-950">{item.title}</span>
                              <span className="mt-1 block max-w-[260px] truncate text-xs font-semibold text-slate-500">{item.subtitle}</span>
                            </Link>
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-700">{getTypeLabel(item.type, copy)}</td>
                          <td className="max-w-[220px] truncate px-4 py-3 font-semibold text-slate-600">{item.relation}</td>
                          <td className="px-4 py-3">
                            <span className="block text-xs font-black text-slate-500">{item.metricLabel}</span>
                            <span className="mt-1 block font-black text-slate-950">{item.metricValue}</span>
                          </td>
                          <td className="px-4 py-3 font-bold tabular-nums text-slate-700">{item.updatedAt ? formatDate(item.updatedAt, locale) : copy.noDate}</td>
                          <td className="px-4 py-3 text-right">
                            <Link href={item.href} className="inline-flex rounded border border-slate-300 px-3 py-1.5 text-xs font-black text-slate-800 hover:bg-slate-50">
                              {copy.open}
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6">
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-semibold text-slate-600">
                  {copy.empty}
                </div>
              </div>
            )}
          </section>

          <aside className="p-4">
            <h2 className="text-base font-black text-slate-950">{copy.detailTitle}</h2>
            {selectedItem ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 p-4">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ${getStatusClass(selectedItem.status)}`}>
                    {getStatusLabel(selectedItem.status, copy)}
                  </span>
                  <h3 className="mt-3 text-xl font-black leading-7 text-slate-950">{selectedItem.title}</h3>
                  <p className="mt-2 text-sm font-semibold text-slate-600">{selectedItem.subtitle}</p>
                </div>
                <div className="grid gap-px bg-slate-200 text-sm">
                  <div className="bg-white p-4">
                    <p className="text-xs font-black text-slate-500">{copy.tableType}</p>
                    <p className="mt-1 font-black text-slate-950">{getTypeLabel(selectedItem.type, copy)}</p>
                  </div>
                  <div className="bg-white p-4">
                    <p className="text-xs font-black text-slate-500">{copy.tableRelation}</p>
                    <p className="mt-1 font-semibold text-slate-800">{selectedItem.relation}</p>
                  </div>
                  <div className="bg-white p-4">
                    <p className="text-xs font-black text-slate-500">{selectedItem.metricLabel}</p>
                    <p className="mt-1 font-black text-slate-950">{selectedItem.metricValue}</p>
                  </div>
                </div>
                <div className="space-y-2 p-4">
                  <Link href={selectedItem.href} className="flex h-11 items-center justify-center rounded bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800">
                    {selectedItem.type === "case"
                      ? copy.continueWork
                      : selectedItem.type === "party"
                        ? copy.editParty
                        : selectedItem.type === "property"
                          ? copy.openProperty
                          : copy.processMaterial}
                  </Link>
                  {selectedItem.secondaryHref && selectedItem.secondaryLabel ? (
                    <Link href={selectedItem.secondaryHref} className="flex h-11 items-center justify-center rounded border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 hover:bg-slate-50">
                      {selectedItem.secondaryLabel}
                    </Link>
                  ) : null}
                  {selectedItem.type === "case" ? (
                    <Link href={`/cases/${encodeURIComponent(selectedItem.id)}#case-source-intake`} className="flex h-11 items-center justify-center rounded border border-blue-200 bg-blue-50 px-4 text-sm font-black text-[#002FA7] hover:bg-blue-100">
                      {copy.addMaterial}
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-semibold text-slate-600">
                {copy.noSelection}
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
