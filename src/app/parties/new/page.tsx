import Link from "next/link";
import { createClientFormAction } from "@/app/actions";
import { ClientForm } from "@/components/client-form";
import { getLocale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

type NewPartyPageProps = { searchParams?: Promise<{ from?: string }> };

const copy = {
  ja: { title: "関係者を追加", desc: "関係者の基本情報と管理情報を登録します。", back: "関係者一覧へ戻る" },
  zh: { title: "新增人物", desc: "登记人物的基本信息和管理信息。", back: "返回人物列表" },
  ko: { title: "관계자 추가", desc: "관계자의 기본 정보와 관리 정보를 등록합니다.", back: "관계자 목록으로" },
} as const;

export default async function NewPartyPage({ searchParams }: NewPartyPageProps) {
  const [locale] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.update" }),
  ]);
  const params = (await searchParams) ?? {};
  const returnTo = params.from === "entry" ? "/import-center" : "/parties";
  const text = copy[locale];
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div><h1 className="text-3xl font-bold tracking-tight text-slate-950">{text.title}</h1><p className="mt-2 text-sm font-medium text-slate-600">{text.desc}</p></div>
        <Link href={returnTo} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">{text.back}</Link>
      </header>
      <ClientForm action={createClientFormAction} mode="create" locale={locale} returnTo={returnTo} />
    </div>
  );
}
