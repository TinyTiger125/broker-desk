ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by_id TEXT;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by_id TEXT;

ALTER TABLE brokerage_cases
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by_id TEXT;

CREATE INDEX IF NOT EXISTS idx_clients_tenant_lifecycle
  ON clients (tenant_id, lifecycle_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_properties_tenant_lifecycle
  ON properties (tenant_id, lifecycle_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_brokerage_cases_tenant_lifecycle
  ON brokerage_cases (tenant_id, lifecycle_status, updated_at DESC);
