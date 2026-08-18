import Link from "next/link";
import { createPropertyQuickAction, type PropertyFormValues } from "@/app/actions";
import { PropertyResponsiveForm } from "@/components/property-responsive-form";
import { getLocale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

type NewPropertyPageProps = {
  searchParams?: Promise<{ returnTo?: string; from?: string }>;
};

const copy = {
  ja: {
    title: "物件を追加",
    desc: "物件の基本情報と価格・費用を登録します。",
    back: "物件一覧へ戻る",
  },
  zh: {
    title: "新增物件",
    desc: "登记物件的基本信息、价格和费用。",
    back: "返回物件列表",
  },
  ko: {
    title: "매물 추가",
    desc: "매물의 기본 정보와 가격·비용을 등록합니다.",
    back: "매물 목록으로",
  },
} as const;

function normalizeReturnTo(value: string | undefined): string {
  const fallback = "/properties";
  const path = (value ?? "").trim();
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\") || path.includes("\\")) return fallback;
  const rawPathname = path.split(/[?#]/, 1)[0];
  let decodedPathname = rawPathname;
  try {
    decodedPathname = decodeURIComponent(rawPathname);
  } catch {
    return fallback;
  }
  if (decodedPathname.split("/").some((segment) => segment === "." || segment === "..")) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(path, "http://broker-desk.local");
  } catch {
    return fallback;
  }
  if (parsed.origin !== "http://broker-desk.local") return fallback;
  const keys = [...new Set([...parsed.searchParams.keys()])];
  if (parsed.pathname === "/properties") {
    if (keys.some((key) => !["q", "lifecycle", "sort", "page"].includes(key))) return fallback;
    return `${parsed.pathname}${parsed.search}`;
  }
  if (parsed.pathname === "/organize-center") {
    if (keys.some((key) => !["type", "q", "lifecycle", "page"].includes(key)) || parsed.searchParams.get("type") !== "property") return fallback;
    return `${parsed.pathname}${parsed.search}`;
  }
  if (parsed.pathname === "/import-center") {
    const allowed = ["flow", "targetCaseId", "job", "xlsxJob", "intake", "advanced", "flash", "panel"];
    if (keys.some((key) => !allowed.includes(key))) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  return fallback;
}

const emptyValues: PropertyFormValues = {
  name: "",
  area: "",
  address: "",
  sizeSqm: "",
  listingPrice: "",
  managementFee: "",
  repairFee: "",
  notes: "",
};

export default async function NewPropertyPage({ searchParams }: NewPropertyPageProps) {
  const [locale] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.update" }),
  ]);
  const params = (await searchParams) ?? {};
  const legacyReturnTo = params.from === "entry" ? "/import-center" : undefined;
  const returnTo = normalizeReturnTo(params.returnTo ?? legacyReturnTo);
  const text = copy[locale];

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">{text.title}</h1>
          <p className="mt-2 text-sm font-medium text-slate-600">{text.desc}</p>
        </div>
        <Link href={returnTo} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">
          {text.back}
        </Link>
      </header>
      <PropertyResponsiveForm action={createPropertyQuickAction} locale={locale} initialValues={emptyValues} returnTo={returnTo} />
    </div>
  );
}
