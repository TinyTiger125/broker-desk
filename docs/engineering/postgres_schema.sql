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

CREATE INDEX IF NOT EXISTS idx_clients_owner_stage ON clients(owner_user_id, stage);
CREATE INDEX IF NOT EXISTS idx_clients_tenant_owner_stage ON clients(tenant_id, owner_user_id, stage);
CREATE INDEX IF NOT EXISTS idx_clients_next_followup ON clients(next_follow_up_at);
CREATE INDEX IF NOT EXISTS idx_properties_tenant_created ON properties(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_tenant_created ON quotations(tenant_id, created_at DESC);
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

-- Backward-compatible migration for existing clients table.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
ALTER TABLE output_template_versions ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
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

-- 2026-04 sprint P0 additions: actor audit + output traceability
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_id TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS context_json JSONB;
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs(actor_id, created_at DESC);
UPDATE audit_logs SET actor_id = user_id WHERE actor_id IS NULL;
UPDATE audit_logs SET context_json = '{}'::jsonb WHERE context_json IS NULL;

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
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_generated_outputs_user_created ON generated_outputs(user_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_outputs_tenant_user_created ON generated_outputs(tenant_id, user_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_outputs_actor_created ON generated_outputs(actor_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_outputs_quote ON generated_outputs(quote_id, generated_at DESC);

ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS actor_id TEXT;
ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS source_quote_id TEXT;
ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS document_number TEXT;
ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS template_version_id TEXT;
ALTER TABLE generated_outputs ALTER COLUMN quote_id DROP NOT NULL;
UPDATE generated_outputs SET source_quote_id = quote_id WHERE source_quote_id IS NULL;
UPDATE generated_outputs SET actor_id = user_id WHERE actor_id IS NULL;
UPDATE generated_outputs SET document_number = id WHERE document_number IS NULL;

-- V1 input review save: source job -> field-level review -> lightweight case data.
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
CREATE INDEX IF NOT EXISTS idx_import_jobs_user_created ON import_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_jobs_tenant_user_created ON import_jobs(tenant_id, user_id, created_at DESC);

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
CREATE INDEX IF NOT EXISTS idx_attachments_user_target ON attachments(user_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_attachments_tenant_user_target ON attachments(tenant_id, user_id, target_type, target_id);

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

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user_status ON tenant_memberships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_role ON tenant_memberships(tenant_id, role);
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

ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
ALTER TABLE brokerage_cases ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
ALTER TABLE extraction_review_items ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
ALTER TABLE guarantee_application_drafts ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
ALTER TABLE correction_events ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
ALTER TABLE ai_experience_drafts ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
