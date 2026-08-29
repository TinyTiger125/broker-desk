-- Repair platform-created owner invitation email persistence without changing
-- the checksum of the already-applied TASK-043 service-period migration.

DO $$
BEGIN
  IF pg_catalog.to_regprocedure('brokerdesk_private.create_platform_tenant_account_task043_legacy(text,text,text,text,text,integer,date,date,text,text)') IS NULL THEN
    ALTER FUNCTION brokerdesk_private.create_platform_tenant_account(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, DATE, DATE, TEXT, TEXT)
      RENAME TO create_platform_tenant_account_task043_legacy;
  END IF;
  IF pg_catalog.to_regprocedure('brokerdesk_private.prepare_tenant_invitation_delivery_task043_legacy(text,text,text,text)') IS NULL THEN
    ALTER FUNCTION brokerdesk_private.prepare_tenant_invitation_delivery(TEXT, TEXT, TEXT, TEXT)
      RENAME TO prepare_tenant_invitation_delivery_task043_legacy;
  END IF;
  IF pg_catalog.to_regprocedure('brokerdesk_private.refresh_tenant_invitation_task043_legacy(text,text,text,text)') IS NULL THEN
    ALTER FUNCTION brokerdesk_private.refresh_tenant_invitation(TEXT, TEXT, TEXT, TEXT)
      RENAME TO refresh_tenant_invitation_task043_legacy;
  END IF;
  IF pg_catalog.to_regprocedure('brokerdesk_private.accept_tenant_invitation_task043_legacy(text,text,text,text)') IS NULL THEN
    ALTER FUNCTION brokerdesk_private.accept_tenant_invitation(TEXT, TEXT, TEXT, TEXT)
      RENAME TO accept_tenant_invitation_task043_legacy;
  END IF;
END $$;

