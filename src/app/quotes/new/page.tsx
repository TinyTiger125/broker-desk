import { createQuotation } from "@/app/actions";
import { QuoteForm } from "@/components/quote-form";
import Link from "next/link";
import { listClientsForContext, listPropertiesForContext } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";
import { createRequestContext } from "@/lib/visibility-resolver";

export const dynamic = "force-dynamic";

type NewQuotePageProps = {
  searchParams?: Promise<{ clientId?: string; returnTo?: string }>;
};

const texts = {
  ja: {
    title: "提案シミュレーター",
    desc: "入力と同時に試算し、提案をそのまま顧客履歴に保存できます。",
    back: "戻る",
  },
  zh: {
    title: "提案模拟器",
    desc: "输入后实时试算，并可直接保存到客户历史。",
    back: "返回",
  },
  ko: {
    title: "제안 시뮬레이터",
    desc: "입력과 동시에 계산하고 제안을 고객 이력에 바로 저장할 수 있습니다.",
    back: "돌아가기",
  },
} as const;

function normalizeReturnTo(value: string | undefined): string {
  const fallback = "/clients";
  const path = (value ?? "").trim();
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return fallback;
  let parsed: URL;
  try { parsed = new URL(path, "http://broker-desk.local"); } catch { return fallback; }
  if (parsed.origin !== "http://broker-desk.local" || parsed.hash) return fallback;
  const pathname = parsed.pathname;
  const keys = [...new Set(parsed.searchParams.keys())];
  if (pathname === "/clients") {
    if (keys.some((key) => !["q", "stage", "purpose", "temperature", "sort", "page"].includes(key))) return fallback;
    return `${pathname}${parsed.search}`;
  }
  if (pathname === "/organize-center") {
    if (keys.some((key) => !["type", "q", "lifecycle", "page"].includes(key)) || !["", "all", "party", "client"].includes(parsed.searchParams.get("type") ?? "")) return fallback;
    return `${pathname}${parsed.search}`;
  }
  return fallback;
}

export default async function NewQuotePage({ searchParams }: NewQuotePageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.read" }),
  ]);
  const text = texts[locale];
  const params = (await searchParams) ?? {};
  const returnTo = normalizeReturnTo(params.returnTo);
  const requestContext = createRequestContext(session);
  const [visibleClients, visibleProperties] = await Promise.all([
    listClientsForContext({ context: requestContext, filter: { lifecycleStatus: "active" } }),
    listPropertiesForContext({ context: requestContext, lifecycleStatus: "active" }),
  ]);
  const clients = visibleClients.filter((item) => item.resolution.canWrite).map((item) => item.client);
  const properties = visibleProperties
    .filter((item) => item.resolution.canWrite)
    .map(({ property }) => ({
      id: property.id,
      name: property.name,
      listingPrice: property.listingPrice,
      managementFee: property.managementFee ?? null,
      repairFee: property.repairFee ?? null,
    }));
  const hasDefaultClient = clients.some((client) => client.id === params.clientId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{text.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{text.desc}</p>
        </div>
        <Link href={returnTo} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{text.back}</Link>
      </div>
      <QuoteForm
        clients={clients}
        properties={properties}
        action={createQuotation}
        defaultClientId={hasDefaultClient ? params.clientId : undefined}
        returnTo={returnTo}
        locale={locale}
      />
    </div>
  );
}
