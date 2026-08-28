import Link from "next/link";
import { getDefaultUser, getTenantById, listPendingTenantInvitations, listTenantMemberships, listTenantSessionLookupsByExternalAuthSubject } from "@/lib/data";
import { getLocale, type Locale } from "@/lib/locale";
import { isClerkAuthEnabled } from "@/lib/auth-mode";
import { getClerkAuthSubject } from "@/lib/clerk-auth";
import { PageFrame, PageHeader, StateSurface } from "@/components/layout-system";
import { WorkspaceSelector, type WorkspaceOption } from "./workspace-selector";
import { WorkspaceSignOutButton } from "./sign-out-button";
import { deriveTenantServiceState, getTenantServiceStatusLabel, isTenantServiceOperational } from "@/lib/tenant-service";

function safeWorkspaceReturnTo(value: string | undefined): string {
  const candidate = String(value ?? "").trim();
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return "/";
  try {
    const parsed = new URL(candidate, "https://brokerdesk.invalid");
    if (parsed.origin !== "https://brokerdesk.invalid" || parsed.pathname === "/workspace" || parsed.pathname.startsWith("/workspace/")) {
      return "/";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

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
      loadErrorTitle: "暂时无法读取工作区",
      loadErrorDescription: "当前登录身份的工作区信息读取失败，请重试。",
      retry: "重新读取",
      selectionRequiredTitle: "请先选择要进入的公司",
      selectionRequiredDescription: "当前页面需要一个有效的公司工作区。选择公司后会返回刚才要打开的页面。",
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
      loadErrorTitle: "워크스페이스를 읽을 수 없습니다",
      loadErrorDescription: "현재 로그인한 계정의 워크스페이스 정보를 읽지 못했습니다. 다시 시도해 주세요.",
      retry: "다시 읽기",
      selectionRequiredTitle: "먼저 들어갈 회사를 선택하세요",
      selectionRequiredDescription: "이 페이지를 열려면 유효한 회사 워크스페이스가 필요합니다. 회사를 선택하면 원래 페이지로 돌아갑니다.",
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
    loadErrorTitle: "ワークスペースを読み取れません",
    loadErrorDescription: "現在のログイン情報からワークスペースを読み取れませんでした。もう一度お試しください。",
    retry: "再読み込み",
    selectionRequiredTitle: "先に入室する会社を選択してください",
    selectionRequiredDescription: "このページには有効な会社ワークスペースが必要です。会社を選択すると、元のページに戻ります。",
    loading: "入室中",
    choose: "入室後はアカウントメニューからワークスペースを切り替えられます。",
    error: "ワークスペースを切り替えられません。ページを更新してもう一度お試しください。",
    individual: "個人ワークスペース",
    company: "会社ワークスペース",
    role: "入室",
  };
}

type WorkspacePageProps = {
  searchParams?: Promise<{ returnTo?: string; reason?: string }>;
};

export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  const locale = await getLocale();
  const text = copy(locale);
  const params = (await searchParams) ?? {};
  const returnTo = safeWorkspaceReturnTo(params.returnTo);
  const selectionRequired = params.reason === "tenant_selection_required";
  const clerkSubject = isClerkAuthEnabled() ? await getClerkAuthSubject() : null;
  // In Clerk mode this reads the current identity's complete membership
  // state, including suspended/removed rows that tenant RLS hides from the
  // ordinary active-member listing. The RPC itself is current-user-bound.
  let sessionLookups: Awaited<ReturnType<typeof listTenantSessionLookupsByExternalAuthSubject>> = [];
  let sessionLookupFailed = false;
  if (clerkSubject) {
    try {
      sessionLookups = await listTenantSessionLookupsByExternalAuthSubject(clerkSubject);
    } catch {
      sessionLookupFailed = true;
    }
  }
  const user = sessionLookups[0]?.user ?? (sessionLookupFailed ? null : await getDefaultUser());
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
  const resolvedMemberships = (
    await Promise.all(
      memberships
        .filter((membership) => membership.status === "active")
        .map(async (membership) => ({ membership, tenant: await tenantForMembership(membership) })),
    )
  )
    .filter((item) => item.tenant)
    .map((item) => ({ ...item, serviceState: deriveTenantServiceState(item.tenant!) }));
  const items = resolvedMemberships
    .filter((item) => isTenantServiceOperational(item.serviceState))
    .map(({ tenant }) => ({
      tenantId: tenant!.id,
      name: tenant!.name,
      accountLabel: tenant!.accountType === "individual" ? text.individual : text.company,
      roleLabel: text.role,
    })) satisfies WorkspaceOption[];
  const unavailableItems = resolvedMemberships.filter(
    (item) => !isTenantServiceOperational(item.serviceState),
  );
  const pendingActivation = unavailableItems.some((item) => item.serviceState.status === "pending");
  const noWorkspaceTitle = memberships.some((item) => item.status === "suspended")
    ? text.statusSuspended
    : memberships.some((item) => item.status === "removed")
      ? text.statusRemoved
      : pendingActivation
        ? text.statusPendingActivation
        : pendingInvitations.length > 0
          ? text.invitationPending
          : text.emptyTitle;

  return (
    <section className="broker-desk-auth-route min-h-screen bg-[#f8f9ff] px-5 py-10 sm:px-8 lg:px-12">
      <PageFrame className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <PageHeader title={text.title} description={text.description} />
        <section aria-label={text.title} className="w-full border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {selectionRequired ? (
            <div role="alert" className="mb-5 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-bold">{text.selectionRequiredTitle}</p>
              <p className="mt-1 leading-6">{text.selectionRequiredDescription}</p>
            </div>
          ) : null}
          {items.length > 0 || unavailableItems.length > 0 ? (
            <div className="grid gap-4">
              {items.length > 0 ? <WorkspaceSelector items={items} copy={text} returnTo={returnTo} /> : null}
              {unavailableItems.map(({ tenant, serviceState }) => (
                <Link
                  key={tenant!.id}
                  href={`/service-status?tenantId=${encodeURIComponent(tenant!.id)}`}
                  className="grid min-h-24 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border border-amber-300 bg-amber-50 px-5 py-4"
                >
                  <span>
                    <span className="block font-black text-slate-950">{tenant!.name}</span>
                    <span className="mt-1 block text-sm text-amber-900">{getTenantServiceStatusLabel(serviceState.status, locale)}</span>
                  </span>
                  <span className="text-sm font-bold text-amber-900">{locale === "zh" ? "查看说明" : locale === "ko" ? "안내 보기" : "案内を見る"}</span>
                </Link>
              ))}
            </div>
          ) : sessionLookupFailed ? (
            <StateSurface
              tone="error"
              title={text.loadErrorTitle}
              description={text.loadErrorDescription}
              action={(
                <Link href="/workspace" className="inline-flex min-h-11 items-center justify-center border border-slate-950 bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800">
                  {text.retry}
                </Link>
              )}
            />
          ) : (
            <StateSurface
              tone="empty"
              title={noWorkspaceTitle}
              description={text.emptyDescription}
              action={(
                <div className="flex flex-wrap gap-3">
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
              )}
            />
          )}
        </section>
      </PageFrame>
    </section>
  );
}
