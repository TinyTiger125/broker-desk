"use client";

import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AccountSignOutButtonProps = {
  label: string;
  provider?: "clerk" | "supabase";
};

function ClerkSignOutButton({ label }: { label: string }) {
  const { signOut } = useClerk();

  return (
    <button
      type="button"
      className="app-account-sign-out"
      onClick={() => void signOut({ redirectUrl: "/sign-in" })}
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[17px]">logout</span>
      {label}
    </button>
  );
}

function SupabaseSignOutButton({ label }: { label: string }) {
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
        className="app-account-sign-out disabled:cursor-wait disabled:opacity-60"
        onClick={() => void signOut()}
        disabled={pending}
        aria-busy={pending}
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[17px]">logout</span>
        {pending ? "退出中…" : label}
      </button>
      {error ? <p role="alert" className="text-xs font-semibold text-red-700">退出失败，请重试。</p> : null}
    </div>
  );
}

export function AccountSignOutButton({ label, provider = "clerk" }: AccountSignOutButtonProps) {
  return provider === "supabase" ? <SupabaseSignOutButton label={label} /> : <ClerkSignOutButton label={label} />;
}
