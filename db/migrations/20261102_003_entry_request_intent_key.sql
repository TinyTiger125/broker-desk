BEGIN;

-- R1 used a content hash as request_key. R2 makes it a per-intent UUID; the
-- payload_digest column remains the content consistency check.
ALTER TABLE public.entry_request_claims
  DROP CONSTRAINT IF EXISTS entry_request_claims_request_key_check;
ALTER TABLE public.entry_request_claims
  ADD CONSTRAINT entry_request_claims_request_key_check
  CHECK (
    request_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR request_key ~ '^[a-f0-9]{64}$'
  );

COMMIT;
