import { batchUpdateServiceRequestStatusAction, changeTaskStatusAction, createServiceRequestQuickAction, undoTaskStatusAction } from "@/app/actions";
import Link from "next/link";
import Image from "next/image";
import { FormDraftAssist } from "@/components/form-draft-assist";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { formatCurrency } from "@/lib/format";
import { listHubServiceRequests, type HubServiceRequestItem } from "@/lib/hub";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

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
    subtitlePrefix: "未完了の対応履歴",
    subtitleSuffix: "件を管理中です。",
    filterLedger: "台帳を絞り込み",
    newRequest: "新規対応",
    maintenanceBudget: "対応費用",
    remainingReserve: "今期の確認済み費用",
    allocated: "確認済み",
    total: "合計",
    verificationContext: "対応対象",
    certifiedVendors: "関連先",
    pendingApproval: "未完了",
    manageCredentials: "資料設定を見る",
    slaResponse: "完了率",
    excellence: "完了済み",
    criticalErrors: "取消記録",
    actionRequired: "要対応",
    activeQueue: "未完了の対応",
    urgent: "緊急",
    standard: "通常",
    tableRef: "記録番号",
    tablePropertyAsset: "物件",
    tableContractor: "関連先",
    tableStatus: "状態",
    tableBudgetedCost: "予算費用",
    tableActions: "操作",
    markOpen: "再開",
    markDone: "完了",
    markCanceled: "取消",
    fallbackContractor: "未指定",
    evidenceTitle: "関連資料",
    uploadProof: "資料を追加",
    quickRequestPlaceholder: "対応内容を入力",
    batchTitle: "一括更新",
    batchDesc: "複数の対応履歴をまとめて更新",
    batchTargetStatus: "更新先ステータス",
    batchApply: "一括反映",
    batchNone: "選択可能な対応履歴がありません。",
  },
  zh: {
    subtitlePrefix: "当前有",
    subtitleSuffix: "条未完成跟进记录。",
    filterLedger: "筛选台账",
    newRequest: "新建跟进",
    maintenanceBudget: "处理费用",
    remainingReserve: "本期已确认费用",
    allocated: "已确认",
    total: "总计",
    verificationContext: "处理对象",
    certifiedVendors: "相关对象",
    pendingApproval: "待处理",
    manageCredentials: "查看资料设置",
    slaResponse: "完成比例",
    excellence: "已完成",
    criticalErrors: "取消记录",
    actionRequired: "需处理",
    activeQueue: "待处理跟进",
    urgent: "紧急",
    standard: "标准",
    tableRef: "记录号",
    tablePropertyAsset: "物件",
    tableContractor: "相关对象",
    tableStatus: "状态",
    tableBudgetedCost: "预算费用",
    tableActions: "操作",
    markOpen: "重新打开",
    markDone: "标记完成",
    markCanceled: "标记取消",
    fallbackContractor: "未指定",
    evidenceTitle: "相关资料",
    uploadProof: "添加资料",
    quickRequestPlaceholder: "输入跟进内容",
    batchTitle: "批量更新",
    batchDesc: "一次更新多条跟进记录",
    batchTargetStatus: "目标状态",
    batchApply: "批量应用",
    batchNone: "暂无可选择的跟进记录。",
  },
  ko: {
    subtitlePrefix: "현재",
    subtitleSuffix: "건의 미완료 후속 기록이 있습니다.",
    filterLedger: "원장 필터",
    newRequest: "새 후속 기록",
    maintenanceBudget: "처리 비용",
    remainingReserve: "이번 기간 확인 비용",
    allocated: "확인됨",
    total: "총액",
    verificationContext: "처리 대상",
    certifiedVendors: "관련 대상",
    pendingApproval: "미완료",
    manageCredentials: "자료 설정 보기",
    slaResponse: "완료 비율",
    excellence: "완료됨",
    criticalErrors: "취소 기록",
    actionRequired: "조치 필요",
    activeQueue: "미완료 후속 기록",
    urgent: "긴급",
    standard: "표준",
    tableRef: "기록 번호",
    tablePropertyAsset: "매물",
    tableContractor: "관련 대상",
    tableStatus: "상태",
    tableBudgetedCost: "예산 비용",
    tableActions: "작업",
    markOpen: "재개",
    markDone: "완료",
    markCanceled: "취소",
    fallbackContractor: "미지정",
    evidenceTitle: "관련 자료",
    uploadProof: "자료 추가",
    quickRequestPlaceholder: "후속 내용 입력",
    batchTitle: "일괄 업데이트",
    batchDesc: "여러 후속 기록을 한 번에 업데이트",
    batchTargetStatus: "변경 상태",
    batchApply: "일괄 적용",
    batchNone: "선택 가능한 후속 기록이 없습니다.",
  },
} as const;

type ServiceRequestsPageProps = {
  searchParams?: Promise<{ status?: string; flash?: string; focus?: string; undoTaskId?: string; undoStatus?: string; undoClientId?: string }>;
};

export default async function ServiceRequestsPage({ searchParams }: ServiceRequestsPageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.read" }),
  ]);
  const params = searchParams ? await searchParams : undefined;
  const statusFilter =
    params?.status === "done" || params?.status === "canceled" || params?.status === "open"
      ? params.status
      : "all";
  const focusId = String(params?.focus ?? "").trim();
  const copy = requestsCopy[locale];
  const requests = await listHubServiceRequests({ userId: session.user.id, tenantId: session.tenant.id });
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
      ja: "対応履歴を登録しました。",
      zh: "跟进记录已创建。",
      ko: "후속 기록을 등록했습니다.",
    },
    request_status_updated: {
      ja: "対応履歴の状態を更新しました。",
      zh: "跟进记录状态已更新。",
      ko: "후속 기록 상태를 업데이트했습니다.",
    },
    request_batch_updated: {
      ja: "対応履歴を一括更新しました。",
      zh: "跟进记录已批量更新。",
      ko: "후속 기록을 일괄 업데이트했습니다.",
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

      <section className="grid gap-5 2xl:grid-cols-12">
        <article className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200/30 2xl:col-span-5">
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

        <article className="rounded-xl bg-[#e6eeff] p-6 shadow-sm ring-1 ring-slate-200/30 2xl:col-span-4">
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

        <div className="space-y-5 2xl:col-span-3">
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
