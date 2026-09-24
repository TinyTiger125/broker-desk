import { cache } from "react";
import {
  getClerkAuthIdentity,
  getClerkAuthSubject,
  getVerifiedClerkAuthIdentity,
} from "@/lib/clerk-auth";
import { getConfiguredAuthProviderId } from "@/lib/auth-mode";
import { getSupabaseAuthIdentity, getVerifiedSupabaseAuthIdentity } from "@/lib/supabase/auth";

/**
 * Provider-neutral identity contract. The local authorization model must only
 * depend on the immutable external subject and verified identity attributes;
 * it must not know whether the subject came from Clerk or Supabase Auth.
 */
export type AuthIdentity = {
  subject: string;
  email?: string;
  name?: string;
};

export type AuthProviderId = "clerk" | "supabase";

export type AuthProviderAdapter = {
  id: AuthProviderId;
  getSubject: () => Promise<string | null>;
  getIdentity: () => Promise<AuthIdentity | null>;
  getVerifiedIdentity: () => Promise<AuthIdentity | null>;
};

const clerkProvider: AuthProviderAdapter = {
  id: "clerk",
  getSubject: async () => getClerkAuthSubject(),
  getIdentity: async () => {
    const identity = await getClerkAuthIdentity();
    return identity ? { subject: identity.subject, email: identity.email, name: identity.name } : null;
  },
  getVerifiedIdentity: async () => {
    const identity = await getVerifiedClerkAuthIdentity();
    return identity ? { subject: identity.subject, email: identity.email, name: identity.name } : null;
  },
};

const supabaseProvider: AuthProviderAdapter = {
  id: "supabase",
  getSubject: async () => (await getSupabaseAuthIdentity())?.subject ?? null,
  getIdentity: getSupabaseAuthIdentity,
  getVerifiedIdentity: getVerifiedSupabaseAuthIdentity,
};

/**
 * Supabase Auth is only selected explicitly. Missing configuration or an
 * invalid session fails closed; it never falls back to Clerk, demo, or a
 * tenant-owner recovery path.
 */
export function getAuthProvider(): AuthProviderAdapter {
  const configured = getConfiguredAuthProviderId();
  if (!configured || configured === "clerk") return clerkProvider;
  if (configured === "supabase") return supabaseProvider;
  throw new Error("unsupported_auth_provider");
}

export const getAuthSubject = cache(async (): Promise<string | null> => getAuthProvider().getSubject());
export const getAuthIdentity = cache(async (): Promise<AuthIdentity | null> => getAuthProvider().getIdentity());
export const getVerifiedAuthIdentity = cache(async (): Promise<AuthIdentity | null> =>
  getAuthProvider().getVerifiedIdentity(),
);
