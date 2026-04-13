import Link from "next/link";
import Image from "next/image";
import { createPartyQuickAction } from "@/app/actions";
import { FormDraftAssist } from "@/components/form-draft-assist";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { formatDate } from "@/lib/format";
import { listHubAttachments, listHubParties } from "@/lib/hub";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export const dynamic = "force-dynamic";

type PartiesPageProps = {
  searchParams?: Promise<{ q?: string; focus?: string; flash?: string }>;
};

const avatars = [
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80",
  "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=120&q=80",
  "https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=120&q=80",
];

const partiesCopy = {
  ja: {
    filter: "絞り込み",
    addParty: "関係者追加",
    tableEntity: "法人 / 個人",
    tableType: "種別",
    tableRole: "役割",
    tableContracts: "契約数",
    tableEscrow: "エスクロー残高",
    tableLastActivity: "最終更新",
    today: "本日 09:42",
    yesterday: "昨日",
    meetingLogged: "面談記録",
    contractRevision: "契約改訂",
    panelFundTypeCorporate: "ファンド法人",
    panelFundTypePrivate: "個人投資家",
    portfolioValue: "ポートフォリオ評価額",
    riskScore: "リスク評価",
    low: "低",
    primaryContacts: "主要連絡先",
    managingDirector: "マネージングディレクター",
    recentDocuments: "最近の書類",
    viewAll: "すべて表示",
    uploadedAgo: "2日前にアップロード",
    verifiedAt: "10/14 検証済み",
    ledgerTimeline: "台帳タイムライン",
    revisionRequest: "契約改訂依頼",
    fundsDisbursed: "資金実行",
    systemUser: "システムユーザー",
    treasury: "会計",
    commandActions: "操作",
    commandSearch: "全体検索...",
    timelineQuote: "第4.2条（二次配分権）の文言を更新しました。",
    emptyResult: "一致する関係者がありません。キーワードを変更するか、新規関係者を追加してください。",
    batchExportTitle: "選択出力",
    batchExportDesc: "複数関係者を選択してCSV出力できます。",
    batchExportBtn: "選択関係者をCSV出力",
  },
  zh: {
    filter: "筛选",
    addParty: "新增主体",
    tableEntity: "法人 / 个人",
    tableType: "类型",
    tableRole: "角色",
    tableContracts: "合同数",
    tableEscrow: "托管余额",
    tableLastActivity: "最后活动",
    today: "今天 09:42",
    yesterday: "昨天",
    meetingLogged: "会议记录",
    contractRevision: "合同修订",
    panelFundTypeCorporate: "机构基金",
    panelFundTypePrivate: "个人投资者",
    portfolioValue: "资产组合价值",
    riskScore: "风险评分",
    low: "低",
    primaryContacts: "主要联系人",
    managingDirector: "管理负责人",
    recentDocuments: "最近文档",
    viewAll: "查看全部",
    uploadedAgo: "2天前上传",
    verifiedAt: "10/14 已验证",
    ledgerTimeline: "台账时间线",
    revisionRequest: "合同修订请求",
    fundsDisbursed: "资金发放",
    systemUser: "系统用户",
    treasury: "财务",
    commandActions: "操作",
    commandSearch: "全局搜索...",
    timelineQuote: "已更新第 4.2 条关于二次分配权的条款。",
    emptyResult: "未找到匹配主体，请调整关键词或新增主体。",
    batchExportTitle: "批量导出",
    batchExportDesc: "可选择多个主体并导出CSV。",
    batchExportBtn: "导出选中主体CSV",
  },
  ko: {
    filter: "필터",
    addParty: "관계자 추가",
    tableEntity: "법인 / 개인",
    tableType: "유형",
    tableRole: "역할",
    tableContracts: "계약 수",
    tableEscrow: "에스크로 잔액",
    tableLastActivity: "최근 활동",
    today: "오늘 09:42",
    yesterday: "어제",
    meetingLogged: "미팅 기록",
    contractRevision: "계약 개정",
    panelFundTypeCorporate: "기관 펀드",
    panelFundTypePrivate: "개인 투자자",
    portfolioValue: "포트폴리오 가치",
    riskScore: "리스크 점수",
    low: "낮음",
    primaryContacts: "주요 연락처",
    managingDirector: "총괄 디렉터",
    recentDocuments: "최근 문서",
    viewAll: "전체 보기",
    uploadedAgo: "2일 전 업로드",
    verifiedAt: "10/14 검증 완료",
    ledgerTimeline: "원장 타임라인",
    revisionRequest: "계약 개정 요청",
    fundsDisbursed: "자금 집행",
    systemUser: "시스템 사용자",
    treasury: "재무",
    commandActions: "작업",
    commandSearch: "전체 검색...",
    timelineQuote: "2차 배분 권한에 대한 4.2조 문구를 수정했습니다.",
    emptyResult: "일치하는 관계자가 없습니다. 검색어를 변경하거나 관계자를 추가해 주세요.",
    batchExportTitle: "선택 내보내기",
    batchExportDesc: "여러 관계자를 선택해 CSV로 내보낼 수 있습니다.",
    batchExportBtn: "선택 관계자 CSV 내보내기",
  },
} as const;

