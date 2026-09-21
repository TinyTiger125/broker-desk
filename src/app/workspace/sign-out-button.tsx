"use client";

import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function WorkspaceSignOutButton({ label, provider = "clerk" }: { label: string; provider?: "clerk" | "supabase" }) {
  return provider === "supabase" ? <SupabaseWorkspaceSignOutButton label={label} /> : <ClerkWorkspaceSignOutButton label={label} />;
}

function ClerkWorkspaceSignOutButton({ label }: { label: string }) {
  const { signOut } = useClerk();
  return (
    <button
      type="button"
      onClick={() => signOut({ redirectUrl: "/sign-in" })}
      className="inline-flex min-h-11 items-center justify-center border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 transition hover:bg-slate-50"
    >
      {label}
    </button>
  );
}

function SupabaseWorkspaceSignOutButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function signOut() {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      const { error: signOutError } = await createSupabaseBrowserClient().auth.signOut();
      if (!signOutError) {
        router.push("/sign-in");
        router.refresh();
        return;
      }
      setError(true);
      setPending(false);
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <div className="grid gap-1">
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={pending}
        aria-busy={pending}
        className="inline-flex min-h-11 items-center justify-center border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "退出中…" : label}
      </button>
      {error ? <p role="alert" className="text-xs font-semibold text-red-700">退出失败，请重试。</p> : null}
    </div>
  );
}
