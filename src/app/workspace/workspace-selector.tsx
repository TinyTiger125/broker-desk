"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type WorkspaceOption = {
  tenantId: string;
  name: string;
  accountLabel: string;
  roleLabel: string;
};

type WorkspaceSelectorProps = {
  items: WorkspaceOption[];
  copy: {
    loading: string;
    choose: string;
    error: string;
  };
  returnTo?: string;
};

export function WorkspaceSelector({ items, copy, returnTo = "/" }: WorkspaceSelectorProps) {
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const pendingRef = useRef(false);

  useEffect(() => {
    const blockPendingNavigation = (event: MouseEvent) => {
      if (!pendingRef.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target.toLowerCase() === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === "/workspace") return;
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("click", blockPendingNavigation, true);
    return () => {
      window.removeEventListener("click", blockPendingNavigation, true);
    };
  }, []);

  const chooseWorkspace = useCallback(
    async (tenantId: string) => {
      setError("");
      pendingRef.current = true;
      setPendingTenantId(tenantId);
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch("/api/workspace", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tenantId }),
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const result = (await response.json()) as { ok?: boolean };
        if (!response.ok || !result.ok) throw new Error("workspace_selection_failed");
        // The response has already persisted the tenant cookie. The pending
        // navigation guard keeps this selector mounted until this complete
        // navigation reads the cookie on the next server render.
        window.location.replace(returnTo);
      } catch {
        pendingRef.current = false;
        setPendingTenantId(null);
        setError(copy.error);
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    [copy.error, returnTo],
  );

  return (
    <div className="grid gap-3">
      {items.map((item) => {
        const pending = pendingTenantId === item.tenantId;
        return (
          <button
            key={item.tenantId}
            type="button"
            onClick={() => void chooseWorkspace(item.tenantId)}
            disabled={pendingTenantId !== null}
            className="grid min-h-24 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border border-slate-200 bg-white px-5 py-4 text-left transition hover:border-[#1960a3] hover:bg-[#f4f8ff] disabled:cursor-wait disabled:opacity-70"
          >
            <span className="min-w-0">
              <span className="block truncate text-base font-black text-slate-950">{item.name}</span>
              <span className="mt-1 block text-sm text-slate-600">{item.accountLabel}</span>
            </span>
            <span className="inline-flex min-w-20 items-center justify-center border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">
              {pending ? copy.loading : item.roleLabel}
            </span>
          </button>
        );
      })}
      {error ? <p role="alert" className="text-sm font-semibold text-rose-700">{error}</p> : null}
      <p className="mt-1 text-sm text-slate-500">{copy.choose}</p>
    </div>
  );
}
