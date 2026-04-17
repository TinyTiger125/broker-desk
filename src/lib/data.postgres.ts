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
  Property,
  Quotation,
  Task,
  User,
  AuditLog,
  OutputTemplateVersion,
} from "@/lib/data.memory";

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

function mapUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    createdAt: toDate(row.created_at) ?? new Date(),
  };
}

function mapClient(row: Record<string, unknown>): Client {
  return {
    id: String(row.id),
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

function mapAttachment(row: Record<string, unknown>): Attachment {
  return {
    id: String(row.id),
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
  const sourceQuoteId = row.source_quote_id ? String(row.source_quote_id) : String(row.quote_id);
  return {
    id: String(row.id),
    actorId,
    userId: actorId,
    sourceQuoteId,
    quoteId: String(row.quote_id),
    propertyId: row.property_id ? String(row.property_id) : undefined,
    partyId: row.party_id ? String(row.party_id) : undefined,
    outputType: String(row.output_type) as GeneratedOutput["outputType"],
    outputFormat: String(row.output_format) as GeneratedOutput["outputFormat"],
    language: String(row.language) as Locale,
    title: String(row.title),
    documentNumber: String(row.document_number ?? ""),
    templateVersionId: row.template_version_id ? String(row.template_version_id) : undefined,
    generatedAt: toDate(row.generated_at) ?? new Date(),
  };
}

function mapOutputTemplateVersion(row: Record<string, unknown>): OutputTemplateVersion {
  return {
    id: String(row.id),
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

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
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
      client_id TEXT REFERENCES clients(id),
      title TEXT NOT NULL,
      due_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'pending',
      created_by_id TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
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
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
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

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
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
      user_id TEXT NOT NULL REFERENCES users(id),
      actor_id TEXT REFERENCES users(id),
      quote_id TEXT NOT NULL REFERENCES quotations(id),
      source_quote_id TEXT,
      property_id TEXT,
      party_id TEXT,
      output_type TEXT NOT NULL,
      output_format TEXT NOT NULL DEFAULT 'pdf',
      language TEXT NOT NULL DEFAULT 'ja',
      title TEXT NOT NULL,
      document_number TEXT,
      template_version_id TEXT,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_clients_owner_stage ON clients(owner_user_id, stage);
    CREATE INDEX IF NOT EXISTS idx_clients_next_followup ON clients(next_follow_up_at);
    CREATE INDEX IF NOT EXISTS idx_quotes_client_created ON quotations(client_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_followups_client_created ON follow_ups(client_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tasks_client_status_due ON tasks(client_id, status, due_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs(actor_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_output_template_user ON output_template_settings(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_output_template_version_user_number ON output_template_versions(user_id, version_number);
    CREATE INDEX IF NOT EXISTS idx_output_template_version_user_created ON output_template_versions(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_import_jobs_user_created ON import_jobs(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_attachments_user_target ON attachments(user_id, target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_generated_outputs_user_created ON generated_outputs(user_id, generated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_generated_outputs_actor_created ON generated_outputs(actor_id, generated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_generated_outputs_quote ON generated_outputs(quote_id, generated_at DESC);

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

export async function getOutputTemplateSettings(userId: string): Promise<OutputTemplateSettings> {
  await ensureSchema();
  const db = getPool();
  const existingRes = await db.query(
    "SELECT * FROM output_template_settings WHERE user_id = $1 LIMIT 1",
    [userId]
  );
  if (existingRes.rows[0]) {
    return mapOutputTemplateSettings(existingRes.rows[0]);
  }

  const defaults = getDefaultOutputTemplateSettings(userId);
  const insertedRes = await db.query(
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
    )
    ON CONFLICT (user_id) DO UPDATE SET updated_at = output_template_settings.updated_at
    RETURNING *`,
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
  return mapOutputTemplateSettings(insertedRes.rows[0]);
}

export async function updateOutputTemplateSettings(
  userId: string,
  input: OutputTemplateSettingsInput
): Promise<OutputTemplateSettings> {
  await ensureSchema();
  const current = await getOutputTemplateSettings(userId);
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
     WHERE user_id = $1
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

export async function listOutputTemplateVersions(userId: string, limit = 20): Promise<OutputTemplateVersion[]> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT * FROM output_template_versions
     WHERE user_id = $1
     ORDER BY version_number DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows.map(mapOutputTemplateVersion);
}

export async function createOutputTemplateVersion(input: {
  userId: string;
  versionLabel?: string;
  changeNote?: string;
  settingsSnapshot?: OutputTemplateSettingsInput;
  activate?: boolean;
}): Promise<OutputTemplateVersion> {
  await ensureSchema();
  const settings = input.settingsSnapshot ?? toTemplateSettingsInput(await getOutputTemplateSettings(input.userId));
  const activate = input.activate ?? true;

  return withTransaction(async (client) => {
    const nextRes = await client.query(
      "SELECT COALESCE(MAX(version_number), 0)::int + 1 AS next FROM output_template_versions WHERE user_id = $1",
      [input.userId]
    );
    const versionNumber = Number(nextRes.rows[0]?.next ?? 1);

    if (activate) {
      await client.query("UPDATE output_template_versions SET is_active = FALSE WHERE user_id = $1", [input.userId]);
    }

    const inserted = await client.query(
      `INSERT INTO output_template_versions (
        id, user_id, version_number, version_label, change_note, settings_snapshot, is_active, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,NOW())
      RETURNING *`,
      [
        genId("tplver"),
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
  userId: string;
  versionId: string;
}): Promise<OutputTemplateSettings | null> {
  await ensureSchema();

  return withTransaction(async (client) => {
    const versionRes = await client.query(
      "SELECT * FROM output_template_versions WHERE id = $1 AND user_id = $2 LIMIT 1 FOR UPDATE",
      [input.versionId, input.userId]
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
       WHERE user_id = $1
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
      ]
    );

    await client.query("UPDATE output_template_versions SET is_active = FALSE WHERE user_id = $1", [input.userId]);
    await client.query("UPDATE output_template_versions SET is_active = TRUE WHERE id = $1 AND user_id = $2", [
      input.versionId,
      input.userId,
    ]);

    return result.rows[0] ? mapOutputTemplateSettings(result.rows[0]) : null;
  });
}

export async function getOutputTemplateVersionById(input: {
  userId: string;
  versionId: string;
}): Promise<OutputTemplateVersion | null> {
  await ensureSchema();
  const result = await getPool().query(
    "SELECT * FROM output_template_versions WHERE id = $1 AND user_id = $2 LIMIT 1",
    [input.versionId, input.userId]
  );
  return result.rows[0] ? mapOutputTemplateVersion(result.rows[0]) : null;
}

export async function listImportJobs(userId: string, limit = 50): Promise<ImportJob[]> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT * FROM import_jobs
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows.map(mapImportJob);
}

export async function addImportJob(input: {
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
      id, user_id, source_type, title, target_entity, status, notes, mapping_json, validation_message, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,NULL,NOW(),NOW())
    RETURNING *`,
    [
      genId("import"),
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
    "SELECT status FROM import_jobs WHERE id = $1 AND user_id = $2 LIMIT 1",
    [input.jobId, input.userId]
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
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [
      input.jobId,
      input.userId,
      JSON.stringify(input.mappingJson),
      input.validationMessage?.trim() || null,
      input.notes?.trim() || null,
      input.status ?? null,
    ]
  );
  return result.rows[0] ? mapImportJob(result.rows[0]) : null;
}

export async function listAttachments(input: {
  userId: string;
  targetType?: AttachmentTargetType;
  targetId?: string;
  limit?: number;
}): Promise<Attachment[]> {
  await ensureSchema();
  const limit = input.limit ?? 100;
  const values: Array<string | number> = [input.userId];
  const filters: string[] = ["user_id = $1"];
  let idx = 2;
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
      id, user_id, target_type, target_id, file_name, file_type, file_size_bytes, storage_path, uploaded_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
    RETURNING *`,
    [
      genId("att"),
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
  userId: string;
  quoteId?: string;
  limit?: number;
}): Promise<GeneratedOutput[]> {
  await ensureSchema();
  const limit = input.limit ?? 100;
  const values: Array<string | number> = [input.userId];
  const filters: string[] = ["user_id = $1"];
  let idx = 2;
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
  userId: string;
  id: string;
}): Promise<GeneratedOutput | undefined> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT * FROM generated_outputs
     WHERE user_id = $1 AND id = $2
     LIMIT 1`,
    [input.userId, input.id]
  );
  if (result.rows.length === 0) return undefined;
  return mapGeneratedOutput(result.rows[0]);
}

export async function addGeneratedOutput(input: {
  userId: string;
  actorId?: string;
  sourceQuoteId?: string;
  quoteId: string;
  propertyId?: string;
  partyId?: string;
  outputType: GeneratedOutput["outputType"];
  outputFormat: GeneratedOutput["outputFormat"];
  language: Locale;
  title: string;
  documentNumber: string;
  templateVersionId?: string;
}): Promise<GeneratedOutput> {
  await ensureSchema();
  const actorId = input.actorId ?? input.userId;
  const sourceQuoteId = input.sourceQuoteId ?? input.quoteId;
  const result = await getPool().query(
    `INSERT INTO generated_outputs (
      id, user_id, actor_id, quote_id, source_quote_id, property_id, party_id, output_type, output_format, language, title, document_number, template_version_id, generated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
    RETURNING *`,
    [
      genId("out"),
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
  const values: Array<string | number> = [userId];
  const where: string[] = ["(actor_id = $1 OR user_id = $1)"];
  let index = 2;

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
  const result = await getPool().query("SELECT * FROM clients WHERE owner_user_id = $1", [userId]);
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
      "SELECT client_id, COUNT(*)::int AS count FROM quotations WHERE client_id = ANY($1) GROUP BY client_id",
      [ids]
    );
    quoteRes.rows.forEach((row) => quoteCountMap.set(String(row.client_id), Number(row.count)));

    const followRes = await getPool().query(
      "SELECT client_id, COUNT(*)::int AS count FROM follow_ups WHERE client_id = ANY($1) GROUP BY client_id",
      [ids]
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

export async function getClientById(clientId: string) {
  await ensureSchema();
  const result = await getPool().query("SELECT * FROM clients WHERE id = $1 LIMIT 1", [clientId]);
  return result.rows[0] ? mapClient(result.rows[0]) : null;
}

export async function getClientDetail(clientId: string) {
  await ensureSchema();

  const [clientRes, quoteRes, followRes, taskRes] = await Promise.all([
    getPool().query("SELECT * FROM clients WHERE id = $1 LIMIT 1", [clientId]),
    getPool().query("SELECT * FROM quotations WHERE client_id = $1 ORDER BY created_at DESC", [clientId]),
    getPool().query("SELECT * FROM follow_ups WHERE client_id = $1 ORDER BY created_at DESC", [clientId]),
    getPool().query(
      `SELECT * FROM tasks
       WHERE client_id = $1
       ORDER BY
         CASE status WHEN 'pending' THEN 0 WHEN 'done' THEN 1 ELSE 2 END,
         due_at ASC NULLS LAST,
         created_at DESC`,
      [clientId]
    ),
  ]);

  if (!clientRes.rows[0]) return null;
  const client = mapClient(clientRes.rows[0]);

  const propertyIds = quoteRes.rows.map((row) => row.property_id).filter(Boolean) as string[];
  const properties = new Map<string, Property>();
  if (propertyIds.length > 0) {
    const propRes = await getPool().query("SELECT * FROM properties WHERE id = ANY($1)", [propertyIds]);
    propRes.rows.forEach((row) => {
      const property = mapProperty(row);
      properties.set(property.id, property);
    });
  }

  const owner = await getDefaultUser();

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

export async function getBoardData(userId: string) {
  await ensureSchema();
  const result = await getPool().query("SELECT * FROM clients WHERE owner_user_id = $1 ORDER BY updated_at DESC", [userId]);
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

export async function listQuoteFormData() {
  await ensureSchema();
  const [clientsRes, propertiesRes] = await Promise.all([
    getPool().query("SELECT id, name FROM clients ORDER BY updated_at DESC"),
    getPool().query("SELECT id, name, listing_price, management_fee, repair_fee FROM properties ORDER BY created_at DESC"),
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
  const result = await getPool().query(
    `INSERT INTO properties (
      id, name, area, address, listing_price, size_sqm, management_fee, repair_fee, notes
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *`,
    [
      genId("prop"),
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

export async function listQuotations(limit?: number): Promise<DashboardQuoteItem[]> {
  await ensureSchema();
  const hasLimit = typeof limit === "number";
  const quoteRes = hasLimit
    ? await getPool().query("SELECT * FROM quotations ORDER BY created_at DESC LIMIT $1", [limit])
    : await getPool().query("SELECT * FROM quotations ORDER BY created_at DESC");

  const quotes = quoteRes.rows.map(mapQuotation);
  if (quotes.length === 0) return [];

  const clientIds = [...new Set(quotes.map((item) => item.clientId))];
  const propertyIds = [...new Set(quotes.map((item) => item.propertyId).filter(Boolean) as string[])];

  const [clientRes, propertyRes] = await Promise.all([
    getPool().query("SELECT * FROM clients WHERE id = ANY($1)", [clientIds]),
    propertyIds.length > 0
      ? getPool().query("SELECT * FROM properties WHERE id = ANY($1)", [propertyIds])
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

export async function getQuotationById(quoteId: string) {
  await ensureSchema();

  const quoteRes = await getPool().query("SELECT * FROM quotations WHERE id = $1 LIMIT 1", [quoteId]);
  const row = quoteRes.rows[0];
  if (!row) return null;

  const quote = mapQuotation(row);
  const [clientRes, propertyRes] = await Promise.all([
    getPool().query("SELECT * FROM clients WHERE id = $1 LIMIT 1", [quote.clientId]),
    quote.propertyId
      ? getPool().query("SELECT * FROM properties WHERE id = $1 LIMIT 1", [quote.propertyId])
      : Promise.resolve({ rows: [] as Array<Record<string, unknown>> }),
  ]);

  return {
    ...quote,
    client: clientRes.rows[0] ? mapClient(clientRes.rows[0]) : undefined,
    property: propertyRes.rows[0] ? mapProperty(propertyRes.rows[0]) : undefined,
  };
}

export async function addClient(input: {
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
  const id = genId("client");

  const result = await getPool().query(
    `INSERT INTO clients (
      id, name, phone, line_id, email, budget_min, budget_max, budget_type, preferred_area,
      first_choice_area, second_choice_area, purpose, loan_pre_approval_status, desired_move_in_period,
      stage, temperature, brokerage_contract_type, brokerage_contract_signed_at, brokerage_contract_expires_at,
      important_matters_explained_at, contract_document_delivered_at, personal_info_consent_at, aml_check_status,
      next_follow_up_at, notes, owner_user_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
    RETURNING *`,
    [
      id,
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
    WHERE id = $1
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
    ]
  );

  return result.rows[0] ? mapClient(result.rows[0]) : null;
}

export async function appendFollowUp(input: {
  clientId: string;
  createdById: string;
  type: FollowUpType;
  content: string;
  nextAction?: string;
  nextFollowUpAt?: Date;
}) {
  await ensureSchema();

  return withTransaction(async (client) => {
    const followId = genId("followup");
    const followRes = await client.query(
      `INSERT INTO follow_ups (
        id, client_id, type, content, next_action, next_follow_up_at, created_by_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *`,
      [
        followId,
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
       WHERE id = $1`,
      [input.clientId, input.nextFollowUpAt ?? null]
    );

    return mapFollowUp(followRes.rows[0]);
  });
}

export async function createComplianceTaskFromAlert(input: {
  clientId: string;
  alertType: ComplianceAlertType;
  alertTitle: string;
  reason: string;
  dueAt?: Date;
  createdById?: string;
}) {
  await ensureSchema();

  return withTransaction(async (client) => {
    const clientRes = await client.query(
      "SELECT owner_user_id FROM clients WHERE id = $1 LIMIT 1 FOR UPDATE",
      [input.clientId]
    );
    if (!clientRes.rows[0]) return null;

    const createdById = input.createdById ?? String(clientRes.rows[0].owner_user_id);

    const existingRes = await client.query(
      `SELECT * FROM tasks
       WHERE client_id = $1 AND title = $2 AND status = 'pending'
       LIMIT 1`,
      [input.clientId, input.alertTitle]
    );
    if (existingRes.rows[0]) {
      return mapTask(existingRes.rows[0]);
    }

    const taskRes = await client.query(
      `INSERT INTO tasks (
        id, client_id, title, due_at, status, created_by_id
      ) VALUES ($1,$2,$3,$4,'pending',$5)
      RETURNING *`,
      [genId("task"), input.clientId, input.alertTitle, input.dueAt ?? null, createdById]
    );

    await client.query(
      `INSERT INTO follow_ups (
        id, client_id, type, content, next_action, next_follow_up_at, created_by_id
      ) VALUES ($1,$2,'note',$3,$4,$5,$6)`,
      [
        genId("followup"),
        input.clientId,
        `法定対応タスクを作成: ${input.alertTitle}`,
        input.reason,
        input.dueAt ?? null,
        createdById,
      ]
    );

    await client.query("UPDATE clients SET updated_at = NOW() WHERE id = $1", [input.clientId]);
    await client.query(
      `INSERT INTO audit_logs (
        id, user_id, actor_id, action, target_type, target_id, message, context_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        genId("audit"),
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
  clientId?: string;
  title: string;
  dueAt?: Date;
  status?: TaskStatus;
  createdById: string;
}) {
  await ensureSchema();
  const result = await getPool().query(
    `INSERT INTO tasks (
      id, client_id, title, due_at, status, created_by_id
    ) VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING *`,
    [
      genId("task"),
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
  userId?: string;
  actorId?: string;
  action: string;
  targetType: AuditLog["targetType"];
  targetId?: string;
  message: string;
  context?: Record<string, unknown>;
}) {
  await ensureSchema();
  const actorId = input.actorId ?? input.userId;
  if (!actorId) {
    throw new Error("監査ログに必要な actorId が不足しています。");
  }
  const result = await getPool().query(
    `INSERT INTO audit_logs (
      id, user_id, actor_id, action, target_type, target_id, message, context_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
    RETURNING *`,
    [
      genId("audit"),
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
  clientId: string;
  alertType: ComplianceAlertType;
  resolvedById: string;
  resolvedAt?: Date;
  extendDays?: number;
}) {
  await ensureSchema();

  return withTransaction(async (client) => {
    const currentRes = await client.query("SELECT * FROM clients WHERE id = $1 LIMIT 1 FOR UPDATE", [input.clientId]);
    if (!currentRes.rows[0]) return null;
    const current = mapClient(currentRes.rows[0]);

    const resolvedAt = input.resolvedAt ?? new Date();
    const updates: string[] = ["updated_at = NOW()"];
    const values: Array<string | Date | number | null> = [input.clientId];
    let idx = 2;
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
       WHERE id = $1
       RETURNING *`,
      values
    );

    await client.query(
      `INSERT INTO follow_ups (
        id, client_id, type, content, next_action, created_by_id
      ) VALUES ($1,$2,'note',$3,$4,$5)`,
      [genId("followup"), input.clientId, `法定対応を解消: ${content}`, "法定対応記録を再確認", input.resolvedById]
    );
    await client.query(
      `INSERT INTO audit_logs (
        id, user_id, actor_id, action, target_type, target_id, message, context_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        genId("audit"),
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
  taskId: string;
  status: TaskStatus;
  updatedById: string;
}) {
  await ensureSchema();
  const statusLabel = input.status === "done" ? "完了" : input.status === "canceled" ? "取消" : "未着手";

  return withTransaction(async (client) => {
    const taskRes = await client.query("SELECT * FROM tasks WHERE id = $1 LIMIT 1 FOR UPDATE", [input.taskId]);
    if (!taskRes.rows[0]) return null;
    const task = mapTask(taskRes.rows[0]);

    const updatedRes = await client.query(
      "UPDATE tasks SET status = $2 WHERE id = $1 RETURNING *",
      [input.taskId, input.status]
    );

    if (task.clientId) {
      await client.query(
        `INSERT INTO follow_ups (
          id, client_id, type, content, next_action, created_by_id
        ) VALUES ($1,$2,'note',$3,$4,$5)`,
        [
          genId("followup"),
          task.clientId,
          `タスク状態を更新: ${task.title}（${statusLabel}）`,
          input.status === "done" ? "次の優先タスクを確認" : "必要に応じて再計画",
          input.updatedById,
        ]
      );
    }
    await client.query(
      `INSERT INTO audit_logs (
        id, user_id, actor_id, action, target_type, target_id, message, context_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        genId("audit"),
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
  taskId: string;
  dueAt: Date;
  updatedById: string;
}) {
  await ensureSchema();

  return withTransaction(async (client) => {
    const taskRes = await client.query("SELECT * FROM tasks WHERE id = $1 LIMIT 1 FOR UPDATE", [input.taskId]);
    if (!taskRes.rows[0]) return null;
    const task = mapTask(taskRes.rows[0]);

    const updatedRes = await client.query(
      "UPDATE tasks SET due_at = $2, status = 'pending' WHERE id = $1 RETURNING *",
      [input.taskId, input.dueAt]
    );

    if (task.clientId) {
      await client.query(
        `INSERT INTO follow_ups (
          id, client_id, type, content, next_action, next_follow_up_at, created_by_id
        ) VALUES ($1,$2,'note',$3,$4,$5,$6)`,
        [
          genId("followup"),
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
        id, user_id, actor_id, action, target_type, target_id, message, context_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        genId("audit"),
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

export async function setClientStage(clientId: string, stage: ClientStage) {
  await ensureSchema();
  const db = getPool();
  const beforeRes = await db.query("SELECT * FROM clients WHERE id = $1 LIMIT 1", [clientId]);
  if (!beforeRes.rows[0]) return null;
  const before = mapClient(beforeRes.rows[0]);
  const [quoteCountRes, followCountRes, viewingCountRes] = await Promise.all([
    db.query("SELECT COUNT(*)::int AS count FROM quotations WHERE client_id = $1", [clientId]),
    db.query("SELECT COUNT(*)::int AS count FROM follow_ups WHERE client_id = $1", [clientId]),
    db.query("SELECT COUNT(*)::int AS count FROM follow_ups WHERE client_id = $1 AND type = 'viewing'", [clientId]),
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

  const result = await db.query("UPDATE clients SET stage = $2, updated_at = NOW() WHERE id = $1 RETURNING *", [clientId, stage]);
  return result.rows[0] ? mapClient(result.rows[0]) : null;
}

export async function setClientStageWithLog(input: {
  clientId: string;
  stage: ClientStage;
  createdById?: string;
  reason?: string;
  locale?: Locale;
}) {
  await ensureSchema();
  const locale = input.locale ?? "ja";
  const stageLabel = getStageLabel(locale);

  return withTransaction(async (client) => {
    const beforeRes = await client.query("SELECT * FROM clients WHERE id = $1 LIMIT 1 FOR UPDATE", [input.clientId]);
    if (!beforeRes.rows[0]) return null;

    const before = mapClient(beforeRes.rows[0]);
    const [quoteCountRes, followCountRes, viewingCountRes] = await Promise.all([
      client.query("SELECT COUNT(*)::int AS count FROM quotations WHERE client_id = $1", [input.clientId]),
      client.query("SELECT COUNT(*)::int AS count FROM follow_ups WHERE client_id = $1", [input.clientId]),
      client.query("SELECT COUNT(*)::int AS count FROM follow_ups WHERE client_id = $1 AND type = 'viewing'", [input.clientId]),
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
      "UPDATE clients SET stage = $2, updated_at = NOW() WHERE id = $1 RETURNING *",
      [input.clientId, input.stage]
    );
    const updated = mapClient(updateRes.rows[0]);

    if (before.stage !== updated.stage) {
      await client.query(
        `INSERT INTO follow_ups (
          id, client_id, type, content, next_action, created_by_id
        ) VALUES ($1,$2,'note',$3,$4,$5)`,
        [
          genId("followup"),
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
  const computed = computeQuote(input);

  return withTransaction(async (client) => {
    const ownerRes = await client.query("SELECT owner_user_id, stage, next_follow_up_at FROM clients WHERE id = $1 LIMIT 1 FOR UPDATE", [input.clientId]);
    if (!ownerRes.rows[0]) {
      throw new Error("顧客が見つかりません。");
    }
    const ownerUserId = String(ownerRes.rows[0].owner_user_id);
    const beforeStage = String(ownerRes.rows[0].stage) as ClientStage;
    const nextFollowUpAt = ownerRes.rows[0].next_follow_up_at ?? null;

    const quoteId = genId("quote");
    const quoteRes = await client.query(
      `INSERT INTO quotations (
        id, client_id, property_id, quote_title,
        listing_price, brokerage_fee, tax_fee, management_fee,
        repair_fee, other_fee, down_payment, loan_amount,
        interest_rate, loan_years, monthly_payment_estimate,
        total_initial_cost, monthly_total_cost, summary_text, status
      ) VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,$8,
        $9,$10,$11,$12,
        $13,$14,$15,
        $16,$17,$18,'draft'
      ) RETURNING *`,
      [
        quoteId,
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
      "UPDATE clients SET stage = 'quoted', last_contacted_at = NOW(), updated_at = NOW() WHERE id = $1",
      [input.clientId]
    );

    await client.query(
      `INSERT INTO follow_ups (
        id, client_id, type, content, next_action, next_follow_up_at, created_by_id
      ) VALUES ($1,$2,'note',$3,$4,$5,$6)`,
      [
        genId("followup"),
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
          id, client_id, type, content, next_action, next_follow_up_at, created_by_id
        ) VALUES ($1,$2,'note',$3,$4,$5,$6)`,
        [
          genId("followup"),
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

export async function duplicateQuotation(quoteId: string) {
  await ensureSchema();

  const sourceRes = await getPool().query("SELECT * FROM quotations WHERE id = $1 LIMIT 1", [quoteId]);
  if (!sourceRes.rows[0]) return null;
  const source = mapQuotation(sourceRes.rows[0]);

  const normalized = source.quoteTitle.replace(/\s+v\d+$/i, "").trim();
  const titleRes = await getPool().query("SELECT quote_title FROM quotations WHERE quote_title ILIKE $1", [`${normalized}%`]);

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
      id, client_id, property_id, quote_title,
      listing_price, brokerage_fee, tax_fee, management_fee,
      repair_fee, other_fee, down_payment, loan_amount,
      interest_rate, loan_years, monthly_payment_estimate,
      total_initial_cost, monthly_total_cost, summary_text, status
    ) VALUES (
      $1,$2,$3,$4,
      $5,$6,$7,$8,
      $9,$10,$11,$12,
      $13,$14,$15,
      $16,$17,$18,'draft'
    ) RETURNING *`,
    [
      genId("quote"),
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
    "SELECT owner_user_id, next_follow_up_at FROM clients WHERE id = $1 LIMIT 1",
    [duplicated.clientId]
  );
  if (clientRes.rows[0]) {
    await getPool().query(
      `INSERT INTO follow_ups (
        id, client_id, type, content, next_action, next_follow_up_at, created_by_id
      ) VALUES ($1,$2,'note',$3,$4,$5,$6)`,
      [
        genId("followup"),
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

export async function updateQuotationStatus(quoteId: string, status: QuoteStatus) {
  await ensureSchema();
  const result = await getPool().query(
    "UPDATE quotations SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *",
    [quoteId, status]
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
  OutputTemplateVersion,
  Task,
  User,
  AuditLog,
  OutputTemplateSettings,
  OutputTemplateSettingsInput,
};
