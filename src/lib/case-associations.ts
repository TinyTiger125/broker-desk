import type { Locale } from "@/lib/locale";

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

export const CASE_PERSON_ROLE_LABELS: Record<Locale, Record<CasePersonRole, string>> = {
  ja: {
    "主要申请人": "主たる申込人",
    "承租人": "賃借人",
    "同住人": "同居人",
    "连带保证人": "連帯保証人",
    "紧急联系人": "緊急連絡先",
    "出租人／业主": "貸主／所有者",
    "其他关联人": "その他の関係者",
  },
  zh: {
    "主要申请人": "主要申请人",
    "承租人": "承租人",
    "同住人": "同住人",
    "连带保证人": "连带保证人",
    "紧急联系人": "紧急联系人",
    "出租人／业主": "出租人／业主",
    "其他关联人": "其他关联人",
  },
  ko: {
    "主要申请人": "주요 신청인",
    "承租人": "임차인",
    "同住人": "동거인",
    "连带保证人": "연대보증인",
    "紧急联系人": "긴급 연락처",
    "出租人／业主": "임대인／소유자",
    "其他关联人": "기타 관계자",
  },
};

export function getCasePersonRoleLabel(locale: Locale, role: CasePersonRole) {
  return CASE_PERSON_ROLE_LABELS[locale][role];
}

const CASE_ASSOCIATION_ERROR_MESSAGES: Record<string, Record<Locale, string>> = {
  "案件草稿格式不正确，请重新选择资料。": {
    ja: "案件草稿の形式が正しくありません。資料を選び直してください。",
    zh: "案件草稿格式不正确，请重新选择资料。",
    ko: "안건 초안 형식이 올바르지 않습니다. 자료를 다시 선택해 주세요.",
  },
  "案件资料草稿格式不正确，请重新操作。": {
    ja: "案件資料の下書き形式が正しくありません。もう一度お試しください。",
    zh: "案件资料草稿格式不正确，请重新操作。",
    ko: "안건 자료 초안 형식이 올바르지 않습니다. 다시 시도해 주세요.",
  },
  "一个案件最多只能有一位主要申请人。": {
    ja: "1案件につき、主たる申込人は1名までです。",
    zh: "一个案件最多只能有一位主要申请人。",
    ko: "하나의 안건에는 주요 신청인을 한 명만 지정할 수 있습니다.",
  },
  "人物至少需要一个案件角色。": {
    ja: "人物には案件内の役割を1つ以上指定してください。",
    zh: "人物至少需要一个案件角色。",
    ko: "관계자에게는 하나 이상의 안건 역할이 필요합니다.",
  },
  "选择的人物不存在或当前用户无法使用。": {
    ja: "選択した人物が存在しないか、利用する権限がありません。",
    zh: "选择的人物不存在或当前用户无法使用。",
    ko: "선택한 관계자가 없거나 현재 사용자가 사용할 수 없습니다.",
  },
  "选择的物件不存在或当前用户无法使用。": {
    ja: "選択した物件が存在しないか、利用する権限がありません。",
    zh: "选择的物件不存在或当前用户无法使用。",
    ko: "선택한 매물이 없거나 현재 사용자가 사용할 수 없습니다.",
  },
  "案件保存失败，请保留当前草稿后重试。": {
    ja: "案件を保存できませんでした。現在の草稿を残したまま、もう一度お試しください。",
    zh: "案件保存失败，请保留当前草稿后重试。",
    ko: "안건을 저장하지 못했습니다. 현재 초안을 유지한 채 다시 시도해 주세요.",
  },
  "案件が見つからないか、保存できませんでした。": {
    ja: "案件が見つからないか、保存できませんでした。",
    zh: "未找到案件，或案件无法保存。",
    ko: "안건을 찾을 수 없거나 저장하지 못했습니다.",
  },
};

const CASE_ASSOCIATION_ERROR_FALLBACKS: Record<Locale, string> = {
  ja: "案件の処理中に問題が発生しました。入力内容を確認して、もう一度お試しください。",
  zh: "处理案件时发生问题，请确认输入内容后重试。",
  ko: "안건 처리 중 문제가 발생했습니다. 입력 내용을 확인한 후 다시 시도해 주세요.",
};

export function localizeCaseAssociationError(locale: Locale, message: string | undefined, fallback: string) {
  if (!message) return fallback;
  return CASE_ASSOCIATION_ERROR_MESSAGES[message]?.[locale] ?? CASE_ASSOCIATION_ERROR_FALLBACKS[locale];
}

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
