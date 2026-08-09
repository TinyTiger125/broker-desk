import {
  OrganizeCenterObjectBrowser,
  type OrganizeCenterBrowserItem,
} from "@/components/organize-center-object-browser";
import { listBrokerageCases } from "@/lib/data";
import { getCaseFieldValue } from "@/lib/case-field-normalization";
import { formatDate } from "@/lib/format";
import {
  listHubImportJobs,
  listHubParties,
  listHubProperties,
  type HubImportJobItem,
} from "@/lib/hub";
import { getLocale, type Locale } from "@/lib/locale";
import { normalizeLifecycleFilter, type LifecycleFilter } from "@/lib/record-lifecycle";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

type OrganizeCenterPageProps = {
  searchParams?: Promise<{ type?: string; q?: string; lifecycle?: string }>;
};

type ObjectType = "all" | "case" | "party" | "property" | "inbox";
type ObjectStatus = "all" | "unconfirmed" | "inconsistent" | "insufficient" | "complete";

type WorkObject = {
  id: string;
  type: Exclude<ObjectType, "all">;
  status: Exclude<ObjectStatus, "all">;
  title: string;
  subtitle: string;
  relation: string;
  relationLabel: string;
  statusNote: string;
  updatedAt?: Date;
  href: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  lifecycleStatus: "active" | "archived";
};

const copyByLocale = {
  ja: {
    title: "情報整理",
    objectCenter: "優先すべき情報",
    branchCaseDesc: "申込、契約、費用、関係資料を案件ごとに確認します。",
    branchPartyDesc: "顧客、オーナー、入居者、保証人を確認します。",
    branchPropertyDesc: "住所、部屋番号、賃料、費用を物件ごとに確認します。",
    branchInboxDesc: "未整理の資料を正しい対象に割り当てます。",
    searchPlaceholder: "名前、物件、案件、資料名で検索",
    filter: "絞り込み",
    all: "すべて",
    case: "案件",
    party: "顧客",
    property: "物件",
    inbox: "未整理",
    unconfirmed: "未確認",
    inconsistent: "不一致",
    insufficient: "資料不足",
    complete: "完了",
    statusNote: "現在の状態",
    taskUpdated: "更新",
    empty: "条件に一致する対象がありません。",
    corporate: "法人",
    individual: "個人",
    noRelation: "未紐付け",
    noDate: "-",
    personUnset: "顧客未設定",
    propertyUnset: "物件未設定",
    propertyRelationHint: "関係者や案件に紐付けて使います",
    reasonCaseNeeds: "未入力や要確認の項目があります。",
    reasonCaseReady: "入力済みです。関連資料の追加や内容確認を続けられます。",
    reasonCaseUnconfirmed: "資料の内容をまだ確認していません。",
    reasonCaseInconsistent: "資料間に確認すべき差分があります。",
    reasonPartyNeeds: "顧客情報に未入力があります。",
    reasonPartyReady: "入力済みです。関連案件や物件と合わせて確認できます。",
    reasonPropertyNeeds: "物件の価格、管理費、修繕積立などの基礎情報が不足しています。",
    reasonPropertyReady: "入力済みです。案件や顧客と紐付けて使えます。",
    reasonInbox: "紐付け先を決めます。",
    relationCase: "案件内の関係",
    relationParty: "関係先",
    relationProperty: "利用先",
    relationInbox: "紐付け先",
    pageStatus: "表示中",
    previousPage: "前へ",
    nextPage: "次へ",
    activeRecords: "有効な記録",
    archivedRecords: "保管済み",
    allRecords: "すべての記録",
  },
  zh: {
    title: "整理信息",
    objectCenter: "选择整理对象",
    branchCaseDesc: "申请、合同、费用和关联资料集中在这里。",
    branchPartyDesc: "客户、业主、租客、保证人集中在这里。",
    branchPropertyDesc: "房源地址、房号、租金和费用集中在这里。",
    branchInboxDesc: "未归类文件先在这里分配归属。",
    searchPlaceholder: "搜索姓名、物件、案件、资料名",
    filter: "筛选",
    all: "全部",
    case: "案件",
    party: "主体",
    property: "物件",
    inbox: "待归属资料",
    unconfirmed: "未确认",
    inconsistent: "不一致",
    insufficient: "资料不足",
    complete: "已完成",
    statusNote: "当前状态",
    taskUpdated: "更新",
    empty: "没有符合条件的对象。",
    corporate: "法人",
    individual: "个人",
    noRelation: "未关联",
    noDate: "-",
    personUnset: "主体未设置",
    propertyUnset: "物件未设置",
    propertyRelationHint: "可关联主体或案件后继续使用",
    reasonCaseNeeds: "还有未确认内容，打开后继续补齐。",
    reasonCaseReady: "已整理，可继续查看资料和输出文件。",
    reasonCaseUnconfirmed: "有读取内容等待确认。",
    reasonCaseInconsistent: "有差异需要确认。",
    reasonPartyNeeds: "联系方式或角色还需要补齐。",
    reasonPartyReady: "已整理，可查看关联案件或物件。",
    reasonPropertyNeeds: "房号、地址、租金或费用还需要补齐。",
    reasonPropertyReady: "已整理，可关联案件或主体继续使用。",
    reasonInbox: "先选择这份资料属于哪个案件、主体或物件。",
    relationCase: "案件关系",
    relationParty: "关联对象",
    relationProperty: "使用位置",
    relationInbox: "归属对象",
    pageStatus: "当前显示",
    previousPage: "上一页",
    nextPage: "下一页",
    activeRecords: "有效记录",
    archivedRecords: "已归档",
    allRecords: "全部记录",
  },
  ko: {
    title: "정보 정리",
    objectCenter: "정리 대상 선택",
    branchCaseDesc: "신청, 계약, 비용, 관련 자료를 안건별로 확인합니다.",
    branchPartyDesc: "고객, 소유자, 입주자, 보증인을 확인합니다.",
    branchPropertyDesc: "주소, 호수, 임대료, 비용을 매물별로 확인합니다.",
    branchInboxDesc: "미분류 파일을 알맞은 대상에 연결합니다.",
    searchPlaceholder: "이름, 매물, 안건, 자료명 검색",
    filter: "필터",
    all: "전체",
    case: "안건",
    party: "관계자",
    property: "매물",
    inbox: "미분류 자료",
    unconfirmed: "미확인",
    inconsistent: "불일치",
    insufficient: "자료 부족",
    complete: "완료",
    statusNote: "현재 상태",
    taskUpdated: "업데이트",
    empty: "조건에 맞는 대상이 없습니다.",
    corporate: "법인",
    individual: "개인",
    noRelation: "미연결",
    noDate: "-",
    personUnset: "관계자 미설정",
    propertyUnset: "매물 미설정",
    propertyRelationHint: "관계자 또는 안건에 연결해 사용합니다",
    reasonCaseNeeds: "안건 자료에 보완할 항목이 있습니다. 관계자, 매물, 비용 등 기본 정보를 확인합니다.",
    reasonCaseReady: "안건 기본 정보가 정리되었습니다. 자료 추가 또는 관련 내용 확인을 계속할 수 있습니다.",
    reasonCaseUnconfirmed: "읽은 내용을 아직 확인하지 않았습니다.",
    reasonCaseInconsistent: "자료 사이에 확인할 차이가 있습니다.",
    reasonPartyNeeds: "관계자의 연락처 또는 역할 정보가 부족합니다. 관련 안건과 연결하기 전에 확인합니다.",
    reasonPartyReady: "관계자 기본 정보가 정리되었습니다. 관련 안건이나 매물과 함께 확인할 수 있습니다.",
    reasonPropertyNeeds: "매물의 가격, 관리비, 수선비 등 기본 정보가 부족합니다.",
    reasonPropertyReady: "매물 기본 정보가 정리되었습니다. 안건이나 관계자와 연결해 사용할 수 있습니다.",
    reasonInbox: "자료가 아직 안건, 관계자, 매물에 연결되지 않았습니다. 먼저 연결 대상을 정합니다.",
    relationCase: "안건 관계",
    relationParty: "연결 대상",
    relationProperty: "사용 위치",
    relationInbox: "연결 대상",
    pageStatus: "현재 표시",
    previousPage: "이전",
    nextPage: "다음",
    activeRecords: "활성 기록",
    archivedRecords: "보관된 기록",
    allRecords: "전체 기록",
  },
} satisfies Record<Locale, Record<string, string>>;

