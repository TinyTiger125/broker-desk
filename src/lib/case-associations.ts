export const CASE_PERSON_ROLES = [
  "主要申请人",
  "承租人",
  "同住人",
  "连带保证人",
  "紧急联系人",
  "出租人／业主",
  "其他关联人",
] as const;

export type CasePersonRole = (typeof CASE_PERSON_ROLES)[number];

export type CaseAssociationParty = {
  partyId: string;
  roles: CasePersonRole[];
};

export type CaseAssociationDraft = {
  parties: CaseAssociationParty[];
  primaryPropertyId?: string;
};

export const CASE_ASSOCIATION_VERSION = 1 as const;
const ASSOCIATION_VERSION_KEY = "__caseAssociationVersion";
const ASSOCIATED_PARTIES_KEY = "__associatedParties";
const PRIMARY_PARTY_KEY = "__primaryPartyId";
const PRIMARY_PROPERTY_KEY = "__primaryPropertyId";

export function isCasePersonRole(value: unknown): value is CasePersonRole {
  return typeof value === "string" && (CASE_PERSON_ROLES as readonly string[]).includes(value);
}

function normalizeRoles(value: unknown): CasePersonRole[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isCasePersonRole))];
}

export function normalizeCaseAssociationDraft(value: unknown): CaseAssociationDraft {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawParties = Array.isArray(source.parties) ? source.parties : [];
  const byParty = new Map<string, CasePersonRole[]>();
  for (const item of rawParties) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const partyId = typeof record.partyId === "string" ? record.partyId.trim() : "";
    const roles = normalizeRoles(record.roles);
    if (partyId && roles.length > 0) byParty.set(partyId, [...new Set([...(byParty.get(partyId) ?? []), ...roles])]);
  }
  const primaryPropertyId = typeof source.primaryPropertyId === "string" && source.primaryPropertyId.trim()
    ? source.primaryPropertyId.trim()
    : undefined;
  return {
    parties: [...byParty.entries()].map(([partyId, roles]) => ({ partyId, roles })),
    primaryPropertyId,
  };
}

export function readCaseAssociationDraft(confirmedData: Record<string, unknown>): CaseAssociationDraft {
  const stored = normalizeCaseAssociationDraft({
    parties: confirmedData[ASSOCIATED_PARTIES_KEY],
    primaryPropertyId: confirmedData[PRIMARY_PROPERTY_KEY],
  });
  if (stored.parties.length > 0 || stored.primaryPropertyId) return stored;
  const legacyPartyId = typeof confirmedData[PRIMARY_PARTY_KEY] === "string" ? confirmedData[PRIMARY_PARTY_KEY].trim() : "";
  const legacyPropertyId = typeof confirmedData[PRIMARY_PROPERTY_KEY] === "string" ? confirmedData[PRIMARY_PROPERTY_KEY].trim() : undefined;
  return {
    parties: legacyPartyId ? [{ partyId: legacyPartyId, roles: ["主要申请人"] }] : [],
    primaryPropertyId: legacyPropertyId,
  };
}

export function validateCaseAssociationDraft(draft: CaseAssociationDraft): string | undefined {
  const primaryApplicants = draft.parties.filter((party) => party.roles.includes("主要申请人"));
  if (primaryApplicants.length > 1) return "一个案件最多只能有一位主要申请人。";
  if (draft.parties.some((party) => party.roles.length === 0 || !party.partyId)) return "人物至少需要一个案件角色。";
  return undefined;
}

export function writeCaseAssociationData(
  confirmedData: Record<string, unknown>,
  draft: CaseAssociationDraft,
  names: { primaryPartyName?: string; propertyName?: string },
): Record<string, unknown> {
  const next = { ...confirmedData };
  next[ASSOCIATION_VERSION_KEY] = CASE_ASSOCIATION_VERSION;
  next[ASSOCIATED_PARTIES_KEY] = draft.parties.map((party) => ({ partyId: party.partyId, roles: [...party.roles] }));
  if (draft.primaryPropertyId) {
    next[PRIMARY_PROPERTY_KEY] = draft.primaryPropertyId;
    if (names.propertyName) next["property.name"] = names.propertyName;
  } else {
    delete next[PRIMARY_PROPERTY_KEY];
    delete next["property.name"];
  }
  const primaryParty = draft.parties.find((party) => party.roles.includes("主要申请人"));
  if (primaryParty) {
    next[PRIMARY_PARTY_KEY] = primaryParty.partyId;
    if (names.primaryPartyName) next["applicant.name"] = names.primaryPartyName;
  } else {
    delete next[PRIMARY_PARTY_KEY];
    delete next["applicant.name"];
  }
  return next;
}

export function getPrimaryPartyId(draft: CaseAssociationDraft): string | undefined {
  return draft.parties.find((party) => party.roles.includes("主要申请人"))?.partyId;
}
