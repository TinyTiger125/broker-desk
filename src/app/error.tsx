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

type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function RouteError({ error, reset }: RouteErrorProps) {
  const locale = useSyncExternalStore(
    subscribeToSystemStateLocale,
    getBrowserSystemStateLocale,
    getDefaultSystemStateLocale,
  );

  useEffect(() => {
    // Keep diagnostics in the browser console without rendering internals to the user.
    console.error("Broker Desk route error", { digest: error.digest });
  }, [error]);

  const view = getSystemStateErrorView(locale, "route", error);

  return (
    <SystemStatePanel
      locale={locale}
      tone="error"
      title={view.title}
      description={view.description}
      requestIdLabel={view.requestIdLabel}
      requestId={view.requestId}
      actions={
        <>
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {view.retry}
          </button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {view.back}
          </Link>
        </>
      }
    />
  );
}
