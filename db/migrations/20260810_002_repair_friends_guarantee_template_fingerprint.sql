-- Correct a legacy published-layout fingerprint without rewriting history.
-- Friends was seeded as portrait A4 even though its calibrated overlay uses the
-- landscape canvas rendered by the current PDF pipeline. Keep v1 for audit,
-- publish v2, and preserve tenant-local overlay changes.

DO $$
DECLARE
  legacy_fingerprint CONSTANT TEXT := 'sha256:d1491cb0ad956cbee9e359c76c1d326496e7a757f50903e8ce52451980189518:image:1600x1131:page:841.89x595.32';
  canonical_fingerprint CONSTANT TEXT := 'sha256:d1491cb0ad956cbee9e359c76c1d326496e7a757f50903e8ce52451980189518:image:1600x1131:page:1190.55x841.89';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.guarantee_template_layout_versions
    WHERE id = 'guarantee_layout_seed_friends_guarantee_individual_v1'
      AND asset_fingerprint = legacy_fingerprint
  ) THEN
    UPDATE public.guarantee_template_layout_versions
    SET is_active = FALSE
    WHERE id = 'guarantee_layout_seed_friends_guarantee_individual_v1';

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
      'guarantee_layout_seed_friends_guarantee_individual_v2',
      template_id,
      2,
      baseline_version,
      canonical_fingerprint,
      jsonb_set(layout_snapshot, '{assetFingerprint}', to_jsonb(canonical_fingerprint), TRUE),
      'Corrected canonical landscape page fingerprint; overlay coordinates unchanged.',
      published_by_user_id,
      TRUE
    FROM public.guarantee_template_layout_versions
    WHERE id = 'guarantee_layout_seed_friends_guarantee_individual_v1';

    UPDATE public.tenant_guarantee_template_installs
    SET
      source_layout_version_id = 'guarantee_layout_seed_friends_guarantee_individual_v2',
      source_version_number = 2,
      source_asset_fingerprint = canonical_fingerprint,
      layout_snapshot = jsonb_set(layout_snapshot, '{assetFingerprint}', to_jsonb(canonical_fingerprint), TRUE),
      revision_number = revision_number + 1,
      updated_at = NOW()
    WHERE template_id = 'friends_guarantee_individual_v1'
      AND source_layout_version_id = 'guarantee_layout_seed_friends_guarantee_individual_v1';
  END IF;
END $$;
