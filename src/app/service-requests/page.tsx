import { batchUpdateServiceRequestStatusAction, changeTaskStatusAction, createServiceRequestQuickAction, undoTaskStatusAction } from "@/app/actions";
import Link from "next/link";
import Image from "next/image";
import { FormDraftAssist } from "@/components/form-draft-assist";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { formatCurrency } from "@/lib/format";
import { listHubServiceRequests, type HubServiceRequestItem } from "@/lib/hub";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export const dynamic = "force-dynamic";

const statusClass: Record<HubServiceRequestItem["status"], string> = {
  open: "bg-[#ffdbca] text-[#723610]",
  done: "bg-[#edf2fd] text-[#1f477b]",
  canceled: "bg-slate-100 text-slate-600",
};

const evidenceImages = [
  "https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=480&q=80",
  "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=480&q=80",
  "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=480&q=80",
];

const requestsCopy = {
  ja: {
    subtitlePrefix: "稼働中の対応依頼",
    subtitleSuffix: "件を管理中です。",
    filterLedger: "台帳を絞り込み",
    newRequest: "新規依頼",
    maintenanceBudget: "保守予算配分",
    remainingReserve: "第3四半期 残予算",
    allocated: "割当",
    total: "合計",
    verificationContext: "検証コンテキスト",
    certifiedVendors: "認定業者",
    pendingApproval: "承認待ち",
    manageCredentials: "資格情報を管理",
    slaResponse: "SLA 応答率",
    excellence: "優良",
    criticalErrors: "重大エラー",
    actionRequired: "要対応",
    activeQueue: "対応キュー",
    urgent: "緊急",
    standard: "通常",
    tableRef: "参照 #",
    tablePropertyAsset: "物件 / 資産",
    tableContractor: "業者情報",
    tableStatus: "状態",
    tableBudgetedCost: "予算費用",
    tableActions: "操作",
    markOpen: "再開",
    markDone: "完了",
    markCanceled: "取消",
    fallbackContractor: "外部業者",
    evidenceTitle: "最近の証跡と検証",
    uploadProof: "証跡を追加",
    quickRequestPlaceholder: "依頼タイトルを入力",
    batchTitle: "一括更新",
    batchDesc: "複数の対応依頼をまとめて更新",
    batchTargetStatus: "更新先ステータス",
    batchApply: "一括反映",
    batchNone: "選択可能な対応依頼がありません。",
  },
  zh: {
    subtitlePrefix: "当前正在管理",
    subtitleSuffix: "条有效服务请求。",
    filterLedger: "筛选台账",
    newRequest: "新建请求",
    maintenanceBudget: "维护预算分配",
    remainingReserve: "Q3 剩余预算",
    allocated: "已分配",
    total: "总计",
    verificationContext: "校验上下文",
    certifiedVendors: "认证供应商",
    pendingApproval: "待审批",
    manageCredentials: "管理资质",
    slaResponse: "SLA 响应率",
    excellence: "优秀",
    criticalErrors: "关键错误",
    actionRequired: "需处理",
    activeQueue: "活跃请求队列",
    urgent: "紧急",
    standard: "标准",
    tableRef: "编号 #",
    tablePropertyAsset: "物件 / 资产",
    tableContractor: "承包方信息",
    tableStatus: "状态",
    tableBudgetedCost: "预算费用",
    tableActions: "操作",
    markOpen: "重新打开",
    markDone: "标记完成",
    markCanceled: "标记取消",
    fallbackContractor: "外部服务商",
    evidenceTitle: "最近证据与校验",
    uploadProof: "上传凭证",
    quickRequestPlaceholder: "输入请求标题",
    batchTitle: "批量更新",
    batchDesc: "一次更新多条服务请求",
    batchTargetStatus: "目标状态",
    batchApply: "批量应用",
    batchNone: "暂无可选择的服务请求。",
  },
  ko: {
    subtitlePrefix: "현재",
    subtitleSuffix: "건의 활성 요청을 관리 중입니다.",
    filterLedger: "원장 필터",
    newRequest: "신규 요청",
    maintenanceBudget: "유지보수 예산 배분",
    remainingReserve: "3분기 잔여 예산",
    allocated: "배정",
    total: "총액",
    verificationContext: "검증 컨텍스트",
    certifiedVendors: "인증 업체",
    pendingApproval: "승인 대기",
    manageCredentials: "자격 관리",
    slaResponse: "SLA 응답률",
    excellence: "우수",
    criticalErrors: "중요 오류",
    actionRequired: "조치 필요",
    activeQueue: "활성 요청 대기열",
    urgent: "긴급",
    standard: "표준",
    tableRef: "참조 #",
    tablePropertyAsset: "매물 / 자산",
    tableContractor: "업체 정보",
    tableStatus: "상태",
    tableBudgetedCost: "예산 비용",
    tableActions: "작업",
    markOpen: "재개",
    markDone: "완료",
    markCanceled: "취소",
    fallbackContractor: "외부 업체",
    evidenceTitle: "최근 증빙 및 검증",
    uploadProof: "증빙 업로드",
    quickRequestPlaceholder: "요청 제목 입력",
    batchTitle: "일괄 업데이트",
    batchDesc: "여러 서비스 요청을 한 번에 업데이트",
    batchTargetStatus: "변경 상태",
    batchApply: "일괄 적용",
    batchNone: "선택 가능한 서비스 요청이 없습니다.",
  },
} as const;

