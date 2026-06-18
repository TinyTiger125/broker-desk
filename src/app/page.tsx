import Link from "next/link";
import {
  getGuaranteeApplicationDraft,
  listAuditLogs,
  listBrokerageCases,
  listGeneratedOutputs,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import {
  buildGuaranteeApplicationReadiness,
  buildGuaranteeDraftReadiness,
  guaranteeCompanyTemplates,
} from "@/lib/guarantee-application";
import {
  listHubAttachments,
  listHubContracts,
  listHubImportJobs,
  listHubParties,
  listHubProperties,
  listHubServiceRequests,
  type HubSearchEntity,
} from "@/lib/hub";
import { getLocale, type Locale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams?: Promise<{ q?: string }>;
};

type DashboardCopy = {
  title: string;
  subtitle: string;
  tenant: string;
  searchPlaceholder: string;
  search: string;
  clear: string;
  noSearchResults: string;
  searchResults: string;
  totalRecords: string;
  inputMaterials: string;
  cases: string;
  properties: string;
  parties: string;
  contracts: string;
  serviceRequests: string;
  attachments: string;
  generatedOutputs: string;
  auditLogs: string;
  pending: string;
  reviewed: string;
  open: string;
  total: string;
  dataFlow: string;
  flowInput: string;
  flowInputDesc: string;
  flowOrganize: string;
  flowOrganizeDesc: string;
  flowConfirm: string;
  flowConfirmDesc: string;
  flowOutput: string;
  flowOutputDesc: string;
  flowAudit: string;
  flowAuditDesc: string;
  priority: string;
  quickActions: string;
  uploadMaterial: string;
  openWorkbench: string;
  openOutput: string;
  openTemplateFactory: string;
  recentWork: string;
  recentInputs: string;
  recentCases: string;
  recentOutputs: string;
  outputReadiness: string;
  currentCase: string;
  missingFields: string;
  additionalMissing: string;
  readyTemplates: string;
  blockedTemplates: string;
  noCurrentCase: string;
  noRecentData: string;
  statusQueued: string;
  statusMapped: string;
  statusCompleted: string;
  statusReviewed: string;
  statusDraft: string;
  statusReady: string;
  statusBlocked: string;
  entityProperty: string;
  entityParty: string;
  entityContract: string;
  entityServiceRequest: string;
  entityOutput: string;
  entityCase: string;
  entityInput: string;
};

const copyByLocale: Record<Locale, DashboardCopy> = {
  ja: {
    title: "資料管理センター",
    subtitle: "入力資料、整理済み案件、物件・顧客データ、出力書類、監査ログを同じ画面で確認します。",
    tenant: "対象ワークスペース",
    searchPlaceholder: "顧客、物件、案件、資料、出力書類を検索",
    search: "検索",
    clear: "クリア",
    noSearchResults: "該当する資料は見つかりませんでした。",
    searchResults: "検索結果",
    totalRecords: "管理対象",
    inputMaterials: "入力資料",
    cases: "案件",
    properties: "物件",
    parties: "関係者",
    contracts: "契約/提案",
    serviceRequests: "対応タスク",
    attachments: "添付ファイル",
    generatedOutputs: "生成済み書類",
    auditLogs: "監査ログ",
    pending: "未処理",
    reviewed: "確認済み",
    open: "未完了",
    total: "合計",
    dataFlow: "資料フロー",
    flowInput: "入力",
    flowInputDesc: "資料を取り込み、候補データを作成します。",
    flowOrganize: "整理",
    flowOrganizeDesc: "案件ごとに構造化して不足を見つけます。",
    flowConfirm: "確認",
    flowConfirmDesc: "人が確認した情報だけを確定します。",
    flowOutput: "出力",
    flowOutputDesc: "保証会社申込書や提案資料を生成します。",
    flowAudit: "監査",
    flowAuditDesc: "変更と出力の履歴を残します。",
    priority: "優先確認",
    quickActions: "クイック操作",
    uploadMaterial: "資料をアップロード",
    openWorkbench: "情報整理を開く",
    openOutput: "出力センターを開く",
    openTemplateFactory: "公式テンプレートを見る",
    recentWork: "最近の作業",
    recentInputs: "最近の入力",
    recentCases: "最近の案件",
    recentOutputs: "最近の出力",
    outputReadiness: "保証会社申込書の準備度",
    currentCase: "対象案件",
    missingFields: "未解決項目",
    additionalMissing: "追加項目未入力",
    readyTemplates: "出力可能",
    blockedTemplates: "要確認",
    noCurrentCase: "処理対象の案件はまだありません。",
    noRecentData: "表示できる履歴はまだありません。",
    statusQueued: "待機",
    statusMapped: "確認待ち",
    statusCompleted: "完了",
    statusReviewed: "確認済み",
    statusDraft: "下書き",
    statusReady: "準備済み",
    statusBlocked: "要確認",
    entityProperty: "物件",
    entityParty: "関係者",
    entityContract: "契約/提案",
    entityServiceRequest: "対応タスク",
    entityOutput: "出力書類",
    entityCase: "案件",
    entityInput: "入力資料",
  },
  zh: {
    title: "资料管理中心",
    subtitle: "把输入资料、整理后的案件、物件/客户数据、输出文件和审计记录放在同一个工作台里查看。",
    tenant: "当前工作区",
    searchPlaceholder: "搜索客户、物件、案件、资料、输出文件",
    search: "搜索",
    clear: "清除",
    noSearchResults: "没有找到对应资料。",
    searchResults: "搜索结果",
    totalRecords: "管理对象",
    inputMaterials: "输入资料",
    cases: "案件",
    properties: "物件",
    parties: "关系人",
    contracts: "合同/提案",
    serviceRequests: "处理任务",
    attachments: "附件",
    generatedOutputs: "已生成文件",
    auditLogs: "审计记录",
    pending: "待处理",
    reviewed: "已确认",
    open: "未完成",
    total: "合计",
    dataFlow: "资料流转",
    flowInput: "输入",
    flowInputDesc: "上传资料，生成候选数据。",
    flowOrganize: "整理",
    flowOrganizeDesc: "按案件结构化资料并找出缺口。",
    flowConfirm: "确认",
    flowConfirmDesc: "只把人工确认后的信息写入确定数据。",
    flowOutput: "输出",
    flowOutputDesc: "生成保证会社申请书和提案资料。",
    flowAudit: "审计",
    flowAuditDesc: "保留修改和输出记录。",
    priority: "优先确认",
    quickActions: "快捷操作",
    uploadMaterial: "上传资料",
    openWorkbench: "打开信息整理",
    openOutput: "打开输出中心",
    openTemplateFactory: "查看官方模板",
    recentWork: "最近作业",
    recentInputs: "最近输入",
    recentCases: "最近案件",
    recentOutputs: "最近输出",
    outputReadiness: "保证会社申请书准备度",
    currentCase: "目标案件",
    missingFields: "未解决项目",
    additionalMissing: "追加项目未填写",
    readyTemplates: "可输出",
    blockedTemplates: "需确认",
    noCurrentCase: "目前还没有可处理案件。",
    noRecentData: "暂无可显示记录。",
    statusQueued: "待处理",
    statusMapped: "待确认",
    statusCompleted: "完成",
    statusReviewed: "已确认",
    statusDraft: "草稿",
    statusReady: "准备完成",
    statusBlocked: "需确认",
    entityProperty: "物件",
    entityParty: "关系人",
    entityContract: "合同/提案",
    entityServiceRequest: "处理任务",
    entityOutput: "输出文件",
    entityCase: "案件",
    entityInput: "输入资料",
  },
  ko: {
    title: "자료 관리 센터",
    subtitle: "입력 자료, 정리된 안건, 매물/고객 데이터, 출력 문서, 감사 기록을 한 화면에서 확인합니다.",
    tenant: "현재 워크스페이스",
    searchPlaceholder: "고객, 매물, 안건, 자료, 출력 문서 검색",
    search: "검색",
    clear: "지우기",
    noSearchResults: "해당 자료를 찾지 못했습니다.",
    searchResults: "검색 결과",
    totalRecords: "관리 대상",
    inputMaterials: "입력 자료",
    cases: "안건",
    properties: "매물",
    parties: "관계자",
    contracts: "계약/제안",
    serviceRequests: "처리 작업",
    attachments: "첨부 파일",
    generatedOutputs: "생성 문서",
    auditLogs: "감사 로그",
    pending: "미처리",
    reviewed: "확인됨",
    open: "미완료",
    total: "합계",
    dataFlow: "자료 흐름",
    flowInput: "입력",
    flowInputDesc: "자료를 넣고 후보 데이터를 만듭니다.",
    flowOrganize: "정리",
    flowOrganizeDesc: "안건별로 구조화하고 부족한 부분을 찾습니다.",
    flowConfirm: "확인",
    flowConfirmDesc: "사람이 확인한 정보만 확정합니다.",
    flowOutput: "출력",
    flowOutputDesc: "보증회사 신청서와 제안 자료를 생성합니다.",
    flowAudit: "감사",
    flowAuditDesc: "변경과 출력 이력을 남깁니다.",
    priority: "우선 확인",
    quickActions: "빠른 작업",
    uploadMaterial: "자료 업로드",
    openWorkbench: "정보 정리 열기",
    openOutput: "출력 센터 열기",
    openTemplateFactory: "공식 템플릿 보기",
    recentWork: "최근 작업",
    recentInputs: "최근 입력",
    recentCases: "최근 안건",
    recentOutputs: "최근 출력",
    outputReadiness: "보증회사 신청서 준비도",
    currentCase: "대상 안건",
    missingFields: "미해결 항목",
    additionalMissing: "추가 항목 미입력",
    readyTemplates: "출력 가능",
    blockedTemplates: "확인 필요",
    noCurrentCase: "처리할 안건이 아직 없습니다.",
    noRecentData: "표시할 이력이 아직 없습니다.",
    statusQueued: "대기",
    statusMapped: "확인 대기",
    statusCompleted: "완료",
    statusReviewed: "확인됨",
    statusDraft: "초안",
    statusReady: "준비됨",
    statusBlocked: "확인 필요",
    entityProperty: "매물",
    entityParty: "관계자",
    entityContract: "계약/제안",
    entityServiceRequest: "처리 작업",
    entityOutput: "출력 문서",
    entityCase: "안건",
    entityInput: "입력 자료",
  },
};

function workbenchAnchorForGuaranteeField(fieldKey: string) {
  if (fieldKey.startsWith("company_option.")) return "guarantee-template-drafts";
  if (fieldKey.startsWith("property.") || fieldKey.startsWith("lease.")) return "workbench-property_lease";
  if (
    fieldKey.startsWith("applicant.employer") ||
    fieldKey === "applicant.occupation" ||
    fieldKey === "applicant.employmentType" ||
    fieldKey === "applicant.annualIncome" ||
    fieldKey === "applicant.yearsEmployed"
  ) {
    return "workbench-employment_income";
  }
  if (fieldKey.startsWith("applicant.")) return "workbench-applicant";
  if (fieldKey.startsWith("emergencyContact.")) return "workbench-contact_guarantor";
  if (fieldKey.startsWith("coOccupants.")) return "workbench-co_occupants";
  if (fieldKey.startsWith("broker.") || fieldKey.startsWith("management.")) return "workbench-broker_management";
  if (fieldKey.startsWith("guarantee.")) return "workbench-guarantee_options";
  return "workbench-unresolved";
}

function importStatusLabel(status: string, copy: DashboardCopy) {
  if (status === "completed") return copy.statusCompleted;
  if (status === "mapped") return copy.statusMapped;
  return copy.statusQueued;
}

function caseStatusLabel(status: string, copy: DashboardCopy) {
  return status === "reviewed" ? copy.statusReviewed : copy.statusDraft;
}

function entityLabel(entity: HubSearchEntity | "case" | "input", copy: DashboardCopy) {
  const labels = {
    property: copy.entityProperty,
    party: copy.entityParty,
    contract: copy.entityContract,
    service_request: copy.entityServiceRequest,
    output: copy.entityOutput,
    case: copy.entityCase,
    input: copy.entityInput,
  };
  return labels[entity];
}

function includesQuery(query: string, ...values: Array<string | undefined>) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return false;
  return values.some((value) => value?.toLowerCase().includes(normalized));
}

