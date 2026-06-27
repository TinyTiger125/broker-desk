import Link from "next/link";
import { notFound } from "next/navigation";
import { updatePartyProfileAction } from "@/app/actions";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { PartyProfileForm } from "@/components/party-profile-form";
import { getClientById } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import {
  extractFreeformPartyNote,
  extractPartyProfileFromNotes,
} from "@/lib/party-profile";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

type EditPartyPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ flash?: string }>;
};

const copy = {
  ja: {
    title: "関係者情報",
    desc: "人物または会社の基本情報を更新します。",
    back: "関係者一覧へ",
    created: "関係者を保存しました。",
    updated: "関係者を更新しました。",
  },
  zh: {
    title: "主体信息",
    desc: "更新人物或公司的基本档案。",
    back: "返回主体列表",
    created: "主体已保存。",
    updated: "主体已更新。",
  },
  ko: {
    title: "관계자 정보",
    desc: "사람 또는 회사의 기본 기록을 업데이트합니다.",
    back: "관계자 목록으로",
    created: "관계자를 저장했습니다.",
    updated: "관계자를 업데이트했습니다.",
  },
} as const;

export default async function EditPartyPage({ params, searchParams }: EditPartyPageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.update" }),
  ]);
  const text = copy[locale];
  const { id } = await params;
  const client = await getClientById(id, session.tenant.id);
  if (!client) {
    notFound();
  }

  const meta = extractPartyProfileFromNotes(client.notes);
  const query = (await searchParams) ?? {};
  const flashMessage =
    query.flash === "party_created" ? text.created : query.flash === "party_updated" ? text.updated : undefined;

  return (
    <div className="space-y-5 pb-16">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{text.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{text.desc}</p>
        </div>
        <Link href={`/parties?focus=${client.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
          {text.back}
        </Link>
      </header>
      <PageFlashBanner message={flashMessage} />
      <PartyProfileForm
        action={updatePartyProfileAction}
        mode="edit"
        locale={locale}
        defaults={{
          partyId: client.id,
          name: client.name,
          partyType: meta.type ?? "individual",
          partyRole: meta.role ?? "applicant",
          phone: client.phone,
          email: client.email,
          lineId: client.lineId,
          relationHint: client.preferredArea,
          note: extractFreeformPartyNote(client.notes),
        }}
      />
    </div>
  );
}
