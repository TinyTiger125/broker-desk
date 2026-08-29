#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migration = readFileSync(join(root, "db/migrations/20260805_003_guarantee_template_layout_versions.sql"), "utf8");
const nihonSafetyFingerprintRepair = readFileSync(join(root, "db/migrations/20260810_001_repair_nihon_safety_template_fingerprint.sql"), "utf8");
const friendsGuaranteeFingerprintRepair = readFileSync(join(root, "db/migrations/20260810_002_repair_friends_guarantee_template_fingerprint.sql"), "utf8");
const tenantInstallMigration = readFileSync(join(root, "db/migrations/20260805_004_tenant_guarantee_template_installs.sql"), "utf8");
const runtime = readFileSync(join(root, "src/lib/guarantee-template-layout-runtime.ts"), "utf8");
const preview = readFileSync(join(root, "src/app/guarantee-applications/friends-guarantee/preview/preview-page-content.tsx"), "utf8");
const actions = readFileSync(join(root, "src/app/actions.ts"), "utf8");
const saveButton = readFileSync(join(root, "src/components/official-template-save-button.tsx"), "utf8");
const genericDownload = readFileSync(join(root, "src/app/api/guarantee-applications/[templateId]/download/route.ts"), "utf8");
const friendsDownload = readFileSync(join(root, "src/app/api/guarantee-applications/friends-guarantee/download/route.ts"), "utf8");
const outputCenter = readFileSync(join(root, "src/app/output-center/page.tsx"), "utf8");
const templateLibrary = readFileSync(join(root, "src/app/templates/page.tsx"), "utf8");
const tenantPermissions = readFileSync(join(root, "src/lib/tenant-permissions.ts"), "utf8");

const templates = [
  ["zenhoren_individual_v1", "zenhoren-v1-hd.png", 2400, 1697, 1190.55, 841.89],
  ["nihon_safety_individual_v1", "nihon-safety-v1-hd.png", 2400, 1696, 841.89, 595.28],
  ["j_lease_individual_v1", "j-lease-v1-hd.png", 1697, 2400, 595.32, 841.92],
  ["insure_individual_v1", "insure-v1-hd.png", 2400, 1658, 780, 539],
  ["friends_guarantee_individual_v1", "friends-guarantee-v1.png", 1600, 1131, 841.89, 595.32],
];

const failures = [];
for (const [templateId, imageName, imageWidth, imageHeight, pageWidth, pageHeight] of templates) {
  const image = readFileSync(join(root, "public/guarantee-templates", imageName));
  const fingerprint = `sha256:${createHash("sha256").update(image).digest("hex")}:image:${imageWidth}x${imageHeight}:page:${pageWidth}x${pageHeight}`;
  if (!migration.includes(`guarantee_layout_seed_${templateId}`)) failures.push(`missing seed: ${templateId}`);
  const fingerprintIsPublished =
    migration.includes(fingerprint) ||
    nihonSafetyFingerprintRepair.includes(fingerprint) ||
    friendsGuaranteeFingerprintRepair.includes(fingerprint);
  if (!fingerprintIsPublished) failures.push(`fingerprint mismatch: ${templateId}`);
}

const friendsLegacyFingerprint = "sha256:d1491cb0ad956cbee9e359c76c1d326496e7a757f50903e8ce52451980189518:image:1600x1131:page:841.89x595.32";
const friendsCanonicalFingerprint = "sha256:d1491cb0ad956cbee9e359c76c1d326496e7a757f50903e8ce52451980189518:image:1600x1131:page:1190.55x841.89";
for (const requiredFragment of [
  friendsLegacyFingerprint,
  friendsCanonicalFingerprint,
  "guarantee_layout_seed_friends_guarantee_individual_v2",
  "source_layout_version_id = 'guarantee_layout_seed_friends_guarantee_individual_v2'",
]) {
  if (!friendsGuaranteeFingerprintRepair.includes(requiredFragment)) {
    failures.push("Friends guarantee fingerprint repair migration is incomplete");
    break;
  }
}

const nihonLegacyFingerprint = "sha256:e8bdd2412b85d6b0b4f4a8d01bc8e84ee97ccadf96b03a012eb49823e1fc1c55:image:2400x1696:page:841.89x595.32";
const nihonCanonicalFingerprint = "sha256:e8bdd2412b85d6b0b4f4a8d01bc8e84ee97ccadf96b03a012eb49823e1fc1c55:image:2400x1696:page:841.89x595.28";
for (const requiredFragment of [
  nihonLegacyFingerprint,
  nihonCanonicalFingerprint,
  "guarantee_layout_seed_nihon_safety_individual_v2",
  "source_layout_version_id = 'guarantee_layout_seed_nihon_safety_individual_v2'",
]) {
  if (!nihonSafetyFingerprintRepair.includes(requiredFragment)) {
    failures.push("Nihon Safety fingerprint repair migration is incomplete");
    break;
  }
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
const unchangedGuardIndex = actions.indexOf('flash=template_layout_unchanged');
const templatePublishIndex = actions.indexOf("publishGuaranteeTemplateLayoutVersion({", unchangedGuardIndex);
if (unchangedGuardIndex < 0 || templatePublishIndex < 0 || unchangedGuardIndex > templatePublishIndex) {
  failures.push("template save does not reject unchanged submissions before publication");
}
if (!preview.includes('initialFeedback=')) failures.push("template editor does not expose saved feedback beside the save control");
for (const feedback of ["保存中…", "保存しました", "保存する変更はありません", "aria-live=\"polite\""]) {
  if (!saveButton.includes(feedback)) failures.push(`template save feedback is missing: ${feedback}`);
}
if (!saveButton.includes('namedItem("layoutDirty")')) failures.push("template save control does not stop unchanged client submissions");

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
