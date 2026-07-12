import {
  type AmlCheckStatus,
  type BrokerageContractType,
  type BudgetType,
  type ClientStage,
  type FollowUpType,
  type LoanPreApprovalStatus,
  type Purpose,
  type QuoteStatus,
  type TaskStatus,
  type Temperature,
} from "@/lib/domain";
import { buildFollowUpPriorityList } from "@/lib/followup-priority";
import type { Locale } from "@/lib/locale";
import { getStageLabel } from "@/lib/options";
import { computeQuote } from "@/lib/quote";
import { buildComplianceAlertList, type ComplianceAlertType } from "@/lib/compliance-alerts";
import { StageTransitionBlockedError, validateStageTransition } from "@/lib/workflow-engine";
import {
  getDefaultOutputTemplateSettings,
  type OutputTemplateSettings,
  type OutputTemplateSettingsInput,
} from "@/lib/output-doc";
import type {
  CaseWorkbenchFieldRule,
  CaseWorkbenchFieldRuleInput,
} from "@/lib/case-workbench-field-rules";
import { COMPLETE_CASE_FIELD_DEFAULTS, COMPLETE_DRAFT_DEFAULTS } from "@/lib/guarantee-application-fixtures";
import { DEFAULT_TENANT_ID } from "@/lib/tenant-constants";
import type { TenantRole } from "@/lib/tenant-permissions";

export type { OutputTemplateSettingsInput } from "@/lib/output-doc";
export type {
  CaseFieldRequirement,
  CaseWorkbenchFieldRule,
  CaseWorkbenchFieldRuleInput,
} from "@/lib/case-workbench-field-rules";

export type User = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  externalAuthSubject?: string;
  createdAt: Date;
};

export type ExternalAuthUserInput = {
  subject: string;
  email?: string;
  name?: string;
};

