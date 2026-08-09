type KpiCardProps = {
  label: string;
  value: number;
  hint?: string;
};

export function KpiCard({ label, value, hint }: KpiCardProps) {
  return (
    <article className="bd-kpi p-5">
      <p className="card-title-stable text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-4xl font-bold tracking-tight text-slate-900">{value}</p>
      {hint ? <p className="card-subtitle-stable mt-2 text-xs text-slate-500">{hint}</p> : null}
    </article>
  );
}
