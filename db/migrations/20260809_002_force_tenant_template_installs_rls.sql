-- The template install table was added after the original force-RLS migration.
-- Keep it in the same owner-enforcement posture as every other tenant record.

ALTER TABLE public.tenant_guarantee_template_installs FORCE ROW LEVEL SECURITY;