export default async function PartiesPage({ searchParams }: PartiesPageProps) {
  const locale = await getLocale();
  const copy = partiesCopy[locale];
  const params = searchParams ? await searchParams : undefined;
  const query = params?.q?.trim() ?? "";
  const focus = params?.focus?.trim() ?? "";
  const [parties, attachments] = await Promise.all([listHubParties(locale), listHubAttachments(locale, 200)]);

  const filtered = query
    ? parties.filter((party) => {
        return (
          party.name.includes(query) ||
          party.phone.includes(query) ||
          (party.email?.includes(query) ?? false) ||
          party.roles.some((role) => role.includes(query))
        );
      })
    : parties;

  const selected = filtered.find((party) => party.id === focus) ?? filtered[0];
  const selectedAttachments = selected
    ? attachments.filter((item) => item.targetType === "party" && item.targetId === selected.id).slice(0, 2)
    : [];
  const localeCode = locale === "zh" ? "zh-CN" : locale === "ko" ? "ko-KR" : "ja-JP";
  const previousDay = selectedAttachments[0] ? formatDate(selectedAttachments[0].uploadedAt, locale) : copy.yesterday;
  const timelineDate1 = selectedAttachments[0] ? formatDate(selectedAttachments[0].uploadedAt, locale) : t(locale, "common.notSet");
  const timelineDate2 = selectedAttachments[1] ? formatDate(selectedAttachments[1].uploadedAt, locale) : t(locale, "common.notSet");
  const flashMap = {
    party_created: {
      ja: "関係者を登録しました。",
      zh: "主体已创建。",
      ko: "관계자를 등록했습니다.",
    },
  } as const;
  const flashKey = String(params?.flash ?? "").trim() as keyof typeof flashMap;
  const flashMessage = flashMap[flashKey]?.[locale];

  return (
    <div className="space-y-6 pb-20">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">{t(locale, "parties.title")}</h1>
          <p className="text-sm font-medium text-slate-600">
            {filtered.length} {t(locale, "parties.table.resultCount", { count: filtered.length })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/parties?q=${encodeURIComponent(query)}`} className="inline-flex items-center gap-1 rounded-lg bg-[#e9effc] px-4 py-2 text-sm font-semibold text-slate-800">
            <span className="material-symbols-outlined text-[16px]">filter_list</span>
            {copy.filter}
          </Link>
          <form id="party-quick-create-form" action={createPartyQuickAction} className="flex items-center gap-2">
            <input
              name="name"
              placeholder={copy.addParty}
              className="w-44 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#d5e3fc]"
            />
            <button className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-br from-[#001e40] to-[#003366] px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_-10px_rgba(0,30,64,0.8)]">
              <span className="material-symbols-outlined text-[16px]">add</span>
              {copy.addParty}
            </button>
          </form>
          <FormDraftAssist
            formId="party-quick-create-form"
            storageKey="draft:parties:quick-create"
            fieldNames={["name"]}
            reuseKey="parties:quick-create"
            locale={locale}
          />
        </div>
      </section>
      <PageFlashBanner message={flashMessage} />

      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200/35">
        <h2 className="text-base font-bold text-slate-900">{copy.batchExportTitle}</h2>
        <p className="mt-1 text-xs text-slate-500">{copy.batchExportDesc}</p>
        <form action="/api/hub/export" method="get" className="mt-3 space-y-3">
          <input type="hidden" name="scope" value="parties" />
          <input type="hidden" name="locale" value={locale} />
          <div className="max-h-40 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="space-y-2">
              {filtered.slice(0, 40).map((party) => (
                <label key={`export-party-${party.id}`} className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-sm">
                  <input type="checkbox" name="ids" value={party.id} className="h-4 w-4 rounded border-slate-300" />
                  <span className="min-w-0 flex-1 truncate text-slate-800">{party.name}</span>
                  <span className="text-xs text-slate-500">{party.phone}</span>
                </label>
              ))}
            </div>
          </div>
          <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            {copy.batchExportBtn}
          </button>
        </form>
      </section>

      <section className="grid gap-0 overflow-hidden rounded-xl bg-[#e9effc]/80 shadow-sm ring-1 ring-slate-200/40 xl:grid-cols-[minmax(0,2fr)_360px]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-separate border-spacing-y-2 p-3 text-left">
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                <th className="px-4 pb-2">{copy.tableEntity}</th>
                <th className="pb-2">{copy.tableType}</th>
                <th className="pb-2">{copy.tableRole}</th>
                <th className="pb-2">{copy.tableContracts}</th>
                <th className="pb-2 text-right">{copy.tableEscrow}</th>
                <th className="px-4 pb-2 text-right">{copy.tableLastActivity}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((party, index) => (
                <tr
                  key={party.id}
                  className={
                    "cursor-pointer rounded-xl bg-white transition hover:bg-[#f6f9ff] " +
                    (selected?.id === party.id ? "ring-2 ring-[#001e40]/10" : "")
                  }
                >
                  <td className="rounded-l-xl px-4 py-4">
                    <div className="flex items-center gap-3">
                      {selected?.id === party.id ? (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e6eeff] text-sm font-black text-[#001e40]">
                          {party.name
                            .split(" ")
                            .map((piece) => piece[0] ?? "")
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                      ) : (
                        <Image
                          src={avatars[index % avatars.length]}
                          alt={party.name}
                          width={40}
                          height={40}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      )}
                      <div>
                        <p className="text-sm font-bold text-slate-900">{party.name}</p>
                        <p className="text-xs text-slate-500">ID: {party.id.toUpperCase()}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4">
                    <span className="rounded bg-[#edf2fd] px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">{party.partyType}</span>
                  </td>
                  <td className="py-4">
                    <p className="text-sm font-medium text-slate-800">{party.roles[0] ?? "-"}</p>
                  </td>
                  <td className="py-4 text-sm font-semibold tabular-nums text-slate-800">{party.contractCount}</td>
                  <td className="py-4 text-right text-sm font-bold tabular-nums text-slate-900">
                    ¥{(party.contractCount * 124000).toLocaleString(locale === "zh" ? "zh-CN" : locale === "ko" ? "ko-KR" : "ja-JP")}
                  </td>
                  <td className="rounded-r-xl px-4 py-4 text-right">
                    <p className="text-sm font-medium text-slate-800">{index === 0 ? copy.today : index === 1 ? previousDay : copy.yesterday}</p>
                    <Link href={`/parties?q=${encodeURIComponent(query)}&focus=${party.id}`} className="text-xs text-[#d8885c] hover:underline">
                      {index === 0 ? copy.contractRevision : copy.meetingLogged}
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="rounded-xl bg-white px-4 py-10 text-center text-sm text-slate-500">
                    {copy.emptyResult}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <aside className="border-l border-slate-200/70 bg-white">
          {selected ? (
            <div className="space-y-6 p-6">
              <div>
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#eff4ff] text-4xl font-black text-[#001e40]">
                    {selected.name
                      .split(" ")
                      .map((piece) => piece[0] ?? "")
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <Link href={`/parties?q=${encodeURIComponent(selected.name)}`} className="text-slate-400 hover:text-slate-700">
                    <span className="material-symbols-outlined">more_horiz</span>
                  </Link>
                </div>
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">{selected.name}</h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {selected.partyType === "corporate" ? copy.panelFundTypeCorporate : copy.panelFundTypePrivate} • {selected.relatedPropertyHint ?? t(locale, "common.notSet")}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[#edf2fd] p-3">
                    <p className="text-[10px] font-bold uppercase text-slate-400">{copy.portfolioValue}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">¥{(selected.contractCount * 1450000).toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl bg-[#edf2fd] p-3">
                    <p className="text-[10px] font-bold uppercase text-slate-400">{copy.riskScore}</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-600">{copy.low}</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">{copy.primaryContacts}</h3>
                <div className="mt-3 rounded-xl border border-slate-200/70 bg-slate-50 p-3">
                  <div className="flex items-center gap-3">
                    <Image src={avatars[1]} alt="contact" width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
                    <div className="flex-1">
                      <p className="text-xs font-bold text-slate-900">{selected.name}</p>
                      <p className="text-[10px] text-slate-500">{copy.managingDirector}</p>
                    </div>
                    <a href={`mailto:${selected.email ?? ""}`} className="rounded-lg p-1.5 text-slate-500 hover:bg-[#edf2fd]">
                      <span className="material-symbols-outlined text-[18px]">mail</span>
                    </a>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">{copy.recentDocuments}</h3>
                  <Link href="/output-center" className="text-[11px] font-bold text-slate-700">
                    {copy.viewAll}
                  </Link>
                </div>
                <div className="space-y-2">
                  {selectedAttachments.length > 0 ? (
                    selectedAttachments.map((doc, index) => (
                      <div key={doc.id} className="flex items-center gap-3 rounded-lg border border-slate-200/70 bg-white p-3">
                        <span className={"material-symbols-outlined " + (index % 2 === 0 ? "text-[#d8885c]" : "text-blue-500")}>
                          {index % 2 === 0 ? "description" : "article"}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-slate-900">{doc.fileName}</p>
                          <p className="text-[10px] text-slate-500">{new Date(doc.uploadedAt).toLocaleDateString(localeCode)}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center gap-3 rounded-lg border border-slate-200/70 bg-white p-3">
                      <span className="material-symbols-outlined text-slate-400">description</span>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{t(locale, "common.notSet")}</p>
                        <p className="text-[10px] text-slate-500">{copy.uploadedAgo}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-[11px] font-black uppercase tracking-widest text-slate-400">{copy.ledgerTimeline}</h3>
                <div className="relative space-y-5 pl-4 before:absolute before:bottom-0 before:left-0 before:top-0 before:w-px before:bg-slate-200">
                  <div className="relative">
                    <span className="absolute -left-[19px] top-1 h-3 w-3 rounded-full border-2 border-white bg-[#001e40]" />
                    <p className="text-xs font-bold text-slate-900">{copy.revisionRequest}</p>
                    <p className="text-[10px] text-slate-500">{timelineDate1} • {copy.systemUser}</p>
                    <p className="mt-2 rounded-lg border border-slate-200/70 bg-white p-2 text-[11px] italic text-slate-600">
                      &quot;{copy.timelineQuote}&quot;
                    </p>
                  </div>
                  <div className="relative">
                    <span className="absolute -left-[19px] top-1 h-3 w-3 rounded-full border-2 border-white bg-slate-300" />
                    <p className="text-xs font-bold text-slate-900">{copy.fundsDisbursed}</p>
                    <p className="text-[10px] text-slate-500">{timelineDate2} • {copy.treasury}</p>
                    <p className="text-[11px] font-bold text-emerald-600">
                      +¥{(selected.contractCount * 70000).toLocaleString(localeCode)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-sm text-slate-500">{t(locale, "common.notSet")}</div>
          )}
        </aside>
      </section>

      <div className="fixed bottom-7 left-1/2 z-30 hidden -translate-x-1/2 items-center gap-5 rounded-full border border-white/10 bg-slate-900/90 px-6 py-3 text-white shadow-2xl backdrop-blur lg:flex">
        <div className="flex items-center gap-3 border-r border-white/20 pr-5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">{copy.commandActions}</span>
          <Link href="/output-center" className="rounded-lg p-1.5 transition hover:bg-white/10">
            <span className="material-symbols-outlined text-[18px]">print</span>
          </Link>
          <Link href="/templates" className="rounded-lg p-1.5 transition hover:bg-white/10">
            <span className="material-symbols-outlined text-[18px]">share</span>
          </Link>
          <Link href="/import-center" className="rounded-lg p-1.5 transition hover:bg-white/10">
            <span className="material-symbols-outlined text-[18px]">archive</span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <kbd className="rounded border border-white/20 bg-white/10 px-2 py-0.5 text-[10px]">CMD</kbd>
          <span className="text-sm text-white/80">{copy.commandSearch}</span>
        </div>
      </div>
    </div>
  );
}
