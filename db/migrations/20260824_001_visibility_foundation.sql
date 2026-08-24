-- W9.1 visibility foundation.
--
-- This migration only adds ownership/default metadata and its tenant RLS.
-- It does not grant company-wide access, perform takeover, or rewrite the
-- existing page/API read paths.  Unknown legacy ownership remains private and
-- pending confirmation so later readers can fail closed.

CREATE TABLE IF NOT EXISTS public.tenant_member_visibility_defaults (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id),
  membership_id TEXT NOT NULL REFERENCES public.tenant_memberships(id),
  member_user_id TEXT NOT NULL REFERENCES public.users(id),
  object_type TEXT NOT NULL CHECK (object_type IN ('case', 'person', 'property')),
  visibility_scope TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility_scope IN ('private', 'company_read')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, membership_id, member_user_id, object_type)
);

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS current_owner_user_id TEXT REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS visibility_scope TEXT NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS owner_resolution_status TEXT NOT NULL DEFAULT 'resolved';

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS current_owner_user_id TEXT REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS visibility_scope TEXT NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS owner_resolution_status TEXT NOT NULL DEFAULT 'pending_confirmation';

ALTER TABLE public.brokerage_cases
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS current_owner_user_id TEXT REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS visibility_scope TEXT NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS owner_resolution_status TEXT NOT NULL DEFAULT 'resolved';

-- Reliable legacy owners are copied from the existing owner columns.  A
-- property has no trustworthy legacy owner column, so it intentionally stays
-- pending_confirmation and is never assigned to a tenant owner by guesswork.
-- Each backfill is independently idempotent: a rerun fills only missing
-- metadata and never overwrites a previously chosen legal scope.
UPDATE public.clients
   SET created_by_user_id = COALESCE(created_by_user_id, owner_user_id)
 WHERE created_by_user_id IS NULL;
UPDATE public.clients
   SET current_owner_user_id = COALESCE(current_owner_user_id, owner_user_id)
 WHERE current_owner_user_id IS NULL;
UPDATE public.clients
   SET visibility_scope = 'private'
 WHERE visibility_scope IS NULL;
UPDATE public.clients
   SET owner_resolution_status = CASE WHEN current_owner_user_id IS NULL THEN 'pending_confirmation' ELSE 'resolved' END
 WHERE owner_resolution_status IS NULL;

UPDATE public.brokerage_cases
   SET created_by_user_id = COALESCE(created_by_user_id, user_id)
 WHERE created_by_user_id IS NULL;
UPDATE public.brokerage_cases
   SET current_owner_user_id = COALESCE(current_owner_user_id, user_id)
 WHERE current_owner_user_id IS NULL;
UPDATE public.brokerage_cases
   SET visibility_scope = 'private'
 WHERE visibility_scope IS NULL;
UPDATE public.brokerage_cases
   SET owner_resolution_status = CASE WHEN current_owner_user_id IS NULL THEN 'pending_confirmation' ELSE 'resolved' END
 WHERE owner_resolution_status IS NULL;

UPDATE public.properties
   SET visibility_scope = 'private'
 WHERE visibility_scope IS NULL;
UPDATE public.properties
   SET owner_resolution_status = 'pending_confirmation'
 WHERE owner_resolution_status IS NULL;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_visibility_scope_check,
  DROP CONSTRAINT IF EXISTS clients_owner_resolution_status_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_visibility_scope_check
    CHECK (visibility_scope IN ('private', 'company_read')) NOT VALID,
  ADD CONSTRAINT clients_owner_resolution_status_check
    CHECK (owner_resolution_status IN ('resolved', 'pending_confirmation')) NOT VALID;

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_visibility_scope_check,
  DROP CONSTRAINT IF EXISTS properties_owner_resolution_status_check;
ALTER TABLE public.properties
  ADD CONSTRAINT properties_visibility_scope_check
    CHECK (visibility_scope IN ('private', 'company_read')) NOT VALID,
  ADD CONSTRAINT properties_owner_resolution_status_check
    CHECK (owner_resolution_status IN ('resolved', 'pending_confirmation')) NOT VALID;

ALTER TABLE public.brokerage_cases
  DROP CONSTRAINT IF EXISTS brokerage_cases_visibility_scope_check,
  DROP CONSTRAINT IF EXISTS brokerage_cases_owner_resolution_status_check;
ALTER TABLE public.brokerage_cases
  ADD CONSTRAINT brokerage_cases_visibility_scope_check
    CHECK (visibility_scope IN ('private', 'company_read')) NOT VALID,
  ADD CONSTRAINT brokerage_cases_owner_resolution_status_check
    CHECK (owner_resolution_status IN ('resolved', 'pending_confirmation')) NOT VALID;

