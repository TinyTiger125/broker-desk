import { batchUpdateServiceRequestStatusAction, changeTaskStatusAction, createServiceRequestQuickAction, undoTaskStatusAction } from "@/app/actions";
import Link from "next/link";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { formatDate } from "@/lib/format";
import { listHubServiceRequests, type HubServiceRequestItem } from "@/lib/hub";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

const statusClass: Record<HubServiceRequestItem["status"], string> = {
  open: "bg-amber-50 text-amber-700 border-amber-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  canceled: "bg-slate-100 text-slate-600 border-slate-200",
};

const copy = {
  ja: { subtitle: "対応記録を状態別に確認します。", filter: "状態で絞り込む", create: "新規対応", placeholder: "対応内容を入力", queue: "対応一覧", reference: "記録番号", party: "関連主体", status: "状態", occurred: "記録日", action: "操作", open: "再開", done: "完了", canceled: "取消", batch: "選択した記録を更新", batchDesc: "対象を選択してから状態を更新します。", target: "更新先", apply: "状態を更新", none: "選択可能な対応記録がありません。", empty: "対応記録はありません。", undo: "直前の変更を取り消せます。", undoButton: "取り消す" },
  zh: { subtitle: "按状态查看已保存的跟进记录。", filter: "按状态筛选", create: "新建跟进", placeholder: "输入跟进内容", queue: "跟进列表", reference: "记录号", party: "相关主体", status: "状态", occurred: "记录日期", action: "操作", open: "重新打开", done: "完成", canceled: "取消", batch: "更新所选记录", batchDesc: "先选择记录，再更新状态。", target: "目标状态", apply: "更新状态", none: "暂无可选择的跟进记录。", empty: "暂无跟进记录。", undo: "可以撤销刚才的状态变更。", undoButton: "撤销" },
  ko: { subtitle: "저장된 후속 기록을 상태별로 확인합니다.", filter: "상태 필터", create: "새 후속 기록", placeholder: "후속 내용 입력", queue: "후속 기록 목록", reference: "기록 번호", party: "관련 주체", status: "상태", occurred: "기록일", action: "작업", open: "재개", done: "완료", canceled: "취소", batch: "선택 기록 업데이트", batchDesc: "기록을 선택한 뒤 상태를 업데이트합니다.", target: "변경 상태", apply: "상태 업데이트", none: "선택 가능한 기록이 없습니다.", empty: "후속 기록이 없습니다.", undo: "방금 상태 변경을 되돌릴 수 있습니다.", undoButton: "되돌리기" },
} as const;

type ServiceRequestsPageProps = { searchParams?: Promise<{ status?: string; flash?: string; undoTaskId?: string; undoStatus?: string; undoClientId?: string }> };

