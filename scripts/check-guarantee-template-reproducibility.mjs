#!/usr/bin/env node
import { createHash } from "node:crypto";
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const tsModuleCache = new Map();

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}

function resolveProjectAlias(request) {
  if (!request.startsWith("@/lib/")) return null;
  return path.resolve(`src/lib/${request.slice("@/lib/".length)}.ts`);
}

function loadTsModule(sourcePath) {
  sourcePath = path.resolve(sourcePath);
  if (tsModuleCache.has(sourcePath)) return tsModuleCache.get(sourcePath);

  const source = fs.readFileSync(sourcePath, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = new Module(sourcePath);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(process.cwd());
  const originalRequire = mod.require.bind(mod);
  tsModuleCache.set(sourcePath, mod.exports);
  mod.require = (request) => {
    const aliasPath = resolveProjectAlias(request);
    return aliasPath ? loadTsModule(aliasPath) : originalRequire(request);
  };
  mod._compile(js, sourcePath);
  tsModuleCache.set(sourcePath, mod.exports);
  return mod.exports;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

const guaranteeApplication = loadTsModule(path.resolve("src/lib/guarantee-application.ts"));
const friendsGuaranteePdf = loadTsModule(path.resolve("src/lib/friends-guarantee-pdf.ts"));

const { guaranteeCompanyTemplates } = guaranteeApplication;
const {
  getFriendsGuaranteeTemplateLayoutSnapshot,
  getGuaranteePdfTemplateConfig,
  getGuaranteeTemplateAssetFingerprint,
  normalizeFriendsGuaranteeTemplateLayoutSnapshot,
} = friendsGuaranteePdf;

const genericDownload = fs.readFileSync(
  path.resolve("src/app/api/guarantee-applications/[templateId]/download/route.ts"),
  "utf8",
);
const friendsDownload = fs.readFileSync(
  path.resolve("src/app/api/guarantee-applications/friends-guarantee/download/route.ts"),
  "utf8",
);
const generatedOutputRepository = fs.readFileSync(path.resolve("src/lib/data.postgres.ts"), "utf8");
const publicationMigration = fs.readFileSync(
  path.resolve("db/migrations/20260805_003_guarantee_template_layout_versions.sql"),
  "utf8",
);
const nihonSafetyFingerprintRepair = fs.readFileSync(
  path.resolve("db/migrations/20260810_001_repair_nihon_safety_template_fingerprint.sql"),
  "utf8",
);
const friendsGuaranteeFingerprintRepair = fs.readFileSync(
  path.resolve("db/migrations/20260810_002_repair_friends_guarantee_template_fingerprint.sql"),
  "utf8",
);

const activeTemplates = guaranteeCompanyTemplates.filter((template) => template.outputStatus === "active");
if (activeTemplates.length !== 5) {
  fail(`expected exactly 5 active guarantee templates, received ${activeTemplates.length}`);
}

const sourceChecks = [
  ["generic download", genericDownload],
  ["Friends download", friendsDownload],
];
for (const [label, source] of sourceChecks) {
  if (!source.includes("templateLayoutSnapshot: templateLayout.snapshot")) {
    fail(`${label} does not render the resolved immutable layout snapshot`);
  }
  if (!source.includes("templateVersionId: templateLayout.versionId")) {
    fail(`${label} does not persist the resolved layout version`);
  }
  if (!source.includes("layoutSnapshot,")) {
    fail(`${label} does not persist the exact layout snapshot with generated output`);
  }
}

for (const requiredColumn of ["template_version_id", "layout_snapshot", "input_data_snapshot", "draft_value_snapshot"]) {
  if (!generatedOutputRepository.includes(requiredColumn)) {
    fail(`generated output persistence is missing ${requiredColumn}`);
  }
}

const templates = activeTemplates.map((template) => {
  const config = getGuaranteePdfTemplateConfig(template.id);
  const rawSnapshot = getFriendsGuaranteeTemplateLayoutSnapshot(template.id);
  const assetFingerprint = getGuaranteeTemplateAssetFingerprint(template.id);
  const normalizedSnapshot = normalizeFriendsGuaranteeTemplateLayoutSnapshot({
    templateId: template.id,
    snapshot: rawSnapshot,
    expectedAssetFingerprint: assetFingerprint,
  });

  if (rawSnapshot.assetFingerprint !== assetFingerprint) {
    fail(`${template.id} snapshot fingerprint differs from the deployed template asset`);
  }
  if (!publicationMigration.includes(`guarantee_layout_seed_${template.id}`)) {
    fail(`${template.id} has no immutable official publication seed`);
  }
  const fingerprintIsPublished =
    publicationMigration.includes(assetFingerprint) ||
    nihonSafetyFingerprintRepair.includes(assetFingerprint) ||
    friendsGuaranteeFingerprintRepair.includes(assetFingerprint);
  if (!fingerprintIsPublished) {
    fail(`${template.id} publication seed fingerprint differs from the deployed template asset`);
  }

  return {
    templateId: template.id,
    assetFingerprint,
    pageSize: config.pageSize,
    image: `${config.imageWidth}x${config.imageHeight}`,
    baselineVersion: normalizedSnapshot.baselineVersion,
    layoutDigest: digest(normalizedSnapshot),
    overlayFieldCount: config.overlayFields.length,
  };
});

const nihonCanonicalFingerprint = templates.find((template) => template.templateId === "nihon_safety_individual_v1")?.assetFingerprint;
if (!nihonCanonicalFingerprint) fail("Nihon Safety template is missing from the reproducibility contract");
for (const requiredFragment of [
  "page:841.89x595.32",
  nihonCanonicalFingerprint,
  "guarantee_layout_seed_nihon_safety_individual_v2",
  "source_layout_version_id = 'guarantee_layout_seed_nihon_safety_individual_v2'",
]) {
  if (!nihonSafetyFingerprintRepair.includes(requiredFragment)) {
    fail("Nihon Safety published-layout repair migration is incomplete");
  }
}

const friendsCanonicalFingerprint = templates.find((template) => template.templateId === "friends_guarantee_individual_v1")?.assetFingerprint;
if (!friendsCanonicalFingerprint) fail("Friends guarantee template is missing from the reproducibility contract");
for (const requiredFragment of [
  "page:841.89x595.32",
  friendsCanonicalFingerprint,
  "guarantee_layout_seed_friends_guarantee_individual_v2",
  "source_layout_version_id = 'guarantee_layout_seed_friends_guarantee_individual_v2'",
]) {
  if (!friendsGuaranteeFingerprintRepair.includes(requiredFragment)) {
    fail("Friends guarantee published-layout repair migration is incomplete");
  }
}

const manifest = {
  contractVersion: 1,
  templateCount: templates.length,
  templates,
};
const manifestDigest = digest(manifest);

// `--manifest` lets two independent machines compare one stable, non-PII contract value.
if (process.argv.includes("--manifest")) {
  console.log(JSON.stringify({ manifestDigest, ...manifest }, null, 2));
  process.exit(0);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      manifestDigest,
      ...manifest,
      manualAcceptance: "Run the same known case through all five templates on two devices and compare the visual smoke reports before release.",
    },
    null,
    2,
  ),
);
