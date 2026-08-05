import Link from "next/link";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { formatDate } from "@/lib/format";
import { listHubAttachments, listHubContracts, listHubParties } from "@/lib/hub";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

type PartiesPageProps = {
  searchParams?: Promise<{
    q?: string;
    focus?: string;
    flash?: string;
    type?: string;
    relation?: string;
  }>;
};

const partiesCopy = {
  ja: {
    addParty: "関係者追加",
    batchExportBtn: "選択関係者をCSV出力",
    batchHint: "選択した関係者だけCSV出力します。",
    batchTools: "一括操作",
    businessRelation: "業務関係",
    clear: "解除",
    continueCase: "案件を開く",
    createCase: "案件を作成",
    currentSignal: "現在の状態",
    editParty: "編集",
    emptyResult: "一致する関係者がありません。キーワードを変更するか、新規関係者を追加してください。",
    filter: "絞り込み",
    filterAll: "すべて",
    filterCorporate: "法人",
    filterIndividual: "個人",
    filterNoCases: "案件なし",
    filterWithCases: "案件あり",
    listTitle: "関係者一覧",
    nextAction: "次の操作",
    pageTitle: "関係者",
    partyTypeCorporate: "法人",
    partyTypeIndividual: "個人",
    profileTitle: "関係者ファイル",
    completionTitle: "必須情報",
    outputCheck: "出力前確認",
    relationTree: "関係ツリー",
    openRelationTree: "関係を確認",
    missingItems: "不足",
    complete: "完了",
    insufficient: "資料不足",
    fieldName: "氏名",
    fieldContact: "連絡先",
    fieldRole: "役割",
    fieldProperty: "関連物件",
    relationCases: "関連案件",
    relationDocuments: "資料",
    relationProperty: "関連物件",
    reviewDocuments: "資料を確認",
    searchPlaceholder: "名前・電話・メール・役割で検索",
    signalNoCase: "まだ案件化されていません。関係者情報を確認してから案件を作成します。",
    signalWithCase: "案件に紐づいています。案件側で次の処理を進めてください。",
    tableRole: "役割",
    today: "本日 09:42",
    yesterday: "昨日",
  },
  zh: {
    addParty: "新增主体",
    batchExportBtn: "导出选中主体CSV",
    batchHint: "只对勾选的主体执行 CSV 导出。",
    batchTools: "批量工具",
    businessRelation: "业务关系",
    clear: "清除",
    continueCase: "打开案件",
    createCase: "创建案件",
    currentSignal: "当前判断",
    editParty: "编辑",
    emptyResult: "未找到匹配主体，请调整关键词或新增主体。",
    filter: "筛选",
    filterAll: "全部",
    filterCorporate: "法人",
    filterIndividual: "个人",
    filterNoCases: "无案件",
    filterWithCases: "有案件",
    listTitle: "主体列表",
    nextAction: "下一步",
    pageTitle: "相关主体",
    partyTypeCorporate: "法人",
    partyTypeIndividual: "个人",
    profileTitle: "主体档案",
    completionTitle: "必填信息",
    outputCheck: "输出前检查",
    relationTree: "关系树",
    openRelationTree: "查看关系",
    missingItems: "缺少",
    complete: "已完成",
    insufficient: "资料不足",
    fieldName: "姓名 / 名称",
    fieldContact: "联系方式",
    fieldRole: "角色",
    fieldProperty: "关联物件",
    relationCases: "关联案件",
    relationDocuments: "资料",
    relationProperty: "关联物件",
    reviewDocuments: "查看资料",
    searchPlaceholder: "按姓名、电话、邮箱、角色搜索",
    signalNoCase: "还没有形成案件，先确认主体信息再创建案件。",
    signalWithCase: "已经有关联案件，应从案件继续推进。",
    tableRole: "角色",
    today: "今天 09:42",
    yesterday: "昨天",
  },
  ko: {
    addParty: "관계자 추가",
    batchExportBtn: "선택 관계자 CSV 내보내기",
    batchHint: "선택한 관계자만 CSV로 내보냅니다.",
    batchTools: "일괄 작업",
    businessRelation: "업무 관계",
    clear: "초기화",
    continueCase: "안건 열기",
    createCase: "안건 만들기",
    currentSignal: "현재 상태",
    editParty: "편집",
    emptyResult: "일치하는 관계자가 없습니다. 검색어를 변경하거나 관계자를 추가해 주세요.",
    filter: "필터",
    filterAll: "전체",
    filterCorporate: "법인",
    filterIndividual: "개인",
    filterNoCases: "안건 없음",
    filterWithCases: "안건 있음",
    listTitle: "관계자 목록",
    nextAction: "다음 작업",
    pageTitle: "관계자",
    partyTypeCorporate: "법인",
    partyTypeIndividual: "개인",
    profileTitle: "관계자 파일",
    completionTitle: "필수 정보",
    outputCheck: "출력 전 확인",
    relationTree: "관계 트리",
    openRelationTree: "관계 확인",
    missingItems: "부족",
    complete: "완료",
    insufficient: "자료 부족",
    fieldName: "이름 / 명칭",
    fieldContact: "연락처",
    fieldRole: "역할",
    fieldProperty: "연계 매물",
    relationCases: "연계 안건",
    relationDocuments: "자료",
    relationProperty: "연계 매물",
    reviewDocuments: "자료 확인",
    searchPlaceholder: "이름, 전화, 이메일, 역할 검색",
    signalNoCase: "아직 안건이 없습니다. 관계자 정보를 확인한 뒤 안건을 만드세요.",
    signalWithCase: "안건에 연결되어 있습니다. 안건에서 다음 작업을 진행하세요.",
    tableRole: "역할",
    today: "오늘 09:42",
    yesterday: "어제",
  },
} as const;

