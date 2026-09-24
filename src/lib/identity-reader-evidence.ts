import type { IdentityReaderUncertainty } from "@/lib/identity-reader-contract";

export function resolveIdentityReaderCandidate(input: {
  existingValue?: string;
  candidateValue: string;
  uncertainty: IdentityReaderUncertainty;
}) {
  const existingValue = (input.existingValue ?? "").replace(/\s+/g, "").toUpperCase();
  const candidateValue = input.candidateValue.replace(/\s+/g, "").toUpperCase();
  const valuesDiffer = Boolean(existingValue && candidateValue && existingValue !== candidateValue);
  const effectiveUncertainty: IdentityReaderUncertainty = valuesDiffer ? "conflict" : input.uncertainty;
  return {
    effectiveUncertainty,
    valuesDiffer,
    reviewScore: effectiveUncertainty === "clear" ? 0.74 : effectiveUncertainty === "unclear" ? 0.46 : 0.24,
  };
}
