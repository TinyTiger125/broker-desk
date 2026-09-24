-- Publish official layouts through a subject-scoped capability, never table DML.
CREATE FUNCTION brokerdesk_private.publish_official_template_layout(
  p_tenant_id TEXT, p_template_id TEXT, p_baseline_version TEXT,
  p_asset_fingerprint TEXT, p_layout_snapshot JSONB, p_change_note TEXT DEFAULT NULL
)
RETURNS SETOF public.guarantee_template_layout_versions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor_id TEXT := brokerdesk_private.current_user_id();
  company_name TEXT;
  next_version INTEGER;
  published public.guarantee_template_layout_versions%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authenticated platform owner required' USING ERRCODE = '42501';
  END IF;
  -- Keep authorization rows stable until publication and both audits commit.
  PERFORM 1 FROM public.tenants WHERE id = p_tenant_id FOR SHARE;
  PERFORM 1 FROM public.tenant_memberships
    WHERE user_id = actor_id AND (tenant_id = p_tenant_id OR role = 'platform_owner')
    ORDER BY id FOR SHARE;
  IF NOT brokerdesk_private.can_access_tenant(p_tenant_id) OR NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE user_id = actor_id AND role = 'platform_owner' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'active platform owner and accessible tenant required' USING ERRCODE = '42501';
  END IF;
  company_name := CASE p_template_id
    WHEN 'zenhoren_individual_v1' THEN '全保連'
    WHEN 'nihon_safety_individual_v1' THEN '日本セーフティー'
    WHEN 'j_lease_individual_v1' THEN 'Jリース'
    WHEN 'insure_individual_v1' THEN 'インシュア'
    WHEN 'friends_guarantee_individual_v1' THEN 'ふれんず保証'
    ELSE NULL END;
  IF company_name IS NULL OR NULLIF(trim(p_baseline_version), '') IS NULL
    OR NULLIF(trim(p_asset_fingerprint), '') IS NULL
    OR jsonb_typeof(p_layout_snapshot) IS DISTINCT FROM 'object'
    OR (p_layout_snapshot->>'templateId') IS DISTINCT FROM p_template_id
    OR (p_layout_snapshot->>'baselineVersion') IS DISTINCT FROM p_baseline_version
    OR (p_layout_snapshot->>'assetFingerprint') IS DISTINCT FROM p_asset_fingerprint
    OR jsonb_typeof(p_layout_snapshot->'layoutOverrides') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_layout_snapshot->'deletedOverlayFieldKeys') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_layout_snapshot->'customOverlayFields') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'invalid official template snapshot' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('official-template-publish:' || p_template_id, 0));
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
    FROM public.guarantee_template_layout_versions WHERE template_id = p_template_id;
  UPDATE public.guarantee_template_layout_versions SET is_active = FALSE
    WHERE template_id = p_template_id AND is_active;
  INSERT INTO public.guarantee_template_layout_versions (
    id, template_id, version_number, baseline_version, asset_fingerprint, layout_snapshot,
    change_note, published_by_user_id, is_active, created_at, published_at
  ) VALUES (
    'guarantee_layout_' || gen_random_uuid()::TEXT, p_template_id, next_version,
    p_baseline_version, p_asset_fingerprint, p_layout_snapshot,
    NULLIF(trim(p_change_note), ''), actor_id, TRUE, NOW(), NOW()
  ) RETURNING * INTO published;
  INSERT INTO public.audit_logs (
    id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json
  ) VALUES (
    'audit_' || gen_random_uuid()::TEXT, p_tenant_id, actor_id, actor_id,
    'guarantee_template_layout_published', 'official_template', published.id,
    company_name || 'の公式テンプレート配置 v' || next_version || ' を公開しました。',
    jsonb_build_object('templateId', p_template_id, 'versionNumber', next_version, 'assetFingerprint', p_asset_fingerprint)
  ), (
    'audit_' || gen_random_uuid()::TEXT, p_tenant_id, actor_id, actor_id,
    'guarantee_template_layout_saved', 'official_template', p_template_id,
    company_name || 'の公式テンプレート配置を公開しました。',
    jsonb_build_object('templateId', p_template_id,
      'layoutOverrideCount', (SELECT COUNT(*) FROM jsonb_object_keys(p_layout_snapshot->'layoutOverrides')),
      'deletedOverlayFieldCount', jsonb_array_length(p_layout_snapshot->'deletedOverlayFieldKeys'),
      'customOverlayFieldCount', jsonb_array_length(p_layout_snapshot->'customOverlayFields'), 'layoutDirty', TRUE)
  );
  RETURN NEXT published;
END;
$$;
ALTER FUNCTION brokerdesk_private.publish_official_template_layout(TEXT,TEXT,TEXT,TEXT,JSONB,TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION brokerdesk_private.publish_official_template_layout(TEXT,TEXT,TEXT,TEXT,JSONB,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION brokerdesk_private.publish_official_template_layout(TEXT,TEXT,TEXT,TEXT,JSONB,TEXT) TO brokerdesk_runtime;
