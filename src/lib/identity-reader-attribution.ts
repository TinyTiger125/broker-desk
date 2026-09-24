import type { OpenAiIdentityReaderCandidate } from "@/lib/identity-reader-contract";

export type IdentityReaderAttributionResult = {
  status: "single_applicant" | "ambiguous_applicants" | "no_applicant";
  subjectKey?: string;
  candidates: OpenAiIdentityReaderCandidate[];
};

function isApplicantLabel(label: string) {
  return /申請人|主要申請人|primary[ _-]?applicant|applicant/i.test(label);
}

export function selectPrimaryIdentityReaderCandidates(
  candidates: OpenAiIdentityReaderCandidate[],
): IdentityReaderAttributionResult {
  const applicantCandidates = candidates.filter((candidate) =>
    candidate.value && candidate.uncertainty !== "not_found" && isApplicantLabel(candidate.subjectLabel),
  );
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
    candidates: candidates.filter((candidate) => candidate.subjectKey === subjectKey),
  };
}
