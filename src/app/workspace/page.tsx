import Link from "next/link";
import { getDefaultUser, getTenantById, isTenantAccessibleStatus, listPendingTenantInvitations, listTenantMemberships, listTenantSessionLookupsByExternalAuthSubject } from "@/lib/data";
import { getLocale, type Locale } from "@/lib/locale";
import { isClerkAuthEnabled } from "@/lib/auth-mode";
import { getClerkAuthSubject } from "@/lib/clerk-auth";
import { WorkspaceSelector, type WorkspaceOption } from "./workspace-selector";
import { WorkspaceSignOutButton } from "./sign-out-button";

function copy(locale: Locale) {
  if (locale === "zh") {
    return {
      eyebrow: "Broker Desk",
      title: "选择工作区",
      description: "选择本次要处理资料的公司或个人工作区。切换后，只会访问该工作区的数据。",
      emptyTitle: "尚未开通工作区",
      emptyDescription: "当前登录邮箱还没有可访问的工作区。请联系管理员确认邀请状态。",
      back: "返回登录",
      createCompany: "创建公司",
      viewInvitations: "查看邀请",
      statusSuspended: "当前成员关系已暂停，请联系公司负责人。",
      statusRemoved: "当前成员关系已移除，请联系公司负责人。",
      statusPendingActivation: "公司正在等待开通或平台批准，当前暂不能进入业务工作区。",
      invitationPending: "你有待接受的公司邀请。请使用受邀邮箱确认后再进入工作区。",
      loading: "正在进入",
      choose: "进入后可在账户菜单中切换工作区。",
      error: "无法切换工作区，请刷新页面后重试。",
      individual: "个人工作区",
      company: "公司工作区",
      role: "进入",
    };
  }
  if (locale === "ko") {
    return {
      eyebrow: "Broker Desk",
      title: "워크스페이스 선택",
      description: "이번에 자료를 처리할 회사 또는 개인 워크스페이스를 선택하세요. 선택 후에는 해당 워크스페이스의 데이터만 볼 수 있습니다.",
      emptyTitle: "사용 가능한 워크스페이스가 없습니다",
      emptyDescription: "현재 로그인한 이메일에는 접근 가능한 워크스페이스가 없습니다. 관리자에게 초대 상태를 확인해 주세요.",
      back: "로그인으로 돌아가기",
      createCompany: "회사 만들기",
      viewInvitations: "초대 확인",
      statusSuspended: "현재 멤버십이 중지되었습니다. 회사 책임자에게 문의하세요.",
      statusRemoved: "현재 멤버십이 제거되었습니다. 회사 책임자에게 문의하세요.",
      statusPendingActivation: "회사가 활성화 또는 플랫폼 승인을 기다리는 중이라 업무 워크스페이스에 들어갈 수 없습니다.",
      invitationPending: "수락할 회사 초대가 있습니다. 초대받은 이메일로 확인한 뒤 워크스페이스에 들어가세요.",
      loading: "입장 중",
      choose: "입장 후 계정 메뉴에서 워크스페이스를 바꿀 수 있습니다.",
      error: "워크스페이스를 전환할 수 없습니다. 새로고침 후 다시 시도하세요.",
      individual: "개인 워크스페이스",
      company: "회사 워크스페이스",
      role: "입장",
    };
  }
  return {
    eyebrow: "Broker Desk",
    title: "ワークスペースを選択",
    description: "今回、資料を扱う会社または個人のワークスペースを選択してください。選択後は、そのワークスペースのデータのみを扱います。",
    emptyTitle: "利用できるワークスペースがありません",
    emptyDescription: "現在ログインしているメールアドレスには、利用可能なワークスペースがありません。管理者に招待状況をご確認ください。",
    back: "ログインに戻る",
    createCompany: "会社を作成",
    viewInvitations: "招待を確認",
    statusSuspended: "現在のメンバー関係は停止されています。会社の責任者にご確認ください。",
    statusRemoved: "現在のメンバー関係は削除されています。会社の責任者にご確認ください。",
    statusPendingActivation: "会社の開通またはプラットフォーム承認待ちのため、業務ワークスペースにはまだ入れません。",
    invitationPending: "受け取った会社招待があります。招待先のメールアドレスで承諾してから入室してください。",
    loading: "入室中",
    choose: "入室後はアカウントメニューからワークスペースを切り替えられます。",
    error: "ワークスペースを切り替えられません。ページを更新してもう一度お試しください。",
    individual: "個人ワークスペース",
    company: "会社ワークスペース",
    role: "入室",
  };
}

