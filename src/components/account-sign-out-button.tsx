"use client";

import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
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
  async function signOut() {
    await createSupabaseBrowserClient().auth.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <button
      type="button"
      className="app-account-sign-out"
      onClick={() => void signOut()}
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[17px]">logout</span>
      {label}
    </button>
  );
}

export function AccountSignOutButton({ label, provider = "clerk" }: AccountSignOutButtonProps) {
  return provider === "supabase" ? <SupabaseSignOutButton label={label} /> : <ClerkSignOutButton label={label} />;
}
