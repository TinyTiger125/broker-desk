import Link from "next/link";
import { type PropertyFormValues } from "@/app/actions";
import { createPropertyEntryAction } from "@/app/entry-actions";
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
    desc: "資料をアップロードすると、判読できて不一致のない既存項目は正式な物件記録へ自動保存されます。必須項目が不足する場合は補完後に保存でき、保存後も編集・再確認できます。",
    back: "物件一覧へ戻る",
  },
  zh: {
    title: "新增物件",
    desc: "上传资料后，清晰且无冲突的现有字段会自动写入正式物件记录；缺少必填项时请补充后保存，保存后仍可编辑和复核。",
    back: "返回物件列表",
  },
  ko: {
    title: "매물 추가",
    desc: "자료를 업로드하면 명확하고 불일치가 없는 기존 항목은 정식 매물 기록에 자동 저장됩니다. 필수 항목이 없으면 보완 후 저장할 수 있으며, 저장 후에도 수정하고 다시 확인할 수 있습니다.",
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
    if (keys.some((key) => !["type", "q", "lifecycle", "page"].includes(key)) || !["", "all", "property"].includes(parsed.searchParams.get("type") ?? "")) return fallback;
    return `${parsed.pathname}${parsed.search}`;
  }
  if (parsed.pathname === "/import-center") {
    const allowed = ["flow", "targetCaseId", "job", "xlsxJob", "intake", "advanced", "flash", "panel", "object", "targetId"];
    if (parsed.searchParams.get("object") && parsed.searchParams.get("object") !== "property") return fallback;
    if (parsed.searchParams.get("targetId") && !/^[A-Za-z0-9_-]{1,160}$/.test(parsed.searchParams.get("targetId") ?? "")) return fallback;
    if (keys.some((key) => !allowed.includes(key))) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  return fallback;
}

const emptyValues: PropertyFormValues = {
  name: "",
  area: "",
  address: "",
  furigana: "",
  roomNumber: "",
  postalCode: "",
  usage: "",
  sizeSqm: "",
  listingPrice: "",
  listingRent: "",
  listingCommonFee: "",
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
      <PropertyResponsiveForm action={createPropertyEntryAction} locale={locale} initialValues={emptyValues} returnTo={returnTo} entryUpload />
    </div>
  );
}
