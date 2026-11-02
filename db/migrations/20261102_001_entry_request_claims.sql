BEGIN;

-- A request claim is deliberately separate from the formal record.  It is the
-- database-level fence that turns a retried browser request into a lookup of
-- the first record, without making different manual submissions collide.
CREATE TABLE IF NOT EXISTS public.entry_request_claims (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES public.users(id),
  request_key TEXT NOT NULL CHECK (request_key ~ '^[a-f0-9]{64}$'),
  target_type TEXT NOT NULL CHECK (target_type IN ('client', 'property', 'case')),
  target_id TEXT,
  state TEXT NOT NULL DEFAULT 'claimed' CHECK (state IN ('claimed', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id, request_key, target_type)
);

CREATE INDEX IF NOT EXISTS idx_entry_request_claims_scope
  ON public.entry_request_claims (tenant_id, user_id, state, updated_at);

ALTER TABLE public.entry_request_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_request_claims FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brokerdesk_entry_request_claim_scope ON public.entry_request_claims;
CREATE POLICY brokerdesk_entry_request_claim_scope
  ON public.entry_request_claims
  FOR ALL
  USING (
    brokerdesk_private.can_access_tenant(entry_request_claims.tenant_id)
    AND entry_request_claims.user_id = brokerdesk_private.current_user_id()
  )
  WITH CHECK (
    brokerdesk_private.can_access_tenant(entry_request_claims.tenant_id)
    AND entry_request_claims.user_id = brokerdesk_private.current_user_id()
  );

REVOKE ALL PRIVILEGES ON TABLE public.entry_request_claims FROM brokerdesk_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.entry_request_claims TO brokerdesk_runtime;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.entry_request_claims TO authenticated;
  END IF;
END $$;

COMMIT;
