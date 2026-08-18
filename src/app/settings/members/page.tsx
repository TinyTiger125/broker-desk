import {
  inviteTenantMemberAction,
  sendTenantMemberInvitationAction,
  updateTenantMemberRoleAction,
  updateTenantMemberStatusAction,
} from "@/app/actions";
import { listTenantMembers, type TenantInvitationStatus } from "@/lib/data";
import { getLocale, type Locale } from "@/lib/locale";
import { TENANT_ROLES, roleHasTenantPermission, type TenantRole } from "@/lib/tenant-permissions";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

type MembersPageProps = {
  searchParams?: Promise<{
    flash?: string;
  }>;
};

const tenantAssignableRoles = TENANT_ROLES.filter((role) => role !== "platform_owner");

const roleLabels: Record<TenantRole, Record<Locale, string>> = {
  platform_owner: { ja: "PlatformOwner", zh: "平台所有者", ko: "플랫폼 소유자" },
  tenant_owner: { ja: "Owner", zh: "所有者", ko: "소유자" },
  tenant_admin: { ja: "Admin", zh: "管理员", ko: "관리자" },
  manager: { ja: "Manager", zh: "负责人", ko: "매니저" },
  broker: { ja: "Broker", zh: "经纪人", ko: "중개 담당" },
  data_operator: { ja: "DataOperator", zh: "资料处理", ko: "데이터 담당" },
  reviewer: { ja: "Reviewer", zh: "审核员", ko: "검토자" },
  viewer: { ja: "Viewer", zh: "只读", ko: "조회자" },
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
    title: locale === "zh" ? "租户成员与权限" : locale === "ko" ? "테넌트 멤버와 권한" : "メンバーと権限",
    subtitle:
      locale === "zh"
        ? "这里管理当前工作区内谁能上传、整理、输出、维护模板和查看操作记录。"
        : locale === "ko"
          ? "현재 워크스페이스에서 입력, 정리, 출력, 템플릿 관리, 작업 기록 조회 권한을 관리합니다."
          : "現在のワークスペースで入力・整理・出力・テンプレート管理・操作履歴確認を行えるメンバーを管理します。",
    invite: locale === "zh" ? "添加成员" : locale === "ko" ? "멤버 추가" : "メンバー追加",
    name: locale === "zh" ? "姓名" : locale === "ko" ? "이름" : "氏名",
    email: locale === "zh" ? "邮箱" : locale === "ko" ? "이메일" : "メール",
    role: locale === "zh" ? "角色" : locale === "ko" ? "역할" : "ロール",
    status: locale === "zh" ? "状态" : locale === "ko" ? "상태" : "状態",
    actions: locale === "zh" ? "操作" : locale === "ko" ? "작업" : "操作",
    saveRole: locale === "zh" ? "保存角色" : locale === "ko" ? "역할 저장" : "ロール保存",
    suspend: locale === "zh" ? "停用" : locale === "ko" ? "중지" : "停止",
    reactivate: locale === "zh" ? "恢复" : locale === "ko" ? "재활성화" : "再有効化",
    sendInvite: locale === "zh" ? "发送邀请" : locale === "ko" ? "초대 보내기" : "招待送信",
    bound: locale === "zh" ? "已绑定登录" : locale === "ko" ? "로그인 연동됨" : "ログイン連携済み",
    unbound: locale === "zh" ? "未绑定登录" : locale === "ko" ? "로그인 미연동" : "ログイン未連携",
    current: locale === "zh" ? "当前用户" : locale === "ko" ? "현재 사용자" : "現在のユーザー",
    noPermission:
      locale === "zh"
        ? "当前角色只能查看成员，不能修改。"
        : locale === "ko"
          ? "현재 역할은 멤버 조회만 가능하며 수정할 수 없습니다."
          : "現在のロールではメンバー確認のみ可能で、変更はできません。",
    localOnly:
      locale === "zh"
        ? "成员会先占用一个席位并进入待邀请状态；Clerk 生产配置完成后可发送正式邀请邮件。"
        : locale === "ko"
          ? "멤버는 먼저 좌석을 점유하고 초대 대기 상태가 됩니다. Clerk 프로덕션 설정 후 공식 초대 메일을 보낼 수 있습니다."
          : "メンバーは先に席を確保して招待待ちになります。Clerk の本番設定後に正式な招待メールを送信できます。",
  };
}

