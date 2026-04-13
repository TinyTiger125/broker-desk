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

export const PURPOSES = ["self_use", "investment"] as const;
export type Purpose = (typeof PURPOSES)[number];

export const TEMPERATURES = ["high", "medium", "low"] as const;
export type Temperature = (typeof TEMPERATURES)[number];

export const BUDGET_TYPES = ["total_price", "monthly_payment"] as const;
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
  return (PURPOSES as readonly string[]).includes(value);
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
