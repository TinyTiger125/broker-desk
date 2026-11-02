BEGIN;

-- The request key is a client-generated id for one new-record intent.  Keep a
-- separate payload fingerprint so retries with the same intent can be checked
-- without merging a later, deliberate submission with identical content.
ALTER TABLE public.entry_request_claims
  ADD COLUMN IF NOT EXISTS payload_digest TEXT NOT NULL DEFAULT '';

ALTER TABLE public.entry_request_claims
  DROP CONSTRAINT IF EXISTS entry_request_claims_payload_digest_check;
ALTER TABLE public.entry_request_claims
  ADD CONSTRAINT entry_request_claims_payload_digest_check
  CHECK (payload_digest = '' OR payload_digest ~ '^[a-f0-9]{64}$');

COMMIT;
