export type CaseWorkbenchAssistantFieldState =
  | "confirmed"
  | "edited"
  | "ai_suggested"
  | "needs_review"
  | "missing"
  | "conflict"
  | "rejected"
  | "unknown"
  | "not_applicable";

export type CaseWorkbenchAssistantMode = "conflict" | "candidate" | "missing" | "ready";

export type CaseWorkbenchAssistantField = {
  state: CaseWorkbenchAssistantFieldState;
  required: boolean;
};

export type CaseWorkbenchAssistantDecision<T extends CaseWorkbenchAssistantField> = {
  mode: CaseWorkbenchAssistantMode;
  nextField: T | undefined;
  openCount: number;
  conflictCount: number;
  candidateCount: number;
  missingRequiredCount: number;
};

export function getCaseWorkbenchAssistantDecision<T extends CaseWorkbenchAssistantField>(
  openFields: readonly T[],
): CaseWorkbenchAssistantDecision<T> {
  const conflictFields = openFields.filter((field) => field.state === "conflict");
  const candidateFields = openFields.filter(
    (field) => field.state === "ai_suggested" || field.state === "needs_review" || field.state === "unknown",
  );
  const missingRequiredFields = openFields.filter((field) => field.required && field.state === "missing");
  const nextField = conflictFields[0] ?? candidateFields[0] ?? missingRequiredFields[0] ?? openFields[0];
  const mode = conflictFields.length > 0 ? "conflict" : candidateFields.length > 0 ? "candidate" : missingRequiredFields.length > 0 ? "missing" : "ready";

  return {
    mode,
    nextField,
    openCount: openFields.length,
    conflictCount: conflictFields.length,
    candidateCount: candidateFields.length,
    missingRequiredCount: missingRequiredFields.length,
  };
}
