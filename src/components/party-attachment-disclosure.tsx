"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type PartyAttachmentDisclosureProps = {
  label: string;
  initialOpen?: boolean;
  children: ReactNode;
};

export function PartyAttachmentDisclosure({ label, initialOpen = false, children }: PartyAttachmentDisclosureProps) {
  const [open, setOpen] = useState(initialOpen);
  const disclosureRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) summaryRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(true);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!disclosureRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [close, open]);

  return (
    <details ref={disclosureRef} open={open} className="group relative z-20 shrink-0" data-party-attachment-disclosure="true">
      <summary
        ref={summaryRef}
        aria-controls="object-attachments"
        aria-expanded={open}
        className="flex cursor-pointer list-none items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 [&::-webkit-details-marker]:hidden hover:border-blue-400 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]"
        onClick={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}
      >
        <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[16px] transition-transform group-open:rotate-90 motion-reduce:transition-none">chevron_right</span>
        {label}
      </summary>
      <div className="absolute left-0 top-full mt-3 w-[min(42rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]">
        {children}
      </div>
    </details>
  );
}
