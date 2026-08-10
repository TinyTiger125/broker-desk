"use client";

import Link from "next/link";
import { useEffect } from "react";

type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function RouteError({ error, reset }: RouteErrorProps) {
  useEffect(() => {
    // Keep diagnostics in the browser console without rendering internals to the user.
    console.error("Broker Desk route error", { digest: error.digest });
  }, [error]);

  return (
    <main className="bd-page flex min-h-[calc(100dvh-8rem)] items-center justify-center py-10">
      <section className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-bold tracking-[0.18em] text-blue-700">BROKER DESK</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-950">此页面暂时无法打开</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          资料没有被删除。请先重试；若问题持续，请返回工作台后重新进入。
        </p>
        {error.digest ? (
          <p className="mt-4 text-xs text-slate-400">请求编号：{error.digest}</p>
        ) : null}
        <div className="mt-7 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            重试
          </button>
          <Link
            href="/"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            返回工作台
          </Link>
        </div>
      </section>
    </main>
  );
}
