import Link from "next/link";
import { redirect } from "next/navigation";
import {
  inviteTenantMemberAction,
  revokeTenantMemberInvitationAction,
  sendTenantMemberInvitationAction,
  updateTenantMemberRoleAction,
  updateTenantMemberStatusAction,
} from "@/app/actions";
import { PageFrame, PageHeader, StateSurface, WorklistShell } from "@/components/layout-system";
import { listTenantMembersForAuthenticatedTenant, type TenantInvitationStatus, type TenantCapabilityPreset } from "@/lib/data";
import { getLocale, type Locale } from "@/lib/locale";
import {
  getMemberManagementCopy,
  getMemberManagementFlash,
  INVITATION_STATUS_LABELS,
  MEMBER_CAPABILITY_DESCRIPTIONS,
  MEMBER_CAPABILITY_LABELS,
  MEMBER_CAPABILITY_PRESETS,
  MEMBERSHIP_STATUS_LABELS,
} from "@/lib/member-management-copy";
import { capabilityHasTenantPermission } from "@/lib/tenant-permissions";
import { getTenantCapability, requireTenantSession, TenantSessionError } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

type MembersPageProps = { searchParams?: Promise<{ flash?: string }> };

function capabilityForMember(member: { capability?: TenantCapabilityPreset }): TenantCapabilityPreset {
  return member.capability ?? "ordinary_member";
}

