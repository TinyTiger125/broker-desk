import Link from "next/link";
import { notFound } from "next/navigation";
import { updateClientProfileAction } from "@/app/actions";
import { ClientForm, type ClientFormDefaults } from "@/components/client-form";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { ObjectAttachmentSection } from "@/components/object-attachment-section";
import { PartyAttachmentDisclosure } from "@/components/party-attachment-disclosure";
import { getClientDetailForContext } from "@/lib/data";
import { getLocale, type Locale } from "@/lib/locale";
import { extractFreeformPartyNote, extractPartyProfileFromNotes, normalizePartyReturnTo } from "@/lib/party-profile";
import { getTenantCapability, requireTenantSession } from "@/lib/tenant-session";
import { capabilityHasTenantPermission } from "@/lib/tenant-permissions";
import { createRequestContext } from "@/lib/visibility-resolver";
import { listLinkedObjectAttachments } from "@/lib/object-attachments";

export const dynamic = "force-dynamic";

type EditPartyPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ flash?: string; returnTo?: string }>;
};

const copy = {
  ja: { eyebrow: "関係者を管理", back: "関係者一覧へ戻る", relationTree: "関係を確認", attachments: "資料", updated: "関係者を更新しました。", attachmentUploaded: "添付資料を追加しました。", title: "関係者を編集", readOnly: "会社メンバーに公開／読み取り専用", ownerReadOnly: "現在のアカウントは閲覧のみです。" },
  zh: { eyebrow: "维护主体", back: "返回主体列表", relationTree: "查看关系", attachments: "资料", updated: "主体已更新。", attachmentUploaded: "附件已添加。", title: "编辑主体", readOnly: "公司成员可见／只读", ownerReadOnly: "当前账号仅可查看。" },
  ko: { eyebrow: "관계자 관리", back: "관계자 목록으로", relationTree: "관계 확인", attachments: "자료", updated: "관계자를 업데이트했습니다.", attachmentUploaded: "첨부 자료를 추가했습니다.", title: "관계자 편집", readOnly: "회사 구성원 공개 / 읽기 전용", ownerReadOnly: "현재 계정은 보기 전용입니다." },
} as const;

export default async function EditPartyPage({ params, searchParams }: EditPartyPageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.read" }),
  ]);
  const { id } = await params;
  const context = createRequestContext(session);
  const visible = await getClientDetailForContext({ context, clientId: id });
  if (!visible.detail || !visible.resolution.canRead) notFound();
  const client = visible.detail;
  const capabilityCanWrite = session.membership.status === "active"
    && capabilityHasTenantPermission(getTenantCapability(session.membership), "record.update");
  const canEdit = visible.resolution.canWrite && capabilityCanWrite;
  const query = (await searchParams) ?? {};
  const returnTo = normalizePartyReturnTo(query.returnTo);
  const text = copy[locale];
  const meta = extractPartyProfileFromNotes(client.notes);
  const flashMessage = query.flash === "party_updated" ? text.updated : query.flash === "object_attachment_uploaded" ? text.attachmentUploaded : undefined;
  const attachments = await listLinkedObjectAttachments({ tenantId: session.tenant.id, targetType: "party", targetId: client.id });
  const profileDefaults: ClientFormDefaults = {
    clientId: client.id,
    name: client.name,
    phone: client.phone,
    email: client.email,
    lineId: client.lineId,
    furigana: client.furigana,
    birthDate: client.birthDate,
    gender: client.gender,
    currentPostalCode: client.currentPostalCode,
    currentAddress: client.currentAddress,
    employerName: client.employerName,
    employerAddress: client.employerAddress,
    employerPhone: client.employerPhone,
    annualIncome: client.annualIncome,
    annualIncomeAsOf: client.annualIncomeAsOf,
    annualIncomeSource: client.annualIncomeSource,
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
    notes: extractFreeformPartyNote(client.notes),
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-500">{text.eyebrow}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">{client.name || text.title}</h1>
            <PartyAttachmentDisclosure label={text.attachments} initialOpen={query.flash === "object_attachment_uploaded"}>
              <ObjectAttachmentSection
                locale={locale as Locale}
                targetType="party"
                targetId={client.id}
                items={attachments}
                canWrite={canEdit}
                listClassName="max-h-[60vh] overflow-y-auto"
              />
            </PartyAttachmentDisclosure>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2"><Link href={`/relationship-tree?type=client&id=${encodeURIComponent(client.id)}`} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">{text.relationTree}</Link><Link href={returnTo} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">{text.back}</Link></div>
      </header>
      <PageFlashBanner message={flashMessage} />
      <ClientForm
        action={updateClientProfileAction}
        locale={locale as Locale}
        mode="edit"
        returnTo={returnTo}
        submitReturnTo={`/parties/${encodeURIComponent(client.id)}/edit`}
        partyMeta={{ type: meta.type }}
        readOnly={!canEdit}
        hideActions={!canEdit}
        defaults={profileDefaults}
      />
    </div>
  );
}
