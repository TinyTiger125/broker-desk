import {
  inviteTenantMemberAction,
  revokeTenantMemberInvitationAction,
  sendTenantMemberInvitationAction,
  updateTenantMemberRoleAction,
  updateTenantMemberStatusAction,
} from "@/app/actions";
import { redirect } from "next/navigation";
import { listTenantMembersForAuthenticatedTenant, type TenantInvitationStatus } from "@/lib/data";
import { getLocale, type Locale } from "@/lib/locale";
import { capabilityHasTenantPermission } from "@/lib/tenant-permissions";
import { type TenantCapabilityPreset } from "@/lib/data";
import { getTenantCapability, requireTenantSession, TenantSessionError } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

type MembersPageProps = {
  searchParams?: Promise<{
    flash?: string;
  }>;
};

const capabilityLabels: Record<TenantCapabilityPreset, Record<Locale, string>> = {
  company_owner: { ja: "会社の責任者", zh: "公司负责人", ko: "회사 책임자" },
  company_form_admin: { ja: "会社フォーム管理者", zh: "公司表格管理员", ko: "회사 양식 관리자" },
  ordinary_member: { ja: "一般メンバー", zh: "普通成员", ko: "일반 멤버" },
};

const invitationLabels: Record<TenantInvitationStatus, Record<Locale, string>> = {
  not_sent: { ja: "未送信", zh: "未发送", ko: "미발송" },
  pending: { ja: "招待中", zh: "邀请中", ko: "초대 중" },
  accepted: { ja: "承諾済み・利用中", zh: "已接受并使用中", ko: "수락 및 사용 중" },
  revoked: { ja: "取消済み", zh: "已撤销", ko: "취소됨" },
  expired: { ja: "期限切れ", zh: "已过期", ko: "만료됨" },
  failed: { ja: "送信失敗", zh: "发送失败", ko: "전송 실패" },
};

function capabilityForMember(member: { capability?: TenantCapabilityPreset }): TenantCapabilityPreset {
  return member.capability ?? "ordinary_member";
}

function copy(locale: Locale) {
  return {
    title: locale === "zh" ? "公司成员与权限" : locale === "ko" ? "회사 멤버와 권한" : "会社メンバーと権限",
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
    revokeInvite: locale === "zh" ? "撤销邀请" : locale === "ko" ? "초대 취소" : "招待を取り消す",
    remove: locale === "zh" ? "移除成员" : locale === "ko" ? "멤버 제거" : "メンバーを削除",
    soleOwnerLocked:
      locale === "zh"
        ? "请先指定另一名公司负责人，才能修改自己的负责人权限。"
        : locale === "ko"
          ? "다른 회사 책임자를 먼저 지정해야 자신의 책임자 권한을 변경할 수 있습니다."
          : "先に別の会社責任者を指定してから、自分の責任者権限を変更してください。",
    confirmSelfDemotion:
      locale === "zh"
        ? "我确认已指定另一名公司负责人，并要降低自己的负责人权限"
        : locale === "ko"
          ? "다른 회사 책임자를 지정했으며 내 책임자 권한을 낮추는 것을 확인합니다"
          : "別の会社責任者を指定し、自分の責任者権限を下げることを確認します",
    bound: locale === "zh" ? "已绑定登录" : locale === "ko" ? "로그인 연동됨" : "ログイン連携済み",
    unbound: locale === "zh" ? "未绑定登录" : locale === "ko" ? "로그인 미연동" : "ログイン未連携",
    current: locale === "zh" ? "当前用户" : locale === "ko" ? "현재 사용자" : "現在のユーザー",
    noPermission:
      locale === "zh"
        ? "当前成员没有公司成员管理权限，请联系公司负责人。"
        : locale === "ko"
          ? "현재 멤버에게는 회사 멤버 관리 권한이 없습니다. 회사 책임자에게 문의하세요."
          : "現在のメンバーには会社メンバー管理権限がありません。会社の責任者にご確認ください。",
    localOnly:
      locale === "zh"
        ? "邀请发送后保持邀请中；受邀者使用匹配邮箱明确接受后，才会成为公司成员。"
        : locale === "ko"
          ? "초대 후에는 초대 중 상태로 유지됩니다. 초대받은 이메일로 명시적으로 수락해야 회사 멤버가 됩니다."
          : "招待後は招待中のまま保持され、招待先のメールアドレスで明示的に承諾してから会社メンバーになります。",
    memberLoadErrorTitle: locale === "zh" ? "暂时无法读取成员" : locale === "ko" ? "멤버를 읽을 수 없습니다" : "メンバーを読み取れません",
    memberLoadErrorDescription:
      locale === "zh"
        ? "当前公司的成员信息读取失败。请重试；权限和成员关系未被修改。"
        : locale === "ko"
          ? "현재 회사의 멤버 정보를 읽지 못했습니다. 다시 시도해 주세요. 권한과 멤버 관계는 변경되지 않았습니다."
          : "現在の会社のメンバー情報を読み取れませんでした。もう一度お試しください。権限とメンバー関係は変更されていません。",
    retry: locale === "zh" ? "重新读取" : locale === "ko" ? "다시 읽기" : "再読み込み",
  };
}