function isActiveCompanyOwner(member: { status: string; role: string; capability?: TenantCapabilityPreset }) {
  return member.status === "active" && member.role === "tenant_owner" && member.capability === "company_owner";
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

function CapabilityGuide({ locale, title }: { locale: Locale; title: string }) {
  return (
    <section aria-labelledby="member-capability-guide" className="border-t border-slate-200 pt-4">
      <h3 id="member-capability-guide" className="text-sm font-bold text-slate-900">{title}</h3>
      <dl className="mt-3 grid gap-3 lg:grid-cols-3">
        {MEMBER_CAPABILITY_PRESETS.map((preset) => (
          <div key={preset} className="min-w-0 border-l-2 border-blue-200 pl-3">
            <dt className="text-sm font-bold text-slate-900">{MEMBER_CAPABILITY_LABELS[preset][locale]}</dt>
            <dd className="mt-1 break-words text-xs leading-5 text-slate-600">{MEMBER_CAPABILITY_DESCRIPTIONS[preset][locale]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default async function TenantMembersPage({ searchParams }: MembersPageProps) {
  const localePromise = getLocale();
  let session;
  try {
    session = await requireTenantSession();
  } catch (error) {
    if (error instanceof TenantSessionError && error.code === "tenant_selection_required") redirect("/workspace");
    throw error;
  }

  const locale = await localePromise;
  const ui = getMemberManagementCopy(locale);
  const currentCapability = getTenantCapability(session.membership);
  const canManageMembers = capabilityHasTenantPermission(currentCapability, "member.invite");

  if (!canManageMembers) {
    return (
      <PageFrame className="space-y-6">
        <PageHeader title={ui.title} description={ui.subtitle} />
        <StateSurface
          tone="permission"
          title={ui.noPermissionTitle}
          description={ui.noPermission}
          action={<Link href="/" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800">{ui.backToWorkspace}</Link>}
        />
      </PageFrame>
    );
  }

  const params = searchParams ? await searchParams : undefined;
  const feedback = getMemberManagementFlash(locale, params?.flash);
  const failedFeedbackKeys = new Set(["member_invitation_failed", "invitation_failed", "last_owner_protected"]);
  const feedbackFailed = params?.flash ? failedFeedbackKeys.has(params.flash) : false;
  const neutralFeedbackKeys = new Set(["member_invited_pending", "invitation_pending"]);
  const feedbackPending = params?.flash ? neutralFeedbackKeys.has(params.flash) : false;
  let members: Awaited<ReturnType<typeof listTenantMembersForAuthenticatedTenant>> = [];
  let membersLoadFailed = false;
  try {
    members = await listTenantMembersForAuthenticatedTenant({ tenantId: session.tenant.id, externalAuthSubject: session.user.externalAuthSubject });
  } catch {
    membersLoadFailed = true;
  }

  const canInvite = capabilityHasTenantPermission(currentCapability, "member.invite");
  const canUpdateRole = capabilityHasTenantPermission(currentCapability, "member.update_role");
  const canRemove = capabilityHasTenantPermission(currentCapability, "member.remove");
  const activeOwnerCount = members.filter(isActiveCompanyOwner).length;
  const isCurrentMember = (member: (typeof members)[number]) => member.id === session.membership.id || member.user.id === session.user.id;
  const currentPreset = capabilityForMember(session.membership);

  const invitePanel = (
    <section aria-labelledby="member-invite-title" className="space-y-4">
      <div>
        <h2 id="member-invite-title" className="text-base font-bold text-slate-900">{ui.invite}</h2>
        <p className="mt-1 break-words text-sm leading-6 text-slate-600">{ui.inviteDescription}</p>
      </div>
      {canInvite ? (
        <form action={inviteTenantMemberAction} className="grid gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_220px_auto] 2xl:items-end">
          <label className="grid min-w-0 gap-1 text-sm font-semibold text-slate-700"><span>{ui.name}</span><input name="name" className="min-h-11 min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
          <label className="grid min-w-0 gap-1 text-sm font-semibold text-slate-700"><span>{ui.email}</span><input name="email" type="email" required className="min-h-11 min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
          <label className="grid min-w-0 gap-1 text-sm font-semibold text-slate-700">
            <span>{ui.role}</span>
            <select name="capabilityPreset" defaultValue="ordinary_member" className="min-h-11 min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {MEMBER_CAPABILITY_PRESETS.map((preset) => <option key={preset} value={preset}>{MEMBER_CAPABILITY_LABELS[preset][locale]}</option>)}
            </select>
          </label>
          <button className="min-h-11 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">{ui.invite}</button>
        </form>
      ) : <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{ui.noPermission}</p>}
      <CapabilityGuide locale={locale} title={ui.permissionGuide} />
    </section>
  );

  const memberItems = members.length > 0 ? (
    <section aria-labelledby="member-list-title">
      <h2 id="member-list-title" className="sr-only">{ui.memberList}</h2>
      <div className="hidden grid-cols-[minmax(0,1.25fr)_minmax(16rem,1.25fr)_minmax(0,1fr)_minmax(15rem,1.1fr)] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 lg:grid">
        <span>{ui.name}</span><span>{ui.role}</span><span>{ui.status}</span><span>{ui.actions}</span>
      </div>
      <div className="divide-y divide-slate-200">
        {members.map((member) => {
          const preset = capabilityForMember(member);
          return (
            <article key={member.id} className="grid min-w-0 gap-4 px-4 py-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(16rem,1.25fr)_minmax(0,1fr)_minmax(15rem,1.1fr)] lg:items-start lg:px-5">
              <div className="min-w-0">
                <h3 className="break-words text-sm font-bold text-slate-900">{member.user.name}{isCurrentMember(member) ? <span className="ml-2 inline-flex rounded-full bg-blue-100 px-2 py-1 text-[11px] font-bold text-blue-800">{ui.current}</span> : null}</h3>
                <p className="mt-1 break-all text-xs leading-5 text-slate-500">{member.user.email}</p>
              </div>

              <div className="min-w-0">
                <div className="mb-2 text-xs font-semibold text-slate-500 lg:hidden">{ui.role}</div>
                {member.status === "removed" ? (
                  <div><span className="text-sm font-semibold text-slate-700">{MEMBER_CAPABILITY_LABELS[preset][locale]}</span><p className="mt-1 break-words text-xs leading-5 text-slate-500">{MEMBER_CAPABILITY_DESCRIPTIONS[preset][locale]}</p></div>
                ) : isCurrentMember(member) && isActiveCompanyOwner(member) && activeOwnerCount <= 1 ? (
                  <div className="space-y-1"><span className="block text-sm font-semibold text-slate-700">{MEMBER_CAPABILITY_LABELS.company_owner[locale]}</span><span className="block break-words text-xs leading-5 text-amber-700">{ui.soleOwnerLocked}</span></div>
                ) : (
                  <form action={updateTenantMemberRoleAction} className="flex min-w-0 flex-wrap items-center gap-2">
                    <input type="hidden" name="membershipId" value={member.id} />
                    <select name="capabilityPreset" aria-label={`${ui.role}: ${member.user.name}`} defaultValue={preset} disabled={!canUpdateRole} className="min-h-11 min-w-0 max-w-full flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100">
                      {MEMBER_CAPABILITY_PRESETS.map((optionPreset) => <option key={optionPreset} value={optionPreset}>{MEMBER_CAPABILITY_LABELS[optionPreset][locale]}</option>)}
                    </select>
                    {isCurrentMember(member) && isActiveCompanyOwner(member) && activeOwnerCount > 1 ? (
                      <label className="flex min-h-11 basis-full items-start gap-2 break-words text-xs leading-5 text-amber-700"><input type="checkbox" name="confirmSelfDemotion" value="true" required className="mt-1 h-5 w-5 shrink-0" /><span>{ui.confirmSelfDemotion}</span></label>
                    ) : null}
                    {canUpdateRole ? <button aria-label={`${ui.saveRole}: ${member.user.name} (${member.user.email})`} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">{ui.saveRole}</button> : null}
                  </form>
                )}
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-bold">
                <span className="basis-full text-xs font-semibold text-slate-500 lg:hidden">{ui.status}</span>
                <span className={`break-words rounded-full px-2 py-1 ${statusTone(member.status)}`}>{ui.membershipStatus}: {MEMBERSHIP_STATUS_LABELS[member.status][locale]}</span>
                <span className={`break-words rounded-full px-2 py-1 ${invitationTone(member.invitationStatus)}`}>{ui.invitationStatus}: {INVITATION_STATUS_LABELS[member.invitationStatus][locale]}</span>
                <span className={`break-words rounded-full px-2 py-1 ${member.user.externalAuthSubject ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{member.user.externalAuthSubject ? ui.bound : ui.unbound}</span>
              </div>

              <div className="flex min-w-0 flex-wrap gap-2">
                <span className="basis-full text-xs font-semibold text-slate-500 lg:hidden">{ui.actions}</span>
                {canInvite && member.status === "invited" ? <form action={sendTenantMemberInvitationAction}><input type="hidden" name="membershipId" value={member.id} /><button aria-label={`${ui.sendInvite}: ${member.user.name} (${member.user.email})`} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">{ui.sendInvite}</button></form> : null}
                {canRemove && member.status === "invited" ? <form action={revokeTenantMemberInvitationAction}><input type="hidden" name="membershipId" value={member.id} /><button aria-label={`${ui.revokeInvite}: ${member.user.name} (${member.user.email})`} className="min-h-11 rounded-lg border border-rose-200 px-3 py-2 text-sm font-bold text-rose-700">{ui.revokeInvite}</button></form> : null}
                {canRemove && member.status === "active" && member.id !== session.membership.id ? <form action={updateTenantMemberStatusAction}><input type="hidden" name="membershipId" value={member.id} /><input type="hidden" name="status" value="removed" /><button aria-label={`${ui.remove}: ${member.user.name} (${member.user.email})`} className="min-h-11 rounded-lg border border-rose-200 px-3 py-2 text-sm font-bold text-rose-700">{ui.remove}</button></form> : null}
                {canRemove && (member.status === "active" || member.status === "suspended") ? (
                  <form action={updateTenantMemberStatusAction}><input type="hidden" name="membershipId" value={member.id} /><input type="hidden" name="status" value={member.status === "active" ? "suspended" : "active"} /><button aria-label={`${member.status === "active" ? ui.suspend : ui.reactivate}: ${member.user.name} (${member.user.email})`} disabled={member.id === session.membership.id && member.status === "active"} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">{member.status === "active" ? ui.suspend : ui.reactivate}</button></form>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  ) : undefined;

  const state = membersLoadFailed ? (
    <StateSurface tone="error" title={ui.memberLoadErrorTitle} description={ui.memberLoadErrorDescription} action={<Link href="/settings/members" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">{ui.retry}</Link>} />
  ) : members.length === 0 ? <StateSurface tone="empty" title={ui.emptyTitle} description={ui.emptyDescription} /> : undefined;

  return (
    <PageFrame className="space-y-6">
      <PageHeader title={ui.title} description={ui.subtitle}>
        <div className="max-w-xl border-l-2 border-blue-300 pl-3 text-left"><div className="text-sm font-bold text-slate-900">{MEMBER_CAPABILITY_LABELS[currentPreset][locale]}</div><p className="mt-1 break-words text-xs leading-5 text-slate-600">{MEMBER_CAPABILITY_DESCRIPTIONS[currentPreset][locale]}</p></div>
      </PageHeader>
      {feedback ? <div role={feedbackFailed ? "alert" : "status"} aria-live={feedbackFailed ? "assertive" : "polite"} className={`rounded-lg border px-4 py-3 text-sm font-semibold ${feedbackFailed ? "border-rose-200 bg-rose-50 text-rose-800" : feedbackPending ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{feedback}</div> : null}
      <WorklistShell aria-label={ui.memberList} controls={invitePanel} summary={!membersLoadFailed ? <p className="text-sm font-bold text-slate-700">{ui.memberCount(members.length)}</p> : undefined} items={memberItems} state={state} />
    </PageFrame>
  );
}
