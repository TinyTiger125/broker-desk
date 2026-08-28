import { auth, currentUser } from "@clerk/nextjs/server";
import { cache } from "react";

export type ClerkAuthIdentity = {
  subject: string;
  email?: string;
  name?: string;
};

/**
 * Authentication state is needed by both the application shell and the page
 * being rendered. Keep the inexpensive subject lookup request-scoped so one
 * navigation does not ask Clerk for the same session more than once.
 */
export const getClerkAuthSubject = cache(async (): Promise<string | null> => {
  const authState = await auth();
  return authState.userId ?? null;
});

/**
 * Fetch the Clerk profile only when a local user record must be provisioned.
 * Existing users are resolved by immutable Clerk subject in data.ts.
 */
export const getClerkAuthIdentity = cache(async (): Promise<ClerkAuthIdentity | null> => {
  const subject = await getClerkAuthSubject();
  if (!subject) return null;

  const user = await currentUser();
  const primaryEmail =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress;
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.username || undefined;

  return {
    subject,
    email: primaryEmail?.trim().toLowerCase() || undefined,
    name,
  };
});

/**
 * Invitation binding must use a verified email address. Prefer the verified
 * primary address; if the primary address is not verified, use another
 * verified address only when Clerk explicitly reports one. Never fall back to
 * an unverified address for the membership-binding path.
 */
export const getVerifiedClerkAuthIdentity = cache(async (): Promise<ClerkAuthIdentity | null> => {
  const subject = await getClerkAuthSubject();
  if (!subject) return null;

  const user = await currentUser();
  const primary = user?.emailAddresses.find((item) => item.id === user.primaryEmailAddressId);
  const verified = [primary, ...(user?.emailAddresses ?? [])].find(
    (item) => item?.verification?.status === "verified" && item.emailAddress.trim(),
  );
  if (!verified) return null;

  if (process.env.BROKER_DESK_DEPLOYMENT_ENV === "staging" && process.env.VERCEL_ENV === "preview") {
    const verifiedAddresses = (user?.emailAddresses ?? []).filter((item) => item.verification?.status === "verified");
    console.info("[TASK043_ACCEPT_DIAG]", {
      verifiedEmailPresent: Boolean(verified.emailAddress.trim()),
      verifiedEmailIsPrimary: verified.id === user?.primaryEmailAddressId,
      verifiedEmailCount: verifiedAddresses.length,
    });
  }

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.username || undefined;
  return {
    subject,
    email: verified.emailAddress.trim().toLowerCase(),
    name,
  };
});
