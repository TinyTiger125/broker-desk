-- Correct a legacy published-layout fingerprint without rewriting history.
--
-- The original Nihon Safety seed recorded A4 landscape as 841.89 x 595.32pt.
-- Runtime rendering uses the canonical 841.89 x 595.28pt page size. The PDF
-- asset and every overlay coordinate are unchanged; only the identity metadata
-- was inconsistent. Existing installations move to a new official source
-- version while preserving each tenant's own layout snapshot and revisions.

DO $$
DECLARE
  legacy_fingerprint CONSTANT TEXT := 'sha256:e8bdd2412b85d6b0b4f4a8d01bc8e84ee97ccadf96b03a012eb49823e1fc1c55:image:2400x1696:page:841.89x595.32';
  canonical_fingerprint CONSTANT TEXT := 'sha256:e8bdd2412b85d6b0b4f4a8d01bc8e84ee97ccadf96b03a012eb49823e1fc1c55:image:2400x1696:page:841.89x595.28';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.guarantee_template_layout_versions
    WHERE id = 'guarantee_layout_seed_nihon_safety_individual_v1'
      AND asset_fingerprint = legacy_fingerprint
  ) THEN
    UPDATE public.guarantee_template_layout_versions
    SET is_active = FALSE
    WHERE id = 'guarantee_layout_seed_nihon_safety_individual_v1';

    INSERT INTO public.guarantee_template_layout_versions (
      id,
      template_id,
      version_number,
      baseline_version,
      asset_fingerprint,
      layout_snapshot,
      change_note,
      published_by_user_id,
      is_active
    )
    SELECT
      'guarantee_layout_seed_nihon_safety_individual_v2',
      template_id,
      2,
      baseline_version,
      canonical_fingerprint,
      jsonb_set(layout_snapshot, '{assetFingerprint}', to_jsonb(canonical_fingerprint), TRUE),
      'Corrected canonical A4 landscape page height fingerprint; overlay coordinates unchanged.',
      published_by_user_id,
      TRUE
    FROM public.guarantee_template_layout_versions
    WHERE id = 'guarantee_layout_seed_nihon_safety_individual_v1';

    UPDATE public.tenant_guarantee_template_installs
    SET
      source_layout_version_id = 'guarantee_layout_seed_nihon_safety_individual_v2',
      source_version_number = 2,
      source_asset_fingerprint = canonical_fingerprint,
      layout_snapshot = jsonb_set(layout_snapshot, '{assetFingerprint}', to_jsonb(canonical_fingerprint), TRUE),
      revision_number = revision_number + 1,
      updated_at = NOW()
    WHERE template_id = 'nihon_safety_individual_v1'
      AND source_layout_version_id = 'guarantee_layout_seed_nihon_safety_individual_v1';
  END IF;
END $$;
