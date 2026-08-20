"use client";

import { useClerk } from "@clerk/nextjs";

export function WorkspaceSignOutButton({ label }: { label: string }) {
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
