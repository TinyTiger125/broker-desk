import { type ClientStage, type Temperature } from "@/lib/domain";
import type { Locale } from "@/lib/locale";

const OPEN_STAGES: ClientStage[] = ["lead", "contacted", "quoted", "viewing", "negotiating"];

export type FollowUpPriorityLevel = "urgent" | "alert" | "follow" | "stale";

export type FollowUpPriorityItem = {
  clientId: string;
  clientName: string;
  preferredArea?: string;
  stage: ClientStage;
  temperature: Temperature;
  nextFollowUpAt?: Date;
  lastContactedAt?: Date;
  daysSinceContact: number;
  priorityLevel: FollowUpPriorityLevel;
  reason: string;
};

type PriorityClient = {
  id: string;
  name: string;
  preferredArea?: string;
  stage: ClientStage;
  temperature: Temperature;
  nextFollowUpAt?: Date;
  lastContactedAt?: Date;
  createdAt: Date;
};

function isOpenStage(stage: ClientStage) {
  return OPEN_STAGES.includes(stage);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffDays(base: Date, target: Date): number {
  const baseDay = Date.UTC(base.getFullYear(), base.getMonth(), base.getDate());
  const targetDay = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.floor((baseDay - targetDay) / 86400000);
}

function getPriority(
  client: PriorityClient,
  today: Date,
  locale: Locale
): Omit<FollowUpPriorityItem, "daysSinceContact"> | null {
  if (!isOpenStage(client.stage)) return null;

  const todayStart = startOfDay(today);
  const touchpoint = client.lastContactedAt ?? client.createdAt;
  const daysNoContact = diffDays(todayStart, touchpoint);
  const nextFollowUp = client.nextFollowUpAt ? startOfDay(client.nextFollowUpAt) : undefined;

  if (nextFollowUp && nextFollowUp <= todayStart) {
    const overdueDays = Math.max(0, diffDays(todayStart, nextFollowUp));
    const overdueText =
      overdueDays === 0
        ? locale === "zh"
          ? "今天到期"
          : locale === "ko"
            ? "오늘이 기한입니다"
            : "本日が期限です"
        : locale === "zh"
          ? `已超期 ${overdueDays} 天`
          : locale === "ko"
            ? `${overdueDays}일 초과되었습니다`
            : `${overdueDays}日超過しています`;
    return {
      clientId: client.id,
      clientName: client.name,
      preferredArea: client.preferredArea,
      stage: client.stage,
      temperature: client.temperature,
      nextFollowUpAt: client.nextFollowUpAt,
      lastContactedAt: client.lastContactedAt,
      priorityLevel: "urgent",
      reason:
        locale === "zh"
          ? `下次跟进日：${overdueText}`
          : locale === "ko"
            ? `다음 팔로업 일정: ${overdueText}`
            : `次回フォロー日が${overdueText}`,
    };
  }

  if (client.temperature === "high" && daysNoContact > 3) {
    return {
      clientId: client.id,
      clientName: client.name,
      preferredArea: client.preferredArea,
      stage: client.stage,
      temperature: client.temperature,
      nextFollowUpAt: client.nextFollowUpAt,
      lastContactedAt: client.lastContactedAt,
      priorityLevel: "alert",
      reason:
        locale === "zh"
          ? `高温客户已 ${daysNoContact} 天未联系`
          : locale === "ko"
            ? `온도가 높은 고객과 ${daysNoContact}일간 연락이 없습니다`
            : `温度感が高い顧客で、${daysNoContact}日間連絡がありません`,
    };
  }

  if (client.stage === "quoted" && daysNoContact > 5) {
    return {
      clientId: client.id,
      clientName: client.name,
      preferredArea: client.preferredArea,
      stage: client.stage,
      temperature: client.temperature,
      nextFollowUpAt: client.nextFollowUpAt,
      lastContactedAt: client.lastContactedAt,
      priorityLevel: "follow",
      reason:
        locale === "zh"
          ? `提案发送后已有 ${daysNoContact} 天未跟进`
          : locale === "ko"
            ? `제안 발송 후 ${daysNoContact}일간 팔로업이 없습니다`
            : `提案送付後、${daysNoContact}日間フォローがありません`,
    };
  }

  if (daysNoContact > 14) {
    return {
      clientId: client.id,
      clientName: client.name,
      preferredArea: client.preferredArea,
      stage: client.stage,
      temperature: client.temperature,
      nextFollowUpAt: client.nextFollowUpAt,
      lastContactedAt: client.lastContactedAt,
      priorityLevel: "stale",
      reason:
        locale === "zh"
          ? `已 ${daysNoContact} 天无联系，案件停滞`
          : locale === "ko"
            ? `${daysNoContact}일간 연락이 없어 정체 상태입니다`
            : `${daysNoContact}日間連絡がなく停滞しています`,
    };
  }

  return null;
}

const PRIORITY_WEIGHT: Record<FollowUpPriorityLevel, number> = {
  urgent: 0,
  alert: 1,
  follow: 2,
  stale: 3,
};

export function buildFollowUpPriorityList(
  clients: PriorityClient[],
  now: Date = new Date(),
  locale: Locale = "ja"
): FollowUpPriorityItem[] {
  return clients
    .map((client) => {
      const touchpoint = client.lastContactedAt ?? client.createdAt;
      const daysSinceContact = diffDays(startOfDay(now), touchpoint);
      const priority = getPriority(client, now, locale);
      if (!priority) return null;
      return {
        ...priority,
        daysSinceContact,
      };
    })
    .filter((item): item is FollowUpPriorityItem => item !== null)
    .sort((a, b) => {
      const levelDiff = PRIORITY_WEIGHT[a.priorityLevel] - PRIORITY_WEIGHT[b.priorityLevel];
      if (levelDiff !== 0) return levelDiff;
      const aNext = a.nextFollowUpAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bNext = b.nextFollowUpAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (aNext !== bNext) return aNext - bNext;
      return b.daysSinceContact - a.daysSinceContact;
    })
    .slice(0, 10);
}
