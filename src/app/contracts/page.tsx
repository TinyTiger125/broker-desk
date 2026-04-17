import Link from "next/link";
import { batchUpdateContractStatusAction, undoContractBatchStatusAction, updateClientStage } from "@/app/actions";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { formatDate } from "@/lib/format";
import { listHubContracts, type HubContractItem } from "@/lib/hub";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export const dynamic = "force-dynamic";

const statusClass: Record<HubContractItem["status"], string> = {
  draft: "bg-amber-100 text-amber-700",
  active: "bg-emerald-100 text-emerald-700",
  closed: "bg-slate-200 text-slate-600",
};

const contractIcons = ["domain", "warehouse", "apartment", "business_center"];

const contractsCopy = {
  ja: {
    subtitle: "運用台帳と更新パイプライン",
    refineRegistry: "台帳を絞り込み",
    executeNewContract: "新規契約を実行",
    renewalTimeline: "更新タイムライン",
    next90Days: "今後90日",
    totalCritical: "重要案件",
    atRiskValue: "リスク金額",
    viewPipeline: "パイプラインを見る",
    auditCompliance: "監査コンプライアンス",
    missingSignature: "署名不足",
    rateMismatch: "条件不一致",
    runVerification: "検証を実行",
    contractRegistry: "契約台帳",
    active: "有効",
    pending: "保留",
    tableReferenceId: "参照ID",
    tableAssetParty: "物件 / 関係者",
    tableValue: "契約金額",
    tableRenewalDate: "更新日",
    tableStatus: "状態",
    onSchedule: "スケジュール通り",
    manage: "管理",
    markActive: "有効化",
    markClosed: "完了化",
    reopen: "再開",
    showing: "表示 1-{{to}} / 全 {{count}} 件",
    previous: "前へ",
    next: "次へ",
    auditLog: "監査ログ",
    bulkTemplates: "一括テンプレート",
    financialReview: "財務レビュー",
    monthOct: "10月",
    monthNov: "11月",
    monthDec: "12月",
    monthJan: "1月",
    monthFeb: "2月",
    ago2h: "2時間前",
    ago1d: "1日前",
    alertCase1: "メトロポリススクエア - 賃貸追補契約 #4",
    alertCase2: "ホライゾンタワー - 管理委託契約",
    batchTitle: "一括操作",
    batchDesc: "複数契約の状態更新または選択出力を実行します。",
    batchStatusTarget: "更新先",
    batchApply: "状態を一括更新",
    batchExport: "選択契約をCSV出力",
    statusToActive: "有効（成約）",
    statusToPending: "保留（提案）",
    statusToClosed: "完了後フォロー",
    batchNone: "対象契約がありません。",
    undoHint: "直前の一括更新を取り消す場合は、今すぐ実行してください。",
    undoButton: "取り消す",
  },
  zh: {
    subtitle: "运营台账与续约流程",
    refineRegistry: "筛选台账",
    executeNewContract: "执行新合同",
    renewalTimeline: "续约时间线",
    next90Days: "未来90天",
    totalCritical: "关键项目",
    atRiskValue: "风险金额",
    viewPipeline: "查看流程",
    auditCompliance: "审计合规",
    missingSignature: "签名缺失",
    rateMismatch: "费率不一致",
    runVerification: "执行校验",
    contractRegistry: "合同台账",
    active: "有效",
    pending: "待处理",
    tableReferenceId: "参考ID",
    tableAssetParty: "物件 / 主体",
    tableValue: "合同金额",
    tableRenewalDate: "续约日期",
    tableStatus: "状态",
    onSchedule: "按计划进行",
    manage: "管理",
    markActive: "设为有效",
    markClosed: "设为完成",
    reopen: "重新打开",
    showing: "显示 1-{{to}} / 共 {{count}} 条",
    previous: "上一页",
    next: "下一页",
    auditLog: "审计日志",
    bulkTemplates: "批量模板",
    financialReview: "财务复核",
    monthOct: "10月",
    monthNov: "11月",
    monthDec: "12月",
    monthJan: "1月",
    monthFeb: "2月",
    ago2h: "2小时前",
    ago1d: "1天前",
    alertCase1: "都市广场 - 租赁补充协议 #4",
    alertCase2: "天际塔楼 - 资产管理协议",
    batchTitle: "批量操作",
    batchDesc: "支持批量更新合同状态或导出选中合同。",
    batchStatusTarget: "目标状态",
    batchApply: "批量更新状态",
    batchExport: "导出选中合同CSV",
    statusToActive: "有效（成交）",
    statusToPending: "待处理（提案）",
    statusToClosed: "完成后跟进",
    batchNone: "暂无可操作合同。",
    undoHint: "如需撤销刚才的批量更新，请立即执行。",
    undoButton: "撤销",
  },
  ko: {
    subtitle: "운영 원장 및 갱신 파이프라인",
    refineRegistry: "원장 필터",
    executeNewContract: "신규 계약 실행",
    renewalTimeline: "갱신 타임라인",
    next90Days: "향후 90일",
    totalCritical: "중요 건수",
    atRiskValue: "리스크 금액",
    viewPipeline: "파이프라인 보기",
    auditCompliance: "감사 컴플라이언스",
    missingSignature: "서명 누락",
    rateMismatch: "조건 불일치",
    runVerification: "검증 실행",
    contractRegistry: "계약 원장",
    active: "활성",
    pending: "대기",
    tableReferenceId: "참조 ID",
    tableAssetParty: "매물 / 관계자",
    tableValue: "계약 금액",
    tableRenewalDate: "갱신일",
    tableStatus: "상태",
    onSchedule: "일정 정상",
    manage: "관리",
    markActive: "활성화",
    markClosed: "완료 처리",
    reopen: "재개",
    showing: "1-{{to}} / 전체 {{count}}건",
    previous: "이전",
    next: "다음",
    auditLog: "감사 로그",
    bulkTemplates: "템플릿 일괄",
    financialReview: "재무 검토",
    monthOct: "10월",
    monthNov: "11월",
    monthDec: "12월",
    monthJan: "1월",
    monthFeb: "2월",
    ago2h: "2시간 전",
    ago1d: "1일 전",
    alertCase1: "메트로폴리스 스퀘어 - 임대 부속계약 #4",
    alertCase2: "호라이즌 타워 - 자산관리 계약",
    batchTitle: "일괄 작업",
    batchDesc: "여러 계약 상태를 일괄 변경하거나 선택 내보내기를 실행합니다.",
    batchStatusTarget: "변경 상태",
    batchApply: "상태 일괄 업데이트",
    batchExport: "선택 계약 CSV 내보내기",
    statusToActive: "활성(계약 완료)",
    statusToPending: "대기(제안)",
    statusToClosed: "완료 후 팔로업",
    batchNone: "처리할 계약이 없습니다.",
    undoHint: "방금 일괄 업데이트를 되돌리려면 지금 실행해 주세요.",
    undoButton: "되돌리기",
  },
} as const;

