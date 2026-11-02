BEGIN;
ALTER TABLE public.entry_request_claims
  DROP CONSTRAINT IF EXISTS entry_request_claims_payload_digest_check;
ALTER TABLE public.entry_request_claims
  DROP COLUMN IF EXISTS payload_digest;
COMMIT;
