export type BrokerDeskAuthMode = "demo" | "trusted_header" | "clerk" | "disabled";

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

export function getAuthMode(): BrokerDeskAuthMode {
  const configured = process.env.BROKER_DESK_AUTH_MODE?.trim().toLowerCase();
  if (configured === "demo" || configured === "trusted_header" || configured === "clerk" || configured === "disabled") {
    return configured;
  }
  return isProductionRuntime() ? "disabled" : "demo";
}

export function isDemoAuthEnabled() {
  if (isProductionRuntime()) return false;
  if (process.env.BROKER_DESK_ENABLE_DEMO_AUTH === "true") return true;
  return getAuthMode() === "demo" && !isProductionRuntime();
}

export function isTrustedHeaderAuthEnabled() {
  return !isProductionRuntime() && getAuthMode() === "trusted_header";
}

export function isClerkAuthEnabled() {
  return getAuthMode() === "clerk";
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
