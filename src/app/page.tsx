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
  searchParams?: Promise<{ q?: string }>;
};

type ObjectType = "case" | "party" | "property" | "input";
type WorkStatus = "needs_action" | "ready" | "unassigned";

type DashboardCopy = {
  title: string;
  subtitle: string;
  startHere: string;
  startHereDesc: string;
  tenant: string;
  searchPlaceholder: string;
  search: string;
  clear: string;
  createActionTitle: string;
  createActionDesc: string;
  readActionTitle: string;
  readActionDesc: string;
  organizeActionTitle: string;
  organizeActionDesc: string;
  actionStatusEyebrow: string;
  actionStatusTitle: string;
  actionStatusDesc: string;
  searchResultsTitle: string;
  overviewTitle: string;
  overviewDesc: string;
  noActionItems: string;
  goToOrganizeCenter: string;
  totalItems: string;
  browseByType: string;
  dataMap: string;
  dataMapDesc: string;
  intakeActionTitle: string;
  intakeActionDesc: string;
  outputActionTitle: string;
  outputActionDesc: string;
  assistantTitle: string;
  assistantDesc: string;
  assistantTrigger: string;
  assistantTopItem: string;
  assistantOtherItems: string;
  assistantNoItems: string;
  assistantAllClear: string;
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
  priorityScore: number;
  detailRows: Array<{ label: string; value: string }>;
};

