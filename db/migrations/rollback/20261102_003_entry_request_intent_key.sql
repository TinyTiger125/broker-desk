-- UNEXECUTED / application-rollback guard. The forward migration deliberately
-- keeps UUID and legacy hash keys compatible so an older application can be
-- rolled back without rewriting durable claim rows. Narrowing the constraint
-- is only safe when no UUID intent has ever been persisted.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.entry_request_claims') IS NULL THEN
    RAISE EXCEPTION 'rollback 003 blocked: public.entry_request_claims is absent; use the approved migration ledger path'
      USING ERRCODE = '55006';
  END IF;
  EXECUTE 'LOCK TABLE public.entry_request_claims IN ACCESS EXCLUSIVE MODE';
  IF EXISTS (
    SELECT 1
    FROM public.entry_request_claims
    WHERE request_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'rollback 003 blocked: UUID entry_request_claims rows exist; deploy the compatible application or use an approved data-preserving recovery plan'
      USING ERRCODE = '55006';
  END IF;
END $$;
ALTER TABLE public.entry_request_claims
  DROP CONSTRAINT IF EXISTS entry_request_claims_request_key_check;
ALTER TABLE public.entry_request_claims
  ADD CONSTRAINT entry_request_claims_request_key_check
  CHECK (request_key ~ '^[a-f0-9]{64}$');
COMMIT;