function statusTone(status: string) {
  if (status === "active") return "bg-emerald-100 text-emerald-800";
  if (status === "invited") return "bg-amber-100 text-amber-800";
  if (status === "removed") return "bg-rose-100 text-rose-800";
  return "bg-slate-200 text-slate-700";
}

function invitationTone(status: TenantInvitationStatus) {
  if (status === "accepted") return "bg-emerald-100 text-emerald-800";
  if (status === "pending") return "bg-sky-100 text-sky-800";
  if (status === "failed" || status === "expired") return "bg-rose-100 text-rose-800";
  if (status === "revoked") return "bg-slate-200 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

function flashMessage(locale: Locale, flash?: string) {
  const messages: Record<string, Record<Locale, string>> = {
    member_invited: {
      ja: "メンバーを招待しました。招待は受け入れられるまで有効化されません。",
      zh: "已发送成员邀请；对方接受前仍处于邀请中。",
      ko: "멤버 초대를 보냈습니다. 수락 전에는 초대 중 상태로 유지됩니다.",
    },
    member_invited_pending: {
      ja: "招待を作成しました。送信設定を確認してから受け取ったメールアドレスで承諾してください。",
      zh: "已创建邀请，当前处于邀请中；请确认发送设置并让对方使用受邀邮箱接受。",
      ko: "초대를 만들었습니다. 발송 설정을 확인한 뒤 초대받은 이메일로 수락해 주세요.",
    },
    member_invitation_failed: {
      ja: "メンバーは招待中のまま保存されましたが、招待メールの送信に失敗しました。",
      zh: "成员已保留在邀请中，但邀请邮件发送失败；请检查设置后重试。",
      ko: "멤버는 초대 중으로 보존되었지만 초대 이메일 발송에 실패했습니다. 설정을 확인하고 다시 시도해 주세요.",
    },
    invitation_sent: {
      ja: "招待を再送信しました。",
      zh: "已重新发送邀请。",
      ko: "초대를 다시 보냈습니다.",
    },
    invitation_pending: {
      ja: "招待は送信待ちとして保持されています。",
      zh: "邀请已保留为待发送状态。",
      ko: "초대가 발송 대기 상태로 유지되었습니다.",
    },
    invitation_failed: {
      ja: "招待の再送信に失敗しました。",
      zh: "重新发送邀请失败。",
      ko: "초대 재전송에 실패했습니다.",
    },
    invitation_revoked: {
      ja: "招待を取り消しました。",
      zh: "已撤销邀请。",
      ko: "초대를 취소했습니다.",
    },
    member_role_updated: {
      ja: "メンバーの権限を更新しました。",
      zh: "已更新成员权限。",
      ko: "멤버 권한을 업데이트했습니다.",
    },
    member_suspended: {
      ja: "メンバーを停止しました。",
      zh: "已暂停成员。",
      ko: "멤버를 중지했습니다.",
    },
    member_reactivated: {
      ja: "メンバーを復元しました。",
      zh: "已恢复成员。",
      ko: "멤버를 복원했습니다.",
    },
    member_removed: {
      ja: "メンバーを移除しました。",
      zh: "已移除成员。",
      ko: "멤버를 제거했습니다.",
    },
  };
  return flash ? messages[flash]?.[locale] : undefined;
}

export default async function TenantMembersPage({ searchParams }: MembersPageProps) {
  const localePromise = getLocale();
  let session;
  try {
    session = await requireTenantSession();
  } catch (error) {
    // A user with multiple active companies must choose the current company
    // before any company-scoped page can read data. Send them to the canonical
    // selector instead of exposing the generic route error page.
    if (error instanceof TenantSessionError && error.code === "tenant_selection_required") {
      redirect("/workspace");
    }
    throw error;
  }
  const locale = await localePromise;
  const ui = copy(locale);
  const currentCapability = getTenantCapability(session.membership);
  const canManageMembers = capabilityHasTenantPermission(currentCapability, "member.invite");
  if (!canManageMembers) {
    return (
      <div className="space-y-4">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{session.tenant.name}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{ui.title}</h1>
        </header>
        <section className="border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-700">{ui.noPermission}</p>
        </section>
      </div>
    );
  }

  const params = searchParams ? await searchParams : undefined;
  const feedback = flashMessage(locale, params?.flash);
  const feedbackFailed = params?.flash?.includes("failed") ?? false;
  const feedbackPending = params?.flash?.includes("pending") ?? false;
  let members: Awaited<ReturnType<typeof listTenantMembersForAuthenticatedTenant>> = [];
  let membersLoadFailed = false;
  try {
    members = await listTenantMembersForAuthenticatedTenant({
      tenantId: session.tenant.id,
      externalAuthSubject: session.user.externalAuthSubject,
    });
  } catch {
    membersLoadFailed = true;
  }
  const canInvite = capabilityHasTenantPermission(currentCapability, "member.invite");
  const canUpdateRole = capabilityHasTenantPermission(currentCapability, "member.update_role");
  const canRemove = capabilityHasTenantPermission(currentCapability, "member.remove");
  const activeOwnerCount = members.filter((member) => member.status === "active" && member.role === "tenant_owner").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{session.tenant.name}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{ui.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{ui.subtitle}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
          {capabilityLabels[capabilityForMember(session.membership)][locale]}
        </div>
      </header>

      {feedback ? (
        <div className={`rounded-lg border px-4 py-3 text-sm font-semibold ${feedbackFailed ? "border-rose-200 bg-rose-50 text-rose-800" : feedbackPending ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {feedback}
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
            <select name="capabilityPreset" defaultValue="ordinary_member" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {Object.keys(capabilityLabels).map((preset) => (
                <option key={preset} value={preset}>
                  {capabilityLabels[preset as TenantCapabilityPreset][locale]}
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
        {membersLoadFailed ? (
          <div className="p-6">
            <h2 className="text-base font-bold text-slate-900">{ui.memberLoadErrorTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{ui.memberLoadErrorDescription}</p>
            <a href="/settings/members" className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">
              {ui.retry}
            </a>
          </div>
        ) : (
          <>
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
              {member.status === "removed" ? (
                <span className="text-xs font-semibold text-slate-500">{capabilityLabels[capabilityForMember(member)][locale]}</span>
              ) : member.id === session.membership.id && member.status === "active" && member.role === "tenant_owner" && activeOwnerCount <= 1 ? (
                <div className="space-y-1">
                  <span className="block text-xs font-semibold text-slate-500">{capabilityLabels.company_owner[locale]}</span>
                  <span className="block text-[11px] leading-4 text-amber-700">{ui.soleOwnerLocked}</span>
                </div>
              ) : (
                <form action={updateTenantMemberRoleAction} className="flex items-center gap-2">
                  <input type="hidden" name="membershipId" value={member.id} />
                  <select
                    name="capabilityPreset"
                    defaultValue={capabilityForMember(member)}
                    disabled={!canUpdateRole}
                    className="min-w-0 rounded-lg border border-slate-300 px-2 py-1.5 text-xs disabled:bg-slate-100"
                  >
                    {Object.keys(capabilityLabels).map((preset) => (
                      <option key={preset} value={preset}>
                        {capabilityLabels[preset as TenantCapabilityPreset][locale]}
                      </option>
                    ))}
                  </select>
                  {member.id === session.membership.id && member.status === "active" && member.role === "tenant_owner" && activeOwnerCount > 1 ? (
                    <label className="flex max-w-xs items-center gap-1 text-[11px] leading-4 text-amber-700">
                      <input type="checkbox" name="confirmSelfDemotion" value="true" required className="h-3.5 w-3.5" />
                      {ui.confirmSelfDemotion}
                    </label>
                  ) : null}
                  {canUpdateRole ? (
                    <button className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-bold text-slate-700">{ui.saveRole}</button>
                  ) : null}
                </form>
              )}
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
                {canRemove && member.status === "invited" ? (
                  <form action={revokeTenantMemberInvitationAction}>
                    <input type="hidden" name="membershipId" value={member.id} />
                    <button className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700">{ui.revokeInvite}</button>
                  </form>
                ) : null}
                {canRemove && member.status === "active" && member.id !== session.membership.id ? (
                  <form action={updateTenantMemberStatusAction}>
                    <input type="hidden" name="membershipId" value={member.id} />
                    <input type="hidden" name="status" value="removed" />
                    <button className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700">{ui.remove}</button>
                  </form>
                ) : null}
                {canRemove && (member.status === "active" || member.status === "suspended") ? (
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
          </>
        )}
      </section>
    </div>
  );
}
