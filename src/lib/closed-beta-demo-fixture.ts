import { createHash } from "node:crypto";

/**
 * The first-login demo is deliberately a small, tenant-scoped fixture.  Keep
 * its values synthetic and stable so a retry can prove that it is the same
 * fixture instead of creating another copy.
 */
export const CLOSED_BETA_DEMO_FIXTURE_VERSION = "v1" as const;
export const CLOSED_BETA_DEMO_LABEL = "【合成上手】" as const;

/**
 * A closed-beta seed was recognized as belonging to the guarded flow, but did
 * not complete. The home page can show a retryable recovery state without
 * turning an ordinary tenant's optional seed probe into a workspace outage.
 */
export class ClosedBetaDemoSeedError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    const message = cause instanceof Error ? cause.message : "closed_beta_demo_seed_failed";
    super(message);
    this.name = "ClosedBetaDemoSeedError";
    this.cause = cause;
  }
}

export type ClosedBetaDemoScenario = "progress" | "complete";

export type ClosedBetaDemoFixture = {
  marker: string;
  clients: Array<{
    id: string;
    scenario: ClosedBetaDemoScenario;
    name: string;
    phone: string;
    budgetMin: number;
    budgetMax: number;
    budgetType: "total_price";
    preferredArea: string;
    purpose: "self_use" | "investment";
    loanPreApprovalStatus: "not_applied" | "approved";
    stage: "contacted" | "negotiating";
    temperature: "medium" | "high";
    brokerageContractType: "none" | "general";
    amlCheckStatus: "not_required" | "verified";
    notes: string;
  }>;
  properties: Array<{
    id: string;
    scenario: ClosedBetaDemoScenario;
    name: string;
    area: string;
    address: string;
    listingPrice: number;
    notes: string;
  }>;
  cases: Array<{
    id: string;
    scenario: ClosedBetaDemoScenario;
    clientIndex: number;
    propertyIndex: number;
    caseTitle: string;
    status: "draft" | "reviewed";
    confirmedDataJson: Record<string, unknown>;
  }>;
  tasks: Array<{
    id: string;
    clientIndex: number;
    title: string;
    status: "pending";
  }>;
  followUps: Array<{
    id: string;
    clientIndex: number;
    content: string;
    nextAction: string;
    type: "note";
  }>;
};

function fixtureToken(tenantId: string): string {
  return createHash("sha256").update(tenantId, "utf8").digest("hex").slice(0, 16);
}

export function buildClosedBetaDemoFixture(tenantId: string): ClosedBetaDemoFixture {
  const normalizedTenantId = tenantId.trim();
  if (!normalizedTenantId) throw new Error("closed_beta_demo_tenant_required");
  const token = fixtureToken(normalizedTenantId);
  const marker = `closed_beta_demo_${CLOSED_BETA_DEMO_FIXTURE_VERSION}_${token}`;
  const clientPrefix = `closed_beta_demo_client_${token}`;
  const propertyPrefix = `closed_beta_demo_property_${token}`;
  const casePrefix = `closed_beta_demo_case_${token}`;
  const taskPrefix = `closed_beta_demo_task_${token}`;
  const followUpPrefix = `closed_beta_demo_followup_${token}`;

  return {
    marker,
    clients: [
      {
        id: `${clientPrefix}_progress`,
        scenario: "progress",
        name: `${CLOSED_BETA_DEMO_LABEL}合成顧客 A`,
        phone: "00000000001",
        budgetMin: 45000000,
        budgetMax: 60000000,
        budgetType: "total_price",
        preferredArea: "東京都合成区 A",
        purpose: "self_use",
        loanPreApprovalStatus: "not_applied",
        stage: "contacted",
        temperature: "medium",
        brokerageContractType: "none",
        amlCheckStatus: "not_required",
        notes: `${CLOSED_BETA_DEMO_LABEL}進行中シナリオ。入力と次回対応を確認するための合成データです。`,
      },
      {
        id: `${clientPrefix}_complete`,
        scenario: "complete",
        name: `${CLOSED_BETA_DEMO_LABEL}合成顧客 B`,
        phone: "00000000002",
        budgetMin: 90000000,
        budgetMax: 110000000,
        budgetType: "total_price",
        preferredArea: "東京都合成区 B",
        purpose: "investment",
        loanPreApprovalStatus: "approved",
        stage: "negotiating",
        temperature: "high",
        brokerageContractType: "general",
        amlCheckStatus: "verified",
        notes: `${CLOSED_BETA_DEMO_LABEL}確認済みシナリオ。合成データの状態表示を確認できます。`,
      },
    ],
    properties: [
      {
        id: `${propertyPrefix}_progress`,
        scenario: "progress",
        name: `${CLOSED_BETA_DEMO_LABEL}合成物件 A`,
        area: "東京都合成区 A",
        address: "東京都合成区 A 1-1-1",
        listingPrice: 52000000,
        notes: `${CLOSED_BETA_DEMO_LABEL}内見前の合成物件です。`,
      },
      {
        id: `${propertyPrefix}_complete`,
        scenario: "complete",
        name: `${CLOSED_BETA_DEMO_LABEL}合成物件 B`,
        area: "東京都合成区 B",
        address: "東京都合成区 B 2-2-2",
        listingPrice: 98000000,
        notes: `${CLOSED_BETA_DEMO_LABEL}交渉中の合成物件です。`,
      },
    ],
    cases: [
      {
        id: `${casePrefix}_progress`,
        scenario: "progress",
        clientIndex: 0,
        propertyIndex: 0,
        caseTitle: `${CLOSED_BETA_DEMO_LABEL}進行中の合成案件`,
        status: "draft",
        confirmedDataJson: {
          closedBetaFixtureMarker: marker,
          closedBetaFixtureVersion: CLOSED_BETA_DEMO_FIXTURE_VERSION,
          scenario: "progress",
          applicant: { name: "合成顧客 A" },
          property: { name: "合成物件 A", address: "東京都合成区 A 1-1-1" },
        },
      },
      {
        id: `${casePrefix}_complete`,
        scenario: "complete",
        clientIndex: 1,
        propertyIndex: 1,
        caseTitle: `${CLOSED_BETA_DEMO_LABEL}確認済みの合成案件`,
        status: "reviewed",
        confirmedDataJson: {
          closedBetaFixtureMarker: marker,
          closedBetaFixtureVersion: CLOSED_BETA_DEMO_FIXTURE_VERSION,
          scenario: "complete",
          applicant: { name: "合成顧客 B" },
          property: { name: "合成物件 B", address: "東京都合成区 B 2-2-2" },
        },
      },
    ],
    tasks: [
      {
        id: `${taskPrefix}_progress`,
        clientIndex: 0,
        title: `${CLOSED_BETA_DEMO_LABEL} A の希望条件を確認`,
        status: "pending",
      },
      {
        id: `${taskPrefix}_complete`,
        clientIndex: 1,
        title: `${CLOSED_BETA_DEMO_LABEL} B の交渉メモを確認`,
        status: "pending",
      },
    ],
    followUps: [
      {
        id: `${followUpPrefix}_progress`,
        clientIndex: 0,
        content: `${CLOSED_BETA_DEMO_LABEL} A の次回連絡を記録する合成メモ`,
        nextAction: "希望条件を確認",
        type: "note",
      },
      {
        id: `${followUpPrefix}_complete`,
        clientIndex: 1,
        content: `${CLOSED_BETA_DEMO_LABEL} B の交渉状況を記録する合成メモ`,
        nextAction: "条件を再確認",
        type: "note",
      },
    ],
  };
}