ALTER TABLE public.clients VALIDATE CONSTRAINT clients_visibility_scope_check;
ALTER TABLE public.clients VALIDATE CONSTRAINT clients_owner_resolution_status_check;
ALTER TABLE public.properties VALIDATE CONSTRAINT properties_visibility_scope_check;
ALTER TABLE public.properties VALIDATE CONSTRAINT properties_owner_resolution_status_check;
ALTER TABLE public.brokerage_cases VALIDATE CONSTRAINT brokerage_cases_visibility_scope_check;
ALTER TABLE public.brokerage_cases VALIDATE CONSTRAINT brokerage_cases_owner_resolution_status_check;

CREATE INDEX IF NOT EXISTS idx_clients_tenant_visibility_owner
  ON public.clients (tenant_id, visibility_scope, current_owner_user_id);
CREATE INDEX IF NOT EXISTS idx_properties_tenant_visibility_owner
  ON public.properties (tenant_id, visibility_scope, current_owner_user_id);
CREATE INDEX IF NOT EXISTS idx_brokerage_cases_tenant_visibility_owner
  ON public.brokerage_cases (tenant_id, visibility_scope, current_owner_user_id);
CREATE INDEX IF NOT EXISTS idx_visibility_defaults_member_object
  ON public.tenant_member_visibility_defaults (tenant_id, member_user_id, object_type);

ALTER TABLE public.tenant_member_visibility_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_member_visibility_defaults FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brokerdesk_tenant_visibility_defaults ON public.tenant_member_visibility_defaults;
DROP POLICY IF EXISTS brokerdesk_tenant_visibility_defaults_select ON public.tenant_member_visibility_defaults;
DROP POLICY IF EXISTS brokerdesk_tenant_visibility_defaults_insert ON public.tenant_member_visibility_defaults;
DROP POLICY IF EXISTS brokerdesk_tenant_visibility_defaults_update ON public.tenant_member_visibility_defaults;
CREATE POLICY brokerdesk_tenant_visibility_defaults_select
  ON public.tenant_member_visibility_defaults
  FOR SELECT
  USING (
    brokerdesk_private.can_access_tenant(tenant_id)
    AND member_user_id = brokerdesk_private.current_user_id()
    AND EXISTS (
      SELECT 1
        FROM public.tenant_memberships membership
       WHERE membership.id = tenant_member_visibility_defaults.membership_id
         AND membership.tenant_id = tenant_member_visibility_defaults.tenant_id
         AND membership.user_id = tenant_member_visibility_defaults.member_user_id
         AND membership.status = 'active'
    )
  );
CREATE POLICY brokerdesk_tenant_visibility_defaults_insert
  ON public.tenant_member_visibility_defaults
  FOR INSERT
  WITH CHECK (
    brokerdesk_private.can_access_tenant(tenant_id)
    AND member_user_id = brokerdesk_private.current_user_id()
    AND EXISTS (
      SELECT 1
        FROM public.tenant_memberships membership
       WHERE membership.id = tenant_member_visibility_defaults.membership_id
         AND membership.tenant_id = tenant_member_visibility_defaults.tenant_id
         AND membership.user_id = tenant_member_visibility_defaults.member_user_id
         AND membership.status = 'active'
    )
  );
CREATE POLICY brokerdesk_tenant_visibility_defaults_update
  ON public.tenant_member_visibility_defaults
  FOR UPDATE
  USING (
    brokerdesk_private.can_access_tenant(tenant_id)
    AND member_user_id = brokerdesk_private.current_user_id()
    AND EXISTS (
      SELECT 1
        FROM public.tenant_memberships membership
       WHERE membership.id = tenant_member_visibility_defaults.membership_id
         AND membership.tenant_id = tenant_member_visibility_defaults.tenant_id
         AND membership.user_id = tenant_member_visibility_defaults.member_user_id
         AND membership.status = 'active'
    )
  )
  WITH CHECK (
    brokerdesk_private.can_access_tenant(tenant_id)
    AND member_user_id = brokerdesk_private.current_user_id()
    AND EXISTS (
      SELECT 1
        FROM public.tenant_memberships membership
       WHERE membership.id = tenant_member_visibility_defaults.membership_id
         AND membership.tenant_id = tenant_member_visibility_defaults.tenant_id
         AND membership.user_id = tenant_member_visibility_defaults.member_user_id
         AND membership.status = 'active'
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.tenant_member_visibility_defaults TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.tenant_member_visibility_defaults TO brokerdesk_runtime;
  END IF;
END $$;
