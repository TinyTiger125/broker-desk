import Link from "next/link";
import { getLocale, type Locale } from "@/lib/locale";

const copy: Record<Locale, { title: string; description: string; back: string }> = {
  ja: {
    title: "ページが見つかりません",
    description: "ページが移動したか、アクセス権がない可能性があります。資料は削除されていません。",
    back: "ワークスペースに戻る",
  },
  zh: {
    title: "页面未找到",
    description: "该页面可能已移动，或你当前没有访问权限。资料没有被删除。",
    back: "返回工作台",
  },
  ko: {
    title: "페이지를 찾을 수 없습니다",
    description: "페이지가 이동했거나 접근 권한이 없을 수 있습니다. 자료는 삭제되지 않았습니다.",
    back: "워크스페이스로 돌아가기",
  },
};

export default async function NotFound() {
  const locale = await getLocale();
  const text = copy[locale];

  return (
    <main lang={locale} data-locale={locale} className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Broker Desk</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-950">{text.title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{text.description}</p>
        <Link href="/" className="mt-6 inline-flex rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
          {text.back}
        </Link>
      </section>
    </main>
  );
}