function initials(name: string) {
  return name
    .split(" ")
    .map((piece) => piece[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default async function PartiesPage({ searchParams }: PartiesPageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.read" }),
  ]);
  const copy = partiesCopy[locale];
  const params = searchParams ? await searchParams : undefined;
  const query = params?.q?.trim() ?? "";
  const focus = params?.focus?.trim() ?? "";
  const typeFilter = params?.type === "corporate" || params?.type === "individual" ? params.type : "all";
  const relationFilter =
    params?.relation === "with_cases" || params?.relation === "no_cases" ? params.relation : "all";
  const hubContext = { userId: session.user.id, tenantId: session.tenant.id };

  const [parties, attachments, contracts] = await Promise.all([
    listHubParties(locale, hubContext),
    listHubAttachments(locale, 200, hubContext),
    listHubContracts(locale, hubContext),
  ]);

  const caseCountByParty = contracts.reduce((map, contract) => {
    map.set(contract.clientId, (map.get(contract.clientId) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
  const getCaseCount = (partyId: string) => caseCountByParty.get(partyId) ?? 0;
  const searched = query
    ? parties.filter((party) => {
        const normalized = query.toLowerCase();
        return (
          party.name.toLowerCase().includes(normalized) ||
          party.phone.toLowerCase().includes(normalized) ||
          (party.email?.toLowerCase().includes(normalized) ?? false) ||
          party.roles.some((role) => role.toLowerCase().includes(normalized))
        );
      })
    : parties;
  const filtered = searched.filter((party) => {
    const caseCount = getCaseCount(party.id);
    const matchesType = typeFilter === "all" || party.partyType === typeFilter;
    const matchesRelation =
      relationFilter === "all" ||
      (relationFilter === "with_cases" && caseCount > 0) ||
      (relationFilter === "no_cases" && caseCount === 0);
    return matchesType && matchesRelation;
  });

  const selected = filtered.find((party) => party.id === focus) ?? filtered[0];
  const selectedAllAttachments = selected
    ? attachments.filter((item) => item.targetType === "party" && item.targetId === selected.id)
    : [];
  const selectedAttachments = selectedAllAttachments.slice(0, 3);
  const selectedContracts = selected ? contracts.filter((contract) => contract.clientId === selected.id) : [];
  const selectedRequiredFields = selected
    ? [
        { label: copy.fieldName, value: selected.name },
        { label: copy.fieldContact, value: selected.phone || selected.email },
        { label: copy.fieldRole, value: selected.roles.join(" / ") },
        { label: copy.fieldProperty, value: selected.relatedPropertyHint },
      ]
    : [];
  const selectedMissingFields = selectedRequiredFields.filter((field) => !field.value);
  const selectedCompletion = selectedRequiredFields.length > 0
    ? Math.round(((selectedRequiredFields.length - selectedMissingFields.length) / selectedRequiredFields.length) * 100)
    : 0;
  const selectedCaseHref = selectedContracts[0]
    ? `/contracts?filter=all&focus=${selectedContracts[0].id}`
    : selected
      ? `/quotes/new?clientId=${selected.id}`
      : "/quotes/new";
  const previousDay = selectedAttachments[0] ? formatDate(selectedAttachments[0].uploadedAt, locale) : copy.yesterday;
  const flashMap = {
    party_created: {
      ja: "関係者を登録しました。",
      zh: "主体已创建。",
      ko: "관계자를 등록했습니다.",
    },
    party_updated: {
      ja: "関係者を更新しました。",
      zh: "主体已更新。",
      ko: "관계자를 업데이트했습니다.",
    },
  } as const;
  const flashKey = String(params?.flash ?? "").trim() as keyof typeof flashMap;
  const flashMessage = flashMap[flashKey]?.[locale];
  const makeHref = (next: { q?: string; type?: string; relation?: string; focus?: string }) => {
    const urlParams = new URLSearchParams();
    const nextQuery = next.q ?? query;
    const nextType = next.type ?? typeFilter;
    const nextRelation = next.relation ?? relationFilter;
    const nextFocus = next.focus ?? focus;
    if (nextQuery) urlParams.set("q", nextQuery);
    if (nextType !== "all") urlParams.set("type", nextType);
    if (nextRelation !== "all") urlParams.set("relation", nextRelation);
    if (nextFocus) urlParams.set("focus", nextFocus);
    const suffix = urlParams.toString();
    return suffix ? `/parties?${suffix}` : "/parties";
  };
  const partyTypeLabel = (partyType: "individual" | "corporate") =>
    partyType === "corporate" ? copy.partyTypeCorporate : copy.partyTypeIndividual;
  const filterChips = [
    {
      label: copy.filterAll,
      href: makeHref({ type: "all", relation: "all", focus: "" }),
      active: typeFilter === "all" && relationFilter === "all",
    },
    {
      label: copy.filterWithCases,
      href: makeHref({ relation: "with_cases", focus: "" }),
      active: relationFilter === "with_cases",
    },
    {
      label: copy.filterNoCases,
      href: makeHref({ relation: "no_cases", focus: "" }),
      active: relationFilter === "no_cases",
    },
    {
      label: copy.filterCorporate,
      href: makeHref({ type: "corporate", focus: "" }),
      active: typeFilter === "corporate",
    },
    {
      label: copy.filterIndividual,
      href: makeHref({ type: "individual", focus: "" }),
      active: typeFilter === "individual",
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">{copy.pageTitle}</h1>
          <p className="text-sm font-medium text-slate-600">
            {t(locale, "parties.table.resultCount", { count: filtered.length })}
          </p>
        </div>
        <Link
          href="/parties/new"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gradient-to-br from-[#001e40] to-[#003366] px-4 text-sm font-semibold text-white shadow-[0_8px_20px_-10px_rgba(0,30,64,0.8)]"
        >
          <span className="material-symbols-outlined text-[17px]" aria-hidden="true">add</span>
          {copy.addParty}
        </Link>
      </section>
      <PageFlashBanner message={flashMessage} />

      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200/35">
        <form className="grid gap-3 2xl:grid-cols-[minmax(240px,1fr)_auto_auto]" action="/parties">
          <input
            name="q"
            defaultValue={query}
            placeholder={copy.searchPlaceholder}
            className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-[#0046ad] focus:ring-2 focus:ring-blue-100"
          />
          <input type="hidden" name="type" value={typeFilter} />
          <input type="hidden" name="relation" value={relationFilter} />
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#001e40] px-4 text-sm font-bold text-white">
            <span className="material-symbols-outlined text-[17px]" aria-hidden="true">search</span>
            {copy.filter}
          </button>
          <Link
            href="/parties"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            {copy.clear}
          </Link>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          {filterChips.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={
                "rounded-full px-3 py-1.5 text-xs font-bold transition " +
                (item.active ? "bg-blue-700 text-white" : "bg-[#edf2fd] text-slate-700 hover:bg-blue-100")
              }
            >
              {item.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="grid min-w-0 gap-0 overflow-hidden rounded-xl bg-[#e9effc]/80 shadow-sm ring-1 ring-slate-200/40 2xl:grid-cols-[minmax(0,1fr)_minmax(22rem,25rem)]">
        <form action="/api/hub/export" method="get" className="min-w-0 space-y-3 p-4">
          <input type="hidden" name="scope" value="parties" />
          <input type="hidden" name="locale" value={locale} />
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{copy.listTitle}</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {t(locale, "parties.table.resultCount", { count: filtered.length })}
              </p>
            </div>
            <details className="group relative">
              <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">checklist</span>
                {copy.batchTools}
              </summary>
              <div className="absolute right-0 z-10 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                <p className="text-xs leading-5 text-slate-500">{copy.batchHint}</p>
                <button className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                  {copy.batchExportBtn}
                </button>
              </div>
            </details>
          </div>

          <div className="space-y-2">
            {filtered.map((party, index) => {
              const caseCount = getCaseCount(party.id);
              const partyHref = makeHref({ focus: party.id });
              return (
                <article
                  key={party.id}
                  className={
                    "grid gap-3 rounded-xl bg-white p-4 transition hover:bg-[#f6f9ff] lg:grid-cols-[auto_minmax(0,1fr)_auto] " +
                    (selected?.id === party.id ? "ring-2 ring-[#001e40]/15" : "")
                  }
                >
                  <label className="flex items-start pt-1">
                    <span className="sr-only">{copy.batchTools}</span>
                    <input type="checkbox" name="ids" value={party.id} className="h-4 w-4 rounded border-slate-300" />
                  </label>
                  <Link href={partyHref} className="min-w-0">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e6eeff] text-sm font-black text-[#001e40]" aria-hidden="true">
                        {initials(party.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{party.name}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {party.roles[0] ?? t(locale, "common.notSet")} · {partyTypeLabel(party.partyType)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs font-medium text-slate-600 lg:grid-cols-3">
                      <span className="rounded-lg bg-[#edf2fd] px-2 py-1">
                        {copy.relationCases}: {caseCount}
                      </span>
                      <span className="truncate rounded-lg bg-[#edf2fd] px-2 py-1">
                        {copy.relationProperty}: {party.relatedPropertyHint ?? t(locale, "common.notSet")}
                      </span>
                      <span className="rounded-lg bg-[#edf2fd] px-2 py-1">
                        {index === 0 ? copy.today : index === 1 ? previousDay : copy.yesterday}
                      </span>
                    </div>
                  </Link>
                  <div className="flex items-center justify-end">
                    <span className="material-symbols-outlined text-slate-300" aria-hidden="true">arrow_forward</span>
                  </div>
                </article>
              );
            })}
            {filtered.length === 0 ? (
              <div className="rounded-xl bg-white px-4 py-10 text-center text-sm text-slate-500">
                {copy.emptyResult}
              </div>
            ) : null}
          </div>
        </form>

        <aside className="border-l border-slate-200/70 bg-white">
          {selected ? (
            <div className="space-y-6 p-6">
              <div>
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#eff4ff] text-4xl font-black text-[#001e40]">
                    {initials(selected.name)}
                  </div>
                  <Link
                    href={`/parties/${selected.id}/edit`}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">edit</span>
                    {copy.editParty}
                  </Link>
                </div>
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{copy.profileTitle}</p>
                <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{selected.name}</h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {partyTypeLabel(selected.partyType)} · {selected.roles.join(" / ") || t(locale, "common.notSet")}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[#edf2fd] p-3">
                    <p className="text-[10px] font-bold uppercase text-slate-400">{copy.relationCases}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{selectedContracts.length}</p>
                  </div>
                  <div className="rounded-xl bg-[#edf2fd] p-3">
                    <p className="text-[10px] font-bold uppercase text-slate-400">{copy.relationDocuments}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{selectedAllAttachments.length}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200/70 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-black text-[#002FA7]">{copy.completionTitle}</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {selectedRequiredFields.length - selectedMissingFields.length}/{selectedRequiredFields.length}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                    selectedMissingFields.length > 0 ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                  }`}>
                    {selectedMissingFields.length > 0 ? `${copy.missingItems} ${selectedMissingFields.length}` : copy.complete}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[#002FA7]" style={{ width: `${selectedCompletion}%` }} />
                </div>
                <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
                  {selectedRequiredFields.map((field) => {
                    const filled = Boolean(field.value);
                    return (
                      <div key={field.label} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                        <span className="font-bold text-slate-600">{field.label}</span>
                        <span className={`max-w-[55%] truncate text-right font-black ${
                          filled ? "text-slate-950" : "text-rose-600"
                        }`}>
                          {field.value || copy.insufficient}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">{copy.businessRelation}</h3>
                <div className="mt-3 space-y-2 rounded-xl border border-slate-200/70 bg-slate-50 p-3">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="font-semibold text-slate-500">{copy.relationProperty}</span>
                    <span className="text-right font-bold text-slate-900">{selected.relatedPropertyHint ?? t(locale, "common.notSet")}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="font-semibold text-slate-500">{copy.tableRole}</span>
                    <span className="text-right font-bold text-slate-900">{selected.roles.join(" / ") || t(locale, "common.notSet")}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="font-semibold text-slate-500">{copy.relationCases}</span>
                    <span className="text-right font-bold text-slate-900">{selectedContracts.length}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border-l-4 border-[#0046ad] bg-blue-50 p-4">
                <p className="text-xs font-black text-blue-700">{copy.outputCheck}</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-900">
                  {selectedContracts.length > 0 ? copy.signalWithCase : copy.signalNoCase}
                </p>
              </div>

              <div>
                <h3 className="mb-3 text-[11px] font-black uppercase tracking-widest text-slate-400">{copy.nextAction}</h3>
                <div className="grid gap-2">
                  <Link
                    href={selectedCaseHref}
                    className="inline-flex items-center justify-between rounded-lg bg-[#001e40] px-4 py-3 text-sm font-bold text-white"
                  >
                    {selectedContracts.length > 0 ? copy.continueCase : copy.createCase}
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_forward</span>
                  </Link>
                  <Link
                    href={`/relationship-tree?type=party&id=${encodeURIComponent(selected.id)}`}
                    className="inline-flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-[#002FA7] hover:bg-blue-100"
                  >
                    {copy.openRelationTree}
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">account_tree</span>
                  </Link>
                  <Link
                    href={`/parties/${selected.id}/edit`}
                    className="inline-flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
                  >
                    {copy.editParty}
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">edit</span>
                  </Link>
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">{copy.relationDocuments}</h3>
                  <Link href={`/output-center?partyId=${selected.id}`} className="text-[11px] font-bold text-slate-700">
                    {copy.reviewDocuments}
                  </Link>
                </div>
                <div className="space-y-2">
                  {selectedAttachments.length > 0 ? (
                    selectedAttachments.map((doc, index) => (
                      <div key={doc.id} className="flex items-center gap-3 rounded-lg border border-slate-200/70 bg-white p-3">
                        <span
                          className={"material-symbols-outlined " + (index % 2 === 0 ? "text-[#d8885c]" : "text-blue-500")}
                          aria-hidden="true"
                        >
                          {index % 2 === 0 ? "description" : "article"}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-slate-900">{doc.fileName}</p>
                          <p className="text-[10px] text-slate-500">{formatDate(doc.uploadedAt, locale)}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center gap-3 rounded-lg border border-slate-200/70 bg-white p-3">
                      <span className="material-symbols-outlined text-slate-400" aria-hidden="true">description</span>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{t(locale, "common.notSet")}</p>
                        <p className="text-[10px] text-slate-500">{copy.relationDocuments}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-sm text-slate-500">{t(locale, "common.notSet")}</div>
          )}
        </aside>
      </section>
    </div>
  );
}
