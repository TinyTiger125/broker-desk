import type { ReactNode } from "react";

type HelpHintProps = {
  id: string;
  label: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const widthClasses = {
  sm: "w-72",
  md: "w-80",
  lg: "w-96",
} as const;

/** A hover/focus-only hint that stays out of document layout. */
export function HelpHint({ id, label, children, size = "sm", className = "" }: HelpHintProps) {
  return (
    <span className={`group relative inline-flex shrink-0 ${className}`}>
      <button type="button" aria-label={label} aria-describedby={id} className="flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-slate-400 text-[11px] font-black text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">?</button>
      <span id={id} role="tooltip" className={`pointer-events-none absolute left-0 top-7 z-30 hidden ${widthClasses[size]} rounded-md border border-slate-300 bg-white p-2 text-xs font-medium leading-5 text-slate-700 shadow-lg group-hover:block group-focus-within:block`}>{children}</span>
    </span>
  );
}
