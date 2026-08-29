import Link from "next/link";
import { getLocale, type Locale } from "@/lib/locale";
import { requireTenantReadOnlySession, TenantSessionError } from "@/lib/tenant-session";
import { getTenantServiceStatusLabel, isTenantServiceOperational } from "@/lib/tenant-service";

export const dynamic = "force-dynamic";

function copy(locale: Locale) {
  return locale === "zh"
    ? { title: "服务状态", denied: "无法读取该工作区的服务信息。", retained: "登录与既有数据仍会保留；服务恢复前，业务操作和新增邀请不可用。", start: "开始日期", end: "结束日期", remaining: "剩余天数", days: "天", back: "选择其他工作区", open: "进入工作台" }
    : locale === "ko"
      ? { title: "서비스 상태", denied: "이 워크스페이스의 서비스 정보를 읽을 수 없습니다.", retained: "로그인과 기존 데이터는 유지됩니다. 서비스가 복구될 때까지 업무 작업과 새 초대는 사용할 수 없습니다.", start: "시작일", end: "종료일", remaining: "남은 일수", days: "일", back: "다른 워크스페이스 선택", open: "업무 화면 열기" }
      : { title: "サービス状態", denied: "このワークスペースのサービス情報を読み取れません。", retained: "ログインと既存データは保持されます。サービス再開までは業務操作と新規招待を利用できません。", start: "開始日", end: "終了日", remaining: "残日数", days: "日", back: "別のワークスペースを選択", open: "業務画面を開く" };
}

export default async function ServiceStatusPage({ searchParams }: { searchParams?: Promise<{ tenantId?: string }> }) {
  const [locale, params] = await Promise.all([getLocale(), searchParams ?? Promise.resolve<{ tenantId?: string }>({})]);
  const text = copy(locale);
  let session: Awaited<ReturnType<typeof requireTenantReadOnlySession>> | null = null;
  try {
    session = await requireTenantReadOnlySession({ requestedTenantId: params.tenantId });
  } catch (error) {
    if (!(error instanceof TenantSessionError)) throw error;
  }
  if (!session) {
    return <main className="mx-auto max-w-3xl border border-rose-200 bg-rose-50 p-6"><h1 className="text-2xl font-bold">{text.title}</h1><p className="mt-2">{text.denied}</p><Link href="/workspace" className="mt-4 inline-flex min-h-11 items-center border border-slate-300 bg-white px-4 font-bold">{text.back}</Link></main>;
  }
  const state = session.serviceState;
  const operational = isTenantServiceOperational(state);
  return (
      <main className="mx-auto max-w-3xl space-y-6 rounded-lg border border-slate-200 bg-white p-6">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Broker Desk</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">{text.title}</h1>
          <p className="mt-2 text-lg font-bold text-slate-900">{session.tenant.name}</p>
        </header>
        <section className={`border p-5 ${operational ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
          <p className="text-xl font-black">{getTenantServiceStatusLabel(state.status, locale)}</p>
          {!operational ? <p className="mt-2 text-sm leading-6">{text.retained}</p> : null}
        </section>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="border border-slate-200 p-4"><dt className="text-xs font-bold text-slate-500">{text.start}</dt><dd className="mt-1 font-bold">{state.serviceStartAt ?? "-"}</dd></div>
          <div className="border border-slate-200 p-4"><dt className="text-xs font-bold text-slate-500">{text.end}</dt><dd className="mt-1 font-bold">{state.serviceEndAt ?? "-"}</dd></div>
          <div className="border border-slate-200 p-4"><dt className="text-xs font-bold text-slate-500">{text.remaining}</dt><dd className="mt-1 font-bold">{state.remainingDays == null ? "-" : `${Math.max(0, state.remainingDays)} ${text.days}`}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <Link href="/workspace" className="inline-flex min-h-11 items-center border border-slate-300 px-4 text-sm font-bold">{text.back}</Link>
          {operational ? <Link href="/" className="inline-flex min-h-11 items-center bg-slate-950 px-4 text-sm font-bold text-white">{text.open}</Link> : null}
        </div>
      </main>
  );
}
