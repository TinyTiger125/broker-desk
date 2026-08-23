#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const databaseUrl = process.env.TASK038_PUBLICATION_DATABASE_URL?.trim();
const expectedProject = process.env.TASK038_PUBLICATION_EXPECTED_NEON_PROJECT_ID?.trim();
const expectedBranch = process.env.TASK038_PUBLICATION_EXPECTED_NEON_BRANCH_ID?.trim();
const expectedDatabase = process.env.TASK038_PUBLICATION_EXPECTED_DATABASE_NAME?.trim();

for (const [name, value] of Object.entries({
  TASK038_PUBLICATION_DATABASE_URL: databaseUrl,
  TASK038_PUBLICATION_EXPECTED_NEON_PROJECT_ID: expectedProject,
  TASK038_PUBLICATION_EXPECTED_NEON_BRANCH_ID: expectedBranch,
  TASK038_PUBLICATION_EXPECTED_DATABASE_NAME: expectedDatabase,
})) {
  if (!value) {
    throw new Error(`${name} is required; this check never falls back to .env.local or a local database.`);
  }
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
  const identity = (
    await client.query(
      `SELECT current_database() AS database_name,
              current_setting('neon.project_id', true) AS project_id,
              current_setting('neon.branch_id', true) AS branch_id`,
    )
  ).rows[0];
  if (identity.database_name !== expectedDatabase) {
    throw new Error("publication-state database identity mismatch");
  }
  if (identity.project_id !== expectedProject || identity.branch_id !== expectedBranch) {
    throw new Error("publication-state Neon project or branch identity mismatch");
  }

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
    database: identity.database_name,
    project: identity.project_id,
    branch: identity.branch_id,
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
