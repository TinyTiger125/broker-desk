import { Pool, type PoolClient } from "pg";
import { computeQuote } from "@/lib/quote";
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
import { buildComplianceAlertList, type ComplianceAlertType } from "@/lib/compliance-alerts";
import { StageTransitionBlockedError, validateStageTransition } from "@/lib/workflow-engine";
import {
  getDefaultOutputTemplateSettings,
  type OutputTemplateSettings,
  type OutputTemplateSettingsInput,
} from "@/lib/output-doc";
import { DEFAULT_TENANT_ID } from "@/lib/tenant-constants";
import type {
  Attachment,
  AttachmentTargetType,
  Client,
  AuditLogFilter,
  ClientListFilter,
  ClientListSort,
  DashboardQuoteItem,
  FollowUp,
  GeneratedOutput,
  ImportJob,
  ImportJobStatus,
  ImportSourceType,
  ImportTargetEntity,
  BrokerageCase,
  BrokerageCaseStatus,
  BrokerageCaseType,
  CorrectionEvent,
  CorrectionEventChangeType,
  CorrectionEventScopeCandidate,
  CorrectionEventTrigger,
  AiExperienceDraft,
  AiExperienceDraftStatus,
  ExtractionReviewItem,
  ExtractionReviewStatus,
  GuaranteeApplicationDraft,
  GuaranteeApplicationDraftStatus,
  Property,
  Quotation,
  Task,
  Tenant,
  TenantMemberListItem,
  TenantMembership,
  TenantMembershipStatus,
  TenantStatus,
  User,
  AuditLog,
  OutputTemplateVersion,
} from "@/lib/data.memory";
import type { TenantRole } from "@/lib/tenant-permissions";

let pool: Pool | null = null;
let schemaEnsured = false;

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

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    pool = new Pool({
      connectionString,
      ssl: connectionString?.includes("supabase.co")
        ? {
            rejectUnauthorized: false,
          }
        : undefined,
    });
  }
  return pool;
}

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function resolveTenantId(tenantId?: string): string {
  return tenantId?.trim() || DEFAULT_TENANT_ID;
}

function mapUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    createdAt: toDate(row.created_at) ?? new Date(),
  };
}

function mapTenant(row: Record<string, unknown>): Tenant {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    status: String(row.status ?? "active") as TenantStatus,
    createdAt: toDate(row.created_at) ?? new Date(),
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
}

function mapTenantMembership(row: Record<string, unknown>): TenantMembership {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    role: String(row.role) as TenantMembership["role"],
    status: String(row.status ?? "active") as TenantMembershipStatus,
    createdAt: toDate(row.created_at) ?? new Date(),
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
}

function mapTenantMember(row: Record<string, unknown>): TenantMemberListItem {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    role: String(row.role) as TenantMembership["role"],
    status: String(row.status ?? "active") as TenantMembershipStatus,
    createdAt: toDate(row.created_at) ?? new Date(),
    updatedAt: toDate(row.updated_at) ?? new Date(),
    user: {
      id: String(row.user_id),
      name: String(row.user_name),
      email: String(row.user_email),
      createdAt: toDate(row.user_created_at) ?? new Date(),
    },
  };
}

function mapClient(row: Record<string, unknown>): Client {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    name: String(row.name),
    phone: String(row.phone),
    lineId: row.line_id ? String(row.line_id) : undefined,
    email: row.email ? String(row.email) : undefined,
    budgetMin: row.budget_min != null ? Number(row.budget_min) : undefined,
    budgetMax: row.budget_max != null ? Number(row.budget_max) : undefined,
    budgetType: (row.budget_type ? String(row.budget_type) : "total_price") as BudgetType,
    preferredArea: row.preferred_area ? String(row.preferred_area) : undefined,
    firstChoiceArea: row.first_choice_area ? String(row.first_choice_area) : undefined,
    secondChoiceArea: row.second_choice_area ? String(row.second_choice_area) : undefined,
    purpose: String(row.purpose) as Purpose,
    loanPreApprovalStatus: (row.loan_pre_approval_status ? String(row.loan_pre_approval_status) : "not_applied") as LoanPreApprovalStatus,
    desiredMoveInPeriod: row.desired_move_in_period ? String(row.desired_move_in_period) : undefined,
    stage: String(row.stage) as ClientStage,
    temperature: String(row.temperature) as Temperature,
    brokerageContractType: (row.brokerage_contract_type ? String(row.brokerage_contract_type) : "none") as BrokerageContractType,
    brokerageContractSignedAt: toDate(row.brokerage_contract_signed_at),
    brokerageContractExpiresAt: toDate(row.brokerage_contract_expires_at),
    importantMattersExplainedAt: toDate(row.important_matters_explained_at),
    contractDocumentDeliveredAt: toDate(row.contract_document_delivered_at),
    personalInfoConsentAt: toDate(row.personal_info_consent_at),
    amlCheckStatus: (row.aml_check_status ? String(row.aml_check_status) : "not_required") as AmlCheckStatus,
    nextFollowUpAt: toDate(row.next_follow_up_at),
    lastContactedAt: toDate(row.last_contacted_at),
    notes: row.notes ? String(row.notes) : undefined,
    ownerUserId: String(row.owner_user_id),
    createdAt: toDate(row.created_at) ?? new Date(),
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
}

function mapProperty(row: Record<string, unknown>): Property {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    name: String(row.name),
    area: row.area ? String(row.area) : undefined,
    address: row.address ? String(row.address) : undefined,
    listingPrice: Number(row.listing_price ?? 0),
    sizeSqm: row.size_sqm != null ? Number(row.size_sqm) : undefined,
    managementFee: row.management_fee != null ? Number(row.management_fee) : undefined,
    repairFee: row.repair_fee != null ? Number(row.repair_fee) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    createdAt: toDate(row.created_at) ?? new Date(),
  };
}

function mapQuotation(row: Record<string, unknown>): Quotation {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    clientId: String(row.client_id),
    propertyId: row.property_id ? String(row.property_id) : undefined,
    quoteTitle: String(row.quote_title),
    listingPrice: Number(row.listing_price ?? 0),
    brokerageFee: Number(row.brokerage_fee ?? 0),
    taxFee: Number(row.tax_fee ?? 0),
    managementFee: Number(row.management_fee ?? 0),
    repairFee: Number(row.repair_fee ?? 0),
    otherFee: Number(row.other_fee ?? 0),
    downPayment: Number(row.down_payment ?? 0),
    loanAmount: Number(row.loan_amount ?? 0),
    interestRate: Number(row.interest_rate ?? 0),
    loanYears: Number(row.loan_years ?? 0),
    monthlyPaymentEstimate: Number(row.monthly_payment_estimate ?? 0),
    totalInitialCost: Number(row.total_initial_cost ?? 0),
    monthlyTotalCost: Number(row.monthly_total_cost ?? 0),
    summaryText: String(row.summary_text ?? ""),
    status: String(row.status ?? "draft") as QuoteStatus,
    createdAt: toDate(row.created_at) ?? new Date(),
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
}

function mapFollowUp(row: Record<string, unknown>): FollowUp {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    clientId: String(row.client_id),
    type: String(row.type) as FollowUpType,
    content: String(row.content),
    nextAction: row.next_action ? String(row.next_action) : undefined,
    nextFollowUpAt: toDate(row.next_follow_up_at),
    createdById: String(row.created_by_id),
    createdAt: toDate(row.created_at) ?? new Date(),
  };
}

function mapTask(row: Record<string, unknown>): Task {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    clientId: row.client_id ? String(row.client_id) : undefined,
    title: String(row.title),
    dueAt: toDate(row.due_at),
    status: String(row.status) as Task["status"],
    createdById: String(row.created_by_id),
    createdAt: toDate(row.created_at) ?? new Date(),
  };
}

function mapAuditLog(row: Record<string, unknown>): AuditLog {
  const actorId = row.actor_id ? String(row.actor_id) : String(row.user_id);
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    actorId,
    userId: actorId,
    action: String(row.action),
    targetType: String(row.target_type) as AuditLog["targetType"],
    targetId: row.target_id ? String(row.target_id) : undefined,
    message: String(row.message),
    context:
      row.context_json && typeof row.context_json === "object"
        ? (row.context_json as Record<string, unknown>)
        : undefined,
    createdAt: toDate(row.created_at) ?? new Date(),
  };
}

function mapOutputTemplateSettings(row: Record<string, unknown>): OutputTemplateSettings {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    userId: String(row.user_id),
    companyName: String(row.company_name ?? ""),
    department: String(row.department ?? ""),
    representative: String(row.representative ?? ""),
    licenseNumber: String(row.license_number ?? ""),
    postalAddress: String(row.postal_address ?? ""),
    phone: String(row.phone ?? ""),
    email: String(row.email ?? ""),
    proposalTitle: String(row.proposal_title ?? "購入提案書"),
    estimateSheetTitle: String(row.estimate_sheet_title ?? "費用見積明細書"),
    fundingPlanTitle: String(row.funding_plan_title ?? "資金計画書（ローン試算）"),
    assumptionMemoTitle: String(row.assumption_memo_title ?? "試算前提条件説明書"),
    documentClassification: String(row.document_classification ?? "社外提出用（案）"),
    disclaimerLine1: String(
      row.disclaimer_line1 ?? "本書は媒介業務における説明補助資料であり、契約条項を確定するものではありません。"
    ),
    disclaimerLine2: String(
      row.disclaimer_line2 ?? "最終条件は重要事項説明書・売買契約書・金融機関提示条件をご確認ください。"
    ),
    disclaimerLine3: String(
      row.disclaimer_line3 ?? "本書の再配布時は最新版番号（文書番号・版数）をご確認ください。"
    ),
    showApprovalSection: Boolean(row.show_approval_section ?? true),
    showLegalStatusDigest: Boolean(row.show_legal_status_digest ?? true),
    showOutstandingBalanceTable: Boolean(row.show_outstanding_balance_table ?? true),
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
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

function mapImportJob(row: Record<string, unknown>): ImportJob {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    userId: String(row.user_id),
    sourceType: String(row.source_type) as ImportSourceType,
    title: String(row.title),
    targetEntity: String(row.target_entity) as ImportTargetEntity,
    status: String(row.status) as ImportJobStatus,
    notes: row.notes ? String(row.notes) : undefined,
    mappingJson: (row.mapping_json as Record<string, string> | null) ?? undefined,
    validationMessage: row.validation_message ? String(row.validation_message) : undefined,
    createdAt: toDate(row.created_at) ?? new Date(),
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
}

function mapBrokerageCase(row: Record<string, unknown>): BrokerageCase {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    userId: String(row.user_id),
    caseType: String(row.case_type) as BrokerageCaseType,
    caseTitle: String(row.case_title),
    primaryPropertyId: row.primary_property_id ? String(row.primary_property_id) : undefined,
    status: String(row.status ?? "reviewed") as BrokerageCaseStatus,
    confirmedDataJson:
      row.confirmed_data_json && typeof row.confirmed_data_json === "object"
        ? (row.confirmed_data_json as Record<string, unknown>)
        : {},
    sourceImportJobIds: Array.isArray(row.source_import_job_ids)
      ? (row.source_import_job_ids as unknown[]).map(String)
      : [],
    createdAt: toDate(row.created_at) ?? new Date(),
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
}

function mapExtractionReviewItem(row: Record<string, unknown>): ExtractionReviewItem {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    userId: String(row.user_id),
    caseId: String(row.case_id),
    importJobId: String(row.import_job_id),
    fieldKey: String(row.field_key),
    label: String(row.label),
    extractedValue: String(row.extracted_value ?? ""),
    normalizedValue: String(row.normalized_value ?? ""),
    editedValue: row.edited_value ? String(row.edited_value) : undefined,
    finalValue: row.final_value ? String(row.final_value) : undefined,
    sourceSheet: String(row.source_sheet ?? ""),
    sourceCell: row.source_cell ? String(row.source_cell) : undefined,
    sourceRange: row.source_range ? String(row.source_range) : undefined,
    method: String(row.method ?? ""),
    confidence: Number(row.confidence ?? 0),
    reviewStatus: String(row.review_status ?? "suggested") as ExtractionReviewStatus,
    sourceFileHash: String(row.source_file_hash ?? ""),
    templateVersion: String(row.template_version ?? ""),
    reviewedById: row.reviewed_by_id ? String(row.reviewed_by_id) : undefined,
    reviewedAt: toDate(row.reviewed_at) ?? new Date(),
    createdAt: toDate(row.created_at) ?? new Date(),
  };
}

function mapCorrectionEvent(row: Record<string, unknown>): CorrectionEvent {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    userId: String(row.user_id),
    caseId: String(row.case_id),
    trigger: String(row.trigger) as CorrectionEventTrigger,
    fieldKey: String(row.field_key),
    fieldLabel: String(row.field_label),
    aiValue: row.ai_value ? String(row.ai_value) : undefined,
    confirmedValue: row.confirmed_value ? String(row.confirmed_value) : undefined,
    changeType: String(row.change_type) as CorrectionEventChangeType,
    sourceImportJobId: row.source_import_job_id ? String(row.source_import_job_id) : undefined,
    sourceLocation: row.source_location ? String(row.source_location) : undefined,
    extractionMethod: row.extraction_method ? String(row.extraction_method) : undefined,
    confidenceBefore: row.confidence_before === null || row.confidence_before === undefined ? undefined : Number(row.confidence_before),
    templateId: row.template_id ? String(row.template_id) : undefined,
    scopeCandidate: String(row.scope_candidate ?? "case_only") as CorrectionEventScopeCandidate,
    sourceEvidenceJson:
      row.source_evidence_json && typeof row.source_evidence_json === "object"
        ? (row.source_evidence_json as Record<string, unknown>)
        : undefined,
    createdAt: toDate(row.created_at) ?? new Date(),
  };
}

function mapAiExperienceDraft(row: Record<string, unknown>): AiExperienceDraft {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    userId: String(row.user_id),
    status: String(row.status ?? "draft") as AiExperienceDraftStatus,
    title: String(row.title ?? ""),
    bodyMarkdown: String(row.body_markdown ?? ""),
    eventIds: Array.isArray(row.event_ids) ? (row.event_ids as unknown[]).map(String) : [],
    fieldKey: row.field_key ? String(row.field_key) : undefined,
    templateId: row.template_id ? String(row.template_id) : undefined,
    changeType: String(row.change_type) as CorrectionEventChangeType,
    scopeCandidate: String(row.scope_candidate ?? "case_only") as CorrectionEventScopeCandidate,
    evidenceSummaryJson:
      row.evidence_summary_json && typeof row.evidence_summary_json === "object"
        ? (row.evidence_summary_json as Record<string, unknown>)
        : undefined,
    createdAt: toDate(row.created_at) ?? new Date(),
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
}

