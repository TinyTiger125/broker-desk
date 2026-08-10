#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

if (
  !process.env.DATABASE_MIGRATION_URL &&
  !process.env.DATABASE_DEVELOPMENT_URL &&
  existsSync(path.resolve(".env.local"))
) {
  process.loadEnvFile(path.resolve(".env.local"));
}

const databaseUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_DEVELOPMENT_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_MIGRATION_URL or DATABASE_DEVELOPMENT_URL is required.");
}

const root = process.cwd();
const templateDefinitions = [
  ["zenhoren_individual_v1", "zenhoren-v1-hd.png", 2400, 1697, 1190.55, 841.89],
  ["nihon_safety_individual_v1", "nihon-safety-v1-hd.png", 2400, 1696, 841.89, 595.28],
  ["j_lease_individual_v1", "j-lease-v1-hd.png", 1697, 2400, 595.32, 841.92],
  ["insure_individual_v1", "insure-v1-hd.png", 2400, 1658, 780, 539],
  ["friends_guarantee_individual_v1", "friends-guarantee-v1.png", 1600, 1131, 1190.55, 841.89],
];

const expectedFingerprints = new Map(
  templateDefinitions.map(([templateId, imageName, imageWidth, imageHeight, pageWidth, pageHeight]) => {
    const image = readFileSync(path.join(root, "public/guarantee-templates", imageName));
    const fingerprint = `sha256:${createHash("sha256").update(image).digest("hex")}:image:${imageWidth}x${imageHeight}:page:${pageWidth}x${pageHeight}`;
    return [templateId, fingerprint];
  }),
);

const repairs = [
  {
    templateId: "nihon_safety_individual_v1",
    legacyVersionId: "guarantee_layout_seed_nihon_safety_individual_v1",
    activeVersionId: "guarantee_layout_seed_nihon_safety_individual_v2",
    migration: "20260810_001_repair_nihon_safety_template_fingerprint.sql",
  },
  {
    templateId: "friends_guarantee_individual_v1",
    legacyVersionId: "guarantee_layout_seed_friends_guarantee_individual_v1",
    activeVersionId: "guarantee_layout_seed_friends_guarantee_individual_v2",
    migration: "20260810_002_repair_friends_guarantee_template_fingerprint.sql",
  },
];

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  const templateIds = templateDefinitions.map(([templateId]) => templateId);
  const versionsResult = await client.query(
    `
      SELECT id, template_id, version_number, asset_fingerprint,
        layout_snapshot ->> 'assetFingerprint' AS snapshot_fingerprint, is_active
      FROM public.guarantee_template_layout_versions
      WHERE template_id = ANY($1::text[])
      ORDER BY template_id, version_number
    `,
    [templateIds],
  );
  const installsResult = await client.query(
    `
      SELECT template_id, source_layout_version_id, source_asset_fingerprint,
        layout_snapshot ->> 'assetFingerprint' AS snapshot_fingerprint
      FROM public.tenant_guarantee_template_installs
      WHERE template_id = ANY($1::text[])
    `,
    [repairs.map(({ templateId }) => templateId)],
  );
  const migrationsResult = await client.query(
    `
      SELECT name
      FROM public.broker_desk_schema_migrations
      WHERE name = ANY($1::text[])
    `,
    [repairs.map(({ migration }) => migration)],
  );

  const failures = [];
  const activeVersions = new Map();
  for (const row of versionsResult.rows) {
    if (!row.is_active) continue;
    if (activeVersions.has(row.template_id)) {
      failures.push(`${row.template_id} has multiple active versions`);
    }
    activeVersions.set(row.template_id, row);
  }

  for (const [templateId, expectedFingerprint] of expectedFingerprints) {
    const active = activeVersions.get(templateId);
    if (!active) {
      failures.push(`${templateId} has no active published layout`);
      continue;
    }
    if (active.asset_fingerprint !== expectedFingerprint) {
      failures.push(`${templateId} active asset fingerprint differs from runtime asset`);
    }
    if (active.snapshot_fingerprint !== expectedFingerprint) {
      failures.push(`${templateId} active layout snapshot fingerprint differs from runtime asset`);
    }
  }

  const appliedMigrations = new Set(migrationsResult.rows.map((row) => row.name));
  for (const repair of repairs) {
    const active = activeVersions.get(repair.templateId);
    const expectedFingerprint = expectedFingerprints.get(repair.templateId);
    if (!appliedMigrations.has(repair.migration)) {
      failures.push(`${repair.migration} is missing from migration history`);
    }
    if (active?.id !== repair.activeVersionId || active?.version_number !== 2) {
      failures.push(`${repair.templateId} is not using corrected v2 as its active version`);
    }

    for (const install of installsResult.rows.filter((row) => row.template_id === repair.templateId)) {
      if (install.source_layout_version_id !== repair.activeVersionId) {
        failures.push(`${repair.templateId} has a tenant install pinned to ${install.source_layout_version_id}`);
      }
      if (install.source_asset_fingerprint !== expectedFingerprint || install.snapshot_fingerprint !== expectedFingerprint) {
        failures.push(`${repair.templateId} has a tenant install with an outdated asset fingerprint`);
      }
    }
  }

  const result = {
    ok: failures.length === 0,
    activeVersions: [...activeVersions.values()].map(({ template_id, id, version_number }) => ({
      templateId: template_id,
      versionId: id,
      versionNumber: version_number,
    })),
    tenantInstallCount: installsResult.rowCount,
  };

  console.log(JSON.stringify(result, null, 2));
  if (failures.length) {
    console.error("Guarantee template publication-state check failed:\n- " + failures.join("\n- "));
    process.exit(1);
  }
} finally {
  await client.end();
}
