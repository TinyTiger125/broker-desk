import Link from "next/link";
import { createClient } from "@/app/actions";
import {
  CLIENT_STAGES,
  PURPOSES,
  TEMPERATURES,
  type ClientStage,
  type Purpose,
  type Temperature,
} from "@/lib/domain";
import { formatCurrency, formatDate, formatRelativeDays } from "@/lib/format";
import { getDefaultUser, listClients, type ClientListSort } from "@/lib/data";
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

export const dynamic = "force-dynamic";

type ClientsPageProps = {
  searchParams?: Promise<{
    q?: string;
    stage?: string;
    purpose?: string;
    temperature?: string;
    sort?: string;
  }>;
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

const texts = {
  ja: {
    noUser: "利用可能なユーザーがありません。",
    title: "顧客管理",
    desc: "ステージ・用途・温度感で絞り込み、優先顧客を素早く特定します。",
    board: "ボード表示",
    create: "+ 新規顧客",
    search: "氏名 / 電話 / エリア / メモで検索",
    allStages: "全ステージ",
    allPurposes: "全用途",
    allTemps: "全温度感",
    filter: "絞り込む",
    colName: "顧客名",
    colContact: "連絡先",
    colArea: "希望エリア",
    colBudget: "予算",
    colBudgetType: "予算種別",
    colPurpose: "用途",
    colLoan: "ローン事前審査",
    colStage: "ステージ",
    colTemp: "温度感",
    colLast: "最終連絡",
    colNext: "次回フォロー",
    colActions: "アクション",
    dash: "-",
    detail: "詳細",
    addFollow: "フォロー追加",
    createQuote: "提案作成",
    noResult: "条件に一致する顧客がいません。",
    quickTitle: "クイック登録（一覧内）",
    quickDesc: "一覧を離れずに最小情報で登録できます。",
    name: "氏名",
    phone: "電話番号",
    area: "エリア",
    budgetMax: "予算上限",
    quickSave: "すぐ保存",
    tempPrefix: "温度感",
  },
  zh: {
    noUser: "没有可用用户。",
    title: "客户管理",
    desc: "按阶段、用途、温度筛选，快速锁定优先客户。",
    board: "看板视图",
    create: "+ 新建客户",
    search: "按姓名 / 电话 / 区域 / 备注搜索",
    allStages: "全部阶段",
    allPurposes: "全部用途",
    allTemps: "全部温度",
    filter: "筛选",
    colName: "客户名",
    colContact: "联系方式",
    colArea: "意向区域",
    colBudget: "预算",
    colBudgetType: "预算类型",
    colPurpose: "用途",
    colLoan: "贷款预审",
    colStage: "阶段",
    colTemp: "温度",
    colLast: "最近联系",
    colNext: "下次跟进",
    colActions: "操作",
    dash: "-",
    detail: "详情",
    addFollow: "添加跟进",
    createQuote: "创建提案",
    noResult: "没有符合条件的客户。",
    quickTitle: "快速录入（列表内）",
    quickDesc: "无需离开列表即可录入最小信息。",
    name: "姓名",
    phone: "电话",
    area: "区域",
    budgetMax: "预算上限",
    quickSave: "立即保存",
    tempPrefix: "温度",
  },
  ko: {
    noUser: "사용 가능한 사용자가 없습니다.",
    title: "고객 관리",
    desc: "단계/용도/온도로 필터링해 우선 고객을 빠르게 찾습니다.",
    board: "보드 보기",
    create: "+ 신규 고객",
    search: "이름 / 전화 / 지역 / 메모 검색",
    allStages: "전체 단계",
    allPurposes: "전체 용도",
    allTemps: "전체 온도",
    filter: "필터",
    colName: "고객명",
    colContact: "연락처",
    colArea: "희망 지역",
    colBudget: "예산",
    colBudgetType: "예산 유형",
    colPurpose: "용도",
    colLoan: "대출 사전심사",
    colStage: "단계",
    colTemp: "온도",
    colLast: "최근 연락",
    colNext: "다음 팔로업",
    colActions: "작업",
    dash: "-",
    detail: "상세",
    addFollow: "팔로업 추가",
    createQuote: "제안 작성",
    noResult: "조건에 맞는 고객이 없습니다.",
    quickTitle: "빠른 등록(목록 내)",
    quickDesc: "목록을 벗어나지 않고 최소 정보로 등록할 수 있습니다.",
    name: "이름",
    phone: "전화번호",
    area: "지역",
    budgetMax: "예산 상한",
    quickSave: "바로 저장",
    tempPrefix: "온도",
  },
} as const;

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const locale = await getLocale();
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

  const user = await getDefaultUser();
  if (!user) {
    return <p className="text-sm text-slate-600">{text.noUser}</p>;
  }

  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const stageParam = params.stage ?? "all";
  const purposeParam = params.purpose ?? "all";
  const temperatureParam = params.temperature ?? "all";
  const sortParam = params.sort ?? "follow_up";

  const stage =
    stageParam !== "all" && CLIENT_STAGES.includes(stageParam as ClientStage)
      ? (stageParam as ClientStage)
      : "all";
  const purpose = purposeParam !== "all" && isPurposeFilter(purposeParam) ? purposeParam : "all";
  const temperature =
    temperatureParam !== "all" && isTemperatureFilter(temperatureParam) ? temperatureParam : "all";
  const sort = isSort(sortParam) ? sortParam : "follow_up";

  const clients = await listClients(user.id, {
    query: query || undefined,
    stage,
    purpose,
    temperature,
    sort,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{text.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{text.desc}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/board" className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
            {text.board}
          </Link>
          <Link href="/clients/new" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
            {text.create}
          </Link>
        </div>
      </header>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form className="grid gap-3 md:grid-cols-5">
          <input
            name="q"
            placeholder={text.search}
            defaultValue={query}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring"
          />
          <select name="stage" defaultValue={stage} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="all">{text.allStages}</option>
            {stageOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select name="purpose" defaultValue={purpose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="all">{text.allPurposes}</option>
            {purposeOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select name="temperature" defaultValue={temperature} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="all">{text.allTemps}</option>
            {temperatureOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {text.tempPrefix} {item.label}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select name="sort" defaultValue={sort} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {clientSortOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              {text.filter}
            </button>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-2 py-2 font-medium">{text.colName}</th>
                <th className="px-2 py-2 font-medium">{text.colContact}</th>
                <th className="px-2 py-2 font-medium">{text.colArea}</th>
                <th className="px-2 py-2 font-medium">{text.colBudget}</th>
                <th className="px-2 py-2 font-medium">{text.colBudgetType}</th>
                <th className="px-2 py-2 font-medium">{text.colPurpose}</th>
                <th className="px-2 py-2 font-medium">{text.colLoan}</th>
                <th className="px-2 py-2 font-medium">{text.colStage}</th>
                <th className="px-2 py-2 font-medium">{text.colTemp}</th>
                <th className="px-2 py-2 font-medium">{text.colLast}</th>
                <th className="px-2 py-2 font-medium">{text.colNext}</th>
                <th className="px-2 py-2 font-medium">{text.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="border-b border-slate-100 text-slate-700">
                  <td className="px-2 py-3 font-medium text-slate-900">{client.name}</td>
                  <td className="px-2 py-3">{client.phone}</td>
                  <td className="px-2 py-3">{client.preferredArea ?? text.dash}</td>
                  <td className="px-2 py-3">
                    {client.budgetMin || client.budgetMax
                      ? `${formatCurrency(client.budgetMin ?? 0, locale)} ~ ${formatCurrency(client.budgetMax ?? 0, locale)}`
                      : text.dash}
                  </td>
                  <td className="px-2 py-3">{budgetTypeLabel[client.budgetType]}</td>
                  <td className="px-2 py-3">{purposeLabel[client.purpose]}</td>
                  <td className="px-2 py-3">{loanPreApprovalLabel[client.loanPreApprovalStatus]}</td>
                  <td className="px-2 py-3">{stageLabel[client.stage]}</td>
                  <td className="px-2 py-3">{temperatureLabel[client.temperature]}</td>
                  <td className="px-2 py-3">{formatDate(client.lastContactedAt, locale)}</td>
                  <td className="px-2 py-3">
                    {formatDate(client.nextFollowUpAt, locale)}
                    <p className="text-xs text-slate-500">{formatRelativeDays(client.nextFollowUpAt, locale)}</p>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-col gap-1 text-xs">
                      <Link href={`/clients/${client.id}`} className="text-blue-700 hover:underline">
                        {text.detail}
                      </Link>
                      <Link href={`/clients/${client.id}#timeline`} className="text-blue-700 hover:underline">
                        {text.addFollow}
                      </Link>
                      <Link href={`/quotes/new?clientId=${client.id}`} className="text-blue-700 hover:underline">
                        {text.createQuote}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-2 py-8 text-center text-slate-500">
                    {text.noResult}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{text.quickTitle}</h2>
        <p className="mt-1 text-xs text-slate-500">{text.quickDesc}</p>
        <form action={createClient} className="mt-4 grid gap-2 md:grid-cols-6">
          <input name="name" required placeholder={text.name} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="phone" required placeholder={text.phone} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="preferredArea" placeholder={text.area} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="budgetMax" type="number" placeholder={text.budgetMax} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select name="stage" defaultValue="lead" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {stageOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            name="afterSave"
            value="list"
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            {text.quickSave}
          </button>
        </form>
      </section>
    </div>
  );
}
