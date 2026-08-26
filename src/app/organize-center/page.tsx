import { Suspense } from "react";
import Link from "next/link";
import {
  OrganizeCenterObjectBrowser,
  type OrganizeCenterBrowserItem,
} from "@/components/organize-center-object-browser";
import { ListReportShell, PageFrame, PageHeader, StateSurface } from "@/components/layout-system";
import { listBrokerageCasesForContext } from "@/lib/data";
import { getCaseFieldValue } from "@/lib/case-field-normalization";
import { formatDate } from "@/lib/format";
import { listHubParties, listHubProperties } from "@/lib/hub";
import { getLocale, type Locale } from "@/lib/locale";
import { normalizeLifecycleFilter, type LifecycleFilter } from "@/lib/record-lifecycle";
import { getTenantCapability, requireTenantSession, TenantSessionError } from "@/lib/tenant-session";
import { capabilityHasTenantPermission } from "@/lib/tenant-permissions";
import { createRequestContext } from "@/lib/visibility-resolver";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type OrganizeCenterPageProps = {
  searchParams?: Promise<{ type?: string; q?: string; lifecycle?: string; page?: string }>;
};

type ReliableObjectType = "case" | "party" | "property";
type ObjectType = "all" | ReliableObjectType | "inbox";

type OrganizeCenterQuery = {
  type?: string;
  q?: string;
  lifecycle?: string;
  page?: string;
};

type WorkObject = {
  id: string;
  type: ReliableObjectType;
  title: string;
  subtitle: string;
  relation: string;
  relationLabel: string;
  updatedAt?: Date;
  href: string;
  lifecycleStatus: "active" | "archived";
  visibilityLabel?: string;
  readOnly?: boolean;
};

