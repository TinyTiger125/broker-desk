import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/app/actions";
import { ClientsListReturnState } from "./clients-list-return-state";
import styles from "./clients-list-report.module.css";
import {
  CLIENT_STAGES,
  PURPOSES,
  TEMPERATURES,
  type ClientStage,
  type Purpose,
  type Temperature,
} from "@/lib/domain";
import { formatCurrency, formatDate, formatRelativeDays } from "@/lib/format";
import { listClients, type ClientListSort } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import {
  getBudgetTypeLabel,
  getClientSortOptions,
  getLoanPreApprovalLabel,
  getPurposeLabel,
  getPurposeOptions,
  getStageLabel,
  getStageOptions,
  getTemperatureLabel,
  getTemperatureOptions,
} from "@/lib/options";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

const CLIENTS_PAGE_SIZE = 12;

type ClientsPageProps = {
  searchParams?: Promise<{
    q?: string;
    stage?: string;
    purpose?: string;
    temperature?: string;
    sort?: string;
    page?: string;
  }>;
};

type ClientFilters = {
  query: string;
  stage: ClientStage | "all";
  purpose: Purpose | "all";
  temperature: Temperature | "all";
  sort: ClientListSort;
  page?: number;
};

function isPurposeFilter(value: string): value is Purpose {
  return (PURPOSES as readonly string[]).includes(value);
}

function isTemperatureFilter(value: string): value is Temperature {
  return (TEMPERATURES as readonly string[]).includes(value);
}

function isSort(value: string): value is ClientListSort {
  return ["follow_up", "recent_contact", "recent_created"].includes(value);
}

function parsePage(value?: string): number {
  const raw = value?.trim() ?? "";
  if (!/^[1-9]\d*$/.test(raw)) return 1;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : 1;
}

function buildClientsHref(filters: ClientFilters): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.stage !== "all") params.set("stage", filters.stage);
  if (filters.purpose !== "all") params.set("purpose", filters.purpose);
  if (filters.temperature !== "all") params.set("temperature", filters.temperature);
  if (filters.sort !== "follow_up") params.set("sort", filters.sort);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const search = params.toString();
  return search ? `/clients?${search}` : "/clients";
}

function formatBudget(
  budgetMin: number | undefined,
  budgetMax: number | undefined,
  locale: Parameters<typeof formatCurrency>[1],
  emptyLabel: string,
): string {
  if (budgetMin === undefined && budgetMax === undefined) return emptyLabel;
  const min = budgetMin === undefined ? emptyLabel : formatCurrency(budgetMin, locale);
  const max = budgetMax === undefined ? emptyLabel : formatCurrency(budgetMax, locale);
  return `${min} ~ ${max}`;
}

