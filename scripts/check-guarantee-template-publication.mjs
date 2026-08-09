#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migration = readFileSync(join(root, "db/migrations/20260805_003_guarantee_template_layout_versions.sql"), "utf8");
const tenantInstallMigration = readFileSync(join(root, "db/migrations/20260805_004_tenant_guarantee_template_installs.sql"), "utf8");
const runtime = readFileSync(join(root, "src/lib/guarantee-template-layout-runtime.ts"), "utf8");
const preview = readFileSync(join(root, "src/app/guarantee-applications/friends-guarantee/preview/preview-page-content.tsx"), "utf8");
const genericDownload = readFileSync(join(root, "src/app/api/guarantee-applications/[templateId]/download/route.ts"), "utf8");
const friendsDownload = readFileSync(join(root, "src/app/api/guarantee-applications/friends-guarantee/download/route.ts"), "utf8");
const outputCenter = readFileSync(join(root, "src/app/output-center/page.tsx"), "utf8");
const templateLibrary = readFileSync(join(root, "src/app/templates/page.tsx"), "utf8");
const tenantPermissions = readFileSync(join(root, "src/lib/tenant-permissions.ts"), "utf8");

const templates = [
  ["zenhoren_individual_v1", "zenhoren-v1-hd.png", 2400, 1697, 1190.55, 841.89],
  ["nihon_safety_individual_v1", "nihon-safety-v1-hd.png", 2400, 1696, 841.89, 595.32],
  ["j_lease_individual_v1", "j-lease-v1-hd.png", 1697, 2400, 595.32, 841.92],
  ["insure_individual_v1", "insure-v1-hd.png", 2400, 1658, 780, 539],
  ["friends_guarantee_individual_v1", "friends-guarantee-v1.png", 1600, 1131, 841.89, 595.32],
];

const failures = [];
for (const [templateId, imageName, imageWidth, imageHeight, pageWidth, pageHeight] of templates) {
  const image = readFileSync(join(root, "public/guarantee-templates", imageName));
  const fingerprint = `sha256:${createHash("sha256").update(image).digest("hex")}:image:${imageWidth}x${imageHeight}:page:${pageWidth}x${pageHeight}`;
  if (!migration.includes(`guarantee_layout_seed_${templateId}`)) failures.push(`missing seed: ${templateId}`);
  if (!migration.includes(fingerprint)) failures.push(`fingerprint mismatch: ${templateId}`);
}

for (const [name, source] of [
  ["preview", preview],
  ["generic PDF download", genericDownload],
  ["Friends PDF download", friendsDownload],
]) {
  if (!source.includes("resolveGuaranteeTemplateLayout")) failures.push(`${name} bypasses published template resolution`);
}

if (!runtime.includes("if (isProductionRuntime())")) failures.push("production fallback guard is missing");
if (!runtime.includes("getActiveTenantGuaranteeTemplateInstall")) failures.push("tenant install resolution is missing");
if (!runtime.includes('source: "tenant_install"')) failures.push("tenant install layout source is missing");
if (!tenantInstallMigration.includes("tenant_guarantee_template_installs")) failures.push("tenant install migration is missing");
if (!tenantInstallMigration.includes("guarantee_template_layout_versions")) failures.push("tenant install provenance foreign key is missing");
if (!tenantInstallMigration.includes("ENABLE ROW LEVEL SECURITY")) failures.push("tenant install RLS is missing");
if (!outputCenter.includes("listTenantGuaranteeTemplateInstalls")) failures.push("output center does not scope templates to tenant installs");
if (!outputCenter.includes("hasInstalledGuaranteeTemplates")) failures.push("output center has no empty-template boundary");
if (!templateLibrary.includes("Template Library") && !templateLibrary.includes("模板库")) failures.push("broker template library is missing");
if (!preview.includes("getActiveTenantGuaranteeTemplateInstall")) failures.push("broker preview does not deny uninstalled templates");
if (!genericDownload.includes('error: "template_not_installed"')) failures.push("generic download does not deny uninstalled templates");
if (!friendsDownload.includes('error: "template_not_installed"')) failures.push("Friends download does not deny uninstalled templates");

for (const role of ["manager", "broker", "data_operator", "reviewer", "viewer"]) {
  const roleBlock = tenantPermissions.match(new RegExp(`\\n  ${role}: \\[([\\s\\S]*?)\\n  \\],`))?.[1] ?? "";
  if (!roleBlock.includes('"template.copy_official"')) {
    failures.push(`${role} cannot install a template from the library`);
  }
}

if (failures.length) {
  console.error("Guarantee template publication check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(`Guarantee template publication check passed for ${templates.length} official templates.`);