function isObjectType(value: string | undefined): value is ObjectType {
  return value === "all" || value === "case" || value === "party" || value === "property" || value === "inbox";
}

function getStatusLabel(status: ObjectStatus, copy: Record<string, string>) {
  if (status === "unconfirmed") return copy.unconfirmed;
  if (status === "inconsistent") return copy.inconsistent;
  if (status === "insufficient") return copy.insufficient;
  if (status === "complete") return copy.complete;
  return copy.all;
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

const objectStatusRank: Record<WorkObject["status"], number> = {
  inconsistent: 0,
  unconfirmed: 1,
  insufficient: 2,
  complete: 3,
};

function compareWorkObjects(a: WorkObject, b: WorkObject) {
  const aTime = a.updatedAt?.getTime() ?? 0;
  const bTime = b.updatedAt?.getTime() ?? 0;
  if (aTime !== bTime) return bTime - aTime;
  const statusDiff = objectStatusRank[a.status] - objectStatusRank[b.status];
  if (statusDiff !== 0) return statusDiff;
  return a.title.localeCompare(b.title);
}

function countCaseFields(data: Record<string, unknown>) {
  return Object.keys(data).filter((key) => !key.startsWith("__")).length;
}

export default async function OrganizeCenterPage({ searchParams }: OrganizeCenterPageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.read" }),
  ]);
  const copy = copyByLocale[locale];
  const params = searchParams ? await searchParams : undefined;
  const selectedType = isObjectType(params?.type) ? params.type : "all";
  const query = String(params?.q ?? "").trim();
  const lifecycleFilter: LifecycleFilter = normalizeLifecycleFilter(params?.lifecycle);
  const context = { userId: session.user.id, tenantId: session.tenant.id, lifecycleStatus: lifecycleFilter };

  const [cases, parties, properties, importJobs] = await Promise.all([
    listBrokerageCases(session.user.id, 100, session.tenant.id, lifecycleFilter),
    listHubParties(locale, context),
    listHubProperties(locale, context),
    listHubImportJobs(context),
  ]);

  const assignedImportJobIds = new Set(cases.flatMap((item) => item.sourceImportJobIds));
  const caseItems: WorkObject[] = cases.map((item) => {
    const savedFieldCount = countCaseFields(item.confirmedDataJson ?? {});
    const applicantName = getCaseFieldValue(item.confirmedDataJson, "applicant.name");
    const propertyName = getCaseFieldValue(item.confirmedDataJson, "property.name");
    const status: WorkObject["status"] =
      item.status === "reviewed" && savedFieldCount > 0
        ? "complete"
        : item.sourceImportJobIds.length > 0
          ? "unconfirmed"
          : "insufficient";
    return {
      id: item.id,
      type: "case",
      status,
      lifecycleStatus: item.lifecycleStatus ?? "active",
      title: item.caseTitle,
      subtitle: getStatusLabel(status, copy),
      relation: `${applicantName || copy.personUnset} / ${propertyName || copy.propertyUnset}`,
      relationLabel: copy.relationCase,
      statusNote:
        status === "complete"
          ? copy.reasonCaseReady
          : status === "unconfirmed"
            ? copy.reasonCaseUnconfirmed
            : copy.reasonCaseNeeds,
      updatedAt: item.updatedAt,
      href: `/cases/${encodeURIComponent(item.id)}`,
    };
  });

  const partyItems: WorkObject[] = parties.map((item) => {
    const hasContact = Boolean(item.phone || item.email);
    const status: WorkObject["status"] = hasContact ? "complete" : "insufficient";
    return {
      id: item.id,
      type: "party",
      status,
      lifecycleStatus: item.status ?? "active",
      title: item.name,
      subtitle: item.partyType === "corporate" ? copy.corporate : copy.individual,
      relation: item.relatedPropertyHint || copy.noRelation,
      relationLabel: copy.relationParty,
      statusNote: status === "complete" ? copy.reasonPartyReady : copy.reasonPartyNeeds,
      href: `/parties/${encodeURIComponent(item.id)}/edit`,
    };
  });

  const propertyItems: WorkObject[] = properties.map((item) => {
    const status: WorkObject["status"] =
      item.listingPrice > 0 || item.managementFee > 0 || item.repairFee > 0 ? "complete" : "insufficient";
    return {
      id: item.id,
      type: "property",
      status,
      lifecycleStatus: item.status ?? "active",
      title: item.name,
      subtitle: item.area,
      relation: copy.propertyRelationHint,
      relationLabel: copy.relationProperty,
      statusNote: status === "complete" ? copy.reasonPropertyReady : copy.reasonPropertyNeeds,
      href: `/properties/${encodeURIComponent(item.id)}/edit`,
    };
  });

  const inboxItems: WorkObject[] = importJobs
    .filter((item) => !assignedImportJobIds.has(item.id))
    .map((item) => ({
      id: item.id,
      type: "inbox",
      status: "unconfirmed",
      lifecycleStatus: "active",
      title: item.title,
      subtitle: getSourceTypeLabel(locale, item.sourceType),
      relation: copy.noRelation,
      relationLabel: copy.relationInbox,
      statusNote: copy.reasonInbox,
      updatedAt: item.createdAt,
      href: `/import-center?job=${encodeURIComponent(item.id)}`,
    }));

  const allItems = [...caseItems, ...partyItems, ...propertyItems, ...inboxItems].sort(compareWorkObjects);

  const browserItems: OrganizeCenterBrowserItem[] = allItems.map((item) => ({
    id: item.id,
    type: item.type,
    status: item.status,
    lifecycleStatus: item.lifecycleStatus,
    title: item.title,
    subtitle: item.subtitle,
    relation: item.relation,
    relationLabel: item.relationLabel,
    statusNote: item.statusNote,
    updatedLabel: item.updatedAt ? formatDate(item.updatedAt, locale) : copy.noDate,
    href: item.href,
    secondaryHref: item.secondaryHref,
    secondaryLabel: item.secondaryLabel,
  }));
  return (
    <div className="bd-page bd-organize-page space-y-6">
      <header className="bd-page-header">
        <h1 className="text-3xl font-black tracking-tight text-slate-950">{copy.title}</h1>
      </header>

      <section className="bd-section">
        {selectedType === "all" ? (
          <div className="border-b border-slate-200 p-4">
            <div>
              <h2 className="text-base font-black text-slate-950">{copy.objectCenter}</h2>
            </div>
          </div>
        ) : null}

        <OrganizeCenterObjectBrowser
          key={`${selectedType}:${query}:${lifecycleFilter}`}
          items={browserItems}
          selectedType={selectedType}
          query={query}
          copy={copy}
          lifecycleFilter={lifecycleFilter}
          locale={locale}
        />
      </section>
    </div>
  );
}
