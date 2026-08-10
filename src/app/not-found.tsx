import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Broker Desk</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-950">页面未找到</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">该页面可能已移动，或你当前没有访问权限。资料没有被删除。</p>
        <Link href="/" className="mt-6 inline-flex rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
          返回工作台
        </Link>
      </section>
    </main>
  );
}