export default async function WorkspacePage() {
  const locale = await getLocale();
  const text = copy(locale);
  const [user, clerkSubject] = await Promise.all([
    getDefaultUser(),
    isClerkAuthEnabled() ? getClerkAuthSubject() : Promise.resolve(null),
  ]);
  // In Clerk mode this reads the current identity's complete membership
  // state, including suspended/removed rows that tenant RLS hides from the
  // ordinary active-member listing. The RPC itself is current-user-bound.
  const sessionLookups = clerkSubject ? await listTenantSessionLookupsByExternalAuthSubject(clerkSubject) : [];
  const memberships = clerkSubject
    ? sessionLookups.map((lookup) => lookup.membership)
    : user
      ? await listTenantMemberships(user.id)
      : [];
  const pendingInvitations = user ? await listPendingTenantInvitations(user.id) : [];
  const tenantForMembership = async (membership: (typeof memberships)[number]) => {
    if (clerkSubject) return sessionLookups.find((lookup) => lookup.membership.id === membership.id)?.tenant ?? null;
    return getTenantById(membership.tenantId);
  };
  const pendingActivation = user
    ? (await Promise.all(
        memberships
          .filter((membership) => membership.status === "active")
          .map(tenantForMembership),
      )).some((tenant) => tenant?.status === "pending_activation")
    : false;
  const items = (
    await Promise.all(
      memberships
        .filter((membership) => membership.status === "active")
        .map(async (membership) => ({ membership, tenant: await tenantForMembership(membership) })),
    )
  )
    .filter((item) => item.tenant && isTenantAccessibleStatus(item.tenant.status))
    .map(({ tenant }) => ({
      tenantId: tenant!.id,
      name: tenant!.name,
      accountLabel: tenant!.accountType === "individual" ? text.individual : text.company,
      roleLabel: text.role,
    })) satisfies WorkspaceOption[];

  return (
    <section className="broker-desk-auth-route flex min-h-screen items-center bg-[#f8f9ff] px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto grid w-full max-w-4xl gap-10 lg:grid-cols-[minmax(0,0.72fr)_minmax(22rem,1fr)] lg:gap-16">
        <div className="self-start lg:pt-6">
          <p className="text-sm font-black uppercase tracking-[0.14em] text-[#1960a3]">{text.eyebrow}</p>
          <h1 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">{text.title}</h1>
          <p className="mt-4 max-w-md text-base leading-7 text-slate-600">{text.description}</p>
        </div>
        <div className="border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {items.length > 0 ? (
            <WorkspaceSelector items={items} copy={text} />
          ) : (
            <div>
              <h2 className="text-lg font-black text-slate-950">
                {memberships.some((item) => item.status === "suspended")
                  ? text.statusSuspended
                  : memberships.some((item) => item.status === "removed")
                    ? text.statusRemoved
                  : pendingActivation
                    ? text.statusPendingActivation
                    : pendingInvitations.length > 0
                      ? text.invitationPending
                      : text.emptyTitle}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{text.emptyDescription}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/workspace/create" className="inline-flex min-h-11 items-center justify-center border border-slate-950 bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800">
                  {text.createCompany}
                </Link>
                <Link href="/workspace/invitations" className="inline-flex min-h-11 items-center justify-center border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 transition hover:bg-slate-50">
                  {text.viewInvitations}
                </Link>
                {isClerkAuthEnabled() ? <WorkspaceSignOutButton label={text.back} /> : (
                  <Link href="/sign-in" className="inline-flex min-h-11 items-center justify-center border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 transition hover:bg-slate-50">
                    {text.back}
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
