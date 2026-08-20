import { capabilityHasTenantPermission, type TenantCapabilityPreset } from "@/lib/tenant-permissions";
import { isGuaranteeSlice1TenantEnabled } from "@/lib/guarantee-slice1-policy.mjs";

export const GUARANTEE_SLICE1_ENABLED_ENV = "GUARANTEE_G1_SLICE1_ENABLED";
export const GUARANTEE_SLICE1_ALLOWLIST_ENV = "GUARANTEE_G1_SLICE1_TENANT_ALLOWLIST";
export const GUARANTEE_SLICE1_DEPLOYMENT_ENV = "BROKER_DESK_DEPLOYMENT_ENV";

export function isGuaranteeSlice1EnabledForTenant(tenantId: string): boolean {
  return isGuaranteeSlice1TenantEnabled({
    enabled: process.env[GUARANTEE_SLICE1_ENABLED_ENV],
    deploymentEnvironment: process.env[GUARANTEE_SLICE1_DEPLOYMENT_ENV],
    tenantId,
    allowlist: process.env[GUARANTEE_SLICE1_ALLOWLIST_ENV],
  });
}

export function assertGuaranteeSlice1Access(input: { tenantId: string; capability: TenantCapabilityPreset; permission?: "admin" | "member" | "generate" }): void {
  if (!isGuaranteeSlice1EnabledForTenant(input.tenantId)) throw new Error("guarantee_slice1_disabled");
  if (input.permission === "admin" && !capabilityHasTenantPermission(input.capability, "template.edit_draft")) throw new Error("guarantee_template_admin_required");
  if (input.permission === "member" && !capabilityHasTenantPermission(input.capability, "output.preview")) throw new Error("guarantee_output_permission_required");
  if (input.permission === "generate" && !capabilityHasTenantPermission(input.capability, "output.generate_final")) throw new Error("guarantee_output_generate_permission_required");
}
