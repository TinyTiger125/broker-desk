"use client";

import { useUser } from "@clerk/nextjs";

type ClerkAccountLabelProps = {
  fallback: string;
};

export function ClerkAccountLabel({ fallback }: ClerkAccountLabelProps) {
  const { isLoaded, user } = useUser();
  if (!isLoaded) return <>{fallback}</>;

  const label = user?.fullName?.trim()
    || user?.primaryEmailAddress?.emailAddress?.trim()
    || user?.username?.trim()
    || fallback;
  return <>{label}</>;
}
