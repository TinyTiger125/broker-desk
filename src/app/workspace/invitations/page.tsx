import Link from "next/link";
import { getDefaultUser, listPendingTenantInvitations } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import { AcceptInvitationForm } from "./accept-invitation-form";

export const dynamic = "force-dynamic";

export default async function WorkspaceInvitationsPage() {
  const [locale, user] = await Promise.all([getLocale(), getDefaultUser()]);
  const invitations = user ? await listPendingTenantInvitations(user.id) : [];
  const isZh = locale === "zh";
  const isKo = locale === "ko";
  const title = isZh ? "公司邀请" : isKo ? "회사 초대" : "会社への招待";
  const empty = isZh ? "当前没有待接受的邀请。" : isKo ? "현재 수락할 초대가 없습니다." : "承諾できる招待はありません。";
  const accept = isZh ? "接受并进入" : isKo ? "수락하고 입장" : "承諾して入室";
  const accepting = isZh ? "正在接受…" : isKo ? "수락 중…" : "承諾中…";
  const back = isZh ? "返回工作区" : isKo ? "워크스페이스로 돌아가기" : "ワークスペースに戻る";

  return (
    <section className="broker-desk-auth-route flex min-h-screen items-center justify-center bg-[#f8f9ff] px-5 py-10 sm:px-8">
      <div className="w-full max-w-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-black uppercase tracking-[0.14em] text-[#1960a3]">Broker Desk</p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">{title}</h1>
        <div className="mt-6 grid gap-3">
          {invitations.length === 0 ? <p className="text-sm text-slate-600">{empty}</p> : invitations.map((invitation) => (
            <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-4 border border-slate-200 p-4">
              <div>
                <p className="font-bold text-slate-950">{invitation.tenantName ?? invitation.tenantId}</p>
                <p className="mt-1 text-xs text-slate-500">{user?.email}</p>
              </div>
              <AcceptInvitationForm
                tenantId={invitation.tenantId}
                membershipId={invitation.id}
                invitationToken={invitation.invitationToken ?? ""}
                locale={locale}
                acceptLabel={accept}
                pendingLabel={accepting}
              />
            </div>
          ))}
        </div>
        <Link href="/workspace" className="mt-7 inline-flex min-h-10 items-center border border-slate-300 px-4 text-sm font-bold text-slate-900 hover:bg-slate-50">{back}</Link>
      </div>
    </section>
  );
}
