const NON_PRODUCTION_DEPLOYMENTS = new Set(["development", "preview", "staging"]);

/**
 * NODE_ENV describes the Next.js build/runtime mode, not the product
 * qualification state. Preview and staging commonly run with
 * NODE_ENV=production, so tenant activation must use the explicit business
 * deployment marker instead.
 */
export function getTenantDeploymentEnvironment(): string {
  const configured = process.env.BROKER_DESK_DEPLOYMENT_ENV?.trim().toLowerCase();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export function isTenantBootstrapNonProduction(): boolean {
  return NON_PRODUCTION_DEPLOYMENTS.has(getTenantDeploymentEnvironment());
}

export function getTenantBootstrapStatus(): "active" | "pending_activation" {
  return isTenantBootstrapNonProduction() ? "active" : "pending_activation";
}