const texts = {
  ja: {
    title: "顧客",
    desc: "顧客を素早く見つけ、次にフォローする対象を判断します。",
    searchSection: "顧客を探す",
    searchLabel: "キーワード",
    search: "氏名 / 電話 / エリア / メモ",
    stage: "ステージ",
    purpose: "用途",
    temperature: "温度感",
    sort: "並び順",
    allStages: "全ステージ",
    allPurposes: "全用途",
    allTemps: "全温度感",
    filter: "検索",
    clear: "条件をクリア",
    results: "顧客一覧",
    resultRange: (start: number, end: number, total: number) => `${start}–${end} / ${total}名`,
    page: (current: number, total: number) => `${current} / ${total}ページ`,
    previous: "前のページ",
    next: "次のページ",
    colName: "顧客名",
    colStatus: "ステージ / 用途 / 温度感",
    colIntent: "希望条件",
    colFollowUp: "フォロー",
    colActions: "次の操作",
    contact: "連絡先",
    area: "希望エリア",
    budget: "予算",
    budgetType: "予算種別",
    loan: "ローン事前審査",
    lastContact: "最終連絡",
    nextFollowUp: "次回フォロー",
    detail: "詳細を開く",
    addFollow: "フォロー追加",
    createQuote: "提案作成",
    dash: "-",
    noResult: "条件に一致する顧客がいません。",
    quickTitle: "クイック登録",
    quickDesc: "検索・絞り込みの下に、既存の最小登録フォームを置いています。",
    name: "氏名",
    phone: "電話番号",
    budgetMax: "予算上限",
    quickSave: "保存",
    quickOpen: "登録フォームを開く",
  },
  zh: {
    title: "客户",
    desc: "快速找到目标客户，并判断下一步应该跟进谁。",
    searchSection: "查找客户",
    searchLabel: "关键词",
    search: "姓名 / 电话 / 区域 / 备注",
    stage: "阶段",
    purpose: "用途",
    temperature: "温度",
    sort: "排序",
    allStages: "全部阶段",
    allPurposes: "全部用途",
    allTemps: "全部温度",
    filter: "查找",
    clear: "清除条件",
    results: "客户列表",
    resultRange: (start: number, end: number, total: number) => `${start}–${end} / 共 ${total} 位`,
    page: (current: number, total: number) => `第 ${current} / ${total} 页`,
    previous: "上一页",
    next: "下一页",
    colName: "客户",
    colStatus: "阶段 / 用途 / 温度",
    colIntent: "意向条件",
    colFollowUp: "跟进",
    colActions: "下一步操作",
    contact: "联系方式",
    area: "意向区域",
    budget: "预算",
    budgetType: "预算类型",
    loan: "贷款预审",
    lastContact: "最近联系",
    nextFollowUp: "下次跟进",
    detail: "打开详情",
    addFollow: "添加跟进",
    createQuote: "创建提案",
    dash: "-",
    noResult: "没有符合条件的客户。",
    quickTitle: "快速创建",
    quickDesc: "把既有的最小创建表单放在查找结果之后，保存语义保持不变。",
    name: "姓名",
    phone: "电话",
    budgetMax: "预算上限",
    quickSave: "保存",
    quickOpen: "打开创建表单",
  },
  ko: {
    title: "고객",
    desc: "고객을 빠르게 찾고 다음에 후속 대응할 대상을 판단합니다.",
    searchSection: "고객 찾기",
    searchLabel: "키워드",
    search: "이름 / 전화 / 지역 / 메모",
    stage: "단계",
    purpose: "용도",
    temperature: "온도",
    sort: "정렬",
    allStages: "전체 단계",
    allPurposes: "전체 용도",
    allTemps: "전체 온도",
    filter: "검색",
    clear: "조건 지우기",
    results: "고객 목록",
    resultRange: (start: number, end: number, total: number) => `${start}–${end} / ${total}명`,
    page: (current: number, total: number) => `${current} / ${total}페이지`,
    previous: "이전 페이지",
    next: "다음 페이지",
    colName: "고객명",
    colStatus: "단계 / 용도 / 온도",
    colIntent: "희망 조건",
    colFollowUp: "후속 대응",
    colActions: "다음 작업",
    contact: "연락처",
    area: "희망 지역",
    budget: "예산",
    budgetType: "예산 유형",
    loan: "대출 사전심사",
    lastContact: "최근 연락",
    nextFollowUp: "다음 후속 일정",
    detail: "상세 열기",
    addFollow: "후속 대응 추가",
    createQuote: "제안 작성",
    dash: "-",
    noResult: "조건에 맞는 고객이 없습니다.",
    quickTitle: "빠른 등록",
    quickDesc: "기존 최소 등록 양식은 검색 결과 아래에 두며 저장 의미는 바꾸지 않습니다.",
    name: "이름",
    phone: "전화번호",
    budgetMax: "예산 상한",
    quickSave: "저장",
    quickOpen: "등록 양식 열기",
  },
} as const;

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.read" }),
  ]);
  const text = texts[locale];

  const stageLabel = getStageLabel(locale);
  const stageOptions = getStageOptions(locale);
  const purposeLabel = getPurposeLabel(locale);
  const purposeOptions = getPurposeOptions(locale);
  const temperatureLabel = getTemperatureLabel(locale);
  const temperatureOptions = getTemperatureOptions(locale);
  const budgetTypeLabel = getBudgetTypeLabel(locale);
  const loanPreApprovalLabel = getLoanPreApprovalLabel(locale);
  const clientSortOptions = getClientSortOptions(locale);

  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const stageParam = params.stage ?? "all";
  const purposeParam = params.purpose ?? "all";
  const temperatureParam = params.temperature ?? "all";
  const sortParam = params.sort ?? "follow_up";
  const requestedPage = parsePage(params.page);

  const stage =
    stageParam !== "all" && CLIENT_STAGES.includes(stageParam as ClientStage)
      ? (stageParam as ClientStage)
      : "all";
  const purpose = purposeParam !== "all" && isPurposeFilter(purposeParam) ? purposeParam : "all";
  const temperature =
    temperatureParam !== "all" && isTemperatureFilter(temperatureParam) ? temperatureParam : "all";
  const sort = isSort(sortParam) ? sortParam : "follow_up";
  const filters = { query, stage, purpose, temperature, sort } satisfies Omit<ClientFilters, "page">;

  const clients = await listClients(session.user.id, {
    query: query || undefined,
    stage,
    purpose,
    temperature,
    sort,
    tenantId: session.tenant.id,
  });

  const pageCount = Math.max(1, Math.ceil(clients.length / CLIENTS_PAGE_SIZE));
  const safePage = Math.min(requestedPage, pageCount);
  if (params.page !== undefined && (params.page !== String(safePage) || safePage === 1)) {
    redirect(buildClientsHref({ ...filters, page: safePage }));
  }

  const visibleClients = clients.slice(
    (safePage - 1) * CLIENTS_PAGE_SIZE,
    safePage * CLIENTS_PAGE_SIZE,
  );
  const rangeStart = clients.length === 0 ? 0 : (safePage - 1) * CLIENTS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(clients.length, safePage * CLIENTS_PAGE_SIZE);
  const clearHref = buildClientsHref({
    query: "",
    stage: "all",
    purpose: "all",
    temperature: "all",
    sort: "follow_up",
  });

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headingBlock}>
          <p className={styles.eyebrow}>{text.searchSection}</p>
          <h1 className={styles.title}>{text.title}</h1>
          <p className={styles.description}>{text.desc}</p>
        </div>
      </header>

      <section className={styles.filterSurface} aria-labelledby="clients-search-heading">
        <div className={styles.sectionHeading}>
          <h2 id="clients-search-heading" className={styles.sectionTitle}>{text.searchSection}</h2>
          <Link href={clearHref} className={styles.clearLink}>{text.clear}</Link>
        </div>
        <form action="/clients" method="get" className={styles.filterForm}>
          <label className={`${styles.filterField} ${styles.searchField}`}>
            <span className={styles.fieldLabel}>{text.searchLabel}</span>
            <input
              name="q"
              placeholder={text.search}
              defaultValue={query}
              className={styles.control}
            />
          </label>
          <label className={styles.filterField}>
            <span className={styles.fieldLabel}>{text.stage}</span>
            <select name="stage" defaultValue={stage} className={styles.control}>
              <option value="all">{text.allStages}</option>
              {stageOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.fieldLabel}>{text.purpose}</span>
            <select name="purpose" defaultValue={purpose} className={styles.control}>
              <option value="all">{text.allPurposes}</option>
              {purposeOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.fieldLabel}>{text.temperature}</span>
            <select name="temperature" defaultValue={temperature} className={styles.control}>
              <option value="all">{text.allTemps}</option>
              {temperatureOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.fieldLabel}>{text.sort}</span>
            <select name="sort" defaultValue={sort} className={styles.control}>
              {clientSortOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <button type="submit" className={styles.primaryButton}>{text.filter}</button>
        </form>
      </section>

      <ClientsListReturnState>
        <section className={styles.resultSurface} aria-labelledby="clients-results-heading">
          <div className={styles.resultHeader}>
            <div>
              <h2 id="clients-results-heading" className={styles.sectionTitle}>{text.results}</h2>
              <p className={styles.resultSummary}>{text.resultRange(rangeStart, rangeEnd, clients.length)}</p>
            </div>
            {pageCount > 1 ? (
              <nav aria-label={text.results} className={styles.pagination}>
                {safePage > 1 ? (
                  <Link href={buildClientsHref({ ...filters, page: safePage - 1 })} className={styles.paginationLink}>
                    {text.previous}
                  </Link>
                ) : null}
                <span className={styles.pageStatus}>{text.page(safePage, pageCount)}</span>
                {safePage < pageCount ? (
                  <Link href={buildClientsHref({ ...filters, page: safePage + 1 })} className={styles.paginationLink}>
                    {text.next}
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </div>

          {clients.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>{text.noResult}</p>
              <Link href={clearHref} className={styles.emptyAction}>{text.clear}</Link>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.resultTable}>
                <thead>
                  <tr>
                    <th scope="col">{text.colName}</th>
                    <th scope="col">{text.colStatus}</th>
                    <th scope="col" className={styles.tabletOptional}>{text.colIntent}</th>
                    <th scope="col">{text.colFollowUp}</th>
                    <th scope="col">{text.colActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleClients.map((client) => (
                    <tr key={client.id} className={styles.resultRow}>
                        <td className={styles.clientCell}>
                        <Link
                          href={`/clients/${client.id}`}
                          data-client-link={`name:${client.id}`}
                          aria-label={`${client.name} · ${text.detail}`}
                          className={styles.nameLink}
                        >
                          {client.name}
                        </Link>
                        <div className={`${styles.clientSubline} ${styles.clientSecondary}`}>
                          <span>{text.contact}: {client.phone || text.dash}</span>
                          <span className={styles.clientSecondaryWide}>{text.area}: {client.preferredArea ?? text.dash}</span>
                        </div>
                      </td>
                      <td className={styles.statusCell}>
                        <span className={styles.mobileCellLabel}>{text.colStatus}</span>
                        <div className={styles.statusStack}>
                          <span className={`${styles.statusItem} ${styles.statusPrimary}`}>
                            <span className={styles.statusKey}>{text.stage}</span>
                            <span>{stageLabel[client.stage]}</span>
                          </span>
                          <span className={styles.statusItem}>
                            <span className={styles.statusKey}>{text.purpose}</span>
                            <span>{purposeLabel[client.purpose]}</span>
                          </span>
                          <span className={styles.statusItem}>
                            <span className={styles.statusKey}>{text.temperature}</span>
                            <span>{temperatureLabel[client.temperature]}</span>
                          </span>
                        </div>
                      </td>
                      <td className={`${styles.intentCell} ${styles.tabletOptional}`}>
                        <p className={styles.detailLine}><span>{text.budget}</span> {formatBudget(client.budgetMin, client.budgetMax, locale, text.dash)}</p>
                        <p className={styles.detailLine}><span>{text.budgetType}</span> {budgetTypeLabel[client.budgetType]}</p>
                        <p className={styles.detailLine}><span>{text.loan}</span> {loanPreApprovalLabel[client.loanPreApprovalStatus]}</p>
                      </td>
                      <td className={styles.followCell}>
                        <span className={styles.mobileCellLabel}>{text.nextFollowUp}</span>
                        <p className={styles.followDate}>{formatDate(client.nextFollowUpAt, locale)}</p>
                        <p className={styles.followRelative}>{formatRelativeDays(client.nextFollowUpAt, locale)}</p>
                        <p className={`${styles.lastContact} ${styles.tabletOptional}`}>
                          {text.lastContact}: {formatDate(client.lastContactedAt, locale)}
                        </p>
                      </td>
                      <td className={styles.actionsCell}>
                        <div className={styles.secondaryActions}>
                          <Link
                            href={`/clients/${client.id}#timeline`}
                            data-client-link={`follow:${client.id}`}
                            aria-label={`${text.addFollow}: ${client.name}`}
                            className={styles.secondaryLink}
                          >
                            {text.addFollow}
                          </Link>
                          <Link
                            href={`/quotes/new?clientId=${client.id}`}
                            data-client-link={`quote:${client.id}`}
                            aria-label={`${text.createQuote}: ${client.name}`}
                            className={styles.secondaryLink}
                          >
                            {text.createQuote}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </ClientsListReturnState>

      <details className={styles.quickDetails}>
        <summary className={styles.quickSummary}>
          <span className={styles.quickSummaryText}>
            <span className={styles.quickTitle}>{text.quickTitle}</span>
            <span className={styles.quickDesc}>{text.quickDesc}</span>
          </span>
          <span className={styles.quickOpen}>{text.quickOpen}</span>
        </summary>
        <div className={styles.quickBody}>
          <form action={createClient} className={styles.quickForm}>
            <input name="name" required placeholder={text.name} aria-label={text.name} className={styles.control} />
            <input name="phone" required placeholder={text.phone} aria-label={text.phone} className={styles.control} />
            <input name="preferredArea" placeholder={text.area} aria-label={text.area} className={styles.control} />
            <input name="budgetMax" type="number" placeholder={text.budgetMax} aria-label={text.budgetMax} className={styles.control} />
            <select name="stage" defaultValue="lead" aria-label={text.stage} className={styles.control}>
              {stageOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <button type="submit" name="afterSave" value="list" className={styles.primaryButton}>
              {text.quickSave}
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}
