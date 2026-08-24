import Link from "next/link";
import { notFound } from "next/navigation";
import { updateClientProfileAction } from "@/app/actions";
import { ClientForm, type ClientFormDefaults } from "@/components/client-form";
import { PartyProfileReadOnly } from "@/components/party-profile-form";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { getClientDetailForContext } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import { getTenantCapability, requireTenantSession } from "@/lib/tenant-session";
import { capabilityHasTenantPermission } from "@/lib/tenant-permissions";
import { createRequestContext } from "@/lib/visibility-resolver";
import { extractPartyProfileFromNotes } from "@/lib/party-profile";

export const dynamic = "force-dynamic";

type EditClientPageProps = { params: Promise<{ id: string }>; searchParams?: Promise<{ returnTo?: string; flash?: string }> };

const copy = {
  ja: { title: "顧客編集", desc: "顧客の基本情報、希望条件と管理情報を更新します。", back: "戻る", updated: "顧客情報を保存しました。" },
  zh: { title: "编辑客户", desc: "更新客户的基本信息、需求条件和管理信息。", back: "返回", updated: "客户信息已保存。" },
  ko: { title: "고객 편집", desc: "고객의 기본 정보, 희망 조건과 관리 정보를 업데이트합니다.", back: "돌아가기", updated: "고객 정보를 저장했습니다." },
} as const;

function normalizeReturnTo(value: string | undefined, clientId: string): string {
  const fallback = `/clients/${encodeURIComponent(clientId)}`;
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
  if (parsed.pathname === `/clients/${encodeURIComponent(clientId)}` && keys.length === 0) return parsed.pathname;
  return fallback;
}

export default async function EditClientPage({ params, searchParams }: EditClientPageProps) {
  const [locale, session] = await Promise.all([getLocale(), requireTenantSession({ permission: "record.read" })]);
  const text = copy[locale];
  const { id } = await params;
  const visible = await getClientDetailForContext({ context: createRequestContext(session), clientId: id });
  if (!visible.detail || !visible.resolution.canRead) notFound();
  const client = visible.detail;
  const query = (await searchParams) ?? {};
  const returnTo = normalizeReturnTo(query.returnTo, client.id);
  const flashMessage = query.flash === "client_updated" ? text.updated : undefined;
  const capabilityCanWrite = session.membership.status === "active"
    && capabilityHasTenantPermission(getTenantCapability(session.membership), "record.update");
  const canEdit = visible.resolution.canWrite && capabilityCanWrite;
  if (!canEdit) {
    const profile = extractPartyProfileFromNotes(client.notes);
    const readOnlyReason = visible.resolution.outcome === "company_read" ? "company_read" : "owner_read_only";
    return (
      <div className="mx-auto max-w-5xl space-y-6 pb-12">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5"><div><h1 className="text-3xl font-bold tracking-tight text-slate-950">{client.name}</h1><p className="mt-2 text-sm font-medium text-slate-600">{readOnlyReason === "company_read" ? locale === "zh" ? "公司成员可见／只读" : locale === "ko" ? "회사 구성원 공개 / 읽기 전용" : "会社メンバーに公開／読み取り専用" : locale === "zh" ? "当前账号仅可查看。" : locale === "ko" ? "현재 계정은 보기 전용입니다." : "現在のアカウントは閲覧のみです。"}</p></div><Link href={returnTo} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">{text.back}</Link></header>
        <PartyProfileReadOnly reason={readOnlyReason} locale={locale} defaults={{ name: client.name, phone: client.phone, email: client.email, lineId: client.lineId, partyType: profile.type, partyRole: profile.role }} />
      </div>
    );
  }
  const defaults: ClientFormDefaults = {
    clientId: client.id,
    name: client.name,
    phone: client.phone,
    lineId: client.lineId,
    email: client.email,
    budgetMin: client.budgetMin,
    budgetMax: client.budgetMax,
    budgetType: client.budgetType,
    preferredArea: client.preferredArea,
    firstChoiceArea: client.firstChoiceArea,
    secondChoiceArea: client.secondChoiceArea,
    purpose: client.purpose,
    loanPreApprovalStatus: client.loanPreApprovalStatus,
    desiredMoveInPeriod: client.desiredMoveInPeriod,
    stage: client.stage,
    temperature: client.temperature,
    brokerageContractType: client.brokerageContractType,
    brokerageContractSignedAt: client.brokerageContractSignedAt,
    brokerageContractExpiresAt: client.brokerageContractExpiresAt,
    importantMattersExplainedAt: client.importantMattersExplainedAt,
    contractDocumentDeliveredAt: client.contractDocumentDeliveredAt,
    personalInfoConsentAt: client.personalInfoConsentAt,
    amlCheckStatus: client.amlCheckStatus,
    nextFollowUpAt: client.nextFollowUpAt,
    notes: client.notes,
  };
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5"><div><h1 className="text-3xl font-bold tracking-tight text-slate-950">{text.title}</h1><p className="mt-2 text-sm font-medium text-slate-600">{client.name} · {text.desc}</p></div><Link href={returnTo} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">{text.back}</Link></header>
      <PageFlashBanner message={flashMessage} />
      <ClientForm action={updateClientProfileAction} mode="edit" defaults={defaults} locale={locale} returnTo={returnTo} />
    </div>
  );
}
