import Link from "next/link";
import { listBrokerageCases } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  listHubContracts,
  listHubGeneratedOutputs,
  listHubImportJobs,
  listHubParties,
  listHubProperties,
  type HubImportJobItem,
} from "@/lib/hub";
import { getLocale, type Locale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";
import { localizeDemoBrokerageCase } from "@/lib/demo-localization";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams?: Promise<{ q?: string; view?: string; focus?: string }>;
};

type ObjectType = "all" | "case" | "party" | "property" | "input";
type WorkStatus = "needs_action" | "ready" | "unassigned";

type DashboardCopy = {
  title: string;
  subtitle: string;
  tenant: string;
  searchPlaceholder: string;
  search: string;
  clear: string;
  browseByType: string;
  dataMap: string;
  dataMapDesc: string;
  intakeActionTitle: string;
  intakeActionDesc: string;
  outputActionTitle: string;
  outputActionDesc: string;
  linkedSources: string;
  unassignedMaterials: string;
  noLinkedSources: string;
  globalCounts: string;
  objectList: string;
  currentObject: string;
  recentUpdates: string;
  all: string;
  cases: string;
  parties: string;
  properties: string;
  inputMaterials: string;
  outputs: string;
  contracts: string;
  attachments: string;
  serviceRequests: string;
  noResults: string;
  needsAction: string;
  ready: string;
  unassigned: string;
  open: string;
  viewDetails: string;
  continueOrganizing: string;
  addMaterials: string;
  createCase: string;
  viewAll: string;
  updatedAt: string;
  createdAt: string;
  relation: string;
  status: string;
  type: string;
  role: string;
  price: string;
  area: string;
  attachedFiles: string;
  relatedCases: string;
  relatedContracts: string;
  relatedParty: string;
  relatedProperty: string;
  sourceType: string;
  target: string;
  noRelation: string;
  noRecentData: string;
  filteredBy: string;
  activeFilter: string;
  caseNeedsReviewReason: string;
  caseReadyReason: string;
  objectReadyReason: string;
  partyNeedsInfoReason: string;
  propertyNeedsInfoReason: string;
  inputNeedsAssignReason: string;
  inputNeedsReviewReason: string;
  inputReadyReason: string;
  missingPartyReason: string;
  missingPropertyReason: string;
  sourceNeedsReviewReason: string;
};

type WorkObject = {
  key: string;
  id: string;
  type: Exclude<ObjectType, "all">;
  status: WorkStatus;
  title: string;
  subtitle: string;
  relation: string;
  metricLabel: string;
  metricValue: string;
  reason: string;
  updatedAt?: Date;
  href: string;
  actionHref: string;
  actionLabel: string;
  detailRows: Array<{ label: string; value: string }>;
};

type RelationshipSummary = {
  type: Exclude<ObjectType, "all">;
  label: string;
  count: number;
  needsAction: number;
  href: string;
};

