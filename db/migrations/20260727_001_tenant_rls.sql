-- Broker Desk Supabase/Postgres RLS baseline.
--
-- Assumption:
-- - public.users.external_auth_subject stores the immutable subject from the
--   production identity provider.
-- - Supabase/PostgREST provides request.jwt.claim.sub, or the server sets
--   app.external_auth_subject inside a transaction before querying.
-- - Do not use user-editable metadata for authorization decisions.

CREATE SCHEMA IF NOT EXISTS brokerdesk_private;

CREATE OR REPLACE FUNCTION brokerdesk_private.current_external_auth_subject()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(current_setting('app.external_auth_subject', true), '')
  );
$$;

CREATE OR REPLACE FUNCTION brokerdesk_private.current_user_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT users.id
  FROM public.users
  WHERE users.external_auth_subject = brokerdesk_private.current_external_auth_subject()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION brokerdesk_private.can_access_tenant(target_tenant_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships
    JOIN public.tenants ON tenants.id = tenant_memberships.tenant_id
    WHERE tenant_memberships.user_id = brokerdesk_private.current_user_id()
      AND tenant_memberships.tenant_id = target_tenant_id
      AND tenant_memberships.status = 'active'
      AND tenants.status IN ('trial', 'active')
  );
$$;

CREATE OR REPLACE FUNCTION brokerdesk_private.can_access_user(target_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT target_user_id = brokerdesk_private.current_user_id()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships own_membership
      JOIN public.tenant_memberships target_membership
        ON target_membership.tenant_id = own_membership.tenant_id
      JOIN public.tenants ON tenants.id = own_membership.tenant_id
      WHERE own_membership.user_id = brokerdesk_private.current_user_id()
        AND own_membership.status = 'active'
        AND target_membership.user_id = target_user_id
        AND target_membership.status IN ('active', 'invited')
        AND tenants.status IN ('trial', 'active')
    );
$$;

REVOKE ALL ON SCHEMA brokerdesk_private FROM PUBLIC;
REVOKE ALL ON FUNCTION brokerdesk_private.current_external_auth_subject() FROM PUBLIC;
REVOKE ALL ON FUNCTION brokerdesk_private.current_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION brokerdesk_private.can_access_tenant(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION brokerdesk_private.can_access_user(TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA brokerdesk_private TO authenticated;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.current_external_auth_subject() TO authenticated;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.current_user_id() TO authenticated;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_tenant(TEXT) TO authenticated;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_user(TEXT) TO authenticated;
  END IF;
END $$;

DO $$
DECLARE
  tenant_table TEXT;
  tenant_tables TEXT[] := ARRAY[
    'clients',
    'properties',
    'quotations',
    'follow_ups',
    'tasks',
    'audit_logs',
    'output_template_settings',
    'output_template_versions',
    'generated_outputs',
    'import_jobs',
    'attachments',
    'brokerage_cases',
    'extraction_review_items',
    'guarantee_application_drafts',
    'correction_events',
    'ai_experience_drafts',
    'case_workbench_field_rules'
  ];
BEGIN
  FOREACH tenant_table IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('DROP POLICY IF EXISTS brokerdesk_tenant_isolation ON public.%I', tenant_table);
    EXECUTE format(
      'CREATE POLICY brokerdesk_tenant_isolation ON public.%I
       FOR ALL
       USING (brokerdesk_private.can_access_tenant(tenant_id))
       WITH CHECK (brokerdesk_private.can_access_tenant(tenant_id))',
      tenant_table
    );

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', tenant_table);
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brokerdesk_users_read_same_tenant ON public.users;
CREATE POLICY brokerdesk_users_read_same_tenant
ON public.users
FOR SELECT
USING (brokerdesk_private.can_access_user(id));

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brokerdesk_tenants_read_membership ON public.tenants;
CREATE POLICY brokerdesk_tenants_read_membership
ON public.tenants
FOR SELECT
USING (brokerdesk_private.can_access_tenant(id));

ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brokerdesk_memberships_read_same_tenant ON public.tenant_memberships;
CREATE POLICY brokerdesk_memberships_read_same_tenant
ON public.tenant_memberships
FOR SELECT
USING (brokerdesk_private.can_access_tenant(tenant_id));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON TABLE public.users TO authenticated;
    GRANT SELECT ON TABLE public.tenants TO authenticated;
    GRANT SELECT ON TABLE public.tenant_memberships TO authenticated;
  END IF;
END $$;
