import {
  createTenantAccountAction,
  sendPlatformTenantMemberInvitationAction,
  updateTenantAccountLifecycleAction,
} from "@/app/actions";
import { listPlatformTenantAccounts, type TenantAccountSummary, type TenantInvitationStatus, type TenantStatus } from "@/lib/data";
import { getLocale, type Locale } from "@/lib/locale";
import { PlatformSessionError, requirePlatformOwnerSession } from "@/lib/platform-session";

export const dynamic = "force-dynamic";

type PlatformAccountsPageProps = {
  searchParams?: Promise<{
    flash?: string;
  }>;
};

const tenantStatuses: TenantStatus[] = ["trial", "active", "suspended", "cancelled"];

const statusLabels: Record<TenantStatus, Record<Locale, string>> = {
  trial: { ja: "Trial", zh: "试用", ko: "체험" },
  active: { ja: "Active", zh: "启用", ko: "활성" },
  suspended: { ja: "Suspended", zh: "冻结", ko: "중지" },
  cancelled: { ja: "Cancelled", zh: "取消", ko: "취소" },
};

const invitationLabels: Record<TenantInvitationStatus, Record<Locale, string>> = {
  not_sent: { ja: "未送信", zh: "未发送", ko: "미발송" },
  pending: { ja: "招待中", zh: "邀请中", ko: "초대 중" },
  accepted: { ja: "ログイン済み", zh: "已登录", ko: "로그인 완료" },
  revoked: { ja: "取消済み", zh: "已撤销", ko: "취소됨" },
  expired: { ja: "期限切れ", zh: "已过期", ko: "만료됨" },
  failed: { ja: "送信失敗", zh: "发送失败", ko: "전송 실패" },
};

function copy(locale: Locale) {
  return {
    title: locale === "zh" ? "平台账户生命周期" : locale === "ko" ? "플랫폼 계정 라이프사이클" : "プラットフォームアカウント管理",
    subtitle:
      locale === "zh"
        ? "这里开通、冻结、取消地产经纪人或公司组织账户，并控制购买席位数。普通登录用户不能自助注册。"
        : locale === "ko"
          ? "여기에서 개인 중개인 또는 회사 조직 계정을 개설, 중지, 해지하고 구매 좌석 수를 관리합니다. 일반 사용자는 셀프 가입할 수 없습니다."
          : "ここで個人仲介担当者または会社組織のアカウントを開通・停止・解約し、購入席数を管理します。通常ユーザーのセルフサインアップは許可しません。",
    forbidden: locale === "zh" ? "需要平台管理员权限。" : locale === "ko" ? "플랫폼 관리자 권한이 필요합니다." : "プラットフォーム管理者権限が必要です。",
    create: locale === "zh" ? "开通新账户" : locale === "ko" ? "새 계정 개설" : "新規アカウント開通",
    tenantName: locale === "zh" ? "账户/组织名" : locale === "ko" ? "계정/조직명" : "アカウント/組織名",
    slug: locale === "zh" ? "登录标识 slug，可空" : locale === "ko" ? "로그인 식별자 slug, 선택" : "識別 slug、任意",
    accountType: locale === "zh" ? "账户类型" : locale === "ko" ? "계정 유형" : "アカウント種別",
    individual: locale === "zh" ? "个人经纪人" : locale === "ko" ? "개인 중개인" : "個人仲介担当者",
    company: locale === "zh" ? "公司/组织" : locale === "ko" ? "회사/조직" : "会社/組織",
    status: locale === "zh" ? "状态" : locale === "ko" ? "상태" : "状態",
    purchasedSeats: locale === "zh" ? "购买席位" : locale === "ko" ? "구매 좌석" : "購入席数",
    ownerName: locale === "zh" ? "初始负责人姓名" : locale === "ko" ? "초기 책임자 이름" : "初期オーナー氏名",
    ownerEmail: locale === "zh" ? "初始负责人邮箱" : locale === "ko" ? "초기 책임자 이메일" : "初期オーナーメール",
    submitCreate: locale === "zh" ? "开通账户" : locale === "ko" ? "계정 개설" : "アカウント開通",
    accounts: locale === "zh" ? "已售账户" : locale === "ko" ? "판매 계정" : "販売済みアカウント",
    seats: locale === "zh" ? "席位" : locale === "ko" ? "좌석" : "席数",
    used: locale === "zh" ? "已用" : locale === "ko" ? "사용" : "使用中",
    invited: locale === "zh" ? "邀请中" : locale === "ko" ? "초대 중" : "招待中",
    available: locale === "zh" ? "剩余" : locale === "ko" ? "잔여" : "残",
    owner: locale === "zh" ? "负责人" : locale === "ko" ? "책임자" : "オーナー",
    bound: locale === "zh" ? "已绑定" : locale === "ko" ? "연동됨" : "外部ID連携済み",
    unbound: locale === "zh" ? "未绑定" : locale === "ko" ? "미연동" : "外部ID未連携",
    sendInvite: locale === "zh" ? "发送邀请" : locale === "ko" ? "초대 보내기" : "招待送信",
    update: locale === "zh" ? "保存生命周期" : locale === "ko" ? "라이프사이클 저장" : "ライフサイクル保存",
  };
}

function statusTone(status: TenantStatus) {
  if (status === "active") return "bg-emerald-100 text-emerald-800";
  if (status === "trial") return "bg-sky-100 text-sky-800";
  if (status === "suspended") return "bg-amber-100 text-amber-800";
  return "bg-slate-200 text-slate-700";
}

function seatTone(account: TenantAccountSummary) {
  if (account.availableSeatCount < 0) return "text-rose-700";
  if (account.availableSeatCount === 0) return "text-amber-700";
  return "text-emerald-700";
}

