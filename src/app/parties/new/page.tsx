import Link from "next/link";
import { createPartyProfileAction } from "@/app/actions";
import { PartyProfileForm } from "@/components/party-profile-form";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { getLocale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

type NewPartyPageProps = {
  searchParams?: Promise<{ name?: string; flash?: string }>;
};

const copy = {
  ja: {
    title: "関係者を追加",
    desc: "人物または会社の基本情報を先に登録し、必要な資料をあとで追加します。",
    back: "関係者一覧へ",
    flashContinue: "名称を引き継ぎました。内容を確認して保存してください。",
  },
  zh: {
    title: "新增主体",
    desc: "先建立人物或公司的基本档案，再上传和归属资料。",
    back: "返回主体列表",
    flashContinue: "已带入名称，请确认内容后保存。",
  },
  ko: {
    title: "관계자 추가",
    desc: "사람 또는 회사의 기본 정보를 먼저 등록하고 필요한 자료를 나중에 추가합니다.",
    back: "관계자 목록으로",
    flashContinue: "이름을 가져왔습니다. 내용을 확인한 뒤 저장하세요.",
  },
} as const;

export default async function NewPartyPage({ searchParams }: NewPartyPageProps) {
  const [locale] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.update" }),
  ]);
  const text = copy[locale];
  const params = (await searchParams) ?? {};
  const flashMessage = params.flash === "continue_profile" ? text.flashContinue : undefined;

  return (
    <div className="space-y-5 pb-16">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{text.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{text.desc}</p>
        </div>
        <Link href="/parties" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
          {text.back}
        </Link>
      </header>
      <PageFlashBanner message={flashMessage} />
      <PartyProfileForm
        action={createPartyProfileAction}
        mode="create"
        locale={locale}
        defaults={{
          name: params.name?.trim() ?? "",
        }}
      />
    </div>
  );
}
