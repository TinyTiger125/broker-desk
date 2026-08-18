import Link from "next/link";
import { formatDate } from "@/lib/format";
import { listHubContracts } from "@/lib/hub";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

const copy = {
  ja: { subtitle: "現在保存されている契約関連記録を確認します。", registry: "契約関連記録", reference: "参照番号", asset: "物件", party: "主体", date: "記録日", empty: "契約関連記録はありません。", showing: "{{to}} / {{count}}件", previous: "前へ", next: "次へ", audit: "操作履歴を見る", sourceNote: "契約の状態・金額は独立した契約データではなく、ページで判定しません。" },
  zh: { subtitle: "查看当前保存的合同关联记录。", registry: "合同关联记录", reference: "参考编号", asset: "物件", party: "主体", date: "记录日期", empty: "暂无合同关联记录。", showing: "{{to}} / 共 {{count}} 条", previous: "上一页", next: "下一页", audit: "查看操作记录", sourceNote: "合同状态和金额没有独立权威数据，本页不自行推导。" },
  ko: { subtitle: "현재 저장된 계약 관련 기록을 확인합니다.", registry: "계약 관련 기록", reference: "참조 번호", asset: "매물", party: "관계자", date: "기록일", empty: "계약 관련 기록이 없습니다.", showing: "{{to}} / 전체 {{count}}건", previous: "이전", next: "다음", audit: "작업 기록 보기", sourceNote: "계약 상태와 금액을 독립된 권위 데이터로 판정하지 않습니다." },
} as const;

type ContractsPageProps = { searchParams?: Promise<{ page?: string }> };

export default async function ContractsPage({ searchParams }: ContractsPageProps) {
  const locale = await getLocale();
  const params = searchParams ? await searchParams : undefined;
  const page = Math.max(1, Number(params?.page ?? "1") || 1);
  const text = copy[locale];
  const session = await requireTenantSession({ permission: "record.read" });
  const records = await listHubContracts(locale, { userId: session.user.id, tenantId: session.tenant.id });
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rows = records.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{t(locale, "contracts.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">{text.subtitle}</p>
      </header>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs text-slate-500">{text.sourceNote}</p>
      </section>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">{text.registry}</h2>
          <p className="mt-1 text-xs text-slate-500">{text.showing.replace("{{to}}", String(Math.min(currentPage * pageSize, records.length))).replace("{{count}}", String(records.length))}</p>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-left">
            <thead className="bg-slate-50"><tr className="text-xs text-slate-500"><th className="px-4 py-3">{text.reference}</th><th className="px-4 py-3">{text.asset}</th><th className="px-4 py-3">{text.party}</th><th className="px-4 py-3">{text.date}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((record) => <tr key={record.id} className="align-top hover:bg-slate-50"><td className="px-4 py-3 text-sm font-semibold text-slate-900">{record.contractNumber}</td><td className="px-4 py-3 text-sm text-slate-800">{record.relatedProperty ?? t(locale, "common.notSet")}</td><td className="px-4 py-3 text-sm">{record.relatedParty && record.clientId ? <Link href={`/clients/${record.clientId}`} className="text-blue-700 hover:underline">{record.relatedParty}</Link> : <span className="text-slate-500">{record.relatedParty ?? t(locale, "common.notSet")}</span>}</td><td className="px-4 py-3 text-sm text-slate-600">{formatDate(record.signedAt, locale)}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-slate-100 md:hidden">
          {rows.map((record) => <article key={record.id} className="space-y-2 p-4"><p className="font-semibold text-slate-900">{record.contractNumber}</p><p className="text-sm text-slate-700">{text.asset}：{record.relatedProperty ?? t(locale, "common.notSet")}</p><p className="text-sm text-slate-700">{text.party}：{record.relatedParty && record.clientId ? <Link href={`/clients/${record.clientId}`} className="text-blue-700 hover:underline">{record.relatedParty}</Link> : record.relatedParty ?? t(locale, "common.notSet")}</p><p className="text-xs text-slate-500">{text.date}：{formatDate(record.signedAt, locale)}</p></article>)}
        </div>
        {records.length === 0 ? <p className="px-4 py-10 text-center text-sm text-slate-500">{text.empty}</p> : null}
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          {currentPage > 1 ? <Link href={`/contracts?page=${currentPage - 1}`} className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700">{text.previous}</Link> : <span className="text-xs text-slate-400">{text.previous}</span>}
          {currentPage < totalPages ? <Link href={`/contracts?page=${currentPage + 1}`} className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700">{text.next}</Link> : <span className="text-xs text-slate-400">{text.next}</span>}
        </div>
      </section>
      <Link href="/audit-log" className="inline-flex text-sm text-slate-600 hover:underline">{text.audit}</Link>
    </div>
  );
}
