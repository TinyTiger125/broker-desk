#!/usr/bin/env node
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const tsModuleCache = new Map();

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

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}

const guaranteeApplication = loadTsModule(path.resolve("src/lib/guarantee-application.ts"));
const friendsGuaranteePdf = loadTsModule(path.resolve("src/lib/friends-guarantee-pdf.ts"));

const {
  getFriendsOverlayFieldPrintMode,
  getGuaranteePdfTemplateConfig,
} = friendsGuaranteePdf;
const { guaranteeCompanyTemplates } = guaranteeApplication;

const summaries = [];
const issues = [];

guaranteeCompanyTemplates
  .filter((template) => template.outputStatus === "active")
  .forEach((template) => {
    const fields = getGuaranteePdfTemplateConfig(template.id).overlayFields;
    const seenFieldKeys = new Set();
    let manualOrNeverCount = 0;

    fields.forEach((field) => {
      if (seenFieldKeys.has(field.fieldKey)) issues.push(`${template.id} ${field.fieldKey}: duplicate fieldKey`);
      seenFieldKeys.add(field.fieldKey);

      const printMode = getFriendsOverlayFieldPrintMode(field);
      if (printMode === "manual" || printMode === "never") {
        manualOrNeverCount += 1;
      }
      if (printMode === "never") {
        if (!field.calibrationId) issues.push(`${template.id} ${field.fieldKey}: never field must declare calibrationId`);
        if (!field.calibrationNote) issues.push(`${template.id} ${field.fieldKey}: never field must declare calibrationNote`);
      }
      if (printMode === "manual" && template.requiredFieldKeys.includes(field.sourceFieldKey ?? field.fieldKey)) {
        if (!field.calibrationId) issues.push(`${template.id} ${field.fieldKey}: required manual field must declare calibrationId`);
        if (!field.calibrationNote) issues.push(`${template.id} ${field.fieldKey}: required manual field must declare calibrationNote`);
      }
    });

    if (template.qualityStatus === "verified" && fields.length === 0) {
      issues.push(`${template.id}: verified template must have overlay fields`);
    }

    summaries.push({
      template: template.id,
      fieldCount: fields.length,
      manualOrNeverCount,
      qualityStatus: template.qualityStatus,
      allowDirectDownload: template.allowDirectDownload,
    });
  });

if (issues.length > 0) {
  fail(`calibration ledger has ${issues.length} issue(s):\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      templateCount: summaries.length,
      templates: summaries,
    },
    null,
    2,
  ),
);
