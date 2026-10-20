import type { OpenAiIdentityReaderCandidate } from "@/lib/identity-reader-contract";

export type IdentityReaderAttributionResult = {
  status: "single_applicant" | "ambiguous_applicants" | "no_applicant";
  subjectKey?: string;
  candidates: OpenAiIdentityReaderCandidate[];
};

export type IdentityReaderAttributionScope = "case" | "customer";

function isApplicantLabel(label: string) {
  return /申請人|主要申請人|primary[ _-]?applicant|applicant/i.test(label);
}

function isExplicitNegativeRole(label: string) {
  // The negative insurance role is deliberately bounded so 被保険者 does
  // not match the 保険者 substring.
  return /世帯主|(?<!被)保険者|代理人|代表者|緊急連絡先|扶養者|household[ _-]?head|insurer|agent|representative|emergency[ _-]?contact|dependent|policyholder/i.test(label.trim());
}

function isCustomerHolderLabel(label: string) {
  const normalized = label.trim();
  // These labels identify the person whose identity document is being read.
  // Keep the existing case scope applicant-only; this broader set is only for
  // standalone customer identity intake.
  const positive = /本人|被保険者|カード名義人|document[ _-]?holder|cardholder|insured[ _-]?person|insured|holder/i;
  return positive.test(normalized) && !isExplicitNegativeRole(normalized);
}

function isEligibleCustomerCandidate(label: string) {
  return !isExplicitNegativeRole(label) && (isApplicantLabel(label) || isCustomerHolderLabel(label));
}

export function selectPrimaryIdentityReaderCandidates(
  candidates: OpenAiIdentityReaderCandidate[],
  options: { scope?: IdentityReaderAttributionScope } = {},
): IdentityReaderAttributionResult {
  const scope = options.scope ?? "case";
  const applicantCandidates = candidates.filter((candidate) => {
    if (!candidate.value || candidate.uncertainty === "not_found") return false;
    return scope === "customer"
      ? isEligibleCustomerCandidate(candidate.subjectLabel)
      : isApplicantLabel(candidate.subjectLabel);
  });
  const subjectKeys = [...new Set(applicantCandidates.map((candidate) => candidate.subjectKey))];
  if (subjectKeys.length !== 1) {
    return {
      status: subjectKeys.length === 0 ? "no_applicant" : "ambiguous_applicants",
      candidates: [],
    };
  }
  const subjectKey = subjectKeys[0];
  return {
    status: "single_applicant",
    subjectKey,
    candidates: candidates.filter((candidate) => candidate.subjectKey === subjectKey && (
      scope === "customer"
        ? isEligibleCustomerCandidate(candidate.subjectLabel)
        : isApplicantLabel(candidate.subjectLabel)
    )),
  };
}