type ContractsPageProps = {
  searchParams?: Promise<{
    filter?: string;
    page?: string;
    focus?: string;
    flash?: string;
    undoClientIds?: string;
    undoStages?: string;
  }>;
};

export default async function ContractsPage({ searchParams }: ContractsPageProps) {
  const locale = await getLocale();
  const params = searchParams ? await searchParams : undefined;
  const filter = params?.filter === "active" || params?.filter === "pending" ? params.filter : "all";
  const focusId = String(params?.focus ?? "").trim();
  const flashMap = {
    contract_batch_updated: {
      ja: "契約状態を一括更新しました。",
      zh: "合同状态已批量更新。",
      ko: "계약 상태를 일괄 업데이트했습니다.",
    },
    contract_batch_undone: {
      ja: "契約状態の一括更新を取り消しました。",
      zh: "已撤销合同状态批量更新。",
      ko: "계약 상태 일괄 업데이트를 되돌렸습니다.",
    },
  } as const;
  const flashKey = String(params?.flash ?? "").trim() as keyof typeof flashMap;
  const flashMessage = flashMap[flashKey]?.[locale];
  const undoClientIds = String(params?.undoClientIds ?? "").trim();
  const undoStages = String(params?.undoStages ?? "").trim();
  const page = Math.max(1, Number(params?.page ?? "1") || 1);
  const copy = contractsCopy[locale];
  const contracts = await listHubContracts(locale);
  const filteredContracts =
    filter === "active"
      ? contracts.filter((item) => item.status === "active")
      : filter === "pending"
        ? contracts.filter((item) => item.status !== "closed")
        : contracts;
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filteredContracts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedContracts = filteredContracts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const now = new Date();
  const timelineDates = Array.from({ length: 5 }, (_, i) => new Date(now.getFullYear(), now.getMonth() + i, 1));
  const renewalMonths = timelineDates.map((date) =>
    new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale === "ko" ? "ko-KR" : "ja-JP", {
      month: "numeric",
    }).format(date)
  );
  const timelineCounts = timelineDates.map((date) => {
    const month = date.getMonth();
    const year = date.getFullYear();
    return contracts.filter((contract) => {
      if (!contract.signedAt) return false;
      return contract.signedAt.getMonth() === month && contract.signedAt.getFullYear() === year;
    }).length;
  });
  const maxTimelineCount = Math.max(1, ...timelineCounts);
  const atRiskValue = contracts
    .filter((item) => item.status !== "closed")
    .reduce((sum, item) => sum + item.contractValue, 0);
  const alertContracts = contracts.filter((item) => item.status !== "active").slice(0, 2);
  const firstAlert = alertContracts[0];
  const secondAlert = alertContracts[1];

  return (
    <div className="space-y-8">
      <PageFlashBanner message={flashMessage} />
      {undoClientIds && undoStages ? (
        <section className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <form action={undoContractBatchStatusAction} className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-700">{copy.undoHint}</p>
            <input type="hidden" name="clientIds" value={undoClientIds} />
            <input type="hidden" name="stages" value={undoStages} />
            <input type="hidden" name="returnTo" value={`/contracts?filter=${filter}&page=${currentPage}`} />
            <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              {copy.undoButton}
            </button>
          </form>
        </section>
      ) : null}
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-4xl font-light tracking-tight text-slate-900">{t(locale, "contracts.title")}</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/contracts?filter=${filter === "active" ? "all" : "active"}`} className="inline-flex items-center gap-2 rounded-lg bg-[#e9effc] px-4 py-2 text-sm font-semibold text-slate-800">
            <span className="material-symbols-outlined text-[18px]">filter_list</span>
            {copy.refineRegistry}
          </Link>
          <Link href="/quotes/new?from=contracts" className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#001e40] to-[#003366] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(0,30,64,0.7)]">
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            {copy.executeNewContract}
          </Link>
        </div>
      </section>

      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200/35">
        <h2 className="text-base font-bold text-slate-900">{copy.batchTitle}</h2>
        <p className="mt-1 text-xs text-slate-500">{copy.batchDesc}</p>
        <form action={batchUpdateContractStatusAction} className="mt-4 space-y-3">
          <input type="hidden" name="returnTo" value={`/contracts?filter=${filter}&page=${currentPage}`} />
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-600">{copy.batchStatusTarget}</span>
              <select name="status" defaultValue="active" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <option value="active">{copy.statusToActive}</option>
                <option value="pending">{copy.statusToPending}</option>
                <option value="closed">{copy.statusToClosed}</option>
              </select>
            </label>
            <div className="md:col-span-2 flex items-end gap-2">
              <button className="rounded-lg bg-[#001e40] px-4 py-2 text-sm font-semibold text-white">{copy.batchApply}</button>
              <button
                type="submit"
                formAction={`/api/hub/export?scope=contracts&locale=${locale}`}
                formMethod="get"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {copy.batchExport}
              </button>
            </div>
          </div>
          <div className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
            {filteredContracts.length === 0 ? <p className="text-sm text-slate-500">{copy.batchNone}</p> : null}
            <div className="space-y-2">
              {filteredContracts.slice(0, 40).map((contract) => (
                <label key={`batch-contract-${contract.id}`} className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-sm">
                  <input type="checkbox" name="ids" value={contract.id} className="h-4 w-4 rounded border-slate-300" />
                  <span className="min-w-0 flex-1 truncate text-slate-800">
                    {contract.contractNumber} · {contract.relatedProperty ?? t(locale, "common.notSet")}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusClass[contract.status]}`}>
                    {t(locale, `contract.status.${contract.status}`)}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </form>
      </section>

      <section className="grid gap-5 xl:grid-cols-12">
        <article className="xl:col-span-8 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200/30">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#001e40]">schedule</span>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">{copy.renewalTimeline}</h2>
            </div>
            <span className="rounded bg-[#e6eeff] px-2 py-1 text-[11px] font-bold uppercase text-slate-600">{copy.next90Days}</span>
          </div>
          <div className="flex h-32 items-end gap-3">
            {renewalMonths.map((month, index) => {
              const height = Math.max(8, Math.round((timelineCounts[index] / maxTimelineCount) * 100));
              const barColors = ["bg-blue-400", "bg-blue-600", "bg-[#003366]", "bg-blue-300", "bg-blue-400"];
              return (
                <div key={`${month}-${timelineDates[index]?.getFullYear()}-${index}`} className="flex flex-1 flex-col items-center">
                  <div className="relative mb-2 h-24 w-full overflow-hidden rounded-t-lg bg-slate-100">
                    <div className={`absolute bottom-0 w-full ${barColors[index]}`} style={{ height: `${height}%` }} />
                  </div>
                  <span className={"text-[10px] font-bold uppercase " + (index === 2 ? "text-[#003366]" : "text-slate-400")}>{month}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
            <div className="flex gap-8">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">{copy.totalCritical}</p>
                <p className="text-3xl font-black text-slate-900">{contracts.filter((item) => item.status !== "active").length}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">{copy.atRiskValue}</p>
                <p className="text-3xl font-black tabular-nums text-slate-900">¥{atRiskValue.toLocaleString()}</p>
              </div>
            </div>
            <Link href="/board?from=contracts" className="inline-flex items-center gap-1 text-xs font-bold text-[#001e40] hover:underline">
              {copy.viewPipeline}
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </Link>
          </div>
        </article>

        <article className="flex flex-col rounded-xl bg-[#592300] p-6 text-white shadow-sm xl:col-span-4">
          <div className="mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ffdbca]">warning</span>
            <h2 className="text-lg font-bold">{copy.auditCompliance}</h2>
          </div>
          <div className="space-y-3">
            <div className="rounded-lg border-l-4 border-[#ffdbca] bg-[#4b1c00] p-3">
              <div className="mb-1 flex items-start justify-between">
                <p className="text-[11px] font-bold uppercase text-[#ffdbca]">{copy.missingSignature}</p>
                <p className="text-[9px] uppercase text-[#ffdbca]/70">{copy.ago2h}</p>
              </div>
              <p className="text-sm font-medium">
                {firstAlert
                  ? `${firstAlert.relatedProperty ?? t(locale, "common.notSet")} - ${firstAlert.contractNumber}`
                  : copy.alertCase1}
              </p>
            </div>
            <div className="rounded-lg border-l-4 border-[#ffdbca] bg-[#4b1c00] p-3 opacity-90">
              <div className="mb-1 flex items-start justify-between">
                <p className="text-[11px] font-bold uppercase text-[#ffdbca]">{copy.rateMismatch}</p>
                <p className="text-[9px] uppercase text-[#ffdbca]/70">{copy.ago1d}</p>
              </div>
              <p className="text-sm font-medium">
                {secondAlert
                  ? `${secondAlert.relatedProperty ?? t(locale, "common.notSet")} - ${secondAlert.contractNumber}`
                  : copy.alertCase2}
              </p>
            </div>
          </div>
          <Link href="/service-requests?status=open" className="mt-4 inline-flex items-center justify-center rounded-lg bg-white/10 py-2 text-[11px] font-black uppercase tracking-widest transition hover:bg-white/20">
            {copy.runVerification}
          </Link>
        </article>
      </section>

      <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/30">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-6 py-5">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-slate-900">{copy.contractRegistry}</h2>
            <div className="flex gap-1">
              <Link href="/contracts?filter=active" className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-black uppercase text-blue-700">
                {copy.active} ({contracts.filter((item) => item.status === "active").length})
              </Link>
              <Link href="/contracts?filter=pending" className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-500">
                {copy.pending} ({contracts.filter((item) => item.status !== "closed").length})
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/api/hub/export?scope=contracts&locale=${locale}`} className="rounded p-1.5 text-slate-400 hover:bg-slate-200">
              <span className="material-symbols-outlined text-[20px]">download</span>
            </Link>
            <Link href="/templates?template=brokerage_disclosure" className="rounded p-1.5 text-slate-400 hover:bg-slate-200">
              <span className="material-symbols-outlined text-[20px]">more_vert</span>
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="bg-slate-50/40">
                <th className="border-b border-slate-100 px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400">{copy.tableReferenceId}</th>
                <th className="border-b border-slate-100 px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400">{copy.tableAssetParty}</th>
                <th className="border-b border-slate-100 px-6 py-4 text-right text-[11px] font-black uppercase tracking-widest text-slate-400">{copy.tableValue}</th>
                <th className="border-b border-slate-100 px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400">{copy.tableRenewalDate}</th>
                <th className="border-b border-slate-100 px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400">{copy.tableStatus}</th>
                <th className="border-b border-slate-100 px-6 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pagedContracts.map((contract, index) => (
                <tr
                  key={contract.id}
                  className={
                    (index % 2 === 1 ? "bg-slate-50/30 " : "") +
                    "group transition hover:bg-[#edf2fd]/40 " +
                    (focusId === contract.id ? "ring-2 ring-[#001e40]/15" : "")
                  }
                >
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold tabular-nums text-blue-900">{contract.contractNumber}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#edf2fd] text-[#001e40]">
                        <span className="material-symbols-outlined text-[16px]">{contractIcons[index % contractIcons.length]}</span>
                      </span>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{contract.relatedProperty ?? t(locale, "common.notSet")}</p>
                        <p className="text-[11px] text-slate-400">{contract.relatedParty ?? t(locale, "common.notSet")}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-black tabular-nums text-slate-900">¥{contract.contractValue.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold tabular-nums text-slate-900">{formatDate(contract.signedAt, locale)}</span>
                      <span className="text-[10px] font-bold uppercase tracking-tight text-slate-400">{copy.onSchedule}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusClass[contract.status]}`}>
                      {t(locale, `contract.status.${contract.status}`)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex items-center gap-1">
                      <form action={updateClientStage}>
                        <input type="hidden" name="clientId" value={contract.clientId} />
                        <input type="hidden" name="stage" value={contract.status === "closed" ? "negotiating" : contract.status === "active" ? "won" : "quoted"} />
                        <input type="hidden" name="reason" value="contracts_quick_action" />
                        <button className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-700 hover:border-slate-300">
                          {contract.status === "closed" ? copy.reopen : contract.status === "active" ? copy.markClosed : copy.markActive}
                        </button>
                      </form>
                      <Link href={`/quotes/${contract.id}`} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-blue-900 opacity-0 shadow-sm transition group-hover:opacity-100">
                        {copy.manage}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-6 py-4">
          <p className="text-[11px] font-bold uppercase text-slate-400">
            {copy.showing
              .replace("{{to}}", String(Math.min(currentPage * pageSize, filteredContracts.length)))
              .replace("{{count}}", String(filteredContracts.length))}
          </p>
          <div className="flex gap-2">
            {currentPage > 1 ? (
              <Link
                href={`/contracts?filter=${filter}&page=${currentPage - 1}`}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-blue-900 hover:border-blue-300"
              >
                {copy.previous}
              </Link>
            ) : (
              <span className="cursor-not-allowed rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-400">{copy.previous}</span>
            )}
            {currentPage < totalPages ? (
              <Link
                href={`/contracts?filter=${filter}&page=${currentPage + 1}`}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-blue-900 hover:border-blue-300"
              >
                {copy.next}
              </Link>
            ) : (
              <span className="cursor-not-allowed rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-400">{copy.next}</span>
            )}
          </div>
        </div>
      </section>

      <footer className="mt-8 flex justify-center">
        <div className="inline-flex rounded-xl border border-slate-200/60 bg-white/70 p-1.5 shadow-lg backdrop-blur">
          <Link href="/audit-log" className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-slate-800 hover:bg-white">
            <span className="material-symbols-outlined text-[18px]">history</span>
            {copy.auditLog}
          </Link>
          <span className="mx-1 my-1 h-6 w-px bg-slate-200" />
          <Link href="/templates?template=lease_agreement_v4" className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-slate-800 hover:bg-white">
            <span className="material-symbols-outlined text-[18px]">description</span>
            {copy.bulkTemplates}
          </Link>
          <span className="mx-1 my-1 h-6 w-px bg-slate-200" />
          <Link href="/output-center?type=funding_plan" className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-slate-800 hover:bg-white">
            <span className="material-symbols-outlined text-[18px]">account_balance</span>
            {copy.financialReview}
          </Link>
        </div>
      </footer>
    </div>
  );
}
