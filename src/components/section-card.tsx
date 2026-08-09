import { ReactNode } from "react";

type SectionCardProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function SectionCard({ title, subtitle, children }: SectionCardProps) {
  return (
    <section className="bd-section p-4 sm:p-5">
      <header className="mb-4 flex flex-col items-start justify-between gap-2 sm:flex-row sm:gap-4">
        <h2 className="card-title-stable text-base font-bold tracking-tight text-slate-900">{title}</h2>
        {subtitle ? <p className="card-subtitle-stable max-w-full text-xs text-slate-500 sm:max-w-[52%]">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}
