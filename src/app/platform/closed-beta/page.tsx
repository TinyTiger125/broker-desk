import type { Metadata } from "next";
import { getLocale, type Locale } from "@/lib/locale";
import { getTokyoCalendarDate, deriveTenantServiceState, getTenantServiceStatusLabel } from "@/lib/tenant-service";
import { listClosedBetaAccessSummary } from "@/lib/closed-beta-access";
import { PlatformSessionError, requirePlatformOwnerSession } from "@/lib/platform-session";
import { updateClosedBetaAccessAction } from "@/app/platform/closed-beta/actions";
import { ClosedBetaTesterForm } from "@/components/closed-beta-tester-form";
import { ClosedBetaRecoveryForm } from "@/components/closed-beta-recovery-form";
import { isDemoAuthEnabled } from "@/lib/auth-mode";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { referrer: "no-referrer" };

const copy: Record<Locale, {
  title: string;
  forbidden: string;
  createHeading: string;
  summaryHeading: string;
  noAccounts: string;
  service: string;
  invitation: string;
  identity: string;
  bound: string;
  unbound: string;
  extend: string;
  revoke: string;
  audit: string;
  noAudit: string;
}> = {
  zh: {
    title: "封闭测试账号",
    forbidden: "需要平台管理员权限。",
    createHeading: "添加测试者",
    summaryHeading: "测试者与访问",
    noAccounts: "还没有测试者。",
    service: "服务期",
    invitation: "邀请状态",
    identity: "身份绑定",
    bound: "已绑定外部身份",
    unbound: "尚未绑定",
    extend: "延长到",
    revoke: "撤销访问",
    audit: "最近审计",
    noAudit: "暂无审计记录。",
  },
  ja: {
    title: "クローズドテストアカウント",
    forbidden: "プラットフォーム管理者権限が必要です。",
    createHeading: "テスターを追加",
    summaryHeading: "テスターとアクセス",
    noAccounts: "テスターはまだいません。",
    service: "サービス期間",
    invitation: "招待状態",
    identity: "ID 連携",
    bound: "外部 ID 連携済み",
    unbound: "未連携",
    extend: "延長先",
    revoke: "アクセスを取消",
    audit: "最近の監査",
    noAudit: "監査記録はありません。",
  },
  ko: {
    title: "클로즈드 베타 계정",
    forbidden: "플랫폼 관리자 권한이 필요합니다.",
    createHeading: "테스터 추가",
    summaryHeading: "테스터 및 접근",
    noAccounts: "아직 테스터가 없습니다.",
    service: "서비스 기간",
    invitation: "초대 상태",
    identity: "ID 연결",
    bound: "외부 ID 연결됨",
    unbound: "연결되지 않음",
    extend: "연장일",
    revoke: "접근 취소",
    audit: "최근 감사",
    noAudit: "감사 기록이 없습니다.",
  },
};

function statusTone(status: string) {
  if (status === "active" || status === "expiring") return "bg-emerald-100 text-emerald-800";
  if (status === "pending" || status === "suspended") return "bg-amber-100 text-amber-900";
  return "bg-rose-100 text-rose-800";
}

function dateLabel(value: string | undefined, locale: Locale) {
  if (!value) return "-";
  return new Date(value).toLocaleString(locale === "ja" ? "ja-JP" : locale === "ko" ? "ko-KR" : "zh-CN", {
    timeZone: "Asia/Tokyo",
    dateStyle: "medium",
  });
}

