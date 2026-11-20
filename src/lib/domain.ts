export const CLIENT_STAGES = [
  "lead",
  "contacted",
  "quoted",
  "viewing",
  "negotiating",
  "won",
  "lost",
] as const;

export type ClientStage = (typeof CLIENT_STAGES)[number];

export const PURPOSES = ["unspecified", "sale_residential", "sale_investment", "rent_residential", "rent_tenant", "rent_monthly"] as const;
export const LEGACY_PURPOSES = ["self_use", "investment"] as const;
export type Purpose = (typeof PURPOSES)[number] | (typeof LEGACY_PURPOSES)[number];

export const TEMPERATURES = ["unspecified", "high", "medium", "low"] as const;
export type Temperature = (typeof TEMPERATURES)[number];

export const BUDGET_TYPES = ["total_price", "monthly_payment", "monthly_rent"] as const;
export type BudgetType = (typeof BUDGET_TYPES)[number];

export const LOAN_PREAPPROVAL_STATUSES = ["not_applied", "screening", "approved", "rejected"] as const;
export type LoanPreApprovalStatus = (typeof LOAN_PREAPPROVAL_STATUSES)[number];

export const BROKERAGE_CONTRACT_TYPES = ["none", "general", "exclusive", "exclusive_exclusive"] as const;
export type BrokerageContractType = (typeof BROKERAGE_CONTRACT_TYPES)[number];

export const AML_CHECK_STATUSES = ["not_required", "pending", "verified", "reported"] as const;
export type AmlCheckStatus = (typeof AML_CHECK_STATUSES)[number];

export const FOLLOWUP_TYPES = ["call", "line", "email", "viewing", "meeting", "note"] as const;
export type FollowUpType = (typeof FOLLOWUP_TYPES)[number];

export const QUOTE_STATUSES = ["draft", "sent", "revised"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const TASK_STATUSES = ["pending", "done", "canceled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export function isClientStage(value: string): value is ClientStage {
  return (CLIENT_STAGES as readonly string[]).includes(value);
}

export function isPurpose(value: string): value is Purpose {
  return [...PURPOSES, ...LEGACY_PURPOSES].includes(value as Purpose);
}

export type CurrentPurpose = (typeof PURPOSES)[number];

export type EditablePurposeResolution = {
  value: Purpose;
  error: boolean;
  preservedLegacy: boolean;
};

/**
 * Resolve the purpose submitted by the current form without allowing a
 * browser-provided legacy value to become a new classification. On edit, an
 * untouched or omitted field keeps the tenant-owned value; only the current
 * six-value set can be an explicit replacement.
 */
export function resolveEditablePurpose(
  submittedValue: string,
  mode: "create" | "edit",
  authoritativeValue?: string,
  explicitlyTouched = false,
): EditablePurposeResolution {
  const submitted = submittedValue.trim();
  const authoritative = authoritativeValue?.trim() ?? "";
  const authoritativePurpose = isPurpose(authoritative) ? authoritative : undefined;
  const authoritativeIsLegacy = Boolean(authoritativePurpose && (LEGACY_PURPOSES as readonly string[]).includes(authoritativePurpose));

  if (mode === "edit" && authoritativeValue && !authoritativePurpose) {
    return { value: "unspecified", error: true, preservedLegacy: false };
  }

  if (mode === "edit" && authoritativePurpose && !explicitlyTouched) {
    return { value: authoritativePurpose, error: false, preservedLegacy: authoritativeIsLegacy };
  }

  if (mode === "edit" && authoritativePurpose && explicitlyTouched && !submitted) {
    return { value: authoritativePurpose, error: true, preservedLegacy: authoritativeIsLegacy };
  }

  if (mode === "edit" && authoritativePurpose && submitted === authoritativePurpose && authoritativeIsLegacy) {
    return { value: authoritativePurpose, error: false, preservedLegacy: true };
  }

  if (!submitted) {
    return { value: "unspecified", error: false, preservedLegacy: false };
  }

  if ((PURPOSES as readonly string[]).includes(submitted)) {
    return { value: submitted as CurrentPurpose, error: false, preservedLegacy: false };
  }

  // Legacy values remain readable in existing records, but they cannot be
  // forged into a new or different edit through browser payloads.
  return { value: authoritativePurpose ?? "unspecified", error: true, preservedLegacy: false };
}

export function isTemperature(value: string): value is Temperature {
  return (TEMPERATURES as readonly string[]).includes(value);
}

export function isQuoteStatus(value: string): value is QuoteStatus {
  return (QUOTE_STATUSES as readonly string[]).includes(value);
}

export function isBudgetType(value: string): value is BudgetType {
  return (BUDGET_TYPES as readonly string[]).includes(value);
}

export function isLoanPreApprovalStatus(value: string): value is LoanPreApprovalStatus {
  return (LOAN_PREAPPROVAL_STATUSES as readonly string[]).includes(value);
}

export function isBrokerageContractType(value: string): value is BrokerageContractType {
  return (BROKERAGE_CONTRACT_TYPES as readonly string[]).includes(value);
}

export function isAmlCheckStatus(value: string): value is AmlCheckStatus {
  return (AML_CHECK_STATUSES as readonly string[]).includes(value);
}
