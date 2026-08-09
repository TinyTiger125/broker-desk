"use client";

import { useClerk } from "@clerk/nextjs";

type AccountSignOutButtonProps = {
  label: string;
};

export function AccountSignOutButton({ label }: AccountSignOutButtonProps) {
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
