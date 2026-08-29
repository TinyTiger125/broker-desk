import type { Locale } from "@/lib/locale";

export const TENANT_SERVICE_TIME_ZONE = "Asia/Tokyo";

export type TenantServiceStatus = "pending" | "active" | "expiring" | "expired" | "suspended" | "cancelled";

export type TenantServiceInput = {
  status: "trial" | "active" | "pending_activation" | "suspended" | "cancelled";
  serviceStartAt?: string;
  serviceEndAt?: string;
};

export type TenantServiceState = {
  status: TenantServiceStatus;
  remainingDays: number | null;
  serviceStartAt?: string;
  serviceEndAt?: string;
};

export const TENANT_SERVICE_STATUS_LABELS: Record<TenantServiceStatus, Record<Locale, string>> = {
  pending: { ja: "開始前", zh: "待开始", ko: "시작 전" },
  active: { ja: "利用中", zh: "服务中", ko: "이용 중" },
  expiring: { ja: "終了30日前", zh: "30天内到期", ko: "30일 이내 종료" },
  expired: { ja: "期間終了", zh: "已到期", ko: "기간 종료" },
  suspended: { ja: "停止中", zh: "已暂停", ko: "중지됨" },
  cancelled: { ja: "解約済み", zh: "已取消", ko: "해지됨" },
};

export function getTenantServiceStatusLabel(status: TenantServiceStatus, locale: Locale): string {
  return TENANT_SERVICE_STATUS_LABELS[status][locale];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: string | undefined, field: string): string | undefined {
  if (value == null || value === "") return undefined;
  if (!ISO_DATE.test(value)) throw new Error(`${field} must be an ISO calendar date`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${field} must be a valid calendar date`);
  }
  return value;
}

function epochDay(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function getTokyoCalendarDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TENANT_SERVICE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function validateTenantServicePeriod(input: { serviceStartAt?: string; serviceEndAt?: string }) {
  const serviceStartAt = assertIsoDate(input.serviceStartAt, "serviceStartAt");
  const serviceEndAt = assertIsoDate(input.serviceEndAt, "serviceEndAt");
  if (serviceStartAt && serviceEndAt && serviceStartAt > serviceEndAt) {
    throw new Error("service end date must not be before service start date");
  }
  return { serviceStartAt, serviceEndAt };
}

export function deriveTenantServiceState(input: TenantServiceInput, now: Date = new Date()): TenantServiceState {
  const dates = validateTenantServicePeriod(input);
  if (input.status === "suspended" || input.status === "cancelled") {
    return { status: input.status, remainingDays: dates.serviceEndAt ? epochDay(dates.serviceEndAt) - epochDay(getTokyoCalendarDate(now)) : null, ...dates };
  }

  const today = getTokyoCalendarDate(now);
  if (dates.serviceStartAt && today < dates.serviceStartAt) {
    return { status: "pending", remainingDays: null, ...dates };
  }
  if (dates.serviceEndAt) {
    const remainingDays = epochDay(dates.serviceEndAt) - epochDay(today);
    if (remainingDays < 0) return { status: "expired", remainingDays, ...dates };
    if (remainingDays <= 30) return { status: "expiring", remainingDays, ...dates };
    return { status: "active", remainingDays, ...dates };
  }
  if (!dates.serviceStartAt && input.status === "pending_activation") {
    return { status: "pending", remainingDays: null, ...dates };
  }
  return { status: "active", remainingDays: null, ...dates };
}

export function isTenantServiceOperational(state: Pick<TenantServiceState, "status">): boolean {
  return state.status === "active" || state.status === "expiring";
}

export function membershipOccupiesSeat(membership: {
  status: "active" | "invited" | "suspended" | "removed";
  invitationStatus: "not_sent" | "pending" | "accepted" | "revoked" | "expired" | "failed";
  invitationExpiresAt?: Date;
}, now = new Date()): boolean {
  if (membership.status === "active" || membership.status === "suspended") return true;
  return membership.status === "invited"
    && membership.invitationStatus !== "revoked"
    && membership.invitationStatus !== "expired"
    && (!membership.invitationExpiresAt || membership.invitationExpiresAt.getTime() > now.getTime());
}

export function countTenantSeatUsage(memberships: readonly Parameters<typeof membershipOccupiesSeat>[0][], now = new Date()): number {
  return memberships.filter((membership) => membershipOccupiesSeat(membership, now)).length;
}
