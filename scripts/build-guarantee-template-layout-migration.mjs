import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = JSON.parse(readFileSync(join(root, ".broker-desk/friends-guarantee-layouts.json"), "utf8"));
const outputPath = join(root, "db/migrations/20260805_003_guarantee_template_layout_versions.sql");

const templates = [
  ["zenhoren_individual_v1", "zenhoren-v1-hd.png", 2400, 1697, 1190.55, 841.89],
  ["nihon_safety_individual_v1", "nihon-safety-v1-hd.png", 2400, 1696, 841.89, 595.32],
  ["j_lease_individual_v1", "j-lease-v1-hd.png", 1697, 2400, 595.32, 841.92],
  ["insure_individual_v1", "insure-v1-hd.png", 2400, 1658, 780, 539],
  ["friends_guarantee_individual_v1", "friends-guarantee-v1.png", 1600, 1131, 841.89, 595.32],
];

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const header = `-- Platform-owned, immutable PDF layout publications.\n-- Tenant-specific installed copies are intentionally a later migration.\nCREATE TABLE IF NOT EXISTS guarantee_template_layout_versions (\n  id TEXT PRIMARY KEY,\n  template_id TEXT NOT NULL,\n  version_number INTEGER NOT NULL,\n  baseline_version TEXT NOT NULL,\n  asset_fingerprint TEXT NOT NULL,\n  layout_snapshot JSONB NOT NULL,\n  change_note TEXT,\n  published_by_user_id TEXT REFERENCES users(id),\n  is_active BOOLEAN NOT NULL DEFAULT FALSE,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  UNIQUE (template_id, version_number)\n);\n\nCREATE UNIQUE INDEX IF NOT EXISTS guarantee_template_layout_versions_one_active\n  ON guarantee_template_layout_versions(template_id)\n  WHERE is_active = TRUE;\n\nCREATE INDEX IF NOT EXISTS guarantee_template_layout_versions_template_version_idx\n  ON guarantee_template_layout_versions(template_id, version_number DESC);\n\n`;

const inserts = templates.map(([templateId, imageName, imageWidth, imageHeight, pageWidth, pageHeight]) => {
  const image = readFileSync(join(root, "public/guarantee-templates", imageName));
  const fingerprint = `sha256:${createHash("sha256").update(image).digest("hex")}:image:${imageWidth}x${imageHeight}:page:${pageWidth}x${pageHeight}`;
  const baselineVersion = source.layoutOverrideVersionsByTemplate?.[templateId];
  if (!baselineVersion) throw new Error(`Missing calibrated baseline for ${templateId}`);
  const snapshot = {
    templateId,
    baselineVersion,
    assetFingerprint: fingerprint,
    layoutOverrides: source.layoutOverridesByTemplate?.[templateId] ?? {},
    deletedOverlayFieldKeys: source.deletedOverlayFieldsByTemplate?.[templateId] ?? [],
    customOverlayFields: source.customFieldsByTemplate?.[templateId] ?? [],
  };
  return `INSERT INTO guarantee_template_layout_versions (\n  id, template_id, version_number, baseline_version, asset_fingerprint,\n  layout_snapshot, change_note, published_by_user_id, is_active\n) VALUES (\n  ${sqlLiteral(`guarantee_layout_seed_${templateId}`)},\n  ${sqlLiteral(templateId)},\n  1,\n  ${sqlLiteral(baselineVersion)},\n  ${sqlLiteral(fingerprint)},\n  ${sqlLiteral(JSON.stringify(snapshot))}::jsonb,\n  'Migrated legacy calibrated layout',\n  NULL,\n  TRUE\n) ON CONFLICT (template_id, version_number) DO NOTHING;\n`;
});

writeFileSync(outputPath, `${header}${inserts.join("\n")}`, "utf8");
console.log(`Wrote ${outputPath}`);