const copyByLocale = {
  ja: {
    title: "情報整理",
    description: "対象を探して、次の確認へ進みます。出力可否はここでは判定しません。",
    objectCenter: "整理する対象を選択",
    branchCaseDesc: "申込、契約、費用、関係資料を案件ごとに確認します。",
    branchPartyDesc: "関係者の基本情報と関連先を確認します。",
    branchPropertyDesc: "住所、部屋番号、賃料、費用を物件ごとに確認します。",
    keyword: "キーワード",
    lifecycle: "記録の状態",
    searchPlaceholder: "名前、物件、案件、資料名で検索",
    filter: "絞り込む",
    clear: "キーワードをクリア",
    backToSelector: "対象選択へ戻る",
    all: "すべて",
    case: "案件",
    party: "関係者",
    property: "物件",
    taskUpdated: "更新",
    noResults: "現在の条件に一致する対象はありません。",
    clearFilters: "キーワードをクリア",
    clearKeywordHint: "キーワードだけを解除し、記録の状態はそのままにして再検索できます。",
    objectCount: "対象",
    continueCheck: "一覧で続けて確認",
    relationCase: "案件内の関係",
    visibilityLabel: "可視範囲",
    companyReadOnly: "会社メンバーに公開／読み取り専用",
    ownerReadOnly: "現在のアカウントは閲覧のみです。",
    relationParty: "関連先",
    relationProperty: "利用先",
    pageStatus: "表示中",
    pageOf: "ページ",
    previousPage: "前へ",
    nextPage: "次へ",
    activeRecords: "有効な記録",
    archivedRecords: "保管済み",
    allRecords: "すべての記録",
    noKeyword: "キーワード未設定",
    noRelation: "未紐付け",
    noDate: "-",
    personUnset: "関係者未設定",
    propertyUnset: "物件未設定",
    propertyRelationHint: "関係者や案件との関連は物件内で確認します",
    corporate: "法人",
    individual: "個人",
    loadingTitle: "整理対象を読み込んでいます",
    loadingBody: "ページ構造を保ったまま、権限のある対象を確認しています。",
    loadErrorTitle: "整理対象を読み込めません",
    loadErrorBody: "データを取得できませんでした。詳細は表示せず、再試行できます。",
    permissionDeniedTitle: "この整理対象へのアクセス権がありません",
    permissionDeniedBody: "権限を変更せず、管理者にアクセス範囲を確認してください。",
    retry: "再試行",
    inboxUnavailableTitle: "資料の帰属一覧は現在利用できません",
    inboxUnavailableBody: "具体的な対象への帰属を確実に判断できるデータがありません。資料入力で処理状況を確認してください。",
    openImportCenter: "資料入力を開く",
  },
  zh: {
    title: "整理信息",
    description: "先找到对象，再进入后续核对。这里不判定输出资格。",
    objectCenter: "选择整理对象",
    branchCaseDesc: "按案件查看申请、合同、费用和关联资料。",
    branchPartyDesc: "查看主体的基础资料和关联对象。",
    branchPropertyDesc: "按物件查看地址、房号、租金和费用。",
    keyword: "关键字",
    lifecycle: "记录状态",
    searchPlaceholder: "搜索姓名、物件、案件、资料名",
    filter: "筛选",
    clear: "清除关键词",
    backToSelector: "返回对象选择",
    all: "全部",
    case: "案件",
    party: "主体",
    property: "物件",
    taskUpdated: "更新",
    noResults: "当前条件没有结果。",
    clearFilters: "清除关键词",
    clearKeywordHint: "可以只清除关键词，记录状态筛选保持不变。",
    objectCount: "对象",
    continueCheck: "进入列表继续核对",
    relationCase: "案件关系",
    visibilityLabel: "可见范围",
    companyReadOnly: "公司成员可见／只读",
    ownerReadOnly: "当前账号仅可查看。",
    relationParty: "关联对象",
    relationProperty: "使用位置",
    pageStatus: "当前显示",
    pageOf: "页",
    previousPage: "上一页",
    nextPage: "下一页",
    activeRecords: "有效记录",
    archivedRecords: "已归档",
    allRecords: "全部记录",
    noKeyword: "未设置关键词",
    noRelation: "未关联",
    noDate: "-",
    personUnset: "主体未设置",
    propertyUnset: "物件未设置",
    propertyRelationHint: "关联主体或案件后继续使用",
    corporate: "法人",
    individual: "个人",
    loadingTitle: "正在加载整理对象",
    loadingBody: "正在保留页面结构并读取当前权限范围内的对象。",
    loadErrorTitle: "无法加载整理对象",
    loadErrorBody: "数据读取失败。未显示服务端细节，可以重新尝试。",
    permissionDeniedTitle: "没有访问整理对象的权限",
    permissionDeniedBody: "页面未读取对象数据，请联系管理员确认访问范围。",
    retry: "重新尝试",
    inboxUnavailableTitle: "待归属资料列表暂不可用",
    inboxUnavailableBody: "当前没有可靠的具体对象归属数据。请在录入资料中查看资料处理状态。",
    openImportCenter: "打开录入资料",
  },
  ko: {
    title: "정보 정리",
    description: "대상을 찾은 뒤 다음 확인으로 이동합니다. 여기서는 출력 자격을 판단하지 않습니다.",
    objectCenter: "정리 대상 선택",
    branchCaseDesc: "신청, 계약, 비용, 관련 자료를 안건별로 확인합니다.",
    branchPartyDesc: "관계자의 기본 정보와 연결 대상을 확인합니다.",
    branchPropertyDesc: "주소, 호수, 임대료, 비용을 매물별로 확인합니다.",
    keyword: "검색어",
    lifecycle: "기록 상태",
    searchPlaceholder: "이름, 매물, 안건, 자료명 검색",
    filter: "필터",
    clear: "키워드 지우기",
    backToSelector: "정리 대상 선택으로 돌아가기",
    all: "전체",
    case: "안건",
    party: "관계자",
    property: "매물",
    taskUpdated: "업데이트",
    noResults: "현재 조건에 맞는 결과가 없습니다.",
    clearFilters: "키워드 지우기",
    clearKeywordHint: "키워드만 지우고 기록 상태 필터는 그대로 둔 채 다시 확인할 수 있습니다.",
    objectCount: "대상",
    continueCheck: "목록에서 계속 확인",
    relationCase: "안건 관계",
    visibilityLabel: "공개 범위",
    companyReadOnly: "회사 구성원 공개 / 읽기 전용",
    ownerReadOnly: "현재 계정은 보기 전용입니다.",
    relationParty: "연결 대상",
    relationProperty: "사용 위치",
    pageStatus: "현재 표시",
    pageOf: "페이지",
    previousPage: "이전",
    nextPage: "다음",
    activeRecords: "활성 기록",
    archivedRecords: "보관된 기록",
    allRecords: "전체 기록",
    noKeyword: "검색어 미설정",
    noRelation: "미연결",
    noDate: "-",
    personUnset: "관계자 미설정",
    propertyUnset: "매물 미설정",
    propertyRelationHint: "관계자 또는 안건과의 연결은 매물에서 확인합니다",
    corporate: "법인",
    individual: "개인",
    loadingTitle: "정리 대상을 불러오는 중",
    loadingBody: "페이지 구조를 유지하면서 권한이 있는 대상을 확인하고 있습니다.",
    loadErrorTitle: "정리 대상을 불러올 수 없습니다",
    loadErrorBody: "데이터를 가져오지 못했습니다. 서버 세부 정보는 표시하지 않으며 다시 시도할 수 있습니다.",
    permissionDeniedTitle: "정리 대상에 접근할 권한이 없습니다",
    permissionDeniedBody: "데이터를 읽지 않았습니다. 관리자에게 접근 범위를 확인하세요.",
    retry: "다시 시도",
    inboxUnavailableTitle: "미분류 자료 목록을 현재 사용할 수 없습니다",
    inboxUnavailableBody: "현재 구체적인 대상 귀속을 신뢰할 수 있는 데이터가 없습니다. 자료 입력에서 처리 상태를 확인하세요.",
    openImportCenter: "자료 입력 열기",
  },
} satisfies Record<Locale, Record<string, string>>;