export type TenantStatus = "trial" | "active" | "suspended" | "cancelled";
export type TenantAccountType = "individual" | "company";
export type TenantMembershipStatus = "active" | "invited" | "suspended";
export type TenantInvitationProvider = "none" | "manual" | "clerk";
export type TenantInvitationStatus = "not_sent" | "pending" | "accepted" | "revoked" | "expired" | "failed";

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  accountType: TenantAccountType;
  status: TenantStatus;
  purchasedSeatCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type TenantMembership = {
  id: string;
  tenantId: string;
  userId: string;
  role: TenantRole;
  status: TenantMembershipStatus;
  invitationProvider: TenantInvitationProvider;
  invitationStatus: TenantInvitationStatus;
  providerInvitationId?: string;
  invitationUrl?: string;
  invitationSentAt?: Date;
  invitationAcceptedAt?: Date;
  invitationError?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type TenantMemberListItem = TenantMembership & {
  user: Pick<User, "id" | "name" | "email" | "externalAuthSubject" | "createdAt">;
};

export type TenantAccountMemberSummary = TenantMemberListItem & {
  isBoundToExternalAuth: boolean;
};

export type TenantAccountSummary = Tenant & {
  activeSeatCount: number;
  invitedSeatCount: number;
  usedSeatCount: number;
  availableSeatCount: number;
  ownerMembers: TenantAccountMemberSummary[];
};

export type Client = {
  id: string;
  tenantId?: string;
  name: string;
  phone: string;
  lineId?: string;
  email?: string;
  budgetMin?: number;
  budgetMax?: number;
  budgetType: BudgetType;
  preferredArea?: string;
  firstChoiceArea?: string;
  secondChoiceArea?: string;
  purpose: Purpose;
  loanPreApprovalStatus: LoanPreApprovalStatus;
  desiredMoveInPeriod?: string;
  stage: ClientStage;
  temperature: Temperature;
  brokerageContractType: BrokerageContractType;
  brokerageContractSignedAt?: Date;
  brokerageContractExpiresAt?: Date;
  importantMattersExplainedAt?: Date;
  contractDocumentDeliveredAt?: Date;
  personalInfoConsentAt?: Date;
  amlCheckStatus: AmlCheckStatus;
  nextFollowUpAt?: Date;
  lastContactedAt?: Date;
  notes?: string;
  ownerUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type Property = {
  id: string;
  tenantId?: string;
  name: string;
  area?: string;
  address?: string;
  listingPrice: number;
  sizeSqm?: number;
  managementFee?: number;
  repairFee?: number;
  notes?: string;
  createdAt: Date;
};

export type Quotation = {
  id: string;
  tenantId?: string;
  clientId: string;
  propertyId?: string;
  quoteTitle: string;
  listingPrice: number;
  brokerageFee: number;
  taxFee: number;
  managementFee: number;
  repairFee: number;
  otherFee: number;
  downPayment: number;
  loanAmount: number;
  interestRate: number;
  loanYears: number;
  monthlyPaymentEstimate: number;
  totalInitialCost: number;
  monthlyTotalCost: number;
  summaryText: string;
  status: QuoteStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type FollowUp = {
  id: string;
  tenantId?: string;
  clientId: string;
  type: FollowUpType;
  content: string;
  nextAction?: string;
  nextFollowUpAt?: Date;
  createdById: string;
  createdAt: Date;
};

export type Task = {
  id: string;
  tenantId?: string;
  clientId?: string;
  title: string;
  dueAt?: Date;
  status: TaskStatus;
  createdById: string;
  createdAt: Date;
};

export type AuditLog = {
  id: string;
  tenantId?: string;
  actorId: string;
  // Legacy alias kept for backward compatibility.
  userId: string;
  action: string;
  targetType:
    | "tenant"
    | "member"
    | "template"
    | "official_template"
    | "case"
    | "source_file"
    | "client"
    | "task"
    | "quote"
    | "compliance"
    | "output"
    | "import_job"
    | "property"
    | "party"
    | "contract"
    | "service_request"
    | "ai_experience";
  targetId?: string;
  message: string;
  context?: Record<string, unknown>;
  createdAt: Date;
};

export type ImportSourceType = "excel" | "pdf" | "scan" | "manual";
export type ImportTargetEntity = "properties" | "parties" | "contracts" | "service_requests";
export type ImportJobStatus = "queued" | "mapped" | "completed";

export type ImportJob = {
  id: string;
  tenantId?: string;
  userId: string;
  sourceType: ImportSourceType;
  title: string;
  targetEntity: ImportTargetEntity;
  status: ImportJobStatus;
  notes?: string;
  mappingJson?: Record<string, string>;
  validationMessage?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type BrokerageCaseStatus = "draft" | "reviewed";
export type BrokerageCaseType = "unit_sale";
export type ExtractionReviewStatus = "suggested" | "accepted" | "edited" | "unknown" | "rejected";
export type GuaranteeApplicationDraftStatus = "draft" | "ready";
export type GuaranteeApplicationDraftCompanyCode = "zenhoren" | "nihon_safety" | "j_lease" | "insure" | "friends_guarantee";

export type BrokerageCase = {
  id: string;
  tenantId?: string;
  userId: string;
  caseType: BrokerageCaseType;
  caseTitle: string;
  primaryPropertyId?: string;
  status: BrokerageCaseStatus;
  confirmedDataJson: Record<string, unknown>;
  sourceImportJobIds: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type ExtractionReviewItem = {
  id: string;
  tenantId?: string;
  userId: string;
  caseId: string;
  importJobId: string;
  fieldKey: string;
  label: string;
  extractedValue: string;
  normalizedValue: string;
  editedValue?: string;
  finalValue?: string;
  sourceSheet: string;
  sourceCell?: string;
  sourceRange?: string;
  method: string;
  confidence: number;
  reviewStatus: ExtractionReviewStatus;
  sourceFileHash: string;
  templateVersion: string;
  reviewedById?: string;
  reviewedAt: Date;
  createdAt: Date;
};

export type GuaranteeApplicationDraft = {
  id: string;
  tenantId?: string;
  userId: string;
  caseId: string;
  templateId: string;
  companyCode: GuaranteeApplicationDraftCompanyCode;
  status: GuaranteeApplicationDraftStatus;
  fieldValuesJson: Record<string, unknown>;
  fieldStatusesJson: Record<string, string>;
  lastReviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type CorrectionEventTrigger = "extraction_review_save" | "case_workbench_save" | "guarantee_draft_save" | "pdf_preview_save";
export type CorrectionEventChangeType =
  | "ai_extraction_error"
  | "normalization_error"
  | "source_absent_user_completed"
  | "missing_detected_by_user"
  | "conflict_resolved_by_user"
  | "template_output_position_error"
  | "template_output_format_error"
  | "user_or_team_preference"
  | "one_off_case_override";
export type CorrectionEventScopeCandidate =
  | "case_only"
  | "user_or_team"
  | "source_template"
  | "output_template"
  | "field_dictionary"
  | "global_rule_candidate"
  | "regression_case";

export type CorrectionEvent = {
  id: string;
  tenantId?: string;
  userId: string;
  caseId: string;
  trigger: CorrectionEventTrigger;
  fieldKey: string;
  fieldLabel: string;
  aiValue?: string;
  confirmedValue?: string;
  changeType: CorrectionEventChangeType;
  sourceImportJobId?: string;
  sourceLocation?: string;
  extractionMethod?: string;
  confidenceBefore?: number;
  templateId?: string;
  scopeCandidate: CorrectionEventScopeCandidate;
  sourceEvidenceJson?: Record<string, unknown>;
  createdAt: Date;
};

export type AiExperienceDraftStatus = "draft" | "approved" | "rejected";

export type AiExperienceDraft = {
  id: string;
  tenantId?: string;
  userId: string;
  status: AiExperienceDraftStatus;
  title: string;
  bodyMarkdown: string;
  eventIds: string[];
  fieldKey?: string;
  templateId?: string;
  changeType: CorrectionEventChangeType;
  scopeCandidate: CorrectionEventScopeCandidate;
  evidenceSummaryJson?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type AttachmentTargetType = "property" | "party" | "contract" | "service_request" | "import_job" | "quote";

export type Attachment = {
  id: string;
  tenantId?: string;
  userId: string;
  targetType: AttachmentTargetType;
  targetId: string;
  fileName: string;
  fileType?: string;
  fileSizeBytes?: number;
  storagePath?: string;
  uploadedAt: Date;
};

export type GeneratedOutput = {
  id: string;
  tenantId?: string;
  actorId: string;
  userId: string;
  sourceQuoteId?: string;
  quoteId?: string;
  propertyId?: string;
  partyId?: string;
  outputType:
    | "property_overview"
    | "proposal"
    | "estimate_sheet"
    | "funding_plan"
    | "assumption_memo"
    | "guarantee_application";
  outputFormat: "pdf" | "docx";
  language: Locale;
  title: string;
  documentNumber: string;
  templateVersionId?: string;
  caseId?: string;
  templateId?: string;
  inputDataSnapshot?: Record<string, unknown>;
  draftValueSnapshot?: Record<string, unknown>;
  fieldMappingSnapshot?: Record<string, unknown>;
  layoutSnapshot?: Record<string, unknown>;
  generatedAt: Date;
};

export type OutputTemplateVersion = {
  id: string;
  tenantId?: string;
  userId: string;
  versionNumber: number;
  versionLabel: string;
  changeNote?: string;
  settingsSnapshot: OutputTemplateSettingsInput;
  isActive: boolean;
  createdAt: Date;
};

type DB = {
  users: User[];
  tenants: Tenant[];
  tenantMemberships: TenantMembership[];
  clients: Client[];
  properties: Property[];
  quotations: Quotation[];
  followUps: FollowUp[];
  tasks: Task[];
  auditLogs: AuditLog[];
  caseWorkbenchFieldRules: CaseWorkbenchFieldRule[];
  outputTemplateSettings: OutputTemplateSettings[];
  outputTemplateVersions: OutputTemplateVersion[];
  importJobs: ImportJob[];
  brokerageCases: BrokerageCase[];
  extractionReviewItems: ExtractionReviewItem[];
  guaranteeApplicationDrafts: GuaranteeApplicationDraft[];
  correctionEvents: CorrectionEvent[];
  aiExperienceDrafts: AiExperienceDraft[];
  attachments: Attachment[];
  generatedOutputs: GeneratedOutput[];
};

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const now = Date.now();

function resolveTenantId(tenantId?: string): string {
  return tenantId?.trim() || DEFAULT_TENANT_ID;
}

export function isTenantAccessibleStatus(status: TenantStatus): boolean {
  return status === "trial" || status === "active";
}

function normalizePurchasedSeatCount(value: unknown): number {
  const count = Number(value);
  if (!Number.isFinite(count)) return 1;
  return Math.max(1, Math.floor(count));
}

function countUsedSeats(tenantId: string): { activeSeatCount: number; invitedSeatCount: number; usedSeatCount: number } {
  const members = db.tenantMemberships.filter((membership) => membership.tenantId === tenantId);
  const activeSeatCount = members.filter((membership) => membership.status === "active").length;
  const invitedSeatCount = members.filter((membership) => membership.status === "invited").length;
  return {
    activeSeatCount,
    invitedSeatCount,
    usedSeatCount: activeSeatCount + invitedSeatCount,
  };
}

function ensureTenantMembershipDefaults(membership: TenantMembership): TenantMembership {
  membership.invitationProvider = membership.invitationProvider ?? (membership.status === "active" ? "manual" : "none");
  membership.invitationStatus = membership.invitationStatus ?? (membership.status === "active" ? "accepted" : "not_sent");
  return membership;
}

function toTenantMemberListItem(membership: TenantMembership): TenantMemberListItem | null {
  ensureTenantMembershipDefaults(membership);
  const user = db.users.find((item) => item.id === membership.userId);
  if (!user) return null;
  return {
    ...membership,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      externalAuthSubject: user.externalAuthSubject,
      createdAt: user.createdAt,
    },
  };
}

function toTenantAccountSummary(tenant: Tenant): TenantAccountSummary {
  const seats = countUsedSeats(tenant.id);
  const ownerMembers = db.tenantMemberships
    .filter((membership) => membership.tenantId === tenant.id && membership.role === "tenant_owner")
    .map(toTenantMemberListItem)
    .filter((membership): membership is TenantMemberListItem => Boolean(membership))
    .map((membership) => ({
      ...membership,
      isBoundToExternalAuth: Boolean(membership.user.externalAuthSubject),
    }));
  return {
    ...tenant,
    ...seats,
    availableSeatCount: Math.max(0, tenant.purchasedSeatCount - seats.usedSeatCount),
    ownerMembers,
  };
}

function ensureTenantDefaults(tenant: Tenant): Tenant {
  tenant.accountType = tenant.accountType ?? "company";
  tenant.purchasedSeatCount = normalizePurchasedSeatCount(tenant.purchasedSeatCount ?? 1);
  return tenant;
}

const tenantScopedCollectionKeys = [
  "clients",
  "properties",
  "quotations",
  "followUps",
  "tasks",
  "auditLogs",
  "caseWorkbenchFieldRules",
  "outputTemplateSettings",
  "outputTemplateVersions",
  "importJobs",
  "brokerageCases",
  "extractionReviewItems",
  "guaranteeApplicationDrafts",
  "correctionEvents",
  "aiExperienceDrafts",
  "attachments",
  "generatedOutputs",
] as const;

function backfillTenantScope(dbLike: DB) {
  tenantScopedCollectionKeys.forEach((key) => {
    const records = dbLike[key] as Array<{ tenantId?: string }>;
    records.forEach((record) => {
      record.tenantId = resolveTenantId(record.tenantId);
    });
  });
}

function withDefaultTenantScope(input: Record<string, unknown>): DB {
  const scopedDb = input as DB;
  scopedDb.caseWorkbenchFieldRules = scopedDb.caseWorkbenchFieldRules ?? [];
  scopedDb.tenants.forEach(ensureTenantDefaults);
  scopedDb.tenantMemberships.forEach(ensureTenantMembershipDefaults);
  backfillTenantScope(scopedDb);
  return scopedDb;
}

function toTemplateSettingsInput(settings: OutputTemplateSettings): OutputTemplateSettingsInput {
  return {
    companyName: settings.companyName,
    department: settings.department,
    representative: settings.representative,
    licenseNumber: settings.licenseNumber,
    postalAddress: settings.postalAddress,
    phone: settings.phone,
    email: settings.email,
    proposalTitle: settings.proposalTitle,
    estimateSheetTitle: settings.estimateSheetTitle,
    fundingPlanTitle: settings.fundingPlanTitle,
    assumptionMemoTitle: settings.assumptionMemoTitle,
    documentClassification: settings.documentClassification,
    disclaimerLine1: settings.disclaimerLine1,
    disclaimerLine2: settings.disclaimerLine2,
    disclaimerLine3: settings.disclaimerLine3,
    showApprovalSection: settings.showApprovalSection,
    showLegalStatusDigest: settings.showLegalStatusDigest,
    showOutstandingBalanceTable: settings.showOutstandingBalanceTable,
  };
}

type QaBusinessDataCounts = Record<keyof Omit<DB, "users" | "outputTemplateSettings" | "outputTemplateVersions" | "caseWorkbenchFieldRules">, number>;

function cloneValue<T>(value: T): T {
  if (value instanceof Date) return new Date(value) as T;
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [key, cloneValue(nestedValue)]),
    ) as T;
  }
  return value;
}

function cloneCollection<T>(items: T[]): T[] {
  return items.map((item) => cloneValue(item));
}

function cloneDb(input: DB): DB {
  return {
    users: cloneCollection(input.users),
    tenants: cloneCollection(input.tenants),
    tenantMemberships: cloneCollection(input.tenantMemberships),
    clients: cloneCollection(input.clients),
    properties: cloneCollection(input.properties),
    quotations: cloneCollection(input.quotations),
    followUps: cloneCollection(input.followUps),
    tasks: cloneCollection(input.tasks),
    auditLogs: cloneCollection(input.auditLogs),
    caseWorkbenchFieldRules: cloneCollection(input.caseWorkbenchFieldRules),
    outputTemplateSettings: cloneCollection(input.outputTemplateSettings),
    outputTemplateVersions: cloneCollection(input.outputTemplateVersions),
    importJobs: cloneCollection(input.importJobs),
    brokerageCases: cloneCollection(input.brokerageCases),
    extractionReviewItems: cloneCollection(input.extractionReviewItems),
    guaranteeApplicationDrafts: cloneCollection(input.guaranteeApplicationDrafts),
    correctionEvents: cloneCollection(input.correctionEvents),
    aiExperienceDrafts: cloneCollection(input.aiExperienceDrafts),
    attachments: cloneCollection(input.attachments),
    generatedOutputs: cloneCollection(input.generatedOutputs),
  };
}

function qaBusinessDataCounts(): QaBusinessDataCounts {
  return {
    tenants: db.tenants.length,
    tenantMemberships: db.tenantMemberships.length,
    clients: db.clients.length,
    properties: db.properties.length,
    quotations: db.quotations.length,
    followUps: db.followUps.length,
    tasks: db.tasks.length,
    auditLogs: db.auditLogs.length,
    importJobs: db.importJobs.length,
    brokerageCases: db.brokerageCases.length,
    extractionReviewItems: db.extractionReviewItems.length,
    guaranteeApplicationDrafts: db.guaranteeApplicationDrafts.length,
    correctionEvents: db.correctionEvents.length,
    aiExperienceDrafts: db.aiExperienceDrafts.length,
    attachments: db.attachments.length,
    generatedOutputs: db.generatedOutputs.length,
  };
}

function createQaBlankTemplateSettings() {
  const templateSettings = getDefaultOutputTemplateSettings("user_demo");
  templateSettings.companyName = cherryOutputTemplate.companyName;
  templateSettings.department = cherryOutputTemplate.department;
  templateSettings.representative = cherryOutputTemplate.representative;
  templateSettings.licenseNumber = cherryOutputTemplate.licenseNumber;
  templateSettings.postalAddress = cherryOutputTemplate.postalAddress;
  templateSettings.phone = cherryOutputTemplate.phone;
  templateSettings.email = cherryOutputTemplate.email;
  return templateSettings;
}


const cherryOutputTemplate = getDefaultOutputTemplateSettings("user_demo");
cherryOutputTemplate.companyName = "Cherry Investment株式会社";
cherryOutputTemplate.department = "不動産仲介部";
cherryOutputTemplate.representative = "李 杰明";
cherryOutputTemplate.licenseNumber = "宅地建物取引業免許番号 東京都知事(2)第98765号";
cherryOutputTemplate.postalAddress = "東京都港区六本木3-2-1 CherryビルXF";
cherryOutputTemplate.phone = "03-6234-5678";
cherryOutputTemplate.email = "info@cherry-investment.co.jp";

const _g = globalThis as typeof globalThis & { __brokerDb?: DB };

const _freshDb: DB = withDefaultTenantScope({
  users: [
    {
      id: "user_demo",
      name: "李 杰明",
      email: "lijieming@cherry-investment.co.jp",
      passwordHash: "demo_password_hash",
      externalAuthSubject: "demo:user_demo",
      createdAt: new Date(now - 60 * 24 * 60 * 60 * 1000),
    },
    {
      id: "user_ops",
      name: "運用担当 佐伯",
      email: "ops@brokerdesk.local",
      passwordHash: "ops_demo_password_hash",
      externalAuthSubject: "demo:user_ops",
      createdAt: new Date(now - 45 * 24 * 60 * 60 * 1000),
    },
  ],
  tenants: [
    {
      id: "tenant_cherry",
      name: "Cherry Investment株式会社",
      slug: "cherry-investment",
      accountType: "company",
      status: "active",
      purchasedSeatCount: 8,
      createdAt: new Date(now - 90 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
    },
  ],
  tenantMemberships: [
    {
      id: "membership_cherry_owner",
      tenantId: "tenant_cherry",
      userId: "user_demo",
      role: "tenant_owner",
      status: "active",
      invitationProvider: "manual",
      invitationStatus: "accepted",
      invitationAcceptedAt: new Date(now - 90 * 24 * 60 * 60 * 1000),
      createdAt: new Date(now - 90 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
    },
    {
      id: "membership_cherry_admin",
      tenantId: "tenant_cherry",
      userId: "user_ops",
      role: "tenant_admin",
      status: "active",
      invitationProvider: "manual",
      invitationStatus: "accepted",
      invitationAcceptedAt: new Date(now - 45 * 24 * 60 * 60 * 1000),
      createdAt: new Date(now - 45 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
    },
  ],
  properties: [
    {
      id: "prop_minato_tower",
      name: "港区グランドタワー 8F",
      area: "港区",
      address: "東京都港区麻布台2-3-5",
      listingPrice: 135000000,
      sizeSqm: 82.4,
      managementFee: 44000,
      repairFee: 18000,
      notes: "タワーマンション、眺望良好、駅徒歩4分",
      createdAt: new Date(now - 20 * 24 * 60 * 60 * 1000),
    },
    {
      id: "prop_shibuya_court",
      name: "渋谷コートレジデンス 12F",
      area: "渋谷区",
      address: "東京都渋谷区代々木4-1-8",
      listingPrice: 88000000,
      sizeSqm: 68.5,
      managementFee: 36000,
      repairFee: 13000,
      notes: "渋谷駅徒歩8分、2022年築",
      createdAt: new Date(now - 15 * 24 * 60 * 60 * 1000),
    },
    {
      id: "prop_setagaya_garden",
      name: "世田谷ガーデンテラス",
      area: "世田谷区",
      address: "東京都世田谷区等々力3-12-6",
      listingPrice: 72000000,
      sizeSqm: 71.2,
      managementFee: 28000,
      repairFee: 11000,
      notes: "閑静な住宅街、庭付き低層マンション",
      createdAt: new Date(now - 18 * 24 * 60 * 60 * 1000),
    },
    {
      id: "prop_kawasaki_inv",
      name: "川崎南町投資マンション 3F",
      area: "川崎区",
      address: "神奈川県川崎市川崎区南町9-4",
      listingPrice: 48000000,
      sizeSqm: 44.8,
      managementFee: 18000,
      repairFee: 9000,
      notes: "表面利回り約5.2%、現況賃貸中",
      createdAt: new Date(now - 12 * 24 * 60 * 60 * 1000),
    },
    {
      id: "prop_bunkyo_soleil",
      name: "文京区ソレイユ 6F",
      area: "文京区",
      address: "東京都文京区本郷5-7-3",
      listingPrice: 95000000,
      sizeSqm: 74.6,
      managementFee: 38000,
      repairFee: 15000,
      notes: "東大前駅徒歩5分、閑静な文教エリア",
      createdAt: new Date(now - 25 * 24 * 60 * 60 * 1000),
    },
  ],
  clients: [
    {
      id: "client_yamada",
      name: "山田 健太 様",
      phone: "090-1234-5001",
      lineId: "yamada_kenta_inv",
      email: "yamada.kenta@example.jp",
      budgetMin: 120000000,
      budgetMax: 145000000,
      budgetType: "total_price",
      preferredArea: "港区 / 中央区",
      firstChoiceArea: "港区",
      secondChoiceArea: "中央区",
      purpose: "investment",
      loanPreApprovalStatus: "approved",
      desiredMoveInPeriod: "2026年Q3運用開始",
      stage: "negotiating",
      temperature: "high",
      brokerageContractType: "exclusive",
      brokerageContractSignedAt: new Date(now - 18 * 24 * 60 * 60 * 1000),
      brokerageContractExpiresAt: new Date(now + 75 * 24 * 60 * 60 * 1000),
      importantMattersExplainedAt: undefined,
      contractDocumentDeliveredAt: undefined,
      personalInfoConsentAt: new Date(now - 18 * 24 * 60 * 60 * 1000),
      amlCheckStatus: "pending",
      lastContactedAt: new Date(now - 4 * 24 * 60 * 60 * 1000),
      nextFollowUpAt: new Date(now + 1 * 24 * 60 * 60 * 1000),
      notes: "利回り重視。港区タワー物件に強い関心。頭金3500万円準備済み。AML書類は提出待ち。",
      ownerUserId: "user_demo",
      createdAt: new Date(now - 18 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 4 * 24 * 60 * 60 * 1000),
    },
    {
      id: "client_li_meiling",
      name: "李 美玲 様",
      phone: "090-1234-5002",
      lineId: "li_meiling_home",
      budgetMin: 80000000,
      budgetMax: 95000000,
      budgetType: "total_price",
      preferredArea: "渋谷区 / 目黒区",
      firstChoiceArea: "渋谷区",
      secondChoiceArea: "目黒区",
      purpose: "self_use",
      loanPreApprovalStatus: "approved",
      desiredMoveInPeriod: "2026年7月入居希望",
      stage: "viewing",
      temperature: "medium",
      brokerageContractType: "exclusive",
      brokerageContractSignedAt: new Date(now - 14 * 24 * 60 * 60 * 1000),
      brokerageContractExpiresAt: new Date(now + 73 * 24 * 60 * 60 * 1000),
      importantMattersExplainedAt: undefined,
      contractDocumentDeliveredAt: undefined,
      personalInfoConsentAt: new Date(now - 14 * 24 * 60 * 60 * 1000),
      amlCheckStatus: "verified",
      lastContactedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      nextFollowUpAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      notes: "渋谷コートレジデンスを内見済み。ネックは駐車場の有無。夫婦で再確認予定。",
      ownerUserId: "user_demo",
      createdAt: new Date(now - 14 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
    },
    {
      id: "client_tamura",
      name: "田村 翔太 様",
      phone: "090-1234-5003",
      budgetMin: 65000000,
      budgetMax: 78000000,
      budgetType: "total_price",
      preferredArea: "世田谷区 / 杉並区",
      firstChoiceArea: "世田谷区",
      secondChoiceArea: "杉並区",
      purpose: "self_use",
      loanPreApprovalStatus: "screening",
      desiredMoveInPeriod: "2026年秋入居",
      stage: "quoted",
      temperature: "high",
      brokerageContractType: "exclusive",
      brokerageContractSignedAt: new Date(now - 12 * 24 * 60 * 60 * 1000),
      brokerageContractExpiresAt: new Date(now + 78 * 24 * 60 * 60 * 1000),
      importantMattersExplainedAt: undefined,
      contractDocumentDeliveredAt: undefined,
      personalInfoConsentAt: new Date(now - 12 * 24 * 60 * 60 * 1000),
      amlCheckStatus: "not_required",
      lastContactedAt: new Date(now - 6 * 24 * 60 * 60 * 1000),
      nextFollowUpAt: new Date(now + 2 * 24 * 60 * 60 * 1000),
      notes: "世田谷ガーデンテラスに関心あり。ローン事前審査中。子育て環境を重視。",
      ownerUserId: "user_demo",
      createdAt: new Date(now - 12 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 6 * 24 * 60 * 60 * 1000),
    },
    {
      id: "client_wang_haoran",
      name: "王 浩然 様",
      phone: "090-1234-5004",
      lineId: "wang_haoran_inv",
      budgetMin: 42000000,
      budgetMax: 55000000,
      budgetType: "total_price",
      preferredArea: "川崎市 / 横浜市",
      firstChoiceArea: "川崎区",
      secondChoiceArea: "横浜市鶴見区",
      purpose: "investment",
      loanPreApprovalStatus: "not_applied",
      desiredMoveInPeriod: "時期未定（賃貸中物件希望）",
      stage: "contacted",
      temperature: "medium",
      brokerageContractType: "general",
      brokerageContractSignedAt: new Date(now - 25 * 24 * 60 * 60 * 1000),
      brokerageContractExpiresAt: new Date(now + 10 * 24 * 60 * 60 * 1000),
      importantMattersExplainedAt: undefined,
      contractDocumentDeliveredAt: undefined,
      personalInfoConsentAt: undefined,
      amlCheckStatus: "not_required",
      lastContactedAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
      nextFollowUpAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
      notes: "キャッシュフロー優先。融資付きの現況賃貸物件を希望。個資同意書未取得。",
      ownerUserId: "user_demo",
      createdAt: new Date(now - 25 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
    },
    {
      id: "client_nakamura",
      name: "中村 恵子 様",
      phone: "090-1234-5005",
      email: "nakamura.keiko@example.jp",
      budgetMin: 88000000,
      budgetMax: 100000000,
      budgetType: "total_price",
      preferredArea: "文京区",
      firstChoiceArea: "文京区",
      secondChoiceArea: "豊島区",
      purpose: "self_use",
      loanPreApprovalStatus: "approved",
      desiredMoveInPeriod: "2026年4月入居（成約済み）",
      stage: "won",
      temperature: "high",
      brokerageContractType: "exclusive_exclusive",
      brokerageContractSignedAt: new Date(now - 45 * 24 * 60 * 60 * 1000),
      brokerageContractExpiresAt: new Date(now + 45 * 24 * 60 * 60 * 1000),
      importantMattersExplainedAt: new Date(now - 12 * 24 * 60 * 60 * 1000),
      contractDocumentDeliveredAt: new Date(now - 8 * 24 * 60 * 60 * 1000),
      personalInfoConsentAt: new Date(now - 45 * 24 * 60 * 60 * 1000),
      amlCheckStatus: "verified",
      lastContactedAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
      nextFollowUpAt: new Date(now + 14 * 24 * 60 * 60 * 1000),
      notes: "文京区ソレイユにて成約。引渡し2026/04/15予定。アフターフォロー継続中。",
      ownerUserId: "user_demo",
      createdAt: new Date(now - 45 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
    },
    {
      id: "client_matsushita",
      name: "松下 大輝 様",
      phone: "090-1234-5006",
      budgetMin: 55000000,
      budgetMax: 70000000,
      budgetType: "total_price",
      preferredArea: "品川区 / 目黒区",
      firstChoiceArea: "品川区",
      secondChoiceArea: "目黒区",
      purpose: "self_use",
      loanPreApprovalStatus: "not_applied",
      desiredMoveInPeriod: "2027年春（長期検討）",
      stage: "lead",
      temperature: "low",
      brokerageContractType: "none",
      personalInfoConsentAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      amlCheckStatus: "not_required",
      ownerUserId: "user_demo",
      createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      notes: "SNS広告経由の新規問い合わせ。長期検討中。まず情報収集フェーズ。",
    },
    {
      id: "client_zhang_shufen",
      name: "張 淑芬 様",
      phone: "090-1234-5007",
      lineId: "zhang_shufen",
      budgetMin: 60000000,
      budgetMax: 80000000,
      budgetType: "total_price",
      preferredArea: "新宿区",
      firstChoiceArea: "新宿区",
      purpose: "self_use",
      loanPreApprovalStatus: "rejected",
      desiredMoveInPeriod: "見送り",
      stage: "lost",
      temperature: "low",
      brokerageContractType: "none",
      personalInfoConsentAt: new Date(now - 30 * 24 * 60 * 60 * 1000),
      amlCheckStatus: "verified",
      lastContactedAt: new Date(now - 20 * 24 * 60 * 60 * 1000),
      ownerUserId: "user_demo",
      createdAt: new Date(now - 35 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 20 * 24 * 60 * 60 * 1000),
      notes: "ローン審査否決により見送り。半年後に審査再挑戦の可能性あり。再アプローチ候補。",
    },
  ],
  quotations: [],
  followUps: [
    { id: "fu_yamada_1", clientId: "client_yamada", type: "meeting", content: "初回面談。投資目的・希望エリア・資金計画をヒアリング。港区タワー物件に強い関心。頭金3500万円の準備済みと確認。", nextAction: "港区・中央区の物件2件をピックアップして送付", nextFollowUpAt: new Date(now - 14 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 18 * 24 * 60 * 60 * 1000) },
    { id: "fu_yamada_2", clientId: "client_yamada", type: "email", content: "港区グランドタワー 投資シミュレーションプランAを送付。表面利回り4.1%、キャッシュフロー試算を添付。", nextAction: "電話にて内容確認・質問受付", nextFollowUpAt: new Date(now - 10 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 14 * 24 * 60 * 60 * 1000) },
    { id: "fu_yamada_3", clientId: "client_yamada", type: "call", content: "電話確認。プランAに概ね満足。頭金比率を上げた改訂版を希望。「他社との比較も進めている」とのこと。", nextAction: "改訂プランBを48時間以内に提出", nextFollowUpAt: new Date(now - 8 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000) },
    { id: "fu_yamada_4", clientId: "client_yamada", type: "line", content: "改訂プランB（頭金4000万円版）をLINEで送付。月次キャッシュフロー改善を説明。「前向きに検討」との返信あり。", nextAction: "AML書類の提出を依頼・申込書準備", nextFollowUpAt: new Date(now - 4 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000) },
    { id: "fu_yamada_5", clientId: "client_yamada", type: "call", content: "AML書類提出を改めて依頼。「今週中に用意する」との返答。申込条件（手付金・引渡し時期）の希望も確認。", nextAction: "AML書類受取り後、申込書作成・35条説明準備", nextFollowUpAt: new Date(now + 1 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 4 * 24 * 60 * 60 * 1000) },
    { id: "fu_meiling_1", clientId: "client_li_meiling", type: "line", content: "LINEにて初回ヒアリング。渋谷・目黒エリアで自用マンションを検討中。予算8000〜9500万円。2026年夏入居希望。", nextAction: "渋谷コートレジデンスの資料送付", nextFollowUpAt: new Date(now - 10 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 14 * 24 * 60 * 60 * 1000) },
    { id: "fu_meiling_2", clientId: "client_li_meiling", type: "email", content: "渋谷コートレジデンス 購入提案書・費用見積を送付。月々返済試算：約25.8万円（金利1.5%・35年）。", nextAction: "内見日程の調整", nextFollowUpAt: new Date(now - 5 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000) },
    { id: "fu_meiling_3", clientId: "client_li_meiling", type: "viewing", content: "渋谷コートレジデンス 12F 内見実施。採光・収納に満足。駐車場の有無が懸念点として浮上。ご夫婦で再相談の上、来週中に意思表示予定。", nextAction: "駐車場空き状況を管理会社に確認・共有", nextFollowUpAt: new Date(now - 1 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000) },
    { id: "fu_tamura_1", clientId: "client_tamura", type: "call", content: "電話にて初回ヒアリング。世田谷で子育て環境の良いマンションを希望。夫婦+子供1人。ローン事前審査は現在申込中。", nextAction: "世田谷ガーデンテラスの資料作成・送付", nextFollowUpAt: new Date(now - 8 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 12 * 24 * 60 * 60 * 1000) },
    { id: "fu_tamura_2", clientId: "client_tamura", type: "email", content: "世田谷ガーデンテラス 購入提案書（プランA）を送付。初期費用合計約1050万円、月々返済約19.6万円。内見のご提案も添付。", nextAction: "3日後に返答確認の電話", nextFollowUpAt: new Date(now - 3 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 6 * 24 * 60 * 60 * 1000) },
    { id: "fu_wang_1", clientId: "client_wang_haoran", type: "meeting", content: "面談にて初回ヒアリング。川崎・横浜エリアの現況賃貸中物件を希望。キャッシュフロー重視で利回り5%以上を条件に。", nextAction: "川崎南町物件の詳細資料を送付", nextFollowUpAt: new Date(now - 7 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 25 * 24 * 60 * 60 * 1000) },
    { id: "fu_wang_2", clientId: "client_wang_haoran", type: "line", content: "川崎南町投資マンション資料をLINEで送付。表面利回り5.2%、現況賃料8.3万円/月を説明。「ローン相談を先に進めたい」との返信。", nextAction: "融資相談の段取りをサポート・2日後に状況確認", nextFollowUpAt: new Date(now - 2 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000) },
    { id: "fu_nakamura_1", clientId: "client_nakamura", type: "meeting", content: "初回面談。文京区エリアで自用マンション希望。予算9000万円前後。東大前周辺の静かな環境を希望。ローン事前審査済み。", nextAction: "文京区ソレイユの内見調整", nextFollowUpAt: new Date(now - 35 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 45 * 24 * 60 * 60 * 1000) },
    { id: "fu_nakamura_2", clientId: "client_nakamura", type: "viewing", content: "文京区ソレイユ 6F 内見実施。採光・間取りに大変満足。「ここに決めたい」と強い意向を示す。申込意思を確認。", nextAction: "購入提案書・費用見積の最終版を作成", nextFollowUpAt: new Date(now - 30 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 35 * 24 * 60 * 60 * 1000) },
    { id: "fu_nakamura_3", clientId: "client_nakamura", type: "email", content: "購入提案書・費用見積明細書・資金計画書（最終版）を送付。初期費用合計約1320万円、月々返済約25.1万円。", nextAction: "申込書の記入・提出", nextFollowUpAt: new Date(now - 22 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 28 * 24 * 60 * 60 * 1000) },
    { id: "fu_nakamura_4", clientId: "client_nakamura", type: "meeting", content: "申込書受取り・重要事項説明（35条）を実施。内容確認・署名完了。売買契約書面の交付（37条）も完了。", nextAction: "引渡し前確認・鍵受取り準備", nextFollowUpAt: new Date(now - 8 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 12 * 24 * 60 * 60 * 1000) },
    { id: "fu_nakamura_5", clientId: "client_nakamura", type: "note", content: "成約確定。引渡し日2026年4月15日で合意。引越し業者の手配状況も確認。アフターフォローとして2週間後に再連絡予定。", nextAction: "引渡し当日の立会いスケジュール確認", nextFollowUpAt: new Date(now + 14 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000) },
    { id: "fu_zhang_1", clientId: "client_zhang_shufen", type: "call", content: "ローン事前審査の結果を確認。残念ながら否決。現時点での購入は困難と判断。半年後の再審査に向けてアドバイスを提供。", nextAction: "半年後（2026年9月頃）に再アプローチ", createdById: "user_demo", createdAt: new Date(now - 20 * 24 * 60 * 60 * 1000) },
  ],
  tasks: [
    { id: "task_yamada_aml", clientId: "client_yamada", title: "山田様 AML書類の受取り確認", dueAt: new Date(now + 4 * 60 * 60 * 1000), status: "pending", createdById: "user_demo", createdAt: new Date(now - 4 * 24 * 60 * 60 * 1000) },
    { id: "task_meiling_parking", clientId: "client_li_meiling", title: "李様 渋谷コートレジデンス駐車場空き状況を管理会社へ確認", dueAt: new Date(now - 4 * 60 * 60 * 1000), status: "pending", createdById: "user_demo", createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000) },
    { id: "task_wang_contract", clientId: "client_wang_haoran", title: "王様 一般媒介契約の更新可否を確認（期限10日前）", dueAt: new Date(now + 2 * 24 * 60 * 60 * 1000), status: "pending", createdById: "user_demo", createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000) },
  ],
  auditLogs: [
    { id: "log_1", actorId: "user_demo", userId: "user_demo", action: "client_created", targetType: "client", targetId: "client_yamada", message: "山田 健太 様 を新規登録しました", createdAt: new Date(now - 18 * 24 * 60 * 60 * 1000), context: { source: "seed" } },
    { id: "log_2", actorId: "user_demo", userId: "user_demo", action: "quote_created", targetType: "quote", targetId: "quote_yamada_a", message: "山田様 港区グランドタワー プランA を作成しました", createdAt: new Date(now - 14 * 24 * 60 * 60 * 1000), context: { source: "seed" } },
    { id: "log_3", actorId: "user_demo", userId: "user_demo", action: "stage_changed", targetType: "client", targetId: "client_li_meiling", message: "李 美玲 様 のステージを「内見済み」に更新しました", createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000), context: { source: "seed" } },
    { id: "log_4", actorId: "user_demo", userId: "user_demo", action: "quote_sent", targetType: "quote", targetId: "quote_tamura_a", message: "田村様 世田谷ガーデンテラス プランA を送付済みに更新しました", createdAt: new Date(now - 6 * 24 * 60 * 60 * 1000), context: { source: "seed" } },
    { id: "log_5", actorId: "user_demo", userId: "user_demo", action: "client_won", targetType: "client", targetId: "client_nakamura", message: "中村 恵子 様 が成約しました。文京区ソレイユ", createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000), context: { source: "seed" } },
  ],
  caseWorkbenchFieldRules: [],
  outputTemplateSettings: [cherryOutputTemplate],
  outputTemplateVersions: [
    { id: "tplver_user_demo_001", userId: "user_demo", versionNumber: 1, versionLabel: "標準版 v1", changeNote: "初期標準テンプレート", settingsSnapshot: toTemplateSettingsInput(cherryOutputTemplate), isActive: true, createdAt: new Date(now - 15 * 24 * 60 * 60 * 1000) },
  ],
  importJobs: [
    { id: "import_001", userId: "user_demo", sourceType: "excel", title: "物件台帳_2026Q1.xlsx", targetEntity: "properties", status: "completed", notes: "物件5件を保存", mappingJson: { 物件名: "name", 所在地: "address", エリア: "area", 売出価格: "listing_price" }, validationMessage: "必須項目を充足（4/4）", createdAt: new Date(now - 4 * 24 * 60 * 60 * 1000), updatedAt: new Date(now - 4 * 24 * 60 * 60 * 1000) },
    { id: "import_002", userId: "user_demo", sourceType: "pdf", title: "旧契約書一括登録（3件）", targetEntity: "contracts", status: "mapped", notes: "契約種別の確認待ち", mappingJson: { 契約番号: "contract_number", 契約種別: "contract_type", 物件ID: "property_id" }, validationMessage: "必須項目が不足（署名日）", createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000), updatedAt: new Date(now - 2 * 24 * 60 * 60 * 1000) },
    { id: "import_003", userId: "user_demo", sourceType: "excel", title: "港区グランドタワー_申込資料.xlsx", targetEntity: "properties", status: "mapped", notes: "申込書作成前の確認待ち", validationMessage: "物件名・部屋番号・取扱店情報を確認", createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000), updatedAt: new Date(now - 1 * 24 * 60 * 60 * 1000) },
  ],
  brokerageCases: [
    {
      id: "case_fixture_friends_guarantee_pdf",
      userId: "user_demo",
      caseType: "unit_sale",
      caseTitle: "港区グランドタワー 8F 保証会社申込書",
      primaryPropertyId: "prop_minato_tower",
      status: "reviewed",
      confirmedDataJson: { ...COMPLETE_CASE_FIELD_DEFAULTS },
      sourceImportJobIds: [],
      createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
    },
    {
      id: "case_fixture_extractor_keys_workbench",
      userId: "user_demo",
      caseType: "unit_sale",
      caseTitle: "港区グランドタワー 8F 抽出確認案件",
      primaryPropertyId: "prop_minato_tower",
      status: "reviewed",
      confirmedDataJson: {
        property_name: "港区グランドタワー",
        room_number: "202",
        residential_address: "東京都港区芝公園1-2-3",
        move_in_date: "2026年7月1日",
        rent: "150000",
        management_fee: "9000",
        parking_fee: "12000",
        rent_total: "171000",
        buyer_name: "佐藤 健一",
        buyer_furigana: "サトウ ケンイチ",
        buyer_phone: "090-1111-2222",
        buyer_address: "東京都目黒区中目黒4-5-6",
        workplace_name: "さくら貿易株式会社",
        guarantor_name: "佐藤 直子",
        guarantor_phone: "080-1111-2222",
        broker_a_company_name: "Cherry Investment株式会社",
        broker_a_phone: "03-1111-2222",
      },
      sourceImportJobIds: ["import_003"],
      createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
    },
  ],
  extractionReviewItems: [
    {
      id: "review_fixture_extractor_property_name",
      userId: "user_demo",
      caseId: "case_fixture_extractor_keys_workbench",
      importJobId: "import_003",
      fieldKey: "property_name",
      label: "不動産名称",
      extractedValue: "港区グランドタワー",
      normalizedValue: "港区グランドタワー",
      finalValue: "港区グランドタワー",
      sourceSheet: "申込資料",
      sourceCell: "G40",
      method: "rule",
      confidence: 0.88,
      reviewStatus: "accepted",
      sourceFileHash: "sample-minato-application",
      templateVersion: "sample:minato-application",
      reviewedById: "user_demo",
      reviewedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
    },
    {
      id: "review_fixture_extractor_broker",
      userId: "user_demo",
      caseId: "case_fixture_extractor_keys_workbench",
      importJobId: "import_003",
      fieldKey: "broker_a_company_name",
      label: "宅地建物取引業者A 商号又は名称",
      extractedValue: "Cherry Investment株式会社",
      normalizedValue: "Cherry Investment株式会社",
      finalValue: "Cherry Investment株式会社",
      sourceSheet: "申込資料",
      sourceRange: "G14:AE14",
      method: "rule",
      confidence: 0.82,
      reviewStatus: "accepted",
      sourceFileHash: "sample-minato-application",
      templateVersion: "sample:minato-application",
      reviewedById: "user_demo",
      reviewedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
    },
  ],
  guaranteeApplicationDrafts: [
    {
      id: "draft_fixture_friends_guarantee_pdf",
      userId: "user_demo",
      caseId: "case_fixture_friends_guarantee_pdf",
      templateId: "friends_guarantee_individual_v1",
      companyCode: "friends_guarantee",
      status: "ready",
      fieldValuesJson: {
        "company_option.friends_plan_type": COMPLETE_DRAFT_DEFAULTS["company_option.friends_plan_type"],
        "company_option.friends_consent": COMPLETE_DRAFT_DEFAULTS["company_option.friends_consent"],
        "company_option.friends_collection_agency": COMPLETE_DRAFT_DEFAULTS["company_option.friends_collection_agency"],
        "company_option.friends_single_rider": COMPLETE_DRAFT_DEFAULTS["company_option.friends_single_rider"],
        "company_option.friends_notes": COMPLETE_DRAFT_DEFAULTS["company_option.friends_notes"],
      },
      fieldStatusesJson: {
        "company_option.friends_plan_type": "confirmed",
        "company_option.friends_consent": "confirmed",
        "company_option.friends_collection_agency": "confirmed",
        "company_option.friends_single_rider": "confirmed",
        "company_option.friends_notes": "confirmed",
      },
      lastReviewedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
    },
  ],
  correctionEvents: [],
  aiExperienceDrafts: [],
  attachments: [
    { id: "att_prop_minato_floor", userId: "user_demo", targetType: "property", targetId: "prop_minato_tower", fileName: "港区グランドタワー_間取り図.pdf", fileType: "application/pdf", fileSizeBytes: 924800, storagePath: "demo/property/prop_minato_tower/floorplan.pdf", uploadedAt: new Date(now - 3 * 24 * 60 * 60 * 1000) },
    { id: "att_contract_yamada", userId: "user_demo", targetType: "contract", targetId: "quote_yamada_b", fileName: "売買契約書ドラフト_山田様.pdf", fileType: "application/pdf", fileSizeBytes: 1105920, storagePath: "demo/contracts/quote_yamada_b/draft.pdf", uploadedAt: new Date(now - 2 * 24 * 60 * 60 * 1000) },
  ],
  generatedOutputs: [],
});

if (!_g.__brokerDb) _g.__brokerDb = cloneDb(_freshDb);
const db: DB = _g.__brokerDb;
backfillTenantScope(db);
if (!db.tenants) db.tenants = cloneCollection(_freshDb.tenants);
db.tenants.forEach(ensureTenantDefaults);
if (!db.tenantMemberships) db.tenantMemberships = cloneCollection(_freshDb.tenantMemberships);
db.tenantMemberships.forEach(ensureTenantMembershipDefaults);
if (!db.guaranteeApplicationDrafts) db.guaranteeApplicationDrafts = cloneCollection(_freshDb.guaranteeApplicationDrafts);
if (!db.correctionEvents) db.correctionEvents = [];
if (!db.aiExperienceDrafts) db.aiExperienceDrafts = [];
if (!db.caseWorkbenchFieldRules) db.caseWorkbenchFieldRules = [];

export function resetBusinessDataForQa(): QaBusinessDataCounts {
  const templateSettings = createQaBlankTemplateSettings();

  db.users = cloneCollection(_freshDb.users);
  db.tenants = cloneCollection(_freshDb.tenants);
  db.tenantMemberships = cloneCollection(_freshDb.tenantMemberships);
  db.clients = [];
  db.properties = [];
  db.quotations = [];
  db.followUps = [];
  db.tasks = [];
  db.auditLogs = [];
  db.caseWorkbenchFieldRules = [];
  db.outputTemplateSettings = [templateSettings];
  db.outputTemplateVersions = [
    {
      id: "tplver_user_demo_qa_blank",
      tenantId: DEFAULT_TENANT_ID,
      userId: "user_demo",
      versionNumber: 1,
      versionLabel: "標準版 v1",
      changeNote: "QA blank reset",
      settingsSnapshot: toTemplateSettingsInput(templateSettings),
      isActive: true,
      createdAt: new Date(),
    },
  ];
  db.importJobs = [];
  db.brokerageCases = [];
  db.extractionReviewItems = [];
  db.guaranteeApplicationDrafts = [];
  db.correctionEvents = [];
  db.aiExperienceDrafts = [];
  db.attachments = [];
  db.generatedOutputs = [];

  return qaBusinessDataCounts();
}

export function seedBusinessDataForQa(): QaBusinessDataCounts {
  Object.assign(db, cloneDb(_freshDb));
  backfillTenantScope(db);
  db.tenants.forEach(ensureTenantDefaults);
  db.tenantMemberships.forEach(ensureTenantMembershipDefaults);
  ensureBaseQuoteData();
  ensureRichDemoData();
  return qaBusinessDataCounts();
}

const seedQuoteYamadaA = (() => {
  const data = { listingPrice: 135000000, brokerageFee: 4180000, taxFee: 1450000, managementFee: 44000, repairFee: 18000, otherFee: 850000, downPayment: 35000000, interestRate: 1.65, loanYears: 30 };
  const computed = computeQuote(data);
  return { id: "quote_yamada_a", tenantId: DEFAULT_TENANT_ID, clientId: "client_yamada", propertyId: "prop_minato_tower", quoteTitle: "山田様 港区グランドタワー プランA", ...data, ...computed, summaryText: "頭金3500万円・30年1.65%の条件で月々返済約28.4万円。表面利回り4.1%。申込条件調整中。", status: "sent" as const, createdAt: new Date(now - 14 * 24 * 60 * 60 * 1000), updatedAt: new Date(now - 14 * 24 * 60 * 60 * 1000) } satisfies Quotation;
})();

const seedQuoteYamadaB = (() => {
  const data = { listingPrice: 135000000, brokerageFee: 4180000, taxFee: 1450000, managementFee: 44000, repairFee: 18000, otherFee: 850000, downPayment: 40000000, interestRate: 1.65, loanYears: 30 };
  const computed = computeQuote(data);
  return { id: "quote_yamada_b", tenantId: DEFAULT_TENANT_ID, clientId: "client_yamada", propertyId: "prop_minato_tower", quoteTitle: "山田様 港区グランドタワー プランB（頭金増額）", ...data, ...computed, summaryText: "頭金4000万円に増額。月々返済約26.9万円に改善。キャッシュフロー負担を軽減したプラン。", status: "revised" as const, createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000), updatedAt: new Date(now - 8 * 24 * 60 * 60 * 1000) } satisfies Quotation;
})();

const seedQuoteMeiling = (() => {
  const data = { listingPrice: 88000000, brokerageFee: 2740000, taxFee: 960000, managementFee: 36000, repairFee: 13000, otherFee: 580000, downPayment: 15000000, interestRate: 1.5, loanYears: 35 };
  const computed = computeQuote(data);
  return { id: "quote_meiling_a", tenantId: DEFAULT_TENANT_ID, clientId: "client_li_meiling", propertyId: "prop_shibuya_court", quoteTitle: "李様 渋谷コートレジデンス プランA", ...data, ...computed, summaryText: "頭金1500万円・35年1.5%。月々返済約25.8万円。内見済み、申込意向確認待ち。", status: "sent" as const, createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000), updatedAt: new Date(now - 8 * 24 * 60 * 60 * 1000) } satisfies Quotation;
})();

const seedQuoteTamura = (() => {
  const data = { listingPrice: 72000000, brokerageFee: 2260000, taxFee: 790000, managementFee: 28000, repairFee: 11000, otherFee: 480000, downPayment: 12000000, interestRate: 1.55, loanYears: 35 };
  const computed = computeQuote(data);
  return { id: "quote_tamura_a", tenantId: DEFAULT_TENANT_ID, clientId: "client_tamura", propertyId: "prop_setagaya_garden", quoteTitle: "田村様 世田谷ガーデンテラス プランA", ...data, ...computed, summaryText: "頭金1200万円・35年1.55%。月々返済約19.6万円。送付後6日経過、返答待ち。", status: "sent" as const, createdAt: new Date(now - 6 * 24 * 60 * 60 * 1000), updatedAt: new Date(now - 6 * 24 * 60 * 60 * 1000) } satisfies Quotation;
})();

const seedQuoteNakamura = (() => {
  const data = { listingPrice: 95000000, brokerageFee: 2950000, taxFee: 1030000, managementFee: 38000, repairFee: 15000, otherFee: 620000, downPayment: 18000000, interestRate: 1.45, loanYears: 35 };
  const computed = computeQuote(data);
  return { id: "quote_nakamura_a", tenantId: DEFAULT_TENANT_ID, clientId: "client_nakamura", propertyId: "prop_bunkyo_soleil", quoteTitle: "中村様 文京区ソレイユ 最終プラン（成約）", ...data, ...computed, summaryText: "成約済み。引渡し2026年4月15日予定。頭金1800万円・35年1.45%・月々約25.1万円。", status: "sent" as const, createdAt: new Date(now - 28 * 24 * 60 * 60 * 1000), updatedAt: new Date(now - 12 * 24 * 60 * 60 * 1000) } satisfies Quotation;
})();

function ensureBaseQuoteData() {
  if (db.quotations.length > 0) return;
  db.quotations.push(seedQuoteYamadaA, seedQuoteYamadaB, seedQuoteMeiling, seedQuoteTamura, seedQuoteNakamura);
}
ensureBaseQuoteData();

function dateAgo(days: number, hours = 0): Date {
  return new Date(now - (days * 24 + hours) * 60 * 60 * 1000);
}

function dateFromNow(days: number, hours = 0): Date {
  return new Date(now + (days * 24 + hours) * 60 * 60 * 1000);
}

function pushMissingById<T extends { id: string }>(collection: T[], items: T[]) {
  items.forEach((item) => {
    if (!collection.some((existing) => existing.id === item.id)) {
      collection.push(item);
    }
  });
}

function demoQuote(input: {
  id: string;
  clientId: string;
  propertyId: string;
  quoteTitle: string;
  listingPrice: number;
  brokerageFee: number;
  taxFee: number;
  managementFee: number;
  repairFee: number;
  otherFee: number;
  downPayment: number;
  interestRate: number;
  loanYears: number;
  summaryText: string;
  status: QuoteStatus;
  createdAt: Date;
  updatedAt?: Date;
}): Quotation {
  const data = {
    listingPrice: input.listingPrice,
    brokerageFee: input.brokerageFee,
    taxFee: input.taxFee,
    managementFee: input.managementFee,
    repairFee: input.repairFee,
    otherFee: input.otherFee,
    downPayment: input.downPayment,
    interestRate: input.interestRate,
    loanYears: input.loanYears,
  };
  return {
    id: input.id,
    tenantId: DEFAULT_TENANT_ID,
    clientId: input.clientId,
    propertyId: input.propertyId,
    quoteTitle: input.quoteTitle,
    ...data,
    ...computeQuote(data),
    summaryText: input.summaryText,
    status: input.status,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  };
}

function caseData(overrides: Record<string, string>): Record<string, string> {
  return { ...COMPLETE_CASE_FIELD_DEFAULTS, ...overrides };
}

function confirmedStatuses(values: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.keys(values).map((key) => [key, "confirmed"]));
}

