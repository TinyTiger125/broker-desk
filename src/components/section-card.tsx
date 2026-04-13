import { ReactNode } from "react";

type SectionCardProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function SectionCard({ title, subtitle, children }: SectionCardProps) {
  return (
    <section className="rounded-xl bg-white p-4 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/35 sm:p-5">
      <header className="mb-4 flex flex-col items-start justify-between gap-2 sm:flex-row sm:gap-4">
        <h2 className="card-title-stable text-base font-bold tracking-tight text-slate-900">{title}</h2>
        {subtitle ? <p className="card-subtitle-stable max-w-full text-xs text-slate-500 sm:max-w-[52%]">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}