function isObjectType(value: string | undefined): value is ObjectType {
  return value === "all" || value === "case" || value === "party" || value === "property" || value === "inbox";
}

function parsePage(value: string | undefined) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function buildListHref(type: ObjectType, query: string, lifecycleFilter: LifecycleFilter, page = 1) {
  const params = new URLSearchParams();
  if (type !== "all") params.set("type", type);
  if (query.trim()) params.set("q", query.trim());
  if (lifecycleFilter !== "active") params.set("lifecycle", lifecycleFilter);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/organize-center?${search}` : "/organize-center";
}

function compareWorkObjects(a: WorkObject, b: WorkObject) {
  const aTime = a.updatedAt?.getTime() ?? 0;
  const bTime = b.updatedAt?.getTime() ?? 0;
  if (aTime !== bTime) return bTime - aTime;
  return a.title.localeCompare(b.title);
}

function getLoadingTypeLabel(type: ObjectType, copy: Record<string, string>) {
  if (type === "case") return copy.case;
  if (type === "party") return copy.party;
  if (type === "property") return copy.property;
  if (type === "inbox") return copy.inboxUnavailableTitle;
  return copy.all;
}

function getLoadingLifecycleLabel(lifecycleFilter: LifecycleFilter, copy: Record<string, string>) {
  if (lifecycleFilter === "archived") return copy.archivedRecords;
  if (lifecycleFilter === "all") return copy.allRecords;
  return copy.activeRecords;
}

function OrganizeCenterLoading({ copy, params }: { copy: Record<string, string>; params: OrganizeCenterQuery }) {
  const selectedType = isObjectType(params.type) ? params.type : "all";
  const query = String(params.q ?? "").trim();
  const lifecycleFilter = normalizeLifecycleFilter(params.lifecycle);

  return (
    <ListReportShell
      className="organize-object-browser"
      scope={
        <div>
          <p className="m-0 text-sm font-bold text-slate-700">{copy.objectCenter}</p>
          <p className="mt-1 text-lg font-black text-slate-950">{getLoadingTypeLabel(selectedType, copy)}</p>
        </div>
      }
      filters={
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-slate-600" aria-label={copy.objectCenter}>
          <span>{copy.keyword}: {query || copy.noKeyword}</span>
          <span>{copy.lifecycle}: {getLoadingLifecycleLabel(lifecycleFilter, copy)}</span>
        </div>
      }
      state={
        <StateSurface tone="loading" title={copy.loadingTitle} description={copy.loadingBody} aria-live="polite">
          <div className="mt-4 h-24 rounded-lg bg-slate-100" />
        </StateSurface>
      }
    />
  );
}

function OrganizeCenterLoadError({ copy, href }: { copy: Record<string, string>; href: string }) {
  return (
    <StateSurface
      tone="error"
      title={copy.loadErrorTitle}
      description={copy.loadErrorBody}
      action={<Link href={href} className="inline-flex min-h-[var(--bd-control-height-touch)] items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3158d8]">{copy.retry}</Link>}
    />
  );
}

function OrganizeCenterPermissionError({ copy }: { copy: Record<string, string> }) {
  return (
    <StateSurface tone="permission" title={copy.permissionDeniedTitle} description={copy.permissionDeniedBody} />
  );
}

function OrganizeCenterInboxUnavailable({ copy }: { copy: Record<string, string> }) {
  return (
    <StateSurface
      tone="empty"
      title={copy.inboxUnavailableTitle}
      description={copy.inboxUnavailableBody}
      action={
        <div className="flex flex-wrap gap-2">
          <Link href="/import-center" className="inline-flex min-h-[var(--bd-control-height-touch)] items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3158d8]">
            {copy.openImportCenter}
          </Link>
          <Link href="/organize-center" className="inline-flex min-h-[var(--bd-control-height-touch)] items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3158d8]">
            {copy.backToSelector}
          </Link>
        </div>
      }
    />
  );
}

async function OrganizeCenterContent({ locale, params }: { locale: Locale; params: OrganizeCenterQuery }) {
  const copy = copyByLocale[locale];
  const selectedType = isObjectType(params.type) ? params.type : "all";
  const query = String(params.q ?? "").trim();
  const lifecycleFilter: LifecycleFilter = normalizeLifecycleFilter(params.lifecycle);
  const page = parsePage(params.page);

  let session;
  try {
    session = await requireTenantSession({ permission: "record.read" });
  } catch (error) {
    if (error instanceof TenantSessionError && error.code === "permission_denied") {
      return <OrganizeCenterPermissionError copy={copy} />;
    }
    if (error instanceof TenantSessionError && error.code === "tenant_selection_required") {
      redirect(`/workspace?reason=tenant_selection_required&returnTo=${encodeURIComponent(buildListHref(selectedType, query, lifecycleFilter, page))}`);
    }
    throw error;
  }

  if (selectedType === "inbox") {
    return <OrganizeCenterInboxUnavailable copy={copy} />;
  }

  const capabilityCanWrite = session.membership.status === "active"
    && capabilityHasTenantPermission(getTenantCapability(session.membership), "record.update");
  const capabilityCanArchive = session.membership.status === "active"
    && capabilityHasTenantPermission(getTenantCapability(session.membership), "record.archive");

  let cases;
  let parties;
  let properties;
  try {
    const requestContext = createRequestContext(session);
    const hubContext = {
      userId: session.user.id,
      tenantId: session.tenant.id,
      lifecycleStatus: lifecycleFilter,
      requestContext,
      canUpdateRecords: capabilityCanWrite,
      canArchiveRecords: capabilityCanArchive,
    };
    [cases, parties, properties] = await Promise.all([
      listBrokerageCasesForContext({ context: requestContext, lifecycleStatus: lifecycleFilter }),
      listHubParties(locale, hubContext),
      listHubProperties(locale, hubContext),
    ]);
  } catch {
    return <OrganizeCenterLoadError copy={copy} href={buildListHref(selectedType, query, lifecycleFilter, page)} />;
  }

  const caseItems: WorkObject[] = cases.flatMap(({ brokerageCase: item, resolution }) => {
    if (!item) return [];
    const applicantName = resolution.outcome === "company_read" ? "" : getCaseFieldValue(item.confirmedDataJson, "applicant.name");
    const propertyName = resolution.outcome === "company_read" ? "" : getCaseFieldValue(item.confirmedDataJson, "property.name");
    return [{
      id: item.id,
      type: "case",
      lifecycleStatus: item.lifecycleStatus ?? "active",
      title: resolution.outcome === "company_read"
        ? locale === "zh" ? "案件" : locale === "ko" ? "안건" : "案件"
        : item.caseTitle,
      subtitle: copy.case,
      relation: resolution.outcome === "company_read"
        ? locale === "zh" ? "公司成员可见（只读）" : locale === "ko" ? "회사 멤버 공개（읽기 전용）" : "会社メンバーに公開（読み取り専用）"
        : `${applicantName || copy.personUnset} / ${propertyName || copy.propertyUnset}`,
      relationLabel: resolution.outcome === "company_read" ? copy.visibilityLabel : copy.relationCase,
      updatedAt: item.updatedAt,
      href: `/cases/${encodeURIComponent(item.id)}`,
      visibilityLabel: resolution.outcome === "company_read"
        ? locale === "zh" ? "公司成员可见／只读" : locale === "ko" ? "회사 멤버 공개／읽기 전용" : "会社メンバーに公開／読み取り専用"
        : undefined,
      readOnly: resolution.outcome === "company_read",
    }];
  });

  const partyItems: WorkObject[] = parties.map((item) => {
    const canWrite = item.canWrite && capabilityCanWrite;
    return {
      id: item.id,
      type: "party",
      lifecycleStatus: item.status ?? "active",
      title: item.name,
      subtitle: item.partyType === "corporate" ? copy.corporate : copy.individual,
      relation: item.relatedPropertyHint || copy.noRelation,
      relationLabel: copy.relationParty,
      href: `/parties/${encodeURIComponent(item.id)}/edit`,
      visibilityLabel: item.readOnly ? copy.companyReadOnly : canWrite ? undefined : copy.ownerReadOnly,
      readOnly: !canWrite,
    };
  });

  const propertyItems: WorkObject[] = properties.map((item) => {
    return {
      id: item.id,
      type: "property",
      lifecycleStatus: item.status ?? "active",
      title: item.name,
      subtitle: item.area,
      relation: copy.propertyRelationHint,
      relationLabel: copy.relationProperty,
      href: `/properties/${encodeURIComponent(item.id)}/edit`,
      visibilityLabel: item.readOnly
        ? item.readOnlyReason === "company_read" ? copy.companyReadOnly : copy.ownerReadOnly
        : undefined,
      readOnly: item.readOnly,
    };
  });

  const allItems = [...caseItems, ...partyItems, ...propertyItems].sort(compareWorkObjects);
  const browserItems: OrganizeCenterBrowserItem[] = allItems.map((item) => ({
    id: item.id,
    type: item.type,
    lifecycleStatus: item.lifecycleStatus,
    title: item.title,
    subtitle: item.subtitle,
    relation: item.relation,
    relationLabel: item.relationLabel,
    updatedLabel: item.updatedAt ? formatDate(item.updatedAt, locale) : copy.noDate,
    href: item.href,
    readOnly: item.readOnly,
  }));

  return (
    <OrganizeCenterObjectBrowser
      key={`${selectedType}:${query}:${lifecycleFilter}:${page}`}
      items={browserItems}
      selectedType={selectedType}
      query={query}
      copy={copy}
      lifecycleFilter={lifecycleFilter}
      locale={locale}
      page={page}
    />
  );
}

export default async function OrganizeCenterPage({ searchParams }: OrganizeCenterPageProps) {
  const [locale, params] = await Promise.all([
    getLocale(),
    searchParams ?? Promise.resolve({} as OrganizeCenterQuery),
  ]);
  const copy = copyByLocale[locale];

  return (
    <PageFrame className="bd-page bd-organize-page space-y-6 pb-16">
      <PageHeader className="bd-page-header" title={copy.title} description={copy.description} />

      <Suspense fallback={<OrganizeCenterLoading copy={copy} params={params} />}>
        <OrganizeCenterContent locale={locale} params={params} />
      </Suspense>
    </PageFrame>
  );
}
