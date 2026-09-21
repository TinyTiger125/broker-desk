export type BrokerDeskAuthMode = "demo" | "trusted_header" | "clerk" | "supabase" | "disabled";
export type ExternalAuthProviderId = "clerk" | "supabase";

export type TrustedHeaderAuthIdentity = {
  subject: string;
  email?: string;
  name?: string;
};

export type TrustedHeaderAuthResult =
  | { ok: true; identity: TrustedHeaderAuthIdentity }
  | {
      ok: false;
      error:
        | "trusted_header_auth_disabled"
        | "trusted_header_secret_not_configured"
        | "trusted_header_secret_invalid"
        | "trusted_header_subject_missing";
    };

const DEFAULT_SUBJECT_HEADER = "x-brokerdesk-auth-subject";
const DEFAULT_EMAIL_HEADER = "x-brokerdesk-auth-email";
const DEFAULT_NAME_HEADER = "x-brokerdesk-auth-name";
const DEFAULT_SECRET_HEADER = "x-brokerdesk-auth-secret";

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

export function resolveBrokerDeskAuthMode(input: {
  configuredMode?: string;
  configuredProvider?: string;
  clerkConfigured?: boolean;
}): BrokerDeskAuthMode {
  const configured = input.configuredMode?.trim().toLowerCase();
  const provider = input.configuredProvider?.trim().toLowerCase();
  if (provider && provider !== "clerk" && provider !== "supabase") {
    throw new Error("unsupported_auth_provider");
  }
  if (
    configured &&
    configured !== "demo" &&
    configured !== "trusted_header" &&
    configured !== "clerk" &&
    configured !== "supabase" &&
    configured !== "disabled"
  ) {
    throw new Error("unsupported_auth_mode");
  }
  if (
    configured === "demo" ||
    configured === "trusted_header" ||
    configured === "clerk" ||
    configured === "supabase" ||
    configured === "disabled"
  ) {
    if (provider && configured && configured !== provider) {
      throw new Error("auth_mode_provider_mismatch");
    }
    return configured;
  }
  if (provider === "supabase") return "supabase";
  if (provider === "clerk") return "clerk";
  // A real Clerk configuration is sufficient to opt into the real account path.
  // Demo access must always be chosen explicitly so a copied checkout cannot
  // silently expose a workspace without authentication.
  if (input.clerkConfigured) return "clerk";
  return "disabled";
}

export function getAuthMode(): BrokerDeskAuthMode {
  return resolveBrokerDeskAuthMode({
    configuredMode: process.env.BROKER_DESK_AUTH_MODE,
    configuredProvider: process.env.BROKER_DESK_AUTH_PROVIDER,
    clerkConfigured: isClerkAuthConfigured(),
  });
}

export function isDemoAuthEnabled() {
  return !isProductionRuntime() && getAuthMode() === "demo";
}

export function isTrustedHeaderAuthEnabled() {
  return !isProductionRuntime() && getAuthMode() === "trusted_header";
}

export function isClerkAuthEnabled() {
  return getAuthMode() === "clerk";
}

export function isSupabaseAuthEnabled() {
  return getAuthMode() === "supabase";
}

export function isExternalAuthEnabled() {
  const mode = getAuthMode();
  return mode === "clerk" || mode === "supabase";
}

export function getConfiguredAuthProviderId(): ExternalAuthProviderId | null {
  const mode = getAuthMode();
  return mode === "clerk" || mode === "supabase" ? mode : null;
}

export function isClerkAuthConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
      process.env.CLERK_SECRET_KEY?.trim(),
  );
}

export function getTrustedHeaderAuthConfig() {
  return {
    subjectHeader: process.env.BROKER_DESK_AUTH_SUBJECT_HEADER?.trim().toLowerCase() || DEFAULT_SUBJECT_HEADER,
    emailHeader: process.env.BROKER_DESK_AUTH_EMAIL_HEADER?.trim().toLowerCase() || DEFAULT_EMAIL_HEADER,
    nameHeader: process.env.BROKER_DESK_AUTH_NAME_HEADER?.trim().toLowerCase() || DEFAULT_NAME_HEADER,
    secretHeader: process.env.BROKER_DESK_AUTH_SECRET_HEADER?.trim().toLowerCase() || DEFAULT_SECRET_HEADER,
    secret: process.env.BROKER_DESK_AUTH_TRUSTED_HEADER_SECRET?.trim() || "",
  };
}

export function readTrustedHeaderAuthIdentity(headerStore: Pick<Headers, "get">): TrustedHeaderAuthResult {
  if (!isTrustedHeaderAuthEnabled()) {
    return { ok: false, error: "trusted_header_auth_disabled" };
  }

  const config = getTrustedHeaderAuthConfig();
  if (!config.secret) {
    return { ok: false, error: "trusted_header_secret_not_configured" };
  }

  const presentedSecret = headerStore.get(config.secretHeader)?.trim();
  if (!presentedSecret || presentedSecret !== config.secret) {
    return { ok: false, error: "trusted_header_secret_invalid" };
  }

  const subject = headerStore.get(config.subjectHeader)?.trim();
  if (!subject) {
    return { ok: false, error: "trusted_header_subject_missing" };
  }

  return {
    ok: true,
    identity: {
      subject,
      email: headerStore.get(config.emailHeader)?.trim() || undefined,
      name: headerStore.get(config.nameHeader)?.trim() || undefined,
    },
  };
}