function invitationTone(status: TenantInvitationStatus) {
  if (status === "accepted") return "bg-emerald-100 text-emerald-800";
  if (status === "pending") return "bg-sky-100 text-sky-800";
  if (status === "failed" || status === "expired") return "bg-rose-100 text-rose-800";
  if (status === "revoked") return "bg-slate-200 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

export default async function PlatformAccountsPage({ searchParams }: PlatformAccountsPageProps) {
  const locale = await getLocale();
  const params = searchParams ? await searchParams : undefined;
  const ui = copy(locale);

  let platformUserName = "";
  try {
    const session = await requirePlatformOwnerSession();
    platformUserName = session.user.name;
  } catch (error) {
    if (error instanceof PlatformSessionError) {
      return (
        <div className="mx-auto max-w-3xl rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-900">
          <h1 className="text-xl font-bold">{ui.title}</h1>
          <p className="mt-2 text-sm">{ui.forbidden}</p>
        </div>
      );
    }
    throw error;
  }

  const accounts = await listPlatformTenantAccounts();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">PlatformOwner / {platformUserName}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{ui.title}</h1>
          <p className="mt-1 max-w-4xl text-sm text-slate-600">{ui.subtitle}</p>
        </div>
      </header>

      {params?.flash ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {params.flash}
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4">
          <h2 className="text-base font-bold text-slate-900">{ui.create}</h2>
        </div>
        <form action={createTenantAccountAction} className="grid gap-3 lg:grid-cols-6">
          <input name="name" required placeholder={ui.tenantName} className="rounded-lg border border-slate-300 px-3 py-2 text-sm lg:col-span-2" />
          <input name="slug" placeholder={ui.slug} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select name="accountType" defaultValue="company" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="individual">{ui.individual}</option>
            <option value="company">{ui.company}</option>
          </select>
          <select name="status" defaultValue="trial" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {tenantStatuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status][locale]}
              </option>
            ))}
          </select>
          <input
            name="purchasedSeatCount"
            type="number"
            min={1}
            step={1}
            defaultValue={1}
            aria-label={ui.purchasedSeats}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input name="ownerName" placeholder={ui.ownerName} className="rounded-lg border border-slate-300 px-3 py-2 text-sm lg:col-span-2" />
          <input name="ownerEmail" required type="email" placeholder={ui.ownerEmail} className="rounded-lg border border-slate-300 px-3 py-2 text-sm lg:col-span-2" />
          <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white lg:col-span-2">{ui.submitCreate}</button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="hidden grid-cols-[1.5fr_0.8fr_1fr_1fr_1.5fr] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500 lg:grid">
          <span>{ui.accounts}</span>
          <span>{ui.accountType}</span>
          <span>{ui.status}</span>
          <span>{ui.seats}</span>
          <span>{ui.update}</span>
        </div>
        <div className="divide-y divide-slate-100">
          {accounts.map((account) => (
            <div key={account.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[1.5fr_0.8fr_1fr_1fr_1.5fr] lg:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{account.name}</p>
                <p className="truncate text-xs text-slate-500">{account.slug} / {account.id}</p>
                <div className="mt-2 space-y-1">
                  {account.ownerMembers.map((owner) => (
                    <div key={owner.id} className="min-w-0 rounded-md bg-slate-50 px-2 py-1">
                      <p className="truncate text-xs font-bold text-slate-700">{ui.owner}: {owner.user.email}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${invitationTone(owner.invitationStatus)}`}>
                          {invitationLabels[owner.invitationStatus][locale]}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${owner.isBoundToExternalAuth ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                          {owner.isBoundToExternalAuth ? ui.bound : ui.unbound}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="lg:hidden text-xs font-semibold text-slate-500">{ui.accountType}</div>
              <span className="text-sm font-semibold text-slate-700">
                {account.accountType === "company" ? ui.company : ui.individual}
              </span>
              <div className="lg:hidden text-xs font-semibold text-slate-500">{ui.status}</div>
              <span className={`w-fit rounded-full px-2 py-1 text-xs font-bold ${statusTone(account.status)}`}>
                {statusLabels[account.status][locale]}
              </span>
              <div className="lg:hidden text-xs font-semibold text-slate-500">{ui.seats}</div>
              <div className="text-xs font-semibold text-slate-600">
                <p>{ui.used} {account.activeSeatCount} / {account.purchasedSeatCount}</p>
                <p>{ui.invited} {account.invitedSeatCount}</p>
                <p className={seatTone(account)}>{ui.available} {account.availableSeatCount}</p>
              </div>
              <div className="space-y-2">
                <div className="lg:hidden text-xs font-semibold text-slate-500">{ui.update}</div>
                <form action={updateTenantAccountLifecycleAction} className="grid grid-cols-[1fr_96px_auto] gap-2">
                  <input type="hidden" name="tenantId" value={account.id} />
                  <select name="status" defaultValue={account.status} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {tenantStatuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status][locale]}
                      </option>
                    ))}
                  </select>
                  <input
                    name="purchasedSeatCount"
                    type="number"
                    min={1}
                    step={1}
                    defaultValue={account.purchasedSeatCount}
                    aria-label={ui.purchasedSeats}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    {ui.update}
                  </button>
                </form>
                {account.ownerMembers.map((owner) => (
                  <form key={owner.id} action={sendPlatformTenantMemberInvitationAction} className="flex justify-end">
                    <input type="hidden" name="tenantId" value={account.id} />
                    <input type="hidden" name="membershipId" value={owner.id} />
                    <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                      {ui.sendInvite}
                    </button>
                  </form>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
