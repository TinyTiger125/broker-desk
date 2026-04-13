import Link from "next/link";
import { notFound } from "next/navigation";
import { updateClientProfile } from "@/app/actions";
import { ClientForm } from "@/components/client-form";
import { getClientById } from "@/lib/data";
import { getLocale } from "@/lib/locale";

export const dynamic = "force-dynamic";

type EditClientPageProps = {
  params: Promise<{ id: string }>;
};

const texts = {
  ja: {
    title: "顧客編集",
    desc: "顧客情報とフォロー条件を更新します。",
    back: "詳細へ戻る",
  },
  zh: {
    title: "编辑客户",
    desc: "更新客户信息与跟进条件。",
    back: "返回详情",
  },
  ko: {
    title: "고객 편집",
    desc: "고객 정보와 후속 조건을 업데이트합니다.",
    back: "상세로 돌아가기",
  },
} as const;

export default async function EditClientPage({ params }: EditClientPageProps) {
  const locale = await getLocale();
  const text = texts[locale];
  const { id } = await params;
  const client = await getClientById(id);

  if (!client) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{text.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{text.desc}</p>
        </div>
        <Link href={`/clients/${client.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
          {text.back}
        </Link>
      </header>

      <ClientForm
        action={updateClientProfile}
        mode="edit"
        locale={locale}
        defaults={{
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
        }}
      />
    </div>
  );
}