const copyByLocale: Record<Locale, DashboardCopy> = {
  ja: {
    title: "ホーム",
    subtitle: "次に進む場所を選び、細かい作業は各ページで行います。",
    startHere: "何をしましょうか？",
    startHereDesc: "ここから仕事に入ります。",
    tenant: "対象ワークスペース",
    searchPlaceholder: "顧客、物件、案件、資料、出力書類を検索",
    search: "検索",
    clear: "クリア",
    createActionTitle: "新規案件を作成しましょう",
    createActionDesc: "資料がなくても、先に案件・顧客・物件を作れます。",
    readActionTitle: "資料を読み込みましょう",
    readActionDesc: "Excel、在留カード、免許証などを読み取ります。",
    organizeActionTitle: "未入力情報を補足しましょう",
    organizeActionDesc: "未入力や確認待ちの項目だけを続けて整理します。",
    actionStatusEyebrow: "優先処理",
    actionStatusTitle: "今すぐ確認するもの",
    actionStatusDesc: "確認や補足が必要な対象だけを表示します。",
    searchResultsTitle: "検索結果",
    overviewTitle: "全体の残り",
    overviewDesc: "全体の確認は情報整理で行います。",
    noActionItems: "今すぐ整理が必要な対象はありません。",
    goToOrganizeCenter: "情報整理を開く",
    totalItems: "合計",
    browseByType: "種類で見る",
    dataMap: "情報表示",
    dataMapDesc: "対象ごとの件数と未処理数を確認します。",
    intakeActionTitle: "情報入力",
    intakeActionDesc: "案件、顧客、物件を作成し、手元の資料を読み取ります。",
    outputActionTitle: "文書出力",
    outputActionDesc: "案件を選び、テンプレートを確認して出力します。",
    assistantTitle: "資料アシスト",
    assistantDesc: "必要な確認だけをまとめています。",
    assistantTrigger: "資料アシスト",
    assistantTopItem: "最初に見るもの",
    assistantOtherItems: "次に見るもの",
    assistantNoItems: "今すぐ確認するものはありません。",
    assistantAllClear: "確認待ちはありません",
    linkedSources: "紐付いた資料",
    unassignedMaterials: "未整理資料",
    noLinkedSources: "まだ紐付いた資料がありません。",
    globalCounts: "全体",
    objectList: "資料一覧",
    currentObject: "次の処理",
    recentUpdates: "処理履歴",
    all: "すべて",
    cases: "案件",
    parties: "顧客",
    properties: "物件",
    inputMaterials: "資料ファイル",
    outputs: "出力文書",
    contracts: "契約/提案",
    attachments: "添付",
    serviceRequests: "対応",
    noResults: "表示できる対象がありません。",
    needsAction: "資料不足",
    ready: "完了",
    unassigned: "未確認",
    open: "開く",
    viewDetails: "詳細を見る",
    continueOrganizing: "次へ",
    addMaterials: "資料追加",
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
    caseReadyReason: "入力済みです。内容確認や資料追加を続けられます。",
    objectReadyReason: "入力済みです。必要に応じて内容を確認できます。",
    partyNeedsInfoReason: "関係者情報が不足しています。連絡先や役割を確認してください。",
    propertyNeedsInfoReason: "物件情報が不足しています。案件へ紐付ける前に確認してください。",
    inputNeedsAssignReason: "資料の紐付け先がまだ確定していません。",
    inputNeedsReviewReason: "この資料を対象の案件、関係者、物件へ整理してください。",
    inputReadyReason: "この資料は入力済みです。必要に応じて内容を確認できます。",
    missingPartyReason: "顧客が未設定です。案件で顧客情報を確認してください。",
    missingPropertyReason: "物件が未設定です。案件で物件を確認してください。",
    sourceNeedsReviewReason: "紐付いた資料に未整理のものがあります。",
  },
  zh: {
    title: "工作台",
    subtitle: "只负责判断下一步去哪里，具体处理交给对应页面。",
    startHere: "现在要做哪一步",
    startHereDesc: "选择接下来要处理的事项：录入资料、补齐信息或输出文件。",
    tenant: "当前工作区",
    searchPlaceholder: "搜索客户、物件、案件、资料、输出文件",
    search: "搜索",
    clear: "清除",
    createActionTitle: "新建案件",
    createActionDesc: "没有文件也可以先建案件、客户或物件。",
    readActionTitle: "读取资料",
    readActionDesc: "读取 Excel、在留卡、驾照或图片资料。",
    organizeActionTitle: "补齐信息",
    organizeActionDesc: "只处理未填写、待确认和不一致的项目。",
    actionStatusEyebrow: "优先处理",
    actionStatusTitle: "下一批要处理",
    actionStatusDesc: "这里只显示需要确认或补全的对象。查找全部资料，请进入整理信息。",
    searchResultsTitle: "搜索结果",
    overviewTitle: "整体剩余",
    overviewDesc: "详细检索、筛选和按对象查看，统一放在整理信息里。",
    noActionItems: "当前没有马上需要处理的对象。",
    goToOrganizeCenter: "进入整理信息",
    totalItems: "合计",
    browseByType: "查看全部",
    dataMap: "整理概况",
    dataMapDesc: "只显示各类数量和待处理数量。",
    intakeActionTitle: "录入资料",
    intakeActionDesc: "新建案件、客户或物件；已有文件也从这里读取。",
    outputActionTitle: "输出文件",
    outputActionDesc: "选择案件和模板，检查后生成申请书或其他文件。",
    assistantTitle: "资料助手",
    assistantDesc: "只收起需要确认的事项，首页保持干净。",
    assistantTrigger: "资料助手",
    assistantTopItem: "最先处理",
    assistantOtherItems: "后续处理",
    assistantNoItems: "当前没有马上需要确认的事项。",
    assistantAllClear: "没有待确认事项",
    linkedSources: "已关联资料",
    unassignedMaterials: "待归属资料",
    noLinkedSources: "还没有关联资料。",
    globalCounts: "全体",
    objectList: "资料索引",
    currentObject: "选中项目",
    recentUpdates: "处理记录",
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
    needsAction: "资料不足",
    ready: "已完成",
    unassigned: "未确认",
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
    title: "작업대",
    subtitle: "다음에 갈 곳을 고르고, 세부 작업은 각 페이지에서 진행합니다.",
    startHere: "지금 무엇을 할까요",
    startHereDesc: "여기는 분기만 담당합니다. 자료 입력, 정보 정리, 문서 출력 중 어디로 갈지 선택하세요.",
    tenant: "현재 워크스페이스",
    searchPlaceholder: "고객, 매물, 안건, 자료, 출력 문서 검색",
    search: "검색",
    clear: "지우기",
    createActionTitle: "안건 만들기",
    createActionDesc: "파일이 없어도 안건, 고객, 매물을 먼저 만들 수 있습니다.",
    readActionTitle: "자료 읽기",
    readActionDesc: "Excel, 재류카드, 운전면허증, 이미지 자료를 읽습니다.",
    organizeActionTitle: "부족 정보 입력",
    organizeActionDesc: "미입력, 확인 대기, 불일치 항목만 이어서 정리합니다.",
    actionStatusEyebrow: "우선 처리",
    actionStatusTitle: "다음에 처리할 대상",
    actionStatusDesc: "확인 또는 보완이 필요한 대상만 표시합니다. 전체 확인은 정보 정리에서 합니다.",
    searchResultsTitle: "검색 결과",
    overviewTitle: "전체 남은 일",
    overviewDesc: "상세 검색, 필터, 대상별 확인은 정보 정리에서 합니다.",
    noActionItems: "지금 바로 정리할 대상이 없습니다.",
    goToOrganizeCenter: "정보 정리 열기",
    totalItems: "합계",
    browseByType: "유형별 보기",
    dataMap: "정리 현황",
    dataMapDesc: "대상별 수와 미처리 수만 확인합니다.",
    intakeActionTitle: "자료 입력",
    intakeActionDesc: "안건, 고객, 매물을 만들고 가지고 있는 자료를 읽습니다.",
    outputActionTitle: "문서 출력",
    outputActionDesc: "안건과 템플릿을 선택한 뒤 문서를 생성합니다.",
    assistantTitle: "자료 도우미",
    assistantDesc: "확인이 필요한 항목만 모아둡니다.",
    assistantTrigger: "자료 도우미",
    assistantTopItem: "먼저 볼 항목",
    assistantOtherItems: "다음 항목",
    assistantNoItems: "지금 바로 확인할 항목이 없습니다.",
    assistantAllClear: "확인 대기 없음",
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
    needsAction: "자료 부족",
    ready: "완료",
    unassigned: "미확인",
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

function organizeCenterHref(input: { type?: ObjectType; status?: "unconfirmed" | "inconsistent" | "insufficient" | "complete"; q?: string }) {
  const params = new URLSearchParams();
  if (input.type) params.set("type", input.type === "input" ? "inbox" : input.type);
  if (input.status) params.set("status", input.status);
  if (input.q) params.set("q", input.q);
  const query = params.toString();
  return `/organize-center${query ? `?${query}` : ""}`;
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

function sortAssistantQueue(items: WorkObject[]) {
  return [...items].sort((a, b) => {
    const priorityRank = b.priorityScore - a.priorityScore;
    if (priorityRank !== 0) return priorityRank;
    return compareWorkObjects(a, b);
  });
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = searchParams ? await searchParams : undefined;
  const searchQuery = params?.q?.trim() ?? "";
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
      priorityScore: status === "ready" ? 0 : 900 + sourceCount * 24 + (propertyName ? 16 : 0),
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
      priorityScore: status === "ready" ? 0 : 420 + contractCount * 12,
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
      priorityScore: status === "ready" ? 0 : 380 + relatedCaseCount * 18,
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
      priorityScore: status === "ready" ? 0 : status === "unassigned" ? 760 : 620,
      detailRows: [
        { label: copy.status, value: getStatusLabel(status, copy) },
        { label: copy.sourceType, value: getSourceTypeLabel(locale, item.sourceType) },
        { label: copy.target, value: targetLabel },
        { label: copy.createdAt, value: formatDate(item.createdAt, locale) },
      ],
    };
  });

  const allObjects = sortWorkObjects([...caseObjects, ...partyObjects, ...propertyObjects, ...inputObjects]);

  const pendingObjects = allObjects.filter((item) => item.status !== "ready");
  const assistantQueueItems = sortAssistantQueue(pendingObjects).slice(0, 5);
  const assistantPrimaryItem = assistantQueueItems[0];
  const assistantSecondaryItems = assistantQueueItems.slice(1);
  const caseNeedsAction = caseObjects.filter((item) => item.status !== "ready").length;
  const partyNeedsAction = partyObjects.filter((item) => item.status !== "ready").length;
  const propertyNeedsAction = propertyObjects.filter((item) => item.status !== "ready").length;
  const inputNeedsAction = inputObjects.filter((item) => item.status !== "ready").length;
  const overviewItems = [
    { type: "case" as const, icon: "work", label: copy.cases, count: caseObjects.length, needsAction: caseNeedsAction },
    { type: "party" as const, icon: "person", label: copy.parties, count: partyObjects.length, needsAction: partyNeedsAction },
    { type: "property" as const, icon: "apartment", label: copy.properties, count: propertyObjects.length, needsAction: propertyNeedsAction },
    { type: "input" as const, icon: "upload_file", label: copy.inputMaterials, count: inputObjects.length, needsAction: inputNeedsAction },
  ];
  const primaryActions = [
    {
      href: "/import-center",
      icon: "upload_file",
      title: copy.intakeActionTitle,
      desc: copy.intakeActionDesc,
      badge: locale === "zh" ? "入口" : locale === "ko" ? "입력" : "入力",
      meta: locale === "zh" ? "新建或读取" : locale === "ko" ? "생성 또는 읽기" : "作成または読取",
      className: "border-slate-950 bg-slate-950 text-white hover:bg-slate-800",
      iconClassName: "bg-white/10 text-white",
      badgeClassName: "bg-white/10 text-white",
      metaClassName: "bg-white/10 text-white",
    },
    {
      href: organizeCenterHref({}),
      icon: "fact_check",
      title: copy.organizeActionTitle,
      desc: copy.organizeActionDesc,
      badge: locale === "zh" ? "核对" : locale === "ko" ? "확인" : "確認",
      meta: `${pendingObjects.length} ${copy.needsAction}`,
      className: "border-amber-200 bg-amber-50 text-slate-950 hover:border-amber-400 hover:bg-amber-100",
      iconClassName: "bg-white text-amber-700",
      badgeClassName: "bg-white text-amber-800 ring-1 ring-amber-100",
      metaClassName: "bg-white text-amber-800 ring-1 ring-amber-100",
    },
    {
      href: "/output-center",
      icon: "picture_as_pdf",
      title: copy.outputActionTitle,
      desc: copy.outputActionDesc,
      badge: locale === "zh" ? "生成" : locale === "ko" ? "출력" : "出力",
      meta: `${generatedOutputs.length} ${copy.outputs}`,
      className: "border-emerald-200 bg-emerald-50 text-slate-950 hover:border-emerald-400 hover:bg-emerald-100",
      iconClassName: "bg-white text-emerald-700",
      badgeClassName: "bg-white text-emerald-800 ring-1 ring-emerald-100",
      metaClassName: "bg-white text-emerald-800 ring-1 ring-emerald-100",
    },
  ];

  return (
    <div className="mx-auto max-w-[1680px] space-y-7">
      <header className="rounded-lg border border-slate-200 bg-white px-6 py-6 sm:px-8">
        <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] 2xl:items-end">
          <div className="min-w-0">
            <p className="text-xs font-black text-[#002FA7]">
              {copy.tenant}: {session.tenant.name}
            </p>
            <h1 className="mt-2 text-3xl font-black leading-tight tracking-normal text-slate-950 sm:text-4xl">
              {copy.startHere}
            </h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">{copy.startHereDesc}</p>
          </div>
          <div className="space-y-3">
            <form action="/organize-center" className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="sr-only" htmlFor="dashboard-search">
                {copy.search}
              </label>
              <input
                id="dashboard-search"
                name="q"
                defaultValue={searchQuery}
                placeholder={copy.searchPlaceholder}
                className="h-11 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-[#002FA7] focus:ring-2 focus:ring-blue-100"
              />
              <button
                className="h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 hover:border-[#002FA7] hover:text-[#002FA7]"
                type="submit"
              >
                {copy.search}
              </button>
              {searchQuery ? (
                <Link
                  href="/"
                  className="flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 sm:col-span-2"
                >
                  {copy.clear}
                </Link>
              ) : null}
            </form>

            <details className="group relative">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-950 px-4 py-3 text-white shadow-sm transition hover:bg-slate-800 [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10">
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">support_agent</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black">{copy.assistantTrigger}</span>
                    <span className="block truncate text-xs font-semibold text-white/65">
                      {pendingObjects.length > 0
                        ? `${pendingObjects.length} ${copy.needsAction}`
                        : copy.assistantAllClear}
                    </span>
                  </span>
                </span>
                <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[20px] opacity-70 transition group-open:rotate-180">
                  expand_more
                </span>
              </summary>

              <div className="mt-2 max-h-[32rem] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl sm:absolute sm:right-0 sm:z-20 sm:w-[28rem] sm:max-w-[calc(100vw-2rem)]">
                <div className="border-b border-slate-200 px-4 py-3">
                  <p className="text-xs font-black text-[#002FA7]">{copy.assistantTitle}</p>
                  <p className="mt-1 text-sm font-semibold leading-5 text-slate-600">{copy.assistantDesc}</p>
                </div>
                {assistantPrimaryItem ? (
                  <div>
                    <div className="border-b border-slate-100 bg-blue-50/50 px-4 py-3">
                      <p className="text-[11px] font-black text-[#002FA7]">{copy.assistantTopItem}</p>
                      <Link href={assistantPrimaryItem.actionHref} className="mt-2 block rounded-md border border-blue-100 bg-white p-3 hover:border-[#002FA7]/40 hover:bg-blue-50">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-950">{assistantPrimaryItem.title}</p>
                            <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-600">
                              {assistantPrimaryItem.reason}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${getStatusClass(assistantPrimaryItem.status)}`}>
                            {getStatusLabel(assistantPrimaryItem.status, copy)}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs font-black text-[#002FA7]">
                          <span>{assistantPrimaryItem.actionLabel}</span>
                          <span aria-hidden="true" className="material-symbols-outlined text-[17px]">arrow_forward</span>
                        </div>
                      </Link>
                    </div>

                    {assistantSecondaryItems.length > 0 ? (
                      <div className="border-b border-slate-100 px-4 py-3">
                        <p className="text-[11px] font-black text-slate-500">{copy.assistantOtherItems}</p>
                        <div className="mt-2 divide-y divide-slate-100">
                          {assistantSecondaryItems.map((item) => (
                            <Link key={item.key} href={item.actionHref} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2 hover:text-[#002FA7]">
                              <span className="min-w-0">
                                <span className="block truncate text-xs font-black text-slate-900">{item.title}</span>
                                <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-500">
                                  {getTypeLabel(item.type, copy)} / {item.metricLabel} {item.metricValue}
                                </span>
                              </span>
                              <span aria-hidden="true" className="material-symbols-outlined self-center text-[16px] text-slate-400">arrow_forward</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="border-b border-slate-100 px-4 py-8 text-center">
                    <p className="text-sm font-black text-slate-950">{copy.assistantNoItems}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{copy.overviewDesc}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-3">
                  {overviewItems.map((item) => (
                    <Link
                      key={item.type}
                      href={organizeCenterHref({ type: item.type })}
                      className="rounded-md bg-slate-50 px-3 py-2 hover:bg-blue-50"
                    >
                      <span className="block truncate text-[11px] font-black text-slate-500">{item.label}</span>
                      <span className="mt-1 block text-sm font-black text-slate-950">
                        {item.needsAction}/{item.count}
                      </span>
                    </Link>
                  ))}
                </div>

                <div className="p-3">
                  <Link
                    href="/organize-center"
                    className="flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-black text-slate-800 hover:bg-slate-50"
                  >
                    {copy.goToOrganizeCenter}
                  </Link>
                </div>
              </div>
            </details>
          </div>
        </div>
      </header>

      <section className="grid gap-3 2xl:grid-cols-3">
        {primaryActions.map((action, index) => (
          <Link
            key={action.href}
            href={action.href}
            className={`group flex min-h-48 flex-col justify-between rounded-lg border p-5 transition ${action.className}`}
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <span className={`flex h-11 w-11 items-center justify-center rounded-md ${action.iconClassName}`}>
                  <span aria-hidden="true" className="material-symbols-outlined text-[22px]">
                    {action.icon}
                  </span>
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-black ${action.badgeClassName}`}>
                  {action.badge}
                </span>
              </div>
              <h2 className="mt-5 text-2xl font-black leading-tight">{action.title}</h2>
              <p className={`mt-2 text-sm font-semibold leading-6 ${index === 0 ? "text-white/75" : "text-slate-600"}`}>{action.desc}</p>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-current/10 pt-4">
              <span className={`rounded-full px-2.5 py-1 text-xs font-black ${action.metaClassName}`}>{action.meta}</span>
              <span aria-hidden="true" className="material-symbols-outlined text-[20px] opacity-70 group-hover:translate-x-0.5">
                arrow_forward
              </span>
            </div>
          </Link>
        ))}
      </section>

    </div>
  );
}