function statusTone(status: string) {
  if (status === "active") return "bg-emerald-100 text-emerald-800";
  if (status === "invited") return "bg-amber-100 text-amber-800";
  return "bg-slate-200 text-slate-700";
}

function invitationTone(status: TenantInvitationStatus) {
  if (status === "accepted") return "bg-emerald-100 text-emerald-800";
  if (status === "pending") return "bg-sky-100 text-sky-800";
  if (status === "failed" || status === "expired") return "bg-rose-100 text-rose-800";
  if (status === "revoked") return "bg-slate-200 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

export default async function TenantMembersPage({ searchParams }: MembersPageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "tenant.read" }),
  ]);
  const params = searchParams ? await searchParams : undefined;
  const ui = copy(locale);
  const members = await listTenantMembers(session.tenant.id);
  const canInvite = roleHasTenantPermission(session.membership.role, "member.invite");
  const canUpdateRole = roleHasTenantPermission(session.membership.role, "member.update_role");
  const canRemove = roleHasTenantPermission(session.membership.role, "member.remove");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{session.tenant.name}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{ui.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{ui.subtitle}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
          {roleLabels[session.membership.role][locale]}
        </div>
      </header>

      {params?.flash ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {params.flash}
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">{ui.invite}</h2>
            <p className="mt-1 text-xs text-slate-500">{ui.localOnly}</p>
          </div>
        </div>
        {canInvite ? (
          <form action={inviteTenantMemberAction} className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_220px_auto]">
            <input name="name" placeholder={ui.name} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input name="email" type="email" required placeholder={ui.email} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <select name="role" defaultValue="broker" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {tenantAssignableRoles.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role][locale]}
                </option>
              ))}
            </select>
            <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">{ui.invite}</button>
          </form>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{ui.noPermission}</p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="hidden grid-cols-[1.4fr_1fr_1fr_1.4fr] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500 lg:grid">
          <span>{ui.name}</span>
          <span>{ui.role}</span>
          <span>{ui.status}</span>
          <span>{ui.actions}</span>
        </div>
        <div className="divide-y divide-slate-100">
          {members.map((member) => (
            <div key={member.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[1.4fr_1fr_1fr_1.4fr] lg:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">
                  {member.user.name}
                  {member.id === session.membership.id ? (
                    <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">{ui.current}</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-slate-500">{member.user.email}</p>
              </div>
              <div className="lg:hidden text-xs font-semibold text-slate-500">{ui.role}</div>
              <form action={updateTenantMemberRoleAction} className="flex items-center gap-2">
                <input type="hidden" name="membershipId" value={member.id} />
                <select
                  name="role"
                  defaultValue={member.role}
                  disabled={!canUpdateRole}
                  className="min-w-0 rounded-lg border border-slate-300 px-2 py-1.5 text-xs disabled:bg-slate-100"
                >
                  {tenantAssignableRoles.map((role) => (
                    <option key={role} value={role}>
                      {roleLabels[role][locale]}
                    </option>
                  ))}
                </select>
                {canUpdateRole ? (
                  <button className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-bold text-slate-700">{ui.saveRole}</button>
                ) : null}
              </form>
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                <span className="lg:hidden basis-full text-xs font-semibold text-slate-500">{ui.status}</span>
                <span className={`rounded-full px-2 py-1 ${statusTone(member.status)}`}>{member.status}</span>
                <span className={`rounded-full px-2 py-1 ${invitationTone(member.invitationStatus)}`}>
                  {invitationLabels[member.invitationStatus][locale]}
                </span>
                <span className={`rounded-full px-2 py-1 ${member.user.externalAuthSubject ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                  {member.user.externalAuthSubject ? ui.bound : ui.unbound}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="lg:hidden basis-full text-xs font-semibold text-slate-500">{ui.actions}</span>
                {canInvite && member.status === "invited" ? (
                  <form action={sendTenantMemberInvitationAction}>
                    <input type="hidden" name="membershipId" value={member.id} />
                    <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700">
                      {ui.sendInvite}
                    </button>
                  </form>
                ) : null}
                {canRemove ? (
                  <form action={updateTenantMemberStatusAction}>
                    <input type="hidden" name="membershipId" value={member.id} />
                    <input type="hidden" name="status" value={member.status === "active" ? "suspended" : "active"} />
                    <button
                      disabled={member.id === session.membership.id && member.status === "active"}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {member.status === "active" ? ui.suspend : ui.reactivate}
                    </button>
                  </form>
                ) : (
                  <span className="text-xs text-slate-400">-</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
