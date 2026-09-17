BEGIN;

-- These helpers grant locking, never general UPDATE on identity/source tables.
-- The migration owner must retain the existing privileged migration role.
CREATE OR REPLACE FUNCTION brokerdesk_private.lock_case_review_membership(
  p_membership_id TEXT, p_tenant_id TEXT, p_actor_user_id TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF brokerdesk_private.current_user_id() IS DISTINCT FROM p_actor_user_id
     OR p_actor_user_id IS NULL
     OR NOT brokerdesk_private.can_access_tenant(p_tenant_id) THEN
    RETURN FALSE;
  END IF;
  PERFORM 1 FROM public.tenant_memberships m
    WHERE m.id = p_membership_id AND m.tenant_id = p_tenant_id
      AND m.user_id = p_actor_user_id AND m.status = 'active'
    FOR SHARE OF m;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION brokerdesk_private.lock_case_review_source(
  p_attachment_id TEXT, p_tenant_id TEXT, p_actor_user_id TEXT, p_import_job_id TEXT
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE source_hash TEXT;
BEGIN
  IF brokerdesk_private.current_user_id() IS DISTINCT FROM p_actor_user_id
     OR p_actor_user_id IS NULL
     OR NOT brokerdesk_private.can_access_tenant(p_tenant_id) THEN
    RETURN NULL;
  END IF;
  SELECT b.sha256 INTO source_hash
    FROM public.attachments a
    JOIN public.private_attachment_blobs b ON b.attachment_id = a.id AND b.tenant_id = a.tenant_id
    JOIN public.import_jobs j ON j.id = a.target_id AND j.tenant_id = a.tenant_id AND j.user_id = a.user_id
    WHERE a.id = p_attachment_id AND a.tenant_id = p_tenant_id AND a.user_id = p_actor_user_id
      AND a.target_type = 'import_job' AND a.target_id = p_import_job_id AND octet_length(b.content) > 0
    FOR SHARE OF a, b;
  RETURN source_hash;
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.lock_case_review_membership(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION brokerdesk_private.lock_case_review_source(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.lock_case_review_membership(TEXT, TEXT, TEXT) TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.lock_case_review_source(TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime;
  END IF;
END;
$$;
COMMIT;