function mapGuaranteeApplicationDraft(row: Record<string, unknown>): GuaranteeApplicationDraft {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    userId: String(row.user_id),
    caseId: String(row.case_id),
    templateId: String(row.template_id),
    companyCode: String(row.company_code ?? "friends_guarantee") as GuaranteeApplicationDraft["companyCode"],
    status: String(row.status ?? "draft") as GuaranteeApplicationDraftStatus,
    fieldValuesJson:
      row.field_values_json && typeof row.field_values_json === "object"
        ? (row.field_values_json as Record<string, unknown>)
        : {},
    fieldStatusesJson:
      row.field_statuses_json && typeof row.field_statuses_json === "object"
        ? (row.field_statuses_json as Record<string, string>)
        : {},
    lastReviewedAt: toDate(row.last_reviewed_at),
    createdAt: toDate(row.created_at) ?? new Date(),
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
}

function mapAttachment(row: Record<string, unknown>): Attachment {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    userId: String(row.user_id),
    targetType: String(row.target_type) as AttachmentTargetType,
    targetId: String(row.target_id),
    fileName: String(row.file_name),
    fileType: row.file_type ? String(row.file_type) : undefined,
    fileSizeBytes: row.file_size_bytes != null ? Number(row.file_size_bytes) : undefined,
    storagePath: row.storage_path ? String(row.storage_path) : undefined,
    uploadedAt: toDate(row.uploaded_at) ?? new Date(),
  };
}

function mapGeneratedOutput(row: Record<string, unknown>): GeneratedOutput {
  const actorId = row.actor_id ? String(row.actor_id) : String(row.user_id);
  const quoteId = row.quote_id ? String(row.quote_id) : undefined;
  const sourceQuoteId = row.source_quote_id ? String(row.source_quote_id) : quoteId;
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    actorId,
    userId: actorId,
    sourceQuoteId,
    quoteId,
    propertyId: row.property_id ? String(row.property_id) : undefined,
    partyId: row.party_id ? String(row.party_id) : undefined,
    outputType: String(row.output_type) as GeneratedOutput["outputType"],
    outputFormat: String(row.output_format) as GeneratedOutput["outputFormat"],
    language: String(row.language) as Locale,
    title: String(row.title),
    documentNumber: String(row.document_number ?? ""),
    templateVersionId: row.template_version_id ? String(row.template_version_id) : undefined,
    caseId: row.case_id ? String(row.case_id) : undefined,
    templateId: row.template_id ? String(row.template_id) : undefined,
    inputDataSnapshot: row.input_data_snapshot && typeof row.input_data_snapshot === "object" ? row.input_data_snapshot as Record<string, unknown> : undefined,
    draftValueSnapshot: row.draft_value_snapshot && typeof row.draft_value_snapshot === "object" ? row.draft_value_snapshot as Record<string, unknown> : undefined,
    fieldMappingSnapshot: row.field_mapping_snapshot && typeof row.field_mapping_snapshot === "object" ? row.field_mapping_snapshot as Record<string, unknown> : undefined,
    layoutSnapshot: row.layout_snapshot && typeof row.layout_snapshot === "object" ? row.layout_snapshot as Record<string, unknown> : undefined,
    generatedAt: toDate(row.generated_at) ?? new Date(),
  };
}

function mapOutputTemplateVersion(row: Record<string, unknown>): OutputTemplateVersion {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    userId: String(row.user_id),
    versionNumber: Number(row.version_number ?? 0),
    versionLabel: String(row.version_label ?? ""),
    changeNote: row.change_note ? String(row.change_note) : undefined,
    settingsSnapshot: row.settings_snapshot as OutputTemplateSettingsInput,
    isActive: Boolean(row.is_active),
    createdAt: toDate(row.created_at) ?? new Date(),
  };
}

