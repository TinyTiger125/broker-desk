import type { Purpose } from "@/lib/domain";
import type { Locale } from "@/lib/locale";

export const PARTY_PROFILE_TYPES = ["individual", "corporate"] as const;
export type PartyProfileType = (typeof PARTY_PROFILE_TYPES)[number];

export const PARTY_PROFILE_ROLES = [
  "applicant",
  "tenant",
  "co_occupant",
  "emergency_contact",
  "guarantor",
  "owner",
  "landlord",
  "buyer",
  "seller",
  "broker_company",
  "management_company",
  "other",
] as const;
export type PartyProfileRole = (typeof PARTY_PROFILE_ROLES)[number];

export type PartyProfileMeta = {
  type?: PartyProfileType;
  role?: PartyProfileRole;
  status?: "draft" | "active";
};

const typeLabels: Record<Locale, Record<PartyProfileType, string>> = {
  ja: {
    individual: "個人",
    corporate: "法人/会社",
  },
  zh: {
    individual: "个人",
    corporate: "法人/公司",
  },
  ko: {
    individual: "개인",
    corporate: "법인/회사",
  },
};

const roleLabels: Record<Locale, Record<PartyProfileRole, string>> = {
  ja: {
    applicant: "申込者",
    tenant: "入居者",
    co_occupant: "同居人",
    emergency_contact: "緊急連絡先",
    guarantor: "連帯保証人",
    owner: "所有者",
    landlord: "貸主",
    buyer: "買主",
    seller: "売主",
    broker_company: "仲介会社",
    management_company: "管理会社",
    other: "その他",
  },
  zh: {
    applicant: "申请人",
    tenant: "租客/入居者",
    co_occupant: "同住人",
    emergency_contact: "紧急联系人",
    guarantor: "连带保证人",
    owner: "所有者",
    landlord: "房东/出租方",
    buyer: "买方",
    seller: "卖方",
    broker_company: "仲介公司",
    management_company: "管理公司",
    other: "其他",
  },
  ko: {
    applicant: "신청자",
    tenant: "입주자",
    co_occupant: "동거인",
    emergency_contact: "긴급 연락처",
    guarantor: "연대 보증인",
    owner: "소유자",
    landlord: "임대인",
    buyer: "매수인",
    seller: "매도인",
    broker_company: "중개 회사",
    management_company: "관리 회사",
    other: "기타",
  },
};

const statusLabels: Record<Locale, Record<NonNullable<PartyProfileMeta["status"]>, string>> = {
  ja: {
    draft: "作成中",
    active: "正式",
  },
  zh: {
    draft: "建档中",
    active: "正式",
  },
  ko: {
    draft: "작성 중",
    active: "정식",
  },
};

const labelKeys = {
  type: {
    ja: "関係者種別",
    zh: "主体类型",
    ko: "관계자 유형",
  },
  role: {
    ja: "役割",
    zh: "主体角色",
    ko: "역할",
  },
  status: {
    ja: "作成状態",
    zh: "建档状态",
    ko: "작성 상태",
  },
  note: {
    ja: "備考",
    zh: "备注",
    ko: "메모",
  },
} as const;

export function isPartyProfileType(value: string): value is PartyProfileType {
  return (PARTY_PROFILE_TYPES as readonly string[]).includes(value);
}

export function isPartyProfileRole(value: string): value is PartyProfileRole {
  return (PARTY_PROFILE_ROLES as readonly string[]).includes(value);
}

export function getPartyProfileTypeLabel(type: PartyProfileType, locale: Locale): string {
  return typeLabels[locale][type];
}

export function getPartyProfileRoleLabel(role: PartyProfileRole, locale: Locale): string {
  return roleLabels[locale][role];
}

export function getPartyProfileStatusLabel(status: NonNullable<PartyProfileMeta["status"]>, locale: Locale): string {
  return statusLabels[locale][status];
}

export function getPartyProfileTypeOptions(locale: Locale) {
  return PARTY_PROFILE_TYPES.map((value) => ({ value, label: getPartyProfileTypeLabel(value, locale) }));
}

export function getPartyProfileRoleOptions(locale: Locale) {
  return PARTY_PROFILE_ROLES.map((value) => ({ value, label: getPartyProfileRoleLabel(value, locale) }));
}

export function inferPurposeFromPartyRole(role: PartyProfileRole): Purpose {
  if (role === "buyer" || role === "owner" || role === "seller" || role === "landlord") {
    return "investment";
  }
  return "self_use";
}

function findTypeByLabel(value: string): PartyProfileType | undefined {
  const trimmed = value.trim();
  for (const locale of ["ja", "zh", "ko"] as const) {
    for (const type of PARTY_PROFILE_TYPES) {
      if (typeLabels[locale][type] === trimmed) return type;
    }
  }
  return undefined;
}

function findRoleByLabel(value: string): PartyProfileRole | undefined {
  const trimmed = value.trim();
  for (const locale of ["ja", "zh", "ko"] as const) {
    for (const role of PARTY_PROFILE_ROLES) {
      if (roleLabels[locale][role] === trimmed) return role;
    }
  }
  return undefined;
}

function findStatusByLabel(value: string): PartyProfileMeta["status"] {
  const trimmed = value.trim();
  for (const locale of ["ja", "zh", "ko"] as const) {
    for (const status of ["draft", "active"] as const) {
      if (statusLabels[locale][status] === trimmed) return status;
    }
  }
  return undefined;
}

