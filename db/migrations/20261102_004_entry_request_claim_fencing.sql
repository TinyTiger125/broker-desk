BEGIN;

-- Every successful claim generation gets a fresh fencing token. A process that
-- wakes after stale-claim recovery can no longer complete or release the new
-- owner's claim with its old token.
ALTER TABLE public.entry_request_claims
  ADD COLUMN IF NOT EXISTS claim_token TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE public.entry_request_claims
  DROP CONSTRAINT IF EXISTS entry_request_claims_claim_token_check;
ALTER TABLE public.entry_request_claims
  ADD CONSTRAINT entry_request_claims_claim_token_check
  CHECK (claim_token = 'legacy' OR claim_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');

COMMIT;
