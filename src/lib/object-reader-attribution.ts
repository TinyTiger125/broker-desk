import type { ObjectReaderCandidate } from "@/lib/object-reader-contract";

export type ObjectReaderAttributionResult = {
  status: "single_object" | "ambiguous_objects" | "no_object";
  subjectKey?: string;
  candidates: ObjectReaderCandidate[];
};

function isObjectLabel(label: string) {
  return /物件|部屋|property|building|房源|房产|unit|room/i.test(label);
}

/**
 * Lease terms are accepted only when they share the one explicitly identified
 * object group. Multiple objects or a lease-only group fail closed.
 */
export function selectSingleObjectReaderCandidates(
  candidates: ObjectReaderCandidate[],
): ObjectReaderAttributionResult {
  const visibleCandidates = candidates.filter((candidate) => candidate.value && candidate.uncertainty !== "not_found");
  const subjectKeys = [...new Set(visibleCandidates.map((candidate) => candidate.subjectKey))];
  if (subjectKeys.length !== 1) {
    return {
      status: subjectKeys.length === 0 ? "no_object" : "ambiguous_objects",
      candidates: [],
    };
  }
  const subjectKey = subjectKeys[0];
  const propertyIdentityCandidates = visibleCandidates.filter((candidate) =>
    candidate.fieldKey.startsWith("property.") && isObjectLabel(candidate.subjectLabel),
  );
  if (propertyIdentityCandidates.length === 0) {
    return { status: "no_object", candidates: [] };
  }
  return {
    status: "single_object",
    subjectKey,
    candidates: candidates.filter((candidate) => candidate.subjectKey === subjectKey),
  };
}
