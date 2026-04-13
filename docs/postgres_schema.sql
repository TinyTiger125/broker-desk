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
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  message TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_clients_owner_stage ON clients(owner_user_id, stage);
CREATE INDEX IF NOT EXISTS idx_clients_next_followup ON clients(next_follow_up_at);
CREATE INDEX IF NOT EXISTS idx_quotes_client_created ON quotations(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followups_client_created ON follow_ups(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_client_status_due ON tasks(client_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_output_template_user ON output_template_settings(user_id);

-- Backward-compatible migration for existing clients table.
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