const copyByLocale: Record<Locale, DashboardCopy> = {
  ja: {
    title: "資料管理センター",
    subtitle: "案件、顧客、物件、資料のつながりをまとめて確認します。",
    tenant: "対象ワークスペース",
    searchPlaceholder: "顧客、物件、案件、資料、出力書類を検索",
    search: "検索",
    clear: "クリア",
    browseByType: "種類で見る",
    dataMap: "資料マップ",
    dataMapDesc: "案件、顧客、物件、資料ファイルを並べて確認します。",
    intakeActionTitle: "案件を作成・資料を追加",
    intakeActionDesc: "案件、顧客、物件を作成し、必要な資料を追加します。",
    outputActionTitle: "書類を出力",
    outputActionDesc: "案件を選び、テンプレートを確認して出力します。",
    linkedSources: "紐付いた資料",
    unassignedMaterials: "未整理資料",
    noLinkedSources: "まだ紐付いた資料がありません。",
    globalCounts: "全体",
    objectList: "資料索引",
    currentObject: "選択中",
    recentUpdates: "最近の更新",
    all: "すべて",
    cases: "案件",
    parties: "顧客/関係者",
    properties: "物件",
    inputMaterials: "資料ファイル",
    outputs: "出力書類",
    contracts: "契約/提案",
    attachments: "添付",
    serviceRequests: "対応",
    noResults: "表示できる対象がありません。",
    needsAction: "要整理",
    ready: "整理済み",
    unassigned: "未紐付け",
    open: "開く",
    viewDetails: "詳細を見る",
    continueOrganizing: "整理を続ける",
    addMaterials: "資料を追加",
    createCase: "案件を作成",
    viewAll: "すべて表示",
    updatedAt: "更新",
    createdAt: "作成",
    relation: "関連",
    status: "状態",
    type: "種別",
    role: "役割",
    price: "価格",
    area: "エリア",
    attachedFiles: "添付",
    relatedCases: "関連案件",
    relatedContracts: "契約/提案",
    relatedParty: "関係者",
    relatedProperty: "物件",
    sourceType: "資料種別",
    target: "整理先",
    noRelation: "未設定",
    noRecentData: "表示できる履歴はまだありません。",
    filteredBy: "表示",
    activeFilter: "表示中",
    caseNeedsReviewReason: "案件内に確認が必要な情報があります。関係者、物件、費用などを補完してください。",
    caseReadyReason: "案件データは整理済みです。内容確認や資料追加を続けられます。",
    objectReadyReason: "基本情報は整理済みです。必要に応じて内容を確認できます。",
    partyNeedsInfoReason: "関係者情報が不足しています。連絡先や役割を確認してください。",
    propertyNeedsInfoReason: "物件情報が不足しています。案件へ紐付ける前に確認してください。",
    inputNeedsAssignReason: "資料の紐付け先がまだ確定していません。",
    inputNeedsReviewReason: "この資料を対象の案件、関係者、物件へ整理してください。",
    inputReadyReason: "この資料は整理済みです。必要に応じて内容を確認できます。",
    missingPartyReason: "関係者が未設定です。案件で顧客/関係者を確認してください。",
    missingPropertyReason: "物件が未設定です。案件で物件を確認してください。",
    sourceNeedsReviewReason: "紐付いた資料に未整理のものがあります。",
  },
  zh: {
    title: "资料管理中心",
    subtitle: "集中查看客户、物件、案件和资料的归属状态。",
    tenant: "当前工作区",
    searchPlaceholder: "搜索客户、物件、案件、资料、输出文件",
    search: "搜索",
    clear: "清除",
    browseByType: "按类型查看",
    dataMap: "资料地图",
    dataMapDesc: "按案件、客户/关系人、物件和资料文件查看当前状态。",
    intakeActionTitle: "新建案件 / 补充资料",
    intakeActionDesc: "新建案件、客户或物件，也可以补充手头资料。",
    outputActionTitle: "输出文件",
    outputActionDesc: "选择案件和模板，检查后生成申请书或其他文件。",
    linkedSources: "已关联资料",
    unassignedMaterials: "待归属资料",
    noLinkedSources: "还没有关联资料。",
    globalCounts: "全体",
    objectList: "资料索引",
    currentObject: "选中项目",
    recentUpdates: "最近更新",
    all: "全部",
    cases: "案件",
    parties: "客户/关系人",
    properties: "物件",
    inputMaterials: "资料文件",
    outputs: "输出文件",
    contracts: "合同/提案",
    attachments: "附件",
    serviceRequests: "处理事项",
    noResults: "没有符合条件的项目。",
    needsAction: "待整理",
    ready: "已整理",
    unassigned: "待分配",
    open: "打开",
    viewDetails: "查看详情",
    continueOrganizing: "继续整理",
    addMaterials: "补充资料",
    createCase: "新建案件",
    viewAll: "查看全部",
    updatedAt: "更新",
    createdAt: "创建",
    relation: "关联",
    status: "状态",
    type: "类型",
    role: "角色",
    price: "价格",
    area: "位置",
    attachedFiles: "附件",
    relatedCases: "关联案件",
    relatedContracts: "合同/提案",
    relatedParty: "客户/关系人",
    relatedProperty: "物件",
    sourceType: "资料类型",
    target: "整理到",
    noRelation: "未设置",
    noRecentData: "暂无可显示记录。",
    filteredBy: "当前显示",
    activeFilter: "当前显示",
    caseNeedsReviewReason: "案件里仍有资料待确认，需要继续补全人员、物件或费用信息。",
    caseReadyReason: "案件资料已经整理，可继续查看、补充或关联其他资料。",
    objectReadyReason: "基础信息已经整理，可按需打开查看。",
    partyNeedsInfoReason: "关系人信息还不完整，请先确认角色或联系资料。",
    propertyNeedsInfoReason: "物件信息还不完整，请先补齐后再关联案件。",
    inputNeedsAssignReason: "这份资料还没有确认归属，需要先分配到案件、客户或物件。",
    inputNeedsReviewReason: "这份资料还需要归入案件、客户或物件。",
    inputReadyReason: "这份资料已经整理，可按需打开查看。",
    missingPartyReason: "客户/关系人未设置，请回到案件中确认。",
    missingPropertyReason: "物件未设置，请回到案件中确认。",
    sourceNeedsReviewReason: "已关联资料中仍有未整理内容。",
  },
  ko: {
    title: "자료 관리 센터",
    subtitle: "고객, 매물, 안건, 자료의 연결 상태를 한곳에서 확인합니다.",
    tenant: "현재 워크스페이스",
    searchPlaceholder: "고객, 매물, 안건, 자료, 출력 문서 검색",
    search: "검색",
    clear: "지우기",
    browseByType: "유형별 보기",
    dataMap: "자료 지도",
    dataMapDesc: "안건, 고객/관계자, 매물, 자료 파일의 상태를 함께 확인합니다.",
    intakeActionTitle: "안건 생성 / 자료 추가",
    intakeActionDesc: "안건, 고객, 매물을 만들고 필요한 자료를 추가합니다.",
    outputActionTitle: "문서 출력",
    outputActionDesc: "안건과 템플릿을 선택한 뒤 문서를 생성합니다.",
    linkedSources: "연결된 자료",
    unassignedMaterials: "미분류 자료",
    noLinkedSources: "아직 연결된 자료가 없습니다.",
    globalCounts: "전체",
    objectList: "자료 색인",
    currentObject: "선택 항목",
    recentUpdates: "최근 업데이트",
    all: "전체",
    cases: "안건",
    parties: "관계자",
    properties: "매물",
    inputMaterials: "자료 파일",
    outputs: "출력 문서",
    contracts: "계약/제안",
    attachments: "첨부",
    serviceRequests: "처리",
    noResults: "표시할 대상이 없습니다.",
    needsAction: "정리 필요",
    ready: "정리됨",
    unassigned: "미연결",
    open: "열기",
    viewDetails: "자세히 보기",
    continueOrganizing: "정리 계속",
    addMaterials: "자료 추가",
    createCase: "안건 생성",
    viewAll: "전체 보기",
    updatedAt: "업데이트",
    createdAt: "생성",
    relation: "연결",
    status: "상태",
    type: "유형",
    role: "역할",
    price: "가격",
    area: "지역",
    attachedFiles: "첨부",
    relatedCases: "관련 안건",
    relatedContracts: "계약/제안",
    relatedParty: "관계자",
    relatedProperty: "매물",
    sourceType: "자료 유형",
    target: "정리 위치",
    noRelation: "미설정",
    noRecentData: "표시할 이력이 아직 없습니다.",
    filteredBy: "표시",
    activeFilter: "표시 중",
    caseNeedsReviewReason: "안건 안에 확인할 정보가 남아 있습니다. 관계자, 매물, 비용 정보를 보완하세요.",
    caseReadyReason: "안건 자료가 정리되었습니다. 확인하거나 자료 추가를 계속할 수 있습니다.",
    objectReadyReason: "기본 정보가 정리되었습니다. 필요하면 열어 확인할 수 있습니다.",
    partyNeedsInfoReason: "관계자 정보가 부족합니다. 역할이나 연락처를 확인하세요.",
    propertyNeedsInfoReason: "매물 정보가 부족합니다. 안건에 연결하기 전에 확인하세요.",
    inputNeedsAssignReason: "이 자료의 연결 대상이 아직 확정되지 않았습니다.",
    inputNeedsReviewReason: "이 자료를 안건, 관계자, 매물 중 알맞은 대상으로 정리하세요.",
    inputReadyReason: "이 자료는 정리되었습니다. 필요하면 열어 확인할 수 있습니다.",
    missingPartyReason: "관계자가 설정되지 않았습니다. 안건에서 관계자를 확인하세요.",
    missingPropertyReason: "매물이 설정되지 않았습니다. 안건에서 매물을 확인하세요.",
    sourceNeedsReviewReason: "연결된 자료 중 아직 정리할 항목이 있습니다.",
  },
};

