-- UNEXECUTED / emergency-only destructive path. Normal application rollback
-- keeps this additive claims table in place; the previous application remains
-- compatible with its columns. Dropping it can lose durable idempotency and
-- fencing evidence, so an explicit session opt-in and an empty table are both
-- required. The table lock closes the check/drop race.
BEGIN;
DO $$
DECLARE
  claim_rows BIGINT;
BEGIN
  IF to_regclass('public.entry_request_claims') IS NULL THEN
    RAISE EXCEPTION 'destructive rollback 001 blocked: public.entry_request_claims is absent; no table drop is needed'
      USING ERRCODE = '55006';
  END IF;
  EXECUTE 'LOCK TABLE public.entry_request_claims IN ACCESS EXCLUSIVE MODE';
  SELECT COUNT(*) INTO claim_rows FROM public.entry_request_claims;
  IF claim_rows <> 0 THEN
    RAISE EXCEPTION 'destructive rollback 001 blocked: public.entry_request_claims contains % durable claim rows; preserve the table and roll back the application only', claim_rows
      USING ERRCODE = '55006';
  END IF;
  IF current_setting('brokerdesk.allow_destructive_entry_request_claims_drop', true) <> 'on' THEN
    RAISE EXCEPTION 'destructive rollback 001 blocked: explicit session opt-in brokerdesk.allow_destructive_entry_request_claims_drop=on is required'
      USING ERRCODE = '42501';
  END IF;
  EXECUTE 'DROP TABLE public.entry_request_claims';
END $$;
COMMIT;
