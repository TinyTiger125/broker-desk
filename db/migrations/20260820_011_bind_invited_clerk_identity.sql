-- TASK-039: bind an authenticated Clerk identity to an existing invitation.
-- This is intentionally separate from sync_external_auth_user: a normal web
-- request may bind only a valid pending invitation and may not self-provision.

CREATE OR REPLACE FUNCTION brokerdesk_private.bind_current_clerk_identity_to_pending_invitation(
  p_subject TEXT,
  p_email TEXT,
  p_name TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_subject TEXT := NULLIF(trim(COALESCE(p_subject, '')), '');
  normalized_email TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  normalized_name TEXT := NULLIF(trim(COALESCE(p_name, '')), '');
  configured_subject TEXT := brokerdesk_private.current_external_auth_subject();
  bound_user_id TEXT;
  candidate_count INTEGER;
  candidate_user_id TEXT;
BEGIN
  IF normalized_subject IS NULL OR normalized_email IS NULL THEN
    RETURN NULL;
  END IF;

  -- The database request scope is the authority. Never trust the function
  -- argument when the runtime failed to bind a Clerk subject, even in a
  -- non-production database.
  IF configured_subject IS NULL OR configured_subject <> normalized_subject THEN
    RAISE EXCEPTION 'external auth subject does not match request scope' USING ERRCODE = '42501';
  END IF;

  -- Serialize attempts for the same email so two tabs cannot bind two local
  -- placeholder users to the same Clerk subject concurrently.
  PERFORM pg_advisory_xact_lock(hashtextextended(normalized_email, 0));

  SELECT users.id
    INTO bound_user_id
    FROM public.users AS users
   WHERE users.external_auth_subject = normalized_subject
   LIMIT 1
   FOR UPDATE;
  IF bound_user_id IS NOT NULL THEN
    RETURN bound_user_id;
  END IF;

  -- An email already bound to a different external identity is not a valid
  -- invitation-binding target. Do not silently choose another placeholder.
  IF EXISTS (
    SELECT 1
      FROM public.users AS users
     WHERE lower(users.email) = normalized_email
       AND users.external_auth_subject IS NOT NULL
       AND users.external_auth_subject <> normalized_subject
  ) THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(DISTINCT users.id)::INTEGER
    INTO candidate_count
    FROM public.users AS users
    JOIN public.tenant_memberships AS memberships ON memberships.user_id = users.id
    JOIN public.tenants AS tenants ON tenants.id = memberships.tenant_id
   WHERE users.external_auth_subject IS NULL
     AND lower(users.email) = normalized_email
     AND lower(COALESCE(memberships.invited_email, '')) = normalized_email
     AND memberships.status = 'invited'
     AND memberships.invitation_status = 'pending'
     AND (memberships.invitation_expires_at IS NULL OR memberships.invitation_expires_at > NOW())
     AND tenants.status IN ('trial', 'active');

  -- Ambiguous or absent invitations fail closed. The identity must not be
  -- attached to an arbitrary same-email local user.
  IF candidate_count <> 1 THEN
    RETURN NULL;
  END IF;

  SELECT users.id
    INTO candidate_user_id
    FROM public.users AS users
    JOIN public.tenant_memberships AS memberships ON memberships.user_id = users.id
    JOIN public.tenants AS tenants ON tenants.id = memberships.tenant_id
   WHERE users.external_auth_subject IS NULL
     AND lower(users.email) = normalized_email
     AND lower(COALESCE(memberships.invited_email, '')) = normalized_email
     AND memberships.status = 'invited'
     AND memberships.invitation_status = 'pending'
     AND (memberships.invitation_expires_at IS NULL OR memberships.invitation_expires_at > NOW())
     AND tenants.status IN ('trial', 'active')
   ORDER BY users.created_at ASC
   LIMIT 1
   FOR UPDATE OF users;

  UPDATE public.users AS users
     SET external_auth_subject = normalized_subject,
         name = CASE WHEN trim(users.name) = '' THEN COALESCE(normalized_name, normalized_email) ELSE users.name END
   WHERE users.id = candidate_user_id
     AND users.external_auth_subject IS NULL
  RETURNING users.id INTO bound_user_id;

  RETURN bound_user_id;
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.bind_current_clerk_identity_to_pending_invitation(TEXT, TEXT, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.bind_current_clerk_identity_to_pending_invitation(TEXT, TEXT, TEXT) TO brokerdesk_runtime;
  END IF;
END $$;
