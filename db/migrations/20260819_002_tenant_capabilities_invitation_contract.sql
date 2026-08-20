-- TASK-039 Slice 1: explicit company capability and invitation identity.
-- Append-only and review-only in this slice; do not apply automatically.

ALTER TABLE tenant_memberships
  ADD COLUMN IF NOT EXISTS capability TEXT,
  ADD COLUMN IF NOT EXISTS invited_email TEXT,
  ADD COLUMN IF NOT EXISTS invited_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invitation_token TEXT;

-- Legacy owner rows are the only rows eligible for a compatibility backfill.
-- tenant_admin/manager are intentionally not upgraded by this migration.
UPDATE tenant_memberships
SET capability = 'company_owner'
WHERE role = 'tenant_owner' AND capability IS NULL;

-- Removed memberships must not block a fresh invitation/membership record.
ALTER TABLE tenant_memberships
  DROP CONSTRAINT IF EXISTS tenant_memberships_tenant_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_memberships_active_identity_key
  ON tenant_memberships (tenant_id, user_id)
  WHERE status <> 'removed';

CREATE UNIQUE INDEX IF NOT EXISTS tenant_memberships_invitation_token_key
  ON tenant_memberships (invitation_token)
  WHERE invitation_token IS NOT NULL;