function getLineValue(line: string, keys: Record<Locale, string>): string | undefined {
  for (const key of Object.values(keys)) {
    const prefix = `${key}:`;
    const fullWidthPrefix = `${key}：`;
    if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
    if (line.startsWith(fullWidthPrefix)) return line.slice(fullWidthPrefix.length).trim();
  }
  return undefined;
}

export function extractPartyProfileFromNotes(notes?: string): PartyProfileMeta {
  const meta: PartyProfileMeta = {};
  const lines = (notes ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const typeValue = getLineValue(line, labelKeys.type);
    if (typeValue) meta.type = findTypeByLabel(typeValue) ?? meta.type;

    const roleValue = getLineValue(line, labelKeys.role);
    if (roleValue) meta.role = findRoleByLabel(roleValue) ?? meta.role;

    const statusValue = getLineValue(line, labelKeys.status);
    if (statusValue) meta.status = findStatusByLabel(statusValue) ?? meta.status;
  }
  return meta;
}

export function extractFreeformPartyNote(notes?: string): string {
  const lines = (notes ?? "").split(/\r?\n/);
  const noteKeys = new Set(Object.values(labelKeys.note));
  for (const line of lines) {
    const trimmed = line.trim();
    for (const key of noteKeys) {
      const prefix = `${key}:`;
      const fullWidthPrefix = `${key}：`;
      if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length).trim();
      if (trimmed.startsWith(fullWidthPrefix)) return trimmed.slice(fullWidthPrefix.length).trim();
    }
  }
  return "";
}

export function buildPartyProfileNotes(input: {
  type: PartyProfileType;
  role: PartyProfileRole;
  status: NonNullable<PartyProfileMeta["status"]>;
  note?: string;
  locale: Locale;
}): string {
  const lines = [
    `${labelKeys.type[input.locale]}：${getPartyProfileTypeLabel(input.type, input.locale)}`,
    `${labelKeys.role[input.locale]}：${getPartyProfileRoleLabel(input.role, input.locale)}`,
    `${labelKeys.status[input.locale]}：${getPartyProfileStatusLabel(input.status, input.locale)}`,
  ];
  if (input.note?.trim()) {
    lines.push(`${labelKeys.note[input.locale]}：${input.note.trim()}`);
  }
  return lines.join("\n");
}

type PartyMetadataKind = "type" | "role";

function metadataKindForLine(line: string): PartyMetadataKind | undefined {
  const trimmed = line.trim();
  for (const kind of ["type", "role"] as const) {
    for (const key of Object.values(labelKeys[kind])) {
      if (trimmed.startsWith(`${key}:`) || trimmed.startsWith(`${key}：`)) return kind;
    }
  }
  return undefined;
}

/**
 * Replace only the known type/role metadata rows in a compatible Client.notes
 * value. Unknown history and customer notes remain byte-for-byte in their
 * original order; status and subject-note rows are deliberately untouched.
 */
export function mergePartyProfileMetadataNotes(input: {
  existingNotes?: string;
  type?: PartyProfileType;
  role?: PartyProfileRole;
  locale: Locale;
}): string | undefined {
  const source = input.existingNotes ?? "";
  const lines = source ? source.split(/\r?\n/) : [];
  const replacement: Record<PartyMetadataKind, string | undefined> = {
    type: input.type ? `${labelKeys.type[input.locale]}：${getPartyProfileTypeLabel(input.type, input.locale)}` : undefined,
    role: input.role ? `${labelKeys.role[input.locale]}：${getPartyProfileRoleLabel(input.role, input.locale)}` : undefined,
  };
  const seen = new Set<PartyMetadataKind>();
  const result: string[] = [];

  for (const line of lines) {
    const kind = metadataKindForLine(line);
    if (!kind) {
      result.push(line);
      continue;
    }
    if (!seen.has(kind)) {
      seen.add(kind);
      if (replacement[kind]) result.push(replacement[kind]!);
    }
  }

  const missing = (["type", "role"] as const).filter((kind) => replacement[kind] && !seen.has(kind));
  if (missing.length > 0) result.unshift(...missing.map((kind) => replacement[kind]!));

  const merged = result.join("\n");
  return merged || undefined;
}

export function normalizePartyReturnTo(value: string | null | undefined): string {
  const fallback = "/parties";
  const path = (value ?? "").trim();
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\") || path.includes("\\")) return fallback;
  const rawPathname = path.split(/[?#]/, 1)[0];
  let decodedPathname = rawPathname;
  try {
    decodedPathname = decodeURIComponent(rawPathname);
  } catch {
    return fallback;
  }
  if (decodedPathname.includes("\\") || decodedPathname.split("/").some((segment) => segment === "." || segment === "..")) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(path, "http://broker-desk.local");
  } catch {
    return fallback;
  }
  if (parsed.origin !== "http://broker-desk.local" || parsed.hash) return fallback;
  const keys = [...new Set([...parsed.searchParams.keys()])];
  if (parsed.pathname === "/parties") {
    if (keys.some((key) => !["q", "type", "lifecycle", "page"].includes(key))) return fallback;
    return `${parsed.pathname}${parsed.search}`;
  }
  if (parsed.pathname === "/organize-center") {
    if (parsed.searchParams.get("type") !== "party" || keys.some((key) => !["type", "q", "lifecycle", "page"].includes(key))) return fallback;
    return `${parsed.pathname}${parsed.search}`;
  }
  return fallback;
}
