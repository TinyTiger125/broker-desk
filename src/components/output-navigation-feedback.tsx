"use client";

import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

export function OutputNavigationFeedback({ children, pendingLabel }: { children: ReactNode; pendingLabel: string }) {
  const { pending } = useLinkStatus();

  return (
    <span className="contents" aria-busy={pending || undefined}>
      {children}
      {pending ? (
        <span className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white/95 px-3 text-sm font-black text-[#002FA7]" role="status" aria-live="polite">
          <span aria-hidden="true" className="material-symbols-outlined animate-spin motion-reduce:animate-none">progress_activity</span>
          {pendingLabel}
        </span>
      ) : null}
    </span>
  );
}