export default async function ClosedBetaAccessPage() {
  const locale = await getLocale();
  const text = copy[locale];
  let session;
  try {
    session = await requirePlatformOwnerSession();
  } catch (error) {
    if (error instanceof PlatformSessionError) {
      return (
        <div className="mx-auto max-w-3xl rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-900">
          <h1 className="text-xl font-black">{text.title}</h1>
          <p className="mt-2 text-sm font-semibold">{text.forbidden}</p>
        </div>
      );
    }
    throw error;
  }

  const summaries = await listClosedBetaAccessSummary(session.user.id);
  const today = getTokyoCalendarDate();

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">PlatformOwner / {session.user.name}</p>
        <h1 className="text-3xl font-black tracking-tight text-slate-950">{text.title}</h1>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-5" aria-labelledby="closed-beta-create-heading">
        <h2 id="closed-beta-create-heading" className="text-lg font-black text-slate-950">{text.createHeading}</h2>
        <div className="mt-4">
          <ClosedBetaTesterForm locale={locale} defaultServiceStartAt={today} demoMode={isDemoAuthEnabled()} />
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="closed-beta-summary-heading">
        <h2 id="closed-beta-summary-heading" className="text-lg font-black text-slate-950">{text.summaryHeading}</h2>
        {summaries.length === 0 ? <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">{text.noAccounts}</p> : null}
        {summaries.map(({ account, audit }) => {
          const service = deriveTenantServiceState(account);
          const owner = account.ownerMembers[0];
          return (
            <article key={account.id} className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-slate-950">{account.name}</h3>
                  <p className="mt-1 break-all text-xs font-semibold text-slate-500">{owner?.user.email ?? "-"}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${statusTone(service.status)}`}>
                  {getTenantServiceStatusLabel(service.status, locale)}
                </span>
              </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div><dt className="font-bold text-slate-500">{text.service}</dt><dd className="mt-1 text-slate-800">{account.serviceStartAt ?? "-"} → {account.serviceEndAt ?? "-"}</dd></div>
                <div><dt className="font-bold text-slate-500">{text.invitation}</dt><dd className="mt-1 text-slate-800">{owner?.invitationStatus ?? "-"} · {owner?.invitationProvider ?? "-"} · {owner?.invitationDeliveryState ?? "ready"}</dd></div>
                <div><dt className="font-bold text-slate-500">{text.identity}</dt><dd className="mt-1 text-slate-800">{owner?.isBoundToExternalAuth ? text.bound : text.unbound}</dd></div>
              </dl>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto]">
                <form action={updateClosedBetaAccessAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="tenantId" value={account.id} />
                  <input type="hidden" name="operation" value="extend" />
                  <input type="hidden" name="serviceStartAt" value={account.serviceStartAt ?? ""} />
                  <label className="grid gap-1 text-xs font-bold text-slate-600">
                    <span>{text.extend}</span>
                    <input name="serviceEndAt" type="date" required defaultValue={account.serviceEndAt ?? ""} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800" />
                  </label>
                  <button className="min-h-11 rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white">{text.extend}</button>
                </form>
                <form action={updateClosedBetaAccessAction}>
                  <input type="hidden" name="tenantId" value={account.id} />
                  <input type="hidden" name="operation" value="revoke" />
                  <input type="hidden" name="serviceStartAt" value={account.serviceStartAt ?? ""} />
                  <input type="hidden" name="serviceEndAt" value={account.serviceEndAt ?? ""} />
                  <button className="min-h-11 rounded-lg border border-rose-300 px-4 py-2 text-sm font-black text-rose-800">{text.revoke}</button>
                </form>
              </div>

              {owner
                && owner.status === "invited"
                && (owner.invitationStatus === "failed" || owner.invitationStatus === "not_sent")
                && owner.invitationDeliveryState !== "sending"
                && owner.invitationDeliveryState !== "unknown" ? (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <ClosedBetaRecoveryForm locale={locale} tenantId={account.id} membershipId={owner.id} />
                </div>
              ) : null}

              <div className="mt-5 border-t border-slate-100 pt-4">
                <h4 className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{text.audit}</h4>
                {audit.length === 0 ? <p className="mt-2 text-xs text-slate-500">{text.noAudit}</p> : (
                  <ul className="mt-2 space-y-2">
                    {audit.map((entry) => (
                      <li key={entry.id} className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                        <span className="font-bold text-slate-800">{entry.action}</span>
                        <span>{dateLabel(entry.createdAt.toISOString(), locale)}</span>
                        <span>{entry.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
