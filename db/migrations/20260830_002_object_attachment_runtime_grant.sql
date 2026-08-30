BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attachment_links TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attachment_links TO brokerdesk_runtime;
  END IF;
END $$;

COMMIT;
