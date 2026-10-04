export type GuaranteeApplicationRecoveryAction = "retry_preview" | "select_template" | "refresh_generation" | "none";

export function getGuaranteeApplicationRecoveryAction(code: string): GuaranteeApplicationRecoveryAction {
  if (code === "generation_in_progress") return "refresh_generation";
  if (["generation_confirmation_not_found", "preview_confirmation_expired", "preview_confirmation_required", "preview_stale"].includes(code)) {
    return "retry_preview";
  }
  if (["blank_form_unavailable", "mask_match_not_exact", "mask_test_version_not_found", "mask_version_not_found"].includes(code)) {
    return "select_template";
  }
  return "none";
}
