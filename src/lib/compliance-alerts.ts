import type { AmlCheckStatus, BrokerageContractType, ClientStage } from "@/lib/domain";

const OPEN_STAGES: ClientStage[] = ["lead", "contacted", "quoted", "viewing", "negotiating"];

export type ComplianceAlertLevel = "urgent" | "warning";

export type ComplianceAlertType =
  | "brokerage_expired"
  | "brokerage_expiring"
  | "missing_35"
  | "missing_37"
  | "aml_pending"
  | "missing_pii_consent";

type ComplianceClient = {
  id: string;
  name: string;
  stage: ClientStage;
  createdAt: Date;
  brokerageContractType: BrokerageContractType;
  brokerageContractExpiresAt?: Date;
  importantMattersExplainedAt?: Date;
  contractDocumentDeliveredAt?: Date;
  personalInfoConsentAt?: Date;
  amlCheckStatus: AmlCheckStatus;
};

export type ComplianceAlertItem = {
  clientId: string;
  clientName: string;
  level: ComplianceAlertLevel;
  type: ComplianceAlertType;
  title: string;
  reason: string;
  dueAt?: Date;
};

function dayDiff(base: Date, target: Date) {
  const oneDay = 24 * 60 * 60 * 1000;
  const baseDate = Date.UTC(base.getFullYear(), base.getMonth(), base.getDate());
  const targetDate = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.floor((targetDate - baseDate) / oneDay);
}

function isOpenStage(stage: ClientStage) {
  return OPEN_STAGES.includes(stage);
}

export function buildComplianceAlertList(
  clients: ComplianceClient[],
  now: Date = new Date()
): ComplianceAlertItem[] {
  const list: ComplianceAlertItem[] = [];

  for (const client of clients) {
    if (!isOpenStage(client.stage) && client.stage !== "won") continue;

    if (
      client.brokerageContractType !== "none" &&
      client.brokerageContractExpiresAt
    ) {
      const daysLeft = dayDiff(now, client.brokerageContractExpiresAt);
      if (daysLeft < 0) {
        list.push({
          clientId: client.id,
          clientName: client.name,
          level: "urgent",
          type: "brokerage_expired",
          title: "媒介契約の満了超過",
          reason: `媒介契約満了日を ${Math.abs(daysLeft)} 日超過しています。更新確認が必要です。`,
          dueAt: client.brokerageContractExpiresAt,
        });
      } else if (daysLeft <= 14) {
        list.push({
          clientId: client.id,
          clientName: client.name,
          level: "warning",
          type: "brokerage_expiring",
          title: "媒介契約の更新期限が近い",
          reason: `媒介契約満了まで ${daysLeft} 日です。更新可否を確認してください。`,
          dueAt: client.brokerageContractExpiresAt,
        });
      }
    }

    if (
      ["viewing", "negotiating", "won"].includes(client.stage) &&
      !client.importantMattersExplainedAt
    ) {
      list.push({
        clientId: client.id,
        clientName: client.name,
        level: client.stage === "won" ? "urgent" : "warning",
        type: "missing_35",
        title: "重要事項説明（35条）未記録",
        reason: "重要事項説明の実施記録が未入力です。",
      });
    }

    if (client.stage === "won" && !client.contractDocumentDeliveredAt) {
      list.push({
        clientId: client.id,
        clientName: client.name,
        level: "urgent",
        type: "missing_37",
        title: "契約書面交付（37条）未記録",
        reason: "契約書面交付日の記録が未入力です。",
      });
    }

    if (client.amlCheckStatus === "pending") {
      list.push({
        clientId: client.id,
        clientName: client.name,
        level: client.stage === "won" ? "urgent" : "warning",
        type: "aml_pending",
        title: "本人確認/AML 確認待ち",
        reason: "本人確認またはAML確認が保留中です。",
      });
    }

    if (!client.personalInfoConsentAt) {
      const daysSinceCreated = Math.abs(dayDiff(client.createdAt, now));
      if (daysSinceCreated >= 3) {
        list.push({
          clientId: client.id,
          clientName: client.name,
          level: "warning",
          type: "missing_pii_consent",
          title: "個人情報利用目的の同意未記録",
          reason: "個人情報の利用目的通知/同意確認日の記録が未入力です。",
        });
      }
    }
  }

  const priority = { urgent: 0, warning: 1 } as const;

  return list
    .sort((a, b) => {
      if (priority[a.level] !== priority[b.level]) {
        return priority[a.level] - priority[b.level];
      }
      const aTime = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTime = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, 10);
}
