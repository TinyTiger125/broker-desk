BEGIN;
ALTER TABLE public.entry_request_claims
  DROP CONSTRAINT IF EXISTS entry_request_claims_claim_token_check;
ALTER TABLE public.entry_request_claims
  DROP COLUMN IF EXISTS claim_token;
COMMIT;
