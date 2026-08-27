"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { SystemStatePanel } from "@/components/system-state-panel";
import {
  getBrowserSystemStateLocale,
  getDefaultSystemStateLocale,
  getSystemStateErrorView,
  subscribeToSystemStateLocale,
} from "@/lib/system-state-copy";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const locale = useSyncExternalStore(
    subscribeToSystemStateLocale,
    getBrowserSystemStateLocale,
    getDefaultSystemStateLocale,
  );

  useEffect(() => {
    console.error("Broker Desk global error", { digest: error.digest });
  }, [error]);

  const view = getSystemStateErrorView(locale, "global", error);

  return (
    <html lang={locale}>
      <body className="m-0 bg-slate-50 font-sans text-slate-950">
        <main className="mx-auto min-h-screen max-w-3xl px-4 sm:px-6">
          <SystemStatePanel
            locale={locale}
            tone="error"
            title={view.title}
            description={view.description}
            requestIdLabel={view.requestIdLabel}
            requestId={view.requestId}
            actions={
              <>
                <button type="button" onClick={reset} className="min-h-11 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
                  {view.retry}
                </button>
                <Link href="/workspace" className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
                  {view.back}
                </Link>
              </>
            }
          />
        </main>
      </body>
    </html>
  );
}
