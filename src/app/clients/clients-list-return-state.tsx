"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const RETURN_STATE_PREFIX = "clients:return-state:";

function storageKey(listUrl: string) {
  return `${RETURN_STATE_PREFIX}${listUrl}`;
}

export function ClientsListReturnState({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname() ?? "/clients";
  const searchParams = useSearchParams();
  const currentListUrl = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  useEffect(() => {
    let frame = 0;
    try {
      const raw = window.sessionStorage.getItem(storageKey(currentListUrl));
      const state = raw ? (JSON.parse(raw) as { linkKey?: unknown; scrollY?: unknown }) : undefined;
      if (typeof state?.linkKey !== "string" || !state.linkKey) return undefined;

      frame = window.requestAnimationFrame(() => {
        if (typeof state.scrollY === "number" && Number.isFinite(state.scrollY)) {
          window.scrollTo({ top: state.scrollY, behavior: "auto" });
        }
        const link = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-client-link]") ?? []).find(
          (candidate) => candidate.dataset.clientLink === state.linkKey,
        );
        if (link) link.focus({ preventScroll: true });
        window.sessionStorage.removeItem(storageKey(currentListUrl));
      });
    } catch {
      try {
        window.sessionStorage.removeItem(storageKey(currentListUrl));
      } catch {
        // Returning to the list is an enhancement; storage failures must not block it.
      }
    }

    return () => window.cancelAnimationFrame(frame);
  }, [currentListUrl]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const rememberLink = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLElement>("[data-client-link]");
      if (!link || !root.contains(link)) return;
      const linkKey = link.dataset.clientLink;
      if (!linkKey) return;
      try {
        window.sessionStorage.setItem(
          storageKey(currentListUrl),
          JSON.stringify({ linkKey, scrollY: window.scrollY }),
        );
      } catch {
        // Private browsing must not block normal link navigation.
      }
    };

    root.addEventListener("click", rememberLink);
    return () => root.removeEventListener("click", rememberLink);
  }, [currentListUrl]);

  return <div ref={rootRef}>{children}</div>;
}
