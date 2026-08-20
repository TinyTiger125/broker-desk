"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  createTenantForCurrentUserFormAction,
  type CreateTenantActionState,
} from "@/app/actions";

type CreateWorkspaceFormProps = {
  initialIdempotencyKey: string;
  nameLabel: string;
  submitLabel: string;
  pendingLabel: string;
  cancelLabel: string;
};

export function CreateWorkspaceForm({
  initialIdempotencyKey,
  nameLabel,
  submitLabel,
  pendingLabel,
  cancelLabel,
}: CreateWorkspaceFormProps) {
  const [name, setName] = useState("");
  const [requestId, setRequestId] = useState(initialIdempotencyKey);
  const [state, formAction, pending] = useActionState<CreateTenantActionState, FormData>(
    createTenantForCurrentUserFormAction,
    { status: "idle" },
  );

  // Keep the operation key in the URL so a reload after a lost response can
  // retry the same server-side request instead of creating a second company.
  useEffect(() => {
    const url = new URL(window.location.href);
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const reuseFromReload = navigation?.type === "reload" && url.searchParams.has("requestId");
    const nextRequestId = reuseFromReload ? url.searchParams.get("requestId")! : crypto.randomUUID();
    queueMicrotask(() => setRequestId(nextRequestId));
    if (url.searchParams.get("requestId") !== nextRequestId) {
      url.searchParams.set("requestId", nextRequestId);
      window.history.replaceState(null, "", url);
    }
  }, [initialIdempotencyKey]);

  useEffect(() => {
    if (!state.resetRequestKey) return;
    const nextRequestId = crypto.randomUUID();
    const url = new URL(window.location.href);
    url.searchParams.set("requestId", nextRequestId);
    queueMicrotask(() => setRequestId(nextRequestId));
    window.history.replaceState(null, "", url);
  }, [state.resetRequestKey]);

  return (
    <form action={formAction} className="mt-8 grid gap-3" aria-busy={pending}>
      <input type="hidden" name="idempotencyKey" value={requestId} readOnly />
      <label className="grid gap-2 text-sm font-bold text-slate-800">
        {nameLabel}
        <input
          name="name"
          required
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={pending}
          className="min-h-11 rounded border border-slate-300 px-3 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
        />
      </label>
      {state.status === "error" ? (
        <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.message}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? pendingLabel : submitLabel}
        </button>
        <Link
          href="/workspace"
          className="inline-flex min-h-11 items-center border border-slate-300 px-4 text-sm font-bold text-slate-900 hover:bg-slate-50"
        >
          {cancelLabel}
        </Link>
      </div>
    </form>
  );
}
