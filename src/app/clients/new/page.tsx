import Link from "next/link";
import { createClientFormAction } from "@/app/actions";
import { ClientForm, type ClientFormDefaults } from "@/components/client-form";
import { getLocale } from "@/lib/locale";

export const dynamic = "force-dynamic";

type NewClientPageProps = { searchParams?: Promise<{ returnTo?: string }> };

const copy = {
  ja: { title: "新規顧客登録", desc: "顧客の基本情報、希望条件、管理情報を登録します。", back: "顧客一覧へ戻る" },
  zh: { title: "新建客户", desc: "登记客户的基本信息、需求条件和管理信息。", back: "返回客户列表" },
  ko: { title: "신규 고객 등록", desc: "고객의 기본 정보, 희망 조건과 관리 정보를 등록합니다.", back: "고객 목록으로" },
} as const;

function normalizeReturnTo(value: string | undefined): string {
  const fallback = "/clients";
  const path = (value ?? "").trim();
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return fallback;
  const rawPathname = path.split(/[?#]/, 1)[0];
  let decoded = rawPathname;
  try { decoded = decodeURIComponent(rawPathname); } catch { return fallback; }
  if (decoded.includes("\\") || decoded.split("/").some((segment) => segment === "." || segment === "..")) return fallback;
  let parsed: URL;
  try { parsed = new URL(path, "http://broker-desk.local"); } catch { return fallback; }
  if (parsed.origin !== "http://broker-desk.local") return fallback;
  const keys = [...new Set([...parsed.searchParams.keys()])];
  if (parsed.pathname === "/clients") {
    if (keys.some((key) => !["q", "stage", "purpose", "temperature", "sort", "page"].includes(key))) return fallback;
    return `${parsed.pathname}${parsed.search}`;
  }
  if (parsed.pathname === "/organize-center" && parsed.searchParams.get("type") === "client") {
    if (keys.some((key) => !["type", "q", "lifecycle", "page"].includes(key))) return fallback;
    return `${parsed.pathname}${parsed.search}`;
  }
  return fallback;
}

const defaults: ClientFormDefaults = {
  stage: "lead",
  budgetType: "total_price",
  loanPreApprovalStatus: "not_applied",
  brokerageContractType: "none",
  amlCheckStatus: "not_required",
};

export default async function NewClientPage({ searchParams }: NewClientPageProps) {
  const locale = await getLocale();
  const params = (await searchParams) ?? {};
  const returnTo = normalizeReturnTo(params.returnTo);
  const text = copy[locale];
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div><h1 className="text-3xl font-bold tracking-tight text-slate-950">{text.title}</h1><p className="mt-2 text-sm font-medium text-slate-600">{text.desc}</p></div>
        <Link href={returnTo} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">{text.back}</Link>
      </header>
      <ClientForm action={createClientFormAction} mode="create" defaults={defaults} locale={locale} returnTo={returnTo} />
    </div>
  );
}
