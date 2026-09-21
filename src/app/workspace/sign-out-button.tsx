"use client";

import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
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
  async function signOut() {
    await createSupabaseBrowserClient().auth.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      className="inline-flex min-h-11 items-center justify-center border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 transition hover:bg-slate-50"
    >
      {label}
    </button>
  );
}