function isObjectType(value: string | undefined): value is ObjectType {
  return value === "all" || value === "case" || value === "party" || value === "property" || value === "input";
}

function getTypeLabel(type: ObjectType, copy: DashboardCopy) {
  if (type === "case") return copy.cases;
  if (type === "party") return copy.parties;
  if (type === "property") return copy.properties;
  if (type === "input") return copy.inputMaterials;
  return copy.all;
}

function getStatusLabel(status: WorkStatus, copy: DashboardCopy) {
  if (status === "ready") return copy.ready;
  if (status === "unassigned") return copy.unassigned;
  return copy.needsAction;
}

function getStatusClass(status: WorkStatus) {
  if (status === "ready") return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100";
  if (status === "unassigned") return "bg-amber-50 text-amber-800 ring-1 ring-amber-100";
  return "bg-rose-50 text-rose-700 ring-1 ring-rose-100";
}

function getWorkReason(type: Exclude<ObjectType, "all">, status: WorkStatus, copy: DashboardCopy) {
  if (type === "case") return status === "ready" ? copy.caseReadyReason : copy.caseNeedsReviewReason;
  if (type === "party") return status === "ready" ? copy.objectReadyReason : copy.partyNeedsInfoReason;
  if (type === "property") return status === "ready" ? copy.objectReadyReason : copy.propertyNeedsInfoReason;
  if (status === "unassigned") return copy.inputNeedsAssignReason;
  return status === "ready" ? copy.inputReadyReason : copy.inputNeedsReviewReason;
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

function getImportTargetLabel(target: HubImportJobItem["targetEntity"], copy: DashboardCopy) {
  if (target === "properties") return copy.properties;
  if (target === "parties") return copy.parties;
  if (target === "contracts") return copy.contracts;
  return copy.serviceRequests;
}

function isInputFileExtractionJob(job: HubImportJobItem) {
  if (!job.notes) return false;
  try {
    const payload = JSON.parse(job.notes) as { kind?: string };
    return payload.kind === "input_file_extraction";
  } catch {
    return false;
  }
}

function getImportJobHref(job: HubImportJobItem) {
  const encodedId = encodeURIComponent(job.id);
  if (isInputFileExtractionJob(job)) return `/import-center?xlsxJob=${encodedId}#source-upload`;
  return `/import-center?job=${encodedId}&advanced=1#job-mapping`;
}

function formatLinkedSourceCount(locale: Locale, count: number) {
  if (locale === "zh") return `${count}份`;
  if (locale === "ko") return `${count}개`;
  return `${count}件`;
}

function includesQuery(query: string, ...values: Array<string | undefined>) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => value?.toLowerCase().includes(normalized));
}

