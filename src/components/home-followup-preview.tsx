"use client";

import { Children, useId, useState, type ReactNode } from "react";

export function HomeFollowupPreview({ children, expandLabel, collapseLabel }: {
  children: ReactNode;
  expandLabel: string;
  collapseLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const remainingId = useId();
  const rows = Children.toArray(children);
  const remaining = rows.slice(5);
  return <div className="flex flex-1 flex-col">
    <ul className="divide-y divide-slate-100">{rows.slice(0, 5)}</ul>
    {remaining.length > 0 ? <>
      <ul id={remainingId} hidden={!expanded} className="divide-y divide-slate-100 border-t border-slate-100">{remaining}</ul>
      <button type="button" aria-expanded={expanded} aria-controls={remainingId}
        onClick={() => setExpanded((value) => !value)}
        className="inline-flex min-h-11 items-center rounded-md px-2 pt-3 text-sm font-black text-[#002FA7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#002FA7]" style={{ marginTop: "auto" }}>
        {expanded ? collapseLabel : expandLabel}
      </button>
    </> : null}
  </div>;
}
