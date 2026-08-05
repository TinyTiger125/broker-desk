import Link from "next/link";
import type { ReactNode } from "react";

type WorkbenchAction = {
  href: string;
  label: string;
  tone?: "dark" | "blue" | "green" | "plain";
};

type ProgressItem = {
  label: string;
  description?: string;
  completed: number;
  total: number;
  href?: string;
};

export const workbenchInputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100";

function actionClass(tone: WorkbenchAction["tone"] = "plain") {
  if (tone === "dark") return "border-slate-950 bg-slate-950 text-white hover:bg-slate-800";
  if (tone === "blue") return "border-blue-200 bg-blue-50 text-[#002FA7] hover:bg-blue-100";
  if (tone === "green") return "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100";
  return "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
}

function statusBadge(completed: number, total: number) {
  if (total === 0) {
    return "bg-slate-100 text-slate-600";
  }
  if (total === 0 || completed >= total) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100";
  }
  return "bg-amber-50 text-amber-800 ring-1 ring-amber-100";
}

export function ObjectWorkbenchShell({
  eyebrow,
  title,
  description,
  actions,
  flash,
  intake,
  left,
  right,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: WorkbenchAction[];
  flash?: ReactNode;
  intake?: ReactNode;
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6 pb-16">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">{eyebrow}</p>
          <h1 className="mt-1 break-words text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
          {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
        </div>
        {actions?.length ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {actions.map((action) => (
              <Link
                key={`${action.href}-${action.label}`}
                href={action.href}
                className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${actionClass(action.tone)}`}
              >
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}
      </header>
      {flash}
      {intake}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="grid min-w-0 gap-0 2xl:grid-cols-[minmax(17rem,21rem)_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 p-4 2xl:sticky 2xl:top-14 2xl:max-h-[calc(100vh-4rem)] 2xl:overflow-y-auto 2xl:border-b-0 2xl:border-r">
            {left}
          </aside>
          <main id="object-main-editor" className="min-w-0 space-y-4 p-4">
            {right}
          </main>
        </div>
      </section>
    </div>
  );
}

export function WorkbenchAssistantCard({
  label,
  title,
  body,
  tone = "blue",
  actionHref,
  actionLabel,
}: {
  label: string;
  title: string;
  body: string;
  tone?: "blue" | "amber" | "green";
  actionHref?: string;
  actionLabel?: string;
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-950"
        : "border-blue-200 bg-blue-50 text-blue-950";
  const labelClass = tone === "green" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-blue-700";

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className={`text-xs font-black ${labelClass}`}>{label}</p>
      <h2 className="mt-2 text-lg font-black">{title}</h2>
      <p className="mt-2 text-sm font-semibold leading-6">{body}</p>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="mt-4 inline-flex w-full items-center justify-between rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800">
          {actionLabel}
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_forward</span>
        </Link>
      ) : null}
    </div>
  );
}

export function WorkbenchProgressCard({
  label,
  title,
  completed,
  total,
  helper,
  labels,
}: {
  label: string;
  title: string;
  completed: number;
  total: number;
  helper?: string;
  labels?: {
    overall: string;
    remaining: string;
  };
}) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 100;
  const open = Math.max(0, total - completed);

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-indigo-700">{label}</p>
          <h2 className="mt-1 text-base font-black text-slate-950">{title}</h2>
        </div>
        <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-black tabular-nums text-white">
          {percent}%
        </span>
      </div>
      <div className="mt-5 rounded-lg bg-slate-50 p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-black text-slate-500">{labels?.overall ?? "整体"}</p>
            <p className="mt-1 text-3xl font-black tabular-nums text-slate-950">
              {completed}/{total}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-black text-rose-600">{labels?.remaining ?? "还差"}</p>
            <p className="mt-1 text-3xl font-black tabular-nums text-rose-600">{open}</p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-[#663cff] transition-all duration-500" style={{ width: `${percent}%` }} />
        </div>
        {helper ? <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">{helper}</p> : null}
      </div>
    </div>
  );
}

export function WorkbenchProgressNav({
  items,
  labels,
}: {
  items: ProgressItem[];
  labels?: {
    complete: string;
    pending: string;
    optional?: string;
  };
}) {
  return (
    <nav className="mt-4 space-y-2">
      {items.map((item) => {
        const percent = item.total > 0 ? Math.round((item.completed / item.total) * 100) : 100;
        const content = (
          <>
            <span className="flex items-center justify-between gap-3">
              <span className="text-xs font-black text-slate-900">{item.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadge(item.completed, item.total)}`}>
                {item.total === 0
                  ? labels?.optional ?? labels?.complete ?? "选填"
                  : item.completed >= item.total
                    ? labels?.complete ?? "完成"
                    : labels?.pending ?? "待整理"}
              </span>
            </span>
            {item.description ? <span className="mt-1 block text-[11px] font-semibold leading-4 text-slate-500">{item.description}</span> : null}
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full rounded-full bg-[#663cff]" style={{ width: `${percent}%` }} />
            </span>
          </>
        );

        if (item.href) {
          return (
            <Link key={item.label} href={item.href} className="block rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50">
              {content}
            </Link>
          );
        }

        return (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            {content}
          </div>
        );
      })}
    </nav>
  );
}

export function WorkbenchFieldCard({
  id,
  title,
  description,
  status,
  labels,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  status: "complete" | "missing" | "optional";
  labels?: {
    complete: string;
    missing: string;
    optional: string;
  };
  children: ReactNode;
}) {
  const borderClass =
    status === "complete"
      ? "border-emerald-200 bg-emerald-50/20"
      : status === "optional"
        ? "border-slate-200 bg-white"
        : "border-amber-300 bg-amber-50/30";
  const badgeClass =
    status === "complete"
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
      : status === "optional"
        ? "bg-slate-100 text-slate-600"
        : "bg-rose-50 text-rose-600 ring-1 ring-rose-100";
  const badge =
    status === "complete"
      ? labels?.complete ?? "已确认"
      : status === "optional"
        ? labels?.optional ?? "选填"
        : labels?.missing ?? "待补充";

  return (
    <section id={id} className={`scroll-mt-24 rounded-xl border p-4 ${borderClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-slate-950">{title}</h2>
          {description ? <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{description}</p> : null}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-black ${badgeClass}`}>{badge}</span>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
