const STAGING_ALLOWLIST_DEPLOYMENTS = new Set(["preview", "staging"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized && EMAIL_PATTERN.test(normalized) ? normalized : null;
}

function configuredDeploymentEnvironment(): string {
  return process.env.BROKER_DESK_DEPLOYMENT_ENV?.trim().toLowerCase() ?? "";
}

export function isStagingAllowlistEnforced(deploymentEnvironment = configuredDeploymentEnvironment()): boolean {
  return STAGING_ALLOWLIST_DEPLOYMENTS.has(deploymentEnvironment.trim().toLowerCase());
}

/**
 * The allowlist is intentionally a server-only, comma-separated setting. A
 * malformed entry invalidates the complete list so an operator cannot
 * accidentally open the staging boundary with a typo.
 */
export function isEmailOnStagingAllowlist(
  email: string | undefined,
  allowlist = process.env.BROKER_DESK_STAGING_AUTH_ALLOWLIST ?? "",
): boolean {
  const normalizedEmail = normalizeEmail(email);
  const entries = allowlist
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (!normalizedEmail || entries.length === 0 || entries.some((entry) => !EMAIL_PATTERN.test(entry))) {
    return false;
  }

  return entries.includes(normalizedEmail);
}