function ensureRichDemoData() {
  const demoUsers = [
    {
      id: "user_broker_mori",
      name: "森 拓也",
      email: "mori@cherry-investment.co.jp",
      passwordHash: "demo_password_hash",
      externalAuthSubject: "demo:user_broker_mori",
      createdAt: dateAgo(32),
    },
    {
      id: "user_reviewer_kim",
      name: "金 美佳",
      email: "kim@cherry-investment.co.jp",
      passwordHash: "demo_password_hash",
      externalAuthSubject: "demo:user_reviewer_kim",
      createdAt: dateAgo(22),
    },
    {
      id: "user_invited_sato",
      name: "佐藤 招待中",
      email: "sato.invited@cherry-investment.co.jp",
      passwordHash: "invited_demo_password_hash",
      createdAt: dateAgo(2),
    },
  ] satisfies User[];

  const demoMemberships = [
    {
      id: "membership_cherry_broker_mori",
      tenantId: DEFAULT_TENANT_ID,
      userId: "user_broker_mori",
      role: "broker",
      status: "active",
      invitationProvider: "manual",
      invitationStatus: "accepted",
      invitationAcceptedAt: dateAgo(32),
      createdAt: dateAgo(32),
      updatedAt: dateAgo(4),
    },
    {
      id: "membership_cherry_reviewer_kim",
      tenantId: DEFAULT_TENANT_ID,
      userId: "user_reviewer_kim",
      role: "reviewer",
      status: "active",
      invitationProvider: "manual",
      invitationStatus: "accepted",
      invitationAcceptedAt: dateAgo(22),
      createdAt: dateAgo(22),
      updatedAt: dateAgo(3),
    },
    {
      id: "membership_cherry_invited_sato",
      tenantId: DEFAULT_TENANT_ID,
      userId: "user_invited_sato",
      role: "data_operator",
      status: "invited",
      invitationProvider: "clerk",
      invitationStatus: "pending",
      providerInvitationId: "clerk_inv_demo_sato",
      invitationUrl: "https://accounts.example.local/invitations/clerk_inv_demo_sato",
      invitationSentAt: dateAgo(1, 3),
      createdAt: dateAgo(1, 3),
      updatedAt: dateAgo(1, 3),
    },
  ] satisfies TenantMembership[];

  const demoProperties = [
    { id: "prop_roppongi_hills_west", tenantId: DEFAULT_TENANT_ID, name: "六本木ヒルズウェスト 21F", area: "港区", address: "東京都港区六本木6-12-4", listingPrice: 188000000, sizeSqm: 96.3, managementFee: 62000, repairFee: 24000, notes: "高層階・法人契約相談可・駐車場空き確認中", createdAt: dateAgo(10) },
    { id: "prop_ebisu_prime", tenantId: DEFAULT_TENANT_ID, name: "恵比寿プライムレジデンス 9F", area: "渋谷区", address: "東京都渋谷区恵比寿南2-14-8", listingPrice: 112000000, sizeSqm: 73.1, managementFee: 42000, repairFee: 16000, notes: "駅徒歩6分、自己居住向けの問い合わせが多い", createdAt: dateAgo(9) },
    { id: "prop_toyosu_bay", tenantId: DEFAULT_TENANT_ID, name: "豊洲ベイサイドタワー 18F", area: "江東区", address: "東京都江東区豊洲5-1-9", listingPrice: 98000000, sizeSqm: 78.8, managementFee: 39000, repairFee: 14000, notes: "ファミリー向け、眺望良好、管理状態良好", createdAt: dateAgo(8) },
    { id: "prop_nakameguro_duplex", tenantId: DEFAULT_TENANT_ID, name: "中目黒デュープレックス 4F", area: "目黒区", address: "東京都目黒区青葉台1-18-7", listingPrice: 126000000, sizeSqm: 69.4, managementFee: 41000, repairFee: 15000, notes: "SOHO相談可、内見希望が集中", createdAt: dateAgo(7) },
    { id: "prop_kachidoki_rent", tenantId: DEFAULT_TENANT_ID, name: "勝どきリバーサイド 1503", area: "中央区", address: "東京都中央区勝どき4-8-2", listingPrice: 82000000, sizeSqm: 61.5, managementFee: 33000, repairFee: 12000, notes: "賃貸申込あり。保証会社申込書準備中", createdAt: dateAgo(6) },
    { id: "prop_yokohama_minato", tenantId: DEFAULT_TENANT_ID, name: "横浜みなとみらいレジデンス 11F", area: "横浜市西区", address: "神奈川県横浜市西区みなとみらい4-6-2", listingPrice: 76000000, sizeSqm: 66.9, managementFee: 31000, repairFee: 13000, notes: "海外投資家からの問い合わせあり", createdAt: dateAgo(5) },
    { id: "prop_shinjuku_office", tenantId: DEFAULT_TENANT_ID, name: "新宿御苑前オフィス 5F", area: "新宿区", address: "東京都新宿区新宿1-7-10", listingPrice: 54000000, sizeSqm: 38.2, managementFee: 24000, repairFee: 9000, notes: "事務所利用。保証会社は法人プラン確認中", createdAt: dateAgo(4) },
  ] satisfies Property[];

  const profile = (type: "individual" | "corporate", role: string, status = "正式", note?: string) =>
    [`主体类型: ${type === "individual" ? "个人" : "法人/公司"}`, `主体角色: ${role}`, `建档状态: ${status}`, note ? `备注: ${note}` : ""].filter(Boolean).join("\n");

  const demoClients = [
    { id: "client_sato_kenichi", tenantId: DEFAULT_TENANT_ID, name: "佐藤 健一 様", phone: "090-6612-1101", lineId: "sato_home_2026", email: "kenichi.sato@example.jp", budgetMin: 90000000, budgetMax: 120000000, budgetType: "total_price", preferredArea: "豊洲 / 勝どき", firstChoiceArea: "豊洲", secondChoiceArea: "勝どき", purpose: "self_use", loanPreApprovalStatus: "screening", desiredMoveInPeriod: "2026年8月入居希望", stage: "viewing", temperature: "high", brokerageContractType: "exclusive", brokerageContractSignedAt: dateAgo(12), brokerageContractExpiresAt: dateFromNow(78), personalInfoConsentAt: dateAgo(12), amlCheckStatus: "verified", nextFollowUpAt: dateFromNow(0, 5), lastContactedAt: dateAgo(0, 5), notes: profile("individual", "买方", "正式", "豊洲ベイサイド内見済み。家族4名。"), ownerUserId: "user_demo", createdAt: dateAgo(18), updatedAt: dateAgo(0, 5) },
    { id: "client_chen_liang", tenantId: DEFAULT_TENANT_ID, name: "陳 亮 様", phone: "080-7711-2244", lineId: "chen_tokyo", email: "liang.chen@example.com", budgetMin: 110000000, budgetMax: 150000000, budgetType: "total_price", preferredArea: "中目黒 / 恵比寿", firstChoiceArea: "中目黒", secondChoiceArea: "恵比寿", purpose: "investment", loanPreApprovalStatus: "approved", desiredMoveInPeriod: "2026年夏までに運用開始", stage: "negotiating", temperature: "high", brokerageContractType: "general", brokerageContractSignedAt: dateAgo(16), brokerageContractExpiresAt: dateFromNow(60), personalInfoConsentAt: dateAgo(16), amlCheckStatus: "pending", nextFollowUpAt: dateFromNow(1), lastContactedAt: dateAgo(1), notes: profile("individual", "买方", "正式", "中目黒デュープレックスで価格交渉中。"), ownerUserId: "user_demo", createdAt: dateAgo(21), updatedAt: dateAgo(1) },
    { id: "client_kobayashi_owner", tenantId: DEFAULT_TENANT_ID, name: "小林 洋子 様", phone: "090-8820-3011", lineId: "kobayashi_owner", email: "yoko.kobayashi@example.jp", budgetMin: 0, budgetMax: 0, budgetType: "total_price", preferredArea: "勝どき", firstChoiceArea: "勝どき", purpose: "investment", loanPreApprovalStatus: "not_applied", desiredMoveInPeriod: "賃貸募集開始済み", stage: "quoted", temperature: "medium", brokerageContractType: "exclusive_exclusive", brokerageContractSignedAt: dateAgo(23), brokerageContractExpiresAt: dateFromNow(67), personalInfoConsentAt: dateAgo(23), amlCheckStatus: "verified", nextFollowUpAt: dateFromNow(2), lastContactedAt: dateAgo(2), notes: profile("individual", "业主", "正式", "勝どきリバーサイドの貸主。保証会社審査中。"), ownerUserId: "user_demo", createdAt: dateAgo(24), updatedAt: dateAgo(2) },
    { id: "client_garcia_maria", tenantId: DEFAULT_TENANT_ID, name: "マリア ガルシア 様", phone: "080-4433-9088", lineId: "maria_rent_tokyo", email: "maria.garcia@example.com", budgetMin: 240000, budgetMax: 310000, budgetType: "monthly_payment", preferredArea: "港区 / 渋谷区", firstChoiceArea: "港区", secondChoiceArea: "渋谷区", purpose: "self_use", loanPreApprovalStatus: "not_applied", desiredMoveInPeriod: "2026年7月中旬", stage: "quoted", temperature: "medium", brokerageContractType: "none", personalInfoConsentAt: dateAgo(3), amlCheckStatus: "not_required", nextFollowUpAt: dateFromNow(0, 2), lastContactedAt: dateAgo(0, 8), notes: profile("individual", "租客/入居者", "建档中", "在留カード表裏を再提出予定。"), ownerUserId: "user_demo", createdAt: dateAgo(8), updatedAt: dateAgo(0, 8) },
    { id: "client_okada_parent", tenantId: DEFAULT_TENANT_ID, name: "岡田 一郎 様", phone: "090-1188-7722", lineId: "okada_parent", email: "ichiro.okada@example.jp", budgetMin: 0, budgetMax: 0, budgetType: "total_price", preferredArea: "港区", firstChoiceArea: "港区", secondChoiceArea: "品川区", purpose: "self_use", loanPreApprovalStatus: "not_applied", stage: "contacted", temperature: "medium", brokerageContractType: "none", personalInfoConsentAt: dateAgo(5), amlCheckStatus: "not_required", nextFollowUpAt: dateFromNow(3), lastContactedAt: dateAgo(3), notes: profile("individual", "连带保证人", "正式", "申込者の父。勤務先情報確認済み。"), ownerUserId: "user_demo", createdAt: dateAgo(9), updatedAt: dateAgo(3) },
    { id: "client_tokyo_asset", tenantId: DEFAULT_TENANT_ID, name: "東京アセット管理株式会社", phone: "03-6421-2200", lineId: "tokyo_asset_pm", email: "pm@tokyo-asset.example.jp", budgetMin: 0, budgetMax: 0, budgetType: "total_price", preferredArea: "港区 / 中央区", purpose: "investment", loanPreApprovalStatus: "not_applied", stage: "contacted", temperature: "low", brokerageContractType: "general", brokerageContractSignedAt: dateAgo(35), brokerageContractExpiresAt: dateFromNow(55), amlCheckStatus: "verified", nextFollowUpAt: dateFromNow(6), lastContactedAt: dateAgo(7), notes: profile("corporate", "管理公司", "正式", "管理会社。修繕積立金と管理費の確認窓口。"), ownerUserId: "user_demo", createdAt: dateAgo(35), updatedAt: dateAgo(7) },
    { id: "client_minato_realty", tenantId: DEFAULT_TENANT_ID, name: "港区リアルティ株式会社", phone: "03-5545-8100", lineId: "minato_realty", email: "sales@minato-realty.example.jp", budgetMin: 0, budgetMax: 0, budgetType: "total_price", preferredArea: "港区", purpose: "investment", loanPreApprovalStatus: "not_applied", stage: "contacted", temperature: "medium", brokerageContractType: "general", amlCheckStatus: "verified", nextFollowUpAt: dateFromNow(4), lastContactedAt: dateAgo(4), notes: profile("corporate", "仲介公司", "正式", "共同仲介。申込書類の原本確認担当。"), ownerUserId: "user_demo", createdAt: dateAgo(14), updatedAt: dateAgo(4) },
    { id: "client_yoon_seojun", tenantId: DEFAULT_TENANT_ID, name: "ユン ソジュン 様", phone: "080-9292-6140", lineId: "yoon_invest", email: "seojun.yoon@example.kr", budgetMin: 70000000, budgetMax: 90000000, budgetType: "total_price", preferredArea: "横浜 / 川崎", firstChoiceArea: "横浜", secondChoiceArea: "川崎", purpose: "investment", loanPreApprovalStatus: "screening", desiredMoveInPeriod: "2026年Q4", stage: "lead", temperature: "low", brokerageContractType: "none", amlCheckStatus: "pending", nextFollowUpAt: dateFromNow(5), lastContactedAt: dateAgo(6), notes: profile("individual", "买方", "建档中", "海外送金の予定時期を確認中。"), ownerUserId: "user_demo", createdAt: dateAgo(6), updatedAt: dateAgo(6) },
    { id: "client_nagata_rent", tenantId: DEFAULT_TENANT_ID, name: "永田 沙織 様", phone: "090-3344-6789", lineId: "nagata_rent", email: "saori.nagata@example.jp", budgetMin: 180000, budgetMax: 230000, budgetType: "monthly_payment", preferredArea: "新宿区 / 文京区", firstChoiceArea: "新宿区", secondChoiceArea: "文京区", purpose: "self_use", loanPreApprovalStatus: "not_applied", desiredMoveInPeriod: "2026年9月", stage: "lead", temperature: "medium", brokerageContractType: "none", amlCheckStatus: "not_required", nextFollowUpAt: dateFromNow(7), lastContactedAt: dateAgo(5), notes: profile("individual", "租客/入居者", "建档中", "勤務先証明を未受領。"), ownerUserId: "user_demo", createdAt: dateAgo(5), updatedAt: dateAgo(5) },
    { id: "client_lu_corporate", tenantId: DEFAULT_TENANT_ID, name: "Lu Trading合同会社", phone: "03-6888-7711", lineId: "lu_trading", email: "office@lu-trading.example.com", budgetMin: 350000, budgetMax: 550000, budgetType: "monthly_payment", preferredArea: "新宿区", purpose: "investment", loanPreApprovalStatus: "not_applied", desiredMoveInPeriod: "2026年8月開業", stage: "viewing", temperature: "high", brokerageContractType: "none", amlCheckStatus: "verified", nextFollowUpAt: dateFromNow(2, 3), lastContactedAt: dateAgo(1, 2), notes: profile("corporate", "申请人", "正式", "新宿御苑前オフィスの法人申込。代表者本人確認済み。"), ownerUserId: "user_demo", createdAt: dateAgo(11), updatedAt: dateAgo(1, 2) },
  ] satisfies Client[];

  const demoQuotations = [
    demoQuote({ id: "quote_sato_toyosu_a", clientId: "client_sato_kenichi", propertyId: "prop_toyosu_bay", quoteTitle: "佐藤様 豊洲ベイサイド 購入費用案", listingPrice: 98000000, brokerageFee: 3100000, taxFee: 1080000, managementFee: 39000, repairFee: 14000, otherFee: 690000, downPayment: 18000000, interestRate: 1.62, loanYears: 35, summaryText: "家族居住前提。初期費用と月額負担の確認待ち。", status: "sent", createdAt: dateAgo(5), updatedAt: dateAgo(1) }),
    demoQuote({ id: "quote_chen_nakameguro_a", clientId: "client_chen_liang", propertyId: "prop_nakameguro_duplex", quoteTitle: "陳様 中目黒デュープレックス 投資案", listingPrice: 126000000, brokerageFee: 3900000, taxFee: 1320000, managementFee: 41000, repairFee: 15000, otherFee: 760000, downPayment: 32000000, interestRate: 1.7, loanYears: 30, summaryText: "賃貸想定利回りと価格交渉を同時に確認中。", status: "revised", createdAt: dateAgo(6), updatedAt: dateAgo(1) }),
    demoQuote({ id: "quote_garcia_kachidoki_rent", clientId: "client_garcia_maria", propertyId: "prop_kachidoki_rent", quoteTitle: "ガルシア様 勝どき賃貸 初期費用", listingPrice: 82000000, brokerageFee: 0, taxFee: 0, managementFee: 33000, repairFee: 12000, otherFee: 340000, downPayment: 0, interestRate: 0, loanYears: 1, summaryText: "賃貸申込。保証会社申込と本人確認資料の再提出待ち。", status: "draft", createdAt: dateAgo(2), updatedAt: dateAgo(0, 6) }),
    demoQuote({ id: "quote_yoon_yokohama_a", clientId: "client_yoon_seojun", propertyId: "prop_yokohama_minato", quoteTitle: "ユン様 みなとみらい 投資初回案", listingPrice: 76000000, brokerageFee: 2440000, taxFee: 850000, managementFee: 31000, repairFee: 13000, otherFee: 520000, downPayment: 18000000, interestRate: 1.85, loanYears: 30, summaryText: "海外投資家向け初回案。送金時期とローン可否を確認中。", status: "draft", createdAt: dateAgo(3), updatedAt: dateAgo(3) }),
    demoQuote({ id: "quote_lu_shinjuku_office", clientId: "client_lu_corporate", propertyId: "prop_shinjuku_office", quoteTitle: "Lu Trading 新宿オフィス 法人申込案", listingPrice: 54000000, brokerageFee: 1780000, taxFee: 620000, managementFee: 24000, repairFee: 9000, otherFee: 410000, downPayment: 9000000, interestRate: 1.9, loanYears: 20, summaryText: "法人利用。保証会社法人プランと契約名義を確認中。", status: "sent", createdAt: dateAgo(4), updatedAt: dateAgo(1, 3) }),
    demoQuote({ id: "quote_matsushita_roppongi", clientId: "client_matsushita", propertyId: "prop_roppongi_hills_west", quoteTitle: "松下様 六本木ヒルズウェスト 高層階案", listingPrice: 188000000, brokerageFee: 5800000, taxFee: 1980000, managementFee: 62000, repairFee: 24000, otherFee: 980000, downPayment: 48000000, interestRate: 1.58, loanYears: 30, summaryText: "富裕層向け。資金証明確認後に再提示。", status: "sent", createdAt: dateAgo(7), updatedAt: dateAgo(2) }),
  ];

  const caseMinato = caseData({ "property.name": "港区グランドタワー", "property.roomNumber": "802", "applicant.name": "ガルシア マリア", "applicant.furigana": "ガルシア マリア", "applicant.birthDate": "1994年9月12日", "applicant.phone": "080-4433-9088", "applicant.currentAddress": "東京都港区芝浦3-8-10", "applicant.employerName": "Global Design株式会社", "applicant.annualIncome": "520" });
  const caseKachidoki = caseData({ "property.name": "勝どきリバーサイド", "property.roomNumber": "1503", "property.postalCode": "1040054", "property.address": "東京都中央区勝どき4-8-2", "lease.rent": "198000", "lease.commonFee": "18000", "lease.monthlyRentTotal": "216000", "applicant.name": "永田 沙織", "applicant.furigana": "ナガタ サオリ", "applicant.phone": "090-3344-6789", "applicant.employerName": "新宿医療法人", "applicant.annualIncome": "430" });
  const caseShinjuku = caseData({ "property.name": "新宿御苑前オフィス", "property.roomNumber": "5F", "property.postalCode": "1600022", "property.address": "東京都新宿区新宿1-7-10", "property.usage": "事務所", "lease.rent": "390000", "lease.commonFee": "45000", "lease.monthlyRentTotal": "435000", "applicant.name": "Lu Trading合同会社", "applicant.furigana": "ルートレーディング", "applicant.phone": "03-6888-7711", "applicant.employerName": "Lu Trading合同会社", "applicant.annualIncome": "1200" });
  const caseYokohama = caseData({ "property.name": "横浜みなとみらいレジデンス", "property.roomNumber": "1102", "property.postalCode": "2200012", "property.address": "神奈川県横浜市西区みなとみらい4-6-2", "applicant.name": "ユン ソジュン", "applicant.furigana": "ユン ソジュン", "applicant.phone": "080-9292-6140", "applicant.currentAddress": "東京都新宿区西新宿2-3-1", "applicant.employerName": "K-Bridge株式会社", "applicant.annualIncome": "780" });

  const demoImportJobs: ImportJob[] = [
    { id: "import_demo_004", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", sourceType: "excel", title: "勝どきリバーサイド_賃貸申込一式.xlsx", targetEntity: "contracts", status: "mapped", notes: "保証会社申込書へ反映前の確認待ち", mappingJson: { 物件名: "property.name", 申込者: "applicant.name", 賃料: "lease.rent" }, validationMessage: "勤務先証明と在留期限を確認", createdAt: dateAgo(0, 8), updatedAt: dateAgo(0, 8) },
    { id: "import_demo_005", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", sourceType: "scan", title: "ガルシア様_在留カード表裏.jpg", targetEntity: "parties", status: "queued", notes: "本人資料の再読取待ち", validationMessage: "画像の一部が反射で読みにくい", createdAt: dateAgo(0, 4), updatedAt: dateAgo(0, 4) },
    { id: "import_demo_006", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", sourceType: "excel", title: "6月新規問合せ_海外投資家.xlsx", targetEntity: "parties", status: "completed", notes: "4件を主体台帳へ保存", mappingJson: { 氏名: "name", 電話: "phone", 希望エリア: "preferredArea" }, validationMessage: "必須項目を充足", createdAt: dateAgo(1, 4), updatedAt: dateAgo(1, 3) },
    { id: "import_demo_007", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", sourceType: "pdf", title: "新宿御苑前オフィス_法人申込書.pdf", targetEntity: "contracts", status: "mapped", notes: "法人代表者情報の確認待ち", validationMessage: "代表者本人確認欄を確認", createdAt: dateAgo(2, 4), updatedAt: dateAgo(2, 2) },
    { id: "import_demo_008", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", sourceType: "excel", title: "管理会社_費用更新_202606.xlsx", targetEntity: "properties", status: "completed", notes: "管理費・修繕積立金を更新", mappingJson: { 管理費: "managementFee", 修繕積立金: "repairFee" }, validationMessage: "7物件を更新", createdAt: dateAgo(3), updatedAt: dateAgo(3) },
    { id: "import_demo_009", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", sourceType: "manual", title: "小林様_貸主聞き取りメモ", targetEntity: "parties", status: "queued", notes: "貸主口座情報は未入力", createdAt: dateAgo(4), updatedAt: dateAgo(4) },
  ];

  const demoCases = [
    { id: "case_demo_garcia_minato", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", caseType: "unit_sale", caseTitle: "ガルシア様 港区グランドタワー 賃貸申込", primaryPropertyId: "prop_minato_tower", status: "draft", confirmedDataJson: caseMinato, sourceImportJobIds: ["import_demo_005"], createdAt: dateAgo(0, 7), updatedAt: dateAgo(0, 3) },
    { id: "case_demo_kachidoki_rent", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", caseType: "unit_sale", caseTitle: "勝どきリバーサイド 1503 保証会社申込", primaryPropertyId: "prop_kachidoki_rent", status: "reviewed", confirmedDataJson: caseKachidoki, sourceImportJobIds: ["import_demo_004"], createdAt: dateAgo(1), updatedAt: dateAgo(0, 6) },
    { id: "case_demo_shinjuku_office", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", caseType: "unit_sale", caseTitle: "Lu Trading 新宿御苑前オフィス 法人申込", primaryPropertyId: "prop_shinjuku_office", status: "reviewed", confirmedDataJson: caseShinjuku, sourceImportJobIds: ["import_demo_007"], createdAt: dateAgo(2), updatedAt: dateAgo(1) },
    { id: "case_demo_yokohama_invest", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", caseType: "unit_sale", caseTitle: "ユン様 横浜みなとみらい 投資案件", primaryPropertyId: "prop_yokohama_minato", status: "draft", confirmedDataJson: caseYokohama, sourceImportJobIds: ["import_demo_006"], createdAt: dateAgo(3), updatedAt: dateAgo(2) },
    { id: "case_demo_ebisu_home", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", caseType: "unit_sale", caseTitle: "李様 恵比寿プライム 追加検討", primaryPropertyId: "prop_ebisu_prime", status: "reviewed", confirmedDataJson: caseData({ "property.name": "恵比寿プライムレジデンス", "property.roomNumber": "903", "property.address": "東京都渋谷区恵比寿南2-14-8", "applicant.name": "李 美玲", "applicant.furigana": "リ メイリン" }), sourceImportJobIds: ["import_001"], createdAt: dateAgo(5), updatedAt: dateAgo(3) },
  ] satisfies BrokerageCase[];

  const draftAllValues = { ...COMPLETE_DRAFT_DEFAULTS };
  const demoDrafts = [
    { id: "draft_demo_kachidoki_nihon", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", caseId: "case_demo_kachidoki_rent", templateId: "nihon_safety_individual_v1", companyCode: "nihon_safety", status: "ready", fieldValuesJson: draftAllValues, fieldStatusesJson: confirmedStatuses(draftAllValues), lastReviewedAt: dateAgo(0, 5), createdAt: dateAgo(1), updatedAt: dateAgo(0, 5) },
    { id: "draft_demo_kachidoki_zenhoren", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", caseId: "case_demo_kachidoki_rent", templateId: "zenhoren_individual_v1", companyCode: "zenhoren", status: "ready", fieldValuesJson: draftAllValues, fieldStatusesJson: confirmedStatuses(draftAllValues), lastReviewedAt: dateAgo(0, 4), createdAt: dateAgo(1), updatedAt: dateAgo(0, 4) },
    { id: "draft_demo_shinjuku_insure", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", caseId: "case_demo_shinjuku_office", templateId: "insure_individual_v1", companyCode: "insure", status: "ready", fieldValuesJson: draftAllValues, fieldStatusesJson: confirmedStatuses(draftAllValues), lastReviewedAt: dateAgo(1), createdAt: dateAgo(2), updatedAt: dateAgo(1) },
    { id: "draft_demo_yokohama_jlease", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", caseId: "case_demo_yokohama_invest", templateId: "j_lease_individual_v1", companyCode: "j_lease", status: "draft", fieldValuesJson: { "company_option.j_lease_product_plan": "住居用プラン" }, fieldStatusesJson: { "company_option.j_lease_product_plan": "confirmed" }, createdAt: dateAgo(2), updatedAt: dateAgo(2) },
  ] satisfies GuaranteeApplicationDraft[];

  const demoReviewItems = [
    { id: "review_demo_kachidoki_name", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", caseId: "case_demo_kachidoki_rent", importJobId: "import_demo_004", fieldKey: "applicant.name", label: "申込者氏名", extractedValue: "永田 沙織", normalizedValue: "永田 沙織", finalValue: "永田 沙織", sourceSheet: "申込者", sourceCell: "B12", method: "mapping", confidence: 0.94, reviewStatus: "accepted", sourceFileHash: "demo-kachidoki-application", templateVersion: "demo:rent-application-v2", reviewedById: "user_demo", reviewedAt: dateAgo(0, 6), createdAt: dateAgo(1) },
    { id: "review_demo_kachidoki_employer", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", caseId: "case_demo_kachidoki_rent", importJobId: "import_demo_004", fieldKey: "applicant.employerName", label: "勤務先名", extractedValue: "新宿医療法人", normalizedValue: "新宿医療法人", finalValue: "新宿医療法人", sourceSheet: "勤務先", sourceCell: "D8", method: "mapping", confidence: 0.87, reviewStatus: "accepted", sourceFileHash: "demo-kachidoki-application", templateVersion: "demo:rent-application-v2", reviewedById: "user_demo", reviewedAt: dateAgo(0, 6), createdAt: dateAgo(1) },
    { id: "review_demo_garcia_card", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", caseId: "case_demo_garcia_minato", importJobId: "import_demo_005", fieldKey: "applicant.residenceCardExpiry", label: "在留カード有効期限", extractedValue: "2027年?月15日", normalizedValue: "2027年8月15日", sourceSheet: "在留カード", sourceRange: "image:front", method: "ocr", confidence: 0.61, reviewStatus: "suggested", sourceFileHash: "demo-garcia-zairyu", templateVersion: "demo:id-card-ocr", reviewedAt: dateAgo(0, 4), createdAt: dateAgo(0, 4) },
    { id: "review_demo_shinjuku_company", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", caseId: "case_demo_shinjuku_office", importJobId: "import_demo_007", fieldKey: "applicant.name", label: "法人名", extractedValue: "Lu Trading合同会社", normalizedValue: "Lu Trading合同会社", finalValue: "Lu Trading合同会社", sourceSheet: "法人申込書", sourceRange: "page1:R4", method: "pdf_text", confidence: 0.92, reviewStatus: "accepted", sourceFileHash: "demo-lu-office", templateVersion: "demo:corporate-application", reviewedById: "user_demo", reviewedAt: dateAgo(1), createdAt: dateAgo(2) },
  ] satisfies ExtractionReviewItem[];

  const demoFollowUps = [
    { id: "fu_sato_1", tenantId: DEFAULT_TENANT_ID, clientId: "client_sato_kenichi", type: "viewing", content: "豊洲ベイサイド内見。学校区と通勤時間を確認。", nextAction: "住宅ローン事前審査の結果を確認", nextFollowUpAt: dateFromNow(0, 5), createdById: "user_demo", createdAt: dateAgo(0, 5) },
    { id: "fu_chen_1", tenantId: DEFAULT_TENANT_ID, clientId: "client_chen_liang", type: "meeting", content: "中目黒デュープレックスの価格交渉条件を整理。", nextAction: "売主側へ価格条件を提示", nextFollowUpAt: dateFromNow(1), createdById: "user_demo", createdAt: dateAgo(1) },
    { id: "fu_garcia_1", tenantId: DEFAULT_TENANT_ID, clientId: "client_garcia_maria", type: "line", content: "在留カード写真に反射あり。再提出を依頼。", nextAction: "本人資料を再読取", nextFollowUpAt: dateFromNow(0, 2), createdById: "user_demo", createdAt: dateAgo(0, 8) },
    { id: "fu_lu_1", tenantId: DEFAULT_TENANT_ID, clientId: "client_lu_corporate", type: "email", content: "法人申込書と代表者本人確認書類を受領。", nextAction: "保証会社法人プランへ進める", nextFollowUpAt: dateFromNow(2, 3), createdById: "user_demo", createdAt: dateAgo(1, 2) },
    { id: "fu_yoon_1", tenantId: DEFAULT_TENANT_ID, clientId: "client_yoon_seojun", type: "call", content: "海外送金スケジュールをヒアリング。", nextAction: "銀行審査に必要な書類一覧を送付", nextFollowUpAt: dateFromNow(5), createdById: "user_demo", createdAt: dateAgo(6) },
  ] satisfies FollowUp[];

  const demoTasks = [
    { id: "task_garcia_id_rescan", tenantId: DEFAULT_TENANT_ID, clientId: "client_garcia_maria", title: "ガルシア様 在留カード再提出分を確認", dueAt: dateFromNow(0, 4), status: "pending", createdById: "user_demo", createdAt: dateAgo(0, 4) },
    { id: "task_kachidoki_company_check", tenantId: DEFAULT_TENANT_ID, clientId: "client_kobayashi_owner", title: "勝どき 管理会社へ保証会社利用可否を確認", dueAt: dateFromNow(1), status: "pending", createdById: "user_demo", createdAt: dateAgo(1) },
    { id: "task_shinjuku_corporate_plan", tenantId: DEFAULT_TENANT_ID, clientId: "client_lu_corporate", title: "法人保証プランの料率を確認", dueAt: dateFromNow(2), status: "pending", createdById: "user_demo", createdAt: dateAgo(1) },
    { id: "task_sato_loan", tenantId: DEFAULT_TENANT_ID, clientId: "client_sato_kenichi", title: "佐藤様 ローン事前審査結果を回収", dueAt: dateFromNow(3), status: "pending", createdById: "user_demo", createdAt: dateAgo(2) },
    { id: "task_chen_price_offer", tenantId: DEFAULT_TENANT_ID, clientId: "client_chen_liang", title: "中目黒 価格交渉案を送付", dueAt: dateAgo(0, 3), status: "done", createdById: "user_demo", createdAt: dateAgo(2) },
    { id: "task_yoon_bank_docs", tenantId: DEFAULT_TENANT_ID, clientId: "client_yoon_seojun", title: "海外投資家向け銀行提出資料リストを作成", dueAt: dateFromNow(5), status: "pending", createdById: "user_demo", createdAt: dateAgo(3) },
  ] satisfies Task[];

  const demoAttachments = [
    { id: "att_demo_sato_income", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", targetType: "party", targetId: "client_sato_kenichi", fileName: "佐藤様_源泉徴収票_2025.pdf", fileType: "application/pdf", fileSizeBytes: 682104, storagePath: "demo/party/client_sato_kenichi/income.pdf", uploadedAt: dateAgo(0, 6) },
    { id: "att_demo_garcia_zairyu", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", targetType: "import_job", targetId: "import_demo_005", fileName: "garcia_residence_card_rescan.jpg", fileType: "image/jpeg", fileSizeBytes: 1842200, storagePath: "demo/import/import_demo_005/residence-card.jpg", uploadedAt: dateAgo(0, 4) },
    { id: "att_demo_kachidoki_floor", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", targetType: "property", targetId: "prop_kachidoki_rent", fileName: "勝どきリバーサイド_間取り図.pdf", fileType: "application/pdf", fileSizeBytes: 744810, storagePath: "demo/property/prop_kachidoki_rent/floorplan.pdf", uploadedAt: dateAgo(1) },
    { id: "att_demo_shinjuku_application", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", targetType: "contract", targetId: "quote_lu_shinjuku_office", fileName: "LuTrading_法人申込書.pdf", fileType: "application/pdf", fileSizeBytes: 1138011, storagePath: "demo/contracts/quote_lu_shinjuku/application.pdf", uploadedAt: dateAgo(1, 2) },
    { id: "att_demo_toyosu_floor", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", targetType: "property", targetId: "prop_toyosu_bay", fileName: "豊洲ベイサイド_販売図面.pdf", fileType: "application/pdf", fileSizeBytes: 980122, storagePath: "demo/property/prop_toyosu_bay/sales.pdf", uploadedAt: dateAgo(2) },
    { id: "att_demo_chen_offer", tenantId: DEFAULT_TENANT_ID, userId: "user_demo", targetType: "quote", targetId: "quote_chen_nakameguro_a", fileName: "中目黒_価格交渉案.xlsx", fileType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileSizeBytes: 302104, storagePath: "demo/quote/quote_chen_nakameguro_a/offer.xlsx", uploadedAt: dateAgo(1) },
  ] satisfies Attachment[];

  const demoOutputs = [
    { id: "out_demo_kachidoki_nihon_pdf", tenantId: DEFAULT_TENANT_ID, actorId: "user_demo", userId: "user_demo", outputType: "guarantee_application", outputFormat: "pdf", language: "ja", title: "日本セーフティー申込書 - 勝どきリバーサイド 1503", documentNumber: "GUA-20260622-001", propertyId: "prop_kachidoki_rent", partyId: "client_nagata_rent", caseId: "case_demo_kachidoki_rent", templateId: "nihon_safety_individual_v1", draftValueSnapshot: draftAllValues, generatedAt: dateAgo(0, 4) },
    { id: "out_demo_shinjuku_insure_pdf", tenantId: DEFAULT_TENANT_ID, actorId: "user_demo", userId: "user_demo", outputType: "guarantee_application", outputFormat: "pdf", language: "ja", title: "インシュア申込書 - 新宿御苑前オフィス", documentNumber: "GUA-20260621-004", propertyId: "prop_shinjuku_office", partyId: "client_lu_corporate", caseId: "case_demo_shinjuku_office", templateId: "insure_individual_v1", draftValueSnapshot: draftAllValues, generatedAt: dateAgo(1) },
    { id: "out_demo_sato_proposal", tenantId: DEFAULT_TENANT_ID, actorId: "user_demo", userId: "user_demo", sourceQuoteId: "quote_sato_toyosu_a", quoteId: "quote_sato_toyosu_a", propertyId: "prop_toyosu_bay", partyId: "client_sato_kenichi", outputType: "proposal", outputFormat: "pdf", language: "zh", title: "购入提案书 - 佐藤様 豊洲ベイサイド", documentNumber: "PROP-20260621-002", templateVersionId: "tplver_user_demo_001", generatedAt: dateAgo(1, 2) },
    { id: "out_demo_sato_estimate", tenantId: DEFAULT_TENANT_ID, actorId: "user_demo", userId: "user_demo", sourceQuoteId: "quote_sato_toyosu_a", quoteId: "quote_sato_toyosu_a", propertyId: "prop_toyosu_bay", partyId: "client_sato_kenichi", outputType: "estimate_sheet", outputFormat: "pdf", language: "ja", title: "費用明細 - 佐藤様 豊洲ベイサイド", documentNumber: "EST-20260621-002", templateVersionId: "tplver_user_demo_001", generatedAt: dateAgo(1, 1) },
    { id: "out_demo_chen_funding", tenantId: DEFAULT_TENANT_ID, actorId: "user_demo", userId: "user_demo", sourceQuoteId: "quote_chen_nakameguro_a", quoteId: "quote_chen_nakameguro_a", propertyId: "prop_nakameguro_duplex", partyId: "client_chen_liang", outputType: "funding_plan", outputFormat: "pdf", language: "zh", title: "资金计划 - 陳様 中目黒デュープレックス", documentNumber: "FUND-20260620-003", templateVersionId: "tplver_user_demo_001", generatedAt: dateAgo(2) },
    { id: "out_demo_roppongi_overview", tenantId: DEFAULT_TENANT_ID, actorId: "user_demo", userId: "user_demo", propertyId: "prop_roppongi_hills_west", outputType: "property_overview", outputFormat: "pdf", language: "ja", title: "物件概要 - 六本木ヒルズウェスト", documentNumber: "PROPVIEW-20260619-001", templateVersionId: "tplver_user_demo_001", generatedAt: dateAgo(3) },
    { id: "out_demo_yamada_assumption", tenantId: DEFAULT_TENANT_ID, actorId: "user_demo", userId: "user_demo", sourceQuoteId: "quote_yamada_b", quoteId: "quote_yamada_b", propertyId: "prop_minato_tower", partyId: "client_yamada", outputType: "assumption_memo", outputFormat: "docx", language: "ja", title: "前提条件メモ - 山田様 港区グランドタワー", documentNumber: "MEMO-20260618-001", templateVersionId: "tplver_user_demo_001", generatedAt: dateAgo(4) },
  ] satisfies GeneratedOutput[];

  const demoAuditLogs = [
    { id: "log_demo_member_invited", tenantId: DEFAULT_TENANT_ID, actorId: "user_demo", userId: "user_demo", action: "member_invited", targetType: "member", targetId: "membership_cherry_invited_sato", message: "佐藤 招待中 をデータ入力担当として招待しました", createdAt: dateAgo(1, 3), context: { source: "demo_seed" } },
    { id: "log_demo_import_garcia", tenantId: DEFAULT_TENANT_ID, actorId: "user_demo", userId: "user_demo", action: "source_uploaded", targetType: "import_job", targetId: "import_demo_005", message: "ガルシア様の本人確認資料を読み取り待ちにしました", createdAt: dateAgo(0, 4), context: { source: "demo_seed" } },
    { id: "log_demo_case_kachidoki", tenantId: DEFAULT_TENANT_ID, actorId: "user_demo", userId: "user_demo", action: "case_reviewed", targetType: "case", targetId: "case_demo_kachidoki_rent", message: "勝どきリバーサイド 1503 の案件情報を確認済みにしました", createdAt: dateAgo(0, 6), context: { source: "demo_seed" } },
    { id: "log_demo_output_kachidoki", tenantId: DEFAULT_TENANT_ID, actorId: "user_demo", userId: "user_demo", action: "output_generated", targetType: "output", targetId: "out_demo_kachidoki_nihon_pdf", message: "日本セーフティー申込書を出力しました", createdAt: dateAgo(0, 4), context: { source: "demo_seed" } },
    { id: "log_demo_property_update", tenantId: DEFAULT_TENANT_ID, actorId: "user_demo", userId: "user_demo", action: "property_updated", targetType: "property", targetId: "prop_shinjuku_office", message: "新宿御苑前オフィスの法人申込資料を紐付けました", createdAt: dateAgo(1, 2), context: { source: "demo_seed" } },
    { id: "log_demo_quote_chen", tenantId: DEFAULT_TENANT_ID, actorId: "user_demo", userId: "user_demo", action: "quote_revised", targetType: "quote", targetId: "quote_chen_nakameguro_a", message: "陳様向け投資案を更新しました", createdAt: dateAgo(1), context: { source: "demo_seed" } },
  ] satisfies AuditLog[];

  pushMissingById(db.users, demoUsers);
  pushMissingById(db.tenantMemberships, demoMemberships);
  pushMissingById(db.properties, demoProperties);
  pushMissingById(db.clients, demoClients);
  pushMissingById(db.quotations, demoQuotations);
  pushMissingById(db.importJobs, demoImportJobs);
  pushMissingById(db.brokerageCases, demoCases);
  pushMissingById(db.guaranteeApplicationDrafts, demoDrafts);
  pushMissingById(db.extractionReviewItems, demoReviewItems);
  pushMissingById(db.followUps, demoFollowUps);
  pushMissingById(db.tasks, demoTasks);
  pushMissingById(db.attachments, demoAttachments);
  pushMissingById(db.generatedOutputs, demoOutputs);
  pushMissingById(db.auditLogs, demoAuditLogs);
  db.tenantMemberships.forEach(ensureTenantMembershipDefaults);
  backfillTenantScope(db);
}

if (process.env.BROKER_DESK_SEED_MODE === "blank") {
  resetBusinessDataForQa();
} else {
  ensureRichDemoData();
}

const OPEN_STAGES: ClientStage[] = ["lead", "contacted", "quoted", "viewing", "negotiating"];
const STAGE_JA_LABEL: Record<ClientStage, string> = {
  lead: "新規受付",
  contacted: "初回接触済み",
  quoted: "提案送付済み",
  viewing: "内見済み",
  negotiating: "申込・条件調整",
  won: "成約",
  lost: "見送り",
};

export type DashboardQuoteItem = Quotation & {
  client: Client;
  property?: Property;
};

function isValidImportStatusTransition(from: ImportJobStatus, to: ImportJobStatus, allowRetry: boolean): boolean {
  if (from === to) return true;
  if (allowRetry && to === "queued") return true;
  if (from === "queued" && to === "mapped") return true;
  if (from === "mapped" && (to === "queued" || to === "completed")) return true;
  return false;
}

export async function listUsers(limit = 50): Promise<User[]> {
  return db.users
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, limit)
    .map((item) => ({ ...item }));
}

export async function getUserById(userId: string): Promise<User | null> {
  const found = db.users.find((item) => item.id === userId);
  return found ? { ...found } : null;
}

export async function getUserByExternalAuthSubject(subject: string): Promise<User | null> {
  const normalized = subject.trim();
  if (!normalized) return null;
  const found = db.users.find((item) => item.externalAuthSubject === normalized);
  return found ? { ...found } : null;
}

function fallbackEmailForExternalSubject(subject: string): string {
  const safeSubject = subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "user";
  return `external-${safeSubject}@brokerdesk.local`;
}

function activateInvitedMembershipsForUser(userId: string) {
  const acceptedAt = new Date();
  db.tenantMemberships
    .filter((membership) => membership.userId === userId && membership.status === "invited")
    .forEach((membership) => {
      membership.status = "active";
      membership.invitationStatus = "accepted";
      membership.invitationAcceptedAt = acceptedAt;
      membership.invitationError = undefined;
      membership.updatedAt = acceptedAt;
    });
}

export async function ensureUserForExternalAuth(input: ExternalAuthUserInput): Promise<User | null> {
  const subject = input.subject.trim();
  if (!subject) return null;

  const email = input.email?.trim().toLowerCase();
  const name = input.name?.trim() || email || subject;
  const bySubject = db.users.find((item) => item.externalAuthSubject === subject);
  if (bySubject) {
    activateInvitedMembershipsForUser(bySubject.id);
    return { ...bySubject };
  }

  if (email) {
    const byEmail = db.users.find((item) => item.email.toLowerCase() === email);
    if (byEmail) {
      if (byEmail.externalAuthSubject && byEmail.externalAuthSubject !== subject) {
        throw new Error("email is already linked to another external identity");
      }
      byEmail.externalAuthSubject = subject;
      byEmail.name = byEmail.name.trim() || name;
      activateInvitedMembershipsForUser(byEmail.id);
      return { ...byEmail };
    }
  }

  const user: User = {
    id: makeId("user"),
    name,
    email: email || fallbackEmailForExternalSubject(subject),
    passwordHash: "external_auth_user",
    externalAuthSubject: subject,
    createdAt: new Date(),
  };
  db.users.push(user);
  activateInvitedMembershipsForUser(user.id);
  return { ...user };
}

export async function suspendUserForExternalAuthSubject(subject: string): Promise<{ userId?: string; suspendedMembershipCount: number }> {
  const normalized = subject.trim();
  if (!normalized) return { suspendedMembershipCount: 0 };
  const user = db.users.find((item) => item.externalAuthSubject === normalized);
  if (!user) return { suspendedMembershipCount: 0 };
  user.externalAuthSubject = undefined;
  let suspendedMembershipCount = 0;
  db.tenantMemberships
    .filter((membership) => membership.userId === user.id && membership.status !== "suspended")
    .forEach((membership) => {
      membership.status = "suspended";
      membership.invitationStatus = "revoked";
      membership.updatedAt = new Date();
      suspendedMembershipCount += 1;
    });
  return { userId: user.id, suspendedMembershipCount };
}

export async function getDefaultUser(preferredUserId?: string) {
  if (preferredUserId) {
    const found = db.users.find((item) => item.id === preferredUserId);
    if (found) return found;
  }
  return db.users[0] ?? null;
}

export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  const found = db.tenants.find((item) => item.id === tenantId);
  return found ? { ...found } : null;
}

export async function listPlatformTenantAccounts(): Promise<TenantAccountSummary[]> {
  return db.tenants
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(toTenantAccountSummary);
}

function slugifyTenantName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `tenant-${Date.now().toString(36)}`;
}

function assertTenantHasSeatCapacity(tenantId: string, nextStatus: TenantMembershipStatus) {
  if (nextStatus === "suspended") return;
  const tenant = db.tenants.find((item) => item.id === tenantId);
  if (!tenant) throw new Error("tenant not found");
  const seats = countUsedSeats(tenantId);
  if (seats.usedSeatCount >= tenant.purchasedSeatCount) {
    throw new Error("purchased seat count exceeded");
  }
}

export async function createTenantAccount(input: {
  name: string;
  slug?: string;
  accountType: TenantAccountType;
  status?: TenantStatus;
  purchasedSeatCount: number;
  ownerName: string;
  ownerEmail: string;
}): Promise<TenantAccountSummary> {
  const name = input.name.trim();
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  if (!name) throw new Error("tenant name is required");
  if (!ownerEmail) throw new Error("owner email is required");

  const baseSlug = slugifyTenantName(input.slug || name);
  let slug = baseSlug;
  let suffix = 2;
  while (db.tenants.some((tenant) => tenant.slug === slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const tenant: Tenant = {
    id: makeId("tenant"),
    name,
    slug,
    accountType: input.accountType,
    status: input.status ?? "trial",
    purchasedSeatCount: normalizePurchasedSeatCount(input.purchasedSeatCount),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  db.tenants.push(tenant);

  let owner = db.users.find((item) => item.email.toLowerCase() === ownerEmail);
  if (!owner) {
    owner = {
      id: makeId("user"),
      name: input.ownerName.trim() || ownerEmail,
      email: ownerEmail,
      passwordHash: "platform_invited_user",
      externalAuthSubject: undefined,
      createdAt: new Date(),
    };
    db.users.push(owner);
  }

  db.tenantMemberships.push({
    id: makeId("membership"),
    tenantId: tenant.id,
    userId: owner.id,
    role: "tenant_owner",
    status: "invited",
    invitationProvider: "none",
    invitationStatus: "not_sent",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return toTenantAccountSummary(tenant);
}

export async function updateTenantAccountLifecycle(input: {
  tenantId: string;
  status?: TenantStatus;
  purchasedSeatCount?: number;
}): Promise<TenantAccountSummary | null> {
  const tenant = db.tenants.find((item) => item.id === input.tenantId);
  if (!tenant) return null;

  if (input.purchasedSeatCount != null) {
    const nextSeatCount = normalizePurchasedSeatCount(input.purchasedSeatCount);
    const used = countUsedSeats(tenant.id).usedSeatCount;
    if (nextSeatCount < used) {
      throw new Error("purchased seat count cannot be lower than used seats");
    }
    tenant.purchasedSeatCount = nextSeatCount;
  }
  if (input.status) {
    tenant.status = input.status;
  }
  tenant.updatedAt = new Date();
  return toTenantAccountSummary(tenant);
}

export async function listTenantMemberships(userId: string): Promise<TenantMembership[]> {
  return db.tenantMemberships
    .filter((item) => item.userId === userId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((item) => ({ ...ensureTenantMembershipDefaults(item) }));
}

export async function getTenantMembership(input: { userId: string; tenantId: string }): Promise<TenantMembership | null> {
  const found = db.tenantMemberships.find(
    (item) => item.userId === input.userId && item.tenantId === input.tenantId,
  );
  return found ? { ...ensureTenantMembershipDefaults(found) } : null;
}

export async function listTenantsForUser(userId: string): Promise<Tenant[]> {
  const memberships = await listTenantMemberships(userId);
  const tenantIds = new Set(memberships.filter((item) => item.status === "active").map((item) => item.tenantId));
  return db.tenants
    .filter((item) => isTenantAccessibleStatus(item.status) && tenantIds.has(item.id))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((item) => ({ ...item }));
}

export async function listTenantMembers(tenantId: string): Promise<TenantMemberListItem[]> {
  const scopeTenantId = resolveTenantId(tenantId);
  return db.tenantMemberships
    .filter((membership) => membership.tenantId === scopeTenantId)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    })
    .flatMap((membership) => {
      const item = toTenantMemberListItem(membership);
      return item ? [item] : [];
    });
}

export async function getTenantMemberById(input: {
  tenantId?: string;
  membershipId: string;
}): Promise<TenantMemberListItem | null> {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const membership = db.tenantMemberships.find(
    (item) => item.id === input.membershipId && item.tenantId === scopeTenantId,
  );
  return membership ? toTenantMemberListItem(membership) : null;
}

export async function updateTenantMemberInvitation(input: {
  tenantId?: string;
  membershipId: string;
  invitationProvider: TenantInvitationProvider;
  invitationStatus: TenantInvitationStatus;
  providerInvitationId?: string;
  invitationUrl?: string;
  invitationError?: string;
  sentAt?: Date;
  acceptedAt?: Date;
}): Promise<TenantMemberListItem | null> {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const membership = db.tenantMemberships.find(
    (item) => item.id === input.membershipId && item.tenantId === scopeTenantId,
  );
  if (!membership) return null;
  membership.invitationProvider = input.invitationProvider;
  membership.invitationStatus = input.invitationStatus;
  membership.providerInvitationId = input.providerInvitationId;
  membership.invitationUrl = input.invitationUrl;
  membership.invitationError = input.invitationError;
  membership.invitationSentAt = input.sentAt ?? membership.invitationSentAt;
  membership.invitationAcceptedAt = input.acceptedAt ?? membership.invitationAcceptedAt;
  membership.updatedAt = new Date();
  return toTenantMemberListItem(membership);
}

export async function inviteTenantMember(input: {
  tenantId?: string;
  name: string;
  email: string;
  role: TenantRole;
  status?: TenantMembershipStatus;
}): Promise<TenantMemberListItem> {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim() || email;
  if (!email) throw new Error("member email is required");

  let user = db.users.find((item) => item.email.toLowerCase() === email);
  if (!user) {
    user = {
      id: makeId("user"),
      name,
      email,
      passwordHash: "local_invited_user",
      externalAuthSubject: undefined,
      createdAt: new Date(),
    };
    db.users.push(user);
  }

  const existing = db.tenantMemberships.find(
    (membership) => membership.tenantId === scopeTenantId && membership.userId === user.id,
  );
  if (existing) {
    const nextStatus = input.status ?? "active";
    if (existing.status === "suspended" && nextStatus !== "suspended") {
      assertTenantHasSeatCapacity(scopeTenantId, nextStatus);
    }
    existing.role = input.role;
    existing.status = nextStatus;
    existing.invitationProvider = existing.invitationProvider ?? "none";
    existing.invitationStatus = nextStatus === "active" ? "accepted" : existing.invitationStatus ?? "not_sent";
    if (nextStatus === "active") existing.invitationAcceptedAt = existing.invitationAcceptedAt ?? new Date();
    existing.updatedAt = new Date();
    return {
      ...existing,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        externalAuthSubject: user.externalAuthSubject,
        createdAt: user.createdAt,
      },
    };
  }

  const nextStatus = input.status ?? "active";
  assertTenantHasSeatCapacity(scopeTenantId, nextStatus);
  const nowDate = new Date();
  const membership: TenantMembership = {
    id: makeId("membership"),
    tenantId: scopeTenantId,
    userId: user.id,
    role: input.role,
    status: nextStatus,
    invitationProvider: nextStatus === "active" ? "manual" : "none",
    invitationStatus: nextStatus === "active" ? "accepted" : "not_sent",
    invitationAcceptedAt: nextStatus === "active" ? nowDate : undefined,
    createdAt: nowDate,
    updatedAt: nowDate,
  };
  db.tenantMemberships.push(membership);
  return {
    ...membership,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      externalAuthSubject: user.externalAuthSubject,
      createdAt: user.createdAt,
    },
  };
}

export async function updateTenantMemberRole(input: {
  tenantId?: string;
  membershipId: string;
  role: TenantRole;
}): Promise<TenantMemberListItem | null> {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const membership = db.tenantMemberships.find(
    (item) => item.id === input.membershipId && item.tenantId === scopeTenantId,
  );
  if (!membership) return null;
  membership.role = input.role;
  membership.updatedAt = new Date();
  const user = db.users.find((item) => item.id === membership.userId);
  if (!user) return null;
  return {
    ...membership,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      externalAuthSubject: user.externalAuthSubject,
      createdAt: user.createdAt,
    },
  };
}

export async function updateTenantMemberStatus(input: {
  tenantId?: string;
  membershipId: string;
  status: TenantMembershipStatus;
}): Promise<TenantMemberListItem | null> {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const membership = db.tenantMemberships.find(
    (item) => item.id === input.membershipId && item.tenantId === scopeTenantId,
  );
  if (!membership) return null;
  if (membership.status === "suspended" && input.status !== "suspended") {
    assertTenantHasSeatCapacity(scopeTenantId, input.status);
  }
  const previousStatus = membership.status;
  membership.status = input.status;
  if (input.status === "active" && previousStatus === "invited") {
    membership.invitationStatus = "accepted";
    membership.invitationAcceptedAt = new Date();
  }
  membership.updatedAt = new Date();
  const user = db.users.find((item) => item.id === membership.userId);
  if (!user) return null;
  return {
    ...membership,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      externalAuthSubject: user.externalAuthSubject,
      createdAt: user.createdAt,
    },
  };
}

export async function listCaseWorkbenchFieldRules(userId: string, tenantId?: string): Promise<CaseWorkbenchFieldRule[]> {
  const scopeTenantId = resolveTenantId(tenantId);
  return db.caseWorkbenchFieldRules
    .filter((item) => item.userId === userId && item.tenantId === scopeTenantId)
    .sort((a, b) => a.fieldKey.localeCompare(b.fieldKey))
    .map((item) => ({ ...item }));
}

export async function updateCaseWorkbenchFieldRules(
  userId: string,
  input: CaseWorkbenchFieldRuleInput[],
  tenantId?: string,
): Promise<CaseWorkbenchFieldRule[]> {
  const scopeTenantId = resolveTenantId(tenantId);
  const nowDate = new Date();
  const uniqueRules = new Map<string, CaseWorkbenchFieldRuleInput>();
  input.forEach((rule) => {
    uniqueRules.set(rule.fieldKey, rule);
  });

  uniqueRules.forEach((rule) => {
    const index = db.caseWorkbenchFieldRules.findIndex(
      (item) => item.userId === userId && item.tenantId === scopeTenantId && item.fieldKey === rule.fieldKey,
    );
    const next: CaseWorkbenchFieldRule = {
      id: index >= 0 ? db.caseWorkbenchFieldRules[index].id : makeId("casefieldrule"),
      tenantId: scopeTenantId,
      userId,
      fieldKey: rule.fieldKey,
      requirement: rule.requirement,
      updatedAt: nowDate,
    };
    if (index >= 0) {
      db.caseWorkbenchFieldRules[index] = next;
    } else {
      db.caseWorkbenchFieldRules.push(next);
    }
  });

  return listCaseWorkbenchFieldRules(userId, scopeTenantId);
}

export async function getOutputTemplateSettings(userId: string, tenantId?: string): Promise<OutputTemplateSettings> {
  const scopeTenantId = resolveTenantId(tenantId);
  const existing = db.outputTemplateSettings.find((item) => item.userId === userId && item.tenantId === scopeTenantId);
  if (existing) return existing;

  const fallback = getDefaultOutputTemplateSettings(userId, scopeTenantId);
  db.outputTemplateSettings.push(fallback);
  return fallback;
}

export async function updateOutputTemplateSettings(
  userId: string,
  input: OutputTemplateSettingsInput,
  tenantId?: string,
): Promise<OutputTemplateSettings> {
  const scopeTenantId = resolveTenantId(tenantId);
  const current = await getOutputTemplateSettings(userId, scopeTenantId);
  const next: OutputTemplateSettings = {
    ...current,
    tenantId: scopeTenantId,
    ...input,
    updatedAt: new Date(),
  };
  const index = db.outputTemplateSettings.findIndex((item) => item.userId === userId && item.tenantId === scopeTenantId);
  if (index >= 0) {
    db.outputTemplateSettings[index] = next;
  } else {
    db.outputTemplateSettings.push(next);
  }
  return next;
}

export async function listOutputTemplateVersions(userId: string, limit = 20, tenantId?: string): Promise<OutputTemplateVersion[]> {
  const scopeTenantId = resolveTenantId(tenantId);
  return db.outputTemplateVersions
    .filter((item) => item.userId === userId && item.tenantId === scopeTenantId)
    .sort((a, b) => b.versionNumber - a.versionNumber)
    .slice(0, limit)
    .map((item) => ({ ...item }));
}

export async function createOutputTemplateVersion(input: {
  tenantId?: string;
  userId: string;
  versionLabel?: string;
  changeNote?: string;
  settingsSnapshot?: OutputTemplateSettingsInput;
  activate?: boolean;
}): Promise<OutputTemplateVersion> {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const current = await getOutputTemplateSettings(input.userId, scopeTenantId);
  const currentMax = db.outputTemplateVersions
    .filter((item) => item.userId === input.userId && item.tenantId === scopeTenantId)
    .reduce((max, item) => Math.max(max, item.versionNumber), 0);
  const versionNumber = currentMax + 1;
  const nextActive = input.activate ?? true;

  if (nextActive) {
    db.outputTemplateVersions.forEach((item) => {
      if (item.userId === input.userId && item.tenantId === scopeTenantId) item.isActive = false;
    });
  }

  const version: OutputTemplateVersion = {
    id: makeId("tplver"),
    tenantId: scopeTenantId,
    userId: input.userId,
    versionNumber,
    versionLabel: input.versionLabel?.trim() || `テンプレート v${versionNumber}`,
    changeNote: input.changeNote?.trim() || undefined,
    settingsSnapshot: input.settingsSnapshot ?? toTemplateSettingsInput(current),
    isActive: nextActive,
    createdAt: new Date(),
  };

  db.outputTemplateVersions.unshift(version);
  return version;
}

export async function applyOutputTemplateVersion(input: {
  tenantId?: string;
  userId: string;
  versionId: string;
}): Promise<OutputTemplateSettings | null> {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const version = db.outputTemplateVersions.find(
    (item) => item.userId === input.userId && item.tenantId === scopeTenantId && item.id === input.versionId,
  );
  if (!version) return null;

  const settings = await updateOutputTemplateSettings(input.userId, version.settingsSnapshot, scopeTenantId);
  db.outputTemplateVersions.forEach((item) => {
    if (item.userId === input.userId && item.tenantId === scopeTenantId) {
      item.isActive = item.id === input.versionId;
    }
  });
  return settings;
}

export async function getOutputTemplateVersionById(input: {
  tenantId?: string;
  userId: string;
  versionId: string;
}): Promise<OutputTemplateVersion | null> {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const version = db.outputTemplateVersions.find(
    (item) => item.userId === input.userId && item.tenantId === scopeTenantId && item.id === input.versionId,
  );
  return version ? { ...version } : null;
}

export async function listImportJobs(userId: string, limit = 50, tenantId?: string): Promise<ImportJob[]> {
  const scopeTenantId = resolveTenantId(tenantId);
  return db.importJobs
    .filter((item) => item.userId === userId && item.tenantId === scopeTenantId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)
    .map((item) => ({ ...item }));
}

export async function addImportJob(input: {
  tenantId?: string;
  userId: string;
  sourceType: ImportSourceType;
  title: string;
  targetEntity: ImportTargetEntity;
  status?: ImportJobStatus;
  notes?: string;
}): Promise<ImportJob> {
  const sourceLabel: Record<ImportSourceType, string> = {
    excel: "Excel",
    pdf: "PDF",
    scan: "スキャン",
    manual: "手入力",
  };
  const targetLabel: Record<ImportTargetEntity, string> = {
    properties: "物件",
    parties: "関係者",
    contracts: "契約",
    service_requests: "対応履歴",
  };
  const nowDate = new Date();
  const job: ImportJob = {
    id: makeId("import"),
    tenantId: resolveTenantId(input.tenantId),
    userId: input.userId,
    sourceType: input.sourceType,
    title: input.title.trim() || `${sourceLabel[input.sourceType]}資料 - ${targetLabel[input.targetEntity]}`,
    targetEntity: input.targetEntity,
    status: input.status ?? "queued",
    notes: input.notes?.trim() || undefined,
    createdAt: nowDate,
    updatedAt: nowDate,
  };
  db.importJobs.unshift(job);
  return job;
}

export async function updateImportJobMapping(input: {
  tenantId?: string;
  userId: string;
  jobId: string;
  mappingJson: Record<string, string>;
  validationMessage?: string;
  notes?: string;
  status?: ImportJobStatus;
  allowRetry?: boolean;
}): Promise<ImportJob | null> {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const job = db.importJobs.find(
    (item) => item.userId === input.userId && item.tenantId === scopeTenantId && item.id === input.jobId,
  );
  if (!job) return null;

  job.mappingJson = input.mappingJson;
  job.validationMessage = input.validationMessage?.trim() || undefined;
  if (typeof input.notes === "string") {
    job.notes = input.notes.trim() || undefined;
  }
  if (input.status) {
    if (!isValidImportStatusTransition(job.status, input.status, Boolean(input.allowRetry))) {
      throw new Error(`資料読取記録の状態変更が不正です: ${job.status} -> ${input.status}`);
    }
    job.status = input.status;
  }
  job.updatedAt = new Date();
  return { ...job };
}

function cloneBrokerageCase(item: BrokerageCase): BrokerageCase {
  return {
    ...item,
    confirmedDataJson: { ...item.confirmedDataJson },
    sourceImportJobIds: [...item.sourceImportJobIds],
  };
}

export async function listBrokerageCases(userId: string, limit = 50, tenantId?: string): Promise<BrokerageCase[]> {
  const scopeTenantId = resolveTenantId(tenantId);
  return db.brokerageCases
    .filter((item) => item.userId === userId && item.tenantId === scopeTenantId)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, limit)
    .map(cloneBrokerageCase);
}

export async function getBrokerageCaseById(input: {
  tenantId?: string;
  userId: string;
  caseId: string;
}): Promise<BrokerageCase | null> {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const item = db.brokerageCases.find(
    (caseItem) => caseItem.userId === input.userId && caseItem.tenantId === scopeTenantId && caseItem.id === input.caseId,
  );
  return item ? cloneBrokerageCase(item) : null;
}

export async function getBrokerageCaseByImportJobId(input: {
  tenantId?: string;
  userId: string;
  importJobId: string;
}): Promise<BrokerageCase | null> {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const item = db.brokerageCases.find(
    (caseItem) =>
      caseItem.userId === input.userId &&
      caseItem.tenantId === scopeTenantId &&
      caseItem.sourceImportJobIds.includes(input.importJobId),
  );
  return item ? cloneBrokerageCase(item) : null;
}

export async function updateBrokerageCaseConfirmedData(input: {
  tenantId?: string;
  userId: string;
  caseId: string;
  confirmedDataJson: Record<string, unknown>;
}): Promise<BrokerageCase | null> {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const item = db.brokerageCases.find(
    (caseItem) => caseItem.userId === input.userId && caseItem.tenantId === scopeTenantId && caseItem.id === input.caseId,
  );
  if (!item) return null;

  item.confirmedDataJson = { ...input.confirmedDataJson };
  item.updatedAt = new Date();
  return cloneBrokerageCase(item);
}

export async function saveBrokerageCaseExtractionReview(input: {
  tenantId?: string;
  userId: string;
  caseId?: string;
  caseType: BrokerageCaseType;
  caseTitle: string;
  primaryPropertyId?: string;
  status?: BrokerageCaseStatus;
  confirmedDataJson: Record<string, unknown>;
  sourceImportJobIds: string[];
  reviewItems: Array<Omit<ExtractionReviewItem, "id" | "tenantId" | "userId" | "caseId" | "createdAt">>;
}): Promise<BrokerageCase> {
  const nowDate = new Date();
  const scopeTenantId = resolveTenantId(input.tenantId);
  let item = input.caseId
    ? db.brokerageCases.find(
        (caseItem) => caseItem.userId === input.userId && caseItem.tenantId === scopeTenantId && caseItem.id === input.caseId,
      )
    : undefined;

  if (!item) {
    item = {
      id: makeId("case"),
      tenantId: scopeTenantId,
      userId: input.userId,
      caseType: input.caseType,
      caseTitle: input.caseTitle.trim() || "抽出確認案件",
      primaryPropertyId: input.primaryPropertyId,
      status: input.status ?? "reviewed",
      confirmedDataJson: { ...input.confirmedDataJson },
      sourceImportJobIds: [...new Set(input.sourceImportJobIds)],
      createdAt: nowDate,
      updatedAt: nowDate,
    };
    db.brokerageCases.unshift(item);
  } else {
    item.caseTitle = input.caseTitle.trim() || item.caseTitle;
    item.caseType = input.caseType;
    item.primaryPropertyId = input.primaryPropertyId;
    item.status = input.status ?? "reviewed";
    item.confirmedDataJson = { ...input.confirmedDataJson };
    item.sourceImportJobIds = [...new Set(input.sourceImportJobIds)];
    item.updatedAt = nowDate;
  }

  db.extractionReviewItems = db.extractionReviewItems.filter(
    (reviewItem) => reviewItem.tenantId !== scopeTenantId || reviewItem.caseId !== item.id,
  );
  input.reviewItems.forEach((reviewItem) => {
    db.extractionReviewItems.push({
      ...reviewItem,
      id: makeId("review"),
      tenantId: scopeTenantId,
      userId: input.userId,
      caseId: item.id,
      createdAt: nowDate,
    });
  });

  return cloneBrokerageCase(item);
}

export async function mergeBrokerageCaseExtractionReview(input: {
  tenantId?: string;
  userId: string;
  caseId: string;
  confirmedDataJson: Record<string, unknown>;
  sourceImportJobIds: string[];
  replaceImportJobIds: string[];
  reviewItems: Array<Omit<ExtractionReviewItem, "id" | "tenantId" | "userId" | "caseId" | "createdAt">>;
}): Promise<BrokerageCase | null> {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const item = db.brokerageCases.find(
    (caseItem) => caseItem.userId === input.userId && caseItem.tenantId === scopeTenantId && caseItem.id === input.caseId,
  );
  if (!item) return null;

  const nowDate = new Date();
  const replaceImportJobIds = new Set(input.replaceImportJobIds);
  item.confirmedDataJson = { ...input.confirmedDataJson };
  item.sourceImportJobIds = [...new Set(input.sourceImportJobIds)];
  item.updatedAt = nowDate;

  db.extractionReviewItems = db.extractionReviewItems.filter(
    (reviewItem) => reviewItem.caseId !== item.id || !replaceImportJobIds.has(reviewItem.importJobId),
  );
  input.reviewItems.forEach((reviewItem) => {
    db.extractionReviewItems.push({
      ...reviewItem,
      id: makeId("review"),
      tenantId: scopeTenantId,
      userId: input.userId,
      caseId: item.id,
      createdAt: nowDate,
    });
  });

  return cloneBrokerageCase(item);
}

export async function rollbackBrokerageCaseMerge(input: {
  tenantId?: string;
  userId: string;
  caseId: string;
  restoredConfirmedDataJson: Record<string, unknown>;
  restoredSourceImportJobIds: string[];
  splitCaseTitle: string;
  splitCaseId?: string;
  splitConfirmedDataJson: Record<string, unknown>;
  splitSourceImportJobIds: string[];
  splitReviewItems: Array<Omit<ExtractionReviewItem, "id" | "tenantId" | "userId" | "caseId" | "createdAt">>;
  removeImportJobIds: string[];
}): Promise<{ restoredCase: BrokerageCase; splitCase: BrokerageCase } | null> {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const item = db.brokerageCases.find(
    (caseItem) => caseItem.userId === input.userId && caseItem.tenantId === scopeTenantId && caseItem.id === input.caseId,
  );
  if (!item) return null;

  const nowDate = new Date();
  const removeImportJobIds = new Set(input.removeImportJobIds);
  item.confirmedDataJson = { ...input.restoredConfirmedDataJson };
  item.sourceImportJobIds = [...new Set(input.restoredSourceImportJobIds)];
  item.updatedAt = nowDate;

  db.extractionReviewItems = db.extractionReviewItems.filter(
    (reviewItem) => reviewItem.caseId !== item.id || !removeImportJobIds.has(reviewItem.importJobId),
  );

  const splitCase: BrokerageCase = {
    id: input.splitCaseId ?? makeId("case"),
    tenantId: scopeTenantId,
    userId: input.userId,
    caseType: item.caseType,
    caseTitle: input.splitCaseTitle.trim() || "分離した抽出確認案件",
    status: "reviewed",
    confirmedDataJson: { ...input.splitConfirmedDataJson },
    sourceImportJobIds: [...new Set(input.splitSourceImportJobIds)],
    createdAt: nowDate,
    updatedAt: nowDate,
  };
  db.brokerageCases.unshift(splitCase);
  input.splitReviewItems.forEach((reviewItem) => {
    db.extractionReviewItems.push({
      ...reviewItem,
      id: makeId("review"),
      tenantId: scopeTenantId,
      userId: input.userId,
      caseId: splitCase.id,
      createdAt: nowDate,
    });
  });

  return { restoredCase: cloneBrokerageCase(item), splitCase: cloneBrokerageCase(splitCase) };
}

export async function listExtractionReviewItems(input: {
  tenantId?: string;
  userId: string;
  caseId: string;
}): Promise<ExtractionReviewItem[]> {
  const scopeTenantId = resolveTenantId(input.tenantId);
  return db.extractionReviewItems
    .filter((item) => item.userId === input.userId && item.tenantId === scopeTenantId && item.caseId === input.caseId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((item) => ({ ...item }));
}

export async function addCorrectionEvents(input: {
  tenantId?: string;
  userId: string;
  events: Array<Omit<CorrectionEvent, "id" | "tenantId" | "userId" | "createdAt">>;
}): Promise<CorrectionEvent[]> {
  const nowDate = new Date();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const events = input.events.map((event) => ({
    ...event,
    id: makeId("correction"),
    tenantId: scopeTenantId,
    userId: input.userId,
    createdAt: nowDate,
  }));
  db.correctionEvents.unshift(...events);
  return events.map((event) => ({ ...event, createdAt: new Date(event.createdAt) }));
}

export async function listCorrectionEvents(input: {
  tenantId?: string;
  userId: string;
  caseId?: string;
  limit?: number;
}): Promise<CorrectionEvent[]> {
  const limit = input.limit ?? 50;
  const scopeTenantId = resolveTenantId(input.tenantId);
  return db.correctionEvents
    .filter(
      (item) =>
        item.userId === input.userId &&
        item.tenantId === scopeTenantId &&
        (!input.caseId || item.caseId === input.caseId),
    )
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)
    .map((item) => ({ ...item, createdAt: new Date(item.createdAt) }));
}

function cloneAiExperienceDraft(item: AiExperienceDraft): AiExperienceDraft {
  return {
    ...item,
    eventIds: [...item.eventIds],
    evidenceSummaryJson: item.evidenceSummaryJson ? { ...item.evidenceSummaryJson } : undefined,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  };
}

export async function addAiExperienceDrafts(input: {
  tenantId?: string;
  userId: string;
  drafts: Array<
    Omit<AiExperienceDraft, "id" | "tenantId" | "userId" | "status" | "createdAt" | "updatedAt"> & {
      status?: AiExperienceDraftStatus;
    }
  >;
}): Promise<AiExperienceDraft[]> {
  const nowDate = new Date();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const drafts = input.drafts.map((draft) => ({
    ...draft,
    id: makeId("experience"),
    tenantId: scopeTenantId,
    userId: input.userId,
    status: draft.status ?? "draft",
    createdAt: nowDate,
    updatedAt: nowDate,
  }));
  db.aiExperienceDrafts.unshift(...drafts);
  return drafts.map(cloneAiExperienceDraft);
}

export async function listAiExperienceDrafts(input: {
  tenantId?: string;
  userId: string;
  status?: AiExperienceDraftStatus;
  limit?: number;
}): Promise<AiExperienceDraft[]> {
  const limit = input.limit ?? 50;
  const scopeTenantId = resolveTenantId(input.tenantId);
  return db.aiExperienceDrafts
    .filter((item) => item.userId === input.userId && item.tenantId === scopeTenantId && (!input.status || item.status === input.status))
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)
    .map(cloneAiExperienceDraft);
}

export async function updateAiExperienceDraftStatus(input: {
  tenantId?: string;
  userId: string;
  draftId: string;
  status: AiExperienceDraftStatus;
}): Promise<AiExperienceDraft | null> {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const draft = db.aiExperienceDrafts.find(
    (item) => item.userId === input.userId && item.tenantId === scopeTenantId && item.id === input.draftId,
  );
  if (!draft) return null;
  draft.status = input.status;
  draft.updatedAt = new Date();
  return cloneAiExperienceDraft(draft);
}

function cloneGuaranteeApplicationDraft(item: GuaranteeApplicationDraft): GuaranteeApplicationDraft {
  return {
    ...item,
    fieldValuesJson: { ...item.fieldValuesJson },
    fieldStatusesJson: { ...item.fieldStatusesJson },
  };
}

export async function getGuaranteeApplicationDraft(input: {
  tenantId?: string;
  userId: string;
  caseId: string;
  templateId: string;
}): Promise<GuaranteeApplicationDraft | null> {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const item = db.guaranteeApplicationDrafts.find(
    (draft) =>
      draft.userId === input.userId &&
      draft.tenantId === scopeTenantId &&
      draft.caseId === input.caseId &&
      draft.templateId === input.templateId,
  );
  return item ? cloneGuaranteeApplicationDraft(item) : null;
}

export async function saveGuaranteeApplicationDraft(input: {
  tenantId?: string;
  userId: string;
  caseId: string;
  templateId: string;
  companyCode: GuaranteeApplicationDraftCompanyCode;
  status: GuaranteeApplicationDraftStatus;
  fieldValuesJson: Record<string, unknown>;
  fieldStatusesJson?: Record<string, string>;
  lastReviewedAt?: Date;
}): Promise<GuaranteeApplicationDraft> {
  const nowDate = new Date();
  const scopeTenantId = resolveTenantId(input.tenantId);
  let item = db.guaranteeApplicationDrafts.find(
    (draft) =>
      draft.userId === input.userId &&
      draft.tenantId === scopeTenantId &&
      draft.caseId === input.caseId &&
      draft.templateId === input.templateId,
  );

  if (!item) {
    item = {
      id: makeId("draft"),
      tenantId: scopeTenantId,
      userId: input.userId,
      caseId: input.caseId,
      templateId: input.templateId,
      companyCode: input.companyCode,
      status: input.status,
      fieldValuesJson: { ...input.fieldValuesJson },
      fieldStatusesJson: { ...(input.fieldStatusesJson ?? {}) },
      lastReviewedAt: input.lastReviewedAt,
      createdAt: nowDate,
      updatedAt: nowDate,
    };
    db.guaranteeApplicationDrafts.unshift(item);
  } else {
    item.companyCode = input.companyCode;
    item.status = input.status;
    item.fieldValuesJson = { ...input.fieldValuesJson };
    item.fieldStatusesJson = { ...(input.fieldStatusesJson ?? {}) };
    item.lastReviewedAt = input.lastReviewedAt;
    item.updatedAt = nowDate;
  }

  return cloneGuaranteeApplicationDraft(item);
}

export async function listAttachments(input: {
  tenantId?: string;
  userId: string;
  targetType?: AttachmentTargetType;
  targetId?: string;
  limit?: number;
}): Promise<Attachment[]> {
  const limit = input.limit ?? 100;
  const scopeTenantId = resolveTenantId(input.tenantId);
  return db.attachments
    .filter((item) => item.userId === input.userId && item.tenantId === scopeTenantId)
    .filter((item) => (input.targetType ? item.targetType === input.targetType : true))
    .filter((item) => (input.targetId ? item.targetId === input.targetId : true))
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
    .slice(0, limit)
    .map((item) => ({ ...item }));
}

export async function addAttachment(input: {
  tenantId?: string;
  userId: string;
  targetType: AttachmentTargetType;
  targetId: string;
  fileName: string;
  fileType?: string;
  fileSizeBytes?: number;
  storagePath?: string;
}): Promise<Attachment> {
  const attachment: Attachment = {
    id: makeId("att"),
    tenantId: resolveTenantId(input.tenantId),
    userId: input.userId,
    targetType: input.targetType,
    targetId: input.targetId,
    fileName: input.fileName.trim(),
    fileType: input.fileType?.trim() || undefined,
    fileSizeBytes: input.fileSizeBytes,
    storagePath: input.storagePath?.trim() || undefined,
    uploadedAt: new Date(),
  };
  db.attachments.unshift(attachment);
  return attachment;
}

export async function listGeneratedOutputs(input: {
  tenantId?: string;
  userId: string;
  quoteId?: string;
  limit?: number;
}): Promise<GeneratedOutput[]> {
  const limit = input.limit ?? 100;
  const scopeTenantId = resolveTenantId(input.tenantId);
  return db.generatedOutputs
    .filter((item) => item.userId === input.userId && item.tenantId === scopeTenantId)
    .filter((item) => (input.quoteId ? item.quoteId === input.quoteId : true))
    .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())
    .slice(0, limit)
    .map((item) => ({ ...item }));
}

export async function getGeneratedOutputById(input: {
  tenantId?: string;
  userId: string;
  id: string;
}): Promise<GeneratedOutput | undefined> {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const found = db.generatedOutputs.find(
    (item) => item.userId === input.userId && item.tenantId === scopeTenantId && item.id === input.id,
  );
  return found ? { ...found } : undefined;
}

export async function addGeneratedOutput(input: {
  tenantId?: string;
  userId: string;
  actorId?: string;
  sourceQuoteId?: string;
  quoteId?: string;
  propertyId?: string;
  partyId?: string;
  outputType: GeneratedOutput["outputType"];
  outputFormat: GeneratedOutput["outputFormat"];
  language: Locale;
  title: string;
  documentNumber: string;
  templateVersionId?: string;
  caseId?: string;
  templateId?: string;
  inputDataSnapshot?: Record<string, unknown>;
  draftValueSnapshot?: Record<string, unknown>;
  fieldMappingSnapshot?: Record<string, unknown>;
  layoutSnapshot?: Record<string, unknown>;
}): Promise<GeneratedOutput> {
  const output: GeneratedOutput = {
    id: makeId("out"),
    tenantId: resolveTenantId(input.tenantId),
    actorId: input.actorId ?? input.userId,
    userId: input.userId,
    sourceQuoteId: input.sourceQuoteId ?? input.quoteId,
    quoteId: input.quoteId,
    propertyId: input.propertyId,
    partyId: input.partyId,
    outputType: input.outputType,
    outputFormat: input.outputFormat,
    language: input.language,
    title: input.title.trim(),
    documentNumber: input.documentNumber.trim(),
    templateVersionId: input.templateVersionId,
    caseId: input.caseId,
    templateId: input.templateId,
    inputDataSnapshot: input.inputDataSnapshot,
    draftValueSnapshot: input.draftValueSnapshot,
    fieldMappingSnapshot: input.fieldMappingSnapshot,
    layoutSnapshot: input.layoutSnapshot,
    generatedAt: new Date(),
  };
  db.generatedOutputs.unshift(output);
  return output;
}

export async function getDashboardData(userId: string) {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);

  const clients = db.clients.filter((item) => item.ownerUserId === userId);

  const todayFollowUps = clients.filter(
    (item) =>
      item.nextFollowUpAt &&
      item.nextFollowUpAt >= startOfDay &&
      item.nextFollowUpAt < endOfDay &&
      OPEN_STAGES.includes(item.stage)
  ).length;

  const newClientsThisWeek = clients.filter((item) => item.createdAt >= sevenDaysAgo).length;
  const quotedCount = clients.filter((item) => item.stage === "quoted").length;
  const negotiatingCount = clients.filter((item) => item.stage === "negotiating").length;

  const followUpList = clients
    .filter((item) => item.nextFollowUpAt && item.nextFollowUpAt <= endOfDay && OPEN_STAGES.includes(item.stage))
    .sort((a, b) => {
      const aTime = a.nextFollowUpAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTime = b.nextFollowUpAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, 8);
  const priorityList = buildFollowUpPriorityList(clients);
  const pendingTaskKeys = new Set(
    db.tasks
      .filter((task) => task.status === "pending" && Boolean(task.clientId))
      .map((task) => `${task.clientId}::${task.title}`)
  );
  const complianceAlerts = buildComplianceAlertList(clients).map((item) => ({
    ...item,
    isTaskCreated: pendingTaskKeys.has(`${item.clientId}::${item.title}`),
  }));
  const clientIdSet = new Set(clients.map((item) => item.id));
  const pendingTasks = db.tasks
    .filter((item) => item.clientId && clientIdSet.has(item.clientId) && item.status === "pending")
    .sort((a, b) => (a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 20);
  const notifications = [
    ...pendingTasks
      .filter((task) => task.dueAt && task.dueAt < startOfDay)
      .map((task) => ({
        id: `task-overdue-${task.id}`,
        level: "urgent" as const,
        title: "期限超過タスク",
        message: `${task.title}（期限 ${task.dueAt?.toLocaleDateString("ja-JP")}）`,
        clientId: task.clientId,
      })),
    ...pendingTasks
      .filter((task) => task.dueAt && task.dueAt >= startOfDay && task.dueAt < endOfDay)
      .map((task) => ({
        id: `task-today-${task.id}`,
        level: "info" as const,
        title: "本日期限タスク",
        message: task.title,
        clientId: task.clientId,
      })),
    ...complianceAlerts
      .filter((alert) => alert.level === "urgent")
      .map((alert) => ({
        id: `compliance-${alert.type}-${alert.clientId}`,
        level: "urgent" as const,
        title: "法定対応アラート",
        message: `${alert.clientName}: ${alert.title}`,
        clientId: alert.clientId,
      })),
  ]
    .sort((a, b) => {
      if (a.level !== b.level) return a.level === "urgent" ? -1 : 1;
      return a.title.localeCompare(b.title, "ja");
    })
    .slice(0, 8);

  const recentQuotes = await listQuotations(6);

  const staleClients = clients
    .filter(
      (item) => OPEN_STAGES.includes(item.stage) && (!item.lastContactedAt || item.lastContactedAt < sevenDaysAgo)
    )
    .sort((a, b) => (a.lastContactedAt?.getTime() ?? 0) - (b.lastContactedAt?.getTime() ?? 0))
    .slice(0, 6);

  const newUnquoted = clients
    .filter(
      (item) =>
        ["lead", "contacted"].includes(item.stage) &&
        item.createdAt >= threeDaysAgo &&
        db.quotations.every((q) => q.clientId !== item.id)
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 6);
  const recentAuditLogs = db.auditLogs
    .filter((item) => item.actorId === userId || item.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8);

  return {
    kpis: {
      todayFollowUps,
      newClientsThisWeek,
      quotedCount,
      negotiatingCount,
    },
    followUpList,
    priorityList,
    notifications,
    complianceAlerts,
    recentAuditLogs,
    recentQuotes,
    staleClients,
    newUnquoted,
  };
}

export type ClientListSort = "follow_up" | "recent_contact" | "recent_created";

export type AuditLogFilter = {
  actorId?: string;
  action?: string;
  targetType?: AuditLog["targetType"] | "all";
  query?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  tenantId?: string;
};

export async function listAuditLogs(userId: string, filter: AuditLogFilter = {}): Promise<AuditLog[]> {
  const scopeTenantId = resolveTenantId(filter.tenantId);
  const query = filter.query?.trim().toLowerCase() ?? "";
  const fromTime = filter.from?.getTime();
  const toTime = filter.to?.getTime();
  const limit = filter.limit ?? 200;

  return db.auditLogs
    .filter((item) => item.actorId === userId || item.userId === userId)
    .filter((item) => item.tenantId === scopeTenantId)
    .filter((item) => (filter.actorId ? item.actorId === filter.actorId : true))
    .filter((item) => (filter.action ? item.action === filter.action : true))
    .filter((item) => (filter.targetType && filter.targetType !== "all" ? item.targetType === filter.targetType : true))
    .filter((item) => {
      const timestamp = item.createdAt.getTime();
      if (typeof fromTime === "number" && timestamp < fromTime) return false;
      if (typeof toTime === "number" && timestamp > toTime) return false;
      return true;
    })
    .filter((item) => {
      if (!query) return true;
      return (
        item.message.toLowerCase().includes(query) ||
        item.action.toLowerCase().includes(query) ||
        item.targetType.toLowerCase().includes(query) ||
        (item.targetId ?? "").toLowerCase().includes(query)
      );
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)
    .map((item) => ({ ...item }));
}

export type ClientListFilter = {
  query?: string;
  stage?: ClientStage | "all";
  purpose?: Purpose | "all";
  temperature?: Temperature | "all";
  sort?: ClientListSort;
  tenantId?: string;
};

export async function listClients(userId: string, filter: ClientListFilter = {}) {
  const scopeTenantId = resolveTenantId(filter.tenantId);
  const filtered = db.clients
    .filter((item) => item.ownerUserId === userId)
    .filter((item) => item.tenantId === scopeTenantId)
    .filter((item) => (filter.stage && filter.stage !== "all" ? item.stage === filter.stage : true))
    .filter((item) => (filter.purpose && filter.purpose !== "all" ? item.purpose === filter.purpose : true))
    .filter((item) =>
      filter.temperature && filter.temperature !== "all" ? item.temperature === filter.temperature : true
    )
    .filter((item) => {
      if (!filter.query) return true;
      const q = filter.query;
      return (
        item.name.includes(q) ||
        item.phone.includes(q) ||
        (item.preferredArea?.includes(q) ?? false) ||
        (item.firstChoiceArea?.includes(q) ?? false) ||
        (item.secondChoiceArea?.includes(q) ?? false) ||
        (item.notes?.includes(q) ?? false)
      );
    });

  const sort = filter.sort ?? "follow_up";

  filtered.sort((a, b) => {
    if (sort === "recent_created") {
      return b.createdAt.getTime() - a.createdAt.getTime();
    }
    if (sort === "recent_contact") {
      return (b.lastContactedAt?.getTime() ?? 0) - (a.lastContactedAt?.getTime() ?? 0);
    }
    const aTime = a.nextFollowUpAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.nextFollowUpAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });

  return filtered.map((item) => ({
    ...item,
    _count: {
      quotations: db.quotations.filter((quote) => quote.clientId === item.id && quote.tenantId === scopeTenantId).length,
      followUps: db.followUps.filter((followUp) => followUp.clientId === item.id && followUp.tenantId === scopeTenantId).length,
    },
  }));
}

export async function getClientById(clientId: string, tenantId?: string) {
  const scopeTenantId = resolveTenantId(tenantId);
  return db.clients.find((item) => item.id === clientId && item.tenantId === scopeTenantId) ?? null;
}

export async function getClientDetail(clientId: string, tenantId?: string) {
  const scopeTenantId = resolveTenantId(tenantId);
  const client = db.clients.find((item) => item.id === clientId && item.tenantId === scopeTenantId);
  if (!client) return null;

  const tasks = db.tasks
    .filter((item) => item.clientId === clientId && item.tenantId === scopeTenantId)
    .sort((a, b) => {
      const statusWeight = (status: TaskStatus) => {
        if (status === "pending") return 0;
        if (status === "done") return 1;
        return 2;
      };
      const statusCompare = statusWeight(a.status) - statusWeight(b.status);
      if (statusCompare !== 0) return statusCompare;

      const dueA = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const dueB = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (dueA !== dueB) return dueA - dueB;

      return b.createdAt.getTime() - a.createdAt.getTime();
    });

  return {
    ...client,
    quotations: db.quotations
      .filter((item) => item.clientId === clientId && item.tenantId === scopeTenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((item) => ({
        ...item,
        property: item.propertyId ? db.properties.find((property) => property.id === item.propertyId && property.tenantId === scopeTenantId) : undefined,
      })),
    followUps: db.followUps
      .filter((item) => item.clientId === clientId && item.tenantId === scopeTenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    tasks,
    ownerUser: db.users.find((user) => user.id === client.ownerUserId)!,
  };
}

export async function getBoardData(userId: string, tenantId?: string) {
  const scopeTenantId = resolveTenantId(tenantId);
  const clients = db.clients.filter((item) => item.ownerUserId === userId && item.tenantId === scopeTenantId);
  return clients.reduce<Record<ClientStage, Client[]>>(
    (acc, client) => {
      acc[client.stage].push(client);
      return acc;
    },
    {
      lead: [],
      contacted: [],
      quoted: [],
      viewing: [],
      negotiating: [],
      won: [],
      lost: [],
    }
  );
}

export async function listQuoteFormData(tenantId?: string) {
  const scopeTenantId = resolveTenantId(tenantId);
  return {
    clients: db.clients.filter((item) => item.tenantId === scopeTenantId).map((item) => ({ id: item.id, name: item.name })),
    properties: db.properties.filter((item) => item.tenantId === scopeTenantId).map((item) => ({
      id: item.id,
      name: item.name,
      listingPrice: item.listingPrice,
      managementFee: item.managementFee ?? null,
      repairFee: item.repairFee ?? null,
    })),
  };
}

export async function addProperty(input: {
  tenantId?: string;
  name: string;
  area?: string;
  address?: string;
  listingPrice: number;
  sizeSqm?: number;
  managementFee?: number;
  repairFee?: number;
  notes?: string;
}) {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const property: Property = {
    id: makeId("prop"),
    tenantId: scopeTenantId,
    name: input.name,
    area: input.area,
    address: input.address,
    listingPrice: input.listingPrice,
    sizeSqm: input.sizeSqm,
    managementFee: input.managementFee,
    repairFee: input.repairFee,
    notes: input.notes,
    createdAt: new Date(),
  };
  db.properties.unshift(property);
  return property;
}

export async function listQuotations(limit?: number, tenantId?: string) {
  const scopeTenantId = resolveTenantId(tenantId);
  const sorted = db.quotations
    .filter((item) => item.tenantId === scopeTenantId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const sliced = typeof limit === "number" ? sorted.slice(0, limit) : sorted;

  return sliced.map((quote) => ({
    ...quote,
    client: db.clients.find((item) => item.id === quote.clientId && item.tenantId === scopeTenantId)!,
    property: quote.propertyId ? db.properties.find((item) => item.id === quote.propertyId && item.tenantId === scopeTenantId) : undefined,
  }));
}

export async function getQuotationById(quoteId: string, tenantId?: string) {
  const scopeTenantId = resolveTenantId(tenantId);
  const quote = db.quotations.find((item) => item.id === quoteId && item.tenantId === scopeTenantId);
  if (!quote) return null;

  return {
    ...quote,
    client: db.clients.find((item) => item.id === quote.clientId && item.tenantId === scopeTenantId),
    property: quote.propertyId ? db.properties.find((item) => item.id === quote.propertyId && item.tenantId === scopeTenantId) : undefined,
  };
}

export async function addClient(input: {
  tenantId?: string;
  ownerUserId: string;
  name: string;
  phone: string;
  lineId?: string;
  email?: string;
  budgetMin?: number;
  budgetMax?: number;
  budgetType: BudgetType;
  preferredArea?: string;
  firstChoiceArea?: string;
  secondChoiceArea?: string;
  purpose: Purpose;
  loanPreApprovalStatus: LoanPreApprovalStatus;
  desiredMoveInPeriod?: string;
  stage: ClientStage;
  temperature: Temperature;
  brokerageContractType: BrokerageContractType;
  brokerageContractSignedAt?: Date;
  brokerageContractExpiresAt?: Date;
  importantMattersExplainedAt?: Date;
  contractDocumentDeliveredAt?: Date;
  personalInfoConsentAt?: Date;
  amlCheckStatus: AmlCheckStatus;
  nextFollowUpAt?: Date;
  notes?: string;
}) {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const client: Client = {
    id: makeId("client"),
    tenantId: scopeTenantId,
    name: input.name,
    phone: input.phone,
    lineId: input.lineId,
    email: input.email,
    budgetMin: input.budgetMin,
    budgetMax: input.budgetMax,
    budgetType: input.budgetType,
    preferredArea: input.preferredArea,
    firstChoiceArea: input.firstChoiceArea,
    secondChoiceArea: input.secondChoiceArea,
    purpose: input.purpose,
    loanPreApprovalStatus: input.loanPreApprovalStatus,
    desiredMoveInPeriod: input.desiredMoveInPeriod,
    stage: input.stage,
    temperature: input.temperature,
    brokerageContractType: input.brokerageContractType,
    brokerageContractSignedAt: input.brokerageContractSignedAt,
    brokerageContractExpiresAt: input.brokerageContractExpiresAt,
    importantMattersExplainedAt: input.importantMattersExplainedAt,
    contractDocumentDeliveredAt: input.contractDocumentDeliveredAt,
    personalInfoConsentAt: input.personalInfoConsentAt,
    amlCheckStatus: input.amlCheckStatus,
    nextFollowUpAt: input.nextFollowUpAt,
    notes: input.notes,
    ownerUserId: input.ownerUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  db.clients.unshift(client);
  return client;
}

export async function updateClient(
  clientId: string,
  input: {
    tenantId?: string;
    name: string;
    phone: string;
    lineId?: string;
    email?: string;
    budgetMin?: number;
    budgetMax?: number;
    budgetType: BudgetType;
    preferredArea?: string;
    firstChoiceArea?: string;
    secondChoiceArea?: string;
    purpose: Purpose;
    loanPreApprovalStatus: LoanPreApprovalStatus;
    desiredMoveInPeriod?: string;
    stage: ClientStage;
    temperature: Temperature;
    brokerageContractType: BrokerageContractType;
    brokerageContractSignedAt?: Date;
    brokerageContractExpiresAt?: Date;
    importantMattersExplainedAt?: Date;
    contractDocumentDeliveredAt?: Date;
    personalInfoConsentAt?: Date;
    amlCheckStatus: AmlCheckStatus;
    nextFollowUpAt?: Date;
    notes?: string;
  }
) {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const client = db.clients.find((entry) => entry.id === clientId && entry.tenantId === scopeTenantId);
  if (!client) return null;

  client.name = input.name;
  client.phone = input.phone;
  client.lineId = input.lineId;
  client.email = input.email;
  client.budgetMin = input.budgetMin;
  client.budgetMax = input.budgetMax;
  client.budgetType = input.budgetType;
  client.preferredArea = input.preferredArea;
  client.firstChoiceArea = input.firstChoiceArea;
  client.secondChoiceArea = input.secondChoiceArea;
  client.purpose = input.purpose;
  client.loanPreApprovalStatus = input.loanPreApprovalStatus;
  client.desiredMoveInPeriod = input.desiredMoveInPeriod;
  client.stage = input.stage;
  client.temperature = input.temperature;
  client.brokerageContractType = input.brokerageContractType;
  client.brokerageContractSignedAt = input.brokerageContractSignedAt;
  client.brokerageContractExpiresAt = input.brokerageContractExpiresAt;
  client.importantMattersExplainedAt = input.importantMattersExplainedAt;
  client.contractDocumentDeliveredAt = input.contractDocumentDeliveredAt;
  client.personalInfoConsentAt = input.personalInfoConsentAt;
  client.amlCheckStatus = input.amlCheckStatus;
  client.nextFollowUpAt = input.nextFollowUpAt;
  client.notes = input.notes;
  client.updatedAt = new Date();

  return client;
}

export async function appendFollowUp(input: {
  tenantId?: string;
  clientId: string;
  createdById: string;
  type: FollowUpType;
  content: string;
  nextAction?: string;
  nextFollowUpAt?: Date;
}) {
  const scopeTenantId =
    input.tenantId ?? db.clients.find((entry) => entry.id === input.clientId)?.tenantId ?? DEFAULT_TENANT_ID;
  const item: FollowUp = {
    id: makeId("followup"),
    tenantId: resolveTenantId(scopeTenantId),
    clientId: input.clientId,
    createdById: input.createdById,
    type: input.type,
    content: input.content,
    nextAction: input.nextAction,
    nextFollowUpAt: input.nextFollowUpAt,
    createdAt: new Date(),
  };

  db.followUps.unshift(item);

  const client = db.clients.find((entry) => entry.id === input.clientId && entry.tenantId === resolveTenantId(scopeTenantId));
  if (client) {
    client.lastContactedAt = new Date();
    client.nextFollowUpAt = input.nextFollowUpAt;
    client.updatedAt = new Date();
  }

  return item;
}

export async function addAuditLog(input: {
  tenantId?: string;
  userId?: string;
  actorId?: string;
  action: string;
  targetType: AuditLog["targetType"];
  targetId?: string;
  message: string;
  context?: Record<string, unknown>;
}) {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const actorId = input.actorId ?? input.userId;
  if (!actorId) {
    throw new Error("監査ログに必要な actorId が不足しています。");
  }
  const log: AuditLog = {
    id: makeId("audit"),
    tenantId: scopeTenantId,
    actorId,
    userId: actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    message: input.message,
    context: input.context,
    createdAt: new Date(),
  };
  db.auditLogs.unshift(log);
  return log;
}

export async function createComplianceTaskFromAlert(input: {
  tenantId?: string;
  clientId: string;
  alertType: ComplianceAlertType;
  alertTitle: string;
  reason: string;
  dueAt?: Date;
  createdById?: string;
}) {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const client = db.clients.find((entry) => entry.id === input.clientId && entry.tenantId === scopeTenantId);
  if (!client) return null;

  const createdById = input.createdById ?? client.ownerUserId;
  const existing = db.tasks.find(
    (task) =>
      task.clientId === input.clientId &&
      task.tenantId === scopeTenantId &&
      task.title === input.alertTitle &&
      task.status === "pending"
  );
  if (existing) return existing;

  const task: Task = {
    id: makeId("task"),
    tenantId: scopeTenantId,
    clientId: input.clientId,
    title: input.alertTitle,
    dueAt: input.dueAt,
    status: "pending",
    createdById,
    createdAt: new Date(),
  };
  db.tasks.unshift(task);

  db.followUps.unshift({
    id: makeId("followup"),
    tenantId: scopeTenantId,
    clientId: input.clientId,
    createdById,
    type: "note",
    content: `法定対応タスクを作成: ${input.alertTitle}`,
    nextAction: input.reason,
    nextFollowUpAt: input.dueAt,
    createdAt: new Date(),
  });

  client.updatedAt = new Date();
  await addAuditLog({
    tenantId: scopeTenantId,
    userId: createdById,
    action: "compliance_task_created",
    targetType: "task",
    targetId: task.id,
    message: `法定対応タスクを作成しました: ${input.alertTitle}`,
  });

  return task;
}

export async function addTask(input: {
  tenantId?: string;
  clientId?: string;
  title: string;
  dueAt?: Date;
  status?: TaskStatus;
  createdById: string;
}) {
  const scopeTenantId =
    input.tenantId ?? (input.clientId ? db.clients.find((entry) => entry.id === input.clientId)?.tenantId : undefined) ?? DEFAULT_TENANT_ID;
  const task: Task = {
    id: makeId("task"),
    tenantId: resolveTenantId(scopeTenantId),
    clientId: input.clientId,
    title: input.title,
    dueAt: input.dueAt,
    status: input.status ?? "pending",
    createdById: input.createdById,
    createdAt: new Date(),
  };
  db.tasks.unshift(task);
  return task;
}

export async function resolveComplianceAlert(input: {
  tenantId?: string;
  clientId: string;
  alertType: ComplianceAlertType;
  resolvedById: string;
  resolvedAt?: Date;
  extendDays?: number;
}) {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const client = db.clients.find((entry) => entry.id === input.clientId && entry.tenantId === scopeTenantId);
  if (!client) return null;

  const resolvedAt = input.resolvedAt ?? new Date();
  let content = "法定対応を更新しました。";
  if (input.alertType === "missing_35") {
    client.importantMattersExplainedAt = resolvedAt;
    content = "重要事項説明（35条）実施日を記録しました。";
  } else if (input.alertType === "missing_37") {
    client.contractDocumentDeliveredAt = resolvedAt;
    content = "契約書面交付（37条）日を記録しました。";
  } else if (input.alertType === "aml_pending") {
    client.amlCheckStatus = "verified";
    content = "本人確認/AMLステータスを「確認済み」に更新しました。";
  } else if (input.alertType === "missing_pii_consent") {
    client.personalInfoConsentAt = resolvedAt;
    content = "個人情報利用目的の同意確認日を記録しました。";
  } else if (input.alertType === "brokerage_expired" || input.alertType === "brokerage_expiring") {
    const extendDays = input.extendDays && input.extendDays > 0 ? input.extendDays : 90;
    client.brokerageContractSignedAt = client.brokerageContractSignedAt ?? resolvedAt;
    client.brokerageContractType = client.brokerageContractType === "none" ? "general" : client.brokerageContractType;
    client.brokerageContractExpiresAt = new Date(resolvedAt.getTime() + extendDays * 24 * 60 * 60 * 1000);
    content = `媒介契約の満了日を ${extendDays} 日延長して更新しました。`;
  }
  client.updatedAt = new Date();

  db.followUps.unshift({
    id: makeId("followup"),
    tenantId: scopeTenantId,
    clientId: client.id,
    createdById: input.resolvedById,
    type: "note",
    content: `法定対応を解消: ${content}`,
    nextAction: "法定対応記録を再確認",
    createdAt: new Date(),
  });
  await addAuditLog({
    tenantId: scopeTenantId,
    userId: input.resolvedById,
    action: "compliance_resolved",
    targetType: "compliance",
    targetId: client.id,
    message: content,
  });
  return client;
}

export async function updateTaskStatus(input: {
  tenantId?: string;
  taskId: string;
  status: TaskStatus;
  updatedById: string;
}) {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const task = db.tasks.find((entry) => entry.id === input.taskId && entry.tenantId === scopeTenantId);
  if (!task) return null;
  task.status = input.status;
  const statusLabel = input.status === "done" ? "完了" : input.status === "canceled" ? "取消" : "未着手";

  if (task.clientId) {
    db.followUps.unshift({
      id: makeId("followup"),
      tenantId: scopeTenantId,
      clientId: task.clientId,
      createdById: input.updatedById,
      type: "note",
      content: `タスク状態を更新: ${task.title}（${statusLabel}）`,
      nextAction: input.status === "done" ? "次の優先タスクを確認" : "必要に応じて再計画",
      createdAt: new Date(),
    });
  }
  await addAuditLog({
    tenantId: scopeTenantId,
    userId: input.updatedById,
    action: "task_status_updated",
    targetType: "task",
    targetId: task.id,
    message: `${task.title} を ${statusLabel} に更新しました。`,
  });
  return task;
}

export async function rescheduleTask(input: {
  tenantId?: string;
  taskId: string;
  dueAt: Date;
  updatedById: string;
}) {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const task = db.tasks.find((entry) => entry.id === input.taskId && entry.tenantId === scopeTenantId);
  if (!task) return null;
  task.dueAt = input.dueAt;
  task.status = "pending";

  if (task.clientId) {
    db.followUps.unshift({
      id: makeId("followup"),
      tenantId: scopeTenantId,
      clientId: task.clientId,
      createdById: input.updatedById,
      type: "note",
      content: `タスク期限を変更: ${task.title}`,
      nextAction: `新しい期限は ${input.dueAt.toLocaleDateString("ja-JP")}`,
      nextFollowUpAt: input.dueAt,
      createdAt: new Date(),
    });
  }
  await addAuditLog({
    tenantId: scopeTenantId,
    userId: input.updatedById,
    action: "task_rescheduled",
    targetType: "task",
    targetId: task.id,
    message: `${task.title} の期限を ${input.dueAt.toLocaleDateString("ja-JP")} に変更しました。`,
  });
  return task;
}

export async function setClientStage(clientId: string, stage: ClientStage, tenantId?: string) {
  const scopeTenantId = resolveTenantId(tenantId);
  const client = db.clients.find((entry) => entry.id === clientId && entry.tenantId === scopeTenantId);
  if (!client) return null;
  const blockers = validateStageTransition({
    from: client.stage,
    to: stage,
    quotationCount: db.quotations.filter((item) => item.clientId === client.id && item.tenantId === scopeTenantId).length,
    followUpCount: db.followUps.filter((item) => item.clientId === client.id && item.tenantId === scopeTenantId).length,
    hasViewingFollowUp: db.followUps.some((item) => item.clientId === client.id && item.tenantId === scopeTenantId && item.type === "viewing"),
    importantMattersExplainedAt: client.importantMattersExplainedAt,
    personalInfoConsentAt: client.personalInfoConsentAt,
    amlCheckStatus: client.amlCheckStatus,
  });
  if (blockers.length > 0) {
    throw new StageTransitionBlockedError(blockers);
  }
  client.stage = stage;
  client.updatedAt = new Date();
  return client;
}

export async function setClientStageWithLog(input: {
  tenantId?: string;
  clientId: string;
  stage: ClientStage;
  createdById?: string;
  reason?: string;
  locale?: Locale;
}) {
  const scopeTenantId = resolveTenantId(input.tenantId);
  const client = db.clients.find((entry) => entry.id === input.clientId && entry.tenantId === scopeTenantId);
  if (!client) return null;

  const fromStage = client.stage;
  const toStage = input.stage;
  const locale = input.locale ?? "ja";
  const stageLabel = getStageLabel(locale);
  const blockers = validateStageTransition({
    from: fromStage,
    to: toStage,
    quotationCount: db.quotations.filter((item) => item.clientId === client.id && item.tenantId === scopeTenantId).length,
    followUpCount: db.followUps.filter((item) => item.clientId === client.id && item.tenantId === scopeTenantId).length,
    hasViewingFollowUp: db.followUps.some((item) => item.clientId === client.id && item.tenantId === scopeTenantId && item.type === "viewing"),
    importantMattersExplainedAt: client.importantMattersExplainedAt,
    personalInfoConsentAt: client.personalInfoConsentAt,
    amlCheckStatus: client.amlCheckStatus,
    locale,
  });
  if (blockers.length > 0) {
    throw new StageTransitionBlockedError(blockers);
  }

  client.stage = toStage;
  client.updatedAt = new Date();

  if (fromStage !== toStage) {
    db.followUps.unshift({
      id: makeId("followup"),
      tenantId: scopeTenantId,
      clientId: client.id,
      createdById: input.createdById ?? client.ownerUserId,
      type: "note",
      content:
        locale === "zh"
          ? `阶段更新: ${stageLabel[fromStage]} -> ${stageLabel[toStage]}`
          : locale === "ko"
            ? `단계 업데이트: ${stageLabel[fromStage]} -> ${stageLabel[toStage]}`
            : `ステージ更新: ${stageLabel[fromStage]} -> ${stageLabel[toStage]}`,
      nextAction:
        input.reason ??
        (locale === "zh"
          ? "进入下一阶段"
          : locale === "ko"
            ? "다음 단계로 진행"
            : "次のステージへ進める"),
      createdAt: new Date(),
    });
  }

  return client;
}

export async function addQuotation(input: {
  tenantId?: string;
  clientId: string;
  propertyId?: string;
  quoteTitle: string;
  listingPrice: number;
  brokerageFee: number;
  taxFee: number;
  managementFee: number;
  repairFee: number;
  otherFee: number;
  downPayment: number;
  interestRate: number;
  loanYears: number;
  summaryText: string;
}) {
  const scopeTenantId =
    input.tenantId ?? db.clients.find((entry) => entry.id === input.clientId)?.tenantId ?? DEFAULT_TENANT_ID;
  const computed = computeQuote(input);

  const quotation: Quotation = {
    id: makeId("quote"),
    tenantId: resolveTenantId(scopeTenantId),
    clientId: input.clientId,
    propertyId: input.propertyId,
    quoteTitle: input.quoteTitle,
    listingPrice: input.listingPrice,
    brokerageFee: input.brokerageFee,
    taxFee: input.taxFee,
    managementFee: input.managementFee,
    repairFee: input.repairFee,
    otherFee: input.otherFee,
    downPayment: input.downPayment,
    interestRate: input.interestRate,
    loanYears: input.loanYears,
    summaryText: input.summaryText,
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...computed,
  };

  db.quotations.unshift(quotation);

  const client = db.clients.find((entry) => entry.id === input.clientId && entry.tenantId === resolveTenantId(scopeTenantId));
  if (client) {
    const stageBefore = client.stage;
    client.stage = "quoted";
    client.lastContactedAt = new Date();
    client.updatedAt = new Date();

    db.followUps.unshift({
      id: makeId("followup"),
      tenantId: resolveTenantId(scopeTenantId),
      clientId: client.id,
      createdById: client.ownerUserId,
      type: "note",
      content: `見積を作成: ${quotation.quoteTitle}（月々返済 ${Math.round(quotation.monthlyPaymentEstimate).toLocaleString("ja-JP")} 円）`,
      nextAction: "見積を送付し、顧客フィードバックを回収",
      nextFollowUpAt: client.nextFollowUpAt,
      createdAt: new Date(),
    });

    if (stageBefore !== "quoted") {
      db.followUps.unshift({
        id: makeId("followup"),
        tenantId: resolveTenantId(scopeTenantId),
        clientId: client.id,
        createdById: client.ownerUserId,
        type: "note",
        content: `ステージ提案: 「${STAGE_JA_LABEL.quoted}」へ自動反映しました。`,
        nextAction: "頭金と月次支出の受容度を確認",
        nextFollowUpAt: client.nextFollowUpAt,
        createdAt: new Date(),
      });
    }
  }

  return quotation;
}

export async function duplicateQuotation(quoteId: string, tenantId?: string) {
  const scopeTenantId = resolveTenantId(tenantId);
  const source = db.quotations.find((item) => item.id === quoteId && item.tenantId === scopeTenantId);
  if (!source) return null;

  const normalized = source.quoteTitle.replace(/\s+v\d+$/i, "").trim();
  const maxVersion = db.quotations.filter((quote) => quote.tenantId === scopeTenantId).reduce((max, quote) => {
    const match = quote.quoteTitle.match(new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+v(\\d+)$`, "i"));
    if (!match) return max;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 1);
  const nextVersion = maxVersion + 1;

  const quotation: Quotation = {
    ...source,
    id: makeId("quote"),
    quoteTitle: `${normalized} v${nextVersion}`,
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  db.quotations.unshift(quotation);

  const client = db.clients.find((entry) => entry.id === quotation.clientId && entry.tenantId === scopeTenantId);
  if (client) {
    db.followUps.unshift({
      id: makeId("followup"),
      tenantId: scopeTenantId,
      clientId: client.id,
      createdById: client.ownerUserId,
      type: "note",
      content: `見積改訂: 新バージョン ${quotation.quoteTitle} を作成。`,
      nextAction: "差分確認後に顧客へ送付",
      nextFollowUpAt: client.nextFollowUpAt,
      createdAt: new Date(),
    });
  }

  return quotation;
}

export async function updateQuotationStatus(quoteId: string, status: QuoteStatus, tenantId?: string) {
  const scopeTenantId = resolveTenantId(tenantId);
  const quote = db.quotations.find((item) => item.id === quoteId && item.tenantId === scopeTenantId);
  if (!quote) return null;
  quote.status = status;
  quote.updatedAt = new Date();
  return quote;
}

export async function healthCheckDataDriver() {
  return {
    ok: true,
    driver: "memory" as const,
  };
}
