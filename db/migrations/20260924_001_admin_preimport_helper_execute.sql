-- The constrained preimport SECURITY DEFINER owner also evaluates FORCE RLS.
-- Its trigger needs can_access_tenant; claim/delete additionally call current_user_id.
-- Nested subject resolution runs as the helper owner, so no raw-subject grant is needed.
BEGIN;
GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_tenant(TEXT) TO brokerdesk_admin;
GRANT EXECUTE ON FUNCTION brokerdesk_private.current_user_id() TO brokerdesk_admin;
COMMIT;
