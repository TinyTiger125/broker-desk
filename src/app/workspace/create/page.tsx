import { randomUUID } from "node:crypto";
import { getLocale } from "@/lib/locale";
import { CreateWorkspaceForm } from "./create-workspace-form";

export const dynamic = "force-dynamic";

type CreateWorkspacePageProps = {
  searchParams?: Promise<{ requestId?: string }>;
};

export default async function CreateWorkspacePage({ searchParams }: CreateWorkspacePageProps) {
  const locale = await getLocale();
  const params = searchParams ? await searchParams : {};
  const isZh = locale === "zh";
  const isKo = locale === "ko";
  const title = isZh ? "创建公司" : isKo ? "회사 만들기" : "会社を作成";
  const description = isZh
    ? "创建后，你会同时成为该公司的负责人并进入工作区。正式生产使用仍受订阅或试用资格约束。"
    : isKo
      ? "회사를 만들면 회사 책임자가 되어 워크스페이스에 바로 들어갑니다. 정식 운영은 구독 또는 체험 자격이 필요합니다."
      : "会社を作成すると、同時に会社の責任者としてワークスペースに入ります。正式利用には契約またはトライアル資格が必要です。";
  const nameLabel = isZh ? "公司名称" : isKo ? "회사명" : "会社名";
  const submit = isZh ? "创建并进入" : isKo ? "만들고 입장" : "作成して入室";
  const pending = isZh ? "创建中…" : isKo ? "만드는 중…" : "作成中…";
  const cancel = isZh ? "返回工作区" : isKo ? "워크스페이스로 돌아가기" : "ワークスペースに戻る";
  const idempotencyKey = params.requestId?.trim() || randomUUID();

  return (
    <section className="broker-desk-auth-route flex min-h-screen items-center justify-center bg-[#f8f9ff] px-5 py-10 sm:px-8">
      <div className="w-full max-w-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-black uppercase tracking-[0.14em] text-[#1960a3]">Broker Desk</p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">{title}</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">{description}</p>
        <CreateWorkspaceForm
          initialIdempotencyKey={idempotencyKey}
          nameLabel={nameLabel}
          submitLabel={submit}
          pendingLabel={pending}
          cancelLabel={cancel}
        />
      </div>
    </section>
  );
}
