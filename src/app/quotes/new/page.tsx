import { createQuotation } from "@/app/actions";
import { QuoteForm } from "@/components/quote-form";
import { listQuoteFormData } from "@/lib/data";
import { getLocale } from "@/lib/locale";

export const dynamic = "force-dynamic";

type NewQuotePageProps = {
  searchParams?: Promise<{ clientId?: string }>;
};

const texts = {
  ja: {
    title: "提案シミュレーター",
    desc: "入力と同時に試算し、提案をそのまま顧客履歴に保存できます。",
  },
  zh: {
    title: "提案模拟器",
    desc: "输入后实时试算，并可直接保存到客户历史。",
  },
  ko: {
    title: "제안 시뮬레이터",
    desc: "입력과 동시에 계산하고 제안을 고객 이력에 바로 저장할 수 있습니다.",
  },
} as const;

export default async function NewQuotePage({ searchParams }: NewQuotePageProps) {
  const locale = await getLocale();
  const text = texts[locale];
  const params = (await searchParams) ?? {};
  const { clients, properties } = await listQuoteFormData();
  const hasDefaultClient = clients.some((client) => client.id === params.clientId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{text.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{text.desc}</p>
      </div>
      <QuoteForm
        clients={clients}
        properties={properties}
        action={createQuotation}
        defaultClientId={hasDefaultClient ? params.clientId : undefined}
        locale={locale}
      />
    </div>
  );
}
