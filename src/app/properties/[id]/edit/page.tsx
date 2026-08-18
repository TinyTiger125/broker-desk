import Link from "next/link";
import { notFound } from "next/navigation";
import { updatePropertyProfileAction, type PropertyFormValues } from "@/app/actions";
import { PropertyResponsiveForm } from "@/components/property-responsive-form";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { getPropertyById } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

type EditPropertyPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ flash?: string; returnTo?: string }>;
};

const copy = {
  ja: {
    title: "物件を編集",
    desc: "物件の基本情報と価格・費用を更新します。",
    back: "物件一覧へ戻る",
    relationTree: "関係を確認",
    updated: "物件を更新しました。",
    created: "物件を作成しました。内容を確認してください。",
  },
  zh: {
    title: "编辑物件",
    desc: "更新物件的基本信息、价格和费用。",
    back: "返回物件列表",
    relationTree: "查看关系",
    updated: "物件已更新。",
    created: "物件已创建，请确认内容。",
  },
  ko: {
    title: "매물 편집",
    desc: "매물의 기본 정보와 가격·비용을 업데이트합니다.",
    back: "매물 목록으로",
    relationTree: "관계 확인",
    updated: "매물을 업데이트했습니다.",
    created: "매물을 생성했습니다. 내용을 확인해 주세요.",
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

export default async function EditPropertyPage({ params, searchParams }: EditPropertyPageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.update" }),
  ]);
  const { id } = await params;
  const property = await getPropertyById(id, session.tenant.id);
  if (!property) notFound();

  const query = (await searchParams) ?? {};
  const returnTo = normalizeReturnTo(query.returnTo);
  const text = copy[locale];
  const flashMessage = query.flash === "property_updated"
    ? text.updated
    : query.flash === "property_created"
      ? text.created
      : undefined;
  const initialValues: PropertyFormValues = {
    name: property.name,
    area: property.area ?? "",
    address: property.address ?? "",
    sizeSqm: property.sizeSqm == null ? "" : String(property.sizeSqm),
    listingPrice: property.listingPrice > 0 ? String(property.listingPrice) : "",
    managementFee: property.managementFee == null ? "" : String(property.managementFee),
    repairFee: property.repairFee == null ? "" : String(property.repairFee),
    notes: property.notes ?? "",
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">{text.title}</h1>
          <p className="mt-2 text-sm font-medium text-slate-600">{property.name} · {text.desc}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/relationship-tree?type=property&id=${encodeURIComponent(property.id)}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">
            {text.relationTree}
          </Link>
          <Link href={returnTo} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">
            {text.back}
          </Link>
        </div>
      </header>
      <PageFlashBanner message={flashMessage} />
      <PropertyResponsiveForm action={updatePropertyProfileAction} locale={locale} initialValues={initialValues} returnTo={returnTo} propertyId={property.id} />
    </div>
  );
}
