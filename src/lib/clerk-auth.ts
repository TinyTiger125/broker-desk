import { auth, currentUser } from "@clerk/nextjs/server";

export type ClerkAuthIdentity = {
  subject: string;
  email?: string;
  name?: string;
};

export async function getClerkAuthIdentity(): Promise<ClerkAuthIdentity | null> {
  const authState = await auth();
  if (!authState.userId) return null;

  const user = await currentUser();
  const primaryEmail =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress;
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.username || undefined;

  return {
    subject: authState.userId,
    email: primaryEmail?.trim().toLowerCase() || undefined,
    name,
  };
}
