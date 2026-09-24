export type TenantRecoveryCode =
  | "user_not_found"
  | "tenant_not_found"
  | "tenant_selection_required"
  | "tenant_forbidden"
  | "permission_denied";

export function getHomeTenantSelectionRecoveryPath(code: TenantRecoveryCode): string | null {
  if (code === "tenant_selection_required") return "/workspace?reason=tenant_selection_required&returnTo=%2F";
  if (code === "tenant_forbidden") return "/workspace?reason=tenant_forbidden&returnTo=%2F";
  return null;
}