type ServiceRequestsPageProps = {
  searchParams?: Promise<{ status?: string; flash?: string; focus?: string; undoTaskId?: string; undoStatus?: string; undoClientId?: string }>;
};

export default async function ServiceRequestsPage({ searchParams }: ServiceRequestsPageProps) {
  const locale = await getLocale();
  const params = searchParams ? await searchParams : undefined;
  const statusFilter =
    params?.status === "done" || params?.status === "canceled" || params?.status === "open"
      ? params.status
      : "all";
  const focusId = String(params?.focus ?? "").trim();
  const copy = requestsCopy[locale];
  const requests = await listHubServiceRequests();
  const filtered = statusFilter === "all" ? requests : requests.filter((request) => request.status === statusFilter);
  const sorted = [...filtered].sort((a, b) => (b.occurredAt?.getTime() ?? 0) - (a.occurredAt?.getTime() ?? 0));
  const openCount = sorted.filter((request) => request.status === "open").length;
  const doneCount = sorted.filter((request) => request.status === "done").length;
  const canceledCount = sorted.filter((request) => request.status === "canceled").length;
  const totalBudget = sorted.reduce((sum, request) => sum + (request.cost ?? 0), 0);
  const allocatedBudget = Math.round(totalBudget * 0.72);
  const allocationPercent = totalBudget > 0 ? Math.round((allocatedBudget / totalBudget) * 100) : 0;
  const vendorCount = new Set(sorted.map((request) => request.relatedParty).filter(Boolean)).size;
  const pendingApproval = openCount;
  const slaRate = sorted.length > 0 ? Math.round((doneCount / sorted.length) * 1000) / 10 : 0;
  const returnTo = statusFilter === "all" ? "/service-requests" : `/service-requests?status=${statusFilter}`;
  const flashMap = {
    request_created: {
      ja: "対応依頼を登録しました。",
      zh: "服务请求已创建。",
      ko: "서비스 요청을 등록했습니다.",
    },
    request_status_updated: {
      ja: "対応依頼の状態を更新しました。",
      zh: "服务请求状态已更新。",
      ko: "서비스 요청 상태를 업데이트했습니다.",
    },
    request_batch_updated: {
      ja: "対応依頼を一括更新しました。",
      zh: "服务请求已批量更新。",
      ko: "서비스 요청을 일괄 업데이트했습니다.",
    },
    request_status_undone: {
      ja: "直前の変更を取り消しました。",
      zh: "已撤销刚才的变更。",
      ko: "방금 변경을 되돌렸습니다.",
    },
  } as const;
  const flashKey = String(params?.flash ?? "").trim() as keyof typeof flashMap;
  const flashMessage = flashMap[flashKey]?.[locale];
  const undoTaskId = String(params?.undoTaskId ?? "").trim();
  const undoStatus = String(params?.undoStatus ?? "").trim();
  const undoClientId = String(params?.undoClientId ?? "").trim();

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">{t(locale, "service.title")}</h1>
          <p className="mt-1 text-sm font-medium text-slate-600">
            {copy.subtitlePrefix} {openCount} {copy.subtitleSuffix}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/service-requests?status=open" className="inline-flex items-center gap-2 rounded-lg bg-[#e9effc] px-4 py-2 text-sm font-semibold text-slate-800">
            <span className="material-symbols-outlined text-[18px]">filter_list</span>
            {copy.filterLedger}
          </Link>
          <form id="service-request-quick-create-form" action={createServiceRequestQuickAction} className="flex items-center gap-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input
              name="title"
              placeholder={copy.quickRequestPlaceholder}
              className="w-48 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#d5e3fc]"
            />
            <button className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#001e40] to-[#003366] px-5 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(0,30,64,0.7)]">
              <span className="material-symbols-outlined text-[18px]">add</span>
              {copy.newRequest}
            </button>
          </form>
          <FormDraftAssist
            formId="service-request-quick-create-form"
            storageKey="draft:service-requests:quick-create"
            fieldNames={["title"]}
            reuseKey="service-requests:quick-create"
            locale={locale}
          />
        </div>
      </section>
      <PageFlashBanner message={flashMessage} />
      {undoTaskId && undoStatus && undoClientId ? (
        <section className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <form action={undoTaskStatusAction} className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-700">
              {locale === "zh"
                ? "如需撤销本次状态更新，可立即执行。"
                : locale === "ko"
                  ? "이번 상태 변경을 되돌리려면 지금 실행하세요."
                  : "直前の状態変更を取り消す場合は、今すぐ実行してください。"}
            </p>
            <input type="hidden" name="taskId" value={undoTaskId} />
            <input type="hidden" name="status" value={undoStatus} />
            <input type="hidden" name="clientId" value={undoClientId} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              {locale === "zh" ? "撤销" : locale === "ko" ? "되돌리기" : "取り消す"}
            </button>
          </form>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-12">
        <article className="xl:col-span-5 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200/30">
          <div className="mb-5 flex items-start justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{copy.maintenanceBudget}</p>
            <span className="material-symbols-outlined text-[#d8885c]">analytics</span>
          </div>
          <p className="text-5xl font-light tracking-tight text-slate-900">{formatCurrency(totalBudget, locale)}</p>
          <p className="mt-1 text-sm text-slate-500">{copy.remainingReserve}</p>
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">
                {copy.allocated} ({allocationPercent}%)
              </span>
              <span className="tabular-nums">
                {formatCurrency(allocatedBudget, locale)} / {formatCurrency(totalBudget, locale)} {copy.total}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#edf2fd]">
              <div className="h-full bg-[#001e40]" style={{ width: `${allocationPercent}%` }} />
            </div>
          </div>
        </article>

        <article className="xl:col-span-4 rounded-xl bg-[#e6eeff] p-6 shadow-sm ring-1 ring-slate-200/30">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{copy.verificationContext}</p>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d5e3fc] text-[#001e40]">
                  <span className="material-symbols-outlined text-[16px]">verified_user</span>
                </span>
                <span className="text-sm font-semibold text-slate-800">{copy.certifiedVendors}</span>
              </div>
              <span className="text-sm font-bold tabular-nums">{vendorCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d5e3fc] text-[#d8885c]">
                  <span className="material-symbols-outlined text-[16px]">pending</span>
                </span>
                <span className="text-sm font-semibold text-slate-800">{copy.pendingApproval}</span>
              </div>
              <span className="text-sm font-bold tabular-nums">{pendingApproval}</span>
            </div>
          </div>
          <Link href="/templates" className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-[#d5e3fc] py-2 text-xs font-bold uppercase tracking-widest text-[#1f477b]">
            {copy.manageCredentials}
          </Link>
        </article>

        <div className="space-y-5 xl:col-span-3">
          <article className="rounded-xl bg-[#001e40] p-6 text-white shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-white/70">{copy.slaResponse}</p>
            <p className="mt-1 text-4xl font-bold">{slaRate}%</p>
            <p className="mt-2 inline-block rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">{copy.excellence}</p>
          </article>
          <article className="rounded-xl bg-[#edf2fd] p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{copy.criticalErrors}</p>
            <p className="mt-1 text-4xl font-bold text-red-600 tabular-nums">{String(canceledCount).padStart(2, "0")}</p>
            <p className="mt-2 inline-block rounded border border-red-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-red-500">{copy.actionRequired}</p>
          </article>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/35">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-bold tracking-tight text-slate-900">{copy.activeQueue}</h2>
          <div className="flex gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#d8885c]" />
              {copy.urgent}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#001e40]" />
              {copy.standard}
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr className="bg-[#edf2fd]/60 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500">
                <th className="px-6 py-4">{copy.tableRef}</th>
                <th className="px-6 py-4">{copy.tablePropertyAsset}</th>
                <th className="px-6 py-4">{copy.tableContractor}</th>
                <th className="px-6 py-4">{copy.tableStatus}</th>
                <th className="px-6 py-4">{copy.tableBudgetedCost}</th>
                <th className="px-6 py-4 text-right">{copy.tableActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[13px]">
              {sorted.slice(0, 6).map((request, index) => (
                <tr
                  key={request.id}
                  className={
                    (index % 2 === 1 ? "bg-[#f8fbff] " : "") +
                    "group transition hover:bg-[#edf2fd]/40 " +
                    (focusId === request.id ? "ring-2 ring-[#001e40]/15" : "")
                  }
                >
                  <td className="px-6 py-5 text-sm font-bold tabular-nums text-[#001e40]">SR-{request.id.slice(-4).toUpperCase()}</td>
                  <td className="px-6 py-5">
                    <p className="text-sm font-bold text-slate-900">{request.relatedProperty ?? t(locale, "common.notSet")}</p>
                    <p className="text-xs text-slate-500">{request.title}</p>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded bg-[#edf2fd]">
                        <span className="material-symbols-outlined text-[14px] text-[#001e40]">{index % 2 ? "architecture" : "construction"}</span>
                      </span>
                      <span className="font-medium text-slate-800">{request.relatedParty ?? copy.fallbackContractor}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-tight ${statusClass[request.status]}`}>
                      {t(locale, `request.status.${request.status}`)}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-sm font-bold tabular-nums text-slate-900">{formatCurrency(request.cost ?? 0, locale)}</td>
                  <td className="px-6 py-5 text-right">
                    <div className="inline-flex items-center gap-1">
                      {request.clientId ? (
                        <>
                          <form action={changeTaskStatusAction}>
                            <input type="hidden" name="taskId" value={request.id} />
                            <input type="hidden" name="clientId" value={request.clientId} />
                            <input type="hidden" name="status" value="pending" />
                            <input type="hidden" name="previousStatus" value={request.status === "open" ? "pending" : request.status} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <button
                              type="submit"
                              disabled={request.status === "open"}
                              className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {copy.markOpen}
                            </button>
                          </form>
                          <form action={changeTaskStatusAction}>
                            <input type="hidden" name="taskId" value={request.id} />
                            <input type="hidden" name="clientId" value={request.clientId} />
                            <input type="hidden" name="status" value="done" />
                            <input type="hidden" name="previousStatus" value={request.status === "open" ? "pending" : request.status} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <button
                              type="submit"
                              disabled={request.status === "done"}
                              className="rounded-md border border-emerald-300 px-2 py-1 text-[11px] font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {copy.markDone}
                            </button>
                          </form>
                          <form action={changeTaskStatusAction}>
                            <input type="hidden" name="taskId" value={request.id} />
                            <input type="hidden" name="clientId" value={request.clientId} />
                            <input type="hidden" name="status" value="canceled" />
                            <input type="hidden" name="previousStatus" value={request.status === "open" ? "pending" : request.status} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <button
                              type="submit"
                              disabled={request.status === "canceled"}
                              className="rounded-md border border-rose-300 px-2 py-1 text-[11px] font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {copy.markCanceled}
                            </button>
                          </form>
                          <Link
                            href={`/clients/${request.clientId}`}
                            className="inline-flex rounded-lg p-2 text-[#001e40] transition hover:bg-white hover:shadow-sm"
                          >
                            <span className="material-symbols-outlined text-[18px]">visibility</span>
                          </Link>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">
                    {copy.batchNone}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200/35">
        <h2 className="text-base font-bold tracking-tight text-slate-900">{copy.batchTitle}</h2>
        <p className="mt-1 text-xs text-slate-500">{copy.batchDesc}</p>
        <form action={batchUpdateServiceRequestStatusAction} className="mt-4 space-y-3">
          <input type="hidden" name="returnTo" value={returnTo} />
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-600">{copy.batchTargetStatus}</span>
              <select
                name="status"
                defaultValue="done"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <option value="pending">{copy.markOpen}</option>
                <option value="done">{copy.markDone}</option>
                <option value="canceled">{copy.markCanceled}</option>
              </select>
            </label>
            <div className="flex items-end">
              <button className="w-full rounded-lg bg-[#001e40] px-4 py-2 text-sm font-semibold text-white">{copy.batchApply}</button>
            </div>
          </div>
          <div className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
            {sorted.length === 0 ? <p className="text-sm text-slate-500">{copy.batchNone}</p> : null}
            <div className="space-y-2">
              {sorted.slice(0, 30).map((request) => (
                <label key={`batch-${request.id}`} className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-sm">
                  <input type="checkbox" name="taskIds" value={request.id} className="h-4 w-4 rounded border-slate-300" />
                  <span className="min-w-0 flex-1 truncate text-slate-800">
                    {request.title} · {request.relatedParty ?? t(locale, "common.notSet")}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusClass[request.status]}`}>
                    {t(locale, `request.status.${request.status}`)}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </form>
      </section>

      <section>
        <div className="mb-5 flex items-center gap-3">
          <span className="material-symbols-outlined text-[#001e40]">photo_library</span>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{copy.evidenceTitle}</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-4">
          {evidenceImages.map((image, index) => (
            <div key={image} className="group relative aspect-square overflow-hidden rounded-xl border-2 border-transparent shadow-md transition hover:border-[#001e40]">
              <Image src={image} alt="evidence" fill sizes="(min-width: 768px) 25vw, 50vw" className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#001e40]/90 to-transparent p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white">SR-{sorted[index]?.id.slice(-4).toUpperCase() ?? "0000"}</p>
              </div>
            </div>
          ))}
          <Link href="/import-center" className="flex aspect-square flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-[#edf2fd] transition hover:bg-[#e2eafc]">
            <span className="material-symbols-outlined mb-2 text-4xl text-slate-400">add_a_photo</span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">{copy.uploadProof}</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
