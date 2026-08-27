import type { ReactNode } from "react";
import { PageFrame, PageHeader, StateSurface } from "@/components/layout-system";
import type { SystemStateLocale } from "@/lib/system-state-copy";

type SystemStatePanelProps = {
  locale: SystemStateLocale;
  title: string;
  description: string;
  tone: "empty" | "error";
  requestIdLabel?: string;
  requestId?: string;
  actions: ReactNode;
};

/** Display-only system state composition. Routing, reset behavior and locale selection stay with the caller. */
export function SystemStatePanel({ locale, title, description, tone, requestIdLabel, requestId, actions }: SystemStatePanelProps) {
  return (
    <PageFrame lang={locale} data-locale={locale} className="flex min-h-[calc(100dvh-8rem)] items-center justify-center py-10">
      <section
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
        role={tone === "error" ? "alert" : "status"}
        aria-live={tone === "error" ? "assertive" : "polite"}
      >
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Broker Desk</p>
        <PageHeader className="mt-3" title={title} description={description} />
        <StateSurface tone={tone}>
          {requestId && requestIdLabel ? <p className="m-0 text-xs text-slate-500">{requestIdLabel}: {requestId}</p> : null}
          <div className="mt-4 flex flex-wrap gap-3">{actions}</div>
        </StateSurface>
      </section>
    </PageFrame>
  );
}
