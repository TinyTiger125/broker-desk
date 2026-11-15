-- Repair the first staging migration without changing its already-recorded
-- checksum. This is additive so existing databases can apply it safely.
BEGIN;

DROP POLICY IF EXISTS entry_upload_staging_worker_update ON public.entry_upload_staging;
CREATE POLICY entry_upload_staging_worker_update ON public.entry_upload_staging
  FOR UPDATE TO brokerdesk_admin
  USING (current_user = 'brokerdesk_admin')
  WITH CHECK (current_user = 'brokerdesk_admin');

DROP POLICY IF EXISTS entry_upload_staging_chunks_tenant_access ON public.entry_upload_staging_chunks;
CREATE POLICY entry_upload_staging_chunks_tenant_access ON public.entry_upload_staging_chunks
  USING (
    brokerdesk_private.can_access_tenant(tenant_id)
    AND EXISTS (SELECT 1 FROM public.entry_upload_staging parent
                 WHERE parent.id = public.entry_upload_staging_chunks.staging_id
                   AND parent.tenant_id = public.entry_upload_staging_chunks.tenant_id
                   AND parent.user_id = brokerdesk_private.current_user_id())
  )
  WITH CHECK (
    brokerdesk_private.can_access_tenant(tenant_id)
    AND EXISTS (SELECT 1 FROM public.entry_upload_staging parent
                 WHERE parent.id = public.entry_upload_staging_chunks.staging_id
                   AND parent.tenant_id = public.entry_upload_staging_chunks.tenant_id
                   AND parent.user_id = brokerdesk_private.current_user_id())
  );

DROP POLICY IF EXISTS entry_upload_staging_chunks_worker_delete ON public.entry_upload_staging_chunks;
CREATE POLICY entry_upload_staging_chunks_worker_delete ON public.entry_upload_staging_chunks
  FOR DELETE TO brokerdesk_admin USING (current_user = 'brokerdesk_admin');

-- The bounded cleanup selector uses FOR UPDATE on the parent before deleting;
-- no chunk UPDATE privilege is needed because parent deletion cascades chunks.
GRANT SELECT, UPDATE, DELETE ON TABLE public.entry_upload_staging TO brokerdesk_admin;
GRANT SELECT, DELETE ON TABLE public.entry_upload_staging_chunks TO brokerdesk_admin;

COMMIT;
