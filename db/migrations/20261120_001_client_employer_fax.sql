-- Unexecuted candidate for TASK-050 / BD-1119-IMPLEMENT-20261120.
-- Apply only through the reviewed production migration process; this file is
-- intentionally not executed by the local implementation task.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS employer_fax TEXT;
