"use client";

import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("Broker Desk global error", { digest: error.digest });
  }, [error]);

  return (
    <html lang="zh-CN">
      <body className="m-0 bg-slate-50 font-sans text-slate-950">
        <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-10">
          <section className="w-full rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-xs font-bold tracking-[0.18em] text-blue-700">BROKER DESK</p>
            <h1 className="mt-3 text-2xl font-bold">服务暂时不可用</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              请稍后重试。若问题持续，请联系系统负责人并提供下方请求编号。
            </p>
            {error.digest ? <p className="mt-4 text-xs text-slate-400">请求编号：{error.digest}</p> : null}
            <button
              type="button"
              onClick={reset}
              className="mt-7 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
            >
              重试
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