REVOKE ALL ON FUNCTION brokerdesk_private.create_platform_tenant_account_task043_legacy(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, DATE, DATE, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION brokerdesk_private.prepare_tenant_invitation_delivery_task043_legacy(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION brokerdesk_private.refresh_tenant_invitation_task043_legacy(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION brokerdesk_private.accept_tenant_invitation_task043_legacy(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    REVOKE ALL ON FUNCTION brokerdesk_private.create_platform_tenant_account_task043_legacy(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, DATE, DATE, TEXT, TEXT) FROM brokerdesk_runtime;
    REVOKE ALL ON FUNCTION brokerdesk_private.prepare_tenant_invitation_delivery_task043_legacy(TEXT, TEXT, TEXT, TEXT) FROM brokerdesk_runtime;
    REVOKE ALL ON FUNCTION brokerdesk_private.refresh_tenant_invitation_task043_legacy(TEXT, TEXT, TEXT, TEXT) FROM brokerdesk_runtime;
    REVOKE ALL ON FUNCTION brokerdesk_private.accept_tenant_invitation_task043_legacy(TEXT, TEXT, TEXT, TEXT) FROM brokerdesk_runtime;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION brokerdesk_private.create_platform_tenant_account(
  p_actor_user_id TEXT, p_name TEXT, p_slug TEXT, p_account_type TEXT, p_status TEXT,
  p_purchased_seat_count INTEGER, p_service_start_at DATE, p_service_end_at DATE,
  p_owner_name TEXT, p_owner_email TEXT
)
RETURNS TABLE (
  tenant_record JSONB, active_seat_count INTEGER, invited_seat_count INTEGER,
  suspended_seat_count INTEGER, owner_members JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  created_tenant_record JSONB;
  created_active_count INTEGER;
  created_invited_count INTEGER;
  created_suspended_count INTEGER;
  ignored_owner_members JSONB;
  created_tenant_id TEXT;
BEGIN
  SELECT legacy.tenant_record, legacy.active_seat_count, legacy.invited_seat_count,
         legacy.suspended_seat_count, legacy.owner_members
  INTO created_tenant_record, created_active_count, created_invited_count,
       created_suspended_count, ignored_owner_members
  FROM brokerdesk_private.create_platform_tenant_account_task043_legacy(
    p_actor_user_id, p_name, p_slug, p_account_type, p_status,
    p_purchased_seat_count, p_service_start_at, p_service_end_at,
    p_owner_name, p_owner_email
  ) AS legacy;
  IF created_tenant_record IS NULL THEN
    RETURN;
  END IF;
  created_tenant_id := created_tenant_record->>'id';

  UPDATE public.tenant_memberships AS memberships
  SET invited_email = lower(trim(users.email)), updated_at = NOW()
  FROM public.users AS users
  WHERE memberships.tenant_id = created_tenant_id
    AND memberships.user_id = users.id
    AND memberships.role = 'tenant_owner'
    AND memberships.capability = 'company_owner'
    AND memberships.status = 'invited'
    AND memberships.invited_email IS NULL;

  RETURN QUERY
  SELECT created_tenant_record, created_active_count, created_invited_count,
         created_suspended_count,
         (SELECT COALESCE(jsonb_agg(jsonb_build_object('membership', to_jsonb(memberships), 'user', to_jsonb(users)) ORDER BY memberships.created_at), '[]'::JSONB)
          FROM public.tenant_memberships AS memberships
          INNER JOIN public.users AS users ON users.id = memberships.user_id
          WHERE memberships.tenant_id = created_tenant_id
            AND memberships.role = 'tenant_owner');
END;
$$;

CREATE OR REPLACE FUNCTION brokerdesk_private.prepare_tenant_invitation_delivery(
  p_tenant_id TEXT, p_membership_id TEXT, p_actor_user_id TEXT, p_invited_by_user_id TEXT DEFAULT NULL
)
RETURNS TABLE (tenant_record JSONB, member_record JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  prepared_tenant JSONB;
  prepared_member JSONB;
  target_membership_id TEXT;
BEGIN
  SELECT legacy.tenant_record, legacy.member_record
  INTO prepared_tenant, prepared_member
  FROM brokerdesk_private.prepare_tenant_invitation_delivery_task043_legacy(
    p_tenant_id, p_membership_id, p_actor_user_id, p_invited_by_user_id
  ) AS legacy;
  IF prepared_member IS NULL THEN
    RETURN;
  END IF;
  target_membership_id := prepared_member->'membership'->>'id';

  UPDATE public.tenant_memberships AS memberships
  SET invited_email = lower(trim(users.email)), updated_at = NOW()
  FROM public.users AS users
  WHERE memberships.id = target_membership_id
    AND memberships.tenant_id = p_tenant_id
    AND memberships.user_id = users.id
    AND memberships.status = 'invited'
    AND memberships.invited_email IS NULL;

  RETURN QUERY
  SELECT prepared_tenant,
         jsonb_build_object('membership', to_jsonb(memberships), 'user', to_jsonb(users))
  FROM public.tenant_memberships AS memberships
  INNER JOIN public.users AS users ON users.id = memberships.user_id
  WHERE memberships.id = target_membership_id
    AND memberships.tenant_id = p_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION brokerdesk_private.refresh_tenant_invitation(
  p_tenant_id TEXT, p_membership_id TEXT, p_actor_user_id TEXT, p_invited_by_user_id TEXT DEFAULT NULL
)
RETURNS SETOF public.tenant_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  refreshed_membership public.tenant_memberships%ROWTYPE;
BEGIN
  SELECT legacy.* INTO refreshed_membership
  FROM brokerdesk_private.refresh_tenant_invitation_task043_legacy(
    p_tenant_id, p_membership_id, p_actor_user_id, p_invited_by_user_id
  ) AS legacy;
  IF refreshed_membership.id IS NULL THEN
    RETURN;
  END IF;

  PERFORM 1
  FROM public.users AS users
  WHERE users.id = refreshed_membership.user_id
  FOR UPDATE OF users;

  UPDATE public.tenant_memberships AS memberships
  SET invited_email = lower(trim(users.email)), updated_at = NOW()
  FROM public.users AS users
  WHERE memberships.id = refreshed_membership.id
    AND memberships.tenant_id = p_tenant_id
    AND memberships.user_id = users.id
    AND memberships.status = 'invited'
    AND memberships.invited_email IS NULL
  RETURNING memberships.* INTO refreshed_membership;

  IF refreshed_membership.id IS NULL THEN
    SELECT memberships.* INTO refreshed_membership
    FROM public.tenant_memberships AS memberships
    WHERE memberships.id = p_membership_id AND memberships.tenant_id = p_tenant_id;
  END IF;
  RETURN NEXT refreshed_membership;
END;
$$;

CREATE OR REPLACE FUNCTION brokerdesk_private.accept_tenant_invitation(
  p_tenant_id TEXT, p_membership_id TEXT, p_target_user_id TEXT, p_invitation_token TEXT
)
RETURNS SETOF public.tenant_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  accepted_membership public.tenant_memberships%ROWTYPE;
  current_user_id TEXT := brokerdesk_private.current_user_id();
  bound_user_email TEXT;
BEGIN
  SELECT legacy.* INTO accepted_membership
  FROM brokerdesk_private.accept_tenant_invitation_task043_legacy(
    p_tenant_id, p_membership_id, p_target_user_id, p_invitation_token
  ) AS legacy;
  IF accepted_membership.id IS NOT NULL THEN
    RETURN NEXT accepted_membership;
    RETURN;
  END IF;
  IF current_user_id IS NULL OR current_user_id <> NULLIF(trim(COALESCE(p_target_user_id, '')), '') THEN
    RETURN;
  END IF;

  SELECT lower(trim(users.email))
  INTO bound_user_email
  FROM public.tenant_memberships AS memberships
  INNER JOIN public.users AS users ON users.id = memberships.user_id
  WHERE memberships.id = p_membership_id
    AND memberships.tenant_id = p_tenant_id
    AND memberships.user_id = current_user_id
    AND memberships.status = 'invited'
    AND memberships.invitation_status = 'pending'
    AND memberships.invited_email IS NULL
    AND memberships.invitation_token = trim(COALESCE(p_invitation_token, ''))
    AND trim(COALESCE(p_invitation_token, '')) <> ''
    AND (memberships.invitation_expires_at IS NULL OR memberships.invitation_expires_at > NOW())
    AND users.external_auth_subject IS NOT NULL
    AND trim(COALESCE(users.email, '')) <> ''
  FOR UPDATE OF memberships, users;
  IF bound_user_email IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.tenant_memberships AS memberships
  SET invited_email = bound_user_email, updated_at = NOW()
  WHERE memberships.id = p_membership_id
    AND memberships.tenant_id = p_tenant_id
    AND memberships.user_id = current_user_id
    AND memberships.status = 'invited'
    AND memberships.invitation_status = 'pending'
    AND memberships.invited_email IS NULL;

  SELECT legacy.* INTO accepted_membership
  FROM brokerdesk_private.accept_tenant_invitation_task043_legacy(
    p_tenant_id, p_membership_id, p_target_user_id, p_invitation_token
  ) AS legacy;
  IF accepted_membership.id IS NOT NULL THEN
    RETURN NEXT accepted_membership;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.create_platform_tenant_account(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, DATE, DATE, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION brokerdesk_private.prepare_tenant_invitation_delivery(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION brokerdesk_private.refresh_tenant_invitation(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION brokerdesk_private.accept_tenant_invitation(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT EXECUTE ON FUNCTION brokerdesk_private.create_platform_tenant_account(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, DATE, DATE, TEXT, TEXT) TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.prepare_tenant_invitation_delivery(TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.refresh_tenant_invitation(TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime;
    GRANT EXECUTE ON FUNCTION brokerdesk_private.accept_tenant_invitation(TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime;
  END IF;
END $$;