function homeHref(input: { view?: ObjectType; focus?: string; q?: string; hash?: string }) {
  const params = new URLSearchParams();
  if (input.view && input.view !== "all") params.set("view", input.view);
  if (input.focus) params.set("focus", input.focus);
  if (input.q) params.set("q", input.q);
  const search = params.toString();
  const path = search ? `/?${search}` : "/";
  return input.hash ? `${path}#${input.hash}` : path;
}

const workStatusRank = { needs_action: 0, unassigned: 1, ready: 2 } satisfies Record<WorkStatus, number>;

function compareWorkObjects(a: WorkObject, b: WorkObject) {
  const rank = workStatusRank[a.status] - workStatusRank[b.status];
  if (rank !== 0) return rank;
  const dateRank = (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0);
  if (dateRank !== 0) return dateRank;
  return a.title.localeCompare(b.title);
}

function sortWorkObjects(items: WorkObject[]) {
  return [...items].sort(compareWorkObjects);
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = searchParams ? await searchParams : undefined;
  const searchQuery = params?.q?.trim() ?? "";
  const activeView = isObjectType(params?.view) ? params.view : "all";
  const activeFocus = params?.focus;
  const [locale, session] = await Promise.all([getLocale(), requireTenantSession({ permission: "tenant.read" })]);
  const copy = copyByLocale[locale];
  const user = session.user;
  const tenantId = session.tenant.id;
  const hubContext = { userId: user.id, tenantId };

  const [
    rawCases,
    importJobs,
    properties,
    parties,
    contracts,
    generatedOutputs,
  ] = await Promise.all([
    listBrokerageCases(user.id, 50, tenantId),
    listHubImportJobs(hubContext, locale),
    listHubProperties(locale, hubContext),
    listHubParties(locale, hubContext),
    listHubContracts(locale, hubContext),
    listHubGeneratedOutputs(locale, hubContext),
  ]);
  const cases = rawCases.map((item) => localizeDemoBrokerageCase(locale, item));

  const caseCountByPropertyId = cases.reduce((map, item) => {
    if (!item.primaryPropertyId) return map;
    map.set(item.primaryPropertyId, (map.get(item.primaryPropertyId) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
  const propertyNameById = new Map(properties.map((item) => [item.id, item.name]));
  const contractCountByPartyId = contracts.reduce((map, item) => {
    map.set(item.clientId, (map.get(item.clientId) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  const caseObjects: WorkObject[] = cases.map((item) => {
    const sourceCount = item.sourceImportJobIds.length;
    const linkedSourceCount = formatLinkedSourceCount(locale, sourceCount);
    const status: WorkStatus = item.status === "reviewed" ? "ready" : "needs_action";
    const propertyName = item.primaryPropertyId ? propertyNameById.get(item.primaryPropertyId) : undefined;
    return {
      key: `case:${item.id}`,
      id: item.id,
      type: "case",
      status,
      title: item.caseTitle,
      subtitle: `${copy.linkedSources} ${linkedSourceCount}`,
      relation: propertyName ? `${copy.relatedProperty}: ${propertyName}` : copy.noRelation,
      metricLabel: copy.linkedSources,
      metricValue: linkedSourceCount,
      reason: getWorkReason("case", status, copy),
      updatedAt: item.updatedAt,
      href: `/cases/${item.id}`,
      actionHref: `/cases/${item.id}`,
      actionLabel: copy.continueOrganizing,
      detailRows: [
        { label: copy.status, value: getStatusLabel(status, copy) },
        { label: copy.linkedSources, value: linkedSourceCount },
        { label: copy.relatedProperty, value: propertyName || copy.noRelation },
        { label: copy.updatedAt, value: formatDate(item.updatedAt, locale) },
      ],
    };
  });

  const partyObjects: WorkObject[] = parties.map((item) => {
    const contractCount = contractCountByPartyId.get(item.id) ?? item.contractCount;
    const hasContact = Boolean(item.phone || item.email);
    const status: WorkStatus = hasContact ? "ready" : "needs_action";
    return {
      key: `party:${item.id}`,
      id: item.id,
      type: "party",
      status,
      title: item.name,
      subtitle: item.roles.join(" / ") || (item.partyType === "corporate" ? "法人" : "个人"),
      relation: item.relatedPropertyHint || copy.noRelation,
      metricLabel: copy.relatedContracts,
      metricValue: String(contractCount),
      reason: getWorkReason("party", status, copy),
      updatedAt: undefined,
      href: `/parties?focus=${encodeURIComponent(item.id)}`,
      actionHref: `/parties?focus=${encodeURIComponent(item.id)}`,
      actionLabel: copy.viewDetails,
      detailRows: [
        { label: copy.type, value: item.partyType === "corporate" ? "法人" : "个人" },
        { label: copy.role, value: item.roles.join(" / ") || copy.noRelation },
        { label: copy.relatedProperty, value: item.relatedPropertyHint || copy.noRelation },
        { label: copy.relatedContracts, value: String(contractCount) },
      ],
    };
  });

  const propertyObjects: WorkObject[] = properties.map((item) => {
    const relatedCaseCount = caseCountByPropertyId.get(item.id) ?? 0;
    const status: WorkStatus = item.name ? "ready" : "needs_action";
    return {
      key: `property:${item.id}`,
      id: item.id,
      type: "property",
      status,
      title: item.name,
      subtitle: item.area,
      relation: relatedCaseCount > 0 ? `${relatedCaseCount} ${copy.relatedCases}` : copy.noRelation,
      metricLabel: copy.price,
      metricValue: formatCurrency(item.listingPrice, locale),
      reason: getWorkReason("property", status, copy),
      updatedAt: undefined,
      href: `/properties?focus=${encodeURIComponent(item.id)}`,
      actionHref: `/properties?focus=${encodeURIComponent(item.id)}`,
      actionLabel: copy.viewDetails,
      detailRows: [
        { label: copy.area, value: item.area || copy.noRelation },
        { label: copy.price, value: formatCurrency(item.listingPrice, locale) },
        { label: copy.attachedFiles, value: String(item.attachmentCount) },
        { label: copy.relatedCases, value: String(relatedCaseCount) },
      ],
    };
  });

  const inputObjects: WorkObject[] = importJobs.map((item) => {
    const status: WorkStatus = item.status === "completed" ? "ready" : item.status === "queued" ? "unassigned" : "needs_action";
    const targetLabel = getImportTargetLabel(item.targetEntity, copy);
    const href = getImportJobHref(item);
    return {
      key: `input:${item.id}`,
      id: item.id,
      type: "input",
      status,
      title: item.title,
      subtitle: getSourceTypeLabel(locale, item.sourceType),
      relation: targetLabel,
      metricLabel: copy.target,
      metricValue: targetLabel,
      reason: getWorkReason("input", status, copy),
      updatedAt: item.createdAt,
      href,
      actionHref: href,
      actionLabel: copy.continueOrganizing,
      detailRows: [
        { label: copy.status, value: getStatusLabel(status, copy) },
        { label: copy.sourceType, value: getSourceTypeLabel(locale, item.sourceType) },
        { label: copy.target, value: targetLabel },
        { label: copy.createdAt, value: formatDate(item.createdAt, locale) },
      ],
    };
  });

  const allObjects = sortWorkObjects([...caseObjects, ...partyObjects, ...propertyObjects, ...inputObjects]);
  const objectMatchesSearch = (item: WorkObject) =>
    includesQuery(searchQuery, item.title, item.subtitle, item.relation, item.metricValue);

  const visibleObjects = allObjects.filter((item) => {
    const viewMatches = activeView === "all" || item.type === activeView;
    return viewMatches && objectMatchesSearch(item);
  });

  const focusedObject =
    (activeFocus ? allObjects.find((item) => item.key === activeFocus) : undefined) ??
    visibleObjects.find((item) => item.status !== "ready") ??
    visibleObjects[0] ??
    allObjects[0];

  const caseLaneObjects = sortWorkObjects(caseObjects.filter(objectMatchesSearch));
  const partyLaneObjects = sortWorkObjects(partyObjects.filter(objectMatchesSearch));
  const propertyLaneObjects = sortWorkObjects(propertyObjects.filter(objectMatchesSearch));
  const inputLaneObjects = sortWorkObjects(inputObjects.filter(objectMatchesSearch));

  const relationshipSummaries: RelationshipSummary[] = [
    {
      type: "case",
      label: copy.cases,
      count: caseLaneObjects.length,
      needsAction: caseLaneObjects.filter((item) => item.status !== "ready").length,
      href: homeHref({ view: "case", q: searchQuery, hash: "object-list" }),
    },
    {
      type: "party",
      label: copy.parties,
      count: partyLaneObjects.length,
      needsAction: partyLaneObjects.filter((item) => item.status !== "ready").length,
      href: homeHref({ view: "party", q: searchQuery, hash: "object-list" }),
    },
    {
      type: "property",
      label: copy.properties,
      count: propertyLaneObjects.length,
      needsAction: propertyLaneObjects.filter((item) => item.status !== "ready").length,
      href: homeHref({ view: "property", q: searchQuery, hash: "object-list" }),
    },
    {
      type: "input",
      label: copy.inputMaterials,
      count: inputLaneObjects.length,
      needsAction: inputLaneObjects.filter((item) => item.status !== "ready").length,
      href: homeHref({ view: "input", q: searchQuery, hash: "object-list" }),
    },
  ];

  const mapLanes = [
    { summary: relationshipSummaries[0], items: caseLaneObjects.slice(0, 3) },
    { summary: relationshipSummaries[1], items: partyLaneObjects.slice(0, 3) },
    { summary: relationshipSummaries[2], items: propertyLaneObjects.slice(0, 3) },
    { summary: relationshipSummaries[3], items: inputLaneObjects.slice(0, 3) },
  ];

  const pendingObjects = allObjects.filter((item) => item.status !== "ready");
  const visibleRows = visibleObjects.slice(0, 12);
  const recentUpdates = [
    ...importJobs.slice(0, 4).map((item) => ({
      key: `input:${item.id}`,
      label: copy.inputMaterials,
      title: item.title,
      subtitle: getImportTargetLabel(item.targetEntity, copy),
      meta: `${formatDate(item.createdAt, locale)} / ${getSourceTypeLabel(locale, item.sourceType)}`,
      href: getImportJobHref(item),
      date: item.createdAt,
      status: (item.status === "completed" ? "ready" : item.status === "queued" ? "unassigned" : "needs_action") as WorkStatus,
    })),
    ...generatedOutputs.slice(0, 4).map((item) => ({
      key: `output:${item.id}`,
      label: copy.outputs,
      title: item.title,
      subtitle: [item.relatedParty, item.relatedProperty].filter(Boolean).join(" / ") || copy.noRelation,
      meta: `${formatDate(item.generatedAt, locale)} / ${item.outputFormat.toUpperCase()}`,
      href: item.sourceQuoteId ? `/output-center?quoteId=${encodeURIComponent(item.sourceQuoteId)}` : "/output-center",
      date: item.generatedAt,
      status: "ready" as WorkStatus,
    })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-[1360px] space-y-7">
      <header className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="grid gap-px bg-slate-200 lg:grid-cols-[minmax(360px,1.05fr)_minmax(360px,0.95fr)]">
          <div className="bg-white px-6 py-7 sm:px-8">
            <p className="text-xs font-black text-[#002FA7]">
              {copy.tenant}: {session.tenant.name}
            </p>
            <h1 className="mt-2 text-2xl font-black leading-tight tracking-normal text-slate-950 sm:text-3xl">
              {copy.title}
            </h1>
            <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-600">{copy.subtitle}</p>

            <form action="/" className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="sr-only" htmlFor="dashboard-search">
                {copy.search}
              </label>
              <input
                id="dashboard-search"
                name="q"
                defaultValue={searchQuery}
                placeholder={copy.searchPlaceholder}
                className="h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-[#002FA7] focus:ring-2 focus:ring-blue-100"
              />
              <button
                className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 hover:border-[#002FA7] hover:text-[#002FA7]"
                type="submit"
              >
                {copy.search}
              </button>
              {searchQuery ? (
                <Link
                  href={homeHref({ view: activeView })}
                  className="flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 sm:col-span-2"
                >
                  {copy.clear}
                </Link>
              ) : null}
            </form>
          </div>

          <div className="grid gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Link href="/import-center" className="group flex min-h-44 flex-col justify-between bg-white p-6 hover:bg-blue-50/40">
              <div>
                <div className="flex justify-end">
                  <span aria-hidden="true" className="material-symbols-outlined text-[22px] text-[#002FA7]">
                    add_box
                  </span>
                </div>
                <h2 className="mt-4 text-2xl font-black leading-tight text-slate-950">{copy.intakeActionTitle}</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{copy.intakeActionDesc}</p>
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                <span className="text-sm font-black text-slate-950 group-hover:text-[#002FA7]">{copy.open}</span>
                <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-black text-rose-700 ring-1 ring-rose-100">
                  {pendingObjects.length} {copy.needsAction}
                </span>
              </div>
            </Link>

            <Link href="/output-center" className="group flex min-h-44 flex-col justify-between bg-white p-6 hover:bg-blue-50/40">
              <div>
                <div className="flex justify-end">
                  <span aria-hidden="true" className="material-symbols-outlined text-[22px] text-[#002FA7]">
                    description
                  </span>
                </div>
                <h2 className="mt-4 text-2xl font-black leading-tight text-slate-950">{copy.outputActionTitle}</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{copy.outputActionDesc}</p>
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                <span className="text-sm font-black text-slate-950 group-hover:text-[#002FA7]">{copy.open}</span>
                <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-slate-400 group-hover:text-[#002FA7]">
                  arrow_forward
                </span>
              </div>
            </Link>
          </div>
        </div>
      </header>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-950">{copy.dataMap}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">{copy.dataMapDesc}</p>
          </div>
          <Link href={homeHref({ hash: "object-list" })} className="text-xs font-black text-slate-500 hover:text-[#002FA7]">
            {copy.viewAll}
          </Link>
        </div>

        <div className="grid gap-px bg-slate-200 lg:grid-cols-4">
          {mapLanes.map(({ summary, items }, index) => {
              const selected = activeView === summary.type;
              return (
                <div
                  key={summary.type}
                  className={`bg-white p-4 ${selected ? "ring-2 ring-inset ring-[#002FA7]" : ""}`}
                >
                  <Link href={summary.href} aria-current={selected ? "page" : undefined} className="group block">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-black text-slate-400">{String(index + 1).padStart(2, "0")}</p>
                        <h3 className="mt-1 text-lg font-black text-slate-950 group-hover:text-[#002FA7]">{summary.label}</h3>
                        <p className="mt-1 text-xs font-black text-rose-600">
                          {summary.needsAction} {copy.needsAction}
                        </p>
                      </div>
                      <p className={`text-4xl font-black leading-none tabular-nums ${selected ? "text-[#002FA7]" : "text-slate-950"}`}>
                        {summary.count}
                      </p>
                    </div>
                  </Link>
                  <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
                    {items.length > 0 ? (
                      items.map((item) => (
                        <Link key={item.key} href={homeHref({ view: summary.type, focus: item.key, q: searchQuery, hash: "object-list" })} className="group grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md px-2 py-2 hover:bg-blue-50/50">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-black text-slate-900 group-hover:text-[#002FA7]">{item.title}</p>
                            <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{item.relation}</p>
                          </div>
                          <span className={`self-start rounded-full px-2 py-0.5 text-[11px] font-black ${getStatusClass(item.status)}`}>
                            {getStatusLabel(item.status, copy)}
                          </span>
                        </Link>
                      ))
                    ) : (
                      <p className="rounded-md bg-slate-50 px-2 py-3 text-xs font-semibold text-slate-500">{copy.noResults}</p>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </section>

      <section id="object-list" className="grid scroll-mt-24 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-black text-slate-950">{copy.objectList}</h2>
                {activeView !== "all" ? (
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-[#002FA7] ring-1 ring-blue-100">
                    {getTypeLabel(activeView, copy)}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {copy.filteredBy}: {getTypeLabel(activeView, copy)} / {visibleObjects.length}
              </p>
            </div>
            {activeView !== "all" || searchQuery ? (
              <Link
                href={homeHref({ hash: "object-list" })}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
              >
                {copy.clear}
              </Link>
            ) : null}
          </div>
          <div className="divide-y divide-slate-100">
            {visibleRows.length > 0 ? (
              visibleRows.map((item) => {
                const selected = focusedObject?.key === item.key;
                return (
                  <Link
                    key={item.key}
                    href={homeHref({ view: activeView, focus: item.key, q: searchQuery, hash: "object-list" })}
                    className={`grid gap-3 px-5 py-4 hover:bg-slate-50 md:grid-cols-[8rem_minmax(0,1.2fr)_minmax(0,1fr)_8rem] md:items-center ${
                      selected ? "bg-blue-50/60" : "bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${getStatusClass(item.status)}`}>
                        {getStatusLabel(item.status, copy)}
                      </span>
                      <span className="text-xs font-bold text-slate-500">{getTypeLabel(item.type, copy)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{item.title}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-500">{item.subtitle}</p>
                    </div>
                    <p className="min-w-0 truncate text-xs font-semibold text-slate-600">{item.relation}</p>
                    <div className="text-left md:text-right">
                      <p className="text-xs font-bold text-slate-500">{item.metricLabel}</p>
                      <p className="truncate text-sm font-black text-slate-950">{item.metricValue}</p>
                    </div>
                  </Link>
                );
              })
            ) : (
              <p className="px-5 py-10 text-sm font-semibold text-slate-500">{copy.noResults}</p>
            )}
          </div>
        </section>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <section className="border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-black text-slate-950">{copy.currentObject}</h2>
            </div>
            {focusedObject ? (
              <div className="space-y-5 p-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-black ${getStatusClass(focusedObject.status)}`}>
                      {getStatusLabel(focusedObject.status, copy)}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">
                      {getTypeLabel(focusedObject.type, copy)}
                    </span>
                  </div>
                  <h3 className="mt-4 text-xl font-black leading-tight text-slate-950">{focusedObject.title}</h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{focusedObject.relation}</p>
                </div>
                <div className="border-l-4 border-[#002FA7] bg-blue-50/70 px-4 py-3">
                  <p className="text-xs font-black text-[#002FA7]">{copy.status}</p>
                  <p className="mt-1 text-sm font-black leading-6 text-slate-950">{focusedObject.reason}</p>
                </div>
                <div className="grid gap-2">
                  <Link
                    href={focusedObject.actionHref}
                    className="flex h-11 items-center justify-center rounded-md border border-slate-950 bg-slate-950 px-3 text-sm font-black text-white hover:bg-slate-800"
                  >
                    {focusedObject.actionLabel}
                  </Link>
                  <Link
                    href={focusedObject.href}
                    className="flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-black text-slate-800 hover:bg-slate-50"
                  >
                    {copy.open}
                  </Link>
                </div>
                <dl className="divide-y divide-slate-100 border-y border-slate-200">
                  {focusedObject.detailRows
                    .filter((row) => row.label !== copy.status)
                    .slice(0, 3)
                    .map((row) => (
                      <div key={row.label} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3">
                        <dt className="text-xs font-black text-slate-500">{row.label}</dt>
                        <dd className="min-w-0 break-words text-sm font-black text-slate-950">{row.value}</dd>
                      </div>
                    ))}
                </dl>
              </div>
            ) : (
              <p className="p-5 text-sm font-semibold text-slate-500">{copy.noResults}</p>
            )}
          </section>

          <section className="hidden border border-slate-200 bg-white xl:block">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-black text-slate-950">{copy.recentUpdates}</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {recentUpdates.length > 0 ? (
                recentUpdates.slice(0, 4).map((item) => (
                  <Link key={item.key} href={item.href} className="block px-5 py-4 hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-black text-[#002FA7]">
                        {item.label}
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ${getStatusClass(item.status)}`}>
                        {getStatusLabel(item.status, copy)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-black leading-5 text-slate-950">{item.title}</p>
                    <p className="mt-1 line-clamp-1 text-xs font-semibold text-slate-500">{item.subtitle}</p>
                    <p className="mt-2 text-xs font-bold text-slate-500">{item.meta}</p>
                  </Link>
                ))
              ) : (
                <p className="p-5 text-sm font-semibold text-slate-500">{copy.noRecentData}</p>
              )}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
