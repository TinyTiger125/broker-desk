-- W9.2 creator immutability hard gate.
--
-- created_by_user_id is an historical fact, not a mutable ownership field.
-- Ordinary runtime updates must never rewrite it.  A future data-repair
-- procedure, if approved, must be a separately audited migration-owner action;
-- it must not disable this trigger through a product request.

CREATE OR REPLACE FUNCTION brokerdesk_private.prevent_creator_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
    RAISE EXCEPTION 'created_by_user_id is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION brokerdesk_private.prevent_creator_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS clients_creator_immutable ON public.clients;
CREATE TRIGGER clients_creator_immutable
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION brokerdesk_private.prevent_creator_change();

DROP TRIGGER IF EXISTS properties_creator_immutable ON public.properties;
CREATE TRIGGER properties_creator_immutable
  BEFORE UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION brokerdesk_private.prevent_creator_change();

DROP TRIGGER IF EXISTS brokerage_cases_creator_immutable ON public.brokerage_cases;
CREATE TRIGGER brokerage_cases_creator_immutable
  BEFORE UPDATE ON public.brokerage_cases
  FOR EACH ROW
  EXECUTE FUNCTION brokerdesk_private.prevent_creator_change();

-- The trigger is the authoritative database invariant. Column-level REVOKE is
-- defense in depth only; it does not override an existing table-level UPDATE
-- grant, so restricted-role verification must exercise the trigger directly.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    REVOKE UPDATE (created_by_user_id) ON public.clients FROM brokerdesk_runtime;
    REVOKE UPDATE (created_by_user_id) ON public.properties FROM brokerdesk_runtime;
    REVOKE UPDATE (created_by_user_id) ON public.brokerage_cases FROM brokerdesk_runtime;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE UPDATE (created_by_user_id) ON public.clients FROM authenticated;
    REVOKE UPDATE (created_by_user_id) ON public.properties FROM authenticated;
    REVOKE UPDATE (created_by_user_id) ON public.brokerage_cases FROM authenticated;
  END IF;
END $$;
