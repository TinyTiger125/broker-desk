export type TenantRecoveryCode =
  | "user_not_found"
  | "tenant_not_found"
  | "tenant_selection_required"
  | "tenant_forbidden"
  | "permission_denied";

export function getHomeTenantSelectionRecoveryPath(code: TenantRecoveryCode): string | null {
  return code === "tenant_selection_required"
    ? "/workspace?reason=tenant_selection_required&returnTo=%2F"
    : null;
}
