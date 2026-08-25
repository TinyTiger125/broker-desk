import Link from "next/link";
import { notFound } from "next/navigation";
import { updatePartyProfileAction } from "@/app/actions";
import { PartyProfileForm, PartyProfileReadOnly } from "@/components/party-profile-form";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { getClientDetailForContext } from "@/lib/data";
import { getLocale, type Locale } from "@/lib/locale";
import { extractPartyProfileFromNotes, normalizePartyReturnTo } from "@/lib/party-profile";
import { getTenantCapability, requireTenantSession } from "@/lib/tenant-session";
import { capabilityHasTenantPermission } from "@/lib/tenant-permissions";
import { createRequestContext } from "@/lib/visibility-resolver";

export const dynamic = "force-dynamic";

type EditPartyPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ flash?: string; returnTo?: string }>;
};

const copy = {
  ja: { eyebrow: "関係者を管理", back: "関係者一覧へ戻る", relationTree: "関係を確認", updated: "関係者を更新しました。", title: "関係者を編集", readOnly: "会社メンバーに公開／読み取り専用", ownerReadOnly: "現在のアカウントは閲覧のみです。" },
  zh: { eyebrow: "维护主体", back: "返回主体列表", relationTree: "查看关系", updated: "主体已更新。", title: "编辑主体", readOnly: "公司成员可见／只读", ownerReadOnly: "当前账号仅可查看。" },
  ko: { eyebrow: "관계자 관리", back: "관계자 목록으로", relationTree: "관계 확인", updated: "관계자를 업데이트했습니다.", title: "관계자 편집", readOnly: "회사 구성원 공개 / 읽기 전용", ownerReadOnly: "현재 계정은 보기 전용입니다." },
} as const;

export default async function EditPartyPage({ params, searchParams }: EditPartyPageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.read" }),
  ]);
  const { id } = await params;
  const context = createRequestContext(session);
  const visible = await getClientDetailForContext({ context, clientId: id });
  if (!visible.detail || !visible.resolution.canRead) notFound();
  const client = visible.detail;
  const capabilityCanWrite = session.membership.status === "active"
    && capabilityHasTenantPermission(getTenantCapability(session.membership), "record.update");
  const canEdit = visible.resolution.canWrite && capabilityCanWrite;
  const readOnlyReason = visible.resolution.outcome === "company_read" ? "company_read" : "owner_read_only";
  const query = (await searchParams) ?? {};
  const returnTo = normalizePartyReturnTo(query.returnTo);
  const text = copy[locale];
  const meta = extractPartyProfileFromNotes(client.notes);
  const flashMessage = query.flash === "party_updated" ? text.updated : undefined;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-sm font-semibold text-slate-500">{text.eyebrow}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{client.name || text.title}</h1>
        </div>
        <Link href={returnTo} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">{text.back}</Link>
      </header>
      <PageFlashBanner message={flashMessage} />
      {canEdit ? <PartyProfileForm
          action={updatePartyProfileAction}
          locale={locale as Locale}
          returnTo={returnTo}
          relationTreeHref={`/relationship-tree?type=party&id=${encodeURIComponent(client.id)}`}
          defaults={{
            partyId: client.id,
            name: client.name,
            phone: client.phone,
            email: client.email,
            lineId: client.lineId,
            partyType: meta.type,
            partyRole: meta.role,
          }}
        /> : <PartyProfileReadOnly
          locale={locale as Locale}
          reason={readOnlyReason}
          defaults={{
            name: client.name,
            phone: client.phone,
            email: client.email,
            lineId: client.lineId,
            partyType: meta.type,
            partyRole: meta.role,
          }}
        />}
    </div>
  );
}