export default async function ServiceRequestsPage({ searchParams }: ServiceRequestsPageProps) {
  const [locale, session] = await Promise.all([getLocale(), requireTenantSession({ permission: "record.read" })]);
  const params = searchParams ? await searchParams : undefined;
  const statusFilter = params?.status === "done" || params?.status === "canceled" || params?.status === "open" ? params.status : "all";
  const text = copy[locale];
  const requests = await listHubServiceRequests({ userId: session.user.id, tenantId: session.tenant.id });
  const filtered = statusFilter === "all" ? requests : requests.filter((request) => request.status === statusFilter);
  const sorted = [...filtered].sort((a, b) => (b.occurredAt?.getTime() ?? 0) - (a.occurredAt?.getTime() ?? 0));
  const returnTo = statusFilter === "all" ? "/service-requests" : `/service-requests?status=${statusFilter}`;
  const flashMap = {
    request_created: { ja: "対応履歴を登録しました。", zh: "跟进记录已创建。", ko: "후속 기록을 등록했습니다." },
    request_status_updated: { ja: "対応履歴の状態を更新しました。", zh: "跟进记录状态已更新。", ko: "후속 기록 상태를 업데이트했습니다." },
    request_batch_updated: { ja: "対応履歴を一括更新しました。", zh: "跟进记录已批量更新。", ko: "후속 기록을 일괄 업데이트했습니다." },
    request_status_undone: { ja: "直前の変更を取り消しました。", zh: "已撤销刚才的变更。", ko: "방금 상태 변경을 되돌렸습니다." },
  } as const;
  const flash = flashMap[String(params?.flash ?? "").trim() as keyof typeof flashMap]?.[locale];
  const undoTaskId = String(params?.undoTaskId ?? "").trim();
  const undoStatus = String(params?.undoStatus ?? "").trim();
  const undoClientId = String(params?.undoClientId ?? "").trim();

  const actionForm = (request: HubServiceRequestItem) => request.clientId ? (
    <div className="flex flex-wrap items-center gap-2">
      {(["pending", "done", "canceled"] as const).map((status) => (
        <form action={changeTaskStatusAction} key={status}>
          <input type="hidden" name="taskId" value={request.id} /><input type="hidden" name="clientId" value={request.clientId} /><input type="hidden" name="status" value={status} /><input type="hidden" name="previousStatus" value={request.status === "open" ? "pending" : request.status} /><input type="hidden" name="returnTo" value={returnTo} />
          <button type="submit" disabled={(status === "pending" && request.status === "open") || (status === request.status)} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-40">{status === "pending" ? text.open : status === "done" ? text.done : text.canceled}</button>
        </form>
      ))}
      <Link href={`/clients/${request.clientId}`} className="text-xs text-blue-700 hover:underline">{text.party}</Link>
    </div>
  ) : <span className="text-xs text-slate-400">-</span>;

  return (
    <div className="space-y-6">
      <PageFlashBanner message={flash} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-bold tracking-tight text-slate-900">{t(locale, "service.title")}</h1><p className="mt-1 text-sm text-slate-600">{text.subtitle}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/service-requests?status=${statusFilter === "open" ? "all" : "open"}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">{text.filter}</Link>
          <form action={createServiceRequestQuickAction} className="flex items-center gap-2"><input type="hidden" name="returnTo" value={returnTo} /><input required name="title" placeholder={text.placeholder} className="w-44 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">{text.create}</button></form>
        </div>
      </header>
      {undoTaskId && undoStatus && undoClientId ? <section className="rounded-xl border border-slate-200 bg-white px-4 py-3"><form action={undoTaskStatusAction} className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-700">{text.undo}</p><input type="hidden" name="taskId" value={undoTaskId} /><input type="hidden" name="status" value={undoStatus} /><input type="hidden" name="clientId" value={undoClientId} /><input type="hidden" name="returnTo" value={returnTo} /><button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">{text.undoButton}</button></form></section> : null}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">{text.batch}</h2><p className="mt-1 text-xs text-slate-500">{text.batchDesc}</p>
        <form action={batchUpdateServiceRequestStatusAction} className="mt-4 space-y-3"><input type="hidden" name="returnTo" value={returnTo} /><div className="flex flex-wrap items-end gap-3"><label className="min-w-44 space-y-1"><span className="text-xs font-semibold text-slate-600">{text.target}</span><select name="status" defaultValue="done" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"><option value="pending">{text.open}</option><option value="done">{text.done}</option><option value="canceled">{text.canceled}</option></select></label><button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">{text.apply}</button></div><div className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">{sorted.length === 0 ? <p className="text-sm text-slate-500">{text.none}</p> : null}<div className="space-y-2">{sorted.slice(0, 40).map((request) => <label key={`batch-${request.id}`} className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-sm"><input type="checkbox" name="taskIds" value={request.id} className="h-4 w-4 rounded border-slate-300" /><span className="min-w-0 flex-1 truncate text-slate-800">{request.title}</span><span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${statusClass[request.status]}`}>{t(locale, `request.status.${request.status}`)}</span></label>)}</div></div></form>
      </section>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-base font-semibold text-slate-900">{text.queue}</h2></div>
        <div className="hidden overflow-x-auto md:block"><table className="w-full border-collapse text-left"><thead className="bg-slate-50"><tr className="text-xs text-slate-500"><th className="px-4 py-3">{text.reference}</th><th className="px-4 py-3">{text.party}</th><th className="px-4 py-3">{text.status}</th><th className="px-4 py-3">{text.occurred}</th><th className="px-4 py-3 text-right">{text.action}</th></tr></thead><tbody className="divide-y divide-slate-100">{sorted.map((request) => <tr key={request.id} className="align-top hover:bg-slate-50"><td className="px-4 py-3 text-sm text-slate-800"><p className="font-semibold">{request.title}</p><p className="text-xs text-slate-500">SR-{request.id.slice(-4).toUpperCase()}</p></td><td className="px-4 py-3 text-sm text-slate-700">{request.clientId ? <Link href={`/clients/${request.clientId}`} className="text-blue-700 hover:underline">{request.relatedParty ?? t(locale, "common.notSet")}</Link> : (request.relatedParty ?? t(locale, "common.notSet"))}</td><td className="px-4 py-3"><span className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass[request.status]}`}>{t(locale, `request.status.${request.status}`)}</span></td><td className="px-4 py-3 text-sm text-slate-600">{formatDate(request.occurredAt, locale)}</td><td className="px-4 py-3 text-right">{actionForm(request)}</td></tr>)}{sorted.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">{text.empty}</td></tr> : null}</tbody></table></div>
        <div className="divide-y divide-slate-100 md:hidden">{sorted.map((request) => <article key={request.id} className="space-y-2 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{request.title}</p><p className="text-xs text-slate-500">SR-{request.id.slice(-4).toUpperCase()}</p></div><span className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass[request.status]}`}>{t(locale, `request.status.${request.status}`)}</span></div><p className="text-sm text-slate-700">{request.clientId ? <Link href={`/clients/${request.clientId}`} className="text-blue-700 hover:underline">{request.relatedParty ?? t(locale, "common.notSet")}</Link> : (request.relatedParty ?? t(locale, "common.notSet"))} · {formatDate(request.occurredAt, locale)}</p>{actionForm(request)}</article>)}{sorted.length === 0 ? <p className="px-4 py-10 text-center text-sm text-slate-500">{text.empty}</p> : null}</div>
      </section>
    </div>
  );
}