async function ensureSchema() {
  if (schemaEnsured) return;
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tenant_memberships (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      line_id TEXT,
      email TEXT,
      budget_min INTEGER,
      budget_max INTEGER,
      budget_type TEXT NOT NULL DEFAULT 'total_price',
      preferred_area TEXT,
      first_choice_area TEXT,
      second_choice_area TEXT,
      purpose TEXT NOT NULL,
      loan_pre_approval_status TEXT NOT NULL DEFAULT 'not_applied',
      desired_move_in_period TEXT,
      stage TEXT NOT NULL,
      temperature TEXT NOT NULL,
      brokerage_contract_type TEXT NOT NULL DEFAULT 'none',
      brokerage_contract_signed_at TIMESTAMPTZ,
      brokerage_contract_expires_at TIMESTAMPTZ,
      important_matters_explained_at TIMESTAMPTZ,
      contract_document_delivered_at TIMESTAMPTZ,
      personal_info_consent_at TIMESTAMPTZ,
      aml_check_status TEXT NOT NULL DEFAULT 'not_required',
      next_follow_up_at TIMESTAMPTZ,
      last_contacted_at TIMESTAMPTZ,
      notes TEXT,
      owner_user_id TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      name TEXT NOT NULL,
      area TEXT,
      address TEXT,
      listing_price INTEGER NOT NULL,
      size_sqm DOUBLE PRECISION,
      management_fee INTEGER,
      repair_fee INTEGER,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      client_id TEXT NOT NULL REFERENCES clients(id),
      property_id TEXT REFERENCES properties(id),
      quote_title TEXT NOT NULL,
      listing_price INTEGER NOT NULL,
      brokerage_fee INTEGER NOT NULL,
      tax_fee INTEGER NOT NULL,
      management_fee INTEGER NOT NULL,
      repair_fee INTEGER NOT NULL,
      other_fee INTEGER NOT NULL,
      down_payment INTEGER NOT NULL,
      loan_amount INTEGER NOT NULL,
      interest_rate DOUBLE PRECISION NOT NULL,
      loan_years INTEGER NOT NULL,
      monthly_payment_estimate INTEGER NOT NULL,
      total_initial_cost INTEGER NOT NULL,
      monthly_total_cost INTEGER NOT NULL,
      summary_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS follow_ups (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      client_id TEXT NOT NULL REFERENCES clients(id),
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      next_action TEXT,
      next_follow_up_at TIMESTAMPTZ,
      created_by_id TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      client_id TEXT REFERENCES clients(id),
      title TEXT NOT NULL,
      due_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'pending',
      created_by_id TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      actor_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      message TEXT NOT NULL,
      context_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS output_template_settings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      company_name TEXT NOT NULL,
      department TEXT NOT NULL,
      representative TEXT NOT NULL,
      license_number TEXT NOT NULL,
      postal_address TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      proposal_title TEXT NOT NULL,
      estimate_sheet_title TEXT NOT NULL,
      funding_plan_title TEXT NOT NULL,
      assumption_memo_title TEXT NOT NULL,
      document_classification TEXT NOT NULL,
      disclaimer_line1 TEXT NOT NULL,
      disclaimer_line2 TEXT NOT NULL,
      disclaimer_line3 TEXT NOT NULL,
      show_approval_section BOOLEAN NOT NULL DEFAULT TRUE,
      show_legal_status_digest BOOLEAN NOT NULL DEFAULT TRUE,
      show_outstanding_balance_table BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS output_template_versions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      version_number INTEGER NOT NULL,
      version_label TEXT NOT NULL,
      change_note TEXT,
      settings_snapshot JSONB NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS import_jobs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      source_type TEXT NOT NULL,
      title TEXT NOT NULL,
      target_entity TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      notes TEXT,
      mapping_json JSONB,
      validation_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS brokerage_cases (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      case_type TEXT NOT NULL DEFAULT 'unit_sale',
      case_title TEXT NOT NULL,
      primary_property_id TEXT,
      status TEXT NOT NULL DEFAULT 'reviewed',
      confirmed_data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      source_import_job_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS extraction_review_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      case_id TEXT NOT NULL REFERENCES brokerage_cases(id) ON DELETE CASCADE,
      import_job_id TEXT NOT NULL REFERENCES import_jobs(id),
      field_key TEXT NOT NULL,
      label TEXT NOT NULL,
      extracted_value TEXT NOT NULL DEFAULT '',
      normalized_value TEXT NOT NULL DEFAULT '',
      edited_value TEXT,
      final_value TEXT,
      source_sheet TEXT NOT NULL DEFAULT '',
      source_cell TEXT,
      source_range TEXT,
      method TEXT NOT NULL DEFAULT '',
      confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
      review_status TEXT NOT NULL,
      source_file_hash TEXT NOT NULL DEFAULT '',
      template_version TEXT NOT NULL DEFAULT '',
      reviewed_by_id TEXT,
      reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS guarantee_application_drafts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      case_id TEXT NOT NULL REFERENCES brokerage_cases(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL,
      company_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      field_values_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      field_statuses_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, user_id, case_id, template_id)
    );

    CREATE TABLE IF NOT EXISTS correction_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      case_id TEXT NOT NULL REFERENCES brokerage_cases(id) ON DELETE CASCADE,
      trigger TEXT NOT NULL,
      field_key TEXT NOT NULL,
      field_label TEXT NOT NULL,
      ai_value TEXT,
      confirmed_value TEXT,
      change_type TEXT NOT NULL,
      source_import_job_id TEXT,
      source_location TEXT,
      extraction_method TEXT,
      confidence_before DOUBLE PRECISION,
      template_id TEXT,
      scope_candidate TEXT NOT NULL DEFAULT 'case_only',
      source_evidence_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ai_experience_drafts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'draft',
      title TEXT NOT NULL,
      body_markdown TEXT NOT NULL,
      event_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      field_key TEXT,
      template_id TEXT,
      change_type TEXT NOT NULL,
      scope_candidate TEXT NOT NULL DEFAULT 'case_only',
      evidence_summary_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT,
      file_size_bytes INTEGER,
      storage_path TEXT,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS generated_outputs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      actor_id TEXT REFERENCES users(id),
      quote_id TEXT REFERENCES quotations(id),
      source_quote_id TEXT,
      property_id TEXT,
      party_id TEXT,
      output_type TEXT NOT NULL,
      output_format TEXT NOT NULL DEFAULT 'pdf',
      language TEXT NOT NULL DEFAULT 'ja',
      title TEXT NOT NULL,
      document_number TEXT,
      template_version_id TEXT,
      case_id TEXT,
      template_id TEXT,
      input_data_snapshot JSONB,
      draft_value_snapshot JSONB,
      field_mapping_snapshot JSONB,
      layout_snapshot JSONB,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user_status ON tenant_memberships(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_role ON tenant_memberships(tenant_id, role);
    CREATE INDEX IF NOT EXISTS idx_clients_tenant_owner_stage ON clients(tenant_id, owner_user_id, stage);
    CREATE INDEX IF NOT EXISTS idx_properties_tenant_created ON properties(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quotes_tenant_created ON quotations(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_clients_owner_stage ON clients(owner_user_id, stage);
    CREATE INDEX IF NOT EXISTS idx_clients_next_followup ON clients(next_follow_up_at);
    CREATE INDEX IF NOT EXISTS idx_quotes_client_created ON quotations(client_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_followups_client_created ON follow_ups(client_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tasks_client_status_due ON tasks(client_id, status, due_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs(actor_id, created_at DESC);
    ALTER TABLE output_template_settings DROP CONSTRAINT IF EXISTS output_template_settings_user_id_key;
    DROP INDEX IF EXISTS idx_output_template_user;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_output_template_tenant_user ON output_template_settings(tenant_id, user_id);
    DROP INDEX IF EXISTS idx_output_template_version_user_number;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_output_template_version_tenant_user_number ON output_template_versions(tenant_id, user_id, version_number);
    CREATE INDEX IF NOT EXISTS idx_output_template_version_user_created ON output_template_versions(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_import_jobs_user_created ON import_jobs(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_import_jobs_tenant_user_created ON import_jobs(tenant_id, user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_brokerage_cases_user_updated ON brokerage_cases(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_brokerage_cases_tenant_user_updated ON brokerage_cases(tenant_id, user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_extraction_review_case ON extraction_review_items(case_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_extraction_review_tenant_case ON extraction_review_items(tenant_id, case_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_extraction_review_import_job ON extraction_review_items(import_job_id);
    CREATE INDEX IF NOT EXISTS idx_guarantee_drafts_case_template ON guarantee_application_drafts(user_id, case_id, template_id);
    CREATE INDEX IF NOT EXISTS idx_guarantee_drafts_tenant_case_template ON guarantee_application_drafts(tenant_id, user_id, case_id, template_id);
    ALTER TABLE guarantee_application_drafts DROP CONSTRAINT IF EXISTS guarantee_application_drafts_user_id_case_id_template_id_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_guarantee_drafts_tenant_user_case_template_unique ON guarantee_application_drafts(tenant_id, user_id, case_id, template_id);
    CREATE INDEX IF NOT EXISTS idx_correction_events_case_created ON correction_events(user_id, case_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_correction_events_tenant_case_created ON correction_events(tenant_id, user_id, case_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_correction_events_change_type ON correction_events(change_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_experience_drafts_user_status_created ON ai_experience_drafts(user_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_experience_drafts_tenant_status_created ON ai_experience_drafts(tenant_id, user_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_experience_drafts_scope ON ai_experience_drafts(scope_candidate, template_id, field_key);
    CREATE INDEX IF NOT EXISTS idx_attachments_user_target ON attachments(user_id, target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_tenant_user_target ON attachments(tenant_id, user_id, target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_generated_outputs_user_created ON generated_outputs(user_id, generated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_generated_outputs_tenant_user_created ON generated_outputs(tenant_id, user_id, generated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_generated_outputs_actor_created ON generated_outputs(actor_id, generated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_generated_outputs_quote ON generated_outputs(quote_id, generated_at DESC);

    ALTER TABLE clients ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE properties ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE output_template_versions ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE brokerage_cases ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE extraction_review_items ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE guarantee_application_drafts ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE correction_events ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE ai_experience_drafts ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE attachments ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';

    ALTER TABLE clients ADD COLUMN IF NOT EXISTS budget_type TEXT NOT NULL DEFAULT 'total_price';
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS first_choice_area TEXT;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS second_choice_area TEXT;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS loan_pre_approval_status TEXT NOT NULL DEFAULT 'not_applied';
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS desired_move_in_period TEXT;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS brokerage_contract_type TEXT NOT NULL DEFAULT 'none';
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS brokerage_contract_signed_at TIMESTAMPTZ;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS brokerage_contract_expires_at TIMESTAMPTZ;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS important_matters_explained_at TIMESTAMPTZ;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_document_delivered_at TIMESTAMPTZ;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS personal_info_consent_at TIMESTAMPTZ;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS aml_check_status TEXT NOT NULL DEFAULT 'not_required';

    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS company_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT '';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS representative TEXT NOT NULL DEFAULT '';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS license_number TEXT NOT NULL DEFAULT '';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS postal_address TEXT NOT NULL DEFAULT '';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS proposal_title TEXT NOT NULL DEFAULT '購入提案書';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS estimate_sheet_title TEXT NOT NULL DEFAULT '費用見積明細書';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS funding_plan_title TEXT NOT NULL DEFAULT '資金計画書（ローン試算）';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS assumption_memo_title TEXT NOT NULL DEFAULT '試算前提条件説明書';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS document_classification TEXT NOT NULL DEFAULT '社外提出用（案）';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS disclaimer_line1 TEXT NOT NULL DEFAULT '本書は媒介業務における説明補助資料であり、契約条項を確定するものではありません。';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS disclaimer_line2 TEXT NOT NULL DEFAULT '最終条件は重要事項説明書・売買契約書・金融機関提示条件をご確認ください。';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS disclaimer_line3 TEXT NOT NULL DEFAULT '本書の再配布時は最新版番号（文書番号・版数）をご確認ください。';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS show_approval_section BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS show_legal_status_digest BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS show_outstanding_balance_table BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ALTER TABLE output_template_versions ADD COLUMN IF NOT EXISTS version_label TEXT NOT NULL DEFAULT 'テンプレート版';
    ALTER TABLE output_template_versions ADD COLUMN IF NOT EXISTS change_note TEXT;
    ALTER TABLE output_template_versions ADD COLUMN IF NOT EXISTS settings_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE output_template_versions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE output_template_versions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS mapping_json JSONB;
    ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS validation_message TEXT;
    ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ALTER TABLE attachments ADD COLUMN IF NOT EXISTS file_type TEXT;
    ALTER TABLE attachments ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER;
    ALTER TABLE attachments ADD COLUMN IF NOT EXISTS storage_path TEXT;
    ALTER TABLE attachments ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS output_format TEXT NOT NULL DEFAULT 'pdf';
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'ja';
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS actor_id TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS property_id TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS party_id TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS source_quote_id TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS document_number TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS template_version_id TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS case_id TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS template_id TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS input_data_snapshot JSONB;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS draft_value_snapshot JSONB;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS field_mapping_snapshot JSONB;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS layout_snapshot JSONB;
    ALTER TABLE generated_outputs ALTER COLUMN quote_id DROP NOT NULL;

    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_id TEXT;
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS context_json JSONB;

    UPDATE generated_outputs SET source_quote_id = quote_id WHERE source_quote_id IS NULL;
    UPDATE generated_outputs SET actor_id = user_id WHERE actor_id IS NULL;
    UPDATE generated_outputs SET document_number = id WHERE document_number IS NULL;
    UPDATE audit_logs SET actor_id = user_id WHERE actor_id IS NULL;
    UPDATE audit_logs SET context_json = '{}'::jsonb WHERE context_json IS NULL;
  `);

  const userCount = await db.query("SELECT COUNT(*)::int AS count FROM users");
  const count = Number(userCount.rows[0]?.count ?? 0);
  if (count === 0) {
    await db.query(
      `INSERT INTO users (id, name, email, password_hash)
       VALUES
        ($1, $2, $3, $4),
        ($5, $6, $7, $8)`,
      [
        "user_demo",
        "デモ担当者",
        "demo@brokerdesk.local",
        "demo_password_hash",
        "user_ops",
        "運用担当 佐伯",
        "ops@brokerdesk.local",
        "ops_demo_password_hash",
      ]
    );
  }

  await db.query(
    `INSERT INTO users (id, name, email, password_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    ["user_ops", "運用担当 佐伯", "ops@brokerdesk.local", "ops_demo_password_hash"]
  );

  await db.query(
    `INSERT INTO tenants (id, name, slug, status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      slug = EXCLUDED.slug,
      status = EXCLUDED.status,
      updated_at = NOW()`,
    ["tenant_cherry", "Cherry Investment株式会社", "cherry-investment", "active"]
  );
  await db.query(
    `INSERT INTO tenant_memberships (id, tenant_id, user_id, role, status)
     VALUES
      ($1, $2, $3, $4, $5),
      ($6, $7, $8, $9, $10)
     ON CONFLICT (tenant_id, user_id) DO UPDATE SET
      role = EXCLUDED.role,
      status = EXCLUDED.status,
      updated_at = NOW()`,
    [
      "membership_cherry_owner",
      "tenant_cherry",
      "user_demo",
      "tenant_owner",
      "active",
      "membership_cherry_admin",
      "tenant_cherry",
      "user_ops",
      "tenant_admin",
      "active",
    ]
  );

  const templateCount = await db.query(
    "SELECT COUNT(*)::int AS count FROM output_template_settings WHERE user_id = $1",
    ["user_demo"]
  );
  if (Number(templateCount.rows[0]?.count ?? 0) === 0) {
    const defaults = getDefaultOutputTemplateSettings("user_demo");
    await db.query(
      `INSERT INTO output_template_settings (
        id, user_id, company_name, department, representative, license_number, postal_address, phone, email,
        proposal_title, estimate_sheet_title, funding_plan_title, assumption_memo_title,
        document_classification, disclaimer_line1, disclaimer_line2, disclaimer_line3,
        show_approval_section, show_legal_status_digest, show_outstanding_balance_table, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,
        $10,$11,$12,$13,
        $14,$15,$16,$17,
        $18,$19,$20,$21
      )`,
      [
        defaults.id,
        defaults.userId,
        defaults.companyName,
        defaults.department,
        defaults.representative,
        defaults.licenseNumber,
        defaults.postalAddress,
        defaults.phone,
        defaults.email,
        defaults.proposalTitle,
        defaults.estimateSheetTitle,
        defaults.fundingPlanTitle,
        defaults.assumptionMemoTitle,
        defaults.documentClassification,
        defaults.disclaimerLine1,
        defaults.disclaimerLine2,
        defaults.disclaimerLine3,
        defaults.showApprovalSection,
        defaults.showLegalStatusDigest,
        defaults.showOutstandingBalanceTable,
        defaults.updatedAt,
      ]
    );
  }

  const versionCount = await db.query(
    "SELECT COUNT(*)::int AS count FROM output_template_versions WHERE user_id = $1",
    ["user_demo"]
  );
  if (Number(versionCount.rows[0]?.count ?? 0) === 0) {
    const defaults = getDefaultOutputTemplateSettings("user_demo");
    await db.query(
      `INSERT INTO output_template_versions (
        id, user_id, version_number, version_label, change_note, settings_snapshot, is_active, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
      [
        "tplver_user_demo_001",
        "user_demo",
        1,
        "標準版 v1",
        "初期標準テンプレート",
        JSON.stringify(toTemplateSettingsInput(defaults)),
        true,
        defaults.updatedAt,
      ]
    );
  }

  const importCount = await db.query(
    "SELECT COUNT(*)::int AS count FROM import_jobs WHERE user_id = $1",
    ["user_demo"]
  );
  if (Number(importCount.rows[0]?.count ?? 0) === 0) {
    await db.query(
      `INSERT INTO import_jobs (
        id, user_id, source_type, title, target_entity, status, notes, mapping_json, validation_message, created_at, updated_at
      ) VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$10),
      ($11,$2,$12,$13,$14,$15,$16,$17::jsonb,$18,$19,$19),
      ($20,$2,$21,$22,$23,$24,$25,NULL,NULL,$26,$26)`,
      [
        "import_001",
        "user_demo",
        "excel",
        "物件台帳_2026Q1.xlsx",
        "properties",
        "completed",
        "物件31件を取込",
        JSON.stringify({
          物件名: "name",
          所在地: "address",
          エリア: "area",
          売出価格: "listing_price",
        }),
        "必須項目を充足（4/4）",
        new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        "import_002",
        "pdf",
        "旧契約書一括取込（5件）",
        "contracts",
        "mapped",
        "契約種別の確認待ち",
        JSON.stringify({
          契約番号: "contract_number",
          契約種別: "contract_type",
          物件ID: "property_id",
        }),
        "必須項目が不足（署名日）",
        new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        "import_003",
        "manual",
        "修繕依頼履歴_手入力",
        "service_requests",
        "queued",
        null,
        new Date(Date.now() - 12 * 60 * 60 * 1000),
      ]
    );
  }

  const attachmentCount = await db.query(
    "SELECT COUNT(*)::int AS count FROM attachments WHERE user_id = $1",
    ["user_demo"]
  );
  if (Number(attachmentCount.rows[0]?.count ?? 0) === 0) {
    await db.query(
      `INSERT INTO attachments (
        id, user_id, target_type, target_id, file_name, file_type, file_size_bytes, storage_path, uploaded_at
      ) VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9),
      ($10,$2,$11,$12,$13,$14,$15,$16,$17),
      ($18,$2,$19,$20,$21,$22,$23,$24,$25)`,
      [
        "att_prop_shibuya_floor",
        "user_demo",
        "property",
        "prop_shibuya",
        "渋谷駅徒歩8分マンション_間取り図.pdf",
        "application/pdf",
        842311,
        "demo/property/prop_shibuya/floorplan.pdf",
        new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        "att_contract_1",
        "contract",
        "quote_lin_a",
        "売買契約書ドラフト_高橋様.pdf",
        "application/pdf",
        1032022,
        "demo/contracts/quote_lin_a/draft.pdf",
        new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        "att_import_1",
        "import_job",
        "import_002",
        "旧契約書一括.zip",
        "application/zip",
        4245321,
        "demo/import/import_002/source.zip",
        new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      ]
    );
  }

  schemaEnsured = true;
}

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function isValidImportStatusTransition(from: ImportJobStatus, to: ImportJobStatus, allowRetry: boolean): boolean {
  if (from === to) return true;
  if (allowRetry && to === "queued") return true;
  if (from === "queued" && to === "mapped") return true;
  if (from === "mapped" && (to === "queued" || to === "completed")) return true;
  return false;
}

export async function listUsers(limit = 50): Promise<User[]> {
  await ensureSchema();
  const result = await getPool().query("SELECT * FROM users ORDER BY created_at ASC LIMIT $1", [limit]);
  return result.rows.map(mapUser);
}

export async function getUserById(userId: string): Promise<User | null> {
  await ensureSchema();
  const result = await getPool().query("SELECT * FROM users WHERE id = $1 LIMIT 1", [userId]);
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function getDefaultUser(preferredUserId?: string) {
  await ensureSchema();
  if (preferredUserId) {
    const found = await getUserById(preferredUserId);
    if (found) return found;
  }
  const result = await getPool().query("SELECT * FROM users ORDER BY created_at ASC LIMIT 1");
  const row = result.rows[0];
  return row ? mapUser(row) : null;
}

export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  await ensureSchema();
  const result = await getPool().query("SELECT * FROM tenants WHERE id = $1 LIMIT 1", [tenantId]);
  return result.rows[0] ? mapTenant(result.rows[0]) : null;
}

export async function listTenantMemberships(userId: string): Promise<TenantMembership[]> {
  await ensureSchema();
  const result = await getPool().query(
    "SELECT * FROM tenant_memberships WHERE user_id = $1 ORDER BY created_at ASC",
    [userId],
  );
  return result.rows.map(mapTenantMembership);
}

export async function getTenantMembership(input: { userId: string; tenantId: string }): Promise<TenantMembership | null> {
  await ensureSchema();
  const result = await getPool().query(
    "SELECT * FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2 LIMIT 1",
    [input.userId, input.tenantId],
  );
  return result.rows[0] ? mapTenantMembership(result.rows[0]) : null;
}

export async function listTenantsForUser(userId: string): Promise<Tenant[]> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT tenants.*
     FROM tenants
     JOIN tenant_memberships ON tenant_memberships.tenant_id = tenants.id
     WHERE tenant_memberships.user_id = $1
       AND tenant_memberships.status = 'active'
       AND tenants.status = 'active'
     ORDER BY tenants.created_at ASC`,
    [userId],
  );
  return result.rows.map(mapTenant);
}

export async function listTenantMembers(tenantId: string): Promise<TenantMemberListItem[]> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const result = await getPool().query(
    `SELECT
       tenant_memberships.*,
       users.name AS user_name,
       users.email AS user_email,
       users.created_at AS user_created_at
     FROM tenant_memberships
     JOIN users ON users.id = tenant_memberships.user_id
     WHERE tenant_memberships.tenant_id = $1
     ORDER BY
       CASE tenant_memberships.status WHEN 'active' THEN 0 WHEN 'invited' THEN 1 ELSE 2 END,
       tenant_memberships.created_at ASC`,
    [scopeTenantId],
  );
  return result.rows.map(mapTenantMember);
}

export async function inviteTenantMember(input: {
  tenantId?: string;
  name: string;
  email: string;
  role: TenantRole;
  status?: TenantMembershipStatus;
}): Promise<TenantMemberListItem> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim() || email;
  if (!email) throw new Error("member email is required");

  return withTransaction(async (client) => {
    const userResult = await client.query("SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1", [email]);
    let user = userResult.rows[0] ? mapUser(userResult.rows[0]) : null;
    if (!user) {
      const inserted = await client.query(
        `INSERT INTO users (id, name, email, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [genId("user"), name, email, "local_invited_user"],
      );
      user = mapUser(inserted.rows[0]);
    }

    const membershipId = genId("membership");
    const membershipResult = await client.query(
      `INSERT INTO tenant_memberships (id, tenant_id, user_id, role, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET
         role = EXCLUDED.role,
         status = EXCLUDED.status,
         updated_at = NOW()
       RETURNING *`,
      [membershipId, scopeTenantId, user.id, input.role, input.status ?? "active"],
    );
    const membership = mapTenantMembership(membershipResult.rows[0]);
    return {
      ...membership,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
    };
  });
}

export async function updateTenantMemberRole(input: {
  tenantId?: string;
  membershipId: string;
  role: TenantRole;
}): Promise<TenantMemberListItem | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `UPDATE tenant_memberships
     SET role = $1, updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3
     RETURNING *`,
    [input.role, input.membershipId, scopeTenantId],
  );
  const membership = result.rows[0] ? mapTenantMembership(result.rows[0]) : null;
  if (!membership) return null;
  const user = await getUserById(membership.userId);
  if (!user) return null;
  return {
    ...membership,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    },
  };
}

export async function updateTenantMemberStatus(input: {
  tenantId?: string;
  membershipId: string;
  status: TenantMembershipStatus;
}): Promise<TenantMemberListItem | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `UPDATE tenant_memberships
     SET status = $1, updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3
     RETURNING *`,
    [input.status, input.membershipId, scopeTenantId],
  );
  const membership = result.rows[0] ? mapTenantMembership(result.rows[0]) : null;
  if (!membership) return null;
  const user = await getUserById(membership.userId);
  if (!user) return null;
  return {
    ...membership,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    },
  };
}

export async function getOutputTemplateSettings(userId: string, tenantId = DEFAULT_TENANT_ID): Promise<OutputTemplateSettings> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const db = getPool();
  const existingRes = await db.query(
    "SELECT * FROM output_template_settings WHERE user_id = $1 AND tenant_id = $2 LIMIT 1",
    [userId, scopeTenantId]
  );
  if (existingRes.rows[0]) {
    return mapOutputTemplateSettings(existingRes.rows[0]);
  }

  const defaults = getDefaultOutputTemplateSettings(userId, scopeTenantId);
  const insertedRes = await db.query(
    `INSERT INTO output_template_settings (
      id, tenant_id, user_id, company_name, department, representative, license_number, postal_address, phone, email,
      proposal_title, estimate_sheet_title, funding_plan_title, assumption_memo_title,
      document_classification, disclaimer_line1, disclaimer_line2, disclaimer_line3,
      show_approval_section, show_legal_status_digest, show_outstanding_balance_table, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,
      $15,$16,$17,$18,
      $19,$20,$21,$22
    )
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET updated_at = output_template_settings.updated_at
    RETURNING *`,
    [
      defaults.id,
      scopeTenantId,
      defaults.userId,
      defaults.companyName,
      defaults.department,
      defaults.representative,
      defaults.licenseNumber,
      defaults.postalAddress,
      defaults.phone,
      defaults.email,
      defaults.proposalTitle,
      defaults.estimateSheetTitle,
      defaults.fundingPlanTitle,
      defaults.assumptionMemoTitle,
      defaults.documentClassification,
      defaults.disclaimerLine1,
      defaults.disclaimerLine2,
      defaults.disclaimerLine3,
      defaults.showApprovalSection,
      defaults.showLegalStatusDigest,
      defaults.showOutstandingBalanceTable,
      defaults.updatedAt,
    ]
  );
  return mapOutputTemplateSettings(insertedRes.rows[0]);
}

export async function updateOutputTemplateSettings(
  userId: string,
  input: OutputTemplateSettingsInput,
  tenantId = DEFAULT_TENANT_ID,
): Promise<OutputTemplateSettings> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const current = await getOutputTemplateSettings(userId, scopeTenantId);
  const result = await getPool().query(
    `UPDATE output_template_settings
     SET
      company_name = $2,
      department = $3,
      representative = $4,
      license_number = $5,
      postal_address = $6,
      phone = $7,
      email = $8,
      proposal_title = $9,
      estimate_sheet_title = $10,
      funding_plan_title = $11,
      assumption_memo_title = $12,
      document_classification = $13,
      disclaimer_line1 = $14,
      disclaimer_line2 = $15,
      disclaimer_line3 = $16,
      show_approval_section = $17,
      show_legal_status_digest = $18,
      show_outstanding_balance_table = $19,
      updated_at = NOW()
     WHERE user_id = $1 AND tenant_id = $20
     RETURNING *`,
    [
      userId,
      input.companyName,
      input.department,
      input.representative,
      input.licenseNumber,
      input.postalAddress,
      input.phone,
      input.email,
      input.proposalTitle,
      input.estimateSheetTitle,
      input.fundingPlanTitle,
      input.assumptionMemoTitle,
      input.documentClassification,
      input.disclaimerLine1,
      input.disclaimerLine2,
      input.disclaimerLine3,
      input.showApprovalSection,
      input.showLegalStatusDigest,
      input.showOutstandingBalanceTable,
      scopeTenantId,
    ]
  );

  if (result.rows[0]) {
    return mapOutputTemplateSettings(result.rows[0]);
  }

  return {
    ...current,
    ...input,
    updatedAt: new Date(),
  };
}

export async function listOutputTemplateVersions(userId: string, limit = 20, tenantId = DEFAULT_TENANT_ID): Promise<OutputTemplateVersion[]> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const result = await getPool().query(
    `SELECT * FROM output_template_versions
     WHERE user_id = $1 AND tenant_id = $2
     ORDER BY version_number DESC
     LIMIT $3`,
    [userId, scopeTenantId, limit]
  );
  return result.rows.map(mapOutputTemplateVersion);
}

export async function createOutputTemplateVersion(input: {
  tenantId?: string;
  userId: string;
  versionLabel?: string;
  changeNote?: string;
  settingsSnapshot?: OutputTemplateSettingsInput;
  activate?: boolean;
}): Promise<OutputTemplateVersion> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const settings = input.settingsSnapshot ?? toTemplateSettingsInput(await getOutputTemplateSettings(input.userId, scopeTenantId));
  const activate = input.activate ?? true;

  return withTransaction(async (client) => {
    const nextRes = await client.query(
      "SELECT COALESCE(MAX(version_number), 0)::int + 1 AS next FROM output_template_versions WHERE user_id = $1 AND tenant_id = $2",
      [input.userId, scopeTenantId]
    );
    const versionNumber = Number(nextRes.rows[0]?.next ?? 1);

    if (activate) {
      await client.query("UPDATE output_template_versions SET is_active = FALSE WHERE user_id = $1 AND tenant_id = $2", [
        input.userId,
        scopeTenantId,
      ]);
    }

    const inserted = await client.query(
      `INSERT INTO output_template_versions (
        id, tenant_id, user_id, version_number, version_label, change_note, settings_snapshot, is_active, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,NOW())
      RETURNING *`,
      [
        genId("tplver"),
        scopeTenantId,
        input.userId,
        versionNumber,
        input.versionLabel?.trim() || `テンプレート v${versionNumber}`,
        input.changeNote?.trim() || null,
        JSON.stringify(settings),
        activate,
      ]
    );
    return mapOutputTemplateVersion(inserted.rows[0]);
  });
}

export async function applyOutputTemplateVersion(input: {
  tenantId?: string;
  userId: string;
  versionId: string;
}): Promise<OutputTemplateSettings | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);

  return withTransaction(async (client) => {
    const versionRes = await client.query(
      "SELECT * FROM output_template_versions WHERE id = $1 AND user_id = $2 AND tenant_id = $3 LIMIT 1 FOR UPDATE",
      [input.versionId, input.userId, scopeTenantId]
    );
    if (!versionRes.rows[0]) return null;

    const version = mapOutputTemplateVersion(versionRes.rows[0]);
    const result = await client.query(
      `UPDATE output_template_settings
       SET
        company_name = $2,
        department = $3,
        representative = $4,
        license_number = $5,
        postal_address = $6,
        phone = $7,
        email = $8,
        proposal_title = $9,
        estimate_sheet_title = $10,
        funding_plan_title = $11,
        assumption_memo_title = $12,
        document_classification = $13,
        disclaimer_line1 = $14,
        disclaimer_line2 = $15,
        disclaimer_line3 = $16,
        show_approval_section = $17,
        show_legal_status_digest = $18,
        show_outstanding_balance_table = $19,
        updated_at = NOW()
       WHERE user_id = $1 AND tenant_id = $20
       RETURNING *`,
      [
        input.userId,
        version.settingsSnapshot.companyName,
        version.settingsSnapshot.department,
        version.settingsSnapshot.representative,
        version.settingsSnapshot.licenseNumber,
        version.settingsSnapshot.postalAddress,
        version.settingsSnapshot.phone,
        version.settingsSnapshot.email,
        version.settingsSnapshot.proposalTitle,
        version.settingsSnapshot.estimateSheetTitle,
        version.settingsSnapshot.fundingPlanTitle,
        version.settingsSnapshot.assumptionMemoTitle,
        version.settingsSnapshot.documentClassification,
        version.settingsSnapshot.disclaimerLine1,
        version.settingsSnapshot.disclaimerLine2,
        version.settingsSnapshot.disclaimerLine3,
        version.settingsSnapshot.showApprovalSection,
        version.settingsSnapshot.showLegalStatusDigest,
        version.settingsSnapshot.showOutstandingBalanceTable,
        scopeTenantId,
      ]
    );

    await client.query("UPDATE output_template_versions SET is_active = FALSE WHERE user_id = $1 AND tenant_id = $2", [
      input.userId,
      scopeTenantId,
    ]);
    await client.query("UPDATE output_template_versions SET is_active = TRUE WHERE id = $1 AND user_id = $2 AND tenant_id = $3", [
      input.versionId,
      input.userId,
      scopeTenantId,
    ]);

    return result.rows[0] ? mapOutputTemplateSettings(result.rows[0]) : null;
  });
}

export async function getOutputTemplateVersionById(input: {
  tenantId?: string;
  userId: string;
  versionId: string;
}): Promise<OutputTemplateVersion | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    "SELECT * FROM output_template_versions WHERE id = $1 AND user_id = $2 AND tenant_id = $3 LIMIT 1",
    [input.versionId, input.userId, scopeTenantId]
  );
  return result.rows[0] ? mapOutputTemplateVersion(result.rows[0]) : null;
}

export async function listImportJobs(userId: string, limit = 50, tenantId = DEFAULT_TENANT_ID): Promise<ImportJob[]> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT * FROM import_jobs
     WHERE user_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [userId, tenantId, limit]
  );
  return result.rows.map(mapImportJob);
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
  await ensureSchema();
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
    service_requests: "対応依頼",
  };
  const result = await getPool().query(
    `INSERT INTO import_jobs (
      id, tenant_id, user_id, source_type, title, target_entity, status, notes, mapping_json, validation_message, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,NULL,NOW(),NOW())
    RETURNING *`,
    [
      genId("import"),
      input.tenantId ?? DEFAULT_TENANT_ID,
      input.userId,
      input.sourceType,
      input.title.trim() || `${sourceLabel[input.sourceType]}取込 - ${targetLabel[input.targetEntity]}`,
      input.targetEntity,
      input.status ?? "queued",
      input.notes?.trim() || null,
    ]
  );
  return mapImportJob(result.rows[0]);
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
  await ensureSchema();

  const currentRes = await getPool().query(
    "SELECT status FROM import_jobs WHERE id = $1 AND user_id = $2 AND tenant_id = $3 LIMIT 1",
    [input.jobId, input.userId, input.tenantId ?? DEFAULT_TENANT_ID]
  );
  if (!currentRes.rows[0]) return null;
  const currentStatus = String(currentRes.rows[0].status) as ImportJobStatus;
  if (input.status && !isValidImportStatusTransition(currentStatus, input.status, Boolean(input.allowRetry))) {
    throw new Error(`取込ジョブ状態遷移が不正です: ${currentStatus} -> ${input.status}`);
  }

  const result = await getPool().query(
    `UPDATE import_jobs
     SET
      mapping_json = $3::jsonb,
      validation_message = $4,
      notes = COALESCE($5, notes),
      status = COALESCE($6, status),
      updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND tenant_id = $7
     RETURNING *`,
    [
      input.jobId,
      input.userId,
      JSON.stringify(input.mappingJson),
      input.validationMessage?.trim() || null,
      input.notes?.trim() || null,
      input.status ?? null,
      input.tenantId ?? DEFAULT_TENANT_ID,
    ]
  );
  return result.rows[0] ? mapImportJob(result.rows[0]) : null;
}

export async function listBrokerageCases(userId: string, limit = 50, tenantId = DEFAULT_TENANT_ID): Promise<BrokerageCase[]> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT * FROM brokerage_cases
     WHERE user_id = $1 AND tenant_id = $2
     ORDER BY updated_at DESC
     LIMIT $3`,
    [userId, tenantId, limit]
  );
  return result.rows.map(mapBrokerageCase);
}

export async function getBrokerageCaseById(input: {
  tenantId?: string;
  userId: string;
  caseId: string;
}): Promise<BrokerageCase | null> {
  await ensureSchema();
  const result = await getPool().query(
    "SELECT * FROM brokerage_cases WHERE id = $1 AND user_id = $2 AND tenant_id = $3 LIMIT 1",
    [input.caseId, input.userId, input.tenantId ?? DEFAULT_TENANT_ID]
  );
  return result.rows[0] ? mapBrokerageCase(result.rows[0]) : null;
}

export async function getBrokerageCaseByImportJobId(input: {
  tenantId?: string;
  userId: string;
  importJobId: string;
}): Promise<BrokerageCase | null> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT * FROM brokerage_cases
     WHERE user_id = $1 AND $2 = ANY(source_import_job_ids)
       AND tenant_id = $3
     ORDER BY updated_at DESC
     LIMIT 1`,
    [input.userId, input.importJobId, input.tenantId ?? DEFAULT_TENANT_ID]
  );
  return result.rows[0] ? mapBrokerageCase(result.rows[0]) : null;
}

export async function updateBrokerageCaseConfirmedData(input: {
  tenantId?: string;
  userId: string;
  caseId: string;
  confirmedDataJson: Record<string, unknown>;
}): Promise<BrokerageCase | null> {
  await ensureSchema();
  const result = await getPool().query(
    `UPDATE brokerage_cases
     SET confirmed_data_json = $3, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND tenant_id = $4
     RETURNING *`,
    [input.caseId, input.userId, JSON.stringify(input.confirmedDataJson), input.tenantId ?? DEFAULT_TENANT_ID],
  );
  return result.rows[0] ? mapBrokerageCase(result.rows[0]) : null;
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
  await ensureSchema();
  const nowIso = new Date().toISOString();
  const caseId = input.caseId ?? genId("case");
  const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
  const sourceImportJobIds = [...new Set(input.sourceImportJobIds)];
  const caseResult = await withTransaction(async (client) => {
    const existing = input.caseId
      ? await client.query("SELECT id FROM brokerage_cases WHERE id = $1 AND user_id = $2 AND tenant_id = $3 LIMIT 1", [
          input.caseId,
          input.userId,
          tenantId,
        ])
      : { rows: [] };
    const result =
      existing.rows.length > 0
        ? await client.query(
            `UPDATE brokerage_cases
             SET case_type = $4, case_title = $5, primary_property_id = $6, status = $7,
                 confirmed_data_json = $8, source_import_job_ids = $9, updated_at = NOW()
             WHERE id = $1 AND user_id = $2 AND tenant_id = $3
             RETURNING *`,
            [
              caseId,
              input.userId,
              tenantId,
              input.caseType,
              input.caseTitle.trim() || "抽出確認案件",
              input.primaryPropertyId ?? null,
              input.status ?? "reviewed",
              JSON.stringify(input.confirmedDataJson),
              sourceImportJobIds,
            ]
          )
        : await client.query(
            `INSERT INTO brokerage_cases (
              id, tenant_id, user_id, case_type, case_title, primary_property_id, status,
              confirmed_data_json, source_import_job_ids, created_at, updated_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
             RETURNING *`,
            [
              caseId,
              tenantId,
              input.userId,
              input.caseType,
              input.caseTitle.trim() || "抽出確認案件",
              input.primaryPropertyId ?? null,
              input.status ?? "reviewed",
              JSON.stringify(input.confirmedDataJson),
              sourceImportJobIds,
            ]
          );

    await client.query("DELETE FROM extraction_review_items WHERE case_id = $1 AND tenant_id = $2", [caseId, tenantId]);
    for (const item of input.reviewItems) {
      await client.query(
        `INSERT INTO extraction_review_items (
          id, tenant_id, user_id, case_id, import_job_id, field_key, label,
          extracted_value, normalized_value, edited_value, final_value,
          source_sheet, source_cell, source_range, method, confidence, review_status,
          source_file_hash, template_version, reviewed_by_id, reviewed_at, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          genId("review"),
          tenantId,
          input.userId,
          caseId,
          item.importJobId,
          item.fieldKey,
          item.label,
          item.extractedValue,
          item.normalizedValue,
          item.editedValue ?? null,
          item.finalValue ?? null,
          item.sourceSheet,
          item.sourceCell ?? null,
          item.sourceRange ?? null,
          item.method,
          item.confidence,
          item.reviewStatus,
          item.sourceFileHash,
          item.templateVersion,
          item.reviewedById ?? null,
          item.reviewedAt,
          nowIso,
        ]
      );
    }

    return result.rows[0];
  });
  return mapBrokerageCase(caseResult);
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
  await ensureSchema();
  const nowIso = new Date().toISOString();
  const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
  const sourceImportJobIds = [...new Set(input.sourceImportJobIds)];
  const replaceImportJobIds = [...new Set(input.replaceImportJobIds)];
  const caseResult = await withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE brokerage_cases
       SET confirmed_data_json = $3, source_import_job_ids = $4, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND tenant_id = $5
       RETURNING *`,
      [input.caseId, input.userId, JSON.stringify(input.confirmedDataJson), sourceImportJobIds, tenantId],
    );
    if (!result.rows[0]) return null;

    if (replaceImportJobIds.length > 0) {
      await client.query(
        `DELETE FROM extraction_review_items
         WHERE case_id = $1 AND user_id = $2 AND tenant_id = $3 AND import_job_id = ANY($4)`,
        [input.caseId, input.userId, tenantId, replaceImportJobIds],
      );
    }

    for (const item of input.reviewItems) {
      await client.query(
        `INSERT INTO extraction_review_items (
          id, tenant_id, user_id, case_id, import_job_id, field_key, label,
          extracted_value, normalized_value, edited_value, final_value,
          source_sheet, source_cell, source_range, method, confidence, review_status,
          source_file_hash, template_version, reviewed_by_id, reviewed_at, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          genId("review"),
          tenantId,
          input.userId,
          input.caseId,
          item.importJobId,
          item.fieldKey,
          item.label,
          item.extractedValue,
          item.normalizedValue,
          item.editedValue ?? null,
          item.finalValue ?? null,
          item.sourceSheet,
          item.sourceCell ?? null,
          item.sourceRange ?? null,
          item.method,
          item.confidence,
          item.reviewStatus,
          item.sourceFileHash,
          item.templateVersion,
          item.reviewedById ?? null,
          item.reviewedAt,
          nowIso,
        ],
      );
    }

    return result.rows[0];
  });
  return caseResult ? mapBrokerageCase(caseResult) : null;
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
  await ensureSchema();
  const nowIso = new Date().toISOString();
  const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
  const splitCaseId = input.splitCaseId ?? genId("case");
  const removeImportJobIds = [...new Set(input.removeImportJobIds)];
  const result = await withTransaction(async (client) => {
    const restoredResult = await client.query(
      `UPDATE brokerage_cases
       SET confirmed_data_json = $3, source_import_job_ids = $4, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND tenant_id = $5
       RETURNING *`,
      [
        input.caseId,
        input.userId,
        JSON.stringify(input.restoredConfirmedDataJson),
        [...new Set(input.restoredSourceImportJobIds)],
        tenantId,
      ],
    );
    if (!restoredResult.rows[0]) return null;

    if (removeImportJobIds.length > 0) {
      await client.query(
        `DELETE FROM extraction_review_items
         WHERE case_id = $1 AND user_id = $2 AND tenant_id = $3 AND import_job_id = ANY($4)`,
        [input.caseId, input.userId, tenantId, removeImportJobIds],
      );
    }

    const splitResult = await client.query(
      `INSERT INTO brokerage_cases (
        id, tenant_id, user_id, case_type, case_title, primary_property_id, status,
        confirmed_data_json, source_import_job_ids, created_at, updated_at
       )
       SELECT $1, tenant_id, user_id, case_type, $5, primary_property_id, 'reviewed',
              $6, $7, NOW(), NOW()
       FROM brokerage_cases
       WHERE id = $2 AND user_id = $3 AND tenant_id = $4
       RETURNING *`,
      [
        splitCaseId,
        input.caseId,
        input.userId,
        tenantId,
        input.splitCaseTitle.trim() || "分離した抽出確認案件",
        JSON.stringify(input.splitConfirmedDataJson),
        [...new Set(input.splitSourceImportJobIds)],
      ],
    );

    for (const item of input.splitReviewItems) {
      await client.query(
        `INSERT INTO extraction_review_items (
          id, tenant_id, user_id, case_id, import_job_id, field_key, label,
          extracted_value, normalized_value, edited_value, final_value,
          source_sheet, source_cell, source_range, method, confidence, review_status,
          source_file_hash, template_version, reviewed_by_id, reviewed_at, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          genId("review"),
          tenantId,
          input.userId,
          splitCaseId,
          item.importJobId,
          item.fieldKey,
          item.label,
          item.extractedValue,
          item.normalizedValue,
          item.editedValue ?? null,
          item.finalValue ?? null,
          item.sourceSheet,
          item.sourceCell ?? null,
          item.sourceRange ?? null,
          item.method,
          item.confidence,
          item.reviewStatus,
          item.sourceFileHash,
          item.templateVersion,
          item.reviewedById ?? null,
          item.reviewedAt,
          nowIso,
        ],
      );
    }

    return {
      restoredCase: restoredResult.rows[0],
      splitCase: splitResult.rows[0],
    };
  });
  return result
    ? {
        restoredCase: mapBrokerageCase(result.restoredCase),
        splitCase: mapBrokerageCase(result.splitCase),
      }
    : null;
}

export async function listExtractionReviewItems(input: {
  tenantId?: string;
  userId: string;
  caseId: string;
}): Promise<ExtractionReviewItem[]> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT * FROM extraction_review_items
     WHERE user_id = $1 AND case_id = $2 AND tenant_id = $3
     ORDER BY created_at ASC`,
    [input.userId, input.caseId, input.tenantId ?? DEFAULT_TENANT_ID]
  );
  return result.rows.map(mapExtractionReviewItem);
}

export async function addCorrectionEvents(input: {
  tenantId?: string;
  userId: string;
  events: Array<Omit<CorrectionEvent, "id" | "tenantId" | "userId" | "createdAt">>;
}): Promise<CorrectionEvent[]> {
  await ensureSchema();
  if (input.events.length === 0) return [];
  const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;

  const result = await withTransaction(async (client) => {
    const rows: Record<string, unknown>[] = [];
    for (const event of input.events) {
      const insertResult = await client.query(
        `INSERT INTO correction_events (
          id, tenant_id, user_id, case_id, trigger, field_key, field_label,
          ai_value, confirmed_value, change_type, source_import_job_id, source_location,
          extraction_method, confidence_before, template_id, scope_candidate, source_evidence_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)
        RETURNING *`,
        [
          genId("correction"),
          tenantId,
          input.userId,
          event.caseId,
          event.trigger,
          event.fieldKey,
          event.fieldLabel,
          event.aiValue ?? null,
          event.confirmedValue ?? null,
          event.changeType,
          event.sourceImportJobId ?? null,
          event.sourceLocation ?? null,
          event.extractionMethod ?? null,
          event.confidenceBefore ?? null,
          event.templateId ?? null,
          event.scopeCandidate,
          event.sourceEvidenceJson ? JSON.stringify(event.sourceEvidenceJson) : null,
        ],
      );
      rows.push(insertResult.rows[0]);
    }
    return rows;
  });

  return result.map(mapCorrectionEvent);
}

export async function listCorrectionEvents(input: {
  tenantId?: string;
  userId: string;
  caseId?: string;
  limit?: number;
}): Promise<CorrectionEvent[]> {
  await ensureSchema();
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
  const result = input.caseId
    ? await getPool().query(
        `SELECT * FROM correction_events
         WHERE user_id = $1 AND case_id = $2 AND tenant_id = $3
         ORDER BY created_at DESC
         LIMIT $4`,
        [input.userId, input.caseId, input.tenantId ?? DEFAULT_TENANT_ID, limit],
      )
    : await getPool().query(
        `SELECT * FROM correction_events
         WHERE user_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [input.userId, input.tenantId ?? DEFAULT_TENANT_ID, limit],
      );
  return result.rows.map(mapCorrectionEvent);
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
  await ensureSchema();
  if (input.drafts.length === 0) return [];
  const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;

  const result = await withTransaction(async (client) => {
    const rows: Record<string, unknown>[] = [];
    for (const draft of input.drafts) {
      const insertResult = await client.query(
        `INSERT INTO ai_experience_drafts (
          id, tenant_id, user_id, status, title, body_markdown, event_ids,
          field_key, template_id, change_type, scope_candidate, evidence_summary_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
        RETURNING *`,
        [
          genId("experience"),
          tenantId,
          input.userId,
          draft.status ?? "draft",
          draft.title,
          draft.bodyMarkdown,
          draft.eventIds,
          draft.fieldKey ?? null,
          draft.templateId ?? null,
          draft.changeType,
          draft.scopeCandidate,
          draft.evidenceSummaryJson ? JSON.stringify(draft.evidenceSummaryJson) : null,
        ],
      );
      rows.push(insertResult.rows[0]);
    }
    return rows;
  });

  return result.map(mapAiExperienceDraft);
}

export async function listAiExperienceDrafts(input: {
  tenantId?: string;
  userId: string;
  status?: AiExperienceDraftStatus;
  limit?: number;
}): Promise<AiExperienceDraft[]> {
  await ensureSchema();
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
  const result = input.status
    ? await getPool().query(
        `SELECT * FROM ai_experience_drafts
         WHERE user_id = $1 AND status = $2 AND tenant_id = $3
         ORDER BY created_at DESC
         LIMIT $4`,
        [input.userId, input.status, input.tenantId ?? DEFAULT_TENANT_ID, limit],
      )
    : await getPool().query(
        `SELECT * FROM ai_experience_drafts
         WHERE user_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [input.userId, input.tenantId ?? DEFAULT_TENANT_ID, limit],
      );
  return result.rows.map(mapAiExperienceDraft);
}

export async function updateAiExperienceDraftStatus(input: {
  tenantId?: string;
  userId: string;
  draftId: string;
  status: AiExperienceDraftStatus;
}): Promise<AiExperienceDraft | null> {
  await ensureSchema();
  const result = await getPool().query(
    `UPDATE ai_experience_drafts
     SET status = $3, updated_at = NOW()
     WHERE user_id = $1 AND id = $2 AND tenant_id = $4
     RETURNING *`,
    [input.userId, input.draftId, input.status, input.tenantId ?? DEFAULT_TENANT_ID],
  );
  return result.rows[0] ? mapAiExperienceDraft(result.rows[0]) : null;
}

export async function getGuaranteeApplicationDraft(input: {
  tenantId?: string;
  userId: string;
  caseId: string;
  templateId: string;
}): Promise<GuaranteeApplicationDraft | null> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT * FROM guarantee_application_drafts
     WHERE user_id = $1 AND case_id = $2 AND template_id = $3
       AND tenant_id = $4
     LIMIT 1`,
    [input.userId, input.caseId, input.templateId, input.tenantId ?? DEFAULT_TENANT_ID],
  );
  return result.rows[0] ? mapGuaranteeApplicationDraft(result.rows[0]) : null;
}

export async function saveGuaranteeApplicationDraft(input: {
  tenantId?: string;
  userId: string;
  caseId: string;
  templateId: string;
  companyCode: GuaranteeApplicationDraft["companyCode"];
  status: GuaranteeApplicationDraftStatus;
  fieldValuesJson: Record<string, unknown>;
  fieldStatusesJson?: Record<string, string>;
  lastReviewedAt?: Date;
}): Promise<GuaranteeApplicationDraft> {
  await ensureSchema();
  const id = `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const result = await getPool().query(
    `INSERT INTO guarantee_application_drafts (
       id, tenant_id, user_id, case_id, template_id, company_code, status,
       field_values_json, field_statuses_json, last_reviewed_at, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
     ON CONFLICT (tenant_id, user_id, case_id, template_id)
     DO UPDATE SET
       company_code = EXCLUDED.company_code,
       status = EXCLUDED.status,
       field_values_json = EXCLUDED.field_values_json,
       field_statuses_json = EXCLUDED.field_statuses_json,
       last_reviewed_at = EXCLUDED.last_reviewed_at,
       updated_at = NOW()
     RETURNING *`,
    [
      id,
      input.tenantId ?? DEFAULT_TENANT_ID,
      input.userId,
      input.caseId,
      input.templateId,
      input.companyCode,
      input.status,
      JSON.stringify(input.fieldValuesJson),
      JSON.stringify(input.fieldStatusesJson ?? {}),
      input.lastReviewedAt ?? null,
    ],
  );
  return mapGuaranteeApplicationDraft(result.rows[0]);
}

export async function listAttachments(input: {
  tenantId?: string;
  userId: string;
  targetType?: AttachmentTargetType;
  targetId?: string;
  limit?: number;
}): Promise<Attachment[]> {
  await ensureSchema();
  const limit = input.limit ?? 100;
  const values: Array<string | number> = [input.userId, input.tenantId ?? DEFAULT_TENANT_ID];
  const filters: string[] = ["user_id = $1", "tenant_id = $2"];
  let idx = 3;
  if (input.targetType) {
    filters.push(`target_type = $${idx}`);
    values.push(input.targetType);
    idx += 1;
  }
  if (input.targetId) {
    filters.push(`target_id = $${idx}`);
    values.push(input.targetId);
    idx += 1;
  }
  values.push(limit);
  const result = await getPool().query(
    `SELECT * FROM attachments
     WHERE ${filters.join(" AND ")}
     ORDER BY uploaded_at DESC
     LIMIT $${idx}`,
    values
  );
  return result.rows.map(mapAttachment);
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
  await ensureSchema();
  const result = await getPool().query(
    `INSERT INTO attachments (
      id, tenant_id, user_id, target_type, target_id, file_name, file_type, file_size_bytes, storage_path, uploaded_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
    RETURNING *`,
    [
      genId("att"),
      input.tenantId ?? DEFAULT_TENANT_ID,
      input.userId,
      input.targetType,
      input.targetId,
      input.fileName.trim(),
      input.fileType?.trim() || null,
      input.fileSizeBytes ?? null,
      input.storagePath?.trim() || null,
    ]
  );
  return mapAttachment(result.rows[0]);
}

export async function listGeneratedOutputs(input: {
  tenantId?: string;
  userId: string;
  quoteId?: string;
  limit?: number;
}): Promise<GeneratedOutput[]> {
  await ensureSchema();
  const limit = input.limit ?? 100;
  const values: Array<string | number> = [input.userId, input.tenantId ?? DEFAULT_TENANT_ID];
  const filters: string[] = ["user_id = $1", "tenant_id = $2"];
  let idx = 3;
  if (input.quoteId) {
    filters.push(`quote_id = $${idx}`);
    values.push(input.quoteId);
    idx += 1;
  }
  values.push(limit);
  const result = await getPool().query(
    `SELECT * FROM generated_outputs
     WHERE ${filters.join(" AND ")}
     ORDER BY generated_at DESC
     LIMIT $${idx}`,
    values
  );
  return result.rows.map(mapGeneratedOutput);
}

export async function getGeneratedOutputById(input: {
  tenantId?: string;
  userId: string;
  id: string;
}): Promise<GeneratedOutput | undefined> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT * FROM generated_outputs
     WHERE user_id = $1 AND id = $2 AND tenant_id = $3
     LIMIT 1`,
    [input.userId, input.id, input.tenantId ?? DEFAULT_TENANT_ID]
  );
  if (result.rows.length === 0) return undefined;
  return mapGeneratedOutput(result.rows[0]);
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
  await ensureSchema();
  const actorId = input.actorId ?? input.userId;
  const sourceQuoteId = input.sourceQuoteId ?? input.quoteId;
  const result = await getPool().query(
    `INSERT INTO generated_outputs (
      id, tenant_id, user_id, actor_id, quote_id, source_quote_id, property_id, party_id, output_type, output_format, language, title, document_number, template_version_id, case_id, template_id, input_data_snapshot, draft_value_snapshot, field_mapping_snapshot, layout_snapshot, generated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW())
    RETURNING *`,
    [
      genId("out"),
      input.tenantId ?? DEFAULT_TENANT_ID,
      input.userId,
      actorId,
      input.quoteId,
      sourceQuoteId,
      input.propertyId ?? null,
      input.partyId ?? null,
      input.outputType,
      input.outputFormat,
      input.language,
      input.title.trim(),
      input.documentNumber.trim(),
      input.templateVersionId ?? null,
      input.caseId ?? null,
      input.templateId ?? null,
      input.inputDataSnapshot ? JSON.stringify(input.inputDataSnapshot) : null,
      input.draftValueSnapshot ? JSON.stringify(input.draftValueSnapshot) : null,
      input.fieldMappingSnapshot ? JSON.stringify(input.fieldMappingSnapshot) : null,
      input.layoutSnapshot ? JSON.stringify(input.layoutSnapshot) : null,
    ]
  );
  return mapGeneratedOutput(result.rows[0]);
}

export async function getDashboardData(userId: string) {
  await ensureSchema();
  const result = await getPool().query("SELECT * FROM clients WHERE owner_user_id = $1", [userId]);
  const clients = result.rows.map(mapClient);

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);

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
  const clientIds = clients.map((item) => item.id);
  const pendingTaskKeys = new Set<string>();
  if (clientIds.length > 0) {
    const taskRes = await getPool().query(
      `SELECT client_id, title
       FROM tasks
       WHERE status = 'pending' AND client_id = ANY($1)`,
      [clientIds]
    );
    taskRes.rows.forEach((row) => {
      pendingTaskKeys.add(`${String(row.client_id)}::${String(row.title)}`);
    });
  }

  const complianceAlerts = buildComplianceAlertList(clients).map((item) => ({
    ...item,
    isTaskCreated: pendingTaskKeys.has(`${item.clientId}::${item.title}`),
  }));
  const pendingTaskRes = clientIds.length > 0
    ? await getPool().query(
      `SELECT * FROM tasks
       WHERE status = 'pending' AND client_id = ANY($1)
       ORDER BY due_at ASC NULLS LAST
       LIMIT 20`,
      [clientIds]
    )
    : { rows: [] as Array<Record<string, unknown>> };
  const pendingTasks = pendingTaskRes.rows.map(mapTask);
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
        !recentQuotes.some((q) => q.clientId === item.id)
    )
    .slice(0, 6);
  const auditRes = await getPool().query(
    "SELECT * FROM audit_logs WHERE actor_id = $1 OR user_id = $1 ORDER BY created_at DESC LIMIT 8",
    [userId]
  );
  const recentAuditLogs = auditRes.rows.map(mapAuditLog);

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

export async function listAuditLogs(userId: string, filter: AuditLogFilter = {}): Promise<AuditLog[]> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(filter.tenantId);
  const values: Array<string | number> = [userId, scopeTenantId];
  const where: string[] = ["(actor_id = $1 OR user_id = $1)", "tenant_id = $2"];
  let index = 3;

  if (filter.actorId) {
    where.push(`actor_id = $${index}`);
    values.push(filter.actorId);
    index += 1;
  }
  if (filter.action) {
    where.push(`action = $${index}`);
    values.push(filter.action);
    index += 1;
  }
  if (filter.targetType && filter.targetType !== "all") {
    where.push(`target_type = $${index}`);
    values.push(filter.targetType);
    index += 1;
  }
  if (filter.from) {
    where.push(`created_at >= $${index}`);
    values.push(filter.from.toISOString());
    index += 1;
  }
  if (filter.to) {
    where.push(`created_at <= $${index}`);
    values.push(filter.to.toISOString());
    index += 1;
  }
  if (filter.query?.trim()) {
    where.push(`(message ILIKE $${index} OR action ILIKE $${index} OR target_type ILIKE $${index} OR COALESCE(target_id, '') ILIKE $${index})`);
    values.push(`%${filter.query.trim()}%`);
    index += 1;
  }

  const limit = filter.limit ?? 200;
  values.push(limit);
  const limitIndex = index;

  const result = await getPool().query(
    `SELECT * FROM audit_logs
     WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT $${limitIndex}`,
    values
  );
  return result.rows.map(mapAuditLog);
}

export async function listClients(userId: string, filter: ClientListFilter = {}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(filter.tenantId);
  const result = await getPool().query("SELECT * FROM clients WHERE owner_user_id = $1 AND tenant_id = $2", [
    userId,
    scopeTenantId,
  ]);
  let clients = result.rows.map(mapClient);

  if (filter.stage && filter.stage !== "all") {
    clients = clients.filter((item) => item.stage === filter.stage);
  }
  if (filter.purpose && filter.purpose !== "all") {
    clients = clients.filter((item) => item.purpose === filter.purpose);
  }
  if (filter.temperature && filter.temperature !== "all") {
    clients = clients.filter((item) => item.temperature === filter.temperature);
  }
  if (filter.query) {
    clients = clients.filter(
      (item) =>
        item.name.includes(filter.query!) ||
        item.phone.includes(filter.query!) ||
        (item.preferredArea?.includes(filter.query!) ?? false) ||
        (item.firstChoiceArea?.includes(filter.query!) ?? false) ||
        (item.secondChoiceArea?.includes(filter.query!) ?? false) ||
        (item.notes?.includes(filter.query!) ?? false)
    );
  }

  const sort: ClientListSort = filter.sort ?? "follow_up";
  clients.sort((a, b) => {
    if (sort === "recent_created") return b.createdAt.getTime() - a.createdAt.getTime();
    if (sort === "recent_contact") return (b.lastContactedAt?.getTime() ?? 0) - (a.lastContactedAt?.getTime() ?? 0);
    const aTime = a.nextFollowUpAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.nextFollowUpAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });

  const ids = clients.map((item) => item.id);
  const quoteCountMap = new Map<string, number>();
  const followCountMap = new Map<string, number>();

  if (ids.length > 0) {
    const quoteRes = await getPool().query(
      "SELECT client_id, COUNT(*)::int AS count FROM quotations WHERE client_id = ANY($1) AND tenant_id = $2 GROUP BY client_id",
      [ids, scopeTenantId]
    );
    quoteRes.rows.forEach((row) => quoteCountMap.set(String(row.client_id), Number(row.count)));

    const followRes = await getPool().query(
      "SELECT client_id, COUNT(*)::int AS count FROM follow_ups WHERE client_id = ANY($1) AND tenant_id = $2 GROUP BY client_id",
      [ids, scopeTenantId]
    );
    followRes.rows.forEach((row) => followCountMap.set(String(row.client_id), Number(row.count)));
  }

  return clients.map((item) => ({
    ...item,
    _count: {
      quotations: quoteCountMap.get(item.id) ?? 0,
      followUps: followCountMap.get(item.id) ?? 0,
    },
  }));
}

export async function getClientById(clientId: string, tenantId = DEFAULT_TENANT_ID) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const result = await getPool().query("SELECT * FROM clients WHERE id = $1 AND tenant_id = $2 LIMIT 1", [
    clientId,
    scopeTenantId,
  ]);
  return result.rows[0] ? mapClient(result.rows[0]) : null;
}

export async function getClientDetail(clientId: string, tenantId = DEFAULT_TENANT_ID) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);

  const [clientRes, quoteRes, followRes, taskRes] = await Promise.all([
    getPool().query("SELECT * FROM clients WHERE id = $1 AND tenant_id = $2 LIMIT 1", [clientId, scopeTenantId]),
    getPool().query("SELECT * FROM quotations WHERE client_id = $1 AND tenant_id = $2 ORDER BY created_at DESC", [
      clientId,
      scopeTenantId,
    ]),
    getPool().query("SELECT * FROM follow_ups WHERE client_id = $1 AND tenant_id = $2 ORDER BY created_at DESC", [
      clientId,
      scopeTenantId,
    ]),
    getPool().query(
      `SELECT * FROM tasks
       WHERE client_id = $1 AND tenant_id = $2
       ORDER BY
         CASE status WHEN 'pending' THEN 0 WHEN 'done' THEN 1 ELSE 2 END,
         due_at ASC NULLS LAST,
         created_at DESC`,
      [clientId, scopeTenantId]
    ),
  ]);

  if (!clientRes.rows[0]) return null;
  const client = mapClient(clientRes.rows[0]);

  const propertyIds = quoteRes.rows.map((row) => row.property_id).filter(Boolean) as string[];
  const properties = new Map<string, Property>();
  if (propertyIds.length > 0) {
    const propRes = await getPool().query("SELECT * FROM properties WHERE id = ANY($1) AND tenant_id = $2", [
      propertyIds,
      scopeTenantId,
    ]);
    propRes.rows.forEach((row) => {
      const property = mapProperty(row);
      properties.set(property.id, property);
    });
  }

  const ownerRes = await getPool().query("SELECT * FROM users WHERE id = $1 LIMIT 1", [client.ownerUserId]);
  const owner = ownerRes.rows[0] ? mapUser(ownerRes.rows[0]) : await getDefaultUser();

  return {
    ...client,
    quotations: quoteRes.rows.map((row) => {
      const quote = mapQuotation(row);
      return {
        ...quote,
        property: quote.propertyId ? properties.get(quote.propertyId) : undefined,
      };
    }),
    followUps: followRes.rows.map(mapFollowUp),
    tasks: taskRes.rows.map(mapTask),
    ownerUser: owner!,
  };
}

export async function getBoardData(userId: string, tenantId = DEFAULT_TENANT_ID) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const result = await getPool().query(
    "SELECT * FROM clients WHERE owner_user_id = $1 AND tenant_id = $2 ORDER BY updated_at DESC",
    [userId, scopeTenantId],
  );
  const clients = result.rows.map(mapClient);

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

export async function listQuoteFormData(tenantId = DEFAULT_TENANT_ID) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const [clientsRes, propertiesRes] = await Promise.all([
    getPool().query("SELECT id, name FROM clients WHERE tenant_id = $1 ORDER BY updated_at DESC", [scopeTenantId]),
    getPool().query(
      "SELECT id, name, listing_price, management_fee, repair_fee FROM properties WHERE tenant_id = $1 ORDER BY created_at DESC",
      [scopeTenantId],
    ),
  ]);

  return {
    clients: clientsRes.rows.map((row) => ({ id: String(row.id), name: String(row.name) })),
    properties: propertiesRes.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      listingPrice: Number(row.listing_price ?? 0),
      managementFee: row.management_fee != null ? Number(row.management_fee) : null,
      repairFee: row.repair_fee != null ? Number(row.repair_fee) : null,
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
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `INSERT INTO properties (
      id, tenant_id, name, area, address, listing_price, size_sqm, management_fee, repair_fee, notes
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *`,
    [
      genId("prop"),
      scopeTenantId,
      input.name,
      input.area ?? null,
      input.address ?? null,
      input.listingPrice,
      input.sizeSqm ?? null,
      input.managementFee ?? null,
      input.repairFee ?? null,
      input.notes ?? null,
    ]
  );
  return mapProperty(result.rows[0]);
}

export async function listQuotations(limit?: number, tenantId = DEFAULT_TENANT_ID): Promise<DashboardQuoteItem[]> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const hasLimit = typeof limit === "number";
  const quoteRes = hasLimit
    ? await getPool().query("SELECT * FROM quotations WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2", [
        scopeTenantId,
        limit,
      ])
    : await getPool().query("SELECT * FROM quotations WHERE tenant_id = $1 ORDER BY created_at DESC", [scopeTenantId]);

  const quotes = quoteRes.rows.map(mapQuotation);
  if (quotes.length === 0) return [];

  const clientIds = [...new Set(quotes.map((item) => item.clientId))];
  const propertyIds = [...new Set(quotes.map((item) => item.propertyId).filter(Boolean) as string[])];

  const [clientRes, propertyRes] = await Promise.all([
    getPool().query("SELECT * FROM clients WHERE id = ANY($1) AND tenant_id = $2", [clientIds, scopeTenantId]),
    propertyIds.length > 0
      ? getPool().query("SELECT * FROM properties WHERE id = ANY($1) AND tenant_id = $2", [propertyIds, scopeTenantId])
      : Promise.resolve({ rows: [] as Array<Record<string, unknown>> }),
  ]);

  const clients = new Map(clientRes.rows.map((row) => {
    const client = mapClient(row);
    return [client.id, client] as const;
  }));

  const properties = new Map(propertyRes.rows.map((row) => {
    const property = mapProperty(row);
    return [property.id, property] as const;
  }));

  const items: DashboardQuoteItem[] = [];
  for (const quote of quotes) {
    const client = clients.get(quote.clientId);
    if (!client) continue;
    items.push({
      ...quote,
      client,
      property: quote.propertyId ? properties.get(quote.propertyId) : undefined,
    });
  }
  return items;
}

export async function getQuotationById(quoteId: string, tenantId = DEFAULT_TENANT_ID) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);

  const quoteRes = await getPool().query("SELECT * FROM quotations WHERE id = $1 AND tenant_id = $2 LIMIT 1", [
    quoteId,
    scopeTenantId,
  ]);
  const row = quoteRes.rows[0];
  if (!row) return null;

  const quote = mapQuotation(row);
  const [clientRes, propertyRes] = await Promise.all([
    getPool().query("SELECT * FROM clients WHERE id = $1 AND tenant_id = $2 LIMIT 1", [quote.clientId, scopeTenantId]),
    quote.propertyId
      ? getPool().query("SELECT * FROM properties WHERE id = $1 AND tenant_id = $2 LIMIT 1", [
          quote.propertyId,
          scopeTenantId,
        ])
      : Promise.resolve({ rows: [] as Array<Record<string, unknown>> }),
  ]);

  return {
    ...quote,
    client: clientRes.rows[0] ? mapClient(clientRes.rows[0]) : undefined,
    property: propertyRes.rows[0] ? mapProperty(propertyRes.rows[0]) : undefined,
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
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const id = genId("client");

  const result = await getPool().query(
    `INSERT INTO clients (
      id, tenant_id, name, phone, line_id, email, budget_min, budget_max, budget_type, preferred_area,
      first_choice_area, second_choice_area, purpose, loan_pre_approval_status, desired_move_in_period,
      stage, temperature, brokerage_contract_type, brokerage_contract_signed_at, brokerage_contract_expires_at,
      important_matters_explained_at, contract_document_delivered_at, personal_info_consent_at, aml_check_status,
      next_follow_up_at, notes, owner_user_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
    RETURNING *`,
    [
      id,
      scopeTenantId,
      input.name,
      input.phone,
      input.lineId ?? null,
      input.email ?? null,
      input.budgetMin ?? null,
      input.budgetMax ?? null,
      input.budgetType,
      input.preferredArea ?? null,
      input.firstChoiceArea ?? null,
      input.secondChoiceArea ?? null,
      input.purpose,
      input.loanPreApprovalStatus,
      input.desiredMoveInPeriod ?? null,
      input.stage,
      input.temperature,
      input.brokerageContractType,
      input.brokerageContractSignedAt ?? null,
      input.brokerageContractExpiresAt ?? null,
      input.importantMattersExplainedAt ?? null,
      input.contractDocumentDeliveredAt ?? null,
      input.personalInfoConsentAt ?? null,
      input.amlCheckStatus,
      input.nextFollowUpAt ?? null,
      input.notes ?? null,
      input.ownerUserId,
    ]
  );

  return mapClient(result.rows[0]);
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
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);

  const result = await getPool().query(
    `UPDATE clients SET
      name = $2,
      phone = $3,
      line_id = $4,
      email = $5,
      budget_min = $6,
      budget_max = $7,
      budget_type = $8,
      preferred_area = $9,
      first_choice_area = $10,
      second_choice_area = $11,
      purpose = $12,
      loan_pre_approval_status = $13,
      desired_move_in_period = $14,
      stage = $15,
      temperature = $16,
      brokerage_contract_type = $17,
      brokerage_contract_signed_at = $18,
      brokerage_contract_expires_at = $19,
      important_matters_explained_at = $20,
      contract_document_delivered_at = $21,
      personal_info_consent_at = $22,
      aml_check_status = $23,
      next_follow_up_at = $24,
      notes = $25,
      updated_at = NOW()
    WHERE id = $1 AND tenant_id = $26
    RETURNING *`,
    [
      clientId,
      input.name,
      input.phone,
      input.lineId ?? null,
      input.email ?? null,
      input.budgetMin ?? null,
      input.budgetMax ?? null,
      input.budgetType,
      input.preferredArea ?? null,
      input.firstChoiceArea ?? null,
      input.secondChoiceArea ?? null,
      input.purpose,
      input.loanPreApprovalStatus,
      input.desiredMoveInPeriod ?? null,
      input.stage,
      input.temperature,
      input.brokerageContractType,
      input.brokerageContractSignedAt ?? null,
      input.brokerageContractExpiresAt ?? null,
      input.importantMattersExplainedAt ?? null,
      input.contractDocumentDeliveredAt ?? null,
      input.personalInfoConsentAt ?? null,
      input.amlCheckStatus,
      input.nextFollowUpAt ?? null,
      input.notes ?? null,
      scopeTenantId,
    ]
  );

  return result.rows[0] ? mapClient(result.rows[0]) : null;
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
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);

  return withTransaction(async (client) => {
    const followId = genId("followup");
    const followRes = await client.query(
      `INSERT INTO follow_ups (
        id, tenant_id, client_id, type, content, next_action, next_follow_up_at, created_by_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *`,
      [
        followId,
        scopeTenantId,
        input.clientId,
        input.type,
        input.content,
        input.nextAction ?? null,
        input.nextFollowUpAt ?? null,
        input.createdById,
      ]
    );

    await client.query(
      `UPDATE clients
       SET last_contacted_at = NOW(), next_follow_up_at = $2, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $3`,
      [input.clientId, input.nextFollowUpAt ?? null, scopeTenantId]
    );

    return mapFollowUp(followRes.rows[0]);
  });
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
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);

  return withTransaction(async (client) => {
    const clientRes = await client.query(
      "SELECT owner_user_id FROM clients WHERE id = $1 AND tenant_id = $2 LIMIT 1 FOR UPDATE",
      [input.clientId, scopeTenantId]
    );
    if (!clientRes.rows[0]) return null;

    const createdById = input.createdById ?? String(clientRes.rows[0].owner_user_id);

    const existingRes = await client.query(
      `SELECT * FROM tasks
       WHERE client_id = $1 AND tenant_id = $2 AND title = $3 AND status = 'pending'
       LIMIT 1`,
      [input.clientId, scopeTenantId, input.alertTitle]
    );
    if (existingRes.rows[0]) {
      return mapTask(existingRes.rows[0]);
    }

    const taskRes = await client.query(
      `INSERT INTO tasks (
        id, tenant_id, client_id, title, due_at, status, created_by_id
      ) VALUES ($1,$2,$3,$4,$5,'pending',$6)
      RETURNING *`,
      [genId("task"), scopeTenantId, input.clientId, input.alertTitle, input.dueAt ?? null, createdById]
    );

    await client.query(
      `INSERT INTO follow_ups (
        id, tenant_id, client_id, type, content, next_action, next_follow_up_at, created_by_id
      ) VALUES ($1,$2,$3,'note',$4,$5,$6,$7)`,
      [
        genId("followup"),
        scopeTenantId,
        input.clientId,
        `法定対応タスクを作成: ${input.alertTitle}`,
        input.reason,
        input.dueAt ?? null,
        createdById,
      ]
    );

    await client.query("UPDATE clients SET updated_at = NOW() WHERE id = $1 AND tenant_id = $2", [
      input.clientId,
      scopeTenantId,
    ]);
    await client.query(
      `INSERT INTO audit_logs (
        id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        genId("audit"),
        scopeTenantId,
        createdById,
        createdById,
        "compliance_task_created",
        "task",
        String(taskRes.rows[0].id),
        `法定対応タスクを作成しました: ${input.alertTitle}`,
        JSON.stringify({ clientId: input.clientId, alertType: input.alertType }),
      ]
    );

    return mapTask(taskRes.rows[0]);
  });
}

export async function addTask(input: {
  tenantId?: string;
  clientId?: string;
  title: string;
  dueAt?: Date;
  status?: TaskStatus;
  createdById: string;
}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `INSERT INTO tasks (
      id, tenant_id, client_id, title, due_at, status, created_by_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *`,
    [
      genId("task"),
      scopeTenantId,
      input.clientId ?? null,
      input.title,
      input.dueAt ?? null,
      input.status ?? "pending",
      input.createdById,
    ]
  );
  return mapTask(result.rows[0]);
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
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const actorId = input.actorId ?? input.userId;
  if (!actorId) {
    throw new Error("監査ログに必要な actorId が不足しています。");
  }
  const result = await getPool().query(
    `INSERT INTO audit_logs (
      id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
    RETURNING *`,
    [
      genId("audit"),
      scopeTenantId,
      actorId,
      actorId,
      input.action,
      input.targetType,
      input.targetId ?? null,
      input.message,
      JSON.stringify(input.context ?? {}),
    ]
  );
  return mapAuditLog(result.rows[0]);
}

export async function resolveComplianceAlert(input: {
  tenantId?: string;
  clientId: string;
  alertType: ComplianceAlertType;
  resolvedById: string;
  resolvedAt?: Date;
  extendDays?: number;
}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);

  return withTransaction(async (client) => {
    const currentRes = await client.query("SELECT * FROM clients WHERE id = $1 AND tenant_id = $2 LIMIT 1 FOR UPDATE", [
      input.clientId,
      scopeTenantId,
    ]);
    if (!currentRes.rows[0]) return null;
    const current = mapClient(currentRes.rows[0]);

    const resolvedAt = input.resolvedAt ?? new Date();
    const updates: string[] = ["updated_at = NOW()"];
    const values: Array<string | Date | number | null> = [input.clientId, scopeTenantId];
    let idx = 3;
    let content = "法定対応を更新しました。";

    const pushSet = (column: string, value: string | Date | null) => {
      updates.push(`${column} = $${idx}`);
      values.push(value);
      idx += 1;
    };

    if (input.alertType === "missing_35") {
      pushSet("important_matters_explained_at", resolvedAt);
      content = "重要事項説明（35条）実施日を記録しました。";
    } else if (input.alertType === "missing_37") {
      pushSet("contract_document_delivered_at", resolvedAt);
      content = "契約書面交付（37条）日を記録しました。";
    } else if (input.alertType === "aml_pending") {
      pushSet("aml_check_status", "verified");
      content = "本人確認/AMLステータスを「確認済み」に更新しました。";
    } else if (input.alertType === "missing_pii_consent") {
      pushSet("personal_info_consent_at", resolvedAt);
      content = "個人情報利用目的の同意確認日を記録しました。";
    } else if (input.alertType === "brokerage_expired" || input.alertType === "brokerage_expiring") {
      const extendDays = input.extendDays && input.extendDays > 0 ? input.extendDays : 90;
      const nextExpire = new Date(resolvedAt.getTime() + extendDays * 24 * 60 * 60 * 1000);
      pushSet("brokerage_contract_signed_at", current.brokerageContractSignedAt ?? resolvedAt);
      pushSet("brokerage_contract_type", current.brokerageContractType === "none" ? "general" : current.brokerageContractType);
      pushSet("brokerage_contract_expires_at", nextExpire);
      content = `媒介契約の満了日を ${extendDays} 日延長して更新しました。`;
    }

    const updateRes = await client.query(
      `UPDATE clients
       SET ${updates.join(", ")}
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      values
    );

    await client.query(
      `INSERT INTO follow_ups (
        id, tenant_id, client_id, type, content, next_action, created_by_id
      ) VALUES ($1,$2,$3,'note',$4,$5,$6)`,
      [
        genId("followup"),
        scopeTenantId,
        input.clientId,
        `法定対応を解消: ${content}`,
        "法定対応記録を再確認",
        input.resolvedById,
      ]
    );
    await client.query(
      `INSERT INTO audit_logs (
        id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        genId("audit"),
        scopeTenantId,
        input.resolvedById,
        input.resolvedById,
        "compliance_resolved",
        "compliance",
        input.clientId,
        content,
        JSON.stringify({ alertType: input.alertType }),
      ]
    );

    return updateRes.rows[0] ? mapClient(updateRes.rows[0]) : null;
  });
}

export async function updateTaskStatus(input: {
  tenantId?: string;
  taskId: string;
  status: TaskStatus;
  updatedById: string;
}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const statusLabel = input.status === "done" ? "完了" : input.status === "canceled" ? "取消" : "未着手";

  return withTransaction(async (client) => {
    const taskRes = await client.query("SELECT * FROM tasks WHERE id = $1 AND tenant_id = $2 LIMIT 1 FOR UPDATE", [
      input.taskId,
      scopeTenantId,
    ]);
    if (!taskRes.rows[0]) return null;
    const task = mapTask(taskRes.rows[0]);

    const updatedRes = await client.query(
      "UPDATE tasks SET status = $2 WHERE id = $1 AND tenant_id = $3 RETURNING *",
      [input.taskId, input.status, scopeTenantId]
    );

    if (task.clientId) {
      await client.query(
        `INSERT INTO follow_ups (
          id, tenant_id, client_id, type, content, next_action, created_by_id
        ) VALUES ($1,$2,$3,'note',$4,$5,$6)`,
        [
          genId("followup"),
          scopeTenantId,
          task.clientId,
          `タスク状態を更新: ${task.title}（${statusLabel}）`,
          input.status === "done" ? "次の優先タスクを確認" : "必要に応じて再計画",
          input.updatedById,
        ]
      );
    }
    await client.query(
      `INSERT INTO audit_logs (
        id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        genId("audit"),
        scopeTenantId,
        input.updatedById,
        input.updatedById,
        "task_status_updated",
        "task",
        input.taskId,
        `${task.title} を ${statusLabel} に更新しました。`,
        JSON.stringify({ status: input.status }),
      ]
    );

    return mapTask(updatedRes.rows[0]);
  });
}

export async function rescheduleTask(input: {
  tenantId?: string;
  taskId: string;
  dueAt: Date;
  updatedById: string;
}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);

  return withTransaction(async (client) => {
    const taskRes = await client.query("SELECT * FROM tasks WHERE id = $1 AND tenant_id = $2 LIMIT 1 FOR UPDATE", [
      input.taskId,
      scopeTenantId,
    ]);
    if (!taskRes.rows[0]) return null;
    const task = mapTask(taskRes.rows[0]);

    const updatedRes = await client.query(
      "UPDATE tasks SET due_at = $2, status = 'pending' WHERE id = $1 AND tenant_id = $3 RETURNING *",
      [input.taskId, input.dueAt, scopeTenantId]
    );

    if (task.clientId) {
      await client.query(
        `INSERT INTO follow_ups (
          id, tenant_id, client_id, type, content, next_action, next_follow_up_at, created_by_id
        ) VALUES ($1,$2,$3,'note',$4,$5,$6,$7)`,
        [
          genId("followup"),
          scopeTenantId,
          task.clientId,
          `タスク期限を変更: ${task.title}`,
          `新しい期限は ${input.dueAt.toLocaleDateString("ja-JP")}`,
          input.dueAt,
          input.updatedById,
        ]
      );
    }
    await client.query(
      `INSERT INTO audit_logs (
        id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        genId("audit"),
        scopeTenantId,
        input.updatedById,
        input.updatedById,
        "task_rescheduled",
        "task",
        input.taskId,
        `${task.title} の期限を ${input.dueAt.toLocaleDateString("ja-JP")} に変更しました。`,
        JSON.stringify({ dueAt: input.dueAt.toISOString() }),
      ]
    );

    return mapTask(updatedRes.rows[0]);
  });
}

export async function setClientStage(clientId: string, stage: ClientStage, tenantId = DEFAULT_TENANT_ID) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const db = getPool();
  const beforeRes = await db.query("SELECT * FROM clients WHERE id = $1 AND tenant_id = $2 LIMIT 1", [
    clientId,
    scopeTenantId,
  ]);
  if (!beforeRes.rows[0]) return null;
  const before = mapClient(beforeRes.rows[0]);
  const [quoteCountRes, followCountRes, viewingCountRes] = await Promise.all([
    db.query("SELECT COUNT(*)::int AS count FROM quotations WHERE client_id = $1 AND tenant_id = $2", [
      clientId,
      scopeTenantId,
    ]),
    db.query("SELECT COUNT(*)::int AS count FROM follow_ups WHERE client_id = $1 AND tenant_id = $2", [
      clientId,
      scopeTenantId,
    ]),
    db.query("SELECT COUNT(*)::int AS count FROM follow_ups WHERE client_id = $1 AND tenant_id = $2 AND type = 'viewing'", [
      clientId,
      scopeTenantId,
    ]),
  ]);
  const blockers = validateStageTransition({
    from: before.stage,
    to: stage,
    quotationCount: Number(quoteCountRes.rows[0]?.count ?? 0),
    followUpCount: Number(followCountRes.rows[0]?.count ?? 0),
    hasViewingFollowUp: Number(viewingCountRes.rows[0]?.count ?? 0) > 0,
    importantMattersExplainedAt: before.importantMattersExplainedAt,
    personalInfoConsentAt: before.personalInfoConsentAt,
    amlCheckStatus: before.amlCheckStatus,
  });
  if (blockers.length > 0) {
    throw new StageTransitionBlockedError(blockers);
  }

  const result = await db.query("UPDATE clients SET stage = $2, updated_at = NOW() WHERE id = $1 AND tenant_id = $3 RETURNING *", [
    clientId,
    stage,
    scopeTenantId,
  ]);
  return result.rows[0] ? mapClient(result.rows[0]) : null;
}

export async function setClientStageWithLog(input: {
  tenantId?: string;
  clientId: string;
  stage: ClientStage;
  createdById?: string;
  reason?: string;
  locale?: Locale;
}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const locale = input.locale ?? "ja";
  const stageLabel = getStageLabel(locale);

  return withTransaction(async (client) => {
    const beforeRes = await client.query("SELECT * FROM clients WHERE id = $1 AND tenant_id = $2 LIMIT 1 FOR UPDATE", [
      input.clientId,
      scopeTenantId,
    ]);
    if (!beforeRes.rows[0]) return null;

    const before = mapClient(beforeRes.rows[0]);
    const [quoteCountRes, followCountRes, viewingCountRes] = await Promise.all([
      client.query("SELECT COUNT(*)::int AS count FROM quotations WHERE client_id = $1 AND tenant_id = $2", [
        input.clientId,
        scopeTenantId,
      ]),
      client.query("SELECT COUNT(*)::int AS count FROM follow_ups WHERE client_id = $1 AND tenant_id = $2", [
        input.clientId,
        scopeTenantId,
      ]),
      client.query("SELECT COUNT(*)::int AS count FROM follow_ups WHERE client_id = $1 AND tenant_id = $2 AND type = 'viewing'", [
        input.clientId,
        scopeTenantId,
      ]),
    ]);
    const blockers = validateStageTransition({
      from: before.stage,
      to: input.stage,
      quotationCount: Number(quoteCountRes.rows[0]?.count ?? 0),
      followUpCount: Number(followCountRes.rows[0]?.count ?? 0),
      hasViewingFollowUp: Number(viewingCountRes.rows[0]?.count ?? 0) > 0,
      importantMattersExplainedAt: before.importantMattersExplainedAt,
      personalInfoConsentAt: before.personalInfoConsentAt,
      amlCheckStatus: before.amlCheckStatus,
      locale,
    });
    if (blockers.length > 0) {
      throw new StageTransitionBlockedError(blockers);
    }

    const updateRes = await client.query(
      "UPDATE clients SET stage = $2, updated_at = NOW() WHERE id = $1 AND tenant_id = $3 RETURNING *",
      [input.clientId, input.stage, scopeTenantId]
    );
    const updated = mapClient(updateRes.rows[0]);

    if (before.stage !== updated.stage) {
      await client.query(
        `INSERT INTO follow_ups (
          id, tenant_id, client_id, type, content, next_action, created_by_id
        ) VALUES ($1,$2,$3,'note',$4,$5,$6)`,
        [
          genId("followup"),
          scopeTenantId,
          input.clientId,
          locale === "zh"
            ? `阶段更新: ${stageLabel[before.stage]} -> ${stageLabel[updated.stage]}`
            : locale === "ko"
              ? `단계 업데이트: ${stageLabel[before.stage]} -> ${stageLabel[updated.stage]}`
              : `ステージ更新: ${stageLabel[before.stage]} -> ${stageLabel[updated.stage]}`,
          input.reason ??
            (locale === "zh"
              ? "进入下一阶段"
              : locale === "ko"
                ? "다음 단계로 진행"
                : "次のステージへ進める"),
          input.createdById ?? updated.ownerUserId,
        ]
      );
    }

    return updated;
  });
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
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const computed = computeQuote(input);

  return withTransaction(async (client) => {
    const ownerRes = await client.query(
      "SELECT owner_user_id, stage, next_follow_up_at FROM clients WHERE id = $1 AND tenant_id = $2 LIMIT 1 FOR UPDATE",
      [input.clientId, scopeTenantId],
    );
    if (!ownerRes.rows[0]) {
      throw new Error("顧客が見つかりません。");
    }
    const ownerUserId = String(ownerRes.rows[0].owner_user_id);
    const beforeStage = String(ownerRes.rows[0].stage) as ClientStage;
    const nextFollowUpAt = ownerRes.rows[0].next_follow_up_at ?? null;

    const quoteId = genId("quote");
    const quoteRes = await client.query(
      `INSERT INTO quotations (
        id, tenant_id, client_id, property_id, quote_title,
        listing_price, brokerage_fee, tax_fee, management_fee,
        repair_fee, other_fee, down_payment, loan_amount,
        interest_rate, loan_years, monthly_payment_estimate,
        total_initial_cost, monthly_total_cost, summary_text, status
      ) VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,
        $10,$11,$12,$13,
        $14,$15,$16,
        $17,$18,$19,'draft'
      ) RETURNING *`,
      [
        quoteId,
        scopeTenantId,
        input.clientId,
        input.propertyId ?? null,
        input.quoteTitle,
        input.listingPrice,
        input.brokerageFee,
        input.taxFee,
        input.managementFee,
        input.repairFee,
        input.otherFee,
        input.downPayment,
        computed.loanAmount,
        input.interestRate,
        input.loanYears,
        computed.monthlyPaymentEstimate,
        computed.totalInitialCost,
        computed.monthlyTotalCost,
        input.summaryText,
      ]
    );

    await client.query(
      "UPDATE clients SET stage = 'quoted', last_contacted_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
      [input.clientId, scopeTenantId]
    );

    await client.query(
      `INSERT INTO follow_ups (
        id, tenant_id, client_id, type, content, next_action, next_follow_up_at, created_by_id
      ) VALUES ($1,$2,$3,'note',$4,$5,$6,$7)`,
      [
        genId("followup"),
        scopeTenantId,
        input.clientId,
        `見積を作成: ${input.quoteTitle}（月々返済 ${computed.monthlyPaymentEstimate.toLocaleString("ja-JP")} 円）`,
        "見積を送付し、顧客フィードバックを回収",
        nextFollowUpAt,
        ownerUserId,
      ]
    );

    if (beforeStage !== "quoted") {
      await client.query(
        `INSERT INTO follow_ups (
          id, tenant_id, client_id, type, content, next_action, next_follow_up_at, created_by_id
        ) VALUES ($1,$2,$3,'note',$4,$5,$6,$7)`,
        [
          genId("followup"),
          scopeTenantId,
          input.clientId,
          `ステージ提案: 「${STAGE_JA_LABEL.quoted}」へ自動反映しました。`,
          "頭金と月次支出の受容度を確認",
          nextFollowUpAt,
          ownerUserId,
        ]
      );
    }

    return mapQuotation(quoteRes.rows[0]);
  });
}

export async function duplicateQuotation(quoteId: string, tenantId = DEFAULT_TENANT_ID) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);

  const sourceRes = await getPool().query("SELECT * FROM quotations WHERE id = $1 AND tenant_id = $2 LIMIT 1", [
    quoteId,
    scopeTenantId,
  ]);
  if (!sourceRes.rows[0]) return null;
  const source = mapQuotation(sourceRes.rows[0]);

  const normalized = source.quoteTitle.replace(/\s+v\d+$/i, "").trim();
  const titleRes = await getPool().query("SELECT quote_title FROM quotations WHERE tenant_id = $1 AND quote_title ILIKE $2", [
    scopeTenantId,
    `${normalized}%`,
  ]);

  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const versionRegex = new RegExp(`^${escaped}\\s+v(\\d+)$`, "i");

  const maxVersion = titleRes.rows.reduce((max, row) => {
    const title = String(row.quote_title ?? "");
    const match = title.match(versionRegex);
    if (!match) return max;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 1);

  const nextVersion = maxVersion + 1;
  const newTitle = `${normalized} v${nextVersion}`;

  const result = await getPool().query(
    `INSERT INTO quotations (
      id, tenant_id, client_id, property_id, quote_title,
      listing_price, brokerage_fee, tax_fee, management_fee,
      repair_fee, other_fee, down_payment, loan_amount,
      interest_rate, loan_years, monthly_payment_estimate,
      total_initial_cost, monthly_total_cost, summary_text, status
    ) VALUES (
      $1,$2,$3,$4,$5,
      $6,$7,$8,$9,
      $10,$11,$12,$13,
      $14,$15,$16,
      $17,$18,$19,'draft'
    ) RETURNING *`,
    [
      genId("quote"),
      scopeTenantId,
      source.clientId,
      source.propertyId ?? null,
      newTitle,
      source.listingPrice,
      source.brokerageFee,
      source.taxFee,
      source.managementFee,
      source.repairFee,
      source.otherFee,
      source.downPayment,
      source.loanAmount,
      source.interestRate,
      source.loanYears,
      source.monthlyPaymentEstimate,
      source.totalInitialCost,
      source.monthlyTotalCost,
      source.summaryText,
    ]
  );

  const duplicated = mapQuotation(result.rows[0]);
  const clientRes = await getPool().query(
    "SELECT owner_user_id, next_follow_up_at FROM clients WHERE id = $1 AND tenant_id = $2 LIMIT 1",
    [duplicated.clientId, scopeTenantId]
  );
  if (clientRes.rows[0]) {
    await getPool().query(
      `INSERT INTO follow_ups (
        id, tenant_id, client_id, type, content, next_action, next_follow_up_at, created_by_id
      ) VALUES ($1,$2,$3,'note',$4,$5,$6,$7)`,
      [
        genId("followup"),
        scopeTenantId,
        duplicated.clientId,
        `見積改訂: 新バージョン ${duplicated.quoteTitle} を作成。`,
        "差分確認後に顧客へ送付",
        clientRes.rows[0].next_follow_up_at ?? null,
        String(clientRes.rows[0].owner_user_id),
      ]
    );
  }

  return duplicated;
}

export async function updateQuotationStatus(quoteId: string, status: QuoteStatus, tenantId = DEFAULT_TENANT_ID) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const result = await getPool().query(
    "UPDATE quotations SET status = $2, updated_at = NOW() WHERE id = $1 AND tenant_id = $3 RETURNING *",
    [quoteId, status, scopeTenantId]
  );
  return result.rows[0] ? mapQuotation(result.rows[0]) : null;
}

export async function healthCheckPostgres() {
  await ensureSchema();
  await getPool().query("SELECT 1");
  return { ok: true };
}

export type {
  Attachment,
  AttachmentTargetType,
  GeneratedOutput,
  ClientListFilter,
  ClientListSort,
  Client,
  Property,
  Quotation,
  FollowUp,
  ImportJob,
  ImportJobStatus,
  ImportSourceType,
  ImportTargetEntity,
  BrokerageCase,
  BrokerageCaseStatus,
  BrokerageCaseType,
  ExtractionReviewItem,
  ExtractionReviewStatus,
  OutputTemplateVersion,
  Task,
  User,
  AuditLog,
  OutputTemplateSettings,
  OutputTemplateSettingsInput,
};
