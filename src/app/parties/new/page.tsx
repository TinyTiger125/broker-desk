import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

const copy = {
  ja: {
    title: "関係者を追加",
    description: "独立した関係者の新規作成",
    message: "現在のデータモデルでは、顧客レコードを生成せずに関係者だけを作成することはできません。顧客の用途、ステージ、関係情報を変更しないため、独立した関係者の作成は現在利用できません。",
    back: "関係者一覧へ戻る",
  },
  zh: {
    title: "新增主体",
    description: "独立主体创建",
    message: "当前数据模型无法在不生成客户记录的情况下独立创建主体。为避免改变客户用途、阶段和关系信息，独立主体创建暂未开放。",
    back: "返回主体列表",
  },
  ko: {
    title: "관계자 추가",
    description: "독립 관계자 생성",
    message: "현재 데이터 모델에서는 고객 레코드를 만들지 않고 관계자만 독립적으로 생성할 수 없습니다. 고객의 용도, 단계와 관계 정보를 변경하지 않기 위해 독립 관계자 생성은 현재 제공하지 않습니다.",
    back: "관계자 목록으로",
  },
} as const;

export default async function NewPartyPage() {
  const [locale] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.update" }),
  ]);
  const text = copy[locale];

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-sm font-semibold text-slate-500">{text.description}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{text.title}</h1>
        </div>
        <Link
          href="/parties"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]"
        >
          {text.back}
        </Link>
      </header>

      <section className="border-b border-slate-200 pb-6" aria-labelledby="party-create-state">
        <h2 id="party-create-state" className="text-base font-bold text-slate-950">{text.title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{text.message}</p>
      </section>
    </div>
  );
}
