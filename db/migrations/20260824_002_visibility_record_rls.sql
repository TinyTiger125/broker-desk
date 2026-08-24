-- W9.1 object visibility RLS.
--
-- The original tenant policy remains the baseline for every other business
-- table.  These three records additionally enforce the frozen V1 contract:
-- unresolved ownership is invisible; company_read is read-only for active
-- tenant members; private rows are visible/writable only to their owner.

DO $$
DECLARE
  record_table TEXT;
BEGIN
  FOREACH record_table IN ARRAY ARRAY['clients', 'properties', 'brokerage_cases'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS brokerdesk_tenant_isolation ON public.%I', record_table);
    EXECUTE format('DROP POLICY IF EXISTS brokerdesk_visibility_select ON public.%I', record_table);
    EXECUTE format('DROP POLICY IF EXISTS brokerdesk_visibility_insert ON public.%I', record_table);
    EXECUTE format('DROP POLICY IF EXISTS brokerdesk_visibility_update ON public.%I', record_table);
    EXECUTE format('DROP POLICY IF EXISTS brokerdesk_visibility_delete ON public.%I', record_table);

    EXECUTE format($policy$
      CREATE POLICY brokerdesk_visibility_select ON public.%I
      FOR SELECT
      USING (
        brokerdesk_private.can_access_tenant(tenant_id)
        AND owner_resolution_status = 'resolved'
        AND current_owner_user_id IS NOT NULL
        AND (
          visibility_scope = 'company_read'
          OR current_owner_user_id = brokerdesk_private.current_user_id()
        )
      )
    $policy$, record_table);

    EXECUTE format($policy$
      CREATE POLICY brokerdesk_visibility_insert ON public.%I
      FOR INSERT
      WITH CHECK (
        brokerdesk_private.can_access_tenant(tenant_id)
        AND owner_resolution_status = 'resolved'
        AND current_owner_user_id = brokerdesk_private.current_user_id()
      )
    $policy$, record_table);

    EXECUTE format($policy$
      CREATE POLICY brokerdesk_visibility_update ON public.%I
      FOR UPDATE
      USING (
        brokerdesk_private.can_access_tenant(tenant_id)
        AND owner_resolution_status = 'resolved'
        AND current_owner_user_id = brokerdesk_private.current_user_id()
      )
      WITH CHECK (
        brokerdesk_private.can_access_tenant(tenant_id)
        AND owner_resolution_status = 'resolved'
        AND current_owner_user_id = brokerdesk_private.current_user_id()
      )
    $policy$, record_table);

    EXECUTE format($policy$
      CREATE POLICY brokerdesk_visibility_delete ON public.%I
      FOR DELETE
      USING (
        brokerdesk_private.can_access_tenant(tenant_id)
        AND owner_resolution_status = 'resolved'
        AND current_owner_user_id = brokerdesk_private.current_user_id()
      )
    $policy$, record_table);
  END LOOP;
END $$;