function getOutputTypeLabel(outputType: string, copy: DashboardCopy) {
  if (outputType === "guarantee_application") return copy.entityOutput;
  return copy.generatedOutputs;
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
    cases,
    importJobs,
    properties,
    parties,
    contracts,
    serviceRequests,
    attachments,
    generatedOutputs,
    auditLogs,
  ] = await Promise.all([
    listBrokerageCases(user.id, 50, tenantId),
    listHubImportJobs(hubContext),
    listHubProperties(locale, hubContext),
    listHubParties(locale, hubContext),
    listHubContracts(locale, hubContext),
    listHubServiceRequests(hubContext),
    listHubAttachments(locale, 50, hubContext),
    listGeneratedOutputs({ userId: user.id, tenantId, limit: 50 }),
    listAuditLogs(user.id, { tenantId, limit: 50 }),
  ]);

  const currentCase =
    cases.find((item) => item.id === "case_fixture_friends_guarantee_pdf") ??
    cases.find((item) => item.status === "reviewed") ??
    cases[0];
  const activeGuaranteeTemplates = guaranteeCompanyTemplates.filter((template) => template.outputStatus === "active");
  const primaryGuaranteeTemplate =
    activeGuaranteeTemplates.find((template) => template.id === "friends_guarantee_individual_v1") ??
    activeGuaranteeTemplates[0];

  const guaranteeDrafts = currentCase
    ? await Promise.all(
        activeGuaranteeTemplates.map((template) =>
          getGuaranteeApplicationDraft({
            userId: user.id,
            tenantId,
            caseId: currentCase.id,
            templateId: template.id,
          }),
        ),
      )
    : [];

  const guaranteeTemplateSummaries = activeGuaranteeTemplates.map((template, index) => {
    const draft = guaranteeDrafts[index] ?? null;
    const readinessGroups = buildGuaranteeApplicationReadiness({ brokerageCase: currentCase, template, draft });
    return {
      template,
      draftReadiness: buildGuaranteeDraftReadiness(draft, template.id),
      unresolvedFields: readinessGroups.find((group) => group.id === "unresolved")?.fields ?? [],
    };
  });
  const primaryGuaranteeSummary =
    guaranteeTemplateSummaries.find((summary) => summary.template.id === primaryGuaranteeTemplate?.id) ??
    guaranteeTemplateSummaries[0];
  const missingFields = primaryGuaranteeSummary?.unresolvedFields ?? [];
  const draftMissingTotal = primaryGuaranteeSummary?.draftReadiness.requiredMissingCount ?? 0;
  const blockedTemplateCount = guaranteeTemplateSummaries.filter(
    (summary) => summary.unresolvedFields.length > 0 || summary.draftReadiness.requiredMissingCount > 0,
  ).length;
  const readyTemplateCount = Math.max(activeGuaranteeTemplates.length - blockedTemplateCount, 0);

  const primaryTemplateId = primaryGuaranteeTemplate?.id ?? "friends_guarantee_individual_v1";
  const outputHref = currentCase
    ? `/output-center?caseId=${encodeURIComponent(currentCase.id)}&guaranteeTemplate=${encodeURIComponent(primaryTemplateId)}`
    : "/output-center";
  const workbenchHref = currentCase
    ? `/cases/${currentCase.id}?guaranteeTemplate=${encodeURIComponent(primaryTemplateId)}#workbench-unresolved`
    : "/import-center";
  const workbenchLinkForField = (fieldKey: string) =>
    currentCase
      ? `/cases/${currentCase.id}?guaranteeTemplate=${encodeURIComponent(primaryTemplateId)}#${workbenchAnchorForGuaranteeField(fieldKey)}`
      : "/import-center";

  const pendingImportCount = importJobs.filter((item) => item.status !== "completed").length;
  const reviewedCaseCount = cases.filter((item) => item.status === "reviewed").length;
  const openServiceRequestCount = serviceRequests.filter((item) => item.status === "open").length;
  const totalManagedRecords =
    importJobs.length +
    cases.length +
    properties.length +
    parties.length +
    contracts.length +
    serviceRequests.length +
    attachments.length +
    generatedOutputs.length;

  const dashboardStats = [
    { label: copy.totalRecords, value: totalManagedRecords, meta: copy.total, href: "/properties" },
    { label: copy.inputMaterials, value: importJobs.length, meta: `${pendingImportCount} ${copy.pending}`, href: "/import-center" },
    { label: copy.cases, value: cases.length, meta: `${reviewedCaseCount} ${copy.reviewed}`, href: currentCase ? `/cases/${currentCase.id}` : "/import-center" },
    { label: copy.generatedOutputs, value: generatedOutputs.length, meta: copy.total, href: "/output-center" },
  ];

  const flowSteps = [
    { label: copy.flowInput, desc: copy.flowInputDesc, value: importJobs.length, meta: `${pendingImportCount} ${copy.pending}`, href: "/import-center" },
    { label: copy.flowOrganize, desc: copy.flowOrganizeDesc, value: cases.length, meta: copy.cases, href: workbenchHref },
    { label: copy.flowConfirm, desc: copy.flowConfirmDesc, value: reviewedCaseCount, meta: copy.reviewed, href: workbenchHref },
    { label: copy.flowOutput, desc: copy.flowOutputDesc, value: generatedOutputs.length, meta: copy.generatedOutputs, href: outputHref },
    { label: copy.flowAudit, desc: copy.flowAuditDesc, value: auditLogs.length, meta: copy.auditLogs, href: "/audit-log" },
  ];

  const priorityItems = [
    {
      label: copy.inputMaterials,
      value: pendingImportCount,
      meta: copy.pending,
      href: "/import-center",
    },
    {
      label: copy.serviceRequests,
      value: openServiceRequestCount,
      meta: copy.open,
      href: "/service-requests?status=open",
    },
    {
      label: copy.outputReadiness,
      value: blockedTemplateCount,
      meta: copy.blockedTemplates,
      href: outputHref,
    },
  ];

  const recentWork = [
    ...importJobs.slice(0, 4).map((item) => ({
      id: `input-${item.id}`,
      label: entityLabel("input", copy),
      title: item.title,
      meta: `${importStatusLabel(item.status, copy)} / ${formatDate(item.createdAt, locale)}`,
      href: "/import-center",
      time: item.createdAt.getTime(),
    })),
    ...cases.slice(0, 4).map((item) => ({
      id: `case-${item.id}`,
      label: entityLabel("case", copy),
      title: item.caseTitle,
      meta: `${caseStatusLabel(item.status, copy)} / ${formatDate(item.updatedAt, locale)}`,
      href: `/cases/${item.id}`,
      time: item.updatedAt.getTime(),
    })),
    ...generatedOutputs.slice(0, 4).map((item) => ({
      id: `output-${item.id}`,
      label: entityLabel("output", copy),
      title: item.title,
      meta: `${item.outputFormat.toUpperCase()} / ${formatDate(item.generatedAt, locale)}`,
      href: item.caseId ? `/output-center?caseId=${encodeURIComponent(item.caseId)}` : "/output-center",
      time: item.generatedAt.getTime(),
    })),
  ].sort((a, b) => b.time - a.time).slice(0, 8);

  const searchResults = searchQuery
    ? [
        ...properties
          .filter((item) => includesQuery(searchQuery, item.name, item.area))
          .slice(0, 5)
          .map((item) => ({
            id: `property-${item.id}`,
            entity: "property" as const,
            title: item.name,
            subtitle: item.area,
            href: `/properties?focus=${item.id}`,
          })),
        ...parties
          .filter((item) => includesQuery(searchQuery, item.name, item.phone, item.email, item.relatedPropertyHint))
          .slice(0, 5)
          .map((item) => ({
            id: `party-${item.id}`,
            entity: "party" as const,
            title: item.name,
            subtitle: [item.phone, item.relatedPropertyHint].filter(Boolean).join(" / "),
            href: `/parties?focus=${item.id}`,
          })),
        ...contracts
          .filter((item) => includesQuery(searchQuery, item.contractNumber, item.relatedProperty, item.relatedParty))
          .slice(0, 5)
          .map((item) => ({
            id: `contract-${item.id}`,
            entity: "contract" as const,
            title: item.contractNumber,
            subtitle: [item.relatedProperty, item.relatedParty].filter(Boolean).join(" / "),
            href: `/contracts?focus=${item.id}`,
          })),
        ...serviceRequests
          .filter((item) => includesQuery(searchQuery, item.title, item.relatedProperty, item.relatedParty))
          .slice(0, 5)
          .map((item) => ({
            id: `request-${item.id}`,
            entity: "service_request" as const,
            title: item.title,
            subtitle: [item.relatedProperty, item.relatedParty].filter(Boolean).join(" / "),
            href: `/service-requests?focus=${item.id}`,
          })),
        ...cases
          .filter((item) => includesQuery(searchQuery, item.id, item.caseTitle))
          .slice(0, 5)
          .map((item) => ({
            id: `case-${item.id}`,
            entity: "case" as const,
            title: item.caseTitle,
            subtitle: caseStatusLabel(item.status, copy),
            href: `/cases/${item.id}`,
          })),
        ...importJobs
          .filter((item) => includesQuery(searchQuery, item.title, item.notes, item.validationMessage))
          .slice(0, 5)
          .map((item) => ({
            id: `input-${item.id}`,
            entity: "input" as const,
            title: item.title,
            subtitle: importStatusLabel(item.status, copy),
            href: "/import-center",
          })),
        ...generatedOutputs
          .filter((item) => includesQuery(searchQuery, item.title, item.documentNumber, item.templateId))
          .slice(0, 5)
          .map((item) => ({
            id: `output-${item.id}`,
            entity: "output" as const,
            title: item.title,
            subtitle: getOutputTypeLabel(item.outputType, copy),
            href: item.caseId ? `/output-center?caseId=${encodeURIComponent(item.caseId)}` : "/output-center",
          })),
      ].slice(0, 12)
    : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="border-b border-[#111827] bg-white px-4 py-5 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,520px)] lg:items-end">
          <div>
            <p className="text-xs font-black text-[#002FA7]">{copy.tenant}: {session.tenant.name}</p>
            <h1 className="mt-2 text-4xl font-black leading-none tracking-normal text-[#111827] sm:text-5xl">
              {copy.title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{copy.subtitle}</p>
          </div>
          <form action="/" className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="sr-only" htmlFor="dashboard-search">
              {copy.search}
            </label>
            <input
              id="dashboard-search"
              name="q"
              defaultValue={searchQuery}
              placeholder={copy.searchPlaceholder}
              className="h-11 min-w-0 border border-[#111827] bg-white px-3 text-sm font-semibold text-[#111827] outline-none focus:border-[#002FA7]"
            />
            <button className="h-11 border border-[#002FA7] bg-[#002FA7] px-4 text-sm font-black text-white" type="submit">
              {copy.search}
            </button>
            {searchQuery ? (
              <Link href="/" className="flex h-11 items-center justify-center border border-slate-300 bg-[#F7F7F8] px-4 text-sm font-black text-slate-700">
                {copy.clear}
              </Link>
            ) : null}
          </form>
        </div>
      </header>

      <section className="grid border border-[#111827] bg-white sm:grid-cols-2 xl:grid-cols-4">
        {dashboardStats.map((item, index) => (
          <Link
            key={item.label}
            href={item.href}
            className={`group min-h-36 p-4 hover:bg-[#F7F7F8] ${index > 0 ? "border-t border-[#111827] sm:border-t-0 sm:border-l" : ""} ${index === 2 ? "xl:border-l" : ""}`}
          >
            <p className="text-xs font-black text-slate-500">{String(index + 1).padStart(2, "0")}</p>
            <p className="mt-6 text-5xl font-black leading-none tabular-nums text-[#111827]">{item.value}</p>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-300 pt-3">
              <p className="text-sm font-black text-[#111827]">{item.label}</p>
              <p className="text-xs font-bold text-[#002FA7]">{item.meta}</p>
            </div>
          </Link>
        ))}
      </section>

      {searchQuery ? (
        <section className="border border-[#111827] bg-white">
          <div className="border-b border-[#111827] px-4 py-3">
            <h2 className="text-lg font-black text-[#111827]">{copy.searchResults}</h2>
          </div>
          <div className="divide-y divide-slate-200">
            {searchResults.length > 0 ? (
              searchResults.map((item) => (
                <Link key={item.id} href={item.href} className="grid gap-1 px-4 py-3 hover:bg-[#F7F7F8] sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
                  <span className="text-xs font-black text-[#002FA7]">{entityLabel(item.entity, copy)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-[#111827]">{item.title}</span>
                    {item.subtitle ? <span className="block truncate text-xs font-semibold text-slate-500">{item.subtitle}</span> : null}
                  </span>
                </Link>
              ))
            ) : (
              <p className="px-4 py-5 text-sm font-semibold text-slate-500">{copy.noSearchResults}</p>
            )}
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <div className="space-y-6">
          <section className="border border-[#111827] bg-white">
            <div className="border-b border-[#111827] px-4 py-3">
              <h2 className="text-lg font-black text-[#111827]">{copy.dataFlow}</h2>
            </div>
            <div className="grid md:grid-cols-5">
              {flowSteps.map((step, index) => (
                <Link
                  key={step.label}
                  href={step.href}
                  className={`min-h-44 p-4 hover:bg-[#F7F7F8] ${index > 0 ? "border-t border-[#111827] md:border-t-0 md:border-l" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-xs font-black text-slate-500">{String(index + 1).padStart(2, "0")}</span>
                    <span className="text-2xl font-black tabular-nums text-[#002FA7]">{step.value}</span>
                  </div>
                  <h3 className="mt-8 text-base font-black text-[#111827]">{step.label}</h3>
                  <p className="mt-2 min-h-12 text-xs leading-5 text-slate-600">{step.desc}</p>
                  <p className="mt-4 border-t border-slate-300 pt-2 text-xs font-bold text-slate-500">{step.meta}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="border border-[#111827] bg-white">
              <div className="border-b border-[#111827] px-4 py-3">
                <h2 className="text-lg font-black text-[#111827]">{copy.recentWork}</h2>
              </div>
              <div className="divide-y divide-slate-200">
                {recentWork.length > 0 ? (
                  recentWork.map((item) => (
                    <Link key={item.id} href={item.href} className="grid gap-1 px-4 py-3 hover:bg-[#F7F7F8]">
                      <span className="text-xs font-black text-[#002FA7]">{item.label}</span>
                      <span className="truncate text-sm font-black text-[#111827]">{item.title}</span>
                      <span className="text-xs font-semibold text-slate-500">{item.meta}</span>
                    </Link>
                  ))
                ) : (
                  <p className="px-4 py-5 text-sm font-semibold text-slate-500">{copy.noRecentData}</p>
                )}
              </div>
            </div>

            <div className="border border-[#111827] bg-white">
              <div className="border-b border-[#111827] px-4 py-3">
                <h2 className="text-lg font-black text-[#111827]">{copy.outputReadiness}</h2>
              </div>
              <div className="p-4">
                {currentCase ? (
                  <>
                    <p className="text-xs font-black text-[#002FA7]">{copy.currentCase}</p>
                    <h3 className="mt-1 text-xl font-black leading-snug text-[#111827]">{currentCase.caseTitle}</h3>
                    <div className="mt-5 grid grid-cols-2 border border-[#111827]">
                      <Link href={outputHref} className="p-4 hover:bg-[#F7F7F8]">
                        <p className="text-4xl font-black tabular-nums text-[#111827]">{readyTemplateCount}</p>
                        <p className="mt-2 text-xs font-black text-slate-600">{copy.readyTemplates}</p>
                      </Link>
                      <Link href={workbenchHref} className="border-l border-[#111827] p-4 hover:bg-[#F7F7F8]">
                        <p className="text-4xl font-black tabular-nums text-[#111827]">{blockedTemplateCount}</p>
                        <p className="mt-2 text-xs font-black text-slate-600">{copy.blockedTemplates}</p>
                      </Link>
                    </div>
                    <div className="mt-4 space-y-2 border-t border-slate-300 pt-4">
                      <p className="text-sm font-black text-[#111827]">
                        {copy.missingFields}: {missingFields.length}
                      </p>
                      <p className="text-sm font-black text-[#111827]">
                        {copy.additionalMissing}: {draftMissingTotal}
                      </p>
                      {missingFields.slice(0, 4).map((field) => (
                        <Link key={field.fieldKey} href={workbenchLinkForField(field.fieldKey)} className="block truncate text-sm font-semibold text-[#002FA7] hover:underline">
                          {field.label}
                        </Link>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-slate-500">{copy.noCurrentCase}</p>
                )}
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="border border-[#111827] bg-white">
            <div className="border-b border-[#111827] px-4 py-3">
              <h2 className="text-lg font-black text-[#111827]">{copy.priority}</h2>
            </div>
            <div className="divide-y divide-slate-200">
              {priorityItems.map((item) => (
                <Link key={item.label} href={item.href} className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-4 px-4 py-4 hover:bg-[#F7F7F8]">
                  <span className="text-4xl font-black tabular-nums text-[#002FA7]">{item.value}</span>
                  <span>
                    <span className="block text-sm font-black text-[#111827]">{item.label}</span>
                    <span className="block text-xs font-semibold text-slate-500">{item.meta}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="border border-[#111827] bg-white">
            <div className="border-b border-[#111827] px-4 py-3">
              <h2 className="text-lg font-black text-[#111827]">{copy.quickActions}</h2>
            </div>
            <div className="grid">
              {[
                { label: copy.uploadMaterial, href: "/import-center", icon: "upload_file" },
                { label: copy.openWorkbench, href: workbenchHref, icon: "fact_check" },
                { label: copy.openOutput, href: outputHref, icon: "print" },
                { label: copy.openTemplateFactory, href: "/platform/templates", icon: "view_module" },
              ].map((item) => (
                <Link key={item.href} href={item.href} className="flex items-center justify-between border-b border-slate-200 px-4 py-4 text-sm font-black text-[#111827] last:border-b-0 hover:bg-[#F7F7F8]">
                  <span>{item.label}</span>
                  <span className="material-symbols-outlined text-[18px] text-[#002FA7]">{item.icon}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="border border-[#111827] bg-white">
            <div className="grid grid-cols-2">
              {[
                { label: copy.properties, value: properties.length, href: "/properties" },
                { label: copy.parties, value: parties.length, href: "/parties" },
                { label: copy.contracts, value: contracts.length, href: "/contracts" },
                { label: copy.attachments, value: attachments.length, href: "/import-center" },
              ].map((item, index) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`min-h-28 p-4 hover:bg-[#F7F7F8] ${index % 2 === 1 ? "border-l border-[#111827]" : ""} ${index > 1 ? "border-t border-[#111827]" : ""}`}
                >
                  <p className="text-3xl font-black tabular-nums text-[#111827]">{item.value}</p>
                  <p className="mt-3 text-xs font-black text-slate-600">{item.label}</p>
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
