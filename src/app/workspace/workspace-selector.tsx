"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
};

export function WorkspaceSelector({ items, copy }: WorkspaceSelectorProps) {
  const router = useRouter();
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const chooseWorkspace = useCallback(
    async (tenantId: string) => {
      setError("");
      setPendingTenantId(tenantId);
      try {
        const response = await fetch("/api/workspace", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tenantId }),
        });
        if (!response.ok) throw new Error("workspace_selection_failed");
        router.push("/");
        router.refresh();
      } catch {
        setPendingTenantId(null);
        setError(copy.error);
      }
    },
    [copy.error, router],
  );

  useEffect(() => {
    if (items.length === 1) void chooseWorkspace(items[0].tenantId);
  }, [chooseWorkspace, items]);

  if (items.length === 1) {
    return <p className="text-sm text-slate-600">{copy.loading}</p>;
  }

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
